package com.naura.rfq.integration.history;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.integration.parse.RuleBasedExtractor;
import com.naura.rfq.model.parse.RawBlock;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class HistoryExtractorTest {
    private final ObjectMapper json = new ObjectMapper();
    private final RuleBasedExtractor rules = new RuleBasedExtractor(json);
    private final HistoryExtractor history = new HistoryExtractor(rules);

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
}
