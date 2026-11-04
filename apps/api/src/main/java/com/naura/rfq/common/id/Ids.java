package com.naura.rfq.common.id;

import java.util.UUID;

/**
 * 业务 ID 生成器：统一出口，格式「前缀-随机十六进制串」（规范 §3.3）。
 *
 * <p>多机兼容性：基于 UUIDv4（SecureRandom，122 位真随机），每台机器本地生成、
 * 机器之间零协调，横向扩容不需要任何配置。主键约束兜底唯一性。
 *
 * <p>将来如需「ID 按时间递增」（ULID / Snowflake），只改这一个类，
 * 所有调用方与接口契约（前缀格式）均不受影响。
 */
public final class Ids {

    /** 随机段默认长度：10 个十六进制字符 = 40 bit 随机空间（约 1.1e12 组合）。 */
    private static final int DEFAULT_CHARS = 10;

    private Ids() {
    }

    /** 生成「{prefix}-{10位随机}」形式的业务 ID，如 DOC-x1y2z3a4b5。 */
    public static String next(String prefix) {
        return prefix + "-" + random(DEFAULT_CHARS);
    }

    /** 生成指定长度的无连字符小写十六进制随机串（取自 UUIDv4）。 */
    public static String random(int chars) {
        if (chars < 1 || chars > 32) {
            throw new IllegalArgumentException("随机段长度必须在 1-32 之间：" + chars);
        }
        return UUID.randomUUID().toString().replace("-", "").substring(0, chars);
    }
}
