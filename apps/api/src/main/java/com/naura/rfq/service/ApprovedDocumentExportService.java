package com.naura.rfq.service;

import com.naura.rfq.mapper.ResponseMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.integration.export.AnnotatedOriginal;
import com.naura.rfq.integration.export.AnnotatedOriginal.Note;
import com.naura.rfq.mapper.AppUserMapper;
import com.naura.rfq.mapper.BuMemberProfileMapper;
import com.naura.rfq.mapper.CustomerDocumentMapper;
import com.naura.rfq.mapper.DocumentBlockMapper;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.RequirementMapper;
import com.naura.rfq.mapper.UserBuRoleMapper;
import com.naura.rfq.model.entity.AppUser;
import com.naura.rfq.model.entity.CustomerDocument;
import com.naura.rfq.model.entity.DocumentBlock;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.model.parse.SourceRef;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@NoArgsConstructor
@AllArgsConstructor
@Slf4j
public class ApprovedDocumentExportService {
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
    private DocumentBlockMapper blocks;
    @Autowired
    private BuMemberProfileMapper profiles;
    @Autowired
    private AppUserMapper users;
    @Autowired
    private UserBuRoleMapper roles;
    @Autowired
    private AccessGuard access;
    @Autowired
    private DocumentService originalFiles;
    @Autowired
    private RequirementMatchService matches;
    @Autowired
    private ProjectWorkScope work;

    public record ExportFile(String name, String contentType, byte[] bytes) {}

    @Transactional(readOnly = true)
    public ExportFile download(CurrentUser user, String projectId, String snapshotId, boolean wordInBody) throws IOException {
        var project = projects.findById(projectId).orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        boolean sales = user.roles().stream().anyMatch(grant -> grant.buId().equals(project.getBuId()) && grant.role().equals("SR"));
        var profile = profiles.findByBuIdAndUserId(project.getBuId(), user.id());
        if (user.systemAdmin() || !sales || profile != null && !profile.isEnabled()) {
            throw new BusinessException(403, "正式文档仅由具有项目权限的 SR 导出");
        }

        var snapshot = latestSnapshot(projectId);
        if (snapshot == null || !snapshotId.equals(snapshot.path("id").asText()) || !approved(snapshot)) {
            throw new BusinessException(409, "当前版本的最终评审尚未通过，请刷新后核对");
        }
        validateReviewers(project, snapshot.path("finalReview").path("reviewers"));
        var notes = validateContents(project, snapshot);

        if (notes.size() == 1) {
            var entry = notes.entrySet().iterator().next();
            return exportDocument(user, entry.getKey(), entry.getValue(), wordInBody);
        }
        try (var bytes = new ByteArrayOutputStream(); var zip = new ZipOutputStream(bytes)) {
            Set<String> filenames = new HashSet<>();
            for (var entry : notes.entrySet()) {
                var file = exportDocument(user, entry.getKey(), entry.getValue(), wordInBody);
                String name = file.name();
                for (int number = 2; !filenames.add(name.toLowerCase(Locale.ROOT)); number++) {
                    name = insertSuffix(file.name(), "-" + number);
                }
                zip.putNextEntry(new ZipEntry(name));
                zip.write(file.bytes());
                zip.closeEntry();
            }
            zip.finish();
            return new ExportFile(safeName(project.getName()) + "-正式应答.zip", "application/zip", bytes.toByteArray());
        }
    }

    Map<String, List<Note>> validateContents(Project project, JsonNode snapshot) {
        return validateContents(project, snapshot, false);
    }

