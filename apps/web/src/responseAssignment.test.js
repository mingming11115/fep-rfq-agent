import test from 'node:test';
import assert from 'node:assert/strict';
import {getResponseAssignmentContext, assignResponse} from './responseAssignment.js';
import {reconcileTasks, selectMyTasks, assertBusinessAction, confirmProjectRequirement} from './taskDomain.js';
import {getConfirmationActorIds} from './confirmationPolicy.js';
import {updateResponseReview} from './reviewDomain.js';
import {canReviewWithoutManualConfirmation} from './responseRecommendation.js';

function fixture() {
  const ids = ['sr', 't1', 't2', 'outside'];
  return {actorId:'sr', actorRole:'SR', accountsById:Object.fromEntries(ids.map(id => [id,{id,name:id,enabled:true}])),
    businessUnits:[{id:'B'}], buPersonnelByBuId:{B:ids.map(userId => ({userId,roles:[userId==='sr'?'SR':'技术'],enabled:true,canConfirm:userId!=='sr'}))},
    projects:[{id:'P',buId:'B',ownerId:'sr',participantIds:['sr','t1','t2']}],
    requirementsByProject:{P:[{id:'R',version:1,status:'待确认',original:'客户要求',conclusion:'Comply',draft:'答复',evidence:'依据',sourceFileId:'F',sourceVersion:'V1'}]},
    reviewsByProject:{P:[]}, snapshotsByProject:{P:[]}, tasksById:{}, audit:[]};
}
const request = (state, patch={}) => ({projectId:'P',requirementId:'R',userIds:['t1'],reason:'调整条款分工',
  expectedVersion:1,expectedAssigneeIds:getConfirmationActorIds(state,'P',state.requirementsByProject.P[0]),expectedReviewId:null,...patch});
test('an unassigned card defaults to the eligible project creator even after handover', () => {
  const state = fixture();
  state.projects[0].createdById = 't1';
  const next = reconcileTasks(state);
  assert.deepEqual(getResponseAssignmentContext(next,'P','R').actorIds,['t1']);
  assert.deepEqual(selectMyTasks(next,{actorId:'t1'}).map(task=>task.requirementId),['R']);
  assert.doesNotThrow(()=>assertBusinessAction({...next,actorId:'t1',actorRole:'技术'},{projectId:'P',objectType:'requirement',objectId:'R',action:'confirm'}));
  state.buPersonnelByBuId.B.find(member=>member.userId==='t1').canConfirm=false;
  assert.deepEqual(getResponseAssignmentContext(state,'P','R').actorIds,['sr']);
});
function withReview(closed=false) {
  const state = fixture();
  state.requirementsByProject.P[0] = {...state.requirementsByProject.P[0],status:closed?'已确认':'评审中',...(closed?{confirmedByIds:['t1'],confirmedAt:'2026-10-28'}:{})};
  state.reviewsByProject.P = [{id:'D',kind:'review',requirementId:'R',version:2,round:1,status:closed?'已关闭':'处理中',reviewerIds:['t1'],confirmations:{t1:{actorId:'t1',requirementVersion:1,reviewVersion:2,round:1}},plan:'原方案'}];
  return state;
}

test('card assignment moves the ordinary confirmation task and records the assignment audit', () => {
  const before = reconcileTasks(fixture());
  assert.equal(getResponseAssignmentContext(before,'P','R').label,'指派确认人');
  const next = reconcileTasks(assignResponse(before,request(before)));
  assert.deepEqual(getConfirmationActorIds(next,'P',next.requirementsByProject.P[0]),['t1']);
  assert.equal(getResponseAssignmentContext(next,'P','R').label,'改派确认人');
  assert.equal(selectMyTasks(next,{actorId:'sr'}).filter(t=>t.objectId==='R').length,0);
  assert.equal(selectMyTasks(next,{actorId:'t1'}).filter(t=>t.objectId==='R').length,1);
  assert.equal(next.audit[0].requirementId,'R');
  assert.equal(next.audit[0].reason,'调整条款分工');
  assert.throws(()=>assertBusinessAction(next,{projectId:'P',objectType:'requirement',objectId:'R',action:'confirm'}));
  assert.doesNotThrow(()=>assertBusinessAction({...next,actorId:'t1',actorRole:'技术'},{projectId:'P',objectType:'requirement',objectId:'R',action:'confirm'}));
});

test('confirmation reassignment leaves open review personnel votes deadline and version untouched', () => {
  const before = withReview();
  const next = reconcileTasks(assignResponse(before,request(before,{userIds:['t2']})));
  assert.deepEqual(next.reviewsByProject.P,before.reviewsByProject.P);
  assert.deepEqual(getConfirmationActorIds(next,'P',next.requirementsByProject.P[0]),['t2']);
  assert.equal(next.requirementsByProject.P[0].status,'评审中');
  assert.equal(selectMyTasks(next,{actorId:'t2'}).some(t=>t.objectId==='D'),false);
  assert.throws(()=>confirmProjectRequirement({...next,actorId:'t2',actorRole:'技术'},{projectId:'P',requirementId:'R',expectedVersion:1}),/评审|事项/);
});

