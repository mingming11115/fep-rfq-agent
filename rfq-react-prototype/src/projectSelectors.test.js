import test from 'node:test';import assert from 'node:assert/strict';
import {getProjectSummary} from './projectSelectors.js';import {reconcileTasks,selectMyTasks} from './taskDomain.js';
test('parallel review and clarification do not replace response preparation stage',()=>{
 const s=reconcileTasks({projects:[{id:'P'}],requirementsByProject:{P:[{id:'R',status:'待确认',version:1}]},reviewsByProject:{P:[{id:'D1',requirementId:'R',status:'待处理',owner:'技术确认人'},{id:'D2',requirementId:'R',kind:'clarification',status:'待处理',owner:'销售负责人'}]},snapshotsByProject:{P:[]},tasksById:{}},{at:'2026-10-23T00:00:00Z'});
 const summary=getProjectSummary(s,'P','demo-sales');assert.equal(summary.stage,'应答编制中');assert.equal(summary.reviews,1);assert.equal(summary.clarifications,1);
 assert.equal(summary.pending,selectMyTasks(s,{actorId:'demo-sales',projectId:'P',tab:'pending'}).length);
 assert.equal(summary.total,1);
});
