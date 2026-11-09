package com.naura.rfq.service;

import com.naura.rfq.common.api.PageView;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.RequirementMapper;
import com.naura.rfq.model.dto.PatchRequirementRequest;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.model.query.PageQuery;
import com.naura.rfq.model.vo.RequirementView;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class RequirementService {

    private final RequirementMapper requirements;
    private final ProjectMapper projects;
    private final com.naura.rfq.mapper.CustomerDocumentMapper documents;
    private final AccessGuard access;
    private final AuditService audit;
    private final RequirementMatchService matches;
    private final ProjectWorkScope work;

    public PageView<RequirementView> list(CurrentUser user, String projectId,
            int page,
            int size,
            String sort) {
        Project project = projects.findById(projectId).orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        PageQuery query = PageQuery.of(page, size, sort,
                List.of("sortOrder", "createdAt"), "sortOrder,asc");
        List<Requirement> data = requirements.findPage(projectId, query);
        long total = requirements.countByProjectId(projectId);
        return PageView.of(data.stream().map(RequirementView::of).toList(),
                total, query.getPage(), query.getSize());
    }

    @Transactional
    public RequirementView patch(CurrentUser user, String id,
            PatchRequirementRequest request) {
        Requirement requirement = requirements.findById(id)
                .orElseThrow(() -> new BusinessException(404, "条款不存在"));
        Project project = projects.findByIdForUpdate(requirement.getProjectId())
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        access.requireSourceManager(user, project.getBuId());
        access.requireActiveProject(project);
        work.requireEditable(project.getId(), requirement.getDocumentId());

        // Use the same document lock as re-parsing so a human edit cannot be lost mid-run.
        var document = documents.findByIdForUpdate(requirement.getDocumentId())
            .orElseThrow(() -> new BusinessException(404, "文档不存在"));
        requirement = requirements.findByIdForUpdate(id)
                .orElseThrow(() -> new BusinessException(409, "条款已重新解析，请刷新后重试"));
        if (request.version() != null && !request.version().equals(requirement.getVersion())) {
            throw new BusinessException(409, "条款已被他人修改，请刷新后重试");
        }
        if (request.customerClauseNo() != null) {
            requirement.setCustomerClauseNo(request.customerClauseNo());
        }
        if (request.title() != null) {
            requirement.setTitle(request.title());
        }
        if (request.level() != null) {
            requirement.setLevel(Math.max(1, request.level()));
        }
        if (request.requirementText() != null) {
            requirement.setRequirementText(request.requirementText());
        }
        if (request.reviewReasons() != null) {
            requirement.setReviewReasons(request.reviewReasons());
        }
        // A human edit resolves the extraction flag; downstream answer confirmation is separate.
        requirement.setExtractionStatus("VALID");
        // where 里带旧 version，影响行数为 0 说明在读和写之间被人抢先改过。
        if (requirements.updateWithVersion(requirement) == 0) {
            throw new BusinessException(409, "条款已被他人修改，请刷新后重试");
        }
        requirement.setVersion(requirement.getVersion() + 1);
        matches.corrected(project, document, requirement);
        audit.successInBu(user.id(), project.getBuId(), "修正抽取条款", "requirement", id, request.reviewReasons());
        return RequirementView.of(requirement);
    }
}
