import test from 'node:test';import assert from 'node:assert/strict';
import {parseWorkRoute,buildWorkRoute,saveReturnContext,readReturnContext} from './navigation.js';
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
