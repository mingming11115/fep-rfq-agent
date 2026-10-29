import test from 'node:test';
import assert from 'node:assert/strict';
import * as picker from './personPicker.js';
import * as personnel from './personnelDomain.js';
import * as project from './projectDomain.js';

const people=[{userId:'sr-a',name:'林晓',roles:['SR']},{id:'sr-b',name:'林晓'},{userId:'tech',name:'顾工',roles:['技术']}];
test('mention search matches names and account IDs with optional @ and preserves duplicate names',()=>{
 assert.equal(typeof picker.filterPeople,'function');
 assert.deepEqual(picker.filterPeople(people,'@林晓').map(p=>p.id),['sr-a','sr-b']);
 assert.deepEqual(picker.filterPeople(people,' ＠SR-B ').map(p=>p.id),['sr-b']);
 assert.equal(picker.filterPeople(people,'@').length,3);
 assert.deepEqual(picker.filterPeople(people,'不存在'),[]);
});
const state=()=>({actorId:'creator',actorRole:'SR',businessUnits:[{id:'BU'}],accountsById:Object.fromEntries(['creator','other','tech','disabled','outside'].map(id=>[id,{id,name:id==='other'?'另一个SR':id,enabled:id!=='disabled'}])),buPersonnelByBuId:{BU:['creator','other','tech','disabled'].map(userId=>({userId,roles:[userId==='tech'?'技术':'SR'],enabled:true,canConfirm:true,canFinalReview:true}))},projects:[{id:'P',buId:'BU',ownerId:'creator',participantIds:['creator','tech']}]});
test('owner mentions use active BU SR accounts and honor existing project access',()=>{
 assert.equal(typeof personnel.getProjectOwnerCandidates,'function');
 const s=state();
 assert.deepEqual(personnel.getProjectOwnerCandidates(s,{buId:'BU'}).map(p=>p.userId),['creator','other']);
 assert.deepEqual(personnel.getProjectOwnerCandidates(s,{buId:'BU',projectId:'P'}).map(p=>p.userId),['creator']);
 s.buPersonnelByBuId.BU[1].enabled=false;
 assert.deepEqual(personnel.getProjectOwnerCandidates(s,{buId:'BU'}).map(p=>p.userId),['creator']);
});
test('creating a project stores the selected owner identity and grants creator and owner access',()=>{
 assert.equal(typeof project.createProjectPersonnel,'function');
 const s=state(),result=project.createProjectPersonnel(s,{buId:'BU',ownerId:'other'});
 assert.equal(result.ownerId,'other');assert.equal(result.owner,'另一个SR');
 assert.deepEqual(result.participantIds,['creator','other']);
 assert.equal(result.approvalConfig.finalReviewers.srId,'other');
 assert.deepEqual(project.createProjectPersonnel(s,{buId:'BU',ownerId:'creator'}).participantIds,['creator']);
 for(const ownerId of ['', 'tech','disabled','outside','另一个SR'])assert.throws(()=>project.createProjectPersonnel(s,{buId:'BU',ownerId}),/负责人/);
});

test('saving an owner handover and equipment change invalidates technical confirmations atomically',()=>{
 assert.equal(typeof project.updateProjectSettings,'function');
 const s=state();s.projects[0]={...s.projects[0],equipment:'旧基线',version:2,participantIds:['creator','other','tech']};
 s.requirementsByProject={P:[{id:'T',category:'技术',status:'已确认',version:9,confirmedBy:'tech',confirmedAt:'2026-10-28'},{id:'B',category:'商务',status:'已确认',version:3}]};
 const next=project.updateProjectSettings(s,{projectId:'P',patch:{ownerId:'other',equipment:'新基线',reason:'基线与人员调整'},invalidateTechnical:true});
 assert.equal(next.projects[0].ownerId,'other');assert.equal(next.projects[0].equipment,'新基线');assert.equal(next.projects[0].version,3);
 assert.equal(next.requirementsByProject.P[0].status,'待确认');assert.equal(next.requirementsByProject.P[0].version,10);
 assert.equal(next.requirementsByProject.P[0].confirmedBy,undefined);assert.equal(next.requirementsByProject.P[0].confirmedAt,undefined);
 assert.deepEqual(next.requirementsByProject.P[1],s.requirementsByProject.P[1]);
 assert.equal(s.projects[0].ownerId,'creator');assert.equal(s.requirementsByProject.P[0].status,'已确认');
 const before=structuredClone(s);
 assert.throws(()=>project.updateProjectSettings(s,{projectId:'P',patch:{ownerId:'disabled',equipment:'新基线',reason:'无效接收人'},invalidateTechnical:true}),/SR/);
 assert.deepEqual(s,before);
});

test('mention suggestions open only for an @ trigger and search the following name or account',()=>{
 assert.equal(typeof picker.getMentionSearch,'function');
 assert.equal(picker.getMentionSearch(''),null);
 assert.equal(picker.getMentionSearch('林晓'),null);
 assert.equal(picker.getMentionSearch('@'),'');
 assert.equal(picker.getMentionSearch('@林'),'林');
 assert.equal(picker.getMentionSearch(' ＠sr-a'),'sr-a');
});
