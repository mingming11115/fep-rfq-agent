package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.api.PageView;
import com.naura.rfq.model.dto.PatchRequirementRequest;
import com.naura.rfq.model.vo.RequirementView;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.RequirementService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import com.naura.rfq.service.SelectionExtractionService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rfq")
@Slf4j
public class RequirementController {
    @Autowired
    private RequirementService service;
    @Autowired
    private SelectionExtractionService selections;
    @Autowired
    private com.naura.rfq.service.ConfirmationAssignmentService assignments;

    @GetMapping("/requirements/{id}/confirmation-candidates")
    public ApiResponse<java.util.List<com.naura.rfq.service.ConfirmationAssignmentService.Candidate>> candidates(@PathVariable String id) {
        try {
            return ApiResponse.success(assignments.candidates(CurrentUserHolder.require(),id));
        } catch (Exception exception) {
            log.error("Request failed in candidates", exception);
            throw exception;
        }
    }

    @PatchMapping("/requirements/{id}/confirmation-assignment")
    public ApiResponse<RequirementView> assign(@PathVariable String id,
            @jakarta.validation.Valid @RequestBody com.naura.rfq.model.dto.AssignConfirmationRequest request) {
        try {
            return ApiResponse.success(assignments.assign(CurrentUserHolder.require(),id,request));
        } catch (Exception exception) {
            log.error("Request failed in assign", exception);
            throw exception;
        }
    }

    @GetMapping("/projects/{projectId}/requirements")
    public ApiResponse<PageView<RequirementView>> list(@PathVariable String projectId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        try {
            return ApiResponse.success(service.list(CurrentUserHolder.require(), projectId, page, size, sort));
        } catch (Exception exception) {
            log.error("Request failed in list", exception);
            throw exception;
        }
    }

    @PostMapping("/documents/{id}/selection-extraction")
    public ApiResponse<SelectionExtractionService.Preview> extractSelection(@PathVariable String id,
            @RequestBody SelectionExtractionService.Selection request) {
        try {
            return ApiResponse.success(selections.preview(CurrentUserHolder.require(), id, request));
        } catch (Exception exception) {
            log.error("Request failed in extractSelection", exception);
            throw exception;
        }
    }

    @PostMapping("/documents/{id}/selection-requirements")
    public ApiResponse<java.util.List<RequirementView>> addSelection(@PathVariable String id,
            @RequestBody SelectionExtractionService.Confirm request) {
        try {
            return ApiResponse.success(selections.confirm(CurrentUserHolder.require(), id, request));
        } catch (Exception exception) {
            log.error("Request failed in addSelection", exception);
            throw exception;
        }
    }

    @PatchMapping("/requirements/{id}")
    public ApiResponse<RequirementView> patch(@PathVariable String id,
            @RequestBody PatchRequirementRequest request) {
        try {
            return ApiResponse.success(service.patch(CurrentUserHolder.require(), id, request));
        } catch (Exception exception) {
            log.error("Request failed in patch", exception);
            throw exception;
        }
    }

    @DeleteMapping("/requirements/{id}")
    public ApiResponse<Void> delete(@PathVariable String id, @RequestParam long version) {
        try {
            service.delete(CurrentUserHolder.require(), id, version);
            return ApiResponse.success(null);
        } catch (Exception exception) {
            log.error("Request failed in delete", exception);
            throw exception;
        }
    }
}
