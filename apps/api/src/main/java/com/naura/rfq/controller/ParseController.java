package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.model.entity.ParseRun;
import com.naura.rfq.model.vo.BlockView;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.ParseQueryService;
import com.naura.rfq.service.ParseService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rfq")
@RequiredArgsConstructor
public class ParseController {
    private final ParseQueryService service;

    @PostMapping("/documents/{documentId}/parse-runs")
    public ApiResponse<ParseService.ParseRunView> start(@PathVariable String documentId) {
        return ApiResponse.success(service.start(CurrentUserHolder.require(), documentId));
    }

    @GetMapping("/parse-runs/{runId}")
    public ApiResponse<ParseRun> run(@PathVariable String runId) {
        return ApiResponse.success(service.run(CurrentUserHolder.require(), runId));
    }

    @GetMapping("/documents/{documentId}/blocks")
    public ApiResponse<List<BlockView>> blocks(@PathVariable String documentId) {
        return ApiResponse.success(service.blocks(CurrentUserHolder.require(), documentId));
    }
}
