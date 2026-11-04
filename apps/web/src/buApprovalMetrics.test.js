import test from 'node:test';
import assert from 'node:assert/strict';
import {selectBuDashboard} from './buDashboardSelectors.js';

const now=new Date('2026-10-27T06:00:00Z');
const addHours=(at,hours)=>new Date(Date.parse(at)+hours*3600000).toISOString();
function round(id,start,{hours=6,srHours=2,mode='all',status='已批准',sample=false}={}){
 const votes={sr:{actorId:'sr',result:'approved',at:addHours(start,srHours)},technicalByActorId:{t1:{actorId:'t1',result:'approved',at:addHours(start,4)},t2:{actorId:'t2',result:'approved',at:addHours(start,hours)}}};
 return {id,createdAt:start,reviewedAt:addHours(start,hours),status,sample,finalReview:{policy:'sr-and-technical',technicalMode:mode,reviewers:{srId:'sr',technicalIds:['t1','t2'],technicalRepresentativeId:'t1'},decisions:votes}};
}
function fixture(){
 return {actorId:'admin',actorRole:'BU管理员',activeBuId:'A',accountsById:{admin:{enabled:true,managedBuIds:['A','B']}},businessUnits:[{id:'A',name:'事业部A'},{id:'B',name:'事业部B'},{id:'FOREIGN',name:'其他事业部'}],buPersonnelByBuId:{A:[],B:[]},
  projects:[{id:'P',buId:'A',name:'项目P',deadline:'2026-10-26'},{id:'Q',buId:'A',name:'项目Q',deadline:'2026-10-24'},{id:'B1',buId:'B',name:'项目B'},{id:'SECRET',buId:'FOREIGN',name:'禁止泄漏'}],
  snapshotsByProject:{P:[round('P-old','2026-09-20T00:00:00Z',{hours:20}),round('P-new','2026-10-20T00:00:00Z')],Q:[round('Q-old','2026-09-21T00:00:00Z',{hours:12}),round('Q-new','2026-10-25T00:00:00Z',{hours:10})],SECRET:[round('secret','2026-10-20T00:00:00Z',{hours:100})]},tasksById:{},requirementsByProject:{},reviewsByProject:{},documentsByProject:{}};
}

test('approval efficiency compares equal periods and uses parallel completion times rather than person-hours',()=>{
 const data=selectBuDashboard(fixture(),{now}).approval;
 assert.ok(data,'approval efficiency must be present');
 assert.equal(data.mode,'actual');assert.equal(data.periodDays,30);
 assert.equal(data.current.count,2);assert.equal(data.current.averageHours,8);
 assert.equal(data.previous.count,2);assert.equal(data.previous.averageHours,16);
 assert.equal(data.improvementPercent,50);assert.equal(data.current.onTimeRate,50);
 assert.deepEqual(data.phases.map(p=>[p.key,p.count,p.averageHours]),[['sr',2,2],['technical',2,8]]);
 assert.equal(JSON.stringify(data).includes('secret'),false);
});

test('live pending approvals use the latest valid snapshot and report which side is still waiting',()=>{
 const s=fixture(),pending=round('P-pending','2026-10-26T06:00:00Z',{status:'审批中'});
 delete pending.finalReview.decisions.technicalByActorId.t2;
 s.snapshotsByProject.P.push(pending);
 const data=selectBuDashboard(s,{now,approvalPeriodDays:7}).approval;
 assert.equal(data.pending.count,1);assert.equal(data.pending.longestHours,24);
 assert.deepEqual(data.pending.rows[0].waitingSides,['技术组']);
 assert.equal(data.pending.rows[0].snapshotId,'P-pending');
 assert.equal(data.byProject.P.status,'审批中');assert.equal(data.byProject.P.hours,24);
 assert.equal(data.byProject.Q.hours,10);
 const later=selectBuDashboard(s,{now:new Date('2026-10-27T07:00:00Z'),approvalPeriodDays:7}).approval;
 assert.equal(later.pending.longestHours,25);
});

