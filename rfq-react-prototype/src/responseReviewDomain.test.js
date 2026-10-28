import test from 'node:test';
import assert from 'node:assert/strict';
import {canPerform} from './permissions.js';
import {reconcileTasks,confirmProjectRequirement,selectMyTasks,assertBusinessAction,transferBusinessTask} from './taskDomain.js';
import * as reviews from './reviewDomain.js';
import {applyRequirementEdit} from './domain.js';
import {upgradePrototypeState} from './stateMigration.js';
import {createDemoState} from './data.js';
import {removeProject,restoreProject} from './projectDomain.js';

export function fixture(){
 const ids=['sr','t1','t2','outside'];
 return {actorId:'sr',actorRole:'SR',accountsById:Object.fromEntries(ids.map(id=>[id,{id,name:id,enabled:true}])),businessUnits:[{id:'B'}],buPersonnelByBuId:{B:ids.map(userId=>({userId,roles:[userId==='sr'?'SR':'技术'],enabled:true,canConfirm:userId!=='sr'}))},projects:[{id:'P',buId:'B',ownerId:'sr',participantIds:['sr','t1','t2']}],requirementsByProject:{P:[{id:'R',version:1,status:'待确认',original:'客户要求',conclusion:'Comply',draft:'最终答复',evidence:'证据'}]},reviewsByProject:{P:[]},snapshotsByProject:{P:[]},tasksById:{}};
}
const context=s=>({state:s,actorId:s.actorId,projectId:'P',requirementId:'R'});
function withReview(){const s=fixture();s.actorId='t1';s.actorRole='技术';s.requirementsByProject.P[0].status='评审中';s.reviewsByProject.P=[{id:'D',kind:'review',requirementId:'R',version:1,round:1,requirementVersion:1,status:'待处理',reviewerIds:['t1','t2'],confirmations:{},plan:'核对方案',proposedDraft:'最终答复',proposedConclusion:'Comply'}];return s;}

