package com.naura.rfq.model.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One answerable customer requirement. original_text keeps the customer wording,
 * requirement_text keeps the normalised statement; the two are never merged.
 */
@Getter
@Setter
@NoArgsConstructor
public class Requirement {

    private String id;

    private String projectId;

    private String documentId;

    private String parseRunId;

    private String blockId;

    private String sectionPath;

    private String customerClauseNo;

    private String title;

    private String originalText;

    private String requirementText;

    private String metricsJson;

    private String extractionStatus = "VALID";

    private String reviewReasons;

    private String confirmationAssigneeId;
    private String confirmationAssignedBy;
    private Instant confirmationAssignedAt;
    private String confirmationAssignmentReason;

    /** 乐观锁版本号，insert 置 0，更新时由 updateWithVersion 原子自增。 */
    private Long version = 0L;

    private Instant createdAt = Instant.now();
}
