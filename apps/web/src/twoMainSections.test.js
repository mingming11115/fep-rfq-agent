import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';
import {writeResponse} from './responseClient.js';

async function harness(name){
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,handleDisabledFileLoadingAsSuccess:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  Object.assign(globalThis,{window,document:window.document,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,DOMParser:window.DOMParser,CSS:window.CSS,location:window.location,localStorage:window.localStorage,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
  const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});const output=path.join(directory,`two-main-sections-${name}.mjs`);
  await build({stdin:{contents:"export {default as ProjectWorkspace} from './components/ProjectWorkspace.jsx';export {SettingsPage} from './pages/ManagementPages.jsx';export {ResponsePage} from './pages/ResponsePage.jsx';export {default as AssessmentPanel} from './components/AssessmentPanel.jsx';",resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'jsx'},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{"BASE_URL":"/"}'},plugins:[{name:'raw-template',setup(b){b.onResolve({filter:/\.html\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}]});
  const components=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
  const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const click=async element=>act(async()=>{assert.ok(element,'requested visible action exists');element.click();await settle();});
  const type=async(input,value)=>act(async()=>{assert.ok(input);Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));await settle();});
  return {...components,window,node,root,settle,click,type,async close(){await act(async()=>root.unmount());await window.happyDOM.cancelAsync();}};
}

