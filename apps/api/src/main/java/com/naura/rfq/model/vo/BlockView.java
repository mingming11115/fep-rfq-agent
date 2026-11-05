package com.naura.rfq.model.vo;

import com.naura.rfq.model.entity.DocumentBlock;

public record BlockView(String id, int blockIndex, String type, String sectionPath,
        String customerClauseNo, String content, String sourceAnchor, String provenance, String processingStatus) {

    public static BlockView of(DocumentBlock block) {
        return new BlockView(block.getId(), block.getBlockIndex(), block.getType(),
                block.getSectionPath(), block.getCustomerClauseNo(), block.getContent(),
                block.getSourceAnchor(), block.getProvenance(), block.getProcessingStatus());
    }
}
