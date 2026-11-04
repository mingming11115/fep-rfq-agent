package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.api.PageView;
import com.naura.rfq.model.dto.CreateProjectRequest;
import com.naura.rfq.model.vo.ProjectView;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.ProjectService;
import jakarta.validation.Valid;
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
    private final ProjectService service;

    @GetMapping
    public ApiResponse<PageView<ProjectView>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "false") boolean archived,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String stage) {
        return ApiResponse.success(service.list(CurrentUserHolder.require(), page, size, sort, archived, keyword, stage));
    }

    @GetMapping("/{id}")
    public ApiResponse<ProjectView> detail(@PathVariable String id) {
        return ApiResponse.success(service.detail(CurrentUserHolder.require(), id));
    }

    @PostMapping
    public ApiResponse<ProjectView> create(@Valid @RequestBody CreateProjectRequest request) {
        return ApiResponse.success(service.create(CurrentUserHolder.require(), request));
    }
}
