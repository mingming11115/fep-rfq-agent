package com.naura.rfq.model.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;

public final class RequirementMatchRequest {
    private RequirementMatchRequest() {}

    public record Policy(@NotNull @PositiveOrZero Long version, @NotNull @Size(min = 3, max = 3) List<String> matchOrder) {}

    public record Retry(@NotNull @PositiveOrZero Long sourceRequirementVersion,
            @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{1,64}") String requestId) {}

    public record Input(@NotNull @PositiveOrZero Long sourceRequirementVersion, @NotNull @PositiveOrZero Long version,
            @NotNull @Valid Context context) {}

    public record Context(Boolean capabilityApplicable, @Size(max = 1000) String verifiedConditions,
            @Size(max = 8) List<@NotNull @Valid Device> devices) {}

    public record Device(@NotBlank @Size(max = 64) String deviceId, @NotBlank @Size(max = 128) String modelId,
            @NotNull @Positive Integer modelVersion, @NotBlank @Size(max = 128) String processId,
            @NotNull @Positive Integer processVersion, @NotBlank @Size(max = 200) String config,
            @NotBlank @Size(max = 2000) String conditions,
            @NotNull @Size(min = 1, max = 8) List<@NotNull @Valid Metric> metrics) {}

    public record Metric(@NotBlank @Size(max = 100) String metricCode,
            @NotBlank @Pattern(regexp = "LT|LE|GT|GE|EQ|RANGE") String operator,
            @Digits(integer = 18, fraction = 12) BigDecimal lower, @Digits(integer = 18, fraction = 12) BigDecimal upper,
            Boolean lowerInclusive, Boolean upperInclusive, @NotBlank @Size(max = 40) String unit) {}
}
