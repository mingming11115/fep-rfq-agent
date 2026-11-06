package com.naura.rfq.service;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.*;
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
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final RequirementMapper requirements;
    private final ProjectMapper projects;
    private final CustomerDocumentMapper documents;
    private final BuMemberProfileMapper profiles;
    private final AccessGuard guard;
    private final AuditService audit;
    private JsonNode decode(String value){try{return json.readTree(value);}catch(Exception e){throw new IllegalStateException("业务记录格式异常",e);}}
    private List<JsonNode> rows(String sql,Object... args){return jdbc.queryForList(sql,String.class,args).stream().map(this::decode).toList();}

    @Transactional
    public JsonNode write(CurrentUser user,String id,Long version,Long sourceVersion,JsonNode patch,boolean confirm){
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
        String assignee=row.path("confirmationAssigneeId").asText("");
        if(assignee.isBlank())assignee=project.getOwnerId();
        if((confirm||!sr)&&!user.id().equals(assignee))throw new BusinessException(403,"当前账号不是本条确认人");
        var projectReviews=rows("select payload from response_review where project_id=? for update",project.getId());
        if(!row.path("confirmationAssignmentSource").asText().equals("explicit")&&projectReviews.stream().anyMatch(r->id.equals(r.path("requirementId").asText())&&!r.path("kind").asText().equals("clarification")&&!r.path("status").asText().equals("已取消")&&r.path("reviewerIds").isArray()))throw new BusinessException(409,"本条由评审人共同确认，评审确认流程尚未接通");
        var reviews=projectReviews.stream()
            .filter(r->id.equals(r.path("requirementId").asText())&&!Set.of("已关闭","已取消").contains(r.path("status").asText())).toList();
        if(!reviews.isEmpty())throw new BusinessException(409,"本条存在未关闭评审或澄清，请先完成处理");
        if(!row.path("pendingReviewProposal").isMissingNode()&&!row.path("pendingReviewProposal").isNull())throw new BusinessException(409,"请先核对评审建议");
        if(patch!=null&&!patch.isNull()){
            if(!patch.isObject())throw new BusinessException(400,"应答字段格式不正确");
            var fields=patch.fields();
            while(fields.hasNext()){
                var field=fields.next();
                if(!Set.of("original","conclusion","draft","conditions","reason","evidence").contains(field.getKey())||!field.getValue().isTextual())throw new BusinessException(400,"不允许修改该应答字段");
                if(field.getKey().equals("original")){
                    if(!field.getValue().asText().equals(requirement.getOriginalText()))throw new BusinessException(400,"客户原文请通过来源修正功能修改");
                }else row.set(field.getKey(),field.getValue());
            }
        }
        if(confirm){
            if(requirement.getOriginalText()==null||requirement.getOriginalText().isBlank())throw new BusinessException(400,"客户要求原文不能为空");
            if(!Set.of("Comply","有条件 Comply","不满足","不适用").contains(row.path("conclusion").asText()))throw new BusinessException(400,"请选择明确的最终结论");
            if(row.path("removedFromSource").asBoolean()&&!row.path("conclusion").asText().equals("不适用"))throw new BusinessException(400,"已删除条款须确认不适用");
            row.put("status","已确认").put("confirmedBy",user.displayName()).put("confirmedById",user.id()).put("confirmedAt",Instant.now().toString()).put("needsReview",false).put("sourceRevision",false).put("sourceCorrected",false);
        }else{
            row.put("status","待确认");row.remove(List.of("confirmedAt","confirmedBy","confirmedById"));
        }
        row.put("version",version+1).put("sourceRequirementVersion",sourceVersion);
        jdbc.update("insert into requirement_response(requirement_id,project_id,payload) values (?,?,?) on duplicate key update payload=values(payload),updated_at=current_timestamp",id,project.getId(),row.toString());
        // Frozen snapshots remain historical; live scope versions no longer match after this write.
        audit.successInBu(user.id(),project.getBuId(),confirm?"确认要求":"保存应答草稿","requirement",id,"应答版本 V"+(version+1));
        return row;
    }
}
