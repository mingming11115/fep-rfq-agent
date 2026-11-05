package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.BusinessRecordService;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/rfq") @RequiredArgsConstructor
public class BusinessRecordController {
    private final BusinessRecordService service;
    @GetMapping("/projects/{id}/workflow-records")
    public ApiResponse<Map<String,Object>> workflow(@PathVariable String id){return ApiResponse.success(service.workflow(CurrentUserHolder.require(),id));}
    @GetMapping("/business-units/{buId}/resources")
    public ApiResponse<Map<String,Object>> resources(@PathVariable String buId){return ApiResponse.success(service.resources(CurrentUserHolder.require(),buId));}
}
