import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Window} from 'happy-dom';
import React,{act} from 'react';
import {createDemoState} from './data.js';
test('BU member pagination preserves member actions and knowledge tabs navigate by page key',async()=>{
 const window=new Window({url:'http://localhost'});Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage,Document:window.Document,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true});
 const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});const output=directory+'admin-management-ui.mjs';
 await build({stdin:{contents:"export {default as Bu} from './pages/BuAdminPage.jsx';export {default as Workspace} from './components/AdminWorkspace.jsx';",resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'jsx'},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
 const {Bu,Workspace}=await import(pathToFileURL(output)),{createRoot}=await import('react-dom/client');const state={...createDemoState(),actorId:'demo-bu-admin',actorRole:'BU管理员',activeBuId:'BU-DEMO'};
 state.buPersonnelByBuId['BU-DEMO']=Array.from({length:14},(_,i)=>{const id=`member-${i}`;state.accountsById[id]={id,name:`成员${i}`,enabled:true};return {userId:id,roles:['技术'],enabled:true,canConfirm:true,canFinalReview:false,resourceQualifications:[]};});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const settle=()=>new Promise(r=>setTimeout(r,30));
 try{
 await act(async()=>{root.render(React.createElement(Bu,{appState:state,actorId:state.actorId,onPersonnelAction:()=>true}));await settle();});
 assert.equal(host.querySelectorAll('tbody tr[data-row-key]').length,10);const next=host.querySelector('.ant-pagination-next button');assert.ok(next);await act(async()=>{next.click();await settle();});assert.equal(host.querySelectorAll('tbody tr[data-row-key]').length,4);assert.match(host.textContent,/成员13/);
 const actions=[...host.querySelectorAll('button')].filter(b=>b.textContent.includes('配置范围'));assert.equal(actions.length,4);
 const routes=[];await act(async()=>{root.render(React.createElement(Workspace,{page:'knowledge',actorRole:'BU管理员',permissionContext:{state,actorId:state.actorId,buId:'BU-DEMO'},onNavigate:key=>routes.push(key)},React.createElement('p',null,'保留页面内容')));await settle();});
 const group=[...host.querySelectorAll('[role="tab"]')].find(e=>e.textContent.includes('分组与能力配置'));assert.ok(group);await act(async()=>group.click());assert.deepEqual(routes,['capabilities']);assert.match(host.textContent,/保留页面内容/);
 }finally{await act(async()=>root.unmount());window.happyDOM.abort();}
});
