package com.naura.rfq.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.CustomerDocumentMapper;
import com.naura.rfq.mapper.RequirementMapper;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.model.entity.CustomerDocument;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.io.IOException;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class DocumentReplacementService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final ProjectMapper projects;
    private final CustomerDocumentMapper documents;
    private final RequirementMapper requirements;
    private final DocumentService originals;
    private final AccessGuard access;
    private final ProjectWorkScope work;
    private final RequirementMatchService matches;
    private final AuditService audit;
    private final MatchDeviationService deviations;

    public record Activation(String fingerprint, String reason) {}

    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = IOException.class)
    public ObjectNode upload(CurrentUser user, String projectId, String oldId, MultipartFile file,
            List<String> historyDocumentIds) throws IOException {
        var project = locked(user, projectId);
        var source = document(project, oldId);
        if (work.inactiveDocuments(projectId).contains(oldId)) {
            throw new BusinessException(409, "请选择当前生效的原件");
        }
        if (work.replacements(projectId).stream().anyMatch(row -> row.oldDocumentId().equals(oldId) && "pending".equals(row.status()))) {
            throw new BusinessException(409, "该原件已有待核对的新版");
        }
        var replacement = originals.upload(user, projectId, file, historyDocumentIds);
        jdbc.update("""
                insert into rfq_document_replacement(project_id,old_document_id,new_document_id,status,created_by)
                values (?,?,?,'pending',?)
                """, projectId, source.getId(), replacement.id(), user.id());
        return json.createObjectNode().put("oldDocumentId", oldId).put("newDocumentId", replacement.id());
    }

    @Transactional(readOnly = true)
    public ObjectNode preview(CurrentUser user, String projectId, String newId) {
        var project = projects.findById(projectId).orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        return impact(project, replacement(projectId, newId));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ObjectNode activate(CurrentUser user, String projectId, String newId, Activation input) {
        var project = locked(user, projectId);
        var replacement = replacement(projectId, newId);
        var impact = impact(project, replacement);
        String reason = input.reason() == null ? "" : input.reason().trim();
        if (reason.isBlank() || reason.length() > 900) {
            throw new BusinessException(400, "请填写来源完整性和影响范围核对说明");
        }
        if (!impact.path("canActivate").asBoolean() || !impact.path("fingerprint").asText().equals(input.fingerprint())) {
            throw new BusinessException(409, "解析或影响范围已变化，请重新核对");
        }
        long version = work.advance(projectId);
        jdbc.update("""
                update rfq_document_replacement set status='active',work_version=?,activated_by=?,activated_at=utc_timestamp(6),reason=?
                where project_id=? and new_document_id=? and status='pending'
                """, version, user.id(), reason, projectId, newId);
        String oldId = replacement.oldDocumentId();
        jdbc.update("""
                update requirement_match_run set current_run=null,status='superseded',next_attempt_at=null,lease_token=null,lease_until=null
                where document_id=? and project_id=? and current_run=1
                """, oldId, projectId);
        var oldRows = requirements.findByDocumentIdForUpdate(oldId);
        for (var row : oldRows) {
            jdbc.update("""
                    update response_review set payload=json_set(payload,'$.status','已取消','$.supersededByWorkVersion',?)
                    where project_id=? and json_unquote(json_extract(payload,'$.requirementId'))=?
                    and json_unquote(json_extract(payload,'$.status')) not in ('已关闭','已取消')
                    """, version, projectId, row.getId());
        }
        deviations.carryForward(project, version);
        for (var row : requirements.findByDocumentIdForUpdate(newId)) {
            jdbc.update("""
                    update requirement_response set payload=json_set(
                      json_remove(payload,'$.confirmedAt','$.confirmedBy','$.confirmedById'),
                      '$.status','待确认','$.version',cast(json_unquote(json_extract(payload,'$.version')) as unsigned)+1,
                      '$.confirmationReason',?,'$.sourceRevision',cast('true' as json)) where project_id=? and requirement_id=?
                    """, "新版原件已生效，须重新确认", projectId, row.getId());
        }
        for (var file : documents.findByProjectIdOrderByCreatedAtDesc(projectId)) {
            if (work.retired(projectId, file.getId())) {
                continue;
            }
            for (var row : requirements.findByDocumentIdForUpdate(file.getId())) matches.corrected(project, file, row);
        }
        audit.successInBu(user.id(), project.getBuId(), "生效 RFQ 新版原件", "document", newId, reason);
        return impact.put("status", "active").put("workVersion", version).put("canActivate", false);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void cancel(CurrentUser user, String projectId, String newId, String reason) {
        var project = locked(user, projectId);
        if (reason == null || reason.isBlank() || reason.length() > 900) {
            throw new BusinessException(400, "请填写取消原因");
        }
        if (jdbc.update("""
                update rfq_document_replacement set status='cancelled',reason=?
                where project_id=? and new_document_id=? and status='pending'
                """, reason.trim(), projectId, newId) != 1) {
            throw new BusinessException(409, "没有待核对的新版");
        }
        jdbc.update("""
                update requirement_match_run set current_run=null,status='superseded',next_attempt_at=null,lease_token=null,lease_until=null
                where document_id=? and project_id=? and current_run=1
                """, newId, projectId);
        audit.successInBu(user.id(), project.getBuId(), "取消 RFQ 新版", "document", newId, reason.trim());
    }

    private ObjectNode impact(Project project, ProjectWorkScope.Replacement replacement) {
        var old = document(project, replacement.oldDocumentId());
        var next = document(project, replacement.newDocumentId());
        var rows = requirements.findByProjectIdOrderBySortOrder(project.getId());
        var before = rows.stream().filter(row -> old.getId().equals(row.getDocumentId())).toList();
        var after = rows.stream().filter(row -> next.getId().equals(row.getDocumentId())).toList();
        var result = json.createObjectNode().put("oldDocumentId", old.getId()).put("oldName", old.getName())
                .put("oldVersion", old.getVersion()).put("newDocumentId", next.getId()).put("newName", next.getName())
                .put("newVersion", next.getVersion()).put("parseStatus", next.getStatus()).put("status", replacement.status())
                .put("workVersion", work.version(project.getId()));
        result.set("before", json.valueToTree(impactRows(before)));
        result.set("after", json.valueToTree(impactRows(after)));
        result.put("canActivate", "pending".equals(replacement.status()) && Set.of("PARSED", "PARTIAL").contains(next.getStatus()) && !after.isEmpty()
                && after.stream().allMatch(row -> "VALID".equals(row.getExtractionStatus())));
        return result.put("fingerprint", MatchEvaluator.digest(result.toString()));
    }

    private ObjectNode[] impactRows(List<Requirement> rows) {
        return rows.stream().map(row -> json.createObjectNode().put("id", row.getId()).put("version", row.getVersion())
                .put("clause", row.getCustomerClauseNo()).put("title", row.getTitle()).put("original", row.getOriginalText())
                .put("status", row.getExtractionStatus())).toArray(ObjectNode[]::new);
    }

    private ProjectWorkScope.Replacement replacement(String project, String newId) {
        return work.replacements(project).stream().filter(row -> newId.equals(row.newDocumentId())).findFirst()
                .orElseThrow(() -> new BusinessException(404, "没有这个新版原件"));
    }

    private Project locked(CurrentUser user, String id) {
        var project = projects.findByIdForUpdate(id).orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProjectManager(user, project);
        access.requireActiveProject(project);
        return project;
    }

    private CustomerDocument document(Project project, String id) {
        return documents.findById(id).filter(row -> project.getId().equals(row.getProjectId()))
                .orElseThrow(() -> new BusinessException(404, "项目原件不存在"));
    }
}
