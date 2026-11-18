package com.naura.rfq.common.log;

import org.slf4j.Logger;

/**
 * 阶段分隔日志工具：在业务流程的关键阶段输出「==================」样式的横幅，
 * 便于在大量结构化日志中肉眼快速定位一次流程的开始与结束。
 *
 * <p>横幅只是边界标记，详细字段仍由各阶段原有的结构化日志输出；
 * 使用时保持「先横幅、后明细」的顺序，让一次流程在日志里呈现为清晰的块。
 */
public final class StageLog {

    /** 横幅两侧的分隔线。 */
    private static final String BAR = "==================";

    private StageLog() {
    }

    /** 阶段开始横幅。 */
    public static void begin(Logger log, String message) {
        log.info("{} [阶段开始] {} {}", BAR, message, BAR);
    }

    /** 阶段完成横幅。 */
    public static void end(Logger log, String message) {
        log.info("{} [阶段完成] {} {}", BAR, message, BAR);
    }

    /** 阶段失败横幅。 */
    public static void failed(Logger log, String message) {
        log.error("{} [阶段失败] {} {}", BAR, message, BAR);
    }
}
