import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

test('statistics use native animated tabs while parent guards still control filter changes',async()=>{
  const window=new Window({url:'http://127.0.0.1:5175',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  Object.assign(globalThis,{window,document:window.document,Node:window.Node,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,
    requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),
    getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:window.ResizeObserver,IS_REACT_ACT_ENVIRONMENT:true});
  const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});
  const output=path.join(directory,'response-statistics-tabs-test.mjs');
  await build({entryPoints:[fileURLToPath(new URL('./components/ResponseCardFilters.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
  const {default:ResponseCardFilters,EMPTY_CARD_FILTERS}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container),applied=[];
  const draft={...EMPTY_CARD_FILTERS,query:'付款',source:'客户要求',type:'clarification'};
  const stats={all:15,pending:5,waiting:10,confirmed:0};
  const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const render=async(status='all',disabled=false)=>act(async()=>{root.render(React.createElement(ResponseCardFilters,{stats,filters:{...draft,status},draft,disabled,onApply:value=>applied.push(value)}));await settle();});
  const tabs=()=>[...container.querySelectorAll('[role="tab"]')];
  try{
    await render();
    assert.equal(tabs().length,4,'statistics expose the four native tabs');
    assert.deepEqual(tabs().map(item=>item.textContent),['全部15','待处理5','评审中10','已确认0']);
    assert.ok(container.querySelector('.ant-tabs-ink-bar-animated'),'one animated ink bar moves between statuses');
    await act(async()=>{tabs()[3].click();await settle();});
    assert.deepEqual(applied,[{...draft,status:'confirmed'}],'status changes retain all query conditions');
    assert.equal(tabs()[0].getAttribute('aria-selected'),'true','pending parent confirmation must not move the active filter');
    await render('confirmed');assert.equal(tabs()[3].getAttribute('aria-selected'),'true');
    await render('confirmed',true);
    assert.ok(tabs().every(item=>item.getAttribute('aria-disabled')==='true'));
    await act(async()=>{tabs()[1].click();await settle();});assert.equal(applied.length,1,'busy tabs cannot change filters');
  }finally{await act(async()=>root.unmount());await window.happyDOM.cancelAsync();}
});
