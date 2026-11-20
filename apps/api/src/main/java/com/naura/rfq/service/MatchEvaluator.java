package com.naura.rfq.service;

import com.naura.rfq.mapper.KnowledgeRecordMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.integration.standardreply.StandardReplyIndexClient;
import com.naura.rfq.integration.standardreply.StandardReplyIndexClient.SearchFailure;
import com.naura.rfq.common.log.StageLog;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
@Slf4j
class MatchEvaluator {
    static final String STANDARD = "standard_reply";
    static final String HISTORY = "history_rfq";
    static final String CAPABILITY = "capability";
    static final List<String> DEFAULT_ORDER = List.of(STANDARD, HISTORY, CAPABILITY);
    static final Map<String, Double> DEFAULT_THRESHOLDS = Map.of(STANDARD, 0.80, HISTORY, 0.74);
    private static final int MAX_SEARCH_IDS = 100;
    // Leave time to save the result inside the 90-second worker lease (8 seconds per search).
    private static final int MAX_SCOPED_SEARCH_IDS = 8 * MAX_SEARCH_IDS;
    private static final List<String> CAPABILITY_DIAGNOSTIC_FIELDS = List.of("recalledCandidates", "eligibleCandidates",
            "ineligibleCandidates", "supportCandidates", "refuteCandidates", "reviewCandidates", "noCandidateCount");
    @Autowired
    private KnowledgeRecordMapper knowledgeRecords;
    @Autowired
    private ObjectMapper json;
    @Autowired
    private StandardReplyIndexClient search;
    @Autowired
    private CapabilityMatch capability;
    @Autowired
    private KnowledgeGroupService groups;
    @Autowired
    private HistoryRecallScope historyRecall;
    private final MatchTextScorer scorer = new MatchTextScorer();

    record Input(String bu, String project, String groupId, JsonNode snapshot, List<String> order,
            Map<String, Double> thresholds, String runId, String requirementId) {
        Input {
            thresholds = thresholds == null ? Map.of() : Map.copyOf(thresholds);
            runId = runId == null ? "" : runId;
            requirementId = requirementId == null ? "" : requirementId;
        }

        Input(String bu, String project, String groupId, JsonNode snapshot, List<String> order,
                Map<String, Double> thresholds) {
            this(bu, project, groupId, snapshot, order, thresholds, "", "");
        }

        /** 每轮比对沿用创建时的阈值，策略调整不会改写已完成轮次的判定口径。 */
        double threshold(String library) {
            Double value = thresholds.get(library);
            if (value == null || value.isNaN() || value <= 0 || value >= 1) {
                return DEFAULT_THRESHOLDS.getOrDefault(library, 0.80);
            }
            return value;
        }

        String historyGroupId() { return snapshot.path("historyGroupId").asText(); }

        List<String> historyDocumentIds() {
            var ids = new ArrayList<String>();
            snapshot.path("historyDocumentIds").forEach(item -> ids.add(item.asText()));
            return ids;
        }
    }
    record Evaluation(String state, ObjectNode result, ObjectNode stamp, int retrySeconds) {}
    private record Source(String id, int version, long revision, boolean shared, boolean synced, String syncStamp, JsonNode payload) {}
    private record Scope(Map<String, Source> sources, boolean unknown) {}
    private record Candidate(Source source, double similarity) {}
    private record SourceRow(String id, int version, long revision, String project, String scope, boolean synced,
            String syncStamp, JsonNode payload) {}
    private record Scored(String id, int version, double similarity, String reason) {}
    /** 单库诊断数据：只保留 id、分数和过滤原因，不记录客户原文。 */
    private static final class Diagnostics {
        private static final int MAX_SAMPLES = 10;
        final String runId;
        final String requirementId;
        final String library;
        final Map<String, Integer> rejected = new LinkedHashMap<>();
        final List<String> rejectSamples = new ArrayList<>();
        final List<Scored> scoredRows = new ArrayList<>();
        final List<String> selectedRows = new ArrayList<>();
        int scopeSources;
        int platformRecall;
        int localRecall;
        int recalled;
        int scored;
        int passed;
        int selected;

        Diagnostics(String runId, String requirementId, String library) {
            this.runId = runId;
            this.requirementId = requirementId;
            this.library = library;
        }

        void scopeSize(int size) { scopeSources = size; }

        void platform(int hits) { platformRecall += hits; }

