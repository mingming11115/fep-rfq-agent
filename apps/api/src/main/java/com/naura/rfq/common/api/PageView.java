package com.naura.rfq.common.api;

import java.util.List;

/**
 * 统一分页信封（接口规范 §2.3）。列表接口的 data 一律为该结构。
 *
 * @param <T> 列表元素类型
 */
public record PageView<T>(List<T> list, int page, int size, long total, int totalPages) {

    public static <T> PageView<T> of(List<T> list, long total, int page, int size) {
        int safeSize = Math.max(1, size);
        int safePage = Math.max(1, page);
        int totalPages = (int) ((total + safeSize - 1) / safeSize);
        return new PageView<>(list, safePage, safeSize, total, totalPages);
    }
}