    Map<String, List<Note>> validateContents(Project project, JsonNode snapshot, boolean pinSources) {
        String projectId = project.getId();
        if (snapshot.has("workVersion") && snapshot.path("workVersion").asLong() != work.version(projectId)) {
            throw changed();
        }
        var excluded = work.inactiveDocuments(projectId);
        var sourceFiles = documents.findByProjectIdOrderByCreatedAtDesc(projectId).stream()
                .filter(file -> !excluded.contains(file.getId()))
                .collect(Collectors.toMap(CustomerDocument::getId, Function.identity()));
        var sourceRows = requirements.findByProjectIdOrderBySource(projectId).stream()
                .filter(row -> sourceFiles.containsKey(row.getDocumentId()))
                .collect(Collectors.toMap(Requirement::getId, Function.identity()));
        if (payloads(responseRecords.listReviews(projectId)).stream()
                .anyMatch(review -> (review.path("requirementId").asText().isBlank() || sourceRows.containsKey(review.path("requirementId").asText()))
                        && !Set.of("已关闭", "已取消").contains(review.path("status").asText()))) {
            throw changed();
        }
        var responses = payloads(responseRecords.listResponses(projectId)).stream()
                .collect(Collectors.toMap(row -> row.path("id").asText(), Function.identity()));
        JsonNode scope = snapshot.path("approvalScope");
        validateScope(projectId, scope, sourceFiles);
        if (sourceRows.isEmpty() || snapshot.path("rows").size() != sourceRows.size()) {
            throw changed();
        }

        Map<String, List<Note>> notes = new LinkedHashMap<>();
        Map<String, Map<String, DocumentBlock>> anchors = new LinkedHashMap<>();
        Set<String> seenRows = new HashSet<>();
        for (var row : snapshot.path("rows")) {
            String id = row.path("id").asText();
            var requirement = sourceRows.get(id);
            var response = responses.get(id);
            if (!seenRows.add(id) || requirement == null || response == null
                    || requirement.getExtractionStatus() != null && !"VALID".equals(requirement.getExtractionStatus()) || !"已确认".equals(response.path("status").asText())
                    || response.has("sourceRequirementVersion") && response.path("sourceRequirementVersion").asLong(-1) != requirement.getVersion()) {
                throw changed();
            }
            if (response.hasNonNull("matchReference") && !matches.referenceAvailable(project, requirement, response.path("matchReference"))) {
                throw changed();
            }
            var source = sourceFiles.get(requirement.getDocumentId());
            if (source == null || !source.getId().equals(row.path("sourceFileId").asText())
                    || !version(source).equals(row.path("sourceVersion").asText())
                    || !sameAnswer(row, requirement, response)) {
                throw changed();
            }
            var refs = SourceRef.decode(requirement.getSourceRefsJson());
            var primary = refs == null || refs.isEmpty() ? null : refs.get(0);
            String sourceAnchor;
            if (primary != null && primary.anchor() != null && primary.anchor().startsWith("selection:")) {
                sourceAnchor = primary.anchor();
            } else {
                var documentAnchors = anchors.computeIfAbsent(source.getId(), fileId -> blocks.findByDocumentIdOrderByBlockIndex(fileId)
                        .stream().collect(Collectors.toMap(DocumentBlock::getId, Function.identity())));
                var block = documentAnchors.get(requirement.getBlockId());
                if (block == null || block.getSourceAnchor() == null || block.getSourceAnchor().isBlank()) {
                    throw new BusinessException(409, "条款缺少原文定位：" + row.path("clause").asText(id));
                }
                sourceAnchor = block.getSourceAnchor();
            }
            if (pinSources && row instanceof ObjectNode frozen) {
                validateFinalAnswer(response);
                frozen.put("sourceAnchor", sourceAnchor);
                frozen.put("sourceRequirementVersion", requirement.getVersion());
                frozen.put("section", requirement.getSectionPath());
                if (response.hasNonNull("matchReference")) {
                    frozen.set("matchReference", response.get("matchReference"));
                } else {
                    frozen.remove("matchReference");
                }
            }
            notes.computeIfAbsent(source.getId(), ignored -> new ArrayList<>())
                    .add(primary == null
                            ? new Note(sourceAnchor, requirement.getOriginalText(), answerText(row))
                            : new Note(primary.anchor(), primary.quote(), answerText(row), true));
        }

        return notes;
    }

    private static void validateFinalAnswer(JsonNode response) {
        String conclusion = response.path("conclusion").asText();
        if ("Comply".equals(conclusion)) {
            return;
        }
        if (!Set.of("有条件 Comply", "不满足", "不适用").contains(conclusion) || ResponseService.answerDraft(response).isBlank()
                || "有条件 Comply".equals(conclusion) && response.path("evidence").asText().isBlank()) {
            throw new BusinessException(409, "定稿需要完整答复，有条件应答还须提供依据");
        }
    }

