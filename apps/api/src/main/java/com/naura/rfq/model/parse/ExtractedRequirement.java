package com.naura.rfq.model.parse;

import java.util.List;

/**
 * Extractor output. Field names follow the technical design so an LLM-based
 * implementation can replace the rule-based one without touching persistence.
 * 抽取结果直接可用：抽取器不再产出复核状态，{@code reviewReasons} 仅作为提示随条款保存。
 */
public record ExtractedRequirement(
        int order,
        int blockIndex,
        String sectionPath,
        String customerClauseNo,
        String title,
        int level,
        String parentClauseNo,
        String originalText,
        String requirementText,
        String metricsJson,
        String conditionsText,
        String obligation,
        String reviewReasons,
        List<SourceRef> sourceRefs) {

    public ExtractedRequirement(int order, int blockIndex, String sectionPath, String customerClauseNo,
            String title, int level, String parentClauseNo, String originalText, String requirementText,
            String metricsJson, String conditionsText, String obligation, String reviewReasons) {
        this(order, blockIndex, sectionPath, customerClauseNo, title, level, parentClauseNo, originalText, requirementText,
                metricsJson, conditionsText, obligation, reviewReasons, null);
    }
}
