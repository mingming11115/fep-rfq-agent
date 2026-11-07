import test from 'node:test';
import assert from 'node:assert/strict';
import {loadResponseHistory,restoreResponse,writeResponse} from './responseClient.js';
test('save and confirm carry independent response and source versions',async()=>{
 const calls=[];const client={patch:async(...args)=>{calls.push(args);return {version:3};},post:async(...args)=>{calls.push(args);return {status:'已确认'};}};
 const row={id:'R/1',version:2,backendVersion:0};
 assert.equal((await writeResponse(row,{draft:'答复'},false,client)).version,3);
 assert.equal((await writeResponse(row,null,true,client)).status,'已确认');
 assert.deepEqual(calls,[['/requirements/R%2F1/response',{version:2,sourceVersion:0,patch:{draft:'答复'}}],['/requirements/R%2F1/response/confirm',{version:2,sourceVersion:0}]]);
});
test('server rejection propagates to keep the card and inputs',async()=>{
 await assert.rejects(writeResponse({id:'R',version:1,backendVersion:0},null,true,{post:async()=>{throw Error('版本冲突');}}),/版本冲突/);
});

test('confirming edited content sends one request with the complete patch',async()=>{
 const calls=[];
 const row={id:'R/1',version:2,backendVersion:1};
 const patch={conclusion:'有条件 Comply',draft:'交期 10 周'};
 await writeResponse(row,patch,true,{post:async(...args)=>{calls.push(args);}});
 assert.deepEqual(calls,[['/requirements/R%2F1/response/confirm',{version:2,sourceVersion:1,patch}]]);
});

test('history and restore address a single clause and preserve both concurrency versions',async()=>{
 const row={id:'R/1',version:6,backendVersion:0};
 const client={get:async path=>path,post:async(path,body)=>[path,body]};
 assert.equal(await loadResponseHistory(row.id,client),'/requirements/R%2F1/response/history');
 assert.deepEqual(await restoreResponse(row,{kind:'confirmation',historyVersion:1},client),
   ['/requirements/R%2F1/response/restore',{version:6,sourceVersion:0,kind:'confirmation',historyVersion:1}]);
});
