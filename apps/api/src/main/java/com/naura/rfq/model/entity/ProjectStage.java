package com.naura.rfq.model.entity;

import java.util.Arrays;

public enum ProjectStage {
    /** 待上传：已建档，尚无客户原件。 */
    DRAFT,
    /** 解析比对中：解析客户原件并与能力/标准答复/历史RFQ进行条款比对。 */
    PARSING,
    /** 评审确认中：条款比对全部完成，等待条款确认与评审。 */
    REVIEWING,
    /** 审批完成：最终评审通过，可直接导出。 */
    APPROVED,
    /** 已导出：已生成对外交付文件。 */
    EXPORTED,
    /** 已归档（界面显示为已删除），可通过恢复回到归档前阶段。 */
    CANCELLED;

    public static boolean isActive(String stage) {
        return Arrays.stream(values()).anyMatch(value->value!=CANCELLED && value.name().equals(stage));
    }

    /** 项目是否仍停留在解析比对阶段，只有此阶段才允许因比对完成而推进。 */
    public static boolean awaitingMatch(String stage) {
        return PARSING.name().equals(stage);
    }
}
