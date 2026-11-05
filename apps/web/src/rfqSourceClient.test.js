import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadRfqSource,parseRfqSource} from './rfqSourceClient.js';
test('real upload parses and fetches only persisted clauses from every page',async()=>{
 const calls=[];
 const api={get:async path=>{calls.push(path);if(!path.includes('requirements'))return {id:'P'};return {list:[{id:path.includes('page=2')?'R2':'R1',documentId:'D',originalText:'300 mm'}],totalPages:2};},upload:async()=>({id:'D',version:1}),post:async()=>({status:'completed',requirementCount:2})};
 const file=await uploadRfqSource('P',new Blob(['data']),{id:'F',name:'x.pdf',version:'V1.0'},api);
 const result=await parseRfqSource('P',file,api);
 assert.equal(file.backendDocumentId,'D');assert.equal(result.rows.length,2);assert.equal(result.rows[0].original,'300 mm');assert.equal(result.rows[0].sourceFileId,'F');assert.equal(result.rows[0].draft,'');assert.equal(calls.length,3);
});
test('failure and unknown local sources never generate substitute clauses',async()=>{
 await assert.rejects(()=>parseRfqSource('P',{id:'F'}),/重新上传/);
 await assert.rejects(()=>parseRfqSource('P',{backendDocumentId:'D'},{post:async()=>({status:'failed',message:'解析失败'})}),/解析失败/);
});

test('a migrated local project uploads and reads clauses using its backend ID while preserving its source binding',async()=>{
 const calls=[];
 const api={get:async path=>{calls.push(path);return path.includes('requirements')?{list:[{id:'R',documentId:'D',originalText:'精度要求'}],totalPages:1}:{id:'BACKEND'};},upload:async path=>{calls.push(path);return {id:'D',version:1};},post:async()=>({status:'completed',requirementCount:1})};
 const file=await uploadRfqSource('LOCAL',new Blob(['word']),{id:'F',name:'new.docx',version:'V1.0'},api,{id:'LOCAL'});
 assert.equal(file.sourceProjectId,'LOCAL');assert.equal(file.backendProjectId,'BACKEND');
 assert.ok(calls.includes('/projects/BACKEND/documents'));
 const result=await parseRfqSource('LOCAL',file,api);assert.equal(result.rows.length,1);
 assert.ok(calls.some(path=>path.startsWith('/projects/BACKEND/requirements')));
 await assert.rejects(()=>parseRfqSource('OTHER',file,api),/所属项目不一致/);
});
