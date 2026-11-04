import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState} from './data.js';
import {upgradePrototypeState} from './stateMigration.js';
import {reconcileTasks,assertBusinessAction,selectMyTasks,applyTaskAction} from './taskDomain.js';
import {getProjectFinalReview,assignProjectDuty,updateBuMember} from './personnelDomain.js';
import {applyFinalReviewDecision} from './finalReviewDomain.js';
import {currentProjectScope,snapshotFingerprint,invalidatePendingSnapshots} from './snapshotDomain.js';
import {canPerform,canAccessPage} from './permissions.js';
const setup=()=>{const s=upgradePrototypeState(createDemoState(),createDemoState());s.actorId='demo-sales';s.actorRole='SR';s.activeProjectId='RFQ-001';s.requirementsByProject['RFQ-001']=[{id:'R',version:1,status:'待确认',readyForConfirmation:true,confirmationAssigneeId:'demo-technical'}];s.reviewsByProject['RFQ-001']=[];return s;};
test('assigned SR may confirm a clause and BU or platform administration cannot bypass project rights',()=>{
 let s=setup();s=assignProjectDuty(s,{actorId:s.actorId,projectId:'RFQ-001',userId:s.actorId,duty:'confirm',requirementId:'R',reason:'SR负责商务要求'});s=reconcileTasks(s);
 assert.doesNotThrow(()=>assertBusinessAction(s,{projectId:'RFQ-001',objectType:'requirement',objectId:'R',action:'confirm'}));
 for(const [actorId,actorRole]of [['demo-bu-admin','BU管理员'],['demo-system-admin','后台管理']])assert.throws(()=>assertBusinessAction({...s,actorId,actorRole},{projectId:'RFQ-001',objectType:'requirement',objectId:'R',action:'save'}));
});
test('the all-member review creates distinct tasks and a single vote completes only its own task',()=>{
 let s=setup();s.requirementsByProject['RFQ-001'][0].status='已确认';const finalReview=getProjectFinalReview(s,'RFQ-001');
 const snapshot={id:'S',projectId:'RFQ-001',status:'审批中',version:1,createdById:'demo-sales',finalReview};s.snapshotsByProject['RFQ-001']=[snapshot];s=reconcileTasks(s);
 assert.equal(Object.values(s.tasksById).filter(t=>t.kind==='final-approve'&&t.status==='待处理').length,4);
 s.snapshotsByProject['RFQ-001']=[applyFinalReviewDecision(snapshot,{actorId:'demo-sales',side:'sr',result:'approved'})];s=reconcileTasks(s);
 assert.equal(selectMyTasks(s,{actorId:'demo-sales',tab:'done'}).filter(t=>t.kind==='final-approve').length,1);
 assert.equal(Object.values(s.tasksById).filter(t=>t.kind==='final-approve'&&t.status==='待处理').length,3);
 assert.deepEqual(reconcileTasks(s),s);
});
test('rejection cancels remaining review tasks and does not credit uncast votes as rejections',()=>{
 const s=setup();s.requirementsByProject['RFQ-001'][0].status='已确认';const snap={id:'S',status:'审批中',finalReview:getProjectFinalReview(s,'RFQ-001'),createdById:'demo-sales'};s.snapshotsByProject['RFQ-001']=[snap];
 const before=reconcileTasks(s);before.snapshotsByProject['RFQ-001']=[applyFinalReviewDecision(snap,{actorId:'demo-technical',side:'technical',result:'rejected',reason:'补证'})];
 const after=reconcileTasks(before),tasks=Object.values(after.tasksById).filter(t=>t.kind==='final-approve');
 assert.equal(tasks.filter(t=>t.status==='已处理'&&t.result==='退回').length,1);assert.equal(tasks.filter(t=>t.status==='已取消').length,3);
});
test('revoked users and mismatched active roles cannot act through a previously open task',()=>{
 let s=reconcileTasks({...setup(),actorId:'demo-technical',actorRole:'技术'}),t=selectMyTasks(s,{actorId:s.actorId})[0];
 s=updateBuMember(s,{actorId:'demo-bu-admin',buId:'BU-DEMO',userId:s.actorId,patch:{enabled:false},reason:'离岗'});
 assert.throws(()=>assertBusinessAction(s,{projectId:'RFQ-001',objectType:'requirement',objectId:'R',action:'confirm'}));
 assert.throws(()=>applyTaskAction(t,{type:'start',actorId:s.actorId,objectVersion:1},s));
 const f=setup();assert.equal(canPerform('技术','snapshot:approve',{state:f,actorId:'demo-sales',projectId:'RFQ-001'}),false);
 assert.equal(canAccessPage('SR','bu-admin',{state:f,actorId:'demo-sales',buId:'BU-DEMO'}),false);
});
test('project review-mode changes invalidate frozen approval without discarding prior votes',()=>{
 let s=setup();s.snapshotsByProject['RFQ-001']=[];const scope=currentProjectScope(s,'RFQ-001',{});const snap={id:'S',status:'审批中',finalReview:getProjectFinalReview(s,'RFQ-001'),approvalScope:scope,approvalFingerprint:snapshotFingerprint(scope)};
 s.snapshotsByProject['RFQ-001']=[snap];const project=s.projects.find(p=>p.id==='RFQ-001');project.technicalReviewSettings={technicalMode:'representative',version:project.technicalReviewSettings.version+1};
 assert.equal(invalidatePendingSnapshots(s).snapshotsByProject['RFQ-001'][0].stale,true);
});
