package com.naura.rfq.integration.parse;

import com.naura.rfq.model.parse.ExtractedRequirement;
import com.naura.rfq.model.parse.RawBlock;
import java.util.List;

/**
 * Turns readable blocks into answerable requirements. Keeping this an interface
 * lets a model-backed extractor be added behind the same parse pipeline.
 */
public interface RequirementExtractor {

    List<ExtractedRequirement> extract(List<RawBlock> blocks);

    String name();
}
