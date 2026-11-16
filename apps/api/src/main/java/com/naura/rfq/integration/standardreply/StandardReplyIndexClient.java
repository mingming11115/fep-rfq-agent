package com.naura.rfq.integration.standardreply;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.integration.ExternalCallLog;
import com.naura.rfq.integration.standardreply.Library;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
@Slf4j
@NoArgsConstructor
public class StandardReplyIndexClient {
    private static final Duration TIMEOUT = Duration.ofSeconds(8);
    private static final Pattern JOB_ID = Pattern.compile("[A-Za-z0-9_-][A-Za-z0-9_.-]{0,254}");
    private static final Pattern ERROR_CODE = Pattern.compile("[A-Z][A-Z0-9_]{0,63}");
    // 中台当前返回 DATASET_CONFIG_REQUIRED；DATA_CONFIG_REQUIRED 是早期对接记录的变体，一并兼容。
    private static final Set<String> CONFIG_MISSING_CODES = Set.of("DATASET_CONFIG_REQUIRED", "DATA_CONFIG_REQUIRED");

    @Autowired
    private ObjectMapper json;
    @Autowired
    private StandardReplyIndexProperties settings;
    @Value("${rfq.standard-reply-index.log-payload:false}")
    private boolean logPayload;
    // Knowledge platform only speaks HTTP/1.1; pin it so plaintext calls skip the h2c upgrade headers
    // (JDK-8239117) that some servers reject or mishandle for request bodies above a few KB.
    private final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
    // 已确认可写入的数据集（进程内）。首次写入必须带 dataset_config，中台才按该配置建数据集；
    // 建好之后按协议只传 records，因此不把配置当成每次请求的固定部分。
    private final Set<String> provisioned = ConcurrentHashMap.newKeySet();

    public StandardReplyIndexClient(ObjectMapper json, StandardReplyIndexProperties settings) {
        this.json = json;
        this.settings = settings;
    }

    public SearchResult search(String buId, boolean history, String query, List<String> ids) {
        String dataset = history ? settings.historyDataset() : settings.dataset();
        if (dataset == null || !settings.enabled()) {
            throw new SearchFailure("INDEX_NOT_CONFIGURED", false);
        }
        if (ids.isEmpty() || ids.size() > 100) {
            throw new SearchFailure("INVALID_SEARCH_SCOPE", false);
        }
        var body = json.createObjectNode().put("query", query).put("mode", "hybrid").put("top_k", Math.min(20, ids.size()));
        var filter = body.putObject("filter").putArray("and");
        filter.addObject().put("field", "bu_id").put("op", "eq").put("value", buId);
        var values = filter.addObject().put("field", "id").put("op", "in").putArray("value");
        ids.forEach(values::add);
        body.putObject("result_options").put("include_matched_chunks", false)
                .putArray("return_fields").add("record_version").add("title").add("requirement_text");
        Reply result;
        try {
            result = request("search", "/semantic-datasets/" + dataset + ":search", body);
        } catch (Failure failure) {
            log.error("标准回复索引查询失败", failure);
            throw new SearchFailure(failure.getMessage(), List.of("TRANSPORT_ERROR", "REQUEST_TIMEOUT", "INTERRUPTED")
                    .contains(failure.getMessage()));
        }
        if (result.status() != 200) {
            throw new SearchFailure(result.errorCode(), result.status() == 429 || result.status() >= 500);
        }
        var hits = result.body().path("hits");
        if (!hits.isArray() || hits.size() > Math.min(20, ids.size())) {
            throw new SearchFailure("INVALID_SEARCH_RESPONSE", false);
        }
        var parsed = new ArrayList<SearchHit>();
        var seen = new java.util.HashSet<String>();
        for (var hit : hits) {
            String id = hit.path("source_id").asText();
            var version = hit.path("fields").path("record_version");
            if (!ids.contains(id) || !seen.add(id) || !version.isIntegralNumber() || !version.canConvertToInt() || version.asInt() < 1) {
                throw new SearchFailure("INVALID_SEARCH_SCOPE", false);
            }
            parsed.add(new SearchHit(id, version.asInt()));
        }
        String requestId = result.body().path("request_id").asText("");
        if (!requestId.matches("[A-Za-z0-9_.-]{1,128}")) {
            requestId = "";
        }
        return new SearchResult(List.copyOf(parsed), requestId, result.body().path("index_version").asLong(0));
    }

    public record SearchHit(String id, int version) {}
    public record SearchResult(List<SearchHit> hits, String requestId, long indexVersion) {}

    public static final class SearchFailure extends RuntimeException {
        private final boolean retryable;
        SearchFailure(String code, boolean retryable) {
            super(code);
            this.retryable = retryable;
        }
        public boolean retryable() { return retryable; }
    }

