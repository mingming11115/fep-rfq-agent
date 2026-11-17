package com.naura.rfq.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/**
 * 条款应答的三态。
 *
 * <p>持久化在 {@code requirement_response.payload.status}，由「是否已确认」与「是否存在未关闭评审」
 * 共同决定。状态写入必须与产生它的评审写入在同一事务内完成，否则会出现「评审已关但状态未回落」。
 * 历史数据里的「待确认」等同于「待处理」。
 */
final class ResponseStatus {
    /** 应答尚未确认，且没有未关闭的评审事项。 */
    static final String PENDING = "待处理";
    /** 存在未关闭的评审事项，确认动作被阻断。 */
    static final String REVIEWING = "评审中";
    /** 已通过确认，可作为定稿与正式导出的依据。 */
    static final String CONFIRMED = "已确认";
    /** 不再阻塞确认的评审状态。 */
    static final List<String> CLOSED_REVIEW_STATUSES = List.of("已关闭", "已取消");
    /** 历史数据里的旧取值，读取时按待处理处理。 */
    private static final String LEGACY_PENDING = "待确认";

    private ResponseStatus() {
    }

    /** 评审事项是否仍未关闭。 */
    static boolean openReview(JsonNode review) {
        return !CLOSED_REVIEW_STATUSES.contains(review.path("status").asText());
    }

    /** 把存量字面值归一为新取值。 */
    static String normalize(String status) {
        return LEGACY_PENDING.equals(status) ? PENDING : status;
    }

    /** 关闭评审后重新决议：仍有未关闭事项即评审中，否则已确认保持已确认，其余回落待处理。 */
    static String resolve(String current, boolean hasOpenReview) {
        if (hasOpenReview) {
            return REVIEWING;
        }
        return CONFIRMED.equals(normalize(current)) ? CONFIRMED : PENDING;
    }
}
