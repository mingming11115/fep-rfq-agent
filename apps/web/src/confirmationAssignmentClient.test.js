import test from 'node:test';
import assert from 'node:assert/strict';
import {assignConfirmation,confirmationCandidates} from './confirmationAssignmentClient.js';
import {getConfirmationActorIds} from './confirmationPolicy.js';
import {mapDatabaseRequirement} from './databaseWorkspace.js';

test('new backend clauses use the project default and explicit assignments survive mapping',()=>{
 const state={dataSource:'mysql',projects:[{id:'P',ownerId:'OWNER',defaultConfirmationAssigneeId:'CREATOR'}]};
 const row=mapDatabaseRequirement({id:'R',documentId:'D',version:0},[],'OWNER');
 assert.deepEqual(getConfirmationActorIds(state,'P',row),['CREATOR']);
 const loaded=mapDatabaseRequirement({...row,confirmationAssigneeId:'TECH'},[],'OWNER');
 assert.deepEqual(getConfirmationActorIds(state,'P',loaded),['TECH']);
});
test('assignment sends backend version including zero and server failures propagate',async()=>{
 const calls=[],api={get:async path=>{calls.push(path);return [{userId:'TECH'}];},patch:async(path,body)=>{calls.push([path,body]);return {confirmationAssigneeId:body.userId,version:1};}};
 assert.equal((await confirmationCandidates('R',api))[0].userId,'TECH');
 assert.equal((await assignConfirmation('R',{userId:'TECH',version:0,reason:'负责技术核对'},api)).version,1);
 assert.deepEqual(calls[1],['/requirements/R/confirmation-assignment',{userId:'TECH',version:0,reason:'负责技术核对'}]);
 await assert.rejects(assignConfirmation('R',{userId:'TECH',version:0,reason:'分派'},{patch:async()=>{throw Error('分工已变化');}}),/分工已变化/);
});
