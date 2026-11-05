package com.naura.rfq.model.vo;

import java.util.List;
import java.util.Map;

public record HistoryParseView(Map<String, String> metadata, List<HistoryClause> clauses, List<HistorySource> sources, List<String> issues) { }
