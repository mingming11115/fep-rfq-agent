import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';
import {updateResponseReview} from './reviewDomain.js';

test('processing my review reveals the existing editor, preserves edits on repeated clicks, and reopens a collapsed editor',async()=>{
  const window=new Window({url:'http://127.0.0.1:5173',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,handleDisabledFileLoadingAsSuccess:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,DOMParser:window.DOMParser,CSS:window.CSS,location:window.location,localStorage:window.localStorage,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
  const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});const output=path.join(directory,'response-review-navigation-test.mjs');
  await build({entryPoints:[fileURLToPath(new URL('./pages/ResponsePage.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{"BASE_URL":"/"}'},plugins:[{name:'raw-template',setup(b){b.onResolve({filter:/\.html\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));}}]});
  const {ResponsePage}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');
  const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
  const project={id:'P',name:'Review project',buId:'B',ownerId:'sr',participantIds:['sr','t1'],deadline:'2026-11-10'};
  let state={actorId:'t1',actorRole:'技术',accountsById:{sr:{id:'sr',name:'SR',enabled:true},t1:{id:'t1',name:'Reviewer',enabled:true}},businessUnits:[{id:'B'}],buPersonnelByBuId:{B:[{userId:'sr',roles:['SR'],enabled:true},{userId:'t1',roles:['技术'],enabled:true,canConfirm:true}]},projects:[project],requirementsByProject:{P:[{id:'R',sourceFileId:'F',source:'Review.docx',sourceVersion:'1',clause:'1',title:'Review clause',original:'Customer requirement',version:1,status:'评审中',conclusion:'Comply',draft:'Final answer',evidence:'Evidence'}]},reviewsByProject:{P:[{id:'D',title:'Response review',kind:'review',requirementId:'R',version:1,round:1,requirementVersion:1,status:'待处理',reviewerIds:['t1'],confirmations:{},plan:'Review the answer',proposedDraft:'Final answer',proposedConclusion:'Comply'}]},snapshotsByProject:{P:[]},tasksById:{}};
  const writes=[];
  const settle=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const render=async()=>act(async()=>{root.render(React.createElement(ResponsePage,{project,requirements:state.requirementsByProject.P,reviews:state.reviewsByProject.P,route:{page:'response',projectId:'P',requirementId:'R'},appState:state,actorId:'t1',actorRole:'技术',canBusinessAction:()=>true,navigate:()=>{},toast:()=>{},onUpdateReview:(reviewId,patch,expectedVersion,expectedRound)=>{state=updateResponseReview(state,{projectId:'P',reviewId,patch,expectedVersion,expectedRound});writes.push(patch);return state.reviewsByProject.P.find(r=>r.id===reviewId);}}));await settle();});
  const button=text=>[...node.querySelectorAll('button')].find(button=>button.textContent===text||button.getAttribute('aria-label')===text);
  const panel=()=>node.querySelector('section[aria-label="应答评审"]');
  const click=async text=>act(async()=>{const target=button(text);assert.ok(target,`${text} exists`);assert.equal(target.disabled,false);target.focus();target.click();await settle();});
  const assertReviewFocused=()=>assert.ok(document.activeElement!==document.body&&document.activeElement.contains(panel()),'the review editor receives focus even when already expanded');
  try{
    await render();assert.ok(panel(),'the review starts expanded');
    await click('处理本人评审');assertReviewFocused();assert.equal(writes.length,0,'opening a review does not submit a confirmation');
    await click('收起应答评审');assert.equal(panel(),null);
    await click('处理本人评审');assert.ok(panel());assertReviewFocused();
    const note=node.querySelector('textarea[aria-label="本人评审意见"]');
    await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(note,'Checked the evidence');note.dispatchEvent(new window.Event('input',{bubbles:true}));await settle();});
    await click('处理本人评审');assertReviewFocused();
    assert.equal(node.querySelector('textarea[aria-label="本人评审意见"]'),note,'repeated clicks keep the same editor');
    assert.equal(note.value,'Checked the evidence');assert.ok(!document.body.textContent.includes('评审内容尚未保存'),'focusing the current review does not trigger a leave guard');
    await click('确认本人评审');await render();
    assert.equal(state.reviewsByProject.P[0].confirmations.t1.note,'Checked the evidence');
    assert.equal(state.reviewsByProject.P[0].status,'已关闭');assert.equal(state.requirementsByProject.P[0].status,'已确认');
  }finally{await act(async()=>root.unmount());node.remove();await window.happyDOM.close();}
});
