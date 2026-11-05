package com.naura.rfq.model.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 事业部成员资格档案。
 *
 * <p>与 {@link UserBuRole} 的分工：业务角色（SR / 技术）和启停状态存在
 * {@code user_bu_role}；档案保存成员暂停状态与确认、最终评审、资料发布资格。
 * 暂停与撤销角色分开，恢复成员不会恢复已撤销角色。两表以 (user_id, bu_id) 对应。
 */
@Getter
@Setter
@NoArgsConstructor
public class BuMemberProfile {

    private Long id;
    private String userId;
    private String buId;
    private boolean enabled = true;
    private boolean canConfirm;
    private boolean canFinalReview;
    /** 逗号分隔，取值 knowledge-publish / capability-publish */
    private String resourceQualifications = "";
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();
}
