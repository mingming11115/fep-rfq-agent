package com.naura.rfq.security;

import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.ProjectMemberMapper;
import com.naura.rfq.model.entity.Project;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Server-side authorization. The browser never decides who may mutate what. */
@Component
@RequiredArgsConstructor
public class AccessGuard {

    private static final String BU_ADMIN = "BU_ADMIN";
    private final ProjectMemberMapper members;

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
        if (!hasProjectRoleOrMembership(user, project)) {
            throw new BusinessException(403, "无权访问该项目，请联系 BU 管理员授权");
        }
    }

    public boolean canAccessProject(CurrentUser user, Project project) {
        return project != null && user.canReach(project.getBuId()) && hasProjectRoleOrMembership(user, project);
    }

    private boolean hasProjectRoleOrMembership(CurrentUser user, Project project) {
        boolean manager = user.roles().stream().anyMatch(grant -> project.getBuId().equals(grant.buId()) && BU_ADMIN.equals(grant.role()));
        boolean business = user.roles().stream().anyMatch(grant -> project.getBuId().equals(grant.buId())
                && java.util.Set.of("SR", "TECH", "APPROVER").contains(grant.role()));
        return manager || business && (user.id().equals(project.getOwnerId())
                || members.find(project.getId(), user.id()).map(member -> member.isEnabled()).orElse(false));
    }

    public void requireProjectAccessManager(CurrentUser user, Project project) {
        requireBu(user, project.getBuId());
        if (!user.systemAdmin() && user.roles().stream().noneMatch(grant -> project.getBuId().equals(grant.buId()) && BU_ADMIN.equals(grant.role()))) {
            throw new BusinessException(403, "仅平台或本 BU 管理员可以维护项目授权");
        }
    }

    public void requireProjectManager(CurrentUser user, Project project) {
        requireProject(user, project);
        boolean manager=user.roles().stream().anyMatch(grant->project.getBuId().equals(grant.buId())
                && (BU_ADMIN.equals(grant.role()) || "SR".equals(grant.role()) && user.id().equals(project.getOwnerId())));
        if(!manager) {
            throw new BusinessException(403,"仅项目负责人或本 BU 管理员可以维护项目");
        }
    }

    public void requireActiveProject(Project project) {
        if(project.isArchived()) {
            throw new BusinessException(409,"项目已删除，请恢复后再修改");
        }
    }

    /** null denotes platform scope; an ordinary user can never produce an empty unrestricted scope. */
    public java.util.Collection<String> managedBuScope(CurrentUser user,String requested) {
        if(user.systemAdmin()) {
            return requested==null?null:java.util.List.of(requested);
        }
        var managed=user.roles().stream().filter(grant->BU_ADMIN.equals(grant.role())).map(CurrentUser.RoleGrant::buId).distinct().toList();
        if(managed.isEmpty() || requested!=null && !managed.contains(requested)) {
            throw new BusinessException(403,"只能查询本人管理事业部的审计记录");
        }
        return requested==null?managed:java.util.List.of(requested);
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
