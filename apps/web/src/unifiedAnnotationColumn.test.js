import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

async function harness(name){
  const window=new Window({url:'http://127.0.0.1:5175',settings:{disableCSSFileLoading:true,disableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true}});
  Object.assign(globalThis,{window,document:window.document,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,CSS:window.CSS,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
  const cache=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(cache,{recursive:true});const output=path.join(cache,`unified-column-${name}.mjs`);
  await build({entryPoints:[fileURLToPath(new URL('./components/CraftResponseAdvice.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
  const {default:Column}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
  const rows=[{id:'R1',projectId:'P',sourceFileId:'F',sourceVersion:'1',clause:'1',original:'First',conclusion:'Comply'},{id:'R2',projectId:'P',sourceFileId:'F',sourceVersion:'1',clause:'2',original:'Second',conclusion:'Comply'}];
  const nativeNotes=[0,1,2].map(i=>({id:10+i,nativeKey:'native-'+i,author:'Alex',text:'File note '+i,replies:[],resolved:false,color:i,ranges:[]}));
  const opened=[];let props={rows,nativeNotes,activeId:'R1',geometry:{status:'unsupported'},canEditRow:()=>false,onOpenNativeComment:key=>{opened.push(key);props={...props,nativeActiveId:nativeNotes.find(note=>note.nativeKey===key).id};paint();}};
  const settle=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  function paint(){root.render(React.createElement(Column,props));}
  const render=async patch=>act(async()=>{props={...props,...patch};paint();await settle();});
  const click=async el=>act(async()=>{assert.ok(el);el.click();await settle();});
  const panel=()=>node.querySelector('.craft-annotation-sidebar');
  // Browser layout is external to HappyDOM. The real component gets a 180px
  // pane, a 70px control area, three file cards, then its response cards.
  const oldRect=window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect=function(){
    if(this.matches('.craft-annotation-sidebar')) { return {top:0,bottom:180,left:0,right:240,width:240,height:180}; }
    let top;if(this.dataset.nativeNote) { top=70+90*Number(this.dataset.nativeNote.slice(-1)); }
    if(this.dataset.responseNote){const all=node.querySelectorAll('[data-response-note]').length===2;top=360+(all&&this.dataset.responseNote==='R2'?150:0);}
    if(top!==undefined){top-=panel()?.scrollTop||0;return {top,bottom:top+80,left:0,right:240,width:240,height:80};}
    return oldRect.call(this);
  };
  const visible=el=>{const box=el.getBoundingClientRect();return box.top>=70&&box.top<180&&box.bottom>70;};
  return {node,render,click,panel,opened,visible,button:text=>[...node.querySelectorAll('button')].find(el=>el.textContent===text),async close(){await act(async()=>root.unmount());window.HTMLElement.prototype.getBoundingClientRect=oldRect;await window.happyDOM.cancelAsync();}};
}

test('mixed column reveals the selected response when changing clauses or returning to current scope',async()=>{
  const h=await harness('response');
  try{
    await h.render();await h.render({activeId:'R2'});assert.ok(h.visible(h.node.querySelector('[data-response-note="R2"]')),'native notes must not hide the newly selected response');
    await h.click(h.button('查看全部标注'));await h.click(h.button('仅看当前条款'));assert.ok(h.visible(h.node.querySelector('[data-response-note="R2"]')),'current-only scope reveals its response below native notes');
  }finally{await h.close();}
});

test('mixed column keeps selected native note visible on response geometry updates',async()=>{
  const h=await harness('native');
  try{
    await h.render();await h.click(h.button('查看全部标注'));await h.click(h.node.querySelector('[data-native-note="native-2"] button'));
    assert.deepEqual(h.opened,['native-2']);assert.ok(h.visible(h.node.querySelector('[data-native-note="native-2"]')),'native selection wins over show-all response scrolling');
    const scroll=h.panel().scrollTop;await h.render({geometry:{status:'unsupported',clip:{x:1,y:0,w:200,h:100}}});assert.equal(h.panel().scrollTop,scroll,'geometry refresh must not replace the selected native note with a response');
  }finally{await h.close();}
});
