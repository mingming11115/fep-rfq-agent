import test from 'node:test';
import assert from 'node:assert/strict';
import { supportsOffice, officeRequest, uploadOfficeFile, saveReached, officeSourceKey } from './officeClient.js';

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
