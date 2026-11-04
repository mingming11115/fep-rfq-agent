import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {historyJobRunning,readHistorySnapshot,retryHistoryParse,startHistoryUpload} from './historyClient.js';

const actor={id:'sr',name:'王工',role:'SR',canEdit:true};
const parsed={metadata:{customer:'客户A'},clauses:[{key:'main:body/0',clauseNo:'1',requirement:'支持上料',answer:'配置模块 S',issues:[]}],sources:[],issues:[]};
function env(){const w=new Window();Object.assign(globalThis,{window:w,localStorage:w.localStorage,CustomEvent:w.CustomEvent});const originals=new Map();return {files:{put:async(bu,id,value)=>originals.set(bu+id,value),get:async(bu,id)=>originals.get(bu+id),delete:async(bu,id)=>originals.delete(bu+id)}};}
const settle=async(bu,id)=>{for(let i=0;i<100&&historyJobRunning(bu,id);i++)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(historyJobRunning(bu,id),false);};
test('new document versions preserve originals, inherit scope and retain explicit labels',async()=>{
 const {files}=env(),deps={files,parse:async()=>parsed};
 const first=(await startHistoryUpload({file:new File(['first'],'first.docx'),buId:'A',actor},deps)).document;
 await settle('A',first.id);
 const {writeHistorySnapshot}=await import('./historyClient.js');
 const snapshot=readHistorySnapshot('A');snapshot.documents[0].scope='仅当前项目';snapshot.documents[0].projectId='P';writeHistorySnapshot('A',snapshot);
 const next=(await startHistoryUpload({file:new File(['next'],'next.docx'),buId:'A',actor,previousDocumentId:first.id,versionLabel:'客户B版',changeNote:'温度变更'},deps)).document;
 await settle('A',next.id);
 assert.equal(next.previousDocumentId,first.id);assert.equal(next.familyId,first.id);assert.equal(next.revision,2);
 assert.equal(next.scope,'仅当前项目');assert.equal(next.projectId,'P');
 assert.equal(readHistorySnapshot('A').documents.find(d=>d.id===next.id).version,'客户B版');
 assert.ok(await files.get('A',first.id));assert.equal(readHistorySnapshot('A').documents.length,2);
 await assert.rejects(startHistoryUpload({file:new File(['third'],'third.docx'),buId:'A',actor,previousDocumentId:first.id,versionLabel:'客户B版'},deps),/版本/);
});
test('upload persists originals and document before parse completes; navigation does not cancel the job',async()=>{
 const {files}=env();let finish;
 const parse=()=>new Promise(resolve=>{finish=resolve;});
 const {document}=await startHistoryUpload({file:new File(['original'],'history.docx'),buId:'A',actor},{files,parse});
 assert.equal(readHistorySnapshot('A').documents[0].parseStatus,'parsing');
 assert.ok(await files.get('A',document.id));assert.equal(readHistorySnapshot('B').documents.length,0);
 finish(parsed);await settle('A',document.id);
 assert.equal(readHistorySnapshot('A').clauses[0].answer,'配置模块 S');
 assert.equal(readHistorySnapshot('A').documents[0].metadata.customer,'客户A');
});
test('failed parsing keeps original and retry can complete without reselecting a file',async()=>{
 const {files}=env();const {document}=await startHistoryUpload({file:new File(['original'],'history.docx'),buId:'A',actor},{files,parse:async()=>{throw new Error('服务暂不可用');}});
 await settle('A',document.id);assert.equal(readHistorySnapshot('A').documents[0].parseStatus,'failed');
 await retryHistoryParse(document,actor,{files,parse:async()=>parsed});
 assert.equal(readHistorySnapshot('A').clauses[0].answer,'配置模块 S');
 assert.equal(readHistorySnapshot('A').documents.length,1);
});
test('simultaneous duplicate uploads create a single document and restore an absent local original',async()=>{
 const {files}=env(),file=new File(['same'],'same.docx'),input={file,buId:'A',actor},deps={files,parse:async()=>parsed};
 const [one,two]=await Promise.all([startHistoryUpload(input,deps),startHistoryUpload(input,deps)]);
 await settle('A',one.document.id);
 assert.equal(one.document.id,two.document.id);assert.equal(readHistorySnapshot('A').documents.length,1);
 await files.delete('A',one.document.id);await startHistoryUpload(input,deps);
 assert.ok(await files.get('A',one.document.id));
});
test('concurrent revisions allocate distinct monotonic versions and preserve every source',async()=>{
 const {files}=env(),deps={files,parse:async()=>parsed};
 const first=(await startHistoryUpload({file:new File(['root'],'root.pdf'),buId:'A',actor},deps)).document;
 await settle('A',first.id);
 const versions=await Promise.all(['two','three'].map(value=>startHistoryUpload({file:new File([value],value+'.pdf'),buId:'A',actor,previousDocumentId:first.id},deps)));
 for(const result of versions)await settle('A',result.document.id);
 assert.deepEqual(versions.map(result=>result.document.revision),[2,3]);
 assert.equal(readHistorySnapshot('A').documents.length,3);
 for(const doc of readHistorySnapshot('A').documents)assert.ok(await files.get('A',doc.id));
 await assert.rejects(startHistoryUpload({file:new File(['unknown'],'bad.pdf'),buId:'A',actor,previousDocumentId:'missing'},deps),/不存在/);
});
