package com.naura.rfq.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

final class HistoryCapabilityExtraction {
    private static final Pattern METRIC = Pattern.compile(
            "(?m)^\\s*([^：:\\r\\n]{1,80})[：:][ \\t]*(≤|>=|≥|<=|<|>|=|不超过|不低于)[ \\t]*"
            + "([+-]?\\d{1,18}(?:\\.\\d{1,12})?)[ \\t]*([a-zA-Zμµ°%][a-zA-Z0-9μµ°%/·²³^_-]{0,19})[ \\t]*[。；;]?[ \\t]*$");

    record Suggested(String metric, String operator, String lower, String upper, String unit, String conditions, String quote) {}

    private HistoryCapabilityExtraction() {}

    static List<Suggested> fromAnswer(String answer, String conditions) {
        var result = new ArrayList<Suggested>();
        var matches = METRIC.matcher(answer);
        while (result.size() < 20 && matches.find()) {
            String operator = switch (matches.group(2)) {
                case "≤", "<=", "不超过" -> "LE";
                case "≥", ">=", "不低于" -> "GE";
                case "<" -> "LT";
                case ">" -> "GT";
                default -> "EQ";
            };
            String bound = new BigDecimal(matches.group(3)).toPlainString();
            boolean upper = "LE".equals(operator) || "LT".equals(operator);
            result.add(new Suggested(matches.group(1).strip(), operator, upper ? "" : bound, upper ? bound : "",
                    matches.group(4), conditions, matches.group().strip()));
        }
        return result;
    }
}
