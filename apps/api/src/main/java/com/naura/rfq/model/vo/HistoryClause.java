package com.naura.rfq.model.vo;

import java.util.List;

public record HistoryClause(String key, String clauseNo, String section, String requirement, String answer,
        String conditions, String evidence, String feedback, String requirementAnchor,
        String answerAnchor, List<String> issues) { }