        void local(int count) { localRecall = count; }

        void recalled(int count) { recalled = count; }

        void reject(String id, String reason) {
            count(reason);
            sample(rejectSamples, id + ":" + reason);
        }

        void score(String id, int version, double similarity, String reason) {
            scored++;
            scoredRows.add(new Scored(id, version, similarity, reason));
            if (reason.isBlank()) {
                passed++;
            } else {
                count(reason);
                sample(rejectSamples, label(id, version, similarity) + ":" + reason);
            }
            log.debug("requirement.match.recall.candidate runId={} requirementId={} library={} id={} version={}"
                            + " similarity={} decision={} reason={}",
                    runId, requirementId, library, id, version, format(similarity),
                    reason.isBlank() ? "pass" : "filter", reason.isBlank() ? "-" : reason);
        }

        void selected(int limit, List<Candidate> candidates) {
            selected = Math.min(limit, candidates.size());
            candidates.stream().limit(limit).forEach(candidate -> sample(selectedRows,
                    label(candidate.source().id(), candidate.source().version(), candidate.similarity())));
        }

        String topScores() {
            return scoredRows.stream()
                    .sorted(Comparator.comparingDouble(Scored::similarity).reversed())
                    .limit(MAX_SAMPLES)
                    .map(row -> label(row.id(), row.version(), row.similarity())
                            + (row.reason().isBlank() ? "" : "[" + row.reason() + "]"))
                    .collect(Collectors.joining(","));
        }

        private void count(String reason) { rejected.merge(reason, 1, Integer::sum); }

        private static void sample(List<String> target, String value) {
            if (target.size() < MAX_SAMPLES) {
                target.add(value);
            }
        }

        private static String label(String id, int version, double similarity) {
            return id + "v" + version + "=" + format(similarity);
        }

        private static String format(double similarity) { return String.format(Locale.ROOT, "%.4f", similarity); }
    }

    Evaluation evaluate(Input input) {
        var result = json.createObjectNode().put("conclusion", "待确认").put("knowledgeGap", false);
        var stages = result.putObject("stages");
        var stamp = json.createObjectNode();
        input.order().forEach(stage -> stages.putObject(stage).put("status", "not_run"));
        log.info("requirement.match.evaluate.start runId={} requirementId={} projectId={} order={} thresholds={}",
                input.runId(), input.requirementId(), input.project(), input.order(), input.thresholds());
        StageLog.begin(log, "条款比对 runId=" + input.runId() + " requirementId=" + input.requirementId()
                + " order=" + input.order());
        if (input.order().isEmpty()) {
            // 三个知识库全部关闭时不做任何比对，结论直接标记为无需比对。
            return new Evaluation("completed", result.put("skipped", true).put("conclusion", "无需比对"), stamp, 0);
        }
        boolean missingCapability = false;
        for (String library : input.order()) {
            long started = System.nanoTime();
            ObjectNode stage;
            if (CAPABILITY.equals(library)) {
                stage = capability.evaluate(input.bu(), input.project(), input.groupId(), input.snapshot().path("context"), true);
                stamp.put(library, capabilityStamp(stage));
                logCapability(input, stage, started);
            } else {
                Diagnostics diag = new Diagnostics(input.runId(), input.requirementId(), library);
                Scope scope = scope(input, library, diag);
                diag.scopeSize(scope.sources().size());
                stamp.put(library, scopeStamp(scope));
                try {
                    stage = textStage(input, library, scope, diag);
                } catch (SearchFailure failure) {
                    log.error("查询比对资料失败", failure);
                    stage = json.createObjectNode().put("status", "failed").put("reason", failure.getMessage());
                    stages.set(library, stage);
                    logStage(input, library, stage, diag, started);
                    StageLog.failed(log, "条款比对 runId=" + input.runId() + " requirementId=" + input.requirementId()
                            + " library=" + library + " errorType=" + failure.getClass().getSimpleName());
                    return new Evaluation(failure.retryable() ? "retry_wait" : "failed", result, stamp, failure.retryable() ? 5 : 0);
                }
                logStage(input, library, stage, diag, started);
            }
            stages.set(library, stage);
            switch (stage.path("status").asText()) {
                case "hit" -> {
                    result.put("matchedLibrary", library);
                    if (stage.has("conclusion")) {
                        result.set("conclusion", stage.get("conclusion"));
                    }
                    if (stage.has("draft")) {
                        result.set("draft", stage.get("draft"));
                    }
                    log.info("requirement.match.match_decision runId={} requirementId={} library={} decision=short_circuit",
                            input.runId(), input.requirementId(), library);
                    StageLog.end(log, "条款比对·命中短路 runId=" + input.runId() + " requirementId="
                            + input.requirementId() + " library=" + library + " 结论="
                            + result.path("conclusion").asText("待确认"));
                    return new Evaluation("completed", result, stamp, 0);
                }
                case "blocked" -> {
                    String reason = stage.path("reason").asText();
                    if (CAPABILITY.equals(library) && "MISSING_CAPABILITY_INPUT".equals(reason)) {
                        missingCapability = true;
                    } else {
                        return new Evaluation("blocked", result, stamp, "INDEX_NOT_READY".equals(reason) ? 15 : 0);
                    }
                }
                default -> { }
            }
        }
        // 未命中口径只看本轮实际启用的库，关闭的库不参与「知识缺口」判定。
        result.put("knowledgeGap", !missingCapability && input.order().stream()
                .allMatch(library -> "miss".equals(stages.path(library).path("status").asText())));
        log.info("requirement.match.match_decision runId={} requirementId={} decision=no_hit knowledgeGap={}",
                input.runId(), input.requirementId(), result.path("knowledgeGap").asBoolean());
        StageLog.end(log, "条款比对 runId=" + input.runId() + " requirementId=" + input.requirementId()
                + " 结论=" + result.path("conclusion").asText("待确认") + " knowledgeGap="
                + result.path("knowledgeGap").asBoolean());
        return new Evaluation(missingCapability ? "blocked" : "completed", result, stamp, 0);
    }

