import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

test('right discussion owns editing, cancellation, replies and permission-aware deletion',async()=>{
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true}});
  Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true});
  // HappyDOM leaves Ant's reset border widths as "initial"; browsers compute pixels.
  const nativeStyle=window.getComputedStyle.bind(window);
  window.getComputedStyle=(...args)=>{const style=nativeStyle(...args);return new Proxy(style,{get(target,key){
    if(key==='getPropertyValue')return name=>{const value=target.getPropertyValue(name);return /^border-(top|bottom)-width$/.test(name)&&value==='initial'?'0px':value;};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});};
  const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});
  const output=path.join(directory,'annotation-panel-test.mjs');
  await build({entryPoints:[fileURLToPath(new URL('./components/AnnotationPanel.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
  const {default:AnnotationPanel}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');
  const unlinkedOutput=path.join(directory,'unlinked-comment-panel-test.mjs');
  await build({entryPoints:[fileURLToPath(new URL('./components/UnlinkedCommentPanel.jsx',import.meta.url))],outfile:unlinkedOutput,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
  const {default:UnlinkedCommentPanel}=await import(pathToFileURL(unlinkedOutput));
  const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
  const anchor={projectId:'P',fileId:'F',sourceVersion:'1',requirementId:'R',locator:{quote:'Original'}};
  const mine={id:'C',anchor,text:'Existing',quote:'Original',createdBy:'actor',status:'未解决',replies:[],nativeRef:{key:'native:1'}};
  let props={comments:[mine],anchor,rows:[{id:'R',projectId:'P',sourceFileId:'F',sourceVersion:'1',original:'Original'}],people:[],actorId:'actor',canEdit:true,activeCommentId:'C',editRequest:{id:'C',sequence:1},onLocate:()=>{},onPromote:()=>{},onClearQuote:()=>{},onSelectComment:()=>{}};
  const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const paint=()=>root.render(React.createElement(AnnotationPanel,{...props,onChange:update=>{props={...props,comments:typeof update==='function'?update(props.comments):update};paint();}}));
  props.onEditRequestHandled=request=>{if(props.editRequest===request){props={...props,editRequest:null};paint();}};
  const render=async()=>act(async()=>{paint();await settle();});
  // Keep the real component mounted and feed its visible edits back as the page does.
  const click=async text=>act(async()=>{const button=[...node.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,text);button.click();await settle();});
  const type=async(selector,text)=>act(async()=>{const input=node.querySelector(selector);assert.ok(input);Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(input,text);input.dispatchEvent(new window.Event('input',{bubbles:true}));await settle();});
  try{
    await render();
    assert.equal(node.querySelector('[aria-label="修改批注"]')?.value,'Existing','native edit intent opens the existing right-side field');
    assert.equal(Boolean(node.querySelector('[aria-label="新增批注内容"]')),false,'opening a thread does not add another composer');
    await type('[aria-label="修改批注"]','Edited on the right');
    props={...props,comments:props.comments.map(c=>({...c,nativeRef:{...c.nativeRef,state:'synced'}}))};await render();
    assert.equal(node.querySelector('[aria-label="修改批注"]').value,'Edited on the right','native metadata echoes preserve typing');
    await click('保存修改');assert.equal(props.comments[0].text,'Edited on the right');
    await type('[aria-label="回复批注 C"]','Right reply');await click('回复');assert.equal(props.comments[0].replies[0].text,'Right reply');
    await click('解决');assert.equal(props.comments[0].status,'已解决');
    await click('重新打开');assert.equal(props.comments[0].status,'未解决');
    await click('编辑');
    await click('取消');assert.equal(Boolean(node.querySelector('[aria-label="修改批注"]')),false);assert.equal(props.comments[0].text,'Edited on the right');
    await act(async()=>{root.render(null);await settle();});
    props={...props,comments:[...props.comments,{...mine,id:'B',text:'Another thread'}],activeCommentId:'B'};await render();
    assert.equal(Boolean(node.querySelector('[aria-label="修改批注"]')),false,'consumed edit request must not replay when another summary remounts the panel');
    props={...props,comments:[{...mine,text:''}],editRequest:{id:'C',sequence:2}};await render();await click('取消');
    assert.equal(props.comments[0].nativeDeleted,true,'cancel of a fresh blank native comment removes its draft');
    props={...props,comments:[{...mine,createdBy:'other'}],canManage:false,editRequest:{id:'C',sequence:3}};await render();
    assert.equal(Boolean(node.querySelector('[aria-label="修改批注"]')),false);
    assert.equal([...node.querySelectorAll('button')].some(b=>b.textContent==='删除'),false,'ordinary users cannot delete another author');
    props={...props,canManage:true};await render();await click('删除');assert.equal(props.comments[0].nativeDeleted,true);
    props={...props,comments:[mine],canEdit:false,canManage:true,editRequest:{id:'C',sequence:4}};await render();
    assert.equal(Boolean(node.querySelector('textarea')),false,'read-only wins over an old edit request and manager flag');
    assert.equal([...node.querySelectorAll('button')].some(b=>b.textContent==='删除'),false);
    const fileActions=[];let fileValue={scope:'unlinked',edit:true,note:{nativeKey:'file:1',text:'',quote:'',author:'actor',replies:[],canEdit:false,canDelete:true},targets:[],onClose:()=>{},onAssociate:()=>assert.fail('cancel must not associate a blank quote'),onAction:async(action,text)=>fileActions.push([action,text])};
    const renderFile=async()=>act(async()=>{root.render(React.createElement(UnlinkedCommentPanel,{key:fileValue.scope,value:fileValue}));await settle();});
    await renderFile();await click('取消新批注');assert.equal(fileActions[0][0],'delete');
    fileValue={...fileValue,scope:'read-only',note:{...fileValue.note,canDelete:false}};await renderFile();
    assert.equal([...node.querySelectorAll('button')].some(b=>b.textContent==='取消新批注'||b.textContent==='删除'),false,'read-only unlinked threads expose no deletion');
  }finally{await act(async()=>root.unmount());await window.happyDOM.cancelAsync();}
});
