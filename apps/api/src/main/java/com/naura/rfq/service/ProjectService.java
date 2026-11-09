package com.naura.rfq.service;

import com.naura.rfq.common.api.PageView;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.mapper.ProjectMapper;
import com.naura.rfq.model.dto.CreateProjectRequest;
import com.naura.rfq.model.entity.Project;
import com.naura.rfq.model.query.PageQuery;
import com.naura.rfq.model.query.ProjectFilter;
import com.naura.rfq.model.vo.ProjectView;
import com.naura.rfq.security.AccessGuard;
import com.naura.rfq.security.CurrentUser;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectMapper projects;
    private final AccessGuard access;
    private final AuditService audit;
    private final ProjectAccessService projectAccess;
    private final ConfirmationAssignmentService confirmationAssignments;
    private final KnowledgeGroupService groups;

    public PageView<ProjectView> list(CurrentUser user,
            int page,
            int size,
            String sort,
            boolean archived,
            String keyword,
            String stage) {
        PageQuery query = PageQuery.of(page, size, sort, List.of("createdAt"), "createdAt,desc");
        ProjectFilter filters=new ProjectFilter(archived,keyword,stage);
        List<Project> data = projects.findAccessiblePage(user.id(), query,filters);
        long total = projects.countAccessible(user.id(),filters);
        return PageView.of(data.stream().map(ProjectView::of).toList(),
                total, query.getPage(), query.getSize());
    }

    public ProjectView detail(CurrentUser user, String id) {
        Project project = projects.findById(id).orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);
        return ProjectView.of(project);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ProjectView create(CurrentUser user, CreateProjectRequest request) {
        String buId = access.defaultBu(user, request.buId());
        access.requireSourceManager(user, buId);
        if (projects.findAll().stream().anyMatch(project -> project.getCode().equalsIgnoreCase(request.code()))) {
            throw new BusinessException(400, "项目编号已存在：" + request.code());
        }
        Project project = new Project();
        project.setId(Ids.next("RFQ"));
        project.setCode(request.code());
        project.setName(request.name());
        project.setCustomer(request.customer());
        project.setDeadline(ProjectMaintenanceService.parseDeadline(request.deadline()));
        project.setBuId(buId);
        project.setOwnerId(request.ownerId() == null || request.ownerId().isBlank() ? user.id() : request.ownerId());
        projectAccess.requireOwner(project.getOwnerId(),buId);
        var binding = groups.bindProject(buId, request.groupId());
        project.setGroupId(request.groupId());
        project.setGroupPath(binding.path());
        project.setGroupCatalogVersion(binding.catalogVersion());
        project.setGroupValues(binding.values().toString());
        project.setStage("DRAFT");
        project.setCreatedBy(user.id());
        projects.insert(project);
        projectAccess.addOwner(project,user.id());
        if(!user.id().equals(project.getOwnerId())&&confirmationAssignments.qualified(buId,user.id())){
            projectAccess.addCreator(project);
        }
        audit.successInBu(user.id(), buId, "创建项目", "project", project.getId(), project.getName());
        return ProjectView.of(project);
    }
}
