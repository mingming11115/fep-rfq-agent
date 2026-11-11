package com.naura.rfq.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.mapper.RequirementMapper;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.util.UUID;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"rfq.demo-data.enabled=true", "rfq.match.worker-enabled=false"})
@AutoConfigureMockMvc
class SelectionExtractionIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired RequirementMapper requirements;
    @Autowired JdbcTemplate jdbc;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) throws Exception {
        String storage = Files.createTempDirectory("rfq-selection-").toString();
        registry.add("rfq.storage-dir", () -> storage);
    }

    String token(String username) throws Exception {
        return data(mvc.perform(post("/api/rfq/auth/login").contentType("application/json")
            .content(json.createObjectNode().put("username", username).put("password", "Rfq@2026").toString()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("token").asText();
    }

    JsonNode data(String body) throws Exception { return json.readTree(body).path("data"); }

    @Test void selectionExtractionPreviewsAndKeepsConfirmedCandidatesOnReparse() throws Exception {
        String token = token("mysql_sr");
        String projectId = data(mvc.perform(get("/api/rfq/projects").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("list").get(0).path("id").asText();
        String original = "8.1 The equipment shall include an emergency stop.\n8.2 The supplier shall provide operator training.";
        var output = new ByteArrayOutputStream();
        try (var word = new XWPFDocument()) {
            word.createParagraph().createRun().setText("Selection test " + UUID.randomUUID());
            original.lines().forEach(line -> word.createParagraph().createRun().setText(line));
            word.write(output);
        }
        String id = data(mvc.perform(multipart("/api/rfq/projects/" + projectId + "/documents")
            .file(new MockMultipartFile("file", "selection.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", output.toByteArray()))
            .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("id").asText();
        String documentPath = "/api/rfq/documents/" + id;
        var selected = json.createObjectNode()
            .put("text", original)
            .put("wordRange", "1:0-2:" + original.lines().toList().get(1).length());
        var fabricated = selected.deepCopy().put("text", "8.1 The equipment shall ship with a fabricated warranty.");
        mvc.perform(post(documentPath + "/selection-extraction")
            .header("Authorization", "Bearer " + token).contentType("application/json")
            .content(fabricated.toString())).andExpect(status().isConflict());
        JsonNode preview = data(mvc.perform(post(documentPath + "/selection-extraction")
            .header("Authorization", "Bearer " + token).contentType("application/json")
            .content(selected.toString())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(preview.path("candidates").size()).isEqualTo(2);
        assertThat(requirements.findByDocumentIdOrderBySource(id)).isEmpty();

        var save = json.createObjectNode();
        save.set("selection", selected);
        save.set("candidates", preview.path("candidates"));
        var outside = save.deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) outside.get("selection")).put("wordRange", "4:0-5:20");
        mvc.perform(post(documentPath + "/selection-requirements")
            .header("Authorization", "Bearer " + token).contentType("application/json")
            .content(outside.toString())).andExpect(status().isConflict());
        JsonNode result = data(mvc.perform(post(documentPath + "/selection-requirements")
            .header("Authorization", "Bearer " + token).contentType("application/json")
            .content(save.toString())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(result.size()).isEqualTo(2);
        assertThat(result.get(0).path("sourceRefs").get(0).path("quote").asText())
            .contains("emergency stop");
        assertThat(result.get(0).path("sourceRefs").get(0).path("anchor").asText())
            .isEqualTo("selection:word:" + selected.path("wordRange").asText());
        mvc.perform(post(documentPath + "/selection-requirements")
            .header("Authorization", "Bearer " + token).contentType("application/json")
            .content(save.toString())).andExpect(status().isOk());
        assertThat(requirements.findByDocumentIdOrderBySource(id)).hasSize(2);

        String selectedId = result.get(0).path("id").asText();
        String currentRun = jdbc.queryForObject(
            "select id from requirement_match_run where requirement_id=? and current_run=1", String.class, selectedId);
        mvc.perform(post(documentPath + "/parse-runs").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk());
        assertThat(requirements.findByDocumentIdOrderBySource(id))
            .extracting(com.naura.rfq.model.entity.Requirement::getId)
            .containsExactlyInAnyOrder(selectedId, result.get(1).path("id").asText());
        assertThat(jdbc.queryForObject("select id from requirement_match_run where requirement_id=? and current_run=1",
            String.class, selectedId)).isEqualTo(currentRun);
    }

}
