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

test('历史候选下拉展示相似度与具体原文，来源可点击跳转', async () => {
  const h = await harness();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: 0, data: { runId: 'RUN-1', status: 'completed',
    result: { matchedLibrary: 'history_rfq', conclusion: 'Comply', stages: { history_rfq: { status: 'hit',
      candidates: [{ id: 'HC-1', version: 2, title: '历史条款', businessSimilarity: 0.923,
        requirement: '客户要求切割精度 ≤ 50μm', answer: '可满足 ≤50μm', documentId: 'DOC-9' }] } } } } });
  const opened = [];
  try {
    await act(async () => {
      h.root.render(React.createElement(h.RequirementMatchPanel, {
        row: { id: 'R', clause: '1.1', title: 'First clause', original: 'Source' },
        canAdopt: false,
        resources: { historyDocuments: [{ id: 'DOC-9', name: 'HIST-2024.docx', version: 'v1' }] },
        onOpenSource: doc => opened.push(doc.id),
      }));
      await h.settle();
    });
    const details = h.node.querySelector('[aria-label="知识库比对"] details');
    assert.ok(details, '历史候选渲染为下拉');
    assert.match(details.querySelector('summary').textContent, /相似度 92\.3%/);
    await act(async () => { details.open = true; await h.settle(); });
    assert.match(details.textContent, /具体原文/);
    assert.match(details.textContent, /参考答复/);
    assert.equal(details.textContent.includes('客户/机型'), false, '客户机型不再展示');
    assert.equal(details.textContent.includes('适用条件'), false, '适用条件不再展示');
    assert.equal(details.textContent.includes('条款位置'), false, '条款位置不再展示');
    const link = [...details.querySelectorAll('button')].find(item => item.textContent.includes('HIST-2024.docx'));
    assert.ok(link, '来源渲染为可点击链接');
    await act(async () => { link.click(); await h.settle(); });
    assert.deepEqual(opened, ['DOC-9'], '点击来源触发跳转回调');
  } finally { globalThis.fetch = originalFetch; await h.close(); }
});
