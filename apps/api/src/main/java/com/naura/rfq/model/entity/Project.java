package com.naura.rfq.model.entity;

import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class Project {

    private String id;

    private String code;

    private String name;

    private String customer;

    private String buId;

    private String ownerId;

    private String groupId;
    private String groupPath;
    private Long groupCatalogVersion;
    private String groupValues;

    private String stage = "DRAFT";
    private LocalDate deadline;
    private String archivedFromStage;
    private Instant archivedAt;
    private String archivedBy;
    private String archiveReason;

    public boolean isArchived() { return "CANCELLED".equals(stage); }

    /** 乐观锁版本号。JPA 会自动置 0，MyBatis 下由构造默认值承担同一职责。 */
    private Long version = 0L;

    private String createdBy;

    private Instant createdAt = Instant.now();

    private Instant updatedAt = Instant.now();
}
