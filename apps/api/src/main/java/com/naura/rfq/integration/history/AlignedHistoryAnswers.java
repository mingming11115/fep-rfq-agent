package com.naura.rfq.integration.history;

import com.naura.rfq.model.parse.RawBlock;
import com.naura.rfq.model.parse.RawBlock.ParagraphLayout;
import com.naura.rfq.model.vo.HistoryClause;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Associates a standalone compliance paragraph with the Word heading or clause at its text position. */
final class AlignedHistoryAnswers {
    private static final Pattern COMPLIANCE = Pattern.compile(
            "^(→|->|(?:\\\\)?=>)?\\s*"
                    + "((?:(?:conditional|partial|partially|not)\\s+|non[- ])?comply|not\\s+applicable)\\b(.*)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern EXPLANATION = Pattern.compile("^[,，。:：;；(（—–-].*");
    private static final Pattern TABLE_ROW = Pattern.compile("/r\\d+$");

    private record Scope(Scope parent, ParagraphLayout layout, String number, String anchor) {
        boolean heading() {
            return layout.headingLevel() > 0;
        }

        boolean contains(ParagraphLayout child, String childNumber) {
            if (layout.listId() != null && layout.listId().equals(child.listId())) {
                return child.listLevel() > layout.listLevel();
            }
            if (!number.isBlank() && !childNumber.isBlank()) {
                return childNumber.startsWith(number + ".");
            }
            return child.textStartTwips() > layout.textStartTwips();
        }
    }

    private record Reply(String text, String anchor) { }

    private AlignedHistoryAnswers() { }

    static String answerText(String text) {
        if (text == null) {
            return null;
        }
        var match = COMPLIANCE.matcher(text.strip());
        if (!match.matches()) {
            return null;
        }
        String detail = match.group(3);
        if (match.group(1) == null && !detail.isBlank() && !EXPLANATION.matcher(detail.strip()).matches()) {
            return null;
        }
        return (match.group(2) + detail).strip();
    }

    static List<HistoryClause> apply(List<RawBlock> blocks, List<HistoryClause> clauses, List<String> issues) {
        if (blocks.stream().noneMatch(block -> answerText(block.text()) != null)) {
            return clauses;
        }
        var byAnchor = clauses.stream().collect(Collectors.groupingBy(
                clause -> TABLE_ROW.matcher(clause.requirementAnchor()).replaceFirst("")));
        var scopeByClause = new HashMap<String, Scope>();
        var replies = new HashMap<String, Reply>();
        var conflicts = new HashSet<String>();
        Deque<Scope> outline = new ArrayDeque<>();
        for (var block : blocks) {
            String anchor = "main:" + block.anchor();
            var layout = block.paragraphLayout();
            var atSource = byAnchor.getOrDefault(anchor, List.of());
            if (block.isTable()) {
                closeClauses(outline);
            } else if (layout != null && layout.headingLevel() > 0) {
                closeClauses(outline);
                while (!outline.isEmpty() && outline.peek().layout().headingLevel() >= layout.headingLevel()) {
                    outline.pop();
                }
                outline.push(new Scope(outline.peek(), layout, "", anchor));
            } else {
                String answer = answerText(block.text());
                if (answer != null) {
                    var scope = layout == null ? null : alignedScope(outline, layout.textStartTwips());
                    if (scope == null) {
                        issues.add(anchor + "：未找到同缩进的标题或条款，需核对历史答复");
                    } else {
                        var previous = replies.putIfAbsent(scope.anchor(), new Reply(answer, anchor));
                        if (previous != null && !previous.text().equals(answer)) {
                            conflicts.add(scope.anchor());
                            issues.add(anchor + "：同一标题或条款有冲突的历史答复，需核对");
                        }
                    }
                    continue;
                }
                if (layout != null && !atSource.isEmpty()) {
                    String number = atSource.get(0).clauseNo();
                    while (!outline.isEmpty() && !outline.peek().heading()
                            && !outline.peek().contains(layout, number)) {
                        outline.pop();
                    }
                    outline.push(new Scope(outline.peek(), layout, number, anchor));
                }
            }
            if (!outline.isEmpty()) {
                atSource.forEach(clause -> scopeByClause.put(clause.key(), outline.peek()));
            }
        }
        var answered = new ArrayList<HistoryClause>(clauses.size());
        for (var clause : clauses) {
            if (clause.answer().isBlank()) {
                for (Scope scope = scopeByClause.get(clause.key()); scope != null; scope = scope.parent()) {
                    if (conflicts.contains(scope.anchor())) {
                        break;
                    }
                    var reply = replies.get(scope.anchor());
                    if (reply != null) {
                        clause = new HistoryClause(clause.key(), clause.clauseNo(), clause.section(), clause.requirement(),
                                reply.text(), clause.conditions(), clause.evidence(), clause.feedback(),
                                clause.requirementAnchor(), reply.anchor(), clause.issues(), clause.customerRequirement());
                        break;
                    }
                }
            }
            answered.add(clause);
        }
        return answered;
    }

    private static void closeClauses(Deque<Scope> outline) {
        while (!outline.isEmpty() && !outline.peek().heading()) {
            outline.pop();
        }
    }

    private static Scope alignedScope(Deque<Scope> outline, int position) {
        Scope nearest = null;
        for (var scope : outline) {
            if (scope.layout().textStartTwips() == position) {
                if (scope.heading()) {
                    return scope;
                }
                if (nearest == null) {
                    nearest = scope;
                }
            }
        }
        return nearest;
    }
}
