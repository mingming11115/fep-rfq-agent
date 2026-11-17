package com.naura.rfq.service;

import com.naura.rfq.mapper.ResponseMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.security.CurrentUser;
import com.naura.rfq.mapper.UserBuRoleMapper;
import java.time.Instant;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
class MatchDeviationService {
    @Autowired
    private ResponseMapper responseRecords;
    @Autowired
    private ObjectMapper json;
    @Autowired
    private AuditService audit;
    @Autowired
    private ProjectWorkScope work;
    @Autowired
    private ConfirmationAssignmentService assignments;
    @Autowired
    private UserBuRoleMapper roles;

    long workVersion(String project) {
        return work.version(project);
    }

    ObjectNode find(Project project, Requirement requirement) {
        return responseRecords.findReview(project.getId(), id(project, requirement)).stream().map(this::parse)
                .findFirst().orElse(null);
    }

    // Every write is serialized by the caller's project lock.
    ObjectNode record(Project project, Requirement requirement, String runId, String type, String reason) {
        String id = id(project, requirement);
        var item = find(project, requirement);
        if (item == null) {
            item = json.createObjectNode().put("id", id).put("projectId", project.getId())
                    .put("requirementId", requirement.getId()).put("workVersion", workVersion(project.getId()))
                    .put("kind", "deviation").put("type", "知识比对偏离").put("status", "待处理")
                    .put("title", requirement.getTitle() + " · 知识比对偏离").put("version", 0)
                    .put("ownerId", project.getOwnerId()).put("createdAt", Instant.now().toString());
            item.putArray("triggers");
        }
        for (var trigger : item.path("triggers")) {
            if (type.equals(trigger.path("type").asText()) && runId.equals(trigger.path("runId").asText())) {
                return item;
            }
        }
        item.withArray("triggers").addObject().put("type", type).put("runId", runId).put("reason", reason)
                .put("createdAt", Instant.now().toString());
        if ("capability_contradiction".equals(type)) {
            item.put("technicalReviewRequired", true);
        }
        if (!"待处理".equals(item.path("status").asText())) {
            item.put("status", "待处理");
        }
        item.put("description", reason);
        save(project, item);
        setStatus(project, requirement.getId(), ResponseStatus.REVIEWING, "条款已进入评审，请重新确认本条应答");
        return item;
    }

    ObjectNode close(CurrentUser user, Project project, Requirement requirement, long version, String reason) {
        var item = find(project, requirement);
        if (item == null) {
            throw new BusinessException(404, "条款没有当前偏离事项");
        }
        if (version != item.path("version").asLong() || !"待处理".equals(item.path("status").asText())) {
            throw new BusinessException(409, "偏离事项已变化，请刷新后处理");
        }
        if (!item.path("reviewerIds").isEmpty()) {
            var response = response(requirement.getId());
            if (!item.path("answerFingerprint").asText().equals(answerFingerprint(response))) {
                throw new BusinessException(409, "应答已变化，请重新分派评审");
            }
            var votes = (ObjectNode) item.path("reviewVotes");
            if (!reviewers(item).contains(user.id()) || !assignments.eligible(project, user.id()) || votes.has(user.id())) {
                throw new BusinessException(403, "当前人员无待处理评审任务");
            }
            votes.putObject(user.id()).put("reason", reason).put("at", Instant.now().toString());
            if (!reviewers(item).stream().allMatch(id -> votes.has(id) && assignments.eligible(project, id))) {
                save(project, item);
                return item;
            }
        } else if (item.path("technicalReviewRequired").asBoolean()) {
            throw new BusinessException(409, "请先分派技术评审");
        } else if (!user.id().equals(project.getOwnerId()) && !user.id().equals(requirement.getConfirmationAssigneeId())) {
            throw new BusinessException(403, "仅项目负责人或本条确认人可关闭偏离事项");
        }
        item.put("status", "已关闭").put("resolution", reason).put("closedById", user.id())
                .put("closedAt", Instant.now().toString());
        save(project, item);
        closeStatus(user, project, requirement, item);
        audit.successInBu(user.id(), project.getBuId(), "关闭知识比对偏离", "requirement", requirement.getId(), reason);
        return item;
    }

    ObjectNode assignReview(CurrentUser user, Project project, Requirement requirement, long version,
            List<String> reviewers, String deadline, String reason) {
        var response = response(requirement.getId());
        if (version != response.path("version").asLong(Math.max(1, requirement.getVersion()))) {
            throw new BusinessException(409, "应答版本已变化，请重新核对");
        }
        var existing = find(project, requirement);
        boolean technical = "不满足".equals(response.path("conclusion").asText())
                || existing != null && existing.path("technicalReviewRequired").asBoolean();
        if (reviewers.stream().distinct().count() != reviewers.size() || reviewers.stream().anyMatch(id -> !assignments.eligible(project, id))
                || technical && reviewers.stream().noneMatch(id -> technical(project, id))) {
            throw new BusinessException(422, "请选择具备项目授权和确认资格的评审人，能力偏离须包含技术评审人");
        }
        String fingerprint = answerFingerprint(response);
        if (existing != null && "待处理".equals(existing.path("status").asText())
                && reviewers(existing).equals(reviewers) && fingerprint.equals(existing.path("answerFingerprint").asText())
                && deadline.equals(existing.path("deadline").asText()) && reason.equals(existing.path("reviewRequestReason").asText())) {
            return existing;
        }
        var item = record(project, requirement, "response:" + version, "professional_review", reason);
        item.set("reviewerIds", json.valueToTree(reviewers));
        item.putObject("reviewVotes");
        item.put("status", "待处理").put("deadline", deadline).put("technicalReviewRequired", technical)
                .put("answerFingerprint", fingerprint).put("reviewRequestReason", reason);
        save(project, item);
        audit.successInBu(user.id(), project.getBuId(), "发起应答评审", "requirement", requirement.getId(), reason);
        return item;
    }

