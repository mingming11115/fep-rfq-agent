package com.naura.rfq.model.vo;

import com.naura.rfq.model.entity.Requirement;

public record RequirementView(String id, String projectId, String documentId, String customerClauseNo,
        String sectionPath, String title, int level, String parentId, String originalText,
        String requirementText, String metricsJson, String conditionsText, String obligation,
        String extractionStatus, String reviewReasons, int sortOrder, Long version) {

    public static RequirementView of(Requirement requirement) {
        return new RequirementView(requirement.getId(), requirement.getProjectId(),
                requirement.getDocumentId(), requirement.getCustomerClauseNo(),
                requirement.getSectionPath(), requirement.getTitle(), requirement.getLevel(),
                requirement.getParentId(), requirement.getOriginalText(),
                requirement.getRequirementText(), requirement.getMetricsJson(),
                requirement.getConditionsText(), requirement.getObligation(),
                requirement.getExtractionStatus(), requirement.getReviewReasons(),
                requirement.getSortOrder(), requirement.getVersion());
    }
}
