package com.naura.rfq.model.parse;

import java.util.List;

/**
 * 抽取产物：条款列表、实际使用的抽取方式说明、非致命问题提示，
 * 以及分批调用模型的批次执行结果（未分批或非模型路径为空列表）。
 */
public record ExtractionResult(List<ExtractedRequirement> requirements, String extractor, List<String> issues,
        List<BatchAttempt> batches) {

    public ExtractionResult(List<ExtractedRequirement> requirements, String extractor, List<String> issues) {
        this(requirements, extractor, issues, List.of());
    }
}
