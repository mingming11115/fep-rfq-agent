import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Window} from 'happy-dom';
import React,{act} from 'react';

test('metric help stays open after focus then click, supports Escape and does not activate its parent',async()=>{
 const window=new Window({url:'http://localhost',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true}});
 Object.assign(globalThis,{window,document:window.document,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true});
 const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});
 const output=`${directory}/bu-metric-help-test.mjs`;
 await build({entryPoints:[fileURLToPath(new URL('./components/BuMetricHelp.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
 const {default:Label}=await import(pathToFileURL(output)),{createRoot}=await import('react-dom/client');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);let parentClicks=0;
 const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setTimeout(resolve,0));};
 try{
  await act(async()=>{root.render(React.createElement('div',{onClick:()=>parentClicks++},React.createElement(Label,{metric:'平均审批时长'})));await settle();});
  const button=node.querySelector('button');
  await act(async()=>{button.focus();await settle();});
  assert.equal(button.getAttribute('aria-expanded'),'true','keyboard focus opens the explanation');
  await act(async()=>{button.click();await settle();});
  assert.equal(button.getAttribute('aria-expanded'),'true','click must keep the already-focused explanation open');
  assert.equal(parentClicks,0,'help must not trigger project filtering');
  assert.match(document.querySelector('[role="tooltip"]').textContent,/从提交到办结/);
  await act(async()=>{button.dispatchEvent(new window.MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body}));await new Promise(resolve=>setTimeout(resolve,160));});
  assert.equal(button.getAttribute('aria-expanded'),'true','moving the pointer away must not hide keyboard-focused help');
  await act(async()=>{button.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await settle();});
  assert.equal(button.getAttribute('aria-expanded'),'false');
 }finally{await act(async()=>root.unmount());await window.happyDOM.cancelAsync();}
});
