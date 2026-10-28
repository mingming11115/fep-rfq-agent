import test from 'node:test';
import assert from 'node:assert/strict';
import {selectResponseQueue,responseQueueCounts,nextResponseRequirement,responseQueueRoute,responseReviewRoute} from './responseQueue.js';

const rows=[
  {id:'a',clause:'1',title:'安全',status:'待确认'},
  {id:'b',clause:'2',title:'交付',status:'待确认'},
  {id:'c',clause:'3',title:'手册',status:'已确认'},
  {id:'d',clause:'4',title:'培训',status:'待确认'},
];
const reviews=[{id:'r1',requirementId:'b',kind:'review',status:'待处理'},{id:'r2',requirementId:'b',kind:'review',status:'待批准'},{id:'c1',requirementId:'b',kind:'clarification',status:'待回复'},{id:'r3',requirementId:'a',kind:'review',status:'已关闭'}];
test('advances after the current clause instead of returning to the first pending row',()=>{
  assert.equal(nextResponseRequirement(rows,'b')?.id,'d');
});
test('wraps once at the end and never chooses the completed current clause',()=>{
  assert.equal(nextResponseRequirement(rows,'d')?.id,'a');
  assert.equal(nextResponseRequirement([rows[1]],'b'),null);
});
test('does not choose inaccessible requirements when advancing',()=>{
  assert.equal(nextResponseRequirement(rows,'b',{canAct:row=>row.id==='a'})?.id,'a');
  assert.equal(nextResponseRequirement(rows,'b',{canAct:()=>false}),null);
});
test('SR advances past already submitted requirements without confirming them',()=>{
  const submitted=rows.map(row=>row.id==='d'?{...row,readyForConfirmation:true}:row);
  assert.equal(nextResponseRequirement(submitted,'b',{mode:'submit'})?.id,'a');
  assert.equal(submitted[3].status,'待确认');
});
test('review and clarification filters keep each associated clause only once',()=>{
  assert.deepEqual(selectResponseQueue(rows,reviews,{filter:'review'}).map(r=>r.id),['b']);
  assert.deepEqual(selectResponseQueue(rows,reviews,{filter:'clarification'}).map(r=>r.id),['b']);
  assert.deepEqual(selectResponseQueue(rows,reviews,{query:'手册'}).map(r=>r.id),['c']);
});
test('counts unique affected clauses separately from issue count and confirmed progress',()=>{
  const counts=responseQueueCounts(rows,reviews,{canAct:row=>row.id==='d'});
  assert.deepEqual(counts,{total:4,confirmed:1,pending:3,mine:1,review:1,clarification:1,issues:3});
});
test('empty queues and all-complete queues have no next object',()=>{
  assert.equal(nextResponseRequirement([],'missing'),null);
  assert.equal(nextResponseRequirement(rows.map(row=>({...row,status:'已确认'})),'b'),null);
});
test('next-object routes select its effective source and discard stale task and review context',()=>{
  assert.deepEqual(responseQueueRoute({id:'b',sourceFileId:'new-source',sourceVersion:3}),{
    fileId:'new-source',sourceVersion:'3',taskId:undefined,reviewId:undefined,action:undefined,
  });
});
test('opening a review clears the originating requirement task instead of making the review read-only',()=>{
  const route=responseReviewRoute({id:'b',source:'source.docx'},'review-new',{route:{projectId:'p',taskId:'requirement-task',action:'start'},task:{projectId:'p',objectType:'requirement',objectId:'b'}});
  assert.equal(route.reviewId,'review-new');assert.equal(route.taskId,undefined);assert.equal(route.action,undefined);
});
test('opening the matching review task preserves its version-bound work context',()=>{
  const route=responseReviewRoute({id:'b'},'review-new',{route:{projectId:'p',taskId:'review-task',action:'start'},task:{projectId:'p',objectType:'review',objectId:'review-new'}});
  assert.equal(route.reviewId,'review-new');assert.equal(route.taskId,'review-task');assert.equal(route.action,'start');
});
