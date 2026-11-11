import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Window} from 'happy-dom';
import React,{act} from 'react';
import {loadLibraryResources} from './knowledgeLibraryClient.js';

async function setupHistoryPage(){
 const w=new Window({url:'http://localhost:5173',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 const channel=globalThis.MessageChannel;globalThis.MessageChannel=undefined;
 Object.assign(globalThis,{window:w,document:w.document,localStorage:w.localStorage,CustomEvent:w.CustomEvent,Node:w.Node,Element:w.Element,HTMLElement:w.HTMLElement,HTMLBodyElement:w.HTMLBodyElement,HTMLHtmlElement:w.HTMLHtmlElement,HTMLInputElement:w.HTMLInputElement,HTMLTextAreaElement:w.HTMLTextAreaElement,SVGElement:w.SVGElement,ShadowRoot:w.ShadowRoot,requestAnimationFrame:w.requestAnimationFrame.bind(w),cancelAnimationFrame:w.cancelAnimationFrame.bind(w),getComputedStyle:w.getComputedStyle.bind(w),ResizeObserver:w.ResizeObserver,IS_REACT_ACT_ENVIRONMENT:true});
 const dir=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(dir,{recursive:true});
 const out=dir+'history-ui-test.mjs';await build({entryPoints:[fileURLToPath(new URL('./pages/HistoryKnowledgePage.jsx',import.meta.url))],outfile:out,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
 const {default:Page}=await import(pathToFileURL(out)),{createRoot}=await import('react-dom/client');
 const state={accountsById:{sr:{enabled:true},bu:{enabled:true,managedBuIds:['A']}},businessUnits:[{id:'A'}],projects:[],buPersonnelByBuId:{A:[{userId:'sr',roles:['SR'],enabled:true},{userId:'bu',roles:[],enabled:true,resourceQualifications:['knowledge-publish']}]}};
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const settle=async()=>{for(let n=0;n<5;n++)await new Promise(resolve=>setTimeout(resolve,0));};
 const click=async(text,scope=document)=>act(async()=>{const button=[...scope.querySelectorAll('button')].find(node=>node.textContent.replaceAll(' ','')===text.replaceAll(' ',''));assert.ok(button,text);assert.equal(button.disabled,false,text);button.click();await settle();});
 const render=async(id,role,props={})=>act(async()=>{root.render(React.createElement(Page,{actorId:id,actorRole:role,permissionContext:{state,actorId:id,buId:'A'},...props}));await settle();});
 const cleanup=async()=>{await act(async()=>root.unmount());await w.happyDOM.cancelAsync();globalThis.MessageChannel=channel;};
 return {w,host,state,settle,click,render,cleanup};
}

test('history document UI separates metadata, repairs missing answers and enforces independent approval',async()=>{
 const {w,host,state,settle,click,render,cleanup}=await setupHistoryPage();
 localStorage.setItem('rfq.history.documents.v1:A',JSON.stringify([{id:'D1',buId:'A',name:'客户历史RFQ.docx',version:'V1',metadata:{customer:'客户A',model:'机型A',config:'配置A',date:'2026-10-01'},scope:'FEP 授权项目',parseStatus:'partial',sources:[{name:'客户历史RFQ.docx',prefix:'main:',blocks:[{type:'paragraph',anchor:'body/1',text:'3.2 要求支持自动上料'}]}],issues:['main:body/2：未归入条款']}]));
 localStorage.setItem('rfq.reference.knowledge.v1:A',JSON.stringify([{id:'K1',buId:'A',type:'history',documentId:'D1',version:1,sourceKey:'main:body/1',clauseNo:'3.2',title:'自动上料',originalText:'3.2 要求支持自动上料',requirementText:'要求支持自动上料',metricsJson:'{"specification":"300 mm"}',requirement:'要求支持自动上料',answer:'',conditions:'',requirementAnchor:'main:body/1',status:'草稿',scope:'FEP 授权项目',issues:['缺少历史答复'],submitterId:'sr'}]));
 const type=async(label,value)=>act(async()=>{const input=document.querySelector(`textarea[aria-label="${label}"]`);assert.ok(input);Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}));await settle();});
 const openMatchingClause=async(query,docName)=>{
  await act(async()=>{
   const input=host.querySelector('input[aria-label="搜索历史文档和条款"]');
   assert.ok(input);
   Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,query);
   input.dispatchEvent(new w.Event('input',{bubbles:true}));
   await settle();
  });
  await click(docName);
 };
 try{
  await render('sr','SR');assert.match(host.textContent,/客户历史RFQ/);
  assert.doesNotMatch(host.textContent,/机型A/);
  const documentActions=host.querySelector('.history-document-panel tbody tr td:last-child');
  assert.deepEqual([...documentActions.querySelectorAll('button')].map(button=>button.textContent.trim()),['删除文档']);
  await click('客户历史RFQ.docx');
  assert.match(host.textContent,/客户A/);assert.match(host.textContent,/未识别到答复/);
  assert.doesNotMatch(host.textContent,/处原文需要人工核对|适用机型|项目日期|默认配置/);
  await click('编辑文档信息');
  for(const label of ['适用机型','项目日期','默认配置']) {
   assert.equal(document.querySelector(`[aria-label="${label}"]`),null);
  }
  assert.ok(document.querySelector('[aria-label="客户"]'));
  await click('保存文档信息');
  assert.equal(JSON.parse(localStorage.getItem('rfq.history.documents.v1:A'))[0].metadata.model,'机型A');
  assert.deepEqual([...new Set([...host.querySelectorAll('.history-clause-panel th')].map(node=>node.textContent.trim()).filter(Boolean))],
   ['客户要求','历史答复','向量库状态','操作']);
  assert.match(host.querySelector('.history-clause-panel tbody').textContent,/未写入/);
  const clauseActions=host.querySelector('.history-clause-panel tbody tr td:last-child');
  assert.deepEqual([...clauseActions.querySelectorAll('button')].map(button=>button.textContent.trim()),['查看','删除']);
  await click('查看');
  assert.equal(document.querySelector('.history-source-selected')?.id,'history-source-main:body/1');
  assert.equal(document.querySelector('textarea[aria-label="客户要求"]'),null);
  await click('关闭原文');
  await click('返回文档列表');
  await openMatchingClause('要求支持自动上料','客户历史RFQ.docx');
  assert.ok(document.querySelector('[aria-label="客户要求"]'));assert.equal(document.querySelector('[aria-label="应答结论"]'),null);
  assert.equal(document.querySelector('[aria-label="条款标题"]').value,'自动上料');
  assert.equal(document.querySelector('[aria-label="客户要求原文"]').value,'3.2 要求支持自动上料');
  assert.equal(document.querySelector('[aria-label="规格"]').value,'300 mm');
  await type('客户要求','要求支持自动上料和对准');
  await act(async()=>{const input=document.querySelector('textarea[aria-label="历史答复"]');Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(input,'需配置上料模块 S');input.dispatchEvent(new w.Event('input',{bubbles:true}));await settle();});
  await click('保存草稿');
  const savedDraft=JSON.parse(localStorage.getItem('rfq.reference.knowledge.v1:A'))[0];
  assert.equal(savedDraft.answer,'需配置上料模块 S');
  assert.equal(savedDraft.requirementText,'要求支持自动上料和对准');
  assert.equal(savedDraft.originalText,'3.2 要求支持自动上料');
  await act(async()=>{const checkbox=host.querySelector('tbody input[type="checkbox"]');assert.ok(checkbox);checkbox.click();await settle();});await click('提交审核');
  assert.equal(JSON.parse(localStorage.getItem('rfq.reference.knowledge.v1:A'))[0].status,'待审核');
  await render('bu','BU管理员');await click('客户历史RFQ.docx');await act(async()=>{host.querySelector('tbody input[type="checkbox"]').click();await settle();});await click('批准发布');
  assert.equal(JSON.parse(localStorage.getItem('rfq.reference.knowledge.v1:A'))[0].status,'已发布');
  await click('返回文档列表');await openMatchingClause('要求支持自动上料','客户历史RFQ.docx');await render('sr','SR');
  assert.equal(document.querySelector('textarea[aria-label="客户要求"]'),null,'identity changes close an existing editor without relying on a React key');
  await openMatchingClause('要求支持自动上料','客户历史RFQ.docx');
  const restricted=JSON.parse(localStorage.getItem('rfq.history.documents.v1:A'));restricted[0].scope='仅当前项目';restricted[0].projectId='P1';
  localStorage.setItem('rfq.history.documents.v1:A',JSON.stringify(restricted));
  // Another tab can narrow the parent scope before this tab receives its storage event.
  await click('修订新版本');await click('保存草稿');
  assert.equal(JSON.parse(localStorage.getItem('rfq.history.documents.v1:A'))[0].scope,'仅当前项目');
  assert.equal(JSON.parse(localStorage.getItem('rfq.reference.knowledge.v1:A')).length,1,'a stale editor cannot publish a restricted clause into a new shared document');
  await act(async()=>{window.dispatchEvent(new w.CustomEvent('rfq-history-change'));await settle();});
  assert.equal(document.querySelector('textarea[aria-label="客户要求"]'),null);
  state.projects=[{id:'P1',name:'项目一',buId:'A',participantIds:['sr']}];
  localStorage.setItem('rfq.history.documents.v1:A','[]');
  localStorage.setItem('rfq.reference.knowledge.v1:A',JSON.stringify([{id:'OLD',buId:'A',type:'history',version:1,status:'草稿',scope:'仅当前项目',projectId:'P1',source:'历史项目原来源',requirement:'原要求',answer:'原答复'}]));
  await render('sr','SR');await act(async()=>{window.dispatchEvent(new w.CustomEvent('rfq-history-change'));await settle();});
  await openMatchingClause('原要求','历史项目原来源');await click('保存草稿');
  let saved=JSON.parse(localStorage.getItem('rfq.reference.knowledge.v1:A'));
  assert.equal(saved[0].scope,'仅当前项目');assert.equal(saved[0].source,'历史项目原来源');
  assert.equal(JSON.parse(localStorage.getItem('rfq.history.documents.v1:A'))[0].buId,'A');
  await click('补录条款');await type('客户要求','新增补录要求');await type('历史答复','补录原答复');await click('保存草稿');
  saved=JSON.parse(localStorage.getItem('rfq.reference.knowledge.v1:A'));assert.equal(saved.length,2);
  assert.equal(saved[1].documentId,saved[0].documentId);assert.match(host.textContent,/新增补录要求/);
  await click('编辑文档信息');
  assert.equal(document.querySelector('[aria-label="可见范围"]'),null);
  await click('保存文档信息');
  const versionDocs=JSON.parse(localStorage.getItem('rfq.history.documents.v1:A')),first=versionDocs[0];
  assert.equal(first.scope,'仅当前项目');
  assert.equal(first.projectId,'P1');
  versionDocs.push({...first,id:'D2',familyId:first.id,previousDocumentId:first.id,revision:2,version:'V2',name:'修订版.docx',parseStatus:'complete'});
  saved.push({...saved[0],id:'K2',documentId:'D2',requirement:'原要求提高到180℃',answer:'待重新核实'});
  localStorage.setItem('rfq.history.documents.v1:A',JSON.stringify(versionDocs));localStorage.setItem('rfq.reference.knowledge.v1:A',JSON.stringify(saved));
  await act(async()=>{window.dispatchEvent(new w.CustomEvent('rfq-history-change'));await settle();});
  await click('版本比对');assert.ok(document.querySelector('[aria-label="比对基准版"]'));assert.match(document.body.textContent,/新增条款/);assert.match(document.body.textContent,/需确认答复/);
  await act(async()=>{document.querySelector('.ant-modal-close').click();await settle();});
  await click('上传历史RFQ');assert.ok(document.querySelector('[aria-label="上传方式"]'));assert.ok(document.querySelector('[aria-label="关联历史 RFQ"]'));assert.ok(document.querySelector('[aria-label="客户版本标识"]'));
  const uploadDialog=document.querySelector('[aria-label="历史 RFQ 文件"]').closest('[role="dialog"]');
  assert.doesNotMatch(uploadDialog.textContent,/可见范围|配套答复文件/);
 }finally{await cleanup();}
});

