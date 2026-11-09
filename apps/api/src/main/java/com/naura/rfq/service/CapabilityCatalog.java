package com.naura.rfq.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.model.dto.CapabilityLibraryRequest;
import com.naura.rfq.security.CurrentUser;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class CapabilityCatalog {
    static final String SHARED = "BU共享";
    static final String PROJECT = "仅当前项目";
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final KnowledgePublicationAccess access;
    private final AuditService audit;

    enum Table {
        MODEL("model_definition", false), PROCESS("process_definition", false),
        EVIDENCE("evidence_record", true), CAPABILITY("capability_record", true), HISTORY("`history-rfq-record`", true);

        final String name;
        final boolean hasRevision;

        Table(String name, boolean hasRevision) {
            this.name = name;
            this.hasRevision = hasRevision;
        }
    }

    record Row(String id, int version, long revision, String projectId, String scope, ObjectNode payload) {
        String status() { return payload.path("status").asText(); }
        String project() { return projectId == null ? KnowledgePublicationAccess.recordProjectId(payload) : projectId; }
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode saveModel(CurrentUser user, String buId, String id, int baseVersion, CapabilityLibraryRequest.Model input) {
        access.requireCapabilityWriter(user, buId, true, false);
        lockBu(buId);
        String key = id == null ? Ids.next("MOD") : id;
        int version = nextVersion(user, buId, Table.MODEL, id, baseVersion);
        ObjectNode payload = json.valueToTree(input);
        payload.remove("modelRevision");
        payload.put("revision", input.modelRevision().strip()).put("config", input.config().strip()).put("status", "已发布");
        return insert(user, buId, Table.MODEL, key, version, null, payload, "保存机型配置版本");
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode saveProcess(CurrentUser user, String buId, String id, int baseVersion, CapabilityLibraryRequest.Process input) {
        access.requireCapabilityWriter(user, buId, true, false);
        lockBu(buId);
        var model = row(Table.MODEL, buId, input.modelId(), input.modelVersion());
        if (!isSharedBaseline(model)) {
            throw new BusinessException(422, "工艺需要关联本 BU 的有效机型版本");
        }
        String key = id == null ? Ids.next("PROC") : id;
        int version = nextVersion(user, buId, Table.PROCESS, id, baseVersion);
        if (id != null && !input.modelId().equals(row(Table.PROCESS, buId, id, baseVersion).payload().path("modelId").asText())) {
            throw new BusinessException(422, "工艺修订须保留所属机型");
        }
        return insert(user, buId, Table.PROCESS, key, version, null, json.valueToTree(input), "保存工艺配置版本");
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode registerEvidence(CurrentUser user, String buId, String id, int baseVersion, CapabilityLibraryRequest.Evidence input) {
        access.requireCapabilityWriter(user, buId, false, false);
        lockBu(buId);
        String projectId = scopeProject(user, buId, input.projectId());
        String key = id == null ? Ids.next("EV") : id;
        int version = nextVersion(user, buId, Table.EVIDENCE, id, baseVersion);
        if (id != null) {
            var previous = required(Table.EVIDENCE, buId, id, baseVersion);
            if (!scope(projectId).equals(previous.scope()) || !clean(previous.project()).equals(clean(projectId))) {
                throw new BusinessException(422, "证据换版须保留原共享范围");
            }
        }
        ObjectNode payload = json.valueToTree(input);
        payload.remove("expiry");
        if (input.expiry() != null) {
            payload.put("expiry", input.expiry().toString());
        }
        payload.put("status", "待核对").put("revision", 0).put("registeredById", user.id());
        return insert(user, buId, Table.EVIDENCE, key, version, projectId, payload, "登记能力证据");
    }

    public ObjectNode evidence(CurrentUser user, String buId, String id, int version) {
        scopeProject(user, buId, null);
        var row = required(Table.EVIDENCE, buId, id, version);
        requireReadable(user, buId, row);
        return row.payload().put("revision", row.revision());
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode reviewEvidence(CurrentUser user, String buId, String id, int version, String action,
            CapabilityLibraryRequest.Review input) {
        access.requireCapabilityWriter(user, buId, false, true);
        lockBu(buId);
        var row = required(Table.EVIDENCE, buId, id, version);
        requireReadable(user, buId, row);
        if (row.revision() != input.revision()) {
            throw new BusinessException(409, "证据已变更，请刷新");
        }
        var payload = row.payload();
        String reason = clean(input.reason());
        if ("verify".equals(action)) {
            if (!"待核对".equals(row.status())) {
                throw new BusinessException(409, "只有待核对的证据可以确认");
            }
            String registrant = payload.path("registeredById").asText();
            if (registrant.isBlank() || registrant.equals(user.id())) {
                throw new BusinessException(403, "由登记人以外的批准人核对证据");
            }
            if (!unexpired(payload)) {
                throw new BusinessException(422, "证据有效期已过或日期无效");
            }
            payload.put("status", "有效").put("verifiedById", user.id()).put("verifiedAt", Instant.now().toString());
        } else {
            if (!"有效".equals(row.status())) {
                throw new BusinessException(409, "只有有效的证据可以撤销");
            }
            if (reason.isBlank()) {
                throw new BusinessException(422, "请填写撤销原因");
            }
            payload.put("status", "已撤销");
        }
        return update(user, buId, Table.EVIDENCE, row, "verify".equals(action) ? "确认能力证据" : "撤销能力证据", reason);
    }

    ObjectNode insert(CurrentUser user, String buId, Table table, String id, int version, String projectId,
            ObjectNode payload, String action) {
        identity(payload, buId, id, version, projectId);
        jdbc.update("insert into " + table.name + "(bu_id,id,version,project_id,scope,payload) values (?,?,?,?,?,?)",
                buId, id, version, projectId, scope(projectId), payload.toString());
        log(user, buId, table, id, version, action, "");
        return payload;
    }

    void identity(ObjectNode payload, String buId, String id, int version, String projectId) {
        payload.put("buId", buId).put("id", id).put("version", version).put("scope", scope(projectId));
        if (projectId == null) {
            payload.remove("projectId");
        } else {
            payload.put("projectId", projectId);
        }
    }

    ObjectNode update(CurrentUser user, String buId, Table table, Row row, String action, String reason) {
        var payload = row.payload().put("revision", row.revision() + 1);
        payload.withArray("history").addObject().put("date", Instant.now().toString()).put("actorId", user.id())
                .put("action", action).put("reason", reason)
                .put("text", user.displayName() + " " + action + (reason.isBlank() ? "" : "：" + reason));
        int count = jdbc.update("update " + table.name + " set payload=?,revision=? where bu_id=? and id=? and version=? and revision=?",
                payload.toString(), row.revision() + 1, buId, row.id(), row.version(), row.revision());
        if (count != 1) {
            throw new BusinessException(409, "记录已变更，请刷新");
        }
        log(user, buId, table, row.id(), row.version(), action, reason);
        return payload;
    }

    void log(CurrentUser user, String buId, Table table, String id, int version, String action, String reason) {
        audit.successInBu(user.id(), buId, action, table.name, id.length() <= 64 ? id : null,
                id + " V" + version + (reason.isBlank() ? "" : " · " + reason));
    }

    Row row(Table table, String buId, String id, int version) {
        return rows(table, "where bu_id=? and id=? and version=?", buId, id, version).stream().findFirst().orElse(null);
    }

    Row required(Table table, String buId, String id, int version) {
        var row = row(table, buId, id, version);
        if (row == null) {
            throw new BusinessException(404, "记录版本不存在");
        }
        return row;
    }

    List<Row> rows(Table table, String filter, Object... parameters) {
        String revision = table.hasRevision ? "revision" : "0";
        return jdbc.query("select id,version,project_id,scope,payload," + revision + " as row_revision from " + table.name + " " + filter,
                (result, n) -> new Row(result.getString("id"), result.getInt("version"), result.getLong("row_revision"),
                        result.getString("project_id"), result.getString("scope"), decode(result.getString("payload"))), parameters);
    }

    void lockBu(String buId) {
        access.lockBu(buId);
    }

    String scopeProject(CurrentUser user, String buId, String projectId) {
        String project = clean(projectId);
        if (!project.isEmpty()) {
            return access.requireProject(user, buId, project).getId();
        }
        access.requireScope(user, buId, null, null);
        return null;
    }

    void requireReadable(CurrentUser user, String buId, Row row) {
        access.requireScope(user, buId, row.project(), row.scope());
    }

    boolean isSharedBaseline(Row model) {
        return model != null && clean(model.project()).isBlank() && !PROJECT.equals(model.scope())
                && "已发布".equals(model.status()) && !"已撤销".equals(model.payload().path("validity").asText());
    }

    private int nextVersion(CurrentUser user, String buId, Table table, String id, int expected) {
        if (id == null) {
            return 1;
        }
        var latest = rows(table, "where bu_id=? and id=? order by version desc limit 1", buId, id).stream().findFirst()
                .orElseThrow(() -> new BusinessException(404, "记录不存在"));
        requireReadable(user, buId, latest);
        if (expected != latest.version()) {
            throw new BusinessException(409, "已有新版本，请刷新");
        }
        return Math.addExact(expected, 1);
    }

    static boolean unexpired(ObjectNode payload) {
        String date = payload.path("expiry").asText("");
        if (date.isBlank()) {
            return true;
        }
        try { return !LocalDate.parse(date).isBefore(LocalDate.now(ZoneOffset.UTC)); }
        catch (java.time.format.DateTimeParseException failure) {
            log.error("解析能力有效期失败 errorType={}", failure.getClass().getSimpleName());
            return false;
        }
    }

    static String clean(String value) { return value == null ? "" : value.strip(); }
    static String scope(String projectId) { return projectId == null ? SHARED : PROJECT; }

    private ObjectNode decode(String payload) {
        try { return (ObjectNode) json.readTree(payload); }
        catch (JsonProcessingException failure) {
            log.error("解析能力资料失败 errorType={}", failure.getClass().getSimpleName());
            throw new IllegalStateException("能力资料格式异常", failure);
        }
    }
}
