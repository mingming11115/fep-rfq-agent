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

    List<Requirement> findByProjectIdOrderBySortOrder(@Param("projectId") String projectId);

    List<Requirement> findByDocumentIdOrderBySortOrder(@Param("documentId") String documentId);
    /** Current read after serialization: a prior RR snapshot must not hide a committed human edit. */
    List<Requirement> findByDocumentIdForUpdate(@Param("documentId") String documentId);

    List<Requirement> findPage(@Param("projectId") String projectId, @Param("q") PageQuery query);

    long countByProjectId(@Param("projectId") String projectId);

    int deleteByDocumentId(@Param("documentId") String documentId);

    int deleteByProjectId(@Param("projectId") String projectId);

    int insert(Requirement requirement);

    /** 乐观锁：where 带 version 条件并自增，返回 0 表示已被他人改动。 */
    int updateWithVersion(Requirement requirement);

    int assignConfirmation(Requirement requirement);

    /** 解析时回填父子关系，属内部写，不参与乐观锁。 */
    int updateParentId(@Param("id") String id, @Param("parentId") String parentId);
}
