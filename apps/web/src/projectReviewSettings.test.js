import test from 'node:test';
import assert from 'node:assert/strict';
import * as projectDomain from './projectDomain.js';
import {getProjectFinalReview,getRequiredFinalReviewers,configureProjectFinalReviewers,updateBuReviewSettings} from './personnelDomain.js';
import {currentProjectScope,snapshotFingerprint,checkSnapshotValidity} from './snapshotDomain.js';
import {upgradePrototypeState} from './stateMigration.js';
import {createDemoState} from './data.js';

function fixture(){
 const state=upgradePrototypeState(createDemoState(),createDemoState());
 state.actorId='demo-sales';state.actorRole='SR';
 return state;
}

test('new RFQ review rules default to all members and reject unsupported choices',()=>{
 assert.deepEqual(projectDomain.createProjectReviewSettings(),{technicalMode:'all',version:1});
 assert.deepEqual(projectDomain.createProjectReviewSettings('representative'),{technicalMode:'representative',version:1});
 for(const mode of ['','any','ALL'])assert.throws(()=>projectDomain.createProjectReviewSettings(mode),/评审方式/);
});

test('RFQs in the same BU use their own selected mode in final review and approval scope',()=>{
 const state=fixture(),first=state.projects.find(p=>p.id==='RFQ-001'),second=state.projects.find(p=>p.id==='RFQ-002');
 first.technicalReviewSettings={technicalMode:'representative',version:3};
 second.technicalReviewSettings={technicalMode:'all',version:1};
 const review=getProjectFinalReview(state,first.id);
 assert.equal(review.technicalMode,'representative');assert.equal(review.ruleVersion,3);
 assert.equal(getRequiredFinalReviewers(review).length,2);
 assert.equal(getRequiredFinalReviewers(getProjectFinalReview(state,second.id)).length,4);
 assert.deepEqual(currentProjectScope(state,first.id,{}).configuration.personnel.settings,first.technicalReviewSettings);
});

test('representative validation follows the RFQ rule when the legacy BU mode differs',()=>{
 const state=fixture(),project=state.projects.find(p=>p.id==='RFQ-001'),reviewers=project.approvalConfig.finalReviewers;
 project.technicalReviewSettings={technicalMode:'representative',version:1};
 assert.throws(()=>configureProjectFinalReviewers(state,{actorId:state.actorId,projectId:project.id,...reviewers,technicalRepresentativeId:null,reason:'配置项目评审组'}),/负责人/);
 const next=configureProjectFinalReviewers(state,{actorId:state.actorId,projectId:project.id,...reviewers,reason:'配置项目评审组'});
 assert.equal(getProjectFinalReview(next,project.id).technicalMode,'representative');
 project.technicalReviewSettings={technicalMode:'all',version:1};state.buReviewSettingsByBuId[project.buId]={technicalMode:'representative',version:2};
 assert.doesNotThrow(()=>configureProjectFinalReviewers(state,{actorId:state.actorId,projectId:project.id,...reviewers,technicalRepresentativeId:null,reason:'全员通过'}));
});

test('legacy BU changes do not invalidate an RFQ with a saved project rule',()=>{
 const state=fixture(),project=state.projects.find(p=>p.id==='RFQ-001');
 project.technicalReviewSettings={technicalMode:'all',version:1};
 const scope=currentProjectScope(state,project.id,{}),snapshot={id:'S',status:'审批中',approvalScope:scope,approvalFingerprint:snapshotFingerprint(scope)};
 const next=updateBuReviewSettings(state,{actorId:'demo-bu-admin',buId:project.buId,technicalMode:'representative',reason:'历史BU规则调整'});
 assert.equal(checkSnapshotValidity(snapshot,currentProjectScope(next,project.id,snapshot)).valid,true);
 assert.equal(getProjectFinalReview(next,project.id).technicalMode,'all');
});

test('BU configuration saves the existing review mode with reviewers for only the selected project',()=>{
 const state=fixture(),project=state.projects.find(p=>p.id==='RFQ-001');
 project.technicalReviewSettings={technicalMode:'all',version:2};
 const others=structuredClone(state.projects.filter(p=>p.id!==project.id));
 const scope=currentProjectScope(state,project.id,{}),snapshot={approvalScope:scope,approvalFingerprint:snapshotFingerprint(scope)};
 const next=configureProjectFinalReviewers(state,{actorId:'demo-bu-admin',projectId:project.id,...project.approvalConfig.finalReviewers,technicalMode:'representative',reason:'改为负责人代表通过'});
 assert.deepEqual(next.projects.find(p=>p.id===project.id).technicalReviewSettings,{technicalMode:'representative',version:3});
 assert.deepEqual(next.projects.filter(p=>p.id!==project.id),others);
 assert.equal(getRequiredFinalReviewers(getProjectFinalReview(next,project.id)).length,2);
 assert.equal(checkSnapshotValidity(snapshot,currentProjectScope(next,project.id,snapshot)).valid,false);
 assert.deepEqual(project.technicalReviewSettings,{technicalMode:'all',version:2});
 const same=configureProjectFinalReviewers(next,{actorId:'demo-bu-admin',projectId:project.id,...project.approvalConfig.finalReviewers,technicalMode:'representative',reason:'保存相同规则'});
 assert.equal(getProjectFinalReview(same,project.id).ruleVersion,3);
});

