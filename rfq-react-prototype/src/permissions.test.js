import test from 'node:test';
import assert from 'node:assert/strict';
import * as policy from './permissions.js';
const sales = '销售负责人', tech = '技术确认人', approver = '最终审批人';

test('customer sources and project ownership can only be changed by sales', () => {
  for (const action of ['project:create','project:manage','project:handover','source:manage']) {
    assert.equal(policy.canPerform(sales, action), true);
    assert.equal(policy.canPerform(tech, action), false);
    assert.equal(policy.canPerform(approver, action), false);
  }
});
test('clause confirmation and approval remain separate responsibilities', () => {
  for (const [action, allowed] of [
    ['response:submit',[sales]], ['response:edit',[sales,tech]],
    ['response:confirm',[tech]], ['review:process',[tech]], ['review:clarify',[sales]],
    ['review:approve',[approver]], ['snapshot:submit',[sales,tech]], ['snapshot:approve',[approver]],
  ]) for (const role of [sales,tech,approver]) assert.equal(policy.canPerform(role,action), allowed.includes(role), `${role}: ${action}`);
});
test('only sales may change export mappings or download response files', () => {
  for (const action of ['export:configure','export:download']) {
    assert.equal(policy.canPerform(sales,action),true);
    assert.equal(policy.canPerform(tech,action),false);
    assert.equal(policy.canPerform(approver,action),false);
  }
});
test('technical resource editing does not confer publication or system administration', () => {
  for (const [action,allowed] of [['resource:edit',[tech]],['evidence:manage',[tech]],['resource:approve',[approver]],['system:manage',[]]]) {
    for (const role of [sales,tech,approver]) assert.equal(policy.canPerform(role,action),allowed.includes(role));
  }
});
test('business navigation and deep links never expose system management', () => {
  for (const role of [sales,tech,approver]) {
    assert.equal(policy.canAccessPage(role,'admin'),false);
    assert.equal(policy.canAccessPage(role,'documents'),true);
    assert.equal(policy.getRoleNavigation(role)?.some(item => item.page === 'admin'),false);
  }
  assert.equal(policy.canAccessPage(approver,'analysis'),false);
  assert.equal(policy.canAccessPage(sales,'audit'),false);
  assert.equal(policy.canAccessPage(approver,'audit'),true);
  assert.equal(policy.canAccessPage(tech,'knowledge'),true);
});
test('unknown identities and permission names fail closed', () => {
  assert.equal(policy.canPerform('系统管理员','project:create'),false);
  assert.equal(policy.canPerform(sales,'invented-action'),false);
  assert.equal(policy.canAccessPage(undefined,'dashboard'),false);
  assert.equal(policy.canAccessPage(sales,'invented-page'),false);
  assert.throws(() => policy.assertPermission(tech,'export:download'), /权限|职责/);
});

test('technical drafting cannot change customer source text through an answer patch', () => {
  const row={original:'客户原文',draft:'旧答复',sourceVersion:'V1'};
  assert.throws(()=>policy.assertRequirementPatch(tech,row,{original:'被技术改写的原文',draft:'答复'}),/权限|职责/);
  assert.throws(()=>policy.assertRequirementPatch(tech,row,{sourceVersion:'V2'}),/权限|职责/);
  assert.doesNotThrow(()=>policy.assertRequirementPatch(tech,row,{original:'客户原文',draft:'技术核对答复'}));
  assert.doesNotThrow(()=>policy.assertRequirementPatch(sales,row,{original:'客户修正的原文'}));
});
