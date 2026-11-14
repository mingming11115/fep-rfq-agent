package com.naura.rfq.integration.parse;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.model.parse.RawBlock;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class TableRowSourceRefTest {
    final RuleBasedExtractor extractor = new RuleBasedExtractor(new ObjectMapper());

    @Test void tableRowsCarryRowLevelSourceRefs() {
        var block = RawBlock.table(0, List.of(
                List.of("项目 Item", "规格 Spec"),
                List.of("额定负载", "5 kg"),
                List.of("噪声", "≤ 65 dB")), "", "body/7");

        var rows = extractor.extractWord(List.of(block));

        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).sourceRefs()).singleElement().satisfies(ref -> {
            assertThat(ref.anchor()).isEqualTo("body/7/r1");
            assertThat(ref.quote()).isEqualTo("额定负载 5 kg");
        });
        assertThat(rows.get(1).sourceRefs()).singleElement()
                .satisfies(ref -> assertThat(ref.anchor()).isEqualTo("body/7/r2"));
    }

    @Test void missingTableAnchorKeepsQuoteFallback() {
        var block = RawBlock.table(0, List.of(List.of("额定负载", "5 kg")), "", null);

        var rows = extractor.extractWord(List.of(block));

        assertThat(rows).singleElement().satisfies(row -> assertThat(row.sourceRefs()).isNull());
    }
}
