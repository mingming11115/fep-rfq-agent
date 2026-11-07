package com.naura.rfq.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service @RequiredArgsConstructor
public class BusinessRecordService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final ProjectMapper projects;
    private final AccessGuard guard;
    private final ConfirmationAssignmentService confirmationAssignments;
    private JsonNode decode(String payload){
        try{return json.readTree(payload);}catch(Exception e){throw new IllegalStateException("数据库业务记录格式异常",e);}
    }
    private List<JsonNode> rows(String sql,Object... args){return jdbc.query(sql,(rs,n)->decode(rs.getString("payload")),args);}
    public Map<String,Object> workflow(CurrentUser user,String id){
        var project=projects.findById(id).orElse(null);
        guard.requireProject(user,project);
        var config=rows("select payload from project_response_config where project_id=?",id);
        return Map.of("metadata",config.isEmpty()?json.createObjectNode():config.get(0),
            "defaultConfirmationAssigneeId",confirmationAssignments.defaultAssigneeId(project),
            "responses",rows("select payload from requirement_response where project_id=? order by requirement_id",id),
            "reviews",rows("select payload from response_review where project_id=? order by id",id),
            "snapshots",rows("select payload from response_snapshot where project_id=? order by id",id));
    }
    private boolean readable(CurrentUser user,JsonNode row){
        String projectId=row.path("projectId").asText(row.path("sourceProjectId").asText());
        if(projectId.isBlank()&&java.util.Set.of("草稿","待审核","退回","候选").contains(row.path("status").asText())){
            var matcher=java.util.regex.Pattern.compile("MYSQL-DEMO-\\d{3}").matcher(row.path("source").asText()+" "+row.path("sourceLocation").asText());
            if(matcher.find())projectId=matcher.group();
        }
        if(projectId.isBlank())return !row.path("scope").asText().equals("仅当前项目");
        try{guard.requireProject(user,projects.findById(projectId).orElse(null));return true;}
        catch(BusinessException denied){return false;}
    }
    public Map<String,Object> resources(CurrentUser user,String buId){
        guard.requireBu(user,buId);
        var result=new LinkedHashMap<String,Object>();
        for(var entry:Map.of("models","model_definition","processes","process_definition","capabilities","capability_record","knowledge","knowledge_record","evidence","evidence_record","historyDocuments","history_document","historyClauses","history_clause").entrySet())
            result.put(entry.getKey(),rows("select payload from "+entry.getValue()+" where bu_id=? order by id,version",buId).stream().filter(row->readable(user,row)).toList());
        var catalog=rows("select payload from knowledge_group_catalog where bu_id=?",buId);
        result.put("catalog",catalog.isEmpty()?json.nullNode():catalog.get(0));
        return result;
    }
}
