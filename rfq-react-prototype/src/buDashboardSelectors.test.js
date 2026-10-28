import test from 'node:test';
import assert from 'node:assert/strict';
import * as selectors from './buDashboardSelectors.js';
import {createDemoState} from './data.js';
import {upgradePrototypeState} from './stateMigration.js';
import {reconcileTasks} from './taskDomain.js';

const now=new Date('2026-10-27T06:00:00Z');
function fixture(){
 return {
  actorId:'admin',actorRole:'BU管理员',activeBuId:'A',
  accountsById:{admin:{id:'admin',name:'管理员',enabled:true,managedBuIds:['A','B','C']},sr:{id:'sr',name:'林晓',enabled:true},tech:{id:'tech',name:'顾工',enabled:true}},
  businessUnits:[{id:'A',name:'切割BU'},{id:'B',name:'薄膜BU'},{id:'C',name:'空BU'},{id:'D',name:'未授权BU'}],
  buPersonnelByBuId:{A:[{userId:'sr',roles:['SR'],enabled:true},{userId:'tech',roles:['技术'],enabled:true}],B:[],C:[]},
  projects:[{id:'P',buId:'A',name:'切割项目',ownerId:'sr',deadline:'2026-10-26'},{id:'Q',buId:'A',name:'验证项目',ownerId:'sr',deadline:'2026-10-27'},{id:'B1',buId:'B',name:'薄膜项目'},{id:'SECRET',buId:'D',name:'禁止泄漏项目'}],
  requirementsByProject:{Q:[{id:'r1',status:'已确认',original:'禁止泄漏原文',draft:'禁止泄漏应答'},{id:'r2',status:'已确认',needsReview:true},{id:'r3',status:'已确认',sourceRevision:true}]},
  reviewsByProject:{},snapshotsByProject:{},documentsByProject:{},
  tasksById:Object.fromEntries([
   {id:'t1',projectId:'P',assigneeId:'sr',kind:'draft',status:'待处理',dueAt:'2026-10-26'},
   {id:'t2',projectId:'Q',assigneeId:'tech',kind:'confirm',status:'处理中',dueAt:'2026-10-27'},
   {id:'t3',projectId:'Q',assigneeId:'tech',kind:'recheck',status:'待处理'},
   ...['已处理','已取消','已失效'].map((status,i)=>({id:`history${i}`,projectId:'P',assigneeId:'tech',kind:'confirm',status,dueAt:'2026-10-20'})),
   {id:'other',projectId:'B1',assigneeId:'sr',kind:'draft',status:'待处理'},
   {id:'deleted',projectId:'REMOVED',assigneeId:'sr',kind:'draft',status:'待处理'},
  ].map(t=>[t.id,t])),
 };
}

test('BU overview aggregates current BU progress and excludes terminal tasks and source-invalid confirmations',()=>{
 const result=selectors.selectBuDashboard(fixture(),{now});
 assert.deepEqual(result.stats,{projects:2,active:2,overdueProjects:1,pendingTasks:3,overdueTasks:1,totalRequirements:3,confirmedRequirements:1,confirmationRate:33,enabledMembers:2});
 assert.deepEqual(result.projects.map(p=>p.id),['P','Q']);
 assert.deepEqual(result.stages.map(s=>[s.label,s.count]),[['待上传',1],['解析中',0],['评审中',1],['审批完成',0],['已导出',0]]);
 assert.deepEqual(result.workload.map(m=>[m.userId,m.pending,m.overdue]),[['tech',2,0],['sr',1,1]]);
 assert.deepEqual(result.taskGroups.map(g=>g.count),[1,2,0]);
 const serialized=JSON.stringify(result);
 for(const hidden of ['禁止泄漏项目','禁止泄漏原文','禁止泄漏应答','SECRET','REMOVED'])assert.equal(serialized.includes(hidden),false);
});

test('BU overview rejects foreign BU, disabled administrators and non-administrative identities',()=>{
 const s=fixture();
 assert.equal(selectors.selectBuDashboard(s,{buId:'D',now}),null);
 assert.equal(selectors.selectBuDashboard(s,{buId:'MISSING',now}),null);
 assert.equal(selectors.selectBuDashboard({...s,actorRole:'SR'},{now}),null);
 assert.equal(selectors.selectBuDashboard(s,{actorId:'sr',now}),null);
 s.accountsById.admin.enabled=false;
 assert.equal(selectors.selectBuDashboard(s,{now}),null);
});

test('restored administrators without a saved current BU can open their first managed BU',()=>{
 const demo=createDemoState(),s=reconcileTasks(upgradePrototypeState(demo,demo));
 s.actorId='demo-bu-admin';s.actorRole='BU管理员';delete s.activeBuId;
 const result=selectors.selectBuDashboard(s,{now});
 assert.ok(result,'a valid administrator must have an initial dashboard');
 assert.equal(result.bu.id,'BU-DEMO');assert.equal(result.stats.projects,6);
 // An explicitly selected, unauthorized BU must still fail closed.
 s.activeBuId='FOREIGN';assert.equal(selectors.selectBuDashboard(s,{now}),null);
});

test('switching managed BU replaces all projects tasks and personnel totals',()=>{
 const result=selectors.selectBuDashboard(fixture(),{buId:'B',now});
 assert.equal(result.bu.id,'B');
 assert.deepEqual(result.projects.map(p=>p.id),['B1']);
 assert.equal(result.stats.pendingTasks,1);
 assert.equal(result.stats.totalRequirements,0);
 assert.equal(result.stats.enabledMembers,0);
});

test('an empty managed BU returns zero statistics and empty personnel without NaN',()=>{
 const result=selectors.selectBuDashboard(fixture(),{buId:'C',now});
 assert.deepEqual(result.stats,{projects:0,active:0,overdueProjects:0,pendingTasks:0,overdueTasks:0,totalRequirements:0,confirmedRequirements:0,confirmationRate:0,enabledMembers:0});
 assert.deepEqual(result.projects,[]);assert.deepEqual(result.workload,[]);
 assert.equal(JSON.stringify(result).includes('NaN'),false);
});

test('project and task deadlines expire after the entire Shanghai calendar day',()=>{
 const s=fixture();
 const before=selectors.selectBuDashboard(s,{now:new Date('2026-10-27T15:59:59.999Z')});
 const after=selectors.selectBuDashboard(s,{now:new Date('2026-10-27T16:00:00.000Z')});
 assert.equal(before.stats.overdueProjects,1);assert.equal(before.stats.overdueTasks,1);
 assert.equal(after.stats.overdueProjects,2);assert.equal(after.stats.overdueTasks,2);
});

test('current project stages use valid final review and exported projects leave active and overdue totals',()=>{
 const demo=createDemoState(),s=reconcileTasks(upgradePrototypeState(demo,demo));
 s.actorId='demo-bu-admin';s.actorRole='BU管理员';
 const result=selectors.selectBuDashboard(s,{buId:'BU-DEMO',now});
 assert.deepEqual(result.stages.map(stage=>stage.count),[1,2,1,1,1]);
 assert.equal(result.stats.projects,6);assert.equal(result.stats.active,5);
 const exported=result.projects.find(p=>p.stage==='已导出');assert.equal(exported.overdue,false);
 s.requirementsByProject[exported.id][0].draft='应答变更';
 const changed=selectors.selectBuDashboard(s,{buId:'BU-DEMO',now});
 assert.equal(changed.projects.find(p=>p.id===exported.id).stage,'评审中');
 assert.equal(changed.stats.active,6);
});
