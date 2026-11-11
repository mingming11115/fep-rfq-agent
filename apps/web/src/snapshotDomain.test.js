import test from 'node:test';import assert from 'node:assert/strict';import {snapshotFingerprint,checkSnapshotValidity,invalidatePendingSnapshots} from './snapshotDomain.js';import {reconcileTasks,selectMyTasks} from './taskDomain.js';

test('renaming the saved response remark preserves the approval fingerprint', () => {
 const oldScope = {format:'mysql-business-v1', rows:[{id:'R1',reason:'历史备注'}]};
 const current = {format:'mysql-business-v1', rows:[{id:'R1',remark:'历史备注'}]};
 assert.equal(snapshotFingerprint(current), snapshotFingerprint(oldScope));
 assert.notEqual(snapshotFingerprint({...current,rows:[{id:'R1',remark:''}]}), snapshotFingerprint(oldScope));
});
const scope={rows:[{id:'R',version:1,draft:'已确认'}],sourceVersions:['F:v1'],configuration:{equipment:'A'},template:{id:'T',version:1},mapping:{answer:'draft'},attachments:[]};
test('database approval scope ignores transport metadata while detecting business and source changes',()=>{
 const frozen={...scope,format:'mysql-business-v1'};
 const snapshot={id:'S',approvalFingerprint:snapshotFingerprint(frozen)};
 assert.equal(checkSnapshotValidity(snapshot,{...frozen,rows:[{...scope.rows[0],backendVersion:0,source:'数据库文件显示名.docx'}]}).valid,true);
 for(const altered of [{...frozen,rows:[{...scope.rows[0],draft:'未经批准的新答复'}]},{...frozen,sourceVersions:['F:v2']}])assert.equal(checkSnapshotValidity(snapshot,altered).valid,false);
});
test('mapping attachment or source changes invalidate pending approval',()=>{const snapshot={status:'审批中',approvalFingerprint:snapshotFingerprint(scope)};for(const next of [{...scope,sourceVersions:['F:v2']},{...scope,mapping:{answer:'conditions'}},{...scope,attachments:[{id:'A',version:1}]}])assert.equal(checkSnapshotValidity(snapshot,next).valid,false);assert.equal(checkSnapshotValidity(snapshot,scope).valid,true);});
test('historical approved snapshot remains unchanged and old approval task invalidates',()=>{const snap={id:'S',projectId:'P',status:'审批中',rows:scope.rows,approvalScope:scope,approvalFingerprint:snapshotFingerprint(scope)},approved={...snap,id:'A',status:'已批准'};const state=reconcileTasks({projects:[{id:'P',equipment:'A'}],requirementsByProject:{P:scope.rows},snapshotsByProject:{P:[snap,approved]},exportScopesByProject:{P:scope}});const changed=invalidatePendingSnapshots({...state,requirementsByProject:{P:[{...scope.rows[0],version:2}]}});assert.equal(changed.snapshotsByProject.P[0].stale,true);assert.deepEqual(changed.snapshotsByProject.P[1],approved);assert.equal(selectMyTasks(reconcileTasks(changed),{actorId:'demo-approver'}).length,0);});
test('uploading a new source version invalidates approval before visiting export again',()=>{
 const snap={id:'S',status:'审批中',approvalScope:scope,approvalFingerprint:snapshotFingerprint(scope)};
 const state={projects:[{id:'P',equipment:'A'}],requirementsByProject:{P:scope.rows},snapshotsByProject:{P:[snap]},exportScopesByProject:{P:scope},documentsByProject:{P:[{id:'F',purpose:'要求来源',version:'v1'}]}};
 assert.equal(invalidatePendingSnapshots(state).snapshotsByProject.P[0].stale,undefined);
 const changed=invalidatePendingSnapshots({...state,documentsByProject:{P:[{id:'F',purpose:'要求来源',version:'v1'},{id:'F2',purpose:'要求来源',version:'v2',previousVersionId:'F'}]}});
 assert.equal(changed.snapshotsByProject.P[0].stale,true);
 assert.equal(snap.stale,undefined);
});
test('a historical matching approval cannot be used once a new approval round exists',()=>{
 const approved={id:'S1',status:'已批准',approvalFingerprint:snapshotFingerprint(scope)};
 assert.equal(checkSnapshotValidity(approved,scope,{id:'S2',status:'已退回'}).valid,false);
 assert.equal(checkSnapshotValidity(approved,scope,approved).valid,true);
});
