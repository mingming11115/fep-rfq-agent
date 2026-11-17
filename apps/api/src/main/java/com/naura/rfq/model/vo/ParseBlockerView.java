package com.naura.rfq.model.vo;

import java.util.ArrayList;
import java.util.List;

/**
 * 重解析前的阻断项摘要：该文档已产生的应答、评审、定稿三类下游产物计数，以及涉及的条款号样本。
 *
 * <p>重解析会整体替换条款并重新分配 ID，旧产物只能变成无法回溯的悬空记录，
 * 因此这三类产物存在时拒绝重解析。本视图同时供前端在提交前展示「会撞上什么」，
 * 避免用户只看到一句无法操作的 409。
 *
 * @param responses 已产生应答的条款数
 * @param reviews   已进入评审的条款数
 * @param snapshots 包含该文档的定稿快照份数
 * @param clauses   已应答或已评审的条款号样本（已排序，可能为空）
 */
public record ParseBlockerView(int responses, int reviews, int snapshots, List<String> clauses) {

    /** 是否存在阻断重解析的下游产物。 */
    public boolean blocked() {
        return responses > 0 || reviews > 0 || snapshots > 0;
    }

    /**
     * 生成可直接拼入 409 文案的明细描述。
     *
     * @return 形如「应答 3 条、评审 1 条，涉及条款 3.2、4.1」；无阻断项时返回空串
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
