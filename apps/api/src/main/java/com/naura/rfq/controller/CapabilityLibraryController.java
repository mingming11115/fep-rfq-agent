package com.naura.rfq.controller;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.model.dto.CapabilityLibraryRequest;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.CapabilityCatalog;
import com.naura.rfq.service.CapabilityLibraryService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/rfq/business-units/{buId}/capability-library")
@RequiredArgsConstructor
public class CapabilityLibraryController {
    private final CapabilityLibraryService capabilities;
    private final CapabilityCatalog catalog;

    @PostMapping(value = "/capabilities/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<CapabilityLibraryService.Imported> importExcel(@PathVariable String buId,
            @RequestParam MultipartFile file, @RequestParam(required = false) String projectId) {
        return ApiResponse.success(capabilities.importExcel(CurrentUserHolder.require(), buId, projectId, file));
    }

    @PostMapping("/capabilities")
    public ApiResponse<ObjectNode> create(@PathVariable String buId, @Valid @RequestBody CapabilityLibraryRequest.Draft request) {
        return ApiResponse.success(capabilities.create(CurrentUserHolder.require(), buId, request));
    }

    @PostMapping("/history/{id}/versions/{version}/candidate")
    public ApiResponse<ObjectNode> fromHistory(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @Valid @RequestBody CapabilityLibraryRequest.Draft request) {
        return ApiResponse.success(capabilities.fromHistory(CurrentUserHolder.require(), buId, id, version, request));
    }

    @GetMapping("/capabilities/{id}/versions/{version}")
    public ApiResponse<ObjectNode> version(@PathVariable String buId, @PathVariable String id, @PathVariable int version) {
        return ApiResponse.success(capabilities.version(CurrentUserHolder.require(), buId, id, version));
    }

    @PatchMapping("/capabilities/{id}/versions/{version}")
    public ApiResponse<ObjectNode> update(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @Valid @RequestBody CapabilityLibraryRequest.Draft request) {
        return ApiResponse.success(capabilities.update(CurrentUserHolder.require(), buId, id, version, request));
    }

    @PostMapping("/capabilities/{id}/versions/{version}/{action:submit|publish|return|revise|revoke}")
    public ApiResponse<ObjectNode> review(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @PathVariable String action, @Valid @RequestBody CapabilityLibraryRequest.Review request) {
        return ApiResponse.success(capabilities.transition(CurrentUserHolder.require(), buId, id, version, action, request));
    }

    @GetMapping("/published")
    public ApiResponse<List<ObjectNode>> published(@PathVariable String buId,
            @Valid @ModelAttribute CapabilityLibraryRequest.Lookup query) {
        return ApiResponse.success(capabilities.published(CurrentUserHolder.require(), buId, query));
    }

    @PostMapping("/models")
    public ApiResponse<ObjectNode> createModel(@PathVariable String buId, @Valid @RequestBody CapabilityLibraryRequest.Model request) {
        return ApiResponse.success(catalog.saveModel(CurrentUserHolder.require(), buId, null, 0, request));
    }

    @PostMapping("/models/{id}/versions/{version}/revise")
    public ApiResponse<ObjectNode> reviseModel(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @Valid @RequestBody CapabilityLibraryRequest.Model request) {
        return ApiResponse.success(catalog.saveModel(CurrentUserHolder.require(), buId, id, version, request));
    }

    @PostMapping("/processes")
    public ApiResponse<ObjectNode> createProcess(@PathVariable String buId, @Valid @RequestBody CapabilityLibraryRequest.Process request) {
        return ApiResponse.success(catalog.saveProcess(CurrentUserHolder.require(), buId, null, 0, request));
    }

    @PostMapping("/processes/{id}/versions/{version}/revise")
    public ApiResponse<ObjectNode> reviseProcess(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @Valid @RequestBody CapabilityLibraryRequest.Process request) {
        return ApiResponse.success(catalog.saveProcess(CurrentUserHolder.require(), buId, id, version, request));
    }

    @GetMapping("/evidence/{id}/versions/{version}")
    public ApiResponse<ObjectNode> evidence(@PathVariable String buId, @PathVariable String id, @PathVariable int version) {
        return ApiResponse.success(catalog.evidence(CurrentUserHolder.require(), buId, id, version));
    }

    @PostMapping("/evidence")
    public ApiResponse<ObjectNode> registerEvidence(@PathVariable String buId, @Valid @RequestBody CapabilityLibraryRequest.Evidence request) {
        return ApiResponse.success(catalog.registerEvidence(CurrentUserHolder.require(), buId, null, 0, request));
    }

    @PostMapping("/evidence/{id}/versions/{version}/revise")
    public ApiResponse<ObjectNode> reviseEvidence(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @Valid @RequestBody CapabilityLibraryRequest.Evidence request) {
        return ApiResponse.success(catalog.registerEvidence(CurrentUserHolder.require(), buId, id, version, request));
    }

    @PostMapping("/evidence/{id}/versions/{version}/{action:verify|revoke}")
    public ApiResponse<ObjectNode> reviewEvidence(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @PathVariable String action, @Valid @RequestBody CapabilityLibraryRequest.Review request) {
        return ApiResponse.success(catalog.reviewEvidence(CurrentUserHolder.require(), buId, id, version, action, request));
    }
}
