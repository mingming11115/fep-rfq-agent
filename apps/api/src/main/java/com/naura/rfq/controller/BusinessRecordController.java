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
import org.springframework.http.ContentDisposition;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/rfq") @RequiredArgsConstructor
public class BusinessRecordController {
    private final BusinessRecordService service;
    private final ApprovedDocumentExportService exports;
    private final FinalSnapshotService snapshots;
    private final KnowledgeGroupService groups;
    @GetMapping("/projects/{id}/workflow-records")
    public ApiResponse<Map<String,Object>> workflow(@PathVariable String id){return ApiResponse.success(service.workflow(CurrentUserHolder.require(),id));}
    @GetMapping("/business-units/{buId}/resources")
    public ApiResponse<Map<String,Object>> resources(@PathVariable String buId){return ApiResponse.success(service.resources(CurrentUserHolder.require(),buId));}

    @PutMapping("/business-units/{buId}/knowledge-groups")
    public ApiResponse<ObjectNode> saveGroups(@PathVariable String buId, @RequestBody ObjectNode request) {
        return ApiResponse.success(groups.save(CurrentUserHolder.require(), buId, request));
    }

    @PatchMapping("/business-units/{buId}/knowledge-groups/{kind}/{id}/versions/{version}")
    public ApiResponse<ObjectNode> assignGroup(@PathVariable String buId, @PathVariable String kind, @PathVariable String id,
            @PathVariable int version, @RequestBody KnowledgeGroupService.Membership request) {
        return ApiResponse.success(groups.assign(CurrentUserHolder.require(), buId, kind, id, version, request));
    }

    @PutMapping("/projects/{projectId}/final-review-config")
    public ApiResponse<ObjectNode> configureReview(@PathVariable String projectId, @RequestBody FinalSnapshotService.Reviewers request) {
        return ApiResponse.success(snapshots.configure(CurrentUserHolder.require(), projectId, request));
    }

    @PostMapping("/projects/{projectId}/snapshots")
    public ApiResponse<ObjectNode> submitSnapshot(@PathVariable String projectId, @RequestBody ObjectNode request) {
        return ApiResponse.success(snapshots.submit(CurrentUserHolder.require(), projectId, request));
    }

    @PostMapping("/projects/{projectId}/snapshots/{snapshotId}/vote")
    public ApiResponse<ObjectNode> vote(@PathVariable String projectId, @PathVariable String snapshotId,
            @RequestBody FinalSnapshotService.Vote request) {
        return ApiResponse.success(snapshots.vote(CurrentUserHolder.require(), projectId, snapshotId, request));
    }

    @GetMapping("/projects/{projectId}/snapshots/{snapshotId}/annotated-export")
    public ResponseEntity<byte[]> annotatedExport(@PathVariable String projectId, @PathVariable String snapshotId) throws IOException {
        var file = exports.download(CurrentUserHolder.require(), projectId, snapshotId);
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Disposition", ContentDisposition.attachment().filename(file.name(), StandardCharsets.UTF_8).build().toString())
                .contentType(MediaType.parseMediaType(file.contentType()))
                .contentLength(file.bytes().length)
                .body(file.bytes());
    }
}
