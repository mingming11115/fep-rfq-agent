package com.naura.rfq.domain;

import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ProjectMember {
    private String projectId;
    private String userId;
    private boolean enabled = true;
    private String grantedBy;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();
}
