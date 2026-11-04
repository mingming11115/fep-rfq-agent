import test from 'node:test';import assert from 'node:assert/strict';import {diffRfqRequirements,refreshReviewForRevision} from './rfqWorkflow.js';
import {reconcileTasks,selectMyTasks} from './taskDomain.js';
test('duplicate or missing numbers require explicit revision mapping',()=>{
 const old=[{id:'A',clause:'1.1',original:'A'},{id:'B',clause:'1.1',original:'B'},{id:'C',clause:'',original:'C'}];
 assert.throws(()=>diffRfqRequirements(old,[{clause:'1.1',original:'new'}]));
 const changed=diffRfqRequirements(old,[{previousId:'B',clause:'1.1',original:'new'},{previousId:'C',clause:'',original:'C'},{previousId:'A',clause:'1.1',original:'A'}]);
 assert.equal(changed.find(d=>d.before?.id==='B').kind,'modified');assert.equal(changed.find(d=>d.before?.id==='C').kind,'unchanged');
});
test('source revision creates new processing and approval tasks without reviving old rounds',()=>{
 const row={id:'R',version:1,category:'技术',status:'评审中'};
 let s=reconcileTasks({projects:[{id:'P'}],requirementsByProject:{P:[row]},reviewsByProject:{P:[{id:'D',requirementId:'R',owner:'技术确认人',status:'待处理',version:1,round:1}]}});
 s.reviewsByProject.P[0]={...s.reviewsByProject.P[0],status:'待审批',submittedById:'demo-technical',approvedById:'old'};
 s=reconcileTasks(s);const oldApproval=selectMyTasks(s,{actorId:'demo-approver'})[0];
 const refreshed=refreshReviewForRevision(s.reviewsByProject.P[0],row,{...row,version:2});
 s=reconcileTasks({...s,reviewsByProject:{P:[refreshed]}});
 assert.equal(selectMyTasks(s,{actorId:'demo-technical'}).length,1);
 assert.equal(s.tasksById[oldApproval.id].status,'已失效');
 assert.equal(refreshed.submittedById,undefined);assert.equal(refreshed.approvedById,undefined);
 s.reviewsByProject.P[0]={...refreshed,status:'待审批'};s=reconcileTasks(s);
 const current=selectMyTasks(s,{actorId:'demo-approver'});assert.equal(current.length,1);assert.notEqual(current[0].id,oldApproval.id);
 assert.equal(s.tasksById[oldApproval.id].status,'已失效');
});
