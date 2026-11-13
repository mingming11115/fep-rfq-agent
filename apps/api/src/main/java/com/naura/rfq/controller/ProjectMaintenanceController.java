package com.naura.rfq.controller;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.databind.JsonNode;
import com.naura.rfq.common.api.ApiResponse;
import com.naura.rfq.model.vo.ProjectView;
import com.naura.rfq.security.CurrentUserHolder;
import com.naura.rfq.service.ProjectMaintenanceService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import lombok.Setter;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rfq/projects")
@RequiredArgsConstructor
@Slf4j
public class ProjectMaintenanceController {
    private final ProjectMaintenanceService service;

    @Getter
    public static class ActionRequest {
        @NotNull @PositiveOrZero private Long version;
        @NotBlank @Size(max=500) private String reason;
        @JsonSetter public void setVersion(JsonNode value) {
            if(!value.isIntegralNumber() || !value.canConvertToLong()) {
                throw new IllegalArgumentException("版本必须是整数");
            }
            version=value.longValue();
        }
        public void setReason(String value) { reason=value; }
        @JsonAnySetter public void rejectUnknown(String key,Object value) { throw new IllegalArgumentException("不支持的字段："+key); }
    }
    public static class PatchRequest extends ActionRequest {
        @Getter @Size(max=200) private String name;
        @Getter @Size(max=200) private String customer;
        @Getter private LocalDate deadline;
        private boolean customerPresent,deadlinePresent;
        public boolean hasCustomer() { return customerPresent; }
        public boolean hasDeadline() { return deadlinePresent; }
        @JsonSetter public void setName(JsonNode value) {
            if(!value.isTextual() || value.textValue().isBlank()) {
                throw new IllegalArgumentException("项目名称不能为空");
            }
            name=value.textValue().trim();
        }
        @JsonSetter public void setCustomer(JsonNode value) {
            if(!value.isNull() && !value.isTextual()) {
                throw new IllegalArgumentException("客户须为文本");
            }
            customerPresent=true;customer=value.isNull()?null:value.textValue().trim();
        }
        @JsonSetter public void setDeadline(JsonNode value) {
            if(!value.isNull() && !value.isTextual()) {
                throw new IllegalArgumentException("截止日期须为文本");
            }
            deadlinePresent=true;deadline=ProjectMaintenanceService.parseDeadline(value.isNull()?null:value.textValue());
        }
    }
    @Getter @Setter
    public static class HandoverRequest extends ActionRequest {
        @NotBlank @Size(max=64) private String ownerId;
    }

    @PatchMapping("/{id}")
    public ApiResponse<ProjectView> patch(@PathVariable String id,@Valid @RequestBody PatchRequest request) {
        try {
            var command=new ProjectMaintenanceService.PatchCommand(request.getVersion(),request.getReason(),request.getName(),
                    request.hasCustomer(),request.getCustomer(),request.hasDeadline(),request.getDeadline());
            return ApiResponse.success(ProjectView.of(service.patch(CurrentUserHolder.require(),id,command)));
        } catch (Exception exception) {
            log.error("Request failed in patch", exception);
            throw exception;
        }
    }
    @PostMapping("/{id}/handovers")
    public ApiResponse<ProjectView> handover(@PathVariable String id,@Valid @RequestBody HandoverRequest request) {
        try {
            return ApiResponse.success(ProjectView.of(service.handover(CurrentUserHolder.require(),id,
                    request.getVersion(),request.getOwnerId(),request.getReason())));
        } catch (Exception exception) {
            log.error("Request failed in handover", exception);
            throw exception;
        }
    }
    @DeleteMapping("/{id}")
    public ApiResponse<ProjectView> delete(@PathVariable String id,@RequestParam @PositiveOrZero long version) {
        try {
            return ApiResponse.success(ProjectView.of(service.softDelete(CurrentUserHolder.require(),id,version,null)));
        } catch (Exception exception) {
            log.error("Request failed in delete", exception);
            throw exception;
        }
    }
    @PostMapping("/{id}/archives")
    public ApiResponse<ProjectView> archive(@PathVariable String id,@Valid @RequestBody ActionRequest request) {
        try {
            return ApiResponse.success(ProjectView.of(service.softDelete(CurrentUserHolder.require(),id,request.getVersion(),request.getReason())));
        } catch (Exception exception) {
            log.error("Request failed in archive", exception);
            throw exception;
        }
    }
    @PostMapping("/{id}/restorations")
    public ApiResponse<ProjectView> restore(@PathVariable String id,@Valid @RequestBody ActionRequest request) {
        try {
            return ApiResponse.success(ProjectView.of(service.restore(CurrentUserHolder.require(),id,request.getVersion(),request.getReason())));
        } catch (Exception exception) {
            log.error("Request failed in restore", exception);
            throw exception;
        }
    }
}
