import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState} from './data.js';
import * as mock from './buDashboardMock.js';

const now=new Date('2026-11-02T06:00:00Z');
function fixture(){return {...createDemoState(),actorId:'demo-bu-admin',actorRole:'BU管理员',activeBuId:'BU-DEMO'};}

test('dashboard mock fills every approval period with coherent comparisons, distributions and business totals',()=>{
 for(const period of [7,30,90]){
  const data=mock.selectBuDashboardMock(fixture(),{now,approvalPeriodDays:period});
  assert.ok(data,'authorized administrators can preview mock metrics');
  assert.equal(data.stats.projects,5);
  assert.deepEqual(data.stages.map(s=>s.count),[1,1,1,1,1]);
  assert.equal(data.stats.active,4);assert.equal(data.stats.overdueProjects,2);
  assert.ok(data.stats.pendingTasks>0);assert.ok(data.stats.overdueTasks>0);
  assert.equal(data.taskGroups.reduce((n,g)=>n+g.count,0),data.stats.pendingTasks);
  assert.equal(data.workload.reduce((n,m)=>n+m.pending,0),data.stats.pendingTasks);
  const approval=data.approval;
  assert.equal(approval.mode,'sample');assert.equal(approval.incompleteRecords,0);
  assert.ok(approval.current.approved>0);assert.ok(approval.current.rejected>0);
  assert.ok(approval.improvementPercent>0);
  assert.ok(approval.current.onTimeRate>0&&approval.current.onTimeRate<100);
  assert.ok(approval.charts.trend.every(p=>p.count>0&&p.previousCount>0));
  assert.ok(approval.charts.durations.every(bin=>bin.count>0));
  assert.equal(approval.charts.durations.reduce((n,bin)=>n+bin.count,0),approval.current.count);
  assert.equal(approval.charts.outcomes.reduce((n,part)=>n+part.count,0),approval.current.count);
  assert.equal(approval.pending.count,1);assert.equal(approval.pending.longestHours,36);
 }
});

test('mock data stays within authorized BU and never mutates or copies existing business content',()=>{
 const state=fixture();state.projects[0].name='existing-private-project';
 const before=structuredClone(state);
 const data=mock.selectBuDashboardMock(state,{now});
 assert.deepEqual(state,before);
 assert.equal(JSON.stringify(data).includes('existing-private-project'),false);
 assert.equal(mock.selectBuDashboardMock({...state,actorRole:'SR'},{now}),null);
 assert.equal(mock.selectBuDashboardMock(state,{now,buId:'FOREIGN'}),null);
 state.accountsById['demo-bu-admin'].enabled=false;
 assert.equal(mock.selectBuDashboardMock(state,{now}),null);
});

test('mock supports another authorized BU and waiting time grows from a fixed demonstration baseline',()=>{
 const state=fixture();state.businessUnits.push({id:'B',name:'另一个 BU'});
 state.accountsById['demo-bu-admin'].managedBuIds.push('B');
 const data=mock.selectBuDashboardMock(state,{buId:'B',now:new Date(now.getTime()+3600000),referenceTime:now});
 assert.deepEqual(data.bu,{id:'B',name:'另一个 BU'});
 assert.equal(data.approval.pending.longestHours,37);
});
