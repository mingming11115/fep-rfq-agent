package com.naura.rfq.service;

import com.naura.rfq.mapper.ResponseMapper;
import com.naura.rfq.mapper.KnowledgeRecordMapper;
import com.naura.rfq.mapper.KnowledgeRecordMapper.Table;
import com.naura.rfq.mapper.ProjectMemberMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.integration.standardreply.KnowledgeIndexQueue.Status;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class BusinessRecordService {
    @Autowired
    private ResponseMapper responseRecords;
    @Autowired
    private KnowledgeRecordMapper knowledgeRecords;
    @Autowired
    private ProjectMemberMapper projectMembers;
    @Autowired
    private ObjectMapper json;
    @Autowired
    private ProjectMapper projects;
    @Autowired
    private AccessGuard guard;
    @Autowired
    private ConfirmationAssignmentService confirmationAssignments;
    @Autowired
    private ProjectWorkScope work;
    @Autowired
    private RequirementMatchService matches;
    private JsonNode decode(String payload) {
        try {
            return json.readTree(payload);
        } catch (Exception e) {
            log.error("解析数据库业务记录失败 errorType={}", e.getClass().getSimpleName());
            throw new IllegalStateException("数据库业务记录格式异常", e);
        }
    }
    private List<JsonNode> decodeRows(List<String> payloads) {
        return payloads.stream().map(this::decode).toList();
    }
    public Map<String,Object> workflow(CurrentUser user,String id){
        var project=projects.findById(id).orElse(null);
        guard.requireProject(user,project);
        var config=decodeRows(responseRecords.findConfig(id));
        return Map.of("metadata",config.isEmpty()?json.createObjectNode():config.get(0),
            "workVersion",work.version(id), "replacements",work.replacements(id),
            "participantIds",projectMembers.findEnabledUserIds(id),
            "defaultConfirmationAssigneeId",confirmationAssignments.defaultAssigneeId(project),
            "responses",decodeRows(responseRecords.listOrderedResponses(id)).stream()
                .map(row -> matches.readableResponse(project, row)).toList(),
            "reviews",decodeRows(responseRecords.listOrderedReviews(id)),
            "snapshots",decodeRows(responseRecords.listSnapshots(id)).stream()
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
        return guard.canAccessProject(user, projects.findById(projectId).orElse(null));
    }
    public Map<String,Object> resources(CurrentUser user,String buId){
        guard.requireBu(user,buId);
        var result=new LinkedHashMap<String,Object>();
        for(var entry:Map.of("models", Table.MODEL, "processes", Table.PROCESS, "capabilities", Table.CAPABILITY,
                "knowledge", Table.STANDARD_REPLY, "evidence", Table.EVIDENCE, "historyDocuments", Table.HISTORY_DOCUMENT).entrySet()) {
            boolean hasDeletedVersions = List.of("knowledge", "historyDocuments").contains(entry.getKey());
            result.put(entry.getKey(),decodeRows(knowledgeRecords.listPayloads(entry.getValue(), buId)).stream()
                    .filter(row -> !hasDeletedVersions || !"已删除".equals(row.path("status").asText()))
                    .filter(row->readable(user,row)).toList());
        }
        result.put("historyClauses", historyClauses(user, buId));
        var catalog=decodeRows(knowledgeRecords.findGroupCatalog(buId));
        result.put("catalog",catalog.isEmpty()?json.nullNode():catalog.get(0));
        return result;
    }

    private List<JsonNode> historyClauses(CurrentUser user, String buId) {
        return knowledgeRecords.listHistoryClauses(buId).stream().map(row -> {
                    var payload = decode(row.payload());
                    if (payload instanceof ObjectNode object) {
                        Status.from(row.operation(), row.synced(), row.hasError())
                                .annotate(object);
                    }
                    return payload;
                })
                .filter(row -> !"已删除".equals(row.path("status").asText()))
                .filter(row -> readable(user, row)).toList();
    }
}
