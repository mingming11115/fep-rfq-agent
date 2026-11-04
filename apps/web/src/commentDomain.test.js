import test from 'node:test';import assert from 'node:assert/strict';import {promoteCommentToIssue,resolveComment} from './commentDomain.js';
const comment={id:'C',anchor:{projectId:'P',fileId:'F',sourceVersion:'v1',requirementId:'R'},text:'核对条件',linkedIssues:{review:'D'}};
test('solving comment does not close promoted issue',()=>{const done=resolveComment(comment,'me','now');assert.equal(done.status,'已解决');assert.deepEqual(done.linkedIssues,{review:'D'});});
test('comment conversion is idempotent and preserves source anchor',()=>{const a=promoteCommentToIssue(comment,{kind:'review',actor:'me',at:'now'});const b=promoteCommentToIssue(comment,{kind:'review',actor:'me',at:'later'});assert.equal(a.id,'D');assert.equal(a.id,b.id);assert.deepEqual(a.anchor,comment.anchor);});
