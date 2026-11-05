package com.naura.rfq.mapper;

import com.naura.rfq.model.entity.DocumentBlock;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface DocumentBlockMapper {

    List<DocumentBlock> findByDocumentIdOrderByBlockIndex(@Param("documentId") String documentId);

    int deleteByDocumentId(@Param("documentId") String documentId);

    long countByDocumentId(@Param("documentId") String documentId);

    int insert(DocumentBlock block);
}
