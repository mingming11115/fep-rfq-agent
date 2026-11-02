package com.naura.rfq.domain;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ParseRun {

    public static final String QUEUED = "queued";
    public static final String RUNNING = "running";
    public static final String COMPLETED = "completed";
    public static final String PARTIAL = "partial";
    public static final String FAILED = "failed";

    private String id;

    private String documentId;

    private String status;

    private Integer totalBlocks = 0;

    private Integer processedBlocks = 0;

    private Integer requirementCount = 0;

    private Integer issueCount = 0;

    private String message;

    private String extractor = "none";

    private Instant startedAt;

    private Instant finishedAt;

    private String createdBy;
}
