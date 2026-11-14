package com.naura.rfq.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.model.dto.CapabilityLibraryRequest;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.CapabilityCatalog;
import com.naura.rfq.service.CapabilityLibraryService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
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
@Slf4j
public class CapabilityLibraryController {
    @Autowired
    private CapabilityLibraryService capabilities;
    @Autowired
    private CapabilityCatalog catalog;

    @PostMapping(value = "/capabilities/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<CapabilityLibraryService.Imported> importExcel(@PathVariable String buId,
            @RequestParam MultipartFile file, @RequestParam(required = false) String projectId) {
        try {
            return ApiResponse.success(capabilities.importExcel(CurrentUserHolder.require(), buId, projectId, file));
        } catch (Exception exception) {
            log.error("Request failed in importExcel", exception);
            throw exception;
        }
    }

    @PostMapping("/capabilities")
    public ApiResponse<ObjectNode> create(@PathVariable String buId, @Valid @RequestBody CapabilityLibraryRequest.Draft request) {
        try {
            return ApiResponse.success(capabilities.create(CurrentUserHolder.require(), buId, request));
        } catch (Exception exception) {
            log.error("Request failed in create", exception);
            throw exception;
        }
    }

    @GetMapping("/history/{id}/versions/{version}/metrics")
    public ApiResponse<JsonNode> extractMetrics(@PathVariable String buId, @PathVariable String id, @PathVariable int version) {
        try {
            return ApiResponse.success(capabilities.extractHistoryMetrics(CurrentUserHolder.require(), buId, id, version));
        } catch (Exception exception) {
            log.error("Request failed in extractMetrics", exception);
            throw exception;
        }
    }

    @PostMapping("/history/{id}/versions/{version}/candidate")
    public ApiResponse<ObjectNode> fromHistory(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @Valid @RequestBody CapabilityLibraryRequest.Draft request) {
        try {
            return ApiResponse.success(capabilities.fromHistory(CurrentUserHolder.require(), buId, id, version, request));
        } catch (Exception exception) {
            log.error("Request failed in fromHistory", exception);
            throw exception;
        }
    }

    @GetMapping("/capabilities/{id}/versions/{version}")
    public ApiResponse<ObjectNode> version(@PathVariable String buId, @PathVariable String id, @PathVariable int version) {
        try {
            return ApiResponse.success(capabilities.version(CurrentUserHolder.require(), buId, id, version));
        } catch (Exception exception) {
            log.error("Request failed in version", exception);
            throw exception;
        }
    }

    @PatchMapping("/capabilities/{id}/versions/{version}")
    public ApiResponse<ObjectNode> update(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @Valid @RequestBody CapabilityLibraryRequest.Draft request) {
        try {
            return ApiResponse.success(capabilities.update(CurrentUserHolder.require(), buId, id, version, request));
        } catch (Exception exception) {
            log.error("Request failed in update", exception);
            throw exception;
        }
    }

    @PostMapping("/capabilities/{id}/versions/{version}/{action:submit|publish|return|revise|revoke}")
    public ApiResponse<ObjectNode> review(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @PathVariable String action, @Valid @RequestBody CapabilityLibraryRequest.Review request) {
        try {
            return ApiResponse.success(capabilities.transition(CurrentUserHolder.require(), buId, id, version, action, request));
        } catch (Exception exception) {
            log.error("Request failed in review", exception);
            throw exception;
        }
    }

    @GetMapping("/published")
    public ApiResponse<List<ObjectNode>> published(@PathVariable String buId,
            @Valid @ModelAttribute CapabilityLibraryRequest.Lookup query) {
        try {
            return ApiResponse.success(capabilities.published(CurrentUserHolder.require(), buId, query));
        } catch (Exception exception) {
            log.error("Request failed in published", exception);
            throw exception;
        }
    }

    @PostMapping("/models")
    public ApiResponse<ObjectNode> createModel(@PathVariable String buId, @Valid @RequestBody CapabilityLibraryRequest.Model request) {
        try {
            return ApiResponse.success(catalog.saveModel(CurrentUserHolder.require(), buId, null, 0, request));
        } catch (Exception exception) {
            log.error("Request failed in createModel", exception);
            throw exception;
        }
    }

    @PostMapping("/models/{id}/versions/{version}/revise")
    public ApiResponse<ObjectNode> reviseModel(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @Valid @RequestBody CapabilityLibraryRequest.Model request) {
        try {
            return ApiResponse.success(catalog.saveModel(CurrentUserHolder.require(), buId, id, version, request));
        } catch (Exception exception) {
            log.error("Request failed in reviseModel", exception);
            throw exception;
        }
    }

    @PostMapping("/processes")
    public ApiResponse<ObjectNode> createProcess(@PathVariable String buId, @Valid @RequestBody CapabilityLibraryRequest.Process request) {
        try {
            return ApiResponse.success(catalog.saveProcess(CurrentUserHolder.require(), buId, null, 0, request));
        } catch (Exception exception) {
            log.error("Request failed in createProcess", exception);
            throw exception;
        }
    }

    @PostMapping("/processes/{id}/versions/{version}/revise")
    public ApiResponse<ObjectNode> reviseProcess(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @Valid @RequestBody CapabilityLibraryRequest.Process request) {
        try {
            return ApiResponse.success(catalog.saveProcess(CurrentUserHolder.require(), buId, id, version, request));
        } catch (Exception exception) {
            log.error("Request failed in reviseProcess", exception);
            throw exception;
        }
    }

    @GetMapping("/evidence/{id}/versions/{version}")
    public ApiResponse<ObjectNode> evidence(@PathVariable String buId, @PathVariable String id, @PathVariable int version) {
        try {
            return ApiResponse.success(catalog.evidence(CurrentUserHolder.require(), buId, id, version));
        } catch (Exception exception) {
            log.error("Request failed in evidence", exception);
            throw exception;
        }
    }

    @PostMapping("/evidence")
    public ApiResponse<ObjectNode> registerEvidence(@PathVariable String buId, @Valid @RequestBody CapabilityLibraryRequest.Evidence request) {
        try {
            return ApiResponse.success(catalog.registerEvidence(CurrentUserHolder.require(), buId, null, 0, request));
        } catch (Exception exception) {
            log.error("Request failed in registerEvidence", exception);
            throw exception;
        }
    }

    @PostMapping("/evidence/{id}/versions/{version}/revise")
    public ApiResponse<ObjectNode> reviseEvidence(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @Valid @RequestBody CapabilityLibraryRequest.Evidence request) {
        try {
            return ApiResponse.success(catalog.registerEvidence(CurrentUserHolder.require(), buId, id, version, request));
        } catch (Exception exception) {
            log.error("Request failed in reviseEvidence", exception);
            throw exception;
        }
    }

    @PostMapping("/evidence/{id}/versions/{version}/{action:verify|revoke}")
    public ApiResponse<ObjectNode> reviewEvidence(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @PathVariable String action, @Valid @RequestBody CapabilityLibraryRequest.Review request) {
        try {
            return ApiResponse.success(catalog.reviewEvidence(CurrentUserHolder.require(), buId, id, version, action, request));
        } catch (Exception exception) {
            log.error("Request failed in reviewEvidence", exception);
            throw exception;
        }
    }
}
