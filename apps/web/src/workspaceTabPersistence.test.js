import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';
import {Window} from 'happy-dom';
import {mapDatabaseWorkspace} from './databaseWorkspace.js';
import {getFinalReviewGate} from './finalReviewFlow.js';
import {canPerform} from './permissions.js';
import {currentProjectScope,snapshotFingerprint} from './snapshotDomain.js';

async function harness(name){
 const window=new Window({url:'http://localhost',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 Object.assign(globalThis,{window,document:window.document,Node:window.Node,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,
  getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:window.ResizeObserver,requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),sessionStorage:window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
 const dir=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(dir,{recursive:true});const output=dir+`workspace-tabs-${name}.mjs`;
 await build({stdin:{contents:"export {default as Layout} from './components/RfqAppLayout';export {default as Project} from './components/ProjectWorkspace';export {BusinessTabs} from './components/AntContent';export {ExportPage} from './pages/WorkflowPages';",resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'jsx'},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
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
  const pageMotions=[];
  h.host.querySelector('.rfq-layout-content').animate=(frames,options)=>{
   pageMotions.push({frames,options});return {cancel(){},finished:Promise.resolve()};
  };
  await h.render(React.createElement(h.Layout,{...props,isDetail:true}));assert.ok(h.host.querySelector('.ant-tabs-ink-bar')===bar,'entering detail must retain the tab DOM for continuous motion');
  await h.render(React.createElement(h.Layout,{...props,isDetail:false}));assert.ok(h.host.querySelector('.ant-tabs-ink-bar')===bar);
  assert.equal(pageMotions.length,2,'switching between detail and export must play a page transition in both directions');
  await h.render(React.createElement(h.Layout,{...props,contentKey:'project:Q'}));assert.ok(h.host.querySelector('.ant-tabs-ink-bar')!==bar,'a different project must mount a fresh workspace');
 }finally{await h.close();}
});

test('MySQL SR previews approved clause results and downloads the Word body export',async t=>{
 const h=await harness('mysql-export');
 t.after(()=>h.close());
 const projectId='P',buId='BU',actorId='sr';
 const reviewers={srId:actorId,technicalIds:['tech'],technicalRepresentativeId:null};
 const members=[{userId:actorId,roles:['SR']},{userId:'tech',roles:['TECH']}].map(member=>({...member,enabled:true,canConfirm:true,canFinalReview:true}));
 const appState=mapDatabaseWorkspace({
  user:{id:actorId,displayName:'张明',roles:[{buId,role:'SR'}],bus:[{id:buId,name:'事业部'}]},
  projects:[{id:projectId,name:'项目',buId,ownerId:actorId,stage:'APPROVED'}],directories:{[buId]:members},
  details:{P:{documents:[{id:'D',version:1,status:'PARSED'}],requirements:[{id:'R',documentId:'D',version:1,customerClauseNo:'1',originalText:'客户要求'}],
   workflow:{metadata:{participantIds:[actorId,'tech'],approvalConfig:{finalReviewers:reviewers}},responses:[{id:'R',status:'已确认',conclusion:'Comply',draft:'批准的应答',evidence:'验证记录'}]}}},
 });
 const project=appState.projects[0],requirements=appState.requirementsByProject.P;
 const mapping=Object.fromEntries(['clause','original','conclusion','draft','conditions','status'].map(field=>[field,field]));
 const approvalScope={...currentProjectScope(appState,projectId),format:'mysql-business-v1',template:{id:'customer',title:'客户条款对照清单',version:'V1.3'},mapping,attachments:[]};
 const snapshot={id:'S',projectId,status:'已批准',rows:structuredClone(requirements),mapping,approvalScope,approvalFingerprint:snapshotFingerprint(approvalScope),
  finalReview:{policy:'sr-and-technical',technicalMode:'all',reviewers,decisions:{sr:{actorId,result:'approved'},technicalByActorId:{tech:{actorId:'tech',result:'approved'}}}}};
 const snapshots=appState.snapshotsByProject.P=[snapshot];
 const permissionContext={state:appState,actorId,projectId,buId};
 const finalReviewGate=getFinalReviewGate(appState,projectId);
 assert.equal(finalReviewGate.canExport,true,finalReviewGate.reason);
 assert.equal(canPerform('技术','export:download',{...permissionContext,actorId:'tech'}),false);
 let destination;
 await h.render(React.createElement(h.Project,{project,actorRole:'SR',route:{page:'response'},finalReviewGate,
  canDownload:canPerform('SR','export:download',permissionContext),onNavigate:page=>{destination=page;}}));
 const button=(label,scope=document)=>[...scope.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
 await act(async()=>button('导出文档').click());
 assert.equal(destination,'export');

 const window=h.host.ownerDocument.defaultView;
 const createURL=URL.createObjectURL,revokeURL=URL.revokeObjectURL,anchor=window.HTMLAnchorElement.prototype,click=anchor.click;
 const previousFetch=globalThis.fetch,previousStorage=globalThis.localStorage;
 globalThis.localStorage=window.localStorage;
 localStorage.setItem('fep-rfq-auth',JSON.stringify({token:'test-token',user:{id:actorId}}));
 const downloads=[];
 globalThis.fetch=async (url,options)=>{
  downloads.push([url,options.headers.Authorization]);
  return new Response('annotated original',{headers:{'Content-Disposition':"attachment; filename*=UTF-8''%E5%AE%A2%E6%88%B7-%E6%AD%A3%E5%BC%8F%E5%BA%94%E7%AD%94.docx"}});
 };
 let file,filename;
 URL.createObjectURL=blob=>{file=blob;return 'blob:http://localhost/export';};
 URL.revokeObjectURL=()=>{};
 anchor.click=function(){filename=this.download;};
 t.after(()=>{URL.createObjectURL=createURL;URL.revokeObjectURL=revokeURL;anchor.click=click;globalThis.fetch=previousFetch;globalThis.localStorage=previousStorage;});
 sessionStorage.setItem('rfq.export.settings.P',JSON.stringify({tab:'模板与映射',mapping:{draft:'evidence'}}));
 const props={project,requirements,snapshots,appState,permissionContext,actorRole:'SR',actorId,route:{page:destination},toast:()=>{}};
 await h.render(React.createElement(h.ExportPage,props));
 assert.doesNotMatch(h.host.textContent,/模板与映射|内部草稿|提交与定稿检查/);
 const preview=h.host.querySelector('tbody');
 assert.match(preview.textContent,/客户要求.*Comply.*批准的应答/);
 await act(async()=>button('导出文档',h.host).click());
 assert.deepEqual(downloads,[['/api/rfq/projects/P/snapshots/S/annotated-export?wordInBody=true','Bearer test-token']]);
 assert.equal(filename,'客户-正式应答.docx');
 assert.equal(await file.text(),'annotated original');

 await h.render(React.createElement(h.ExportPage,{...props,route:{page:destination,snapshotId:snapshot.id}}));
 assert.match(document.body.textContent,/本轮逐人最终评审/);
 assert.doesNotMatch(document.body.textContent,/模板|映射/);

 const revised=requirements.map(row=>({...row,draft:'修订中的应答'}));
 const revisedState={...appState,requirementsByProject:{P:revised}};
 await h.render(React.createElement(h.ExportPage,{...props,requirements:revised,appState:revisedState}));
 assert.match(h.host.querySelector('tbody').textContent,/修订中的应答/);
 assert.doesNotMatch(h.host.textContent,/模板|映射/);
 assert.equal(button('导出文档',h.host).disabled,true);
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
   if(page==='export') { assert.equal(exportButton(),undefined); }
   else { assert.equal(exportButton().getAttribute('aria-disabled'),'true'); }
  }
  await render('response');
  await act(async()=>exportButton().click());
  assert.ok(document.querySelector('[role="tooltip"]')?.textContent.includes('需审批'));
  assert.deepEqual(navigations,[]);

  await render('response',{actorRole:'技术',canDownload:false,finalReviewGate:{canExport:true,reason:'最终评审已通过'}});
  assert.equal(exportButton().getAttribute('aria-disabled'),'true');
  assert.equal(document.querySelector('[role="tooltip"]'),null);
  await act(async()=>exportButton().click());
  assert.match(document.querySelector('[role="tooltip"]')?.textContent||'',/没有导出权限.*SR/);
  assert.deepEqual(navigations,[]);

  await render('response',{finalReviewGate:{canExport:true}});
  assert.equal(exportButton().disabled,false);
  await act(async()=>exportButton().click());assert.deepEqual(navigations,['export']);
 }finally{await h.close();}
});
