import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from './modelProcessDomain.js';
import {canPerform} from './permissions.js';

const state={accountsById:{admin:{id:'admin',enabled:true,managedBuIds:['A']},tech:{id:'tech',enabled:true},sr:{id:'sr',enabled:true}},businessUnits:[{id:'A'},{id:'B'}],buPersonnelByBuId:{A:[{userId:'tech',enabled:true,roles:['技术']},{userId:'sr',enabled:true,roles:['SR']}]}};
const context={state,actorId:'admin',buId:'A'};
const model={id:'M1',buId:'A',code:'ETCH',name:'刻蚀机',revision:'R1',config:'标准配置',version:1,status:'已发布'};
const other={...model,id:'M2',buId:'B'};
const process={id:'P1',buId:'A',modelId:'M1',code:'DRY',name:'干法刻蚀',conditions:'硅片',enabled:true};

test('only the administrator of this BU can configure its models and processes',()=>{
 assert.equal(canPerform('BU管理员','model:configure',context),true);
 for(const [actorId,role,buId] of [['tech','技术','A'],['sr','SR','A'],['admin','BU管理员','B']]){
  assert.equal(canPerform(role,'model:configure',{...context,actorId,buId}),false);
  assert.throws(()=>domain.saveModelProcess([process],{context:{...context,actorId,buId},models:[model],record:process}),/权限|BU/);
 }
 assert.throws(()=>domain.saveModelMetadata([],{context,record:other}),/BU/);
});

test('an enabled SR may create BU catalog entries but cannot overwrite or disable existing records',()=>{
 const srContext={...context,actorId:'sr',state:{...state,actorRole:'SR'}};
 assert.equal(canPerform('SR','catalog:create',srContext),true);
 const created=domain.saveModelMetadata([],{context:srContext,record:model});
 assert.equal(created[0].buId,'A');assert.equal(created[0].updatedById,'sr');
 const nextProcesses=domain.saveModelProcess([],{context:srContext,models:created,record:process});
 assert.equal(nextProcesses[0].modelId,'M1');
 assert.throws(()=>domain.saveModelMetadata(created,{context:srContext,record:{...model,name:'覆盖'}}),/权限/);
 assert.throws(()=>domain.saveModelProcess(nextProcesses,{context:srContext,models:created,record:{...process,enabled:false}}),/权限/);
 for(const otherContext of [{...srContext,buId:'B'},{...srContext,actorId:'tech',state:{...state,actorRole:'技术'}},{...srContext,state:{...state,actorRole:'SR',accountsById:{...state.accountsById,sr:{...state.accountsById.sr,enabled:false}}}}]){
  assert.throws(()=>domain.saveModelMetadata([],{context:otherContext,record:model}),/权限|BU/);
 }
});

test('model configuration revisions preserve earlier metadata and reject duplicate hardware versions',()=>{
 const next=domain.saveModelMetadata([model],{context,record:{...model,name:'刻蚀机升级'}});
 assert.equal(next.length,2);assert.equal(next[0].name,'刻蚀机');assert.equal(next[1].version,2);assert.equal(next[1].status,'已发布');
 assert.throws(()=>domain.saveModelMetadata([model],{context,record:{...model,id:'duplicate'}}),/重复/);
});

test('changing the hardware revision cannot silently reassign existing processes and capabilities',()=>{
 assert.throws(()=>domain.saveModelMetadata([model],{context,record:{...model,revision:'R2'}}),/硬件版本.*新建机型/);
 assert.equal(model.revision,'R1');
});

test('process configuration belongs to one BU and one model and retains disabled records',()=>{
 const rows=domain.saveModelProcess([],{context,models:[model,other],record:process});
 assert.equal(rows[0].name,'干法刻蚀');assert.equal(rows[0].buId,'A');
 const disabled=domain.saveModelProcess(rows,{context,models:[model],record:{...process,enabled:false}});
 assert.equal(disabled.length,1);assert.equal(disabled[0].enabled,false);
 assert.throws(()=>domain.saveModelProcess(rows,{context,models:[model],record:{...process,id:'P2'}}),/重复/);
 assert.throws(()=>domain.saveModelProcess(rows,{context,models:[model,other],record:{...process,modelId:'M2'}}),/机型|BU/);
 assert.throws(()=>domain.saveModelProcess(rows,{context,models:[model],record:{...process,name:'  '}}),/名称/);
});