test('project SR confirms ordinary response without a separate qualification or task entry',()=>{
 const s=reconcileTasks(fixture());assert.equal(canPerform('SR','response:confirm',context(s)),true);
 assert.equal(selectMyTasks(s,{actorId:'sr'}).length,1);
 assert.doesNotThrow(()=>assertBusinessAction(s,{projectId:'P',objectType:'requirement',objectId:'R',action:'confirm',route:{projectId:'P',taskId:Object.keys(s.tasksById)[0],action:'view'}}));
 assert.equal(confirmProjectRequirement(s,{projectId:'P',requirementId:'R',expectedVersion:1}).requirementsByProject.P[0].status,'已确认');
});
test('explicit assignment replaces SR default and rejects nonmembers',()=>{
 const s=fixture();s.requirementsByProject.P[0].confirmationAssigneeId='t1';assert.equal(canPerform('SR','response:confirm',context(s)),false);
 s.actorId='t1';s.actorRole='技术';assert.equal(canPerform('技术','response:confirm',context(s)),true);
 s.actorId='outside';assert.equal(canPerform('技术','response:confirm',context(s)),false);
});
test('each selected reviewer confirms independently and the last confirmation closes the item',()=>{
 let s=reconcileTasks(withReview());assert.equal(selectMyTasks(s,{actorId:'t1'}).length,1);assert.equal(selectMyTasks(s,{actorId:'t2'}).length,1);
 s=reconcileTasks(confirmProjectRequirement(s,{projectId:'P',requirementId:'R',expectedVersion:1}));
 assert.equal(s.requirementsByProject.P[0].status,'评审中');assert.equal(s.reviewsByProject.P[0].status,'处理中');
 assert.equal(selectMyTasks(s,{actorId:'t1'}).length,0);assert.equal(selectMyTasks(s,{actorId:'t1',tab:'done'})[0].result,'已确认');assert.equal(selectMyTasks(s,{actorId:'t2'}).length,1);
 s.actorId='t2';s=confirmProjectRequirement(s,{projectId:'P',requirementId:'R',expectedVersion:1});
 assert.equal(s.requirementsByProject.P[0].status,'已确认');assert.equal(s.reviewsByProject.P[0].status,'已关闭');assert.deepEqual(Object.keys(s.reviewsByProject.P[0].confirmations),['t1','t2']);assert.equal(s.requirementsByProject.P[0].pendingReviewProposal,null);
});
test('saving a new shared answer clears every confirmation and rejects a stale editor',()=>{
 let s=confirmProjectRequirement(withReview(),{projectId:'P',requirementId:'R',expectedVersion:1});
 s=reviews.updateResponseReview(s,{projectId:'P',reviewId:'D',expectedVersion:1,expectedRound:1,patch:{proposedDraft:'更新后的共同答复',plan:'新方案'}});
 assert.equal(s.requirementsByProject.P[0].draft,'更新后的共同答复');assert.equal(s.requirementsByProject.P[0].version,2);assert.deepEqual(s.reviewsByProject.P[0].confirmations,{});assert.equal(s.reviewsByProject.P[0].version,2);
 assert.throws(()=>reviews.updateResponseReview(s,{projectId:'P',reviewId:'D',expectedVersion:1,patch:{proposedDraft:'旧窗口'}}),/版本/);
 s=reconcileTasks(s);assert.equal(selectMyTasks(s,{actorId:'t1'}).length,1);assert.equal(selectMyTasks(s,{actorId:'t2'}).length,1);
});
test('editing confirmed response content reopens the same reviewers and invalidates their votes',()=>{
 let s=confirmProjectRequirement(withReview(),{projectId:'P',requirementId:'R',expectedVersion:1});s.actorId='t2';s=confirmProjectRequirement(s,{projectId:'P',requirementId:'R',expectedVersion:1});
 const before=s.requirementsByProject.P[0],after=applyRequirementEdit(before,{draft:'修改承诺'});
 s=reviews.resetResponseReviewConfirmations(s,'P',before,after);assert.equal(s.requirementsByProject.P[0].status,'评审中');assert.equal(s.reviewsByProject.P[0].status,'待处理');assert.deepEqual(s.reviewsByProject.P[0].confirmations,{});assert.ok(s.reviewsByProject.P[0].confirmationHistory.length);
});
test('unselected and disabled reviewers cannot save or confirm through review or response routes',()=>{
 let s=withReview();s.actorId='sr';s.actorRole='SR';assert.throws(()=>confirmProjectRequirement(s,{projectId:'P',requirementId:'R',expectedVersion:1}),/权限|评审人|确认/);
 assert.throws(()=>reviews.updateResponseReview(s,{projectId:'P',reviewId:'D',expectedVersion:1,patch:{proposedDraft:'越权'}}),/权限|评审人/);
 s.actorId='t1';s.actorRole='技术';s.accountsById.t1.enabled=false;assert.throws(()=>confirmProjectRequirement(s,{projectId:'P',requirementId:'R',expectedVersion:1}));
});
test('review assignment validates people, deduplicates selection, and clears old confirmations',()=>{
 let s=withReview();s.actorId='sr';s.actorRole='SR';
 assert.throws(()=>reviews.updateResponseReview(s,{projectId:'P',reviewId:'D',expectedVersion:1,patch:{action:'assign',reviewerIds:['outside'],reason:'改派'}}),/授权|资格/);
 s=reviews.updateResponseReview(s,{projectId:'P',reviewId:'D',expectedVersion:1,patch:{action:'assign',reviewerIds:['t2','t2'],reason:'改派'}});assert.deepEqual(s.reviewsByProject.P[0].reviewerIds,['t2']);
});
test('migration restores implicit SR defaults, keeps explicit assignments and removes pending approval nodes',()=>{
 const raw=upgradePrototypeState(createDemoState(),createDemoState());delete raw.responseReviewSchemaVersion;
 const p=raw.projects.find(p=>p.id==='RFQ-001');const rows=raw.requirementsByProject[p.id];rows[0].status='待确认';rows[0].confirmationAssigneeId='demo-technical';rows[1].confirmationAssigneeId='demo-technical-2';
 const upgraded=upgradePrototypeState(raw,createDemoState());assert.equal(upgraded.requirementsByProject[p.id][0].confirmationAssigneeId,undefined);assert.equal(upgraded.requirementsByProject[p.id][1].confirmationAssigneeId,'demo-technical-2');
 for(const r of upgraded.reviewsByProject[p.id].filter(r=>r.kind!=='clarification')){assert.ok(r.reviewerIds.length);assert.equal(r.approverId,undefined);assert.ok(!['待审批','待批准'].includes(r.status));}
 assert.deepEqual(upgradePrototypeState(upgraded,createDemoState()),upgraded);
});

