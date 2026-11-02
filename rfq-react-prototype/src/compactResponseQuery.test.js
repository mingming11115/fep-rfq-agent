import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

test('compact search opens on demand, preserves the query draft and applies through the existing callback',async()=>{
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  Object.assign(globalThis,{window,document:window.document,Node:window.Node,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,
    requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),
    getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:window.ResizeObserver,IS_REACT_ACT_ENVIRONMENT:true});
  const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});
  const output=path.join(directory,'compact-response-query-test.mjs');
  await build({entryPoints:[fileURLToPath(new URL('./components/ResponseCardFilters.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
  const {ResponseCardQuery,EMPTY_CARD_FILTERS}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container),applied=[];
  const draft={...EMPTY_CARD_FILTERS,query:'付款',status:'pending'};
  const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const render=async disabled=>act(async()=>{root.render(React.createElement(ResponseCardQuery,{compact:true,filters:EMPTY_CARD_FILTERS,draft,disabled,onDraftChange:()=>{},onApply:value=>applied.push(value)}));await settle();});
  try{
    await render(false);
    const trigger=()=>container.querySelector('[aria-label="搜索与筛选应答"]');assert.ok(trigger());
    assert.equal(container.querySelector('[aria-label="搜索事项"]'),null,'the toolbar does not contain a permanent search field');
    await act(async()=>{trigger().click();await settle();});
    let input=document.querySelector('[aria-label="搜索事项"]');assert.equal(input.value,'付款');
    assert.equal(trigger().getAttribute('aria-expanded'),'true');
    await act(async()=>{input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',keyCode:13,which:13,bubbles:true}));await settle();});
    assert.deepEqual(applied,[draft],'search still goes through the guarded parent callback with the complete draft');
    await act(async()=>{document.querySelector('[aria-label="筛选应答"]').click();await settle();});
    assert.ok(document.querySelector('[role="search"]').contains(document.querySelector('.response-filter-popover')),'filters belong to the same search popup so they cannot remain floating after it closes');
    const escape=new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});
    await act(async()=>{document.querySelector('[aria-label="搜索事项"]').dispatchEvent(escape);await settle();});
    assert.equal(escape.defaultPrevented,true,'Escape closes the popup without the native search-field action clearing its draft');
    assert.equal(trigger().getAttribute('aria-expanded'),'false');
    assert.equal(document.querySelectorAll('.ant-popover').length,1,'search and filters share one popup, including its cached hidden content');
    await act(async()=>{trigger().click();await settle();});
    input=document.querySelector('[aria-label="搜索事项"]');assert.equal(input.value,'付款');
    await render(true);assert.equal(trigger().disabled,true);assert.equal(trigger().getAttribute('aria-expanded'),'false');
  }finally{await act(async()=>root.unmount());await window.happyDOM.cancelAsync();}
});
