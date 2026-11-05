package com.naura.rfq.model.parse;

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
        String reviewReasons) {

    public static final String VALID = "VALID";
    public static final String NEEDS_REVIEW = "NEEDS_REVIEW";

    public boolean needsReview() {
        return NEEDS_REVIEW.equals(extractionStatus);
    }
}
