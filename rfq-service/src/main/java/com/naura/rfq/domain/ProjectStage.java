package com.naura.rfq.domain;

import java.util.Arrays;

public enum ProjectStage {
    DRAFT, PARSING, REVIEWING, APPROVED, EXPORTED, CANCELLED;

    public static boolean isActive(String stage) {
        return Arrays.stream(values()).anyMatch(value->value!=CANCELLED && value.name().equals(stage));
    }
}