    Delivery submit(String dataset, String replyId, String operation, JsonNode payload, Instant updatedAt) {
        Library library = Arrays.stream(Library.values())
                .filter(candidate -> dataset != null && dataset.equals(settings.datasetFor(candidate)))
                .findFirst().orElseThrow(() -> new Failure("DATASET_NOT_CONFIGURED", false));
        var body = json.createObjectNode();
        ObjectNode record = body.putArray("records").addObject();
        record.put("id", replyId).put("op", operation).put("updated_at", updatedAt.toString());
        if ("upsert".equals(operation)) {
            record.set("data", projection(payload));
            if (!provisioned.contains(dataset)) {
                addDatasetConfig(body, library.displayName);
            }
        } else if (!"delete".equals(operation)) {
            throw new Failure("INVALID_OPERATION", false);
        }

        String path = "/semantic-datasets/" + dataset + ":ingest";
        boolean configRejected = false;
        var result = request("ingest", path, body);
        if (body.has("dataset_config") && result.status() == 409 && "DATASET_CONFIG_CONFLICT".equals(result.errorCode())) {
            // 数据集已存在（例如重启后首次写入）且配置与本地不一致：沿用中台已有配置，去掉配置重发一次。
            log.warn("知识中台数据集已存在且配置与本地不一致 dataset={}，改为沿用中台已有配置继续同步", dataset);
            configRejected = true;
            body.remove("dataset_config");
            result = request("ingest", path, body);
        }
        if (missingDatasetConfig(result)) {
            // 数据集还没有可入库的配置：不存在（404 DATASET_NOT_FOUND）或存在但未声明 embedding 字段
            // （DATA_CONFIG_REQUIRED）。删除不建数据集；其余情况补上配置再发一次。
            if ("delete".equals(operation)) {
                return new Delivery(true, null);
            }
            if (!configRejected && !body.has("dataset_config")) {
                addDatasetConfig(body, library.displayName);
                result = request("ingest", path, body);
            }
        }
        if (missingDatasetConfig(result)) {
            log.error("错误：知识中台数据集仍缺少配置 dataset={} errorCode={}，需在中台补齐配置或删除该数据集后重试", dataset,
                    result.errorCode());
        }
        if (result.status() != 202 && result.status() != 200) {
            throw result.failure(false);
        }
        JsonNode response = result.body();
        if (response.path("accepted_count").asInt(-1) != 1 || response.path("rejected_count").asInt(-1) != 0) {
            throw new Failure(recordError(response, replyId, "RECORD_NOT_ACCEPTED"), false);
        }
        if ("upsert".equals(operation)) {
            provisioned.add(dataset);
        }
        String job = response.path("job_id").asText();
        requireJobId(job);
        return new Delivery(result.status() == 200 && "succeeded".equals(response.path("job_status").asText()), job);
    }

    Delivery poll(String dataset, String jobId, String replyId) {
        requireJobId(jobId);
        var result = request("poll", "/ingestion-jobs/" + jobId, null);
        if (result.status() != 200) {
            throw result.failure(result.status() == 404);
        }
        JsonNode response = result.body();
        return switch (response.path("status").asText()) {
            case "pending", "running" -> new Delivery(false, jobId);
            case "succeeded", "partial_success" -> {
                String error = recordError(response, replyId, null);
                int succeeded = response.path("succeeded_count").asInt(0);
                int skipped = response.path("skipped_count").asInt(0);
                if (error != null || succeeded + skipped != 1 || response.path("failed_count").asInt(-1) != 0) {
                    forgetDatasetOnConfigError(dataset, error);
                    throw new Failure(error == null ? "RECORD_NOT_INDEXED" : error, true);
                }
                yield new Delivery(true, jobId);
            }
            case "failed", "cancelled" -> {
                forgetDatasetOnConfigError(dataset, recordError(response, replyId, "JOB_NOT_COMPLETED"));
                throw new Failure(recordError(response, replyId, "JOB_NOT_COMPLETED"), true);
            }
            default -> throw new Failure("INVALID_JOB_STATUS", false);
        };
    }

    /**
     * 任务阶段回报数据集配置缺失（DATASET_CONFIG_REQUIRED）说明数据集在中台丢了配置：清掉进程内缓存，
     * 让 resubmit 的下一次提交重新带上 dataset_config 重建数据集，否则会不带配置无限循环。
     */
    private void forgetDatasetOnConfigError(String dataset, String errorCode) {
        if (CONFIG_MISSING_CODES.contains(errorCode)) {
            provisioned.remove(dataset);
        }
    }

    private void requireJobId(String jobId) {
        if (jobId == null || !JOB_ID.matcher(jobId).matches()) {
            throw new Failure("INVALID_JOB_ID", true);
        }
    }

    private ObjectNode projection(JsonNode payload) {
        if (payload == null || !payload.path("title").isTextual() || !payload.path("requirement_text").isTextual()
                || !payload.path("bu_id").isTextual() || !payload.path("record_version").isIntegralNumber()) {
            throw new Failure("INVALID_PROJECTION", false);
        }
        var projection = json.createObjectNode();
        for (String field : List.of("title", "requirement_text", "bu_id", "record_version")) {
            projection.set(field, payload.get(field));
        }
        return projection;
    }

