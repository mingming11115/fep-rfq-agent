package com.naura.rfq.controller;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.model.dto.HistoryRfqDraftRequest;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.HistoryRfqReviewService;
import com.naura.rfq.service.HistoryRfqService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/rfq")
@RequiredArgsConstructor
public class HistoryRfqController {
    private static final String LIBRARY = "/business-units/{buId}/history-rfq";
    private static final String CLAUSE = LIBRARY + "/clauses/{id}/versions/{version}";
    private final HistoryRfqService intake;
    private final HistoryRfqReviewService review;

    public record ReviewRequest(@NotNull @PositiveOrZero Long revision, @Size(max = 900) String reason) {}

    @PostMapping(value = LIBRARY + "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<HistoryRfqService.Intake> importFile(@PathVariable String buId, @RequestParam MultipartFile file,
            @RequestParam(required = false) MultipartFile responseFile, @RequestParam(required = false) String projectId,
            @RequestParam(defaultValue = "false") boolean shareWithBu, @RequestParam(required = false) String previousDocumentId,
            @RequestParam(required = false) Long revision, @RequestParam(required = false) String changeNote) throws IOException {
        return ApiResponse.success(intake.upload(CurrentUserHolder.require(), buId, file, responseFile, projectId, shareWithBu,
                previousDocumentId, revision, changeNote));
    }

    @PatchMapping(LIBRARY + "/documents/{id}")
    public ApiResponse<ObjectNode> editDocument(@PathVariable String buId, @PathVariable String id,
            @RequestBody HistoryRfqService.DocumentEdit request) {
        return ApiResponse.success(intake.editDocument(CurrentUserHolder.require(), buId, id, request));
    }

    @PostMapping(LIBRARY + "/documents/{id}/clauses")
    public ApiResponse<ObjectNode> manualClause(@PathVariable String buId, @PathVariable String id,
            @RequestBody HistoryRfqService.Manual request) {
        return ApiResponse.success(intake.addManual(CurrentUserHolder.require(), buId, id, request));
    }

    @PostMapping(LIBRARY + "/documents/manual")
    public ApiResponse<HistoryRfqService.Intake> manualDocument(@PathVariable String buId,
            @RequestBody HistoryRfqService.ManualDocument request) {
        return ApiResponse.success(intake.createManual(CurrentUserHolder.require(), buId, request));
    }

    public record Reparse(long revision) {}

    @PostMapping(LIBRARY + "/documents/{id}/reparse")
    public ApiResponse<HistoryRfqService.Intake> reparse(@PathVariable String buId, @PathVariable String id,
            @RequestBody Reparse request) throws IOException {
        return ApiResponse.success(intake.reparse(CurrentUserHolder.require(), buId, id, request.revision()));
    }

    @PostMapping("/projects/{projectId}/snapshots/{snapshotId}/history-rfq")
    public ApiResponse<HistoryRfqService.Intake> fromSnapshot(@PathVariable String projectId, @PathVariable String snapshotId,
            @RequestParam(defaultValue = "false") boolean shareWithBu) {
        return ApiResponse.success(intake.fromSnapshot(CurrentUserHolder.require(), projectId, snapshotId, shareWithBu));
    }

    @GetMapping(LIBRARY + "/documents/{id}/original")
    public ResponseEntity<byte[]> original(@PathVariable String buId, @PathVariable String id,
            @RequestParam(defaultValue = "main") String part) throws IOException {
        var original = intake.original(CurrentUserHolder.require(), buId, id, part);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(original.contentType()))
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(original.name(), StandardCharsets.UTF_8).build().toString())
                .body(original.bytes());
    }

    @GetMapping(CLAUSE)
    public ApiResponse<ObjectNode> version(@PathVariable String buId, @PathVariable String id, @PathVariable int version) {
        return ApiResponse.success(review.version(CurrentUserHolder.require(), buId, id, version));
    }

    @PatchMapping(CLAUSE)
    public ApiResponse<ObjectNode> updateDraft(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @Valid @RequestBody HistoryRfqDraftRequest request) {
        return ApiResponse.success(review.updateDraft(CurrentUserHolder.require(), buId, id, version, request));
    }

    @PostMapping(CLAUSE + "/{action:submit|publish|return|revoke|revise|delete}")
    public ApiResponse<ObjectNode> transition(@PathVariable String buId, @PathVariable String id, @PathVariable int version,
            @PathVariable String action, @Valid @RequestBody ReviewRequest request) {
        return ApiResponse.success(review.transition(CurrentUserHolder.require(), buId, id, version, request.revision(),
                action, request.reason()));
    }
}
