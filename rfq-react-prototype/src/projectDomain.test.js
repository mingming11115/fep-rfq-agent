import test from 'node:test';
import assert from 'node:assert/strict';
import {removeProject,restoreProject} from './projectDomain.js';
import * as projectDomain from './projectDomain.js';
import {upgradePrototypeState} from './stateMigration.js';
import {createDemoState} from './data.js';
import {reconcileTasks,selectMyTasks} from './taskDomain.js';

function fixture(){return reconcileTasks(upgradePrototypeState(createDemoState(),createDemoState()));}
test('deletion removes a project and its pending work while undo restores the full working state',()=>{
 const before=fixture(),pid='RFQ-001';
 before.activeProjectId=pid;
 before.analysisRuns=[{id:'RUN',projectId:pid},{id:'OTHER-RUN',projectId:'RFQ-002'}];
 const next=removeProject(before,pid);
 assert.ok(!next.projects.some(p=>p.id===pid));
 assert.equal(next.requirementsByProject[pid],undefined);
 assert.equal(next.documentsByProject[pid],undefined);
 assert.equal(selectMyTasks(next,{actorId:'demo-sales',projectId:pid}).length,0);
 assert.deepEqual(next.analysisRuns,[{id:'OTHER-RUN',projectId:'RFQ-002'}]);
 assert.notEqual(next.activeProjectId,pid);
 assert.ok(before.projects.some(p=>p.id===pid));
 const restored=restoreProject(next,pid);
 for(const key of ['projects','requirementsByProject','reviewsByProject','snapshotsByProject','documentsByProject','tasksById','analysisRuns'])assert.deepEqual(restored[key],before[key]);
 assert.equal(restored.deletedProjectsById[pid],undefined);
});
test('deleting the last project stays empty after migration and can still be undone',()=>{
 const before={actorRole:'销售负责人',actorId:'demo-sales',projects:[{id:'P',name:'唯一项目',ownerId:'demo-sales',participantIds:['demo-sales']}],requirementsByProject:{P:[{id:'R',draft:'人工应答'}]}};
 const deleted=upgradePrototypeState(removeProject(before,'P'),createDemoState());
 assert.deepEqual(deleted.projects,[]);
 assert.equal(restoreProject(deleted,'P').requirementsByProject.P[0].draft,'人工应答');
});
test('only sales can delete or restore, and stale repeated deletion cannot overwrite the undo record',()=>{
 const before=fixture();
 for(const actorRole of ['技术确认人','最终审批人'])assert.throws(()=>removeProject({...before,actorRole},'RFQ-001'),/权限/);
 const deleted=removeProject(before,'RFQ-001');
 assert.throws(()=>removeProject(deleted,'RFQ-001'),/不存在/);
 assert.throws(()=>restoreProject({...deleted,actorRole:'技术确认人'},'RFQ-001'),/权限/);
});
test('an upload targeting a deleted project cannot fall back to another active project',()=>{
 const before=fixture(),deleted=removeProject(before,'RFQ-001');
 deleted.activeProjectId='RFQ-002';
 const files=structuredClone(deleted.documentsByProject['RFQ-002']);
 assert.throws(()=>projectDomain.addProjectSources(deleted,'RFQ-001',[{id:'NEW',name:'客户要求.pdf'}]),/项目不存在/);
 assert.deepEqual(deleted.documentsByProject['RFQ-002'],files);
 const next=projectDomain.addProjectSources(deleted,'RFQ-002',[{id:'NEW',name:'客户要求.pdf'}]);
 assert.equal(next.documentsByProject['RFQ-002'].at(-1).id,'NEW');
 assert.deepEqual(deleted.documentsByProject['RFQ-002'],files);
});
