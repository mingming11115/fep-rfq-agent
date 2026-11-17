package com.naura.rfq.model.vo;

import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 重解析影响范围摘要的文案：前端「会保留哪些应答」的提示与服务端描述共用同一套口径。
 */
class ParseBlockerViewTest {

    @Test
    void 无下游产物时摘要为空() {
        ParseBlockerView view = new ParseBlockerView(0, 0, 0, 0, List.of());

        assertThat(view.summary()).isEmpty();
    }

    @Test
    void 三类产物分别计数并拼出明细() {
        ParseBlockerView view = new ParseBlockerView(3, 1, 2, 1, List.of("3.2", "4.1"));

        assertThat(view.summary()).isEqualTo("应答 3 条、评审 1 条、定稿快照 2 份、人工修正 1 条，涉及条款 3.2、4.1");
    }

    @Test
    void 没有条款号样本时只报计数() {
        ParseBlockerView view = new ParseBlockerView(0, 0, 1, 0, List.of());

        assertThat(view.summary()).isEqualTo("定稿快照 1 份");
    }

    @Test
    void 快照为空列表时不影响摘要() {
        ParseBlockerView view = new ParseBlockerView(1, 0, 0, 0, null);

        assertThat(view.summary()).isEqualTo("应答 1 条");
    }

    @Test
    void 只有人工修正时也能拼出明细() {
        ParseBlockerView view = new ParseBlockerView(0, 0, 0, 2, List.of());

        assertThat(view.summary()).isEqualTo("人工修正 2 条");
    }
}
