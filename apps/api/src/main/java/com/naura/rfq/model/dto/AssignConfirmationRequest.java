package com.naura.rfq.model.dto;

import jakarta.validation.constraints.*;

public record AssignConfirmationRequest(@NotBlank @Size(max=64) String userId,
        @NotNull @PositiveOrZero Long version, @NotBlank @Size(max=900) String reason) {}
