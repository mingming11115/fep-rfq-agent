const ROLE_BY_CODE = { SR: 'SR', TECH: '技术', APPROVER: '技术', BU_ADMIN: 'BU管理员' };

export function resolveLoginIdentity(user) {
  if (!user?.id) { return null; }
  const role = user.roles?.find(grant => ROLE_BY_CODE[grant.role])?.role;
  return { actorId: user.id, actorRole: user.systemAdmin ? '后台管理' : ROLE_BY_CODE[role] || '未配置' };
}

/** 将已认证会话接入本机业务权限模型；BU角色不自动授予项目参与权或审批资格。 */
export function hydrateSessionPersonnel(state, user, { activate = false } = {}) {
  const identity = resolveLoginIdentity(user);
  if (!identity) { return state; }
  const grants = (user.roles || []).filter(grant => grant.buId && ROLE_BY_CODE[grant.role]);
  const managedBuIds = [...new Set(grants.filter(grant => grant.role === 'BU_ADMIN').map(grant => grant.buId))];
  const accountsById = { ...state.accountsById, [user.id]: {
    ...state.accountsById?.[user.id], id: user.id, name: user.displayName || user.id,
    enabled: true, systemAdmin: Boolean(user.systemAdmin), managedBuIds,
  } };
  const businessUnits = [...(state.businessUnits || [])];
  const buIds = [...new Set(grants.map(grant => grant.buId))];
  for (const id of buIds) {
    const unit = user.bus?.find(unit => unit.id === id) || { id, name: id };
    const index = businessUnits.findIndex(known => known.id === id);
    if (index < 0) { businessUnits.push(unit); }
    else { businessUnits[index] = { ...businessUnits[index], ...unit }; }
  }
  const buPersonnelByBuId = Object.fromEntries(Object.entries(state.buPersonnelByBuId || {})
    .map(([id, members]) => [id, members.filter(member => member.userId !== user.id)]));
  for (const buId of buIds) {
    const previous = state.buPersonnelByBuId?.[buId]?.find(member => member.userId === user.id);
    const codes = [...new Set(grants.filter(grant => grant.buId === buId).map(grant => grant.role))];
    const roles = [...new Set(codes.map(code => ROLE_BY_CODE[code]).filter(role => ['SR', '技术'].includes(role)))];
    const sameRoles = previous?.roles?.length === roles.length && roles.every(role => previous.roles.includes(role));
    const sameCodes = !previous?.codes || previous.codes.length === codes.length && codes.every(code => previous.codes.includes(code));
    // 角色未变化时保留完整成员快照，启动中的路由更新不能把既有审批误判为失效。
    const member = previous?.enabled && sameRoles && sameCodes ? previous : {
      ...previous,
      userId: user.id, displayName: user.displayName, codes, roles, enabled: true,
      canConfirm: Boolean(previous?.canConfirm),
      canFinalReview: Boolean(previous?.canConfirm && previous?.canFinalReview),
      resourceQualifications: codes.includes('BU_ADMIN') ? previous?.resourceQualifications || [] : [],
    };
    buPersonnelByBuId[buId] = [...(buPersonnelByBuId[buId] || []), member];
  }
  const select = activate || state.actorId === user.id;
  const savedRoleValid = state.actorId === user.id && (
    user.systemAdmin && state.actorRole === '后台管理'
    || grants.some(grant => grant.buId === state.activeBuId && ROLE_BY_CODE[grant.role] === state.actorRole));
  const actorRole = !activate && savedRoleValid ? state.actorRole : identity.actorRole;
  const roleBuIds = grants.filter(grant => ROLE_BY_CODE[grant.role] === actorRole).map(grant => grant.buId);
  const activeBuId = actorRole === '后台管理' ? state.activeBuId : roleBuIds.includes(state.activeBuId) ? state.activeBuId : roleBuIds[0] || '';
  return { ...state, accountsById, businessUnits, buPersonnelByBuId,
    ...(select ? { ...identity, actorRole, activeBuId } : {}),
  };
}

/** 成功返回的成员目录是该BU的完整快照，包括空目录；其他BU互不影响。 */
export function mergeMemberDirectory(state, buId, members) {
  const accountsById = Object.fromEntries(Object.entries(state.accountsById || {}).map(([id, account]) =>
    [id, { ...account, managedBuIds: (account.managedBuIds || []).filter(id => id !== buId) }]));
  for (const member of members) {
    const previous = accountsById[member.userId];
    accountsById[member.userId] = {
      ...previous, id: member.userId, name: member.displayName || previous?.name || member.userId,
      enabled: member.enabled || previous?.enabled || !previous,
      systemAdmin: previous?.systemAdmin || false,
      managedBuIds: [...(previous?.managedBuIds || []),
        ...(member.enabled && member.codes?.includes('BU_ADMIN') ? [buId] : [])],
    };
  }
  return { ...state, accountsById, buPersonnelByBuId: { ...state.buPersonnelByBuId, [buId]: members } };
}
