import test from 'node:test';
import assert from 'node:assert/strict';
import {craftClauseTargets} from './craftClauseTargets.js';
test('repeated Word clauses use their distinct headings for native navigation',()=>{
  const source={projectId:'P',fileId:'F',sourceVersion:'1'};
  const rows=[{id:'R1',projectId:'P',sourceFileId:'F',clause:'P3',title:'Delivery pending',original:'Same words'},
    {id:'R2',projectId:'P',sourceFileId:'F',clause:'C3',title:'Delivery confirmed',original:'Same words'},
    {id:'R3',projectId:'P',sourceFileId:'F',original:'Unique words'}];
  assert.deepEqual(craftClauseTargets(source,rows,'wordcraft').map(t=>t.quote),['P3 Delivery pending\nSame words','C3 Delivery confirmed\nSame words','Unique words']);
  assert.deepEqual(craftClauseTargets(source,rows,'pdfcraft').map(t=>t.quote),['Same words','Same words','Unique words']);
});
