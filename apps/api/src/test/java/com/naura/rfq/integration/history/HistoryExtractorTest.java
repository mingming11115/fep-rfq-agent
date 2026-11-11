package com.naura.rfq.integration.history;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.config.properties.ParseIntegrationProperties;
import com.naura.rfq.integration.parse.DocxBlockReader;
import com.naura.rfq.integration.parse.HistoryModelExtractor;
import com.naura.rfq.integration.parse.HybridRequirementExtractor;
import com.naura.rfq.integration.parse.OcrClient;
import com.naura.rfq.integration.parse.ParseHttpClient;
import com.naura.rfq.integration.parse.RuleBasedExtractor;
import com.naura.rfq.model.parse.RawBlock;
import com.naura.rfq.model.vo.HistoryClause;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import static org.assertj.core.api.Assertions.tuple;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HistoryExtractorTest {
    private final ObjectMapper json = new ObjectMapper();
    private final RuleBasedExtractor rules = new RuleBasedExtractor(json);
    private final ParseIntegrationProperties properties = new ParseIntegrationProperties(false);
    private final HistoryExtractor history = withClient(new ParseHttpClient(json));

    private HistoryExtractor withClient(ParseHttpClient client) {
        return withClient(properties, client);
    }

    private HistoryExtractor withClient(ParseIntegrationProperties properties, ParseHttpClient client) {
        var model = new HybridRequirementExtractor(rules, properties, client, json);
        return new HistoryExtractor(rules, model, properties, new HistoryModelExtractor(properties, client, model, json));
    }

    @Test void historyRulesCanRunWithTheSharedModelEnabledButHistoryModelDisabled() {
        var properties = new ParseIntegrationProperties(true);
        properties.getHistory().setLlmEnabled(false);
        properties.getLlm().setModel("shared-test");
        var parser = withClient(properties, new ParseHttpClient(json) {
            @Override public JsonNode post(ParseIntegrationProperties.Endpoint settings, Object body, String runId) {
                throw new AssertionError("History must not call the disabled LLM");
            }
        });
        var result = parser.extract(List.of(RawBlock.paragraph(0, "1. 设备必须设置急停按钮。", "", null, "body/0")), List.of());
        assertThat(result.clauses()).extracting(HistoryClause::clauseNo).containsExactly("1");
    }

    @Test void historyModelCanExtractAnAnswerWithoutRulesOrTheSharedModelSwitch() {
        historySettings(false, true);
        properties.getLlm().setModel("history-test");
        var parser = withClient(new ParseHttpClient(json) {
            @Override public JsonNode post(ParseIntegrationProperties.Endpoint settings, Object body, String runId) throws Exception {
                var input = json.readTree(json.valueToTree(body).path("messages").path(1).path("content").asText());
                assertThat(input.path(4).path("textStartTwips").asInt()).isEqualTo(720);
                String reply = """
                    {"clauses":[{"source":1,"clauseNo":"7","title":"紧急停机",
                    "requirement":"设备须支持紧急停机","answer":"Not Applicable","answerSource":1},
                    {"source":3,"clauseNo":"9","title":"安全报警","requirement":"设备须记录安全报警。",
                    "answer":"Comply","answerSource":4}]}
                    """;
                return json.valueToTree(Map.of("choices", List.of(Map.of("message", Map.of("content", reply)))));
            }
        });
        var table = RawBlock.table(0, List.of(List.of("编号", "验收项目", "供应商填写"),
                List.of("7", "设备须支持紧急停机", "Not Applicable")), "", "body/0");
        var numbered = RawBlock.paragraph(1, "8. 设备必须提供说明书。", "", null, "body/1");
        var layout = new RawBlock.ParagraphLayout(720, 0, null, 0);
        var clause = RawBlock.wordParagraph(2, "9. 设备须记录安全报警。", "", "body/2", layout);
        var answer = RawBlock.wordParagraph(3, "=> Comply", "", "body/3", layout);

        var result = parser.extract(List.of(table, numbered, clause, answer), List.of());

        assertThat(result.clauses()).extracting(HistoryClause::clauseNo, HistoryClause::answer, HistoryClause::answerAnchor)
                .containsExactly(tuple("7", "Not Applicable", "main:body/0/r1"), tuple("9", "Comply", "main:body/3"));
    }

    @Test void historyRejectsParsingWhenBothExtractorsAreDisabled() {
        historySettings(false, false);
        assertThatThrownBy(() -> history.extract(List.of(), List.of())).hasMessageContaining("至少启用");
    }

    @ParameterizedTest
    @CsvSource({"2, 16000", "20, 390"})
    void historyModelCanMatchTheNextParagraphAcrossABatchBoundary(int maxBlocks, int maxChars) {
        historySettings(false, true);
        properties.getLlm().setModel("history-test");
        properties.getLlm().setBatchBlocks(maxBlocks);
        properties.getLlm().setBatchChars(maxChars);
        var parser = withClient(new ParseHttpClient(json) {
            @Override public JsonNode post(ParseIntegrationProperties.Endpoint settings, Object body, String runId) throws Exception {
                String content = json.valueToTree(body).path("messages").path(1).path("content").asText();
                var input = json.readTree(content);
                assertThat(input.size()).isLessThanOrEqualTo(maxBlocks);
                assertThat(content.length()).isLessThanOrEqualTo(maxChars);
                var clauses = json.createArrayNode();
                for (var source : input) {
                    switch (source.path("source").asInt()) {
                        case 0 -> clauses.addObject().put("source", 0).put("clauseNo", "1").put("requirement", "设备须提供说明书。");
                        case 1 -> {
                            var requirement = clauses.addObject().put("source", 1).put("clauseNo", "2")
                                    .put("requirement", "设备须支持紧急停机。");
                            if (input.findValuesAsText("text").contains("=> Comply")) {
                                requirement.put("answer", "Comply").put("answerSource", 2);
                            }
                        }
                        case 3 -> clauses.addObject().put("source", 3).put("clauseNo", "3").put("requirement", "设备须记录报警。");
                    }
                }
                String reply = json.createObjectNode().set("clauses", clauses).toString();
                return json.valueToTree(Map.of("choices", List.of(Map.of("message", Map.of("content", reply)))));
            }
        });
        var layout = new RawBlock.ParagraphLayout(720, 0, null, 0);
        var result = parser.extract(List.of(
                RawBlock.wordParagraph(0, "1. 设备须提供说明书。", "安全", "body/0", layout),
                RawBlock.wordParagraph(1, "2. 设备须支持紧急停机。", "安全", "body/1", layout),
                RawBlock.wordParagraph(2, "=> Comply", "安全", "body/2", layout),
                RawBlock.wordParagraph(3, "3. 设备须记录报警。", "安全", "body/3", layout)), List.of());

        assertThat(result.clauses()).extracting(HistoryClause::clauseNo, HistoryClause::answer, HistoryClause::answerAnchor)
                .containsExactly(tuple("1", "", ""), tuple("2", "Comply", "main:body/2"), tuple("3", "", ""));
    }

    @Test void historyModelFailureDoesNotUseDisabledRules() {
        historySettings(false, true);
        properties.getLlm().setModel("history-test");
        var parser = withClient(new ParseHttpClient(json) {
            @Override public JsonNode post(ParseIntegrationProperties.Endpoint settings, Object body, String runId)
                    throws java.io.IOException {
                throw new java.io.IOException("model unavailable");
            }
        });
        var source = RawBlock.paragraph(0, "1. 设备必须设置急停按钮。", "", null, "body/0");
        assertThatThrownBy(() -> parser.extract(List.of(source), List.of())).hasMessageContaining("LLM 未返回");
    }

    private void historySettings(boolean rulesEnabled, boolean llmEnabled) {
        var source = new MapConfigurationPropertySource(Map.of(
                "rfq.parse.integrations.history.rules-enabled", rulesEnabled,
                "rfq.parse.integrations.history.llm-enabled", llmEnabled));
        new Binder(source).bind("rfq.parse.integrations", Bindable.ofInstance(properties));
    }

    @Test void wordTabAlignsComplianceWithItsHeadingOrClause(@TempDir Path dir) throws Exception {
        var file = dir.resolve("aligned-responses.docx");
        try (var doc = new XWPFDocument(); var output = Files.newOutputStream(file)) {
            paragraph(doc, "1. 安全", "Heading1", 0, false);
            paragraph(doc, "1.1 设备应设置急停按钮。", null, 0, true);
            paragraph(doc, "1.2 防护门打开时设备必须停止。", null, 720, false);
            paragraph(doc, "→ Comply", null, 0, false);
            paragraph(doc, "1.3 设备应记录安全报警。", null, 0, true);
            paragraph(doc, "答复：Conditional Comply", null, 0, true);
            paragraph(doc, "1.4 设备应支持人工复位。", null, 0, true);
            paragraph(doc, "2. 搬运", "Heading1", 0, false);
            paragraph(doc, "2.1 设备应支持 300 mm 晶圆。", null, 720, false);
            paragraph(doc, "Comply，标准夹具支持。", null, 0, true);
            paragraph(doc, "2.2 设备应记录搬运次数。", null, 0, true);
            doc.write(output);
        }
        var blocks = new DocxBlockReader(new OcrClient(properties, new ParseHttpClient(json))).read(file);
        var result = history.extract(blocks, List.of());
        assertThat(result.clauses()).extracting(HistoryClause::clauseNo, HistoryClause::answer, HistoryClause::answerAnchor)
                .containsExactly(tuple("1.1", "Comply", "main:body/3"), tuple("1.2", "Comply", "main:body/3"),
                        tuple("1.3", "Conditional Comply", "main:body/5"), tuple("1.4", "Comply", "main:body/3"),
                        tuple("2.1", "Comply，标准夹具支持。", "main:body/9"), tuple("2.2", "", ""));
        assertThat(result.issues()).isEmpty();
    }

    @Test void wordTabAlignsEqualsArrowAnswers(@TempDir Path dir) throws Exception {
        var file = dir.resolve("equals-arrow-responses.docx");
        try (var doc = new XWPFDocument(); var output = Files.newOutputStream(file)) {
            paragraph(doc, "1. 安全", "Heading1", 0, false);
            paragraph(doc, "1.1 设备应设置急停按钮。", null, 720, false);
            paragraph(doc, "=> Comply", null, 0, false);
            paragraph(doc, "2. 搬运", "Heading1", 0, false);
            paragraph(doc, "2.1 设备应支持自动搬运。", null, 720, false);
            paragraph(doc, "=> Not Applicable", null, 0, true);
            paragraph(doc, "2.2 设备应记录搬运次数。", null, 720, false);
            paragraph(doc, "\\=> Comply", null, 0, true);
            doc.write(output);
        }
        var blocks = new DocxBlockReader(new OcrClient(properties, new ParseHttpClient(json))).read(file);
        var result = history.extract(blocks, List.of());
        assertThat(result.clauses()).extracting(HistoryClause::clauseNo, HistoryClause::answer, HistoryClause::answerAnchor)
                .containsExactly(tuple("1.1", "Comply", "main:body/2"),
                        tuple("2.1", "Not Applicable", "main:body/5"), tuple("2.2", "Comply", "main:body/7"));
        assertThat(result.issues()).isEmpty();
    }

    private void paragraph(XWPFDocument doc, String text, String style, int indent, boolean tab) {
        var paragraph = doc.createParagraph();
        if (style != null) {
            paragraph.setStyle(style);
        }
        paragraph.setIndentationLeft(indent);
        var run = paragraph.createRun();
        if (tab) {
            run.addTab();
        }
        run.setText(text);
    }

    @Test void usesTheNormalModelPromptWithOnlyCustomerColumnsAndRetainsTheOriginalAnswer() throws Exception {
        historySettings(true, true);
        properties.getLlm().setModel("test-model");
        var table = RawBlock.table(0, List.of(List.of("编号", "客户要求", "历史答复"),
                List.of("3", "设备应支持 300 mm 晶圆。", "Comply（供应商原文）")), "", "body/1");
        var parser = withClient(new ParseHttpClient(json) {
            @Override public JsonNode post(ParseIntegrationProperties.Endpoint settings, Object body, String runId) throws Exception {
                var request = json.valueToTree(body);
                String prompt = request.at("/messages/0/content").asText();
                String input = request.at("/messages/1/content").asText();
                assertThat(prompt).contains("ignoredBlockIndexes", "specification");
                assertThat(input).contains("设备应支持 300 mm 晶圆。").doesNotContain("供应商原文", "历史答复");
                var response = json.createObjectNode();
                response.putArray("choices").addObject().putObject("message").put("content", """
                        {"requirements":[{"blockIndex":0,"originalText":"3 | 设备应支持 300 mm 晶圆。",
                          "item":"晶圆尺寸","description":"支持直径 300 mm 的晶圆","specification":"300 mm"}],
                         "ignoredBlockIndexes":[]}
                        """);
                return response;
            }
        });
        var clause = json.valueToTree(parser.extract(List.of(table), List.of()).clauses().get(0));
        assertThat(clause.path("title").asText()).isEqualTo("晶圆尺寸");
        assertThat(clause.path("requirementText").asText()).isEqualTo("支持直径 300 mm 的晶圆");
        assertThat(clause.path("answer").asText()).isEqualTo("Comply（供应商原文）");
        assertThat(clause.path("answerAnchor").asText()).isEqualTo("main:body/1/r1");
    }

    @Test void extractsCustomerFieldsSeparatelyFromResponseColumns() throws Exception {
        var header = List.of("No", "项目Item", "规格", "Rev", "Description");
        var customer = List.of("3", "供电 Power Supply", "220 V / 50 Hz", "A", "控制柜应支持单相 AC 输入。");
        var normal = rules.extract(List.of(RawBlock.table(0, List.of(header, customer), "技术规格", "body/1"))).get(0);
        var table = RawBlock.table(0, List.of(
                List.of("No", "项目Item", "规格", "Rev", "Description", "供应商应答", "适用条件"),
                List.of("3", "供电 Power Supply", "220 V / 50 Hz", "A", "控制柜应支持单相 AC 输入。",
                        "Comply，另有 380 V 选配。", "需模块 S")),
                "技术规格", "body/1");

        var parsed = history.extract(List.of(table), List.of());
        assertThat(parsed.clauses()).hasSize(1);
        var clause = json.valueToTree(parsed.clauses().get(0));
        assertThat(clause.path("customerClauseNo").asText()).isEqualTo(normal.customerClauseNo());
        assertThat(clause.path("sectionPath").asText()).isEqualTo(normal.sectionPath());
        assertThat(clause.path("title").asText()).isEqualTo(normal.title());
        assertThat(clause.path("originalText").asText()).isEqualTo(normal.originalText());
        assertThat(clause.path("requirementText").asText()).isEqualTo("控制柜应支持单相 AC 输入。");
        assertThat(clause.path("requirement").asText()).isEqualTo(clause.path("requirementText").asText());
        var metrics = json.readTree(clause.path("metricsJson").asText());
        assertThat(metrics).isEqualTo(json.readTree(normal.metricsJson()));
        assertThat(clause.path("obligation").asText()).isEqualTo(normal.obligation());
        assertThat(clause.path("conditionsText").isNull()).isTrue();
        assertThat(clause.path("answer").asText()).isEqualTo("Comply，另有 380 V 选配。");
        assertThat(clause.path("conditions").asText()).isEqualTo("需模块 S");
        assertThat(clause.path("answerAnchor").asText()).isEqualTo("main:body/1/r1");
    }

    @Test void modelSelectsHistoricalAnswerCellsWithoutRewritingTheirContent() {
        properties.getHistory().setLlmEnabled(true);
        properties.getLlm().setModel("test-model");
        var requirement = "上料模块须支持 300 mm 硅晶圆，并兼容标准 FOUP。";
        var table = RawBlock.table(0, List.of(List.of("No", "项目Item", "规格", "Description", "Rev"),
                List.of("1", "晶圆尺寸 Wafer Size", "300 mm", requirement, "Comply\n使用模块 S。"),
                List.of("2", "供电", "220 V", "控制柜应支持单相 AC 输入。", "R2"),
                List.of("3", "报警", "", "设备应记录报警。", "Not Comply，需选配。")), "技术规格", "body/1");
        var unusualHeader = RawBlock.table(1, List.of(List.of("No", "Description", "Factory"),
                List.of("4", "设备应提供搬运模块。", "Included with module T.")), "技术规格", "body/2");
        var parser = withClient(new ParseHttpClient(json) {
            @Override public JsonNode post(ParseIntegrationProperties.Endpoint settings, Object body, String runId) throws Exception {
                var messages = json.valueToTree(body).path("messages");
                if (!messages.get(0).path("content").asText().contains("历史答复")) {
                    return modelResponse("""
                            {"requirements":[],"ignoredBlockIndexes":[0,1,2,3]}
                            """);
                }
                var rows = json.readTree(messages.get(1).path("content").asText());
                assertThat(rows).hasSize(3);
                assertThat(rows.at("/0/requirement").asText()).isEqualTo(requirement);
                assertThat(rows.at("/0/candidates/0/header").asText()).isEqualTo("Rev");
                assertThat(rows.at("/0/candidates/0/text").asText()).isEqualTo("Comply\n使用模块 S。");
                return modelResponse("""
                        {"answers":[{"anchor":"main:body/1/r1","columnIndex":4},
                          {"anchor":"main:body/1/r3","columnIndex":4},{"anchor":"main:body/2/r1","columnIndex":2}]}
                        """);
            }
        });

        var clauses = parser.extract(List.of(table, unusualHeader), List.of()).clauses();

        assertThat(clauses).extracting(HistoryClause::clauseNo, HistoryClause::answer, HistoryClause::answerAnchor)
                .containsExactly(tuple("1", "Comply\n使用模块 S。", "main:body/1/r1"), tuple("2", "", ""),
                        tuple("3", "Not Comply，需选配。", "main:body/1/r3"),
                        tuple("4", "Included with module T.", "main:body/2/r1"));
        assertThat(clauses.get(0).requirement()).isEqualTo(requirement);
        assertThat(clauses.get(0).issues()).doesNotContain("缺少历史答复");
        assertThat(clauses.get(1).customerRequirement().originalText()).contains("R2");
    }

    @Test void rejectsModelSelectionsOutsideEligibleCellsAndRetainsKnownAnswers() {
        properties.getHistory().setLlmEnabled(true);
        properties.getLlm().setModel("test-model");
        var ambiguous = RawBlock.table(0, List.of(List.of("No", "Description", "Rev"),
                List.of("1", "设备应支持晶圆。", "Comply")), "", "body/1");
        var explicit = RawBlock.table(1, List.of(List.of("No", "Description", "应答结论"),
                List.of("2", "设备应记录报警。", "Not Comply")), "", "body/2");
        var parser = withClient(new ParseHttpClient(json) {
            @Override public JsonNode post(ParseIntegrationProperties.Endpoint settings, Object body, String runId) {
                var prompt = json.valueToTree(body).at("/messages/0/content").asText();
                return modelResponse(prompt.contains("历史答复")
                        ? """
                          {"answers":[{"anchor":"main:body/1/r1","columnIndex":1}]}
                          """
                        : """
                          {"requirements":[],"ignoredBlockIndexes":[0,1]}
                          """);
            }
        });

        var result = parser.extract(List.of(ambiguous, explicit), List.of());

        assertThat(result.clauses()).extracting(HistoryClause::answer).containsExactly("", "Not Comply");
        assertThat(result.issues()).anyMatch(issue -> issue.contains("历史答复模型批次"));
    }

    private JsonNode modelResponse(String content) {
        var response = json.createObjectNode();
        response.putArray("choices").addObject().putObject("message").put("content", content);
        return response;
    }

    @Test void givesTheExplicitAnswerColumnPriorityOverRev() {
        var table = RawBlock.table(0, List.of(List.of("No", "Description", "Rev", "应答结论"),
                List.of("1", "设备应支持晶圆。", "Comply", "Not Comply"),
                List.of("2", "设备应记录报警。", "Comply", "")), "", "body/1");

        assertThat(history.extract(List.of(table), List.of()).clauses()).extracting(HistoryClause::answer)
                .containsExactly("Not Comply", "");
    }

    @Test void preservesNumberedParagraphSourceAndCompanionAnswer() {
        var original = "2.1 设备应支持 300 mm 晶圆。";
        var primary = RawBlock.paragraph(0, original, "技术规格", null, "p0");
        var answer = RawBlock.paragraph(0, "2.1 已验证", "", null, "p0");
        var clause = json.valueToTree(history.extract(List.of(primary), List.of(answer)).clauses().get(0));
        assertThat(clause.path("originalText").asText()).isEqualTo(original);
        assertThat(clause.path("requirementText").asText()).isEqualTo("设备应支持 300 mm 晶圆。");
        assertThat(clause.path("level").asInt()).isEqualTo(2);
        assertThat(clause.path("parentClauseNo").asText()).isEqualTo("2");
        assertThat(clause.path("answer").asText()).isEqualTo("已验证");
        assertThat(clause.path("answerAnchor").asText()).isEqualTo("answer:p0");
    }

    @Test void modelFailureKeepsTheRuleResultAndCompanionAnswer() {
        properties.getHistory().setLlmEnabled(true);
        properties.getLlm().setModel("test-model");
        var parser = withClient(new ParseHttpClient(json) {
            @Override public JsonNode post(ParseIntegrationProperties.Endpoint settings, Object body, String runId) {
                throw new IllegalStateException("test failure");
            }
        });
        var primary = RawBlock.paragraph(0, "2.1 设备应支持 300 mm 晶圆。", "", null, "p0");
        var answer = RawBlock.paragraph(0, "2.1 已验证", "", null, "p0");
        var result = parser.extract(List.of(primary), List.of(answer));
        assertThat(result.issues()).anyMatch(issue -> issue.contains("已降级规则抽取"));
        assertThat(result.clauses()).singleElement().satisfies(clause -> {
            assertThat(clause.requirement()).isEqualTo("设备应支持 300 mm 晶圆。");
            assertThat(clause.answer()).isEqualTo("已验证");
        });
    }
}
