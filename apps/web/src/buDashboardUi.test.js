import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Window} from 'happy-dom';
import React,{act} from 'react';
import {createDemoState} from './data.js';

test('dashboard tabs preserve metric filtering and keep mock projects separate from saved projects',async()=>{
 const window=new Window({url:'http://localhost',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true}});
 Object.assign(globalThis,{window,document:window.document,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true});
 const nativeStyle=window.getComputedStyle.bind(window);
 window.getComputedStyle=(...args)=>new Proxy(nativeStyle(...args),{get(target,key){
  if(key==='getPropertyValue') { return name=>{const value=target.getPropertyValue(name);return /^border-(top|bottom)-width$/.test(name)&&value==='initial'?'0px':value;}; }
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});
 const output=`${directory}/bu-dashboard-ui-test.mjs`;
 await build({entryPoints:[fileURLToPath(new URL('./pages/BuDashboardPage.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
 const {default:Dashboard}=await import(pathToFileURL(output)),{createRoot}=await import('react-dom/client');
 const state={...createDemoState(),actorId:'demo-bu-admin',actorRole:'BU管理员',activeBuId:'BU-DEMO'};
 state.projects[0].name='已保存的独立项目';
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);const navigation=[];
 const settle=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setTimeout(resolve,0));};
 const click=async element=>{assert.ok(element,'the requested control must exist');await act(async()=>{element.click();await settle();});};
 try{
  await act(async()=>{root.render(React.createElement(Dashboard,{appState:state,onSelectBu:()=>{},navigate:(...args)=>navigation.push(args)}));await settle();});
  assert.ok([...node.querySelectorAll('[role="tab"]')].some(tab=>tab.textContent==='审批分析'),'approval analysis has its own tab');
  await click(node.querySelector('[aria-label="筛选逾期项目"]'));
  assert.equal([...node.querySelectorAll('[role="tab"]')].find(tab=>tab.getAttribute('aria-selected')==='true').textContent,'项目与团队');
  assert.equal(node.querySelectorAll('.bu-project-panel tbody tr[data-row-key]').length,2);
  await click(node.querySelector('[aria-label="逾期项目指标说明"]'));
  assert.equal(node.querySelectorAll('.bu-project-panel tbody tr[data-row-key]').length,2);
  await click([...node.querySelectorAll('button')].find(button=>button.textContent.replace(/\s/g,'')==='重置'));
  assert.equal(node.querySelectorAll('.bu-project-panel tbody tr[data-row-key]').length,5);
  await click([...node.querySelectorAll('button')].find(button=>button.textContent.replace(/\s/g,'')==='查询'));
  assert.equal(node.querySelectorAll('.bu-project-panel tbody tr[data-row-key]').length,5,'submitting after reset must not restore the first metric filter');
  await click(node.querySelector('[aria-label="筛选RFQ 项目总数"]'));
  assert.equal(node.querySelectorAll('.bu-project-panel tbody tr[data-row-key]').length,5);
  await click([...node.querySelectorAll('button')].find(button=>button.textContent.replace(/\s/g,'')==='重置'));
  await click([...node.querySelectorAll('button')].find(button=>button.textContent.replace(/\s/g,'')==='查询'));
  assert.equal(node.querySelectorAll('.bu-project-panel tbody tr[data-row-key]').length,5,'reset after an external all-projects filter must not replay the first overdue filter');
  assert.equal(node.textContent.includes('已保存的独立项目'),false,'mock view does not mix saved project records');
  assert.equal(navigation.length,0,'mock projects never trigger real project navigation');
  await click([...node.querySelectorAll('.ant-segmented-item')].find(item=>item.textContent==='当前数据'));
  assert.ok(node.textContent.includes('已保存的独立项目'),'current mode restores the saved dataset');
 }finally{await act(async()=>root.unmount());await window.happyDOM.cancelAsync();}
});
