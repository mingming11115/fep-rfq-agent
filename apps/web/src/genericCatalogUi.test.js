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
 assert.match(host.textContent,/设备/);const button=[...host.querySelectorAll('button')].find(b=>b.textContent.includes('配置名称、层级与字段'));assert.equal(button.disabled,false);await act(async()=>button.click());assert.ok(document.querySelector('[aria-label="配置名称"]'));assert.ok(document.querySelector('[aria-label="字段类型"]'));assert.match(document.body.textContent,/添加层级/);
 }finally{await act(async()=>root.unmount());window.happyDOM.abort();}
});
