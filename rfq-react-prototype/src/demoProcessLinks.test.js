import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState} from './data.js';
import {upgradePrototypeState} from './stateMigration.js';
import {tidyDemoState} from './demoCleanup.js';
import {selectAccessibleState,getProjectSummary} from './projectSelectors.js';
import {canAccessProject} from './personnelDomain.js';
import {MODELS,PROCESSES} from './modelProcessSeeds.js';
import {resolveRfqProcessBinding} from './rfqProcessBinding.js';

const bindingFields=['modelId','modelName','modelCode','modelRevision','modelMetadataVersion','modelConfig','processId','processName','processCode','processVersion','demoProcessBindingVersion'];
function savedDemo(){
  const demo=createDemoState(),state=tidyDemoState(upgradePrototypeState(demo,demo));
  for(const project of state.projects)for(const field of bindingFields)delete project[field];
  return state;
}

test('saved demo projects populate all three process RFQ lists with accessible existing projects',()=>{
  const before=savedDemo(),next=upgradePrototypeState(before,createDemoState());
  const visible=selectAccessibleState(next,'demo-technical').projects;
  const expected={Si:['RFQ-001','RFQ-002'],SiP:['RFQ-DEMO-UPLOAD','RFQ-DEMO-PARSING'],GeSi:['RFQ-003']};
  for(const [name,ids]of Object.entries(expected)){
    const process=PROCESSES.find(row=>row.name===name&&row.enabled);
    const linked=visible.filter(project=>project.buId==='BU-DEMO'&&project.modelId===process.modelId&&project.processId===process.id);
    assert.deepEqual(linked.map(project=>project.id).sort(),ids.sort());
    for(const project of linked){
      assert.ok(project.name&&project.customer&&project.owner);
      assert.equal(canAccessProject(next,'demo-technical',project.id),true);
      const binding=resolveRfqProcessBinding({models:MODELS,processes:PROCESSES,buId:project.buId,modelId:project.modelId,processId:project.processId});
      assert.equal(project.processName,binding.processName);
      assert.equal(project.modelName,binding.modelName);
    }
  }
  assert.equal(next.projects.length,before.projects.length);
  assert.deepEqual(next.snapshotsByProject,before.snapshotsByProject);
  assert.deepEqual(next.exportScopesByProject,before.exportScopesByProject);
  assert.deepEqual(next.projects.map(project=>getProjectSummary(next,project.id,'demo-sales').stage),before.projects.map(project=>getProjectSummary(before,project.id,'demo-sales').stage));
});

test('demo associations preserve existing selections and do not bind foreign or custom projects',()=>{
  const before=savedDemo();
  const partial=before.projects.find(project=>project.id==='RFQ-001');partial.modelId='CUSTOM';
  const bound=before.projects.find(project=>project.id==='RFQ-002');Object.assign(bound,{modelId:'CUSTOM',processId:'CUSTOM-P',processName:'手动选择'});
  const foreign=before.projects.find(project=>project.id==='RFQ-003');foreign.buId='OTHER';
  const renamed=before.projects.find(project=>project.id==='RFQ-DEMO-UPLOAD');renamed.customer='用户客户';
  before.projects.push({id:'CUSTOM',buId:'BU-DEMO',name:'用户项目',customer:'用户客户',ownerId:'demo-sales'});
  const next=upgradePrototypeState(before,createDemoState());
  assert.equal(next.projects.find(project=>project.id===partial.id).modelId,'CUSTOM');
  assert.equal(next.projects.find(project=>project.id===partial.id).processId,undefined);
  assert.equal(next.projects.find(project=>project.id===bound.id).processId,'CUSTOM-P');
  assert.equal(next.projects.find(project=>project.id===bound.id).processName,'手动选择');
  for(const id of [foreign.id,renamed.id,'CUSTOM'])assert.equal(next.projects.find(project=>project.id===id).processId,undefined);
});

test('refreshing keeps subsequent edits and does not recreate removed project associations',()=>{
  const next=upgradePrototypeState(savedDemo(),createDemoState());
  assert.equal(next.projects.find(project=>project.id==='RFQ-001').processName,'Si');
  const cleared=next.projects.find(project=>project.id==='RFQ-001');
  for(const field of bindingFields.filter(field=>field!=='demoProcessBindingVersion'))delete cleared[field];
  const changed=next.projects.find(project=>project.id==='RFQ-002');changed.processId='USER-PROCESS';changed.processName='后续修改';
  assert.deepEqual(upgradePrototypeState(next,createDemoState()),next);
});
