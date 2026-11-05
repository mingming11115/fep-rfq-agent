import test from 'node:test';
import assert from 'node:assert/strict';
import {loadDatabaseOriginal} from './databaseSource.js';

test('original workbench loads the authorized real database original',async()=>{
 const calls=[];
 const file=await loadDatabaseOriginal({backendDocumentId:'DOC-1',name:'客户要求.docx'},{session:{token:'session'},fetcher:async(url,options)=>{calls.push({url,options});return new Response('original');}});
 assert.equal(file.name,'客户要求.docx');assert.equal(await file.text(),'original');
 assert.equal(calls[0].url,'/api/rfq/documents/DOC-1/download');assert.equal(calls[0].options.headers.Authorization,'Bearer session');
});
test('forbidden originals do not fall back to a demo file',async()=>{
 await assert.rejects(loadDatabaseOriginal({backendDocumentId:'D',name:'客户要求.docx'},{session:{token:'session'},fetcher:async()=>new Response(JSON.stringify({msg:'无项目权限'}),{status:403})}),/无项目权限/);
});
