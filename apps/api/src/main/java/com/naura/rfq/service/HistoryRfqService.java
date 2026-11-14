package com.naura.rfq.service;

import com.naura.rfq.mapper.HistoryDocumentMapper;
import com.naura.rfq.mapper.HistoryDocumentMapper.ParseKey;
import com.naura.rfq.mapper.KnowledgeRecordMapper;
import com.naura.rfq.mapper.Table;
import com.naura.rfq.mapper.ResponseMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.model.vo.HistoryParseView;
import com.naura.rfq.model.vo.HistorySource;
import com.naura.rfq.security.CurrentUser;
import com.naura.rfq.storage.DocumentStorage;
import java.io.IOException;
import java.nio.file.Files;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
@Slf4j
public class HistoryRfqService {
    @Autowired
    private HistoryDocumentMapper historyDocuments;
    @Autowired
    private KnowledgeRecordMapper knowledgeRecords;
    @Autowired
    private ResponseMapper responseRecords;
    @Autowired
    private ObjectMapper json;
    @Autowired
    private PlatformTransactionManager transactions;
    @Autowired
    private KnowledgePublicationAccess access;
    @Autowired
    private DocumentStorage storage;
    @Autowired
    private HistoryParseService parser;
    @Autowired
    private AuditService audit;
    @Autowired
    private KnowledgeGroupService groups;

    public record Intake(ObjectNode document, List<ObjectNode> clauses, boolean duplicate) {}
    public record Original(String name, String contentType, byte[] bytes) {}
    public record DocumentEdit(long revision, JsonNode metadata, List<String> groupIds) {}
    public record Manual(String id, String title, String clauseNo, String section, String requirement, String answer, String conditions) {}
    public record ManualDocument(String name, String projectId, boolean shareWithBu, Manual clause) {}
    private record SourceDocument(Scope scope, ObjectNode payload, JsonNode originals) {}

    public Intake upload(CurrentUser user, String buId, MultipartFile file, MultipartFile responseFile,
            String projectId, boolean shareWithBu) throws IOException {
        return upload(user, buId, file, responseFile, projectId, shareWithBu, null, null, null);
    }

    public Intake upload(CurrentUser user, String buId, MultipartFile file, MultipartFile responseFile,
            String projectId, boolean shareWithBu, String previousId, Long revision, String note) throws IOException {
        access.requireWriter(user, buId, false);
        String scopedProject = projectId == null || projectId.isBlank() ? null : projectId.strip();
        if ((scopedProject == null) != shareWithBu) {
            throw new BusinessException(400, "请选择 BU 共享或指定项目范围");
        }
        var scope = new Scope(buId, scopedProject);
        access.requireScope(user, buId, scope.projectId(), scope.name());
        var previous = previousId == null ? null : sourceDocument(user, buId, previousId);
        if (previous != null && !scope.equals(previous.scope())) {
            throw new BusinessException(400, "新版须沿用历史原件的可见范围");
        }
        parser.requireEnabled();
        var files = new ArrayList<StoredOriginal>();
        boolean retained = false;
        try {
            files.add(save(file));
            if (responseFile != null && !responseFile.isEmpty()) {
                files.add(save(responseFile));
            }
            String hashes = files.get(0).file().sha256() + ":" + (files.size() == 2 ? files.get(1).file().sha256() : "");
            String fingerprint = "upload:" + (previous == null ? scope.key() + ":" + hashes
                    : MatchEvaluator.digest(scope.key() + ":" + previousId + ":" + hashes));
            var result = new TransactionTemplate(transactions).execute(status -> {
                access.lockBu(buId);
                return queueParse(user, scope, files, fingerprint, previous, revision, note);
            });
            retained = result != null && !result.duplicate();
            return result;
        } finally {
            if (!retained) {
                files.forEach(this::discard);
            }
        }
    }

    private Intake queueParse(CurrentUser user, Scope scope, List<StoredOriginal> files, String fingerprint,
            SourceDocument previous, Long revision, String note) {
        var duplicate = existing(scope, fingerprint);
        if (duplicate != null) {
            return duplicate;
        }
        var document = document(user, scope, Ids.next("HD"), files.get(0).name(), "history-upload")
                .put("parseStatus", "parsing");
        if (files.size() == 2) {
            document.put("responseName", files.get(1).name());
        }
        var originals = json.createArrayNode();
        for (var source : files) {
            originals.addObject().put("name", source.name()).put("ref", source.file().storageRef())
                    .put("size", source.file().size()).put("sha256", source.file().sha256());
        }
        if (previous != null) {
            attachVersion(user, scope, previous, revision, note, document);
        }
        return insertIntake(user, scope, fingerprint, document, List.of(), originals);
    }

