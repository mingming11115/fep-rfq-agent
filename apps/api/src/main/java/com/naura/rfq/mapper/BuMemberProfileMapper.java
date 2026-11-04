package com.naura.rfq.mapper;

import com.naura.rfq.model.entity.BuMemberProfile;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface BuMemberProfileMapper {

    List<BuMemberProfile> findByBuId(@Param("buId") String buId);
    List<BuMemberProfile> findByUserId(@Param("userId") String userId);

    BuMemberProfile findByBuIdAndUserId(@Param("buId") String buId, @Param("userId") String userId);

    /** Each write owns its fields; null qualification values preserve the current database value. */
    int patchQualifications(@Param("userId") String userId,@Param("buId") String buId,
            @Param("canConfirm") Boolean canConfirm,@Param("canFinalReview") Boolean canFinalReview,
            @Param("qualifications") String qualifications);

    int setEnabled(@Param("userId") String userId,@Param("buId") String buId,@Param("enabled") boolean enabled);

    int deleteByUserId(@Param("userId") String userId);
}
