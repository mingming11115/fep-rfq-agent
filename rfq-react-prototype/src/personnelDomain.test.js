import test from 'node:test';
import assert from 'node:assert/strict';
import * as p from './personnelDomain.js';
import {upgradePrototypeState} from './stateMigration.js';
import {createDemoState} from './data.js';

function fixture() {
  const accountsById=Object.fromEntries(['sr','t1','t2','t3','bu','other','unknown'].map(id=>[id,{id,name:id,enabled:true,managedBuIds:id==='bu'?['A']:id==='other'?['B']:[]}]));
  return {actorId:'bu',actorRole:'BU管理员',accountsById,businessUnits:[{id:'A',name:'A'},{id:'B',name:'B'}],buPersonnelByBuId:{A:['sr','t1','t2','t3'].map(userId=>({userId,roles:[userId==='sr'?'SR':'技术'],enabled:true,canConfirm:true,canFinalReview:true,resourceQualifications:[]})),B:[]},buReviewSettingsByBuId:{A:{technicalMode:'all',version:1}},projects:[{id:'P',buId:'A',ownerId:'sr',participantIds:['sr','t1','t2','t3'],approvalConfig:{finalReviewers:{srId:'sr',technicalIds:['t1','t2','t3'],technicalRepresentativeId:'t1'}}}],requirementsByProject:{P:[{id:'r',confirmationAssigneeId:'t1'}]},reviewsByProject:{P:[]},snapshotsByProject:{P:[]},audit:[]};
}

