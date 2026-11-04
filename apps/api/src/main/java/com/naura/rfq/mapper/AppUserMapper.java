package com.naura.rfq.mapper;

import com.naura.rfq.common.api.PageQuery;
import com.naura.rfq.domain.AppUser;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AppUserMapper {

    Optional<AppUser> findById(@Param("id") String id);

    Optional<AppUser> findByUsername(@Param("username") String username);

    long count();

    int insert(AppUser user);

    /** buIds 为 null 表示不限事业部（系统管理员视角）；空集合由调用方直接短路，不能下传到 SQL。 */
    List<AppUser> findPage(@Param("q") PageQuery q, @Param("keyword") String keyword,
            @Param("buIds") Collection<String> buIds);

    long countPage(@Param("keyword") String keyword, @Param("buIds") Collection<String> buIds);

    int updateProfile(@Param("id") String id, @Param("displayName") String displayName,
            @Param("email") String email);

    int updateStatus(@Param("id") String id, @Param("status") String status);

    int updatePassword(@Param("id") String id, @Param("passwordHash") String passwordHash);

    long countActiveSystemAdmins(@Param("status") String status);

    /** 按主键批量取账号，供 BU 成员名单一次拼装，避免逐行查询。 */
    List<AppUser> findByIds(@Param("ids") Collection<String> ids);
}