test('capability submission rejects missing, disabled, foreign BU and wrong-model processes',()=>{
 const base={models:[model],processes:[process],buId:'A',requireEnabled:true};
 assert.doesNotThrow(()=>domain.assertCapabilityProcess({modelId:'M1',processId:'P1'},base));
 for(const item of [{modelId:'M1'},{modelId:'M1',processId:'unknown'},{modelId:'other',processId:'P1'},{modelId:'M1',processId:'P1',buId:'B'}]) assert.throws(()=>domain.assertCapabilityProcess(item,base),/工艺|机型|BU/);
 assert.throws(()=>domain.assertCapabilityProcess({modelId:'M1',processId:'P1'},{...base,processes:[{...process,enabled:false}]}),/停用/);
 assert.throws(()=>domain.assertCapabilityProcess({modelId:'M1',processId:'P1'},{...base,processes:[{...process,buId:'B'}]}),/工艺/);
 assert.doesNotThrow(()=>domain.assertCapabilityProcess({modelId:'M1',processId:''},{...base,requireEnabled:false}));
});

test('reimporting a candidate moved to another process never duplicates its identity',()=>{
 const existing=[{id:'IMPORT-1-P1',modelId:'M1',processId:'P2',version:1}];
 assert.deepEqual(domain.prepareCapabilityImports(existing,[{id:'IMPORT-1',metric:'精度'}],'P1'),[]);
 const next=domain.prepareCapabilityImports(existing,[{id:'IMPORT-2',metric:'产能'},{id:'IMPORT-2',metric:'产能'}],'P1');
 assert.deepEqual(next,[{id:'IMPORT-2-P1',metric:'产能'}]);
});

test('capability import templates identify the selected BU hardware model and process',()=>{
 const template=domain.buildCapabilityImportTemplate({buId:'A',buName:'刻蚀事业部',model,process});
 const [header,row]=template;
 const cells=Object.fromEntries(header.map((key,index)=>[key,row[index]]));
 assert.equal(cells['BU编码'],'A');assert.equal(cells['BU名称'],'刻蚀事业部');
 assert.equal(cells['机型编码'],'ETCH');assert.equal(cells['硬件版本'],'R1');
 assert.equal(cells['工艺编码'],'DRY');assert.equal(cells['工艺名称'],'干法刻蚀');
 assert.equal(cells['配置'],'标准配置');assert.equal(cells['适用条件'],'硅片');
 assert.equal(row.length,header.length);
});

test('import templates reject foreign or disabled processes before downloading',()=>{
 for(const selected of [{...process,modelId:'other'},{...process,buId:'B'},{...process,enabled:false}])assert.throws(()=>domain.buildCapabilityImportTemplate({buId:'A',model,process:selected}),/工艺|机型/);
});

function deletionCatalog(){return {
 models:[model,{...model,version:2},other],
 processes:[process,{...process,id:'P2'}, {...process,id:'FOREIGN',buId:'B'}],
 capabilities:[{id:'C',version:1,buId:'A',modelId:'M1',processId:'P1'},{id:'C',version:2,buId:'A',modelId:'M1',processId:'P1'},{id:'UNASSIGNED',version:1,buId:'A',modelId:'M1'},{id:'KEEP',version:1,buId:'B',modelId:'M1',processId:'P1'}],
};}
test('deleting a model removes all its versions and children while preserving foreign BU records',()=>{
 const before=deletionCatalog(),next=domain.removeCatalogNode(before,{context,kind:'model',id:'M1'});
 assert.deepEqual(next.models,[other]);
 assert.deepEqual(next.processes,[before.processes[2]]);
 assert.deepEqual(next.capabilities,[before.capabilities[3]]);
 assert.equal(before.models.length,3);
});
test('deleting a process removes its capability versions and keeps unassigned capabilities',()=>{
 const before=deletionCatalog(),next=domain.removeCatalogNode(before,{context,kind:'process',id:'P1'});
 assert.deepEqual(next.models,before.models);
 assert.deepEqual(next.processes.map(p=>p.id),['P2','FOREIGN']);
 assert.deepEqual(next.capabilities.map(c=>c.id),['UNASSIGNED','KEEP']);
});
test('deleting a capability targets the selected version and refuses foreign or unauthorized nodes',()=>{
 const before=deletionCatalog(),next=domain.removeCatalogNode(before,{context,kind:'capability',id:'C',version:2});
 assert.deepEqual(next.capabilities.map(c=>`${c.id}:${c.version}`),['C:1','UNASSIGNED:1','KEEP:1']);
 assert.deepEqual(next.models,before.models);assert.deepEqual(next.processes,before.processes);
 for(const input of [{kind:'model',id:'M2'},{kind:'model',id:'missing'},{kind:'bu',id:'A'},{kind:'capability',id:'C',version:8}])assert.throws(()=>domain.removeCatalogNode(before,{context,...input}),/BU|不存在|类型/);
 assert.throws(()=>domain.removeCatalogNode(before,{context:{...context,actorId:'tech'},kind:'model',id:'M1'}),/权限/);
});
