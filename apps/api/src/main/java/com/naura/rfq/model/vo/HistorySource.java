package com.naura.rfq.model.vo;

import com.naura.rfq.model.parse.RawBlock;
import java.util.List;

public record HistorySource(String name, String prefix, List<RawBlock> blocks) { }