test('eligible reviewers must belong to the BU, project, role and active confirmation scope',()=>{
 const s=fixture();s.buPersonnelByBuId.A.find(m=>m.userId==='t2').canConfirm=false;s.projects[0].participantIds=s.projects[0].participantIds.filter(id=>id!=='t3');
 assert.deepEqual(p.getEligiblePersonnel(s,{buId:'A',projectId:'P',duty:'final-review',side:'technical'}).map(m=>m.userId),['t1']);
 s.accountsById.t1.enabled=false;assert.deepEqual(p.getEligiblePersonnel(s,{buId:'A',projectId:'P',duty:'confirm'}).map(m=>m.userId),['sr']);
 assert.equal(p.canAccessProject(s,'unknown','P'),false);assert.equal(p.canAccessProject(s,'bu','P'),true);
});
test('BU administrators can access every RFQ in their managed BU without business membership or project grants',()=>{
 const s=fixture();
 s.projects.push({id:'P2',buId:'A',participantIds:[]},{id:'FOREIGN',buId:'B',participantIds:[]});
 assert.equal(p.canAccessProject(s,'bu','P'),true);
 assert.equal(p.canAccessProject(s,'bu','P2'),true);
 assert.equal(p.canAccessProject(s,'bu','FOREIGN'),false);
 assert.equal(p.canAccessProject(s,'other','P'),false);
 assert.equal(p.canAccessProject(s,'bu','missing'),false);
 s.buPersonnelByBuId.A.push({userId:'bu',roles:[],enabled:false});
 assert.equal(p.canAccessProject(s,'bu','P2'),true);
 s.accountsById.bu.enabled=false;
 assert.equal(p.canAccessProject(s,'bu','P'),false);
 s.accountsById.bu.enabled=true;s.accountsById.bu.managedBuIds=[];
 assert.equal(p.canAccessProject(s,'bu','P'),false);
 assert.equal(p.canAccessProject(s,'t1','P2'),false);
});
test('only the assigned BU administrator can change membership and cannot grant platform rights',()=>{
 const s=fixture();assert.equal(p.canManageBu(s,'bu','A'),true);assert.equal(p.canManageBu(s,'other','A'),false);
 for(const actorId of ['sr','t1','other'])assert.throws(()=>p.updateBuMember(s,{actorId,buId:'A',userId:'t1',patch:{enabled:false},reason:'调岗'}),/权限|BU/);
 assert.throws(()=>p.updateBuMember(s,{actorId:'bu',buId:'A',userId:'t1',patch:{systemAdmin:true},reason:'升级'}),/字段|权限/);
 const next=p.updateBuMember(s,{actorId:'bu',buId:'A',userId:'t1',patch:{canConfirm:false},reason:'撤销资格'});
 assert.equal(next.buPersonnelByBuId.A[1].canFinalReview,false);assert.equal(s.buPersonnelByBuId.A[1].canConfirm,true);assert.ok(next.audit.length);
 assert.equal(p.canAccessProject(next,'t1','P'),true);
});
test('membership removal revokes access while preserving the historical record',()=>{
 const next=p.updateBuMember(fixture(),{actorId:'bu',buId:'A',userId:'t1',patch:{enabled:false},reason:'离岗'});
 assert.equal(p.canAccessProject(next,'t1','P'),false);assert.equal(next.buPersonnelByBuId.A[1].userId,'t1');
});
test('only the BU administrator can change technical voting mode',()=>{
 const s=fixture();assert.throws(()=>p.updateBuReviewSettings(s,{actorId:'sr',buId:'A',technicalMode:'representative',reason:'调整'}),/权限|BU/);
 const n=p.updateBuReviewSettings(s,{actorId:'bu',buId:'A',technicalMode:'representative',reason:'负责人代表'});
 assert.deepEqual(n.buReviewSettingsByBuId.A,{technicalMode:'representative',version:2});
 assert.throws(()=>p.updateBuReviewSettings(s,{actorId:'bu',buId:'A',technicalMode:'any',reason:'调整'}),/方式|规则/);
});
test('technical group validation rejects empty groups, duplicate actors and out-of-group representatives',()=>{
 const base={policy:'sr-and-technical',technicalMode:'all',reviewers:{srId:'sr',technicalIds:['t1','t2','t3']}};
 assert.deepEqual(p.getRequiredFinalReviewers(base),[{actorId:'sr',side:'sr'},{actorId:'t1',side:'technical'},{actorId:'t2',side:'technical'},{actorId:'t3',side:'technical'}]);
 assert.deepEqual(p.getRequiredFinalReviewers({...base,technicalMode:'representative',reviewers:{...base.reviewers,technicalRepresentativeId:'t2'}}),[{actorId:'sr',side:'sr'},{actorId:'t2',side:'technical'}]);
 for(const technicalIds of [[],['t1','t1'],['sr','t1']])assert.throws(()=>p.getRequiredFinalReviewers({...base,reviewers:{srId:'sr',technicalIds}}));
 assert.throws(()=>p.getRequiredFinalReviewers({...base,technicalMode:'representative',reviewers:{...base.reviewers,technicalRepresentativeId:'unknown'}}));
});
test('project assignment enforces BU qualification and records per-clause responsibility',()=>{
 const s=fixture();const n=p.assignProjectDuty(s,{actorId:'sr',projectId:'P',userId:'t2',duty:'confirm',requirementId:'r',reason:'专业分工'});
 assert.equal(n.requirementsByProject.P[0].confirmationAssigneeId,'t2');
 assert.throws(()=>p.assignProjectDuty(s,{actorId:'t1',projectId:'P',userId:'t2',duty:'confirm',requirementId:'r',reason:'越权'}),/权限/);
 assert.throws(()=>p.configureProjectFinalReviewers(s,{actorId:'sr',projectId:'P',srId:'sr',technicalIds:['unknown'],reason:'调整'}));
 const next=p.configureProjectFinalReviewers(s,{actorId:'sr',projectId:'P',srId:'sr',technicalIds:['t1','t2'],technicalRepresentativeId:'t1',reason:'项目组'});
 assert.deepEqual(next.projects[0].approvalConfig.finalReviewers.technicalIds,['t1','t2']);
});
test('authorization migration preserves history and does not re-enable a removed person',()=>{
 const raw=createDemoState();const history=structuredClone(raw.audit);let s=upgradePrototypeState(raw,createDemoState());
 assert.equal(s.actorRole,'SR');assert.equal(s.accountsById['demo-approver'].name,'赵明');assert.deepEqual(s.audit,history);
 const buId=s.projects[0].buId;s.buPersonnelByBuId[buId].find(m=>m.userId==='demo-technical').enabled=false;
 const again=upgradePrototypeState(s,createDemoState());assert.equal(again.buPersonnelByBuId[buId].find(m=>m.userId==='demo-technical').enabled,false);
 assert.equal(again.businessUnits.length,s.businessUnits.length);assert.equal(p.canAccessProject(again,'invented',s.projects[0].id),false);
});
test('platform directory administration is separate from BU membership and business access',()=>{
 const s=fixture();s.accountsById.ops={id:'ops',name:'运维',enabled:true,systemAdmin:true};
 assert.throws(()=>p.updatePlatformDirectory(s,{actorId:'bu',kind:'account',record:{id:'new',name:'新人'},reason:'新增'}),/权限/);
 const n=p.updatePlatformDirectory(s,{actorId:'ops',kind:'account',record:{id:'new',name:'新人',enabled:true,managedBuIds:[]},reason:'新增账号'});
 assert.equal(n.accountsById.new.name,'新人');assert.equal(p.canAccessProject(n,'new','P'),false);
});
test('professional processing selects a technical member even when SR is the clause confirmer',()=>{
 const s=fixture();s.requirementsByProject.P[0].confirmationAssigneeId='sr';
 const route=p.getReviewPersonnel(s,'P','r');assert.equal(route.ownerId,'t1');assert.equal(route.approverId,'sr');
 s.projects[0].participantIds=['sr'];assert.throws(()=>p.getReviewPersonnel(s,'P','r'),/技术|配置/);
});

