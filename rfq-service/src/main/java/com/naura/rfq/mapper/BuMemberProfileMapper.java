package com.naura.rfq.mapper;

import com.naura.rfq.domain.BuMemberProfile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface BuMemberProfileMapper {

    List<BuMemberProfile> findByBuId(@Param("buId") String buId);

    BuMemberProfile findByBuIdAndUserId(@Param("buId") String buId, @Param("userId") String userId);

    /** 存在则覆盖三个配置项，不存在则插入；靠 uk_bu_member_profile 保证幂等。 */
    int upsert(BuMemberProfile profile);

    int deleteByUserId(@Param("userId") String userId);
}
