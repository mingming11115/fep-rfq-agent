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
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rfq/projects")
@RequiredArgsConstructor
@Slf4j
public class ProjectAccessController {
    private final ProjectAccessService service;
    public record MemberRequest(@NotNull @PositiveOrZero Long version,@NotNull Boolean enabled,@NotBlank @Size(max=500) String reason) {}
    @GetMapping("/{id}/access")
    public ApiResponse<ProjectAccessService.AccessView> describe(@PathVariable String id) {
        try {
            return ApiResponse.success(service.describe(CurrentUserHolder.require(),id));
        } catch (Exception exception) {
            log.error("Request failed in describe", exception);
            throw exception;
        }
    }
    @GetMapping("/{id}/members")
    public ApiResponse<PageView<ProjectAccessService.MemberView>> members(@PathVariable String id,
            @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String sort) {
        try {
            return ApiResponse.success(service.list(CurrentUserHolder.require(),id,PageQuery.of(page,size,sort,List.of("createdAt","updatedAt"),"createdAt,asc")));
        } catch (Exception exception) {
            log.error("Request failed in members", exception);
            throw exception;
        }
    }
    @PatchMapping("/{id}/members/{userId}")
    public ApiResponse<ProjectAccessService.AccessView> update(@PathVariable String id,@PathVariable String userId,@Valid @RequestBody MemberRequest request) {
        try {
            return ApiResponse.success(service.update(CurrentUserHolder.require(),id,userId,request.enabled(),request.version(),request.reason()));
        } catch (Exception exception) {
            log.error("Request failed in update", exception);
            throw exception;
        }
    }
}
