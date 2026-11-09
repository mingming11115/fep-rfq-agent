package com.naura.rfq.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.config.properties.OfficeProperties;
import com.naura.rfq.security.OfficeJwt;
import com.naura.rfq.service.OfficeDocumentService;
import com.naura.rfq.storage.OfficeFileStore;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Slf4j
class CraftDocumentIntegrationTest {
    static final int LIMIT = 4096;
    static final Path ROOT;
    static {
        try {
            ROOT = Files.createTempDirectory("rfq-craft-test-");
        } catch (Exception e) {
            log.error("创建工艺文档测试临时目录失败", e);
            throw new RuntimeException(e);
        }
    }
    static final byte[] ORIGINAL = docx("Original source");
    static final byte[] REVIEW = docx("Native comments and replies");
    static final byte[] OTHER_REVIEW = docx("Concurrent review");
    final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired OfficeFileStore store;
    @Autowired OfficeProperties properties;

    @DynamicPropertySource static void settings(DynamicPropertyRegistry registry) {
        registry.add("office.storage-dir", () -> ROOT.toString());
        registry.add("office.jwt-secret", () -> "");
        registry.add("office.max-file-bytes", () -> LIMIT);
    }

    static byte[] docx(String text) {
        try {
            var out = new ByteArrayOutputStream();
            try (var zip = new ZipOutputStream(out)) {
                for (var e : Map.of("[Content_Types].xml", "<Types/>", "word/document.xml", "<document>" + text + "</document>").entrySet()) {
                    var entry = new ZipEntry(e.getKey()); entry.setTime(0);
                    zip.putNextEntry(entry); zip.write(e.getValue().getBytes(UTF_8)); zip.closeEntry();
                }
            }
            return out.toByteArray();
        } catch (Exception e) {
            log.error("构建工艺文档 DOCX 测试样本失败", e);
            throw new RuntimeException(e);
        }
    }
    HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/craft" + path)).timeout(Duration.ofSeconds(15));
    }
    HttpResponse<byte[]> send(HttpRequest.Builder request) throws Exception {
        return client.send(request.build(), HttpResponse.BodyHandlers.ofByteArray());
    }
    JsonNode data(HttpResponse<byte[]> response) throws Exception {
        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode body = mapper.readTree(response.body()); assertThat(body.path("code").asInt()).isZero();
        return body.get("data");
    }
    record Part(String field, String filename, byte[] bytes) { }
    HttpResponse<byte[]> upload(Part... files) throws Exception {
        String boundary = "rfq-test-boundary";
        var out = new ByteArrayOutputStream();
        for (Part file : files) {
            out.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + file.field() + "\"; filename=\"" + file.filename() + "\"\r\nContent-Type: application/octet-stream\r\n\r\n").getBytes(UTF_8));
            out.write(file.bytes()); out.write("\r\n".getBytes(UTF_8));
        }
        for (var entry : Map.of("projectId", "RFQ-CRAFT", "fileId", "SOURCE-17", "sourceVersion", "V3").entrySet()) {
            out.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + entry.getKey() + "\"\r\n\r\n" + entry.getValue() + "\r\n").getBytes(UTF_8));
        }
        out.write(("--" + boundary + "--\r\n").getBytes(UTF_8));
        return send(request("/documents").header("Content-Type", "multipart/form-data; boundary=" + boundary).POST(HttpRequest.BodyPublishers.ofByteArray(out.toByteArray())));
    }
    JsonNode upload() throws Exception { return data(upload(new Part("file", "RFQ.docx", ORIGINAL))); }
    HttpRequest.Builder authorized(JsonNode ref, String suffix) {
        return request("/documents/" + ref.path("id").asText() + suffix).header("X-Craft-Access", ref.path("access").asText());
    }
    HttpResponse<byte[]> save(JsonNode ref, String revision, byte[] bytes) throws Exception {
        var req = authorized(ref, "/review").header("Content-Type", "application/octet-stream");
        if (revision != null) {
            req.header("If-Match", revision);
        }
        return send(req.PUT(HttpRequest.BodyPublishers.ofByteArray(bytes)));
    }
    void unchanged(JsonNode ref) throws Exception {
        assertThat(data(send(authorized(ref, "").GET())).path("revision").asInt()).isZero();
        assertThat(send(authorized(ref, "/download?kind=original").GET()).body()).isEqualTo(ORIGINAL);
        assertThat(send(authorized(ref, "/download?kind=review").GET()).body()).isEqualTo(ORIGINAL);
    }

    @Test void realMultipartUploadWorksWithoutOnlyofficeConfigurationAndPreservesSourceBinding() throws Exception {
        assertThat(properties.configured()).isFalse();
        JsonNode ref = upload();
        assertThat(ref.path("access").asText()).isNotBlank();
        assertThat(ref.path("fileType").asText()).isEqualTo("docx");
        assertThat(ref.path("projectId").asText()).isEqualTo("RFQ-CRAFT");
        assertThat(ref.path("fileId").asText()).isEqualTo("SOURCE-17");
        assertThat(ref.path("sourceVersion").asText()).isEqualTo("V3");
        unchanged(ref);
        var metadata = send(authorized(ref, "").GET());
        assertThat(metadata.headers().firstValue("Cache-Control")).hasValue("no-store");
        assertThat(data(metadata).has("access")).isFalse();
    }

    @Test void importedLatestReviewIsSeparateFromImmutableOriginalAndGetsFreshReference() throws Exception {
        JsonNode first = upload();
        JsonNode ref = data(upload(new Part("file", "RFQ.docx", ORIGINAL), new Part("review", "review.docx", REVIEW)));
        assertThat(ref.path("id").asText()).isNotEqualTo(first.path("id").asText());
        assertThat(ref.path("access").asText()).isNotEqualTo(first.path("access").asText());
        assertThat(ref.path("revision").asInt()).isEqualTo(1);
        assertThat(send(authorized(ref, "/download?kind=original").GET()).body()).isEqualTo(ORIGINAL);
        assertThat(send(authorized(ref, "/download?kind=review").GET()).body()).isEqualTo(REVIEW);
        var reopened = new OfficeFileStore(properties, mapper);
        var doc = reopened.authorize(ref.path("id").asText(), ref.path("access").asText());
        assertThat(Files.readAllBytes(reopened.file(doc, true))).isEqualTo(ORIGINAL);
        assertThat(Files.readAllBytes(reopened.file(doc, false))).isEqualTo(REVIEW);
    }

    @Test void nativeSavePublishesRevisionAndReopensFromFreshServiceWithoutChangingOriginal() throws Exception {
        JsonNode ref = upload(); String id = ref.path("id").asText(); String oldKey = store.read(id).key();
        var response = save(ref, "\"0\"", REVIEW);
        assertThat(data(response).path("revision").asInt()).isEqualTo(1);
        assertThat(response.headers().firstValue("ETag")).hasValue("\"1\"");
        assertThat(store.read(id).key()).isNotEqualTo(oldKey);
        assertThat(store.read(id).savedAt()).isNotBlank();
        assertThat(send(authorized(ref, "/download?kind=original").GET()).body()).isEqualTo(ORIGINAL);
        assertThat(send(authorized(ref, "/download?kind=review").GET()).body()).isEqualTo(REVIEW);
        var reopenedStore = new OfficeFileStore(properties, mapper);
        var reopened = new OfficeDocumentService(properties, reopenedStore, new OfficeJwt(properties, mapper), mapper);
        var doc = reopenedStore.authorize(id, ref.path("access").asText());
        assertThat(reopened.metadata(doc).get("revision")).isEqualTo(1L);
        assertThat(Files.readAllBytes(reopenedStore.file(doc, false))).isEqualTo(REVIEW);
        String key = doc.key();
        assertThat(data(save(ref, "1", REVIEW)).path("revision").asInt()).isEqualTo(1);
        assertThat(store.read(id).key()).isNotEqualTo(key);
        assertThat(save(ref, "0", REVIEW).statusCode()).isEqualTo(409);
    }

    @Test void missingAndInvalidCapabilitiesCannotReadOrPublish() throws Exception {
        JsonNode ref = upload(); String id = ref.path("id").asText();
        for (String access : List.of("", "invalid")) {
            for (String path : List.of("", "/download?kind=review", "/download?kind=original"))
                assertThat(send(request("/documents/" + id + path).header("X-Craft-Access", access).GET()).statusCode()).isEqualTo(403);
            assertThat(send(request("/documents/" + id + "/review").header("X-Craft-Access", access).header("If-Match", "0")
                    .header("Content-Type", "application/octet-stream").PUT(HttpRequest.BodyPublishers.ofByteArray(REVIEW))).statusCode()).isEqualTo(403);
        }
        unchanged(ref);
    }

    @Test void missingMalformedAndOverflowingRevisionsAreRejectedWithoutPublishing() throws Exception {
        JsonNode ref = upload();
        assertThat(save(ref, null, REVIEW).statusCode()).isEqualTo(400);
        for (String value : List.of("bad", "-1", "*", "W/\"0\"", "\"0", "\"\"", "0,1", "9999999999999999999999999"))
            assertThat(save(ref, value, REVIEW).statusCode()).as(value).isEqualTo(400);
        unchanged(ref);
    }

    @Test void fileFormatNameAndBodyTypeAreValidatedBeforeAnyPublish() throws Exception {
        JsonNode ref = upload();
        assertThat(save(ref, "0", "%PDF-1.7\n%%EOF".getBytes(UTF_8)).statusCode()).isEqualTo(400);
        assertThat(save(ref, "0", new byte[0]).statusCode()).isEqualTo(400);
        assertThat(send(authorized(ref, "/review").header("If-Match", "0").header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofByteArray(REVIEW))).statusCode()).isEqualTo(400);
        assertThat(upload(new Part("file", "RFQ.txt", ORIGINAL)).statusCode()).isEqualTo(400);
        assertThat(upload(new Part("file", "RFQ.docx", ORIGINAL), new Part("review", "wrong.pdf", "%PDF-1.7\n%%EOF".getBytes(UTF_8))).statusCode()).isEqualTo(400);
        assertThat(send(authorized(ref, "/download?kind=not-a-version").GET()).statusCode()).isEqualTo(400);
        unchanged(ref);
    }

    @Test void knownAndChunkedOversizeBodiesAndMultipartPartsLeaveSavedRevisionIntact() throws Exception {
        JsonNode ref = upload(); byte[] huge = new byte[LIMIT + 1];
        assertThat(save(ref, "0", huge).statusCode()).isEqualTo(413);
        assertThat(send(authorized(ref, "/review").header("If-Match", "0").header("Content-Type", "application/octet-stream")
                .PUT(HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(huge)))).statusCode()).isEqualTo(413);
        assertThat(upload(new Part("file", "huge.docx", huge)).statusCode()).isEqualTo(413);
        assertThat(upload(new Part("file", "RFQ.docx", ORIGINAL), new Part("review", "huge.docx", huge)).statusCode()).isEqualTo(413);
        unchanged(ref);
    }

    @Test void twoConcurrentWritersCannotPublishTheSameExpectedRevision() throws Exception {
        JsonNode ref = upload();
        var first = client.sendAsync(authorized(ref, "/review").header("If-Match", "0").header("Content-Type", "application/octet-stream")
                .PUT(HttpRequest.BodyPublishers.ofByteArray(REVIEW)).build(), HttpResponse.BodyHandlers.ofByteArray());
        var second = client.sendAsync(authorized(ref, "/review").header("If-Match", "0").header("Content-Type", "application/octet-stream")
                .PUT(HttpRequest.BodyPublishers.ofByteArray(OTHER_REVIEW)).build(), HttpResponse.BodyHandlers.ofByteArray());
        CompletableFuture.allOf(first, second).get();
        assertThat(List.of(first.get().statusCode(), second.get().statusCode())).containsExactlyInAnyOrder(200, 409);
        assertThat(data(send(authorized(ref, "").GET())).path("revision").asInt()).isEqualTo(1);
        assertThat(send(authorized(ref, "/download?kind=review").GET()).body()).isEqualTo(first.get().statusCode() == 200 ? REVIEW : OTHER_REVIEW);
        assertThat(send(authorized(ref, "/download?kind=original").GET()).body()).isEqualTo(ORIGINAL);
    }

    @Test void failedFilePublicationKeepsMetadataOriginalAndPreviousReview() throws Exception {
        JsonNode ref = upload();
        Path blocked = store.directory(ref.path("id").asText()).resolve("review-1"); Files.createDirectory(blocked);
        try {
            assertThat(save(ref, "0", REVIEW).statusCode()).isEqualTo(500);
            unchanged(ref);
        } finally { Files.delete(blocked); }
        assertThat(data(save(ref, "0", REVIEW)).path("revision").asInt()).isEqualTo(1);
    }
}
