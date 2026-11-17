package com.naura.rfq.model.vo;

import java.util.ArrayList;
import java.util.List;

/**
 * 重解析前的下游产物摘要：该文档已产生的应答、评审、定稿与人工修正计数，以及涉及的条款号样本。
 *
 * <p>重解析不拦截任何情况，本视图只用于提交前告知用户「哪些记录会受影响」。
 * 人工修正、应答与确认人按条款号带到新结果上，原文变化的条款退回待确认。
 *
 * @param responses 已产生应答的条款数
 * @param reviews   已进入评审的条款数
 * @param snapshots 包含该文档的定稿快照份数
 * @param edited    人工修正过且未删除的条款数
 * @param clauses   已应答或已评审的条款号样本（已排序，可能为空）
 */
public record ParseBlockerView(int responses, int reviews, int snapshots, int edited, List<String> clauses) {

    /**
     * 生成可直接拼入提示文案的明细描述。
     *
     * @return 形如「应答 3 条、评审 1 条，涉及条款 3.2、4.1」；无下游产物时返回空串
     */
    public String summary() {
        List<String> parts = new ArrayList<>();
        if (responses > 0) {
            parts.add("应答 " + responses + " 条");
        }
        if (reviews > 0) {
            parts.add("评审 " + reviews + " 条");
        }
        if (snapshots > 0) {
            parts.add("定稿快照 " + snapshots + " 份");
        }
        if (edited > 0) {
            parts.add("人工修正 " + edited + " 条");
        }
        if (parts.isEmpty()) {
            return "";
        }
        String detail = String.join("、", parts);
        if (clauses != null && !clauses.isEmpty()) {
            detail += "，涉及条款 " + String.join("、", clauses);
        }
        return detail;
    }
}
