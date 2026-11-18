import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

async function harness() {
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,handleDisabledFileLoadingAsSuccess:true,disableJavaScriptFileLoading:true}});
  Object.assign(globalThis,{window,document:window.document,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,DOMParser:window.DOMParser,CSS:window.CSS,location:window.location,localStorage:window.localStorage,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
  const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});const output=path.join(directory,'regen-wording.mjs');
  await build({stdin:{contents:"export {default as AssessmentPanel} from './components/AssessmentPanel.jsx';export {default as RequirementMatchPanel} from './components/RequirementMatchPanel.jsx';",resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'jsx'},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{"BASE_URL":"/"}'}});
  const components=await import(pathToFileURL(output));const {createRoot}=await import('react-dom/client');const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
  const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  return {...components,node,root,settle,async close(){await act(async()=>root.unmount());await window.happyDOM.cancelAsync();}};
}

async function renderPanel(h,{recommendation,canEdit=true}={}) {
  await act(async()=>{h.root.render(React.createElement(h.AssessmentPanel,{
    project:{id:'P'},row:{id:'R',clause:'1.1',title:'First clause',original:'Source',conclusion:'Comply',draft:'Human answer',matchLevel:'standard',score:95},
    conclusion:'Comply',recommendation,currentDraft:'Human answer',evidence:'',canEdit,onAdopt(){},
  }));await h.settle();});
}

test('重新生成 gives visible feedback even when the wording was never edited',async()=>{
  const h=await harness();
  try{
    await renderPanel(h,{recommendation:'系统推荐话术'});
    const regen=[...h.node.querySelectorAll('button')].find(item=>item.textContent.includes('重新生成'));
    assert.ok(regen,'重新生成 button exists');
    assert.equal(h.node.querySelector('.response-regen-hint'),null,'no hint before click');
    await act(async()=>{regen.click();await h.settle();});
    assert.equal(h.node.querySelector('.response-regen-hint')?.textContent,'已重新生成应答话术','click always shows feedback');
  } finally { await h.close(); }
});

test('重新生成 explains when no recommendation is available for the conclusion',async()=>{
  const h=await harness();
  try{
    await renderPanel(h,{recommendation:''});
    const regen=[...h.node.querySelectorAll('button')].find(item=>item.textContent.includes('重新生成'));
    assert.ok(regen);
    await act(async()=>{regen.click();await h.settle();});
    assert.match(h.node.querySelector('.response-regen-hint')?.textContent||'',/暂无可生成的应答话术/);
  } finally { await h.close(); }
});

async function renderMatchPanel(h, { onRematch, matching = false } = {}) {
  await act(async () => {
    h.root.render(React.createElement(h.RequirementMatchPanel, {
      row: { id: 'R', clause: '1.1', title: 'First clause', original: 'Source' },
      canAdopt: false, onRematch, matching,
    }));
    await h.settle();
  });
}

test('重新比对 button appears in the match panel header and fires onRematch', async () => {
  const h = await harness();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: 0, data: { runId: 'RUN-1', status: 'completed', result: { stages: {} } } });
  let clicked = 0;
  try {
    await renderMatchPanel(h, { onRematch: () => { clicked++; } });
    const matchPanel = () => h.node.querySelector('[aria-label="知识库比对"]');
    assert.ok(matchPanel(), 'match panel renders');
    assert.ok(h.node.querySelector('.response-match-head'), 'head row renders');
    const rematch = [...matchPanel().querySelectorAll('button')].find(item => item.textContent.includes('重新比对'));
    assert.ok(rematch, '重新比对 button exists in the match panel header');
    await act(async () => { rematch.click(); await h.settle(); });
    assert.equal(clicked, 1, 'click invokes onRematch');
  } finally { globalThis.fetch = originalFetch; await h.close(); }
});

test('重新比对 button is hidden when no onRematch callback is provided', async () => {
  const h = await harness();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: 0, data: { runId: 'RUN-1', status: 'completed', result: { stages: {} } } });
  try {
    await renderMatchPanel(h);
    const matchPanel = () => h.node.querySelector('[aria-label="知识库比对"]');
    assert.ok(![...matchPanel().querySelectorAll('button')].some(item => item.textContent.includes('重新比对')));
  } finally { globalThis.fetch = originalFetch; await h.close(); }
});
