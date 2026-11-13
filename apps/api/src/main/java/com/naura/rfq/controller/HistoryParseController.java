package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.model.vo.HistoryParseView;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.HistoryParseService;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/rfq/history")
@RequiredArgsConstructor
@Slf4j
public class HistoryParseController {
    private final HistoryParseService service;

    @PostMapping("/parse")
    public ApiResponse<HistoryParseView> parse(@RequestParam MultipartFile file,
            @RequestParam(required = false) MultipartFile responseFile, @RequestParam String buId) throws IOException {
        try {
            return ApiResponse.success(service.parse(CurrentUserHolder.require(), file, responseFile, buId));
        } catch (Exception exception) {
            log.error("Request failed in parse", exception);
            throw exception;
        }
    }
}
