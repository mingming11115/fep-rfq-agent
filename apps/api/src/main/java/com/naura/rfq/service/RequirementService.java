package com.naura.rfq.service;

import com.naura.rfq.common.api.PageView;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.RequirementMapper;
import com.naura.rfq.model.dto.PatchRequirementRequest;
import com.naura.rfq.model.entity.CustomerDocument;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.model.query.PageQuery;
import com.naura.rfq.model.vo.RequirementView;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RequirementService {

    @Autowired
    private RequirementMapper requirements;
    @Autowired
    private ProjectMapper projects;
    @Autowired
    private com.naura.rfq.mapper.CustomerDocumentMapper documents;
    @Autowired
    private AccessGuard access;
    @Autowired
    private AuditService audit;
    @Autowired
    private RequirementMatchService matches;
    @Autowired
    private ProjectWorkScope work;

    private record EditableRequirement(Project project, CustomerDocument document, Requirement row) {}

    public PageView<RequirementView> list(CurrentUser user, String projectId,
            int page,
            int size,
            String sort) {
        Project project = projects.findById(projectId).orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        String sortField = sort != null && sort.trim().matches("sortOrder(?:\\s*,.*)?")
                ? sort.trim().replaceFirst("sortOrder", "sourceOrder") : sort;
        PageQuery query = PageQuery.of(page, size, sortField,
                List.of("sourceOrder", "createdAt"), "sourceOrder,asc");
        List<Requirement> data = requirements.findPage(projectId, query);
        long total = requirements.countByProjectId(projectId);
        return PageView.of(data.stream().map(RequirementView::of).toList(),
                total, query.getPage(), query.getSize());
    }

    @Transactional
    public RequirementView patch(CurrentUser user, String id,
            PatchRequirementRequest request) {
        var scope = lockEditable(user, id, request.version());
        var requirement = scope.row();
        if (request.customerClauseNo() != null) {
            requirement.setCustomerClauseNo(request.customerClauseNo());
        }
        if (request.title() != null) {
            requirement.setTitle(request.title());
        }
        if (request.requirementText() != null) {
            requirement.setRequirementText(request.requirementText());
        }
        if (request.reviewReasons() != null) {
            requirement.setReviewReasons(request.reviewReasons());
        }
        // 人工编辑后条款一律按有效处理；历史数据中残留的复核状态在此一并归正。
        requirement.setExtractionStatus("VALID");
        // where 里带旧 version，影响行数为 0 说明在读和写之间被人抢先改过。
        if (requirements.updateWithVersion(requirement) == 0) {
            throw new BusinessException(409, "条款已被他人修改，请刷新后重试");
        }
        requirement.setVersion(requirement.getVersion() + 1);
        matches.corrected(scope.project(), scope.document(), requirement);
        audit.successInBu(user.id(), scope.project().getBuId(), "修正抽取条款", "requirement", id, request.reviewReasons());
        return RequirementView.of(requirement);
    }

    @Transactional
    public void delete(CurrentUser user, String id, long version) {
        var scope = lockEditable(user, id, version);
        var requirement = scope.row();
        requirement.setExtractionStatus("EXCLUDED");
        if (requirements.updateWithVersion(requirement) == 0) {
            throw new BusinessException(409, "条款已被他人修改，请刷新后重试");
        }
        matches.corrected(scope.project(), scope.document(), requirement);
        audit.successInBu(user.id(), scope.project().getBuId(), "删除误提取条款", "requirement", id,
                requirement.getCustomerClauseNo());
    }

    private EditableRequirement lockEditable(CurrentUser user, String id, Long version) {
        var requirement = requirements.findById(id)
                .orElseThrow(() -> new BusinessException(404, "条款不存在"));
        var project = projects.findByIdForUpdate(requirement.getProjectId())
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        access.requireSourceManager(user, project.getBuId());
        access.requireActiveProject(project);
        work.requireEditable(project.getId(), requirement.getDocumentId());

        // Use the same document lock as re-parsing so a human correction cannot be lost mid-run.
        var document = documents.findByIdForUpdate(requirement.getDocumentId())
                .orElseThrow(() -> new BusinessException(404, "文档不存在"));
        requirement = requirements.findByIdForUpdate(id)
                .orElseThrow(() -> new BusinessException(409, "条款已变更，请刷新后重试"));
        if (version != null && !version.equals(requirement.getVersion())) {
            throw new BusinessException(409, "条款已被他人修改，请刷新后重试");
        }
        return new EditableRequirement(project, document, requirement);
    }
}
