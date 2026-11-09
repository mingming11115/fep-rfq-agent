package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.api.PageView;
import com.naura.rfq.model.vo.DocumentView;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.DocumentService;
import com.naura.rfq.service.DocumentReplacementService;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/rfq")
@RequiredArgsConstructor
public class DocumentController {
    private final DocumentService service;
    private final DocumentReplacementService replacements;

    @PostMapping("/projects/{projectId}/documents/{documentId}/replacement")
    public ApiResponse<ObjectNode> uploadReplacement(@PathVariable String projectId, @PathVariable String documentId,
            @RequestParam("file") MultipartFile file) throws IOException {
        return ApiResponse.success(replacements.upload(CurrentUserHolder.require(), projectId, documentId, file));
    }

    @GetMapping("/projects/{projectId}/document-replacements/{documentId}")
    public ApiResponse<ObjectNode> replacementImpact(@PathVariable String projectId, @PathVariable String documentId) {
        return ApiResponse.success(replacements.preview(CurrentUserHolder.require(), projectId, documentId));
    }

    @PostMapping("/projects/{projectId}/document-replacements/{documentId}/activate")
    public ApiResponse<ObjectNode> activateReplacement(@PathVariable String projectId, @PathVariable String documentId,
            @RequestBody DocumentReplacementService.Activation request) {
        return ApiResponse.success(replacements.activate(CurrentUserHolder.require(), projectId, documentId, request));
    }

    public record CancelReplacement(String reason) {}

    @PostMapping("/projects/{projectId}/document-replacements/{documentId}/cancel")
    public ApiResponse<Boolean> cancelReplacement(@PathVariable String projectId, @PathVariable String documentId,
            @RequestBody CancelReplacement request) {
        replacements.cancel(CurrentUserHolder.require(), projectId, documentId, request.reason());
        return ApiResponse.success(true);
    }

    @GetMapping("/projects/{projectId}/documents")
    public ApiResponse<PageView<DocumentView>> list(@PathVariable String projectId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        return ApiResponse.success(service.list(CurrentUserHolder.require(), projectId, page, size, sort));
    }

    @GetMapping("/documents/{documentId}")
    public ApiResponse<DocumentView> detail(@PathVariable String documentId) {
        return ApiResponse.success(service.detail(CurrentUserHolder.require(), documentId));
    }

    @PostMapping("/projects/{projectId}/documents")
    public ApiResponse<DocumentView> upload(@PathVariable String projectId,
            @RequestParam("file") MultipartFile file) throws IOException {
        return ApiResponse.success(service.upload(CurrentUserHolder.require(), projectId, file));
    }

    @PostMapping("/projects/{projectId}/documents/sample")
    public ApiResponse<DocumentView> uploadSample(@PathVariable String projectId) throws Exception {
        return ApiResponse.success(service.uploadSample(CurrentUserHolder.require(), projectId));
    }

    @GetMapping("/documents/{documentId}/download")
    public ResponseEntity<Resource> download(@PathVariable String documentId) throws IOException {
        var download = service.download(CurrentUserHolder.require(), documentId);
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Disposition", ContentDisposition.attachment()
                        .filename(download.name(), StandardCharsets.UTF_8).build().toString())
                .contentType(MediaType.parseMediaType(download.contentType()))
                .contentLength(download.sizeBytes())
                .eTag("\"" + download.sha256().toLowerCase(Locale.ROOT) + "\"")
                .body(new ByteArrayResource(download.content()));
    }
}
