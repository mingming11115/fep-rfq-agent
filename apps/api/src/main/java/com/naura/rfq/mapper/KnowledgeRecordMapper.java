package com.naura.rfq.mapper;

import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface KnowledgeRecordMapper {

    List<VersionRow> findVersion(@Param("table") Table table, @Param("buId") String buId, @Param("id") String id,
            @Param("version") int version);

    List<VersionRow> lockVersions(@Param("table") Table table, @Param("buId") String buId, @Param("id") String id);

    List<VersionRow> findLatest(@Param("table") Table table, @Param("buId") String buId, @Param("id") String id);

    List<VersionRow> listCapabilityVersions(@Param("buId") String buId, @Param("id") String id);

    List<VersionRow> findCapabilityByFingerprint(@Param("buId") String buId,
            @Param("fingerprint") String fingerprint);

    List<VersionRow> listPublishedCapabilities(@Param("buId") String buId, @Param("projectId") String projectId,
            @Param("modelId") String modelId, @Param("metricCode") String metricCode);

    Optional<Resource> findResource(@Param("table") Table table, @Param("buId") String buId,
            @Param("id") String id, @Param("version") int version);

    Optional<Resource> lockResource(@Param("table") Table table, @Param("buId") String buId,
            @Param("id") String id, @Param("version") int version);

    List<String> listPayloads(@Param("table") Table table, @Param("buId") String buId);

    List<IndexedClause> listHistoryClauses(@Param("buId") String buId);

    List<PublishedSource> listPublishedSources(@Param("history") boolean history, @Param("buId") String buId,
            @Param("projectId") String projectId, @Param("fileFilter") String fileFilter);

    List<String> findGroupCatalog(@Param("buId") String buId);

    int insertVersion(@Param("table") Table table, @Param("buId") String buId, @Param("id") String id,
            @Param("version") int version, @Param("projectId") String projectId, @Param("scope") String scope,
            @Param("payload") String payload);

    int insertCapabilityDraft(@Param("buId") String buId, @Param("id") String id,
            @Param("projectId") String projectId, @Param("scope") String scope, @Param("payload") String payload,
            @Param("fingerprint") String fingerprint);

    int updateVersion(@Param("table") Table table, @Param("buId") String buId, @Param("id") String id,
            @Param("version") int version, @Param("revision") long revision,
            @Param("previousRevision") long previousRevision, @Param("payload") String payload);

    int updatePayload(@Param("table") Table table, @Param("buId") String buId, @Param("id") String id,
            @Param("version") int version, @Param("payload") String payload);

    int upsertGroupCatalog(@Param("buId") String buId, @Param("payload") String payload);

    record VersionRow(String id, int version, long revision, String projectId, String scope, String payload) {}

    record Resource(String projectId, String scope, String payload) {}

    record IndexedClause(String payload, String operation, boolean synced, boolean hasError) {}

    record PublishedSource(String id, int version, long revision, String projectId, String scope,
            String payload, boolean synced, String syncStamp) {}
}
