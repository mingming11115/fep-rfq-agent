import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateSessionPersonnel, mergeMemberDirectory } from './sessionPersonnel.js';
import { canAccessPage, canPerform, getRoleNavigation } from './permissions.js';
import { canAccessProject } from './personnelDomain.js';
import { currentProjectScope, snapshotFingerprint, invalidatePendingSnapshots } from './snapshotDomain.js';

const initial = () => ({
  actorId: 'old-admin', actorRole: '后台管理', activeBuId: 'BU-DEMO',
  accountsById: { 'old-admin': { id: 'old-admin', name: '管理员', enabled: true, systemAdmin: true, managedBuIds: [] } },
  businessUnits: [{ id: 'BU-DEMO', name: '演示BU' }], buPersonnelByBuId: {},
  projects: [{ id: 'private-project', buId: 'BU-FEP', participantIds: ['other-user'] }],
});
const user = role => ({ id: 'new-user', displayName: '新建用户', systemAdmin: false,
  roles: [{ buId: 'BU-FEP', role }], bus: [{ id: 'BU-FEP', code: 'FEP', name: 'FEP事业部' }] });

for (const [code, role] of [['SR', 'SR'], ['TECH', '技术'], ['APPROVER', '技术'], ['BU_ADMIN', 'BU管理员']]) {
  test(`新建${code}账号登录后可以进入自己的工作台`, () => {
    const before = initial();
    const state = hydrateSessionPersonnel(before, user(code), { activate: true });
    const context = { state, actorId: state.actorId, buId: state.activeBuId };
    assert.equal(state.actorId, 'new-user');
    assert.equal(state.actorRole, role);
    assert.equal(state.activeBuId, 'BU-FEP');
    assert.equal(state.accountsById['new-user'].name, '新建用户');
    assert.equal(canAccessPage(role, 'dashboard', context), true);
    assert.ok(getRoleNavigation(role, context).some(item => item.page === 'projects'));
    assert.equal(canPerform(role, 'system:manage', context), false);
    assert.equal(canAccessProject(state, 'new-user', 'private-project'), code === 'BU_ADMIN');
    assert.equal(before.accountsById['new-user'], undefined, '不修改原状态');
    assert.equal(state.buPersonnelByBuId['BU-FEP'][0].canFinalReview, false, '角色不能代替明确审批资格');
  });
}

test('刷新恢复会话时可修复已保存的新账号身份及错误的活动BU', () => {
  const state = hydrateSessionPersonnel({ ...initial(), actorId: 'new-user', actorRole: 'SR' }, user('SR'));
  assert.equal(state.activeBuId, 'BU-FEP');
  assert.equal(canAccessPage('SR', 'dashboard', { state, actorId: 'new-user', buId: state.activeBuId }), true);
});

test('刷新保留已明确授予的确认和审批资格，避免目录返回前使任务失效', () => {
  const before = hydrateSessionPersonnel(initial(), user('TECH'), { activate: true });
  before.buPersonnelByBuId['BU-FEP'][0] = { ...before.buPersonnelByBuId['BU-FEP'][0], canConfirm: true, canFinalReview: true };
  const state = hydrateSessionPersonnel(before, user('TECH'));
  assert.equal(state.buPersonnelByBuId['BU-FEP'][0].canConfirm, true);
  assert.equal(state.buPersonnelByBuId['BU-FEP'][0].canFinalReview, true);
});

test('相同角色集合的登录同步保留成员快照，不使审批因字段或角色顺序变化而失效', () => {
  const sessionUser = { ...user('SR'), roles: [{ buId: 'BU-FEP', role: 'TECH' }, { buId: 'BU-FEP', role: 'SR' }] };
  const before = hydrateSessionPersonnel(initial(), sessionUser, { activate: true });
  before.buPersonnelByBuId['BU-FEP'][0] = { userId: 'new-user', displayName: '已有目录姓名', codes: ['SR', 'TECH'], roles: ['SR', '技术'], enabled: true, canConfirm: true, canFinalReview: true, resourceQualifications: [], customMetadata: '保留' };
  before.projects[0].approvalConfig = { finalReviewers: { srId: 'new-user', technicalIds: [] } };
  const snapshot = { id: 'snapshot', status: '审批中', approvalScope: {} };
  snapshot.approvalFingerprint = snapshotFingerprint(currentProjectScope(before, 'private-project', snapshot));
  before.snapshotsByProject = { 'private-project': [snapshot] };
  const state = invalidatePendingSnapshots(hydrateSessionPersonnel(before, sessionUser));
  assert.equal(state.snapshotsByProject['private-project'][0].stale, undefined);
  assert.deepEqual(state.buPersonnelByBuId['BU-FEP'][0], before.buPersonnelByBuId['BU-FEP'][0]);
});

