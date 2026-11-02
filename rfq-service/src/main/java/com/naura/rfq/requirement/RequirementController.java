package com.naura.rfq.requirement;

import com.naura.rfq.auth.AccessGuard;
import com.naura.rfq.auth.CurrentUser;
import com.naura.rfq.auth.CurrentUserHolder;
import com.naura.rfq.audit.AuditService;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.api.PageQuery;
import com.naura.rfq.common.api.PageView;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.domain.Project;
import com.naura.rfq.domain.Requirement;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.mapper.RequirementMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rfq")
@RequiredArgsConstructor
public class RequirementController {

    private final RequirementMapper requirements;
    private final ProjectMapper projects;
    private final AccessGuard access;
    private final AuditService audit;

    public record RequirementView(String id, String projectId, String documentId, String customerClauseNo,
            String sectionPath, String title, int level, String parentId, String originalText,
            String requirementText, String metricsJson, String conditionsText, String obligation,
            String extractionStatus, String reviewReasons, int sortOrder, Long version) {

        public static RequirementView of(Requirement requirement) {
            return new RequirementView(requirement.getId(), requirement.getProjectId(),
                    requirement.getDocumentId(), requirement.getCustomerClauseNo(),
                    requirement.getSectionPath(), requirement.getTitle(), requirement.getLevel(),
                    requirement.getParentId(), requirement.getOriginalText(),
                    requirement.getRequirementText(), requirement.getMetricsJson(),
                    requirement.getConditionsText(), requirement.getObligation(),
                    requirement.getExtractionStatus(), requirement.getReviewReasons(),
                    requirement.getSortOrder(), requirement.getVersion());
        }
    }

    public record PatchRequirementRequest(Long version, String customerClauseNo, String title,
            Integer level, String requirementText, String reviewReasons) {
    }

    @GetMapping("/projects/{projectId}/requirements")
    public ApiResponse<PageView<RequirementView>> list(@PathVariable String projectId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        Project project = projects.findById(projectId).orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(CurrentUserHolder.require(), project);
        PageQuery query = PageQuery.of(page, size, sort,
                List.of("sortOrder", "createdAt"), "sortOrder,asc");
        List<Requirement> data = requirements.findPage(projectId, query);
        long total = requirements.countByProjectId(projectId);
        return ApiResponse.success(PageView.of(data.stream().map(RequirementView::of).toList(),
                total, query.getPage(), query.getSize()));
    }

    @PatchMapping("/requirements/{id}")
    @Transactional
    public ApiResponse<RequirementView> patch(@PathVariable String id,
            @RequestBody PatchRequirementRequest request) {
        CurrentUser user = CurrentUserHolder.require();
        Requirement requirement = requirements.findById(id)
                .orElseThrow(() -> new BusinessException(404, "条款不存在"));
        Project project = projects.findById(requirement.getProjectId())
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        access.requireSourceManager(user, project.getBuId());

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
        audit.success(user.id(), "修正抽取条款", "requirement", id, request.reviewReasons());
        return ApiResponse.success(RequirementView.of(requirement));
    }
}
