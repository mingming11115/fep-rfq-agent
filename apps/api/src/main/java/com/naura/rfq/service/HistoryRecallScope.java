package com.naura.rfq.service;

import com.naura.rfq.mapper.HistoryDocumentMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.model.entity.Project;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class HistoryRecallScope {
    @Autowired
    private HistoryDocumentMapper historyDocuments;
    @Autowired
    private KnowledgeGroupService groups;
    @Autowired
    private ObjectMapper json;

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
        return ids.isEmpty() || historyDocuments.listScopedByIds(bu, project, ids).stream()
                .filter(row -> visible(parse(row.payload()), project)).map(HistoryDocumentMapper.RecallDocument::id)
                .toList().containsAll(ids);
    }

    List<String> groupDocuments(String bu, String project, String groupId) {
        var scopeIds = groups.scopeIds(bu, groupId);
        if (scopeIds.isEmpty()) {
            return List.of();
        }
        return historyDocuments.listScopedByGroup(bu, project, scopeIds).stream()
                .filter(row -> visible(parse(row.payload()), project)).map(HistoryDocumentMapper.RecallDocument::id).toList();
    }

    List<Choice> choices(Project project) {
        return historyDocuments.listRecallChoices(project.getBuId(), project.getId()).stream().map(row -> {
            var payload = parse(row.payload());
            if (!visible(payload, project.getId())) {
                return null;
            }
            String status = !row.published() ? "unpublished"
                    : row.syncing() ? "index_pending" : "ready";
            return new Choice(row.id(), payload.path("name").asText(),
                    payload.path("version").asText(), status);
        }).filter(java.util.Objects::nonNull).toList();
    }

    private boolean visible(JsonNode payload, String project) {
        if ("已删除".equals(payload.path("status").asText())) {
            return false;
        }
        String origin = KnowledgePublicationAccess.recordProjectId(payload);
        return origin.isEmpty() || origin.equals(project);
    }

    private JsonNode parse(String payload) {
        try {
            return json.readTree(payload);
        } catch (JsonProcessingException error) {
            log.error("解析历史 RFQ 文档范围数据失败", error);
            throw new IllegalStateException("无法读取历史 RFQ 文档范围", error);
        }
    }
}
