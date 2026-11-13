package com.naura.rfq.controller;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.ApprovedDocumentExportService;
import com.naura.rfq.service.BusinessRecordService;
import com.naura.rfq.service.FinalSnapshotService;
import com.naura.rfq.service.KnowledgeGroupService;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ContentDisposition;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/rfq") @RequiredArgsConstructor
@Slf4j
public class BusinessRecordController {
    private final BusinessRecordService service;
    private final ApprovedDocumentExportService exports;
    private final FinalSnapshotService snapshots;
    private final KnowledgeGroupService groups;
    @GetMapping("/projects/{id}/workflow-records")
    public ApiResponse<Map<String,Object>> workflow(@PathVariable String id){
        try {
            return ApiResponse.success(service.workflow(CurrentUserHolder.require(),id));
        } catch (Exception exception) {
            log.error("Request failed in workflow", exception);
            throw exception;
        }
    }
    @GetMapping("/business-units/{buId}/resources")
    public ApiResponse<Map<String,Object>> resources(@PathVariable String buId){
        try {
            return ApiResponse.success(service.resources(CurrentUserHolder.require(),buId));
        } catch (Exception exception) {
            log.error("Request failed in resources", exception);
            throw exception;
        }
    }

    @PutMapping("/business-units/{buId}/knowledge-groups")
    public ApiResponse<ObjectNode> saveGroups(@PathVariable String buId, @RequestBody ObjectNode request) {
        try {
            return ApiResponse.success(groups.save(CurrentUserHolder.require(), buId, request));
        } catch (Exception exception) {
            log.error("Request failed in saveGroups", exception);
            throw exception;
        }
    }

    @PatchMapping("/business-units/{buId}/knowledge-groups/{kind}/{id}/versions/{version}")
    public ApiResponse<ObjectNode> assignGroup(@PathVariable String buId, @PathVariable String kind, @PathVariable String id,
            @PathVariable int version, @RequestBody KnowledgeGroupService.Membership request) {
        try {
            return ApiResponse.success(groups.assign(CurrentUserHolder.require(), buId, kind, id, version, request));
        } catch (Exception exception) {
            log.error("Request failed in assignGroup", exception);
            throw exception;
        }
    }

    @PutMapping("/projects/{projectId}/final-review-config")
    public ApiResponse<ObjectNode> configureReview(@PathVariable String projectId, @RequestBody FinalSnapshotService.Reviewers request) {
        try {
            return ApiResponse.success(snapshots.configure(CurrentUserHolder.require(), projectId, request));
        } catch (Exception exception) {
            log.error("Request failed in configureReview", exception);
            throw exception;
        }
    }

    @PostMapping("/projects/{projectId}/snapshots")
    public ApiResponse<ObjectNode> submitSnapshot(@PathVariable String projectId, @RequestBody ObjectNode request) {
        try {
            return ApiResponse.success(snapshots.submit(CurrentUserHolder.require(), projectId, request));
        } catch (Exception exception) {
            log.error("Request failed in submitSnapshot", exception);
            throw exception;
        }
    }

    @PostMapping("/projects/{projectId}/snapshots/{snapshotId}/vote")
    public ApiResponse<ObjectNode> vote(@PathVariable String projectId, @PathVariable String snapshotId,
            @RequestBody FinalSnapshotService.Vote request) {
        try {
            return ApiResponse.success(snapshots.vote(CurrentUserHolder.require(), projectId, snapshotId, request));
        } catch (Exception exception) {
            log.error("Request failed in vote", exception);
            throw exception;
        }
    }

    @GetMapping("/projects/{projectId}/snapshots/{snapshotId}/annotated-export")
    public ResponseEntity<byte[]> annotatedExport(@PathVariable String projectId, @PathVariable String snapshotId,
            @RequestParam(defaultValue = "false") boolean wordInBody) throws IOException {
        try {
            var file = exports.download(CurrentUserHolder.require(), projectId, snapshotId, wordInBody);
            return ResponseEntity.ok()
                    .header("Cache-Control", "no-store")
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Content-Disposition", ContentDisposition.attachment().filename(file.name(), StandardCharsets.UTF_8).build().toString())
                    .contentType(MediaType.parseMediaType(file.contentType()))
                    .contentLength(file.bytes().length)
                    .body(file.bytes());
        } catch (Exception exception) {
            log.error("Request failed in annotatedExport", exception);
            throw exception;
        }
    }
}
