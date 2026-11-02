package com.naura.rfq.mapper;

import com.naura.rfq.domain.AuditEvent;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AuditEventMapper {

    int insert(AuditEvent event);

    List<AuditEvent> findRecent(@Param("limit") int limit);
}
