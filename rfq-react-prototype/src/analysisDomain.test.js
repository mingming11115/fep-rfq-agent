import test from 'node:test';import assert from 'node:assert/strict';import {appendAnalysisRun} from './analysisDomain.js';
test('no-match is successful execution and retries retain the original failed run',()=>{
 const failed={id:'RUN-1',projectId:'P',fileId:'F',sourceVersion:'v1',type:'match',status:'失败',failedCount:1};
 const next=appendAnalysisRun([failed],{...failed,id:'RUN-2',status:'完成',failedCount:0,successCount:1,needsHumanCount:1,previousRunId:'RUN-1'});
 assert.equal(next.length,2);assert.equal(next.find(r=>r.id==='RUN-1').status,'失败');assert.equal(next.find(r=>r.id==='RUN-2').status,'完成');
 assert.equal(appendAnalysisRun(next,next[0]).length,2);
});
