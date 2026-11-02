import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

test('project source pane opens the Word/PDF HTML entry, leaves loading after handshake, and preserves read-only fallback',async()=>{
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
  const rows=[{id:'R',projectId:'P',sourceFileId:'F',sourceVersion:'V1',original:'Original source',sourcePage:1,conclusion:'Comply'}];
  let responseMeta=ref;
  const previousFetch=globalThis.fetch;globalThis.fetch=async url=>url.includes('/download')?new Response(new Blob(['native file bytes'])):new Response(JSON.stringify({code:0,data:responseMeta}));
  const settle=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const connectNative=async(frame,meta)=>{
    // HappyDOM deliberately does not navigate frames in this test. Supply only
    // the native message boundary; React and the project bridge stay real.
    const native={},engine=meta.fileType==='pdf'?'pdfcraft':'wordcraft',calls=[];
    Object.defineProperty(frame,'contentWindow',{configurable:true,value:native});
    let applied=0,outlineVisible=false;
    const emit=(type,data)=>window.dispatchEvent(new window.MessageEvent('message',{origin:location.origin,source:native,data:{type:engine+':'+type,...data}}));
    const snapshot=()=>({document:meta.id+'-session',fileName:meta.name,applied,complete:true,author:'Alex',editable:true,outlineVisible,notes:[],pages:[],active:null,source:{status:'unsupported'}});
    native.postMessage=message=>{
      calls.push(message);
      if(message.type===engine+':open')queueMicrotask(()=>emit('reviewState',{payload:JSON.stringify(snapshot())}));
      if(message.type===engine+':review'){
        const request=JSON.parse(message.payload);applied=request.request;
        if(request.action==='outline')outlineVisible=request.params.visible;
        queueMicrotask(()=>{emit('reviewResult',{payload:JSON.stringify({request:request.request,ok:true,result:{}})});emit('reviewState',{payload:JSON.stringify(snapshot())});});
      }
    };
    await act(async()=>{emit('ready',{});await settle();});
    assert.equal(calls.find(call=>call.type===engine+':open')?.name,meta.name);
    assert.ok(!container.textContent.includes('正在打开原文件'));
    assert.ok(!container.querySelector('.office-loading'));
    return calls;
  };
  try{
    await act(async()=>{root.render(React.createElement(CraftSourcePane,{file:{id:'F',name:'real.docx',craft:ref},source,user,canManage:true,rows,selectedAnchor:{...source,requirementId:'R'},allComments:[],people:[user],canEditRow:()=>true,onProjectCommentsChange:()=>{},onSelectAnchor:()=>{},onSelectComment:()=>{}},React.createElement('div',null,'Existing excerpts')));});
    await act(async()=>await settle());
    const frame=container.querySelector('iframe');assert.ok(frame);
    // Vite's public directory does not resolve a directory URL to its index:
    // it returns the RFQ SPA shell, which never sends the editor ready message.
    assert.equal(new URL(frame.src).pathname,'/craft-editors/wordcraft-classic/index.html');
    assert.equal(container.querySelector('[data-count]')?.textContent,'0 条批注');
    assert.match(container.textContent,/保存原文/);assert.match(container.textContent,/条款摘录/);
    assert.match(container.querySelector('[aria-label="原文件旁的话术批注"]')?.textContent||'',/Comply/);
    const calls=await connectNative(frame,ref);
    const directory=container.querySelector('button[aria-label="文档目录"]');
    assert.ok(directory,'Word provides a separate document directory');
    await act(async()=>{directory.click();await settle();});
    assert.equal(directory.getAttribute('aria-pressed'),'true');
    assert.ok(calls.some(call=>call.type==='wordcraft:review'&&JSON.parse(call.payload).action==='outline'&&JSON.parse(call.payload).params.visible===true));
    assert.ok(!container.textContent.includes('有修改，尚未保存'));
    await act(async()=>{directory.click();await settle();});
    assert.equal(directory.getAttribute('aria-pressed'),'false');
    await act(async()=>{container.querySelector('[data-response-note="R"] .wc-note-body').click();await settle();});
    assert.ok(calls.some(call=>call.type==='wordcraft:review'&&JSON.parse(call.payload).action==='locate'&&JSON.parse(call.payload).params.id==='R'),'clicking even the current advice must explicitly locate the native source');
    const editorUrl=frame.src;
    await act(async()=>{root.render(React.createElement(CraftSourcePane,{file:{id:'F',name:'real.docx',craft:ref},source:{...source},user:{...user},canManage:true,rows:[...rows,{...rows[0],id:'R2',original:'Next source'}],selectedAnchor:{...source,requirementId:'R2'},responsePreview:{id:'R2',conclusion:'不满足',reason:'当前方案达不到要求'},allComments:[],people:[user],canEditRow:()=>true,onProjectCommentsChange:()=>{},onSelectAnchor:()=>{},onSelectComment:()=>{}},React.createElement('div',null,'Next excerpt')));await settle();});
    assert.match(container.querySelector('[aria-label="原文件旁的话术批注"]').textContent,/当前方案达不到要求/);
    assert.equal(container.querySelector('iframe'),frame);
    assert.equal(frame.src,editorUrl);
    assert.equal(calls.filter(call=>call.type==='wordcraft:open').length,1);
    assert.ok(!container.querySelector('.office-loading'));
    await act(async()=>{root.unmount();});
    const second=createRoot(container);
    responseMeta={...ref,id:'pdf-id',fileId:'PDF',name:'real.pdf',fileType:'pdf'};
    await act(async()=>{second.render(React.createElement(CraftSourcePane,{file:{name:'real.pdf',craft:responseMeta},source:{...source,fileId:'PDF'},user,canManage:true,rows:[],allComments:[],canEditRow:()=>true,onProjectCommentsChange:()=>{}}));});
    await act(async()=>await settle());
    const pdfFrame=container.querySelector('iframe');
    assert.equal(new URL(pdfFrame.src).pathname,'/craft-editors/pdfcraft-classic/index.html');
    await connectNative(pdfFrame,responseMeta);
    assert.equal(container.querySelector('button[aria-label="文档目录"]'),null);
    await act(async()=>second.unmount());
    const third=createRoot(container);
    await act(async()=>{third.render(React.createElement(CraftSourcePane,{file:{name:'missing.docx'},source:{...source,fileId:'MISSING'},user,canManage:false,rows,allComments:[],canEditRow:()=>false},React.createElement('div',null,'Existing excerpts')));});
    await act(async()=>await settle());
    assert.match(container.textContent,/尚未关联原文件/);assert.ok(![...container.querySelectorAll('button')].some(b=>b.textContent.includes('上传对应原文件')));
    assert.equal(container.querySelector('.office-excerpt').hidden,false,'a card from a file without uploaded bytes must show its own source excerpt');
    await act(async()=>third.unmount());
  }finally{globalThis.fetch=previousFetch;await window.happyDOM.cancelAsync();}
});
