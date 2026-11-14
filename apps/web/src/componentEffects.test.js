import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import React,{act} from 'react';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';

test('closed overlay retains its last content and ignores an old close after reopening',async()=>{
 const source=await import('./panePreferences.js').catch((error)=>{ console.error('导入窗格设置测试模块失败', error); return null; });assert.ok(source,'component effect helpers are implemented');
 const window=new Window({url:'http://localhost'});
 Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,Element:window.Element,IS_REACT_ACT_ENVIRONMENT:true});
 const cache=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(cache,{recursive:true});
 await build({stdin:{contents:"export {default as OverlayPresence} from './components/OverlayPresence';export {default as AnimatedNumber} from './components/AnimatedNumber';",resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'jsx'},outfile:cache+'component-effects.mjs',bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic'});
 const {OverlayPresence}=await import(pathToFileURL(cache+'component-effects.mjs')),{createRoot}=await import('react-dom/client');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let close;
 function Probe({open,afterClose,children}){close=afterClose;return React.createElement('div',{'data-open':String(open)},children);}
 const paint=child=>act(async()=>root.render(React.createElement(OverlayPresence,null,child)));
 try{
  await paint(React.createElement(Probe,null,'first'));await paint(null);
  assert.equal(host.textContent,'first');assert.equal(host.firstChild.dataset.open,'false');const oldClose=close;
  await paint(React.createElement(Probe,null,'second'));await act(async()=>oldClose());assert.equal(host.textContent,'second');
  await paint(null);await act(async()=>close());assert.equal(host.textContent,'');
 }finally{await act(async()=>root.unmount());await window.happyDOM.close();}
});
test('pane proportions are scoped and corrupt or blocked storage falls back safely',async()=>{
 const helpers=await import('./panePreferences.js').catch((error)=>{ console.error('导入窗格设置测试模块失败', error); return null; });assert.ok(helpers,'pane preference helpers are implemented');
 const storage=new Map(),api={getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
 const a=helpers.panePreferenceKey('alex','P','horizontal'),b=helpers.panePreferenceKey('alex','Q','horizontal');
 assert.notEqual(a,b);assert.notEqual(a,helpers.panePreferenceKey('alex','P','vertical'));
 helpers.savePaneShare(api,a,65);assert.equal(helpers.readPaneShare(api,a,60),65);assert.equal(helpers.readPaneShare(api,b,60),60);
 storage.set(a,'NaN');assert.equal(helpers.readPaneShare(api,a,60),60);storage.set(a,'150');assert.equal(helpers.readPaneShare(api,a,60),60);
 assert.equal(helpers.readPaneShare({getItem(){throw Error('blocked');}},a,60),60);
 assert.doesNotThrow(()=>helpers.savePaneShare({setItem(){throw Error('blocked');}},a,60));
});
test('metric changes finish at the newest value with system reduced motion on or off',async()=>{
 const window=new Window({url:'http://localhost'}),frames=new Map();let id=0,reduced=false;
 Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,Element:window.Element,IS_REACT_ACT_ENVIRONMENT:true,
  requestAnimationFrame:callback=>{frames.set(++id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id),matchMedia:()=>({matches:reduced})});
 const cache=fileURLToPath(new URL('../node_modules/.cache/component-effects.mjs',import.meta.url));
 const {AnimatedNumber}=await import(pathToFileURL(cache)),{createRoot}=await import('react-dom/client');
 const host=document.createElement('div'),root=createRoot(host);
 const paint=value=>act(async()=>root.render(React.createElement(AnimatedNumber,{value})));
 const tick=now=>act(async()=>{const active=[...frames.values()];frames.clear();for(const callback of active)callback(now);});
 try{
  await paint(100);assert.equal(host.textContent,'0');
  await tick(0);await tick(130);assert.ok(Number(host.textContent)>0&&Number(host.textContent)<100);
  await tick(300);assert.equal(host.textContent,'100');
  await paint(30);assert.equal(host.firstChild.getAttribute('aria-label'),'30');
  await tick(0);await tick(130);assert.ok(Number(host.textContent)>30&&Number(host.textContent)<100);
  await paint(10);await tick(200);await tick(600);assert.equal(host.textContent,'10');
  reduced=true;await paint(0);assert.equal(host.textContent,'10');
  await tick(600);await tick(680);assert.ok(Number(host.textContent)>0&&Number(host.textContent)<10);
  await tick(900);assert.equal(host.textContent,'0');assert.equal(frames.size,0);
 }finally{await act(async()=>root.unmount());delete globalThis.matchMedia;await window.happyDOM.close();}
});
