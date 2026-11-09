import { api } from './authClient';

/**
 * 后端角色码 → 前端业务身份。
 * 前端 member.roles 只认 'SR' 和 '技术'，BU_ADMIN 不进入 roles（它体现为管理权限）。
 * APPROVER 归入技术侧：审批资格由 canFinalReview 判定，不看角色名。
 */
const ROLE_BY_CODE = { SR: 'SR', TECH: '技术', APPROVER: '技术' };
const CODE_BY_ROLE = { SR: 'SR', 技术: 'TECH' };

export function toMemberRoles(codes = []) {
  return [...new Set(codes.map((code) => ROLE_BY_CODE[code]).filter(Boolean))];
}

/** 后端成员视图 → 前端 buPersonnelByBuId 结构。codes 保留原始角色码，供角色增删时比对。 */
export function toMember(member) {
  return {
    userId: member.userId,
    displayName: member.displayName,
    codes: member.roles || [],
    roles: toMemberRoles(member.roles),
    enabled: Boolean(member.enabled),
    canConfirm: Boolean(member.canConfirm),
    canFinalReview: Boolean(member.canFinalReview),
    resourceQualifications: member.resourceQualifications || [],
  };
}

/** 业务侧只读，登录即可调用。 */
export async function fetchBuMembers(buId) {
  const data = await api.get(`/business-units/${buId}/members`);
  return (data || []).map(toMember);
}

/**
 * 把一次成员编辑同步到后端。
 *
 * <p>拆成三个端点，因为它们的语义不同：角色是增删绑定，启停是改 user_bu_role.status，
 * 三项资格是 upsert bu_member_profile。项目参与范围（projectIds）后端暂无对应表，
 * 仍由前端演示数据处理。
 */
export async function syncBuMember(buId, userId, patch, currentCodes = []) {
  const desired = new Set();
  if (patch.roles?.includes('SR')) { desired.add('SR'); }
  if (patch.roles?.includes('技术')) {
    // 原本是最终审批人的账号保留 APPROVER，避免被改写成普通 TECH 而失去审批语义。
    desired.add(currentCodes.includes('APPROVER') ? 'APPROVER' : 'TECH');
  }

  for (const code of desired) {
    if (!currentCodes.includes(code)) {
      await api.post(`/admin/users/${userId}/roles`, { buId, role: code });
    }
  }
  for (const code of currentCodes) {
    if (code !== 'BU_ADMIN' && !desired.has(code)) {
      await api.delete(`/admin/users/${userId}/roles?buId=${encodeURIComponent(buId)}&role=${encodeURIComponent(code)}`);
    }
  }

  if (typeof patch.enabled === 'boolean') {
    await api.patch(`/admin/business-units/${buId}/members/${userId}/status`, { enabled: patch.enabled });
  }

  if (patch.canConfirm !== undefined || patch.canFinalReview !== undefined
      || patch.resourceQualifications !== undefined) {
    await api.patch(`/admin/business-units/${buId}/members/${userId}`, {
      canConfirm: patch.canConfirm,
      canFinalReview: patch.canFinalReview,
      resourceQualifications: patch.resourceQualifications,
    });
  }
}

export { CODE_BY_ROLE };
