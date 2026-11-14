package com.naura.rfq.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.ResponseService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rfq/requirements/{id}/response")
@Slf4j
public class ResponseController {
    @Autowired
    private ResponseService service;
    public record WriteRequest(Long version,Long sourceVersion,JsonNode patch,String matchRunId,String candidateId,String detachMatchReason) {
        ResponseService.MatchChoice choice() { return new ResponseService.MatchChoice(matchRunId, candidateId, detachMatchReason); }
    }
    public record RestoreRequest(Long version, Long sourceVersion, String kind, Long historyVersion) {}
    @PatchMapping
    public ApiResponse<JsonNode> save(@PathVariable String id,@RequestBody WriteRequest request){
        try {
            return ApiResponse.success(service.write(CurrentUserHolder.require(),id,request.version(),request.sourceVersion(),request.patch(),false,request.choice()));
        } catch (Exception exception) {
            log.error("Request failed in save", exception);
            throw exception;
        }
    }
    @PostMapping("/confirm")
    public ApiResponse<JsonNode> confirm(@PathVariable String id,@RequestBody WriteRequest request){
        try {
            return ApiResponse.success(service.write(CurrentUserHolder.require(),id,request.version(),request.sourceVersion(),request.patch(),true,request.choice()));
        } catch (Exception exception) {
            log.error("Request failed in confirm", exception);
            throw exception;
        }
    }

    @GetMapping("/history")
    public ApiResponse<ResponseService.History> history(@PathVariable String id) {
        try {
            return ApiResponse.success(service.history(CurrentUserHolder.require(), id));
        } catch (Exception exception) {
            log.error("Request failed in history", exception);
            throw exception;
        }
    }

    @PostMapping("/restore")
    public ApiResponse<JsonNode> restore(@PathVariable String id, @RequestBody RestoreRequest request) {
        try {
            return ApiResponse.success(service.restore(CurrentUserHolder.require(), id, request.version(), request.sourceVersion(),
                    request.kind(), request.historyVersion()));
        } catch (Exception exception) {
            log.error("Request failed in restore", exception);
            throw exception;
        }
    }
}
