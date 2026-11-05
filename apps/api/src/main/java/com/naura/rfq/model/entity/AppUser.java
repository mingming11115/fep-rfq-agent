package com.naura.rfq.model.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class AppUser {

    private String id;

    private String username;

    private String passwordHash;

    private String displayName;

    private String email;

    private String status = "ACTIVE";

    private boolean systemAdmin;

    private Instant createdAt = Instant.now();

    public boolean isActive() {
        return "ACTIVE".equals(status);
    }
}
