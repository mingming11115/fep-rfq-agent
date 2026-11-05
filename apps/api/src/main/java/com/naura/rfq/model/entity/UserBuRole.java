package com.naura.rfq.model.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Role binding inside one BU. The same person may be SR in one BU and approver in another. */
@Getter
@Setter
@NoArgsConstructor
public class UserBuRole {

    private Long id;

    private String userId;

    private String buId;

    private String role;

    private String status = "ACTIVE";

    private Instant createdAt = Instant.now();
}
