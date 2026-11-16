package com.naura.rfq.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.naura.rfq.common.exception.BusinessException;
import com.naura.rfq.model.dto.CapabilityLibraryRequest.Lookup;
import com.naura.rfq.model.dto.RequirementMatchRequest.Context;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
@Slf4j
class CapabilityMatch {
    private record Unit(String dimension, BigDecimal factor) {}
    private record Interval(BigDecimal lower, BigDecimal upper, boolean lowerClosed, boolean upperClosed) {
        Interval scale(BigDecimal factor) {
            return new Interval(lower == null ? null : lower.multiply(factor), upper == null ? null : upper.multiply(factor), lowerClosed, upperClosed);
        }

        boolean contains(Interval other) {
            return atLeast(lower, lowerClosed, other.lower, other.lowerClosed)
                    && atLeast(negate(upper), upperClosed, negate(other.upper), other.upperClosed);
        }

        boolean disjoint(Interval other) {
            return before(upper, upperClosed, other.lower, other.lowerClosed) || before(other.upper, other.upperClosed, lower, lowerClosed);
        }

        private static boolean atLeast(BigDecimal bound, boolean closed, BigDecimal other, boolean otherClosed) {
            if (bound == null) {
                return true;
            }
            if (other == null) {
                return false;
            }
            int cmp = other.compareTo(bound);
            return cmp > 0 || cmp == 0 && (closed || !otherClosed);
        }

        private static boolean before(BigDecimal end, boolean endClosed, BigDecimal start, boolean startClosed) {
            if (end == null || start == null) {
                return false;
            }
            int cmp = end.compareTo(start);
            return cmp < 0 || cmp == 0 && !(endClosed && startClosed);
        }

        private static BigDecimal negate(BigDecimal value) { return value == null ? null : value.negate(); }
    }
    private record MetricOutcome(boolean hasEligible, boolean invalidEvidence, boolean supports, boolean refutes,
            boolean needsReview) {}
    private static final class CapabilityCounts {
        int recalled;
        int eligible;
        int ineligible;
        int supports;
        int refutes;
        int review;
        int noCandidate;

        void assessment(String value) {
            switch (value) {
                case "supports" -> supports++;
                case "refutes" -> refutes++;
                case "review" -> review++;
                default -> noCandidate++;
            }
        }
    }
    private static final Map<String, Unit> UNITS = Map.ofEntries(
            Map.entry("μm", unit("length", "0.000001")), Map.entry("µm", unit("length", "0.000001")),
            Map.entry("um", unit("length", "0.000001")), Map.entry("mm", unit("length", "0.001")),
            Map.entry("cm", unit("length", "0.01")), Map.entry("m", unit("length", "1")),
            Map.entry("Pa", unit("pressure", "1")), Map.entry("kPa", unit("pressure", "1000")),
            Map.entry("MPa", unit("pressure", "1000000")), Map.entry("bar", unit("pressure", "100000")),
            Map.entry("s", unit("time", "1")), Map.entry("min", unit("time", "60")), Map.entry("h", unit("time", "3600")),
            Map.entry("g", unit("mass", "0.001")), Map.entry("kg", unit("mass", "1")), Map.entry("t", unit("mass", "1000")));
    @Autowired
    private CapabilityLibraryService library;
    @Autowired
    private KnowledgeGroupService groups;
    @Autowired
    private ObjectMapper json;

    void validate(String bu, Context context) {
        if (context.devices() == null) {
            return;
        }
        var seen = new HashSet<String>();
        if (Boolean.FALSE.equals(context.capabilityApplicable()) && !context.devices().isEmpty()) {
            throw new BusinessException(400, "不适用机型能力时不能同时设置设备指标");
        }
        for (var device : context.devices()) {
            if (!seen.add(device.deviceId()) || !library.validMatchBaseline(bu, device.modelId(), device.modelVersion(),
                    device.processId(), device.processVersion(), device.config())) {
                throw new BusinessException(422, "设备项重复或机型、工艺、配置版本不属于当前 BU 的有效基线");
            }
            for (var metric : device.metrics()) {
                if (interval(metric.operator(), metric.lower(), metric.upper(), metric.lowerInclusive(), metric.upperInclusive()) == null) {
                    throw new BusinessException(422, "指标运算符与上下限或端点配置不一致");
                }
            }
        }
    }

    ObjectNode evaluate(String bu, String project, String groupId, JsonNode context) {
        return evaluate(bu, project, groupId, context, false);
    }

