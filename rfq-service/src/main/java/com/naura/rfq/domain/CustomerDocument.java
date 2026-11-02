package com.naura.rfq.domain;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class CustomerDocument {

    public static final String STATUS_UPLOADED = "UPLOADED";
    public static final String STATUS_PARSING = "PARSING";
    public static final String STATUS_PARSED = "PARSED";
    public static final String STATUS_PARTIAL = "PARTIAL";
    public static final String STATUS_FAILED = "FAILED";

    private String id;

    private String projectId;

    private String name;

    /** File version, not the project revision: re-uploading a revised RFQ increments this. */
    private Integer version = 1;

    private String purpose = "REQUIREMENT_SOURCE";

    private String storageRef;

    private String contentType;

    private Long sizeBytes = 0L;

    private String sha256;

    private String status = STATUS_UPLOADED;

    private String uploadedBy;

    private Instant createdAt = Instant.now();
}
