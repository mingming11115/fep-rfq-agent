import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState} from './data.js';
import {upgradePrototypeState} from './stateMigration.js';
import {tidyDemoState} from './demoCleanup.js';
import {getExportIssues} from './domain.js';
import {getFinalReviewGate} from './finalReviewFlow.js';
import {isFinalReviewApproved} from './finalReviewDomain.js';
import {getRequiredFinalReviewers,canAccessProject} from './personnelDomain.js';
import {getProjectSummary} from './projectSelectors.js';
import {reconcileTasks,selectMyTasks,confirmProjectRequirement} from './taskDomain.js';
import {checkSnapshotValidity,currentProjectScope,invalidatePendingSnapshots} from './snapshotDomain.js';
import {addReviewScenarioDemos,addStoredReviewScenarioDemos} from './demoReviewScenarios.js';

const at='2026-11-03T05:00:00.000Z';
const fixture=()=>{const seed=createDemoState();return reconcileTasks(tidyDemoState(upgradePrototypeState(seed,seed)));};
const scenario=(state,kind)=>state.projects.find(project=>project.demoReviewScenario===kind);
const storageFor=state=>{
  const data=new Map([['fep-rfq-app-v1',JSON.stringify(state)]]);
  return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
};

test('new mocks preserve all existing projects, manual answers and completed approvals',()=>{
  const before=fixture();before.requirementsByProject['RFQ-001'][0].draft='保留人工答复';
  const original=structuredClone(before),next=addReviewScenarioDemos(before,{at});
  assert.deepEqual(before,original,'initialization must not mutate its input');
  assert.equal(next.projects.length,before.projects.length+3);
  for(const project of before.projects){
    assert.deepEqual(next.projects.find(item=>item.id===project.id),project);
    for(const key of ['requirementsByProject','reviewsByProject','snapshotsByProject','documentsByProject','exportScopesByProject','membersByProject'])assert.deepEqual(next[key]?.[project.id],before[key]?.[project.id]);
  }
  assert.equal(next.actorId,before.actorId);assert.equal(next.activeProjectId,before.activeProjectId);
});

test('partial-review mock has confirmed clauses and actionable reviews for the remaining clauses',()=>{
  let state=reconcileTasks(addReviewScenarioDemos(fixture(),{at})),project=scenario(state,'partial-review');
  const rows=state.requirementsByProject[project.id],reviews=state.reviewsByProject[project.id];
  assert.equal(rows.length,4);assert.equal(rows.filter(row=>row.status==='已确认').length,2);
  assert.equal(rows.filter(row=>row.status==='评审中').length,2);assert.equal(reviews.length,2);
  assert.equal(state.snapshotsByProject[project.id].length,0);
  assert.ok(getExportIssues(rows,reviews,project.id).length);
  for(const review of reviews){
    const actorId=review.reviewerIds[0];state={...state,actorId,actorRole:'技术'};
    assert.ok(selectMyTasks(state,{actorId,projectId:project.id}).some(task=>task.objectId===review.id));
    const row=state.requirementsByProject[project.id].find(row=>row.id===review.requirementId);
    state=confirmProjectRequirement(state,{projectId:project.id,requirementId:row.id,expectedVersion:row.version});
  }
  assert.deepEqual(getExportIssues(state.requirementsByProject[project.id],state.reviewsByProject[project.id],project.id),[]);
});

test('ready-final mock has no submission blockers or previous snapshot',()=>{
  const state=addReviewScenarioDemos(fixture(),{at}),project=scenario(state,'ready-final');
  assert.equal(state.requirementsByProject[project.id].filter(row=>row.status==='已确认').length,4);
  assert.deepEqual(getExportIssues(state.requirementsByProject[project.id],state.reviewsByProject[project.id],project.id),[]);
  assert.deepEqual(state.snapshotsByProject[project.id],[]);
  assert.match(getFinalReviewGate(state,project.id).reason,/请先发起最终评审/);
  assert.ok(canAccessProject(state,'demo-sales',project.id));
});

