package com.naura.rfq.domain;

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

    private Integer level = 1;

    private String parentId;

    private String originalText;

    private String requirementText;

    private String metricsJson;

    private String conditionsText;

    /** mandatory | recommended | unknown */
    private String obligation;

    private String extractionStatus = "VALID";

    private String reviewReasons;

    private Integer sortOrder = 0;

    /** 乐观锁版本号，insert 置 0，更新时由 updateWithVersion 原子自增。 */
    private Long version = 0L;

    private Instant createdAt = Instant.now();
}
