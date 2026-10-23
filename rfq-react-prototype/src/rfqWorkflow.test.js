import test from 'node:test';import assert from 'node:assert/strict';import {diffRfqRequirements} from './rfqWorkflow.js';
test('duplicate or missing numbers require explicit revision mapping',()=>{
 const old=[{id:'A',clause:'1.1',original:'A'},{id:'B',clause:'1.1',original:'B'},{id:'C',clause:'',original:'C'}];
 assert.throws(()=>diffRfqRequirements(old,[{clause:'1.1',original:'new'}]));
 const changed=diffRfqRequirements(old,[{previousId:'B',clause:'1.1',original:'new'},{previousId:'C',clause:'',original:'C'},{previousId:'A',clause:'1.1',original:'A'}]);
 assert.equal(changed.find(d=>d.before?.id==='B').kind,'modified');assert.equal(changed.find(d=>d.before?.id==='C').kind,'unchanged');
});
