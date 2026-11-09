package com.naura.rfq.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.security.CurrentUser;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class KnowledgeGroupService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final KnowledgePublicationAccess access;
    private final AuditService audit;

    public record Membership(long revision, List<String> groupIds) {}
    record ProjectBinding(String path, long catalogVersion, JsonNode values) {}
    private record Resource(String projectId, String scope, ObjectNode payload) {}

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode save(CurrentUser user, String bu, ObjectNode proposed) {
        requireManager(user, bu);
        access.lockBu(bu);
        var existing = catalog(bu);
        long revision = existing.path("writeRevision").asLong();
        if (proposed.path("writeRevision").asLong(0) != revision) throw new BusinessException(409, "分组目录已变化，请刷新");
        if (!bu.equals(proposed.path("buId").asText()) || !proposed.path("nodes").isArray()
                || proposed.path("nodes").size() > 2000 || !proposed.path("schema").path("levels").isArray()) invalid();
        var result = proposed.deepCopy().put("writeRevision", revision + 1);
        if (!existing.isEmpty()) {
            result.set("schema", existing.path("schema"));
            result.set("attachments", existing.path("attachments"));
        } else result.putArray("attachments");
        validate(result, existing);
        jdbc.update("""
                insert into knowledge_group_catalog(bu_id,payload) values (?,?) as desired
                on duplicate key update payload=desired.payload
                """, bu, result.toString());
        audit.successInBu(user.id(), bu, "保存知识分组", "knowledge_group_catalog", bu, "目录修订 " + (revision + 1));
        return result;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode assign(CurrentUser user, String bu, String kind, String id, int version, Membership request) {
        requireManager(user, bu);
        access.lockBu(bu);
        String table = switch (kind) {
            case "reply" -> "`standard-reply-record`";
            case "capability" -> "capability_record";
            default -> throw new BusinessException(400, "未知知识类型");
        };
        var record = jdbc.query("select project_id,scope,payload from " + table + " where bu_id=? and id=? and version=? for update",
                (row, n) -> new Resource(row.getString(1), row.getString(2), parse(row.getString(3))), bu, id, version)
                .stream().findFirst().orElseThrow(() -> new BusinessException(404, "知识版本不存在"));
        access.requireScope(user, bu, record.projectId(), record.scope());
        var data = record.payload();
        String origin = KnowledgePublicationAccess.recordProjectId(data);
        if (!origin.isBlank()) access.requireScope(user, bu, origin, "仅当前项目");
        if (request.revision() != data.path("groupRevision").asLong()) throw new BusinessException(409, "分组关联已变化，请刷新");
        data.set("groupIds", groupIds(bu, request.groupIds(), data.path("groupIds")));
        data.remove("groupId");
        data.put("groupRevision", request.revision() + 1);
        jdbc.update("update " + table + " set payload=? where bu_id=? and id=? and version=?", data.toString(), bu, id, version);
        audit.successInBu(user.id(), bu, "更新知识条目分组", kind, id, "v" + version);
        return data;
    }

    ProjectBinding bindProject(String bu, String id) {
        if (id == null || id.isBlank()) throw new BusinessException(400, "请选择当前 BU 的分组");
        // Serialize binding with directory edits so a disabled group cannot be bound concurrently.
        access.lockBu(bu);
        var catalog = catalog(bu);
        var nodes = nodes(catalog);
        var path = enabledPath(nodes, disabledLevels(catalog), id);
        var values = nodes.get(id).path("values");
        long version = catalog.path("writeRevision").asLong();
        return new ProjectBinding(String.join(" / ", path), version, values.isObject() ? values : json.createObjectNode());
    }

    private Set<String> disabledLevels(JsonNode catalog) {
        var disabledLevels = new HashSet<String>();
        catalog.path("schema").path("levels").forEach(level -> {
            if (!level.path("enabled").asBoolean(true)) disabledLevels.add(level.path("id").asText());
        });
        return disabledLevels;
    }

    private List<String> enabledPath(Map<String, JsonNode> nodes, Set<String> disabledLevels, String id) {
        var path = new ArrayList<String>();
        for (var node = nodes.get(id); node != null; node = nodes.get(node.path("parentId").asText())) {
            if (!node.path("enabled").asBoolean(true) || disabledLevels.contains(node.path("levelId").asText())) {
                throw new BusinessException(409, "不能关联停用的分组");
            }
            path.add(0, node.path("name").asText().strip());
            if (path.size() > 4) invalid();
        }
        if (path.isEmpty()) throw new BusinessException(400, "分组不存在或不属于当前 BU");
        return path;
    }

    JsonNode groupIds(String bu, List<String> requested, JsonNode previous) {
        if (requested == null || requested.size() > 100) throw new BusinessException(400, "分组关联格式无效");
        var catalog = catalog(bu);
        var nodes = nodes(catalog);
        var disabledLevels = disabledLevels(catalog);
        var result = json.createArrayNode();
        var seen = new HashSet<String>();
        var retained = new HashSet<String>();
        previous.forEach(item -> retained.add(item.asText()));
        for (String id : requested) {
            if (id == null || !nodes.containsKey(id)) throw new BusinessException(400, "分组不存在或不属于当前 BU");
            if (!retained.contains(id)) enabledPath(nodes, disabledLevels, id);
            if (seen.add(id)) result.add(id);
        }
        return result;
    }

    private void requireManager(CurrentUser user, String bu) {
        access.requireWriter(user, bu, false);
        if (user.roles().stream().noneMatch(role -> bu.equals(role.buId()) && "BU_ADMIN".equals(role.role()))) {
            throw new BusinessException(403, "仅本 BU 管理员可维护知识分组");
        }
    }

    private void validate(ObjectNode value, ObjectNode previous) {
        var levels = new HashMap<String, Integer>();
        int index = 0;
        for (var level : value.path("schema").path("levels")) {
            String id = level.path("id").asText();
            if (!validId(id) || level.path("name").asText().isBlank() || levels.putIfAbsent(id, index++) != null) invalid();
        }
        if (levels.isEmpty() || levels.size() > 4) invalid();
        var nodes = nodes(value);
        if (nodes.size() != value.path("nodes").size()) invalid();
        var oldNodes = nodes(previous);
        var names = new HashMap<String, Boolean>();
        for (var entry : nodes.entrySet()) {
            var node = entry.getValue();
            String parent = node.path("parentId").asText("");
            String name = node.path("name").asText().strip();
            Integer level = levels.get(node.path("levelId").asText());
            var parentNode = nodes.get(parent);
            if (!validId(entry.getKey()) || name.isBlank() || name.length() > 200 || level == null
                    || !parent.isEmpty() && (parentNode == null || levels.getOrDefault(parentNode.path("levelId").asText(), 99) >= level)) invalid();
            // Existing model revisions can share a name in imported catalogs.
            String key = groupNameKey(node);
            JsonNode old = oldNodes.get(entry.getKey());
            boolean unchanged = old != null && key.equals(groupNameKey(old));
            Boolean earlierUnchanged = names.putIfAbsent(key, unchanged);
            if (earlierUnchanged != null && (!earlierUnchanged || !unchanged)) invalid();
        }
        for (var old : previous.path("nodes")) {
            var node = nodes.get(old.path("id").asText());
            if (node == null || !node.path("parentId").asText("").equals(old.path("parentId").asText(""))
                    || !node.path("levelId").equals(old.path("levelId"))) invalid();
        }
    }

    private static String groupNameKey(JsonNode node) {
        return node.path("parentId").asText("") + "\n" + node.path("name").asText().strip().toLowerCase(Locale.ROOT);
    }

    private static boolean validId(String id) { return id.matches("[A-Za-z0-9][A-Za-z0-9_-]{0,127}"); }

    private Map<String, JsonNode> nodes(JsonNode catalog) {
        var nodes = new HashMap<String, JsonNode>();
        catalog.path("nodes").forEach(node -> nodes.put(node.path("id").asText(), node));
        return nodes;
    }

    private ObjectNode catalog(String bu) {
        return jdbc.query("select payload from knowledge_group_catalog where bu_id=?",
                (row, n) -> parse(row.getString(1)), bu).stream().findFirst().orElseGet(json::createObjectNode);
    }

    private ObjectNode parse(String payload) {
        try { return (ObjectNode) json.readTree(payload); }
        catch (Exception e) { throw new IllegalStateException("知识分组格式异常", e); }
    }

    private void invalid() { throw new BusinessException(400, "分组名称、层级或归属无效"); }
}