    boolean reviewedContradiction(Project project, Requirement requirement, JsonNode response) {
        var item = find(project, requirement);
        return item != null && "已关闭".equals(item.path("status").asText()) && item.path("technicalReviewRequired").asBoolean()
                && reviewers(item).stream().anyMatch(id -> technical(project, id) && assignments.eligible(project, id))
                && item.path("answerFingerprint").asText().equals(answerFingerprint(response));
    }

    private List<String> reviewers(JsonNode item) {
        var ids = new java.util.ArrayList<String>();
        item.path("reviewerIds").forEach(id -> ids.add(id.asText()));
        return ids;
    }

    private boolean technical(Project project, String id) {
        return roles.findByUserIdAndStatus(id, "ACTIVE").stream().anyMatch(role -> project.getBuId().equals(role.getBuId())
                && "TECH".equals(role.getRole()));
    }

    private JsonNode response(String requirement) {
        return responseRecords.findResponseByRequirement(requirement).stream().map(this::parse).findFirst().orElseGet(json::createObjectNode);
    }

    private String answerFingerprint(JsonNode response) {
        var fields = json.createArrayNode();
        for (String field : List.of("conclusion", "draft", "conditions", "evidence", "reason")) fields.add(response.path(field).asText(""));
        var ref = response.path("matchReference");
        return MatchEvaluator.digest(fields.add(ref.path("runId").asText()).add(ref.path("candidateId").asText()).toString());
    }

    void carryForward(Project project, long version) {
        for (var old : responseRecords.listPendingDeviations(project.getId(), version - 1).stream().map(this::parse).toList()) {
            var next = old.deepCopy().put("id", "MATCH-DEV:" + version + ":" + old.path("requirementId").asText())
                    .put("workVersion", version).put("version", 0).put("carriedFrom", old.path("id").asText());
            old.put("status", "已取消").put("supersededByWorkVersion", version);
            save(project, old);
            save(project, next);
            setStatus(project, old.path("requirementId").asText(), ResponseStatus.REVIEWING,
                    "工作版本已切换，评审事项结转，请重新确认本条应答");
        }
    }

    /** 关闭评审事项后重算应答状态：投过票的评审未指定确认人即视为通过并自动确认，其余回落待处理。 */
    private void closeStatus(CurrentUser user, Project project, Requirement requirement, JsonNode item) {
        var payloads = responseRecords.lockResponse(requirement.getId(), project.getId());
        if (payloads.isEmpty()) {
            return;
        }
        ObjectNode row = parse(payloads.get(0));
        if (!item.path("reviewerIds").isEmpty() && !hasAssignedConfirmer(requirement, row)) {
            confirmResponse(user, project, requirement.getId(), row);
            return;
        }
        setStatus(project, requirement.getId(), row, ResponseStatus.PENDING, "评审事项已关闭，请重新确认本条应答");
    }

    /** 评审人全部投票且未指定确认人时，视为评审通过并自动确认本条应答。 */
    private void confirmResponse(CurrentUser user, Project project, String requirementId, ObjectNode row) {
        row.put("status", ResponseStatus.CONFIRMED).put("confirmedBy", user.displayName())
                .put("confirmedById", user.id()).put("confirmedAt", Instant.now().toString())
                .put("needsReview", false).put("confirmationReason", "评审已完成且未指定确认人，系统自动确认");
        row.put("version", row.path("version").asLong(1) + 1);
        responseRecords.upsertResponse(requirementId, project.getId(), row.toString());
    }

    /** 是否已指定确认人；已指定的条款必须由本人手工确认，评审关闭后不自动确认。 */
    private boolean hasAssignedConfirmer(Requirement requirement, JsonNode response) {
        return requirement.getConfirmationAssigneeId() != null
                || !response.path("confirmationAssigneeId").asText("").isBlank()
                || "explicit".equals(response.path("confirmationAssignmentSource").asText());
    }

    private void setStatus(Project project, String requirementId, String target, String reason) {
        var payloads = responseRecords.lockResponse(requirementId, project.getId());
        if (payloads.isEmpty()) {
            return;
        }
        setStatus(project, requirementId, parse(payloads.get(0)), target, reason);
    }

    /** 写入应答状态；仅在语义变化时推进版本，避免干扰无关的乐观锁。 */
    private void setStatus(Project project, String requirementId, ObjectNode row, String target, String reason) {
        String stored = row.path("status").asText(ResponseStatus.PENDING);
        String current = ResponseStatus.normalize(stored);
        if (target.equals(current) && target.equals(stored)) {
            return;
        }
        row.put("status", target);
        if (!target.equals(current)) {
            row.put("version", row.path("version").asLong(1) + 1);
            if (!ResponseStatus.CONFIRMED.equals(target)) {
                row.remove(List.of("confirmedAt", "confirmedBy", "confirmedById"));
            }
            row.put("confirmationReason", reason);
        }
        responseRecords.upsertResponse(requirementId, project.getId(), row.toString());
    }

    private void save(Project project, ObjectNode item) {
        item.put("version", item.path("version").asLong() + 1);
        responseRecords.upsertReview(item.path("id").asText(), project.getId(), item.toString());
    }

    private String id(Project project, Requirement requirement) {
        return "MATCH-DEV:" + workVersion(project.getId()) + ":" + requirement.getId();
    }

    private ObjectNode parse(String payload) {
        try {
            return (ObjectNode) json.readTree(payload);
        } catch (Exception e) {
            log.error("解析偏离事项失败 errorType={}", e.getClass().getSimpleName());
            throw new IllegalStateException("偏离事项数据格式异常", e);
        }
    }
}
