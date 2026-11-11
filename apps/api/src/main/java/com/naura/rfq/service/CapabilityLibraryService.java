package com.naura.rfq.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.integration.standardreply.KnowledgeIndexQueue;
import com.naura.rfq.integration.standardreply.KnowledgeIndexQueue.Library;
import com.naura.rfq.model.dto.CapabilityLibraryRequest;
import com.naura.rfq.security.CurrentUser;
import com.naura.rfq.service.CapabilityCatalog.Row;
import com.naura.rfq.service.CapabilityCatalog.Table;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import static com.naura.rfq.service.CapabilityCatalog.clean;
import static com.naura.rfq.service.CapabilityCatalog.scope;

@Service
@RequiredArgsConstructor
@Slf4j
public class CapabilityLibraryService {
    private static final Set<String> EDITABLE = Set.of("草稿", "退回");
    private static final Set<String> VALUE_TYPES = Set.of("保证值", "典型值", "单次测试值");
    private static final List<String> BASELINE_FIELDS = List.of("modelId", "modelVersion", "processId", "processVersion", "config", "metricCode");
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final KnowledgePublicationAccess access;
    private final CapabilityCatalog catalog;
    private final CapabilityExcelParser excel;
    private final KnowledgeIndexQueue index;

    public record ImportError(int rowNumber, String message) {}
    public record Imported(List<ObjectNode> items, List<Integer> skippedRows, List<ImportError> errors) {}

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode create(CurrentUser user, String buId, CapabilityLibraryRequest.Draft input) {
        begin(user, buId, false);
        String project = catalog.scopeProject(user, buId, input.projectId());
        var payload = draft(input);
        return storeDraft(user, buId, project, payload.put("source", "手动添加"),
                "manual:" + digest(user.id() + "\n" + clean(project) + "\n" + payload), false);
    }

