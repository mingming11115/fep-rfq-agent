package com.naura.rfq.model.vo;

import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.model.parse.SourceRef;
import java.util.List;

public record RequirementView(String id, String projectId, String documentId, String customerClauseNo,
        String sectionPath, String title, String originalText, String requirementText, String metricsJson,
        String extractionStatus, String reviewReasons, Long version,
        String confirmationAssigneeId, List<SourceRef> sourceRefs) {

    public static RequirementView of(Requirement requirement) {
        return new RequirementView(requirement.getId(), requirement.getProjectId(),
                requirement.getDocumentId(), requirement.getCustomerClauseNo(),
                requirement.getSectionPath(), requirement.getTitle(), requirement.getOriginalText(),
                requirement.getRequirementText(), requirement.getMetricsJson(),
                requirement.getExtractionStatus(), requirement.getReviewReasons(),
                requirement.getVersion(), requirement.getConfirmationAssigneeId(),
                SourceRef.decode(requirement.getSourceRefsJson()));
    }
}
