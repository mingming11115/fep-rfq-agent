import test from 'node:test';
import assert from 'node:assert/strict';
import {selectReadableResources,resourceStorageKey} from './resourceVisibility.js';
const state={actorId:'u',actorRole:'技术',accountsById:{u:{id:'u',enabled:true}},businessUnits:[{id:'A'},{id:'BU-DEMO'}],buPersonnelByBuId:{A:[{userId:'u',roles:['技术'],enabled:true}], 'BU-DEMO':[{userId:'u',roles:['技术'],enabled:true}]},projects:[{id:'RFQ-001',buId:'BU-DEMO',participantIds:[]}]};
const ctx={state,actorId:'u',buId:'BU-DEMO'};
test('a BU member without project access cannot discover draft knowledge or customer source files',()=>{
 const items=[{id:'draft',status:'草稿',source:'RFQ-001 定稿条款',scope:'FEP 授权项目'},{id:'file',status:'有效',scope:'仅当前项目',projectId:'RFQ-001'},{id:'published',status:'已发布',scope:'FEP 授权项目'}];
 assert.deepEqual(selectReadableResources(items,ctx).map(x=>x.id),['published']);
 state.projects[0].participantIds=['u'];assert.deepEqual(selectReadableResources(items,ctx).map(x=>x.id),['draft','file','published']);state.projects[0].participantIds=[];
});
test('BU storage and filtering do not expose another BU or an unbound project-only record',()=>{
 const items=[{id:'a',buId:'A',status:'已发布'},{id:'b',buId:'BU-DEMO',status:'已发布'},{id:'unbound',scope:'仅当前项目'}];
 assert.deepEqual(selectReadableResources(items,{...ctx,buId:'A'}).map(x=>x.id),['a']);assert.equal(resourceStorageKey('resources','A'),'resources:A');assert.equal(resourceStorageKey('resources','BU-DEMO'),'resources');
});

test('platform administrators can maintain shared knowledge and select shared evidence without opening private project records',()=>{
 const adminState={...state,accountsById:{admin:{enabled:true,systemAdmin:true}}};
 const context={state:adminState,actorId:'admin',buId:'BU-DEMO'};
 const rows=[
  {id:'shared-draft',status:'草稿',scope:'FEP 授权项目'},
  {id:'shared-published',status:'已发布',scope:'FEP 授权项目'},
  {id:'project-draft',status:'草稿',source:'RFQ-001',scope:'FEP 授权项目'},
  {id:'project-file',status:'有效',scope:'仅当前项目',projectId:'RFQ-001'},
  {id:'other-bu',buId:'A',status:'已发布'},
 ];
 assert.deepEqual(selectReadableResources(rows,context).map(row=>row.id),['shared-draft','shared-published']);
 const evidence=[{id:'shared',status:'有效',scope:'FEP 授权项目'},{id:'private',status:'有效',scope:'仅当前项目',projectId:'RFQ-001'}];
 assert.deepEqual(selectReadableResources(evidence,context,'evidence').map(row=>row.id),['shared']);
 assert.deepEqual(selectReadableResources(rows,context,'capability'),[]);
 assert.deepEqual(selectReadableResources(rows,{...context,buId:'missing'}),[]);
 adminState.accountsById.admin.enabled=false;
 assert.deepEqual(selectReadableResources(rows,context),[]);
});