test('review task transfer replaces just its reviewer and requires all newly assigned reviewers to confirm',()=>{
 let s=reconcileTasks(withReview());s.accountsById.t3={id:'t3',name:'t3',enabled:true};s.projects[0].participantIds.push('t3');s.buPersonnelByBuId.B.push({userId:'t3',roles:['技术'],enabled:true,canConfirm:true});
 const task=selectMyTasks(s,{actorId:'t1'})[0];s=transferBusinessTask(s,{taskId:task.id,to:'t3',reason:'专业分工'});
 assert.deepEqual(s.reviewsByProject.P[0].reviewerIds,['t3','t2']);assert.equal(selectMyTasks(s,{actorId:'t1'}).length,0);assert.equal(selectMyTasks(s,{actorId:'t3'}).length,1);
});
test('qualification revocation blocks shared answer edits from every entry',()=>{
 const s=withReview();s.buPersonnelByBuId.B.find(m=>m.userId==='t1').canConfirm=false;
 assert.equal(canPerform('技术','response:edit',context(s)),false);assert.equal(canPerform('技术','review:process',context(s)),false);
});
test('source version changes reopen a closed review and remove previous confirmations',()=>{
 let s=confirmProjectRequirement(withReview(),{projectId:'P',requirementId:'R',expectedVersion:1});s.actorId='t2';s=confirmProjectRequirement(s,{projectId:'P',requirementId:'R',expectedVersion:1});const before=structuredClone(s),row=s.requirementsByProject.P[0];s.requirementsByProject.P[0]={...row,version:2,sourceVersion:'V2',status:'待确认'};
 s=reviews.synchronizeResponseReviews(s,before);assert.equal(s.reviewsByProject.P[0].status,'待处理');assert.deepEqual(s.reviewsByProject.P[0].confirmations,{});assert.equal(s.requirementsByProject.P[0].status,'评审中');
});
test('migration preserves task transfers to the legacy default technical identity',()=>{
 let s=upgradePrototypeState(createDemoState(),createDemoState());delete s.responseReviewSchemaVersion;const row=s.requirementsByProject['RFQ-001'].find(r=>r.status!=='已确认');row.confirmationAssigneeId='demo-technical';s.tasksById.keep={id:'keep',projectId:'RFQ-001',objectType:'requirement',objectId:row.id,assigneeId:'demo-technical',history:[{action:'transfer',to:'demo-technical'}]};
 s=upgradePrototypeState(s,createDemoState());assert.equal(s.requirementsByProject['RFQ-001'].find(r=>r.id===row.id).confirmationAssigneeId,'demo-technical');
});
test('legacy pending review proposals stay visible and block confirmation until explicitly reconciled',()=>{
 let s=upgradePrototypeState(createDemoState(),createDemoState());delete s.responseReviewSchemaVersion;const row=s.requirementsByProject['RFQ-001'][0];row.status='待确认';row.pendingReviewProposal={reviewId:'OLD',baseVersion:row.version||1,proposal:{draft:'历史评审建议'}};s.reviewsByProject['RFQ-001'].unshift({id:'OLD',kind:'review',requirementId:row.id,ownerId:'demo-technical',status:'已关闭',proposedDraft:'历史评审建议',version:1});
 s=upgradePrototypeState(s,createDemoState());assert.equal(s.requirementsByProject['RFQ-001'][0].pendingReviewProposal.proposal.draft,'历史评审建议');s.actorId='demo-technical';s.actorRole='技术';assert.throws(()=>reviews.updateResponseReview(s,{projectId:'RFQ-001',reviewId:'OLD',expectedVersion:1,patch:{action:'confirm'}}),/建议|核对/);
});
test('reopening retains the exact reviewed response and cannot create competing open reviews',()=>{
 let s=confirmProjectRequirement(withReview(),{projectId:'P',requirementId:'R',expectedVersion:1});s.actorId='t2';s=confirmProjectRequirement(s,{projectId:'P',requirementId:'R',expectedVersion:1});
 s=reviews.updateResponseReview(s,{projectId:'P',reviewId:'D',expectedVersion:1,patch:{action:'reopen',reason:'条件变化'}});
 assert.equal(s.reviewsByProject.P[0].confirmationHistory[0].response.draft,'最终答复');assert.equal(s.reviewsByProject.P[0].confirmationHistory[0].plan,'核对方案');
 s.reviewsByProject.P.push({id:'OLD',kind:'review',requirementId:'R',status:'已关闭',version:1,reviewerIds:['t2']});
 assert.throws(()=>reviews.updateResponseReview(s,{projectId:'P',reviewId:'OLD',expectedVersion:1,patch:{action:'reopen',reason:'重复发起'}}),/进行中|已有/);
});
test('SR records communication without altering the shared answer or reviewer confirmations',()=>{
 let s=confirmProjectRequirement(withReview(),{projectId:'P',requirementId:'R',expectedVersion:1});s.actorId='sr';s.actorRole='SR';const row=structuredClone(s.requirementsByProject.P[0]),votes=structuredClone(s.reviewsByProject.P[0].confirmations);
 s=reviews.updateResponseReview(s,{projectId:'P',reviewId:'D',expectedVersion:1,patch:{customerCommunication:'客户已接受',acceptanceResult:'未验收'}});
 assert.equal(s.reviewsByProject.P[0].customerCommunication,'客户已接受');assert.deepEqual(s.reviewsByProject.P[0].confirmations,votes);assert.deepEqual(s.requirementsByProject.P[0],row);
});
test('ordinary save and reassignment cannot dismiss a pending legacy proposal',()=>{
 let s=withReview();s.requirementsByProject.P[0].pendingReviewProposal={reviewId:'D',baseVersion:1,proposal:{draft:'待核对建议'}};
 s=reviews.updateResponseReview(s,{projectId:'P',reviewId:'D',expectedVersion:1,patch:{plan:'补充处理说明'}});assert.equal(s.requirementsByProject.P[0].pendingReviewProposal.proposal.draft,'待核对建议');
 s=reviews.updateResponseReview(s,{projectId:'P',reviewId:'D',expectedVersion:2,patch:{action:'assign',reviewerIds:['t1'],reason:'调整'}});assert.ok(s.requirementsByProject.P[0].pendingReviewProposal);
 const row=s.requirementsByProject.P[0];s=reviews.resetResponseReviewConfirmations(s,'P',row,applyRequirementEdit(row,{draft:'人工修改'}));assert.ok(s.requirementsByProject.P[0].pendingReviewProposal);
});
test('old unscoped personnel assignment audits preserve potentially explicit assignments within their BU',()=>{
 let s=upgradePrototypeState(createDemoState(),createDemoState());delete s.responseReviewSchemaVersion;const row=s.requirementsByProject['RFQ-001'][0];row.status='待确认';row.confirmationAssigneeId='demo-technical';s.audit.push({action:'分派条款确认人',buId:'BU-DEMO',object:'BU-DEMO',before:'demo-sales',after:'demo-technical'});
 s=upgradePrototypeState(s,createDemoState());assert.equal(s.requirementsByProject['RFQ-001'][0].confirmationAssigneeId,'demo-technical');
});
test('restoring a deleted legacy project migrates its pending approval to reviewer confirmation',()=>{
 let s=withReview();s.actorId='sr';s.actorRole='SR';s.reviewsByProject.P[0]={id:'D',requirementId:'R',kind:'review',ownerId:'t1',approverId:'t2',status:'待审批',version:1};s=removeProject(s,'P');
 s=upgradePrototypeState(s,createDemoState());s=upgradePrototypeState(restoreProject(s,'P'),createDemoState());
 assert.deepEqual(s.reviewsByProject.P[0].reviewerIds,['t1']);assert.equal(s.reviewsByProject.P[0].status,'待处理');assert.equal(s.reviewsByProject.P[0].approverId,undefined);
});
test('old source links cannot edit review or response content even when task entry is optional',()=>{
 const s=withReview();s.requirementsByProject.P[0].sourceVersion='V2';s.requirementsByProject.P[0].sourceFileId='F';const route={requirementId:'R',sourceVersion:'V1',fileId:'F'};
 assert.throws(()=>assertBusinessAction(s,{projectId:'P',objectType:'review',objectId:'D',route}),/来源|版本/);
 assert.throws(()=>reviews.updateResponseReview(s,{projectId:'P',reviewId:'D',expectedVersion:1,route,patch:{plan:'旧来源上的修改'}}),/来源|版本/);
});
test('legacy closed review with an unconfirmed response resumes reviewer confirmation',()=>{
 let s=withReview();s.reviewsByProject.P[0].status='已关闭';s.reviewsByProject.P[0].ownerId='t1';delete s.reviewsByProject.P[0].reviewerIds;s=upgradePrototypeState(s,createDemoState());
 assert.equal(s.reviewsByProject.P[0].status,'待处理');s.actorId='t1';s.actorRole='技术';s=confirmProjectRequirement(s,{projectId:'P',requirementId:'R',expectedVersion:1});assert.equal(s.requirementsByProject.P[0].status,'已确认');
});
