import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

// Real host, bridge, queue, HTTP client and menu. Only the external native
// message transport, HTTP responses and browser download boundary are supplied.
for(const fileType of ['docx','pdf'])test(`${fileType} file menu saves the review, downloads saved copies and retains failed local edits`,async()=>{
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,handleDisabledFileLoadingAsSuccess:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  Object.assign(globalThis,{window,document:window.document,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,DOMParser:window.DOMParser,CSS:window.CSS,location:window.location,localStorage:window.localStorage,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
  const cache=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(cache,{recursive:true});const output=path.join(cache,`file-actions-${fileType}.mjs`);
  await build({entryPoints:[fileURLToPath(new URL('./components/CraftSourcePane.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{"BASE_URL":"/"}'},plugins:[{name:'raw-template',setup(b){b.onResolve({filter:/\.html\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}]});
  const {default:CraftSourcePane}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');
  const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
  const source={projectId:'P',fileId:'F',sourceVersion:'V1'},user={id:'actor',name:'Alex'},rows=[{id:'R',projectId:'P',sourceFileId:'F',sourceVersion:'V1',original:'Source',conclusion:'Comply'}];
  let meta={id:'native-file',name:`Customer.${fileType}`,fileType,access:'test-capability',...source,revision:0},writable=true,holdPut=false,releasePut,failPut=false,failDownload=false,failNativeSave=false,applied=0;
  const requests=[],downloads=[],objectBlobs=new Map(),nativeCalls=[];let currentBlob;
  // rc-overflow's browser MessageChannel has no close; use its RAF fallback
  // because Node MessagePorts keep the test process alive after unmount.
  const oldChannel=globalThis.MessageChannel;globalThis.MessageChannel=undefined;
  const oldFetch=globalThis.fetch,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldClick=window.HTMLAnchorElement.prototype.click;
  URL.createObjectURL=blob=>{currentBlob=blob;const url='blob:http://127.0.0.1/download-'+objectBlobs.size;objectBlobs.set(url,blob);return url;};URL.revokeObjectURL=()=>{};
  window.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:objectBlobs.get(this.href)||currentBlob});};
  globalThis.fetch=async(url,options={})=>{
    requests.push({url,options});
    if(options.method==='PUT'){
      if(holdPut) { await new Promise(resolve=>{releasePut=resolve;}); }
      if(failPut) { return new Response(JSON.stringify({code:503,msg:'存储暂不可用'}),{status:503}); }
      meta={...meta,revision:meta.revision+1};return new Response(JSON.stringify({code:0,data:meta}));
    }
    if(url.includes('/download')) { return failDownload?new Response(JSON.stringify({code:503,msg:'下载暂不可用'}),{status:503}):new Response(url.endsWith('original')?'immutable original':'saved review'); }
    return new Response(JSON.stringify({code:0,data:meta}));
  };
  const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const click=async element=>act(async()=>{assert.ok(element,'requested file action is available');element.click();await settle();});
  const render=async()=>act(async()=>{root.render(React.createElement(CraftSourcePane,{file:{id:'F',name:meta.name,craft:meta},source,user,rows,canManage:writable,canEditRow:()=>writable,allComments:[],selectedAnchor:{...source,requirementId:'R'},showResponses:false,toolbar:{fileSelector:React.createElement('span',null,'Customer source')},onProjectCommentsChange:()=>{}},React.createElement('p',null,'Excerpt')));await settle();});
  const trigger=()=>node.querySelector('[aria-label="更多文件操作"]'),menu=()=>document.querySelector('[role="menu"]');
  const item=text=>[...menu().querySelectorAll('[role="menuitem"]')].find(el=>el.textContent.includes(text));
  const open=async()=>{if(trigger().getAttribute('aria-expanded')!=='true') { await click(trigger()); } assert.ok(menu());};
  const action=async text=>{await open();await click(item(text));};
  const fileState=()=>node.querySelector('[aria-label="文件保存状态"]')?.textContent;
  const puts=()=>requests.filter(request=>request.options.method==='PUT');
  try{
    await render();assert.ok(trigger(),'file operations have a discoverable top menu');await open();assert.equal(item('保存批阅稿').getAttribute('aria-disabled'),'true','unready native session cannot save');
    const frame=node.querySelector('iframe'),native={},engine=fileType==='pdf'?'pdfcraft':'wordcraft';
    const editorDocument=document.implementation.createHTMLDocument('Native editor');Object.defineProperty(frame,'contentDocument',{configurable:true,value:editorDocument});Object.defineProperty(frame,'contentWindow',{configurable:true,value:native});
    const snapshot=()=>({document:'session',fileName:meta.name,applied,complete:true,author:user.name,editable:writable,notes:[],pages:[],active:null,source:{status:'unsupported',selectedId:'R'}});
    const emit=(type,data={})=>window.dispatchEvent(new window.MessageEvent('message',{origin:location.origin,source:native,data:{type:engine+':'+type,...data}}));
    const packet=text=>({name:meta.name,bytes:new TextEncoder().encode(text).buffer,review:snapshot()});
    native.postMessage=message=>{nativeCalls.push(message);if(message.type===engine+':open') { queueMicrotask(()=>emit('reviewState',{payload:JSON.stringify(snapshot())})); } if(message.type===engine+':review'){const request=JSON.parse(message.payload);applied=request.request;queueMicrotask(()=>{if(request.action==='save'&&failNativeSave){emit('reviewResult',{payload:JSON.stringify({request:request.request,ok:false,error:'Native serialization unavailable'})});return;}if(request.action==='save') { emit('save',packet('latest local review')); } emit('reviewResult',{payload:JSON.stringify({request:request.request,ok:true,result:{}})});emit('reviewState',{payload:JSON.stringify(snapshot())});});}};
    await act(async()=>{emit('ready');await settle();});assert.match(fileState(),/文件已保存/);
    assert.notEqual(item('保存批阅稿').getAttribute('aria-disabled'),'true');assert.match(item('保存批阅稿').textContent,/Ctrl.*S/);
    await act(async()=>{menu().dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await settle();});assert.equal(trigger().getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,trigger());
    await open();await act(async()=>{editorDocument.dispatchEvent(new window.PointerEvent('pointerdown',{bubbles:true}));await settle();});assert.equal(trigger().getAttribute('aria-expanded'),'false','native document interactions close its menu');
    assert.equal(node.querySelector('iframe'),frame);assert.equal(puts().length,0);
    await act(async()=>{emit('dirty',{dirty:true});await settle();});assert.match(fileState(),/文件未保存/);
    failNativeSave=true;await action('保存批阅稿');assert.match(fileState(),/文件保存失败/);assert.equal(puts().length,0);
    const firstRetry=[...node.querySelectorAll('[role="alert"] button')].find(el=>el.textContent.replace(/\s/g,'')==='重试');assert.ok(firstRetry);assert.ok(!node.textContent.includes('下载本地备份'),'serialization failed before any backup bytes existed');
    failNativeSave=false;await click(firstRetry);assert.equal(puts().length,1,'Retry after a first native serialization failure must actually save');assert.equal(puts()[0].options.headers.get('If-Match'),'"0"');assert.match(fileState(),/文件已保存/);
    await act(async()=>{emit('dirty',{dirty:true});await settle();});
    const readsBefore=requests.length;await action('下载原件');assert.equal(requests.length,readsBefore+1);assert.equal(requests.at(-1).url,'/api/craft/documents/native-file/download?kind=original');assert.equal(requests.at(-1).options.headers.get('X-Craft-Access'),'test-capability');assert.equal(downloads.at(-1).name,`Customer.${fileType}`);assert.equal(await downloads.at(-1).blob.text(),'immutable original');
    await action('下载已保存批阅稿');assert.equal(requests.at(-1).url,'/api/craft/documents/native-file/download?kind=review');assert.equal(downloads.at(-1).name,`Customer-批阅版.${fileType}`);assert.equal(await downloads.at(-1).blob.text(),'saved review');assert.equal(puts().length,1);assert.equal(window.__rfqOfficeUnsaved.dirty,true,'downloads never save or discard local changes');
    holdPut=true;await action('保存批阅稿');assert.equal(puts().length,2);assert.match(fileState(),/文件保存中/);assert.equal(puts()[1].options.headers.get('If-Match'),'"1"');assert.equal(await new Blob([puts()[1].options.body]).text(),'latest local review');await open();assert.equal(item('保存批阅稿').getAttribute('aria-disabled'),'true');await click(item('保存批阅稿'));assert.equal(puts().length,2);
    await act(async()=>{holdPut=false;releasePut();await settle();});assert.match(fileState(),/文件已保存/);assert.equal(window.__rfqOfficeUnsaved.dirty,false);
    // A keyboard-origin save packet uses the same queue and confirmed revision.
    await act(async()=>{emit('dirty',{dirty:true});emit('save',packet('keyboard review'));await settle();});assert.equal(puts().length,3);assert.equal(puts()[2].options.headers.get('If-Match'),'"2"');assert.match(fileState(),/文件已保存/);
    failPut=true;await act(async()=>{emit('dirty',{dirty:true});await settle();});await action('保存批阅稿');assert.match(fileState(),/文件保存失败/);assert.equal(window.__rfqOfficeUnsaved.dirty,true);
    const alertButton=text=>[...node.querySelectorAll('[role="alert"] button')].find(el=>el.textContent.replace(/\s/g,'')===text);
    assert.ok(alertButton('重试'));assert.ok(alertButton('重新打开'));await click(alertButton('下载本地备份'));assert.equal(await downloads.at(-1).blob.text(),'latest local review');
    failDownload=true;await action('下载原件');assert.match(node.textContent,/下载暂不可用/);assert.match(fileState(),/文件保存失败/);assert.ok(alertButton('下载本地备份'),'download failure cannot remove failed-save recovery');
    failDownload=false;await action('下载原件');assert.equal(await downloads.at(-1).blob.text(),'immutable original');assert.match(fileState(),/文件保存失败/);
    failPut=false;await click(alertButton('重试'));assert.equal(puts().at(-1).options.headers.get('If-Match'),'"3"');assert.match(fileState(),/文件已保存/);assert.equal(window.__rfqOfficeUnsaved.dirty,false);
    writable=false;await render();await open();assert.equal(item('保存批阅稿').getAttribute('aria-disabled'),'true','read-only identity cannot persist file changes');assert.notEqual(item('下载原件').getAttribute('aria-disabled'),'true');
    const beforeReadonly=puts().length;await click(item('保存批阅稿'));assert.equal(puts().length,beforeReadonly);
    assert.equal(node.querySelector('.office-savebar'),null);assert.equal(nativeCalls.filter(call=>call.type===engine+':open').length,1,'menus never remount the native editor');
  }finally{await act(async()=>root.unmount());globalThis.fetch=oldFetch;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;window.HTMLAnchorElement.prototype.click=oldClick;await window.happyDOM.cancelAsync();globalThis.MessageChannel=oldChannel;}
});