// Catch unmounting drafts when information closes, bypassed saves, or allowing
// the relocated form to become editable for a read-only identity.
for(const role of ['SR','最终审批人'])test(`${role} uses two sections and project information without losing drafts`,async()=>{
  const h=await harness(role),{ProjectWorkspace,SettingsPage,ResponsePage,node,root,settle,click,type}=h;
  const projectWrites=[],responseWrites=[],confirmations=[],navigations=[];
  const row={id:'R1',projectId:'P',sourceFileId:'F',source:'Customer.docx',sourceVersion:'1',clause:'1.1',title:'First clause',original:'First source',conclusion:'Comply',draft:'Human answer',evidence:'https://example.com/human',matchLevel:'standard',score:95,status:'待处理',version:1,systemRecommendation:{original:'First source',sourceVersion:'1',conclusion:'Comply',evidence:'Candidate report REF-1',version:'V2'}};
  let props={project:{id:'P',name:'Project',customer:'Customer',owner:'Owner',ownerId:'',deadline:'2026-11-20',equipment:'Baseline',buId:'BU'},requirements:[row,{...row,id:'R2',clause:'1.2',title:'Second clause',original:'Second source',evidence:'Second saved evidence',systemRecommendation:undefined}],reviews:[],route:{page:'response',projectId:'P',requirementId:'R1',fileId:'F',sourceVersion:'1'},appState:{accountsById:{},buPersonnelByBuId:{},commentsByProject:{},membersByProject:{},audit:[]},actorRole:role,actorId:'actor',canBusinessAction:()=>role==='SR',onAppUpdate:()=>{},onPersonnelAction:()=>{},toast:()=>{},logEvent:()=>{},navigate:(...value)=>navigations.push(value),onConfirm:(...value)=>confirmations.push(value)};
  function paint(){
    const settings=React.createElement(SettingsPage,{...props,embedded:true,onProjectChange:patch=>{projectWrites.push(patch);props={...props,project:{...props.project,...patch}};paint();return true;}});
    const response=React.createElement(ResponsePage,{...props,onUpdateRequirement:(id,patch)=>{responseWrites.push({id,patch});props={...props,requirements:props.requirements.map(item=>item.id===id?{...item,...patch,version:item.version+1}:item)};paint();return true;}});
    root.render(React.createElement(ProjectWorkspace,{...props,projectInfoPanel:settings,onNavigate:props.navigate,onReturn:()=>{}},response));
  }
  const render=async()=>act(async()=>{paint();await settle();});
  const button=(text,scope=node)=>[...scope.querySelectorAll('button,[role=tab]')].find(item=>item.textContent===text);
  const drawer=()=>document.querySelector('.rfq-project-info-drawer');
  const inputByLabel=(label,scope)=>[...scope.querySelectorAll('label')].find(item=>item.querySelector(':scope > span')?.textContent.includes(label))?.querySelector('input,textarea');
  const refs=()=>node.querySelector('.response-reference-details');
  try{
    await render();assert.deepEqual([...node.querySelectorAll('[aria-label="RFQ 详情分区"] [role="tab"]')].map(item=>item.textContent),['应答','操作记录']);
    const responseState=()=>node.querySelector('[aria-label="应答保存状态"]');assert.equal(responseState(),null);
    assert.ok(button('项目信息'));assert.equal(refs().open,false);await click(refs().querySelector('summary'));
    assert.ok(refs().textContent.includes('Candidate report REF-1'));
    const originalRoute=props.route;
    for(const override of [{sourceVersion:'0'},{fileId:'HISTORIC-FILE'}]){
      props={...props,route:{...originalRoute,...override}};await render();assert.equal(refs().open,false,'changing the displayed source scope resets the reference disclosure');
      await click(refs().querySelector('summary'));assert.equal(refs().querySelector('textarea'),null);
      props={...props,route:originalRoute};await render();assert.equal(refs().open,false);await click(refs().querySelector('summary'));
    }
    const evidence=refs().querySelector('[aria-label="本条关联证据"]');assert.equal(evidence.textContent,'Candidate report REF-1');assert.equal(refs().querySelector('textarea'),null);
    const frame=node.querySelector('iframe');await click(button('项目信息'));assert.ok(drawer().classList.contains('ant-drawer-open'));
    const projectName=inputByLabel('项目名称',drawer());assert.equal(projectName.disabled,role!=='SR');
    if(role==='SR') { await type(projectName,'Changed project'); }
    await click(drawer().querySelector('.ant-drawer-close'));await click(button('项目信息'));
    assert.equal(inputByLabel('项目名称',drawer()).value,role==='SR'?'Changed project':'Project','closing retains the unsaved settings form');
    assert.equal(projectWrites.length,0);assert.equal(responseWrites.length,0,'view actions do not save drafts');
    if(role==='SR'){
      await type(inputByLabel('变更原因',drawer()),'Correct project name');await click(button('保存项目设置',drawer()));assert.equal(projectWrites[0].name,'Changed project');
    }else { assert.equal(button('保存项目设置',drawer()),undefined); }
    await click(drawer().querySelector('.ant-drawer-close'));
    await click(button('操作记录'));assert.ok(node.querySelector('.detail-activity'));assert.equal(node.querySelector('.annotation-panel'),null);await click(button('应答'));assert.equal(node.querySelector('.detail-clause-content').style.display,'flex','response can reopen on the same route');
    await click(button('下一条')||node.querySelector('button[aria-label="下一条"]'));assert.equal(refs().open,false,'a different clause starts with references collapsed');
    props={...props,route:{...props.route,page:'settings'},requirements:[]};await render();assert.ok(drawer().classList.contains('ant-drawer-open'),'legacy settings links open information even with no clauses');
    assert.deepEqual([...node.querySelectorAll('[aria-label="RFQ 详情分区"] [role="tab"]')].map(item=>item.textContent),['应答','操作记录']);assert.ok(node.textContent.includes('应答项尚未生成'));
    props={...props,project:{...props.project,id:'Q',name:'Another project'},route:{page:'response',projectId:'Q'}};await render();await click(button('项目信息'));assert.equal(inputByLabel('项目名称',drawer()).value,'Another project','project changes cannot inherit the previous form draft');
  }finally{await h.close();}
});

