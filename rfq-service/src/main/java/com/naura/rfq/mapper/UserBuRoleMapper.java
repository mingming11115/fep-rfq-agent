package com.naura.rfq.mapper;

import com.naura.rfq.domain.UserBuRole;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserBuRoleMapper {

    List<UserBuRole> findByUserIdAndStatus(@Param("userId") String userId,
            @Param("status") String status);

    List<UserBuRole> findByBuIdAndRoleAndStatus(@Param("buId") String buId,
            @Param("role") String role, @Param("status") String status);

    int insert(UserBuRole binding);
}
