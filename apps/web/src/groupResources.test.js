import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceGroupIds,matchesResourceGroup,validateResourceGroups,UNGROUPED} from './groupResources.js';
const catalog={buId:'A',schema:{levels:[{id:'g'}]},nodes:[{id:'G1',levelId:'g',name:'A'},{id:'G2',levelId:'g',name:'B'},{id:'D',levelId:'g',name:'停用',enabled:false}],attachments:[{nodeId:'G1',capabilityId:'C',version:1},{nodeId:'G2',capabilityId:'C',version:1}]};
test('resources support multiple groups and explicit removal overrides legacy associations',()=>{assert.deepEqual(resourceGroupIds('capability',{id:'C',version:1},catalog),['G1','G2']);assert.deepEqual(resourceGroupIds('capability',{id:'C',version:1,groupIds:[]},catalog),[]);assert.deepEqual(resourceGroupIds('reply',{groupIds:['G1','G1','G2']},catalog),['G1','G2']);});
test('group matches stay inside BU and ungrouped retains old records',()=>{assert.equal(matchesResourceGroup('reply',{id:'old',buId:'A'},UNGROUPED,catalog),true);assert.equal(matchesResourceGroup('reply',{buId:'B',groupIds:['G1']},'G1',catalog),false);assert.equal(matchesResourceGroup('reply',{groupIds:['G1','G2']},'G2',catalog),true);assert.equal(matchesResourceGroup('reply',{groupId:'missing'},UNGROUPED,catalog),true);});
test('new assignments reject missing or disabled groups while preserving existing disabled links',()=>{assert.deepEqual(validateResourceGroups(catalog,['G2','G1','G2']),['G2','G1']);assert.throws(()=>validateResourceGroups(catalog,['missing']));assert.throws(()=>validateResourceGroups(catalog,['D']));assert.deepEqual(validateResourceGroups(catalog,['D'],['D']),['D']);});

test('legacy history documents retain multiple group associations from their clauses',async()=>{
 const {buildHistoryDocuments}=await import('./historyKnowledge.js');
 const docs=buildHistoryDocuments([],[{id:'L1',type:'history',groupIds:['G1'],source:'旧资料',scope:'FEP 授权项目'},{id:'L2',type:'history',groupIds:['G2'],source:'旧资料',scope:'FEP 授权项目'}]);
 assert.deepEqual(docs[0].groupIds,['G1','G2']);
});
