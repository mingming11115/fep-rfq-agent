package com.naura.rfq.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.mapper.RequirementMapper;
import com.naura.rfq.storage.DocumentStorage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
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

@SpringBootTest
@AutoConfigureMockMvc
class UploadParseIntegrationTest {
    static final Path ROOT;
    static { try { ROOT = Files.createTempDirectory("rfq-upload-parse-"); } catch (Exception e) { throw new RuntimeException(e); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("rfq.storage-dir", () -> ROOT.toString());
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired RequirementMapper requirements;
    @Autowired DocumentStorage storage;

    String token(String username) throws Exception {
        return data(mvc.perform(post("/api/rfq/auth/login").contentType("application/json")
            .content(json.writeValueAsString(java.util.Map.of("username", username, "password", "Rfq@2026"))))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("token").asText();
    }
    JsonNode data(String body) throws Exception { return json.readTree(body).path("data"); }
    JsonNode parse(String id, String token) throws Exception {
        return data(mvc.perform(post("/api/rfq/documents/" + id + "/parse-runs").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    String sample(String token) throws Exception {
        return data(mvc.perform(post("/api/rfq/projects/RFQ-001/documents/sample").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("id").asText();
    }
    @Test void uploadParseQueryRetryAndHumanEditProtection() throws Exception {
        String token = token("sr01"), id = sample(token);
        JsonNode result = parse(id, token);
        assertThat(result.path("requirementCount").asInt()).isPositive();
        JsonNode stored = data(mvc.perform(get("/api/rfq/parse-runs/" + result.path("id").asText())
            .header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(stored.path("extractor").asText()).isEqualTo("rule-based-v1");
        assertThat(parse(id, token).path("requirementCount").asInt()).isEqualTo(result.path("requirementCount").asInt());
        var requirement = requirements.findByDocumentIdOrderBySortOrder(id).get(0);
        mvc.perform(patch("/api/rfq/requirements/" + requirement.getId()).header("Authorization", "Bearer " + token)
            .contentType("application/json").content("{\"version\":0,\"requirementText\":\"人工保留内容\"}"))
            .andExpect(status().isOk());
        mvc.perform(post("/api/rfq/documents/" + id + "/parse-runs").header("Authorization", "Bearer " + token))
            .andExpect(status().isConflict());
        assertThat(requirements.findById(requirement.getId()).orElseThrow().getRequirementText()).isEqualTo("人工保留内容");
    }
    @Test void scanWithoutOcrIsPartialWithVisibleIssue() throws Exception {
        String token = token("sr01"); var out = new ByteArrayOutputStream();
        try (var pdf = new PDDocument()) { pdf.addPage(new PDPage()); pdf.save(out); }
        String id = data(mvc.perform(multipart("/api/rfq/projects/RFQ-001/documents")
            .file(new MockMultipartFile("file", "scan.pdf", "application/pdf", out.toByteArray()))
            .header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString()).path("id").asText();
        JsonNode result = parse(id, token);
        assertThat(result.path("status").asText()).isEqualTo("partial");
        assertThat(result.path("issueCount").asInt()).isPositive();
        assertThat(result.path("message").asText()).contains("OCR");
        mvc.perform(get("/api/rfq/documents/" + id + "/download").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk()).andExpect(content().bytes(out.toByteArray()));
        mvc.perform(get("/api/rfq/documents/" + id + "/download")).andExpect(status().isUnauthorized());
    }
    @Test void corruptRetryPreservesPreviousRequirements() throws Exception {
        String token = token("sr01"), id = sample(token);
        parse(id, token);
        var saved = requirements.findByDocumentIdOrderBySortOrder(id);
        Files.writeString(storage.resolve(id + "/source.docx"), "corrupt");
        assertThat(parse(id, token).path("status").asText()).isEqualTo("failed");
        assertThat(requirements.findByDocumentIdOrderBySortOrder(id)).extracting("id").containsExactlyElementsOf(saved.stream().map(r -> r.getId()).toList());
    }
    @Test void invalidFileDoesNotPersistAndTechnicalUserCannotUpload() throws Exception {
        String token = token("sr01");
        mvc.perform(multipart("/api/rfq/projects/RFQ-001/documents")
            .file(new MockMultipartFile("file", "fake.pdf", "application/pdf", "fake".getBytes()))
            .header("Authorization", "Bearer " + token)).andExpect(status().isBadRequest());
        mvc.perform(post("/api/rfq/projects/RFQ-001/documents/sample").header("Authorization", "Bearer " + token("tech01")))
            .andExpect(status().isForbidden());
    }
}
