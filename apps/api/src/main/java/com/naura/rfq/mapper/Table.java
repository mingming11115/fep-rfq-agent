package com.naura.rfq.mapper;

/**
 * 知识记录表枚举：按业务类型映射到对应的知识版本表；auditType 为审计日志中的类型标识。
 */
public enum Table {
    MODEL("model_definition"), PROCESS("process_definition"), EVIDENCE("evidence_record"),
    CAPABILITY("capability_record"), HISTORY("`history-rfq-record`"), STANDARD_REPLY("standard-reply-record"),
    HISTORY_DOCUMENT("history_document");

    private final String auditType;

    Table(String auditType) {
        this.auditType = auditType;
    }

    public String auditType() {
        return auditType;
    }
}
