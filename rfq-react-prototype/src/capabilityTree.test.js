import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from './capabilityTree.js';

const models=[
  {id:'A2',buId:'A',name:'机型 A',code:'FEP-A',revision:'R2',version:1,config:'旧配置',series:'精密',lifecycle:'量产'},
  {id:'A2',buId:'A',name:'机型 A',code:'FEP-A',revision:'R2',version:2,config:'最新配置',series:'精密',lifecycle:'量产'},
  {id:'A1',buId:'A',name:'机型 A',code:'FEP-A',revision:'R1',version:1,series:'精密',lifecycle:'停产'},
  {id:'B1',buId:'B',name:'别的BU',revision:'R1',version:1},
];
const processes=[
  {id:'P1',buId:'A',modelId:'A2',code:'P1',name:'基础工艺',enabled:true},
  {id:'P2',buId:'A',modelId:'A2',code:'P2',name:'精密工艺',enabled:false},
  {id:'OLD',buId:'A',modelId:'A1',code:'P1',name:'旧工艺',enabled:false},
  {id:'FOREIGN',buId:'B',modelId:'A2',name:'其他BU工艺'},
];
const capabilities=[
  {id:'C1',buId:'A',modelId:'A2',processId:'P1',version:1,metric:'加工厚度',value:'0.5–1.0 mm',source:'Excel',status:'已发布'},
  {id:'C1',buId:'A',modelId:'A2',processId:'P1',version:2,metric:'加工厚度',value:'0.5–1.2 mm',source:'Excel',status:'草稿'},
  {id:'C2',buId:'A',modelId:'A2',processId:'P2',version:1,metric:'定位精度',value:'5 μm',status:'已发布'},
  {id:'C3',buId:'A',modelId:'A2',version:1,metric:'产能',value:'120 片/小时',status:'草稿'},
  {id:'C4',buId:'A',modelId:'A2',processId:'OLD',version:1,metric:'尺寸',value:'300 mm',status:'待审核'},
  {id:'C5',buId:'A',modelId:'A2',processId:'FOREIGN',version:1,metric:'温度',value:'100 ℃',status:'草稿'},
  {id:'SECRET',buId:'B',modelId:'A2',processId:'P1',version:1,metric:'其他BU能力'},
];
const build=filters=>domain.buildCapabilityTree({buId:'A',buName:'FEP BU',models,processes,capabilities,filters});

test('tree scopes BU resources and keeps hardware revisions separate with latest metadata',()=>{
  const root=build();
  assert.equal(root.label,'FEP BU');
  assert.deepEqual(root.children.map(n=>n.key),['model:A2','model:A1']);
  assert.equal(root.children[0].record.config,'最新配置');
  assert.equal(domain.findCapabilityTreeNode(root,'capability:SECRET:1'),null);
  assert.deepEqual(root.children[0].children.map(n=>n.key),['process:P1','process:P2','unassigned:A2']);
});

test('capability versions retain exact selection identity under their process',()=>{
  const root=build(),node=domain.findCapabilityTreeNode(root,'capability:C1:2');
  assert.equal(node.record.value,'0.5–1.2 mm');
  assert.equal(node.modelId,'A2');assert.equal(node.processId,'P1');
  assert.equal(domain.findCapabilityTreeNode(root,'process:P1').children.length,2);
});

test('missing, wrong-model and foreign-BU process links remain under unassigned',()=>{
  const pending=domain.findCapabilityTreeNode(build(),'unassigned:A2');
  assert.deepEqual(pending.children.map(n=>n.key),['capability:C3:1','capability:C4:1','capability:C5:1']);
  assert.ok(pending.children.every(n=>n.processId==='unassigned'));
});

test('disabled processes keep historical capability nodes and empty hardware models',()=>{
  const root=build();
  assert.equal(domain.findCapabilityTreeNode(root,'process:P2').record.enabled,false);
  assert.equal(domain.findCapabilityTreeNode(root,'capability:C2:1').processId,'P2');
  assert.equal(domain.findCapabilityTreeNode(root,'model:A1').children[0].key,'process:OLD');
});

test('capability search retains ancestors and selection falls back to the visible result',()=>{
  const root=build({query:'  定位精度  '});
  assert.deepEqual(root.children.map(n=>n.key),['model:A2']);
  assert.deepEqual(root.children[0].children.map(n=>n.key),['process:P2']);
  assert.equal(domain.resolveCapabilityTreeSelection(root,'capability:C1:1').key,'capability:C2:1');
});

test('model and process searches reveal their descendants without merging hardware versions',()=>{
  const modelRoot=build({query:'R2'});
  assert.deepEqual(modelRoot.children.map(n=>n.key),['model:A2']);
  assert.equal(domain.findCapabilityTreeNode(modelRoot,'unassigned:A2').children.length,3);
  const processRoot=build({query:'基础工艺'});
  assert.deepEqual(processRoot.children[0].children.map(n=>n.key),['process:P1']);
  assert.equal(processRoot.children[0].children[0].children.length,2);
});

test('series lifecycle source and status filters do not leak hidden capability versions',()=>{
  const root=build({series:'精密',lifecycle:'量产',source:'Excel',status:'草稿'});
  assert.deepEqual(root.children.map(n=>n.key),['model:A2']);
  assert.deepEqual(root.children[0].children.map(n=>n.key),['process:P1']);
  assert.deepEqual(root.children[0].children[0].children.map(n=>n.key),['capability:C1:2']);
  assert.equal(domain.resolveCapabilityTreeSelection(root,'capability:C1:2').record.version,2);
});

test('empty BU and searches with no results resolve to BU without stale records',()=>{
  const root=domain.buildCapabilityTree({buId:'EMPTY',buName:'空BU',models,processes,capabilities});
  assert.deepEqual(root.children,[]);
  assert.equal(domain.resolveCapabilityTreeSelection(root,'capability:C1:1').key,'bu:EMPTY');
  assert.equal(domain.resolveCapabilityTreeSelection(build({query:'不存在'}),'model:A2').kind,'bu');
});

test('legacy records without BU identifiers belong only to demo BU',()=>{
  const legacyModels=[{id:'M',name:'旧机型',revision:'R1',version:1}];
  const demo=domain.buildCapabilityTree({buId:'BU-DEMO',models:legacyModels});
  const foreign=domain.buildCapabilityTree({buId:'A',models:legacyModels});
  assert.equal(demo.children.length,1);assert.equal(foreign.children.length,0);
  assert.equal(domain.resolveCapabilityTreeSelection(demo,'missing').key,'model:M');
});
