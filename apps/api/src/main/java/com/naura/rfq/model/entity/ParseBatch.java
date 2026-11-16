package com.naura.rfq.model.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Word 模型解析批次执行记录：对应 parse_batch 表，每次解析运行若干行。 */
@Getter
@Setter
@NoArgsConstructor
public class ParseBatch {

    private String id;

    private String parseRunId;

    private Integer batchIndex;

    private String status;

    private String primarySources;

    private Integer contentChars;

    private String failureReason;

    private Instant createdAt;
}
