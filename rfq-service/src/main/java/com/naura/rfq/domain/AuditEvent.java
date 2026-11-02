package com.naura.rfq.domain;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class AuditEvent {

    private String id;

    private String actorId;

    private String action;

    private String objectType;

    private String objectId;

    private String result;

    private String detail;

    private Instant createdAt = Instant.now();
}