test('switching history statistics filters reloads the BU resources and shows updated counts and clauses',async t=>{
 const {host,state,click,render,cleanup}=await setupHistoryPage();
 t.after(cleanup);
 const clause={id:'K1',type:'history',documentId:'D1',buId:'A',version:1,revision:0,status:'待审核',
  requirement:'要求支持自动上料',answer:'需配置上料模块 S'};
 const resources={historyDocuments:[{id:'D1',buId:'A',name:'历史RFQ.docx',parseStatus:'complete'}],historyClauses:[clause]};
 Object.assign(state,{dataSource:'mysql',resourcesByBuId:{A:resources}});
 const resourcePath='/api/rfq/business-units/A/resources';
 const requests=[];
 let serverClauses=[{...clause,status:'已发布',revision:1}];
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(path,request)=>{
  requests.push([path,request.method||'GET']);
  return new Response(JSON.stringify({code:0,data:{...resources,historyClauses:serverClauses}}));
 };
 t.after(()=>{globalThis.fetch=originalFetch;});
 const props={onLibraryRefresh:async buId=>{state.resourcesByBuId[buId]=await loadLibraryResources(buId);}};
 await render('bu','BU管理员',props);
 await click('历史RFQ.docx',host);
 const counts=host.querySelector('.history-counts');
 assert.deepEqual([...counts.querySelectorAll('button')].map(button=>button.textContent),
  ['全部条款1','缺少答复0','待审核1','已发布0']);
 await click('已发布0',counts);
 assert.deepEqual(requests,[[resourcePath,'GET']]);
 await render('bu','BU管理员',props);
 assert.equal(counts.querySelector('.active').textContent,'已发布1');
 assert.match(host.querySelector('.history-clause-panel tbody').textContent,/要求支持自动上料/);
 serverClauses=[];
 await click('全部条款1',counts);
 assert.deepEqual(requests,[[resourcePath,'GET'],[resourcePath,'GET']]);
 await render('bu','BU管理员',props);
 assert.equal(counts.querySelector('.active').textContent,'全部条款0');
 assert.doesNotMatch(host.querySelector('.history-clause-panel tbody').textContent,/要求支持自动上料/);
});

