package com.naura.rfq.service;

import com.naura.rfq.mapper.HistoryDocumentMapper;
import com.naura.rfq.mapper.KnowledgeRecordMapper;
import com.naura.rfq.mapper.Table;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.integration.standardreply.KnowledgeIndexQueue;
import com.naura.rfq.integration.standardreply.Library;
import com.naura.rfq.model.dto.HistoryRfqBatchSubmitRequest;
import com.naura.rfq.model.dto.HistoryRfqDraftRequest;
import com.naura.rfq.security.CurrentUser;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
public class HistoryRfqReviewService {
    private static final Set<String> EDITABLE = Set.of("草稿", "退回");
    @Autowired
    private HistoryDocumentMapper historyDocuments;
    @Autowired
    private KnowledgeRecordMapper knowledgeRecords;
    @Autowired
    private ObjectMapper json;
    @Autowired
    private KnowledgePublicationAccess access;
    @Autowired
    private KnowledgeIndexQueue index;
    @Autowired
    private AuditService audit;

    public record SubmitResult(int submitted) {}

    public ObjectNode version(CurrentUser user, String buId, String id, int version) {
        access.requireScope(user, buId, null, null);
        var record = find(knowledgeRecords.findVersion(Table.HISTORY, buId, id, version).stream().map(this::map).toList(), version);
        requireReadable(user, buId, record);
        return withIndexStatus(buId, record);
    }

