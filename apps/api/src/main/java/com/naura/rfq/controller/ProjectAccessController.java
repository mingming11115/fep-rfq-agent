package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.api.PageView;
import com.naura.rfq.model.query.PageQuery;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.ProjectAccessService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rfq/projects")
@RequiredArgsConstructor
public class ProjectAccessController {
    private final ProjectAccessService service;
    public record MemberRequest(@NotNull @PositiveOrZero Long version,@NotNull Boolean enabled,@NotBlank @Size(max=500) String reason) {}
    @GetMapping("/{id}/access")
    public ApiResponse<ProjectAccessService.AccessView> describe(@PathVariable String id) {
        return ApiResponse.success(service.describe(CurrentUserHolder.require(),id));
    }
    @GetMapping("/{id}/members")
    public ApiResponse<PageView<ProjectAccessService.MemberView>> members(@PathVariable String id,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String sort) {
        return ApiResponse.success(service.list(CurrentUserHolder.require(),id,PageQuery.of(page,size,sort,List.of("createdAt","updatedAt"),"createdAt,asc")));
    }
    @PatchMapping("/{id}/members/{userId}")
    public ApiResponse<ProjectAccessService.AccessView> update(@PathVariable String id,@PathVariable String userId,@Valid @RequestBody MemberRequest request) {
        return ApiResponse.success(service.update(CurrentUserHolder.require(),id,userId,request.enabled(),request.version(),request.reason()));
    }
}