test('BU rule changes validate the new mode and representative before saving',()=>{
 const state=fixture(),project=state.projects.find(p=>p.id==='RFQ-001');
 const input={actorId:'demo-bu-admin',projectId:project.id,...project.approvalConfig.finalReviewers,reason:'调整评审类型'};
 assert.throws(()=>configureProjectFinalReviewers(state,{...input,technicalMode:'representative',technicalRepresentativeId:null}),/负责人/);
 assert.throws(()=>configureProjectFinalReviewers(state,{...input,technicalMode:'invalid'}),/评审/);
 assert.throws(()=>configureProjectFinalReviewers(state,{...input,actorId:'demo-technical',technicalMode:'all'}),/权限/);
 const next=configureProjectFinalReviewers(state,{...input,technicalMode:'all',technicalRepresentativeId:null});
 assert.equal(getProjectFinalReview(next,project.id).technicalMode,'all');
});

test('legacy project rules migrate once without changing snapshots, signatures or approval fingerprints',()=>{
 const before=fixture();
 for(const project of before.projects)delete project.technicalReviewSettings;
 const project=before.projects.find(p=>p.id==='RFQ-001');
 const settings={technicalMode:'representative',version:7};before.buReviewSettingsByBuId[project.buId]=settings;
 before.deletedProjectsById={OLD:{project:{...structuredClone(project),id:'OLD'}}};
 const scope=currentProjectScope(before,project.id,{}),snapshot={id:'S',status:'已批准',finalReview:getProjectFinalReview(before,project.id),approvalScope:scope,approvalFingerprint:snapshotFingerprint(scope),history:[{action:'原评审意见'}]};
 before.snapshotsByProject[project.id]=[snapshot];
 const after=upgradePrototypeState(before,createDemoState());
 assert.deepEqual(after.projects.find(p=>p.id===project.id).technicalReviewSettings,settings);
 assert.deepEqual(after.deletedProjectsById.OLD.project.technicalReviewSettings,settings);
 assert.deepEqual(after.snapshotsByProject[project.id],[snapshot]);
 assert.equal(checkSnapshotValidity(snapshot,currentProjectScope(after,project.id,snapshot)).valid,true);
 after.buReviewSettingsByBuId[project.buId]={technicalMode:'all',version:8};
 const again=upgradePrototypeState(after,createDemoState());
 assert.deepEqual(again.projects.find(p=>p.id===project.id).technicalReviewSettings,settings);
 assert.deepEqual(again.deletedProjectsById.OLD.project.technicalReviewSettings,settings);
 assert.deepEqual(again.snapshotsByProject[project.id],[snapshot]);
});

function creationInput(state,overrides={}){
 const buId=state.projects.find(p=>p.id==='RFQ-001').buId;
 state.accountsById['new-sr']={id:'new-sr',name:'新SR',enabled:true};
 state.buPersonnelByBuId[buId].push({userId:'new-sr',roles:['SR'],enabled:true,canConfirm:true,canFinalReview:true});
 return {buId,ownerId:'demo-sales',srId:'new-sr',technicalMode:'all',technicalIds:['demo-technical','demo-technical-2'],technicalRepresentativeId:null,...overrides};
}
test('new RFQ saves the chosen review group and grants those reviewers project access',()=>{
 const state=fixture(),input=creationInput(state),personnel=projectDomain.createProjectPersonnel(state,input);
 assert.deepEqual(personnel.approvalConfig.finalReviewers,{srId:'new-sr',technicalIds:['demo-technical','demo-technical-2'],technicalRepresentativeId:null});
 assert.deepEqual(new Set(personnel.participantIds),new Set(['demo-sales','new-sr','demo-technical','demo-technical-2']));
 const next={...state,projects:[...state.projects,{id:'NEW',buId:input.buId,...personnel,technicalReviewSettings:projectDomain.createProjectReviewSettings(input.technicalMode)}]};
 assert.deepEqual(getRequiredFinalReviewers(getProjectFinalReview(next,'NEW')).map(r=>r.actorId),['new-sr','demo-technical','demo-technical-2']);
 assert.ok(!state.projects.some(p=>p.id==='NEW'));
});
test('new RFQ representative mode preserves the selected leader and all selected group members',()=>{
 const state=fixture(),input=creationInput(state,{technicalMode:'representative',technicalRepresentativeId:'demo-technical-2'}),personnel=projectDomain.createProjectPersonnel(state,input);
 const next={...state,projects:[...state.projects,{id:'NEW',buId:input.buId,...personnel,technicalReviewSettings:projectDomain.createProjectReviewSettings(input.technicalMode)}]};
 assert.deepEqual(getRequiredFinalReviewers(getProjectFinalReview(next,'NEW')).map(r=>r.actorId),['new-sr','demo-technical-2']);
 assert.ok(personnel.participantIds.includes('demo-technical'));
});
test('new RFQ rejects unqualified reviewers, duplicate sides and an out-of-group representative',()=>{
 const state=fixture(),input=creationInput(state);
 for(const patch of [{srId:'demo-technical'},{technicalIds:['new-sr']},{technicalIds:['demo-directory-tech']},{technicalIds:['demo-technical','demo-technical']},{technicalRepresentativeId:'demo-technical-3',technicalMode:'representative'}]){
  assert.throws(()=>projectDomain.createProjectPersonnel(state,{...input,...patch}),/评审|负责人/);
 }
 state.accountsById['demo-technical'].enabled=false;
 assert.throws(()=>projectDomain.createProjectPersonnel(state,input),/评审/);
});
test('new RFQ may retain incomplete review settings as a draft',()=>{
 const state=fixture(),input=creationInput(state,{srId:'',technicalIds:[]}),personnel=projectDomain.createProjectPersonnel(state,input);
 assert.deepEqual(personnel.approvalConfig.finalReviewers,{srId:'',technicalIds:[],technicalRepresentativeId:null});
 assert.deepEqual(personnel.participantIds,['demo-sales']);
});
