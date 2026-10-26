import test from 'node:test';import assert from 'node:assert/strict';
import {getProjectSummary,selectProjects} from './projectSelectors.js';import {reconcileTasks,selectMyTasks} from './taskDomain.js';
import {snapshotFingerprint} from './snapshotDomain.js';
import {createDemoState} from './data.js';
import {upgradePrototypeState} from './stateMigration.js';
import {getExportIssues} from './domain.js';
test('demo board covers every stage with usable approvals and bound export records',()=>{
 const demo=createDemoState(),state=reconcileTasks(upgradePrototypeState(demo,demo));
 assert.deepEqual(state.projects.map(p=>getProjectSummary(state,p.id,'demo-sales').stage).sort(),['待上传','解析中','评审中','审批完成','已导出'].sort());
 for(const project of state.projects){
  const stage=getProjectSummary(state,project.id,'demo-sales').stage;
  if(!['审批完成','已导出'].includes(stage))continue;
  const snapshot=state.snapshotsByProject[project.id][0];
  assert.deepEqual(getExportIssues(state.requirementsByProject[project.id],state.reviewsByProject[project.id]),[]);
  assert.notEqual(snapshot.createdById,snapshot.reviewedById);
  if(stage==='已导出')assert.ok(snapshot.exports.some(record=>record.snapshotId===snapshot.id&&record.type==='正式应答'));
  state.requirementsByProject[project.id][0].draft='修改后的答复';
  assert.equal(getProjectSummary(state,project.id,'demo-sales').stage,'评审中');
 }
});
test('initiated and participated tabs can overlap without exposing unrelated projects',()=>{
 const state={projects:[{id:'A',createdById:'me',participantIds:['me']},{id:'B',createdById:'other',participantIds:['other']}]};
 assert.deepEqual(selectProjects(state,{actorId:'me',tab:'all'}).map(p=>p.id),['A']);
 assert.equal(selectProjects(state,{actorId:'me',tab:'initiated'}).length,1);assert.equal(selectProjects(state,{actorId:'me',tab:'participated'}).length,1);
});
test('approved and exported projects have separate stages and require current finished work',()=>{
 const row={id:'R',version:1,status:'已确认',draft:'原答复'};
 const scope={rows:[row],configuration:{equipment:'机型A'}};
 const snapshot={id:'S',status:'已批准',exportedAt:'2026-10-24',approvalScope:scope,approvalFingerprint:snapshotFingerprint(scope)};
 const s={projects:[{id:'P',equipment:'机型A'}],requirementsByProject:{P:[row]},reviewsByProject:{P:[]},snapshotsByProject:{P:[snapshot]},exportScopesByProject:{P:scope}};
 assert.equal(getProjectSummary(s,'P','demo-sales').stage,'已导出');
 assert.equal(getProjectSummary({...s,snapshotsByProject:{P:[{...snapshot,exportedAt:undefined}]}},'P','demo-sales').stage,'审批完成');
 assert.equal(getProjectSummary({...s,snapshotsByProject:{P:[{...snapshot,status:'审批中',exportedAt:undefined}]}},'P','demo-sales').stage,'评审中');
 const edited={...s,requirementsByProject:{P:[{...row,version:2,draft:'修改答复',status:'待确认'}]}};
 assert.equal(getProjectSummary(edited,'P','demo-sales').stage,'评审中');
 assert.equal(getProjectSummary({...s,exportScopesByProject:{P:{...scope,mapping:{draft:'original'}}}},'P','demo-sales').stage,'评审中');
 assert.equal(getProjectSummary({...s,reviewsByProject:{P:[{id:'D',status:'待处理'}]}},'P','demo-sales').stage,'评审中');
 assert.equal(snapshot.status,'已批准');assert.ok(snapshot.exportedAt);
});
test('drafting professional review and clarification share the project review stage',()=>{
 const s=reconcileTasks({projects:[{id:'P'}],requirementsByProject:{P:[{id:'R',status:'待确认',version:1}]},reviewsByProject:{P:[{id:'D1',requirementId:'R',status:'待处理',owner:'技术确认人'},{id:'D2',requirementId:'R',kind:'clarification',status:'待处理',owner:'销售负责人'}]},snapshotsByProject:{P:[]},tasksById:{}},{at:'2026-10-23T00:00:00Z'});
 const summary=getProjectSummary(s,'P','demo-sales');assert.equal(summary.stage,'评审中');assert.equal(summary.reviews,1);assert.equal(summary.clarifications,1);
 assert.equal(summary.pending,selectMyTasks(s,{actorId:'demo-sales',projectId:'P',tab:'pending'}).length);
 assert.equal(summary.total,1);
});
test('source upload and parsing determine early stages without reading browser storage',()=>{
 const state={projects:[{id:'P'}],requirementsByProject:{P:[]}};
 const source={id:'F',purpose:'要求来源',version:'V1',status:'排队中'};
 assert.equal(getProjectSummary(state,'P','demo-sales').stage,'待上传');
 for(const status of ['排队中','处理中','失败','完成'])assert.equal(getProjectSummary({...state,documentsByProject:{P:[{...source,status}]}},'P','demo-sales').stage,'解析中');
 assert.equal(getProjectSummary({...state,documentsByProject:{P:[{...source,purpose:'补充附件'}]}},'P','demo-sales').stage,'待上传');
 const rows=[{id:'R',status:'待确认'}];
 assert.equal(getProjectSummary({...state,requirementsByProject:{P:rows},documentsByProject:{P:[{...source,status:'完成'}]}},'P','demo-sales').stage,'评审中');
 assert.equal(getProjectSummary({...state,requirementsByProject:{P:rows},documentsByProject:{P:[source]}},'P','demo-sales').stage,'解析中');
 assert.equal(getProjectSummary({...state,requirementsByProject:{P:rows},documentsByProject:{P:[{...source,status:'失败'},{...source,id:'F2',previousVersionId:'F',status:'完成'}]}},'P','demo-sales').stage,'评审中');
});
test('pending reapproval takes precedence over a historical approved export',()=>{
 const row={id:'R',version:1,status:'已确认'},scope={rows:[row],configuration:{equipment:'A'}};
 const snapshot={id:'S',createdAt:'2026-10-23T00:00:00Z',status:'已批准',exportedAt:'2026-10-24',approvalScope:scope,approvalFingerprint:snapshotFingerprint(scope)};
 const current={...snapshot,id:'S2',createdAt:'2026-10-24T00:00:00Z',status:'审批中',exportedAt:undefined};
 const state={projects:[{id:'P',equipment:'A'}],requirementsByProject:{P:[row]},snapshotsByProject:{P:[snapshot,current]}};
 assert.equal(getProjectSummary(state,'P','demo-sales').stage,'评审中');
 assert.equal(getProjectSummary({...state,snapshotsByProject:{P:[snapshot,{...current,status:'已退回'}]}},'P','demo-sales').stage,'评审中');
 assert.equal(getProjectSummary({...state,snapshotsByProject:{P:[snapshot,{...current,status:'已批准'}]}},'P','demo-sales').stage,'审批完成');
 assert.equal(getProjectSummary({...state,snapshotsByProject:{P:[snapshot,{...current,status:'已批准',exportedAt:'2026-10-24'}]}},'P','demo-sales').stage,'已导出');
});
test('project owner handover preserves existing task assignee and deadlines',()=>{
 const s=reconcileTasks({projects:[{id:'P',ownerId:'demo-sales',deadline:'2026-11-01'}],requirementsByProject:{P:[{id:'R',status:'待确认'}]}});
 const before=Object.values(s.tasksById)[0];
 const moved=reconcileTasks({...s,projects:[{...s.projects[0],ownerId:'demo-technical'}]});
 assert.equal(moved.tasksById[before.id].assigneeId,'demo-sales');assert.equal(moved.tasksById[before.id].dueAt,before.dueAt);
});
