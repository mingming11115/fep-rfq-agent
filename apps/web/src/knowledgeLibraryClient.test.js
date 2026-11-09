import test from 'node:test';
import assert from 'node:assert/strict';
import {createKnowledgeLibraryClient} from './knowledgeLibraryClient.js';

test('knowledge mutations use the selected BU, version and server revision', async () => {
  const calls = [];
  const capture = method => async (...args) => { calls.push([method, ...args]); };
  const library = createKnowledgeLibraryClient('BU/A', {patch:capture('patch'), post:capture('post')});
  const draft = {id:'R/1',version:2,revision:0,title:'回复',requirement:'要求',answer:'答复',conditions:'条件'};
  await library.saveReply(draft);
  await library.transition('history', draft, 'publish', '确认来源');
  assert.deepEqual(calls, [
    ['patch','/business-units/BU%2FA/standard-replies/R%2F1/versions/2',{revision:0,title:'回复',requirement:'要求',answer:'答复',conditions:'条件'}],
    ['post','/business-units/BU%2FA/history-rfq/clauses/R%2F1/versions/2/publish',{revision:0,reason:'确认来源'}],
  ]);
});

test('history import sends both original files and exactly one visibility scope', async () => {
  const calls = [];
  const library = createKnowledgeLibraryClient('BU', {upload:async (...args)=>calls.push(args)});
  const file = new Blob(['source']), responseFile = new Blob(['answer']);
  await library.importHistory({file,responseFile,projectId:'P'});
  await library.importHistory({file,shareWithBu:true});
  assert.equal(calls[0][0], '/business-units/BU/history-rfq/import');
  assert.deepEqual([...calls[0][1].keys()], ['file','responseFile','projectId']);
  assert.equal(await calls[0][1].get('responseFile').text(), 'answer');
  assert.equal(calls[1][1].get('shareWithBu'), 'true');
  assert.throws(()=>library.importHistory({file,shareWithBu:true,projectId:'P'}),/范围/);
});

test('capability draft sends exact decimal bounds and pinned evidence versions', async () => {
  const library = createKnowledgeLibraryClient('BU', {post:async (path,body)=>({path,body})});
  const {path,body} = await library.saveCapability({
    modelId:'M',modelVersion:3,processId:'P',processVersion:2,metricCode:'alignment',operator:'RANGE',
    lower:'0.000000000001',upper:'1.000000000001',lowerInclusive:false,upperInclusive:true,
    evidenceRefs:[{id:'E',version:4,location:'第 5 页'}],
  });
  assert.equal(path,'/business-units/BU/capability-library/capabilities');
  assert.equal(body.lower,'0.000000000001');
  assert.equal(body.lowerInclusive,false);
  assert.deepEqual(body.evidence,[{id:'E',version:4,location:'第 5 页'}]);
});
