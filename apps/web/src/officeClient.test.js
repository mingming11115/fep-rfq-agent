import test from 'node:test';
import assert from 'node:assert/strict';
import { supportsOffice, officeRequest, uploadOfficeFile, saveReached, officeSourceKey, savedGeneration, demoOfficeAsset, loadDemoOffice, officeCanLeave } from './officeClient.js';

test('only actual DOCX and PDF are offered for native editing', () => {
  assert.equal(supportsOffice('RFQ.DOCX'), true);
  assert.equal(supportsOffice('rfq.pdf'), true);
  assert.equal(supportsOffice('rfq.doc'), false);
  assert.equal(supportsOffice('fake.pdf.exe'), false);
});
test('capabilities are sent as headers and API errors remain actionable', async () => {
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/office/documents/id');
      assert.equal(options.headers.get('X-Office-Access'), 'private-capability');
      return new Response(JSON.stringify({code:403,msg:'无权访问此文档'}), {status:403});
    };
    await assert.rejects(officeRequest('/documents/id', {id:'id',access:'private-capability'}), /无权访问此文档/);
  } finally { globalThis.fetch = saved; }
});
test('upload submits original binary, source context and returns a serializable reference', async () => {
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/office/documents');
      assert.equal(await options.body.get('file').text(), 'real original');
      assert.equal(options.body.get('projectId'), 'RFQ-001');
      assert.equal(options.body.get('sourceVersion'), 'V2');
      return new Response(JSON.stringify({code:0,data:{id:'stored',access:'cap',fileType:'docx'}}));
    };
    const ref = await uploadOfficeFile(new File(['real original'],'rfq.docx'),{projectId:'RFQ-001',fileId:'FILE1',sourceVersion:'V2'});
    assert.deepEqual(JSON.parse(JSON.stringify(ref)),{id:'stored',access:'cap',fileType:'docx'});
  } finally { globalThis.fetch = saved; }
});
test('save confirmation needs a later server timestamp or revision and never ignores an error', () => {
  const before = {revision:2,savedAt:'2026-10-30T01:00:00Z'};
  assert.equal(saveReached(before,{...before}),false);
  assert.equal(saveReached(before,{...before,revision:3}),true);
  assert.equal(saveReached(before,{...before,savedAt:'2026-10-30T01:01:00Z'}),true);
  assert.equal(saveReached(before,{...before,revision:3,lastError:'失败'}),false);
});
test('document mount identity changes only with file, source version and actual identity', () => {
  assert.notEqual(officeSourceKey({projectId:'P',fileId:'F',sourceVersion:'V1'},'actor'),officeSourceKey({projectId:'P',fileId:'F',sourceVersion:'V2'},'actor'));
  assert.equal(officeSourceKey({projectId:'P',fileId:'F',sourceVersion:'V1',requirementId:'A'},'actor'),officeSourceKey({projectId:'P',fileId:'F',sourceVersion:'V1',requirementId:'B'},'actor'));
});
test('same document clause navigation retains unsaved native edits without bypassing other-source protection',()=>{
  const previous=globalThis.window;let confirmations=0;const source={projectId:'P',fileId:'F',sourceVersion:'V1'};
  try{globalThis.window={__rfqOfficeUnsaved:{dirty:true,sourceKey:officeSourceKey(source)},confirm:()=>{confirmations++;return false;}};
    assert.equal(officeCanLeave(source),true);assert.equal(confirmations,0);
    assert.equal(officeCanLeave({...source,sourceVersion:'V2'}),false);assert.equal(confirmations,1);
    assert.equal(officeCanLeave(),false);assert.equal(confirmations,2);
  }finally{globalThis.window=previous;}
});
test('native save reconciliation waits for the edited generation to reach the document service', () => {
  const baseline={revision:1,savedAt:'first'},after={revision:2,savedAt:'second'};
  assert.equal(savedGeneration({baseline,generation:2,flushedGeneration:2},after),true);
  assert.equal(savedGeneration({baseline,generation:3,flushedGeneration:2},after),false);
  assert.equal(savedGeneration({baseline,generation:2,flushedGeneration:2},baseline),false);
  assert.equal(savedGeneration({baseline,generation:2,flushedGeneration:2},{...after,lastError:'save failed'}),false);
});

const demoSource={projectId:'RFQ-001',fileId:'RFQ-001-DEMO-FILE-CLAUSE-STATUSES',sourceVersion:'V1.0'};
test('the public RFQ demo resolves from project or task routes without a previous browser binding', () => {
  assert.equal(demoOfficeAsset(demoSource),'/onlyoffice-demo/RFQ-review-example.docx');
  assert.equal(demoOfficeAsset({...demoSource,requirementId:'RFQ-001-DOC-EXAMPLE-6',taskId:'task',action:'start'}),demoOfficeAsset(demoSource));
  assert.equal(demoOfficeAsset({...demoSource,projectId:'RFQ-002'}),null);
  assert.equal(demoOfficeAsset({...demoSource,sourceVersion:'V2.0'}),null);
  assert.equal(demoOfficeAsset({...demoSource,fileId:'private-customer-file'}),null);
});
test('a fresh browser uploads only the bundled public demo and receives a normal scoped document reference', async () => {
  const saved=globalThis.fetch;const calls=[];
  try{
    globalThis.fetch=async(url,options={})=>{
      calls.push(url);
      if(calls.length===1) { return new Response(new Blob(['public-demo-binary'])); }
      assert.equal(options.body.get('file').name,'RFQ批阅示例.docx');
      assert.equal(await options.body.get('file').text(),'public-demo-binary');
      assert.equal(options.body.get('fileId'),demoSource.fileId);
      assert.equal(options.body.get('sourceVersion'),'V1.0');
      return new Response(JSON.stringify({code:0,data:{id:'public-demo-copy',access:'local-capability'}}));
    };
    assert.deepEqual(await loadDemoOffice(demoSource),{id:'public-demo-copy',access:'local-capability',demoVersion:'clauses-v2'});
    assert.deepEqual(calls,['/onlyoffice-demo/RFQ-review-example.docx','/api/office/documents']);
  }finally{globalThis.fetch=saved;}
});
test('an unknown source cannot trigger a public demo upload', async () => {
  await assert.rejects(loadDemoOffice({...demoSource,fileId:'private-file'}),/没有内置示例/);
});
