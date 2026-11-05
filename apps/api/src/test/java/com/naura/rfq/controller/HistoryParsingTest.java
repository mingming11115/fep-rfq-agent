package com.naura.rfq.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.integration.history.HistoryExtractor;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.model.parse.RawBlock;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class HistoryParsingTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired HistoryExtractor extractor;

    List<RawBlock> table(List<List<String>> rows) {
        return List.of(RawBlock.table(0, rows, "技术要求", "body/0"));
    }
    @Test void combinesResponseColumnsAndKeepsConditionsWithoutCreatingAConclusionField() {
        var result = extractor.extract(table(List.of(
            List.of("条款编号", "客户要求", "应答结论", "历史答复", "适用条件"),
            List.of("3.2", "支持 300 mm 晶圆", "Conditional Comply", "需配置模块 S", "硅材料"),
            List.of("3.3", "定位精度 ≤5 μm", "", "", ""))), List.of());
        assertThat(result.clauses()).hasSize(2);
        var clause = result.clauses().get(0);
        assertThat(clause.requirement()).isEqualTo("支持 300 mm 晶圆");
        assertThat(clause.answer()).isEqualTo("Conditional Comply\n需配置模块 S");
        assertThat(clause.conditions()).isEqualTo("硅材料");
        assertThat(clause.requirementAnchor()).startsWith("main:body/0/r1");
        assertThat(result.clauses().get(1).answer()).isEmpty();
        assertThat(result.clauses().get(1).issues()).contains("缺少历史答复");
    }
    @Test void matchesCompanionOnlyForUniqueClauseNumbersAndRetainsUnmatchedResponses() {
        var primary = table(List.of(List.of("编号", "客户要求"), List.of("1", "支持自动上料"), List.of("2", "精度要求")));
        var companion = table(List.of(List.of("编号", "历史答复"), List.of("2", "需选配 X"), List.of("9", "无法对应")));
        var result = extractor.extract(primary, companion);
        assertThat(result.clauses().get(1).answer()).isEqualTo("需选配 X");
        assertThat(result.clauses().get(1).answerAnchor()).startsWith("answer:");
        assertThat(result.issues()).anyMatch(message -> message.contains("9") && message.contains("未关联"));
        var repeated = table(List.of(List.of("编号", "历史答复"), List.of("2", "答复甲"), List.of("2", "答复乙")));
        assertThat(extractor.extract(primary, repeated).clauses().get(1).answer()).isEmpty();
    }
    @Test void complyDataCellsAreNotMistakenForRepeatedTableHeaders() {
        var result = extractor.extract(table(List.of(List.of("No", "Requirement", "Compliance"),
            List.of("1", "The tool shall load automatically", "Comply"),
            List.of("2", "The tool shall align wafers", "Conditional Comply"))), List.of());
        assertThat(result.clauses()).hasSize(2);
        assertThat(result.clauses().get(0).answer()).isEqualTo("Comply");
        assertThat(result.clauses().get(1).requirement()).isEqualTo("The tool shall align wafers");
    }
    @Test void paragraphAnswersDoNotBecomeCustomerRequirementsAndImagesRemainVisible() {
        var result = extractor.extract(List.of(
            RawBlock.paragraph(0, "客户：客户 A", "", null, "body/0"),
            RawBlock.paragraph(1, "3.2 设备应支持自动上料。", "技术", null, "body/1"),
            RawBlock.paragraph(2, "答复：配置模块 S 后可以满足。", "技术", null, "body/2"),
            RawBlock.image(3, "待 OCR", "技术", "body/3")), List.of());
        assertThat(result.metadata()).containsEntry("customer", "客户 A");
        assertThat(result.clauses()).hasSize(1);
        assertThat(result.clauses().get(0).answer()).isEqualTo("配置模块 S 后可以满足。");
        assertThat(result.issues()).isNotEmpty();
    }
    String token() throws Exception {
        String response = mvc.perform(post("/api/rfq/auth/login").contentType("application/json")
            .content(json.writeValueAsString(Map.of("username", "tech01", "password", "Rfq@2026"))))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(response).path("data").path("token").asText();
    }
    byte[] docx() throws Exception {
        try (var doc = new XWPFDocument(); var bytes = new ByteArrayOutputStream()) {
            doc.createParagraph().createRun().setText("客户：客户 A");
            var table = doc.createTable(3, 3);
            String[][] rows = {{"编号", "客户要求", "历史答复"}, {"3.2", "支持自动上料", "需配置模块 S"}, {"3.3", "定位精度", ""}};
            for (int r = 0; r < 3; r++) for (int c = 0; c < 3; c++) table.getRow(r).getCell(c).setText(rows[r][c]);
            doc.write(bytes); return bytes.toByteArray();
        }
    }
    @Test void actualFileEndpointRequiresLoginAndBuAndParsesTechnicalUsersUpload() throws Exception {
        var file = new MockMultipartFile("file", "history.docx", "application/octet-stream", docx());
        mvc.perform(multipart("/api/rfq/history/parse").file(file)).andExpect(status().isUnauthorized());
        String token = token();
        mvc.perform(multipart("/api/rfq/history/parse").file(file).param("buId", "BU-OTHER")
            .header("Authorization", "Bearer " + token)).andExpect(status().isForbidden());
        mvc.perform(multipart("/api/rfq/history/parse").file(file).param("buId", "BU-FEP")
            .header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.metadata.customer").value("客户 A"))
            .andExpect(jsonPath("$.data.clauses[0].answer").value("需配置模块 S"))
            .andExpect(jsonPath("$.data.clauses.length()").value(2));
        mvc.perform(multipart("/api/rfq/history/parse").file(new MockMultipartFile("file", "bad.docx", "", "bad".getBytes()))
            .param("buId", "BU-FEP").header("Authorization", "Bearer " + token)).andExpect(status().isBadRequest());
    }
    @Test void nativePdfSeparatesNumberedClausesAndScansRemainVisible() throws Exception {
        String token = token();
        try (var pdf = new PDDocument(); var bytes = new ByteArrayOutputStream()) {
            var page = new PDPage(); pdf.addPage(page);
            try (var content = new PDPageContentStream(pdf, page)) {
                content.beginText(); content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.setLeading(18); content.newLineAtOffset(50, 700);
                for (String line : List.of("1.1 The tool shall support automatic loading.", "Answer: Comply with module S.", "1.2 The tool shall support alignment.")) {
                    content.showText(line); content.newLine();
                }
                content.endText();
            }
            pdf.save(bytes);
            mvc.perform(multipart("/api/rfq/history/parse").file(new MockMultipartFile("file", "history.pdf", "application/pdf", bytes.toByteArray()))
                .param("buId", "BU-FEP").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.clauses.length()").value(2))
                .andExpect(jsonPath("$.data.clauses[0].answer").value("Comply with module S."));
        }
        try (var pdf = new PDDocument(); var bytes = new ByteArrayOutputStream()) {
            pdf.addPage(new PDPage()); pdf.save(bytes);
            mvc.perform(multipart("/api/rfq/history/parse").file(new MockMultipartFile("file", "scan.pdf", "application/pdf", bytes.toByteArray()))
                .param("buId", "BU-FEP").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.issues").isNotEmpty()).andExpect(jsonPath("$.data.clauses").isEmpty());
        }
    }
}
