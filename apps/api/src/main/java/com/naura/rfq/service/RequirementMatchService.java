package com.naura.rfq.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.api.PageView;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.mapper.CustomerDocumentMapper;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.RequirementMapper;
import com.naura.rfq.model.dto.RequirementMatchRequest;
import com.naura.rfq.model.entity.CustomerDocument;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import static com.naura.rfq.service.MatchEvaluator.DEFAULT_ORDER;
import static com.naura.rfq.service.MatchEvaluator.digest;

@Service
@RequiredArgsConstructor
@Slf4j
public class RequirementMatchService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final ProjectMapper projects;
    private final CustomerDocumentMapper documents;
    private final RequirementMapper requirements;
    private final AccessGuard access;
    private final KnowledgePublicationAccess publicationAccess;
    private final AuditService audit;
    private final CapabilityMatch capability;
    private final MatchEvaluator evaluator;
    private final MatchDeviationService deviations;
    private final ProjectWorkScope work;
    @Value("${rfq.match.low-confidence-threshold:0}")
    private double lowConfidenceThreshold;

    public record Policy(List<String> matchOrder, long version, String changedBy, String changedAt) {}
    public record Accepted(String runId, String status) {}
    private record Scope(Project project, CustomerDocument document, Requirement requirement) {}
    private record SavedContext(long version, String sourceFingerprint, JsonNode payload) {}
    record Run(String id, String requirement, String document, int documentVersion, String parseRun, long requirementVersion,
            long policyVersion, String fingerprint, boolean current, String status, String leaseToken, int attempts,
            JsonNode progress, MatchEvaluator.Input input) {}
    record Finished(String status, int retrySeconds, ObjectNode progress) {}
    private record Result(JsonNode stamp, JsonNode payload) {}

    public Policy policy(CurrentUser user, String bu) {
        access.requireBu(user, bu);
        return policy(bu);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Policy changePolicy(CurrentUser user, String bu, RequirementMatchRequest.Policy request) {
        access.requireBu(user, bu);
        if (user.roles().stream().noneMatch(role -> bu.equals(role.buId()) && "BU_ADMIN".equals(role.role()))) {
            throw new BusinessException(403, "需要本 BU 管理员权限");
        }
        if (!new HashSet<>(request.matchOrder()).equals(Set.copyOf(DEFAULT_ORDER))) {
            throw new BusinessException(400, "比对顺序必须包含三个不同的库");
        }
        publicationAccess.lockBu(bu);
        Policy before = policy(bu);
        if (before.version() != request.version()) {
            throw new BusinessException(409, "比对顺序已变更，请刷新");
        }
        if (before.matchOrder().equals(request.matchOrder())) {
            return before;
        }
        long version = before.version() + 1;
        jdbc.update("""
                insert into bu_match_policy(bu_id,match_order,version,changed_by,changed_at)
                values (?,?,?,?,utc_timestamp(6)) as desired
                on duplicate key update match_order=desired.match_order,version=desired.version,
                    changed_by=desired.changed_by,changed_at=desired.changed_at
                """, bu, json.valueToTree(request.matchOrder()).toString(), version, user.id());
        audit.successInBu(user.id(), bu, "配置条款比对顺序", "bu_match_policy", bu, String.join(" → ", request.matchOrder()));
        return policy(bu);
    }

    void parsed(Project project, CustomerDocument document, List<Requirement> rows) {
        jdbc.update("""
                update requirement_match_run set current_run=null,status='superseded',lease_token=null,lease_until=null,next_attempt_at=null
                where project_id=? and document_id=? and current_run=1
                """, project.getId(), document.getId());
        Policy policy = policy(project.getBuId());
        for (var requirement : rows) {
            if (ready(requirement)) {
                enqueue(new Scope(project, document, requirement), policy, "parse", null);
            }
        }
    }

    void corrected(Project project, CustomerDocument document, Requirement requirement) {
        if (!ready(requirement)) {
            supersede(requirement.getId());
            return;
        }
        enqueue(new Scope(project, document, requirement), policy(project.getBuId()), "correction", null);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Accepted retry(CurrentUser user, String id, RequirementMatchRequest.Retry request) {
        var scope = lockForUser(user, id);
        requireMatchEditor(user, scope.project());
        String key = "manual:" + request.requestId();
        var prior = runWhere("where requirement_id=? and request_key=?", id, key);
        if (prior != null) {
            return new Accepted(prior.id(), prior.status());
        }
        requireVersion(scope.requirement(), request.sourceRequirementVersion());
        if (!ready(scope.requirement())) {
            throw new BusinessException(409, "请先核对条款原文");
        }
        return enqueue(scope, policy(scope.project().getBuId()), "manual", key);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode reject(CurrentUser user, String id, String runId, String reason) {
        var scope = lockForUser(user, id);
        requireMatchEditor(user, scope.project());
        completed(scope.project(), scope.requirement(), runId);
        return deviations.record(scope.project(), scope.requirement(), runId, "rejected", reason.trim());
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode closeDeviation(CurrentUser user, String id, long version, String reason) {
        var scope = lockForUser(user, id);
        requireMatchEditor(user, scope.project());
        return deviations.close(user, scope.project(), scope.requirement(), version, reason.trim());
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode professionalReview(CurrentUser user, String id, RequirementMatchRequest.ProfessionalReview request) {
        var scope = lockForUser(user, id);
        requireMatchEditor(user, scope.project());
        return deviations.assignReview(user, scope.project(), scope.requirement(), request.version(), request.reviewerIds(),
                request.deadline(), request.reason().trim());
    }

    private void requireMatchEditor(CurrentUser user, Project project) {
        if (user.roles().stream().noneMatch(role -> project.getBuId().equals(role.buId())
                && Set.of("SR", "TECH", "BU_ADMIN").contains(role.role()))) {
            throw new BusinessException(403, "当前账号无权处理比对结果");
        }
    }

    public ObjectNode context(CurrentUser user, String id) {
        var requirement = requirement(id);
        project(user, requirement.getProjectId());
        return contextView(requirement, context(id));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode saveContext(CurrentUser user, String id, RequirementMatchRequest.Input request) {
        var scope = lockForUser(user, id);
        String bu = scope.project().getBuId();
        if (user.roles().stream().noneMatch(role -> bu.equals(role.buId()) && Set.of("SR", "TECH", "BU_ADMIN").contains(role.role()))) {
            throw new BusinessException(403, "当前账号无权确认比对输入");
        }
        var requirement = scope.requirement();
        requireVersion(requirement, request.sourceRequirementVersion());
        if (!ready(requirement)) {
            throw new BusinessException(409, "请先核对条款原文");
        }
        var before = context(id);
        if (before.version() != request.version()) {
            throw new BusinessException(409, "比对输入已变更，请刷新");
        }
        capability.validate(bu, request.context());
        ObjectNode payload = json.valueToTree(request.context());
        // MySQL JSON uses doubles for decimal literals. Keep reviewed bounds as decimal strings.
        if (request.context().devices() != null) {
            for (int device = 0; device < request.context().devices().size(); device++) {
                var metrics = request.context().devices().get(device).metrics();
                for (int metric = 0; metric < metrics.size(); metric++) {
                    var bounds = metrics.get(metric);
                    var stored = (ObjectNode) payload.path("devices").path(device).path("metrics").path(metric);
                    if (bounds.lower() != null) {
                        stored.put("lower", bounds.lower().toPlainString());
                    }
                    if (bounds.upper() != null) {
                        stored.put("upper", bounds.upper().toPlainString());
                    }
                }
            }
        }
        jdbc.update("""
                insert into requirement_match_input(requirement_id,source_fingerprint,version,payload)
                values (?,?,?,?) as desired on duplicate key update source_fingerprint=desired.source_fingerprint,
                    version=desired.version,payload=desired.payload
                """, id, sourceFingerprint(requirement), before.version() + 1, payload.toString());
        var run = enqueue(scope, policy(bu), "input", null);
        audit.successInBu(user.id(), bu, "确认条款比对输入", "requirement", id, run.runId());
        return contextView(requirement, context(id)).put("runId", run.runId());
    }

    @Transactional(readOnly = true)
    public PageView<ObjectNode> list(CurrentUser user, String projectId, String documentId, String parseRunId, int page, int size) {
        var project = project(user, projectId);
        if (documentId != null && documents.findById(documentId)
                .filter(document -> projectId.equals(document.getProjectId())).isEmpty()) {
            throw new BusinessException(404, "项目原件不存在");
        }
        int safePage = Math.max(1, page), safeSize = Math.min(100, Math.max(1, size));
        String filter = " from requirement where project_id=? and extraction_status <> 'EXCLUDED'"
                + " and (? is null or document_id=?) and (? is null or parse_run_id=?)";
        long count = jdbc.queryForObject("select count(*)" + filter, Long.class, projectId, documentId, documentId, parseRunId, parseRunId);
        var items = jdbc.query("select id" + filter + " order by document_id,sort_order,id limit ? offset ?",
                (rs, n) -> rs.getString("id"), projectId, documentId, documentId, parseRunId, parseRunId,
                safeSize, (long) (safePage - 1) * safeSize).stream().map(id -> {
                    return currentView(project, requirement(id), false);
                }).toList();
        return PageView.of(items, count, safePage, safeSize);
    }

    @Transactional(readOnly = true)
    public ObjectNode current(CurrentUser user, String id) {
        var requirement = requirement(id);
        var project = project(user, requirement.getProjectId());
        var view = currentView(project, requirement, true);
        var deviation = deviations.find(project, requirement);
        if (deviation != null) {
            view.set("deviation", deviation);
        }
        var reference = jdbc.query("select json_extract(payload,'$.matchReference') from requirement_response where requirement_id=? and json_contains_path(payload,'one','$.matchReference')",
                (row, n) -> parse(row.getString(1)), id).stream().findFirst().orElse(json.nullNode());
        if (reference.isObject()) {
            view.put("referenceInvalid", !referenceAvailable(project, requirement, reference));
        }
        return view;
    }

    private ObjectNode currentView(Project project, Requirement requirement, boolean detail) {
        var run = runWhere("where requirement_id=? and current_run=1", requirement.getId());
        if (run != null) {
            return view(project, requirement, run, detail);
        }
        return json.createObjectNode().put("requirementId", requirement.getId()).put("documentId", requirement.getDocumentId())
                .put("parseRunId", requirement.getParseRunId()).put("status", ready(requirement) ? "not_run" : "needs_review");
    }

    @Transactional(readOnly = true)
    public ObjectNode detail(CurrentUser user, String id, String runId) {
        var run = runWhere("where id=? and requirement_id=?", runId, id);
        if (run == null) {
            throw new BusinessException(404, "比对轮次不存在");
        }
        var project = project(user, run.input().project());
        return view(project, requirements.findById(id).orElse(null), run, true);
    }

    private ObjectNode completed(Project project, Requirement requirement, String runId) {
        publicationAccess.lockBu(project.getBuId());
        var run = runWhere("where id=? and requirement_id=? and current_run=1", runId, requirement.getId());
        if (run != null) {
            var view = view(project, requirement, run, true);
            if (view.path("result").isObject()) {
                return view;
            }
        }
        throw new BusinessException(409, "比对轮次已失效或未完成，请刷新");
    }

    ObjectNode adopt(Project project, Requirement requirement, String runId, String candidateId) {
        if (runId == null || runId.isBlank() || candidateId == null || candidateId.isBlank()) {
            throw new BusinessException(400, "请选择比对轮次和候选");
        }
        var result = completed(project, requirement, runId).path("result");
        String library = result.path("matchedLibrary").asText();
        var stage = result.path("stages").path(library);
        var reference = json.createObjectNode().put("runId", runId).put("library", library)
                .put("candidateId", candidateId).put("inputFingerprint", digest(snapshot(requirement).toString()))
                .put("workVersion", deviations.workVersion(project.getId()));
        if ("capability".equals(library) && "capability".equals(candidateId) && !"待确认".equals(result.path("conclusion").asText())) {
            String capabilityStamp = jdbc.queryForObject("""
                    select json_unquote(json_extract(scope_stamp,'$.capability')) from requirement_match_result where run_id=?
                    """, String.class, runId);
            reference.put("capabilityFingerprint", capabilityStamp);
            var sources = reference.putArray("sources");
            for (var check : stage.path("checks")) {
                for (var candidate : check.path("candidates")) {
                    var source = sources.addObject().put("id", candidate.path("id").asText()).put("version", candidate.path("version").asInt());
                    source.set("evidenceRefs", candidate.path("evidenceRefs"));
                }
            }
            return reference;
        }
        for (JsonNode candidate : stage.path("candidates")) {
            if (candidateId.equals(candidate.path("id").asText())) {
                return reference.put("version", candidate.path("version").asInt());
            }
        }
        throw new BusinessException(409, "候选不属于该轮的可用结果");
    }

    boolean referenceAvailable(Project project, Requirement requirement, JsonNode reference) {
        if (!reference.isObject()) {
            return true;
        }
        var snapshot = snapshot(requirement);
        return !work.retired(project.getId(), requirement.getDocumentId())
                && reference.path("inputFingerprint").asText().equals(digest(snapshot.toString()))
                && evaluator.referenceAvailable(new MatchEvaluator.Input(project.getBuId(), project.getId(), snapshot, DEFAULT_ORDER), reference);
    }

    JsonNode readableResponse(Project project, JsonNode response) {
        var reference = response.path("matchReference");
        if (!(response instanceof ObjectNode row) || !reference.isObject() || referenceReadable(project, reference)) {
            return response;
        }
        var safe = row.deepCopy().put("status", "待复核").put("confirmationReason", "采纳依据已不可访问，请重新核对")
                .put("restrictedMatchReference", true);
        safe.put("draft", "").put("conditions", "").put("evidence", "");
        safe.remove(List.of("matchReference", "confirmedAt", "confirmedBy", "confirmedById"));
        return safe;
    }

    private boolean referenceReadable(Project project, JsonNode reference) {
        String library = reference.path("library").asText();
        if ("capability".equals(library)) {
            for (var candidate : reference.path("sources")) {
                if (!readableSource(project, "capability_record", candidate.path("id").asText(), candidate.path("version").asInt())) {
                    return false;
                }
                for (var evidence : candidate.path("evidenceRefs")) {
                    if (!readableSource(project, "evidence_record", evidence.path("id").asText(), evidence.path("version").asInt())) {
                        return false;
                    }
                }
            }
            return !reference.path("sources").isEmpty();
        }
        String table = switch (library) {
            case "standard_reply" -> "`standard-reply-record`";
            case "history_rfq" -> "`history-rfq-record`";
            default -> "";
        };
        return !table.isEmpty() && readableSource(project, table, reference.path("candidateId").asText(), reference.path("version").asInt());
    }

    private boolean readableSource(Project project, String table, String id, int version) {
        return jdbc.query("select project_id,scope,payload from " + table + " where bu_id=? and id=? and version=?",
                (row, n) -> {
                    String scope = row.getString("scope");
                    String owner = row.getString("project_id");
                    String origin = KnowledgePublicationAccess.recordProjectId(parse(row.getString("payload")));
                    return (origin.isBlank() || project.getId().equals(origin))
                            && (owner == null && "BU共享".equals(scope) || project.getId().equals(owner) && "仅当前项目".equals(scope));
                }, project.getBuId(), id, version).stream().findFirst().orElse(false);
    }

    void requireReference(Project project, Requirement requirement, JsonNode reference) {
        if (!reference.isObject()) {
            return;
        }
        publicationAccess.lockBu(project.getBuId());
        if (!referenceAvailable(project, requirement, reference)) {
            throw new BusinessException(409, "已采纳的比对依据已失效，请重新核对");
        }
    }

    List<String> adoptedAfter(String cursor) {
        return jdbc.queryForList("""
                select requirement_id from requirement_response
                where requirement_id>? and json_contains_path(payload,'one','$.matchReference')
                and not json_contains_path(payload,'one','$.matchReferenceInvalidatedAt')
                order by requirement_id limit 25
                """, String.class, cursor);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void recheckAdoption(String id) {
        var before = requirements.findById(id).orElse(null);
        if (before == null) {
            return;
        }
        var project = projects.findByIdForUpdate(before.getProjectId()).orElse(null);
        if (project == null || project.isArchived() || work.retired(project.getId(), before.getDocumentId())) {
            return;
        }
        if (documents.findByIdForUpdate(before.getDocumentId()).isEmpty()) {
            return;
        }
        var requirement = requirements.findByIdForUpdate(id).orElse(null);
        if (requirement == null) {
            return;
        }
        publicationAccess.lockBu(project.getBuId());
        var response = jdbc.query("select payload from requirement_response where requirement_id=? for update",
                (row, n) -> parse(row.getString(1)), id).stream().findFirst().orElse(json.nullNode());
        if (!(response instanceof ObjectNode row) || row.has("matchReferenceInvalidatedAt") || !row.hasNonNull("matchReference")
                || referenceAvailable(project, requirement, row.path("matchReference"))) {
            return;
        }
        String reason = "已采纳的比对依据失效，请重新核对";
        row.put("status", "待复核").put("version", row.path("version").asLong(1) + 1).put("confirmationReason", reason)
                .put("matchReferenceInvalidatedAt", java.time.Instant.now().toString());
        row.remove(List.of("confirmedAt", "confirmedBy", "confirmedById"));
        jdbc.update("update requirement_response set payload=?,updated_at=current_timestamp where requirement_id=?", row.toString(), id);
        deviations.record(project, requirement, row.path("matchReference").path("runId").asText(), "source_invalidated", reason);
    }

    List<String> due() {
        return jdbc.query("select id from requirement_match_run where " + DUE + " order by next_attempt_at,id limit 4",
                (rs, n) -> rs.getString(1));
    }

    private static final String DUE = """
            current_run=1 and status in ('queued','running','retry_wait','blocked') and next_attempt_at<=utc_timestamp(6)
            and (lease_until is null or lease_until<=utc_timestamp(6))
            """;

    Run claim(String id, String token) {
        int changed = jdbc.update("""
                update requirement_match_run set status='running',lease_token=?,lease_until=timestampadd(second,90,utc_timestamp(6)),
                    attempts=least(attempts+1,1000000) where id=? and
                """ + DUE, token, id);
        return changed == 1 ? runWhere("where id=? and lease_token=?", id, token) : null;
    }

    boolean active(Run job) {
        var run = runWhere("where id=? and lease_token=? and current_run=1", job.id(), job.leaseToken());
        return run != null && currentInput(projects.findById(job.input().project()).orElse(null),
                documents.findById(job.document()).orElse(null), requirements.findById(job.requirement()).orElse(null), run);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Finished finish(Run job, MatchEvaluator.Evaluation outcome) {
        var project = projects.findByIdForUpdate(job.input().project()).orElse(null);
        var document = documents.findByIdForUpdate(job.document()).orElse(null);
        var requirement = requirements.findByIdForUpdate(job.requirement()).orElse(null);
        var run = runWhere("where id=? and lease_token=? and current_run=1 and lease_until>utc_timestamp(6) for update",
                job.id(), job.leaseToken());
        if (run == null) {
            return null;
        }
        if (!currentInput(project, document, requirement, run)) {
            supersede(run.requirement());
            return null;
        }
        String state = outcome.state();
        int delay = outcome.retrySeconds();
        var progress = publicProgress(outcome.result());
        if ("completed".equals(state)) {
            publicationAccess.lockBu(project.getBuId());
            if (!evaluator.stillCurrent(run.input(), outcome.stamp())) {
                state = "retry_wait";
                delay = 5;
                progress.put("reason", "MATCH_SCOPE_CHANGED");
            } else {
                jdbc.update("insert into requirement_match_result(run_id,scope_stamp,payload) values (?,?,?)",
                        run.id(), outcome.stamp().toString(), outcome.result().toString());
                if (outcome.result().path("knowledgeGap").asBoolean()) {
                    deviations.record(project, requirement, run.id(), "knowledge_gap", "三个知识库均未命中");
                }
                if ("不满足".equals(outcome.result().path("conclusion").asText())) {
                    deviations.record(project, requirement, run.id(), "capability_contradiction", "能力依据显示不满足，请分派技术评审");
                }
                String matched = outcome.result().path("matchedLibrary").asText();
                var similarity = outcome.result().path("stages").path(matched).path("candidates").path(0).path("businessSimilarity");
                if (lowConfidenceThreshold > 0 && lowConfidenceThreshold <= 1
                        && similarity.isNumber() && similarity.asDouble() < lowConfidenceThreshold) {
                    deviations.record(project, requirement, run.id(), "low_confidence", "候选相似度低于当前配置阈值");
                }
            }
        }
        int failures = "retry_wait".equals(state) ? run.progress().path("failureCount").asInt() + 1 : 0;
        if (failures >= 5) {
            state = "failed";
            delay = 0;
        } else if (failures > 0) {
            delay = Math.max(delay, 5 << (failures - 1));
        }
        progress.put("failureCount", failures);
        int updated = jdbc.update("""
                update requirement_match_run set status=?,next_attempt_at=timestampadd(second,?,utc_timestamp(6)),
                    lease_token=null,lease_until=null,progress=? where id=? and lease_token=?
                """, state, delay == 0 ? null : delay, progress.toString(), run.id(), run.leaseToken());
        return updated == 1 ? new Finished(state, delay, progress) : null;
    }

    private ObjectNode view(Project project, Requirement requirement, Run run, boolean detail) {
        var view = json.createObjectNode().put("runId", run.id()).put("requirementId", run.requirement())
                .put("documentId", run.document()).put("documentVersion", run.documentVersion()).put("parseRunId", run.parseRun())
                .put("sourceRequirementVersion", run.requirementVersion()).put("policyVersion", run.policyVersion())
                .put("status", run.status()).put("attempts", run.attempts());
        view.set("matchOrder", json.valueToTree(run.input().order()));
        view.set("historyDocumentIds", json.valueToTree(run.input().historyDocumentIds()));
        if (!run.input().historyGroupId().isEmpty()) {
            view.put("historyGroupId", run.input().historyGroupId());
        }
        if (!run.current()) {
            return view.put("status", "superseded");
        }
        if (!currentInput(project, documents.findById(run.document()).orElse(null), requirement, run)) {
            return view.put("status", "superseded");
        }
        if (!"completed".equals(run.status())) {
            view.set("stages", run.progress().path("stages"));
            if (run.progress().has("reason")) {
                view.set("reason", run.progress().get("reason"));
            }
            return view;
        }
        var result = jdbc.query("select scope_stamp,payload from requirement_match_result where run_id=?",
                (rs, n) -> new Result(parse(rs.getString(1)), parse(rs.getString(2))), run.id()).stream().findFirst().orElse(null);
        if (result == null || !evaluator.stillCurrent(run.input(), result.stamp())) {
            return view.put("status", "blocked").put("reason", "MATCH_SCOPE_CHANGED");
        }
        if (detail) {
            view.set("result", result.payload());
        }
        else {
            view.put("matchedLibrary", result.payload().path("matchedLibrary").asText(null))
                    .put("conclusion", result.payload().path("conclusion").asText()).put("knowledgeGap", result.payload().path("knowledgeGap").asBoolean());
            view.set("stages", publicProgress(result.payload()).path("stages"));
        }
        return view;
    }

    private ObjectNode publicProgress(JsonNode payload) {
        var safe = json.createObjectNode();
        if (payload.has("reason")) {
            safe.set("reason", payload.get("reason"));
        }
        var stages = safe.putObject("stages");
        payload.path("stages").fields().forEachRemaining(entry -> {
            var row = stages.putObject(entry.getKey()).put("status", entry.getValue().path("status").asText());
            if (entry.getValue().has("reason")) {
                row.set("reason", entry.getValue().get("reason"));
            }
            if (entry.getValue().has("platformRequestId")) {
                row.set("platformRequestId", entry.getValue().get("platformRequestId"));
            }
            if (entry.getValue().has("indexVersion")) {
                row.set("indexVersion", entry.getValue().get("indexVersion"));
            }
        });
        return safe;
    }

    private Accepted enqueue(Scope scope, Policy policy, String reason, String requestKey) {
        var requirement = scope.requirement();
        var input = runSnapshot(requirement, scope.document(), scope.project().getGroupId());
        var order = input.has("historyDocumentIds") || input.has("historyGroupId")
                ? List.of(MatchEvaluator.HISTORY) : policy.matchOrder();
        String fingerprint = digest(input.toString());
        if (requestKey == null) {
            var current = runWhere("where requirement_id=? and current_run=1", requirement.getId());
            if (current != null && current.fingerprint().equals(fingerprint) && current.policyVersion() == policy.version()) {
                return new Accepted(current.id(), current.status());
            }
            requestKey = "auto:" + digest(reason + ":" + requirement.getVersion() + ":" + context(requirement.getId()).version()
                    + ":" + fingerprint + ":" + policy.version());
        }
        supersede(requirement.getId());
        String id = Ids.next("MATCH");
        var progress = json.createObjectNode();
        var stages = progress.putObject("stages");
        order.forEach(library -> stages.putObject(library).put("status", "not_run"));
        jdbc.update("""
                insert into requirement_match_run(id,bu_id,project_id,requirement_id,requirement_version,document_id,document_version,
                    parse_run_id,input_fingerprint,policy_version,match_order,input_snapshot,request_key,trigger_reason,current_run,
                    status,next_attempt_at,progress)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'queued',utc_timestamp(6),?)
                """, id, scope.project().getBuId(), scope.project().getId(), requirement.getId(), requirement.getVersion(),
                scope.document().getId(), scope.document().getVersion(), requirement.getParseRunId(), fingerprint, policy.version(),
                json.valueToTree(order).toString(), input.toString(), requestKey, reason, progress.toString());
        return new Accepted(id, "queued");
    }

    private void supersede(String requirementId) {
        jdbc.update("""
                update requirement_match_run set current_run=null,status='superseded',lease_token=null,lease_until=null,next_attempt_at=null
                where requirement_id=? and current_run=1
                """, requirementId);
    }

    private boolean currentInput(Project project, CustomerDocument document, Requirement requirement, Run run) {
        return project != null && !project.isArchived() && document != null && requirement != null && ready(requirement)
                && !work.retired(project.getId(), document.getId())
                && project.getBuId().equals(run.input().bu()) && requirement.getDocumentId().equals(run.document())
                && document.getVersion() == run.documentVersion() && Objects.equals(requirement.getParseRunId(), run.parseRun())
                && run.fingerprint().equals(digest(runSnapshot(requirement, document,
                        run.input().historyGroupId().isEmpty() ? null : project.getGroupId()).toString()));
    }

    private Scope lockForUser(CurrentUser user, String id) {
        var reference = requirement(id);
        var project = projects.findByIdForUpdate(reference.getProjectId()).orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        access.requireActiveProject(project);
        work.requireEditable(project.getId(), reference.getDocumentId());
        var document = documents.findByIdForUpdate(reference.getDocumentId()).orElseThrow(() -> new BusinessException(404, "原件不存在"));
        var requirement = requirements.findByIdForUpdate(id)
                .orElseThrow(() -> new BusinessException(409, "条款已重新解析，请刷新"));
        return new Scope(project, document, requirement);
    }

    private Project project(CurrentUser user, String id) {
        var project = projects.findById(id).orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        return project;
    }

    private Requirement requirement(String id) {
        return requirements.findById(id).orElseThrow(() -> new BusinessException(404, "条款不存在"));
    }

    private void requireVersion(Requirement requirement, long version) {
        if (!Objects.equals(requirement.getVersion(), version)) {
            throw new BusinessException(409, "条款已变更，请刷新");
        }
    }

    private boolean ready(Requirement requirement) {
        return "VALID".equals(requirement.getExtractionStatus()) && !text(requirement).isBlank();
    }

    private ObjectNode snapshot(Requirement requirement) {
        var source = baseInput(requirement);
        var saved = context(requirement.getId());
        if (digest(source.toString()).equals(saved.sourceFingerprint())) {
            source.set("context", saved.payload());
        }
        return source;
    }

    private ObjectNode runSnapshot(Requirement requirement, CustomerDocument document, String groupId) {
        var input = snapshot(requirement);
        var historyIds = document.historyRecallIds();
        if (!historyIds.isEmpty()) {
            input.set("historyDocumentIds", json.valueToTree(historyIds));
        } else if (groupId != null && !groupId.isBlank()) {
            input.put("historyGroupId", groupId);
        }
        long workVersion = work.version(requirement.getProjectId());
        if (workVersion > 1) {
            input.put("workVersion", workVersion);
        }
        return input;
    }

    private String sourceFingerprint(Requirement requirement) { return digest(baseInput(requirement).toString()); }

    private ObjectNode baseInput(Requirement requirement) {
        return json.createObjectNode().put("title", requirement.getTitle()).put("text", text(requirement))
                .put("rawConditions", requirement.getConditionsText()).put("extractedMetrics", requirement.getMetricsJson());
    }

    private String text(Requirement requirement) {
        String body = requirement.getRequirementText();
        return body != null && !body.isBlank() ? body : Objects.toString(requirement.getOriginalText(), "");
    }

    private SavedContext context(String id) {
        return jdbc.query("select version,source_fingerprint,payload from requirement_match_input where requirement_id=?",
                (rs, n) -> new SavedContext(rs.getLong(1), rs.getString(2), parse(rs.getString(3))), id)
                .stream().findFirst().orElse(new SavedContext(0, "", json.nullNode()));
    }

    private ObjectNode contextView(Requirement requirement, SavedContext saved) {
        var view = json.createObjectNode().put("version", saved.version()).put("sourceRequirementVersion", requirement.getVersion());
        view.set("context", sourceFingerprint(requirement).equals(saved.sourceFingerprint()) ? saved.payload() : json.nullNode());
        return view;
    }

    private Policy policy(String bu) {
        return jdbc.query("select match_order,version,changed_by,changed_at from bu_match_policy where bu_id=?",
                (rs, n) -> new Policy(order(rs.getString(1)), rs.getLong(2), rs.getString(3), rs.getString(4)), bu)
                .stream().findFirst().orElse(new Policy(DEFAULT_ORDER, 0, null, null));
    }

    private Run runWhere(String where, Object... parameters) {
        return jdbc.query("select * from requirement_match_run " + where, (rs, n) -> new Run(rs.getString("id"),
                rs.getString("requirement_id"), rs.getString("document_id"), rs.getInt("document_version"), rs.getString("parse_run_id"),
                rs.getLong("requirement_version"), rs.getLong("policy_version"), rs.getString("input_fingerprint"),
                rs.getBoolean("current_run"), rs.getString("status"), rs.getString("lease_token"), rs.getInt("attempts"),
                parse(rs.getString("progress")), new MatchEvaluator.Input(rs.getString("bu_id"), rs.getString("project_id"),
                parse(rs.getString("input_snapshot")), order(rs.getString("match_order")))), parameters)
                .stream().findFirst().orElse(null);
    }

    private List<String> order(String value) {
        var items = new java.util.ArrayList<String>();
        parse(value).forEach(item -> items.add(item.asText()));
        return List.copyOf(items);
    }

    private JsonNode parse(String value) {
        if (value == null) {
            return json.createObjectNode();
        }
        try { return json.readTree(value); }
        catch (JsonProcessingException failure) {
            log.error("解析比对记录失败 errorType={}", failure.getClass().getSimpleName());
            throw new IllegalStateException("比对记录格式异常", failure);
        }
    }
}