test('approved-final mock has all required votes and a current exportable snapshot',()=>{
  const state=reconcileTasks(invalidatePendingSnapshots(upgradePrototypeState(addReviewScenarioDemos(fixture(),{at}),createDemoState()))),project=scenario(state,'approved-final'),snapshot=state.snapshotsByProject[project.id][0];
  assert.equal(snapshot.status,'已批准');assert.equal(isFinalReviewApproved(snapshot),true);
  assert.equal(getRequiredFinalReviewers(snapshot.finalReview).length,4);
  assert.equal(checkSnapshotValidity(snapshot,currentProjectScope(state,project.id,snapshot)).valid,true);
  assert.equal(getFinalReviewGate(state,project.id).canExport,true);
  assert.equal(getProjectSummary(state,project.id,'demo-sales').stage,'审批完成');
  assert.equal(snapshot.exports?.length||0,0,'approval is a separate demo stage from export');
  for(const row of snapshot.rows){assert.match(row.draft,/模拟/);assert.match(row.evidence,/模拟/);}
  assert.match(snapshot.submissionReason,/模拟/);
});

test('refresh preserves later edits and never recreates a deleted demo',()=>{
  const state=addReviewScenarioDemos(fixture(),{at}),project=scenario(state,'ready-final');
  state.requirementsByProject[project.id][0].draft='用户后续修改';
  state.projects=state.projects.filter(item=>item.id!==scenario(state,'partial-review').id);
  assert.equal(addReviewScenarioDemos(state,{at}),state);
});

test('other BUs and unavailable demo personnel do not receive synthetic projects or privileges',()=>{
  const state=fixture();state.businessUnits=[{id:'OTHER',name:'实际BU'}];
  assert.equal(addReviewScenarioDemos(state,{at}),state);
  const disabled=fixture();disabled.accountsById['demo-sales'].enabled=false;
  assert.equal(addReviewScenarioDemos(disabled,{at}),disabled);
});

test('reserved-ID collisions preserve the existing project and allocate a separate mock',()=>{
  const before=fixture(),existing={id:'RFQ-DEMO-READY-FINAL',name:'用户项目',buId:'OTHER'};
  before.projects.push(existing);before.requirementsByProject[existing.id]=[{id:'USER',draft:'保留'}];
  const next=addReviewScenarioDemos(before,{at});
  assert.deepEqual(next.projects.find(project=>project.id===existing.id),existing);
  assert.deepEqual(next.requirementsByProject[existing.id],[{id:'USER',draft:'保留'}]);
  assert.notEqual(scenario(next,'ready-final').id,existing.id);
});

test('stored initialization backs up current work and creates matching document caches once',()=>{
  const before=fixture(),storage=storageFor(before),next=addStoredReviewScenarioDemos(storage,before,{at});
  const backup=JSON.parse(storage.getItem('fep-rfq-demo-before-review-scenarios-v1'));
  assert.deepEqual(backup.state,JSON.parse(JSON.stringify(before)));
  assert.deepEqual(JSON.parse(storage.getItem('fep-rfq-app-v1')),JSON.parse(JSON.stringify(next)));
  for(const project of next.projects.filter(project=>project.demoReviewScenario)){
    const cache=JSON.parse(storage.getItem(`fep-rfq-documents:${project.id}`));
    assert.deepEqual(cache.parsed,JSON.parse(JSON.stringify(next.requirementsByProject[project.id])));
    assert.deepEqual(cache.files,JSON.parse(JSON.stringify(next.documentsByProject[project.id])));
  }
  assert.equal(addStoredReviewScenarioDemos(storage,next,{at}),next);
});

test('a storage failure rolls back project caches and leaves the original application state intact',()=>{
  const before=fixture(),storage=storageFor(before),original=new Map(storage.data),save=storage.setItem;
  let failed=false;storage.setItem=(key,value)=>{
    if(!failed&&key.startsWith('fep-rfq-documents:RFQ-DEMO-READY-FINAL')){failed=true;throw new Error('quota');}
    save(key,value);
  };
  assert.throws(()=>addStoredReviewScenarioDemos(storage,before,{at}),/quota/);
  assert.deepEqual(storage.data,original);
});
