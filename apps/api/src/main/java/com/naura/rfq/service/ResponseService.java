package com.naura.rfq.service;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.*;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.security.*;
import java.time.Instant;
import java.util.*;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@NoArgsConstructor
@AllArgsConstructor
@Slf4j
public class ResponseService {
    private static final String CONFIRMATION = "confirmation";
    private static final String CHECKPOINT = "checkpoint";
    private static final List<String> ANSWER_FIELDS = List.of("conclusion", "draft", "remark", "evidence");
    private static final List<String> SOURCE_FIELDS = List.of("original", "sourceDocumentId", "sourceRequirementText");
    private static final List<String> RESTORE_FIELDS = List.of("restoredFromVersion", "restoredBy", "restoredById", "restoredAt");

    public record History(List<JsonNode> versions, List<JsonNode> checkpoints) {}
    public record MatchChoice(String matchRunId, String candidateId, String detachMatchReason) {}
    private record Restore(String kind, long version) {}

    @Autowired
    private ResponseMapper responseRecords;
    @Autowired
    private ObjectMapper json;
    @Autowired
    private RequirementMapper requirements;
    @Autowired
    private ProjectMapper projects;
    @Autowired
    private CustomerDocumentMapper documents;
    @Autowired
    private BuMemberProfileMapper profiles;
    @Autowired
    private AccessGuard guard;
    @Autowired
    private AuditService audit;
    @Autowired
    private ConfirmationAssignmentService confirmationAssignments;
    @Autowired
    private RequirementMatchService matches;
    @Autowired
    private ProjectWorkScope work;
    @Autowired
    private MatchDeviationService deviations;
    private JsonNode decode(String value) {
        try {
            return json.readTree(value);
        } catch (Exception e) {
            log.error("解析应标业务记录失败 errorType={}", e.getClass().getSimpleName());
            throw new IllegalStateException("业务记录格式异常", e);
        }
    }
    private List<JsonNode> decodeRows(List<String> payloads) {
        return payloads.stream().map(this::decode).toList();
    }

    @Transactional(readOnly = true)
    public History history(CurrentUser user, String id) {
        var requirement = requirements.findById(id).orElseThrow(() -> new BusinessException(404, "条款不存在"));
        String projectId = requirement.getProjectId();
        var project = projects.findById(projectId).orElse(null);
        guard.requireProject(user, project);
        var versions = historyRows(id, projectId, CONFIRMATION);
        if (versions.isEmpty()) {
            versions = decodeRows(responseRecords.findResponse(id, projectId))
                    .stream().findFirst().flatMap(row -> legacyConfirmation(row, requirement)).stream().toList();
        }
        return new History(versions.stream().map(ResponseService::withRemark)
                        .map(row -> row.hasNonNull("matchReference") ? matches.readableResponse(project, row) : row).toList(),
                historyRows(id, projectId, CHECKPOINT).stream().map(ResponseService::withRemark)
                        .map(row -> row.hasNonNull("matchReference") ? matches.readableResponse(project, row) : row).toList());
    }

    @Transactional
    public JsonNode restore(CurrentUser user, String id, Long version, Long sourceVersion, String kind, Long historyVersion) {
        if ((!CONFIRMATION.equals(kind) && !CHECKPOINT.equals(kind)) || historyVersion == null || historyVersion < 1) {
            throw new BusinessException(400, "请选择要恢复的确认版本或草稿检查点");
        }
        return write(user, id, version, sourceVersion, null, false, new Restore(kind, historyVersion), null);
    }

    @Transactional
    public JsonNode write(CurrentUser user,String id,Long version,Long sourceVersion,JsonNode patch,boolean confirm){
        return write(user, id, version, sourceVersion, patch, confirm, null, null);
    }

    @Transactional
    public JsonNode write(CurrentUser user, String id, Long version, Long sourceVersion, JsonNode patch, boolean confirm, MatchChoice choice) {
        return write(user, id, version, sourceVersion, patch, confirm, null, choice);
    }

