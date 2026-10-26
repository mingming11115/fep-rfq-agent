import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState} from './data.js';
import {upgradePrototypeState} from './stateMigration.js';
import * as tasks from './taskDomain.js';
import * as projects from './projectDomain.js';
import * as selectors from './projectSelectors.js';
import {assignProjectDuty,canAccessProject,updateBuMember} from './personnelDomain.js';
import * as personnel from './personnelDomain.js';
const ready=()=>{const s=upgradePrototypeState(createDemoState(),createDemoState());s.actorId='demo-technical';s.actorRole='技术';s.activeProjectId='RFQ-001';s.reviewsByProject['RFQ-001']=[];s.requirementsByProject['RFQ-001']=[{id:'R',version:1,status:'待确认',readyForConfirmation:true,confirmationAssigneeId:'demo-technical',original:'客户要求',conclusion:'Comply',draft:'答复',evidence:'证据'}];return tasks.reconcileTasks(s);};
test('unknown legacy projects gain no demo BU or demo account authorization',()=>{
 const s=upgradePrototypeState({projects:[{id:'CUSTOM-PRIVATE',name:'未知归属项目'}],deletedProjectsById:{UNKNOWN:{project:{id:'UNKNOWN',name:'未知删除记录'}}}},createDemoState());
 for(const actor of ['demo-sales','demo-technical'])assert.equal(canAccessProject(s,actor,'CUSTOM-PRIVATE'),false);
 assert.deepEqual(selectors.selectAccessibleState(s,'demo-sales').deletedProjectsById,{});
});
test('loading old demo data preserves edited rows and single-signature historical snapshots in the main record',()=>{
 const s=createDemoState();delete s.demoProjectStagesVersion;delete s.personnelSchemaVersion;delete s.accountsById;
 s.snapshotsByProject['RFQ-002']=[{id:'historic-single-signature',status:'已批准',reviewedById:'demo-approver'}];s.requirementsByProject['RFQ-001'][0].draft='历史人工修改';
 const n=upgradePrototypeState(s,createDemoState());assert.deepEqual(n.snapshotsByProject['RFQ-002'],s.snapshotsByProject['RFQ-002']);assert.equal(n.requirementsByProject['RFQ-001'][0].draft,'历史人工修改');
});
test('assigning back to a previous confirmer creates a fresh actionable task and preserves invalidated history',()=>{
 let s=ready();const old=tasks.selectMyTasks(s,{actorId:'demo-technical'})[0].id;
 for(const userId of ['demo-technical-2','demo-technical'])s=tasks.reconcileTasks(assignProjectDuty(s,{actorId:'demo-sales',projectId:'RFQ-001',userId,duty:'confirm',requirementId:'R',reason:'调整分工'}));
 const current=tasks.selectMyTasks(s,{actorId:'demo-technical'});assert.equal(current.length,1);assert.notEqual(current[0].id,old);assert.equal(s.tasksById[old].status,'已失效');
});
test('task transfer synchronizes clause ownership and leaves the recipient able to confirm',()=>{
 const s=ready(),task=tasks.selectMyTasks(s,{actorId:s.actorId})[0];
 const n=tasks.transferBusinessTask(s,{taskId:task.id,to:'demo-technical-2',reason:'专业交接'});
 assert.equal(n.requirementsByProject['RFQ-001'][0].confirmationAssigneeId,'demo-technical-2');
 assert.doesNotThrow(()=>tasks.assertBusinessAction({...n,actorId:'demo-technical-2',actorRole:'技术'},{projectId:'RFQ-001',objectType:'requirement',objectId:'R',action:'confirm'}));
 assert.throws(()=>tasks.assertBusinessAction(n,{projectId:'RFQ-001',objectType:'requirement',objectId:'R',action:'confirm'}));
 const current=tasks.selectMyTasks(n,{actorId:'demo-technical-2'})[0];assert.equal(current.arrivedAt,task.arrivedAt);assert.equal(current.dueAt,task.dueAt);
});
test('new project confirmation relies on assigned personnel rather than obsolete category-role strings',()=>{
 const s=ready();s.projects.find(p=>p.id==='RFQ-001').approvalConfig={finalReviewers:{srId:'demo-sales',technicalIds:['demo-technical']}};
 const n=tasks.confirmProjectRequirement(s,{projectId:'RFQ-001',requirementId:'R',expectedVersion:1});assert.equal(n.requirementsByProject['RFQ-001'][0].status,'已确认');
});
test('handover checks the requested project owner and only accepts an authorized SR',()=>{
 const s=ready();s.actorId='demo-sales';s.actorRole='SR';s.projects.find(p=>p.id==='RFQ-002').ownerId='someone-else';
 assert.throws(()=>projects.handoverProject(s,{projectId:'RFQ-002',to:'demo-technical',reason:'移交'}));
 assert.throws(()=>projects.handoverProject(s,{projectId:'RFQ-001',to:'demo-technical',reason:'移交'}),/SR|资格/);
});
test('readable state excludes deleted project names and content without authorization',()=>{
 let s=ready();s.deletedProjectsById={SECRET:{project:{id:'SECRET',name:'不可见项目',buId:'BU-DEMO',participantIds:['other'],ownerId:'other'},maps:{requirementsByProject:[{draft:'秘密'}]}}};
 const n=selectors.selectAccessibleState(s,s.actorId);assert.deepEqual(n.deletedProjectsById,{});
});
test('a technician cannot edit a confirmed clause assigned to another technical member',()=>{
 const s=ready();s.requirementsByProject['RFQ-001'][0].status='已确认';s.actorId='demo-technical-2';
 assert.throws(()=>tasks.assertBusinessAction(tasks.reconcileTasks(s),{projectId:'RFQ-001',objectType:'requirement',objectId:'R',action:'save'}));
});
test('an old pending professional proposal without a submitter is returned for resubmission instead of becoming stuck',()=>{
 const old={actorRole:'销售负责人',projects:[{id:'P',ownerId:'demo-sales',participantIds:['demo-sales','demo-technical','demo-approver']}],reviewsByProject:{P:[{id:'D',requirementId:'R',status:'待审批',plan:'原方案',version:1}]}};
 const n=upgradePrototypeState(old,createDemoState());assert.equal(n.reviewsByProject.P[0].status,'已退回');assert.equal(n.reviewsByProject.P[0].plan,'原方案');assert.equal(tasks.selectMyTasks(tasks.reconcileTasks(n),{actorId:'demo-technical'}).filter(t=>t.kind==='review-process').length,1);
});
test('professional approval transfer synchronizes the approver and rejects transfer back to its submitter',()=>{
 const s=ready();s.reviewsByProject['RFQ-001']=[{id:'D',requirementId:'R',status:'待审批',version:1,ownerId:'demo-technical',submittedById:'demo-technical',approverId:'demo-approver'}];s.actorId='demo-approver';
 const before=tasks.reconcileTasks(s),task=tasks.selectMyTasks(before,{actorId:'demo-approver'})[0];
 const n=tasks.transferBusinessTask(before,{taskId:task.id,to:'demo-technical-2',reason:'批准工作交接'});assert.equal(n.reviewsByProject['RFQ-001'][0].approverId,'demo-technical-2');
 assert.doesNotThrow(()=>tasks.assertBusinessAction({...n,actorId:'demo-technical-2'},{projectId:'RFQ-001',objectType:'review',objectId:'D',action:'approve'}));
 assert.throws(()=>tasks.transferBusinessTask(before,{taskId:task.id,to:'demo-technical',reason:'转给提交人'}));
});
test('a project owner can reassign professional approval only to an independently qualified project member',()=>{
 const s=ready();s.actorId='demo-sales';s.actorRole='SR';s.reviewsByProject['RFQ-001']=[{id:'D',status:'待审批',submittedById:'demo-technical',approverId:'demo-approver'}];
 const n=personnel.assignReviewApprover(s,{actorId:s.actorId,projectId:'RFQ-001',reviewId:'D',userId:'demo-technical-2',reason:'调整专业批准人'});
 assert.equal(n.reviewsByProject['RFQ-001'][0].approverId,'demo-technical-2');
 assert.throws(()=>personnel.assignReviewApprover(s,{actorId:s.actorId,projectId:'RFQ-001',reviewId:'D',userId:'demo-technical',reason:'提交人自批'}));
});
