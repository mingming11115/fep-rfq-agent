package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.config.properties.OfficeProperties;
import com.naura.rfq.service.OfficeDocumentService;
import com.naura.rfq.storage.OfficeFileStore;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/** Native DOCX/PDF storage; it does not require a running ONLYOFFICE server. */
@RestController
@RequestMapping("/api/craft")
@Slf4j
public class CraftDocumentController {
    @Autowired
    private OfficeDocumentService service;
    @Autowired
    private OfficeFileStore store;
    @Autowired
    private OfficeProperties properties;

    @PostMapping("/documents")
    public ResponseEntity<?> upload(@RequestParam MultipartFile file,
                                    @RequestParam(required = false) MultipartFile review,
                                    @RequestParam(defaultValue = "") String projectId,
                                    @RequestParam(defaultValue = "") String fileId,
                                    @RequestParam(defaultValue = "") String sourceVersion) throws IOException {
        try {
            byte[] original = read(file), latest = review == null ? null : read(review);
            var metadata = service.uploadCraft(file.getOriginalFilename(), original,
                    review == null ? null : review.getOriginalFilename(), latest, projectId, fileId, sourceVersion);
            return metadata(metadata);
        } catch (Exception exception) {
            log.error("Request failed in upload", exception);
            throw exception;
        }
    }

    @GetMapping("/documents/{id}")
    public ResponseEntity<?> document(@PathVariable String id,
                                      @RequestHeader(value = "X-Craft-Access", required = false) String access) {
        try {
            return metadata(service.metadata(store.authorize(id, access)));
        } catch (Exception exception) {
            log.error("Request failed in document", exception);
            throw exception;
        }
    }

    @GetMapping("/documents/{id}/download")
    public ResponseEntity<?> download(@PathVariable String id,
                                      @RequestHeader(value = "X-Craft-Access", required = false) String access,
                                      @RequestParam(defaultValue = "review") String kind) {
        try {
            var doc = store.authorize(id, access);
            if (!kind.equals("original") && !kind.equals("review")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "下载版本无效");
            }
            return ResponseEntity.ok()
                    .header(HttpHeaders.CACHE_CONTROL, "no-store")
                    .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(doc.name(), StandardCharsets.UTF_8).build().toString())
                    .contentType(MediaType.parseMediaType(doc.fileType().equals("pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
                    .body(new FileSystemResource(store.file(doc, kind.equals("original"))));
        } catch (Exception exception) {
            log.error("Request failed in download", exception);
            throw exception;
        }
    }

    @PutMapping("/documents/{id}/review")
    public ResponseEntity<?> save(@PathVariable String id,
                                  @RequestHeader(value = "X-Craft-Access", required = false) String access,
                                  @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                  HttpServletRequest request) throws IOException {
        try {
            // Reject absent capabilities before reading an untrusted binary body.
            store.authorize(id, access);
            long revision = revision(ifMatch);
            MediaType type;
            try { type = MediaType.parseMediaType(request.getContentType() == null ? "" : request.getContentType()); }
            catch (IllegalArgumentException e) {
                log.error("工艺文档的媒体类型无效 errorType={}", e.getClass().getSimpleName());
                throw binaryRequired();
            }
            if (!type.getType().equals("application") || !type.getSubtype().equals("octet-stream")) {
                throw binaryRequired();
            }
            byte[] bytes;
            try (var input = request.getInputStream()) { bytes = read(input, request.getContentLengthLong()); }
            return metadata(service.saveCraftReview(id, access, revision, bytes));
        } catch (Exception exception) {
            log.error("Request failed in save", exception);
            throw exception;
        }
    }

    private byte[] read(MultipartFile part) throws IOException {
        try (var input = part.getInputStream()) { return read(input, part.getSize()); }
    }

    private byte[] read(InputStream input, long declaredSize) throws IOException {
        long limit = Math.min(properties.maxFileBytes(), Integer.MAX_VALUE - 1L);
        if (declaredSize > limit) {
            throw tooLarge();
        }
        byte[] bytes = input.readNBytes((int) limit + 1);
        if (bytes.length > limit) {
            throw tooLarge();
        }
        return bytes;
    }

    private long revision(String value) {
        if (value != null) {
            String normalized = value.trim();
            if (normalized.matches("[0-9]+|\"[0-9]+\"")) {
                if (normalized.startsWith("\"")) {
                    normalized = normalized.substring(1, normalized.length() - 1);
                }
                try { return Long.parseLong(normalized); }
                catch (NumberFormatException ignored) {
                    log.error("工艺文档版本号超出有效范围", ignored);
                    /* Reject overflow as an invalid precondition. */
                }
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "保存必须提供当前文件版本 If-Match");
    }

    private ResponseEntity<?> metadata(Map<String, Object> metadata) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store")
                .eTag("\"" + metadata.get("revision") + "\"").body(ApiResponse.success(metadata));
    }

    private static ResponseStatusException binaryRequired() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "批阅稿必须使用 application/octet-stream 上传");
    }

    private static ResponseStatusException tooLarge() {
        return new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "文件超过允许的上传大小");
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<?> expected(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode()).header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(ApiResponse.error(exception.getStatusCode().value(), exception.getReason()));
    }
}