    boolean stillCurrent(Input input, JsonNode stamp) {
        var fields = stamp.fields();
        while (fields.hasNext()) {
            var entry = fields.next();
            String actual = CAPABILITY.equals(entry.getKey())
                    ? capabilityStamp(capability.evaluate(input.bu(), input.project(), input.groupId(), input.snapshot().path("context")))
                    : scopeStamp(scope(input, entry.getKey()));
            if (!entry.getValue().asText().equals(actual)) {
                return false;
            }
        }
        return true;
    }

    boolean referenceAvailable(Input input, JsonNode reference) {
        String library = reference.path("library").asText();
        if (CAPABILITY.equals(library)) {
            var current = capability.evaluate(input.bu(), input.project(), input.groupId(), input.snapshot().path("context"));
            return reference.path("capabilityFingerprint").asText().equals(capabilityStamp(current));
        }
        if (!STANDARD.equals(library) && !HISTORY.equals(library)) {
            return false;
        }
        var sources = scope(input, library);
        var source = sources.sources().get(reference.path("candidateId").asText());
        return !sources.unknown() && source != null && source.version() == reference.path("version").asInt();
    }

    private ObjectNode textStage(Input input, String library, Scope scope, Diagnostics diag) {
        var stage = json.createObjectNode();
        if (scope.unknown()) {
            String reason = input.historyDocumentIds().isEmpty() ? "SOURCE_SCOPE_UNVERIFIED" : "HISTORY_FILE_UNAVAILABLE";
            diag.reject("-", reason);
            return stage.put("status", "blocked").put("reason", reason);
        }
        var shared = scope.sources().values().stream().filter(Source::shared).toList();
        if (shared.stream().anyMatch(source -> !source.synced())) {
            diag.reject("-", "INDEX_NOT_READY");
            return stage.put("status", "blocked").put("reason", "INDEX_NOT_READY");
        }
        int limit = input.historyDocumentIds().isEmpty() && input.historyGroupId().isEmpty()
                ? MAX_SEARCH_IDS : MAX_SCOPED_SEARCH_IDS;
        if (scope.sources().size() > limit) {
            diag.reject("-", "SEARCH_SCOPE_TOO_LARGE");
            return stage.put("status", "blocked").put("reason", "SEARCH_SCOPE_TOO_LARGE");
        }
        var ids = new ArrayList<String>();
        if (!shared.isEmpty()) {
            String query = query(input.snapshot());
            if (query.length() > 6000) {
                diag.reject("-", "QUERY_TOO_LONG");
                return stage.put("status", "blocked").put("reason", "QUERY_TOO_LONG");
            }
            var sharedIds = shared.stream().map(Source::id).toList();
            for (int from = 0; from < sharedIds.size(); from += MAX_SEARCH_IDS) {
                var batch = sharedIds.subList(from, Math.min(from + MAX_SEARCH_IDS, sharedIds.size()));
                var response = search.search(input.bu(), HISTORY.equals(library), query, batch);
                stage.put("platformRequestId", response.requestId()).put("indexVersion", response.indexVersion());
                diag.platform(response.hits().size());
                for (var hit : response.hits()) {
                    var source = scope.sources().get(hit.id());
                    if (!batch.contains(hit.id()) || source == null || hit.version() != source.version()) {
                        diag.reject(hit.id(), "INDEX_VERSION_MISMATCH");
                        return stage.put("status", "blocked").put("reason", "INDEX_NOT_READY");
                    }
                    ids.add(hit.id());
                }
            }
        }
        // A published project-only history clause stays in this service and uses the same local rule.
        var localIds = scope.sources().values().stream().filter(source -> !source.shared()).map(Source::id).toList();
        diag.local(localIds.size());
        ids.addAll(localIds);
        diag.recalled(ids.size());
        var candidates = scoreCandidates(input, library, scope, ids, diag);
        stage.put("scoreVersion", MatchTextScorer.VERSION);
        if (candidates.isEmpty()) {
            return stage.put("status", "miss");
        }
        String verified = text(input.snapshot().path("context"), "verifiedConditions");
        // Standard replies are eligible only when the highest scoring candidate is reusable.
        if (STANDARD.equals(library) && incompatible(verified, text(candidates.get(0).source().payload(), "conditions"))) {
            diag.reject(candidates.get(0).source().id(), "CONDITIONS_DIFFER");
            return stage.put("status", "miss").put("reason", "CONDITIONS_DIFFER");
        }
        stage.put("status", "hit");
        writeCandidates(stage, candidates, verified, library, diag);
        if (STANDARD.equals(library)) {
            stage.put("draft", text(candidates.get(0).source().payload(), "answer"));
        }
        return stage;
    }