    ObjectNode evaluate(String bu, String project, String groupId, JsonNode context, boolean diagnostic) {
        var stage = json.createObjectNode();
        if (context.path("capabilityApplicable").isBoolean() && !context.path("capabilityApplicable").asBoolean()) {
            return stage.put("status", "not_applicable");
        }
        var devices = context.path("devices");
        if (!devices.isArray() || devices.isEmpty()) {
            return stage.put("status", "blocked").put("reason", "MISSING_CAPABILITY_INPUT");
        }
        var checks = stage.putArray("checks");
        // 一次比对内共用同一份分组范围，避免逐设备、逐指标重复读取目录。
        var groupScope = groups.scopeIds(bu, groupId);
        var counts = new CapabilityCounts();
        boolean found = false, unresolved = false, contradicted = false, unavailable = false;
        int checkCount = 0;
        Set<String> limits = new HashSet<>();
        for (JsonNode device : devices) {
            if (!library.validMatchBaseline(bu, text(device, "modelId"), device.path("modelVersion").asInt(),
                    text(device, "processId"), device.path("processVersion").asInt(), text(device, "config"))) {
                return stage.put("status", "blocked").put("reason", "MISSING_CAPABILITY_INPUT");
            }
            for (JsonNode metric : device.path("metrics")) {
                checkCount++;
                var outcome = evaluateMetric(bu, project, groupScope, device, metric, checks, limits, counts, diagnostic);
                found |= outcome.hasEligible();
                unavailable |= outcome.invalidEvidence();
                contradicted |= outcome.refutes() && !outcome.supports() && !outcome.needsReview() && !outcome.invalidEvidence();
                unresolved |= !outcome.supports() || outcome.refutes() || outcome.needsReview() || outcome.invalidEvidence();
            }
        }
        stage.put("recalledCandidates", counts.recalled).put("eligibleCandidates", counts.eligible)
                .put("ineligibleCandidates", counts.ineligible).put("supportCandidates", counts.supports)
                .put("refuteCandidates", counts.refutes).put("reviewCandidates", counts.review)
                .put("noCandidateCount", counts.noCandidate);
        if (!found) {
            return unavailable ? stage.put("status", "blocked").put("reason", "CAPABILITY_EVIDENCE_UNAVAILABLE")
                : stage.put("status", "miss");
        }
        String conclusion = contradicted ? "不满足" : unresolved || checkCount > 1 && !limits.isEmpty() ? "待确认"
                : limits.isEmpty() ? "Comply" : "有条件 Comply";
        stage.put("status", "hit").put("conclusion", conclusion);
        var restrictions = stage.putArray("restrictions");
        limits.stream().sorted().forEach(restrictions::add);
        return stage;
    }

    private MetricOutcome evaluateMetric(String bu, String project, List<String> groupScope, JsonNode device,
            JsonNode metric, ArrayNode checks, Set<String> limits, CapabilityCounts counts, boolean diagnostic) {
        var check = checks.addObject().put("deviceId", text(device, "deviceId"));
        check.set("requirement", metric);
        var evidence = check.putArray("candidates");
        var lookup = new Lookup(text(device, "modelId"), device.path("modelVersion").asInt(),
                text(device, "processId"), device.path("processVersion").asInt(), text(device, "config"),
                text(metric, "metricCode"), project);
        boolean supports = false, refutes = false, needsReview = false, invalidEvidence = false, hasEligible = false;
        for (ObjectNode row : library.matchingVersions(bu, project, groupScope, lookup)) {
            counts.recalled++;
            if (!row.path("eligible").asBoolean()) {
                counts.ineligible++;
                if (diagnostic) {
                    log.debug("requirement.match.capability.candidate deviceId={} metricCode={} id={} version={}"
                                    + " assessment=ineligible reason={} validity={} status={} evidenceRefs={}",
                            text(device, "deviceId"), text(metric, "metricCode"), text(row, "id"), row.path("version").asInt(),
                            ineligibleReason(row), text(row, "validity"), text(row, "status"), row.path("evidenceRefs").size());
                }
                invalidEvidence = true;
                continue;
            }
            counts.eligible++;
            hasEligible = true;
            String assessment = assess(device, metric, row);
            counts.assessment(assessment);
            var candidate = evidence.addObject().put("id", text(row, "id")).put("version", row.path("version").asInt())
                    .put("assessment", assessment).put("value", text(row, "value")).put("conditions", text(row, "conditions"))
                    .put("valueType", text(row, "valueType")).put("limits", text(row, "limits"));
            candidate.set("evidenceRefs", row.path("evidenceRefs"));
            if (diagnostic) {
                log.debug("requirement.match.capability.candidate deviceId={} metricCode={} id={} version={}"
                                + " assessment={} value={} conditions={}",
                        text(device, "deviceId"), text(metric, "metricCode"), text(row, "id"), row.path("version").asInt(),
                        assessment, text(row, "value"), text(row, "conditions"));
            }
            supports |= "supports".equals(assessment);
            refutes |= "refutes".equals(assessment);
            needsReview |= "review".equals(assessment);
            if ("supports".equals(assessment) && !text(row, "limits").isBlank()) {
                limits.add(text(row, "limits"));
            }
        }
        check.put("assessment", invalidEvidence ? "evidence_unavailable" : supports && !refutes && !needsReview ? "supports"
                : refutes && !supports && !needsReview ? "refutes" : hasEligible ? "review" : "no_candidate");
        return new MetricOutcome(hasEligible, invalidEvidence, supports, refutes, needsReview);
    }

