package com.naura.rfq.mapper;

import com.naura.rfq.domain.ParseRun;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ParseRunMapper {

    Optional<ParseRun> findById(@Param("id") String id);

    List<ParseRun> findByDocumentIdOrderByStartedAtDesc(@Param("documentId") String documentId);

    int insert(ParseRun run);

    int update(ParseRun run);
}
