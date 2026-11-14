package com.naura.rfq.mapper;

import java.util.Collection;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface RequirementMatchMapper {

    int upsertPolicy(@Param("buId") String buId, @Param("order") String order, @Param("version") long version,
            @Param("userId") String userId);

    int supersedeGenerated(@Param("projectId") String projectId, @Param("documentId") String documentId);

    int supersedeDocument(@Param("projectId") String projectId, @Param("documentId") String documentId);

    int upsertInput(@Param("requirementId") String requirementId, @Param("fingerprint") String fingerprint,
            @Param("version") long version, @Param("payload") String payload);

    long countRequirements(@Param("projectId") String projectId, @Param("documentId") String documentId,
            @Param("parseRunId") String parseRunId);

    /** 统计项目内仍需比对的条款数量；已退出工作范围的原件不计入，用于判定是否可以进入评审确认。 */
    long countPendingMatches(@Param("projectId") String projectId,
            @Param("excludedDocumentIds") Collection<String> excludedDocumentIds);

    List<String> listRequirementIds(@Param("projectId") String projectId, @Param("documentId") String documentId,
            @Param("parseRunId") String parseRunId, @Param("size") int size, @Param("offset") long offset);

    String findCapabilityStamp(@Param("runId") String runId);

    List<String> listDue();

    int claim(@Param("id") String id, @Param("token") String token);

    int insertResult(@Param("runId") String runId, @Param("stamp") String stamp, @Param("payload") String payload);

    int finish(@Param("id") String id, @Param("token") String token, @Param("status") String status,
            @Param("delay") Integer delay, @Param("progress") String progress);

    MatchResult findResult(@Param("runId") String runId);

    int insertRun(@Param("id") String id, @Param("buId") String buId, @Param("projectId") String projectId,
            @Param("requirementId") String requirementId, @Param("requirementVersion") long requirementVersion,
            @Param("documentId") String documentId, @Param("documentVersion") int documentVersion,
            @Param("parseRunId") String parseRunId, @Param("fingerprint") String fingerprint,
            @Param("policyVersion") long policyVersion, @Param("order") String order,
            @Param("snapshot") String snapshot, @Param("requestKey") String requestKey,
            @Param("reason") String reason, @Param("progress") String progress);

    int supersedeRequirement(@Param("requirementId") String requirementId);

    InputRow findInput(@Param("requirementId") String requirementId);

    PolicyRow findPolicy(@Param("buId") String buId);

    RunRow findByRequest(@Param("requirementId") String requirementId, @Param("requestKey") String requestKey);

    RunRow findCurrent(@Param("requirementId") String requirementId);

    RunRow findRunForRequirement(@Param("id") String id, @Param("requirementId") String requirementId);

    RunRow findCurrentRunForRequirement(@Param("id") String id, @Param("requirementId") String requirementId);

    RunRow findClaimed(@Param("id") String id, @Param("token") String token);

    RunRow findCurrentClaimed(@Param("id") String id, @Param("token") String token);

    RunRow lockActiveClaim(@Param("id") String id, @Param("token") String token);

    record MatchResult(String scopeStamp, String payload) {}

    record InputRow(long version, String sourceFingerprint, String payload) {}

    record PolicyRow(String matchOrder, long version, String changedBy, String changedAt) {}

    record RunRow(String id, String requirementId, String documentId, int documentVersion, String parseRunId,
            long requirementVersion, long policyVersion, String inputFingerprint, boolean currentRun,
            String status, String leaseToken, int attempts, String progress, String buId, String projectId,
            String inputSnapshot, String matchOrder) {}
}
