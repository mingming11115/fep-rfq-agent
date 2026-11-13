package com.naura.rfq.integration.standardreply;

/**
 * 知识索引库枚举：标识索引队列所属的业务库；displayName 用于界面展示。
 */
public enum Library {
    STANDARD_REPLY("RFQ 标准回复"),
    HISTORY_RFQ("历史 RFQ"),
    CAPABILITY("机型能力边界");

    final String displayName;

    Library(String displayName) {
        this.displayName = displayName;
    }
}