    private void addDatasetConfig(ObjectNode body, String displayName) {
        var config = body.putObject("dataset_config").put("display_name", displayName);
        config.putArray("embedding_fields").add("title").add("requirement_text");
        var advanced = config.putObject("advanced");
        advanced.putObject("field_types").put("title", "text").put("requirement_text", "text")
            .put("bu_id", "keyword").put("record_version", "integer");
        advanced.putArray("filter_fields").add("bu_id").add("record_version");
        advanced.putArray("return_fields").add("record_version").add("title").add("requirement_text");
    }

    private Reply request(String operation, String path, ObjectNode body) {
        if (!settings.enabled()) {
            throw new Failure("INDEX_NOT_CONFIGURED", false);
        }
        var builder = HttpRequest.newBuilder(URI.create(settings.endpoint(path))).timeout(TIMEOUT)
            .header("X-API-Key", settings.apiKey()).header("Accept", "application/json");
        if (body == null) {
            builder.GET();
        } else {
            builder.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body.toString()));
        }
        var request = builder.build();
        var call = new ExternalCallLog("semantic_index", operation, request, null);
        if (logPayload && body != null) {
            call.payload("request", body.toString());
        }
        CompletableFuture<HttpResponse<byte[]>> pending = null;
        try {
            pending = http.sendAsync(request, info -> new LimitedBody());
            var response = pending.get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            call.response(response.statusCode(), response.body().length);
            if (logPayload) {
                call.payload("response", new String(response.body(), StandardCharsets.UTF_8));
            }
            JsonNode parsed;
            try {
                parsed = json.readTree(response.body());
            } catch (IOException e) {
                log.error("解析知识索引服务的响应 JSON 失败", e);
                call.failed(e);
                parsed = null;
            }
            if (parsed == null || !parsed.isObject()) {
                if (response.statusCode() >= 200 && response.statusCode() < 300) {
                    throw new Failure("INVALID_RESPONSE", false);
                }
                parsed = json.createObjectNode();
            }
            return new Reply(response.statusCode(), parsed);
        } catch (InterruptedException e) {
            log.error("知识索引请求被中断", e);
            Thread.currentThread().interrupt();
            call.failed(e);
            throw new Failure("INTERRUPTED", false);
        } catch (java.util.concurrent.TimeoutException e) {
            log.error("知识索引请求超时", e);
            call.failed(e);
            throw new Failure("REQUEST_TIMEOUT", false);
        } catch (java.util.concurrent.ExecutionException e) {
            log.error("知识索引请求传输失败", e);
            call.failed(e);
            throw new Failure("TRANSPORT_ERROR", false);
        } catch (RuntimeException e) {
            log.error("知识索引请求失败", e);
            call.failed(e);
            throw e;
        } finally {
            if (pending != null && !pending.isDone()) {
                pending.cancel(true);
            }
        }
    }

    /**
     * 数据集还没有可入库的配置：存在但未声明 embedding 字段（DATASET_CONFIG_REQUIRED），或数据集不存在
     * （任意 404——进程内可能已标记创建过，但中台数据集后来被删除或从未建成）。两种情况都补配置重建一次。
     */
    private static boolean missingDatasetConfig(Reply reply) {
        return CONFIG_MISSING_CODES.contains(reply.errorCode()) || reply.status() == 404;
    }

    private static String recordError(JsonNode response, String replyId, String fallback) {
        for (JsonNode error : response.path("errors")) {
            if (replyId.equals(error.path("id").asText())) {
                return safeCode(error.path("code").asText(), "RECORD_REJECTED");
            }
        }
        return fallback;
    }

    private static String safeCode(String value, String fallback) {
        return ERROR_CODE.matcher(value).matches() ? value : fallback;
    }

    record Delivery(boolean complete, String jobId) {}

    static final class Failure extends RuntimeException {
        private final boolean resubmit;

        Failure(String code, boolean resubmit) {
            super(code);
            this.resubmit = resubmit;
        }

        boolean resubmit() {
            return resubmit;
        }
    }

    private record Reply(int status, JsonNode body) {
        String errorCode() {
            return safeCode(body.at("/error/code").asText(), "HTTP_" + status);
        }

        Failure failure(boolean resubmit) {
            return new Failure(errorCode(), resubmit);
        }
    }

    private static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final HttpResponse.BodySubscriber<byte[]> downstream = HttpResponse.BodySubscribers.ofByteArray();
        private long remaining = 256 * 1024;
        private Flow.Subscription subscription;

        @Override public CompletionStage<byte[]> getBody() { return downstream.getBody(); }

        @Override
        public void onSubscribe(Flow.Subscription subscription) {
            this.subscription = subscription;
            downstream.onSubscribe(subscription);
        }

        @Override
        public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer : buffers) remaining -= buffer.remaining();
            if (remaining < 0) {
                subscription.cancel();
                downstream.onError(new IOException("索引服务响应超过大小上限"));
                return;
            }
            downstream.onNext(buffers);
        }

        @Override public void onError(Throwable error) { downstream.onError(error); }
        @Override public void onComplete() { downstream.onComplete(); }
    }
}