    private List<Candidate> scoreCandidates(Input input, String library, Scope scope, List<String> ids, Diagnostics diag) {
        String requirement = text(input.snapshot(), "text");
        String customer = text(input.snapshot(), "customer");
        var models = models(input.snapshot());
        double threshold = input.threshold(library);
        var candidates = new ArrayList<Candidate>();
        for (String id : ids) {
            Source source = scope.sources().get(id);
            double similarity = scorer.score(requirement, text(source.payload(), "requirement"));
            String reason = contextReason(customer, models, source.payload());
            if (reason.isEmpty()) {
                reason = similarity == 0 ? "ZERO_SIMILARITY"
                        : similarity <= threshold ? "BELOW_THRESHOLD"
                        : text(source.payload(), "answer").isBlank() ? "BLANK_ANSWER" : "";
            }
            diag.score(id, source.version(), similarity, reason);
            if (reason.isEmpty()) {
                candidates.add(new Candidate(source, similarity));
            }
        }
        candidates.sort(Comparator.comparingDouble(Candidate::similarity).reversed()
                .thenComparing(candidate -> candidate.source().id()));
        return candidates;
    }

    /**
     * 按客户/机型宽松裁剪召回：资料未维护客户或机型时不过滤（兼容存量数据），
     * 两侧都有值且明确不符才排除；机型按互含判定以兼容简称与全称。
     */
    private String contextReason(String customer, List<String> models, JsonNode payload) {
        String sourceCustomer = text(payload, "customer");
        if (!customer.isBlank() && !sourceCustomer.isBlank() && !sameText(customer, sourceCustomer)) {
            return "CUSTOMER_MISMATCH";
        }
        String sourceModel = text(payload, "model");
        if (!models.isEmpty() && !sourceModel.isBlank()
                && models.stream().noneMatch(model -> related(model, sourceModel))) {
            return "MODEL_MISMATCH";
        }
        return "";
    }

    private static boolean sameText(String left, String right) {
        return left.strip().equalsIgnoreCase(right.strip());
    }

    private static boolean related(String model, String sourceModel) {
        String left = model.strip().toLowerCase(Locale.ROOT), right = sourceModel.strip().toLowerCase(Locale.ROOT);
        return left.contains(right) || right.contains(left);
    }

