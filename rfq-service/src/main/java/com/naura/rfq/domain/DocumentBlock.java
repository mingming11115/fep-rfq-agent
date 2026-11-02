package com.naura.rfq.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A unit of readable source content: paragraph, table row group or image placeholder. */
@Getter
@Setter
@NoArgsConstructor
public class DocumentBlock {

    private String id;

    private String documentId;

    private Integer blockIndex;

    private String parentBlockId;

    private String type;

    private String sectionPath;

    private String customerClauseNo;

    private String content;

    private String sourceAnchor;

    /** native | ocr | vision */
    private String provenance = "native";

    private String processingStatus = "READ";
}
