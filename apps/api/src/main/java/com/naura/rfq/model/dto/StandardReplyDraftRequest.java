package com.naura.rfq.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record StandardReplyDraftRequest(
        @NotNull @PositiveOrZero Long revision,
        @NotBlank @Size(max = 200) String title,
        @NotBlank @Size(max = 4000) String requirement,
        @NotBlank @Size(max = 8000) String answer,
        @NotBlank @Size(max = 2000) String conditions) {
}
