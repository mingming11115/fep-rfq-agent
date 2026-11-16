package com.naura.rfq.integration.standardreply;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ExtendWith(OutputCaptureExtension.class)
class StandardReplyIndexClientTest {
    private static final String BU = "BU-A";
    private static final String DATASET = "rfq.a.standard-reply";
    private static final Instant UPDATED_AT = Instant.parse("2026-11-08T12:30:00.123456Z");
    private final ObjectMapper json = new ObjectMapper();
    private final List<Exchange> requests = new ArrayList<>();
    private HttpServer server;
    private StandardReplyIndexClient client;
    private List<Reply> replies;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            try (exchange) {
                var request = new Exchange(exchange.getRequestMethod(), exchange.getRequestURI().getRawPath(),
                    exchange.getRequestHeaders().getFirst("X-API-Key"),
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                int index;
                synchronized (requests) {
                    index = requests.size();
                    requests.add(request);
                }
                Reply response = index < replies.size() ? replies.get(index) : new Reply(500, "{}");
                byte[] bytes = response.body().getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(response.status(), bytes.length);
                exchange.getResponseBody().write(bytes);
            }
        });
        server.start();
        var settings = new StandardReplyIndexProperties("http://127.0.0.1:" + server.getAddress().getPort(),
            "test-index-key", DATASET);
        client = new StandardReplyIndexClient(json, settings);
    }

    @AfterEach
    void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void firstIngestCarriesDatasetConfigAndWaitsUntilItsJobIsSearchable(CapturedOutput output) throws Exception {
        replies = List.of(new Reply(202, "{\"job_id\":\"job-1\",\"job_status\":\"pending\",\"accepted_count\":1,\"rejected_count\":0}"),
            new Reply(200, "{\"status\":\"running\"}"),
            new Reply(200, "{\"status\":\"succeeded\",\"succeeded_count\":1,\"failed_count\":0}"));
        var accepted = client.submit(DATASET, "REPLY-1", "upsert", payload(), UPDATED_AT);
        assertThat(accepted.complete()).isFalse();
        assertThat(accepted.jobId()).isEqualTo("job-1");
        assertThat(client.poll(DATASET, "job-1", "REPLY-1").complete()).isFalse();
        assertThat(client.poll(DATASET, "job-1", "REPLY-1").complete()).isTrue();

        assertThat(requests).extracting(Exchange::key).containsOnly("test-index-key");
        assertThat(requests).extracting(Exchange::method).containsExactly("POST", "GET", "GET");
        assertThat(requests.get(0).path()).isEqualTo("/api/v1/semantic-datasets/" + DATASET + ":ingest");
        assertThat(requests.get(1).path()).isEqualTo("/api/v1/ingestion-jobs/job-1");
        JsonNode created = json.readTree(requests.get(0).body());
        assertThat(created.at("/dataset_config/embedding_fields").toString()).isEqualTo("[\"title\",\"requirement_text\"]");
        assertThat(created.at("/dataset_config/advanced/filter_fields").toString()).isEqualTo("[\"bu_id\",\"record_version\"]");
        assertThat(created.at("/records/0/id").asText()).isEqualTo("REPLY-1");
        assertThat(created.at("/records/0/updated_at").asText()).isEqualTo(UPDATED_AT.toString());
        assertThat(created.at("/records/0/data")).isEqualTo(payload());
        assertThat(output.getAll()).contains("external.call.request", "external.call.response",
            "service=semantic_index operation=ingest", "service=semantic_index operation=poll", "status=202")
            .doesNotContain("test-index-key");
    }

    @Test
    void laterIngestOnlySendsRecordsOnceTheDatasetExists() throws Exception {
        replies = List.of(new Reply(200, "{\"job_id\":\"job-1\",\"job_status\":\"succeeded\",\"accepted_count\":1,\"rejected_count\":0}"),
            new Reply(200, "{\"job_id\":\"job-2\",\"job_status\":\"succeeded\",\"accepted_count\":1,\"rejected_count\":0}"));
        client.submit(DATASET, "REPLY-1", "upsert", payload(), UPDATED_AT);
        assertThat(client.submit(DATASET, "REPLY-2", "upsert", payload(), UPDATED_AT).complete()).isTrue();
        assertThat(requests).hasSize(2);
        assertThat(json.readTree(requests.get(0).body()).has("dataset_config")).isTrue();
        JsonNode incremental = json.readTree(requests.get(1).body());
        assertThat(incremental.has("dataset_config")).isFalse();
        assertThat(incremental.at("/records/0/id").asText()).isEqualTo("REPLY-2");
    }

    @Test
    void ingestsPublishedCapabilityInItsOwnDataset() throws Exception {
        String dataset = "equipment-capability";
        String prefix = "rfq.standard-reply-index";
        var properties = new MapConfigurationPropertySource(Map.of(
            prefix + ".base-url", "http://127.0.0.1:" + server.getAddress().getPort(),
            prefix + ".api-key", "test-index-key",
            prefix + ".capability-dataset", dataset));
        var settings = new Binder(properties).bind(prefix, Bindable.of(StandardReplyIndexProperties.class)).get();
        var capabilityClient = new StandardReplyIndexClient(json, settings);
        replies = List.of(new Reply(200, "{\"job_id\":\"job-cap\",\"job_status\":\"succeeded\",\"accepted_count\":1,\"rejected_count\":0}"));
        var projection = json.createObjectNode().put("title", "定位精度").put("requirement_text", "≤5 μm")
            .put("bu_id", "BU-FEP").put("record_version", 1);

        assertThat(capabilityClient.submit(dataset, "CAP-1", "upsert", projection, UPDATED_AT).complete()).isTrue();
        assertThat(requests).extracting(Exchange::path).containsOnly("/api/v1/semantic-datasets/" + dataset + ":ingest");
        JsonNode created = json.readTree(requests.get(0).body());
        assertThat(created.at("/dataset_config/display_name").asText()).isEqualTo("机型能力边界");
        assertThat(created.at("/records/0/data")).isEqualTo(projection);
    }

    @Test
    void keepsThePlatformConfigWhenItAlreadyExistsWithAnotherOne(CapturedOutput output) throws Exception {
        replies = List.of(new Reply(409, "{\"error\":{\"code\":\"DATASET_CONFIG_CONFLICT\"}}"),
            new Reply(202, "{\"job_id\":\"job-409\",\"job_status\":\"pending\",\"accepted_count\":1,\"rejected_count\":0}"));
        var accepted = client.submit(DATASET, "REPLY-1", "upsert", payload(), UPDATED_AT);
        assertThat(accepted.jobId()).isEqualTo("job-409");
        assertThat(requests).hasSize(2);
        assertThat(json.readTree(requests.get(0).body()).has("dataset_config")).isTrue();
        assertThat(json.readTree(requests.get(1).body()).has("dataset_config")).isFalse();
        assertThat(output.getAll()).contains("配置与本地不一致", "dataset=" + DATASET);
    }

    @Test
    void reprovisionsWhenThePlatformLosesTheDatasetConfig() throws Exception {
        replies = List.of(new Reply(200, "{\"job_id\":\"job-1\",\"job_status\":\"succeeded\",\"accepted_count\":1,\"rejected_count\":0}"),
            new Reply(400, "{\"error\":{\"code\":\"DATA_CONFIG_REQUIRED\"}}"),
            new Reply(202, "{\"job_id\":\"job-2\",\"job_status\":\"pending\",\"accepted_count\":1,\"rejected_count\":0}"));
        client.submit(DATASET, "REPLY-1", "upsert", payload(), UPDATED_AT);
        assertThat(client.submit(DATASET, "REPLY-2", "upsert", payload(), UPDATED_AT).jobId()).isEqualTo("job-2");
        assertThat(requests).hasSize(3);
        assertThat(json.readTree(requests.get(1).body()).has("dataset_config")).isFalse();
        JsonNode reprovisioned = json.readTree(requests.get(2).body());
        assertThat(reprovisioned.at("/dataset_config/embedding_fields").toString()).isEqualTo("[\"title\",\"requirement_text\"]");
        assertThat(reprovisioned.at("/records/0/id").asText()).isEqualTo("REPLY-2");
        assertThat(reprovisioned.at("/records/0/data")).isEqualTo(payload());
    }

    @Test
    void reprovisionsWhenTheDatasetDisappearsOnThePlatform() throws Exception {
        // 进程内已标记创建过，但中台数据集后来被删除：404 一律按数据集缺失处理，补配置重建。
        replies = List.of(new Reply(200, "{\"job_id\":\"job-1\",\"job_status\":\"succeeded\",\"accepted_count\":1,\"rejected_count\":0}"),
            new Reply(404, "{}"),
            new Reply(202, "{\"job_id\":\"job-2\",\"job_status\":\"pending\",\"accepted_count\":1,\"rejected_count\":0}"));
        client.submit(DATASET, "REPLY-1", "upsert", payload(), UPDATED_AT);
        assertThat(client.submit(DATASET, "REPLY-2", "upsert", payload(), UPDATED_AT).jobId()).isEqualTo("job-2");
        assertThat(requests).hasSize(3);
        assertThat(json.readTree(requests.get(1).body()).has("dataset_config")).isFalse();
        JsonNode recreated = json.readTree(requests.get(2).body());
        assertThat(recreated.at("/dataset_config/embedding_fields").toString()).isEqualTo("[\"title\",\"requirement_text\"]");
        assertThat(recreated.at("/records/0/id").asText()).isEqualTo("REPLY-2");
        assertThat(recreated.at("/records/0/data")).isEqualTo(payload());
    }

    @Test
    void repeatedMissingDatasetConfigFailsWithThePlatformCode(CapturedOutput output) {
        replies = List.of(new Reply(200, "{\"job_id\":\"job-1\",\"job_status\":\"succeeded\",\"accepted_count\":1,\"rejected_count\":0}"),
            new Reply(400, "{\"error\":{\"code\":\"DATA_CONFIG_REQUIRED\"}}"),
            new Reply(409, "{\"error\":{\"code\":\"DATA_CONFIG_REQUIRED\"}}"));
        client.submit(DATASET, "REPLY-1", "upsert", payload(), UPDATED_AT);
        assertThatThrownBy(() -> client.submit(DATASET, "REPLY-2", "upsert", payload(), UPDATED_AT))
            .isInstanceOfSatisfying(StandardReplyIndexClient.Failure.class, failure -> {
                assertThat(failure.getMessage()).isEqualTo("DATA_CONFIG_REQUIRED");
                assertThat(failure.resubmit()).isFalse();
            });
        assertThat(requests).hasSize(3);
        assertThat(output.getAll()).contains("数据集仍缺少配置", "dataset=" + DATASET);
    }

    @Test
    void deleteOfConfiglessDatasetDoesNotProvisionOrSendData() throws Exception {
        replies = List.of(new Reply(400, "{\"error\":{\"code\":\"DATA_CONFIG_REQUIRED\"}}"));
        assertThat(client.submit(DATASET, "REPLY-1", "delete", null, UPDATED_AT).complete()).isTrue();
        assertThat(requests).hasSize(1);
        assertThat(json.readTree(requests.get(0).body()).has("dataset_config")).isFalse();
    }

    @Test
    void rejectedPartialJobIsNotSearchableAndCanBeResubmitted() {
        replies = List.of(new Reply(200, """
            {"status":"partial_success","total_count":1,"succeeded_count":0,"failed_count":1,
             "errors":[{"id":"REPLY-1","code":"FIELD_TYPE_MISMATCH","message":"private payload"}]}
            """));
        assertThatThrownBy(() -> client.poll(DATASET, "job-1", "REPLY-1"))
            .isInstanceOfSatisfying(StandardReplyIndexClient.Failure.class, failure -> {
                assertThat(failure.resubmit()).isTrue();
                assertThat(failure.getMessage()).isEqualTo("FIELD_TYPE_MISMATCH");
            });
    }

    @Test
    void configMissingAtJobStageIsRepairedWithDatasetConfigOnResubmission() throws Exception {
        replies = List.of(
            new Reply(202, "{\"job_id\":\"job-1\",\"job_status\":\"pending\",\"accepted_count\":1,\"rejected_count\":0}"),
            new Reply(200, """
                {"status":"failed","errors":[{"id":"REPLY-1","code":"DATA_CONFIG_REQUIRED"}]}
                """),
            new Reply(202, "{\"job_id\":\"job-2\",\"job_status\":\"pending\",\"accepted_count\":1,\"rejected_count\":0}"),
            new Reply(200, "{\"status\":\"succeeded\",\"succeeded_count\":1,\"failed_count\":0}"));
        assertThat(client.submit(DATASET, "REPLY-1", "upsert", payload(), UPDATED_AT).jobId()).isEqualTo("job-1");
        assertThatThrownBy(() -> client.poll(DATASET, "job-1", "REPLY-1"))
            .isInstanceOfSatisfying(StandardReplyIndexClient.Failure.class, failure -> {
                assertThat(failure.resubmit()).isTrue();
                assertThat(failure.getMessage()).isEqualTo("DATA_CONFIG_REQUIRED");
            });
        assertThat(client.submit(DATASET, "REPLY-1", "upsert", payload(), UPDATED_AT).jobId()).isEqualTo("job-2");
        assertThat(json.readTree(requests.get(2).body()).has("dataset_config")).isTrue();
        assertThat(json.readTree(requests.get(2).body()).at("/records/0/id").asText()).isEqualTo("REPLY-1");
        assertThat(client.poll(DATASET, "job-2", "REPLY-1").complete()).isTrue();
    }

    @Test
    void deleteOfMissingDatasetDoesNotProvisionOrSendData() throws Exception {
        replies = List.of(new Reply(404, "{\"error\":{\"code\":\"DATASET_NOT_FOUND\"}}"));
        assertThat(client.submit(DATASET, "REPLY-1", "delete", null, UPDATED_AT).complete()).isTrue();
        assertThat(requests).hasSize(1);
        var body = json.readTree(requests.get(0).body());
        assertThat(body.at("/records/0/op").asText()).isEqualTo("delete");
        assertThat(body.at("/records/0/data").isMissingNode()).isTrue();
        assertThat(body.has("dataset_config")).isFalse();
    }

    @Test
    void searchesWithBuAndIdFiltersAndRejectsHitsOutsideTheAllowedScope(CapturedOutput output) throws Exception {
        replies = List.of(new Reply(200, """
            {"request_id":"req-1","index_version":3,"hits":[{"source_id":"R1","fields":{"record_version":2},"score":0.02}]}
            """), new Reply(200, """
            {"hits":[{"source_id":"OTHER","fields":{"record_version":1}}]}
            """));
        var found = client.search(BU, false, "设备定位精度 ≤ 5 μm", List.of("R1"));
        assertThat(found.hits()).containsExactly(new StandardReplyIndexClient.SearchHit("R1", 2));
        assertThat(found.requestId()).isEqualTo("req-1");
        assertThat(requests.get(0).path()).isEqualTo("/api/v1/semantic-datasets/" + DATASET + ":search");
        var body = json.readTree(requests.get(0).body());
        assertThat(body.at("/filter/and/0/value").asText()).isEqualTo(BU);
        assertThat(body.at("/filter/and/1/value/0").asText()).isEqualTo("R1");
        assertThat(body.at("/result_options/include_matched_chunks").asBoolean(true)).isFalse();
        assertThatThrownBy(() -> client.search(BU, false, "设备定位精度", List.of("R1")))
                .isInstanceOf(StandardReplyIndexClient.SearchFailure.class).hasMessage("INVALID_SEARCH_SCOPE");
        assertThat(output.getAll()).contains("service=semantic_index operation=search", "status=200")
            .doesNotContain("设备定位精度", "test-index-key");
    }

    @Test
    void refusesDatasetSharingBetweenLibraries() {
        assertThatThrownBy(() -> new StandardReplyIndexProperties("https://knowledge.example.test", "test-key",
            DATASET, DATASET, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new StandardReplyIndexProperties("https://knowledge.example.test", "test-key",
            DATASET, null, DATASET)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void bindsOneDatasetPerLibraryWithoutBusinessUnitKeys() {
        String prefix = "rfq.standard-reply-index";
        var properties = new MapConfigurationPropertySource(Map.of(
            prefix + ".base-url", "http://knowledge.internal/api/v1/",
            prefix + ".api-key", "test-index-key",
            prefix + ".dataset", DATASET,
            prefix + ".history-dataset", "rfq.a.history-clause"));
        var settings = new Binder(properties).bind(prefix, Bindable.of(StandardReplyIndexProperties.class)).get();
        assertThat(settings.dataset()).isEqualTo(DATASET);
        assertThat(settings.historyDataset()).isEqualTo("rfq.a.history-clause");
        assertThat(settings.capabilityDataset()).isNull();
        assertThat(settings.datasetFor(Library.HISTORY_RFQ)).isEqualTo("rfq.a.history-clause");
        assertThat(settings.endpoint("/ingestion-jobs/test")).isEqualTo("http://knowledge.internal/api/v1/ingestion-jobs/test");
    }

    private JsonNode payload() {
        return json.createObjectNode().put("title", "标准回复").put("requirement_text", "客户要求")
            .put("bu_id", BU).put("record_version", 2);
    }

    private record Reply(int status, String body) {}
    private record Exchange(String method, String path, String key, String body) {}
}
