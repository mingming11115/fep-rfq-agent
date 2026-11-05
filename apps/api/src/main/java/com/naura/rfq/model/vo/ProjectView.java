package com.naura.rfq.model.vo;

import com.naura.rfq.model.entity.Project;
import java.time.Instant;
import java.time.LocalDate;

public record ProjectView(String id, String code, String name, String customer, String buId,
        String ownerId, String stage, Long version, Instant createdAt, LocalDate deadline,
        boolean archived, String archivedFromStage, Instant archivedAt, String archivedBy, String archiveReason, String createdBy) {

    public static ProjectView of(Project project) {
        return new ProjectView(project.getId(), project.getCode(), project.getName(),
                project.getCustomer(), project.getBuId(), project.getOwnerId(),
                project.getStage(), project.getVersion(), project.getCreatedAt(),project.getDeadline(),
                project.isArchived(),project.getArchivedFromStage(),project.getArchivedAt(),project.getArchivedBy(),project.getArchiveReason(),project.getCreatedBy());
    }
}
