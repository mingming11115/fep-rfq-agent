import test from 'node:test';
import assert from 'node:assert/strict';
import {loadDatabaseWorkspace,mapDatabaseWorkspace} from './databaseWorkspace.js';
import {selectAccessibleState,getProjectSummary} from './projectSelectors.js';
import {canPerform} from './permissions.js';

const user={id:'sr',displayName:'真实销售',roles:[{buId:'BU',role:'SR'}],bus:[{id:'BU',name:'事业部'}]};
const member={userId:'sr',displayName:'真实销售',roles:['SR'],enabled:true,canConfirm:true,canFinalReview:true};
const project={id:'P',code:'RFQ-123',name:'数据库项目',buId:'BU',ownerId:'sr',createdBy:'sr',stage:'APPROVED',version:0};
const document={id:'D',projectId:'P',name:'客户要求.docx',version:1,status:'PARSED',sizeBytes:123};
const requirement={id:'R',documentId:'D',projectId:'P',title:'数据库条款',customerClauseNo:'1.2',originalText:'客户原文',requirementText:'整理要求',sectionPath:'["技术","性能"]',extractionStatus:'VALID',version:0};

test('real database records use the original App shape without injected demo records or approvals',()=>{
 const state=mapDatabaseWorkspace({user,projects:[project],directories:{BU:[member]},details:{P:{documents:[document],requirements:[requirement]}}});
 assert.equal(state.dataSource,'mysql');assert.equal(state.actorId,'sr');assert.deepEqual(state.projects.map(p=>p.id),['P']);
 assert.equal(state.projects[0].createdById,'sr');
 assert.equal(selectAccessibleState(state,'sr').projects.length,1);assert.equal(state.requirementsByProject.P[0].original,'客户原文');
 assert.deepEqual(state.requirementsByProject.P[0].sectionPath,['技术','性能']);assert.equal(state.requirementsByProject.P[0].backendVersion,0);
 assert.equal(state.documentsByProject.P[0].backendDocumentId,'D');assert.deepEqual(state.snapshotsByProject.P,[]);
 assert.equal(getProjectSummary(state,'P','sr').stage,'审批完成');
 assert.equal(canPerform('SR','response:edit',{state,actorId:'sr',projectId:'P'}),false,'unimplemented writes cannot pretend to save');
});
test('empty authorized database stays empty and does not load browser samples',()=>{
 const state=mapDatabaseWorkspace({user,projects:[],directories:{BU:[member]},details:{}});
 assert.equal(state.projects.length,0);assert.equal(Object.keys(state.requirementsByProject).length,0);
});
test('workspace reads every project page and each server document and requirement',async()=>{
 const requests=[];const api={get:async path=>{
  requests.push(path);
  if(path.startsWith('/projects?'))return {list:[project],total:1};
  if(path.endsWith('/members'))return [member];
  if(path.includes('/documents?'))return {list:[document],total:1};
  if(path.includes('/requirements?'))return {list:[requirement],total:1};
  if(path.endsWith('/workflow-records')||path.endsWith('/resources'))return {};
  throw new Error('Unexpected '+path);
 }};
 const state=await loadDatabaseWorkspace(user,api);
 assert.equal(state.projects[0].name,'数据库项目');assert.equal(state.requirementsByProject.P.length,1);
 assert.ok(requests.some(path=>path.includes('/requirements?')));
});
test('a database failure remains a failure rather than showing frontend seeds',async()=>{
 await assert.rejects(loadDatabaseWorkspace(user,{get:async()=>{throw new Error('数据库不可用');}}),/数据库不可用/);
});
test('database responses, review history and reference data populate the original pages',()=>{
 const workflow={metadata:{equipment:'数据库机型',participantIds:['sr'],approvalConfig:{finalReviewers:{srId:'sr',technicalIds:[]}}},responses:[{id:'R',draft:'库中答复',status:'已确认',conclusion:'Comply',version:1}],reviews:[{id:'REV',requirementId:'R'}],snapshots:[{id:'SNAP',status:'已批准'}]};
 const resources={models:[{id:'M'}],knowledge:[{id:'K'}],historyClauses:[{id:'H'}]};
 const state=mapDatabaseWorkspace({user,projects:[project],directories:{BU:[member]},details:{P:{documents:[document],requirements:[requirement],workflow}},resources:{BU:resources}});
 assert.equal(state.requirementsByProject.P[0].draft,'库中答复');
 assert.equal(state.requirementsByProject.P[0].original,'客户原文','the actual source record remains authoritative');
 assert.equal(state.reviewsByProject.P[0].id,'REV');assert.equal(state.snapshotsByProject.P[0].id,'SNAP');
 assert.equal(state.projects[0].equipment,'数据库机型');assert.deepEqual(state.resourcesByBuId.BU,resources);
});
