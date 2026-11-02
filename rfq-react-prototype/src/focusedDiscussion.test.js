import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

test('collaboration starts on the current clause while project records remain optional and read-only',async()=>{
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,handleDisabledFileLoadingAsSuccess:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,DOMParser:window.DOMParser,CSS:window.CSS,location:window.location,localStorage:window.localStorage,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
  const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});const output=path.join(directory,'focused-discussion-test.mjs');
  await build({entryPoints:[fileURLToPath(new URL('./pages/ResponsePage.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{"BASE_URL":"/"}'},plugins:[{name:'raw-template',setup(b){b.onResolve({filter:/\.html\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}]});
  const {ResponsePage}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');
  const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
  const project={id:'P',name:'Project',buId:'BU'},rows=[{id:'R1',sourceFileId:'F1',source:'First.docx',sourceVersion:'1',clause:'1',title:'First clause',original:'First source',conclusion:'Comply',status:'待处理',version:1},{id:'R2',sourceFileId:'F2',source:'Second.docx',sourceVersion:'1',clause:'2',title:'Second clause',original:'Second source',conclusion:'Comply',status:'待处理',version:1}];
  const comment=(id,row,text,version='1')=>({id,anchor:{projectId:'P',fileId:row.sourceFileId,sourceVersion:version,requirementId:row.id,locator:{quote:row.original}},text,quote:row.original,status:'未解决',createdBy:'author',replies:[],linkedIssues:{}});
  const comments=[comment('C1',rows[0],'Current discussion'),comment('C2',rows[1],'Other discussion'),comment('OLD',rows[0],'Historic discussion','0')];
  const writes=[],navigations=[];let props={project,requirements:rows,reviews:[],route:{page:'response',projectId:'P',requirementId:'R1',fileId:'F1',sourceVersion:'1'},appState:{accountsById:{},commentsByProject:{P:comments},membersByProject:{P:[{id:'member',name:'Team member',role:'Reviewer',status:'生效'}]},audit:[{id:'E',object:'R1',action:'Project operation',detail:'Keep history',actor:'Actor',time:'Today'},{id:'FOREIGN',object:'Q',action:'Foreign operation'}]},actorRole:'最终审批人',actorId:'reader',canBusinessAction:()=>false,onAppUpdate:value=>writes.push(value),navigate:(...value)=>navigations.push(value),toast:()=>{}};
  const settle=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const render=async()=>act(async()=>{root.render(React.createElement(ResponsePage,props));await settle();});
  const button=text=>[...node.querySelectorAll('button')].find(button=>button.textContent===text);
  const disclosure=text=>[...node.querySelectorAll('.detail-activity details')].find(group=>group.querySelector('summary')?.textContent.includes(text));
  try{
    await render();await act(async()=>{button('协作记录').click();await settle();});
    const current=node.querySelector('.annotation-panel');assert.ok(current,'entering collaboration shows discussion without first selecting a comment');
    assert.ok(current.textContent.includes('Current discussion'));assert.ok(!current.textContent.includes('Other discussion'));assert.ok(!current.textContent.includes('Historic discussion'));
    assert.equal(current.querySelectorAll('textarea').length,0,'read-only discussion retains read-only permissions');
    for(const label of ['项目成员','全部批注','操作记录'])assert.equal(disclosure(label)?.open,false,`${label} starts closed`);
    await act(async()=>{disclosure('项目成员').querySelector('summary').click();await settle();});
    assert.equal(disclosure('项目成员').open,true);assert.equal(disclosure('全部批注').open,false);
    props={...props,appState:{...props.appState,audit:[...props.appState.audit,{id:'E2',object:'P',action:'New operation',actor:'Actor',time:'Now'}]}};await render();
    assert.equal(disclosure('项目成员').open,true,'record refresh preserves the expanded group');
    await act(async()=>{disclosure('操作记录').querySelector('summary').click();disclosure('全部批注').querySelector('summary').click();await settle();});
    assert.ok(disclosure('操作记录').textContent.includes('New operation'));assert.ok(!disclosure('操作记录').textContent.includes('Foreign operation'));
    assert.ok(disclosure('全部批注').textContent.includes('历史版本'));
    const other=[...disclosure('全部批注').querySelectorAll('button')].find(button=>button.textContent.includes('Other discussion'));
    await act(async()=>{other.click();await settle();});
    assert.ok(node.querySelector('.annotation-panel').textContent.includes('Other discussion'));
    assert.ok(!node.querySelector('.annotation-panel').textContent.includes('Current discussion'));
    assert.equal(navigations.at(-1)[1],'R2');assert.equal(navigations.at(-1)[2].fileId,'F2');
    assert.equal(disclosure('项目成员').open,true,'same-project clause changes retain disclosure state');assert.equal(writes.length,0,'viewing discussions and records makes no business writes');
    props={...props,project:{...project,id:'Q'},requirements:[],reviews:[],route:{page:'activity',projectId:'Q'},appState:{accountsById:{}}};await render();
    for(const label of ['项目成员','全部批注','操作记录'])assert.equal(disclosure(label)?.open,false,'a new empty project starts collapsed');
  }finally{await act(async()=>root.unmount());await window.happyDOM.cancelAsync();}
});
