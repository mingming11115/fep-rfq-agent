import test from 'node:test';
import assert from 'node:assert/strict';
import {craftRequest, uploadCraftFile, saveCraftReview, importOfficeReview, createCraftSaveQueue,craftDemoAsset} from './craftClient.js';

const source={projectId:'P',fileId:'F',sourceVersion:'V1'};
const ref={id:'document',access:'secret',name:'customer.docx'};
const response=data=>new Response(JSON.stringify({code:0,data}));

test('all built-in RFQ demo sources have a native Word document without affecting other projects or versions',()=>{
  for(const [fileId,sourceVersion] of [['RFQ-001-DEMO-FILE-BIZ-2','V1.1'],['RFQ-001-DEMO-FILE-TECH-3','V2.0'],['RFQ-001-DEMO-FILE-RESPONSE-MATRIX','V1.0']]){
    const source={projectId:'RFQ-001',fileId,sourceVersion};
    assert.match(craftDemoAsset(source)||'',/^\/craft-demo\/.+\.docx$/);
    assert.equal(craftDemoAsset({...source,projectId:'OTHER'}),null);
    assert.equal(craftDemoAsset({...source,sourceVersion:'V999'}),null);
  }
});

test('Craft upload preserves original and imported review as separate binaries',async()=>{
  const previous=globalThis.fetch;
  try{
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'/api/craft/documents');
      assert.equal(await options.body.get('file').text(),'original');
      assert.equal(await options.body.get('review').text(),'with comments');
      assert.equal(options.body.get('sourceVersion'),'V1');
      return response({...ref,revision:1});
    };
    const result=await uploadCraftFile(new File(['original'],'customer.docx'),source,{review:new File(['with comments'],'customer.docx')});
    assert.equal(result.access,'secret');
  }finally{globalThis.fetch=previous;}
});

test('Craft binary saves carry capability and expected revision; conflicts remain actionable',async()=>{
  const previous=globalThis.fetch;
  try{
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'/api/craft/documents/document/review');
      assert.equal(options.method,'PUT');
      assert.equal(options.headers.get('X-Craft-Access'),'secret');
      assert.equal(options.headers.get('If-Match'),'"3"');
      assert.equal(await new Blob([options.body]).text(),'native file bytes');
      return new Response(JSON.stringify({code:409,msg:'文件已有更新'}),{status:409});
    };
    await assert.rejects(saveCraftReview(ref,new TextEncoder().encode('native file bytes'),3),error=>error.status===409&&/已有更新/.test(error.message));
  }finally{globalThis.fetch=previous;}
});

test('Craft binary reads and network cancellation do not turn into misleading save success',async()=>{
  const previous=globalThis.fetch;
  try{
    globalThis.fetch=async()=>new Response('actual PDF');
    assert.equal(await (await craftRequest('/documents/document/download',ref,{binary:true})).text(),'actual PDF');
    const abort=new DOMException('cancelled','AbortError');globalThis.fetch=async()=>{throw abort;};
    await assert.rejects(craftRequest('/documents/document',ref),error=>error===abort);
  }finally{globalThis.fetch=previous;}
});

test('legacy import reads both old versions and never overwrites the old reference',async()=>{
  const previous=globalThis.fetch,calls=[];const old={id:'old',access:'legacy-cap',name:'old.docx'};
  try{
    globalThis.fetch=async(url,options)=>{
      calls.push(url);
      if(url==='/api/office/documents/old')return response({...source,id:'old',name:'old.docx',fileType:'docx'});
      if(url.includes('kind=original'))return new Response('old original');
      if(url.includes('kind=review'))return new Response('old reviewed');
      assert.equal(await options.body.get('file').text(),'old original');
      assert.equal(await options.body.get('review').text(),'old reviewed');
      return response({...ref,revision:1});
    };
    const result=await importOfficeReview(old,source);
    assert.equal(result.id,'document');assert.equal(old.id,'old');
    assert.deepEqual(calls,['/api/office/documents/old','/api/office/documents/old/download?kind=original','/api/office/documents/old/download?kind=review','/api/craft/documents']);
    globalThis.fetch=async()=>response({...source,projectId:'OTHER'});
    await assert.rejects(importOfficeReview(old,source),/来源/);
  }finally{globalThis.fetch=previous;}
});

test('queued native saves use the latest acknowledged revision and keep later edits dirty',async()=>{
  let generation=1,release;const calls=[],confirmed=[];
  const queue=createCraftSaveQueue({reference:ref,revision:2,getGeneration:()=>generation,
    persist:async(_ref,bytes,revision)=>{calls.push([bytes,revision]);if(calls.length===1)await new Promise(resolve=>release=resolve);return {revision:revision+1};},
    onSaved:(meta,details)=>confirmed.push([meta.revision,details.clean])});
  const first=queue.enqueue('first',1);
  await Promise.resolve();generation=2;
  const second=queue.enqueue('second',2);release();await first;await second;
  assert.deepEqual(calls,[['first',2],['second',3]]);
  assert.deepEqual(confirmed,[[3,false],[4,true]]);
});

test('a rejected save neither advances revision nor blocks a later retry',async()=>{
  let fail=true;const revisions=[];
  const queue=createCraftSaveQueue({reference:ref,revision:5,getGeneration:()=>1,
    persist:async(_ref,_bytes,revision)=>{revisions.push(revision);if(fail)throw new Error('offline');return {revision:6};}});
  await assert.rejects(queue.enqueue('bytes',1),/offline/);fail=false;
  await queue.enqueue('retry',1);assert.deepEqual(revisions,[5,5]);
});
