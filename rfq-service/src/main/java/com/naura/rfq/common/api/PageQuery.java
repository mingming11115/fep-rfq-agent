package com.naura.rfq.common.api;

import java.util.List;

/**
 * 手写分页参数。MyBatis 没有 Pageable 可用，而 order by 无法参数化、只能拼接，
 * 所以排序字段必须先过白名单，再由 {@link #camelToSnake} 转成真实列名。
 * 白名单是代码里的常量，转换结果只含字母、数字和下划线，不存在注入面。
 *
 * <p>刻意用普通类而非 record：MyBatis 解析 {@code #{q.size}} 走 JavaBean 反射，
 * record 的组件访问器不带 get 前缀，取值会失败。</p>
 */
public final class PageQuery {

    private final int page;
    private final int size;
    private final String orderBy;
    private final int offset;

    private PageQuery(int page, int size, String orderBy) {
        this.page = page;
        this.size = size;
        this.orderBy = orderBy;
        this.offset = (page - 1) * size;
    }

    public static PageQuery of(int page, int size, String sort,
            List<String> allowed, String defaultSort) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(100, Math.max(1, size));
        String spec = sort == null || sort.isBlank() ? defaultSort : sort.trim();
        String[] parts = spec.split(",", 2);
        String field = parts[0].trim();
        if (!allowed.contains(field)) {
            throw new IllegalArgumentException(
                    "不支持的排序字段：" + field + "（允许：" + String.join("、", allowed) + "）");
        }
        String direction = parts.length > 1 && "desc".equalsIgnoreCase(parts[1].trim())
                ? "desc" : "asc";
        return new PageQuery(safePage, safeSize, camelToSnake(field) + " " + direction);
    }

    public int getPage() {
        return page;
    }

    public int getSize() {
        return size;
    }

    public String getOrderBy() {
        return orderBy;
    }

    public int getOffset() {
        return offset;
    }

    private static String camelToSnake(String value) {
        StringBuilder builder = new StringBuilder(value.length() + 4);
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (Character.isUpperCase(ch)) {
                if (i > 0) {
                    builder.append('_');
                }
                builder.append(Character.toLowerCase(ch));
            } else {
                builder.append(ch);
            }
        }
        return builder.toString();
    }
}
