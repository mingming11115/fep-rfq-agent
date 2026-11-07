import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

test('operation records show only project history and remain read-only',async()=>{
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,handleDisabledFileLoadingAsSuccess:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  Object.assign(globalThis,{window,document:window.document,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,DOMParser:window.DOMParser,CSS:window.CSS,location:window.location,localStorage:window.localStorage,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
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
  const button=text=>[...node.querySelectorAll('button,[role="tab"]')].find(button=>button.textContent===text);
  const disclosure=text=>[...node.querySelectorAll('.detail-activity details')].find(group=>group.querySelector('summary')?.textContent.includes(text));
  const originalFetch=globalThis.fetch;
  try{
    await render();await act(async()=>{button('操作记录').click();await settle();});
    const history=()=>disclosure('操作记录');
    assert.ok(!node.querySelector('.annotation-panel'),'operation records exclude the annotation panel');
    assert.ok(!node.querySelector('.detail-annotations'),'operation records exclude annotations');
    assert.equal(button('批注当前条款'),undefined);
    assert.equal(disclosure('项目成员'),undefined);assert.equal(disclosure('全部批注'),undefined);
    assert.equal(node.querySelectorAll('.detail-activity-group').length,1);
    assert.equal(history().open,true,'operation records are visible on entry');
    assert.equal(history().querySelectorAll('ol > li').length,1,'records form a chronological list');
    assert.ok(history().textContent.includes('Project operation'));
    assert.ok(history().textContent.includes('Today · Actor'));
    assert.ok(history().textContent.includes('Keep history'));
    assert.ok(!history().textContent.includes('Foreign operation'));
    props={...props,appState:{...props.appState,audit:[{id:'E2',object:'P',action:'New operation',actor:'Actor',time:'Now'},...props.appState.audit]}};await render();
    assert.ok(history().textContent.includes('New operation'));
    await act(async()=>{history().querySelector('summary').click();await settle();});
    assert.equal(history().open,false);
    await render();assert.equal(history().open,false,'refresh preserves user disclosure state');
    assert.equal(writes.length,0,'viewing records makes no business writes');
    assert.equal(navigations.length,0);
    props={...props,project:{...project,id:'Q'},requirements:[],reviews:[],route:{page:'activity',projectId:'Q'},appState:{accountsById:{}}};await render();
    assert.equal(history().open,true,'a different project starts expanded');
    assert.ok(history().textContent.includes('本项目暂无操作记录。'));
    assert.equal(disclosure('项目成员'),undefined);assert.equal(disclosure('全部批注'),undefined);

    const requests=[];
    const assignment={id:'assigned',action:'分派条款确认人',objectType:'requirement',objectId:'R1',actorId:'sr',createdAt:'2026-11-07T03:52:27Z',result:'成功',detail:'null -> mysql-demo-technical：指派确认人'};
    let databaseEvents=[assignment];
    globalThis.fetch=async (url,options)=>{
      requests.push([url,options.method||'GET']);
      return {ok:true,json:async()=>({code:0,data:databaseEvents})};
    };
    props={...props,appState:{dataSource:'mysql',accountsById:{sr:{name:'张明'},'mysql-demo-technical':{name:'李工'},'mysql-demo-technical-2':{name:'王工'}}}};
    await render();
    const firstEntry=history().querySelector('ol > li');
    assert.equal(firstEntry.querySelector('time').dateTime,assignment.createdAt);
    assert.match(firstEntry.textContent,/分派条款确认人.*成功.*张明.*默认确认人 → 李工/);
    assert.match(firstEntry.querySelector('p').textContent,/原因.*指派确认人/);
    await act(async()=>{button('应答').click();await settle();});
    databaseEvents=[{...assignment,id:'reassigned',detail:'mysql-demo-technical -> mysql-demo-technical-2：改派确认人：技术分工'},assignment];
    await act(async()=>{button('操作记录').click();await settle();});
    assert.match(history().textContent,/李工 → 王工.*改派确认人：技术分工.*默认确认人 → 李工/);
    assert.deepEqual(requests,[['/api/rfq/projects/Q/activity','GET'],['/api/rfq/projects/Q/activity','GET']]);

    const confirmed={...rows[0],status:'已确认',version:5,backendVersion:0,confirmationVersion:2,draft:'交期 8 周'};
    const restored=[];
    globalThis.fetch=async url=>{
      assert.equal(url,'/api/rfq/requirements/R1/response/history');
      return {ok:true,json:async()=>({code:0,data:{versions:[
        {confirmationVersion:2,confirmedBy:'B',draft:'交期 8 周'},
        {confirmationVersion:1,confirmedBy:'A',draft:'交期 10 周'},
      ],checkpoints:[]}})};
    };
    props={...props,project,requirements:[confirmed],route:{page:'response',projectId:'P',requirementId:'R1'},actorRole:'SR',
      canBusinessAction:()=>true,onRestoreConfirmation:(id,version,entry)=>{
        restored.push([id,version,entry.kind,entry.historyVersion]);
        props={...props,requirements:[{...confirmed,status:'待确认',version:6,draft:'交期 10 周',restoredFromVersion:1}]};
        root.render(React.createElement(ResponsePage,props));
        return true;
      }};
    await render();
    await act(async()=>{button('确认历史').click();await settle();});
    const comparison=document.querySelector('.rfq-confirm-history-comparison');
    assert.match(comparison.textContent,/交期 8 周.*交期 10 周/);
    const restoreButton=scope=>[...scope.querySelectorAll('button')].find(candidate=>candidate.textContent==='恢复为草稿');
    await act(async()=>{restoreButton(document.querySelector('.rfq-confirm-history-footer')).click();await settle();});
    await act(async()=>{restoreButton(document.querySelector('.ant-modal')).click();await settle();});
    assert.deepEqual(restored,[['R1',5,'confirmation',1]]);
    assert.match(node.querySelector('.response-confirmation-meta').textContent,/恢复自 V1/);
  }finally{globalThis.fetch=originalFetch;await act(async()=>root.unmount());await window.happyDOM.cancelAsync();}
});
