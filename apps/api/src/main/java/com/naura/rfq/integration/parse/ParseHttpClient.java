package com.naura.rfq.integration.parse;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.io.JsonStringEncoder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.config.properties.ParseIntegrationProperties;
import com.naura.rfq.integration.ExternalCallLog;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/** Bounded response and whole-request deadline, including request upload and response body. */
@Component
@RequiredArgsConstructor
@Slf4j
public class ParseHttpClient {
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private static final Set<String> LENGTH_CODES = Set.of("context_length_exceeded", "context_window_exceeded",
            "max_context_length_exceeded", "input_too_long", "prompt_too_long", "request_too_large");
    private final ObjectMapper json;
    private final ConcurrentHashMap<Duration, HttpClient> clients = new ConcurrentHashMap<>();

    public JsonNode post(ParseIntegrationProperties.Endpoint settings, Object body, String parseRunId) throws Exception {
        byte[] requestBytes = json.writeValueAsBytes(body);
        var request = postRequest(settings, "application/json; charset=UTF-8", HttpRequest.BodyPublishers.ofByteArray(requestBytes));
        boolean llm = settings instanceof ParseIntegrationProperties.Llm;
        boolean logPayload = settings instanceof ParseIntegrationProperties.Llm config && config.isLogPayload();
        var call = new ExternalCallLog(llm ? "llm" : "ocr", llm ? "chat_completions" : "recognise", request, parseRunId);
        return send(settings, request, call, logPayload ? requestBytes : null);
    }

    JsonNode modelContent(JsonNode response) throws JsonProcessingException {
        String content = response.path("choices").path(0).path("message").path("content").asText("").trim();
        if (content.startsWith("```")) {
            content = content.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
        }
        return json.readTree(content);
    }

    JsonNode postMineru(ParseIntegrationProperties.Mineru settings, String boundary, HttpRequest.BodyPublisher body) throws Exception {
        var request = postRequest(settings, "multipart/form-data; boundary=" + boundary, body);
        return send(settings, request, new ExternalCallLog("mineru", "file_parse", request, null), null);
    }

    private HttpRequest postRequest(ParseIntegrationProperties.Endpoint settings, String contentType, HttpRequest.BodyPublisher body) {
        URI uri = URI.create(settings.getUrl());
        if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || uri.getHost() == null || uri.getUserInfo() != null) {
            throw new IllegalArgumentException("服务地址未配置或不合法");
        }
        var builder = HttpRequest.newBuilder(uri).timeout(positive(settings.getTimeout()))
            .header("Content-Type", contentType).POST(body);
        if (settings.getApiKey() != null && !settings.getApiKey().isBlank()) {
            builder.header("Authorization", "Bearer " + settings.getApiKey());
        }
        return builder.build();
    }

    private JsonNode send(ParseIntegrationProperties.Endpoint settings, HttpRequest request, ExternalCallLog call,
            byte[] loggedRequest) throws Exception {
        Duration timeout = request.timeout().orElseThrow();
        HttpClient client = clients.computeIfAbsent(positive(settings.getConnectTimeout()), duration -> HttpClient.newBuilder()
            .connectTimeout(duration).followRedirects(HttpClient.Redirect.NEVER).build());
        if (loggedRequest != null) {
            logPayload(call, "request", loggedRequest, settings.getApiKey());
        }

        CompletableFuture<HttpResponse<byte[]>> pending = null;
        HttpResponse<byte[]> response;
        try {
            pending = client.sendAsync(request, info -> new LimitedBody());
            response = pending.get(Math.max(1, timeout.toMillis()), TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            call.failed(e);
            throw e;
        } finally {
            if (pending != null && !pending.isDone()) {
                pending.cancel(true);
            }
        }
        call.response(response.statusCode(), response.body().length);
        if (loggedRequest != null) {
            logPayload(call, "response", response.body(), settings.getApiKey());
        }
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new RemoteStatusException(response.statusCode(), isLengthError(response.statusCode(), response.body()));
        }
        try {
            return json.readTree(response.body());
        } catch (java.io.IOException e) {
            call.failed(e);
            throw e;
        }
    }

    private boolean isLengthError(int status, byte[] body) {
        if (status == 413) {
            return true;
        }
        if (status != 400 && status != 422) {
            return false;
        }
        try {
            JsonNode response = json.readTree(body);
            if (response == null) {
                return false;
            }
            JsonNode error = response.path("error");
            if (LENGTH_CODES.contains(error.path("code").asText()) || LENGTH_CODES.contains(error.path("type").asText())) {
                return true;
            }
            String message = error.path("message").asText(response.path("message").asText()).toLowerCase(Locale.ROOT);
            return message.contains("maximum context length") || message.contains("context length exceeded")
                    || message.contains("context window exceeded") || message.contains("prompt is too long")
                    || message.contains("input is too long");
        } catch (java.io.IOException e) {
            return false;
        }
    }

    static boolean requestExceedsLengthLimit(Exception exception) {
        return exception instanceof RemoteStatusException status && status.lengthError;
    }

    private static void logPayload(ExternalCallLog call, String direction, byte[] bytes, String apiKey) {
        String body = new String(bytes, StandardCharsets.UTF_8);
        if (apiKey != null && !apiKey.isBlank()) {
            body = body.replace(apiKey, "[REDACTED]");
        }
        String quoted = new String(JsonStringEncoder.getInstance().quoteAsString(body));
        log.info("external.call.payload callId={} service=llm direction={} body=\"{}\"", call.callId(), direction, quoted);
    }
    private Duration positive(Duration value) {
        if (value == null || value.isNegative() || value.isZero()) {
            throw new IllegalArgumentException("服务超时必须大于零");
        }
        return value;
    }
    public static String reason(Exception e) {
        Throwable reason = e;
        while (reason.getCause() != null && (reason instanceof java.util.concurrent.ExecutionException
                || reason instanceof java.util.concurrent.CompletionException)) reason = reason.getCause();
        if (reason instanceof java.util.concurrent.TimeoutException || reason instanceof java.net.http.HttpTimeoutException) {
            return "请求超时";
        }
        if (reason instanceof RemoteStatusException status) {
            return "HTTP " + status.status;
        }
        return "配置、连接或响应校验失败";
    }
    private static class RemoteStatusException extends Exception {
        private final int status;
        private final boolean lengthError;
        RemoteStatusException(int status, boolean lengthError) {
            this.status = status;
            this.lengthError = lengthError;
        }
    }
    private static class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        @Override public CompletionStage<byte[]> getBody() { return result; }
        @Override public void onSubscribe(Flow.Subscription subscription) { this.subscription = subscription; subscription.request(1); }
        @Override public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer : buffers) {
                if ((long) bytes.size() + buffer.remaining() > MAX_RESPONSE_BYTES) {
                    subscription.cancel(); result.completeExceptionally(new IllegalArgumentException("服务响应超过大小上限")); return;
                }
                byte[] chunk = new byte[buffer.remaining()]; buffer.get(chunk); bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }
        @Override public void onError(Throwable error) { result.completeExceptionally(error); }
        @Override public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
