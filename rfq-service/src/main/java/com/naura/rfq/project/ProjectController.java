package com.naura.rfq.project;

import com.naura.rfq.auth.AccessGuard;
import com.naura.rfq.auth.CurrentUser;
import com.naura.rfq.auth.CurrentUserHolder;
import com.naura.rfq.audit.AuditService;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.api.PageQuery;
import com.naura.rfq.common.api.PageView;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.common.id.Ids;
import com.naura.rfq.domain.Project;
import com.naura.rfq.mapper.ProjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rfq/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectMapper projects;
    private final AccessGuard access;
    private final AuditService audit;

    public record ProjectView(String id, String code, String name, String customer, String buId,
            String ownerId, String stage, Long version, Instant createdAt) {

        public static ProjectView of(Project project) {
            return new ProjectView(project.getId(), project.getCode(), project.getName(),
                    project.getCustomer(), project.getBuId(), project.getOwnerId(),
                    project.getStage(), project.getVersion(), project.getCreatedAt());
        }
    }

    public record CreateProjectRequest(
            @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{2,32}", message = "项目编号仅支持字母、数字、下划线和短横线") String code,
            @NotBlank String name,
            String customer,
            String ownerId,
            String buId) {
    }

    @GetMapping
    public ApiResponse<PageView<ProjectView>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        CurrentUser user = CurrentUserHolder.require();
        PageQuery query = PageQuery.of(page, size, sort, List.of("createdAt"), "createdAt,desc");
        // null = 不做事业部过滤（系统管理员）；空集合必须立刻返回空页，否则 in 条件被略过会越权。
        Collection<String> scope = user.systemAdmin() ? null : user.buIds();
        if (scope != null && scope.isEmpty()) {
            return ApiResponse.success(PageView.of(List.of(), 0, query.getPage(), query.getSize()));
        }
        List<Project> data = projects.findPage(scope, query);
        long total = projects.countPage(scope);
        return ApiResponse.success(PageView.of(data.stream().map(ProjectView::of).toList(),
                total, query.getPage(), query.getSize()));
    }

    @GetMapping("/{id}")
    public ApiResponse<ProjectView> detail(@PathVariable String id) {
        Project project = projects.findById(id).orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(CurrentUserHolder.require(), project);
        return ApiResponse.success(ProjectView.of(project));
    }

    @PostMapping
    public ApiResponse<ProjectView> create(@Valid @RequestBody CreateProjectRequest request) {
        CurrentUser user = CurrentUserHolder.require();
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
        project.setBuId(buId);
        project.setOwnerId(request.ownerId() == null || request.ownerId().isBlank() ? user.id() : request.ownerId());
        project.setStage("DRAFT");
        project.setCreatedBy(user.id());
        projects.insert(project);
        audit.success(user.id(), "创建项目", "project", project.getId(), project.getName());
        return ApiResponse.success(ProjectView.of(project));
    }
}
