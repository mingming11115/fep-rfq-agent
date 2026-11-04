import test from 'node:test';
import assert from 'node:assert/strict';
import { getExportIssues, importParsedRequirements, makeSnapshot } from './domain.js';
import { getFinalReviewGate } from './finalReviewFlow.js';
import { getProjectSummary } from './projectSelectors.js';
import { reconcileTasks, isTaskPending } from './taskDomain.js';
import { snapshotFingerprint } from './snapshotDomain.js';
import { matchingSuggestion } from './responseRecommendation.js';

function row(patch={}) {
  return { id:'R',clause:'1.1',title:'自动推荐条目',original:'客户要求',conclusion:'Comply',draft:'满足本项要求',evidence:'测试报告 V1',conditions:'',status:'待确认',version:1,matchLevel:'standard',score:95,readyForConfirmation:true,
    systemRecommendation:{conclusion:'Comply',draft:'满足本项要求',evidence:'测试报告 V1',conditions:'',original:'客户要求',version:'V2'},...patch };
}

test('system-recommended Comply may enter final review without a manual confirmation',()=>{
  const r=row(),before=structuredClone(r);
  assert.deepEqual(getExportIssues([r],[],'P'),[]);
  assert.deepEqual(r,before);assert.equal(r.confirmedAt,undefined);
});

test('non-Comply recommendations and manually selected Comply still require explicit confirmation',()=>{
  for(const conclusion of ['有条件 Comply','不满足','不适用','待确认']){
    const r=row({systemRecommendation:{conclusion,original:'客户要求'},conclusion:'Comply'});
    assert.ok(getExportIssues([r],[],'P').some(issue=>/确认/.test(issue.message)),conclusion);
    assert.deepEqual(getExportIssues([{...r,status:'已确认'}],[],'P'),[]);
  }
  assert.ok(getExportIssues([row({systemRecommendation:undefined})],[],'P').length);
});

test('legacy matching keeps the reference library version separate from the edited clause version',()=>{
  const legacy=row({title:'安全防护与联锁',original:'设备应配置防护门与安全联锁，防护门开启时停止危险运动。',systemRecommendation:undefined,version:7});
  assert.equal(matchingSuggestion(legacy,'P').version,'V2');
  assert.equal(matchingSuggestion(legacy,'P').conclusion,'Comply');
  assert.deepEqual(getExportIssues([legacy],[],'P'),[]);
});

test('a different source version cannot reuse an earlier system recommendation',()=>{
  const r=row({sourceVersion:'V2',systemRecommendation:{...row().systemRecommendation,sourceVersion:'V1'}});
  assert.ok(getExportIssues([r],[],'P').length);
});

test('Comply never bypasses missing evidence, pending proposals, source changes or open reviews',()=>{
  for(const patch of [{evidence:''},{draft:''},{matchLevel:'none'},{score:80},{sourceRevision:true},{sourceCorrected:true},{needsReview:true},{original:'客户新版要求'},{pendingReviewProposal:{reviewId:'V'}},{conclusion:'不满足'},{status:'评审中'}]){
    assert.ok(getExportIssues([row(patch)],[],'P').length,JSON.stringify(patch));
  }
  assert.ok(getExportIssues([row()],[{id:'V',requirementId:'R',status:'待处理'}],'P').length);
});

test('parsed recommendations and unconfirmed Comply snapshot IDs preserve their actual provenance',()=>{
  const parsed=row({systemRecommendation:undefined}),imported=importParsedRequirements([], [parsed])[0];
  assert.equal(imported.systemRecommendation?.conclusion,'Comply');
  const snapshot=makeSnapshot('P',[row(),row({id:'M',status:'已确认'})],'SR');
  assert.deepEqual(snapshot.unconfirmedComplyIds,['R']);
  assert.equal(snapshot.rows[0].status,'待确认');assert.equal(snapshot.rows[0].confirmedAt,undefined);
  parsed.conclusion='不满足';assert.equal(imported.systemRecommendation.conclusion,'Comply');
});

test('optional Comply confirmations do not remain mandatory tasks and final approval unlocks the project',()=>{
  const rows=[row()],project={id:'P',name:'测试项目',equipment:'设备',approvalConfig:{}},scope={rows,configuration:{equipment:'设备',approvalConfig:{}}};
  const snapshot={...makeSnapshot('P',rows,'SR'),status:'已批准',approvalScope:scope,approvalFingerprint:snapshotFingerprint(scope),finalReview:{policy:'sr-and-technical',technicalMode:'all',reviewers:{srId:'s',technicalIds:['t']},decisions:{sr:{actorId:'s',result:'approved'},technicalByActorId:{t:{actorId:'t',result:'approved'}}}}};
  const state=reconcileTasks({projects:[project],requirementsByProject:{P:rows},reviewsByProject:{P:[]},snapshotsByProject:{P:[snapshot]},exportScopesByProject:{P:scope}});
  assert.equal(Object.values(state.tasksById).filter(t=>t.objectType==='requirement'&&isTaskPending(t)).length,0);
  assert.equal(getFinalReviewGate(state,'P').canExport,true);
  assert.equal(getProjectSummary(state,'P','demo-sales').stage,'审批完成');
});
