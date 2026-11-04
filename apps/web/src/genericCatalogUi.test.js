import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Window} from 'happy-dom';
import React,{act} from 'react';
test('generic catalog renders BU directory, configuration dialog and field editor',async()=>{
 const window=new Window({url:'http://localhost'});Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage,getComputedStyle:window.getComputedStyle.bind(window),SVGElement:window.SVGElement,Element:window.Element,HTMLElement:window.HTMLElement,ShadowRoot:window.ShadowRoot,IS_REACT_ACT_ENVIRONMENT:true});
 const output=fileURLToPath(new URL('../node_modules/.cache/generic-catalog-ui.mjs',import.meta.url));await mkdir(fileURLToPath(new URL('../node_modules/.cache/',import.meta.url)),{recursive:true});
 await build({entryPoints:[fileURLToPath(new URL('./pages/GenericCatalog.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic'});
 const {default:Page}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const context={actorId:'admin',buId:'A',state:{actorRole:'BU管理员',accountsById:{admin:{id:'admin',enabled:true,managedBuIds:['A']}},businessUnits:[{id:'A'}],buPersonnelByBuId:{A:[]}}};
 try{await act(async()=>root.render(React.createElement(Page,{context,legacyCatalog:{models:[{id:'M',buId:'A',name:'设备'}],processes:[]},capabilities:[],onLegacy:()=>{}})));
 assert.match(host.textContent,/设备/);const button=[...host.querySelectorAll('button')].find(b=>b.textContent.includes('配置名称与字段'));assert.equal(button.disabled,false);await act(async()=>button.click());assert.ok(document.querySelector('[aria-label="配置名称"]'));assert.ok(document.querySelector('[aria-label="字段类型"]'));assert.match(document.body.textContent,/添加字段/);

 await act(async()=>{document.querySelector('.ant-modal-close')?.click();});
 localStorage.setItem('rfq.reference.models.v1:A',JSON.stringify([{id:'M',buId:'A',name:'设备',code:'M',revision:'R1',config:'标准',version:1}]));
 const integrated=output.replace('.mjs','-integrated.mjs');await build({entryPoints:[fileURLToPath(new URL('./pages/ReferencePages.jsx',import.meta.url))],outfile:integrated,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
 const {CapabilitiesPage}=await import(pathToFileURL(integrated));
 await act(async()=>root.render(React.createElement(CapabilitiesPage,{permissionContext:context,appState:context.state,actorId:'admin',actorRole:'BU管理员',route:{},toast:()=>{}})));
 assert.ok(host.querySelector('.generic-catalog-page'));assert.ok(![...host.querySelectorAll('button')].some(b=>b.textContent==='能力资料与审批'));
 const treeNode=[...host.querySelectorAll('.ant-tree-node-content-wrapper')].find(e=>e.textContent.includes('设备'));assert.ok(treeNode);await act(async()=>treeNode.click());
 const create=[...host.querySelectorAll('button')].find(b=>b.textContent==='新建能力');assert.ok(create);await act(async()=>create.click());
 assert.ok(host.querySelector('.generic-catalog-page'),'editing keeps the same group page mounted');assert.ok(document.querySelector('[role="dialog"]'),'capability editor opens in a dialog');
 }finally{await act(async()=>root.unmount());await window.happyDOM.close();}
});
