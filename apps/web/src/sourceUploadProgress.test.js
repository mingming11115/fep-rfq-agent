import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {build} from 'esbuild';
import {Window} from 'happy-dom';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';

test('upload UI advances, shows measured progress and retries only the failed transfer',async()=>{
 const window=new Window({url:'http://localhost'});
 Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true});
 const cache=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(cache,{recursive:true});
 await build({entryPoints:[fileURLToPath(new URL('./components/SourceUploadDialog.jsx',import.meta.url))],outfile:cache+'upload-progress.mjs',bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic'});
 const {default:Dialog}=await import(pathToFileURL(cache+'upload-progress.mjs')),{createRoot}=await import('react-dom/client');
 const previousFetch=globalThis.fetch,previousXHR=globalThis.XMLHttpRequest,requests=[];let result,accept=false;
 globalThis.fetch=async()=>new Response(JSON.stringify({code:0,data:{id:'P'}}));
 globalThis.XMLHttpRequest=class{
  upload={};status=200;headers={};open(method,url){this.url=url;}
  setRequestHeader(name,value){this.headers[name]=value;}getAllResponseHeaders(){return '';}
  send(){requests.push(this);}abort(){this.aborted=true;this.onabort?.();}
  complete(data){this.responseText=JSON.stringify({code:0,data});this.onload();}
 };
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setTimeout(resolve,0));};
 const click=async text=>act(async()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.replace(/\s/g,'').includes(text));assert.ok(button,text);button.click();await settle();});
 try{
  await act(async()=>{root.render(React.createElement(Dialog,{project:{id:'P'},onClose:()=>{},onSubmit:rows=>{if(!accept)return false;result=rows;}}));await settle();});
  const input=document.querySelector('input[type="file"]');Object.defineProperty(input,'files',{configurable:true,value:[new File(['data'],'source.pdf',{type:'application/pdf'})]});
  await act(async()=>{input.dispatchEvent(new window.Event('change',{bubbles:true}));await settle();});
  await click('上传并开始解析');assert.equal(requests.length,1,'upload requests use progress transport');
  assert.match(document.querySelector('.ant-steps-item-process').textContent,/上传原件/);
  await act(async()=>{requests[0].upload.onprogress({lengthComputable:true,loaded:40,total:100});await settle();});
  assert.ok(document.querySelector('.ant-upload-list-item-uploading'));assert.match(document.body.textContent,/40/);
  await act(async()=>{requests[0].complete({id:'D',version:1});await settle();});assert.equal(requests.length,2);
  await act(async()=>{requests[1].onerror();await settle();});assert.ok(document.querySelector('.ant-upload-list-item-error'));assert.equal(result,undefined);
  await click('重试上传');assert.equal(requests.length,3);assert.match(requests[2].url,/\/api\/craft\/documents/);
  await act(async()=>{requests[2].complete({id:'C',name:'source.pdf'});await settle();});
  assert.equal(result,undefined);assert.match(document.body.textContent,/提交解析未完成/);
  accept=true;await click('重试提交');assert.equal(requests.length,3,'retrying handoff must not upload acknowledged files again');
  assert.equal(result.length,1);assert.equal(result[0].backendDocumentId,'D');assert.equal(result[0].craft.id,'C');
  assert.match(document.querySelector('.ant-steps-item-process').textContent,/提交解析/);
  await act(async()=>{root.render(React.createElement(Dialog,{project:{id:'P'},open:false,onClose:()=>{},onSubmit:()=>{}}));await settle();});
  await act(async()=>{root.render(React.createElement(Dialog,{project:{id:'P'},open:true,onClose:()=>{},onSubmit:()=>{}}));await settle();});
  assert.equal(document.querySelectorAll('.ant-upload-list-item').length,0,'reopening starts a new selection rather than a disabled completed session');
  const reopenedInput=document.querySelector('input[type="file"]');Object.defineProperty(reopenedInput,'files',{configurable:true,value:[new File(['next'],'next.pdf')]});
  await act(async()=>{reopenedInput.dispatchEvent(new window.Event('change',{bubbles:true}));await settle();});
  await click('上传并开始解析');assert.equal(requests.length,4);
  await act(async()=>{root.render(React.createElement(Dialog,{project:{id:'Q'},onClose:()=>{},onSubmit:()=>{throw Error('old project must not submit into Q');}}));await settle();});
  assert.equal(requests[3].aborted,true);assert.equal(document.querySelectorAll('.ant-upload-list-item').length,0,'project switch discards the old upload session');
 }finally{await act(async()=>root.unmount());await window.happyDOM.close();globalThis.fetch=previousFetch;globalThis.XMLHttpRequest=previousXHR;}
});
