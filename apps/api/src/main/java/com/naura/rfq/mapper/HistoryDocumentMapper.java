package com.naura.rfq.mapper;

import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface HistoryDocumentMapper {

    List<String> listFamily(@Param("buId") String buId, @Param("parent") String parent,
            @Param("family") String family);

    int enqueueParse(@Param("buId") String buId, @Param("id") String id, @Param("payload") String payload);

    ParseKey findDueParse();

    int claimParse(@Param("buId") String buId, @Param("id") String id, @Param("token") String token);

    List<String> findParseOriginals(@Param("buId") String buId, @Param("id") String id,
            @Param("token") String token);

    int renewParse(@Param("buId") String buId, @Param("id") String id, @Param("token") String token);

    Optional<ParseSource> lockParseSource(@Param("buId") String buId, @Param("id") String id,
            @Param("token") String token);

    int finishParse(@Param("buId") String buId, @Param("id") String id, @Param("payload") String payload);

    List<String> lockClauses(@Param("buId") String buId, @Param("id") String id);

    List<String> lockActiveClauses(@Param("buId") String buId, @Param("id") String id);

    int markDeleted(@Param("buId") String buId, @Param("id") String id, @Param("payload") String payload);

    int updatePayload(@Param("buId") String buId, @Param("id") String id, @Param("payload") String payload);

    Optional<DocumentSource> findLatestSource(@Param("buId") String buId, @Param("id") String id);

    Optional<DocumentOriginals> findLatestOriginals(@Param("buId") String buId, @Param("id") String id);

    Optional<DocumentScope> findLatestScope(@Param("buId") String buId, @Param("id") String id);

    List<String> findDeletedIds(@Param("buId") String buId, @Param("id") String id);

    Optional<String> lockByFingerprint(@Param("buId") String buId, @Param("fingerprint") String fingerprint);

    int insert(@Param("buId") String buId, @Param("id") String id, @Param("projectId") String projectId,
            @Param("scope") String scope, @Param("payload") String payload,
            @Param("fingerprint") String fingerprint, @Param("originals") String originals,
            @Param("parsing") boolean parsing);

    List<RecallDocument> listScopedByIds(@Param("bu") String bu, @Param("project") String project,
            @Param("ids") List<String> ids);

    List<RecallDocument> listScopedByGroup(@Param("bu") String bu, @Param("project") String project,
            @Param("groupIds") List<String> groupIds);

    List<RecallChoice> listRecallChoices(@Param("bu") String bu, @Param("project") String project);

    record ParseKey(String buId, String id) {}

    record ParseSource(String projectId, String payload) {}

    record DocumentSource(String projectId, String scope, String payload, String originals) {}

    record DocumentOriginals(String projectId, String scope, String originals) {}

    record DocumentScope(String projectId, String scope) {}

    record RecallDocument(String id, String payload) {}

    record RecallChoice(String id, String payload, boolean published, boolean syncing) {}
}
