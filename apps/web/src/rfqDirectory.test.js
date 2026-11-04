import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

test('one directory preserves clause controls and navigates real headings with their source revision',async()=>{
  const window=new Window({url:'http://127.0.0.1:5174'});
  Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,ShadowRoot:window.ShadowRoot,IS_REACT_ACT_ENVIRONMENT:true});
  const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});
  const output=path.join(directory,'rfq-directory-test.mjs');
  await build({entryPoints:[fileURLToPath(new URL('./components/RfqDirectory.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
  const {default:RfqDirectory}=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  const outline={supported:true,ready:true,document:'file-session',revision:3,items:[{index:0,level:0,text:'Same heading'},{index:1,level:1,text:'Same heading'}]};
  const navigated=[];let closed=0;
  const render=async value=>act(async()=>root.render(React.createElement(RfqDirectory,{documentOutline:value,onNavigateHeading:item=>navigated.push(item),onClose:()=>closed++},
    React.createElement('input',{'aria-label':'搜索要求',defaultValue:'Safety'}),React.createElement('button',null,'批量确认 2'))));
  try{
    await render(outline);
    const tab=name=>[...container.querySelectorAll('[role="tab"]')].find(node=>node.textContent===name);
    assert.equal(tab('条款').getAttribute('aria-selected'),'true');
    const input=container.querySelector('[aria-label="搜索要求"]');input.value='Retained filter';
    await act(async()=>tab('文档标题').click());
    assert.equal(tab('文档标题').getAttribute('aria-selected'),'true');
    assert.equal(input.closest('[role="tabpanel"]').hidden,true);
    const headings=container.querySelectorAll('[data-document-heading]');assert.equal(headings.length,2);
    await act(async()=>headings[1].click());
    assert.deepEqual(navigated,[{document:'file-session',revision:3,index:1}]);
    await act(async()=>tab('条款').click());
    assert.equal(container.querySelector('[aria-label="搜索要求"]'),input);
    assert.equal(input.value,'Retained filter');assert.match(input.closest('[role="tabpanel"]').textContent,/批量确认 2/);
    await act(async()=>tab('文档标题').click());
    await render({...outline,items:[]});assert.match(container.textContent,/没有可导航的文档标题/);
    await render({supported:true,ready:false,items:[]});assert.match(container.textContent,/正在读取文档标题/);
    assert.equal(container.querySelectorAll('[data-document-heading]').length,0);
    await render({supported:false,ready:true,items:[]});assert.match(container.textContent,/当前文件不提供文档标题/);
    await act(async()=>container.querySelector('[aria-label="关闭文档目录"]').click());assert.equal(closed,1);
  }finally{await act(async()=>root.unmount());await window.happyDOM.cancelAsync();}
});
