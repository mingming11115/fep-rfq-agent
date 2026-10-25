import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState } from './data.js';
import { upgradePrototypeState, getActor } from './stateMigration.js';
import {reconcileTasks} from './taskDomain.js';
import {makeDocumentDemo} from './documentMocks.js';
import {requirementValidation} from './domain.js';

test('Word status examples seed once with a real review task and preserve subsequent edits', () => {
  const demo = createDemoState();
  const initial = upgradePrototypeState(demo, demo);
  const pid = 'RFQ-001';
  const rows = initial.requirementsByProject[pid].filter(row => row.sourceFileId === `${pid}-DEMO-FILE-CLAUSE-STATUSES`);
  assert.deepEqual(rows.map(row => row.status), ['待确认', '评审中', '已确认']);
  assert.deepEqual(requirementValidation(rows[2]), []);
  assert.ok(rows[2].confirmedAt);
  const reconciled = reconcileTasks(initial);
  assert.ok(Object.values(reconciled.tasksById).some(task => task.requirementId === rows[1].id && task.kind === 'review-process' && task.assigneeId === 'demo-technical'));
  rows[2].draft = '用户修改后的答复';
  rows[2].status = '待确认';
  assert.deepEqual(upgradePrototypeState(initial, demo), initial);
});

test('seeding old Word examples preserves user work, historical snapshots and unrelated projects', () => {
  const demo = createDemoState();
  const old = structuredClone(demo);
  const rows = makeDocumentDemo('RFQ-001').parsed.slice(0, 3);
  rows[0].draft = '已有人工答复';
  old.requirementsByProject['RFQ-001'].push(...rows);
  old.snapshotsByProject['RFQ-001'] = [{ id: 'frozen', status: '已批准', rows: structuredClone(rows) }];
  const next = upgradePrototypeState(old, demo);
  assert.deepEqual(next.requirementsByProject['RFQ-001'].find(row => row.id === rows[0].id), rows[0]);
  assert.deepEqual(next.requirementsByProject['RFQ-001'].filter(row => rows.some(original => original.id === row.id)), rows);
  assert.deepEqual(next.snapshotsByProject['RFQ-001'], old.snapshotsByProject['RFQ-001']);
  assert.deepEqual(next.requirementsByProject['RFQ-002'], old.requirementsByProject['RFQ-002']);
});

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
  assert.equal(upgraded.schemaVersion, 3);
});
test('migration keeps stable actor identity independent of displayed role',()=>{const upgraded=upgradePrototypeState({projects:[{id:'P'}],actorId:'person-7',actorRole:'最终审批人'},{members:[]});assert.equal(upgraded.actorId,'person-7');});
test('legacy task states migrate without changing ownership deadlines or history',()=>{
 const history=[{action:'transfer',to:'demo-technical',reason:'移交'}];
 const old={projects:[{id:'P'}],tasksById:{T1:{id:'T1',status:'待办理',assigneeId:'demo-sales',dueAt:'2026-11-01'},T2:{id:'T2',status:'办理中',assigneeId:'demo-technical',history},T3:{id:'T3',status:'已办理',completedAt:'2026-10-23',result:'退回'}}};
 const next=upgradePrototypeState(old,{members:[]});
 assert.deepEqual(Object.values(next.tasksById).map(t=>t.status),['待处理','处理中','已处理']);
 assert.equal(next.tasksById.T1.dueAt,'2026-11-01');assert.equal(next.tasksById.T2.assigneeId,'demo-technical');assert.deepEqual(next.tasksById.T2.history,history);
 assert.equal(next.tasksById.T3.result,'退回');assert.equal(next.tasksById.T3.completedAt,'2026-10-23');
 assert.deepEqual(upgradePrototypeState(next,{members:[]}),next);assert.equal(old.tasksById.T2.status,'办理中');
});
test('legacy duplicate review ids migrate without merging matters or reusing ambiguous tasks',()=>{
 const old={projects:[{id:'P'}],reviewsByProject:{P:[{id:'D',requirementId:'R1',status:'待处理',plan:'方案一'},{id:'D',requirementId:'R2',status:'待处理',plan:'方案二'}]},commentsByProject:{P:[{id:'C',anchor:{requirementId:'R2'},linkedIssues:{review:'D'}}]},snapshotsByProject:{P:[{id:'S',status:'已批准'}]}};
 const before=reconcileTasks(old),next=reconcileTasks(upgradePrototypeState(before,{members:[]}));
 const rows=next.reviewsByProject.P;assert.equal(new Set(rows.map(r=>r.id)).size,2);
 assert.deepEqual(rows.map(r=>r.plan),['方案一','方案二']);
 assert.equal(next.commentsByProject.P[0].linkedIssues.review,rows[1].id);
 assert.ok(Object.values(next.tasksById).some(t=>t.objectId==='D'&&t.status==='已失效'));
 assert.equal(Object.values(next.tasksById).filter(t=>t.objectType==='review'&&t.status==='待处理').length,2);
 assert.deepEqual(upgradePrototypeState(next,{members:[]}),next);
 assert.deepEqual(next.snapshotsByProject.P,old.snapshotsByProject.P);
});
