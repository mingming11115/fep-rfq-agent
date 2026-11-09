package com.naura.rfq.controller;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.api.PageView;
import com.naura.rfq.model.dto.RequirementMatchRequest;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.RequirementMatchService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rfq")
@RequiredArgsConstructor
@Slf4j
public class RequirementMatchController {
    private final RequirementMatchService matches;

    @GetMapping("/business-units/{buId}/match-policy")
    public ApiResponse<RequirementMatchService.Policy> policy(@PathVariable String buId) {
        return ApiResponse.success(matches.policy(CurrentUserHolder.require(), buId));
    }

    @PutMapping("/business-units/{buId}/match-policy")
    public ApiResponse<RequirementMatchService.Policy> changePolicy(@PathVariable String buId,
            @Valid @RequestBody RequirementMatchRequest.Policy request) {
        return ApiResponse.success(matches.changePolicy(CurrentUserHolder.require(), buId, request));
    }

    @GetMapping("/projects/{projectId}/match-results")
    public ApiResponse<PageView<ObjectNode>> list(@PathVariable String projectId, @RequestParam(required = false) String documentId,
            @RequestParam(required = false) String parseRunId, @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.success(matches.list(CurrentUserHolder.require(), projectId, documentId, parseRunId, page, size));
    }

    @GetMapping("/requirements/{id}/match-result")
    public ApiResponse<ObjectNode> current(@PathVariable String id) {
        return ApiResponse.success(matches.current(CurrentUserHolder.require(), id));
    }

    @GetMapping("/requirements/{id}/match-runs/{runId}")
    public ApiResponse<ObjectNode> detail(@PathVariable String id, @PathVariable String runId) {
        return ApiResponse.success(matches.detail(CurrentUserHolder.require(), id, runId));
    }

    @PostMapping("/requirements/{id}/match-runs")
    public ResponseEntity<ApiResponse<RequirementMatchService.Accepted>> retry(@PathVariable String id,
            @Valid @RequestBody RequirementMatchRequest.Retry request) {
        var accepted = matches.retry(CurrentUserHolder.require(), id, request);
        log.info("requirement.match.retry_accepted runId={} requirementId={} status={}", accepted.runId(), id, accepted.status());
        return ResponseEntity.accepted().body(ApiResponse.success(accepted));
    }

    @GetMapping("/requirements/{id}/match-input")
    public ApiResponse<ObjectNode> context(@PathVariable String id) {
        return ApiResponse.success(matches.context(CurrentUserHolder.require(), id));
    }

    @PutMapping("/requirements/{id}/match-input")
    public ApiResponse<ObjectNode> saveContext(@PathVariable String id, @Valid @RequestBody RequirementMatchRequest.Input request) {
        return ApiResponse.success(matches.saveContext(CurrentUserHolder.require(), id, request));
    }

    @PostMapping("/requirements/{id}/match-runs/{runId}/reject")
    public ApiResponse<ObjectNode> reject(@PathVariable String id, @PathVariable String runId,
            @Valid @RequestBody RequirementMatchRequest.Reject request) {
        return ApiResponse.success(matches.reject(CurrentUserHolder.require(), id, runId, request.reason()));
    }

    @PostMapping("/requirements/{id}/match-deviation/close")
    public ApiResponse<ObjectNode> closeDeviation(@PathVariable String id,
            @Valid @RequestBody RequirementMatchRequest.CloseDeviation request) {
        return ApiResponse.success(matches.closeDeviation(CurrentUserHolder.require(), id, request.version(), request.reason()));
    }

    @PostMapping("/requirements/{id}/match-deviation/review")
    public ApiResponse<ObjectNode> professionalReview(@PathVariable String id, @Valid @RequestBody RequirementMatchRequest.ProfessionalReview request) {
        return ApiResponse.success(matches.professionalReview(CurrentUserHolder.require(), id, request));
    }
}
