package com.naura.rfq.model.parse;

/**
 * Word 模型解析的一个批次执行结果。批次按解析运行内从 1 开始编号，
 * status 取本类的常量；primarySources 为该批主要来源的 S 编号列表（如 "S12,S13"）。
 */
public record BatchAttempt(int index, String status, String primarySources, int chars, String failureReason) {

    public static final String SUCCESS = "success";
    public static final String FAILED = "failed";
    public static final String SKIPPED = "skipped";
}