    private JsonNode write(CurrentUser user, String id, Long version, Long sourceVersion, JsonNode patch,
            boolean confirm, Restore restore, MatchChoice choice) {
        var requirement=requirements.findById(id).orElseThrow(()->new BusinessException(404,"条款不存在"));
        var project=projects.findByIdForUpdate(requirement.getProjectId()).orElseThrow(()->new BusinessException(404,"项目不存在"));
        guard.requireProject(user,project);guard.requireActiveProject(project);
        work.requireEditable(project.getId(), requirement.getDocumentId());
        documents.findByIdForUpdate(requirement.getDocumentId()).orElseThrow(()->new BusinessException(404,"文档不存在"));
        requirement=requirements.findByDocumentIdForUpdate(requirement.getDocumentId()).stream().filter(r->id.equals(r.getId())).findFirst().orElseThrow(()->new BusinessException(409,"条款已重新解析，请刷新"));
        if(sourceVersion==null||!sourceVersion.equals(requirement.getVersion())) {
            throw new BusinessException(409,"来源版本已变化，请刷新后重试");
        }
        var records=decodeRows(responseRecords.lockResponse(id, project.getId()));
        ObjectNode row=records.isEmpty()?json.createObjectNode().put("id",id).put("version",Math.max(1,requirement.getVersion())):(ObjectNode)records.get(0).deepCopy();
        if(version==null||version!=row.path("version").asLong(1)) {
            throw new BusinessException(409,"应答版本已变化，请刷新后重试");
        }
        foldConditions(row);
        foldRemark(row);
        boolean sr=user.roles().stream().anyMatch(r->r.buId().equals(project.getBuId())&&r.role().equals("SR"));
        boolean tech=user.roles().stream().anyMatch(r->r.buId().equals(project.getBuId())&&Set.of("TECH","APPROVER").contains(r.role()));
        var profile=profiles.findByBuIdAndUserId(project.getBuId(),user.id());
        if(user.systemAdmin()||(!sr&&!tech)||profile!=null&&!profile.isEnabled()||!sr&&(profile==null||!profile.isCanConfirm())) {
            throw new BusinessException(403,"当前业务角色无应答操作资格");
        }
        String assignedConfirmer=requirement.getConfirmationAssigneeId();
        String assignee=assignedConfirmer==null?row.path("confirmationAssigneeId").asText(""):assignedConfirmer;
        if(assignee.isBlank()) {
            assignee=confirmationAssignments.defaultAssigneeId(project);
        }
        if((confirm||!sr)&&!user.id().equals(assignee)) {
            throw new BusinessException(403,"当前账号不是本条确认人");
        }
        var projectReviews=decodeRows(responseRecords.lockReviews(project.getId()));
        boolean explicitlyAssigned=assignedConfirmer!=null||row.path("confirmationAssignmentSource").asText().equals("explicit");
        if(!explicitlyAssigned&&projectReviews.stream().anyMatch(r->id.equals(r.path("requirementId").asText())&&!Set.of("clarification","deviation").contains(r.path("kind").asText())&&!r.path("status").asText().equals("已取消")&&r.path("reviewerIds").isArray())) {
            throw new BusinessException(409,"本条由评审人共同确认，评审确认流程尚未接通");
        }
        var reviews=projectReviews.stream()
            .filter(r->id.equals(r.path("requirementId").asText())&&!Set.of("已关闭","已取消").contains(r.path("status").asText()))
            .filter(r->confirm||!"deviation".equals(r.path("kind").asText())).toList();
        if(!reviews.isEmpty()) {
            throw new BusinessException(409,"本条存在未关闭评审或澄清，请先完成处理");
        }
        if(!row.path("pendingReviewProposal").isMissingNode()&&!row.path("pendingReviewProposal").isNull()) {
            throw new BusinessException(409,"请先核对评审建议");
        }

        String projectId = project.getId();
        var previous = latestConfirmation(row, requirement, projectId);
        previous.ifPresent(saved -> row.put("confirmationVersion", saved.path("confirmationVersion").asLong()));
        if (restore != null) {
            var saved = decodeRows(responseRecords.findHistoryEntry(id, projectId, restore.kind(), restore.version())).stream().findFirst()
                    .orElseThrow(() -> new BusinessException(404, "该条款的历史版本不存在"));
            if (!records.isEmpty() && !isConfirmed(row)) {
                var checkpoint = row.deepCopy().put("checkpointVersion", version).put("checkpointBy", user.displayName())
                        .put("checkpointAt", Instant.now().toString());
                insertHistory(id, projectId, CHECKPOINT, version, checkpoint);
            }
            if (saved.hasNonNull("matchReference") && matches.readableResponse(project, saved).path("restrictedMatchReference").asBoolean()) {
                throw new BusinessException(403, "历史应答的采纳依据已不可访问");
            }
            for (String field : ANSWER_FIELDS) row.put(field, saved.path(field).asText(""));
            row.put("draft", answerDraft(saved));
            row.put("remark", answerRemark(saved));
            copyFields(saved, row, List.of("matchReference"));
            row.remove("matchReferenceInvalidatedAt");
            row.remove(RESTORE_FIELDS);
            if (CONFIRMATION.equals(restore.kind())) {
                row.put("restoredFromVersion", restore.version()).put("restoredBy", user.displayName())
                        .put("restoredById", user.id()).put("restoredAt", Instant.now().toString());
            } else {
                copyFields(saved, row, RESTORE_FIELDS);
            }
        } else if(patch!=null&&!patch.isNull()){
            if(!patch.isObject()) {
                throw new BusinessException(400,"应答字段格式不正确");
            }
            var fields=patch.fields();
            while(fields.hasNext()){
                var field=fields.next();
                String key = field.getKey();
                if ("reason".equals(key)) {
                    if (patch.has("remark")) {
                        continue;
                    }
                    key = "remark";
                }
                if((!"original".equals(key)&&!"conditions".equals(key)
                        &&!ANSWER_FIELDS.contains(key))||!field.getValue().isTextual()) {
                    throw new BusinessException(400,"不允许修改该应答字段");
                }
                if(key.equals("original")){
                    if(!field.getValue().asText().equals(requirement.getOriginalText())) {
                        throw new BusinessException(400,"客户原文请通过来源修正功能修改");
                    }
                }else {
                    row.set(key,field.getValue());
                }
            }
            foldConditions(row);
            if (isConfirmed(row) && !sameAnswerFields(records.get(0), row)) {
                row.remove(RESTORE_FIELDS);
            }
        }
        if (choice != null && (choice.matchRunId() != null || choice.candidateId() != null)) {
            if (choice.detachMatchReason() != null) {
                throw new BusinessException(400, "采纳与解除依据须分别操作");
            }
            row.set("matchReference", matches.adopt(project, requirement, choice.matchRunId(), choice.candidateId()));
            row.remove("matchReferenceInvalidatedAt");
        }
        if (choice != null && choice.detachMatchReason() != null) {
            String reason = choice.detachMatchReason().trim();
            if (confirm || reason.isBlank() || reason.length() > 900 || !row.hasNonNull("matchReference")) {
                throw new BusinessException(400, "解除依据须填写原因并重新确认应答");
            }
            row.remove(List.of("matchReference", "matchReferenceInvalidatedAt"));
            audit.successInBu(user.id(), project.getBuId(), "解除应答比对依据", "requirement", id, reason);
        }
        if(confirm){
            if (row.hasNonNull("matchReference")) {
                matches.requireReference(project, requirement, row.path("matchReference"));
            }
            if ("不满足".equals(row.path("conclusion").asText()) && !deviations.reviewedContradiction(project, requirement, row)) {
                throw new BusinessException(409, "不满足结论须先保存草稿并完成本条技术评审");
            }
            if(requirement.getOriginalText()==null||requirement.getOriginalText().isBlank()) {
                throw new BusinessException(400,"客户要求原文不能为空");
            }
            if(!Set.of("Comply","有条件 Comply","不满足","不适用").contains(row.path("conclusion").asText())) {
                throw new BusinessException(400,"请选择明确的最终结论");
            }
            if(row.path("removedFromSource").asBoolean()&&!row.path("conclusion").asText().equals("不适用")) {
                throw new BusinessException(400,"已删除条款须确认不适用");
            }
            row.put("status","已确认").put("confirmedBy",user.displayName()).put("confirmedById",user.id()).put("confirmedAt",Instant.now().toString()).put("needsReview",false).put("sourceRevision",false).put("sourceCorrected",false);
            var snapshot = row.deepCopy();
            bindSource(snapshot, requirement);
            if (previous.filter(saved -> sameAnswerFields(saved, snapshot) && sameFields(saved, snapshot, SOURCE_FIELDS)
                    && saved.path("matchReference").equals(snapshot.path("matchReference"))).isEmpty()) {
                long next = row.path("confirmationVersion").asLong(0) + 1;
                row.put("confirmationVersion", next);
                snapshot.put("confirmationVersion", next).put("sourceRequirementVersion", sourceVersion);
                insertHistory(id, projectId, CONFIRMATION, next, snapshot);
            }
        }else{
            row.put("status","待确认");row.remove(List.of("confirmedAt","confirmedBy","confirmedById"));
        }
        row.put("version",version+1).put("sourceRequirementVersion",sourceVersion);
        responseRecords.upsertResponse(id, project.getId(), row.toString());
        // Frozen snapshots remain historical; live scope versions no longer match after this write.
        if (restore != null) {
            String label = CONFIRMATION.equals(restore.kind()) ? "恢复条款确认版本" : "恢复草稿检查点";
            String source = CONFIRMATION.equals(restore.kind()) ? "V" : "R";
            audit.successInBu(user.id(), project.getBuId(), label, "requirement", id, "恢复自 " + source + restore.version() + " · 草稿待确认");
        } else {
            String detail = confirm ? "应答版本 V" + row.path("confirmationVersion").asLong() : "草稿修订 R" + (version + 1);
            audit.successInBu(user.id(), project.getBuId(), confirm ? "确认要求" : "保存应答草稿", "requirement", id, detail);
        }
        return row.hasNonNull("matchReference") ? matches.readableResponse(project, row) : row;
    }

