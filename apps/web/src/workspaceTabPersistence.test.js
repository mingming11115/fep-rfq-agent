import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';
import {Window} from 'happy-dom';

async function harness(name){
 const window=new Window({url:'http://localhost',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 Object.assign(globalThis,{window,document:window.document,Node:window.Node,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,
  getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:window.ResizeObserver,requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
 const dir=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(dir,{recursive:true});const output=dir+`workspace-tabs-${name}.mjs`;
 await build({stdin:{contents:"export {default as Layout} from './components/RfqAppLayout';export {default as Project} from './components/ProjectWorkspace';export {BusinessTabs} from './components/AntContent';",resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'jsx'},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
 const components=await import(pathToFileURL(output)),{createRoot}=await import('react-dom/client');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setTimeout(r,0));};
 return {...components,host,root,render:async element=>act(async()=>{root.render(element);await settle();}),close:async()=>{await act(async()=>root.unmount());await window.happyDOM.close();}};
}

test('layout keeps the workspace tab node mounted when entering and leaving detail mode',async()=>{
 const h=await harness('layout');
 const tabBody=React.createElement(h.BusinessTabs,null,['first','second'].map(key=>React.createElement('button',{key,className:key==='first'?'active':'',onClick:()=>{}},key)));
 const props={navigation:[],icons:{},collapsed:true,onCollapse:()=>{},onNavigate:()=>{},identities:[],identity:'A',actorName:'A',pending:0,pageTitle:'RFQ',contentKey:'project:P',body:tabBody};
 try{
  await h.render(React.createElement(h.Layout,{...props,isDetail:false}));const bar=h.host.querySelector('.ant-tabs-ink-bar');assert.ok(bar);
  await h.render(React.createElement(h.Layout,{...props,isDetail:true}));assert.ok(h.host.querySelector('.ant-tabs-ink-bar')===bar,'entering detail must retain the tab DOM for continuous motion');
  await h.render(React.createElement(h.Layout,{...props,isDetail:false}));assert.ok(h.host.querySelector('.ant-tabs-ink-bar')===bar);
  await h.render(React.createElement(h.Layout,{...props,contentKey:'project:Q'}));assert.ok(h.host.querySelector('.ant-tabs-ink-bar')!==bar,'a different project must mount a fresh workspace');
 }finally{await h.close();}
});

test('project stages stay mounted across routes and retain guarded selection and export permissions',async()=>{
 const h=await harness('project'),navigations=[];
 const props={project:{id:'P',name:'Project'},actorRole:'SR',onNavigate:page=>navigations.push(page),onReturn:()=>{},finalReviewGate:{canExport:false,reason:'需审批'},canDownload:true};
 const render=page=>h.render(React.createElement(h.Project,{...props,route:{page}},React.createElement('p',null,page)));
 const tabs=()=>[...h.host.querySelectorAll('.rfq-content-tabs [role="tab"]')];
 try{
  await render('documents');const bar=h.host.querySelector('.ant-tabs-ink-bar');assert.equal(tabs().length,3);
  await act(async()=>tabs()[1].click());assert.deepEqual(navigations,['response']);assert.equal(tabs()[0].getAttribute('aria-selected'),'true','only a successful guarded route update changes selection');
  for(const page of ['response','settings','versions','reviews']){
   await render(page);assert.ok(h.host.querySelector('.ant-tabs-ink-bar')===bar,`${page} must retain stage navigation`);assert.equal(tabs()[1].getAttribute('aria-selected'),'true');assert.equal(tabs()[2].getAttribute('aria-disabled'),'true');
  }
  await render('export');assert.ok(h.host.querySelector('.ant-tabs-ink-bar')===bar);assert.equal(tabs()[2].getAttribute('aria-selected'),'true');
 }finally{await h.close();}
});
