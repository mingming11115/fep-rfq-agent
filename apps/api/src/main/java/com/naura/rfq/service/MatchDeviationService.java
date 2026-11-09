package com.naura.rfq.service;

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
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
class MatchDeviationService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final AuditService audit;
    private final ProjectWorkScope work;
    private final ConfirmationAssignmentService assignments;
    private final UserBuRoleMapper roles;

    long workVersion(String project) {
        return work.version(project);
    }

    ObjectNode find(Project project, Requirement requirement) {
        return jdbc.query("select payload from response_review where project_id=? and id=?",
                (row, n) -> parse(row.getString(1)), project.getId(), id(project, requirement))
                .stream().findFirst().orElse(null);
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
            if (type.equals(trigger.path("type").asText()) && runId.equals(trigger.path("runId").asText())) return item;
        }
        item.withArray("triggers").addObject().put("type", type).put("runId", runId).put("reason", reason)
                .put("createdAt", Instant.now().toString());
        if ("capability_contradiction".equals(type)) item.put("technicalReviewRequired", true);
        if (!"待处理".equals(item.path("status").asText())) item.put("status", "待处理");
        item.put("description", reason);
        save(project, item);
        return item;
    }

    ObjectNode close(CurrentUser user, Project project, Requirement requirement, long version, String reason) {
        var item = find(project, requirement);
        if (item == null) throw new BusinessException(404, "条款没有当前偏离事项");
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
        if (existing != null && reviewers(existing).equals(reviewers) && fingerprint.equals(existing.path("answerFingerprint").asText())
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
        return jdbc.query("select payload from requirement_response where requirement_id=?",
                (row, n) -> parse(row.getString(1)), requirement).stream().findFirst().orElseGet(json::createObjectNode);
    }

    private String answerFingerprint(JsonNode response) {
        var fields = json.createArrayNode();
        for (String field : List.of("conclusion", "draft", "conditions", "evidence", "reason")) fields.add(response.path(field).asText(""));
        var ref = response.path("matchReference");
        return MatchEvaluator.digest(fields.add(ref.path("runId").asText()).add(ref.path("candidateId").asText()).toString());
    }

    void carryForward(Project project, long version) {
        for (var old : jdbc.query("""
                select payload from response_review where project_id=?
                and json_unquote(json_extract(payload,'$.kind'))='deviation'
                and json_unquote(json_extract(payload,'$.status'))='待处理'
                and cast(json_unquote(json_extract(payload,'$.workVersion')) as unsigned)=?
                """, (row, n) -> parse(row.getString(1)), project.getId(), version - 1)) {
            var next = old.deepCopy().put("id", "MATCH-DEV:" + version + ":" + old.path("requirementId").asText())
                    .put("workVersion", version).put("version", 0).put("carriedFrom", old.path("id").asText());
            old.put("status", "已取消").put("supersededByWorkVersion", version);
            save(project, old);
            save(project, next);
        }
    }

    private void save(Project project, ObjectNode item) {
        item.put("version", item.path("version").asLong() + 1);
        jdbc.update("""
                insert into response_review(id,project_id,payload) values (?,?,?) as desired
                on duplicate key update payload=desired.payload
                """, item.path("id").asText(), project.getId(), item.toString());
    }

    private String id(Project project, Requirement requirement) {
        return "MATCH-DEV:" + workVersion(project.getId()) + ":" + requirement.getId();
    }

    private ObjectNode parse(String payload) {
        try {
            return (ObjectNode) json.readTree(payload);
        } catch (Exception e) {
            throw new IllegalStateException("偏离事项数据格式异常", e);
        }
    }
}
