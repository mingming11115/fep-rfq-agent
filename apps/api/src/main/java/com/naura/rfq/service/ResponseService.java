package com.naura.rfq.service;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.*;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.security.*;
import java.time.Instant;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ResponseService {
    private static final String CONFIRMATION = "confirmation";
    private static final String CHECKPOINT = "checkpoint";
    private static final List<String> ANSWER_FIELDS = List.of("conclusion", "draft", "conditions", "reason", "evidence");
    private static final List<String> SOURCE_FIELDS = List.of("original", "sourceDocumentId", "sourceRequirementText", "sourceConditions");
    private static final List<String> RESTORE_FIELDS = List.of("restoredFromVersion", "restoredBy", "restoredById", "restoredAt");

    public record History(List<JsonNode> versions, List<JsonNode> checkpoints) {}
    private record Restore(String kind, long version) {}

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final RequirementMapper requirements;
    private final ProjectMapper projects;
    private final CustomerDocumentMapper documents;
    private final BuMemberProfileMapper profiles;
    private final AccessGuard guard;
    private final AuditService audit;
    private final ConfirmationAssignmentService confirmationAssignments;
    private JsonNode decode(String value){try{return json.readTree(value);}catch(Exception e){throw new IllegalStateException("业务记录格式异常",e);}}
    private List<JsonNode> rows(String sql,Object... args){return jdbc.queryForList(sql,String.class,args).stream().map(this::decode).toList();}

    @Transactional(readOnly = true)
    public History history(CurrentUser user, String id) {
        var requirement = requirements.findById(id).orElseThrow(() -> new BusinessException(404, "条款不存在"));
        String projectId = requirement.getProjectId();
        guard.requireProject(user, projects.findById(projectId).orElse(null));
        var versions = historyRows(id, projectId, CONFIRMATION);
        if (versions.isEmpty()) {
            versions = rows("select payload from requirement_response where requirement_id=? and project_id=?", id, projectId)
                    .stream().findFirst().flatMap(row -> legacyConfirmation(row, requirement)).stream().toList();
        }
        return new History(versions, historyRows(id, projectId, CHECKPOINT));
    }

    @Transactional
    public JsonNode restore(CurrentUser user, String id, Long version, Long sourceVersion, String kind, Long historyVersion) {
        if ((!CONFIRMATION.equals(kind) && !CHECKPOINT.equals(kind)) || historyVersion == null || historyVersion < 1) {
            throw new BusinessException(400, "请选择要恢复的确认版本或草稿检查点");
        }
        return write(user, id, version, sourceVersion, null, false, new Restore(kind, historyVersion));
    }

    @Transactional
    public JsonNode write(CurrentUser user,String id,Long version,Long sourceVersion,JsonNode patch,boolean confirm){
        return write(user, id, version, sourceVersion, patch, confirm, null);
    }

    private JsonNode write(CurrentUser user, String id, Long version, Long sourceVersion, JsonNode patch,
            boolean confirm, Restore restore) {
        var requirement=requirements.findById(id).orElseThrow(()->new BusinessException(404,"条款不存在"));
        var project=projects.findByIdForUpdate(requirement.getProjectId()).orElseThrow(()->new BusinessException(404,"项目不存在"));
        guard.requireProject(user,project);guard.requireActiveProject(project);
        documents.findByIdForUpdate(requirement.getDocumentId()).orElseThrow(()->new BusinessException(404,"文档不存在"));
        requirement=requirements.findByDocumentIdForUpdate(requirement.getDocumentId()).stream().filter(r->id.equals(r.getId())).findFirst().orElseThrow(()->new BusinessException(409,"条款已重新解析，请刷新"));
        if(sourceVersion==null||!sourceVersion.equals(requirement.getVersion()))throw new BusinessException(409,"来源版本已变化，请刷新后重试");
        var records=rows("select payload from requirement_response where requirement_id=? and project_id=? for update",id,project.getId());
        ObjectNode row=records.isEmpty()?json.createObjectNode().put("id",id).put("version",Math.max(1,requirement.getVersion())):(ObjectNode)records.get(0).deepCopy();
        if(version==null||version!=row.path("version").asLong(1))throw new BusinessException(409,"应答版本已变化，请刷新后重试");
        boolean sr=user.roles().stream().anyMatch(r->r.buId().equals(project.getBuId())&&r.role().equals("SR"));
        boolean tech=user.roles().stream().anyMatch(r->r.buId().equals(project.getBuId())&&Set.of("TECH","APPROVER").contains(r.role()));
        var profile=profiles.findByBuIdAndUserId(project.getBuId(),user.id());
        if(user.systemAdmin()||(!sr&&!tech)||profile!=null&&!profile.isEnabled()||!sr&&(profile==null||!profile.isCanConfirm()))throw new BusinessException(403,"当前业务角色无应答操作资格");
        String assignedConfirmer=requirement.getConfirmationAssigneeId();
        String assignee=assignedConfirmer==null?row.path("confirmationAssigneeId").asText(""):assignedConfirmer;
        if(assignee.isBlank())assignee=confirmationAssignments.defaultAssigneeId(project);
        if((confirm||!sr)&&!user.id().equals(assignee))throw new BusinessException(403,"当前账号不是本条确认人");
        var projectReviews=rows("select payload from response_review where project_id=? for update",project.getId());
        boolean explicitlyAssigned=assignedConfirmer!=null||row.path("confirmationAssignmentSource").asText().equals("explicit");
        if(!explicitlyAssigned&&projectReviews.stream().anyMatch(r->id.equals(r.path("requirementId").asText())&&!r.path("kind").asText().equals("clarification")&&!r.path("status").asText().equals("已取消")&&r.path("reviewerIds").isArray()))throw new BusinessException(409,"本条由评审人共同确认，评审确认流程尚未接通");
        var reviews=projectReviews.stream()
            .filter(r->id.equals(r.path("requirementId").asText())&&!Set.of("已关闭","已取消").contains(r.path("status").asText())).toList();
        if(!reviews.isEmpty())throw new BusinessException(409,"本条存在未关闭评审或澄清，请先完成处理");
        if(!row.path("pendingReviewProposal").isMissingNode()&&!row.path("pendingReviewProposal").isNull())throw new BusinessException(409,"请先核对评审建议");

        String projectId = project.getId();
        var previous = latestConfirmation(row, requirement, projectId);
        previous.ifPresent(saved -> row.put("confirmationVersion", saved.path("confirmationVersion").asLong()));
        if (restore != null) {
            var saved = rows("select payload from response_confirmation_history where requirement_id=? and project_id=? and kind=? and entry_version=?",
                    id, projectId, restore.kind(), restore.version()).stream().findFirst()
                    .orElseThrow(() -> new BusinessException(404, "该条款的历史版本不存在"));
            if (!records.isEmpty() && !isConfirmed(row)) {
                var checkpoint = row.deepCopy().put("checkpointVersion", version).put("checkpointBy", user.displayName())
                        .put("checkpointAt", Instant.now().toString());
                insertHistory(id, projectId, CHECKPOINT, version, checkpoint);
            }
            for (String field : ANSWER_FIELDS) row.put(field, saved.path(field).asText(""));
            row.remove(RESTORE_FIELDS);
            if (CONFIRMATION.equals(restore.kind())) {
                row.put("restoredFromVersion", restore.version()).put("restoredBy", user.displayName())
                        .put("restoredById", user.id()).put("restoredAt", Instant.now().toString());
            } else {
                copyFields(saved, row, RESTORE_FIELDS);
            }
        } else if(patch!=null&&!patch.isNull()){
            if(!patch.isObject())throw new BusinessException(400,"应答字段格式不正确");
            var fields=patch.fields();
            while(fields.hasNext()){
                var field=fields.next();
                if((!"original".equals(field.getKey())&&!ANSWER_FIELDS.contains(field.getKey()))||!field.getValue().isTextual())throw new BusinessException(400,"不允许修改该应答字段");
                if(field.getKey().equals("original")){
                    if(!field.getValue().asText().equals(requirement.getOriginalText()))throw new BusinessException(400,"客户原文请通过来源修正功能修改");
                }else row.set(field.getKey(),field.getValue());
            }
            if (isConfirmed(row) && !sameFields(records.get(0), row, ANSWER_FIELDS)) row.remove(RESTORE_FIELDS);
        }
        if(confirm){
            if(requirement.getOriginalText()==null||requirement.getOriginalText().isBlank())throw new BusinessException(400,"客户要求原文不能为空");
            if(!Set.of("Comply","有条件 Comply","不满足","不适用").contains(row.path("conclusion").asText()))throw new BusinessException(400,"请选择明确的最终结论");
            if(row.path("removedFromSource").asBoolean()&&!row.path("conclusion").asText().equals("不适用"))throw new BusinessException(400,"已删除条款须确认不适用");
            row.put("status","已确认").put("confirmedBy",user.displayName()).put("confirmedById",user.id()).put("confirmedAt",Instant.now().toString()).put("needsReview",false).put("sourceRevision",false).put("sourceCorrected",false);
            var snapshot = row.deepCopy();
            bindSource(snapshot, requirement);
            if (previous.filter(saved -> sameFields(saved, snapshot, ANSWER_FIELDS) && sameFields(saved, snapshot, SOURCE_FIELDS)).isEmpty()) {
                long next = row.path("confirmationVersion").asLong(0) + 1;
                row.put("confirmationVersion", next);
                snapshot.put("confirmationVersion", next).put("sourceRequirementVersion", sourceVersion);
                insertHistory(id, projectId, CONFIRMATION, next, snapshot);
            }
        }else{
            row.put("status","待确认");row.remove(List.of("confirmedAt","confirmedBy","confirmedById"));
        }
        row.put("version",version+1).put("sourceRequirementVersion",sourceVersion);
        jdbc.update("insert into requirement_response(requirement_id,project_id,payload) values (?,?,?) on duplicate key update payload=values(payload),updated_at=current_timestamp",id,project.getId(),row.toString());
        // Frozen snapshots remain historical; live scope versions no longer match after this write.
        if (restore != null) {
            String label = CONFIRMATION.equals(restore.kind()) ? "恢复条款确认版本" : "恢复草稿检查点";
            String source = CONFIRMATION.equals(restore.kind()) ? "V" : "R";
            audit.successInBu(user.id(), project.getBuId(), label, "requirement", id, "恢复自 " + source + restore.version() + " · 草稿待确认");
        } else {
            String detail = confirm ? "应答版本 V" + row.path("confirmationVersion").asLong() : "草稿修订 R" + (version + 1);
            audit.successInBu(user.id(), project.getBuId(), confirm ? "确认要求" : "保存应答草稿", "requirement", id, detail);
        }
        return row;
    }

    private List<JsonNode> historyRows(String id, String projectId, String kind) {
        return rows("select payload from response_confirmation_history where requirement_id=? and project_id=? and kind=? order by entry_version desc",
                id, projectId, kind);
    }

    private Optional<JsonNode> latestConfirmation(JsonNode row, Requirement requirement, String projectId) {
        String id = requirement.getId();
        var versions = rows("select payload from response_confirmation_history where requirement_id=? and project_id=? and kind=? order by entry_version desc limit 1",
                id, projectId, CONFIRMATION);
        if (!versions.isEmpty()) return Optional.of(versions.get(0));
        var legacy = legacyConfirmation(row, requirement);
        legacy.ifPresent(saved -> insertHistory(id, projectId, CONFIRMATION, saved.path("confirmationVersion").asLong(), saved));
        return legacy;
    }

    private Optional<JsonNode> legacyConfirmation(JsonNode row, Requirement requirement) {
        if (!isConfirmed(row) || row.path("confirmedAt").asText().isBlank()) return Optional.empty();
        ObjectNode saved = row.deepCopy();
        saved.put("confirmationVersion", Math.max(1, row.path("confirmationVersion").asLong(row.path("version").asLong(1))));
        if (row.path("sourceRequirementVersion").asLong(-1) == requirement.getVersion()) bindSource(saved, requirement);
        return Optional.of(saved);
    }

    private void insertHistory(String id, String projectId, String kind, long version, JsonNode payload) {
        jdbc.update("insert into response_confirmation_history(requirement_id,project_id,kind,entry_version,payload) values (?,?,?,?,?)",
                id, projectId, kind, version, payload.toString());
    }

    private static boolean isConfirmed(JsonNode row) {
        return "已确认".equals(row.path("status").asText());
    }

    private static void bindSource(ObjectNode snapshot, Requirement requirement) {
        snapshot.put("original", requirement.getOriginalText()).put("sourceDocumentId", requirement.getDocumentId())
                .put("sourceRequirementText", requirement.getRequirementText()).put("sourceConditions", requirement.getConditionsText());
    }

    private static boolean sameFields(JsonNode left, JsonNode right, List<String> fields) {
        return fields.stream().allMatch(field -> left.path(field).asText("").equals(right.path(field).asText("")));
    }

    private static void copyFields(JsonNode from, ObjectNode to, List<String> fields) {
        for (String field : fields) {
            if (from.hasNonNull(field)) to.set(field, from.get(field));
            else to.remove(field);
        }
    }
}
