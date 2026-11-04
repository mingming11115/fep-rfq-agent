package com.naura.rfq.audit;

import java.time.Instant;
import java.util.Collection;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class AuditQuery {
    private final Collection<String> buIds;
    private final String actorId;
    private final String action;
    private final String objectType;
    private final String objectId;
    private final String result;
    private final Instant createdFrom;
    private final Instant createdTo;
}
