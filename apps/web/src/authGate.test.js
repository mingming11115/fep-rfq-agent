import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

async function mountAuthGate({session}={}) {
  const window=new Window({url:'http://127.0.0.1:5173',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true}});
  Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,Element:window.Element,Node:window.Node,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true});
  Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true,writable:true});
  Object.defineProperty(globalThis,'localStorage',{value:window.localStorage,configurable:true,writable:true});
  const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));
  await mkdir(directory,{recursive:true});
  const output=path.join(directory,'auth-gate-test.mjs');
  await build({entryPoints:[fileURLToPath(new URL('./AuthGate.jsx',import.meta.url))],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
  const mod=await import(pathToFileURL(output)+`?t=${Date.now()}`);
  if(session) { localStorage.setItem('fep-rfq-auth',JSON.stringify(session)); }
  else { localStorage.removeItem('fep-rfq-auth'); }
  const {createRoot}=await import('react-dom/client');
  const node=document.createElement('div');
  document.body.append(node);
  const root=createRoot(node);
  const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setTimeout(resolve,0));};
  const render=async()=>act(async()=>{root.render(React.createElement(mod.default,null,React.createElement('div',{id:'app-shell'},'APP')));await settle();});
  return {mod,node,render,settle,act};
}

test('未登录时停在登录页，不渲染主应用',async()=>{
  const {node,render}=await mountAuthGate();
  await render();
  assert.match(node.textContent,/登录工作空间/);
  assert.match(node.textContent,/各角色一键登录/);
  assert.equal(node.querySelector('#app-shell'),null);
});

test('已登录时直接进入主应用，不出现登录页',async()=>{
  const session={token:'t',expiresInSeconds:28800,user:{id:'demo-sales',displayName:'张明',systemAdmin:false,roles:[{buId:'BU-FEP',role:'SR'}],bus:[]},savedAt:Date.now()};
  const {node,render}=await mountAuthGate({session});
  await render();
  assert.ok(node.querySelector('#app-shell'));
  assert.doesNotMatch(node.textContent,/登录工作空间/);
});

test('点击演示账号登录成功后切换到主应用并写入登录身份',async()=>{
  const {node,render,settle,act}=await mountAuthGate();
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({code:0,msg:'成功',data:{token:'tok',expiresInSeconds:28800,user:{id:'demo-system-admin',displayName:'系统管理员',systemAdmin:true,roles:[],bus:[]}}})});
  await render();
  const card=[...node.querySelectorAll('button')].find(button=>/系统管理员/.test(button.textContent));
  assert.ok(card,'演示账号卡片应包含系统管理员');
  await act(async()=>{card.click();await settle();});
  assert.ok(node.querySelector('#app-shell'),'登录后应渲染主应用');
  const identity=JSON.parse(localStorage.getItem('fep-rfq-login-identity'));
  assert.deepEqual(identity,{actorId:'demo-system-admin',actorRole:'后台管理'});
  assert.equal(localStorage.getItem('fep-rfq-login-identity')&&localStorage.getItem('fep-rfq-auth')!==null,true);
});

test('后端角色码映射到前端可用身份',async()=>{
  const {mod}=await mountAuthGate();
  assert.deepEqual(mod.resolveLoginIdentity({id:'demo-sales',systemAdmin:false,roles:[{buId:'BU-FEP',role:'SR'}]}),{actorId:'demo-sales',actorRole:'SR'});
  assert.deepEqual(mod.resolveLoginIdentity({id:'demo-technical',systemAdmin:false,roles:[{buId:'BU-FEP',role:'TECH'}]}),{actorId:'demo-technical',actorRole:'技术'});
  assert.deepEqual(mod.resolveLoginIdentity({id:'demo-approver',systemAdmin:false,roles:[{buId:'BU-FEP',role:'APPROVER'}]}),{actorId:'demo-approver',actorRole:'技术'});
  assert.deepEqual(mod.resolveLoginIdentity({id:'demo-bu-admin',systemAdmin:false,roles:[{buId:'BU-FEP',role:'BU_ADMIN'}]}),{actorId:'demo-bu-admin',actorRole:'BU管理员'});
  assert.deepEqual(mod.resolveLoginIdentity({id:'demo-system-admin',systemAdmin:true,roles:[]}),{actorId:'demo-system-admin',actorRole:'后台管理'});
  assert.equal(mod.resolveLoginIdentity(null),null);
});

test('普通账号登录后离开上一位管理员的系统配置地址',async()=>{
  const {node,render,settle,act}=await mountAuthGate();
  window.history.replaceState(null,'','#/admin');
  let submitted;
  globalThis.fetch=async(url,options)=>{submitted=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({code:0,data:{token:'new-user-token',expiresInSeconds:28800,user:{id:'new-user',displayName:'新用户',systemAdmin:false,roles:[{buId:'BU-FEP',role:'SR'}],bus:[{id:'BU-FEP',name:'FEP事业部'}]}}})};};
  await render();
  const card=[...node.querySelectorAll('button')].find(button=>/销售负责人/.test(button.textContent));
  await act(async()=>{card.click();await settle();});
  assert.deepEqual(submitted,{username:'mysql_sr',password:'Rfq@2026'});
  assert.equal(window.location.hash,'#/dashboard');
  assert.deepEqual(JSON.parse(localStorage.getItem('fep-rfq-login-identity')),{actorId:'new-user',actorRole:'SR'});
});
