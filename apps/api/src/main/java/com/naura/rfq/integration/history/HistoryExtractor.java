package com.naura.rfq.integration.history;

import com.naura.rfq.integration.parse.RuleBasedExtractor;
import com.naura.rfq.model.parse.RawBlock;
import com.naura.rfq.model.vo.HistoryClause;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Conservative extraction: preserve responses verbatim, never infer historical compliance. */
@Component
@RequiredArgsConstructor
public class HistoryExtractor {
    public record Result(Map<String, String> metadata, List<HistoryClause> clauses, List<String> issues) { }
    private static final Pattern NUMBER = Pattern.compile("^(\\d{1,3}(?:\\.\\d{1,3}){0,5}|[（(]\\d+[）)])(?:[.、．)）]\\s*|\\s+)(.+)$");
    private static final Pattern RESPONSE = Pattern.compile("^(?:历史答复|最终答复|供应商答复|答复|回复|应答|response|answer)\\s*[:：]\\s*(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Map<String, String> META = Map.of("客户", "customer", "客户名称", "customer", "项目", "projectName", "项目名称", "projectName", "机型", "model", "设备型号", "model", "配置", "config", "日期", "date", "版本", "fileVersion");
    private static final List<String> CUSTOMER_COLUMNS =
            List.of("number", "item", "specification", "revision", "requirement", "customerConditions");

    private final RuleBasedExtractor requirements;

    public Result extract(List<RawBlock> primary, List<RawBlock> companion) {
        Map<String, String> metadata = new LinkedHashMap<>();
        List<String> issues = new ArrayList<>();
        List<HistoryClause> clauses = read(primary, "main:", false, metadata, issues);
        List<HistoryClause> answers = read(companion, "answer:", true, new LinkedHashMap<>(), issues);
        Map<String, List<HistoryClause>> requirementsByNumber = group(clauses), answersByNumber = group(answers);
        List<HistoryClause> matched = new ArrayList<>();
        for (HistoryClause clause : clauses) {
            var candidates = answersByNumber.getOrDefault(clause.clauseNo(), List.of());
            if (clause.answer().isBlank() && !clause.clauseNo().isBlank() && candidates.size() == 1
                    && requirementsByNumber.get(clause.clauseNo()).size() == 1) {
                HistoryClause answer = candidates.get(0);
                clause = new HistoryClause(clause.key(), clause.clauseNo(), clause.section(), clause.requirement(),
                    answer.answer(), clause.conditions().isBlank() ? answer.conditions() : clause.conditions(),
                    clause.evidence().isBlank() ? answer.evidence() : clause.evidence(),
                    clause.feedback().isBlank() ? answer.feedback() : clause.feedback(), clause.requirementAnchor(),
                    answer.answerAnchor(), clause.issues(), clause.customerRequirement());
            }
            List<String> reasons = new ArrayList<>(clause.issues());
            if (clause.requirement().isBlank()) {
                reasons.add("缺少客户要求");
            }
            if (clause.answer().isBlank()) {
                reasons.add("缺少历史答复");
            }
            matched.add(new HistoryClause(clause.key(), clause.clauseNo(), clause.section(), clause.requirement(), clause.answer(),
                clause.conditions(), clause.evidence(), clause.feedback(), clause.requirementAnchor(), clause.answerAnchor(),
                reasons, clause.customerRequirement()));
        }
        for (HistoryClause answer : answers) {
            var same = requirementsByNumber.getOrDefault(answer.clauseNo(), List.of());
            if (answer.clauseNo().isBlank() || same.size() != 1 || answersByNumber.get(answer.clauseNo()).size() != 1
                    || !same.get(0).answer().isBlank()) {
                issues.add("配套答复条款 " + (answer.clauseNo().isBlank() ? "（无编号）" : answer.clauseNo()) + " 未关联，请在原文中核对：" + answer.answerAnchor());
            }
        }
        return new Result(metadata, matched, issues);
    }
    private Map<String, List<HistoryClause>> group(List<HistoryClause> clauses) {
        Map<String, List<HistoryClause>> grouped = new LinkedHashMap<>();
        for (var clause : clauses) grouped.computeIfAbsent(clause.clauseNo(), key -> new ArrayList<>()).add(clause);
        return grouped;
    }
    private List<HistoryClause> read(List<RawBlock> blocks, String prefix, boolean companion, Map<String, String> metadata, List<String> issues) {
        List<HistoryClause> clauses = new ArrayList<>();
        for (RawBlock block : blocks) {
            String anchor = prefix + block.anchor(), section = value(block.sectionPath());
            if (RawBlock.IMAGE.equals(block.type()) || block.issue() != null) {
                issues.add(anchor + "：" + (block.issue() == null ? "图片待识别／核对" : block.issue()));
                continue;
            }
            if (block.isTable()) { readTable(block, prefix, companion, clauses, issues); continue; }
            String text = value(block.text());
            if (text.isBlank()) {
                continue;
            }
            boolean meta = false;
            for (var entry : META.entrySet()) {
                var matcher = Pattern.compile("^" + entry.getKey() + "\\s*[:：]\\s*(.+)$").matcher(text);
                if (matcher.matches()) { metadata.putIfAbsent(entry.getValue(), matcher.group(1).trim()); meta = true; break; }
            }
            if (meta || (!section.isBlank() && section.endsWith(text))) {
                continue;
            }
            var response = RESPONSE.matcher(text);
            if (response.matches() && !clauses.isEmpty()) {
                int index = clauses.size() - 1; var last = clauses.get(index);
                clauses.set(index, new HistoryClause(last.key(), last.clauseNo(), last.section(), last.requirement(),
                    join(List.of(last.answer(), response.group(1))), last.conditions(), last.evidence(), last.feedback(),
                    last.requirementAnchor(), anchor, last.issues(), last.customerRequirement()));
                continue;
            }
            if (response.matches()) {
                issues.add(anchor + "：答复未关联到条款，需核对");
                continue;
            }
            var number = NUMBER.matcher(text);
            if (number.matches()) {
                String body = number.group(2).trim(); var labeled = RESPONSE.matcher(body);
                if (labeled.matches()) {
                    body = labeled.group(1);
                }
                String clauseNo = number.group(1);
                var customer = companion ? null : requirements.describeKnownRequirement(clauses.size(), block, clauseNo,
                        "", body, "", "", List.of());
                clauses.add(new HistoryClause(anchor, clauseNo, section, companion ? "" : body,
                    companion ? body : "", "", "", "", companion ? "" : anchor, companion ? anchor : "",
                    List.of(), customer));
            } else if (!companion && text.matches(".*(应|必须|需|不得|shall|must).*")) {
                var reasons = List.of("未识别条款编号，需核对边界");
                var customer = requirements.describeKnownRequirement(clauses.size(), block, "", "", text, "", "", reasons);
                clauses.add(new HistoryClause(anchor, "", section, text, "", "", "", "", anchor, "", reasons, customer));
            } else {
                issues.add(anchor + "：未归入条款的原文，需核对");
            }
        }
        return clauses;
    }
    private void readTable(RawBlock block, String prefix, boolean companion, List<HistoryClause> clauses, List<String> issues) {
        Map<String, List<Integer>> columns = new LinkedHashMap<>();
        List<Integer> customerColumns = List.of();
        boolean header = false;
        for (int r = 0; r < block.tableRows().size(); r++) {
            var row = block.tableRows().get(r);
            Map<String, List<Integer>> detected = new LinkedHashMap<>();
            for (int c = 0; c < row.size(); c++) {
                String kind = headerKind(row.get(c));
                if (kind != null) {
                    detected.computeIfAbsent(kind, key -> new ArrayList<>()).add(c);
                }
            }
            boolean hasRequirement = detected.containsKey("requirement")
                    || detected.containsKey("item") && detected.containsKey("specification");
            boolean headerRow = (!header && hasRequirement)
                    || detected.containsKey("number") && (hasRequirement || detected.containsKey("answer"));
            if (headerRow) {
                columns = detected;
                customerColumns = detected.entrySet().stream().filter(entry -> CUSTOMER_COLUMNS.contains(entry.getKey()))
                        .flatMap(entry -> entry.getValue().stream()).sorted().toList();
                header = true;
                continue;
            }
            String anchor = prefix + block.anchor() + "/r" + r;
            if (!header) { issues.add(anchor + "：表头未识别，请核对表格列并补录条款"); continue; }
            if (row.stream().allMatch(String::isBlank)) {
                continue;
            }
            String requirement = cells(row, columns.get("requirement")), answer = cells(row, columns.get("answer"));
            if (companion && answer.isBlank() && !columns.containsKey("answer")) {
                issues.add(anchor + "：配套文件未识别答复列"); continue;
            }
            String item = cells(row, columns.get("item"));
            String specification = cells(row, columns.get("specification"));
            if (requirement.isBlank()) {
                requirement = join(List.of(item, specification));
            }
            String clauseNo = cells(row, columns.get("number"));
            String section = value(block.sectionPath());
            var customer = companion ? null : requirements.describeKnownRequirement(clauses.size(),
                    RawBlock.table(block.index(), List.of(customerColumns.stream()
                            .filter(index -> index < row.size()).map(row::get).toList()), section, anchor),
                    clauseNo, item, requirement, specification, cells(row, columns.get("customerConditions")),
                    List.of("来自表格行，需核对表头与合并单元格"));
            clauses.add(new HistoryClause(anchor, clauseNo, section,
                requirement, answer, cells(row, columns.get("conditions")), cells(row, columns.get("evidence")),
                cells(row, columns.get("feedback")), companion ? "" : anchor, answer.isBlank() ? "" : anchor,
                List.of(), customer));
        }
    }
    private String headerKind(String input) {
        String text = value(input).toLowerCase().replaceAll("[\\s:：/（）()_-]", "");
        if (List.of("编号", "序号", "条款编号", "条款号", "no", "no.", "id", "clause", "clauseno").contains(text)) {
            return "number";
        }
        if (List.of("客户要求", "历史要求", "要求", "要求说明", "技术要求", "要求内容", "描述", "requirement",
                "requirements", "description", "描述description", "description描述").contains(text)) {
            return "requirement";
        }
        if (List.of("项目", "项目名称", "item", "项目item", "item项目").contains(text)) {
            return "item";
        }
        if (List.of("规格", "规格spec", "规格specification", "spec", "specification").contains(text)) {
            return "specification";
        }
        if (List.of("rev", "rev.", "revision").contains(text)) {
            return "revision";
        }
        if (List.of("客户条件", "客户要求条件", "customerconditions", "requirementconditions").contains(text)) {
            return "customerConditions";
        }
        if (List.of("历史答复", "最终答复", "答复", "回复", "应答", "供应商答复", "供应商回复", "供应商应答", "应答结论", "响应情况", "满足情况", "结论", "备注", "response", "answer", "compliance", "comply", "comments", "remarks", "vendorresponse").contains(text)) {
            return "answer";
        }
        if (List.of("适用条件", "条件", "适用条件与限制", "限制", "配置", "conditions").contains(text)) {
            return "conditions";
        }
        if (List.of("证据", "证据引用", "依据", "evidence").contains(text)) {
            return "evidence";
        }
        if (List.of("客户反馈", "验收结果", "反馈", "feedback").contains(text)) {
            return "feedback";
        }
        return null;
    }
    private String cells(List<String> row, List<Integer> indexes) {
        if (indexes == null) {
            return "";
        }
        return join(indexes.stream().filter(index -> index < row.size()).map(row::get).toList());
    }
    private String join(List<String> parts) { return String.join("\n", parts.stream().map(this::value).filter(part -> !part.isBlank()).toList()); }
    private String value(String text) { return text == null ? "" : text.trim(); }
}
