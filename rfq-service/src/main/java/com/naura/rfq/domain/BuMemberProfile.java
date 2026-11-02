package com.naura.rfq.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/**
 * 事业部成员资格档案。
 *
 * <p>与 {@link UserBuRole} 的分工：业务角色（SR / 技术）和启停状态存在
 * {@code user_bu_role}，这里只补充该表没有的三个配置项 —— 是否允许条款确认、
 * 是否允许最终评审、资料发布资格。两表以 (user_id, bu_id) 自然对应。
 */
@Getter
@Setter
@NoArgsConstructor
public class BuMemberProfile {

    private Long id;
    private String userId;
    private String buId;
    private boolean canConfirm;
    private boolean canFinalReview;
    /** 逗号分隔，取值 knowledge-publish / capability-publish */
    private String resourceQualifications = "";
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();
}
