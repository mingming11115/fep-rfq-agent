package com.naura.rfq.integration.parse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.config.properties.ParseIntegrationProperties;
import com.naura.rfq.model.parse.ExtractedRequirement;
import com.naura.rfq.model.parse.RawBlock;
import com.naura.rfq.model.parse.SourceRef;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

@ExtendWith(OutputCaptureExtension.class)
class WordMarkdownExtractionTest {
    private final ObjectMapper json = new ObjectMapper();

    @ParameterizedTest
    @ValueSource(strings = {"local-limit", "context-length", "output-length", "large-full", "auth-error"})
    void retriesLengthLimitsWithOverlappingSourcesAndKeepsOneBoundaryClause(String limit, CapturedOutput logs) throws Exception {
        String prefix = limit.equals("large-full") ? "长".repeat(101_000) : "";
        var content = WordMarkdownReader.mapMarkdown(prefix + """
                简介 RFQX0END

                设备必须自动上料 RFQX1END

                限标准工况 RFQX2END

                必须记录运行时间 RFQX3END
                """, "RFQX", List.of(
                RawBlock.paragraph(0, "简介", "", null, "body/0"),
                RawBlock.paragraph(1, "设备必须自动上料", "", null, "body/1"),
                RawBlock.paragraph(2, "限标准工况", "", null, "body/2"),
                RawBlock.paragraph(3, "必须记录运行时间", "", null, "body/3")));
        var config = new ParseIntegrationProperties(false);
        config.getLlm().setModel("test");
        config.getLlm().setBatchBlocks(2);
        if (limit.equals("local-limit")) {
            config.getWordMarkdown().setMaxChars(44);
        }
        var requests = new ArrayList<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/model", exchange -> {
            String markdown = json.readTree(exchange.getRequestBody()).path("messages").path(1).path("content").asText();
            requests.add(markdown);
            int status = 200;
            Object response;
            if (limit.equals("auth-error")) {
                status = 401;
                response = Map.of("error", Map.of("code", "invalid_api_key", "message", "Invalid API key"));
            } else if (markdown.equals(content.markdown()) && limit.equals("context-length")) {
                status = 400;
                response = Map.of("error", Map.of("code", "context_length_exceeded", "message", "Context length exceeded"));
            } else if (markdown.equals(content.markdown()) && limit.equals("output-length")) {
                response = Map.of("choices", List.of(Map.of("finish_reason", "length", "message", Map.of("content", "{"))));
            } else {
                var requirements = new ArrayList<Map<String, Object>>();
                var ignored = new ArrayList<String>();
                if (markdown.contains("[S1]") && markdown.contains("[S2]")) {
                    String requirement = !markdown.equals(content.markdown()) && markdown.contains("[S3]")
                            ? "设备在标准工况下须自动上料" : "标准工况下必须自动上料";
                    requirements.add(Map.of("requirementText", requirement, "sourceRefs", List.of("S1", "S2")));
                }
                if (markdown.contains("[S3]")) {
                    requirements.add(Map.of("requirementText", "必须记录运行时间", "sourceRefs", List.of("S3")));
                }
                if (markdown.contains("[S0]")) {
                    ignored.add("S0");
                }
                var output = json.writeValueAsString(Map.of("requirements", requirements, "ignoredSourceRefs", ignored));
                response = Map.of("choices", List.of(Map.of("finish_reason", "stop", "message", Map.of("content", output))));
            }
            var bytes = json.writeValueAsBytes(response);
            exchange.sendResponseHeaders(status, bytes.length);
            try (var output = exchange.getResponseBody()) {
                output.write(bytes);
            }
        });
        server.start();
        try {
            config.getLlm().setUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/model");
            var extractor = new WordMarkdownExtractor(config, new ParseHttpClient(json), new RuleBasedExtractor(json));
            if (limit.equals("auth-error")) {
                assertThatThrownBy(() -> extractor.extract(content, "RUN")).isInstanceOf(DocumentReadException.class);
                assertThat(requests).containsExactly(content.markdown());
                assertThat(logs.getAll())
                        .contains("document.parse.word.llm.failed parseRunId=RUN errorType=RemoteStatusException reason=HTTP 401")
                        .doesNotContain("Invalid API key", "设备必须自动上料");
                return;
            }
            var result = extractor.extract(content, "RUN");

            if (limit.equals("local-limit")) {
                assertThat(requests).doesNotContain(content.markdown());
            } else {
                assertThat(requests.get(0)).isEqualTo(content.markdown());
            }
            if (limit.equals("large-full")) {
                assertThat(requests).containsExactly(content.markdown());
            } else {
                assertThat(requests.stream().filter(request -> !request.equals(content.markdown()))
                        .filter(request -> request.contains("[S1]") && request.contains("[S2]"))).hasSize(2);
            }
            assertThat(result.issues()).isEmpty();
            assertThat(result.requirements()).extracting(ExtractedRequirement::requirementText)
                    .containsExactly("标准工况下必须自动上料", "必须记录运行时间");
            assertThat(result.requirements().get(0).sourceRefs()).containsExactly(
                    new SourceRef("body/1", "设备必须自动上料"), new SourceRef("body/2", "限标准工况"));
        } finally {
            server.stop(0);
        }
    }

    @Test
    void continuedTableBatchKeepsHeaderAndAssignsTheClauseToItsDataRow() throws Exception {
        String markdown = """
                | 项目 [S0] | 负载 (kg) |
                | --- | --- |
                | 甲 [S1] | 10 |
                | 乙 [S2] | 20 |
                | 丙 [S3] | 30 |
                | 丁 [S4] | 40 |
                """;
        var blocks = List.of(RawBlock.table(0, List.of(List.of("项目", "负载 (kg)")), "", "body/0/r0"),
                RawBlock.table(1, List.of(List.of("甲", "10")), "", "body/0/r1"),
                RawBlock.table(2, List.of(List.of("乙", "20")), "", "body/0/r2"),
                RawBlock.table(3, List.of(List.of("丙", "30")), "", "body/0/r3"),
                RawBlock.table(4, List.of(List.of("丁", "40")), "", "body/0/r4"));
        var content = new WordMarkdownReader.Content(markdown, blocks, java.util.Set.of(0, 1, 2, 3, 4), List.of());
        var config = new ParseIntegrationProperties(false);
        config.getLlm().setModel("test");
        config.getLlm().setUrl("http://unused.invalid/model");
        config.getLlm().setBatchBlocks(2);
        var http = new ParseHttpClient(json) {
            @Override public com.fasterxml.jackson.databind.JsonNode post(ParseIntegrationProperties.Endpoint settings,
                    Object body, String parseRunId) throws Exception {
                String text = json.valueToTree(body).path("messages").path(1).path("content").asText();
                if (text.equals(markdown)) {
                    return json.readTree("{\"choices\":[{\"finish_reason\":\"length\"}]}");
                }
                String output = text.contains("负载 (kg)") && text.contains("[S4]")
                        ? """
                          {"requirements":[{"requirementText":"丁的额定负载 40 kg","sourceRefs":["S0","S4"]}],"ignoredSourceRefs":[]}
                          """
                        : "{\"requirements\":[],\"ignoredSourceRefs\":[]}";
                return json.valueToTree(Map.of("choices", List.of(Map.of("finish_reason", "stop", "message", Map.of("content", output)))));
            }
        };
        var result = new WordMarkdownExtractor(config, http, new RuleBasedExtractor(json)).extract(content, "RUN");
        assertThat(result.requirements()).singleElement().satisfies(clause -> {
            assertThat(clause.blockIndex()).isEqualTo(4);
            assertThat(clause.sourceRefs()).extracting(SourceRef::anchor).containsExactly("body/0/r4", "body/0/r0");
        });
    }

    @Test
    void fullDocumentTableUsesTheDataRowAsPrimarySourceWhenTheHeaderIsCited() throws Exception {
        String markdown = """
                | Item [S0] | 额定负载 (kg) |
                | --- | --- |
                | [S1] | 5 |
                """;
        var blocks = List.of(RawBlock.table(0, List.of(List.of("Item", "额定负载 (kg)")), "", "body/0/r0"),
                RawBlock.table(1, List.of(List.of("", "5")), "", "body/0/r1"));
        var content = new WordMarkdownReader.Content(markdown, blocks, java.util.Set.of(0, 1), List.of());
        var output = json.readTree("""
                {"requirements":[{"customerClauseNo":"","title":"额定负载 (kg)",
                    "requirementText":"额定负载为 5 kg。","specification":"5","sourceRefs":["S1","S0"]}],
                    "ignoredSourceRefs":[]}
                """);
        var extractor = new WordMarkdownExtractor(new ParseIntegrationProperties(false), new ParseHttpClient(json),
                new RuleBasedExtractor(json));

        var result = extractor.validate(output, content, "markitdown+llm:test");

        assertThat(result.requirements()).singleElement().satisfies(clause -> {
            assertThat(clause.blockIndex()).isEqualTo(1);
            assertThat(clause.sourceRefs()).extracting(SourceRef::anchor).containsExactly("body/0/r1", "body/0/r0");
        });
    }

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
        var extractor = new WordMarkdownExtractor(new ParseIntegrationProperties(false), new ParseHttpClient(json),
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
        var config = new ParseIntegrationProperties(true);
        config.getWordMarkdown().setPython(System.getenv("RFQ_MARKITDOWN_PYTHON"));
        config.getLlm().setModel("test");
        var http = new ParseHttpClient(json);
        Path storageRoot = temp.resolve("rfq-files");
        var reader = new WordMarkdownReader(config, new DocxBlockReader(new OcrClient(config, http)), storageRoot.toString());
        var content = reader.read(path, 100, "RUN");
        assertThat(content.issues()).isEmpty();
        assertThat(content.markdown()).contains("须支持自动上料", "5 kg", "限标准工况", "[S0]", "[S1]", "[S3]", "[S6]");
        assertThat(content.blocks().get(5).anchor()).isEqualTo("body/4");
        assertThat(Files.readAllBytes(path)).isEqualTo(original);
        Path payloads = storageRoot.resolve("parse-payloads");
        assertThat(payloads).doesNotExist();
        config.getLlm().setLogPayload(true);
        var loggedContent = reader.read(path, 100, "RUN-PAYLOAD");
        Path payload = payloads.resolve("RUN-PAYLOAD.md");
        assertThat(payload).isRegularFile();
        assertThat(Files.readString(payload)).isEqualTo(loggedContent.markdown());
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
            var result = new WordMarkdownExtractor(config, http, rules).extract(loggedContent, "RUN-PAYLOAD");
            assertThat(request.get()).isEqualTo(Files.readString(payload));
            assertThat(result.issues()).isEmpty();
            assertThat(result.requirements().get(0).sourceRefs()).containsExactly(
                    new SourceRef("body/1", "须支持自动上料"), new SourceRef("body/2/r1", "额定负载 5 kg"),
                    new SourceRef("footnote/0/0", "限标准工况"));
        } finally {
            server.stop(0);
        }
    }
}
