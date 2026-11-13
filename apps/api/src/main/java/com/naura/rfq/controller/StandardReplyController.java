package com.naura.rfq.controller;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.model.dto.StandardReplyDraftRequest;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.StandardReplyService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/rfq/business-units/{buId}/standard-replies")
@RequiredArgsConstructor
@Slf4j
public class StandardReplyController {
    private final StandardReplyService service;

    public record ReviewRequest(@NotNull @PositiveOrZero Long revision, @Size(max = 900) String reason) {}

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<StandardReplyService.ImportResult> importFile(@PathVariable String buId,
            @RequestParam MultipartFile file) {
        try {
            return ApiResponse.success(service.importFile(CurrentUserHolder.require(), buId, file));
        } catch (Exception exception) {
            log.error("Request failed in importFile", exception);
            throw exception;
        }
    }

    @GetMapping("/{id}/versions/{version}")
    public ApiResponse<ObjectNode> version(@PathVariable String buId, @PathVariable String id,
            @PathVariable int version) {
        try {
            return ApiResponse.success(service.version(CurrentUserHolder.require(), buId, id, version));
        } catch (Exception exception) {
            log.error("Request failed in version", exception);
            throw exception;
        }
    }

    @PatchMapping("/{id}/versions/{version}")
    public ApiResponse<ObjectNode> updateDraft(@PathVariable String buId, @PathVariable String id,
            @PathVariable int version, @Valid @RequestBody StandardReplyDraftRequest request) {
        try {
            return ApiResponse.success(service.updateDraft(CurrentUserHolder.require(), buId, id, version, request));
        } catch (Exception exception) {
            log.error("Request failed in updateDraft", exception);
            throw exception;
        }
    }

    @PostMapping("/{id}/versions/{version}/{action:submit|publish|return|revoke|revise|delete}")
    public ApiResponse<ObjectNode> transition(@PathVariable String buId, @PathVariable String id,
            @PathVariable int version, @PathVariable String action, @Valid @RequestBody ReviewRequest request) {
        try {
            return ApiResponse.success(service.transition(CurrentUserHolder.require(), buId, id, version,
                    request.revision(), action, request.reason()));
        } catch (Exception exception) {
            log.error("Request failed in transition", exception);
            throw exception;
        }
    }
}
