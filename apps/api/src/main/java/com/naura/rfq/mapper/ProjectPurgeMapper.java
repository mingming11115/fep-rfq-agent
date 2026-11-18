package com.naura.rfq.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 彻底删除项目时按依赖顺序清理全部业务数据。
 * audit_event 不在清理范围内，审计记录永久保留。
 */
@Mapper
public interface ProjectPurgeMapper {

    int deleteDocumentBlocks(@Param("projectId") String projectId);

    int deleteParseBatches(@Param("projectId") String projectId);

    int deleteParseRuns(@Param("projectId") String projectId);

    int deleteDocumentReplacements(@Param("projectId") String projectId);

    int deleteDocuments(@Param("projectId") String projectId);

    int deleteMatchResults(@Param("projectId") String projectId);

    int deleteMatchRuns(@Param("projectId") String projectId);

    int deleteMatchInputs(@Param("projectId") String projectId);

    int deleteRequirements(@Param("projectId") String projectId);

    int deleteResponses(@Param("projectId") String projectId);

    int deleteReviews(@Param("projectId") String projectId);

    int deleteSnapshots(@Param("projectId") String projectId);

    int deleteResponseConfig(@Param("projectId") String projectId);

    int deleteMembers(@Param("projectId") String projectId);

    int deleteWorkVersions(@Param("projectId") String projectId);

    int deleteMatchPolicies(@Param("projectId") String projectId);

    int deleteHistoryDocuments(@Param("projectId") String projectId);

    int deleteHistoryClauses(@Param("projectId") String projectId);

    int deleteStandardReplies(@Param("projectId") String projectId);
}
