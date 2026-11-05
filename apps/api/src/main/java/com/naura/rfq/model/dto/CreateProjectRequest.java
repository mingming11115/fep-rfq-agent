package com.naura.rfq.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateProjectRequest(
        @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{2,32}", message = "项目编号仅支持字母、数字、下划线和短横线") String code,
        @NotBlank @Size(max=200) String name,
        @Size(max=200) String customer,
        String ownerId,
        String buId,
        String deadline) {
}