test('a published history clause can be revoked with the reason left empty',async t=>{
 const {host,state,settle,click,render,cleanup}=await setupHistoryPage();
 t.after(cleanup);
 const clause={id:'K1',type:'history',documentId:'D1',buId:'A',version:1,revision:2,status:'已发布',validity:'有效',
  requirement:'要求支持自动上料',answer:'需配置上料模块 S'};
 const resources={historyDocuments:[{id:'D1',buId:'A',name:'历史RFQ.docx',parseStatus:'complete'}],historyClauses:[clause]};
 Object.assign(state,{dataSource:'mysql',resourcesByBuId:{A:resources}});
 localStorage.setItem('fep-rfq-auth',JSON.stringify({token:'test-token',user:{id:'bu'}}));
 let revokeRequest;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(path,request)=>{
  assert.equal(path,'/api/rfq/business-units/A/history-rfq/clauses/K1/versions/1/revoke');
  revokeRequest=JSON.parse(request.body);
  const updated={...clause,status:'已撤销',validity:'已撤销',revision:3};
  return new Response(JSON.stringify({code:0,data:updated}),{status:200});
 };
 t.after(()=>{globalThis.fetch=originalFetch;});
 await render('bu','BU管理员');
 await click('历史RFQ.docx',host);
 await act(async()=>{host.querySelector('tbody input[type="checkbox"]').click();await settle();});
 await click('撤销发布',host);
 const reason=document.querySelector('textarea[aria-label="撤销原因"]');
 assert.equal(reason.value,'');
 await click('确认',reason.closest('[role="dialog"]'));
 assert.deepEqual(revokeRequest,{revision:2,reason:''});
});
