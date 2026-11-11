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
 let user={id:'sr',displayName:'数据库用户',roles:[{buId:'BU',role:'SR'}],bus:[{id:'BU',name:'事业部'}]};
 localStorage.setItem('fep-rfq-auth',JSON.stringify({token:'test',user}));
 localStorage.setItem('fep-rfq-app-v1',JSON.stringify({projects:[{id:'FAKE',name:'不应出现的前端模拟项目'}]}));
 const project={id:'P',code:'RFQ-DB',name:'从数据库读取的项目',buId:'BU',ownerId:'sr',groupId:'GROUP-A',stage:'DRAFT',version:0};
 let parsed=false,parseCalls=0,archived=false,projectVersion=0,allowReparse=false,finishFailed,finishRetry;
 let failedOnly=false,failedSourceStatus='UPLOADED',adminRetries=0;
 const projectActions=[],parseBodies=[];
 const failedRequest=new Promise(resolve=>{finishFailed=resolve;});
 const retryRequest=new Promise(resolve=>{finishRetry=resolve;});
 const source={id:'D',projectId:'P',name:'客户.docx',version:0,status:'PARSING'};
 globalThis.fetch=async (url,options)=>{
  const deleting=options.method==='DELETE'&&url.startsWith('/api/rfq/projects/P?');
  if(deleting||url.endsWith('/projects/P/restorations')){
   const body=deleting?{version:Number(new URL(url,'http://localhost').searchParams.get('version'))}:JSON.parse(options.body);
   projectActions.push({url,method:options.method,...body});
   if(body.version!==projectVersion||(deleting?options.body!==undefined:!body.reason?.trim())) { return new Response(JSON.stringify({code:1,msg:'无效的项目操作'}),{status:409}); }
   archived=deleting;projectVersion++;
   return new Response(JSON.stringify({code:0,data:{...project,version:projectVersion,archived}}));
  }
  if(url.startsWith('/api/rfq/projects?')){
   const archiveList=new URL(url,'http://localhost').searchParams.get('archived')==='true';
   const list=archived===archiveList?[{...project,version:projectVersion,archived,stage:archived?'CANCELLED':'DRAFT',archiveReason:null}]:[];
   return new Response(JSON.stringify({code:0,data:{list,total:list.length}}));
  }
  if(url.endsWith('/requirements/R/match-result')) { return new Response(JSON.stringify({code:0,data:{
   runId:'MATCH-DB',status:'completed',matchOrder:['history_rfq','standard_reply','capability'],
   result:{matchedLibrary:'history_rfq',conclusion:'待确认',stages:{history_rfq:{status:'hit',candidates:[{id:'H',version:2,title:'数据库历史候选',answer:'真实参考答复'}]}}}
  }})); }
  if(url.endsWith('/download')) { return new Response(JSON.stringify({msg:'原件预览不在此测试范围'}),{status:404}); }
  if(url.endsWith('/parse-runs')){
   parseCalls++;
   parseBodies.push(JSON.parse(options.body));
   if(url.includes('/FAILED/')){
    if(parseCalls===2) { await failedRequest; }
    if(parseCalls===3) { await retryRequest; }
    if(failedOnly&&user.id==='bu-admin'&&++adminRetries===2){
     failedSourceStatus='PARSED';
     return new Response(JSON.stringify({code:0,data:{id:'RUN-'+parseCalls,status:'completed',requirementCount:1}}));
    }
    failedSourceStatus='FAILED';
    return new Response(JSON.stringify({code:0,data:{id:'RUN-'+parseCalls,status:'failed',requirementCount:0,message:'补充资料解析失败'}}));
   }
   if(parsed&&!allowReparse) { return new Response(JSON.stringify({code:1,msg:'已有应答，请登记新版原件后再解析'}),{status:409}); }
   parsed=true;
   return new Response(JSON.stringify({code:0,data:{id:'RUN-'+parseCalls,status:'completed',requirementCount:1}}));
  }
  const requirement={id:allowReparse?'R2':'R',projectId:'P',documentId:'D',originalText:allowReparse?'重新抽取的要求':'客户的真实要求',title:'真实条款',version:0,extractionStatus:'VALID'};
  const otherFile={...source,id:'OTHER',name:'另一份原件.docx',status:'PARSED'};
  const otherRequirement={...requirement,id:'R-OTHER',documentId:'OTHER',originalText:'另一份原件的要求'};
  const failedSource={...source,id:'FAILED',name:'补充资料.docx',status:failedSourceStatus};
  const documents=failedOnly?[failedSource]:[{...source,status:parsed?'PARSED':'PARSING'},failedSource,otherFile];
  const requirements=failedOnly?(failedSourceStatus==='PARSED'?[{...requirement,id:'R-RECOVERED',documentId:'FAILED',originalText:'重试解析生成的条款'}]:[]):allowReparse?[otherRequirement,requirement]:parsed?[requirement,otherRequirement]:[];
  const value=url.endsWith('/auth/me')?user:url.includes('/members')?[{userId:user.id,displayName:user.displayName,roles:[user.roles[0].role],enabled:true,canConfirm:true}]:url.includes('/documents?')?{list:documents,total:documents.length}:url.includes('/requirements?')?{list:requirements,total:requirements.length}:{list:[project],total:1};
  return new Response(JSON.stringify({code:0,data:value}));};
 const folder=fileURLToPath(new URL('../.test-build/',import.meta.url));await mkdir(folder,{recursive:true});const output=path.join(folder,'database-workspace.mjs');
 await build({entryPoints:[fileURLToPath(new URL('./DatabaseWorkspace.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{"BASE_URL":"/","VITE_RFQ_DATA_MODE":"mysql"}'},plugins:[{name:'preview',setup(builder){builder.onResolve({filter:/SourceDocumentPane$/},()=>({path:'preview',namespace:'preview'}));builder.onLoad({filter:/.*/,namespace:'preview'},()=>({contents:'export default function Preview({toolbar}){return toolbar.fileAction}',loader:'js'}));}},{name:'raw',setup(builder){builder.onResolve({filter:/\.html\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));builder.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}]});
 const {default:Workspace}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');const {App:AntApp}=await import('antd');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 try{
  const clickControl=async button=>{assert.ok(button);await act(async()=>{button.click();for(let i=0;i<16;i++)await new Promise(resolve=>setTimeout(resolve,0));});};
  const button=(label,within=document)=>[...within.querySelectorAll('button')].find(item=>item.textContent.replace(/\s/g,'')===label);
  await act(async()=>{root.render(React.createElement(AntApp,null,React.createElement(Workspace)));for(let i=0;i<40;i++)await new Promise(resolve=>setTimeout(resolve,0));});
  assert.ok(node.querySelector('.rfq-pro-shell'),'the original ProLayout shell is reused');
  assert.ok(node.textContent.includes('从数据库读取的项目'));assert.ok(node.textContent.includes('我的 RFQ'));
  assert.ok(!node.textContent.includes('不应出现的前端模拟项目'));assert.ok(!node.querySelector('.mysql-data-app'));
  assert.ok(![...node.querySelectorAll('button')].some(button=>button.textContent==='重置数据'));
  await clickControl(node.querySelector('button[aria-label^="更多操作"]'));
  await clickControl([...document.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent.trim()==='重新解析'));
  const picker=document.querySelector('select[aria-label="选择重新解析的文件"]');
  assert.ok(picker);assert.equal(picker.value,'');assert.equal(button('确认重新解析').disabled,true);
  await act(async()=>{picker.value='FAILED';picker.dispatchEvent(new window.Event('change',{bubbles:true}));});
  assert.ok(document.body.textContent.includes('仅从指定历史 RFQ 文件召回'));
  assert.ok(document.body.textContent.includes('所有同 Group RFQ 比对'));
  const submit=button('确认重新解析');
  await act(async()=>{submit.click();submit.click();});
  assert.equal(parseCalls,2,'duplicate clicks submit the selected file once');
  assert.deepEqual(parseBodies.slice(0,2),[{}, {historyDocumentIds:[]}]);
  assert.ok(document.body.textContent.includes('正在重新解析'));
  await act(async()=>{finishFailed();});
  assert.ok(document.body.textContent.includes('补充资料解析失败'));
  assert.equal(window.location.hash,'#/projects');
  await clickControl(button('取消'));
  localStorage.setItem('fep-rfq-documents:P',JSON.stringify({files:[],parsed:[{id:'BROWSER-ONLY',title:'浏览器伪条款',sourceFileId:'D'}]}));
  await act(async()=>{window.location.hash='#/documents?projectId=P&fileId=D&requirementId=R';window.dispatchEvent(new window.HashChangeEvent('hashchange'));for(let i=0;i<12;i++)await new Promise(resolve=>setTimeout(resolve,0));});
  assert.ok(!node.textContent.includes('浏览器伪条款'));
  assert.equal(parseCalls,2,'opening the workbench does not rerun completed documents');
  assert.ok(node.textContent.includes('客户的真实要求'));
  assert.ok(node.querySelector('[aria-label="知识库比对"]').textContent.includes('数据库历史候选'));
  assert.ok(!button('修改范围并重新比对',node));
  assert.ok(!node.textContent.includes('查看解析结果'));
  assert.ok(!node.textContent.includes('RFQ解析'));
  const retry=[...node.querySelectorAll('.rfq-detail button')].find(item=>item.textContent.trim()==='重新解析'&&!item.hasAttribute('aria-label'));
  assert.ok(retry,'failed supplementary uploads remain retryable after requirements exist');
  await clickControl(retry);
  assert.equal(parseCalls,3,'retry targets the failed file without reparsing successful sources');
  const pending=[...node.querySelectorAll('[role="status"]')].find(item=>item.textContent.includes('正在解析'));
  assert.ok(pending?.querySelector('.anticon-spin'),'a pending retry shows a spinner in the workbench');
  assert.ok(pending.textContent.includes('补充资料.docx'));
  await act(async()=>{finishRetry();});
  assert.equal(pending.isConnected,false,'the spinner disappears after the retry fails');
  assert.ok(node.textContent.includes('补充资料解析失败'));
  assert.ok(node.textContent.includes('客户的真实要求'));
  const workbenchAction=node.querySelector('button[aria-label="重新解析当前文件"]');
  await clickControl(workbenchAction);
  await clickControl(button('确认重新解析'));
  assert.ok(document.body.textContent.includes('请登记新版原件'));
  assert.ok(node.textContent.includes('客户的真实要求'));
  allowReparse=true;
  await clickControl(button('确认重新解析'));
  assert.equal(parseCalls,5);
  assert.equal(new URLSearchParams(window.location.hash.split('?')[1]).get('requirementId'),'R2');
  assert.ok(node.textContent.includes('重新抽取的要求'));
  assert.ok(!node.textContent.includes('客户的真实要求'));
  for(const label of ['载入示例','人工补录','历史批注示例'])assert.ok(![...node.querySelectorAll('button')].some(button=>button.textContent.includes(label)),label+' must not create browser-only records');
  const settle=async()=>{for(let i=0;i<16;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const click=(label,selector='button')=>act(async()=>{
   const control=[...document.querySelectorAll(selector)].find(element=>element.textContent.trim()===label||element.getAttribute('aria-label')===label);
   assert.ok(control,`missing control: ${label} (${window.location.hash}, ${node.textContent.slice(-240)})`);control.click();await settle();
  });
  const fillReason=(label,value)=>act(async()=>{
   const input=document.querySelector(`textarea[aria-label="${label}"]`);assert.ok(input,label);
   Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(input,value);
   input.dispatchEvent(new window.Event('input',{bubbles:true}));await settle();
  });
  await act(async()=>{window.location.hash='#/projects';window.dispatchEvent(new window.HashChangeEvent('hashchange'));await settle();});
  await click('更多操作 从数据库读取的项目');
  await click('删除项目','[role="menuitem"]');
  assert.equal(document.querySelector('[role="dialog"] textarea'),null,'deletion has no reason field');
  await click('确认删除');
  assert.deepEqual(projectActions,[{url:'/api/rfq/projects/P?version=0',method:'DELETE',version:0}]);
  assert.ok(!node.textContent.includes('从数据库读取的项目'),'an archived project leaves the active list');
  await act(async()=>{root.render(React.createElement(AntApp,null,React.createElement(Workspace,{key:'fresh-load'})));await settle();});
  await click('已删除','[role="tab"]');
  assert.ok(node.textContent.includes('从数据库读取的项目'));
  await click('恢复项目');
  await fillReason('恢复原因','客户重启项目');
  await click('确认恢复');
  assert.deepEqual(projectActions.at(-1),{url:'/api/rfq/projects/P/restorations',method:'POST',version:1,reason:'客户重启项目'});
  assert.ok(!node.textContent.includes('从数据库读取的项目'),'a restored project leaves the archive');
  await click('全部','[role="tab"]');
  assert.ok(node.textContent.includes('从数据库读取的项目'),'restored project returns to the active list');

  failedOnly=true;
  user={...user,id:'bu-admin',roles:[{buId:'BU',role:'BU_ADMIN'}]};
  localStorage.setItem('fep-rfq-auth',JSON.stringify({token:'test',user}));
  await act(async()=>{
   window.location.hash='#/documents?projectId=P';
   root.render(React.createElement(AntApp,null,React.createElement(Workspace,{key:'bu-admin'})));
   await settle();
  });
  assert.ok(node.textContent.includes('RFQ 解析需要处理'));
  await clickControl(button('重新解析',node));
  assert.equal(adminRetries,1,'the BU administrator can retry the failed original from RFQ details');
  assert.ok(node.textContent.includes('补充资料解析失败'));
  await clickControl(button('重新解析',node));
  assert.equal(adminRetries,2,'a second failure still leaves the original retryable');
  assert.ok(node.textContent.includes('重试解析生成的条款'));

  failedSourceStatus='UPLOADED';
  user={...user,id:'sr',roles:[{buId:'BU',role:'SR'}]};
  localStorage.setItem('fep-rfq-auth',JSON.stringify({token:'test',user}));
  await act(async()=>{
   root.render(React.createElement(AntApp,null,React.createElement(Workspace,{key:'original-preview'})));
   await settle();
  });
  await clickControl(button('重新解析',node));
  await clickControl(button('确认重新解析'));
  await clickControl(button('取消'));
  assert.ok(node.textContent.includes('补充资料解析失败'),'a failed parse remains visible in the original preview');
  assert.ok(button('重新解析',node),'the original preview keeps its reparse action');
 }finally{await act(async()=>root.unmount());await window.happyDOM.cancelAsync();globalThis.MessageChannel=previousChannel;globalThis.fetch=previousFetch;}
});
