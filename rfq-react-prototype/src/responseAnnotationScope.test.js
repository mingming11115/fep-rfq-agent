import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

// These cases catch leaking other clauses into the default view, stale scope
// after a source change, and a view toggle accidentally reaching persistence.
for(const fileType of ['docx','pdf'])test(`${fileType} response annotations focus the selected clause and expand only on request`,async()=>{
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,handleDisabledFileLoadingAsSuccess:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  Object.assign(globalThis,{window,document:window.document,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,DOMParser:window.DOMParser,CSS:window.CSS,location:window.location,localStorage:window.localStorage,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
  const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});
  const output=path.join(directory,`response-annotation-scope-${fileType}.mjs`);
  await build({entryPoints:[fileURLToPath(new URL('./components/SourceDocumentPane.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{"BASE_URL":"/"}'},plugins:[{name:'raw-template',setup(b){b.onResolve({filter:/\.html\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}]});
  const {default:SourceDocumentPane}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  const rows=[{id:'R1',projectId:'P',sourceFileId:'F',sourceVersion:'V1',clause:'1.1',title:'First',original:'First source',conclusion:'Comply'},{id:'R2',projectId:'P',sourceFileId:'F',sourceVersion:'V1',clause:'1.2',title:'Second',original:'Second source',conclusion:'不满足',reason:'Saved reason'}];
  const anchor={projectId:'P',fileId:'F',sourceVersion:'V1',requirementId:'R1'};
  const navigations=[],quotes=[],requests=[];let metadata={id:'native-F',name:`source.${fileType}`,fileType,access:'test',projectId:'P',fileId:'F',sourceVersion:'V1',revision:0};
  let props={file:{id:'F',name:`source.${fileType}`,craft:metadata},rows,selectedAnchor:anchor,officeUser:{id:'reader',name:'Reader'},canManageOffice:false,canEditRow:row=>row.id==='R2',onSelectAnchor:value=>navigations.push(value),onQuote:(quote,value)=>quotes.push({quote,anchor:value}),comments:[],allComments:[]};
  const previousFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{requests.push({url,method:options?.method||'GET'});return String(url).includes('/download')?new Response(new Blob(['native bytes'])):new Response(JSON.stringify({code:0,data:metadata}));};
  const settle=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const render=async()=>act(async()=>{root.render(React.createElement(SourceDocumentPane,props));await settle();});
  const panel=()=>container.querySelector('.craft-response-advice');
  const ids=()=>[...panel().querySelectorAll('[data-response-note]')].map(note=>note.dataset.responseNote);
  const button=text=>[...panel().querySelectorAll('button')].find(item=>item.textContent===text);
  const click=async element=>act(async()=>{assert.ok(element,'requested annotation action is available');element.click();await settle();});
  const filterTrigger=()=>panel().querySelector('[aria-label^="筛选应答标注"]');
  const filterMenu=()=>document.getElementById(filterTrigger().getAttribute('aria-controls'));
  const menuButton=text=>[...filterMenu().querySelectorAll('button')].find(item=>item.textContent===text);
  const closeFilter=async()=>act(async()=>{filterMenu().dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await settle();});
  try{
    await render();assert.deepEqual(ids(),['R1'],'default view must not include another clause');
    // Frame navigation is disabled in HappyDOM; supply its same-origin DOM
    // boundary while keeping the popup, event handling and editor host real.
    Object.defineProperty(container.querySelector('iframe'),'contentDocument',{configurable:true,value:document.implementation.createHTMLDocument('Native editor')});
    assert.ok(filterTrigger(),'conclusion filters have a compact trigger');
    assert.equal(panel().querySelectorAll('input[type="checkbox"]').length,0,'closed filters do not occupy inline space');
    assert.ok(filterTrigger().textContent.includes('全部结论'));
    await click(filterTrigger());assert.equal(filterMenu().querySelectorAll('input[type="checkbox"]').length,5);
    menuButton('清空').focus();await click(menuButton('清空'));assert.deepEqual(ids(),[]);assert.ok(filterTrigger().textContent.includes('已选 0 类'));
    assert.ok(document.activeElement===filterMenu().querySelector('input'),'bulk filtering keeps keyboard focus in the popup');
    await click(filterMenu().querySelector('[aria-label="显示 Comply 标注"]'));
    await click(filterMenu().querySelector('[aria-label="显示 不满足 标注"]'));
    assert.deepEqual(ids(),['R1']);assert.ok(filterTrigger().textContent.includes('已选 2 类'));
    assert.equal(filterTrigger().getAttribute('aria-expanded'),'true','multi-select keeps the menu open');
    await closeFilter();assert.equal(filterTrigger().getAttribute('aria-expanded'),'false');assert.equal(document.activeElement,filterTrigger(),'Escape returns focus to the filter trigger');
    await click(filterTrigger());assert.deepEqual([...filterMenu().querySelectorAll('input:checked')].map(input=>input.getAttribute('aria-label')),['显示 Comply 标注','显示 不满足 标注']);
    {
      const editorDocument=container.querySelector('iframe').contentDocument;assert.ok(editorDocument);
      await act(async()=>{editorDocument.dispatchEvent(new window.PointerEvent('pointerdown',{bubbles:true}));await settle();});
      assert.equal(filterTrigger().getAttribute('aria-expanded'),'false','interacting inside the native iframe dismisses the popup');
      assert.ok(filterTrigger().textContent.includes('已选 2 类'));await click(filterTrigger());
    }
    await click(menuButton('全选'));assert.deepEqual(ids(),['R1']);assert.ok(filterTrigger().textContent.includes('全部结论'));await closeFilter();
    {
      // A narrow native advice pane can be shorter than its current note.
      // Its scope action must remain reachable instead of scrolling away.
      Object.defineProperty(panel(),'getBoundingClientRect',{configurable:true,value:()=>({top:0,bottom:90,left:0,right:300,width:300,height:90})});
      Object.defineProperty(panel().querySelector('[data-response-note="R1"]'),'getBoundingClientRect',{configurable:true,value:()=>({top:140,bottom:280,left:0,right:300,width:300,height:140})});
      props={...props,responsePreview:{id:'R1',conclusion:'Comply'}};await render();
      assert.equal(panel().scrollTop,0,'current-only preview updates keep the scope controls visible');
    }
    const frame=container.querySelector('iframe');
    await click(button('查看全部标注'));assert.deepEqual(ids(),['R1','R2']);
    assert.equal(navigations.length,0);assert.equal(quotes.length,0,'view scope does not create a discussion');
    assert.equal(container.querySelector('iframe'),frame,'scope changes retain the native iframe');
    assert.equal(panel().querySelector('[aria-label="讨论条款 1.1"]'),null,'unauthorized rows have no discussion action');
    await click(panel().querySelector('[data-response-note="R2"] .wc-note-body'));
    assert.equal(navigations.at(-1).requirementId,'R2');assert.equal(navigations.at(-1).fileId,'F');
    props={...props,selectedAnchor:{...anchor,requirementId:'R2'}};await render();
    assert.deepEqual(ids(),['R1','R2'],'same-file clause navigation preserves all scope');
    panel().scrollTop=150;
    await click(button('仅看当前条款'));assert.deepEqual(ids(),['R2']);
    assert.equal(panel().scrollTop,0,'returning to current-only restores the scope controls');
    await click(panel().querySelector('[aria-label="讨论条款 1.2"]'));
    assert.equal(quotes.at(-1).quote,'Second source');assert.equal(quotes.at(-1).anchor.requirementId,'R2');
    props={...props,responsePreview:{id:'R2',conclusion:'有条件 Comply',conditions:'Edited condition',reason:'Edited reason'}};await render();
    assert.deepEqual(ids(),['R2']);assert.ok(panel().textContent.includes('Edited condition'));assert.ok(!panel().textContent.includes('Saved reason'));assert.equal(rows[1].reason,'Saved reason');
    await click(filterTrigger());
    await click(filterMenu().querySelector('[aria-label="显示 有条件 Comply 标注"]'));assert.deepEqual(ids(),[],'a filtered current clause does not fall back to a different clause');
    assert.ok(filterTrigger().textContent.includes('已选 4 类'));await closeFilter();
    assert.ok(panel().textContent.includes('当前条款没有符合筛选的应答标注'));
    await click(button('查看全部标注'));assert.deepEqual(ids(),['R1'],'all scope still honors the conclusion filter');
    props={...props,selectedAnchor:{...anchor,requirementId:'MISSING'}};await render();
    await click(button('仅看当前条款'));assert.deepEqual(ids(),[]);assert.ok(panel().textContent.includes('请选择条款查看应答标注'));
    await click(button('查看全部标注'));
    await click(filterTrigger());const previousMenuId=filterMenu().id;
    metadata={...metadata,id:'native-F2',fileId:'F2',sourceVersion:'V2'};
    props={...props,file:{id:'F2',name:`source.${fileType}`,craft:metadata},rows:rows.map(row=>({...row,id:row.id==='R1'?'R3':'R4',sourceFileId:'F2',sourceVersion:'V2'})),selectedAnchor:{projectId:'P',fileId:'F2',sourceVersion:'V2',requirementId:'R3'},responsePreview:undefined};await render();
    assert.deepEqual(ids(),['R3'],'new file/version resets to the current clause');
    assert.ok(filterTrigger().textContent.includes('全部结论'),'new sources reset the conclusion selection');
    assert.equal(filterTrigger().getAttribute('aria-expanded'),'false');assert.equal(document.getElementById(previousMenuId),null,'a source change removes the old popup');
    await click(filterTrigger());props={...props,showResponses:false};await render();
    assert.equal(panel(),null,'hiding native annotations removes their popup owner');
    props={...props,showResponses:true};await render();
    assert.ok(button('查看全部标注'));assert.equal(requests.filter(request=>request.method!=='GET').length,0,'scope changes never save a file');
  }finally{await act(async()=>root.unmount());globalThis.fetch=previousFetch;await window.happyDOM.cancelAsync();}
});