    private void attachVersion(CurrentUser user, Scope scope, SourceDocument previous, Long revision,
            String note, ObjectNode document) {
        String parent = previous.payload().path("id").asText();
        var current = sourceDocument(user, scope.buId(), parent).payload();
        requireRevision(current, revision);
        if ("parsing".equals(current.path("parseStatus").asText())) {
            throw new BusinessException(409, "历史 RFQ 正在解析，请稍后再试");
        }
        String family = current.path("familyId").asText(parent);
        int currentNumber = current.path("versionNumber").asInt(1);
        var versions = historyDocuments.listFamily(scope.buId(), parent, family).stream().map(this::decode).toList();
        if (versions.stream().anyMatch(row -> row.path("versionNumber").asInt(1) > currentNumber
                && !"已删除".equals(row.path("status").asText()))) {
            throw new BusinessException(409, "该版本已有后续版本，请从最新版本继续");
        }
        int number = Math.addExact(versions.stream().mapToInt(row -> row.path("versionNumber").asInt(1))
                .max().orElse(currentNumber), 1);
        document.put("familyId", family).put("previousDocumentId", parent).put("versionNumber", number)
                .put("version", "V" + number).put("changeNote", limited(note, 900, false));
        if (current.has("groupIds")) {
            document.set("groupIds", current.path("groupIds"));
        }
        if (current.path("metadata").isObject()) {
            document.set("metadata", current.path("metadata"));
        }
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Intake reparse(CurrentUser user, String buId, String id, long revision) {
        access.requireWriter(user, buId, false);
        access.lockBu(buId);
        var source = sourceDocument(user, buId, id);
        requireRevision(source.payload(), revision);
        parser.requireEnabled();
        var files = storedOriginals(source.originals());
        if (files.isEmpty()) {
            throw new BusinessException(409, "该文档没有可重新解析的独立原件");
        }
        var document = source.payload();
        if ("failed".equals(document.path("parseStatus").asText())) {
            document.put("parseStatus", "parsing").put("revision", revision + 1).remove("error");
            historyDocuments.enqueueParse(buId, id, document.toString());
            return new Intake(document, List.of(), false);
        }
        return queueParse(user, source.scope(), files, "reparse:" + id + ":" + revision, source, revision, "重新解析原件");
    }

    ParseJob claimParse() {
        var key = historyDocuments.findDueParse();
        if (key == null) {
            return null;
        }
        String token = UUID.randomUUID().toString();
        int claimed = historyDocuments.claimParse(key.buId(), key.id(), token);
        if (claimed == 0) {
            return null;
        }
        var originals = historyDocuments.findParseOriginals(key.buId(), key.id(), token).stream().map(this::decode).toList();
        return originals.isEmpty() ? null : new ParseJob(key, token, originals.get(0));
    }

    void renewParse(ParseJob job) {
        historyDocuments.renewParse(job.key().buId(), job.key().id(), job.token());
    }

    void parse(ParseJob job) {
        HistoryParseView parsed = null;
        String error = "";
        try {
            parser.requireEnabled();
            var files = storedOriginals(job.originals());
            var sources = new ArrayList<HistorySource>();
            for (int i = 0; i < files.size(); i++) {
                var source = files.get(i);
                sources.add(parser.readStored(source.file(), source.name(), i == 0 ? "main:" : "answer:"));
            }
            parsed = parser.extract(sources);
        } catch (IOException | RuntimeException failure) {
            log.error("历史 RFQ 解析任务失败 documentId={}", job.key().id(), failure);
            log.warn("历史 RFQ 解析失败 documentId={} errorType={}", job.key().id(), failure.getClass().getSimpleName());
            error = failure instanceof BusinessException ? failure.getMessage() : "解析失败，请重试";
        }
        finishParse(job.key(), job.token(), parsed, error);
    }

    private void finishParse(ParseKey key, String token, HistoryParseView parsed, String error) {
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            access.lockBu(key.buId());
            var source = historyDocuments.lockParseSource(key.buId(), key.id(), token)
                    .map(row -> new SourceDocument(new Scope(key.buId(), row.projectId()),
                            (ObjectNode) decode(row.payload()), json.nullNode())).orElse(null);
            if (source == null) {
                return;
            }
            var document = source.payload();
            document.put("revision", document.path("revision").asLong() + 1);
            if (parsed == null) {
                document.put("parseStatus", "failed").put("error", error);
            } else {
                applyParse(source.scope(), document, parsed);
            }
            historyDocuments.finishParse(key.buId(), key.id(), document.toString());
        });
    }

    private void applyParse(Scope scope, ObjectNode document, HistoryParseView parsed) {
        var metadata = document.path("metadata") instanceof ObjectNode current ? current : document.putObject("metadata");
        json.valueToTree(parsed.metadata()).fields().forEachRemaining(entry -> {
            if (!entry.getValue().asText().isBlank() && metadata.path(entry.getKey()).asText().isBlank()) {
                metadata.set(entry.getKey(), entry.getValue());
            }
        });
        document.set("issues", json.valueToTree(parsed.issues()));
        var summaries = document.putArray("sources");
        parsed.sources().forEach(source -> summaries.addObject().put("name", source.name()).put("prefix", source.prefix()));
        document.put("parseStatus", !parsed.clauses().isEmpty() && parsed.issues().isEmpty()
                && parsed.clauses().stream().allMatch(row -> row.issues().isEmpty()) ? "complete" : "partial");
        for (var row : parsed.clauses()) {
            insertClause(scope, draft(document.path("uploadedBy").asText(), scope, document, json.valueToTree(row)));
        }
        audit.successInBu(document.path("uploadedById").asText(), scope.buId(), "历史 RFQ 解析完成", "history_document",
                document.path("id").asText(), "新增条款草稿 " + parsed.clauses().size());
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode deleteDocument(CurrentUser user, String bu, String id, long revision) {
        access.requireWriter(user, bu, false);
        access.lockBu(bu);
        var document = sourceDocument(user, bu, id).payload();
        requireRevision(document, revision);
        var clauses = historyDocuments.lockClauses(bu, id).stream().map(this::decode).toList();
        if (clauses.stream().anyMatch(clause -> "待审核".equals(clause.path("status").asText())
                || ("已发布".equals(clause.path("status").asText()) && !"被替代".equals(clause.path("validity").asText())))) {
            throw new BusinessException(409, "请先退回待审核条款，并撤销当前已发布条款，再删除文档");
        }
        document.put("status", "已删除").put("revision", revision + 1);
        historyDocuments.markDeleted(bu, id, document.toString());
        audit.successInBu(user.id(), bu, "删除历史 RFQ 文档", "history_document", id, "");
        return document;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode editDocument(CurrentUser user, String bu, String id, DocumentEdit request) {
        access.requireWriter(user, bu, false);
        access.lockBu(bu);
        var document = sourceDocument(user, bu, id).payload();
        requireRevision(document, request.revision());
        var metadata = document.path("metadata") instanceof ObjectNode old ? old : document.putObject("metadata");
        if (request.metadata() != null && request.metadata().isObject()) {
            for (String field : Set.of("customer", "projectName", "model", "config", "date")) {
                if (request.metadata().has(field)) {
                    metadata.put(field, limited(request.metadata().path(field).asText(), 300, false));
                }
            }
        }
        if (request.groupIds() != null) {
            document.set("groupIds", groups.groupIds(bu, request.groupIds(), document.path("groupIds")));
        }
        document.put("revision", request.revision() + 1);
        historyDocuments.updatePayload(bu, id, document.toString());
        audit.successInBu(user.id(), bu, "维护历史 RFQ 文档信息", "history_document", id, "");
        return document;
    }

    @Transactional
    public Intake createManual(CurrentUser user, String bu, ManualDocument request) {
        access.requireWriter(user, bu, false);
        String project = request.projectId() == null || request.projectId().isBlank() ? null : request.projectId().strip();
        if ((project == null) != request.shareWithBu() || request.clause() == null) {
            throw new BusinessException(400, "请填写可见范围和首条要求");
        }
        var scope = new Scope(bu, project);
        access.requireScope(user, bu, project, scope.name());
        String fingerprint = "manual:" + MatchEvaluator.digest(scope.key() + ":" + user.id() + ":" + limited(request.clause().id(), 128, true));
        var doc = document(user, scope, Ids.next("HD"), limited(request.name(), 250, true), "manual")
                .put("parseStatus", "manual").put("manual", true);
        var result = saveIntake(user, scope, fingerprint, doc, List.of(), null);
        if (result.duplicate()) {
            return result;
        }
        return new Intake(doc, List.of(addManual(user, bu, doc.path("id").asText(), request.clause())), false);
    }

    @Transactional
    public ObjectNode addManual(CurrentUser user, String bu, String documentId, Manual request) {
        access.requireWriter(user, bu, false);
        access.lockBu(bu);
        var source = sourceDocument(user, bu, documentId);
        String id = limited(request.id(), 128, true);
        if (!id.matches("HK-[A-Za-z0-9-]{1,80}")) {
            throw new BusinessException(400, "补录操作编号无效");
        }
        var duplicate = knowledgeRecords.findVersion(Table.HISTORY, bu, id, 1).stream()
                .map(row -> (ObjectNode) decode(row.payload())).findFirst().orElse(null);
        if (duplicate != null) {
            if (!documentId.equals(duplicate.path("documentId").asText()) || !user.id().equals(duplicate.path("createdById").asText())) {
                throw new BusinessException(409, "条款编号已使用");
            }
            return duplicate;
        }
        var clause = draft(user.displayName(), source.scope(), source.payload(), json.createObjectNode()
                .put("clauseNo", limited(request.clauseNo(), 128, false)).put("section", limited(request.section(), 300, false))
                .put("requirement", limited(request.requirement(), 4000, true)).put("answer", limited(request.answer(), 8000, false))
                .put("conditions", limited(request.conditions(), 2000, false)))
                .put("id", id).put("manual", true).put("createdById", user.id());
        if (request.title() != null && !request.title().isBlank()) {
            clause.put("title", limited(request.title(), 200, true));
        }
        insertClause(source.scope(), clause);
        audit.successInBu(user.id(), bu, "手工补录历史条款", "history-rfq-record", id, documentId);
        return clause;
    }

    private SourceDocument sourceDocument(CurrentUser user, String bu, String id) {
        var source = historyDocuments.findLatestSource(bu, id)
                .map(row -> new SourceDocument(new Scope(bu, row.projectId()), (ObjectNode) decode(row.payload()),
                        row.originals() == null ? json.nullNode() : decode(row.originals()))).orElseThrow(() -> new BusinessException(404, "历史 RFQ 文档不存在"));
        access.requireScope(user, bu, source.scope().projectId(), source.payload().path("scope").asText(source.scope().name()));
        String origin = KnowledgePublicationAccess.recordProjectId(source.payload());
        if (!origin.isBlank()) {
            access.requireScope(user, bu, origin, "仅当前项目");
        }
        if ("已删除".equals(source.payload().path("status").asText())) {
            throw new BusinessException(404, "历史 RFQ 文档已删除");
        }
        return source;
    }

    private void requireRevision(ObjectNode doc, Long revision) {
        if (revision == null || revision != doc.path("revision").asLong()) {
            throw new BusinessException(409, "历史原件已变化，请刷新");
        }
    }

    private String limited(String value, int limit, boolean required) {
        String text = value == null ? "" : value.strip();
        if (text.length() > limit || required && text.isEmpty()) {
            throw new BusinessException(400, "历史记录字段为空或超出长度限制");
        }
        return text;
    }

    @Transactional
    public Intake fromSnapshot(CurrentUser user, String projectId, String snapshotId, boolean shareWithBu) {
        var project = access.requireProject(user, null, projectId);
        String buId = project.getBuId();
        // A project snapshot remains project scoped unless a BU publisher explicitly requests sharing.
        access.requireWriter(user, buId, shareWithBu);
        var scope = new Scope(buId, shareWithBu ? null : projectId);
        String fingerprint = "snapshot:" + snapshotId + (shareWithBu ? ":BU" : ":PROJECT");
        var snapshot = responseRecords.findSnapshot(projectId, snapshotId).stream().map(this::decode).findFirst()
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
            if (row.hasNonNull("sourceRequirementVersion")) {
                source.set("sourceRequirementVersion", row.get("sourceRequirementVersion"));
            }
            clauses.add(draft(user.displayName(), scope, document, source));
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
        var document = historyDocuments.findLatestOriginals(buId, id)
                .orElseThrow(() -> new BusinessException(404, "历史 RFQ 文档不存在"));
        access.requireScope(user, buId, document.projectId(), document.scope());
        if (document.originals() == null) {
            throw new BusinessException(404, "此记录没有独立保存的原件");
        }
        JsonNode source = decode(document.originals()).path(position);
        if (source.isMissingNode()) {
            throw new BusinessException(404, "没有所选原件");
        }
        String name = source.path("name").asText();
        try (var lease = storage.open(source.path("ref").asText(), source.path("size").asLong(), source.path("sha256").asText())) {
            return new Original(name, ".pdf".equals(HistoryParseService.extension(name)) ? "application/pdf"
                    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Files.readAllBytes(lease.path()));
        }
    }

    private Intake saveIntake(CurrentUser user, Scope scope, String fingerprint, ObjectNode document,
            List<ObjectNode> clauses, JsonNode originals) {
        access.lockBu(scope.buId());
        var duplicate = existing(scope, fingerprint);
        if (duplicate != null) {
            return duplicate;
        }
        return insertIntake(user, scope, fingerprint, document, clauses, originals);
    }

    private Intake insertIntake(CurrentUser user, Scope scope, String fingerprint, ObjectNode document,
            List<ObjectNode> clauses, JsonNode originals) {
        String id = document.path("id").asText();
        boolean parsing = "parsing".equals(document.path("parseStatus").asText());
        historyDocuments.insert(scope.buId(), id, scope.projectId(), scope.name(), document.toString(), fingerprint,
                originals == null ? null : originals.toString(), parsing);
        for (ObjectNode clause : clauses) {
            insertClause(scope, clause);
        }
        audit.successInBu(user.id(), scope.buId(), "历史 RFQ 入库", "history_document", id,
                parsing ? "原件已保存，等待解析" : "新增条款草稿 " + clauses.size());
        return new Intake(document, List.copyOf(clauses), false);
    }

    private void insertClause(Scope scope, ObjectNode clause) {
        knowledgeRecords.insertVersion(Table.HISTORY, scope.buId(), clause.path("id").asText(), 1,
                scope.projectId(), scope.name(), clause.toString());
    }

    private Intake existing(Scope scope, String fingerprint) {
        return historyDocuments.lockByFingerprint(scope.buId(), fingerprint)
                .map(payload -> (ObjectNode) decode(payload))
                .map(document -> new Intake(document, historyDocuments.lockActiveClauses(scope.buId(), document.path("id").asText())
                        .stream().map(payload -> (ObjectNode) decode(payload)).toList(), true)).orElse(null);
    }

    private ObjectNode document(CurrentUser user, Scope scope, String id, String name, String sourceType) {
        var result = json.createObjectNode().put("id", id).put("familyId", id).put("buId", scope.buId()).put("name", name)
                .put("version", "V1").put("versionNumber", 1).put("revision", 1).put("scope", scope.name()).put("sourceType", sourceType)
                .put("uploadedBy", user.displayName()).put("uploadedById", user.id()).put("createdAt", Instant.now().toString());
        if (scope.projectId() != null) {
            result.put("projectId", scope.projectId());
        }
        return result;
    }

    private ObjectNode draft(String author, Scope scope, ObjectNode document, ObjectNode source) {
        String id = Ids.next("HR");
        String requirement = source.path("requirement").asText();
        String title = source.path("title").asText(requirement);
        int titleLength = Math.min(200, title.codePointCount(0, title.length()));
        source.put("id", id).put("documentId", document.path("id").asText()).put("buId", scope.buId())
                .put("type", "history").put("title", title.substring(0, title.offsetByCodePoints(0, titleLength)))
                .put("version", 1).put("revision", 0).put("status", "草稿").put("validity", "待核对")
                .put("scope", scope.name()).put("source", document.path("name").asText())
                .put("sourceType", document.path("sourceType").asText()).put("author", author);
        if (scope.projectId() != null) {
            source.put("projectId", scope.projectId());
        }
        return source;
    }

    private StoredOriginal save(MultipartFile file) throws IOException {
        String name = HistoryParseService.fileName(file);
        return new StoredOriginal(name, storage.save(Ids.next("HFILE"), file, HistoryParseService.extension(name)));
    }

    private List<StoredOriginal> storedOriginals(JsonNode originals) {
        var files = new ArrayList<StoredOriginal>();
        for (var original : originals) {
            files.add(new StoredOriginal(original.path("name").asText(),
                    new DocumentStorage.StoredFile(original.path("ref").asText(), original.path("size").asLong(),
                            original.path("sha256").asText())));
        }
        return files;
    }

    private void discard(StoredOriginal original) {
        try { storage.delete(original.file().storageRef()); }
        catch (IOException failure) { log.error("临时历史 RFQ 原件清理失败", failure); }
    }

    private JsonNode decode(String payload) {
        try { return json.readTree(payload); }
        catch (JsonProcessingException failure) {
            log.error("解析历史 RFQ 记录失败 errorType={}", failure.getClass().getSimpleName());
            throw new IllegalStateException("历史 RFQ 记录格式异常", failure);
        }
    }

    private record Scope(String buId, String projectId) {
        String name() { return projectId == null ? "BU共享" : "仅当前项目"; }
        String key() { return projectId == null ? "BU" : "PROJECT:" + projectId; }
    }

    private record StoredOriginal(String name, DocumentStorage.StoredFile file) {}
    record ParseJob(ParseKey key, String token, JsonNode originals) {}
}
