package com.naura.rfq.service;

import com.naura.rfq.mapper.BusinessUnitMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.BuMemberProfileMapper;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.util.Arrays;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
class KnowledgePublicationAccess {
    private static final Set<String> EDITORS = Set.of("BU_ADMIN", "SR", "TECH", "APPROVER");
    private static final Pattern LEGACY_PROJECT = Pattern.compile("MYSQL-DEMO-\\d{3}");
    @Autowired
    private AccessGuard guard;
    @Autowired
    private BuMemberProfileMapper profiles;
    @Autowired
    private ProjectMapper projects;
    @Autowired
    private BusinessUnitMapper businessUnits;

    void lockBu(String buId) {
        if (businessUnits.lockId(buId).isEmpty()) {
            throw new BusinessException(404, "BU 不存在");
        }
    }

    static String recordProjectId(JsonNode row) {
        String projectId = row.path("projectId").asText(row.path("sourceProjectId").asText());
        if (projectId.isBlank() && !Set.of("upload", "history-upload", "approved-snapshot").contains(row.path("sourceType").asText())
                && Set.of("草稿", "待审核", "退回", "候选").contains(row.path("status").asText())) {
            var matcher = LEGACY_PROJECT.matcher(row.path("source").asText() + " " + row.path("sourceLocation").asText());
            if (matcher.find()) {
                return matcher.group();
            }
        }
        return projectId;
    }

    Project requireProject(CurrentUser user, String buId, String id) {
        var project = projects.findById(id).orElseThrow(() -> new BusinessException(404, "项目不存在"));
        if (buId != null && !buId.equals(project.getBuId())) {
            throw new BusinessException(403, "项目不属于当前 BU");
        }
        guard.requireProject(user, project);
        return project;
    }

    void requireScope(CurrentUser user, String buId, String projectId, String scope) {
        guard.requireBu(user, buId);
        if (projectId != null && !projectId.isBlank()) {
            requireProject(user, buId, projectId);
        } else if ("仅当前项目".equals(scope)) {
            throw new BusinessException(403, "记录缺少可核实的项目范围");
        }
    }

    void requireWriter(CurrentUser user, String buId, boolean review) {
        guard.requireBu(user, buId);
        var profile = profiles.findByBuIdAndUserId(buId, user.id());
        boolean editor = user.roles().stream().anyMatch(role -> buId.equals(role.buId()) && EDITORS.contains(role.role()));
        if (!editor || profile != null && !profile.isEnabled()) {
            throw new BusinessException(403, "当前账号无知识维护权限");
        }
        if (review) {
            boolean manager = user.roles().stream().anyMatch(role -> buId.equals(role.buId()) && "BU_ADMIN".equals(role.role()));
            if (!manager || profile == null || Arrays.stream(profile.getResourceQualifications().split(","))
                    .map(String::strip).noneMatch("knowledge-publish"::equals)) {
                throw new BusinessException(403, "需要本 BU 的知识发布资格");
            }
        }
    }

    void requireCapabilityWriter(CurrentUser user, String buId, boolean admin, boolean review) {
        guard.requireBu(user, buId);
        var profile = profiles.findByBuIdAndUserId(buId, user.id());
        boolean manager = user.roles().stream().anyMatch(role -> buId.equals(role.buId()) && "BU_ADMIN".equals(role.role()));
        boolean technical = user.roles().stream().anyMatch(role -> buId.equals(role.buId()) && "TECH".equals(role.role()));
        if (profile != null && !profile.isEnabled() || !manager && (admin || review || !technical)) {
            throw new BusinessException(403, "当前账号无机型能力维护权限");
        }
        if (review && (profile == null || Arrays.stream(profile.getResourceQualifications().split(","))
                .map(String::strip).noneMatch("capability-publish"::equals))) {
            throw new BusinessException(403, "需要本 BU 的机型能力发布资格");
        }
    }
}