test('pending rounds with missing submission times stay visible without inventing elapsed hours',()=>{
 const s=fixture(),pending=round('no-start','2026-10-26T06:00:00Z',{status:'审批中'});
 pending.createdAt='';pending.finalReview.decisions.technicalByActorId={};
 s.snapshotsByProject={P:[pending]};
 const data=selectBuDashboard(s,{now}).approval;
 assert.equal(data.pending.count,1);assert.equal(data.pending.longestHours,null);
 assert.equal(data.pending.rows[0].hours,null);assert.equal(data.incompleteRecords,1);
 assert.deepEqual(data.pending.rows[0].waitingSides,['技术组']);
});

test('representative mode ignores unrequired technical opinions and rejection finishes the round immediately',()=>{
 const s=fixture(),representative=round('rep','2026-10-20T00:00:00Z',{hours:60,mode:'representative'});
 const rejected=round('reject','2026-10-21T00:00:00Z',{status:'已退回'});
 rejected.finalReview.decisions.sr={actorId:'sr',result:'rejected',at:addHours(rejected.createdAt,3)};
 rejected.finalReview.decisions.technicalByActorId={};
 s.snapshotsByProject={P:[representative,rejected]};
 const data=selectBuDashboard(s,{now}).approval;
 assert.equal(data.current.count,2);assert.equal(data.current.approved,1);assert.equal(data.current.rejected,1);
 assert.equal(data.current.averageHours,3.5);
 assert.deepEqual(data.phases.map(p=>[p.key,p.count,p.averageHours]),[['sr',2,2.5],['technical',1,4]]);
});

test('invalid unfinished stale and future records never become zero-hour completed approvals',()=>{
 const s=fixture(),start='2026-10-20T00:00:00Z';
 const missing=round('missing',start);missing.createdAt='';
 const unfinished=round('unfinished',start);delete unfinished.finalReview.decisions.technicalByActorId.t2;
 const negative=round('negative',start);negative.finalReview.decisions.sr.at=addHours(start,-1);
 const future=round('future','2026-11-01T00:00:00Z');
 const stale={...round('stale',start),stale:true};
 const legacy={id:'legacy',status:'已批准',createdAt:start,reviewedAt:addHours(start,1)};
 s.snapshotsByProject={P:[missing,unfinished,negative,future,stale,legacy]};
 const data=selectBuDashboard(s,{now}).approval;
 assert.equal(data.current.count,0);assert.equal(data.current.averageHours,null);assert.equal(data.improvementPercent,null);
 assert.equal(data.current.onTimeRate,null);assert.equal(data.pending.longestHours,null);
 assert.equal(data.incompleteRecords,4);
});

test('real and synthetic approval records remain separate and periods switch independently of live waiting',()=>{
 const s=fixture();s.snapshotsByProject.P.push(round('demo','2026-10-20T00:00:00Z',{sample:true,hours:100}));
 const actual=selectBuDashboard(s,{now}).approval;
 assert.equal(actual.mode,'actual');assert.equal(actual.current.averageHours,8);
 const demo=selectBuDashboard(s,{now,approvalDataMode:'sample'}).approval;
 assert.equal(demo.current.count,1);assert.equal(demo.current.averageHours,100);assert.equal(demo.improvementPercent,null);
 s.snapshotsByProject={P:[round('sample-only','2026-10-20T00:00:00Z',{sample:true})]};
 assert.equal(selectBuDashboard(s,{now}).approval.mode,'sample');
 assert.equal(selectBuDashboard(s,{now,approvalDataMode:'actual'}).approval.current.count,0);
 assert.equal(selectBuDashboard(fixture(),{now,buId:'B'}).approval.current.count,0);
 assert.equal(selectBuDashboard(fixture(),{now,buId:'FOREIGN'}),null);
});

test('period boundaries and Shanghai deadline dates are counted once and missing deadlines do not imply on time',()=>{
 const s=fixture(),boundary='2026-09-27T06:00:00Z';
 const atBoundary=round('boundary',addHours(boundary,-6));
 const deadline=round('deadline','2026-10-26T00:00:00Z',{hours:16,srHours:1});
 s.projects.find(p=>p.id==='Q').deadline='';s.snapshotsByProject={P:[atBoundary,deadline],Q:[round('undated','2026-10-20T00:00:00Z')]};
 const data=selectBuDashboard(s,{now}).approval;
 assert.equal(data.current.count,3);assert.equal(data.previous.count,0);
 assert.equal(data.current.datedCount,2);assert.equal(data.current.onTimeRate,50);
});

