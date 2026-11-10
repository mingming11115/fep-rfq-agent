package com.naura.rfq.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.integration.standardreply.StandardReplyIndexClient;
import com.naura.rfq.integration.standardreply.StandardReplyIndexClient.SearchFailure;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
class MatchEvaluator {
    static final String STANDARD = "standard_reply";
    static final String HISTORY = "history_rfq";
    static final String CAPABILITY = "capability";
    static final List<String> DEFAULT_ORDER = List.of(STANDARD, HISTORY, CAPABILITY);
    private static final int MAX_SEARCH_IDS = 100;
    // Leave time to save the result inside the 90-second worker lease (8 seconds per search).
    private static final int MAX_SCOPED_SEARCH_IDS = 8 * MAX_SEARCH_IDS;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final StandardReplyIndexClient search;
    private final CapabilityMatch capability;
    private final HistoryRecallScope historyRecall;
    private final MatchTextScorer scorer = new MatchTextScorer();

    record Input(String bu, String project, JsonNode snapshot, List<String> order) {
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

    Evaluation evaluate(Input input) {
        var result = json.createObjectNode().put("conclusion", "待确认").put("knowledgeGap", false);
        var stages = result.putObject("stages");
        var stamp = json.createObjectNode();
        input.order().forEach(stage -> stages.putObject(stage).put("status", "not_run"));
        boolean missingCapability = false;
        for (String library : input.order()) {
            ObjectNode stage;
            if (CAPABILITY.equals(library)) {
                stage = capability.evaluate(input.bu(), input.project(), input.snapshot().path("context"));
                stamp.put(library, digest(stage.toString()));
            } else {
                Scope scope = scope(input, library);
                stamp.put(library, scopeStamp(scope));
                try {
                    stage = textStage(input, library, scope);
                } catch (SearchFailure failure) {
                    log.error("查询比对资料失败", failure);
                    stages.putObject(library).put("status", "failed").put("reason", failure.getMessage());
                    return new Evaluation(failure.retryable() ? "retry_wait" : "failed", result, stamp, failure.retryable() ? 5 : 0);
                }
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
        result.put("knowledgeGap", !missingCapability && DEFAULT_ORDER.stream()
                .allMatch(library -> "miss".equals(stages.path(library).path("status").asText())));
        return new Evaluation(missingCapability ? "blocked" : "completed", result, stamp, 0);
    }

    boolean stillCurrent(Input input, JsonNode stamp) {
        var fields = stamp.fields();
        while (fields.hasNext()) {
            var entry = fields.next();
            String actual = CAPABILITY.equals(entry.getKey())
                    ? digest(capability.evaluate(input.bu(), input.project(), input.snapshot().path("context")).toString())
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
            var current = capability.evaluate(input.bu(), input.project(), input.snapshot().path("context"));
            return reference.path("capabilityFingerprint").asText().equals(digest(current.toString()));
        }
        if (!STANDARD.equals(library) && !HISTORY.equals(library)) {
            return false;
        }
        var sources = scope(input, library);
        var source = sources.sources().get(reference.path("candidateId").asText());
        return !sources.unknown() && source != null && source.version() == reference.path("version").asInt();
    }

    private ObjectNode textStage(Input input, String library, Scope scope) {
        var stage = json.createObjectNode();
        if (scope.unknown()) {
            return stage.put("status", "blocked").put("reason", input.historyDocumentIds().isEmpty()
                    ? "SOURCE_SCOPE_UNVERIFIED" : "HISTORY_FILE_UNAVAILABLE");
        }
        var shared = scope.sources().values().stream().filter(Source::shared).toList();
        if (shared.stream().anyMatch(source -> !source.synced())) {
            return stage.put("status", "blocked").put("reason", "INDEX_NOT_READY");
        }
        int limit = input.historyDocumentIds().isEmpty() ? MAX_SEARCH_IDS : MAX_SCOPED_SEARCH_IDS;
        if (scope.sources().size() > limit) {
            return stage.put("status", "blocked").put("reason", "SEARCH_SCOPE_TOO_LARGE");
        }
        var ids = new ArrayList<String>();
        if (!shared.isEmpty()) {
            String query = query(input.snapshot());
            if (query.length() > 6000) {
                return stage.put("status", "blocked").put("reason", "QUERY_TOO_LONG");
            }
            var sharedIds = shared.stream().map(Source::id).toList();
            for (int from = 0; from < sharedIds.size(); from += MAX_SEARCH_IDS) {
                var batch = sharedIds.subList(from, Math.min(from + MAX_SEARCH_IDS, sharedIds.size()));
                var response = search.search(input.bu(), HISTORY.equals(library), query, batch);
                stage.put("platformRequestId", response.requestId()).put("indexVersion", response.indexVersion());
                for (var hit : response.hits()) {
                    var source = scope.sources().get(hit.id());
                    if (!batch.contains(hit.id()) || source == null || hit.version() != source.version()) {
                        return stage.put("status", "blocked").put("reason", "INDEX_NOT_READY");
                    }
                    ids.add(hit.id());
                }
            }
        }
        // A published project-only history clause stays in this service and uses the same local rule.
        scope.sources().values().stream().filter(source -> !source.shared()).map(Source::id).forEach(ids::add);
        String verified = text(input.snapshot().path("context"), "verifiedConditions");
        String requirement = text(input.snapshot(), "text");
        double threshold = STANDARD.equals(library) ? 0.80 : 0.74;
        var candidates = ids.stream().map(scope.sources()::get)
                .map(source -> new Candidate(source, scorer.score(requirement, text(source.payload(), "requirement"))))
                .filter(candidate -> candidate.similarity() > threshold)
                .sorted(Comparator.comparingDouble(Candidate::similarity).reversed().thenComparing(candidate -> candidate.source().id()))
                .filter(candidate -> !text(candidate.source().payload(), "answer").isBlank())
                .toList();
        stage.put("scoreVersion", MatchTextScorer.VERSION);
        if (candidates.isEmpty()) {
            return stage.put("status", "miss");
        }
        // Standard replies are eligible only when the highest scoring candidate is reusable.
        if (STANDARD.equals(library) && incompatible(verified, text(candidates.get(0).source().payload(), "conditions"))) {
            return stage.put("status", "miss").put("reason", "CONDITIONS_DIFFER");
        }
        stage.put("status", "hit");
        var rows = stage.putArray("candidates");
        candidates.stream().limit(STANDARD.equals(library) ? 1 : 20).forEach(candidate -> {
            var source = candidate.source();
            var row = rows.addObject().put("id", source.id()).put("version", source.version())
                    .put("businessSimilarity", candidate.similarity());
            for (String field : List.of("title", "requirement", "answer", "conditions", "source", "documentId",
                    "requirementAnchor", "answerAnchor", "clauseNo")) {
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
        });
        if (STANDARD.equals(library)) {
            stage.put("draft", text(candidates.get(0).source().payload(), "answer"));
        }
        return stage;
    }

    private Scope scope(Input input, String library) {
        boolean history = HISTORY.equals(library);
        var selected = history ? input.historyDocumentIds() : List.<String>of();
        if (!selected.isEmpty() && !historyRecall.allowed(input.bu(), input.project(), selected)) {
            return new Scope(Map.of(), true);
        }
        String fileFilter = String.join(",", selected);
        String table = history ? "`history-rfq-record`" : "`standard-reply-record`";
        String index = history ? "history_rfq_index_sync" : "standard_reply_index_sync";
        var sources = new LinkedHashMap<String, Source>();
        boolean unknown = false;
        for (var row : jdbc.query("""
                select r.id,r.version,r.revision,r.project_id,r.scope,r.payload,
                       (s.synced_at is not null and s.operation='upsert' and s.version=r.version) as synced,
                       s.updated_at as sync_stamp
                from %s r left join %s s on s.bu_id=r.bu_id and s.reply_id=r.id
                where r.bu_id=? and (r.project_id is null or r.project_id=?)
                  and json_unquote(json_extract(r.payload,'$.status'))='已发布'
                  and (?='' or find_in_set(r.payload->>'$.documentId',?)>0)
                order by r.id,r.version
                """.formatted(table, index), (rs, n) -> new SourceRow(rs.getString("id"), rs.getInt("version"),
                rs.getLong("revision"), rs.getString("project_id"), rs.getString("scope"), rs.getBoolean("synced"),
                rs.getString("sync_stamp"), parse(rs.getString("payload"))), input.bu(), input.project(), fileFilter, fileFilter)) {
            String validity = text(row.payload(), "validity");
            if (List.of("已撤销", "被替代", "已过期", "已失效").contains(validity)) {
                continue;
            }
            String sourceProject = KnowledgePublicationAccess.recordProjectId(row.payload());
            if (!sourceProject.isBlank() && !input.project().equals(sourceProject)) {
                continue;
            }
            boolean shared = row.project() == null && sourceProject.isBlank() && "BU共享".equals(row.scope());
            boolean project = history && input.project().equals(row.project()) && "仅当前项目".equals(row.scope());
            if (!"有效".equals(validity) || !shared && !project
                    || sources.putIfAbsent(row.id(), new Source(row.id(), row.version(), row.revision(), shared,
                            row.synced(), row.syncStamp(), row.payload())) != null) {
                unknown = true;
            }
        }
        return new Scope(sources, unknown);
    }

    private record SourceRow(String id, int version, long revision, String project, String scope, boolean synced,
            String syncStamp, JsonNode payload) {}

    private String scopeStamp(Scope scope) {
        var items = json.createArrayNode();
        scope.sources().values().forEach(source -> items.addObject().put("id", source.id()).put("version", source.version())
                .put("revision", source.revision()).put("synced", source.synced()).put("sync", source.syncStamp()));
        return digest(scope.unknown() + ":" + items);
    }

    private String query(JsonNode snapshot) {
        String title = text(snapshot, "title"), body = text(snapshot, "text"), verified = text(snapshot.path("context"), "verifiedConditions");
        return String.join("\n", List.of(title, body, verified).stream().filter(value -> !value.isBlank()).distinct().toList());
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
