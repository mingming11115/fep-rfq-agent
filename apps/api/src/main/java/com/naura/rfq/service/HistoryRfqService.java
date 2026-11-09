package com.naura.rfq.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.model.vo.HistorySource;
import com.naura.rfq.security.CurrentUser;
import com.naura.rfq.storage.DocumentStorage;
import java.io.IOException;
import java.nio.file.Files;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
@Slf4j
@RequiredArgsConstructor
public class HistoryRfqService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final PlatformTransactionManager transactions;
    private final KnowledgePublicationAccess access;
    private final DocumentStorage storage;
    private final HistoryParseService parser;
    private final AuditService audit;

    public record Intake(ObjectNode document, List<ObjectNode> clauses, boolean duplicate) {}
    public record Original(String name, String contentType, byte[] bytes) {}

    public Intake upload(CurrentUser user, String buId, MultipartFile file, MultipartFile responseFile,
            String projectId, boolean shareWithBu) throws IOException {
        access.requireWriter(user, buId, false);
        String scopedProject = projectId == null || projectId.isBlank() ? null : projectId.strip();
        if ((scopedProject == null) != shareWithBu) {
            throw new BusinessException(400, "请选择 BU 共享或指定项目范围");
        }
        var scope = new Scope(buId, scopedProject);
        access.requireScope(user, buId, scope.projectId(), scope.name());
        var files = new ArrayList<StoredOriginal>();
        boolean retained = false;
        try {
            files.add(save(file));
            if (responseFile != null && !responseFile.isEmpty()) files.add(save(responseFile));
            String fingerprint = "upload:" + scope.key() + ":" + files.get(0).file().sha256()
                    + ":" + (files.size() == 2 ? files.get(1).file().sha256() : "");
            var duplicate = existing(scope, fingerprint, false);
            if (duplicate != null) return duplicate;

            var sources = new ArrayList<HistorySource>();
            for (int i = 0; i < files.size(); i++) {
                var source = files.get(i);
                sources.add(parser.readStored(source.file(), source.name(), i == 0 ? "main:" : "answer:"));
            }
            var parsed = parser.extract(sources);
            String id = Ids.next("HD");
            var document = document(user, scope, id, files.get(0).name(), "history-upload");
            if (files.size() == 2) document.put("responseName", files.get(1).name());
            document.set("metadata", json.valueToTree(parsed.metadata()));
            document.set("issues", json.valueToTree(parsed.issues()));
            var summaries = document.putArray("sources");
            sources.forEach(source -> summaries.addObject().put("name", source.name()).put("prefix", source.prefix()));
            document.put("parseStatus", !parsed.clauses().isEmpty() && parsed.issues().isEmpty()
                    && parsed.clauses().stream().allMatch(row -> row.issues().isEmpty())
                    ? "complete" : "partial");
            var clauses = parsed.clauses().stream()
                    .map(row -> draft(user, scope, document, json.valueToTree(row))).toList();
            var originals = json.createArrayNode();
            for (var source : files) {
                originals.addObject().put("name", source.name()).put("ref", source.file().storageRef())
                        .put("size", source.file().size()).put("sha256", source.file().sha256());
            }
            var result = new TransactionTemplate(transactions).execute(status ->
                    saveIntake(user, scope, fingerprint, document, clauses, originals));
            retained = result != null && !result.duplicate();
            return result;
        } finally {
            if (!retained) files.forEach(this::discard);
        }
    }

    @Transactional
    public Intake fromSnapshot(CurrentUser user, String projectId, String snapshotId, boolean shareWithBu) {
        var project = access.requireProject(user, null, projectId);
        String buId = project.getBuId();
        // A project snapshot remains project scoped unless a BU publisher explicitly requests sharing.
        access.requireWriter(user, buId, shareWithBu);
        var scope = new Scope(buId, shareWithBu ? null : projectId);
        String fingerprint = "snapshot:" + snapshotId + (shareWithBu ? ":BU" : ":PROJECT");
        var snapshot = jdbc.query("select payload from response_snapshot where project_id=? and id=?",
                (row, n) -> decode(row.getString("payload")), projectId, snapshotId).stream().findFirst()
                .orElseThrow(() -> new BusinessException(404, "定稿快照不存在"));
        if (!ApprovedDocumentExportService.approved(snapshot) || !snapshot.path("rows").isArray() || snapshot.path("rows").isEmpty()) {
            throw new BusinessException(409, "需要有条款的已批准定稿快照");
        }
        var document = document(user, scope, Ids.next("HD"), project.getName() + " · 已批准定稿", "approved-snapshot")
                .put("originProjectId", projectId).put("sourceSnapshotId", snapshotId).put("parseStatus", "complete");
        var clauses = new ArrayList<ObjectNode>();
        for (JsonNode row : snapshot.path("rows")) {
            String answer = row.path("draft").asText();
            String conclusion = row.path("conclusion").asText();
            var source = json.createObjectNode().put("clauseNo", row.path("clause").asText())
                    .put("section", row.path("section").asText()).put("requirement", row.path("original").asText())
                    .put("answer", conclusion.isBlank() ? answer : conclusion + (answer.isBlank() ? "" : "\n" + answer))
                    .put("conditions", row.path("conditions").asText()).put("evidence", row.path("evidence").asText())
                    .put("requirementAnchor", row.path("sourceAnchor").asText())
                    .put("originRequirementId", row.path("id").asText()).put("sourceFileId", row.path("sourceFileId").asText())
                    .put("sourceFileVersion", row.path("sourceVersion").asText()).put("sourceSnapshotId", snapshotId);
            clauses.add(draft(user, scope, document, source));
        }
        return saveIntake(user, scope, fingerprint, document, clauses, null);
    }

    public Original original(CurrentUser user, String buId, String id, String part) throws IOException {
        access.requireScope(user, buId, null, null);
        int position = switch (part) {
            case "main" -> 0;
            case "answer" -> 1;
            default -> throw new BusinessException(400, "原件类型必须是 main 或 answer");
        };
        var document = jdbc.query("select project_id,scope,originals from history_document where bu_id=? and id=? order by version desc limit 1",
                (row, n) -> new DocumentOriginals(row.getString("project_id"), row.getString("scope"),
                        row.getString("originals")), buId, id).stream().findFirst()
                .orElseThrow(() -> new BusinessException(404, "历史 RFQ 文档不存在"));
        access.requireScope(user, buId, document.projectId(), document.scope());
        if (document.originals() == null) throw new BusinessException(404, "此记录没有独立保存的原件");
        JsonNode source = decode(document.originals()).path(position);
        if (source.isMissingNode()) throw new BusinessException(404, "没有所选原件");
        String name = source.path("name").asText();
        try (var lease = storage.open(source.path("ref").asText(), source.path("size").asLong(), source.path("sha256").asText())) {
            return new Original(name, ".pdf".equals(HistoryParseService.extension(name)) ? "application/pdf"
                    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Files.readAllBytes(lease.path()));
        }
    }

    private Intake saveIntake(CurrentUser user, Scope scope, String fingerprint, ObjectNode document,
            List<ObjectNode> clauses, JsonNode originals) {
        if (jdbc.query("select id from business_unit where id=? for update", (row, n) -> row.getString(1), scope.buId()).isEmpty()) {
            throw new BusinessException(404, "BU 不存在");
        }
        var duplicate = existing(scope, fingerprint, true);
        if (duplicate != null) return duplicate;
        String id = document.path("id").asText();
        jdbc.update("insert into history_document(bu_id,id,version,project_id,scope,payload,fingerprint,originals) values (?,?,1,?,?,?,?,?)",
                scope.buId(), id, scope.projectId(), scope.name(), document.toString(), fingerprint,
                originals == null ? null : originals.toString());
        for (ObjectNode clause : clauses) {
            jdbc.update("insert into `history-rfq-record`(bu_id,id,version,project_id,scope,payload) values (?,?,1,?,?,?)",
                    scope.buId(), clause.path("id").asText(), scope.projectId(), scope.name(), clause.toString());
        }
        audit.successInBu(user.id(), scope.buId(), "历史 RFQ 入库", "history_document", id, "新增条款草稿 " + clauses.size());
        return new Intake(document, List.copyOf(clauses), false);
    }

    private Intake existing(Scope scope, String fingerprint, boolean locked) {
        String lock = locked ? " for update" : "";
        return jdbc.query("select payload from history_document where bu_id=? and fingerprint=?" + lock,
                (row, n) -> (ObjectNode) decode(row.getString("payload")), scope.buId(), fingerprint).stream().findFirst()
                .map(document -> new Intake(document, jdbc.query("""
                        select payload from `history-rfq-record`
                        where bu_id=? and json_unquote(json_extract(payload,'$.documentId'))=? order by id,version
                        """ + lock, (row, n) -> (ObjectNode) decode(row.getString("payload")),
                        scope.buId(), document.path("id").asText()), true)).orElse(null);
    }

    private ObjectNode document(CurrentUser user, Scope scope, String id, String name, String sourceType) {
        var result = json.createObjectNode().put("id", id).put("familyId", id).put("buId", scope.buId()).put("name", name)
                .put("version", "V1").put("revision", 1).put("scope", scope.name()).put("sourceType", sourceType)
                .put("uploadedBy", user.displayName()).put("uploadedById", user.id()).put("createdAt", Instant.now().toString());
        if (scope.projectId() != null) result.put("projectId", scope.projectId());
        return result;
    }

    private ObjectNode draft(CurrentUser user, Scope scope, ObjectNode document, ObjectNode source) {
        String id = Ids.next("HR");
        String requirement = source.path("requirement").asText();
        int titleLength = Math.min(200, requirement.codePointCount(0, requirement.length()));
        source.put("id", id).put("documentId", document.path("id").asText()).put("buId", scope.buId())
                .put("type", "history").put("title", requirement.substring(0, requirement.offsetByCodePoints(0, titleLength)))
                .put("version", 1).put("revision", 0).put("status", "草稿").put("validity", "待核对")
                .put("scope", scope.name()).put("source", document.path("name").asText())
                .put("sourceType", document.path("sourceType").asText()).put("author", user.displayName());
        if (scope.projectId() != null) source.put("projectId", scope.projectId());
        return source;
    }

    private StoredOriginal save(MultipartFile file) throws IOException {
        String name = HistoryParseService.fileName(file);
        return new StoredOriginal(name, storage.save(Ids.next("HFILE"), file, HistoryParseService.extension(name)));
    }

    private void discard(StoredOriginal original) {
        try { storage.delete(original.file().storageRef()); }
        catch (IOException failure) { log.warn("临时历史 RFQ 原件清理失败", failure); }
    }

    private JsonNode decode(String payload) {
        try { return json.readTree(payload); }
        catch (JsonProcessingException failure) { throw new IllegalStateException("历史 RFQ 记录格式异常", failure); }
    }

    private record Scope(String buId, String projectId) {
        String name() { return projectId == null ? "BU共享" : "仅当前项目"; }
        String key() { return projectId == null ? "BU" : "PROJECT:" + projectId; }
    }

    private record StoredOriginal(String name, DocumentStorage.StoredFile file) {}
    private record DocumentOriginals(String projectId, String scope, String originals) {}
}