test('a zero previous duration is valid but cannot be a percentage divisor',()=>{
 const s=fixture(),old=round('old','2026-09-20T00:00:00Z',{hours:0,srHours:0});
 old.finalReview.decisions.technicalByActorId.t1.at=old.createdAt;
 s.snapshotsByProject={P:[old,round('new','2026-10-20T00:00:00Z')]};
 const data=selectBuDashboard(s,{now}).approval;
 assert.equal(data.previous.averageHours,0);assert.equal(data.improvementPercent,null);
});

test('slower approvals produce a negative improvement and repeated snapshot IDs do not inflate throughput',()=>{
 const s=fixture(),old=round('old','2026-09-20T00:00:00Z',{hours:4}),current=round('new','2026-10-20T00:00:00Z',{hours:8});
 s.snapshotsByProject={P:[old,current,structuredClone(current)]};
 const data=selectBuDashboard(s,{now}).approval;
 assert.equal(data.current.count,1);assert.equal(data.previous.count,1);assert.equal(data.improvementPercent,-100);
});

test('trend buckets align equal periods and keep days without approvals empty',()=>{
 const data=selectBuDashboard(fixture(),{now}).approval;
 assert.ok(data.charts,'chart data must accompany approval metrics');
 assert.equal(data.charts.trend.length,6);
 assert.deepEqual(data.charts.trend.map(p=>[p.count,p.averageHours,p.previousCount,p.previousAverageHours]),[[0,null,0,null],[0,null,0,null],[0,null,0,null],[0,null,0,null],[1,6,2,16],[1,10,0,null]]);
 const week=selectBuDashboard(fixture(),{now,approvalPeriodDays:7}).approval;
 assert.equal(week.charts.trend.length,7);
 assert.equal(week.charts.trend[0].count,1);assert.equal(week.charts.trend[0].averageHours,6);
 assert.equal(week.charts.trend[5].count,1);assert.equal(week.charts.trend[5].averageHours,10);
 assert.equal(week.charts.trend.reduce((sum,p)=>sum+p.count,0),2);
 const quarter=selectBuDashboard(fixture(),{now,approvalPeriodDays:90}).approval;
 assert.equal(quarter.charts.trend.length,6);assert.equal(quarter.charts.trend.reduce((sum,p)=>sum+p.count,0),4);
});

test('duration histogram counts each boundary once and the outcome ring excludes live pending rounds',()=>{
 const s=fixture();
 s.snapshotsByProject={P:[0,4,4.5,8,8.5,24,25].map((hours,index)=>{
  const record=round(`duration${index}`,'2026-10-20T00:00:00Z',{hours,srHours:Math.min(2,hours)});
  record.finalReview.decisions.technicalByActorId.t1.at=addHours(record.createdAt,Math.min(4,hours));return record;
 })};
 const distribution=selectBuDashboard(s,{now}).approval.charts.durations;
 assert.deepEqual(distribution.map(bin=>bin.count),[2,2,2,1]);
 const rejected=round('reject','2026-10-21T00:00:00Z',{status:'已退回'});
 rejected.finalReview.decisions.sr.result='rejected';
 const pending=round('pending','2026-10-26T00:00:00Z',{status:'审批中'});delete pending.finalReview.decisions.technicalByActorId.t2;
 s.snapshotsByProject.P.push(rejected,pending);
 const data=selectBuDashboard(s,{now}).approval;
 assert.deepEqual(data.charts.outcomes.map(part=>[part.key,part.count]),[['approved',7],['rejected',1]]);
 assert.equal(data.pending.count,1);
});

test('chart data follows BU and sample filters without turning an empty series into zeros',()=>{
 const s=fixture();s.snapshotsByProject.P.push(round('demo','2026-10-20T00:00:00Z',{sample:true,hours:100}));
 const sample=selectBuDashboard(s,{now,approvalDataMode:'sample'}).approval.charts;
 assert.equal(sample.trend.reduce((sum,p)=>sum+p.count,0),1);
 assert.deepEqual(sample.durations.map(b=>b.count),[0,0,0,1]);
 const empty=selectBuDashboard(s,{now,buId:'B'}).approval.charts;
 assert.equal(empty.trend.every(p=>p.averageHours===null&&p.previousAverageHours===null),true);
 assert.deepEqual(empty.outcomes.map(p=>p.count),[0,0]);
});
