import test from 'node:test';import assert from 'node:assert/strict';
import {getProjectSummary,selectProjects} from './projectSelectors.js';import {reconcileTasks,selectMyTasks} from './taskDomain.js';
import {snapshotFingerprint} from './snapshotDomain.js';
test('initiated and participated tabs can overlap without exposing unrelated projects',()=>{
 const state={projects:[{id:'A',createdById:'me',participantIds:['me']},{id:'B',createdById:'other',participantIds:['other']}]};
 assert.deepEqual(selectProjects(state,{actorId:'me',tab:'all'}).map(p=>p.id),['A']);
 assert.equal(selectProjects(state,{actorId:'me',tab:'initiated'}).length,1);assert.equal(selectProjects(state,{actorId:'me',tab:'participated'}).length,1);
});
test('completed stage requires exported scope to remain current with no unfinished work',()=>{
 const row={id:'R',version:1,status:'已确认',draft:'原答复'};
 const scope={rows:[row],configuration:{equipment:'机型A'}};
 const snapshot={id:'S',status:'已批准',exportedAt:'2026-10-24',approvalScope:scope,approvalFingerprint:snapshotFingerprint(scope)};
 const s={projects:[{id:'P',equipment:'机型A'}],requirementsByProject:{P:[row]},reviewsByProject:{P:[]},snapshotsByProject:{P:[snapshot]},exportScopesByProject:{P:scope}};
 assert.equal(getProjectSummary(s,'P','demo-sales').stage,'本轮已完成');
 const edited={...s,requirementsByProject:{P:[{...row,version:2,draft:'修改答复',status:'待确认'}]}};
 assert.equal(getProjectSummary(edited,'P','demo-sales').stage,'应答编制中');
 assert.equal(getProjectSummary({...s,exportScopesByProject:{P:{...scope,mapping:{draft:'original'}}}},'P','demo-sales').stage,'应答编制中');
 assert.equal(getProjectSummary({...s,reviewsByProject:{P:[{id:'D',status:'待处理'}]}},'P','demo-sales').stage,'应答编制中');
 assert.equal(snapshot.status,'已批准');assert.ok(snapshot.exportedAt);
});
test('parallel review and clarification do not replace response preparation stage',()=>{
 const s=reconcileTasks({projects:[{id:'P'}],requirementsByProject:{P:[{id:'R',status:'待确认',version:1}]},reviewsByProject:{P:[{id:'D1',requirementId:'R',status:'待处理',owner:'技术确认人'},{id:'D2',requirementId:'R',kind:'clarification',status:'待处理',owner:'销售负责人'}]},snapshotsByProject:{P:[]},tasksById:{}},{at:'2026-10-23T00:00:00Z'});
 const summary=getProjectSummary(s,'P','demo-sales');assert.equal(summary.stage,'应答编制中');assert.equal(summary.reviews,1);assert.equal(summary.clarifications,1);
 assert.equal(summary.pending,selectMyTasks(s,{actorId:'demo-sales',projectId:'P',tab:'pending'}).length);
 assert.equal(summary.total,1);
});
test('project owner handover preserves existing task assignee and deadlines',()=>{
 const s=reconcileTasks({projects:[{id:'P',ownerId:'demo-sales',deadline:'2026-11-01'}],requirementsByProject:{P:[{id:'R',status:'待确认'}]}});
 const before=Object.values(s.tasksById)[0];
 const moved=reconcileTasks({...s,projects:[{...s.projects[0],ownerId:'demo-technical'}]});
 assert.equal(moved.tasksById[before.id].assigneeId,'demo-sales');assert.equal(moved.tasksById[before.id].dueAt,before.dueAt);
});
