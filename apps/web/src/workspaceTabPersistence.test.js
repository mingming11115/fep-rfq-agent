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

test('project workspace omits stage navigation and retains the header export action',async()=>{
 const h=await harness('project'),navigations=[];
 const props={project:{id:'P',name:'Project'},actorRole:'SR',onNavigate:page=>navigations.push(page),onReturn:()=>{},finalReviewGate:{canExport:false,reason:'需审批'},canDownload:true};
 const render=(page,extra={})=>h.render(React.createElement(h.Project,{...props,...extra,route:{page}},React.createElement('p',null,'项目内容')));
 const exportButton=()=>[...h.host.querySelectorAll('button')].find(button=>button.textContent.includes('导出文档'));
 try{
  for(const page of ['response','settings','versions','reviews','export']){
   await render(page);
   assert.ok(!h.host.querySelector('.rfq-project-stage-tabs'),'stage navigation must be removed');
   assert.ok(!h.host.querySelector('[role="tab"]'));
   assert.ok(h.host.textContent.includes('项目内容'));
   assert.equal(exportButton().disabled,true);
  }
  await render('response',{finalReviewGate:{canExport:true}});
  assert.equal(exportButton().disabled,false);
  await act(async()=>exportButton().click());assert.deepEqual(navigations,['export']);
 }finally{await h.close();}
});
