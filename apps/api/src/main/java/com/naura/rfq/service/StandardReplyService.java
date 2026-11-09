package com.naura.rfq.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.integration.standardreply.KnowledgeIndexQueue;
import com.naura.rfq.integration.standardreply.KnowledgeIndexQueue.Library;
import com.naura.rfq.integration.standardreply.StandardReplyImportParser;
import com.naura.rfq.integration.standardreply.StandardReplyImportParser.RowError;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.model.dto.StandardReplyDraftRequest;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class StandardReplyService {
    private static final Set<String> EDITABLE = Set.of("草稿", "退回");
    private static final String SELECT = "select id, version, revision, project_id, scope, payload from `standard-reply-record`";

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final AccessGuard guard;
    private final KnowledgePublicationAccess publicationAccess;
    private final KnowledgeIndexQueue index;
    private final ProjectMapper projects;
    private final AuditService audit;
    private final StandardReplyImportParser importer;

    public record ImportResult(List<ObjectNode> items, List<Integer> skippedRows, List<RowError> errors) {}

    @Transactional
    public ImportResult importFile(CurrentUser user, String buId, MultipartFile file) {
        publicationAccess.requireWriter(user, buId, false);
        var parsed = importer.parse(file);
        var items = new ArrayList<ObjectNode>();
        var skipped = new ArrayList<Integer>();
        for (var row : parsed.rows()) {
            // Equal files in the same BU address the same draft, even after it is published.
            String id = "STD-" + parsed.sha256().substring(0, 52) + "-" + row.rowNumber();
            var payload = json.createObjectNode().put("id", id).put("buId", buId).put("type", "standard")
                    .put("title", row.title()).put("requirement", row.requirement()).put("answer", row.answer())
                    .put("conditions", row.conditions()).put("scope", "BU共享").put("sourceType", "upload")
                    .put("source", parsed.filename()).put("sourceFileName", parsed.filename())
                    .put("sourceFileSha256", parsed.sha256()).put("sourceRow", row.rowNumber())
                    .put("author", user.displayName()).put("authorId", user.id()).put("version", 1)
                    .put("revision", 0).put("status", "草稿").put("validity", "待核对");
            addHistory(payload, user, "导入标准回复草稿", "");
            try {
                insert(buId, id, 1, null, "BU共享", payload);
                items.add(payload);
            } catch (DuplicateKeyException duplicate) {
                skipped.add(row.rowNumber());
            }
        }
        audit.successInBu(user.id(), buId, "导入标准回复", "standard_reply", null,
                "新增 " + items.size() + "，重复 " + skipped.size() + "，无效 " + parsed.errors().size());
        return new ImportResult(List.copyOf(items), List.copyOf(skipped), parsed.errors());
    }

    public ObjectNode version(CurrentUser user, String buId, String id, int version) {
        guard.requireBu(user, buId);
        var record = find(jdbc.query(SELECT + " where bu_id=? and id=? and version=?", this::map,
                buId, id, version), version);
        requireReadable(user, buId, record);
        return withIndexStatus(buId, record);
    }

    @Transactional
    public ObjectNode updateDraft(CurrentUser user, String buId, String id, int version, StandardReplyDraftRequest request) {
        publicationAccess.requireWriter(user, buId, false);
        var chain = lockChain(buId, id);
        var record = checkedVersion(user, buId, chain, version, request.revision());
        requireState(EDITABLE.contains(record.status()), "仅草稿或退回版本可以修改");
        record.payload().put("title", request.title().strip()).put("requirement", request.requirement().strip())
                .put("answer", request.answer().strip()).put("conditions", request.conditions().strip());
        return saveAction(user, buId, record, "编辑标准回复草稿", "");
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode transition(CurrentUser user, String buId, String id, int version, long revision,
            String action, String suppliedReason) {
        boolean review = Set.of("publish", "return", "revoke").contains(action);
        publicationAccess.requireWriter(user, buId, review);
        if (Set.of("publish", "revoke").contains(action)) publicationAccess.lockBu(buId);
        var chain = lockChain(buId, id);
        var record = checkedVersion(user, buId, chain, version, revision);
        String reason = suppliedReason == null ? "" : suppliedReason.strip();
        return switch (action) {
            case "submit" -> submit(user, buId, record, reason);
            case "publish" -> publish(user, buId, chain, record, reason);
            case "return" -> returnForEdit(user, buId, record, reason);
            case "revoke" -> revoke(user, buId, chain, record, reason);
            case "revise" -> revise(user, buId, chain, record);
            default -> throw new BusinessException(404, "未知的标准回复操作");
        };
    }

    private ObjectNode submit(CurrentUser user, String buId, Reply record, String reason) {
        requireState(EDITABLE.contains(record.status()), "仅草稿或退回版本可以提交审核");
        validateContent(record);
        record.payload().put("status", "待审核").put("submitterId", user.id())
                .put("submittedAt", Instant.now().toString());
        return saveAction(user, buId, record, "提交标准回复审核", reason);
    }

    private ObjectNode publish(CurrentUser user, String buId, List<Reply> chain, Reply record, String reason) {
        requireIndependentReview(user, record);
        requireState(!record.payload().path("submitterId").asText().isBlank(), "缺少提交人，请退回后重新提交");
        requireState(chain.get(chain.size() - 1).version() == record.version(), "只能发布最新的待审核版本");
        validateContent(record);
        requireState("BU共享".equals(record.scope()) && record.projectId() == null
                && record.payload().path("projectId").asText("").isBlank()
                && record.payload().path("sourceProjectId").asText("").isBlank(),
                "当前发布入口仅支持 BU 共享的标准回复");
        for (Reply previous : chain) {
            if (!previous.isActivePublication()) continue;
            requireReadable(user, buId, previous);
            previous.payload().put("validity", "被替代").put("supersededByVersion", record.version());
            saveAction(user, buId, previous, "替代标准回复旧版本", "新版本 V" + record.version());
        }
        record.payload().put("status", "已发布").put("validity", "有效").put("publishedById", user.id())
                .put("publishedAt", Instant.now().toString());
        var projection = json.createObjectNode().put("title", record.payload().path("title").asText())
                .put("requirement_text", record.payload().path("requirement").asText())
                .put("bu_id", buId).put("record_version", record.version());
        index.enqueue(Library.STANDARD_REPLY, buId, record.id(), record.version(), projection);
        return saveAction(user, buId, record, "批准发布标准回复", reason);
    }

    private ObjectNode returnForEdit(CurrentUser user, String buId, Reply record, String reason) {
        requireIndependentReview(user, record);
        requireReason(reason);
        record.payload().put("status", "退回").put("validity", "待核对");
        return saveAction(user, buId, record, "退回标准回复", reason);
    }

    private ObjectNode revoke(CurrentUser user, String buId, List<Reply> chain, Reply record, String reason) {
        var current = chain.stream().filter(Reply::isActivePublication).reduce((earlier, later) -> later);
        requireState(current.isPresent() && current.get().version() == record.version(), "仅当前发布版本可以撤销");
        requireReason(reason);
        record.payload().put("status", "已撤销").put("validity", "已撤销");
        index.enqueue(Library.STANDARD_REPLY, buId, record.id(), record.version(), null);
        return saveAction(user, buId, record, "撤销标准回复", reason);
    }

    private ObjectNode revise(CurrentUser user, String buId, List<Reply> chain, Reply record) {
        requireState(chain.get(chain.size() - 1).version() == record.version(), "已经存在较新版本，请打开该版本");
        requireState(Set.of("已发布", "已撤销").contains(record.status()), "仅已发布或已撤销版本可以修订");
        int nextVersion = Math.addExact(record.version(), 1);
        var next = record.payload().deepCopy();
        next.remove(List.of("submitterId", "submitterRole", "submittedAt", "publishedById", "publishedAt",
                "approver", "supersededByVersion", "history"));
        next.put("version", nextVersion).put("revision", 0).put("status", "草稿").put("validity", "待核对")
                .put("author", user.displayName()).put("authorId", user.id());
        addHistory(next, user, "修订标准回复", "基于 V" + record.version());
        insert(buId, record.id(), nextVersion, record.projectId(), record.scope(), next);
        audit(user, buId, record.id(), nextVersion, "修订标准回复", "基于 V" + record.version());
        return next;
    }

    private void requireReadable(CurrentUser user, String buId, Reply record) {
        String boundProject = record.projectId();
        if (boundProject == null) boundProject = record.payload().path("projectId").asText("");
        if (boundProject.isBlank()) boundProject = record.payload().path("sourceProjectId").asText("");
        if (boundProject.isBlank()) {
            if ("仅当前项目".equals(record.scope())) throw new BusinessException(403, "标准回复缺少可核实的项目范围");
            return;
        }
        var project = projects.findById(boundProject).orElse(null);
        if (project == null || !buId.equals(project.getBuId())) throw new BusinessException(403, "无权访问该标准回复");
        guard.requireProject(user, project);
    }

    private void requireIndependentReview(CurrentUser user, Reply record) {
        requireState("待审核".equals(record.status()), "仅待审核版本可以审核");
        String submitterId = record.payload().path("submitterId").asText();
        if (user.id().equals(submitterId)) throw new BusinessException(403, "同一版本不得自审");
    }

    private void validateContent(Reply record) {
        for (String field : List.of("title", "requirement", "answer", "conditions")) {
            if (record.payload().path(field).asText().isBlank()) {
                throw new BusinessException(422, "请补齐标题、客户要求、标准回复和适用条件");
            }
        }
    }

    private void requireReason(String reason) {
        if (reason.isBlank()) throw new BusinessException(422, "请填写操作原因");
    }

    private void requireState(boolean allowed, String message) {
        if (!allowed) throw new BusinessException(409, message);
    }

    private List<Reply> lockChain(String buId, String id) {
        return jdbc.query(SELECT + " where bu_id=? and id=? order by version for update", this::map, buId, id);
    }

    private Reply checkedVersion(CurrentUser user, String buId, List<Reply> chain, int version, long revision) {
        var record = find(chain, version);
        requireReadable(user, buId, record);
        requireState(revision == record.revision(), "标准回复已变更，请刷新后再操作");
        return record;
    }

    private Reply find(List<Reply> chain, int version) {
        return chain.stream().filter(row -> row.version() == version).findFirst()
                .orElseThrow(() -> new BusinessException(404, "标准回复版本不存在"));
    }

    private Reply map(java.sql.ResultSet result, int rowNumber) throws java.sql.SQLException {
        try {
            var payload = (ObjectNode) json.readTree(result.getString("payload"));
            return new Reply(result.getString("id"), result.getInt("version"), result.getLong("revision"),
                    result.getString("project_id"), result.getString("scope"), payload);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("标准回复记录格式异常", ex);
        }
    }

    private void insert(String buId, String id, int version, String projectId, String scope, ObjectNode payload) {
        jdbc.update("insert into `standard-reply-record`(bu_id,id,version,project_id,scope,payload) values (?,?,?,?,?,?)",
                buId, id, version, projectId, scope, payload.toString());
    }

    private ObjectNode saveAction(CurrentUser user, String buId, Reply record, String action, String reason) {
        long revision = record.revision() + 1;
        record.payload().put("revision", revision);
        addHistory(record.payload(), user, action, reason);
        int changed = jdbc.update("update `standard-reply-record` set payload=?,revision=? "
                        + "where bu_id=? and id=? and version=? and revision=?",
                record.payload().toString(), revision, buId, record.id(), record.version(), record.revision());
        requireState(changed == 1, "标准回复已变更，请刷新后再操作");
        audit(user, buId, record.id(), record.version(), action, reason);
        return withIndexStatus(buId, new Reply(record.id(), record.version(), revision, record.projectId(), record.scope(), record.payload()));
    }

    private void addHistory(ObjectNode payload, CurrentUser user, String action, String reason) {
        payload.withArray("history").addObject().put("date", Instant.now().toString())
                .put("text", user.displayName() + " " + action + (reason.isBlank() ? "" : "：" + reason))
                .put("actorId", user.id()).put("action", action).put("reason", reason);
    }

    private void audit(CurrentUser user, String buId, String id, int version, String action, String reason) {
        audit.successInBu(user.id(), buId, action, "standard_reply", id.length() <= 64 ? id : null,
                id + " V" + version + (reason.isBlank() ? "" : " · " + reason));
    }

    private ObjectNode withIndexStatus(String buId, Reply record) {
        var status = index.status(Library.STANDARD_REPLY, buId, record.id(), record.version());
        var result = record.payload().deepCopy().put("revision", record.revision()).put("indexStatus", status.state());
        if (status.operation() != null) result.put("indexOperation", status.operation());
        return result;
    }

    private record Reply(String id, int version, long revision, String projectId, String scope, ObjectNode payload) {
        String status() { return payload.path("status").asText(); }
        boolean isActivePublication() {
            return "已发布".equals(status()) && !"被替代".equals(payload.path("validity").asText());
        }
    }
}
