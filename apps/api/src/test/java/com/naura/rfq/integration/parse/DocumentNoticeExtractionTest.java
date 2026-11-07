package com.naura.rfq.integration.parse;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.model.parse.RawBlock;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class DocumentNoticeExtractionTest {
    static final String NOTICE = "本文件用于 RFQ 系统上传及应答流程测试。采购方、设备参数和商务条件均为演示设定。请供应商逐条填写应答，说明满足情况、适用条件、证据及偏离。";
    final RuleBasedExtractor extractor = new RuleBasedExtractor(new ObjectMapper());

    @Test void skipsDemoPreambleWithOrWithoutNumbering() {
        for (String text : List.of(NOTICE, "1. " + NOTICE, "本文件仅供 RFQ 上传及应答流程测试使用。")) {
            assertThat(extractor.extract(List.of(paragraph(text)))).as(text).isEmpty();
        }
    }

    @Test void skipsNoticeInTableButPreservesActualRequirement() {
        var block = RawBlock.table(0, List.of(List.of("条款要求"), List.of(NOTICE), List.of("设备必须提供独立的安全保护装置。")), "", "table0");
        assertThat(extractor.extract(List.of(block))).singleElement()
            .satisfies(r -> assertThat(r.originalText()).isEqualTo("设备必须提供独立的安全保护装置。"));
    }

    @Test void preservesTechnicalCommercialAndFormalResponseRequirements() {
        for (String text : List.of("设备的设计压力应不低于 2 MPa，并提供测试报告。",
                "供应商应在合同签订后 30 天内交付设备，并承担运输费用。",
                "供应商应逐条填写应答，说明满足情况、适用条件、证据及偏离。",
                NOTICE + "设备应在 30 天内交付，并提供安全测试报告。")) {
            assertThat(extractor.extract(List.of(paragraph(text)))).as(text).singleElement()
                .satisfies(r -> assertThat(r.originalText()).isEqualTo(text));
        }
    }

    private RawBlock paragraph(String text) {
        return RawBlock.paragraph(0, text, "", null, "p0");
    }
}