    private List<String> models(JsonNode snapshot) {
        var models = new ArrayList<String>();
        snapshot.path("models").forEach(item -> {
            String value = item.asText("").strip();
            if (!value.isBlank()) {
                models.add(value);
            }
        });
        return models;
    }

    private void writeCandidates(ObjectNode stage, List<Candidate> candidates, String verified, String library, Diagnostics diag) {
        int limit = STANDARD.equals(library) ? 1 : 20;
        diag.selected(limit, candidates);
        var rows = stage.putArray("candidates");
        for (int i = 0; i < candidates.size(); i++) {
            Candidate candidate = candidates.get(i);
            if (i >= limit) {
                diag.reject(candidate.source().id(), "TOPN_TRIMMED");
                continue;
            }
            var source = candidate.source();
            var row = rows.addObject().put("id", source.id()).put("version", source.version())
                    .put("businessSimilarity", candidate.similarity());
            for (String field : List.of("title", "requirement", "answer", "conditions", "source", "documentId",
                    "requirementAnchor", "answerAnchor", "clauseNo", "customer", "model")) {
                if (source.payload().hasNonNull(field)) {
                    row.put(field, text(source.payload(), field));
                }
            }
            String conditions = text(source.payload(), "conditions");
            row.put("conditionStatus", conditions.isBlank() ? "not_specified" : verified.isBlank() ? "unverified"
                    : incompatible(verified, conditions) ? "different" : "same");
            if (HISTORY.equals(library)) {
                row.put("feedback", source.payload().path("feedback").asText("未记录"));
                row.put("acceptance", source.payload().path("acceptance").asText("未记录"));
            }
        }
    }

    private Scope scope(Input input, String library) { return scope(input, library, null); }

    private Scope scope(Input input, String library, Diagnostics diag) {
        boolean history = HISTORY.equals(library);
        var selected = history ? input.historyDocumentIds() : List.<String>of();
        if (!selected.isEmpty() && !historyRecall.allowed(input.bu(), input.project(), selected)) {
            reject(diag, String.join(",", selected), "HISTORY_FILE_UNAVAILABLE");
            return new Scope(Map.of(), true);
        }
        if (history && selected.isEmpty() && !input.historyGroupId().isEmpty()) {
            selected = historyRecall.groupDocuments(input.bu(), input.project(), input.historyGroupId());
            if (selected.isEmpty()) {
                reject(diag, "-", "HISTORY_GROUP_EMPTY");
                return new Scope(Map.of(), false);
            }
        }
        String fileFilter = String.join(",", selected);
        // 项目绑定的分组决定可比对范围：自身与全部上级（含根分组）挂载的资料参与比对，未分组资料视同根分组。
        // 显式指定历史文件时以用户选择为准，不再按分组裁剪。
        List<String> scopeIds = selected.isEmpty() ? groups.scopeIds(input.bu(), input.groupId()) : List.of();
        var sources = new LinkedHashMap<String, Source>();
        boolean unknown = false;
        for (var source : knowledgeRecords.listPublishedSources(history, input.bu(), input.project(), fileFilter)) {
            var row = new SourceRow(source.id(), source.version(), source.revision(), source.projectId(),
                    source.scope(), source.synced(), source.syncStamp(), parse(source.payload()));
            String validity = text(row.payload(), "validity");
            if (List.of("已撤销", "被替代", "已过期", "已失效").contains(validity)) {
                reject(diag, row.id(), "INVALID_VALIDITY");
                continue;
            }
            String sourceProject = KnowledgePublicationAccess.recordProjectId(row.payload());
            if (!sourceProject.isBlank() && !input.project().equals(sourceProject)) {
                reject(diag, row.id(), "OTHER_PROJECT_SOURCE");
                continue;
            }
            boolean shared = row.project() == null && sourceProject.isBlank() && "BU共享".equals(row.scope());
            boolean project = history && input.project().equals(row.project()) && "仅当前项目".equals(row.scope());
            if (shared && !KnowledgeGroupService.withinScope(row.payload(), scopeIds)) {
                reject(diag, row.id(), "GROUP_OUT_OF_SCOPE");
                continue;
            }
            boolean duplicate = sources.putIfAbsent(row.id(), new Source(row.id(), row.version(), row.revision(), shared,
                    row.synced(), row.syncStamp(), row.payload())) != null;
            if (!"有效".equals(validity) || !shared && !project || duplicate) {
                reject(diag, row.id(), !"有效".equals(validity) ? "INVALID_VALIDITY"
                        : shared || project ? "DUPLICATE_ID" : "INVALID_SCOPE_OR_PROJECT");
                unknown = true;
            }
        }
        return new Scope(sources, unknown);
    }

