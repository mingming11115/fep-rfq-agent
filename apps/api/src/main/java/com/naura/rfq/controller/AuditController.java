package com.naura.rfq.controller;

import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.common.api.PageView;
import com.naura.rfq.model.entity.AuditEvent;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.AuditQueryService;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rfq")
@RequiredArgsConstructor
public class AuditController {
    private final AuditQueryService service;

    @GetMapping("/audit")
    public ApiResponse<PageView<AuditEvent>> list(@RequestParam(defaultValue="1") int page,
            @RequestParam(defaultValue="20") int size,@RequestParam(required=false) String sort,
            @RequestParam(required=false) String buId,@RequestParam(required=false) String actorId,
            @RequestParam(required=false) String action,@RequestParam(required=false) String objectType,
            @RequestParam(required=false) String objectId,@RequestParam(required=false) String result,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant createdFrom,
            @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) Instant createdTo) {
        return ApiResponse.success(service.list(CurrentUserHolder.require(), page, size, sort, buId, actorId, action, objectType, objectId, result, createdFrom, createdTo));
    }

    @GetMapping("/projects/{id}/activity")
    public ApiResponse<List<AuditEvent>> projectActivity(@PathVariable String id) {
        return ApiResponse.success(service.listProjectActivity(CurrentUserHolder.require(), id));
    }
}