    @Transactional(readOnly = true)
    public JsonNode extractHistoryMetrics(CurrentUser user, String buId, String id, int version) {
        access.requireCapabilityWriter(user, buId, false, false);
        var row = catalog.required(Table.HISTORY, buId, id, version);
        catalog.requireReadable(user, buId, row);
        if (!active(row)) {
            throw new BusinessException(422, "仅可从有效的已发布历史 RFQ 条款提取指标");
        }
        return json.valueToTree(HistoryCapabilityExtraction.fromAnswer(row.payload().path("answer").asText(),
                row.payload().path("conditions").asText()));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode fromHistory(CurrentUser user, String buId, String historyId, int historyVersion, CapabilityLibraryRequest.Draft input) {
        begin(user, buId, false);
        var history = catalog.required(Table.HISTORY, buId, historyId, historyVersion);
        catalog.requireReadable(user, buId, history);
        if (!active(history)) {
            throw new BusinessException(422, "仅有效的已发布历史 RFQ 条款可以作为能力来源");
        }
        String project = catalog.scopeProject(user, buId, input.projectId());
        if (!clean(history.project()).isBlank()) {
            if (project != null && !project.equals(history.project())) {
                throw new BusinessException(422, "候选须保留历史条款的项目范围");
            }
            project = history.project();
        } else if (!CapabilityCatalog.SHARED.equals(history.scope())) {
            throw new BusinessException(422, "来源历史条款缺少明确的共享范围");
        }
        var payload = draft(input).put("source", "历史 RFQ");
        payload.putObject("historySource").put("id", historyId).put("version", historyVersion);
        return storeDraft(user, buId, project, payload, "history:" + digest(clean(project) + "\n" + payload), false);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Imported importExcel(CurrentUser user, String buId, String projectId, MultipartFile file) {
        access.requireCapabilityWriter(user, buId, false, false);
        String project = catalog.scopeProject(user, buId, projectId);
        var parsed = excel.parse(file);
        catalog.lockBu(buId);
        var items = new ArrayList<ObjectNode>();
        var skipped = new ArrayList<Integer>();
        var errors = new ArrayList<ImportError>();
        parsed.errors().forEach(error -> errors.add(new ImportError(error.rowNumber(), error.message())));
        for (var row : parsed.rows()) {
            var payload = draft(row.data()).put("source", "Excel");
            String fingerprint = "excel:" + digest(clean(project) + "\n" + parsed.filename() + "\n"
                    + parsed.sheet() + "\n" + row.number() + "\n" + payload);
            payload.putObject("importSource").put("filename", parsed.filename()).put("sha256", parsed.sha256())
                    .put("sheet", parsed.sheet()).put("row", row.number());
            try {
                var result = storeDraft(user, buId, project, payload, fingerprint, true);
                if (result.path("duplicate").asBoolean()) {
                    skipped.add(row.number());
                } else {
                    items.add(result);
                }
            } catch (BusinessException failure) {
                log.error("导入能力边界 Excel 行失败 errorType={}", failure.getClass().getSimpleName());
                if (failure.getCode() != 422) {
                    throw failure;
                }
                errors.add(new ImportError(row.number(), failure.getMessage()));
            }
        }
        errors.sort(Comparator.comparingInt(ImportError::rowNumber));
        return new Imported(List.copyOf(items), List.copyOf(skipped), List.copyOf(errors));
    }

    @Transactional(readOnly = true)
    public ObjectNode version(CurrentUser user, String buId, String id, int version) {
        catalog.scopeProject(user, buId, null);
        var row = catalog.required(Table.CAPABILITY, buId, id, version);
        catalog.requireReadable(user, buId, row);
        return view(buId, row);
    }

    @Transactional(readOnly = true)
    public List<ObjectNode> published(CurrentUser user, String buId, CapabilityLibraryRequest.Lookup input) {
        String project = catalog.scopeProject(user, buId, input.projectId());
        return matchingVersions(buId, project, input).stream().filter(row -> row.path("eligible").asBoolean()).toList();
    }

    List<ObjectNode> matchingVersions(String buId, String project, CapabilityLibraryRequest.Lookup input) {
        return catalog.rows(Table.CAPABILITY, """
                where bu_id=? and (project_id is null or project_id=?)
                  and json_unquote(json_extract(payload,'$.status'))='已发布'
                  and json_unquote(json_extract(payload,'$.modelId'))=?
                  and json_unquote(json_extract(payload,'$.metricCode'))=?
                order by id,version desc
                """, buId, project, input.modelId(), input.metricCode()).stream()
                .filter(row -> clean(row.project()).isBlank() || Objects.equals(project, row.project()))
                .filter(row -> matches(row.payload(), input) && active(row) && hasExplicitScope(row))
                .map(row -> view(buId, row)).toList();
    }

    boolean validMatchBaseline(String buId, String modelId, int modelVersion, String processId, int processVersion, String config) {
        return baselineValid(buId, json.createObjectNode().put("modelId", modelId).put("modelVersion", modelVersion)
                .put("processId", processId).put("processVersion", processVersion).put("config", config));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode update(CurrentUser user, String buId, String id, int version, CapabilityLibraryRequest.Draft input) {
        begin(user, buId, false);
        var row = checked(user, buId, id, version, input.revision());
        requireState(EDITABLE.contains(row.status()), "只有草稿或退回的能力版本可以修改");
        if (input.projectId() != null && !Objects.equals(row.projectId(), catalog.scopeProject(user, buId, input.projectId()))) {
            throw new BusinessException(422, "能力条款的共享范围不能修改");
        }
        var changed = draft(input);
        requireEvidenceScope(buId, row.projectId(), changed.path("evidenceRefs"));
        row.payload().setAll(changed);
        return catalog.update(user, buId, Table.CAPABILITY, row, "编辑能力草稿", "");
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode transition(CurrentUser user, String buId, String id, int version, String action, CapabilityLibraryRequest.Review input) {
        begin(user, buId, Set.of("publish", "return", "revoke").contains(action));
        var row = checked(user, buId, id, version, input.revision());
        String reason = clean(input.reason());
        return switch (action) {
            case "submit" -> submit(user, buId, row, reason);
            case "publish" -> publish(user, buId, row, reason);
            case "return" -> returnDraft(user, buId, row, reason);
            case "revise" -> revise(user, buId, row);
            case "revoke" -> revoke(user, buId, row, reason);
            default -> throw new BusinessException(404, "未知的能力操作");
        };
    }

    private ObjectNode submit(CurrentUser user, String buId, Row row, String reason) {
        requireState(EDITABLE.contains(row.status()), "只有草稿或退回的能力版本可以提交");
        requireState(hasExplicitScope(row), "请从新候选入口确认能力范围后再提交");
        requireComplete(buId, row.projectId(), row.payload());
        row.payload().put("status", "待审核").put("submitterId", user.id()).put("submittedAt", Instant.now().toString());
        return catalog.update(user, buId, Table.CAPABILITY, row, "提交能力审核", reason);
    }

    private ObjectNode publish(CurrentUser user, String buId, Row row, String reason) {
        requireIndependent(user, row);
        var chain = chain(buId, row.id());
        requireState(chain.get(0).version() == row.version(), "只能发布最新版本");
        requireState(hasExplicitScope(row), "能力版本缺少明确的共享范围");
        requireComplete(buId, row.projectId(), row.payload());
        for (var previous : chain) {
            if (!active(previous)) {
                continue;
            }
            catalog.requireReadable(user, buId, previous);
            requireReason(reason);
            requireState(Objects.equals(previous.projectId(), row.projectId())
                    && (!previous.payload().hasNonNull("modelVersion") || sameBaseline(previous.payload(), row.payload())),
                    "更改机型、工艺、配置或指标时，请新增独立条目");
            previous.payload().put("validity", "被替代").put("supersededByVersion", row.version());
            catalog.update(user, buId, Table.CAPABILITY, previous, "替代能力版本", reason);
        }
        row.payload().put("status", "已发布").put("validity", "有效").put("publishedById", user.id())
                .put("publishedAt", Instant.now().toString());
        index.enqueue(Library.CAPABILITY, buId, row.id(), row.version(), indexProjection(buId, row));
        return catalog.update(user, buId, Table.CAPABILITY, row, "批准发布能力", reason).put("eligible", true);
    }

    private ObjectNode indexProjection(String buId, Row row) {
        var payload = row.payload();
        String description = "指标编码：%s\n配置：%s\n能力值：%s（%s）\n适用条件：%s".formatted(
                payload.path("metricCode").asText(), payload.path("config").asText(), payload.path("value").asText(),
                payload.path("valueType").asText(), payload.path("conditions").asText());
        if (!payload.path("limits").asText().isBlank()) {
            description += "\n限制：" + payload.path("limits").asText();
        }
        return json.createObjectNode().put("title", payload.path("metric").asText()).put("requirement_text", description)
                .put("bu_id", buId).put("record_version", row.version());
    }

    private ObjectNode returnDraft(CurrentUser user, String buId, Row row, String reason) {
        requireIndependent(user, row);
        requireReason(reason);
        row.payload().put("status", "退回");
        return catalog.update(user, buId, Table.CAPABILITY, row, "退回能力草稿", reason);
    }

    private ObjectNode revoke(CurrentUser user, String buId, Row row, String reason) {
        requireState(active(row), "只有当前发布版本可以撤销");
        requireReason(reason);
        row.payload().put("status", "已撤销").put("validity", "已撤销");
        index.enqueue(Library.CAPABILITY, buId, row.id(), row.version(), null);
        return catalog.update(user, buId, Table.CAPABILITY, row, "撤销能力版本", reason).put("eligible", false);
    }

    private ObjectNode revise(CurrentUser user, String buId, Row row) {
        requireState(chain(buId, row.id()).get(0).version() == row.version(), "已有较新版本，请刷新");
        requireState(Set.of("已发布", "已撤销").contains(row.status()), "只有已发布或已撤销的版本可以修订");
        var next = row.payload().deepCopy();
        next.remove(List.of("submitterId", "submittedAt", "publishedById", "publishedAt", "supersededByVersion", "history"));
        resetDraft(next, user);
        next.put("revisionOfVersion", row.version());
        String project = catalog.scopeProject(user, buId, row.project());
        requireState(project != null || Set.of("", CapabilityCatalog.SHARED).contains(clean(row.scope())),
                "旧能力缺少可确认的共享范围");
        return catalog.insert(user, buId, Table.CAPABILITY, row.id(), Math.addExact(row.version(), 1), project, next,
                "修订能力版本");
    }

    private void begin(CurrentUser user, String buId, boolean review) {
        access.requireCapabilityWriter(user, buId, false, review);
        catalog.lockBu(buId);
    }

    private ObjectNode storeDraft(CurrentUser user, String buId, String project, ObjectNode payload, String fingerprint,
            boolean validate) {
        var existing = catalog.rows(Table.CAPABILITY, "where bu_id=? and source_fingerprint=?", buId, fingerprint);
        if (!existing.isEmpty()) {
            catalog.requireReadable(user, buId, existing.get(0));
            return existing.get(0).payload().put("duplicate", true);
        }
        if (validate) {
            requireComplete(buId, project, payload);
        } else {
            requireEvidenceScope(buId, project, payload.path("evidenceRefs"));
        }
        String id = Ids.next("CAP");
        resetDraft(payload, user);
        catalog.identity(payload, buId, id, 1, project);
        jdbc.update("""
                insert into capability_record(bu_id,id,version,project_id,scope,payload,source_fingerprint) values (?,?,1,?,?,?,?)
                """, buId, id, project, scope(project), payload.toString(), fingerprint);
        catalog.log(user, buId, Table.CAPABILITY, id, 1, "新增能力草稿", "");
        return payload.put("duplicate", false);
    }

    private void resetDraft(ObjectNode payload, CurrentUser user) {
        payload.put("status", "草稿").put("validity", "待核对").put("revision", 0)
                .put("authorId", user.id()).put("createdAt", Instant.now().toString());
    }

    private ObjectNode draft(CapabilityLibraryRequest.Draft input) {
        ObjectNode data = json.valueToTree(input);
        data.remove(List.of("projectId", "revision", "evidence"));
        if (input.lower() != null) {
            data.put("lower", input.lower().stripTrailingZeros().toPlainString());
        }
        if (input.upper() != null) {
            data.put("upper", input.upper().stripTrailingZeros().toPlainString());
        }
        for (String field : List.of("modelId", "processId", "config", "metricCode", "metric", "operator", "unit", "valueType", "conditions", "limits")) {
            data.put(field, clean(data.path(field).asText("")));
        }
        var refs = data.putArray("evidenceRefs");
        if (input.evidence() != null) {
            input.evidence().forEach(ref -> refs.addObject().put("id", clean(ref.id()))
                    .put("version", ref.version()).put("location", clean(ref.location())));
        }
        data.put("evidence", java.util.stream.StreamSupport.stream(refs.spliterator(), false)
                .map(ref -> ref.path("id").asText() + " V" + ref.path("version").asText()
                + " · " + ref.path("location").asText()).collect(java.util.stream.Collectors.joining("；")));
        data.put("value", formatValue(input));
        return data;
    }

    private String formatValue(CapabilityLibraryRequest.Draft input) {
        String prefix = switch (clean(input.operator())) {
            case "LT" -> "<";
            case "LE" -> "≤";
            case "GT" -> ">";
            case "GE" -> "≥";
            default -> "";
        };
        BigDecimal limit = Set.of("LT", "LE").contains(clean(input.operator())) ? input.upper() : input.lower();
        if (limit == null) {
            return "";
        }
        String value = limit.stripTrailingZeros().toPlainString();
        if ("RANGE".equals(clean(input.operator())) && input.upper() != null) {
            value = (Boolean.TRUE.equals(input.lowerInclusive()) ? "[" : "(") + value + ", "
                    + input.upper().stripTrailingZeros().toPlainString() + (Boolean.TRUE.equals(input.upperInclusive()) ? "]" : ")");
        }
        return prefix + value + " " + clean(input.unit());
    }

    private void requireComplete(String buId, String project, ObjectNode data) {
        if (!baselineValid(buId, data)) {
            throw new BusinessException(422, "请选择本 BU 有效的机型、配置和启用工艺版本");
        }
        if (data.path("metricCode").asText().isBlank() || data.path("metric").asText().isBlank()
                || data.path("unit").asText().isBlank() || data.path("conditions").asText().isBlank()
                || !VALUE_TYPES.contains(data.path("valueType").asText()) || !numericBound(data)) {
            throw new BusinessException(422, "请补齐结构化指标、数值或范围、单位、值类型和适用条件");
        }
        if (!validEvidence(buId, project, data.path("evidenceRefs"))) {
            throw new BusinessException(422, "请关联同范围内有效的证据版本和原文位置");
        }
    }

    private boolean baselineValid(String buId, ObjectNode data) {
        String modelId = data.path("modelId").asText();
        int modelVersion = data.path("modelVersion").asInt();
        var model = catalog.row(Table.MODEL, buId, modelId, modelVersion);
        if (!catalog.isSharedBaseline(model) || !data.path("config").asText().equals(model.payload().path("config").asText())) {
            return false;
        }
        var process = catalog.row(Table.PROCESS, buId, data.path("processId").asText(), data.path("processVersion").asInt());
        return process != null && clean(process.project()).isBlank() && !CapabilityCatalog.PROJECT.equals(process.scope())
                && process.payload().path("enabled").asBoolean()
                && modelId.equals(process.payload().path("modelId").asText())
                && modelVersion == process.payload().path("modelVersion").asInt(1);
    }

    private boolean numericBound(ObjectNode data) {
        var lower = data.path("lower");
        var upper = data.path("upper");
        var low = decimal(lower);
        var high = decimal(upper);
        return switch (data.path("operator").asText()) {
            case "LT", "LE" -> high != null && (lower.isNull() || lower.isMissingNode());
            case "GT", "GE", "EQ" -> low != null && (upper.isNull() || upper.isMissingNode());
            case "RANGE" -> low != null && high != null && low.compareTo(high) < 0
                    && data.path("lowerInclusive").isBoolean() && data.path("upperInclusive").isBoolean();
            default -> false;
        };
    }

    private BigDecimal decimal(JsonNode node) {
        String value = node.asText();
        if (!value.matches("-?[0-9]{1,18}(\\.[0-9]{1,12})?")) {
            return null;
        }
        return new BigDecimal(value);
    }

    private boolean validEvidence(String buId, String project, JsonNode refs) {
        if (!refs.isArray() || refs.isEmpty() || refs.size() > 20) {
            return false;
        }
        var seen = new HashSet<List<String>>();
        for (var ref : refs) {
            String id = ref.path("id").asText();
            String location = ref.path("location").asText();
            int version = ref.path("version").asInt();
            if (id.isBlank() || location.isBlank() || version < 1 || !seen.add(List.of(id, String.valueOf(version), location))) {
                return false;
            }
            var evidence = evidenceInScope(buId, project, ref);
            if (evidence == null || !"有效".equals(evidence.status()) || !CapabilityCatalog.unexpired(evidence.payload())) {
                return false;
            }
        }
        return true;
    }

    private void requireEvidenceScope(String buId, String project, JsonNode refs) {
        for (var ref : refs) {
            if (evidenceInScope(buId, project, ref) == null) {
                throw new BusinessException(422, "证据版本不存在或不在能力条款的共享范围内");
            }
        }
    }

    private Row evidenceInScope(String buId, String project, JsonNode reference) {
        var evidence = catalog.row(Table.EVIDENCE, buId, reference.path("id").asText(), reference.path("version").asInt());
        if (evidence == null) {
            return null;
        }
        String evidenceProject = clean(evidence.project());
        boolean allowed = evidenceProject.isEmpty() ? CapabilityCatalog.SHARED.equals(evidence.scope())
                : evidenceProject.equals(project);
        return allowed ? evidence : null;
    }

    private boolean eligible(String buId, Row row) {
        return active(row) && "有效".equals(row.payload().path("validity").asText()) && numericBound(row.payload())
                && hasExplicitScope(row)
                && baselineValid(buId, row.payload()) && validEvidence(buId, row.projectId(), row.payload().path("evidenceRefs"));
    }

    private boolean hasExplicitScope(Row row) {
        return CapabilityCatalog.SHARED.equals(row.scope()) && clean(row.project()).isBlank()
                || CapabilityCatalog.PROJECT.equals(row.scope()) && !clean(row.projectId()).isBlank();
    }

    private ObjectNode view(String buId, Row row) {
        return row.payload().deepCopy().put("id", row.id()).put("version", row.version())
                .put("revision", row.revision()).put("eligible", eligible(buId, row));
    }

    private static boolean active(Row row) {
        return "已发布".equals(row.status()) && !Set.of("被替代", "已撤销", "已过期").contains(row.payload().path("validity").asText());
    }

    private boolean matches(ObjectNode data, CapabilityLibraryRequest.Lookup input) {
        return input.modelId().equals(data.path("modelId").asText()) && input.modelVersion() == data.path("modelVersion").asInt()
                && input.processId().equals(data.path("processId").asText()) && input.processVersion() == data.path("processVersion").asInt()
                && input.config().equals(data.path("config").asText()) && input.metricCode().equals(data.path("metricCode").asText());
    }

    private boolean sameBaseline(ObjectNode first, ObjectNode second) {
        return BASELINE_FIELDS.stream().allMatch(field -> first.path(field).equals(second.path(field)));
    }

    private List<Row> chain(String buId, String id) {
        return catalog.rows(Table.CAPABILITY, "where bu_id=? and id=? order by version desc", buId, id);
    }

    private Row checked(CurrentUser user, String buId, String id, int version, Long revision) {
        var row = catalog.required(Table.CAPABILITY, buId, id, version);
        catalog.requireReadable(user, buId, row);
        if (revision == null) {
            throw new BusinessException(400, "请提供草稿修改序号");
        }
        requireState(revision == row.revision(), "能力版本已变更，请刷新");
        return row;
    }

    private void requireIndependent(CurrentUser user, Row row) {
        requireState("待审核".equals(row.status()), "只有待审核的能力版本可以审核");
        String submitter = row.payload().path("submitterId").asText();
        if (submitter.isBlank()) {
            throw new BusinessException(409, "该版本缺少有效提交记录");
        }
        if (submitter.equals(user.id())) {
            throw new BusinessException(403, "同一能力版本不得自审");
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

    private static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException failure) {
            log.error("计算能力记录的 SHA-256 摘要失败", failure);
            throw new IllegalStateException(failure);
        }
    }
}