    private List<JsonNode> historyRows(String id, String projectId, String kind) {
        return decodeRows(responseRecords.listHistory(id, projectId, kind));
    }

    private Optional<JsonNode> latestConfirmation(JsonNode row, Requirement requirement, String projectId) {
        String id = requirement.getId();
        var versions = decodeRows(responseRecords.findLatestHistory(id, projectId, CONFIRMATION));
        if (!versions.isEmpty()) {
            return Optional.of(versions.get(0));
        }
        var legacy = legacyConfirmation(row, requirement);
        legacy.ifPresent(saved -> insertHistory(id, projectId, CONFIRMATION, saved.path("confirmationVersion").asLong(), saved));
        return legacy;
    }

    private Optional<JsonNode> legacyConfirmation(JsonNode row, Requirement requirement) {
        if (!isConfirmed(row) || row.path("confirmedAt").asText().isBlank()) {
            return Optional.empty();
        }
        ObjectNode saved = row.deepCopy();
        saved.put("confirmationVersion", Math.max(1, row.path("confirmationVersion").asLong(row.path("version").asLong(1))));
        if (row.path("sourceRequirementVersion").asLong(-1) == requirement.getVersion()) {
            bindSource(saved, requirement);
        }
        return Optional.of(saved);
    }

    private void insertHistory(String id, String projectId, String kind, long version, JsonNode payload) {
        responseRecords.insertHistory(id, projectId, kind, version, payload.toString());
    }