    JsonNode latestSnapshot(String projectId) {
        var snapshots = payloads(responseRecords.listSnapshots(projectId));
        Set<String> superseded = snapshots.stream().map(row -> row.path("revisionOf").asText(""))
                .collect(Collectors.toSet());
        return snapshots.stream().filter(row -> !superseded.contains(row.path("id").asText()))
                .sorted(Comparator.comparing(ApprovedDocumentExportService::createdAt).reversed()).findFirst().orElse(null);
    }

    private static Instant createdAt(JsonNode snapshot) {
        try { return Instant.parse(snapshot.path("createdAt").asText()); }
        catch (java.time.format.DateTimeParseException e) {
            log.error("解析导出记录的创建时间失败 errorType={}", e.getClass().getSimpleName());
            return Instant.EPOCH;
        }
    }

    static boolean approved(JsonNode snapshot) {
        if (!"已批准".equals(snapshot.path("status").asText()) || snapshot.path("stale").asBoolean()
                || snapshot.path("approvalFingerprint").asText().isBlank()) {
            return false;
        }
        var review = snapshot.path("finalReview");
        var reviewers = review.path("reviewers");
        var decisions = review.path("decisions");
        String sr = reviewers.path("srId").asText();
        if (!"sr-and-technical".equals(review.path("policy").asText()) || !vote(decisions.path("sr"), sr)) {
            return false;
        }
        Set<String> technical = new HashSet<>();
        for (var reviewer : reviewers.path("technicalIds")) {
            String id = reviewer.asText();
            if (id.isBlank() || id.equals(sr) || !technical.add(id)) {
                return false;
            }
        }
        var technicalVotes = decisions.path("technicalByActorId");
        return switch (review.path("technicalMode").asText()) {
            case "all" -> !technical.isEmpty() && technical.stream().allMatch(id -> vote(technicalVotes.path(id), id));
            case "representative" -> {
                String id = reviewers.path("technicalRepresentativeId").asText();
                yield technical.contains(id) && vote(technicalVotes.path(id), id);
            }
            default -> false;
        };
    }

    private static boolean vote(JsonNode vote, String reviewer) {
        return !reviewer.isBlank() && reviewer.equals(vote.path("actorId").asText())
                && "approved".equals(vote.path("result").asText());
    }

    void validateReviewers(Project project, JsonNode reviewers) {
        validateReviewer(project, reviewers.path("srId").asText(), Set.of("SR"));
        for (var reviewer : reviewers.path("technicalIds")) {
            validateReviewer(project, reviewer.asText(), Set.of("TECH", "APPROVER"));
        }
    }

    private void validateReviewer(Project project, String id, Set<String> expectedRoles) {
        var account = users.findById(id).filter(AppUser::isActive).orElseThrow(ApprovedDocumentExportService::changed);
        var profile = profiles.findByBuIdAndUserId(project.getBuId(), id);
        var grants = roles.findByUserIdAndStatus(id, "ACTIVE").stream()
                .filter(grant -> project.getBuId().equals(grant.getBuId()) && expectedRoles.contains(grant.getRole()))
                .map(grant -> new CurrentUser.RoleGrant(grant.getBuId(), grant.getRole())).toList();
        if (account.isSystemAdmin() || profile == null || !profile.isEnabled()
                || !profile.isCanConfirm() || !profile.isCanFinalReview() || grants.isEmpty()) {
            throw changed();
        }
        try { access.requireProject(new CurrentUser(id, account.getDisplayName(), false, grants), project); }
        catch (BusinessException e) {
            log.error("验证审批导出复核权限失败", e);
            throw changed();
        }
    }

