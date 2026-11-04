import test from 'node:test';
import assert from 'node:assert/strict';
import * as taskDomain from './taskDomain.js';
import { applyTaskAction, reconcileTasks, selectMyTasks, assertBusinessAction, getTaskContextError } from './taskDomain.js';
const at='2026-10-23T00:00:00Z';
const task={id:'T',projectId:'P',objectType:'requirement',objectId:'R',objectVersion:2,kind:'confirm',round:1,assigneeId:'demo-technical',status:'处理中',arrivedAt:'2026-10-20T00:00:00Z',dueAt:'2026-10-25T00:00:00Z',history:[]};
test('saving does not complete tasks and wrong actor or stale version cannot complete',()=>{
 assert.equal(applyTaskAction(task,{type:'save',actorId:'demo-technical',objectVersion:2,at}).status,'处理中');
 assert.throws(()=>applyTaskAction(task,{type:'confirm',actorId:'demo-sales',objectVersion:2,at}));
 assert.throws(()=>applyTaskAction(task,{type:'confirm',actorId:'demo-technical',objectVersion:1,at}));
 assert.throws(()=>applyTaskAction(task,{type:'approve',actorId:'demo-technical',objectVersion:2,at}));
 assert.equal(applyTaskAction(task,{type:'confirm',actorId:'demo-technical',objectVersion:2,at}).status,'已处理');
 assert.equal(applyTaskAction(task,{type:'confirm',actorId:'demo-technical',objectVersion:2,at}).result,'已确认');
});
test('transfer keeps arrival and deadline and does not count as completion',()=>{
 assert.throws(()=>applyTaskAction(task,{type:'transfer',actorId:'demo-technical',objectVersion:2,to:'demo-sales',reason:'接续核对',at}),/处理资格/);
 const next=applyTaskAction({...task,assigneeId:'demo-sales'},{type:'transfer',actorId:'demo-sales',objectVersion:2,to:'demo-technical',reason:'改回具备确认资格的人员',at});
 assert.equal(next.assigneeId,'demo-technical');assert.equal(next.status,'待处理');
 assert.equal(next.arrivedAt,task.arrivedAt);assert.equal(next.dueAt,task.dueAt);assert.equal(next.completedAt,undefined);
});
test('business mutations check assignment, qualification and stale task context at every entry',()=>{
 const s=reconcileTasks({...state(),actorId:'demo-technical',actorRole:'技术确认人'},{at});
 const t=Object.values(s.tasksById)[0];
 assert.doesNotThrow(()=>assertBusinessAction(s,{projectId:'P',objectType:'requirement',objectId:'R',action:'confirm',expectedVersion:2}));
 s.requirementsByProject.P.push({id:'OTHER',version:2,status:'已确认'});
 assert.throws(()=>assertBusinessAction(s,{projectId:'P',objectType:'requirement',objectId:'OTHER',action:'save',route:{projectId:'P',taskId:t.id}}),/业务对象/);
 s.tasksById[t.id]={...t,assigneeId:'demo-sales'}; // legacy incompatible transfer remains recoverable
 assert.throws(()=>assertBusinessAction(s,{projectId:'P',objectType:'requirement',objectId:'R',action:'confirm'}),/处理人/);
 assert.throws(()=>assertBusinessAction({...s,actorId:'demo-sales',actorRole:'销售负责人'},{projectId:'P',objectType:'requirement',objectId:'R',action:'confirm'}),/资格|职责/);
 s.tasksById[t.id]={...t,status:'已失效'};
 const route={taskId:t.id,projectId:'P'};
 assert.match(getTaskContextError(s,route),/失效|完成/);
 assert.throws(()=>assertBusinessAction(s,{projectId:'P',objectType:'requirement',objectId:'R',action:'save',route}),/失效|完成/);
 assert.throws(()=>assertBusinessAction(s,{projectId:'P',objectType:'requirement',objectId:'R',action:'save',expectedVersion:1}),/版本/);
 assert.match(getTaskContextError({...s,tasksById:{[t.id]:t}},{...route,action:'view'}),/查看/);
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
 assert.equal(Object.values(next.tasksById).filter(t=>t.kind==='review-process')[0].status,'已处理');
 next.reviewsByProject.P[0].status='已关闭';const closed=reconcileTasks(next,{at});
 assert.equal(closed.requirementsByProject.P[0].status,'待确认');
 assert.equal(selectMyTasks(closed,{actorId:'demo-approver',tab:'done'}).length,1);
 assert.equal(selectMyTasks(closed,{actorId:'demo-approver',tab:'done'})[0].result,'批准');
});
test('returned review approval is completed and a new processing round is created',()=>{
 const review={id:'D',requirementId:'R',status:'待审批',version:1,round:1,owner:'技术确认人'};
 const state=reconcileTasks({projects:[{id:'P'}],reviewsByProject:{P:[review]}});
 const next=reconcileTasks({...state,reviewsByProject:{P:[{...review,status:'已退回',round:2}]}});
 assert.equal(selectMyTasks(next,{actorId:'demo-approver',tab:'done'}).length,1);
 assert.equal(selectMyTasks(next,{actorId:'demo-approver',tab:'done'})[0].result,'退回');
 assert.equal(selectMyTasks(next,{actorId:'demo-technical'}).length,1);
});
test('saving business content starts its own qualified task but does not complete it',()=>{
 const state=reconcileTasks({projects:[{id:'P'}],requirementsByProject:{P:[{id:'R',version:1,status:'待确认'}]}} ,{at});
 const saved=taskDomain.startTaskForObject(state,{projectId:'P',objectType:'requirement',objectId:'R',actorId:'demo-sales',at});
 const pending=selectMyTasks(saved,{actorId:'demo-sales'});
 assert.equal(pending.length,1);assert.equal(pending[0].status,'处理中');assert.equal(pending[0].startedAt,at);assert.equal(pending[0].completedAt,undefined);
 assert.equal(selectMyTasks(saved,{actorId:'demo-sales',tab:'done'}).length,0);
 assert.equal(Object.values(state.tasksById)[0].status,'待处理');
 assert.equal(Object.values(taskDomain.startTaskForObject(state,{projectId:'P',objectType:'requirement',objectId:'R',actorId:'demo-technical',at}).tasksById)[0].status,'待处理');
});
test('cancelled business objects retain task history without counting as processed',()=>{
 const before=reconcileTasks({projects:[{id:'P'}],reviewsByProject:{P:[{id:'D',status:'待处理',owner:'技术确认人'}]}},{at});
 const after=reconcileTasks({...before,reviewsByProject:{P:[{id:'D',status:'已取消',owner:'技术确认人'}]}},{at});
 const history=selectMyTasks(after,{actorId:'demo-technical',tab:'all'});
 assert.equal(history[0].status,'已取消');assert.equal(history[0].completedAt,undefined);
 assert.equal(selectMyTasks(after,{actorId:'demo-technical',tab:'done'}).length,0);
});
test('final rejection completes approval and creates a usable revision task until resubmission',()=>{
 const snapshot={id:'S',status:'审批中',createdById:'demo-sales',version:1};
 const before=reconcileTasks({projects:[{id:'P',name:'项目'}],requirementsByProject:{P:[{id:'R',version:1,status:'已确认'}]},snapshotsByProject:{P:[snapshot]}},{at});
 const returned=reconcileTasks({...before,actorId:'demo-sales',actorRole:'销售负责人',snapshotsByProject:{P:[{...snapshot,status:'已退回'}]}},{at});
 const completed=selectMyTasks(returned,{actorId:'demo-approver',tab:'done'});
 assert.equal(completed.length,1);assert.equal(completed[0].result,'退回');
 const revise=selectMyTasks(returned,{actorId:'demo-sales'})[0];
 assert.equal(revise.kind,'response-revise');assert.equal(revise.status,'待处理');
 const route={taskId:revise.id,projectId:'P',action:'start'};
 assert.doesNotThrow(()=>assertBusinessAction(returned,{projectId:'P',objectType:'requirement',objectId:'R',action:'save',route,expectedVersion:1}));
 assert.throws(()=>assertBusinessAction(returned,{projectId:'P',objectType:'requirement',objectId:'R',action:'save',route:{...route,action:'view'}}),/查看/);
 assert.throws(()=>assertBusinessAction(returned,{projectId:'P',objectType:'requirement',objectId:'R',action:'save',route,expectedVersion:2}),/版本/);
 assert.throws(()=>assertBusinessAction({...returned,actorId:'demo-technical',actorRole:'技术确认人'},{projectId:'P',objectType:'requirement',objectId:'R',action:'save',route}),/处理人/);
 const submitted=reconcileTasks({...returned,snapshotsByProject:{P:[{id:'S2',status:'审批中',revisionOf:'S'},...returned.snapshotsByProject.P]}},{at});
 assert.equal(selectMyTasks(submitted,{actorId:'demo-sales'}).length,0);
 assert.equal(selectMyTasks(submitted,{actorId:'demo-sales',tab:'done'})[0].result,'已提交');
 assert.equal(selectMyTasks(submitted,{actorId:'demo-approver'})[0].snapshotId,'S2');
 assert.deepEqual(reconcileTasks(submitted,{at}),submitted);
});
test('legacy rejected snapshots create only the current revision task and newer approval retires it',()=>{
 const older={id:'S1',status:'已退回',createdById:'demo-sales',createdAt:'2026-10-21T00:00:00Z'};
 const current={...older,id:'S2',createdAt:'2026-10-22T00:00:00Z'};
 const initial={projects:[{id:'P'}],snapshotsByProject:{P:[older,current]}};
 const state=reconcileTasks(initial,{at});
 assert.deepEqual(selectMyTasks(state,{actorId:'demo-sales'}).map(t=>t.snapshotId),['S2']);
 const approved={id:'S3',status:'已批准',createdAt:'2026-10-23T00:00:00Z'};
 const closed=reconcileTasks({...state,snapshotsByProject:{P:[older,approved,current]}},{at});
 assert.equal(selectMyTasks(closed,{actorId:'demo-sales'}).length,0);
 assert.deepEqual(reconcileTasks(closed,{at}),closed);
 assert.equal(selectMyTasks(reconcileTasks({...initial,snapshotsByProject:{P:[older,approved,current]}},{at}),{actorId:'demo-sales'}).length,0);
});
test('saving a rejection does not start the next processor task and resubmission creates pending approval',()=>{
 const review={id:'D',status:'待审批',version:1,round:1,owner:'技术确认人'};
 const initial=reconcileTasks({projects:[{id:'P'}],reviewsByProject:{P:[review]}},{at});
 const returned=taskDomain.startTaskForObject({...initial,reviewsByProject:{P:[{...review,status:'已退回',round:2}]}},{projectId:'P',objectType:'review',objectId:'D',actorId:'demo-approver',at});
 assert.equal(selectMyTasks(returned,{actorId:'demo-approver',tab:'done'})[0].result,'退回');
 assert.equal(selectMyTasks(returned,{actorId:'demo-technical'})[0].status,'待处理');
 const saved=taskDomain.startTaskForObject({...returned,reviewsByProject:{P:[{...returned.reviewsByProject.P[0],plan:'修订方案'}]}},{projectId:'P',objectType:'review',objectId:'D',actorId:'demo-technical',at});
 assert.equal(selectMyTasks(saved,{actorId:'demo-technical'})[0].status,'处理中');
 const resubmitted=taskDomain.startTaskForObject({...saved,reviewsByProject:{P:[{...saved.reviewsByProject.P[0],status:'待审批'}]}},{projectId:'P',objectType:'review',objectId:'D',actorId:'demo-technical',at});
 assert.equal(selectMyTasks(resubmitted,{actorId:'demo-technical',tab:'done'})[0].result,'已提交');
 assert.equal(selectMyTasks(resubmitted,{actorId:'demo-approver'})[0].status,'待处理');
});
test('only the latest submitted snapshot is actionable for final approval',()=>{
 const older={id:'S1',status:'审批中',createdAt:'2026-10-21T00:00:00Z'},latest={id:'S2',status:'审批中',createdAt:'2026-10-22T00:00:00Z'};
 const state=reconcileTasks({projects:[{id:'P'}],actorId:'demo-approver',actorRole:'最终审批人',snapshotsByProject:{P:[older,latest]}},{at});
 assert.deepEqual(selectMyTasks(state,{actorId:'demo-approver'}).map(t=>t.snapshotId),['S2']);
 assert.throws(()=>assertBusinessAction(state,{projectId:'P',objectType:'snapshot',objectId:'S1',action:'approve'}),/最新/);
 assert.doesNotThrow(()=>assertBusinessAction(state,{projectId:'P',objectType:'snapshot',objectId:'S2',action:'approve'}));
});
test('overdue is a reminder for open tasks after the Shanghai deadline day',()=>{
 const task={status:'待处理',dueAt:'2026-10-24'};
 assert.equal(taskDomain.isTaskOverdue(task,new Date('2026-10-24T15:59:59.999Z')),false);
 assert.equal(taskDomain.isTaskOverdue(task,new Date('2026-10-24T16:00:00Z')),true);
 assert.equal(taskDomain.isTaskOverdue({...task,status:'已处理'},new Date('2026-10-25T00:00:00Z')),false);
 assert.equal(taskDomain.isTaskOverdue({...task,dueAt:''},new Date('2026-10-25T00:00:00Z')),false);
 assert.equal(taskDomain.isTaskOverdue({...task,dueAt:'2026-10-24T10:00:00Z'},new Date('2026-10-24T11:00:00Z')),true);
});

