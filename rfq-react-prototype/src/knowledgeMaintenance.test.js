import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Window} from 'happy-dom';
import React,{act} from 'react';

test('all four roles can create, save, submit and open knowledge imports while publishing stays separate',async()=>{
 const window=new Window({url:'http://127.0.0.1:5174',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 // Match the browser scheduler; Node MessageChannel ports can keep rc-select tests alive.
 const oldChannel=globalThis.MessageChannel;globalThis.MessageChannel=undefined;
 Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage,Node:window.Node,Element:window.Element,HTMLElement:window.HTMLElement,HTMLBodyElement:window.HTMLBodyElement,HTMLHtmlElement:window.HTMLHtmlElement,HTMLInputElement:window.HTMLInputElement,HTMLTextAreaElement:window.HTMLTextAreaElement,SVGElement:window.SVGElement,ShadowRoot:window.ShadowRoot,
  requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window),getComputedStyle:window.getComputedStyle.bind(window),ResizeObserver:window.ResizeObserver,IS_REACT_ACT_ENVIRONMENT:true});
 const directory=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(directory,{recursive:true});
 const output=path.join(directory,'knowledge-maintenance-test.mjs');
 await build({stdin:{contents:"export {KnowledgePage} from './pages/ReferencePages.jsx'; export {default as AdminWorkspace} from './components/AdminWorkspace.jsx';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
 const {KnowledgePage,AdminWorkspace}=await import(pathToFileURL(output)),{createRoot}=await import('react-dom/client');
 const state={accountsById:{sr:{enabled:true},tech:{enabled:true,name:'顾工'},bu:{enabled:true,managedBuIds:['A']},system:{enabled:true,systemAdmin:true}},businessUnits:[{id:'A'}],projects:[],buPersonnelByBuId:{A:[
  {userId:'sr',roles:['SR'],enabled:true},{userId:'tech',roles:['技术'],enabled:true},{userId:'bu',roles:[],enabled:true,resourceQualifications:['knowledge-publish']},
 ]}};
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setTimeout(resolve,0));};
 const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent.replaceAll(' ','')===text);
 const click=async text=>act(async()=>{const node=button(text);assert.ok(node,text);assert.equal(node.disabled,false,text);node.click();await settle();});
 const type=async(label,value)=>act(async()=>{const field=[...document.querySelectorAll('label.field')].find(node=>node.querySelector('span')?.textContent.startsWith(label));const input=field?.querySelector('input,textarea');assert.ok(input,label);Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));await settle();});
 const choose=async(label,text)=>act(async()=>{const input=document.querySelector(`input[aria-label="${label}"]`);assert.ok(input,label);input.closest('.ant-select').querySelector('.ant-select-selector').dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true}));await settle();const option=[...document.querySelectorAll('.ant-select-item-option')].find(node=>!node.closest('.ant-select-dropdown-hidden')&&node.textContent.includes(text));assert.ok(option,`${label}: ${text}`);option.click();await settle();});
 const conditionInput=()=>document.querySelector('input[aria-label="适用条件"]');
 const tags=()=>[...document.querySelectorAll('.knowledge-condition-tags .ant-select-selection-item')].map(tag=>tag.title);
 const addCondition=async value=>{
  await act(async()=>{conditionInput().focus();await settle();});
  await type('适用条件',value);
  await act(async()=>{const enter=new window.KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true});Object.defineProperty(enter,'which',{value:13});conditionInput().dispatchEvent(enter);await settle();});
 };
 const storageKey='rfq.reference.knowledge.v1:A',messages=[];
 const render=async(actorId,role,knowledgeType='standard')=>act(async()=>{const context={state,actorId,buId:'A'};root.render(React.createElement(AdminWorkspace,{key:`${actorId}-${knowledgeType}`,page:knowledgeType==='history'?'history':'knowledge',actorRole:role,permissionContext:context,onNavigate:()=>{}},React.createElement(KnowledgePage,{actorId,actorRole:role,knowledgeType,permissionContext:context,toast:message=>messages.push(message)})));await settle();});
 localStorage.setItem('rfq.reference.evidence.v1:A',JSON.stringify([{id:'E',name:'共享能力报告.pdf',version:1,buId:'A',status:'有效',expiry:'2099-12-31',purpose:'能力依据',scope:'FEP 授权项目'}]));
 try{
  for(const [actorId,role] of [['sr','SR'],['tech','技术'],['bu','BU管理员'],['system','后台管理']]){
   localStorage.setItem(storageKey,'[]');await render(actorId,role);
   assert.ok([...container.querySelectorAll('[role="tab"]')].some(tab=>tab.textContent==='标准回复库'),`${role}: library tab`);
   assert.ok([...container.querySelectorAll('[role="tab"]')].some(tab=>tab.textContent==='历史 RFQ'),`${role}: history tab`);
   await click('新增标准回复');
   await act(async()=>{button('保存草稿').focus();await settle();});await click('保存草稿');
   const titleInput=document.querySelector('[aria-label="回复标题"]');
   assert.equal(titleInput.getAttribute('aria-invalid'),'true','missing content is marked on the relevant field');
   assert.equal(document.activeElement,titleInput,'failed saving moves focus back to the first missing field');
   assert.equal(JSON.parse(localStorage.getItem(storageKey)).length,0);
   await type('回复标题',`${role}维护的知识`);await type('客户要求','要求支持自动上料');await type('标准回复','Comply，支持自动上料。');
   const dialog=document.querySelector('[role="dialog"]');
   assert.equal([...dialog.querySelectorAll('label.field')].some(field=>field.textContent.includes('知识类型')),false,'the standard reply entry cannot silently become a history record');
   if(role==='SR'){
    await choose('来源类型','历史文档');await choose('选择历史文档','共享能力报告.pdf');
   }else if(role==='BU管理员'){
    await choose('来源类型','企业标准口径');await type('口径说明','标准应答规范 V3');
   }else{
    await choose('来源类型','专业人员确认');await choose('选择确认人员','顾工');
   }
   await addCondition('标准上料模块 S');await addCondition('硅材料');await addCondition('硅材料');
   assert.deepEqual(tags(),['标准上料模块 S','硅材料']);
   await act(async()=>{document.querySelector('.knowledge-condition-tags .ant-select-selection-item-remove').click();await settle();});
   assert.deepEqual(tags(),['硅材料']);await addCondition('标准上料模块 S');

   await act(async()=>{conditionInput().focus();await settle();});await type('适用条件','Si 工艺');
   await act(async()=>{button('保存草稿').focus();await settle();});
   await click('保存草稿');
   let records=JSON.parse(localStorage.getItem(storageKey));assert.equal(records.length,1,role);assert.equal(records[0].answer,'Comply，支持自动上料。');assert.equal(records[0].type,'standard');assert.equal(records[0].submitterId,actorId);assert.equal(records[0].status,'草稿');
   assert.ok(!records[0].evidence,'knowledge can be submitted and independently published without an evidence code');
   const source=records[0].source;
   if(role==='SR'){assert.equal(records[0].sourceType,'history-document');assert.ok(records[0].sourceDocumentKey);assert.match(source,/共享能力报告\.pdf/);}
   else if(role==='BU管理员'){assert.equal(records[0].sourceType,'enterprise-standard');assert.equal(records[0].sourceStandardText,'标准应答规范 V3');}
   else{assert.equal(records[0].sourceType,'professional-confirmation');assert.equal(records[0].sourcePersonId,'tech');assert.match(source,/顾工/);}
   assert.equal(records[0].conditions,'硅材料；标准上料模块 S；Si 工艺','saving also retains a tag typed immediately before leaving the field');
   assert.deepEqual([...container.querySelectorAll('.knowledge-condition-list .ant-tag')].map(tag=>tag.textContent),['硅材料','标准上料模块 S','Si 工艺']);
   await click('编辑草稿');assert.deepEqual(tags(),['硅材料','标准上料模块 S','Si 工艺']);await type('标准回复','Comply，已核对模块 S。');await click('保存草稿');
   assert.equal(JSON.parse(localStorage.getItem(storageKey))[0].answer,'Comply，已核对模块 S。');
   assert.equal(JSON.parse(localStorage.getItem(storageKey))[0].source,source,'source associations survive editing and saving');
   await click('提交审核');await click('确认提交审核');
   records=JSON.parse(localStorage.getItem(storageKey));assert.equal(records[0].status,'待审核',role);
   assert.equal(button('批准发布').disabled,role!=='BU管理员',role);
   if(role==='BU管理员'){await click('批准发布');assert.ok(messages.some(message=>message.includes('不得自审')));assert.equal(JSON.parse(localStorage.getItem(storageKey))[0].status,'待审核');}
   await click('批量导入');assert.ok(document.querySelector('input[type="file"]'));await click('取消');
  }
  // A different BU approver can publish a colleague's submitted version.
  await render('bu','BU管理员');await click('批准发布');await click('确认批准并发布');
  assert.equal(JSON.parse(localStorage.getItem(storageKey))[0].status,'已发布');
  await click('修订新版本');await type('标准回复','Comply，修订条件后需重新审核。');await click('保存草稿');
  let records=JSON.parse(localStorage.getItem(storageKey));assert.equal(records.length,2);
  assert.equal(records[0].status,'已发布');assert.equal(records[0].answer,'Comply，已核对模块 S。');
  assert.equal(records[1].status,'草稿');assert.equal(records[1].version,2);
  await render('sr','SR','history');await click('新增历史RFQ知识');
  await type('知识标题','历史项目经验');await type('历史要求','历史客户要求');await type('最终答复','历史批准答复');await click('保存草稿');
  records=JSON.parse(localStorage.getItem(storageKey));assert.equal(records.length,3);assert.equal(records[2].type,'history');assert.equal(records[2].answer,'历史批准答复');
 }finally{await act(async()=>root.unmount());await window.happyDOM.cancelAsync();globalThis.MessageChannel=oldChannel;}
});
