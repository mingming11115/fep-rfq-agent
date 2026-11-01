import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

test('project source pane mounts native Word with the project file and preserves read-only fallback',async()=>{
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,handleDisabledFileLoadingAsSuccess:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,ShadowRoot:window.ShadowRoot,
    DOMParser:window.DOMParser,location:window.location,localStorage:window.localStorage,ResizeObserver:class{observe(){}disconnect(){}},getComputedStyle:window.getComputedStyle.bind(window),
    requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
  const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});
  const output=path.join(directory,'craft-source-pane-test.mjs');
  await build({entryPoints:[fileURLToPath(new URL('./components/CraftSourcePane.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{"BASE_URL":"/"}'},
    plugins:[{name:'raw-template',setup(b){b.onResolve({filter:/\.html\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}]});
  const {default:CraftSourcePane}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  const source={projectId:'P',fileId:'F',sourceVersion:'V1'},user={id:'actor',name:'Alex'};
  const ref={id:'file-id',name:'real.docx',fileType:'docx',access:'cap',...source,revision:0};
  const rows=[{id:'R',projectId:'P',sourceFileId:'F',sourceVersion:'V1',original:'Original source',sourcePage:1}];
  const previousFetch=globalThis.fetch;globalThis.fetch=async url=>url.includes('/download')?new Response(new Blob(['native docx'])):new Response(JSON.stringify({code:0,data:ref}));
  const settle=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  try{
    await act(async()=>{root.render(React.createElement(CraftSourcePane,{file:{id:'F',name:'real.docx',craft:ref},source,user,canManage:true,rows,selectedAnchor:{...source,requirementId:'R'},allComments:[],people:[user],canEditRow:()=>true,onProjectCommentsChange:()=>{},onSelectAnchor:()=>{},onSelectComment:()=>{}},React.createElement('div',null,'Existing excerpts')));});
    await act(async()=>await settle());
    const frame=container.querySelector('iframe');assert.ok(frame);
    assert.match(frame.src,/\/craft-editors\/wordcraft-classic\//);assert.equal(container.querySelector('[data-count]')?.textContent,'0 条批注');
    assert.match(container.textContent,/保存原文/);assert.match(container.textContent,/条款摘录/);
    await act(async()=>{root.unmount();});
    const second=createRoot(container);
    await act(async()=>{second.render(React.createElement(CraftSourcePane,{file:{name:'missing.docx'},source:{...source,fileId:'MISSING'},user,canManage:false,rows,allComments:[],canEditRow:()=>false},React.createElement('div',null,'Existing excerpts')));});
    await act(async()=>await settle());
    assert.match(container.textContent,/尚未关联原文件/);assert.ok(![...container.querySelectorAll('button')].some(b=>b.textContent.includes('上传对应原文件')));
    await act(async()=>second.unmount());
  }finally{globalThis.fetch=previousFetch;await window.happyDOM.cancelAsync();}
});
