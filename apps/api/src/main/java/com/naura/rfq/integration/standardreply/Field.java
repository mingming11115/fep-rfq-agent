package com.naura.rfq.integration.standardreply;

/**
 * 标准回复导入文件的列字段枚举：label 为表头中文名，alias 为兼容英文表头，maxLength 为列值长度上限。
 */
enum Field {
    TITLE("回复标题", "title", 200),
    REQUIREMENT("客户要求", "requirement", 4000),
    ANSWER("标准回复", "answer", 8000),
    CONDITIONS("适用条件", "conditions", 2000);

    private final String label;
    private final String alias;
    private final int maxLength;

    Field(String label, String alias, int maxLength) {
        this.label = label;
        this.alias = alias;
        this.maxLength = maxLength;
    }
}
