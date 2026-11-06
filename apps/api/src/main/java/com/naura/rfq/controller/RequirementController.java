package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.api.PageView;
import com.naura.rfq.model.dto.PatchRequirementRequest;
import com.naura.rfq.model.vo.RequirementView;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.RequirementService;
import lombok.RequiredArgsConstructor;
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
    private final RequirementService service;
    private final com.naura.rfq.service.ConfirmationAssignmentService assignments;

    @GetMapping("/requirements/{id}/confirmation-candidates")
    public ApiResponse<java.util.List<com.naura.rfq.service.ConfirmationAssignmentService.Candidate>> candidates(@PathVariable String id) {
        return ApiResponse.success(assignments.candidates(CurrentUserHolder.require(),id));
    }

    @PatchMapping("/requirements/{id}/confirmation-assignment")
    public ApiResponse<RequirementView> assign(@PathVariable String id,
            @jakarta.validation.Valid @RequestBody com.naura.rfq.model.dto.AssignConfirmationRequest request) {
        return ApiResponse.success(assignments.assign(CurrentUserHolder.require(),id,request));
    }

    @GetMapping("/projects/{projectId}/requirements")
    public ApiResponse<PageView<RequirementView>> list(@PathVariable String projectId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        return ApiResponse.success(service.list(CurrentUserHolder.require(), projectId, page, size, sort));
    }

    @PatchMapping("/requirements/{id}")
    public ApiResponse<RequirementView> patch(@PathVariable String id,
            @RequestBody PatchRequirementRequest request) {
        return ApiResponse.success(service.patch(CurrentUserHolder.require(), id, request));
    }
}
