import test from 'node:test';
import assert from 'node:assert/strict';
import {writeResponse} from './responseClient.js';
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
