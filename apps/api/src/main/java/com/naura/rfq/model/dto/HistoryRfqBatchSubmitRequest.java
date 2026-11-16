package com.naura.rfq.model.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;

public record HistoryRfqBatchSubmitRequest(@Valid @NotEmpty List<Clause> clauses) {

    public record Clause(@NotBlank String id, @Positive int version, @PositiveOrZero long revision) {}
}
