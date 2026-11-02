package com.naura.rfq.mapper;

import com.naura.rfq.domain.AppUser;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AppUserMapper {

    Optional<AppUser> findById(@Param("id") String id);

    Optional<AppUser> findByUsername(@Param("username") String username);

    long count();

    int insert(AppUser user);
}