test('batch confirmation runs from the directory and retains excluded and failed selections',async()=>{
  const h=await harness('direct-batch'),{ResponsePage,node,root,settle,click}=h;
  const confirmations=[];
  const row={id:'R1',projectId:'P',sourceFileId:'F',source:'Customer.docx',sourceVersion:'1',clause:'1.1',title:'First clause',original:'Source',conclusion:'Comply',draft:'Answer',status:'待确认',matchLevel:'standard',score:95,version:1};
  let props={project:{id:'P',name:'Project',buId:'BU'},requirements:[row,{...row,id:'R2',clause:'1.2',title:'Low confidence',score:60},{...row,id:'R3',clause:'1.3',title:'Rejected save'},{...row,id:'R4',sourceFileId:'OTHER',source:'Other.docx',title:'Other file'}],reviews:[],route:{page:'response',projectId:'P',requirementId:'R1',fileId:'F',sourceVersion:'1'},appState:{accountsById:{},commentsByProject:{},membersByProject:{},audit:[]},actorRole:'SR',actorId:'actor',canBusinessAction:()=>true,onAppUpdate:()=>{},navigate:()=>{},toast:()=>{},logEvent:()=>{}};
  function paint(){root.render(React.createElement(ResponsePage,{...props,onConfirm:(id,version)=>{
    confirmations.push([id,version]);
    if(id==='R3') { return false; }
    props={...props,requirements:props.requirements.map(item=>item.id===id?{...item,status:'已确认'}:item)};paint();return true;
  }}));}
  try{
    await act(async()=>{paint();await settle();});
    await click(node.querySelector('[aria-label="展开文档目录"]'));
    await click(node.querySelector('[aria-label="全选当前筛选条款"]'));
    await click([...node.querySelectorAll('.detail-outline-footer button')].find(button=>button.textContent.includes('批量确认')));
    assert.deepEqual(confirmations,[['R1',1],['R3',1]],'one click submits only eligible selected clauses');
    const result=document.querySelector('.ant-modal');
    assert.ok(result.textContent.includes('批量确认结果'));
    assert.ok(result.textContent.includes('不符合标准回复相似度'));
    assert.ok(result.textContent.includes('确认失败'));
    const checked=title=>node.querySelector(`[aria-label="选择条款 ${title}"]`).checked;
    assert.equal(checked('1.1 First clause'),false);
    assert.equal(checked('1.2 Low confidence'),true);
    assert.equal(checked('1.3 Rejected save'),true);
    await click([...result.querySelectorAll('button')].find(button=>button.textContent.replace(/\s/g,'')==='完成'));
    // Happy DOM does not emit the browser's CSS animation-end event.
    await act(async()=>{result.dispatchEvent(new h.window.Event('animationend',{bubbles:true}));});
    assert.equal(Boolean(document.querySelector('.ant-modal')),false,'finishing closes the batch result dialog');
    assert.deepEqual(confirmations,[['R1',1],['R3',1]],'finishing does not repeat any confirmation');
  }finally{await h.close();}
});

