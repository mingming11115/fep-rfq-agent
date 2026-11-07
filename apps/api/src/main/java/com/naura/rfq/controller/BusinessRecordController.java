package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.ApprovedDocumentExportService;
import com.naura.rfq.service.BusinessRecordService;
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
    @GetMapping("/projects/{id}/workflow-records")
    public ApiResponse<Map<String,Object>> workflow(@PathVariable String id){return ApiResponse.success(service.workflow(CurrentUserHolder.require(),id));}
    @GetMapping("/business-units/{buId}/resources")
    public ApiResponse<Map<String,Object>> resources(@PathVariable String buId){return ApiResponse.success(service.resources(CurrentUserHolder.require(),buId));}

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
