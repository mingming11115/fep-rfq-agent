package com.naura.rfq.model.vo;

import java.util.List;

public record AuthUserView(String id, String displayName, boolean systemAdmin,
        List<AuthRoleView> roles, List<AuthBuView> bus) {
}
