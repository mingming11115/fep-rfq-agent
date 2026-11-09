import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Window} from 'happy-dom';
import React,{act} from 'react';
import {createDemoState} from './data.js';
test('knowledge group tree filters shared replies and ungrouped records, and RFQ form has one required group choice',async()=>{
 const window=new Window({url:'http://localhost'}),originalChannel=globalThis.MessageChannel;globalThis.MessageChannel=undefined;
 Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage,sessionStorage:window.sessionStorage,Document:window.Document,Element:window.Element,HTMLElement:window.HTMLElement,HTMLBodyElement:window.HTMLBodyElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true});
 const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});const output=directory+'knowledge-group-ui.mjs';
 await build({stdin:{contents:"export {default as Workspace} from './components/AdminWorkspace';export {KnowledgePage} from './pages/ReferencePages';export {default as CreateRfq} from './components/CreateRfqDialog';",resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'jsx'},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
 const {Workspace,KnowledgePage,CreateRfq}=await import(pathToFileURL(output)),{createRoot}=await import('react-dom/client');
 const state={...createDemoState(),actorId:'demo-bu-admin',actorRole:'BU管理员',activeBuId:'BU-DEMO'},context={state,actorId:state.actorId,buId:'BU-DEMO'};
 const c={buId:'BU-DEMO',version:1,schema:{title:'Group',levels:[{id:'g',name:'Group',fields:[]}]},nodes:[{id:'G1',levelId:'g',name:'一组'},{id:'G2',levelId:'g',name:'二组'}],attachments:[]};localStorage.setItem('rfq.generic.catalog.v1:BU-DEMO',JSON.stringify(c));
 const rows=[['R1','仅一组',['G1']],['R2','仅二组',['G2']],['RS','共享回复',['G1','G2']],['RO','旧回复',[]]].map(([id,title,groupIds])=>({id,title,groupIds,type:'standard',buId:'BU-DEMO',version:1,requirement:'要求',answer:'答复',conditions:'条件',status:'草稿',source:'标准依据',sourceType:'enterprise-standard',sourceStandardText:'标准依据',scope:'FEP 授权项目',history:[]}));localStorage.setItem('rfq.reference.knowledge.v1',JSON.stringify(rows));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const props={permissionContext:context,appState:state,actorId:state.actorId,actorRole:state.actorRole,navigate:()=>{},toast:()=>{}};const settle=()=>new Promise(r=>setTimeout(r,20));
 const choose=async name=>{const node=[...host.querySelectorAll('.knowledge-group-directory .ant-tree-node-content-wrapper')].find(n=>n.textContent===name);assert.ok(node);await act(async()=>{node.click();await settle();});};
 try{
 await act(async()=>{root.render(React.createElement(Workspace,{page:'knowledge',actorRole:state.actorRole,permissionContext:context,onNavigate:()=>{}},React.createElement(KnowledgePage,props)));await settle();});
 const list=()=>host.querySelector('.ref-knowledge-list').textContent;assert.match(list(),/仅一组/);assert.match(list(),/共享回复/);assert.doesNotMatch(list(),/仅二组|旧回复/);
 await choose('二组');assert.match(list(),/仅二组/);assert.match(list(),/共享回复/);assert.doesNotMatch(list(),/仅一组/);
 await choose('未分组');assert.match(list(),/旧回复/);assert.doesNotMatch(list(),/共享回复/);
 await choose('一组');const edit=[...host.querySelectorAll('button')].find(b=>b.textContent==='编辑草稿');assert.ok(edit);await act(async()=>edit.click());
 const fresh=JSON.parse(localStorage.getItem('rfq.reference.knowledge.v1'));localStorage.setItem('rfq.reference.knowledge.v1',JSON.stringify([...fresh,{id:'BACKGROUND',type:'history',version:1,buId:'BU-DEMO',requirement:'后台完成的解析',documentId:'HD-background',scope:'FEP 授权项目',status:'草稿'}]));
 const save=[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==='保存草稿');assert.ok(save);await act(async()=>{save.click();await settle();});assert.ok(JSON.parse(localStorage.getItem('rfq.reference.knowledge.v1')).some(r=>r.id==='BACKGROUND'),'saving a reply must preserve background history parsing');
 const add=[...host.querySelectorAll('button')].find(b=>b.textContent.includes('新增标准回复'));await act(async()=>add.click());assert.match(document.querySelector('.knowledge-group-picker').textContent,/一组/);
 await act(async()=>{root.render(React.createElement(CreateRfq,{appState:{...state,actorRole:'SR',actorId:'demo-sales'},onClose:()=>{},onCreateProject:()=>{throw Error('must not create without a group');}}));await settle();});
 assert.ok(document.querySelector('[aria-label="关联分组"]'));assert.doesNotMatch(document.body.textContent,/原机型与工艺|关联目录/);assert.ok(document.querySelector('[for$="groupId"]')?.closest('.ant-form-item')?.classList.contains('ant-form-item'));assert.ok(document.querySelector('.ant-form-item-required[for$="groupId"]'));
 const databaseState={...state,dataSource:'mysql',actorRole:'SR',actorId:'demo-sales',
  resourcesByBuId:{'BU-DEMO':{catalog:{...c,nodes:[
   {id:'DB-G',levelId:'g',name:'数据库分组'},
   {id:'DB-OFF',levelId:'g',name:'已停用分组',enabled:false},
  ]}}}};
 await act(async()=>{root.render(React.createElement(CreateRfq,{key:'mysql',appState:databaseState,onClose:()=>{},onCreateProject:()=>{throw Error('must not create without a group');}}));await settle();});
 assert.ok(document.querySelector('.ant-form-item-required[for$="groupId"]'));
 const groupSelector=document.querySelector('[aria-label="关联分组"]').closest('.ant-select').querySelector('.ant-select-selector');
 await act(async()=>{groupSelector.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,cancelable:true}));await settle();});
 const groupOptions=document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')?.textContent||'';
 assert.match(groupOptions,/数据库分组/);
 assert.doesNotMatch(groupOptions,/一组|二组|已停用分组/);
 const emptyBu={...state,dataSource:'mysql',resourcesByBuId:{'BU-DEMO':{catalog:null}}};
 await act(async()=>{root.render(React.createElement(Workspace,{page:'knowledge',actorRole:emptyBu.actorRole,
  permissionContext:{...context,state:emptyBu},onNavigate:()=>{}}));await settle();});
 const createGroup=[...host.querySelectorAll('.knowledge-group-directory button')].find(b=>b.textContent==='新建');
 assert.ok(createGroup&&!createGroup.disabled,'BU 管理员可以为尚无分组的 MySQL BU 新建分组');
 }finally{await act(async()=>root.unmount());await window.happyDOM.close();globalThis.MessageChannel=originalChannel;}
});
