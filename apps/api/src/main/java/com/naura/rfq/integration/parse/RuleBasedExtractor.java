package com.naura.rfq.integration.parse;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.naura.rfq.model.parse.ExtractedRequirement;
import com.naura.rfq.model.parse.RawBlock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Deterministic first-pass extractor. It preserves customer numbering and wording and
 * never rewrites meaning; anything it cannot judge is flagged for review instead of guessed.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RuleBasedExtractor implements RequirementExtractor {

    private static final int MAX_REQUIREMENT_CHARS = 4000;

    /** 1 / 1.1 / 1.1.1 with a separator or at least one space, so years are not mistaken for clauses. */
    private static final Pattern NUMBERING =
            Pattern.compile("^(\\d{1,2}(?:\\.\\d{1,2}){0,3})\\s*[.、．)）]?\\s+(\\S.*)$");
    private static final Pattern PAREN_NUMBERING = Pattern.compile("^[（(](\\d{1,2})[）)]\\s*(\\S.*)$");
    private static final Pattern CN_NUMBERING = Pattern.compile("^([一二三四五六七八九十]{1,3})[、.．]\\s*(\\S.*)$");
    private static final Pattern ALPHA_NUMBERING = Pattern.compile("^([a-zA-Z])[.)）]\\s+(\\S.{5,})$");

    private static final Pattern MANDATORY = Pattern.compile("应当|应|必须|须|不得|不应|禁止|需提供|需满足");
    private static final Pattern RECOMMENDED = Pattern.compile("宜|建议|推荐|可以|优先");
    private static final Pattern REFERENCE = Pattern.compile("见附图|参见|如图|如下表|见下表|见表|附图|附录|详见");
    private static final Pattern ENDS_LIKE_HEADING = Pattern.compile("[。；;：:，,、]");
    private static final Pattern DOCUMENT_PURPOSE = Pattern.compile(
            "本(?:文件|文档|资料)(?:用于|仅供)[^，,：:；;。]*(?:测试|演示|示例)(?:使用)?");
    private static final Pattern DEMO_CONTEXT = Pattern.compile(
            "(?:采购方|设备参数|商务条件)(?:[、和及](?:采购方|设备参数|商务条件))*均为(?:演示|测试|示例)(?:设定|数据|内容)");
    private static final Pattern DEMO_RESPONSE_GUIDANCE = Pattern.compile(
            "请供应商逐条填写应答[，,]说明满足情况、适用条件、证据及偏离");

    private static final Pattern METRIC = Pattern.compile(
            "(不低于|不小于|不少于|不大于|不超过|不高于|大于等于|小于等于|大于|小于|等于|≥|≤|＞|＜|>|<)?\\s*"
                    + "(-?\\d+(?:\\.\\d+)?)\\s*"
                    + "(MPa|kPa|Pa|bar|L/min|l/min|m3/h|m³/h|Nm3/h|℃|°C|mm|cm|km|kg|t|kV|V|A|kW|MW|%|Hz|r/min|rpm|dB|min|h|s)");

    private final ObjectMapper objectMapper;

    @Override
    public String name() {
        return "rule-based-v1";
    }

    @Override
    public List<ExtractedRequirement> extract(List<RawBlock> blocks) {
        List<ExtractedRequirement> results = new ArrayList<>();
        String inheritedSection = "";
        for (RawBlock block : blocks) {
            if (!block.hasText()) {
                continue;
            }
            if (block.sectionPath() != null && !block.sectionPath().isBlank()) {
                inheritedSection = block.sectionPath();
            }
            String section = inheritedSection;
            if (block.isTable()) {
                results.addAll(fromTable(block, section, results.size()));
                continue;
            }
            if (RawBlock.IMAGE.equals(block.type())) {
                continue;
            }
            ExtractedRequirement requirement = fromParagraph(block, section, results.size());
            if (requirement != null) {
                results.add(requirement);
            }
        }
        return results;
    }

    private ExtractedRequirement fromParagraph(RawBlock block, String section, int order) {
        String text = block.text().trim();
        ClauseNumber clause = detectNumbering(text);
        String body = clause == null ? text : clause.body.trim();

        if (isDocumentNotice(body)) {
            return null;
        }
        if (clause != null && isHeadingLike(body)) {
            return null;
        }
        if (!looksLikeRequirement(clause, body)) {
            return null;
        }

        List<String> reasons = new ArrayList<>();
        if (clause == null) {
            reasons.add("未识别到客户编号，需确认条款边界");
        }
        if (REFERENCE.matcher(body).find()) {
            reasons.add("引用了图表或附件，需核对原始位置");
        }
        String original = text.length() > MAX_REQUIREMENT_CHARS ? text.substring(0, MAX_REQUIREMENT_CHARS) : text;
        if (text.length() > MAX_REQUIREMENT_CHARS) {
            reasons.add("原文过长，已截断，建议拆分");
        }

        List<Map<String, String>> metrics = extractMetrics(body);
        if (metrics.isEmpty() && hasNumberWithoutUnit(body)) {
            reasons.add("检测到数值但未识别单位");
        }

        String clauseNo = clause == null ? null : clause.value;
        int level = clause == null ? 2 : clause.level;
        String parentClauseNo = clause == null ? null : parentOf(clause.value);

        return new ExtractedRequirement(
                order,
                block.index(),
                section,
                clauseNo,
                titleOf(body),
                level,
                parentClauseNo,
                original,
                body,
                metrics.isEmpty() ? null : writeJson(metrics),
                null,
                obligationOf(body),
                reasons.isEmpty() ? ExtractedRequirement.VALID : ExtractedRequirement.NEEDS_REVIEW,
                reasons.isEmpty() ? null : String.join("；", reasons));
    }

    private List<ExtractedRequirement> fromTable(RawBlock block, String section, int startOrder) {
        List<ExtractedRequirement> results = new ArrayList<>();
        List<List<String>> rows = block.tableRows();
        if (rows.isEmpty()) {
            return results;
        }
        int start = looksLikeHeader(rows.get(0)) ? 1 : 0;
        for (int rowIndex = start; rowIndex < rows.size(); rowIndex++) {
            List<String> cells = rows.get(rowIndex);
            String joined = joinCells(cells);
            if (joined.length() < 6 || isDocumentNotice(joined)) {
                continue;
            }
            List<Map<String, String>> metrics = extractMetrics(joined);
            List<String> reasons = new ArrayList<>();
            reasons.add("来自表格行，需核对表头与合并单元格");
            if (metrics.isEmpty() && hasNumberWithoutUnit(joined)) {
                reasons.add("检测到数值但未识别单位");
            }
            String clauseNo = cellNumber(cells);
            results.add(new ExtractedRequirement(
                    startOrder + results.size(),
                    block.index(),
                    section,
                    clauseNo,
                    titleOf(joined),
                    2,
                    null,
                    joined,
                    joined,
                    metrics.isEmpty() ? null : writeJson(metrics),
                    null,
                    obligationOf(joined),
                    ExtractedRequirement.NEEDS_REVIEW,
                    String.join("；", reasons)));
        }
        return results;
    }

    private String joinCells(List<String> cells) {
        List<String> filled = cells.stream().filter(cell -> !cell.isBlank()).toList();
        if (filled.isEmpty()) {
            return "";
        }
        if (filled.size() == 1) {
            return filled.get(0);
        }
        return String.join("：", filled);
    }

    private String cellNumber(List<String> cells) {
        if (cells.isEmpty()) {
            return null;
        }
        String first = cells.get(0).trim();
        return first.matches("\\d{1,3}(?:\\.\\d{1,3}){0,3}") ? first : null;
    }

    private boolean looksLikeHeader(List<String> row) {
        String joined = String.join("", row);
        return joined.matches(".*(序号|编号|名称|项目|参数|要求|指标|条款|单位).*") && !joined.matches(".*\\d+(\\.\\d+)?.*(MPa|mm|kg|℃|kV|kW|%).*");
    }

    private boolean looksLikeRequirement(ClauseNumber clause, String body) {
        if (body.isBlank()) {
            return false;
        }
        if (clause != null) {
            return body.length() >= 6;
        }
        return body.length() >= 15 && MANDATORY.matcher(body).find();
    }

    /** Only discard a wholly explanatory notice; keep any block containing a real requirement. */
    boolean isDocumentNotice(String text) {
        ClauseNumber clause = detectNumbering(text.trim());
        String body = clause == null ? text.trim() : clause.body.trim();
        boolean hasContext = false;
        for (String sentence : body.split("[。！？!?；;]+")) {
            sentence = sentence.trim();
            if (sentence.isEmpty()) {
                continue;
            }
            if (DOCUMENT_PURPOSE.matcher(sentence).matches() || DEMO_CONTEXT.matcher(sentence).matches()) {
                hasContext = true;
            } else if (!DEMO_RESPONSE_GUIDANCE.matcher(sentence).matches()) {
                return false;
            }
        }
        return hasContext;
    }

    private boolean isHeadingLike(String body) {
        if (body.length() > 24) {
            return false;
        }
        if (ENDS_LIKE_HEADING.matcher(body).find()) {
            return false;
        }
        return !MANDATORY.matcher(body).find() && !RECOMMENDED.matcher(body).find();
    }

    private ClauseNumber detectNumbering(String text) {
        Matcher matcher = NUMBERING.matcher(text);
        if (matcher.matches()) {
            String value = matcher.group(1);
            return new ClauseNumber(value, value.split("\\.").length, matcher.group(2));
        }
        matcher = PAREN_NUMBERING.matcher(text);
        if (matcher.matches()) {
            return new ClauseNumber("(" + matcher.group(1) + ")", 3, matcher.group(2));
        }
        matcher = CN_NUMBERING.matcher(text);
        if (matcher.matches()) {
            return new ClauseNumber(matcher.group(1), 1, matcher.group(2));
        }
        matcher = ALPHA_NUMBERING.matcher(text);
        if (matcher.matches()) {
            return new ClauseNumber(matcher.group(1), 4, matcher.group(2));
        }
        return null;
    }

    private String parentOf(String clauseNo) {
        int dot = clauseNo.lastIndexOf('.');
        return dot > 0 ? clauseNo.substring(0, dot) : null;
    }

    private String titleOf(String body) {
        String compact = body.replaceAll("\\s+", " ").trim();
        if (compact.length() <= 40) {
            return compact;
        }
        return compact.substring(0, 40) + "…";
    }

    private String obligationOf(String body) {
        if (MANDATORY.matcher(body).find()) {
            return "mandatory";
        }
        if (RECOMMENDED.matcher(body).find()) {
            return "recommended";
        }
        return "unknown";
    }

    private List<Map<String, String>> extractMetrics(String body) {
        List<Map<String, String>> metrics = new ArrayList<>();
        Matcher matcher = METRIC.matcher(body);
        while (matcher.find() && metrics.size() < 12) {
            Map<String, String> metric = new LinkedHashMap<>();
            metric.put("name", metricName(body, matcher.start()));
            metric.put("rawExpression", matcher.group().trim());
            metric.put("operator", operatorOf(matcher.group(1)));
            metric.put("value", matcher.group(2));
            metric.put("unit", matcher.group(3));
            metrics.add(metric);
        }
        return metrics;
    }

    private String metricName(String body, int valueStart) {
        int from = Math.max(0, valueStart - 24);
        String window = body.substring(from, valueStart);
        int cut = Math.max(window.lastIndexOf('，'), Math.max(window.lastIndexOf('。'), window.lastIndexOf('；')));
        String name = cut >= 0 ? window.substring(cut + 1) : window;
        name = name.replaceAll("^[的为是在]+", "").trim();
        return name.length() > 20 ? name.substring(name.length() - 20) : name;
    }

    private String operatorOf(String raw) {
        if (raw == null || raw.isBlank()) {
            return "unspecified";
        }
        return switch (raw) {
            case "不低于", "不小于", "不少于", "≥" -> "gte";
            case "不大于", "不超过", "不高于", "≤" -> "lte";
            case "大于", "＞", ">" -> "gt";
            case "小于", "＜", "<" -> "lt";
            case "大于等于" -> "gte";
            case "小于等于" -> "lte";
            case "等于" -> "eq";
            default -> "unspecified";
        };
    }

    private boolean hasNumberWithoutUnit(String body) {
        return Pattern.compile("(?<![\\d.])-?\\d+(?:\\.\\d+)?(?![\\d.%]|\\s*(MPa|kPa|mm|kg|t|V|A|kW|MW|Hz|℃|L/min|m3/h|min|h|s|dB|rpm|r/min|bar|Pa))")
                .matcher(body)
                .find();
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            log.error("序列化规则抽取结果失败", exception);
            return null;
        }
    }

    private record ClauseNumber(String value, int level, String body) {
    }
}