test('MySQL batch uses current standard matches while preserving unconfirmed suggestions',async t=>{
  const h=await harness('mysql-batch'),{ResponsePage,node,root,settle,click}=h;
  const row={id:'R1',projectId:'P',sourceFileId:'F',source:'Customer.docx',sourceVersion:'V1.0',
    clause:'1.1',title:'Prefilled clause',original:'Source',conclusion:'',draft:'',conditions:'',evidence:'',
    status:'待确认',matchLevel:'none',score:0,version:1,backendVersion:0};
  const saved={...row,clause:'1.2',title:'Saved clause',conclusion:'Comply',draft:'Standard answer',evidence:'S1 · v1'};
  let requirements=[row,{...saved,id:'R2'},{...saved,id:'R3',clause:'1.3',title:'Unverified conditions',conditions:'Option A'},
    {...saved,id:'R4',clause:'1.4',title:'Conditional answer',conclusion:'有条件 Comply'},
    {...saved,id:'R5',clause:'1.5',title:'Open review'},
    {...saved,id:'R6',clause:'1.6',title:'Already adopted',matchReference:{library:'standard_reply',runId:'RUN-R6',candidateId:'S1',version:1}},
    {...row,id:'R7',clause:'1.7',title:'Conclusion only',conclusion:'Comply'}];
  const reviews=[{id:'V1',requirementId:'R5',kind:'review',status:'待处理'}];
  const props={project:{id:'P',name:'Project',buId:'BU'},reviews,route:{page:'response',projectId:'P',requirementId:'R1',fileId:'F',sourceVersion:'V1.0'},
    appState:{dataSource:'mysql',accountsById:{},commentsByProject:{},membersByProject:{}},
    actorRole:'SR',actorId:'actor',canBusinessAction:()=>true,onAppUpdate:()=>{},navigate:()=>{},toast:()=>{}};
  const writes=[];
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    const [,id,action]=url.match(/\/requirements\/(R\d+)\/(match-result|response\/confirm)$/) || [];
    if(action==='match-result') {
      const candidate={id:'S1',version:1,businessSimilarity:0.95,answer:'Standard answer',
        conditions:id==='R3'?'Option A':'',conditionStatus:id==='R3'?'unverified':'not_specified'};
      return Response.json({code:0,data:{runId:`RUN-${id}`,status:'completed',sourceRequirementVersion:0,
        result:{matchedLibrary:'standard_reply',conclusion:'待确认',stages:{standard_reply:{status:'hit',candidates:[candidate]}}}}});
    }
    if(action==='response/confirm') {
      const body=JSON.parse(options.body);
      writes.push({id,...body});
      const current=requirements.find(item=>item.id===id);
      return Response.json({code:0,data:{...current,...body.patch,status:'已确认',version:current.version+1}});
    }
    return Response.json({code:0,data:null});
  });
  function paint(){root.render(React.createElement(ResponsePage,{...props,requirements,onConfirm:async (id,version,patch,choice)=>{
    const current=requirements.find(item=>item.id===id);
    assert.equal(version,current.version);
    const saved=await writeResponse(current,patch,true,undefined,choice);
    requirements=requirements.map(item=>item.id===id?saved:item);
    paint();
    return true;
  }}));}
  const batchButton=()=>[...node.querySelectorAll('.detail-outline-footer button')].find(button=>button.textContent.includes('批量确认'));
  const field=label=>node.querySelector(`.response-form [aria-label="${label}"]`);
  const resultRow=(dialog,title)=>[...dialog.querySelectorAll('tbody tr')].find(item=>item.textContent.includes(title));
  try{
    await act(async()=>{paint();await settle();});
    await click(node.querySelector('[aria-label="展开文档目录"]'));
    await click(node.querySelector('[aria-label="全选当前筛选条款"]'));
    assert.equal(batchButton().disabled,false,'prefill must not disable the whole batch');
    await click(batchButton());
    assert.deepEqual(writes,[{id:'R2',version:1,sourceVersion:0,matchRunId:'RUN-R2',candidateId:'S1'},
      {id:'R6',version:1,sourceVersion:0},
      {id:'R7',version:1,sourceVersion:0,matchRunId:'RUN-R7',candidateId:'S1'}]);
    const result=document.querySelector('.ant-modal');
    assert.match(resultRow(result,'Saved clause').textContent,/已确认.*确认成功/);
    assert.match(resultRow(result,'Prefilled clause').textContent,/已排除/);
    assert.match(resultRow(result,'Unverified conditions').textContent,/已排除/);
    assert.match(resultRow(result,'Conditional answer').textContent,/已排除/);
    assert.match(resultRow(result,'Open review').textContent,/已排除/);
    await click([...result.querySelectorAll('button')].find(button=>button.textContent.replace(/\s/g,'')==='完成'));
    await act(async()=>{result.dispatchEvent(new h.window.Event('animationend',{bubbles:true}));});
    await click(node.querySelector('[aria-label="人工最终结论"] input[value="Comply"]'));
    for (const label of ['对外答复','适用条件','应答依据']) { assert.ok(!field(label),`${label} is hidden for Comply`); }
    await click(node.querySelector('[aria-label="人工最终结论"] input[value="有条件 Comply"]'));
    const wording = node.querySelector('section[aria-label="AI 推荐话术"]');
    assert.ok(wording, 'conditional Comply shows editable recommended wording');
    assert.equal(field('对外答复'), null, 'the response card has no separate external reply field');
    assert.equal(node.querySelector('.response-current-card [aria-label="应答依据"]'), null,
      'the response card has no manual evidence input');
    assert.equal(field('适用条件'), null, 'conditions belong in the answer text');
    await click(node.querySelector('[aria-label="人工最终结论"] input[value="Comply"]'));
    await click(batchButton());
    assert.deepEqual(writes.at(-1),{id:'R1',version:1,sourceVersion:0,matchRunId:'RUN-R1',candidateId:'S1',
      patch:{original:'Source',conclusion:'Comply',draft:'Standard answer',remark:'',evidence:'S1 · v1'}});
    assert.equal(writes.length,4,'retry never resubmits previously confirmed clauses');
    assert.match(resultRow(document.querySelector('.ant-modal'),'Prefilled clause').textContent,/已确认.*确认成功/);
  }finally{await h.close();}
});

