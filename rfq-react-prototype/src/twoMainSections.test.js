import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

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
  const button=(text,scope=node)=>[...scope.querySelectorAll('button')].find(item=>item.textContent===text);
  const drawer=()=>document.querySelector('.rfq-project-info-drawer');
  const inputByLabel=(label,scope)=>[...scope.querySelectorAll('label')].find(item=>item.querySelector(':scope > span')?.textContent.includes(label))?.querySelector('input,textarea');
  const refs=()=>node.querySelector('.response-reference-details');
  try{
    await render();assert.deepEqual([...node.querySelectorAll('[aria-label="RFQ 详情分区"] button')].map(item=>item.textContent),['应答','讨论']);
    assert.ok(button('项目信息'));assert.equal(refs().open,false);await click(refs().querySelector('summary'));
    assert.ok(refs().textContent.includes('Candidate report REF-1'));
    const originalRoute=props.route;
    for(const override of [{sourceVersion:'0'},{fileId:'HISTORIC-FILE'}]){
      props={...props,route:{...originalRoute,...override}};await render();assert.equal(refs().open,false,'changing the displayed source scope resets the reference disclosure');
      await click(refs().querySelector('summary'));assert.equal(refs().querySelector('[aria-label="本条关联证据"]').readOnly,true,'historical or mismatched sources retain read-only permissions');
      props={...props,route:originalRoute};await render();assert.equal(refs().open,false);await click(refs().querySelector('summary'));
    }
    const evidence=refs().querySelector('[aria-label="本条关联证据"]');assert.equal(evidence.value,'https://example.com/human');assert.equal(evidence.readOnly,role!=='SR');
    assert.equal(refs().querySelector('[aria-label="打开本条关联证据"]').href,'https://example.com/human');
    if(role==='SR'){await type(evidence,'https://example.com/edited');assert.equal(refs().open,true,'ordinary same-scope typing preserves the open reference disclosure');}
    const frame=node.querySelector('iframe');await click(button('项目信息'));assert.ok(drawer().classList.contains('ant-drawer-open'));
    const projectName=inputByLabel('项目名称',drawer());assert.equal(projectName.disabled,role!=='SR');
    if(role==='SR')await type(projectName,'Changed project');
    await click(drawer().querySelector('.ant-drawer-close'));await click(button('项目信息'));
    assert.equal(inputByLabel('项目名称',drawer()).value,role==='SR'?'Changed project':'Project','closing retains the unsaved settings form');
    assert.equal(evidence.value,role==='SR'?'https://example.com/edited':'https://example.com/human','opening information retains the response draft');assert.equal(node.querySelector('iframe'),frame);
    assert.equal(projectWrites.length,0);assert.equal(responseWrites.length,0,'view actions do not save drafts');
    if(role==='SR'){
      await type(inputByLabel('变更原因',drawer()),'Correct project name');await click(button('保存项目设置',drawer()));assert.equal(projectWrites[0].name,'Changed project');
    }else assert.equal(button('保存项目设置',drawer()),undefined);
    await click(drawer().querySelector('.ant-drawer-close'));
    if(role==='SR'){await click(button('保存草稿'));assert.equal(responseWrites[0].patch.evidence,'https://example.com/edited');assert.equal(confirmations.length,0);}
    await click(button('讨论'));assert.ok(node.querySelector('.annotation-panel'));await click(button('应答'));assert.equal(node.querySelector('.detail-clause-content').style.display,'flex','response can reopen on the same route');
    await click(button('下一条')||node.querySelector('button[aria-label="下一条"]'));assert.equal(refs().open,false,'a different clause starts with references collapsed');
    props={...props,route:{...props.route,page:'settings'},requirements:[]};await render();assert.ok(drawer().classList.contains('ant-drawer-open'),'legacy settings links open information even with no clauses');
    assert.deepEqual([...node.querySelectorAll('[aria-label="RFQ 详情分区"] button')].map(item=>item.textContent),['应答','讨论']);assert.ok(node.textContent.includes('应答项尚未生成'));
    props={...props,project:{...props.project,id:'Q',name:'Another project'},route:{page:'response',projectId:'Q'}};await render();await click(button('项目信息'));assert.equal(inputByLabel('项目名称',drawer()).value,'Another project','project changes cannot inherit the previous form draft');
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
