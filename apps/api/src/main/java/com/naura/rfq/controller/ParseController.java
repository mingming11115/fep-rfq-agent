package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.model.entity.ParseRun;
import com.naura.rfq.model.vo.BlockView;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.ParseQueryService;
import com.naura.rfq.service.ParseService;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rfq")
@Slf4j
public class ParseController {
    @Autowired
    private ParseQueryService service;
    public record StartRequest(List<String> historyDocumentIds) {}

    @PostMapping("/documents/{documentId}/parse-runs")
    public ApiResponse<ParseService.ParseRunView> start(@PathVariable String documentId,
            @RequestBody(required = false) StartRequest request) {
        try {
            return ApiResponse.success(service.start(CurrentUserHolder.require(), documentId,
                    request == null ? null : request.historyDocumentIds()));
        } catch (Exception exception) {
            log.error("Request failed in start", exception);
            throw exception;
        }
    }

    @GetMapping("/parse-runs/{runId}")
    public ApiResponse<ParseRun> run(@PathVariable String runId) {
        try {
            return ApiResponse.success(service.run(CurrentUserHolder.require(), runId));
        } catch (Exception exception) {
            log.error("Request failed in run", exception);
            throw exception;
        }
    }

    @GetMapping("/documents/{documentId}/blocks")
    public ApiResponse<List<BlockView>> blocks(@PathVariable String documentId) {
        try {
            return ApiResponse.success(service.blocks(CurrentUserHolder.require(), documentId));
        } catch (Exception exception) {
            log.error("Request failed in blocks", exception);
            throw exception;
        }
    }
}