    private void validateScope(String projectId, JsonNode scope, Map<String, CustomerDocument> sourceFiles) {
        var versions = new ArrayList<String>();
        for (var version : scope.path("sourceVersions")) versions.add(version.asText());
        if (versions.size() != sourceFiles.size() || !new HashSet<>(versions).equals(sourceFiles.values().stream()
                .map(file -> file.getId() + ":" + version(file)).collect(Collectors.toSet()))) {
            throw changed();
        }
        if (sourceFiles.values().stream().anyMatch(file -> Set.of("PARSING", "FAILED").contains(file.getStatus()))) {
            throw changed();
        }
        var config = payloads(responseRecords.findConfig(projectId));
        var frozen = scope.path("configuration");
        if (config.size() != 1 || !config.get(0).path("approvalConfig").equals(frozen.path("approvalConfig"))
                || !config.get(0).path("equipment").asText("").equals(frozen.path("equipment").asText(""))) {
            throw changed();
        }
        if (config.get(0).has("technicalReviewSettings")
                && !config.get(0).path("technicalReviewSettings").equals(frozen.path("personnel").path("settings"))) {
            throw changed();
        }
    }

    private static boolean sameAnswer(JsonNode row, Requirement requirement, JsonNode response) {
        if (!row.path("original").asText().equals(requirement.getOriginalText())
                || !row.path("clause").asText("").equals(Objects.toString(requirement.getCustomerClauseNo(), ""))
                || !row.path("title").asText("").equals(Objects.toString(requirement.getTitle(), ""))
                || row.path("version").asLong(-1) != response.path("version").asLong(-2)
                || response.hasNonNull("pendingReviewProposal")) {
            return false;
        }
        String assignee = Objects.toString(requirement.getConfirmationAssigneeId(), response.path("confirmationAssigneeId").asText(""));
        if (!assignee.equals(row.path("confirmationAssigneeId").asText(""))) {
            return false;
        }
        return ResponseService.answerDraft(row).equals(ResponseService.answerDraft(response))
                && ResponseService.answerRemark(row).equals(ResponseService.answerRemark(response))
                && List.of("conclusion", "evidence", "status", "confirmedAt", "confirmedBy")
                        .stream().allMatch(field -> fieldValue(row.path(field)).equals(fieldValue(response.path(field))));
    }

    private static String fieldValue(JsonNode field) {
        return field.isValueNode() || field.isMissingNode() ? field.asText("") : field.toString();
    }

    private static String version(CustomerDocument file) { return "V" + file.getVersion() + ".0"; }

    private static String answerText(JsonNode row) {
        String clause = row.path("clause").asText("");
        String draft = ResponseService.answerDraft(row);
        return (clause.isBlank() ? "" : "条款 " + clause + "\n") + "结论：" + row.path("conclusion").asText()
                + (draft.isBlank() ? "" : "\n答复：" + draft);
    }

    private ExportFile exportDocument(CurrentUser user, String sourceId, List<Note> notes, boolean wordInBody) throws IOException {
        var original = originalFiles.download(user, sourceId);
        String name = safeName(original.name());
        byte[] bytes;
        if (name.toLowerCase(Locale.ROOT).endsWith(".docx")) {
            bytes = wordInBody ? AnnotatedOriginal.wordWithAnswers(original.content(), notes)
                    : AnnotatedOriginal.word(original.content(), notes);
        } else if (name.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
            bytes = AnnotatedOriginal.pdf(original.content(), notes);
        } else {
            throw new BusinessException(409, "原件格式不支持正式导出：" + name);
        }
        return new ExportFile(insertSuffix(name, "-正式应答"), original.contentType(), bytes);
    }

    private List<JsonNode> payloads(List<String> payloads) {
        return payloads.stream().map(payload -> {
            try { return json.readTree(payload); }
            catch (IOException e) {
                log.error("解析导出的业务记录失败 errorType={}", e.getClass().getSimpleName());
                throw new IllegalStateException("数据库业务记录格式异常", e);
            }
        }).toList();
    }

    private static String safeName(String name) { return name.replaceAll("[/\\\\\\p{Cntrl}]", "_"); }

    private static String insertSuffix(String name, String suffix) {
        int extension = name.lastIndexOf('.');
        return name.substring(0, extension) + suffix + name.substring(extension);
    }

    private static BusinessException changed() {
        return new BusinessException(409, "原件、条款或评审范围已变化，请刷新并核对当前版本");
    }
}
