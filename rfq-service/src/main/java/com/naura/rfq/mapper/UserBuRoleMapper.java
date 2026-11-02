package com.naura.rfq.mapper;

import com.naura.rfq.domain.UserBuRole;
import java.util.Collection;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserBuRoleMapper {

    List<UserBuRole> findByUserIdAndStatus(@Param("userId") String userId,
            @Param("status") String status);

    List<UserBuRole> findByBuIdAndRoleAndStatus(@Param("buId") String buId,
            @Param("role") String role, @Param("status") String status);

    /** 取某事业部的全部绑定，不过滤角色与状态，供成员名单使用。 */
    List<UserBuRole> findByBuId(@Param("buId") String buId);

    /** 取某账号的全部绑定，不过滤状态 —— 成员资格维护需要看到已停用的行。 */
    List<UserBuRole> findByUserId(@Param("userId") String userId);

    int insert(UserBuRole binding);

    /** 批量取绑定，供账号列表一次性拼装角色，避免逐行查询。 */
    List<UserBuRole> findByUserIds(@Param("userIds") Collection<String> userIds,
            @Param("status") String status);

    long countActiveByBuAndRole(@Param("buId") String buId, @Param("role") String role,
            @Param("status") String status);

    int updateStatus(@Param("userId") String userId, @Param("buId") String buId,
            @Param("role") String role, @Param("status") String status);
    /** 一次切换该账号在某事业部内全部绑定的状态，供成员启停使用。 */
    int updateBuStatus(@Param("userId") String userId, @Param("buId") String buId,
            @Param("status") String status);
}