    @Transactional
    public ObjectNode updateDraft(CurrentUser user, String buId, String id, int version, HistoryRfqDraftRequest request) {
        access.requireWriter(user, buId, false);
        var row = checked(user, buId, lock(buId, id), version, request.revision());
        requireState(EDITABLE.contains(row.status()), "仅草稿或退回的历史条款可以修改");
        String description = request.requirement().strip();
        row.payload().put("title", request.title().strip()).put("requirement", description).put("requirementText", description)
                .put("answer", request.answer().strip()).put("conditions", clean(request.conditions()));
        return save(user, buId, row, "编辑历史 RFQ 草稿", "");
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode transition(CurrentUser user, String buId, String id, int version, long revision, String action, String reason) {
        access.requireWriter(user, buId, Set.of("publish", "return", "revoke").contains(action));
        if (Set.of("publish", "revoke").contains(action)) {
            access.lockBu(buId);
        }
        var chain = lock(buId, id);
        var row = checked(user, buId, chain, version, revision);
        String note = clean(reason);
        return switch (action) {
            case "submit" -> submit(user, buId, row, note);
            case "publish" -> publish(user, buId, chain, row, note);
            case "return" -> returnForEdit(user, buId, row, note);
            case "revoke" -> revoke(user, buId, chain, row, note);
            case "revise" -> revise(user, buId, chain, row);
            case "delete" -> deleteDraft(user, buId, row);
            default -> throw new BusinessException(404, "未知的历史 RFQ 操作");
        };
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public SubmitResult submitAll(CurrentUser user, String buId, List<HistoryRfqBatchSubmitRequest.Clause> targets) {
        access.requireWriter(user, buId, false);
        List<HistoryRfqBatchSubmitRequest.Clause> ordered = targets == null ? List.of() : targets.stream()
                .distinct().sorted(Comparator.comparing(HistoryRfqBatchSubmitRequest.Clause::id)
                        .thenComparingInt(HistoryRfqBatchSubmitRequest.Clause::version)).toList();
        requireState(!ordered.isEmpty(), "没有可提交的历史条款");
        Map<String, List<Clause>> chains = new LinkedHashMap<>();
        for (String id : ordered.stream().map(HistoryRfqBatchSubmitRequest.Clause::id).distinct().toList()) {
            chains.put(id, lock(buId, id));
        }
        List<String> issues = new ArrayList<>();
        List<Clause> prepared = new ArrayList<>();
        for (HistoryRfqBatchSubmitRequest.Clause target : ordered) {
            try {
                Clause row = checked(user, buId, chains.get(target.id()), target.version(), target.revision());
                requireState(EDITABLE.contains(row.status()), "仅草稿或退回的历史条款可以提交");
                requireState(!"被替代".equals(row.payload().path("validity").asText()), "已替代版本不能提交");
                requireContent(row);
                prepared.add(row);
            } catch (BusinessException failure) {
                issues.add("条款 " + target.id() + " V" + target.version() + "：" + failure.getMessage());
            }
        }
        if (!issues.isEmpty()) {
            throw new BusinessException(422, "以下条款无法提交：" + summarize(issues));
        }
        for (Clause row : prepared) {
            submit(user, buId, row, "");
        }
        return new SubmitResult(prepared.size());
    }

    private String summarize(List<String> issues) {
        return issues.size() <= 5 ? String.join("；", issues)
                : String.join("；", issues.subList(0, 5)) + " 等 " + issues.size() + " 条";
    }

    private ObjectNode submit(CurrentUser user, String buId, Clause row, String reason) {
        requireState(EDITABLE.contains(row.status()), "仅草稿或退回的历史条款可以提交");
        requireContent(row);
        row.payload().put("status", "待审核").put("submitterId", user.id()).put("submittedAt", Instant.now().toString());
        return save(user, buId, row, "提交历史 RFQ 审核", reason);
    }

    private ObjectNode deleteDraft(CurrentUser user, String buId, Clause row) {
        requireState(EDITABLE.contains(row.status()), "仅草稿或退回的历史条款可以删除");
        row.payload().put("status", "已删除").put("validity", "已删除");
        return save(user, buId, row, "删除历史 RFQ 条款", "");
    }

    private ObjectNode publish(CurrentUser user, String buId, List<Clause> chain, Clause row, String reason) {
        boolean directPublish = EDITABLE.contains(row.status());
        requireState(directPublish || "待审核".equals(row.status()), "仅草稿、退回或待审核的历史条款可以发布");
        if (!directPublish) {
            requireState(!row.payload().path("submitterId").asText().isBlank(), "缺少提交人，请退回后重新提交");
        }
        requireState(isLatestVisible(chain, row), "只能发布最新版本");
        requireContent(row);
        requireState(row.buShared() || "仅当前项目".equals(row.scope()) && row.projectId() != null,
                "请通过历史 RFQ 导入入口确认共享范围后再发布");
        var sourceDocument = historyDocuments.findLatestSource(buId, row.payload().path("documentId").asText());
        requireState(sourceDocument.isPresent() && java.util.Objects.equals(sourceDocument.get().projectId(), row.projectId())
                && java.util.Objects.equals(sourceDocument.get().scope(), row.scope()), "历史条款缺少同范围的来源文档");
        var document = sourceDocument.map(source -> decode(source.payload())).orElseGet(json::createObjectNode);

        for (Clause previous : chain) {
            if (!previous.active()) {
                continue;
            }
            requireReadable(user, buId, previous);
            previous.payload().put("validity", "被替代").put("supersededByVersion", row.version());
            save(user, buId, previous, "替代历史 RFQ 旧版本", "新版本 V" + row.version());
        }
        row.payload().put("status", "已发布").put("validity", "有效").put("publishedById", user.id())
                .put("publishedAt", Instant.now().toString());
        var projection = json.createObjectNode().put("title", row.payload().path("title").asText())
                .put("requirement_text", recallContext(row.payload()) + row.payload().path("requirement").asText())
                .put("bu_id", buId).put("record_version", row.version())
                .put("document_title", document.path("name").asText())
                .put("document_id", row.payload().path("documentId").asText())
                .put("group_id", KnowledgeGroupService.primaryGroup(document));
        index.enqueue(Library.HISTORY_RFQ, buId, row.id(), row.version(), projection);
        return save(user, buId, row, directPublish ? "直接发布历史 RFQ" : "批准发布历史 RFQ", reason);
    }

    /**
     * 语义索引文本带上客户/机型上下文（仅索引投影使用，条款 payload 的 requirement 保持原文），
     * 使新 RFQ 比对时语义召回偏向同客户、同机型的历史资料；未维护客户/机型时返回空串。
     */
    private String recallContext(JsonNode payload) {
        var parts = new ArrayList<String>();
        for (String[] field : new String[][]{{"customer", "客户："}, {"model", "机型："}}) {
            String value = payload.path(field[0]).asText("").strip();
            if (!value.isBlank()) {
                parts.add(field[1] + value);
            }
        }
        return parts.isEmpty() ? "" : String.join("；", parts) + "。\n";
    }

    private ObjectNode returnForEdit(CurrentUser user, String buId, Clause row, String reason) {
        requireState("待审核".equals(row.status()), "仅待审核的历史条款可以审核");
        requireReason(reason);
        row.payload().put("status", "退回");
        return save(user, buId, row, "退回历史 RFQ 条款", reason);
    }

    private ObjectNode revoke(CurrentUser user, String buId, List<Clause> chain, Clause row, String reason) {
        int active = chain.stream().filter(Clause::active).mapToInt(Clause::version).max().orElse(0);
        requireState(active == row.version(), "仅当前发布版本可以撤销");
        row.payload().put("status", "已撤销").put("validity", "已撤销");
        index.enqueue(Library.HISTORY_RFQ, buId, row.id(), row.version(), null);
        return save(user, buId, row, "撤销历史 RFQ 条款", reason);
    }

    private ObjectNode revise(CurrentUser user, String buId, List<Clause> chain, Clause row) {
        requireState(isLatestVisible(chain, row), "已存在较新版本，请打开该版本");
        requireState(Set.of("已发布", "已撤销").contains(row.status()), "仅已发布或已撤销的条款可以修订");
        int version = Math.addExact(chain.get(chain.size() - 1).version(), 1);
        var next = row.payload().deepCopy();
        next.remove(List.of("submitterId", "submittedAt", "publishedById", "publishedAt", "supersededByVersion", "history"));
        next.put("version", version).put("revision", 0).put("status", "草稿").put("validity", "待核对");
        addHistory(next, user, "修订历史 RFQ 条款", "基于 V" + row.version());
        knowledgeRecords.insertVersion(Table.HISTORY, buId, row.id(), version, row.projectId(), row.scope(), next.toString());
        audit(user, buId, row.id(), version, "修订历史 RFQ 条款", "基于 V" + row.version());
        return next;
    }

    private ObjectNode save(CurrentUser user, String buId, Clause row, String action, String reason) {
        long revision = row.revision() + 1;
        row.payload().put("revision", revision);
        addHistory(row.payload(), user, action, reason);
        requireState(knowledgeRecords.updateVersion(Table.HISTORY, buId, row.id(), row.version(),
                revision, row.revision(), row.payload().toString()) == 1,
                "历史条款已变更，请刷新后再操作");
        audit(user, buId, row.id(), row.version(), action, reason);
        return withIndexStatus(buId, new Clause(row.id(), row.version(), revision, row.projectId(), row.scope(), row.payload()));
    }

    private void audit(CurrentUser user, String buId, String id, int version, String action, String reason) {
        audit.successInBu(user.id(), buId, action, "history_clause", id.length() <= 64 ? id : null,
                id + " V" + version + (reason.isBlank() ? "" : " · " + reason));
    }

    private void addHistory(ObjectNode payload, CurrentUser user, String action, String reason) {
        payload.withArray("history").addObject().put("date", Instant.now().toString()).put("actorId", user.id())
                .put("action", action).put("reason", reason)
                .put("text", user.displayName() + " " + action + (reason.isBlank() ? "" : "：" + reason));
    }

    private ObjectNode withIndexStatus(String buId, Clause row) {
        return index.status(Library.HISTORY_RFQ, buId, row.id(), row.version())
                .annotate(row.payload().deepCopy().put("revision", row.revision()));
    }

    private void requireReadable(CurrentUser user, String buId, Clause row) {
        String project = row.projectId();
        if (project == null) {
            project = KnowledgePublicationAccess.recordProjectId(row.payload());
        }
        access.requireScope(user, buId, project, row.scope());
    }

    private void requireContent(Clause row) {
        if (row.payload().path("requirement").asText().isBlank() || row.payload().path("answer").asText().isBlank()) {
            throw new BusinessException(422, "请补齐原条款和历史答复后再提交或发布");
        }
    }

    private void requireReason(String reason) {
        if (reason.isBlank()) {
            throw new BusinessException(422, "请填写操作原因");
        }
    }

    private void requireState(boolean allowed, String message) {
        if (!allowed) {
            throw new BusinessException(409, message);
        }
    }

    private String clean(String value) { return value == null ? "" : value.strip(); }

    private boolean isLatestVisible(List<Clause> chain, Clause row) {
        return chain.stream().noneMatch(candidate -> candidate.version() > row.version() && !"已删除".equals(candidate.status()));
    }

    private List<Clause> lock(String buId, String id) {
        return knowledgeRecords.lockVersions(Table.HISTORY, buId, id).stream().map(this::map).toList();
    }

    private Clause checked(CurrentUser user, String buId, List<Clause> chain, int version, long revision) {
        var row = find(chain, version);
        requireReadable(user, buId, row);
        String documentId = row.payload().path("documentId").asText();
        if (!documentId.isBlank()) {
            requireState(historyDocuments.findDeletedIds(buId, documentId).isEmpty(), "历史 RFQ 文档已删除");
        }
        requireState(row.revision() == revision, "历史条款已变更，请刷新后再操作");
        return row;
    }

    private Clause find(List<Clause> chain, int version) {
        return chain.stream().filter(row -> row.version() == version).findFirst()
                .orElseThrow(() -> new BusinessException(404, "历史条款版本不存在"));
    }

    private ObjectNode decode(String payload) {
        try {
            return (ObjectNode) json.readTree(payload);
        } catch (JsonProcessingException failure) {
            log.error("解析历史文档记录失败 errorType={}", failure.getClass().getSimpleName());
            throw new IllegalStateException("历史文档记录格式异常", failure);
        }
    }

    private Clause map(KnowledgeRecordMapper.VersionRow row) {
        try {
            return new Clause(row.id(), row.version(), row.revision(), row.projectId(),
                    row.scope(), (ObjectNode) json.readTree(row.payload()));
        } catch (JsonProcessingException failure) {
            log.error("解析历史条款失败 errorType={}", failure.getClass().getSimpleName());
            throw new IllegalStateException("历史条款格式异常", failure);
        }
    }

    private record Clause(String id, int version, long revision, String projectId, String scope, ObjectNode payload) {
        String status() { return payload.path("status").asText(); }
        boolean active() { return "已发布".equals(status()) && !"被替代".equals(payload.path("validity").asText()); }
        boolean buShared() {
            return projectId == null && "BU共享".equals(scope) && payload.path("projectId").asText().isBlank()
                    && payload.path("sourceProjectId").asText().isBlank();
        }
    }
}
