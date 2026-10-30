package com.naura.rfq.office;

import com.fasterxml.jackson.databind.JsonNode;
import com.naura.rfq.common.api.ApiResponse;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;

@RestController
@RequestMapping("/api/office")
public class OfficeController {
    private final OfficeDocumentService service;
    private final OfficeFileStore store;
    private final OfficeProperties properties;
    public OfficeController(OfficeDocumentService s, OfficeFileStore store, OfficeProperties p) { service = s; this.store = store; properties = p; }
    @GetMapping("/status") public ApiResponse<?> status() { return ApiResponse.success(Map.of("configured", properties.configured(), "maxFileBytes", properties.maxFileBytes())); }
    @PostMapping("/documents") public ApiResponse<?> upload(@RequestParam MultipartFile file,
            @RequestParam(defaultValue = "") String projectId, @RequestParam(defaultValue = "") String fileId,
            @RequestParam(defaultValue = "") String sourceVersion) throws Exception {
        if (file.getSize() > properties.maxFileBytes()) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "文件超过允许的上传大小");
        return ApiResponse.success(service.upload(file.getOriginalFilename(), file.getBytes(), projectId, fileId, sourceVersion));
    }
    @GetMapping("/documents/{id}") public ApiResponse<?> document(@PathVariable String id, @RequestHeader(value = "X-Office-Access", required = false) String access) {
        return ApiResponse.success(service.metadata(store.authorize(id, access)));
    }
    @PostMapping("/documents/{id}/session") public ApiResponse<?> session(@PathVariable String id,
            @RequestHeader(value = "X-Office-Access", required = false) String access, @RequestBody JsonNode request) {
        return ApiResponse.success(service.session(store.authorize(id, access), request.path("readOnly").asBoolean(true), request.path("userId").asText(), request.path("userName").asText()));
    }
    @PostMapping("/documents/{id}/save") public ApiResponse<?> save(@PathVariable String id, @RequestHeader(value = "X-Office-Access", required = false) String access) throws Exception {
        return ApiResponse.success(service.forceSave(store.authorize(id, access)));
    }
    @GetMapping("/documents/{id}/download") public ResponseEntity<?> download(@PathVariable String id,
            @RequestHeader(value = "X-Office-Access", required = false) String access, @RequestParam(defaultValue = "review") String kind) {
        if (!kind.equals("review") && !kind.equals("original")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "下载版本无效");
        return file(store.authorize(id, access), kind.equals("original"));
    }
    @GetMapping("/content/{id}") public ResponseEntity<?> content(@PathVariable String id, @RequestParam String ticket) { return file(service.content(id, ticket), false); }
    private ResponseEntity<?> file(OfficeFileStore.Document doc, boolean original) {
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(doc.name(), java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .contentType(MediaType.parseMediaType(doc.fileType().equals("pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
                .header(HttpHeaders.CACHE_CONTROL, "no-store").body(new FileSystemResource(store.file(doc, original)));
    }
    @PostMapping("/callback/{id}") public Map<String, Integer> callback(@PathVariable String id,
            @RequestHeader(value = "Authorization", required = false) String authorization, @RequestBody JsonNode request) {
        String token = authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7) : request.path("token").asText();
        return Map.of("error", service.callback(id, token) ? 0 : 1);
    }
    @ExceptionHandler(ResponseStatusException.class) public ResponseEntity<?> expected(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode()).body(ApiResponse.error(e.getStatusCode().value(), e.getReason()));
    }
}