test('folded references do not reveal denied or failed candidate evidence',async()=>{
  const h=await harness('restricted');
  try{
    for(const retrieval of ['denied','failed']){
      await act(async()=>{h.root.render(React.createElement(h.AssessmentPanel,{project:{id:'P'},row:{id:'R',original:'Source',matchLevel:'standard',score:95},suggestion:{conclusion:'Comply',evidence:'RESTRICTED CANDIDATE',version:'SECRET-V2'},retrieval}));await h.settle();});
      const details=h.node.querySelector('.response-reference-details');assert.ok(details);await h.click(details.querySelector('summary'));assert.ok(!h.node.textContent.includes('RESTRICTED CANDIDATE'));assert.ok(!h.node.textContent.includes('SECRET-V2'));
    }
  }finally{await h.close();}
});


test('technical users enter their own pending card and reselect only when identity or project changes',async()=>{
 const h=await harness('personal-entry'),{ResponsePage,node,root,settle}=h;
 const rows=['other','me'].map((actor,index)=>({id:'ENTRY-'+index,projectId:'P',sourceFileId:'F',source:'Customer.docx',sourceVersion:'1',clause:'9.'+index,title:'Assigned '+actor,original:'Source '+actor,conclusion:'Comply',status:'待确认',version:1,confirmationAssigneeId:actor,confirmationAssignmentSource:'explicit'}));
 let props={project:{id:'P',name:'Entry',buId:'BU'},requirements:rows,reviews:[],route:{page:'response',projectId:'P'},appState:{dataSource:'mysql',accountsById:{},commentsByProject:{},membersByProject:{},audit:[]},actorRole:'技术',actorId:'me',canBusinessAction:()=>false,navigate:()=>{},toast:()=>{}};
 const render=async()=>act(async()=>{root.render(React.createElement(ResponsePage,props));await settle();});
 const title=()=>node.querySelector('.response-card-title-row h2')?.textContent;
 try{
  await render();assert.equal(title(),'Assigned me');
  props={...props,requirements:rows.map(row=>({...row}))};await render();assert.equal(title(),'Assigned me');
  props={...props,actorId:'other'};await render();assert.equal(title(),'Assigned other');
  props={...props,actorId:'me',focusedRequirementId:'ENTRY-0',route:{...props.route,requirementId:'ENTRY-0'}};await render();assert.equal(title(),'Assigned other','explicit links retain their target');
 }finally{await h.close();}
});

