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
    private static final List<String> ANSWER_FIELDS = List.of("conclusion", "draft", "remark", "evidence");
    /** 应答尚未确认，且没有未关闭的评审事项。 */
    static final String PENDING = "待处理";
    /** 存在未关闭的评审事项，确认动作被阻断。 */
    static final String REVIEWING = "评审中";
    /** 已通过确认，可作为定稿与正式导出的依据。 */
    static final String CONFIRMED = "已确认";
    /** 不再阻塞确认的评审状态。 */
    private static final List<String> CLOSED_REVIEW_STATUSES = List.of("已关闭", "已取消");
    /** 历史数据里的旧取值，读取时按待处理处理。 */
    private static final String LEGACY_PENDING = "待确认";

    public record MatchChoice(String matchRunId, String candidateId, String detachMatchReason) {}

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

    @Transactional
    public JsonNode write(CurrentUser user,String id,Long version,Long sourceVersion,JsonNode patch,boolean confirm){
        return write(user, id, version, sourceVersion, patch, confirm, null);
    }

    @Transactional
    public JsonNode write(CurrentUser user, String id, Long version, Long sourceVersion, JsonNode patch,
            boolean confirm, MatchChoice choice) {
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
            .filter(r->confirm?blocksConfirmation(r):!"deviation".equals(r.path("kind").asText())).toList();
        if(!reviews.isEmpty()) {
            throw new BusinessException(409,"本条存在未关闭评审或澄清，请先完成处理");
        }
        if(!row.path("pendingReviewProposal").isMissingNode()&&!row.path("pendingReviewProposal").isNull()) {
            throw new BusinessException(409,"请先核对评审建议");
        }

        if(patch!=null&&!patch.isNull()){
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
            row.put("status",CONFIRMED).put("confirmedBy",user.displayName()).put("confirmedById",user.id()).put("confirmedAt",Instant.now().toString()).put("needsReview",false).put("sourceRevision",false).put("sourceCorrected",false);
        }else{
            boolean hasOpenReview=projectReviews.stream()
                .filter(r->id.equals(r.path("requirementId").asText()))
                .anyMatch(r->openReview(r)&&blocksConfirmation(r));
            row.put("status",hasOpenReview?REVIEWING:PENDING);
            row.remove(List.of("confirmedAt","confirmedBy","confirmedById"));
        }
        row.put("version",version+1).put("sourceRequirementVersion",sourceVersion);
        responseRecords.upsertResponse(id, project.getId(), row.toString());
        if(confirm){
            deviations.closeInformational(project, id);
        }
        String detail = confirm ? "应答版本 V" + (version + 1) : "草稿修订 R" + (version + 1);
        audit.successInBu(user.id(), project.getBuId(), confirm ? "确认要求" : "保存应答草稿", "requirement", id, detail);
        return row.hasNonNull("matchReference") ? matches.readableResponse(project, row) : row;
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

    static String answerRemark(JsonNode response) {
        return response.path("remark").asText(response.path("reason").asText(""));
    }

    private static void foldRemark(ObjectNode response) {
        if (response.has("reason")) {
            response.put("remark", answerRemark(response));
            response.remove("reason");
        }
    }

    /** 评审事项是否仍未关闭。 */
    static boolean openReview(JsonNode review) {
        return !CLOSED_REVIEW_STATUSES.contains(review.path("status").asText());
    }

    /** 仅登记型偏离（未分派评审人且不需要技术评审）只作展示，不阻断确认；其余评审事项仍阻断。 */
    static boolean blocksConfirmation(JsonNode review) {
        if (!"deviation".equals(review.path("kind").asText())) {
            return true;
        }
        return !review.path("reviewerIds").isEmpty() || review.path("technicalReviewRequired").asBoolean();
    }

    /** 把存量字面值归一为新取值。 */
    static String normalize(String status) {
        return LEGACY_PENDING.equals(status) ? PENDING : status;
    }

    /** 关闭评审后重新决议：仍有未关闭事项即评审中，否则已确认保持已确认，其余回落待处理。 */
    static String resolve(String current, boolean hasOpenReview) {
        if (hasOpenReview) {
            return REVIEWING;
        }
        return CONFIRMED.equals(normalize(current)) ? CONFIRMED : PENDING;
    }
}
