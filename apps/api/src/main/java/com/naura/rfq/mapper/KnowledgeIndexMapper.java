package com.naura.rfq.mapper;

import com.naura.rfq.integration.standardreply.Library;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface KnowledgeIndexMapper {

    int enqueue(@Param("library") Library library, @Param("buId") String buId, @Param("replyId") String replyId,
            @Param("version") int version, @Param("operation") String operation, @Param("payload") String payload);

    Optional<SyncStatus> findStatus(@Param("library") Library library, @Param("buId") String buId,
            @Param("replyId") String replyId, @Param("version") int version);

    List<Key> listDue(@Param("library") Library library);

    int claim(@Param("library") Library library, @Param("buId") String buId, @Param("replyId") String replyId,
            @Param("token") String token);

    Work findClaimed(@Param("library") Library library, @Param("buId") String buId,
            @Param("replyId") String replyId, @Param("token") String token);

    int finish(@Param("library") Library library, @Param("buId") String buId, @Param("replyId") String replyId,
            @Param("token") String token, @Param("updatedAt") LocalDateTime updatedAt,
            @Param("jobId") String jobId, @Param("attempts") int attempts, @Param("error") String error,
            @Param("complete") boolean complete, @Param("delaySeconds") int delaySeconds);

    int release(@Param("library") Library library, @Param("buId") String buId, @Param("replyId") String replyId,
            @Param("token") String token);

    record Key(String buId, String replyId) {}

    record SyncStatus(String operation, boolean synced, boolean hasError) {}

    record Work(int version, String operation, String payload, LocalDateTime updatedAt, int attempts, String jobId) {}
}
