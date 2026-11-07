package com.naura.rfq.mapper;

import com.naura.rfq.model.entity.AuditEvent;
import com.naura.rfq.model.query.AuditQuery;
import com.naura.rfq.model.query.PageQuery;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AuditEventMapper {

    int insert(AuditEvent event);

    List<AuditEvent> findRecent(@Param("limit") int limit);
    List<AuditEvent> findProjectActivity(@Param("projectId") String projectId, @Param("buId") String buId);
    List<AuditEvent> findPage(@Param("f") AuditQuery filters,@Param("q") PageQuery query);
    long countPage(@Param("f") AuditQuery filters);
}