test('无业务角色的会话不会被自动授予SR权限', () => {
  const state = hydrateSessionPersonnel(initial(), { ...user('SR'), roles: [], bus: [] }, { activate: true });
  assert.equal(canAccessPage(state.actorRole, 'dashboard', { state, actorId: 'new-user', buId: state.activeBuId }), false);
  assert.deepEqual(state.accountsById['new-user'].managedBuIds, []);
});

test('平台账号登录可进入系统配置且不会获得BU业务成员资格', () => {
  const state = hydrateSessionPersonnel(initial(), { id: 'new-admin', displayName: '新管理员', systemAdmin: true, roles: [], bus: [] }, { activate: true });
  assert.equal(canAccessPage('后台管理', 'admin', { state, actorId: 'new-admin' }), true);
  assert.equal(canAccessProject(state, 'new-admin', 'private-project'), false);
});

test('成员目录同步补齐账号、角色和资格，空结果清除旧成员', () => {
  const state = hydrateSessionPersonnel(initial(), user('SR'), { activate: true });
  const members = [
    { userId: 'new-user', displayName: '真实姓名', codes: ['SR'], roles: ['SR'], enabled: true, canConfirm: false, canFinalReview: false, resourceQualifications: [] },
    { userId: 'reviewer', displayName: '审批人', codes: ['APPROVER'], roles: ['技术'], enabled: true, canConfirm: true, canFinalReview: true, resourceQualifications: [] },
    { userId: 'bu-admin', displayName: 'BU管理员', codes: ['BU_ADMIN'], roles: [], enabled: true, canConfirm: false, canFinalReview: false, resourceQualifications: [] },
  ];
  const merged = mergeMemberDirectory(state, 'BU-FEP', members);
  assert.equal(merged.accountsById.reviewer.name, '审批人');
  assert.equal(merged.buPersonnelByBuId['BU-FEP'][1].canFinalReview, true);
  assert.deepEqual(merged.accountsById['bu-admin'].managedBuIds, ['BU-FEP']);
  const cleared = mergeMemberDirectory(merged, 'BU-FEP', []);
  assert.deepEqual(cleared.buPersonnelByBuId['BU-FEP'], []);
  assert.deepEqual(cleared.accountsById['bu-admin'].managedBuIds, []);
  assert.equal(canAccessPage('SR', 'dashboard', { state: cleared, actorId: 'new-user', buId: 'BU-FEP' }), false);
});

test('暂停一个BU的成员不影响该账号其他BU资格', () => {
  const state = hydrateSessionPersonnel(initial(), { ...user('SR'), roles: [{ buId: 'BU-FEP', role: 'SR' }, { buId: 'BU-OTHER', role: 'SR' }], bus: [...user('SR').bus, { id: 'BU-OTHER', name: '其他BU' }] }, { activate: true });
  const merged = mergeMemberDirectory(state, 'BU-FEP', [{ userId: 'new-user', displayName: '新建用户', codes: ['SR'], roles: ['SR'], enabled: false, canConfirm: false, canFinalReview: false, resourceQualifications: [] }]);
  assert.equal(canAccessPage('SR', 'dashboard', { state: merged, actorId: 'new-user', buId: 'BU-FEP' }), false);
  assert.equal(canAccessPage('SR', 'dashboard', { state: merged, actorId: 'new-user', buId: 'BU-OTHER' }), true);
});

test('已选择的本机演示身份在非激活同步时保持不变', () => {
  const state = hydrateSessionPersonnel(initial(), user('SR'));
  assert.equal(state.actorId, 'old-admin');
  assert.equal(state.activeBuId, 'BU-DEMO');
});

test('刷新保留同一账号已选择且仍有效的第二个BU和角色', () => {
  const sessionUser = { ...user('TECH'), roles: [{ buId: 'BU-FEP', role: 'TECH' }, { buId: 'BU-OTHER', role: 'SR' }], bus: [...user('TECH').bus, { id: 'BU-OTHER', name: '其他BU' }] };
  const before = hydrateSessionPersonnel(initial(), sessionUser, { activate: true });
  before.actorRole = 'SR';
  before.activeBuId = 'BU-OTHER';
  const state = hydrateSessionPersonnel(before, sessionUser);
  assert.equal(state.actorRole, 'SR');
  assert.equal(state.activeBuId, 'BU-OTHER');
  const freshLogin = hydrateSessionPersonnel(before, sessionUser, { activate: true });
  assert.equal(freshLogin.actorRole, '技术');
  assert.equal(freshLogin.activeBuId, 'BU-FEP');
});
