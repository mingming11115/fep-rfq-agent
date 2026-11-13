package com.naura.rfq.mapper;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ResponseMapper {

    List<String> findConfig(@Param("projectId") String projectId);

    List<String> findResponse(@Param("requirementId") String requirementId, @Param("projectId") String projectId);

    List<String> lockResponse(@Param("requirementId") String requirementId, @Param("projectId") String projectId);

    List<String> findResponseByRequirement(@Param("requirementId") String requirementId);

    List<String> lockResponseByRequirement(@Param("requirementId") String requirementId);

    List<String> listResponses(@Param("projectId") String projectId);

    List<String> listOrderedResponses(@Param("projectId") String projectId);

    List<String> listReviews(@Param("projectId") String projectId);

    List<String> listOrderedReviews(@Param("projectId") String projectId);

    List<String> lockReviews(@Param("projectId") String projectId);

    List<String> findReview(@Param("projectId") String projectId, @Param("id") String id);

    List<String> findSnapshot(@Param("projectId") String projectId, @Param("id") String id);

    List<String> listSnapshots(@Param("projectId") String projectId);

    List<String> findHistoryEntry(@Param("requirementId") String requirementId,
            @Param("projectId") String projectId, @Param("kind") String kind, @Param("version") long version);

    List<String> listHistory(@Param("requirementId") String requirementId, @Param("projectId") String projectId,
            @Param("kind") String kind);

    List<String> findLatestHistory(@Param("requirementId") String requirementId,
            @Param("projectId") String projectId, @Param("kind") String kind);

    List<String> findMatchReference(@Param("requirementId") String requirementId);

    List<String> listAdoptedAfter(@Param("cursor") String cursor);

    List<String> listPendingDeviations(@Param("projectId") String projectId, @Param("workVersion") long workVersion);

    int upsertResponse(@Param("requirementId") String requirementId, @Param("projectId") String projectId,
            @Param("payload") String payload);

    int updateResponse(@Param("requirementId") String requirementId, @Param("payload") String payload);

    int insertHistory(@Param("requirementId") String requirementId, @Param("projectId") String projectId,
            @Param("kind") String kind, @Param("version") long version, @Param("payload") String payload);

    int upsertConfig(@Param("projectId") String projectId, @Param("payload") String payload);

    int insertSnapshot(@Param("id") String id, @Param("projectId") String projectId,
            @Param("payload") String payload);

    int updateSnapshot(@Param("projectId") String projectId, @Param("id") String id,
            @Param("payload") String payload);

    int upsertReview(@Param("id") String id, @Param("projectId") String projectId, @Param("payload") String payload);

    int cancelOpenReviews(@Param("projectId") String projectId, @Param("requirementId") String requirementId,
            @Param("workVersion") long workVersion);

    int resetConfirmation(@Param("projectId") String projectId, @Param("requirementId") String requirementId,
            @Param("reason") String reason);
}
