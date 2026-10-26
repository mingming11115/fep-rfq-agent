import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFinalReviewDecision,isFinalReviewApproved} from './finalReviewDomain.js';
function snap(mode='all'){return {id:'s',status:'审批中',finalReview:{policy:'sr-and-technical',technicalMode:mode,ruleVersion:1,reviewers:{srId:'sr',technicalIds:['t1','t2','t3'],technicalRepresentativeId:'t2'},decisions:{sr:null,technicalByActorId:{}}}};}
const vote=(s,id,side='technical',result='approved',reason='')=>applyFinalReviewDecision(s,{actorId:id,side,result,reason});
test('all technical reviewers and SR must explicitly approve the same snapshot',()=>{
 let s=snap();s=vote(s,'sr','sr');s=vote(s,'t1');s=vote(s,'t2');assert.equal(s.status,'审批中');assert.equal(isFinalReviewApproved(s),false);
 s=vote(s,'t3');assert.equal(s.status,'已批准');assert.equal(isFinalReviewApproved(s),true);assert.equal(Object.keys(s.finalReview.decisions.technicalByActorId).length,3);
 assert.equal(isFinalReviewApproved({status:'已批准',reviewedById:'legacy'}),false);
});
test('representative mode only accepts the designated group representative and still requires SR',()=>{
 let s=snap('representative');assert.throws(()=>vote(s,'t1'),/指定|权限|评审/);s=vote(s,'t2');assert.equal(s.status,'审批中');s=vote(s,'sr','sr');assert.equal(isFinalReviewApproved(s),true);
});
test('wrong side, duplicate vote, invalid group and stale snapshot cannot bypass review',()=>{
 let s=snap();assert.throws(()=>vote(s,'sr'),/指定|权限|评审/);s=vote(s,'t1');assert.throws(()=>vote(s,'t1'),/已|重复/);
 assert.throws(()=>vote({...s,stale:true},'t2'),/失效|版本/);assert.equal(isFinalReviewApproved({...s,finalReview:{...s.finalReview,reviewers:{srId:'sr',technicalIds:[]}}}),false);
});
test('any required reviewer may reject with a reason and the new round starts without inherited votes',()=>{
 let s=vote(snap(),'sr','sr');assert.throws(()=>vote(s,'t1','technical','rejected'),/原因/);s=vote(s,'t1','technical','rejected','需要补证');
 assert.equal(s.status,'已退回');assert.equal(isFinalReviewApproved(s),false);assert.throws(()=>vote(s,'t2'),/状态|退回/);assert.equal(isFinalReviewApproved(snap()),false);
});