test('platform BU account lists include members and managers without duplicates or cross-BU accounts',()=>{
 const s=fixture();
 s.buPersonnelByBuId.A.push({userId:'bu',roles:[],enabled:true});
 s.buPersonnelByBuId.B.push({userId:'t2',roles:['技术'],enabled:true});
 assert.deepEqual(p.selectPlatformDirectoryAccounts(s,'A').map(a=>a.id),['sr','t1','t2','t3','bu']);
 assert.deepEqual(p.selectPlatformDirectoryAccounts(s,'B').map(a=>a.id),['t2','other']);
 assert.deepEqual(p.selectPlatformDirectoryAccounts(s).find(a=>a.id==='t2').buIds,['A','B']);
});

test('platform directory keeps disabled accounts visible for maintenance and empty BUs stay empty',()=>{
 const s=fixture();s.accountsById.t1.enabled=false;s.buPersonnelByBuId.A[1].enabled=false;
 s.accountsById.ops={id:'ops',name:'平台管理',enabled:true,systemAdmin:true};
 s.businessUnits.push({id:'EMPTY',name:'空BU'});
 assert.equal(p.selectPlatformDirectoryAccounts(s,'A').some(a=>a.id==='t1'),true);
 assert.deepEqual(p.selectPlatformDirectoryAccounts(s,'EMPTY'),[]);
 assert.deepEqual(p.selectPlatformDirectoryAccounts(s,'missing'),[]);
 assert.deepEqual(p.selectPlatformDirectoryAccounts(s).filter(a=>!a.buIds.length).map(a=>a.id),['unknown','ops']);
});

test('saving BU management changes updates the selected account list immediately',()=>{
 const s=fixture();s.accountsById.ops={id:'ops',name:'平台管理',enabled:true,systemAdmin:true};
 const next=p.updatePlatformDirectory(s,{actorId:'ops',kind:'account',record:{...s.accountsById.bu,managedBuIds:['B']},reason:'调任B管理员'});
 assert.deepEqual(p.selectPlatformDirectoryAccounts(next,'A').map(a=>a.id),['sr','t1','t2','t3']);
 assert.deepEqual(p.selectPlatformDirectoryAccounts(next,'B').map(a=>a.id),['bu','other']);
 assert.deepEqual(p.selectPlatformDirectoryAccounts(s,'A').map(a=>a.id),['sr','t1','t2','t3','bu']);
});
