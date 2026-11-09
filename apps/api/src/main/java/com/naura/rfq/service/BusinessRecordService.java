package com.naura.rfq.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service @RequiredArgsConstructor
@Slf4j
public class BusinessRecordService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final ProjectMapper projects;
    private final AccessGuard guard;
    private final ConfirmationAssignmentService confirmationAssignments;
    private final ProjectWorkScope work;
    private final RequirementMatchService matches;
    private JsonNode decode(String payload) {
        try {
            return json.readTree(payload);
        } catch (Exception e) {
            log.error("解析数据库业务记录失败 errorType={}", e.getClass().getSimpleName());
            throw new IllegalStateException("数据库业务记录格式异常", e);
        }
    }
    private List<JsonNode> rows(String sql,Object... args){return jdbc.query(sql,(rs,n)->decode(rs.getString("payload")),args);}
    public Map<String,Object> workflow(CurrentUser user,String id){
        var project=projects.findById(id).orElse(null);
        guard.requireProject(user,project);
        var config=rows("select payload from project_response_config where project_id=?",id);
        return Map.of("metadata",config.isEmpty()?json.createObjectNode():config.get(0),
            "workVersion",work.version(id), "replacements",work.replacements(id),
            "participantIds",jdbc.queryForList("select user_id from project_member where project_id=? and enabled=1 order by user_id",String.class,id),
            "defaultConfirmationAssigneeId",confirmationAssignments.defaultAssigneeId(project),
            "responses",rows("select payload from requirement_response where project_id=? order by requirement_id",id).stream()
                .map(row -> matches.readableResponse(project, row)).toList(),
            "reviews",rows("select payload from response_review where project_id=? order by id",id),
            "snapshots",rows("select payload from response_snapshot where project_id=? order by id",id).stream()
                .map(row -> readableSnapshot(project, row)).toList());
    }

    private JsonNode readableSnapshot(Project project, JsonNode record) {
        if (!(record instanceof ObjectNode snapshot) || !snapshot.path("rows").isArray()) {
            return record;
        }
        var safe = json.createArrayNode();
        boolean restricted = false;
        for (var row : snapshot.path("rows")) {
            var readable = matches.readableResponse(project, row);
            restricted |= readable.path("restrictedMatchReference").asBoolean();
            safe.add(readable);
        }
        if (!restricted) {
            return record;
        }
        var copy = snapshot.deepCopy().put("stale", true);
        copy.set("rows", safe);
        copy.remove(List.of("approvalScope", "approvalFingerprint"));
        return copy;
    }
    private boolean readable(CurrentUser user,JsonNode row){
        String projectId=KnowledgePublicationAccess.recordProjectId(row);
        if(projectId.isBlank()) {
            return !row.path("scope").asText().equals("仅当前项目");
        }
        try {
            guard.requireProject(user, projects.findById(projectId).orElse(null));
            return true;
        } catch (BusinessException denied) {
            log.error("检查业务记录读取权限失败", denied);
            return false;
        }
    }
    public Map<String,Object> resources(CurrentUser user,String buId){
        guard.requireBu(user,buId);
        var result=new LinkedHashMap<String,Object>();
        for(var entry:Map.of("models","model_definition","processes","process_definition","capabilities","capability_record","knowledge","`standard-reply-record`","evidence","evidence_record","historyDocuments","history_document","historyClauses","`history-rfq-record`").entrySet())
            result.put(entry.getKey(),rows("select payload from "+entry.getValue()+" where bu_id=? order by id,version",buId).stream().filter(row->readable(user,row)).toList());
        var catalog=rows("select payload from knowledge_group_catalog where bu_id=?",buId);
        result.put("catalog",catalog.isEmpty()?json.nullNode():catalog.get(0));
        return result;
    }
}
