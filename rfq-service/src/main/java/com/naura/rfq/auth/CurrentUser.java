package com.naura.rfq.auth;

import java.util.List;

/** Authenticated principal resolved from the JWT plus the current DB role bindings. */
public record CurrentUser(String id, String displayName, boolean systemAdmin, List<RoleGrant> roles) {

    public record RoleGrant(String buId, String role) {
    }

    public boolean hasRole(String role) {
        return roles.stream().anyMatch(grant -> grant.role().equals(role));
    }

    public boolean canReach(String buId) {
        return systemAdmin || roles.stream().anyMatch(grant -> grant.buId().equals(buId));
    }

    public List<String> buIds() {
        return roles.stream().map(RoleGrant::buId).distinct().toList();
    }
}