test('technical and approval roles cannot write customer clarification even outside task routes',()=>{
 const s={...state(),reviewsByProject:{P:[{id:'C',kind:'clarification',version:1,status:'待处理'}]}};
 for(const [actorRole,actorId] of [['技术确认人','demo-technical'],['最终审批人','demo-approver']]) {
  assert.throws(()=>assertBusinessAction({...s,actorRole,actorId},{projectId:'P',objectType:'review',objectId:'C',action:'save'}),/权限|职责/);
 }
 assert.doesNotThrow(()=>assertBusinessAction({...s,actorRole:'销售负责人',actorId:'demo-sales'},{projectId:'P',objectType:'review',objectId:'C',action:'save'}));
});

test('sales cannot process a professional proposal even if a legacy owner field names sales',()=>{
 const s={...state(),actorRole:'销售负责人',actorId:'demo-sales',reviewsByProject:{P:[{id:'D',owner:'销售负责人',version:1,status:'待处理'}]}};
 assert.throws(()=>assertBusinessAction(s,{projectId:'P',objectType:'review',objectId:'D',action:'save'}),/权限|职责/);
 const next=reconcileTasks(s,{at});
 assert.equal(selectMyTasks(next,{actorId:'demo-technical'}).find(t=>t.objectId==='D')?.kind,'review-process');
});

