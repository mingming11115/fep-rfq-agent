import test from 'node:test';import assert from 'node:assert/strict';
import {getProjectSummary,selectProjects} from './projectSelectors.js';import {reconcileTasks,selectMyTasks} from './taskDomain.js';
test('initiated and participated tabs can overlap without exposing unrelated projects',()=>{
 const state={projects:[{id:'A',createdById:'me',participantIds:['me']},{id:'B',createdById:'other',participantIds:['other']}]};
 assert.deepEqual(selectProjects(state,{actorId:'me',tab:'all'}).map(p=>p.id),['A']);
 assert.equal(selectProjects(state,{actorId:'me',tab:'initiated'}).length,1);assert.equal(selectProjects(state,{actorId:'me',tab:'participated'}).length,1);
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
