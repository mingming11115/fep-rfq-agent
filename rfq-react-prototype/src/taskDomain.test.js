import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTaskAction, reconcileTasks, selectMyTasks } from './taskDomain.js';
const at='2026-10-23T00:00:00Z';
const task={id:'T',projectId:'P',objectType:'requirement',objectId:'R',objectVersion:2,kind:'confirm',round:1,assigneeId:'demo-technical',status:'办理中',arrivedAt:'2026-10-20T00:00:00Z',dueAt:'2026-10-25T00:00:00Z',history:[]};
test('saving does not complete tasks and wrong actor or stale version cannot complete',()=>{
 assert.equal(applyTaskAction(task,{type:'save',actorId:'demo-technical',objectVersion:2,at}).status,'办理中');
 assert.throws(()=>applyTaskAction(task,{type:'confirm',actorId:'demo-sales',objectVersion:2,at}));
 assert.throws(()=>applyTaskAction(task,{type:'confirm',actorId:'demo-technical',objectVersion:1,at}));
 assert.throws(()=>applyTaskAction(task,{type:'approve',actorId:'demo-technical',objectVersion:2,at}));
 assert.equal(applyTaskAction(task,{type:'confirm',actorId:'demo-technical',objectVersion:2,at}).status,'已办理');
});
test('transfer keeps arrival and deadline and does not count as completion',()=>{
 const next=applyTaskAction(task,{type:'transfer',actorId:'demo-technical',objectVersion:2,to:'demo-sales',reason:'接续核对',at});
 assert.equal(next.assigneeId,'demo-sales');assert.equal(next.status,'待办理');
 assert.equal(next.arrivedAt,task.arrivedAt);assert.equal(next.dueAt,task.dueAt);assert.equal(next.completedAt,undefined);
});
const state=()=>({projects:[{id:'P',name:'项目',deadline:'2026-10-25'}],requirementsByProject:{P:[{id:'R',title:'无编号',clause:'',version:2,status:'待确认',readyForConfirmation:true}]},reviewsByProject:{P:[]},snapshotsByProject:{P:[]},tasksById:{}});
test('reconciliation is idempotent and changes invalidate earlier task versions',()=>{
 const one=reconcileTasks(state(),{at});const two=reconcileTasks(one,{at});assert.deepEqual(two,one);
 assert.equal(selectMyTasks(two,{actorId:'demo-technical',tab:'pending'}).length,1);
 const changed=structuredClone(two);changed.requirementsByProject.P[0].version=3;
 const next=reconcileTasks(changed,{at});assert.equal(Object.values(next.tasksById).filter(t=>t.status==='已失效').length,1);
 assert.equal(selectMyTasks(next,{actorId:'demo-technical',tab:'pending'}).length,1);
 next.requirementsByProject.P[0].status='已确认';
 assert.equal(selectMyTasks(reconcileTasks(next,{at}),{actorId:'demo-technical',tab:'done'}).length,1);
});
test('review submit creates approval task, approval closes it without confirming response',()=>{
 const s=state();s.reviewsByProject.P=[{id:'D',requirementId:'R',owner:'技术确认人',status:'待处理',version:1,title:'方案'}];
 const one=reconcileTasks(s,{at});one.reviewsByProject.P[0].status='待审批';
 const next=reconcileTasks(one,{at});assert.equal(selectMyTasks(next,{actorId:'demo-approver',tab:'pending'})[0].kind,'review-approve');
 assert.equal(Object.values(next.tasksById).filter(t=>t.kind==='review-process')[0].status,'已办理');
 next.reviewsByProject.P[0].status='已关闭';const closed=reconcileTasks(next,{at});
 assert.equal(closed.requirementsByProject.P[0].status,'待确认');
 assert.equal(selectMyTasks(closed,{actorId:'demo-approver',tab:'done'}).length,1);
});
