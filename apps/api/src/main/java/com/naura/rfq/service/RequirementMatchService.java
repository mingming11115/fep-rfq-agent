package com.naura.rfq.service;

import com.naura.rfq.mapper.KnowledgeRecordMapper;
import com.naura.rfq.mapper.Table;
import com.naura.rfq.mapper.RequirementMatchMapper;
import com.naura.rfq.mapper.ResponseMapper;
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
import com.naura.rfq.model.entity.ProjectStage;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import static com.naura.rfq.service.MatchEvaluator.DEFAULT_ORDER;
import static com.naura.rfq.service.MatchEvaluator.digest;

@Service
@Slf4j
public class RequirementMatchService {
    @Autowired
    private RequirementMatchMapper matchRecords;
    @Autowired
    private KnowledgeRecordMapper knowledgeRecords;
    @Autowired
    private ResponseMapper responseRecords;
    @Autowired
    private ObjectMapper json;
    @Autowired
    private ProjectMapper projects;
    @Autowired
    private CustomerDocumentMapper documents;
    @Autowired
    private RequirementMapper requirements;
    @Autowired
    private AccessGuard access;
    @Autowired
    private KnowledgePublicationAccess publicationAccess;
    @Autowired
    private AuditService audit;
    @Autowired
    private CapabilityMatch capability;
    @Autowired
    private MatchEvaluator evaluator;
    @Autowired
    private MatchDeviationService deviations;
    @Autowired
    private ProjectWorkScope work;
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
        matchRecords.upsertPolicy(bu, json.valueToTree(request.matchOrder()).toString(), version, user.id());
        audit.successInBu(user.id(), bu, "配置条款比对顺序", "bu_match_policy", bu, String.join(" → ", request.matchOrder()));
        return policy(bu);
    }

    void parsed(Project project, CustomerDocument document, List<Requirement> rows) {
        matchRecords.supersedeGenerated(project.getId(), document.getId());
        Policy policy = policy(project.getBuId());
        int queued = 0;
        for (var requirement : rows) {
            if (ready(requirement)) {
                enqueue(new Scope(project, document, requirement), policy, "parse", null);
                queued++;
            }
        }
        // 条款存在但都无需比对（如已被排除）时不会再有比对收尾回调，直接判定阶段；
        // 未识别到任何条款则保持解析比对中，交由人工补录或重试解析。
        if (!rows.isEmpty() && queued == 0) {
            advanceToReview(project);
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
        var prior = decodeRun(matchRecords.findByRequest(id, key));
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
        matchRecords.upsertInput(id, sourceFingerprint(requirement), before.version() + 1, payload.toString());
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
        long count = matchRecords.countRequirements(projectId, documentId, parseRunId);
        var items = matchRecords.listRequirementIds(projectId, documentId, parseRunId, safeSize, (long) (safePage - 1) * safeSize).stream().map(id -> {
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
        var reference = responseRecords.findMatchReference(id).stream().map(this::parse).findFirst().orElse(json.nullNode());
        if (reference.isObject()) {
            view.put("referenceInvalid", !referenceAvailable(project, requirement, reference));
        }
        return view;
    }

    private ObjectNode currentView(Project project, Requirement requirement, boolean detail) {
        var run = decodeRun(matchRecords.findCurrent(requirement.getId()));
        if (run != null) {
            return view(project, requirement, run, detail);
        }
        return json.createObjectNode().put("requirementId", requirement.getId()).put("documentId", requirement.getDocumentId())
                .put("parseRunId", requirement.getParseRunId()).put("status", ready(requirement) ? "not_run" : "excluded");
    }

    @Transactional(readOnly = true)
    public ObjectNode detail(CurrentUser user, String id, String runId) {
        var run = decodeRun(matchRecords.findRunForRequirement(runId, id));
        if (run == null) {
            throw new BusinessException(404, "比对轮次不存在");
        }
        var project = project(user, run.input().project());
        return view(project, requirements.findById(id).orElse(null), run, true);
    }

    private ObjectNode completed(Project project, Requirement requirement, String runId) {
        publicationAccess.lockBu(project.getBuId());
        var run = decodeRun(matchRecords.findCurrentRunForRequirement(runId, requirement.getId()));
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
            String capabilityStamp = matchRecords.findCapabilityStamp(runId);
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
        safe.put("draft", "").put("evidence", "").remove("conditions");
        safe.remove(List.of("matchReference", "confirmedAt", "confirmedBy", "confirmedById"));
        return safe;
    }

    private boolean referenceReadable(Project project, JsonNode reference) {
        String library = reference.path("library").asText();
        if ("capability".equals(library)) {
            for (var candidate : reference.path("sources")) {
                if (!readableSource(project, Table.CAPABILITY, candidate.path("id").asText(), candidate.path("version").asInt())) {
                    return false;
                }
                for (var evidence : candidate.path("evidenceRefs")) {
                    if (!readableSource(project, Table.EVIDENCE, evidence.path("id").asText(), evidence.path("version").asInt())) {
                        return false;
                    }
                }
            }
            return !reference.path("sources").isEmpty();
        }
        Table table = switch (library) {
            case "standard_reply" -> Table.STANDARD_REPLY;
            case "history_rfq" -> Table.HISTORY;
            default -> null;
        };
        return table != null && readableSource(project, table, reference.path("candidateId").asText(), reference.path("version").asInt());
    }

    private boolean readableSource(Project project, Table table, String id, int version) {
        return knowledgeRecords.findResource(table, project.getBuId(), id, version).map(row -> {
            String scope = row.scope();
            String owner = row.projectId();
            String origin = KnowledgePublicationAccess.recordProjectId(parse(row.payload()));
            return (origin.isBlank() || project.getId().equals(origin))
                    && (owner == null && "BU共享".equals(scope) || project.getId().equals(owner) && "仅当前项目".equals(scope));
        }).orElse(false);
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
        return responseRecords.listAdoptedAfter(cursor);
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
        var response = responseRecords.lockResponseByRequirement(id).stream().map(this::parse).findFirst().orElse(json.nullNode());
        if (!(response instanceof ObjectNode row) || row.has("matchReferenceInvalidatedAt") || !row.hasNonNull("matchReference")
                || referenceAvailable(project, requirement, row.path("matchReference"))) {
            return;
        }
        String reason = "已采纳的比对依据失效，请重新核对";
        row.put("status", "待复核").put("version", row.path("version").asLong(1) + 1).put("confirmationReason", reason)
                .put("matchReferenceInvalidatedAt", java.time.Instant.now().toString());
        row.remove(List.of("confirmedAt", "confirmedBy", "confirmedById"));
        responseRecords.updateResponse(id, row.toString());
        deviations.record(project, requirement, row.path("matchReference").path("runId").asText(), "source_invalidated", reason);
    }

    List<String> due() {
        return matchRecords.listDue();
    }

    Run claim(String id, String token) {
        int changed = matchRecords.claim(id, token);
        return changed == 1 ? decodeRun(matchRecords.findClaimed(id, token)) : null;
    }

    boolean active(Run job) {
        var run = decodeRun(matchRecords.findCurrentClaimed(job.id(), job.leaseToken()));
        return run != null && currentInput(projects.findById(job.input().project()).orElse(null),
                documents.findById(job.document()).orElse(null), requirements.findById(job.requirement()).orElse(null), run);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Finished finish(Run job, MatchEvaluator.Evaluation outcome) {
        var project = projects.findByIdForUpdate(job.input().project()).orElse(null);
        var document = documents.findByIdForUpdate(job.document()).orElse(null);
        var requirement = requirements.findByIdForUpdate(job.requirement()).orElse(null);
        var run = decodeRun(matchRecords.lockActiveClaim(job.id(), job.leaseToken()));
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
                matchRecords.insertResult(run.id(), outcome.stamp().toString(), outcome.result().toString());
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
        int updated = matchRecords.finish(run.id(), run.leaseToken(), state, delay == 0 ? null : delay, progress.toString());
        if (updated != 1) {
            return null;
        }
        advanceToReview(project);
        return new Finished(state, delay, progress);
    }

    /**
     * 条款比对收尾后推进项目阶段：解析比对中 → 评审确认中。
     * 仅当项目仍停留在解析比对中、且已无待比对条款时推进，避免覆盖归档或更后阶段。
     * 解析与比对共用项目行锁，进入本方法时 project 行已持有写锁。
     */
    private void advanceToReview(Project project) {
        if (project == null || !ProjectStage.awaitingMatch(project.getStage())) {
            return;
        }
        // 被替换原件的历史条款已退出工作范围，不参与"是否比对完"的判定。
        if (matchRecords.countPendingMatches(project.getId(), work.inactiveDocuments(project.getId())) > 0) {
            return;
        }
        project.setStage(ProjectStage.REVIEWING.name());
        project.setUpdatedAt(Instant.now());
        projects.update(project);
        log.info("project.stage.advanced projectId={} from={} to={}", project.getId(), ProjectStage.PARSING,
                ProjectStage.REVIEWING);
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
        var result = matchRecords.findResult(run.id());
        if (result == null || !evaluator.stillCurrent(run.input(), parse(result.scopeStamp()))) {
            return view.put("status", "blocked").put("reason", "MATCH_SCOPE_CHANGED");
        }
        var payload = parse(result.payload());
        if (detail) {
            view.set("result", payload);
        } else {
            view.put("matchedLibrary", payload.path("matchedLibrary").asText(null))
                    .put("conclusion", payload.path("conclusion").asText()).put("knowledgeGap", payload.path("knowledgeGap").asBoolean());
            view.set("stages", publicProgress(payload).path("stages"));
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
            var current = decodeRun(matchRecords.findCurrent(requirement.getId()));
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
        matchRecords.insertRun(id, scope.project().getBuId(), scope.project().getId(), requirement.getId(), requirement.getVersion(),
                scope.document().getId(), scope.document().getVersion(), requirement.getParseRunId(), fingerprint, policy.version(),
                json.valueToTree(order).toString(), input.toString(), requestKey, reason, progress.toString());
        return new Accepted(id, "queued");
    }

    private void supersede(String requirementId) {
        matchRecords.supersedeRequirement(requirementId);
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
        // 抽取不再产出复核状态：除人工删除的条款（EXCLUDED）外，有正文即可参与比对。
        return !"EXCLUDED".equals(requirement.getExtractionStatus()) && !text(requirement).isBlank();
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
                .putNull("rawConditions").put("extractedMetrics", requirement.getMetricsJson());
    }

    private String text(Requirement requirement) {
        String body = requirement.getRequirementText();
        return body != null && !body.isBlank() ? body : Objects.toString(requirement.getOriginalText(), "");
    }

    private SavedContext context(String id) {
        var row = matchRecords.findInput(id);
        return row == null ? new SavedContext(0, "", json.nullNode())
                : new SavedContext(row.version(), row.sourceFingerprint(), parse(row.payload()));
    }

    private ObjectNode contextView(Requirement requirement, SavedContext saved) {
        var view = json.createObjectNode().put("version", saved.version()).put("sourceRequirementVersion", requirement.getVersion());
        view.set("context", sourceFingerprint(requirement).equals(saved.sourceFingerprint()) ? saved.payload() : json.nullNode());
        return view;
    }

    private Policy policy(String bu) {
        var row = matchRecords.findPolicy(bu);
        return row == null ? new Policy(DEFAULT_ORDER, 0, null, null)
                : new Policy(order(row.matchOrder()), row.version(), row.changedBy(), row.changedAt());
    }

    private Run decodeRun(RequirementMatchMapper.RunRow row) {
        if (row == null) {
            return null;
        }
        return new Run(row.id(), row.requirementId(), row.documentId(), row.documentVersion(), row.parseRunId(),
                row.requirementVersion(), row.policyVersion(), row.inputFingerprint(), row.currentRun(),
                row.status(), row.leaseToken(), row.attempts(), parse(row.progress()),
                new MatchEvaluator.Input(row.buId(), row.projectId(), parse(row.inputSnapshot()), order(row.matchOrder())));
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
