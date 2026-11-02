import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

test('project source pane opens the Word/PDF HTML entry, leaves loading after handshake, and preserves read-only fallback',async()=>{
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,handleDisabledFileLoadingAsSuccess:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  Object.assign(globalThis,{window,document:window.document,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,
    DOMParser:window.DOMParser,location:window.location,localStorage:window.localStorage,ResizeObserver:class{observe(){}disconnect(){}},getComputedStyle:window.getComputedStyle.bind(window),
    requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
  const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});
  const output=path.join(directory,'craft-source-pane-test.mjs');
  await build({entryPoints:[fileURLToPath(new URL('./components/CraftSourcePane.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{"BASE_URL":"/"}'},
    plugins:[{name:'raw-template',setup(b){b.onResolve({filter:/\.html\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}]});
  const {default:CraftSourcePane}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  const source={projectId:'P',fileId:'F',sourceVersion:'V1'},user={id:'actor',name:'Alex'};
  const ref={id:'file-id',name:'real.docx',fileType:'docx',access:'cap',...source,revision:0};
  const rows=[{id:'R',projectId:'P',sourceFileId:'F',sourceVersion:'V1',original:'Original source',sourcePage:1,conclusion:'Comply'}];
  let responseMeta=ref,saveFailure=false;const saves=[],outlines=[];
  const toolbar={fileSelector:React.createElement('select',{'aria-label':'应答来源文件'},React.createElement('option',null,'Customer RFQ.docx')),actions:React.createElement('button',{'aria-label':'展开文档目录'},'目录')};
  const directoryPanel=React.createElement('aside',{'aria-label':'文件目录'},'Current directory');
  const previousFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{
    if(options?.method==='PUT'){
      saves.push({url,options});
      if(saveFailure)return new Response(JSON.stringify({code:503,msg:'存储暂不可用'}),{status:503});
      responseMeta={...responseMeta,revision:responseMeta.revision+1,savedAt:new Date().toISOString()};
      return new Response(JSON.stringify({code:0,data:responseMeta}));
    }
    return url.includes('/download')?new Response(new Blob(['native file bytes'])):new Response(JSON.stringify({code:0,data:responseMeta}));
  };
  const settle=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const originalTimeout=window.setTimeout.bind(window),originalClear=window.clearTimeout.bind(window),noticeTimers=new Map();
  let clock=0,timerId=1000000;
  window.setTimeout=(callback,delay,...args)=>{if(delay!==2000)return originalTimeout(callback,delay,...args);const id=timerId++;noticeTimers.set(id,{at:clock+delay,callback:()=>callback(...args)});return id;};
  window.clearTimeout=id=>{if(!noticeTimers.delete(id))originalClear(id);};
  const advance=async milliseconds=>act(async()=>{clock+=milliseconds;for(const [id,timer] of [...noticeTimers])if(timer.at<=clock){noticeTimers.delete(id);timer.callback();}await settle();});
  const connectNative=async(frame,meta)=>{
    // HappyDOM deliberately does not navigate frames in this test. Supply only
    // the native message boundary; React and the project bridge stay real.
    const native={},engine=meta.fileType==='pdf'?'pdfcraft':'wordcraft',calls=[];
    Object.defineProperty(frame,'contentWindow',{configurable:true,value:native});
    let applied=0,outlineVisible=false,editorToolsVisible=false,locationStatus='unsupported',locationId='R',holdNextLocate=false,pendingLocate=null;
    const emit=(type,data)=>window.dispatchEvent(new window.MessageEvent('message',{origin:location.origin,source:native,data:{type:engine+':'+type,...data}}));
    const snapshot=()=>({document:meta.id+'-session',fileName:meta.name,applied,complete:true,author:'Alex',editable:true,outlineVisible,editorToolsControlled:engine==='wordcraft',editorToolsVisible,headingOutline:{revision:2,items:[{index:0,level:0,text:'Native document heading'}]},notes:[],pages:[],active:null,source:{status:locationStatus,selectedId:locationId}});
    native.postMessage=message=>{
      calls.push(message);
      if(message.type===engine+':open')queueMicrotask(()=>emit('reviewState',{payload:JSON.stringify(snapshot())}));
      if(message.type===engine+':review'){
        const request=JSON.parse(message.payload);applied=request.request;let result={};
        if(request.action==='configure')locationId=request.params.selectedId;
        if(request.action==='locate'){locationId=request.params.id;result={id:locationId,status:locationStatus};}
        if(request.action==='outline')outlineVisible=request.params.visible;
        if(request.action==='tools')editorToolsVisible=request.params.visible;
        if(request.action==='save')queueMicrotask(()=>emit('save',{name:meta.name,bytes:new TextEncoder().encode('retried DOCX').buffer,review:snapshot()}));
        const respond=()=>queueMicrotask(()=>{emit('reviewResult',{payload:JSON.stringify({request:request.request,ok:true,result})});emit('reviewState',{payload:JSON.stringify(snapshot())});});
        if(request.action==='locate'&&holdNextLocate){holdNextLocate=false;pendingLocate=respond;}else respond();
      }
    };
    await act(async()=>{emit('ready',{});await settle();});
    assert.equal(calls.find(call=>call.type===engine+':open')?.name,meta.name);
    assert.ok(!container.textContent.includes('正在打开原文件'));
    assert.ok(!container.querySelector('.office-loading'));
    return {calls,emit,snapshot,holdLocate(){holdNextLocate=true;},releaseLocate(){assert.ok(pendingLocate);const respond=pendingLocate;pendingLocate=null;respond();},setLocation(status,id=locationId){locationStatus=status;locationId=id;emit('reviewState',{payload:JSON.stringify(snapshot())});}};
  };
  const renderRow=async id=>{await act(async()=>{root.render(React.createElement(CraftSourcePane,{toolbar,directory:directoryPanel,file:{id:'F',name:'real.docx',craft:ref},source:{...source},user:{...user},canManage:true,rows:[...rows,{...rows[0],id:'R2',original:'Next source'}],selectedAnchor:{...source,requirementId:id},responsePreview:{id,conclusion:'不满足',reason:'当前方案达不到要求'},allComments:[],people:[user],canEditRow:()=>true,onProjectCommentsChange:()=>{},onSelectAnchor:()=>{},onSelectComment:()=>{}},React.createElement('div',null,'Next excerpt')));await settle();});};
  try{
    await act(async()=>{root.render(React.createElement(CraftSourcePane,{toolbar,directory:directoryPanel,onDocumentOutlineChange:value=>outlines.push(value),file:{id:'F',name:'real.docx',craft:ref},source,user,canManage:true,rows,selectedAnchor:{...source,requirementId:'R'},allComments:[],people:[user],canEditRow:()=>true,onProjectCommentsChange:()=>{},onSelectAnchor:()=>{},onSelectComment:()=>{}},React.createElement('div',null,'Existing excerpts')));});
    await act(async()=>await settle());
    const frame=container.querySelector('iframe');assert.ok(frame);
    // Vite's public directory does not resolve a directory URL to its index:
    // it returns the RFQ SPA shell, which never sends the editor ready message.
    assert.equal(new URL(frame.src).pathname,'/craft-editors/wordcraft-classic/index.html');
    assert.equal(container.querySelector('[data-count]')?.textContent,'0 条批注');
    assert.equal(Boolean(container.querySelector('.office-savebar')),false,'the bottom file operation row is removed');
    for(const label of ['重开保存稿','原件','批阅版','保存原文'])assert.ok(![...container.querySelectorAll('button')].some(button=>button.textContent===label),label);
    const header=container.querySelector('[aria-label="文档工具栏"]');assert.ok(header);
    assert.equal(header.querySelectorAll('[aria-label="应答来源文件"]').length,1);
    assert.ok(!header.textContent.includes('real.docx'),'the native file title does not duplicate the selected source');
    assert.match(header.textContent,/V1/);
    assert.match(header.querySelector('[aria-label="文件保存状态"]').textContent,/文件已保存/);
    assert.ok(container.querySelector('[aria-label="查看条款摘录"]'));
    assert.match(container.querySelector('[aria-label="原文件旁的应答标注"]')?.textContent||'',/Comply/);
    const {calls,emit,snapshot,setLocation,holdLocate,releaseLocate}=await connectNative(frame,ref);
    assert.equal(container.querySelector('button[aria-label="文档目录"]'),null,'the duplicate source-pane directory entry is removed');
    assert.equal(outlines.at(-1).items[0].text,'Native document heading');
    await act(async()=>{await outlines.at(-1).navigateHeading({document:ref.id+'-session',revision:2,index:0});await settle();});
    assert.ok(calls.some(call=>call.type==='wordcraft:review'&&JSON.parse(call.payload).action==='heading'&&JSON.parse(call.payload).params.index===0));
    assert.equal(saves.length,0,'directory navigation never saves the document');
    assert.equal(window.__rfqOfficeUnsaved.dirty,false);
    assert.equal(new URL(frame.src).searchParams.get('tools'),'host');
    const editorTools=container.querySelector('[aria-label="编辑工具"]');assert.ok(editorTools);
    assert.equal(editorTools.getAttribute('aria-pressed'),'false');
    await act(async()=>{editorTools.click();await settle();});
    assert.equal(editorTools.getAttribute('aria-pressed'),'true');
    await act(async()=>{container.querySelector('[aria-label="查看条款摘录"]').click();await settle();});
    assert.equal(editorTools.disabled,true,'excerpt mode cannot toggle hidden native tools');
    await act(async()=>{container.querySelector('[aria-label="返回原文件"]').click();await settle();});
    assert.equal(editorTools.getAttribute('aria-pressed'),'true');
    assert.equal(editorTools.disabled,false);
    await act(async()=>{editorTools.click();await settle();});
    assert.equal(editorTools.getAttribute('aria-pressed'),'false');
    assert.equal(calls.filter(call=>call.type==='wordcraft:open').length,1);
    assert.equal(window.__rfqOfficeUnsaved.dirty,false);
    assert.equal(saves.length,0,'tool visibility never saves the document');
    const locateButton=header.querySelector('[aria-label="定位当前条款"]');assert.ok(locateButton,'locating is available in the top toolbar');
    await act(async()=>{setLocation('matched','R');await settle();});
    assert.equal(container.querySelector('.office-clause-status')?.dataset.clauseStatus,'matched');
    assert.equal(container.querySelector('.office-clause-status button'),null,'successful feedback has no duplicate locate button');
    await advance(1000);
    await act(async()=>{emit('reviewState',{payload:JSON.stringify({...snapshot(),clip:{x:2,y:3,w:100,h:100}})});await settle();});
    await advance(999);assert.ok(container.querySelector('.office-clause-status'),'success remains visible before 2 seconds');
    await advance(1);assert.equal(Boolean(container.querySelector('.office-clause-status')),false,'unrelated state updates do not extend success');
    await act(async()=>{locateButton.click();await settle();});
    assert.equal(container.querySelector('.office-clause-status')?.dataset.clauseStatus,'matched','repeated successful locate shows feedback again');
    await advance(1999);assert.ok(container.querySelector('.office-clause-status'));
    await advance(1);assert.equal(Boolean(container.querySelector('.office-clause-status')),false);
    await act(async()=>{container.querySelector('[data-response-note="R"] .wc-note-body').click();await settle();});
    assert.equal(container.querySelector('.office-clause-status')?.dataset.clauseStatus,'matched','clicking the already-selected advice explicitly locates and restores feedback');
    await advance(2000);assert.equal(Boolean(container.querySelector('.office-clause-status')),false);
    const noticeAction=text=>[...container.querySelectorAll('.office-clause-status button')].find(button=>button.textContent===text);
    for(const status of ['missing','ambiguous','page','unsupported']){
      await act(async()=>{setLocation(status,'R');await settle();});await advance(4000);
      assert.equal(container.querySelector('.office-clause-status')?.dataset.clauseStatus,status,'a result requiring verification stays visible');
      assert.ok(noticeAction('重新定位'));assert.ok(noticeAction('查看摘录'));
    }
    const locateCount=()=>calls.filter(call=>call.type==='wordcraft:review'&&JSON.parse(call.payload).action==='locate').length;
    const beforeRetry=locateCount();
    holdLocate();
    await act(async()=>{noticeAction('重新定位').click();await settle();});assert.equal(locateCount(),beforeRetry+1);
    assert.equal(container.querySelector('.office-clause-status')?.dataset.clauseStatus,'unsupported','warning stays visible while retry is pending');
    assert.equal(noticeAction('重新定位').disabled,true);assert.equal(locateButton.disabled,true);
    await act(async()=>{releaseLocate();await settle();});assert.equal(locateButton.disabled,false);
    await act(async()=>{noticeAction('查看摘录').click();await settle();});assert.equal(locateButton.disabled,true);
    assert.equal(Boolean(container.querySelector('.office-clause-status')),false,'excerpt mode hides native location warnings');
    await act(async()=>{container.querySelector('[aria-label="返回原文件"]').click();await settle();});assert.equal(locateButton.disabled,false);
    assert.equal(container.querySelector('iframe'),frame);assert.equal(saves.length,0);assert.equal(window.__rfqOfficeUnsaved.dirty,false);
    await act(async()=>{setLocation('matched','OTHER');await settle();});
    assert.equal(Boolean(container.querySelector('.office-clause-status')),false,'another clause cannot provide the current success');
    await act(async()=>{setLocation('matched','R');await settle();});await advance(1000);

    await act(async()=>{container.querySelector('[data-response-note="R"] .wc-note-body').click();await settle();});
    assert.ok(calls.some(call=>call.type==='wordcraft:review'&&JSON.parse(call.payload).action==='locate'&&JSON.parse(call.payload).params.id==='R'),'clicking even the current advice must explicitly locate the native source');
    const editorUrl=frame.src;
    await act(async()=>{container.querySelector('[aria-label="放大原文件区"]').click();await settle();});
    assert.ok(container.querySelector('.office-source-expanded [aria-label="文件目录"]'),'directory is included in the expanded file pane');
    assert.equal(container.querySelector('iframe'),frame);
    await act(async()=>{container.querySelector('[aria-label="还原原文件区"]').click();await settle();});
    assert.equal(calls.filter(call=>call.type==='wordcraft:open').length,1);
    await renderRow('R2');
    assert.match(container.querySelector('[aria-label="原文件旁的应答标注"]').textContent,/当前方案达不到要求/);
    assert.equal(container.querySelector('iframe'),frame);
    assert.equal(frame.src,editorUrl);
    assert.equal(calls.filter(call=>call.type==='wordcraft:open').length,1);
    assert.ok(!container.querySelector('.office-loading'));
    await advance(1000);assert.equal(container.querySelector('.office-clause-status')?.dataset.clauseStatus,'matched','the previous clause timer cannot clear the next clause feedback');
    await advance(1000);assert.equal(Boolean(container.querySelector('.office-clause-status')),false);
    holdLocate();await act(async()=>{locateButton.click();await settle();});
    await renderRow('R');
    assert.equal(Boolean(container.querySelector('.office-clause-status')),false,'the next clause waits for its own native confirmation');
    await act(async()=>{setLocation('matched','R');await settle();});await advance(1000);
    assert.equal(container.querySelector('.office-clause-status')?.dataset.clauseStatus,'matched');
    await act(async()=>{releaseLocate();await settle();});await advance(1000);
    assert.equal(Boolean(container.querySelector('.office-clause-status')),false,'a late result from the old target cannot restart current feedback');
    // Removing the operation row must retain native/keyboard save and failure recovery.
    await act(async()=>{emit('dirty',{dirty:true});await settle();});
    assert.equal(window.__rfqOfficeUnsaved.dirty,true);
    assert.match(container.querySelector('.office-title').textContent,/未保存/);
    await act(async()=>{emit('save',{name:ref.name,bytes:new TextEncoder().encode('saved DOCX').buffer,review:snapshot()});await settle();});
    assert.equal(saves.length,1);
    assert.equal(saves[0].url,'/api/craft/documents/file-id/review');
    assert.equal(saves[0].options.headers.get('If-Match'),'"0"');
    assert.equal(await new Blob([saves[0].options.body]).text(),'saved DOCX');
    assert.equal(window.__rfqOfficeUnsaved.dirty,false);
    saveFailure=true;
    await act(async()=>{emit('dirty',{dirty:true});emit('save',{name:ref.name,bytes:new TextEncoder().encode('local unsaved DOCX').buffer,review:snapshot()});await settle();});
    assert.equal(saves[1].options.headers.get('If-Match'),'"1"');
    assert.equal(window.__rfqOfficeUnsaved.dirty,true);
    assert.match(container.querySelector('[role="alert"]').textContent,/存储暂不可用/);
    assert.ok([...container.querySelector('[role="alert"]').querySelectorAll('button')].some(button=>button.textContent==='下载本地备份'));
    assert.equal(container.querySelector('.office-savebar'),null);
    await act(async()=>{[...container.querySelector('[role="alert"]').querySelectorAll('button')].find(button=>button.textContent.replace(/\s+/g,'')==='重试').click();await settle();});
    assert.equal(saves.length,3,'Retry after a failed save must retry persistence rather than only synchronize comments');
    assert.ok(Boolean(container.querySelector('[role="alert"]')),'failure recovery stays available until a save succeeds');
    assert.ok([...container.querySelector('[role="alert"]').querySelectorAll('button')].some(button=>button.textContent==='下载本地备份'));
    saveFailure=false;
    await act(async()=>{[...container.querySelector('[role="alert"]').querySelectorAll('button')].find(button=>button.textContent.replace(/\s+/g,'')==='重试').click();await settle();});
    assert.equal(saves.length,4);
    assert.equal(saves[3].options.headers.get('If-Match'),'"1"');
    assert.equal(window.__rfqOfficeUnsaved.dirty,false);
    assert.equal(Boolean(container.querySelector('[role="alert"]')),false);
    await act(async()=>{root.unmount();});
    const second=createRoot(container);
    responseMeta={...ref,id:'pdf-id',fileId:'PDF',name:'real.pdf',fileType:'pdf'};
    await act(async()=>{second.render(React.createElement(CraftSourcePane,{file:{name:'real.pdf',craft:responseMeta},source:{...source,fileId:'PDF'},user,canManage:true,rows:[],allComments:[],canEditRow:()=>true,onProjectCommentsChange:()=>{}}));});
    await act(async()=>await settle());
    const pdfFrame=container.querySelector('iframe');
    assert.equal(new URL(pdfFrame.src).pathname,'/craft-editors/pdfcraft-classic/index.html');
    await connectNative(pdfFrame,responseMeta);
    assert.equal(container.querySelector('button[aria-label="文档目录"]'),null);
    assert.equal(container.querySelector('[aria-label="编辑工具"]'),null,'PDF has no Word toolbar switch');
    assert.equal(container.querySelector('.office-savebar'),null,'PDF also omits the host operation row');
    await act(async()=>second.unmount());
    const third=createRoot(container);
    await act(async()=>{third.render(React.createElement(CraftSourcePane,{file:{name:'missing.docx'},source:{...source,fileId:'MISSING'},user,canManage:false,rows,allComments:[],canEditRow:()=>false},React.createElement('div',null,'Existing excerpts')));});
    await act(async()=>await settle());
    assert.match(container.textContent,/尚未关联原文件/);assert.ok(![...container.querySelectorAll('button')].some(b=>b.textContent.includes('上传对应原文件')));
    assert.equal(container.querySelector('.office-excerpt').hidden,false,'a card from a file without uploaded bytes must show its own source excerpt');
    await act(async()=>third.unmount());
  }finally{globalThis.fetch=previousFetch;await window.happyDOM.cancelAsync();}
});
