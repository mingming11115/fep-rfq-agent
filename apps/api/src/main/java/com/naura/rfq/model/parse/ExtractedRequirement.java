package com.naura.rfq.model.parse;

import java.util.List;

/**
 * Extractor output. Field names follow the technical design so an LLM-based
 * implementation can replace the rule-based one without touching persistence.
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
        String extractionStatus,
        String reviewReasons,
        List<SourceRef> sourceRefs) {

    public ExtractedRequirement(int order, int blockIndex, String sectionPath, String customerClauseNo,
            String title, int level, String parentClauseNo, String originalText, String requirementText,
            String metricsJson, String conditionsText, String obligation, String extractionStatus, String reviewReasons) {
        this(order, blockIndex, sectionPath, customerClauseNo, title, level, parentClauseNo, originalText, requirementText,
                metricsJson, conditionsText, obligation, extractionStatus, reviewReasons, null);
    }

    public static final String VALID = "VALID";
    public static final String NEEDS_REVIEW = "NEEDS_REVIEW";

    public boolean needsReview() {
        return NEEDS_REVIEW.equals(extractionStatus);
    }
}
