import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

async function harness(width){
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,handleDisabledFileLoadingAsSuccess:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});window.happyDOM.setWindowSize({width,height:844});
  Object.assign(globalThis,{window,document:window.document,Element:window.Element,HTMLElement:window.HTMLElement,HTMLBodyElement:window.HTMLBodyElement,HTMLHtmlElement:window.HTMLHtmlElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,DOMParser:window.DOMParser,CSS:window.CSS,location:window.location,localStorage:window.localStorage,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
  const browserStyle=window.getComputedStyle.bind(window);
  globalThis.getComputedStyle=element=>new Proxy(browserStyle(element),{get(target,key){
    if(key==='getPropertyValue') { return name=>{const value=target.getPropertyValue(name);return /^border-.*-width$/.test(name)&&(!value||value==='initial')?'0px':value;}; }
    const value=target[key];if(/^border(Top|Bottom|Left|Right)Width$/.test(String(key))&&(!value||value==='initial')) { return '0px'; } return typeof value==='function'?value.bind(target):value;
  }});
  window.getComputedStyle=globalThis.getComputedStyle;
  // Use the browser menu's RAF fallback; Node's MessageChannel retains ports.
  const oldChannel=globalThis.MessageChannel;globalThis.MessageChannel=undefined;
  const cache=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(cache,{recursive:true});const output=path.join(cache,`response-workbench-${width}.mjs`);
  await build({entryPoints:[fileURLToPath(new URL('./pages/ResponsePage.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{"BASE_URL":"/"}'},plugins:[{name:'raw-template',setup(b){b.onResolve({filter:/\.html\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}]});
  const {ResponsePage}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
  const writes=[],requests=[],calls=[],navigations=[],source={projectId:'P',fileId:'F',sourceVersion:'1'},meta={id:'native-file',name:'Customer.docx',fileType:'docx',access:'test',revision:0,...source};
  const row={id:'R',projectId:'P',sourceFileId:'F',source:'Customer.docx',sourceVersion:'1',clause:'1.1',title:'Current clause',original:'Source',conclusion:'Comply',draft:'Saved answer',evidence:'Saved evidence',status:'待处理',version:1};
  let props={project:{id:'P',name:'Project',buId:'BU',deadline:'2026-11-20'},requirements:[row],reviews:[],route:{page:'response',...source,requirementId:'R'},actorRole:'SR',actorId:'actor',appState:{accountsById:{actor:{id:'actor',name:'Alex'}},commentsByProject:{},membersByProject:{},audit:[],documentsByProject:{P:[{id:'F',name:meta.name,craft:meta}]}},canBusinessAction:()=>true,toast:()=>{},logEvent:()=>{},onAppUpdate:()=>{},onConfirm:()=>writes.push('confirm'),navigate:(...args)=>navigations.push(args)};
  const oldFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{requests.push({url,method:options?.method||'GET'});assert.notEqual(options?.method,'PUT','view actions cannot persist native files');return url.includes('/download')?new Response('Native bytes'):new Response(JSON.stringify({code:0,data:meta}));};
  const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  function paint(){root.render(React.createElement(ResponsePage,{...props,onUpdateRequirement:(id,patch)=>{writes.push({id,patch});props={...props,requirements:props.requirements.map(item=>({...item,...patch,version:item.version+1}))};paint();return true;}}));}
  const render=async()=>act(async()=>{paint();await settle();});
  const click=async el=>act(async()=>{assert.ok(el,'requested workbench control exists');el.click();await settle();});
  const button=(text,scope=node)=>[...scope.querySelectorAll('button')].find(el=>el.textContent===text||el.getAttribute('aria-label')===text);
  const type=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));await settle();});
  const resize=async value=>act(async()=>{window.happyDOM.setWindowSize({width:value,height:844});await settle();});
  async function connect(){
    const frame=node.querySelector('iframe'),native={};Object.defineProperty(frame,'contentWindow',{configurable:true,value:native});let applied=0;
    const snapshot=()=>({document:'session',fileName:meta.name,applied,complete:true,author:'Alex',editable:true,notes:[],pages:[],active:null,source:{status:'unsupported',selectedId:'R'}});
    const emit=(kind,data={})=>window.dispatchEvent(new window.MessageEvent('message',{origin:location.origin,source:native,data:{type:'wordcraft:'+kind,...data}}));
    native.postMessage=message=>{calls.push(message);if(message.type==='wordcraft:open') { queueMicrotask(()=>emit('reviewState',{payload:JSON.stringify(snapshot())})); } if(message.type==='wordcraft:review'){const request=JSON.parse(message.payload);applied=request.request;queueMicrotask(()=>{emit('reviewResult',{payload:JSON.stringify({request:request.request,ok:true,result:{}})});emit('reviewState',{payload:JSON.stringify(snapshot())});});}};
    await act(async()=>{emit('ready');await settle();});return {frame,emit};
  }
  return {window,node,props:()=>props,setProps:value=>{props={...props,...value};},render,click,button,type,resize,connect,settle,requests,writes,calls,navigations,async close(){await act(async()=>root.unmount());await window.happyDOM.cancelAsync();globalThis.fetch=oldFetch;globalThis.MessageChannel=oldChannel;}};
}

test('desktop workbench defaults and resets to sixty percent while preserving unsaved source and response',async()=>{
  const h=await harness(1280),{node,render,click,button,type,settle}=h;
  const separator=()=>node.querySelector('[role="separator"][aria-label^="调整原文"]');
  const press=async key=>act(async()=>{separator().dispatchEvent(new window.KeyboardEvent('keydown',{key,bubbles:true}));await settle();});
  try{
    await render();assert.equal(separator().getAttribute('aria-valuenow'),'60');
    const {frame,emit}=await h.connect();Object.defineProperty(node.querySelector('.response-workbench'),'getBoundingClientRect',{configurable:true,value:()=>({width:1200,height:600})});
    await click(node.querySelector('.response-reference-details summary'));const evidence=node.querySelector('[aria-label="本条关联证据"]');assert.equal(evidence.tagName,'DD');
    await act(async()=>{emit('dirty',{dirty:true});await settle();});
    await press('ArrowRight');assert.equal(separator().getAttribute('aria-valuenow'),'65');await press('Enter');assert.equal(separator().getAttribute('aria-valuenow'),'60');await press('ArrowLeft');assert.equal(separator().getAttribute('aria-valuenow'),'55');await press('Enter');assert.equal(separator().getAttribute('aria-valuenow'),'60');
    await click(button('放大原文件区'));assert.ok(node.querySelector('.office-source-expanded'));await click(button('还原原文件区'));assert.ok(!node.querySelector('.office-source-expanded'));
    assert.ok(node.querySelector('iframe')===frame);assert.equal(h.calls.filter(message=>message.type==='wordcraft:open').length,1);assert.equal(node.querySelector('.response-reference-details textarea'),null);assert.equal(window.__rfqOfficeUnsaved.dirty,true);assert.equal(h.props().requirements[0].id,'R');assert.equal(h.writes.length,0);assert.ok(h.requests.every(request=>request.method==='GET'));
  }finally{await h.close();}
});