test('only mine scopes response navigation to the current account assignments',async t=>{
 const h=await harness('only-mine'),{ResponsePage,node,root,settle,click}=h;
 const row={projectId:'P',sourceFileId:'F',source:'Customer.docx',sourceVersion:'1',original:'Source',conclusion:'Comply',status:'待确认',version:1,confirmationAssignmentSource:'explicit'};
 const requirements=[
  {...row,id:'R1',clause:'1',title:'Other confirmer',confirmationAssigneeId:'other'},
  {...row,id:'R2',clause:'2',title:'My confirmation',confirmationAssigneeId:'me'},
  {...row,id:'R3',clause:'3',title:'Unassigned'},
  {...row,id:'R4',clause:'4',title:'My completed confirmation',confirmationAssigneeId:'me',status:'已确认'},
  {...row,id:'R5',clause:'5',title:'My review',confirmationAssigneeId:'other'},
 ];
 const audit=[
  {id:'A1',objectId:'R1',objectType:'requirement',action:'Other user updated a response',actorId:'other',createdAt:'2026-11-09T03:00:00Z'},
  {id:'A2',objectId:'R2',objectType:'requirement',action:'I updated a response',actorId:'me',createdAt:'2026-11-09T02:00:00Z'},
 ];
 t.mock.method(globalThis,'fetch',async url=>{
  assert.equal(url,'/api/rfq/projects/P/activity');
  return Response.json({code:0,data:audit});
 });
 const props={project:{id:'P',name:'Project',buId:'BU'},requirements,reviews:[{id:'V1',title:'Review',requirementId:'R5',reviewerIds:['me'],status:'待处理'}],route:{page:'response',projectId:'P'},appState:{dataSource:'mysql',accountsById:{},commentsByProject:{},membersByProject:{}},actorRole:'SR',actorId:'me',canBusinessAction:()=>false,navigate:()=>{},toast:()=>{}};
 const render=async overrides=>act(async()=>{root.render(React.createElement(ResponsePage,{...props,...overrides}));await settle();});
 const filter=()=>[...node.querySelectorAll('label')].find(label=>label.textContent==='只看我的')?.querySelector('input');
 const title=()=>node.querySelector('.response-card-title-row h2')?.textContent;
 const next=()=>click(node.querySelector('[aria-label="下一条"]'));
 try{
  await render();
  assert.ok(filter(),'the response header offers a personal filter');
  const [responseTab,activityTab]=node.querySelectorAll('[aria-label="RFQ 详情分区"] [role="tab"]');
  assert.ok(filter().closest('.ant-tabs-tab')===responseTab.closest('.ant-tabs-tab'),'the response tab indicator covers the filter');
  assert.equal(responseTab.contains(filter()),false,'the checkbox has its own focus target outside the tab button');
  assert.equal(h.window.getComputedStyle(filter().nextElementSibling).width,'12px');
  assert.equal(filter().checked,false);
  assert.equal(title(),'Other confirmer');
  await click(node.querySelector('[aria-label="展开文档目录"]'));
  const directoryRow=label=>node.querySelector(`[aria-label="选择条款 ${label}"]`);
  await click(directoryRow('1 Other confirmer'));
  await click(filter());
  assert.equal(title(),'My confirmation');
  assert.equal(directoryRow('1 Other confirmer'),null);
  assert.ok(directoryRow('2 My confirmation'));
  assert.equal([...node.querySelectorAll('.detail-outline-footer button')].find(button=>button.textContent.includes('批量确认')).disabled,true);
  await click(activityTab);
  assert.equal(filter().disabled,true);
  await click(filter().closest('label'));
  assert.equal(activityTab.getAttribute('aria-selected'),'true');
  assert.deepEqual([...node.querySelectorAll('.detail-timeline strong')].map(event=>event.textContent),audit.map(event=>event.action));
  await click(responseTab);
  assert.equal(filter().checked,true);
  assert.equal(title(),'My confirmation');
  await next();
  assert.equal(title(),'My completed confirmation');
  await next();
  assert.equal(title(),'My review');
  await next();
  assert.equal(title(),'My confirmation');
  await click(filter());
  await next();
  assert.equal(title(),'Unassigned');
  await render({actorId:'nobody'});
  await click(filter());
  assert.equal(title(),undefined);
  assert.ok(node.textContent.includes('没有符合条件的应答项'));
  await click([...node.querySelectorAll('button')].find(button=>button.textContent==='查看全部应答项'));
  assert.equal(filter().checked,false);
  assert.equal(title(),'Other confirmer');
 }finally{await h.close();}
});