    private static void reject(Diagnostics diag, String id, String reason) {
        if (diag != null) {
            diag.reject(id, reason);
        }
    }

    /** 诊断计数字段不参与快照，避免部署前后同一能力结论被误判为范围变化。 */
    private String capabilityStamp(ObjectNode stage) {
        var copy = stage.deepCopy();
        CAPABILITY_DIAGNOSTIC_FIELDS.forEach(copy::remove);
        return digest(copy.toString());
    }

    private String scopeStamp(Scope scope) {
        var items = json.createArrayNode();
        scope.sources().values().forEach(source -> items.addObject().put("id", source.id()).put("version", source.version())
                .put("revision", source.revision()).put("synced", source.synced()).put("sync", source.syncStamp()));
        return digest(scope.unknown() + ":" + items);
    }

    private void logStage(Input input, String library, ObjectNode stage, Diagnostics diag, long started) {
        log.info("requirement.match.recall runId={} requirementId={} projectId={} library={} status={} reason={}"
                        + " scopeSources={} platformRecall={} localRecall={} recalled={} scored={} passed={} selected={}"
                        + " threshold={} scoreVersion={} rejected={} filteredSamples={} topScores={} selectedSamples={}"
                        + " durationMs={} platformRequestId={} indexVersion={}",
                diag.runId, diag.requirementId, input.project(), library, stage.path("status").asText("-"),
                stage.path("reason").asText("-"), diag.scopeSources, diag.platformRecall, diag.localRecall,
                diag.recalled, diag.scored, diag.passed, diag.selected,
                String.format(Locale.ROOT, "%.2f", input.threshold(library)),
                stage.path("scoreVersion").asText("-"), diag.rejected, diag.rejectSamples,
                diag.topScores(), diag.selectedRows, (System.nanoTime() - started) / 1_000_000L,
                stage.path("platformRequestId").asText("-"), stage.path("indexVersion").asText("-"));
    }

    private void logCapability(Input input, ObjectNode stage, long started) {
        log.info("requirement.match.recall runId={} requirementId={} projectId={} library=capability status={} reason={}"
                        + " checks={} recalled={} eligible={} ineligible={} supports={} refutes={} review={} durationMs={}",
                input.runId(), input.requirementId(), input.project(), stage.path("status").asText("-"),
                stage.path("reason").asText("-"), stage.path("checks").size(),
                stage.path("recalledCandidates").asInt(0), stage.path("eligibleCandidates").asInt(0),
                stage.path("ineligibleCandidates").asInt(0), stage.path("supportCandidates").asInt(0),
                stage.path("refuteCandidates").asInt(0), stage.path("reviewCandidates").asInt(0),
                (System.nanoTime() - started) / 1_000_000L);
    }

    /** 查询文本附带客户/机型上下文，与索引侧投影的前缀对称，使语义排序偏向同客户、同机型的资料。 */
    private String query(JsonNode snapshot) {
        var lines = new ArrayList<String>();
        for (String value : List.of(text(snapshot, "title"), text(snapshot, "text"))) {
            if (!value.isBlank() && !lines.contains(value)) {
                lines.add(value);
            }
        }
        String customer = text(snapshot, "customer");
        if (!customer.isBlank()) {
            lines.add("客户：" + customer);
        }
        var models = models(snapshot);
        if (!models.isEmpty()) {
            lines.add("机型：" + String.join("、", models));
        }
        return String.join("\n", lines);
    }

    private boolean incompatible(String known, String candidate) {
        return !known.isBlank() && !candidate.isBlank() && !known.strip().equals(candidate.strip());
    }

    private JsonNode parse(String value) {
        try { return json.readTree(value); }
        catch (JsonProcessingException failure) {
            log.error("解析比对资料失败 errorType={}", failure.getClass().getSimpleName());
            throw new IllegalStateException("比对资料格式异常", failure);
        }
    }

    static String text(JsonNode node, String field) { return node.path(field).asText(""); }

    static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException failure) {
            log.error("计算比对资料的 SHA-256 摘要失败", failure);
            throw new IllegalStateException(failure);
        }
    }
}
