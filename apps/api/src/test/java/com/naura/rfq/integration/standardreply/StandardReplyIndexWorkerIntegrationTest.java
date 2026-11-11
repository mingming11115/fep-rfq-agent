package com.naura.rfq.integration.standardreply;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = "rfq.demo-data.enabled=false")
class StandardReplyIndexWorkerIntegrationTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;

    @ParameterizedTest
    @EnumSource(value = KnowledgeIndexQueue.Library.class, names = {"STANDARD_REPLY", "CAPABILITY"})
    void pendingJobSurvivesAndItsStaleCompletionCannotAcknowledgeANewerDelete(KnowledgeIndexQueue.Library library) throws Exception {
        String bu = "BU-INDEX-" + UUID.randomUUID();
        String id = "R-TEST";
        String dataset = library == KnowledgeIndexQueue.Library.CAPABILITY ? "rfq.test.capability-boundary" : "rfq.test.standard-reply";
        var calls = new AtomicInteger();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            try (exchange) {
                int status;
                String body;
                switch (calls.getAndIncrement()) {
                    case 0 -> {
                        status = 202;
                        body = """
                            {"job_id":"job-old","job_status":"pending","accepted_count":1,"rejected_count":0}
                            """;
                    }
                    case 1 -> {
                        jdbc.update("""
                            update %s
                            set version=2,operation='delete',payload=null,updated_at=timestampadd(microsecond,1,updated_at),
                                next_attempt_at=utc_timestamp(6),job_id=null,synced_at=null
                            where bu_id=? and reply_id=?
                            """.formatted(library.table), bu, id);
                        status = 200;
                        body = """
                            {"status":"succeeded","succeeded_count":1,"failed_count":0}
                            """;
                    }
                    default -> {
                        boolean delete = "delete".equals(json.readTree(exchange.getRequestBody()).at("/records/0/op").asText());
                        status = delete && exchange.getRequestURI().getPath().endsWith("/" + dataset + ":ingest") ? 200 : 400;
                        body = """
                            {"job_id":"job-delete","job_status":"succeeded","accepted_count":1,"rejected_count":0}
                            """;
                    }
                }
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(status, bytes.length);
                exchange.getResponseBody().write(bytes);
            }
        });
        server.start();
        try {
            var settings = new StandardReplyIndexProperties("http://127.0.0.1:" + server.getAddress().getPort(),
                "test-index-key", library == KnowledgeIndexQueue.Library.STANDARD_REPLY ? Map.of(bu, dataset) : Map.of(),
                Map.of(), library == KnowledgeIndexQueue.Library.CAPABILITY ? Map.of(bu, dataset) : Map.of());
            var worker = new StandardReplyIndexWorker(jdbc, json, settings, new StandardReplyIndexClient(json, settings));
            var data = json.createObjectNode().put("title", "标题").put("requirement_text", "要求")
                .put("bu_id", bu).put("record_version", 1);
            new KnowledgeIndexQueue(jdbc).enqueue(library, bu, id, 1, data);

            worker.sync();
            assertThat(read(library, bu, id)).containsEntry("job_id", "job-old").containsEntry("synced_at", null)
                .containsEntry("lease_token", null);
            jdbc.update("update " + library.table + " set next_attempt_at=utc_timestamp(6) where bu_id=? and reply_id=?", bu, id);

            worker.sync();
            assertThat(read(library, bu, id)).containsEntry("version", 2).containsEntry("operation", "delete")
                .containsEntry("job_id", null).containsEntry("synced_at", null).containsEntry("lease_token", null);

            worker.sync();
            assertThat(read(library, bu, id)).containsEntry("job_id", "job-delete").doesNotContainEntry("synced_at", null);
            assertThat(calls).hasValue(3);
        } finally {
            server.stop(0);
            jdbc.update("delete from " + library.table + " where bu_id=? and reply_id=?", bu, id);
        }
    }

    private Map<String, Object> read(KnowledgeIndexQueue.Library library, String bu, String id) {
        return jdbc.queryForMap("""
            select version,operation,job_id,synced_at,lease_token from %s
            where bu_id=? and reply_id=?
            """.formatted(library.table), bu, id);
    }
}
