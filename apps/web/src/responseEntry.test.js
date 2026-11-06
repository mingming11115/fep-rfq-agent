import test from 'node:test';
import assert from 'node:assert/strict';
import {selectResponseEntry} from './responseEntry.js';
const rows=[{id:'first',source:'a.docx',status:'待确认',confirmationAssigneeId:'other',confirmationAssignmentSource:'explicit'},{id:'done',status:'已确认',confirmationAssigneeId:'me',confirmationAssignmentSource:'explicit'},{id:'mine',source:'b.pdf',status:'待确认',confirmationAssigneeId:'me',confirmationAssignmentSource:'explicit'}];
const context={requirements:rows,reviews:[],state:{dataSource:'mysql'},projectId:'P',actorRole:'技术',actorId:'me'};
test('non SR enters their pending card instead of the first document or confirmed assignment',()=>{assert.equal(selectResponseEntry(context).id,'mine');});
test('explicit clause and review links take precedence, SR keeps document default',()=>{
 assert.equal(selectResponseEntry({...context,requirementId:'first'}).id,'first');
 assert.equal(selectResponseEntry({...context,reviewId:'rev',reviews:[{id:'rev',requirementId:'first'}]}).id,'first');
 assert.equal(selectResponseEntry({...context,actorRole:'SR'}).id,'first');
});
test('personal open reviews count until the current actor has voted, completed and foreign reviews do not',()=>{
 const reviews=[{id:'rev',requirementId:'first',reviewerIds:['me'],status:'处理中',version:1,round:1}];
 assert.equal(selectResponseEntry({...context,reviews}).id,'first');
 reviews[0].confirmations={me:{requirementVersion:1,reviewVersion:1,round:1}};
 assert.equal(selectResponseEntry({...context,reviews}).id,'mine');
 reviews[0].confirmations={};reviews[0].status='已关闭';assert.equal(selectResponseEntry({...context,reviews}).id,'mine');
 reviews[0].status='处理中';reviews[0].reviewerIds=['other'];assert.equal(selectResponseEntry({...context,reviews}).id,'mine');
});
test('no personal work and empty project preserve a safe fallback',()=>{
 assert.equal(selectResponseEntry({...context,actorId:'nobody'}).id,'first');
 assert.equal(selectResponseEntry({...context,requirements:[]}),undefined);
});
