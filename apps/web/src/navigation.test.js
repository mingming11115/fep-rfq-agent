import test from 'node:test';import assert from 'node:assert/strict';
import {parseWorkRoute,buildWorkRoute,saveReturnContext,readReturnContext} from './navigation.js';
import * as navigation from './navigation.js';
test('RFQs keep the requested new detail page even before upload',()=>{
 const state={requirementsByProject:{ready:[{id:'R'}]}};
 for(const entry of ['settings','response']){
  assert.equal(navigation.getProjectEntryPage(state,'new',entry),entry);
  assert.equal(navigation.getProjectEntryPage(state,'ready',entry),entry);
 }
 assert.equal(navigation.getProjectEntryPage(state,'ready','documents'),'documents');
});
test('legacy routes and stable clause identities survive route round trip',()=>{
 for(const page of ['documents','response','reviews','export','settings','knowledge'])assert.equal(parseWorkRoute(`#/${page}`).page,page);
 const route={page:'response',projectId:'P',fileId:'F-2',sourceVersion:'v1',requirementId:'无编号-2',taskId:'T-2',returnKey:'export:P'};
 assert.deepEqual(parseWorkRoute(buildWorkRoute(route)),route);
 assert.equal(parseWorkRoute('#/bad').page,'dashboard');
});
test('return context keeps template mapping and selected issue without shared mutable references',()=>{
 const store=new Map();const storage={setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k)};
 saveReturnContext('export:P',{templateId:'T',mapping:{answer:'draft'},issue:'R-2'},storage);
 const result=readReturnContext('export:P',storage);assert.deepEqual(result,{templateId:'T',mapping:{answer:'draft'},issue:'R-2'});
 result.mapping.answer='changed';assert.equal(readReturnContext('export:P',storage).mapping.answer,'draft');
});

test('upload from RFQ detail keeps the background page and selected task context',()=>{
 const origin={page:'settings',projectId:'P',requirementId:'R',taskId:'T',action:'view',returnKey:'tasks'};
 const route=navigation.getSourceUploadRoute(origin,'销售负责人');
 assert.deepEqual(route,{...origin,upload:'true'});
 assert.equal(navigation.shouldOpenSourceUpload(parseWorkRoute(buildWorkRoute(route)),'销售负责人'),true);
 assert.deepEqual(navigation.getSourceUploadExitRoute(route,false),origin);
 assert.deepEqual(navigation.getSourceUploadExitRoute(route,true),{page:'documents',projectId:'P',returnKey:'projects'});
});
test('read-only roles never receive the direct upload action even through an old upload link',()=>{
 for(const role of ['技术确认人','最终审批人']){
  assert.deepEqual(navigation.getSourceUploadRoute({page:'response',projectId:'P'},role),{page:'documents',projectId:'P'});
  assert.equal(navigation.shouldOpenSourceUpload({page:'documents',action:'upload'},role),false);
 }
});
test('cancel returns to the same project detail and successful upload consumes its action on the results page',()=>{
 const route={page:'documents',projectId:'P',action:'upload',returnKey:'response'};
 const cancelled=navigation.getSourceUploadExitRoute(route,false);
 assert.deepEqual(cancelled,{page:'response',projectId:'P',returnKey:'projects'});
 const submitted=navigation.getSourceUploadExitRoute(route,true);
 assert.deepEqual(submitted,{page:'documents',projectId:'P',returnKey:'projects'});
 assert.equal(navigation.shouldOpenSourceUpload(submitted,'销售负责人'),false);
});

