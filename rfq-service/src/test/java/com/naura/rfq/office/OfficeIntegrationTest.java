package com.naura.rfq.office;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class OfficeIntegrationTest {
    static final String SECRET = "test-onlyoffice-secret-at-least-32-chars";
    static final ObjectMapper JSON = new ObjectMapper();
    static final Path ROOT;
    static final HttpServer DOCS;
    static final byte[] ORIGINAL = docx("original");
    static final byte[] REVIEW = docx("review with comments");
    static {
        try {
            ROOT = Files.createTempDirectory("rfq-office-test-");
            DOCS = HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
            DOCS.createContext("/cache/files/review.docx", exchange -> {
                exchange.sendResponseHeaders(200, REVIEW.length);
                try (var output = exchange.getResponseBody()) { output.write(REVIEW); }
            });
            DOCS.createContext("/cache/files/newer.docx", exchange -> {
                byte[] bytes=docx("newer review");exchange.sendResponseHeaders(200,bytes.length);
                try(var output=exchange.getResponseBody()){output.write(bytes);}
            });
            DOCS.start();
        } catch (Exception e) { throw new RuntimeException(e); }
    }
    @DynamicPropertySource static void settings(DynamicPropertyRegistry registry) {
        registry.add("office.storage-dir", () -> ROOT.toString());
        registry.add("office.jwt-secret", () -> SECRET);
        registry.add("office.internal-url", OfficeIntegrationTest::docsUrl);
        registry.add("office.public-url", () -> "http://browser.invalid:8082");
        registry.add("office.callback-base-url", () -> "http://backend:48081");
        registry.add("office.max-file-bytes", () -> 1024 * 1024);
    }
    @AfterAll static void stop() { DOCS.stop(0); }
    @Autowired MockMvc mvc;
    @Autowired OfficeProperties properties;
    @Autowired ObjectMapper mapper;

    static String docsUrl() { return "http://127.0.0.1:" + DOCS.getAddress().getPort(); }
    static byte[] docx(String content) {
        try {
            var bytes = new ByteArrayOutputStream();
            try (var zip = new ZipOutputStream(bytes)) {
                for (var entry : Map.of("[Content_Types].xml", "<Types/>", "word/document.xml", "<document>" + content + "</document>").entrySet()) {
                    var zipEntry=new ZipEntry(entry.getKey());zipEntry.setTime(0);zip.putNextEntry(zipEntry); zip.write(entry.getValue().getBytes(UTF_8)); zip.closeEntry();
                }
            }
            return bytes.toByteArray();
        } catch (Exception e) { throw new RuntimeException(e); }
    }
    static String sign(Object body) throws Exception {
        var enc = Base64.getUrlEncoder().withoutPadding();
        String header = enc.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(UTF_8));
        String input = header + "." + enc.encodeToString(JSON.writeValueAsBytes(body));
        var mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(SECRET.getBytes(UTF_8), "HmacSHA256"));
        return input + "." + enc.encodeToString(mac.doFinal(input.getBytes(UTF_8)));
    }
    JsonNode upload() throws Exception {
        return mapper.readTree(mvc.perform(multipart("/api/office/documents")
                .file(new MockMultipartFile("file", "RFQ.docx", "application/octet-stream", ORIGINAL))
                .param("projectId", "RFQ-001").param("fileId", "FILE-1").param("sourceVersion", "V1"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
    }
    JsonNode session(JsonNode ref, boolean readOnly) throws Exception {
        return mapper.readTree(mvc.perform(post("/api/office/documents/" + ref.get("id").asText() + "/session")
                .header("X-Office-Access", ref.get("access").asText()).contentType("application/json")
                .content(mapper.writeValueAsBytes(Map.of("readOnly", readOnly, "userId", "SR-1", "userName", "销售"))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
    }
    @Test void uploadValidatesRealFormatsAndDoesNotLeakDocumentWithoutCapability() throws Exception {
        JsonNode ref = upload();
        String id = ref.get("id").asText();
        mvc.perform(get("/api/office/documents/" + id)).andExpect(status().isForbidden());
        mvc.perform(get("/api/office/documents/" + id + "/download").param("kind", "original")
                .header("X-Office-Access", ref.get("access").asText())).andExpect(content().bytes(ORIGINAL));
        mvc.perform(multipart("/api/office/documents").file(new MockMultipartFile("file", "fake.docx", "application/octet-stream", "not a docx".getBytes(UTF_8))))
                .andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/office/documents").file(new MockMultipartFile("file", "fake.pdf", "application/pdf", ORIGINAL)))
                .andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/office/documents").file(new MockMultipartFile("file", "huge.pdf", "application/pdf", new byte[1024 * 1024 + 1])))
                .andExpect(status().isPayloadTooLarge());
    }
    @Test void sessionIsSignedAndReadOnlyCannotEditOrComment() throws Exception {
        JsonNode ref = upload(), data = session(ref, true), config = data.get("config");
        assertThat(config.at("/document/permissions/edit").asBoolean()).isFalse();
        assertThat(config.at("/document/permissions/comment").asBoolean()).isFalse();
        assertThat(config.at("/editorConfig/mode").asText()).isEqualTo("view");
        assertThat(data.toString()).doesNotContain(SECRET);
        String token = config.get("token").asText();
        JsonNode signed = JSON.readTree(Base64.getUrlDecoder().decode(token.split("\\.")[1]));
        assertThat(signed.get("document")).isEqualTo(config.get("document"));
        assertThat(config.at("/document/url").asText()).contains("/api/office/content/", "ticket=");
    }
    @Test void saveIsDurableIdempotentAndPreservesOriginalAndForceSaveSession() throws Exception {
        JsonNode ref = upload(); String id = ref.get("id").asText(), access = ref.get("access").asText();
        String key = session(ref, false).at("/config/document/key").asText();
        var body = Map.of("key", key, "status", 6, "url", docsUrl() + "/cache/files/review.docx");
        String signed = sign(Map.of("payload", body));
        for (int i = 0; i < 2; i++) mvc.perform(post("/api/office/callback/" + id).header("Authorization", "Bearer " + signed)
                .contentType("application/json").content(mapper.writeValueAsBytes(body)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.error").value(0));
        assertThat(session(ref, false).at("/config/document/key").asText()).isEqualTo(key);
        mvc.perform(get("/api/office/documents/" + id).header("X-Office-Access", access)).andExpect(jsonPath("$.data.revision").value(1));
        mvc.perform(get("/api/office/documents/" + id + "/download").header("X-Office-Access", access).param("kind", "review"))
                .andExpect(content().bytes(REVIEW));
        mvc.perform(get("/api/office/documents/" + id + "/download").header("X-Office-Access", access).param("kind", "original"))
                .andExpect(content().bytes(ORIGINAL));
        var restored = new OfficeFileStore(properties, mapper);
        assertThat(restored.authorize(id, access).revision()).isEqualTo(1);
        var finalBody = Map.of("key", key, "status", 2, "url", docsUrl() + "/cache/files/review.docx");
        mvc.perform(post("/api/office/callback/" + id).header("Authorization", "Bearer " + sign(Map.of("payload", finalBody)))
                .contentType("application/json").content(mapper.writeValueAsBytes(finalBody))).andExpect(jsonPath("$.error").value(0));
        assertThat(session(ref, false).at("/config/document/key").asText()).isNotEqualTo(key);
        var late=Map.of("key",key,"status",6,"url",docsUrl()+"/cache/files/review.docx","userdata","late-unseen");
        mvc.perform(post("/api/office/callback/" + id).header("Authorization", "Bearer " + sign(Map.of("payload",late)))
                .contentType("application/json").content(mapper.writeValueAsBytes(late))).andExpect(jsonPath("$.error").value(1));
    }
    @Test void rejectsForgedTokenAndForeignSaveUrlWithoutChangingRevision() throws Exception {
        JsonNode ref = upload(); String id = ref.get("id").asText(), key = session(ref, false).at("/config/document/key").asText();
        var body = Map.of("key", key, "status", 6, "url", "http://example.com/cache/files/evil.docx");
        mvc.perform(post("/api/office/callback/" + id).header("Authorization", "Bearer invalid")
                .contentType("application/json").content(mapper.writeValueAsBytes(body))).andExpect(jsonPath("$.error").value(1));
        mvc.perform(post("/api/office/callback/" + id).header("Authorization", "Bearer " + sign(Map.of("payload", body)))
                .contentType("application/json").content(mapper.writeValueAsBytes(body))).andExpect(jsonPath("$.error").value(1));
        mvc.perform(get("/api/office/documents/" + id).header("X-Office-Access", ref.get("access").asText()))
                .andExpect(jsonPath("$.data.revision").value(0));
    }
    @Test void signedPublicDownloadOriginIsTranslatedToInternalDocumentService() throws Exception {
        JsonNode ref=upload();String key=session(ref,false).at("/config/document/key").asText();
        var body=Map.of("key",key,"status",6,"url","http://browser.invalid:8082/cache/files/review.docx");
        mvc.perform(post("/api/office/callback/"+ref.get("id").asText()).header("Authorization","Bearer "+sign(Map.of("payload",body)))
                .contentType("application/json").content(mapper.writeValueAsBytes(body)))
                .andExpect(jsonPath("$.error").value(0));
    }
    @Test void nonconsecutiveRetriedCallbackCannotRollBackNewerContent() throws Exception {
        JsonNode ref=upload();String id=ref.get("id").asText(),key=session(ref,false).at("/config/document/key").asText();
        for(String path:new String[]{"review.docx","newer.docx","review.docx"}){
            var body=Map.of("key",key,"status",6,"url",docsUrl()+"/cache/files/"+path);
            mvc.perform(post("/api/office/callback/"+id).header("Authorization","Bearer "+sign(Map.of("payload",body)))
                    .contentType("application/json").content(mapper.writeValueAsBytes(body))).andExpect(jsonPath("$.error").value(0));
        }
        mvc.perform(get("/api/office/documents/"+id+"/download").header("X-Office-Access",ref.get("access").asText()).param("kind","review"))
                .andExpect(content().bytes(docx("newer review")));
        assertThat(new OfficeFileStore(properties,mapper).authorize(id,ref.get("access").asText()).revision()).isEqualTo(2);
    }
}
