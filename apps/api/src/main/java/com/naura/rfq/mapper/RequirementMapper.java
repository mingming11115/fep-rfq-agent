package com.naura.rfq.mapper;

import com.naura.rfq.model.entity.Requirement;
import com.naura.rfq.model.query.PageQuery;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface RequirementMapper {

    Optional<Requirement> findById(@Param("id") String id);

    Optional<Requirement> findByIdForUpdate(@Param("id") String id);

    List<Requirement> findByProjectIdOrderBySource(@Param("projectId") String projectId);

    List<Requirement> findByDocumentIdOrderBySource(@Param("documentId") String documentId);
    /** Current read after serialization: a prior RR snapshot must not hide a committed human edit. */
    List<Requirement> findByDocumentIdForUpdate(@Param("documentId") String documentId);

    List<Requirement> findByDocumentIdForReparse(@Param("documentId") String documentId);

    List<Requirement> findPage(@Param("projectId") String projectId, @Param("q") PageQuery query);

    long countByProjectId(@Param("projectId") String projectId);

    int deleteGeneratedByDocumentId(@Param("documentId") String documentId);

    int deleteByProjectId(@Param("projectId") String projectId);

    /** 重解析影响范围：该文档已产生应答的条款数。 */
    int countRespondedRequirements(@Param("documentId") String documentId);

    /** 重解析影响范围：该文档已进入评审的条款数（含已取消的历史评审）。 */
    int countReviewedRequirements(@Param("documentId") String documentId, @Param("projectId") String projectId);

    /** 重解析影响范围：包含该文档的定稿快照份数。 */
    int countDocumentSnapshots(@Param("documentId") String documentId, @Param("projectId") String projectId);

    /** 重解析影响范围：已应答或已评审的条款号样本，按条款号排序。 */
    List<String> findArtifactClauses(@Param("documentId") String documentId, @Param("projectId") String projectId,
            @Param("limit") int limit);

    int insert(Requirement requirement);

    /** 乐观锁：where 带 version 条件并自增，返回 0 表示已被他人改动。 */
    int updateWithVersion(Requirement requirement);

    int assignConfirmation(Requirement requirement);

}
