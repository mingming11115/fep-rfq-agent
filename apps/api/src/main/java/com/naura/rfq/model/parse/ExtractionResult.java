package com.naura.rfq.model.parse;

import java.util.List;

public record ExtractionResult(List<ExtractedRequirement> requirements, String extractor, List<String> issues) { }
