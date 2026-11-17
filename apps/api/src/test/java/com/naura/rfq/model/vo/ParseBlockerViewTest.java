package com.naura.rfq.model.vo;

import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 重解析阻断摘要的文案与判定：409 提示与前端提示共用同一套描述，避免两处口径不一致。
 */
class ParseBlockerViewTest {

    @Test
    void 无下游产物时不构成阻断() {
        ParseBlockerView view = new ParseBlockerView(0, 0, 0, List.of());

        assertThat(view.blocked()).isFalse();
        assertThat(view.summary()).isEmpty();
    }

    @Test
    void 三类产物分别计数并拼出明细() {
        ParseBlockerView view = new ParseBlockerView(3, 1, 2, List.of("3.2", "4.1"));

        assertThat(view.blocked()).isTrue();
        assertThat(view.summary()).isEqualTo("应答 3 条、评审 1 条、定稿快照 2 份，涉及条款 3.2、4.1");
    }

    @Test
    void 没有条款号样本时只报计数() {
        ParseBlockerView view = new ParseBlockerView(0, 0, 1, List.of());

        assertThat(view.blocked()).isTrue();
        assertThat(view.summary()).isEqualTo("定稿快照 1 份");
    }

    @Test
    void 快照为空列表时不影响判定() {
        ParseBlockerView view = new ParseBlockerView(1, 0, 0, null);

        assertThat(view.blocked()).isTrue();
        assertThat(view.summary()).isEqualTo("应答 1 条");
    }
}
