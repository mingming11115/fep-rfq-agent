import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState } from './data.js';
import { upgradePrototypeState, getActor } from './stateMigration.js';
import {reconcileTasks} from './taskDomain.js';

test('upgrade preserves edited replies, snapshots and independent storage references', () => {
  const old = createDemoState();
  const pid = old.projects[0].id;
  old.requirementsByProject[pid][0].draft = '人工维护的答复';
  old.snapshotsByProject[pid] = [{ id: 'old-approved', rows: [{ draft: '历史版本' }], status: '已批准' }];
  old.commentStorage = 'separate-existing-key';
  const upgraded = upgradePrototypeState(old, createDemoState());
  assert.equal(upgraded.requirementsByProject[pid][0].draft, '人工维护的答复');
  assert.deepEqual(upgraded.snapshotsByProject[pid], old.snapshotsByProject[pid]);
  assert.equal(upgraded.commentStorage, 'separate-existing-key');
  assert.equal(old.schemaVersion, undefined);
  assert.deepEqual(getActor(upgraded), { id: 'demo-sales', role: '销售负责人' });
});
test('upgrade is idempotent and retains missing-map projects rather than replacing them', () => {
  const old = { projects: [{ id: 'P-custom', name: '用户项目' }], actorRole: '技术确认人' };
  const upgraded = upgradePrototypeState(old, createDemoState());
  assert.deepEqual(upgradePrototypeState(upgraded, createDemoState()), upgraded);
  assert.equal(upgraded.projects[0].id, 'P-custom');
  assert.deepEqual(upgraded.requirementsByProject['P-custom'], []);
  assert.equal(getActor(upgraded).id, 'demo-technical');
  assert.equal(upgraded.schemaVersion, 2);
});
test('migration keeps stable actor identity independent of displayed role',()=>{const upgraded=upgradePrototypeState({projects:[{id:'P'}],actorId:'person-7',actorRole:'最终审批人'},{members:[]});assert.equal(upgraded.actorId,'person-7');});
test('legacy duplicate review ids migrate without merging matters or reusing ambiguous tasks',()=>{
 const old={projects:[{id:'P'}],reviewsByProject:{P:[{id:'D',requirementId:'R1',status:'待处理',plan:'方案一'},{id:'D',requirementId:'R2',status:'待处理',plan:'方案二'}]},commentsByProject:{P:[{id:'C',anchor:{requirementId:'R2'},linkedIssues:{review:'D'}}]},snapshotsByProject:{P:[{id:'S',status:'已批准'}]}};
 const before=reconcileTasks(old),next=reconcileTasks(upgradePrototypeState(before,{members:[]}));
 const rows=next.reviewsByProject.P;assert.equal(new Set(rows.map(r=>r.id)).size,2);
 assert.deepEqual(rows.map(r=>r.plan),['方案一','方案二']);
 assert.equal(next.commentsByProject.P[0].linkedIssues.review,rows[1].id);
 assert.ok(Object.values(next.tasksById).some(t=>t.objectId==='D'&&t.status==='已失效'));
 assert.equal(Object.values(next.tasksById).filter(t=>t.objectType==='review'&&t.status==='待办理').length,2);
 assert.deepEqual(upgradePrototypeState(next,{members:[]}),next);
 assert.deepEqual(next.snapshotsByProject.P,old.snapshotsByProject.P);
});
