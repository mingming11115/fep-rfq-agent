package com.naura.rfq.mapper;

import com.naura.rfq.domain.AuditEvent;
import com.naura.rfq.audit.AuditQuery;
import com.naura.rfq.common.api.PageQuery;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AuditEventMapper {

    int insert(AuditEvent event);

    List<AuditEvent> findRecent(@Param("limit") int limit);
    List<AuditEvent> findPage(@Param("f") AuditQuery filters,@Param("q") PageQuery query);
    long countPage(@Param("f") AuditQuery filters);
}
