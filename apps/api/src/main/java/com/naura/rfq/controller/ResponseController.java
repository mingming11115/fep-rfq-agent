package com.naura.rfq.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.ResponseService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rfq/requirements/{id}/response")
@RequiredArgsConstructor
public class ResponseController {
    private final ResponseService service;
    public record WriteRequest(Long version,Long sourceVersion,JsonNode patch) {}
    @PatchMapping
    public ApiResponse<JsonNode> save(@PathVariable String id,@RequestBody WriteRequest request){return ApiResponse.success(service.write(CurrentUserHolder.require(),id,request.version(),request.sourceVersion(),request.patch(),false));}
    @PostMapping("/confirm")
    public ApiResponse<JsonNode> confirm(@PathVariable String id,@RequestBody WriteRequest request){return ApiResponse.success(service.write(CurrentUserHolder.require(),id,request.version(),request.sourceVersion(),null,true));}
}
