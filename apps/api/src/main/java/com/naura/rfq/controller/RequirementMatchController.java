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
        try {
            return ApiResponse.success(matches.policy(CurrentUserHolder.require(), buId));
        } catch (Exception exception) {
            log.error("Request failed in policy", exception);
            throw exception;
        }
    }

    @PutMapping("/business-units/{buId}/match-policy")
    public ApiResponse<RequirementMatchService.Policy> changePolicy(@PathVariable String buId,
            @Valid @RequestBody RequirementMatchRequest.Policy request) {
        try {
            return ApiResponse.success(matches.changePolicy(CurrentUserHolder.require(), buId, request));
        } catch (Exception exception) {
            log.error("Request failed in changePolicy", exception);
            throw exception;
        }
    }

    @GetMapping("/projects/{projectId}/match-results")
    public ApiResponse<PageView<ObjectNode>> list(@PathVariable String projectId, @RequestParam(required = false) String documentId,
            @RequestParam(required = false) String parseRunId, @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        try {
            return ApiResponse.success(matches.list(CurrentUserHolder.require(), projectId, documentId, parseRunId, page, size));
        } catch (Exception exception) {
            log.error("Request failed in list", exception);
            throw exception;
        }
    }

    @GetMapping("/requirements/{id}/match-result")
    public ApiResponse<ObjectNode> current(@PathVariable String id) {
        try {
            return ApiResponse.success(matches.current(CurrentUserHolder.require(), id));
        } catch (Exception exception) {
            log.error("Request failed in current", exception);
            throw exception;
        }
    }

    @GetMapping("/requirements/{id}/match-runs/{runId}")
    public ApiResponse<ObjectNode> detail(@PathVariable String id, @PathVariable String runId) {
        try {
            return ApiResponse.success(matches.detail(CurrentUserHolder.require(), id, runId));
        } catch (Exception exception) {
            log.error("Request failed in detail", exception);
            throw exception;
        }
    }

    @PostMapping("/requirements/{id}/match-runs")
    public ResponseEntity<ApiResponse<RequirementMatchService.Accepted>> retry(@PathVariable String id,
            @Valid @RequestBody RequirementMatchRequest.Retry request) {
        try {
            var accepted = matches.retry(CurrentUserHolder.require(), id, request);
            log.info("requirement.match.retry_accepted runId={} requirementId={} status={}", accepted.runId(), id, accepted.status());
            return ResponseEntity.accepted().body(ApiResponse.success(accepted));
        } catch (Exception exception) {
            log.error("Request failed in retry", exception);
            throw exception;
        }
    }

    @GetMapping("/requirements/{id}/match-input")
    public ApiResponse<ObjectNode> context(@PathVariable String id) {
        try {
            return ApiResponse.success(matches.context(CurrentUserHolder.require(), id));
        } catch (Exception exception) {
            log.error("Request failed in context", exception);
            throw exception;
        }
    }

    @PutMapping("/requirements/{id}/match-input")
    public ApiResponse<ObjectNode> saveContext(@PathVariable String id, @Valid @RequestBody RequirementMatchRequest.Input request) {
        try {
            return ApiResponse.success(matches.saveContext(CurrentUserHolder.require(), id, request));
        } catch (Exception exception) {
            log.error("Request failed in saveContext", exception);
            throw exception;
        }
    }

    @PostMapping("/requirements/{id}/match-runs/{runId}/reject")
    public ApiResponse<ObjectNode> reject(@PathVariable String id, @PathVariable String runId,
            @Valid @RequestBody RequirementMatchRequest.Reject request) {
        try {
            return ApiResponse.success(matches.reject(CurrentUserHolder.require(), id, runId, request.reason()));
        } catch (Exception exception) {
            log.error("Request failed in reject", exception);
            throw exception;
        }
    }

    @PostMapping("/requirements/{id}/match-deviation/close")
    public ApiResponse<ObjectNode> closeDeviation(@PathVariable String id,
            @Valid @RequestBody RequirementMatchRequest.CloseDeviation request) {
        try {
            return ApiResponse.success(matches.closeDeviation(CurrentUserHolder.require(), id, request.version(), request.reason()));
        } catch (Exception exception) {
            log.error("Request failed in closeDeviation", exception);
            throw exception;
        }
    }

    @PostMapping("/requirements/{id}/match-deviation/review")
    public ApiResponse<ObjectNode> professionalReview(@PathVariable String id, @Valid @RequestBody RequirementMatchRequest.ProfessionalReview request) {
        try {
            return ApiResponse.success(matches.professionalReview(CurrentUserHolder.require(), id, request));
        } catch (Exception exception) {
            log.error("Request failed in professionalReview", exception);
            throw exception;
        }
    }
}