test('confirmation reassignment preserves closed reviews and the previously confirmed response', () => {
  const before = withReview(true);
  const next = assignResponse(before,request(before,{userIds:['t2']}));
  assert.deepEqual(next.reviewsByProject.P,before.reviewsByProject.P);
  assert.equal(next.requirementsByProject.P[0].status,'已确认');
  assert.deepEqual(next.requirementsByProject.P[0].confirmedByIds,['t1']);
  assert.equal(next.requirementsByProject.P[0].confirmedAt,'2026-10-28');
  assert.deepEqual(getConfirmationActorIds(next,'P',next.requirementsByProject.P[0]),['t2']);
});

test('review completion hands off to the independently assigned confirmer without changing reviewers', () => {
  const before = withReview();
  before.requirementsByProject.P[0].needsReview = true;
  let state = assignResponse(before,request(before,{userIds:['t2']}));
  state = reconcileTasks(updateResponseReview({...state,actorId:'t1',actorRole:'技术'},
    {projectId:'P',reviewId:'D',expectedVersion:2,expectedRound:1,patch:{action:'confirm'}}));
  assert.equal(state.reviewsByProject.P[0].status,'已关闭');
  assert.deepEqual(state.reviewsByProject.P[0].reviewerIds,['t1']);
  assert.equal(state.requirementsByProject.P[0].status,'待确认');
  assert.equal(state.requirementsByProject.P[0].confirmedAt,undefined);
  assert.equal(selectMyTasks(state,{actorId:'t2'}).some(t=>t.objectId==='R'&&t.kind==='confirm'),true);
  assert.throws(()=>confirmProjectRequirement(state,{projectId:'P',requirementId:'R',expectedVersion:1}),/权限/);
  state = confirmProjectRequirement({...state,actorId:'t2',actorRole:'技术'},{projectId:'P',requirementId:'R',expectedVersion:1});
  assert.equal(state.requirementsByProject.P[0].status,'已确认');
  assert.equal(state.requirementsByProject.P[0].confirmedById,'t2');
  assert.deepEqual(state.requirementsByProject.P[0].confirmedByIds,['t2']);
  assert.deepEqual(state.reviewsByProject.P[0].reviewerIds,['t1']);
});

test('ordinary reassignment preserves the saved response and previous confirmation', () => {
  const before = fixture();
  Object.assign(before.requirementsByProject.P[0],{status:'已确认',confirmedAt:'2026-10-28',confirmedById:'sr'});
  const next = assignResponse(before,request(before));
  assert.deepEqual(next.requirementsByProject.P[0],{...before.requirementsByProject.P[0],confirmationAssigneeId:'t1',confirmationAssignmentSource:'explicit'});
});

test('an explicitly assigned confirmation cannot be skipped by a system Comply recommendation', () => {
  const before = fixture();
  Object.assign(before.requirementsByProject.P[0],{matchLevel:'standard',score:99,
    systemRecommendation:{conclusion:'Comply',original:'客户要求',draft:'答复',evidence:'依据',sourceVersion:'V1'}});
  assert.equal(canReviewWithoutManualConfirmation(before.requirementsByProject.P[0],'P'),true);
  const next = reconcileTasks(assignResponse(before,request(before)));
  assert.equal(canReviewWithoutManualConfirmation(next.requirementsByProject.P[0],'P'),false);
  assert.equal(selectMyTasks(next,{actorId:'t1'}).some(task=>task.objectId==='R'),true);
});

test('only project assignment managers can reassign the confirmer even when a review exists', () => {
  const before = fixture();
  for(const [actorId,actorRole] of [['t1','技术'],['outside','技术'],['sr','BU管理员']]) {
    const state = {...before,actorId,actorRole};
    assert.equal(getResponseAssignmentContext(state,'P','R').canAssign,false);
    assert.throws(()=>assignResponse(state,request(state)),/权限/);
  }
  const state = {...withReview(),actorId:'t1',actorRole:'技术'};
  assert.equal(getResponseAssignmentContext(state,'P','R').canAssign,false);
  assert.throws(()=>assignResponse(state,request(state,{userIds:['t2']})),/权限/);
});

test('assignment rejects unqualified recipients empty reasons and unchanged assignees', () => {
  const state = fixture();
  assert.throws(()=>assignResponse(state,request(state,{userIds:['outside']})),/资格|授权/);
  assert.throws(()=>assignResponse(state,request(state,{userIds:[]})),/选择/);
  assert.throws(()=>assignResponse(state,request(state,{userIds:['t1','t2']})),/一位/);
  assert.throws(()=>assignResponse(state,request(state,{reason:' '})),/原因/);
  assert.throws(()=>assignResponse(state,request(state,{userIds:['sr']})),/其他|变化/);
});

test('stale versions source links and concurrent reassignment cannot overwrite newer assignments', () => {
  const state = fixture();
  assert.throws(()=>assignResponse(state,request(state,{expectedVersion:0})),/版本/);
  assert.throws(()=>assignResponse(state,request(state,{route:{requirementId:'R',sourceVersion:'old'}})),/旧来源/);
  const changed = assignResponse(state,request(state));
  assert.throws(()=>assignResponse(changed,request(state,{userIds:['t2']})),/分工.*变化/);
  assert.throws(()=>assignResponse(withReview(),request(state)),/分工.*变化/);
});
