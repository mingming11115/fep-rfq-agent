import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Window} from 'happy-dom';
import React,{act,useState} from 'react';

test('MySQL knowledge tabs import through the API and render server-reviewed records',async()=>{
  const window=new Window({url:'http://localhost'});
  Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage,sessionStorage:window.sessionStorage,
    Document:window.Document,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,
    ShadowRoot:window.ShadowRoot,getComputedStyle:window.getComputedStyle.bind(window),
    ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true});
  localStorage.setItem('fep-rfq-auth',JSON.stringify({token:'test-token',user:{id:'reviewer'}}));
  const cache=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));
  await mkdir(cache,{recursive:true});
  const outfile=cache+'knowledge-library-ui.mjs';
  await build({stdin:{contents:"export {default as Workspace} from './components/AdminWorkspace'; export {KnowledgePage,CapabilitiesPage} from './pages/ReferencePages'; export {default as HistoryPage} from './pages/HistoryKnowledgePage'; export {loadLibraryResources} from './knowledgeLibraryClient';",
    resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'jsx'},outfile,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
  const {Workspace,KnowledgePage,HistoryPage,CapabilitiesPage,loadLibraryResources}=await import(pathToFileURL(outfile));
  const {createRoot}=await import('react-dom/client');
  const calls=[];
  const resources={knowledge:[],historyDocuments:[],historyClauses:[],capabilities:[],models:[],processes:[],evidence:[]};
  const base='/api/rfq/business-units/BU';
  const draft={buId:'BU',scope:'BU共享',version:1,revision:0,status:'草稿'};
  const reply={...draft,id:'R',type:'standard',title:'实际导入的标准回复',requirement:'定位',answer:'支持',conditions:'工况',source:'RFQ-陌生项目.xlsx'};
  const unwantedReply={...reply,id:'R2',title:'误导入的标准回复'};
  const historyDoc={...draft,id:'D',name:'后端历史原件.docx',sourceType:'history-upload',parseStatus:'complete',sources:[{name:'原件',prefix:'main:'}]};
  const clause={...draft,id:'H',type:'history',documentId:'D',title:'历史条款',requirement:'定位',answer:'已确认',status:'待审核',submitterId:'someone-else',clauseNo:'3.2'};
  const unwantedClause={...clause,id:'H2',clauseNo:'3.3',requirement:'误识别的历史要求',status:'草稿',revision:2};
  const capability={...draft,id:'C',metric:'实际导入的能力',value:'≤5 μm',conditions:'工况'};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(path,request={})=>{
    assert.equal(request.headers.Authorization,'Bearer test-token');
    calls.push([path,request.method||'GET',request.body]);
    let data;
    switch(path){
      case base+'/resources':data=resources;break;
      case base+'/standard-replies/import':resources.knowledge=[reply,unwantedReply];data={items:[reply,unwantedReply],skippedRows:[4],errors:[{rowNumber:6,message:'缺少答复'}]};break;
      case base+'/standard-replies/R2/versions/1/delete':resources.knowledge=[reply];data={...unwantedReply,status:'已删除',revision:1};break;
      case base+'/standard-replies/R/versions/1/submit':data={...reply,status:'待审核',revision:1};resources.knowledge=[data];break;
      case base+'/history-rfq/import':resources.historyDocuments=[historyDoc];resources.historyClauses=[clause,unwantedClause];data={document:historyDoc,clauses:[clause,unwantedClause]};break;
      case base+'/history-rfq/clauses/H2/versions/1/delete':
        assert.equal(JSON.parse(request.body).revision,2);
        resources.historyClauses=[clause];data={...unwantedClause,status:'已删除',revision:3};break;
      case base+'/history-rfq/clauses/H/versions/1/publish':data={...clause,status:'已发布',revision:1};resources.historyClauses=[data];break;
      case base+'/capability-library/capabilities/import':resources.capabilities=[capability];data={items:[capability],skippedRows:[],errors:[]};break;
      case base+'/capability-library/capabilities/C/versions/1/submit':data={...capability,status:'待审核',revision:1};resources.capabilities=[data];break;
      default:throw new Error(`unexpected request: ${path}`);
    }
    return new Response(JSON.stringify({code:0,data}),{status:200});
  };
  const host=document.createElement('div');document.body.append(host);
  const app=createRoot(host);
  const state={dataSource:'mysql',actorRole:'BU管理员',actorId:'reviewer',businessUnits:[{id:'BU',name:'测试BU'}],projects:[],
    accountsById:{reviewer:{enabled:true,managedBuIds:['BU'],name:'管理员'}},
    buPersonnelByBuId:{BU:[{userId:'reviewer',enabled:true,roles:[],resourceQualifications:['knowledge-publish','capability-publish']}]},
  };
  function Harness({page}){
    const [rows,setRows]=useState(()=>structuredClone(resources));
    const appState={...state,resourcesByBuId:{BU:rows}};
    const permissionContext={state:appState,actorId:state.actorId,buId:'BU'};
    const props={permissionContext,appState,actorRole:state.actorRole,actorId:state.actorId,toast:()=>{},
      onLibraryRefresh:async buId=>setRows(await loadLibraryResources(buId))};
    const Page={knowledge:KnowledgePage,history:HistoryPage,capabilities:CapabilitiesPage}[page];
    return React.createElement(Workspace,{page,permissionContext,actorRole:state.actorRole,onNavigate:()=>{}},
      React.createElement(Page,props));
  }
  const settle=()=>new Promise(resolve=>setTimeout(resolve,40));
  async function click(label,parent=document.body){
    const button=[...parent.querySelectorAll('button')].find(el=>el.textContent.replace(/\s/g,'')===label.replace(/\s/g,'')&&!el.disabled);
    assert.ok(button,`missing button ${label}`);
    await act(async()=>{button.click();await settle();});
  }
  async function attach(label,name){
    const input=document.querySelector(`input[aria-label="${label}"]`);
    assert.ok(input);
    Object.defineProperty(input,'files',{configurable:true,value:[new File(['demo'],name)]});
    await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));
  }
  const render=page=>act(async()=>{app.render(React.createElement(Harness,{key:page,page}));await settle();});
  try{
    await render('knowledge');
    await click('批量导入',host);
    await attach('选择导入文件','标准.xlsx');
    await click('导入为草稿');
    assert.match(document.body.textContent,/第 6 行 · 缺少答复/);
    await click('完成');
    assert.match(host.textContent,/实际导入的标准回复/);
    await click('误导入的标准回复',host);
    await click('删除',host);
    await click('取消');
    assert.match(host.textContent,/误导入的标准回复/);
    await click('删除',host);
    await click('确认删除');
    assert.doesNotMatch(host.textContent,/误导入的标准回复/);
    await click('提交审核',host);
    await click('确认提交审核');
    assert.match(host.querySelector('.ref-knowledge-detail').textContent,/待审核/);

    await render('history');
    await click('上传历史 RFQ',host);
    await attach('历史 RFQ 文件','历史.docx');
    await attach('配套答复文件','答复.docx');
    await act(async()=>{document.querySelector('input[type="radio"][value="bu"]').click();await settle();});
    await click('上传并开始解析');
    assert.match(host.textContent,/后端历史原件.docx/);
    const historyRows=host.querySelector('.history-clause-panel tbody');
    await click('删除',historyRows);
    await click('取消');
    assert.match(historyRows.textContent,/误识别的历史要求/);
    await click('删除',historyRows);
    await click('确认删除');
    assert.doesNotMatch(historyRows.textContent,/误识别的历史要求/);
    assert.match(host.textContent,/后端历史原件.docx/);
    await act(async()=>{host.querySelector('.history-clause-panel tbody input[type="checkbox"]').click();await settle();});
    await click('批准发布',host);
    assert.match(host.querySelector('.history-clause-panel tbody').textContent,/已发布/);

    await render('capabilities');
    await click('Excel 上传',host);
    await attach('选择导入文件','能力.xlsx');
    await click('导入为草稿');
    await click('完成');
    assert.match(host.textContent,/实际导入的能力/);
    await click('提交审核',host);
    await click('确认提交审核');
    assert.match(host.querySelector('.generic-detail-card .ant-table-tbody').textContent,/待审核/);
    assert.equal(calls.find(([path])=>path.endsWith('/history-rfq/import'))[2].get('responseFile').name,'答复.docx');
    assert.equal(calls.filter(([,method])=>method==='POST').length,8);
    assert.deepEqual(Object.keys(localStorage),['fep-rfq-auth']);
  }finally{
    await act(async()=>app.unmount());
    globalThis.fetch=originalFetch;
    await window.happyDOM.close();
  }
});
