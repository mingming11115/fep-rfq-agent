package com.naura.rfq.mapper;

import com.naura.rfq.domain.BusinessUnit;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface BusinessUnitMapper {

    Optional<BusinessUnit> findById(@Param("id") String id);

    Optional<BusinessUnit> findByCode(@Param("code") String code);

    List<BusinessUnit> findAll();

    int insert(BusinessUnit unit);
}
