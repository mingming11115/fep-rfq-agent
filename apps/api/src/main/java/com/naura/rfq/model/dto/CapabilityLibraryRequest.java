package com.naura.rfq.model.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class CapabilityLibraryRequest {
    private CapabilityLibraryRequest() {}

    public record Draft(@PositiveOrZero Long revision, @Size(max = 64) String projectId,
            @Size(max = 128) String modelId, @Positive Integer modelVersion,
            @Size(max = 128) String processId, @Positive Integer processVersion, @Size(max = 200) String config,
            @Size(max = 100) String metricCode, @Size(max = 200) String metric, @Size(max = 8) String operator,
            @Digits(integer = 18, fraction = 12) BigDecimal lower, @Digits(integer = 18, fraction = 12) BigDecimal upper,
            Boolean lowerInclusive, Boolean upperInclusive, @Size(max = 40) String unit, @Size(max = 20) String valueType,
            @Size(max = 2000) String conditions, @Size(max = 2000) String limits,
            @Size(max = 20) List<@NotNull @Valid EvidenceRef> evidence) {}

    public record EvidenceRef(@NotBlank @Size(max = 128) String id, @NotNull @Positive Integer version,
            @NotBlank @Size(max = 500) String location) {}

    public record Model(@NotBlank @Size(max = 64) String code, @NotBlank @Size(max = 200) String name,
            @NotBlank @Size(max = 64) String modelRevision, @NotBlank @Size(max = 200) String config,
            @Size(max = 100) String series, @Size(max = 50) String lifecycle, @Size(max = 2000) String standard,
            @Size(max = 2000) String options) {}

    public record Process(@NotBlank @Size(max = 128) String modelId, @NotNull @Positive Integer modelVersion,
            @NotBlank @Size(max = 64) String code, @NotBlank @Size(max = 200) String name,
            @NotNull Boolean enabled, @Size(max = 2000) String conditions) {}

    public record Evidence(@NotBlank @Size(max = 255) String name, @NotBlank @Size(max = 500) String source,
            @NotBlank @Size(max = 500) String location, @Size(max = 64) String projectId,
            LocalDate expiry, @Size(max = 2000) String conditions) {}

    public record Review(@NotNull @PositiveOrZero Long revision, @Size(max = 900) String reason) {}

    public record Lookup(@NotBlank @Size(max = 128) String modelId, @Positive int modelVersion,
            @NotBlank @Size(max = 128) String processId, @Positive int processVersion,
            @NotBlank @Size(max = 200) String config, @NotBlank @Size(max = 100) String metricCode,
            @Size(max = 64) String projectId) {}
}
