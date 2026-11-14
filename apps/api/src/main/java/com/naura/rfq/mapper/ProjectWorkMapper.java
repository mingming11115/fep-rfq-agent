package com.naura.rfq.mapper;

import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ProjectWorkMapper {

    Optional<Long> findVersion(@Param("projectId") String projectId);

    int upsertVersion(@Param("projectId") String projectId, @Param("version") long version);

    List<Replacement> listReplacements(@Param("projectId") String projectId);

    int countRetired(@Param("projectId") String projectId, @Param("documentId") String documentId);

    int insertReplacement(@Param("projectId") String projectId, @Param("oldDocumentId") String oldDocumentId,
            @Param("newDocumentId") String newDocumentId, @Param("userId") String userId);

    int activateReplacement(@Param("projectId") String projectId, @Param("newDocumentId") String newDocumentId,
            @Param("version") long version, @Param("userId") String userId, @Param("reason") String reason);

    int cancelReplacement(@Param("projectId") String projectId, @Param("newDocumentId") String newDocumentId,
            @Param("reason") String reason);

    record Replacement(String oldDocumentId, String newDocumentId, String status, Long workVersion,
            String createdBy, String createdAt, String activatedBy, String activatedAt, String reason) {}
}
