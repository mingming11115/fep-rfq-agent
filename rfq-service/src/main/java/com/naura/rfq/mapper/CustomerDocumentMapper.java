package com.naura.rfq.mapper;

import com.naura.rfq.common.api.PageQuery;
import com.naura.rfq.domain.CustomerDocument;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CustomerDocumentMapper {

    Optional<CustomerDocument> findById(@Param("id") String id);

    List<CustomerDocument> findByProjectIdOrderByCreatedAtDesc(@Param("projectId") String projectId);

    List<CustomerDocument> findByProjectIdAndSha256(@Param("projectId") String projectId,
            @Param("sha256") String sha256);

    List<CustomerDocument> findPage(@Param("projectId") String projectId,
            @Param("q") PageQuery query);

    long countByProjectId(@Param("projectId") String projectId);

    int insert(CustomerDocument document);

    int update(CustomerDocument document);
}