test('sales may request a new professional review round without editing the professional proposal',()=>{
 const s={...state(),actorRole:'销售负责人',actorId:'demo-sales',reviewsByProject:{P:[{id:'D',version:1,status:'已关闭'}]}};
 assert.doesNotThrow(()=>assertBusinessAction(s,{projectId:'P',objectType:'review',objectId:'D',action:'reopen'}));
 assert.throws(()=>assertBusinessAction(s,{projectId:'P',objectType:'review',objectId:'D',action:'save'}),/权限|职责/);
});

test('sales can record communication on a technical review without taking over its proposal task',()=>{
 const s=reconcileTasks({...state(),actorRole:'销售负责人',actorId:'demo-sales',reviewsByProject:{P:[{id:'D',requirementId:'R',version:1,status:'待处理',owner:'技术确认人'}]}},{at});
 assert.doesNotThrow(()=>assertBusinessAction(s,{projectId:'P',objectType:'review',objectId:'D',action:'communicate'}));
 assert.throws(()=>assertBusinessAction(s,{projectId:'P',objectType:'review',objectId:'D',action:'save'}),/权限|职责|处理人/);
 assert.throws(()=>assertBusinessAction({...s,actorRole:'技术确认人',actorId:'demo-technical'},{projectId:'P',objectType:'review',objectId:'D',action:'communicate'}),/权限|职责/);
 assert.equal(selectMyTasks(s,{actorId:'demo-technical'})[0]?.kind,'review-process');
});
