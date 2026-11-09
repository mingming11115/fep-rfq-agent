package com.naura.rfq.service;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class HistoryCapabilityExtractionTest {
    @Test void extractsOnlyExplicitNamedBoundsWithoutInferringFromNarrative() {
        var metrics = HistoryCapabilityExtraction.fromAnswer("支持5套工装\n定位精度：≤ 0.005 mm\n流量：不低于 30 L/min", "硅材料");
        assertThat(metrics).hasSize(2);
        assertThat(metrics.get(0).upper()).isEqualTo("0.005");
        assertThat(metrics.get(0).conditions()).isEqualTo("硅材料");
        assertThat(metrics.get(1).lower()).isEqualTo("30");
        assertThat(metrics.get(1).unit()).isEqualTo("L/min");
    }
}
