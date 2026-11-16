package com.naura.rfq.mapper;

import com.naura.rfq.model.entity.ParseBatch;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ParseBatchMapper {

    int insert(ParseBatch batch);
}