    private static String ineligibleReason(JsonNode row) {
        String validity = text(row, "validity");
        if (!"已发布".equals(text(row, "status")) || List.of("被替代", "已撤销", "已过期").contains(validity)) {
            return "NOT_ACTIVE";
        }
        if (!"有效".equals(validity)) {
            return "INVALID_VALIDITY";
        }
        if (row.path("lower").isMissingNode() || row.path("upper").isMissingNode()) {
            return "INVALID_BOUNDS";
        }
        if (row.path("evidenceRefs").isEmpty()) {
            return "MISSING_EVIDENCE";
        }
        return "INELIGIBLE";
    }

    private String assess(JsonNode device, JsonNode metric, JsonNode row) {
        if (!"保证值".equals(text(row, "valueType")) || !sameConditions(text(device, "conditions"), text(row, "conditions"))) {
            return "review";
        }
        Interval required = readInterval(metric), capability = readInterval(row);
        if (required == null || capability == null) {
            return "review";
        }
        String expectedUnit = text(metric, "unit"), actualUnit = text(row, "unit");
        if (!expectedUnit.equals(actualUnit)) {
            var expected = UNITS.get(expectedUnit);
            var actual = UNITS.get(actualUnit);
            if (expected == null || actual == null || !expected.dimension().equals(actual.dimension())) {
                return "review";
            }
            required = required.scale(expected.factor());
            capability = capability.scale(actual.factor());
        }
        if (required.contains(capability)) {
            return "supports";
        }
        return capability.disjoint(required) ? "refutes" : "review";
    }

    private static boolean sameConditions(String left, String right) {
        return !left.isBlank() && left.strip().equals(right.strip());
    }

    private static Interval readInterval(JsonNode row) {
        return interval(text(row, "operator"), number(row.path("lower")), number(row.path("upper")),
                row.path("lowerInclusive").isBoolean() ? row.path("lowerInclusive").asBoolean() : null,
                row.path("upperInclusive").isBoolean() ? row.path("upperInclusive").asBoolean() : null);
    }

    private static BigDecimal number(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return null;
        }
        try { return new BigDecimal(node.asText()); }
        catch (NumberFormatException failure) {
            log.error("解析能力匹配数值失败 errorType={}", failure.getClass().getSimpleName());
            return null;
        }
    }

    private static Interval interval(String op, BigDecimal lower, BigDecimal upper, Boolean lc, Boolean uc) {
        return switch (op) {
            case "LT", "LE" -> lower == null && upper != null ? new Interval(null, upper, false, "LE".equals(op)) : null;
            case "GT", "GE" -> lower != null && upper == null ? new Interval(lower, null, "GE".equals(op), false) : null;
            case "EQ" -> lower != null && upper == null ? new Interval(lower, lower, true, true) : null;
            case "RANGE" -> lower != null && upper != null && lc != null && uc != null && lower.compareTo(upper) < 0
                    ? new Interval(lower, upper, lc, uc) : null;
            default -> null;
        };
    }

    private static Unit unit(String dimension, String factor) { return new Unit(dimension, new BigDecimal(factor)); }
    private static String text(JsonNode node, String field) { return node.path(field).asText(""); }
}
