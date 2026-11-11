package com.naura.rfq.integration.parse;

import static org.assertj.core.api.Assertions.assertThat;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.config.properties.ParseIntegrationProperties;
import com.naura.rfq.model.parse.ExtractedRequirement;
import com.naura.rfq.model.parse.RawBlock;
import com.naura.rfq.model.parse.SourceRef;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;

class WordMarkdownExtractionTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void referencesUseOriginalWordPositionsAndRejectInventedAndMissingMarkers() throws Exception {
        var content = WordMarkdownReader.mapMarkdown("RFQX0END 正文\n| RFQX1END | 5 kg |\nRFQX2END RFQX2END", "RFQX",
                List.of(RawBlock.paragraph(0, "须支持自动上料", "", null, "body/2"),
                        RawBlock.paragraph(1, "额定负载 5 kg", "", null, "body/7/r3"),
                        RawBlock.paragraph(2, "额定工况", "", null, "body/8")));
        var output = json.readTree("""
                {"requirements":[
                  {"title":"自动上料","requirementText":"须在额定负载 5 kg 时支持自动上料","specification":"5 kg","sourceRefs":["S1","S0"]},
                  {"title":"待核对","requirementText":"核对运行工况","sourceRefs":["S2","S999"]}
                ],"ignoredSourceRefs":[]}
                """);
        var extractor = new WordMarkdownExtractor(new ParseIntegrationProperties(), new ParseHttpClient(json),
                new RuleBasedExtractor(json));
        var result = extractor.validate(output, content, "markitdown+llm:test");
        assertThat(result.requirements()).hasSize(2);
        var merged = result.requirements().get(0);
        assertThat(merged.sourceRefs()).containsExactly(
                new SourceRef("body/2", "须支持自动上料"),
                new SourceRef("body/7/r3", "额定负载 5 kg"));
        assertThat(merged.originalText()).isEqualTo("须支持自动上料\n额定负载 5 kg");
        assertThat(merged.requirementText()).isEqualTo("须在额定负载 5 kg 时支持自动上料");
        assertThat(json.readTree(merged.metricsJson()).path("specification").asText()).isEqualTo("5 kg");
        assertThat(result.requirements().get(1).extractionStatus()).isEqualTo(ExtractedRequirement.NEEDS_REVIEW);
        assertThat(result.requirements().get(1).sourceRefs()).isEmpty();
        assertThat(result.issues()).anyMatch(issue -> issue.contains("body/8"));
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "RFQ_MARKITDOWN_PYTHON", matches = ".+")
    void realMarkItDownKeepsRepeatedParagraphsTableRowsAndNotesIndividuallyAddressable(@TempDir Path temp) throws Exception {
        var path = temp.resolve("requirements.docx");
        try (var doc = new XWPFDocument(); var output = Files.newOutputStream(path)) {
            var first = doc.createParagraph();
            first.createRun().setText("须支持自动上料");
            var repeated = doc.createParagraph();
            repeated.createRun().setText("须支持自动上料");
            var footnote = doc.createFootnote();
            footnote.createParagraph().createRun().setText("限标准工况");
            first.addFootnoteReference(footnote);
            repeated.addFootnoteReference(footnote);
            var table = doc.createTable(2, 2);
            table.getRow(0).getCell(0).setText("项目");
            table.getRow(0).getCell(1).setText("规格");
            table.getRow(1).getCell(0).setText("额定负载");
            table.getRow(1).getCell(1).setText("5 kg");
            var control = doc.getDocument().getBody().addNewSdt().addNewSdtContent();
            control.addNewP().addNewR().addNewT().setStringValue("控件一");
            control.addNewP().addNewR().addNewT().setStringValue("控件二");
            doc.write(output);
        }
        byte[] original = Files.readAllBytes(path);
        var config = new ParseIntegrationProperties();
        config.getWordMarkdown().setPython(System.getenv("RFQ_MARKITDOWN_PYTHON"));
        config.getLlm().setEnabled(true);
        config.getLlm().setModel("test");
        var http = new ParseHttpClient(json);
        var reader = new WordMarkdownReader(config, new DocxBlockReader(new OcrClient(config, http)));
        var content = reader.read(path, 100);
        assertThat(content.issues()).isEmpty();
        assertThat(content.markdown()).contains("须支持自动上料", "5 kg", "限标准工况", "[S0]", "[S1]", "[S3]", "[S6]");
        assertThat(content.blocks().get(5).anchor()).isEqualTo("body/4");
        assertThat(Files.readAllBytes(path)).isEqualTo(original);
        var request = new AtomicReference<String>();
        var response = json.writeValueAsBytes(Map.of("choices", List.of(Map.of("message", Map.of("content", """
                    {"requirements":[{"title":"自动上料","requirementText":"标准工况下支持 5 kg 自动上料",
                    "sourceRefs":["S1","S3","S6"]}],"ignoredSourceRefs":["S0","S2","S4","S5"]}
                    """)))));
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/model", exchange -> {
            request.set(json.readTree(exchange.getRequestBody()).path("messages").path(1).path("content").asText());
            exchange.sendResponseHeaders(200, response.length);
            try (var output = exchange.getResponseBody()) {
                output.write(response);
            }
        });
        server.start();
        try {
            config.getLlm().setUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/model");
            var rules = new RuleBasedExtractor(json);
            var result = new WordMarkdownExtractor(config, http, rules).extract(content, "RUN");
            assertThat(request.get()).isEqualTo(content.markdown());
            assertThat(result.issues()).isEmpty();
            assertThat(result.requirements().get(0).sourceRefs()).containsExactly(
                    new SourceRef("body/1", "须支持自动上料"), new SourceRef("body/2/r1", "额定负载 5 kg"),
                    new SourceRef("footnote/0/0", "限标准工况"));
        } finally {
            server.stop(0);
        }
    }
}