    private static boolean isConfirmed(JsonNode row) {
        return "已确认".equals(row.path("status").asText());
    }

    private static void bindSource(ObjectNode snapshot, Requirement requirement) {
        snapshot.put("original", requirement.getOriginalText()).put("sourceDocumentId", requirement.getDocumentId())
                .put("sourceRequirementText", requirement.getRequirementText());
    }

    static String answerDraft(JsonNode response) {
        String draft = response.path("draft").asText("");
        String conditions = response.path("conditions").asText("").trim();
        if (conditions.isEmpty()) {
            return draft;
        }
        String line = "适用条件：" + conditions;
        return draft.contains(line) ? draft : draft.isEmpty() ? line : draft + "\n" + line;
    }

    private static void foldConditions(ObjectNode row) {
        if (row.has("conditions")) {
            row.put("draft", answerDraft(row));
            row.remove("conditions");
        }
    }

    private static boolean sameAnswerFields(JsonNode left, JsonNode right) {
        return answerDraft(left).equals(answerDraft(right))
                && answerRemark(left).equals(answerRemark(right))
                && sameFields(left, right, List.of("conclusion", "evidence"));
    }

    static String answerRemark(JsonNode response) {
        return response.path("remark").asText(response.path("reason").asText(""));
    }

    private static JsonNode withRemark(JsonNode response) {
        if (response instanceof ObjectNode && response.has("reason")) {
            ObjectNode copy = response.deepCopy();
            foldRemark(copy);
            return copy;
        }
        return response;
    }

    private static void foldRemark(ObjectNode response) {
        if (response.has("reason")) {
            response.put("remark", answerRemark(response));
            response.remove("reason");
        }
    }

    private static boolean sameFields(JsonNode left, JsonNode right, List<String> fields) {
        return fields.stream().allMatch(field -> left.path(field).asText("").equals(right.path(field).asText("")));
    }

    private static void copyFields(JsonNode from, ObjectNode to, List<String> fields) {
        for (String field : fields) {
            if (from.hasNonNull(field)) {
                to.set(field, from.get(field));
            } else {
                to.remove(field);
            }
        }
    }
}
