import test from 'node:test';
import assert from 'node:assert/strict';
import * as policy from './permissions.js';
const sales = '销售负责人', tech = '技术确认人', approver = '最终审批人';

function knowledgeContext(actorId) {
 const state={actorId,accountsById:{
  sr:{enabled:true},tech:{enabled:true},bu:{enabled:true,managedBuIds:['A']},system:{enabled:true,systemAdmin:true},
 },businessUnits:[{id:'A'},{id:'B'}],buPersonnelByBuId:{A:[
  {userId:'sr',roles:['SR'],enabled:true},
  {userId:'tech',roles:['技术'],enabled:true},
  {userId:'bu',roles:[],enabled:true,resourceQualifications:['knowledge-publish']},
 ],B:[]},projects:[]};
 return {state,actorId,buId:'A'};
}

test('every active role can maintain knowledge and reach both library pages',()=>{
 for(const [actorId,role] of [['sr','SR'],['tech','技术'],['bu','BU管理员'],['system','后台管理']]){
  const context=knowledgeContext(actorId);
  assert.equal(policy.canPerform(role,'knowledge:edit',context),true,role);
  for(const page of ['knowledge','history'])assert.equal(policy.canAccessPage(role,page,context),true,`${role}: ${page}`);
  assert.equal(policy.getRoleNavigation(role,context).some(item=>item.page==='knowledge'),true,role);
  assert.equal(policy.canPerform(role,'resource:approve',context),role==='BU管理员',role);
  assert.equal(policy.canPerform(role,'resource:edit',context),role==='技术',`${role}: capability editing`);
 }
});

test('knowledge maintenance still rejects disabled accounts and unrelated business units',()=>{
 for(const [actorId,role] of [['sr','SR'],['tech','技术'],['bu','BU管理员'],['system','后台管理']]){
  const context=knowledgeContext(actorId);
  if(role!=='后台管理') { assert.equal(policy.canPerform(role,'knowledge:edit',{...context,buId:'B'}),false,role); }
  assert.equal(policy.canPerform(role,'knowledge:edit',{...context,buId:'missing'}),false,role);
  context.state.accountsById[actorId].enabled=false;
  assert.equal(policy.canPerform(role,'knowledge:edit',context),false,role);
  assert.equal(policy.canAccessPage(role,'knowledge',context),false,role);
 }
 assert.equal(policy.canPerform('unknown','knowledge:edit'),false);
 const context=knowledgeContext('sr');
 context.state.buPersonnelByBuId.A[0].enabled=false;
 assert.equal(policy.canPerform('SR','knowledge:edit',context),false);
});

test('BU administrators can browse their RFQ pages without gaining response or approval operations',()=>{
 const state={actorId:'bu',accountsById:{bu:{enabled:true,managedBuIds:['A']}},businessUnits:[{id:'A'},{id:'B'}],projects:[{id:'P',buId:'A',participantIds:[]},{id:'OTHER',buId:'B',participantIds:[]}],buPersonnelByBuId:{A:[],B:[]}};
 const context={state,actorId:'bu',buId:'A',projectId:'P'};
 for(const page of ['projects','documents','response','reviews','versions','settings','export']){
  assert.equal(policy.canAccessPage('BU管理员',page,context),true,page);
  if(page!=='projects') { assert.equal(policy.canAccessPage('BU管理员',page,{...context,projectId:'OTHER'}),false,page); }
 }
 for(const action of ['response:edit','response:confirm','snapshot:approve','snapshot:submit','export:download','source:manage'])assert.equal(policy.canPerform('BU管理员',action,context),false,action);
 assert.equal(policy.getRoleNavigation('BU管理员',context).some(item=>item.page==='projects'),true);
 assert.equal(policy.canAccessPage('BU管理员','response',{}),false);
 assert.equal(policy.canAccessPage('BU管理员','response',{...context,projectId:'missing'}),false);
 state.accountsById.bu.enabled=false;
 assert.equal(policy.canAccessPage('BU管理员','response',context),false);
});

test('customer sources and project ownership can only be changed by sales', () => {
  for (const action of ['project:create','project:manage','project:handover','source:manage']) {
    assert.equal(policy.canPerform(sales, action), true);
    assert.equal(policy.canPerform(tech, action), false);
    assert.equal(policy.canPerform(approver, action), false);
  }
});
test('clause confirmation and approval remain separate responsibilities', () => {
  for (const [action, allowed] of [
    ['response:submit',[sales]], ['response:edit',[sales,tech]],
    ['response:confirm',[tech]], ['review:process',[tech]], ['review:clarify',[sales]],
    ['review:approve',[approver]], ['snapshot:submit',[sales,tech]], ['snapshot:approve',[approver]],
  ]) for (const role of [sales,tech,approver]) assert.equal(policy.canPerform(role,action), allowed.includes(role), `${role}: ${action}`);
});
test('only sales may change export mappings or download response files', () => {
  for (const action of ['export:configure','export:download']) {
    assert.equal(policy.canPerform(sales,action),true);
    assert.equal(policy.canPerform(tech,action),false);
    assert.equal(policy.canPerform(approver,action),false);
  }
});
test('technical resource editing does not confer publication or system administration', () => {
  for (const [action,allowed] of [['resource:edit',[tech]],['evidence:manage',[tech]],['resource:approve',[approver]],['system:manage',[]]]) {
    for (const role of [sales,tech,approver]) assert.equal(policy.canPerform(role,action),allowed.includes(role));
  }
});
test('business navigation and deep links never expose system management', () => {
  for (const role of [sales,tech,approver]) {
    assert.equal(policy.canAccessPage(role,'admin'),false);
    assert.equal(policy.canAccessPage(role,'documents'),true);
    assert.equal(policy.getRoleNavigation(role)?.some(item => item.page === 'admin'),false);
  }
  assert.equal(policy.canAccessPage(approver,'analysis'),false);
  assert.equal(policy.canAccessPage(sales,'audit'),false);
  assert.equal(policy.canAccessPage(approver,'audit'),true);
  assert.equal(policy.canAccessPage(tech,'knowledge'),true);
});
test('unknown identities and permission names fail closed', () => {
  assert.equal(policy.canPerform('系统管理员','project:create'),false);
  assert.equal(policy.canPerform(sales,'invented-action'),false);
  assert.equal(policy.canAccessPage(undefined,'dashboard'),false);
  assert.equal(policy.canAccessPage(sales,'invented-page'),false);
  assert.throws(() => policy.assertPermission(tech,'export:download'), /权限|职责/);
});

test('technical drafting cannot change customer source text through an answer patch', () => {
  const row={original:'客户原文',draft:'旧答复',sourceVersion:'V1'};
  assert.throws(()=>policy.assertRequirementPatch(tech,row,{original:'被技术改写的原文',draft:'答复'}),/权限|职责/);
  assert.throws(()=>policy.assertRequirementPatch(tech,row,{sourceVersion:'V2'}),/权限|职责/);
  assert.doesNotThrow(()=>policy.assertRequirementPatch(tech,row,{original:'客户原文',draft:'技术核对答复'}));
  assert.doesNotThrow(()=>policy.assertRequirementPatch(sales,row,{original:'客户修正的原文'}));
});
