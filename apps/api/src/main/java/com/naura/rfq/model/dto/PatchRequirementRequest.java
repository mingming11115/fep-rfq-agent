package com.naura.rfq.model.dto;

public record PatchRequirementRequest(Long version, String customerClauseNo, String title,
        String requirementText, String reviewReasons) {
}
