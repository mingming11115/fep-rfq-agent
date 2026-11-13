package com.naura.rfq.service;

import com.naura.rfq.mapper.ResponseMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
public class FinalSnapshotService {
    public record Reviewers(long version, String technicalMode, String srId, List<String> technicalIds,
            String technicalRepresentativeId, String reason) {}
    public record Vote(long version, String result, String reason) {}

    @Autowired
    private ResponseMapper responseRecords;
    @Autowired
    private ObjectMapper json;
    @Autowired
    private ProjectMapper projects;
    @Autowired
    private AccessGuard access;
    @Autowired
    private AuditService audit;
    @Autowired
    private ApprovedDocumentExportService export;
    @Autowired
    private HistoryRfqService history;
    @Autowired
    private KnowledgePublicationAccess publication;
    @Autowired
    private ProjectWorkScope work;

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode configure(CurrentUser user, String projectId, Reviewers input) {
        var project = locked(user, projectId);
        access.requireProjectManager(user, project);
        String reason = reason(input.reason(), true);
        var config = config(projectId);
        long version = config.path("technicalReviewSettings").path("version").asLong(1);
        if (version != input.version()) {
            throw new BusinessException(409, "评审配置已变化，请刷新");
        }
        var reviewers = json.createObjectNode().put("srId", input.srId()).put("technicalRepresentativeId", input.technicalRepresentativeId());
        reviewers.set("technicalIds", json.valueToTree(input.technicalIds()));
        validateRule(project, input.technicalMode(), reviewers);
        var settings = json.createObjectNode().put("technicalMode", input.technicalMode()).put("version", version + 1);
        if (!(config.get("approvalConfig") instanceof ObjectNode)) {
            config.putObject("approvalConfig");
        }
        ((ObjectNode) config.get("approvalConfig")).set("finalReviewers", reviewers);
        config.set("technicalReviewSettings", settings);
        responseRecords.upsertConfig(projectId, config.toString());
        audit.successInBu(user.id(), project.getBuId(), "配置最终评审", "project", projectId, reason);
        return config;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode submit(CurrentUser user, String projectId, ObjectNode incoming) {
        var project = locked(user, projectId);
        if (user.systemAdmin() || user.roles().stream().noneMatch(role -> project.getBuId().equals(role.buId()) && "SR".equals(role.role()))) {
            throw new BusinessException(403, "仅项目 SR 可提交最终评审");
        }
        String id = incoming.path("id").asText();
        if (!id.matches("SNAP-[A-Za-z0-9-]{1,80}")) {
            throw new BusinessException(400, "快照操作编号无效");
        }
        var existing = snapshot(projectId, id);
        if (existing != null) {
            if (!user.id().equals(existing.path("createdById").asText())) {
                throw new BusinessException(409, "快照编号已使用");
            }
            return existing;
        }
        var scope = incoming.path("approvalScope");
        var config = config(projectId);
        var finalReview = review(project, config);
        if (!scope.isObject() || !incoming.path("rows").isArray() || incoming.path("approvalFingerprint").asText().isBlank()) {
            throw new BusinessException(400, "快照缺少冻结范围或应答条款");
        }
        publication.lockBu(project.getBuId());
        var snapshot = json.createObjectNode().put("id", id).put("projectId", projectId).put("status", "审批中")
                .put("version", 1).put("round", 1).put("workVersion", work.version(projectId)).put("createdAt", Instant.now().toString())
                .put("createdById", user.id()).put("createdBy", user.displayName())
                .put("approvalFingerprint", incoming.path("approvalFingerprint").asText())
                .put("submissionReason", reason(incoming.path("submissionReason").asText(), false));
        for (String key : List.of("rows", "approvalScope", "template", "mapping", "attachments")) {
            if (incoming.has(key)) {
                snapshot.set(key, incoming.get(key));
            }
        }
        snapshot.putArray("unconfirmedComplyIds");
        snapshot.set("finalReview", finalReview);
        export.validateContents(project, snapshot, true);
        var latest = export.latestSnapshot(projectId);
        if (latest != null) {
            if ("审批中".equals(latest.path("status").asText())
                    && latest.path("approvalFingerprint").equals(snapshot.path("approvalFingerprint"))) {
                throw new BusinessException(409, "当前版本已在最终评审中");
            }
            snapshot.put("revisionOf", latest.path("id").asText());
            snapshot.put("round", latest.path("round").asLong(1) + 1);
        }
        responseRecords.insertSnapshot(id, projectId, snapshot.toString());
        audit.successInBu(user.id(), project.getBuId(), "提交定稿审批", "snapshot", id, snapshot.path("submissionReason").asText());
        return snapshot;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode vote(CurrentUser user, String projectId, String id, Vote input) {
        var project = locked(user, projectId);
        var latest = export.latestSnapshot(projectId);
        if (!(latest instanceof ObjectNode snapshot) || !id.equals(snapshot.path("id").asText())
                || !"审批中".equals(snapshot.path("status").asText()) || snapshot.path("stale").asBoolean()
                || input.version() != snapshot.path("version").asLong(1)) {
            throw new BusinessException(409, "本轮审批已变化，请刷新");
        }
        if (input.result() == null || !Set.of("approved", "rejected").contains(input.result())) {
            throw new BusinessException(400, "审批结果无效");
        }
        String reason = reason(input.reason(), "rejected".equals(input.result()));
        var frozen = (ObjectNode) snapshot.get("finalReview");
        var configured = review(project, config(projectId));
        if (configured.path("ruleVersion").asLong() != frozen.path("ruleVersion").asLong()) {
            throw new BusinessException(409, "评审规则已变化，请重新提交");
        }
        for (String field : List.of("policy", "technicalMode", "reviewers")) {
            if (!configured.path(field).equals(frozen.path(field))) {
                throw new BusinessException(409, "评审规则已变化，请重新提交");
            }
        }
        var reviewers = frozen.path("reviewers");
        String idOfActor = user.id();
        boolean sr = idOfActor.equals(reviewers.path("srId").asText());
        boolean technical = "representative".equals(frozen.path("technicalMode").asText())
                ? idOfActor.equals(reviewers.path("technicalRepresentativeId").asText())
                : ids(reviewers.path("technicalIds")).contains(idOfActor);
        if (user.systemAdmin() || !sr && !technical) {
            throw new BusinessException(403, "当前人员没有本轮审批任务");
        }
        var decisions = (ObjectNode) frozen.get("decisions");
        var technicalVotes = (ObjectNode) decisions.get("technicalByActorId");
        if (sr ? decisions.hasNonNull("sr") : technicalVotes.hasNonNull(idOfActor)) {
            throw new BusinessException(409, "本轮已投票");
        }
        if ("approved".equals(input.result())) {
            publication.lockBu(project.getBuId());
            export.validateContents(project, snapshot);
        }
        String time = Instant.now().toString();
        var vote = json.createObjectNode().put("actorId", idOfActor).put("result", input.result()).put("reason", reason).put("at", time);
        if (sr) {
            decisions.set("sr", vote);
        } else {
            technicalVotes.set(idOfActor, vote);
        }
        snapshot.put("reviewedAt", time).put("reviewedById", idOfActor).put("reviewReason", reason)
                .put("version", input.version() + 1);
        snapshot.withArray("history").addObject().put("action", "approved".equals(input.result()) ? "最终评审通过" : "退回快照")
                .put("actor", user.displayName()).put("actorId", idOfActor).put("side", sr ? "sr" : "technical").put("time", time).put("reason", reason);
        snapshot.put("status", "rejected".equals(input.result()) ? "已退回" : "已批准");
        if ("已批准".equals(snapshot.path("status").asText()) && !ApprovedDocumentExportService.approved(snapshot)) {
            snapshot.put("status", "审批中");
        }
        responseRecords.updateSnapshot(projectId, id, snapshot.toString());
        if ("已批准".equals(snapshot.path("status").asText())) {
            var candidate = history.fromSnapshot(user, projectId, id, false);
            snapshot.put("historyCandidateCount", candidate.clauses().size());
            responseRecords.updateSnapshot(projectId, id, snapshot.toString());
        }
        audit.successInBu(user.id(), project.getBuId(), "记录定稿审批", "snapshot", id, snapshot.path("status").asText());
        return snapshot;
    }

    private Project locked(CurrentUser user, String id) {
        var project = projects.findByIdForUpdate(id).orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        access.requireActiveProject(project);
        return project;
    }

    private ObjectNode review(Project project, ObjectNode config) {
        var settings = config.path("technicalReviewSettings");
        var reviewers = config.path("approvalConfig").path("finalReviewers");
        String mode = settings.path("technicalMode").asText("all");
        validateRule(project, mode, reviewers);
        var review = json.createObjectNode().put("policy", "sr-and-technical").put("technicalMode", mode)
                .put("ruleVersion", settings.path("version").asLong(1));
        review.set("reviewers", reviewers);
        review.putObject("decisions").putNull("sr").putObject("technicalByActorId");
        return review;
    }

    private void validateRule(Project project, String mode, JsonNode reviewers) {
        var technical = reviewers.path("technicalIds");
        var ids = ids(technical);
        String sr = reviewers.path("srId").asText();
        if (mode == null || !Set.of("all", "representative").contains(mode) || sr.isBlank() || !technical.isArray()
                || ids.isEmpty() || ids.size() != technical.size() || ids.contains("") || ids.contains(sr)
                || "representative".equals(mode) && !ids.contains(reviewers.path("technicalRepresentativeId").asText())) {
            throw new BusinessException(400, "请配置不同的 SR 与技术评审人员，并核对代表人");
        }
        export.validateReviewers(project, reviewers);
    }

    private Set<String> ids(JsonNode values) {
        var ids = new HashSet<String>();
        for (var value : values) ids.add(value.asText(""));
        return ids;
    }

    private String reason(String value, boolean required) {
        String reason = value == null ? "" : value.trim();
        if (reason.length() > 900 || required && reason.isBlank()) {
            throw new BusinessException(400, "请填写有效原因（最多 900 字）");
        }
        return reason;
    }

    private ObjectNode config(String projectId) {
        var result = responseRecords.findConfig(projectId);
        return result.isEmpty() ? json.createObjectNode() : decode(result.get(0));
    }

    private ObjectNode snapshot(String projectId, String id) {
        var result = responseRecords.findSnapshot(projectId, id);
        return result.isEmpty() ? null : decode(result.get(0));
    }

    private ObjectNode decode(String payload) {
        try { return (ObjectNode) json.readTree(payload); }
        catch (Exception failure) {
            log.error("解析审批快照失败 errorType={}", failure.getClass().getSimpleName());
            throw new IllegalStateException("审批数据格式异常", failure);
        }
    }
}
