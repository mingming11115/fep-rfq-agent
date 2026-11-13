package com.naura.rfq.service;

/**
 * 解析阶段，用于失败时在结构化日志中定位出错环节；label 保持原日志中的小写取值，
 * title 用于拼装面向用户的失败提示。
 */
enum ParsePhase {
    READ("read", "读取"),
    MARKITDOWN("markitdown", "Word 转 Markdown"),
    EXTRACT("extract", "条款抽取"),
    SOURCE_REVIEW("source_review", "来源复核");

    private final String label;
    private final String title;

    ParsePhase(String label, String title) {
        this.label = label;
        this.title = title;
    }

    String label() {
        return label;
    }

    String title() {
        return title;
    }
}
