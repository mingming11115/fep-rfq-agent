package com.naura.rfq.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.model.entity.Project;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class HistoryRecallScope {
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json;

    public record Choice(String id, String name, String version, String status) {}

    List<String> validate(Project project, List<String> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        if (ids.size() > 20 || ids.stream().anyMatch(id -> id == null || !id.matches("[A-Za-z0-9_-]{1,64}"))) {
            throw new BusinessException(400, "请选择最多 20 个有效的历史 RFQ 文件版本");
        }
        var unique = ids.stream().distinct().sorted().toList();
        if (!allowed(project.getBuId(), project.getId(), unique)) {
            throw new BusinessException(400, "所选历史 RFQ 文件不存在或不可用于当前项目");
        }
        return unique;
    }

    boolean allowed(String bu, String project, List<String> ids) {
        return jdbc.query("""
                select id,payload from history_document
                where bu_id=:bu and id in (:ids)
                  and ((project_id is null and scope='BU共享') or (project_id=:project and scope='仅当前项目'))
                """, Map.of("bu", bu, "project", project, "ids", ids),
                (row, n) -> visible(parse(row.getString("payload")), project) ? row.getString("id") : "")
                .containsAll(ids);
    }

    List<String> groupDocuments(String bu, String project, String groupId) {
        return jdbc.query("""
                select id,payload from history_document
                where bu_id=:bu
                  and ((project_id is null and scope='BU共享') or (project_id=:project and scope='仅当前项目'))
                  and case when json_type(payload->'$.groupIds')='ARRAY'
                      then json_contains(payload->'$.groupIds',json_quote(:groupId))
                      else payload->>'$.groupId'=:groupId end
                """, Map.of("bu", bu, "project", project, "groupId", groupId),
                (row, n) -> visible(parse(row.getString("payload")), project) ? row.getString("id") : null)
                .stream().filter(java.util.Objects::nonNull).toList();
    }

    List<Choice> choices(Project project) {
        return jdbc.query("""
                select d.id,d.payload,
                    exists(select 1 from `history-rfq-record` r
                        where r.bu_id=d.bu_id and r.project_id <=> d.project_id and r.scope=d.scope
                          and r.payload->>'$.documentId'=d.id
                          and r.payload->>'$.status'='已发布' and r.payload->>'$.validity'='有效') as published,
                    exists(select 1 from `history-rfq-record` r
                        left join history_rfq_index_sync s on s.bu_id=r.bu_id and s.reply_id=r.id
                        where d.project_id is null and r.bu_id=d.bu_id and r.project_id is null and r.scope=d.scope
                          and r.payload->>'$.documentId'=d.id
                          and r.payload->>'$.status'='已发布' and r.payload->>'$.validity'='有效'
                          and (s.synced_at is null or s.operation<>'upsert' or s.version<>r.version)) as syncing
                from history_document d
                where d.bu_id=:bu and ((d.project_id is null and d.scope='BU共享')
                    or (d.project_id=:project and d.scope='仅当前项目'))
                order by d.id
                """, Map.of("bu", project.getBuId(), "project", project.getId()), (row, n) -> {
            var payload = parse(row.getString("payload"));
            if (!visible(payload, project.getId())) {
                return null;
            }
            String status = !row.getBoolean("published") ? "unpublished"
                    : row.getBoolean("syncing") ? "index_pending" : "ready";
            return new Choice(row.getString("id"), payload.path("name").asText(),
                    payload.path("version").asText(), status);
        }).stream().filter(java.util.Objects::nonNull).toList();
    }

    private boolean visible(JsonNode payload, String project) {
        String origin = KnowledgePublicationAccess.recordProjectId(payload);
        return origin.isEmpty() || origin.equals(project);
    }

    private JsonNode parse(String payload) {
        try {
            return json.readTree(payload);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("无法读取历史 RFQ 文档范围", error);
        }
    }
}
