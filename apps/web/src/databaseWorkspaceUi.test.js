import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import React,{act} from 'react';
import {Window} from 'happy-dom';

test('MySQL entry uses the original full workspace and ignores cached frontend demo projects',async()=>{
 const window=new Window({url:'http://localhost/#/projects',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
 const previousChannel=globalThis.MessageChannel,previousFetch=globalThis.fetch;globalThis.MessageChannel=undefined;
 Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage,sessionStorage:window.sessionStorage,location:window.location,history:window.history,
  Document:window.Document,Node:window.Node,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,DOMParser:window.DOMParser,CSS:window.CSS,
  getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:window.ResizeObserver,requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
 const user={id:'sr',displayName:'数据库用户',roles:[{buId:'BU',role:'SR'}],bus:[{id:'BU',name:'事业部'}]};
 localStorage.setItem('fep-rfq-auth',JSON.stringify({token:'test',user}));
 localStorage.setItem('fep-rfq-app-v1',JSON.stringify({projects:[{id:'FAKE',name:'不应出现的前端模拟项目'}]}));
 const project={id:'P',code:'RFQ-DB',name:'从数据库读取的项目',buId:'BU',ownerId:'sr',stage:'DRAFT',version:0};
 let parsed=false,parseCalls=0;
 const source={id:'D',projectId:'P',name:'客户.docx',version:0,status:'PARSING'};
 globalThis.fetch=async url=>{if(url.endsWith('/download'))return new Response(JSON.stringify({msg:'原件预览不在此测试范围'}),{status:404});if(url.endsWith('/parse-runs')){parseCalls++;if(url.includes('/FAILED/'))return new Response(JSON.stringify({code:1,msg:'补充资料解析失败'}),{status:422});parsed=true;return new Response(JSON.stringify({code:0,data:{id:'RUN',status:'completed',requirementCount:1}}));}const value=url.endsWith('/auth/me')?user:url.includes('/members')?[{userId:'sr',displayName:'数据库用户',roles:['SR'],enabled:true,canConfirm:true}]:url.includes('/documents?')?{list:[{...source,status:parsed?'PARSED':'PARSING'},{...source,id:'FAILED',name:'补充资料.docx',status:'FAILED'}],total:2}:url.includes('/requirements?')?{list:parsed?[{id:'R',projectId:'P',documentId:'D',originalText:'客户的真实要求',title:'真实条款',version:0,extractionStatus:'VALID'}]:[],total:parsed?1:0}:{list:[project],total:1};return new Response(JSON.stringify({code:0,data:value}));};
 const folder=fileURLToPath(new URL('../.test-build/',import.meta.url));await mkdir(folder,{recursive:true});const output=path.join(folder,'database-workspace.mjs');
 await build({entryPoints:[fileURLToPath(new URL('./DatabaseWorkspace.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{"BASE_URL":"/","VITE_RFQ_DATA_MODE":"mysql"}'},plugins:[{name:'preview',setup(builder){builder.onResolve({filter:/SourceDocumentPane$/},()=>({path:'preview',namespace:'preview'}));builder.onLoad({filter:/.*/,namespace:'preview'},()=>({contents:'export default function Preview(){return null}',loader:'js'}));}},{name:'raw',setup(builder){builder.onResolve({filter:/\.html\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));builder.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}]});
 const {default:Workspace}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');const {App:AntApp}=await import('antd');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 try{
  await act(async()=>{root.render(React.createElement(AntApp,null,React.createElement(Workspace)));for(let i=0;i<40;i++)await new Promise(resolve=>setTimeout(resolve,0));});
  assert.ok(node.querySelector('.rfq-pro-shell'),'the original ProLayout shell is reused');
  assert.ok(node.textContent.includes('从数据库读取的项目'));assert.ok(node.textContent.includes('我的 RFQ'));
  assert.ok(!node.textContent.includes('不应出现的前端模拟项目'));assert.ok(!node.querySelector('.mysql-data-app'));
  assert.ok(![...node.querySelectorAll('button')].some(button=>button.textContent==='重置数据'));
  localStorage.setItem('fep-rfq-documents:P',JSON.stringify({files:[],parsed:[{id:'BROWSER-ONLY',title:'浏览器伪条款',sourceFileId:'D'}]}));
  await act(async()=>{window.location.hash='#/documents?projectId=P';window.dispatchEvent(new window.HashChangeEvent('hashchange'));for(let i=0;i<12;i++)await new Promise(resolve=>setTimeout(resolve,0));});
  assert.ok(!node.textContent.includes('浏览器伪条款'));
  assert.equal(parseCalls,1,'parsing runs once without mounting the retired page');
  assert.ok(node.textContent.includes('客户的真实要求'));
  assert.ok(!node.textContent.includes('查看解析结果'));
  assert.ok(!node.textContent.includes('RFQ解析'));
  const retry=[...node.querySelectorAll('button')].find(button=>button.textContent.includes('重新解析'));
  assert.ok(retry,'failed supplementary uploads remain retryable after requirements exist');
  await act(async()=>{retry.click();for(let i=0;i<12;i++)await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(parseCalls,2,'retry targets the failed file without reparsing successful sources');
  assert.ok(node.textContent.includes('客户的真实要求'));
  for(const label of ['载入示例','人工补录','历史批注示例'])assert.ok(![...node.querySelectorAll('button')].some(button=>button.textContent.includes(label)),label+' must not create browser-only records');
 }finally{await act(async()=>root.unmount());await window.happyDOM.cancelAsync();globalThis.MessageChannel=previousChannel;globalThis.fetch=previousFetch;}
});
