import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadRfqSource,parseRfqSource} from './rfqSourceClient.js';
test('real upload parses and fetches only persisted clauses from every page',async()=>{
 const calls=[];
 const api={get:async path=>{calls.push(path);if(!path.includes('requirements')) { return {id:'P'}; } return {list:[{id:path.includes('page=2')?'R2':'R1',documentId:'D',originalText:'300 mm'}],totalPages:2};},upload:async()=>({id:'D',version:1}),post:async()=>({status:'completed',requirementCount:2})};
 const file=await uploadRfqSource('P',new Blob(['data']),{id:'F',name:'x.pdf',version:'V1.0'},api);
 const result=await parseRfqSource('P',file,api);
 assert.equal(file.backendDocumentId,'D');assert.equal(result.rows.length,2);assert.equal(result.rows[0].original,'300 mm');assert.equal(result.rows[0].sourceFileId,'F');assert.equal(result.rows[0].draft,'');assert.equal(calls.length,3);
});
test('failure and unknown local sources never generate substitute clauses',async()=>{
 await assert.rejects(()=>parseRfqSource('P',{id:'F'}),/重新上传/);
 await assert.rejects(()=>parseRfqSource('P',{backendDocumentId:'D'},{post:async()=>({status:'failed',message:'解析失败'})}),/解析失败/);
});

test('a failed read after committed parsing is distinguishable from a failed parse',async()=>{
 const run={id:'RUN',status:'completed',requirementCount:1};
 await assert.rejects(()=>parseRfqSource('P',{backendDocumentId:'D'},{
  post:async()=>run,get:async()=>{throw new Error('请求超时');},
 }),error=>error.run===run&&error.message.includes('解析已完成'));
});

test('the semiconductor demo project uploads the selected bytes and uses only backend clauses',async()=>{
 const projectId='RFQ-DEMO-UPLOAD',calls=[],original=new Blob(['unique uploaded requirement']);
 const api={
  get:async path=>{calls.push(path);return path.includes('/requirements?')?{list:[{id:'REAL',documentId:'D',originalText:'unique uploaded requirement'},{id:'OTHER',documentId:'OTHER-D',originalText:'other document'}],totalPages:1}:{id:'BACKEND'};},
  upload:async(path,body)=>{calls.push(path);assert.equal(await body.get('file').text(),await original.text());return {id:'D',version:1};},
  post:async path=>{calls.push(path);return {id:'RUN',status:'partial',requirementCount:1,issueCount:1};},
 };
 const file=await uploadRfqSource(projectId,original,{id:'F',name:'new.docx',version:'V1.0'},api,{id:projectId,name:'半导体薄膜沉积设备'});
 const {run,rows}=await parseRfqSource(projectId,file,api);
 assert.ok(calls.includes('/projects/BACKEND/documents'));
 assert.ok(calls.includes('/documents/D/parse-runs'));
 assert.deepEqual(rows.map(row=>row.original),['unique uploaded requirement']);
 assert.equal(run.status,'partial');assert.equal(rows[0].draft,'');assert.equal(rows[0].conclusion,'');
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
