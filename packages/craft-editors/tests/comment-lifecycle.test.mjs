import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from './dom-test-support.mjs';
import {createOriginalComments} from '../site/original-comments.js';

test('embedded comment surface exposes guarded commands and releases listeners on unmount',async()=>{
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  const document=window.document;document.write(await readFile(new URL('../site/classic.html',import.meta.url),'utf8'));
  let disconnected=0;Object.assign(globalThis,{document,location:window.location,ResizeObserver:class{observe(){}disconnect(){disconnected++;}},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});
  const sent=[],frame=document.getElementById('word-frame');let surface;
  Object.defineProperty(frame,'contentWindow',{value:{postMessage(message){const payload=JSON.parse(message.payload);sent.push(payload);queueMicrotask(()=>surface.receive('reviewResult',{request:payload.request,ok:true,result:{}}));}}});
  surface=createOriginalComments({frame,onStatus:()=>{},onDirty:()=>{},beforeCommand:(action,params)=>action==='delete'&&params.id===1?'无权删除这条批注':null});
  surface.receive('reviewState',{document:'native-document',author:'Current',editable:true,formatting:false,clip:null,pages:[],notes:[{id:1,author:'Other',text:'Existing',color:0,ranges:[],replies:[]}]});
  assert.equal(typeof surface.command,'function');
  await surface.command('configure',{editable:false});assert.equal(sent.at(-1).action,'configure');assert.equal(surface.sequence,sent.at(-1).request);
  const count=sent.length;
  await assert.rejects(surface.command('delete',{id:1}),/无权删除/);assert.equal(sent.length,count);
  surface.destroy();assert.equal(disconnected,1);
  document.querySelector('#review-tools [data-new]').click();await Promise.resolve();assert.equal(sent.length,count);
  await assert.rejects(surface.command('new'),/关闭/);
  await window.happyDOM.cancelAsync();
});
