package com.naura.rfq.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc
class ProviderPipelineIntegrationTest {
    static final ObjectMapper JSON = new ObjectMapper();
    static final String SOURCE = "1.1 The pump shall support 2 MPa design pressure.";
    static volatile boolean llmFailure, ocrFailure;
    static final HttpServer SERVER;
    static {
        try {
            SERVER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            SERVER.createContext("/", exchange -> {
                try {
                    JsonNode request = JSON.readTree(exchange.getRequestBody());
                    boolean ocr = exchange.getRequestURI().getPath().equals("/ocr");
                    Object response;
                    if (ocr) {
                        assertThat(java.util.Base64.getDecoder().decode(request.path("imageBase64").asText()).length).isPositive();
                        response = Map.of("text", SOURCE);
                    } else {
                        JsonNode blocks = JSON.readTree(request.path("messages").path(1).path("content").asText());
                        var rows = new java.util.ArrayList<Map<String, Object>>();
                        for (JsonNode block : blocks) rows.add(Map.of("blockIndex", block.path("blockIndex").asInt(),
                            "originalText", block.path("text").asText(), "requirementText", "Design pressure 2 MPa"));
                        response = Map.of("choices", List.of(Map.of("finish_reason", "stop", "message", Map.of("content",
                            JSON.writeValueAsString(Map.of("requirements", rows, "ignoredBlockIndexes", List.of()))))));
                    }
                    byte[] bytes = JSON.writeValueAsBytes(response);
                    exchange.sendResponseHeaders((ocr ? ocrFailure : llmFailure) ? 503 : 200, bytes.length);
                    exchange.getResponseBody().write(bytes);
                } finally { exchange.close(); }
            }); SERVER.start();
        } catch (Exception e) { throw new RuntimeException(e); }
    }
    @AfterAll static void stop() { SERVER.stop(0); }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("rfq.parse.integrations.llm.enabled", () -> true);
        r.add("rfq.parse.integrations.llm.model", () -> "pipeline-test");
        r.add("rfq.parse.integrations.llm.url", () -> "http://127.0.0.1:" + SERVER.getAddress().getPort() + "/llm");
        r.add("rfq.parse.integrations.ocr.enabled", () -> true);
        r.add("rfq.parse.integrations.ocr.url", () -> "http://127.0.0.1:" + SERVER.getAddress().getPort() + "/ocr");
        r.add("rfq.storage-dir", () -> {
            try { return Files.createTempDirectory("rfq-provider-pipeline-").toString(); }
            catch (Exception e) { throw new RuntimeException(e); }
        });
    }
    @Autowired MockMvc mvc;
    String token;
    @BeforeEach void login() throws Exception {
        llmFailure = false; ocrFailure = false;
        token = JSON.readTree(mvc.perform(post("/api/rfq/auth/login").contentType("application/json")
            .content("{\"username\":\"sr01\",\"password\":\"Rfq@2026\"}"))
            .andReturn().getResponse().getContentAsString()).path("data").path("token").asText();
    }
    JsonNode uploadAndParse(String filename, byte[] bytes) throws Exception {
        String id = JSON.readTree(mvc.perform(multipart("/api/rfq/projects/RFQ-001/documents")
            .file(new MockMultipartFile("file", filename, "application/octet-stream", bytes))
            .header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString()).path("data").path("id").asText();
        return JSON.readTree(mvc.perform(post("/api/rfq/documents/" + id + "/parse-runs")
            .header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString()).path("data");
    }
    @Test void scanPassesThroughOcrModelAndDatabase() throws Exception {
        var out = new ByteArrayOutputStream();
        try (var pdf = new PDDocument()) { pdf.addPage(new PDPage()); pdf.save(out); }
        JsonNode result = uploadAndParse("scan.pdf", out.toByteArray());
        assertThat(result.path("extractor").asText()).isEqualTo("llm:pipeline-test");
        assertThat(result.path("requirementCount").asInt()).isEqualTo(1);
        JsonNode blocks = JSON.readTree(mvc.perform(get("/api/rfq/documents/" + result.path("documentId").asText() + "/blocks")
            .header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString()).path("data");
        assertThat(blocks.path(0).path("provenance").asText()).isEqualTo("ocr");
        assertThat(blocks.path(0).path("processingStatus").asText()).isEqualTo("NEEDS_REVIEW");
    }
    @Test void modelOutageUsesRulesAndPersistsDegradation() throws Exception {
        llmFailure = true;
        var out = new ByteArrayOutputStream();
        try (var doc = new XWPFDocument()) {
            doc.createParagraph().createRun().setText("1.1 设计压力应不低于 2 MPa。"); doc.write(out);
        }
        JsonNode result = uploadAndParse("source.docx", out.toByteArray());
        assertThat(result.path("extractor").asText()).isEqualTo("rule-based-v1");
        assertThat(result.path("message").asText()).contains("降级");
        assertThat(result.path("status").asText()).isEqualTo("partial");
        assertThat(result.path("requirementCount").asInt()).isEqualTo(1);
    }
    @Test void ocrOutageKeepsScanAsPartialWithoutInventedText() throws Exception {
        ocrFailure = true;
        var out = new ByteArrayOutputStream();
        try (var pdf = new PDDocument()) { pdf.addPage(new PDPage()); pdf.save(out); }
        JsonNode result = uploadAndParse("scan.pdf", out.toByteArray());
        assertThat(result.path("status").asText()).isEqualTo("partial");
        assertThat(result.path("message").asText()).contains("OCR 已降级");
        assertThat(result.path("requirementCount").asInt()).isZero();
    }
}
