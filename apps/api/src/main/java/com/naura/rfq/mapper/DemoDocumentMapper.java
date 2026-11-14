package com.naura.rfq.mapper;

import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface DemoDocumentMapper {

    Optional<byte[]> findContent(@Param("id") String id, @Param("size") long size);
}
