package com.naura.rfq.auth;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.domain.Project;
import org.springframework.stereotype.Component;

/** Server-side authorization. The browser never decides who may mutate what. */
@Component
public class AccessGuard {

    private static final String BU_ADMIN = "BU_ADMIN";

    public void requireBu(CurrentUser user, String buId) {
        if (!user.canReach(buId)) {
            throw new BusinessException(403, "无权访问该事业部数据");
        }
    }

    public void requireProject(CurrentUser user, Project project) {
        if (project == null) {
            throw new BusinessException(404, "项目不存在");
        }
        requireBu(user, project.getBuId());
    }

    /** SR and BU admins own RFQ intake; technical and approver roles stay read-only here. */
    public void requireSourceManager(CurrentUser user, String buId) {
        boolean allowed = user.systemAdmin() || user.roles().stream()
                .anyMatch(grant -> grant.buId().equals(buId)
                        && ("SR".equals(grant.role()) || BU_ADMIN.equals(grant.role())));
        if (!allowed) {
            throw new BusinessException(403, "仅 SR 或 BU 管理员可以上传客户文件");
        }
    }

    public String defaultBu(CurrentUser user, String requested) {
        if (requested != null && !requested.isBlank()) {
            requireBu(user, requested);
            return requested;
        }
        return user.buIds().stream().findFirst()
                .orElseThrow(() -> new BusinessException(403, "当前账号未绑定任何事业部"));
    }
}
