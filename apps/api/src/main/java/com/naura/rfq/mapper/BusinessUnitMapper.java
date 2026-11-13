package com.naura.rfq.mapper;

import com.naura.rfq.model.entity.BusinessUnit;
import com.naura.rfq.model.query.PageQuery;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface BusinessUnitMapper {

    Optional<BusinessUnit> findById(@Param("id") String id);

    Optional<String> lockId(@Param("id") String id);

    Optional<BusinessUnit> findByCode(@Param("code") String code);

    List<BusinessUnit> findAll();

    int insert(BusinessUnit unit);

    /** ids 为 null 表示不限范围（系统管理员）；空集合由调用方短路。 */
    List<BusinessUnit> findPage(@Param("q") PageQuery q, @Param("keyword") String keyword,
            @Param("ids") Collection<String> ids);

    long countPage(@Param("keyword") String keyword, @Param("ids") Collection<String> ids);

    List<BusinessUnit> findByIdIn(@Param("ids") Collection<String> ids);

    int updateName(@Param("id") String id, @Param("name") String name);
}
