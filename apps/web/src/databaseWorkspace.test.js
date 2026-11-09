import test from 'node:test';
import assert from 'node:assert/strict';
import {loadDatabaseWorkspace,mapDatabaseWorkspace} from './databaseWorkspace.js';
import {selectAccessibleState,getProjectSummary} from './projectSelectors.js';
import {canPerform} from './permissions.js';
import {selectMyTasks} from './taskDomain.js';

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
 assert.equal(canPerform('SR','snapshot:submit',{state,actorId:'sr',projectId:'P'}),false);
 assert.equal(canPerform('SR','response:confirm',{state,actorId:'sr',projectId:'P',requirementId:'R'}),true);
 assert.equal(canPerform('SR','response:edit',{state,actorId:'sr',projectId:'P'}),true,'response drafts now use the backend');
});
test('empty authorized database stays empty and does not load browser samples',()=>{
 const state=mapDatabaseWorkspace({user,projects:[],directories:{BU:[member]},details:{}});
 assert.equal(state.projects.length,0);assert.equal(Object.keys(state.requirementsByProject).length,0);
});
test('database tasks and confirmation permissions use the explicit assignee or project creator',()=>{
 const technician={id:'tech',displayName:'李工',roles:[{buId:'BU',role:'TECH'}],bus:user.bus};
 const techMember={userId:'tech',displayName:'李工',roles:['TECH'],enabled:true,canConfirm:true};
 const owner={...member,userId:'other-sr',displayName:'接手的销售'};
 const assigned={...requirement,confirmationAssigneeId:'tech',version:1};
 const state=mapDatabaseWorkspace({
  user:technician,projects:[{...project,ownerId:owner.userId,stage:'REVIEWING'}],directories:{BU:[member,owner,techMember]},
  details:{P:{documents:[document],requirements:[assigned,{...assigned,id:'confirmed'},{...assigned,id:'in-review'}, {...requirement,id:'unassigned'}],
   workflow:{defaultConfirmationAssigneeId:'sr',responses:[{id:'confirmed',status:'已确认'}],reviews:[{id:'review',requirementId:'in-review',status:'待处理',reviewerIds:['tech']}]}}},
 });
 const tasks=selectMyTasks(state,{actorId:'tech'});
 assert.deepEqual(tasks.map(({projectId,requirementId,kind})=>({projectId,requirementId,kind})),[{projectId:'P',requirementId:'R',kind:'confirm'}]);
 assert.deepEqual(selectMyTasks(state,{actorId:'sr'}).map(task=>task.requirementId),['unassigned']);
 const context={state,projectId:'P',requirementId:'unassigned'};
 assert.equal(canPerform('SR','response:confirm',{...context,actorId:'sr'}),true);
 assert.equal(canPerform('SR','response:confirm',{...context,actorId:owner.userId}),false);
});
test('workspace reads every project page and each server document and requirement',async()=>{
 const archivedProject={...project,id:'ARCHIVED',stage:'CANCELLED',version:1,archived:true,archivedFromStage:'APPROVED'};
 const requests=[];const api={get:async path=>{
  requests.push(path);
  if(path.includes('archived=true')) { return {list:[archivedProject],total:1}; }
  if(path.startsWith('/projects?')) { return {list:[project],total:1}; }
  if(path.endsWith('/members')) { return [member]; }
  if(path.includes('/documents?')) { return {list:[document],total:1}; }
  if(path.includes('/requirements?')) { return {list:[requirement],total:1}; }
  if(path.endsWith('/workflow-records')||path.endsWith('/resources')) { return {}; }
  throw new Error('Unexpected '+path);
 }};
 const state=await loadDatabaseWorkspace(user,api);
 assert.equal(state.projects[0].name,'数据库项目');assert.equal(state.requirementsByProject.P.length,1);
 assert.deepEqual(state.archivedProjects,[archivedProject]);
 assert.deepEqual(state.projects.map(row=>row.id),['P']);
 assert.ok(!requests.some(path=>path.startsWith('/projects/ARCHIVED/')),'archive summaries do not load work data');
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
