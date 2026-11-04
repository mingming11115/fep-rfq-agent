import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeNativeComments, planCraftWrites, applyCraftBinding, markCraftSaved, craftCommentFingerprint, applyCollaborationEdit } from './craftCommentSync.js';

const source = { projectId: 'P1', fileId: 'F1', sourceVersion: 'v1' };
const rows = [
  { id: 'R1', projectId: 'P1', sourceFileId: 'F1', sourceVersion: 'v1', sourcePage: 2, original: 'First requirement.' },
  { id: 'R2', projectId: 'P1', sourceFileId: 'F1', sourceVersion: 'v1', sourcePage: 3, original: 'Second requirement.' },
  { id: 'R3', projectId: 'P1', sourceFileId: 'F2', sourceVersion: 'v1', original: 'Other file.' },
];
const actor = { id: 'alice', name: 'Alice' };
const people = [actor, { id: 'bob', name: 'Bob' }];
const context = { source, documentId: 'doc-1', revision: 1, engine: 'word', rows, actor, people, canEditRow: () => true };
const note = (values = {}) => ({ id: 3, nativeKey: 'native-1', author: 'Alice', text: 'Check tolerance', quote: 'First requirement.', clauseId: 'R1', resolved: false, date: '2026-11-01T01:00:00Z', replies: [], ...values });
const snapshot = (notes, values = {}) => ({ document: 'frame-1', applied: 2, complete: true, notes, source: { selectedId: 'R1', status: 'matched' }, ...values });
const business = (values = {}) => ({ id: 'C1', anchor: { ...source, requirementId: 'R1', locator: { page: 2, quote: 'First requirement.', textPart: 'body', textRange: { start: 0, end: 18 } } }, quote: 'First requirement.', text: 'Check tolerance', createdBy: 'alice', createdAt: '2026-11-01T01:00:00Z', status: '未解决', mentionedUserIds: ['bob'], replies: [], linkedIssues: { review: 'V1' }, ...values });
const merge = (comments, notes, extra = {}) => mergeNativeComments({ ...context, comments, snapshot: snapshot(notes), ...extra });
const plan = (comments, notes = [], extra = {}) => planCraftWrites({ ...context, comments, snapshot: snapshot(notes), ...extra });
const imported = (values = {}) => merge([], [note(values)]).comments[0];
const bind = (comment, result = {}, extra = {}) => applyCraftBinding([comment], comment.id, { id: 3, nativeKey: 'native-1', replies: [], ...result }, { ...context, ...extra })[0];

test('native comments enter collaboration only through a valid clause and stable native key', () => {
  const result = merge([], [note()]);
  assert.equal(result.comments.length, 1);
  assert.equal(result.comments[0].createdBy, 'alice');
  assert.equal(result.comments[0].anchor.requirementId, 'R1');
  assert.equal(result.comments[0].anchor.fileId, 'F1');
  assert.equal(result.comments[0].nativeRef.key, 'native-1');
  assert.equal(result.comments[0].nativeRef.documentId, 'doc-1');
  assert.deepEqual(result.unlinked, []);
  assert.equal(result.changed, true);
  assert.deepEqual(plan(result.comments, [note()]), []);
});

test('unmatched native notes never attach to the selected clause; explicit valid association imports them', () => {
  const notes = [note({ nativeKey: 'outside', clauseId: undefined, quote: 'Unknown quote' })];
  const result = merge([], notes);
  assert.deepEqual(result.comments, []);
  assert.equal(result.unlinked[0].nativeKey, 'outside');
  assert.equal(result.unlinked[0].reason, 'unassociated');
  assert.equal(merge([], notes, { associations: { outside: 'R2' } }).comments[0].anchor.requirementId, 'R2');
  assert.equal(merge([], notes, { associations: { outside: 'R3' } }).comments.length, 0);
  assert.equal(merge([], notes, { associations: { outside: ['R1', 'R2'] } }).comments.length, 0);
});

test('empty native draft is ignored, and quote-less notes need explicit association', () => {
  assert.deepEqual(merge([], [note({ text: ' ', replies: [] })]).comments, []);
  const uncommitted = merge([], [note({ text: '', quote: '', clauseId: undefined, replies: [] })]);
  assert.deepEqual(uncommitted.comments, []);
  assert.deepEqual(uncommitted.unlinked, []);
  assert.deepEqual(merge([], [note({ quote: '' })]).comments, []);
  assert.equal(merge([], [note({ quote: '' })], { associations: { 'native-1': 'R1' } }).comments.length, 1);
  assert.equal(merge([], [note({ text: '', replies: [{ id: 5, nativeKey: 'reply-1', author: 'Bob', text: 'Reply' }] })]).comments.length, 1);
});

test('an explicitly opened empty draft imports only its own native key and valid clause', () => {
  const opened=note({text:''}),other=note({id:8,nativeKey:'untouched',text:''});
  const result=merge([], [opened,other], {draftNativeKeys:['native-1']});
  assert.equal(result.comments.length,1);assert.equal(result.comments[0].nativeRef.key,'native-1');
  assert.deepEqual(plan(result.comments,[opened,other]),[],'opening a blank editor does not create an upsert loop');
  const missing=merge([], [note({text:'',clauseId:undefined})], {draftNativeKeys:['native-1']});
  assert.equal(missing.comments.length,0);assert.equal(missing.unlinked.length,1);
});

test('a right-side deletion survives old native echoes until removal, then native undo can restore it',()=>{
  const original=imported(),removed={...original,nativeDeleted:true,nativeRef:{...original.nativeRef,state:'delete-pending'}};
  const echoed=merge([removed],[note()]).comments[0];assert.equal(echoed.nativeDeleted,true);
  assert.equal(plan([echoed],[note()])[0].action,'delete');
  const confirmed=merge([echoed],[]).comments[0];assert.equal(confirmed.nativeRef.state,'deleted');
  assert.equal(merge([confirmed],[note()]).comments[0].nativeDeleted,undefined);
});

test('a fresh native comment reusing a deleted key starts a new discussion without reviving old review links',()=>{
  const previous={...imported(),linkedIssues:{review:'V1'}},deleted={...previous,nativeDeleted:true,nativeRef:{...previous.nativeRef,state:'deleted'}};
  const result=merge([deleted],[note({text:''})],{draftNativeKeys:['native-1'],freshNativeKeys:['native-1']});
  assert.equal(result.comments.length,2);
  assert.equal(result.comments[0].nativeDeleted,true);assert.equal(result.comments[0].nativeRef.key,undefined);
  assert.deepEqual(result.comments[0].linkedIssues,{review:'V1'});
  const fresh=result.comments[1];assert.notEqual(fresh.id,previous.id);assert.equal(fresh.text,'');assert.deepEqual(fresh.linkedIssues,{});
  const saved={...fresh,text:'New discussion'};
  assert.deepEqual(plan([result.comments[0],saved],[note({text:''})]).map(item=>[item.action,item.params.id]),[['upsert',3]]);
});

test('manager deletion retains existing native permissions without granting root-text editing',()=>{
  const other=imported({author:'Bob'}),removed={...other,nativeDeleted:true};
  assert.equal(plan([removed],[note({author:'Bob'})]).length,0);
  assert.equal(plan([removed],[note({author:'Bob'})],{editDocument:true})[0].action,'delete');
  assert.equal(plan([removed],[note({author:'Bob'})],{editDocument:true,canEditRow:()=>false}).length,0);
  const edited={...other,text:'Disallowed rewrite'};
  assert.equal(plan([edited],[note({author:'Bob'})],{editDocument:true}).length,0);
});

test('source tuple and backend document identity isolate imported and existing discussions', () => {
  const old = imported();
  assert.equal(merge([old], [note({ text: 'Other backend' })], { documentId: 'doc-2' }).comments[0].text, 'Check tolerance');
  assert.equal(merge([], [note()], { source: { ...source, sourceVersion: 'v2' } }).comments.length, 0);
  assert.equal(merge([], [note()], { snapshot: snapshot([note()], { documentId: 'doc-2' }) }).comments.length, 0);
  assert.equal(merge([], [note()], { snapshot: snapshot([note()], { source: { ...source, fileId: 'F2' } }) }).comments.length, 0);
  assert.deepEqual(plan([business({ anchor: { ...business().anchor, sourceVersion: 'v0' } })]), []);
  assert.deepEqual(plan([business({ anchor: { ...business().anchor, fileId: 'F2' } })]), []);
});

test('stable keys survive numeric index changes and repeated snapshots without duplicate replies', () => {
  const firstNote = note({ replies: [{ id: 6, nativeKey: 'reply-1', author: 'Bob', text: 'Confirm', date: '2026-11-01T01:01:00Z' }] });
  const first = merge([], [firstNote]);
  const reopened = merge(first.comments, [note({ ...firstNote, id: 40, replies: [{ ...firstNote.replies[0], id: 90 }] })]);
  assert.deepEqual(reopened.comments, first.comments);
  assert.equal(reopened.changed, false);
  assert.equal(reopened.comments[0].replies.length, 1);
  assert.equal(reopened.comments[0].replies[0].nativeRef.key, 'reply-1');
  assert.deepEqual(plan(reopened.comments, [note({ ...firstNote, id: 40 })]), []);
});

test('native edits, replies, resolution, and reopen preserve business ownership and metadata', () => {
  const original = bind(business());
  const native = note({ text: 'Updated native text', author: 'New display', resolved: true, replies: [{ id: 5, nativeKey: 'reply-1', author: 'Bob', text: 'Approved', date: 'native-date' }] });
  const updated = merge([original], [native]).comments[0];
  assert.equal(updated.text, 'Updated native text');
  assert.equal(updated.status, '已解决');
  assert.equal(updated.createdBy, 'alice');
  assert.equal(updated.createdAt, original.createdAt);
  assert.deepEqual(updated.mentionedUserIds, ['bob']);
  assert.deepEqual(updated.linkedIssues, { review: 'V1' });
  assert.deepEqual(updated.anchor.locator.textRange, { start: 0, end: 18 });
  assert.equal(updated.nativeAuthor, 'New display');
  assert.equal(updated.replies[0].by, 'bob');
  assert.equal(updated.replies[0].at, 'native-date');
  const reopened = merge([updated], [note({ ...native, resolved: false })]).comments[0];
  assert.equal(reopened.status, '未解决');
  assert.deepEqual(plan([reopened], [note({ ...native, resolved: false })]), []);
});

test('unknown or ambiguous native authors remain external instead of inheriting local edit rights', () => {
  const external = imported({ author: 'Supplier' });
  assert.match(external.createdBy, /^external:/);
  assert.equal(external.nativeAuthor, 'Supplier');
  const ambiguous = merge([], [note()], { people: [...people, { id: 'other-alice', name: 'Alice' }] }).comments[0];
  assert.match(ambiguous.createdBy, /^external:/);
  assert.deepEqual(plan([{ ...external, text: 'Unauthorized rewrite' }], [note({ author: 'Supplier' })]), []);
});

test('right-side new comment produces an anchored native upsert and acknowledgment stops echo', () => {
  const c = business({ replies: [{ text: 'Self reply', by: 'alice', at: 'local-time', mentionedUserIds: ['bob'] }] });
  const operations = plan([c]);
  assert.equal(operations.length, 1);
  assert.equal(operations[0].commentId, 'C1');
  assert.equal(operations[0].action, 'upsert');
  assert.deepEqual(operations[0].params, { text: 'Check tolerance', author: 'Alice', resolved: false, quote: 'First requirement.', clauseId: 'R1', page: 1, replies: [{ text: 'Self reply', author: 'Alice' }] });
  const bound = bind(c, { projection: operations[0].projection, replies: [{ id: 5, nativeKey: 'reply-1' }] });
  const native = note({ replies: [{ id: 5, nativeKey: 'reply-1', text: 'Self reply', author: 'Alice' }] });
  const echoed = merge([bound], [native]);
  assert.equal(echoed.comments[0].replies.length, 1);
  assert.deepEqual(echoed.comments[0].replies[0].mentionedUserIds, ['bob']);
  assert.deepEqual(plan(echoed.comments, [native]), []);
});

test('right-side edits and replies use the latest numeric ID for a stable native key', () => {
  const c = imported();
  const operations = plan([{ ...c, text: 'Edited', status: '已解决', replies: [{ text: 'New answer', by: 'alice' }] }], [note({ id: 45 })]);
  assert.equal(operations[0].params.id, 45);
  assert.equal(operations[0].params.text, 'Edited');
  assert.equal(operations[0].params.resolved, true);
  assert.deepEqual(operations[0].params.replies, [{ text: 'New answer', author: 'Alice' }]);
});

test('read-only and missing permissions reject local writes while allowing native imports', () => {
  assert.equal(merge([], [note()], { canEditRow: () => false }).comments.length, 1);
  assert.deepEqual(plan([business()], [], { canEditRow: () => false }), []);
  assert.deepEqual(plan([business()], [], { canEditRow: undefined }), []);
  assert.deepEqual(plan([business()], [], { canEditRow: false }), []);
});

test('only a comment author may rewrite its root while other editors can reply or resolve', () => {
  const c = imported({ author: 'Bob' });
  assert.deepEqual(plan([{ ...c, text: 'Unauthorized' }], [note({ author: 'Bob' })]), []);
  const op = plan([{ ...c, text: 'Unauthorized', status: '已解决', replies: [{ by: 'alice', text: 'My answer' }, { by: 'bob', text: 'Forged answer' }] }], [note({ author: 'Bob' })])[0];
  assert.equal(op.params.text, 'Check tolerance');
  assert.equal(op.params.author, 'Bob');
  assert.equal(op.params.resolved, true);
  assert.deepEqual(op.params.replies, [{ text: 'My answer', author: 'Alice' }]);
});

test('reply editing is restricted to its author and preserves native identity and metadata', () => {
  const native = note({ replies: [{ id: 9, nativeKey: 'reply-bob', author: 'Bob', text: 'Bob answer' }, { id: 10, nativeKey: 'reply-alice', author: 'Alice', text: 'Alice answer' }] });
  const c = merge([], [native]).comments[0];
  const changed = { ...c, replies: c.replies.map(r => ({ ...r, text: 'Changed' })) };
  const op = plan([changed], [native])[0];
  assert.deepEqual(op.params.replies, [{ id: 9, text: 'Bob answer', author: 'Bob' }, { id: 10, text: 'Changed', author: 'Alice' }]);
});

test('an older native base never overwrites local pending text or replies after refresh', () => {
  const c = imported();
  const pending = { ...c, text: 'Local pending', replies: [{ text: 'Unsaved reply', by: 'alice', mentionedUserIds: ['bob'] }] };
  const result = merge([pending], [note()], { snapshot: snapshot([note()], { document: 'frame-reopened' }) });
  assert.equal(result.comments[0].text, 'Local pending');
  assert.equal(result.comments[0].replies.length, 1);
  assert.equal(result.comments[0].nativeRef.state, 'pending');
  assert.equal(plan(result.comments, [note()])[0].params.text, 'Local pending');
  assert.deepEqual(result.conflicts, []);
});

test('acknowledged but unsaved edits and replies replay after reopening older server bytes', () => {
  const saved = markCraftSaved([imported()], { documentId: 'doc-1', revision: 1 })[0];
  const edited = { ...saved, text: 'Acknowledged but not saved', status: '已解决', replies: [{ by: 'alice', at: 'pending-time', text: 'Unsaved reply', mentionedUserIds: ['bob'] }] };
  const operation = plan([edited], [note()])[0];
  const acknowledged = bind(edited, { projection: operation.projection, replies: [{ id: 8, nativeKey: 'reply-unsaved' }] });
  const native = note({ text: edited.text, resolved: true, replies: [{ id: 8, nativeKey: 'reply-unsaved', author: 'Alice', text: 'Unsaved reply' }] });
  const echo = merge([acknowledged], [native]);
  assert.equal(echo.comments[0].nativeRef.state, 'synced');
  const oldFile = snapshot([note({ id: 40 })], { document: 'reopened-frame' });
  const recovered = merge(echo.comments, oldFile.notes, { snapshot: oldFile });
  assert.equal(recovered.comments[0].text, 'Acknowledged but not saved');
  assert.equal(recovered.comments[0].status, '已解决');
  assert.equal(recovered.comments[0].replies[0].text, 'Unsaved reply');
  assert.deepEqual(recovered.comments[0].replies[0].mentionedUserIds, ['bob']);
  assert.equal(recovered.comments[0].nativeRef.state, 'pending');
  assert.equal(recovered.comments[0].nativeRef.savedFingerprint, saved.nativeRef.savedFingerprint);
  assert.deepEqual(recovered.conflicts, []);
  const retry = plan(recovered.comments, oldFile.notes, { snapshot: oldFile })[0];
  assert.equal(retry.params.id, 40);
  assert.equal(retry.params.text, 'Acknowledged but not saved');
  assert.equal(retry.params.resolved, true);
  assert.deepEqual(retry.params.replies, [{ text: 'Unsaved reply', author: 'Alice' }]);
  const repeated = merge(recovered.comments, oldFile.notes, { snapshot: oldFile });
  assert.deepEqual(repeated.comments, recovered.comments);
  assert.deepEqual(repeated.conflicts, []);
});

test('unsaved native acknowledgment without a prior save checkpoint survives reopening the same backend revision', () => {
  const original = imported();
  const changed = { ...original, text: 'Unsaved acknowledgment without checkpoint' };
  const operation = plan([changed], [note()])[0];
  const acknowledged = bind(changed, { projection: operation.projection });
  const echo = merge([acknowledged], [note({ text: changed.text })]);
  const reopened = merge(echo.comments, [note()], { snapshot: snapshot([note()], { document: 'reopened-frame' }) });
  assert.equal(reopened.comments[0].text, changed.text);
  assert.equal(reopened.comments[0].nativeRef.state, 'pending');
  assert.deepEqual(reopened.conflicts, []);
  assert.equal(plan(reopened.comments, [note()])[0].params.text, changed.text);
});

test('unsaved acknowledged edits conflict with a newer independently saved server version', () => {
  const saved = markCraftSaved([imported()], { documentId: 'doc-1', revision: 1 })[0];
  const changed = { ...saved, text: 'My acknowledged unsaved edit' };
  const operation = plan([changed], [note()])[0];
  const acknowledged = bind(changed, { projection: operation.projection });
  const echo = merge([acknowledged], [note({ text: changed.text })]);
  const remote = note({ text: 'Another editor saved this' });
  const reopened = merge(echo.comments, [remote], { revision: 2, snapshot: snapshot([remote], { document: 'reopened-frame' }) });
  assert.equal(reopened.comments[0].text, changed.text);
  assert.equal(reopened.comments[0].nativeRef.state, 'conflict');
  assert.equal(reopened.conflicts[0].native.text, 'Another editor saved this');
  assert.equal(reopened.conflicts[0].base.text, 'Check tolerance');
  assert.deepEqual(plan(reopened.comments, [remote]), []);
});

test('a newer reopened file deleting an acknowledged unsaved thread preserves it as conflict without recreation', () => {
  const saved = markCraftSaved([imported()], { documentId: 'doc-1', revision: 1 })[0];
  const changed = { ...saved, text: 'Unsaved acknowledged root', replies: [{ by: 'alice', at: 'pending-time', text: 'Unsaved acknowledged answer' }] };
  const operation = plan([changed], [note()])[0];
  const acknowledged = bind(changed, { projection: operation.projection, replies: [{ id: 8, nativeKey: 'reply-unsaved' }] });
  const echoed = merge([acknowledged], [note({ text: changed.text, replies: [{ id: 8, nativeKey: 'reply-unsaved', author: 'Alice', text: 'Unsaved acknowledged answer' }] })]);
  const newerFile = snapshot([], { document: 'newer-reopened-frame' });
  const result = merge(echoed.comments, [], { revision: 2, snapshot: newerFile });
  assert.equal(result.comments[0].text, 'Unsaved acknowledged root');
  assert.equal(result.comments[0].replies[0].text, 'Unsaved acknowledged answer');
  assert.equal(result.comments[0].nativeDeleted, undefined);
  assert.equal(result.comments[0].nativeRef.state, 'conflict');
  assert.equal(result.conflicts[0].reason, 'concurrent-delete');
  assert.equal(result.conflicts[0].native, null);
  assert.equal(result.conflicts[0].base.text, 'Check tolerance');
  assert.deepEqual(plan(result.comments, [], { revision: 2, snapshot: newerFile }), []);
});

test('a newer reopened file deleting a thread conflicts with outstanding business edits before native upsert', () => {
  const saved = markCraftSaved([imported()], { documentId: 'doc-1', revision: 1 })[0];
  const pending = { ...saved, text: 'Unsubmitted right edit' };
  const newerFile = snapshot([], { document: 'newer-reopened-frame' });
  const result = merge([pending], [], { revision: 2, snapshot: newerFile });
  assert.equal(result.comments[0].text, 'Unsubmitted right edit');
  assert.equal(result.comments[0].nativeDeleted, undefined);
  assert.equal(result.comments[0].nativeRef.state, 'conflict');
  assert.equal(result.conflicts[0].reason, 'concurrent-delete');
  assert.deepEqual(plan(result.comments, [], { revision: 2, snapshot: newerFile }), []);
});

test('a newer reopened file authoritatively deletes a saved unchanged thread', () => {
  const saved = markCraftSaved([imported()], { documentId: 'doc-1', revision: 1 })[0];
  const newerFile = snapshot([], { document: 'newer-reopened-frame' });
  const result = merge([saved], [], { revision: 2, snapshot: newerFile });
  assert.equal(result.comments[0].nativeDeleted, true);
  assert.equal(result.comments[0].nativeRef.state, 'deleted');
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(plan(result.comments, [], { revision: 2, snapshot: newerFile }), []);
});

test('same-session native edits still update acknowledged unsaved business records', () => {
  const saved = markCraftSaved([imported()], { documentId: 'doc-1', revision: 1 })[0];
  const changed = { ...saved, text: 'Unsaved live text' };
  const operation = plan([changed], [note()])[0];
  const acknowledged = bind(changed, { projection: operation.projection });
  const updated = merge([acknowledged], [note()]);
  assert.equal(updated.comments[0].text, 'Check tolerance');
  assert.deepEqual(updated.conflicts, []);
});

test('concurrent native and business edits surface a conflict without destroying either version', () => {
  const c = imported();
  const result = merge([{ ...c, text: 'Local version' }], [note({ text: 'Native version' })]);
  assert.equal(result.comments[0].text, 'Local version');
  assert.equal(result.comments[0].nativeRef.state, 'conflict');
  assert.equal(result.conflicts[0].native.text, 'Native version');
  assert.equal(result.conflicts[0].local.text, 'Local version');
  assert.deepEqual(plan(result.comments, [note({ text: 'Native version' })]), []);
});

test('native deletion creates a tombstone retaining linked issues and never deletes pending edits', () => {
  const c = { ...imported(), linkedIssues: { review: 'V1' } };
  const deleted = merge([c], []).comments[0];
  assert.equal(deleted.nativeDeleted, true);
  assert.deepEqual(deleted.linkedIssues, { review: 'V1' });
  assert.deepEqual(plan([deleted]), []);
  const pending = merge([{ ...c, text: 'Keep unsaved' }], []).comments[0];
  assert.equal(pending.nativeDeleted, undefined);
  assert.equal(pending.text, 'Keep unsaved');
  assert.equal(plan([pending])[0].params.id, undefined);
});

test('same-session native undo restores a deleted discussion without sending another delete', () => {
  const c = { ...imported(), linkedIssues: { review: 'V1' } };
  const deleted = merge([c], []).comments[0];
  assert.equal(deleted.nativeDeleted, true);
  const restored = merge([deleted], [note()]);
  assert.equal(restored.comments[0].nativeDeleted, undefined);
  assert.equal(restored.comments[0].text, 'Check tolerance');
  assert.deepEqual(restored.comments[0].linkedIssues, { review: 'V1' });
  assert.deepEqual(plan(restored.comments, [note()]), []);
});

test('a deletion inferred on initial reopen records that session so its native undo can restore the note', () => {
  const saved = markCraftSaved([imported()], { documentId: 'doc-1', revision: 2 })[0];
  const empty = snapshot([], { document: 'reopened-frame' });
  const deleted = merge([saved], [], { revision: 2, snapshot: empty }).comments[0];
  assert.equal(deleted.nativeDeleted, true);
  assert.equal(deleted.nativeRef.documentToken, 'reopened-frame');
  const restoredFile = snapshot([note()], { document: 'reopened-frame' });
  const restored = merge([deleted], restoredFile.notes, { revision: 2, snapshot: restoredFile });
  assert.equal(restored.comments[0].nativeDeleted, undefined);
  assert.deepEqual(plan(restored.comments, restoredFile.notes, { revision: 2, snapshot: restoredFile }), []);
});

test('a replayed old-file tombstone accepts undo only after deletion is observed in the new session', () => {
  const deleted = merge([imported()], []).comments[0];
  const oldFile = snapshot([note()], { document: 'reopened-frame' });
  const replay = merge([deleted], oldFile.notes, { snapshot: oldFile });
  assert.equal(replay.comments[0].nativeDeleted, true);
  assert.equal(plan(replay.comments, oldFile.notes, { snapshot: oldFile })[0].action, 'delete');
  const afterDelete = merge(replay.comments, [], { snapshot: snapshot([], { document: 'reopened-frame' }) });
  assert.equal(afterDelete.comments[0].nativeRef.documentToken, 'reopened-frame');
  const undone = merge(afterDelete.comments, oldFile.notes, { snapshot: oldFile });
  assert.equal(undone.comments[0].nativeDeleted, undefined);
  assert.deepEqual(plan(undone.comments, oldFile.notes, { snapshot: oldFile }), []);
});

test('initial older file replays unsaved bindings; a saved binding can infer persisted deletion', () => {
  const c = imported();
  const reopened = snapshot([], { document: 'frame-reopened' });
  const recovered = merge([c], [], { snapshot: reopened }).comments[0];
  assert.equal(recovered.nativeDeleted, undefined);
  assert.equal(recovered.nativeRef.state, 'pending');
  assert.equal(plan([recovered], [], { snapshot: reopened })[0].action, 'upsert');
  const saved = markCraftSaved([c], { documentId: 'doc-1', revision: 2 })[0];
  assert.equal(saved.nativeRef.state, 'saved');
  assert.equal(merge([saved], [], { revision: 2, snapshot: reopened }).comments[0].nativeDeleted, true);
});

test('incomplete snapshots cannot infer deletion or plan recreation for missing notes', () => {
  const c = imported();
  const incomplete = snapshot([], { complete: false });
  assert.equal(merge([c], [], { snapshot: incomplete }).comments[0].nativeDeleted, undefined);
  assert.deepEqual(plan([c], [], { snapshot: incomplete }), []);
});

test('acknowledgment preserves edits typed after the upsert was sent', () => {
  const first = business();
  const op = plan([first])[0];
  const newer = { ...first, text: 'Typed during request', replies: [{ by: 'alice', text: 'Next reply' }] };
  const bound = bind(newer, { projection: op.projection });
  assert.equal(bound.text, 'Typed during request');
  assert.equal(bound.nativeRef.state, 'pending');
  const result = merge([bound], [note()]);
  assert.equal(result.comments[0].text, 'Typed during request');
  assert.equal(plan(result.comments, [note()])[0].params.text, 'Typed during request');
});

test('save captures do not mark later business/native changes as persisted', () => {
  const c = imported();
  const fingerprints = { [c.id]: craftCommentFingerprint(c, { people, actor }) };
  const newer = merge([c], [note({ text: 'Typed during save' })]).comments[0];
  const saved = markCraftSaved([newer], { documentId: 'doc-1', revision: 2, fingerprints })[0];
  assert.notEqual(saved.nativeRef.state, 'saved');
  assert.equal(saved.nativeRef.savedFingerprint, fingerprints[c.id]);
  assert.equal(saved.text, 'Typed during save');
  assert.equal(markCraftSaved([c], { documentId: 'doc-2', revision: 2 })[0], c);
});

test('loading snapshots without a document token cannot delete saved collaboration records', () => {
  const c = markCraftSaved([imported()], { documentId: 'doc-1', revision: 2 })[0];
  const emptyFrame = snapshot([], { document: '' });
  const result = merge([c], [], { snapshot: emptyFrame });
  assert.equal(result.changed, false);
  assert.equal(result.comments[0].nativeDeleted, undefined);
  assert.deepEqual(plan([business()], [], { snapshot: emptyFrame }), []);
});

test('saving file bytes cannot mark unsynchronized local business text as persisted', () => {
  const c = imported();
  const pending = { ...c, text: 'Local not yet written to file' };
  const saved = markCraftSaved([pending], { documentId: 'doc-1', revision: 2 })[0];
  assert.equal(saved.nativeRef.savedFingerprint, c.nativeRef.fingerprint);
  assert.notEqual(saved.nativeRef.state, 'saved');
});

test('deletion tombstones survive older-file reopen and only permit owner deletion writes', () => {
  const c = merge([imported()], []).comments[0];
  const result = merge([c], [note()], { snapshot: snapshot([note()], { document: 'reopened-frame' }) });
  assert.equal(result.comments[0].nativeDeleted, true);
  assert.deepEqual(plan(result.comments, [note()]).map(op => ({ action: op.action, params: op.params })), [{ action: 'delete', params: { id: 3 } }]);
  assert.deepEqual(plan([{ ...c, createdBy: 'bob' }], [note()]), []);
});

test('a lost acknowledgment reconciles one-to-one identical pending replies without duplicates', () => {
  const base = imported();
  const pending = { ...base, replies: [{ by: 'alice', text: 'Same', at: 't1', mentionedUserIds: ['bob'] }, { by: 'alice', text: 'Same', at: 't2', mentionedUserIds: [] }] };
  const result = merge([pending], [note({ replies: [{ id: 8, nativeKey: 'reply-1', author: 'Alice', text: 'Same' }, { id: 9, nativeKey: 'reply-2', author: 'Alice', text: 'Same' }] })]);
  assert.equal(result.comments[0].replies.length, 2);
  assert.equal(result.comments[0].replies[0].at, 't1');
  assert.deepEqual(result.comments[0].replies[0].mentionedUserIds, ['bob']);
  assert.deepEqual(result.comments[0].replies.map(r => r.nativeRef.key), ['reply-1', 'reply-2']);
  assert.deepEqual(plan(result.comments, [note({ replies: [{ id: 8, nativeKey: 'reply-1', author: 'Alice', text: 'Same' }, { id: 9, nativeKey: 'reply-2', author: 'Alice', text: 'Same' }] })]), []);
});

test('the first native root echo adopts a uniquely matching pending business record', () => {
  const c = business();
  const result = merge([c], [note()]);
  assert.equal(result.comments.length, 1);
  assert.equal(result.comments[0].id, 'C1');
  assert.equal(result.comments[0].nativeRef.key, 'native-1');
  assert.deepEqual(result.comments[0].linkedIssues, { review: 'V1' });
  assert.deepEqual(plan(result.comments, [note()]), []);
});

test('a pending binding without a native baseline retains business work instead of importing older text', () => {
  const c = business({ text: 'New local work', nativeRef: { documentId: 'doc-1', key: 'native-1', state: 'pending' } });
  const result = merge([c], [note()]);
  assert.equal(result.comments[0].text, 'New local work');
  assert.equal(result.comments[0].nativeRef.state, 'pending');
  assert.equal(plan(result.comments, [note()])[0].params.text, 'New local work');
});

test('reply acknowledgment retains identity when its text changes during the request', () => {
  const c = business({ replies: [{ by: 'alice', at: 'reply-time', text: 'Sent answer', mentionedUserIds: ['bob'] }] });
  const op = plan([c])[0];
  const changed = { ...c, replies: [{ ...c.replies[0], text: 'Typed while awaiting acknowledgment' }] };
  const bound = bind(changed, { projection: op.projection, replies: [{ id: 8, nativeKey: 'reply-1' }] });
  assert.equal(bound.replies[0].nativeRef.key, 'reply-1');
  assert.equal(bound.replies[0].text, 'Typed while awaiting acknowledgment');
  const native = note({ replies: [{ id: 8, nativeKey: 'reply-1', author: 'Alice', text: 'Sent answer' }] });
  const merged = merge([bound], [native]);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(plan(merged.comments, [native])[0].params.replies[0].text, 'Typed while awaiting acknowledgment');
});

test('recovery cannot create a new root under another person without an existing native record', () => {
  const external = business({ createdBy: 'bob', nativeRef: { documentId: 'doc-1', state: 'pending' } });
  assert.deepEqual(plan([external]), []);
});

test('late binding acknowledgment collapses its previously imported echo while preserving business metadata', () => {
  const c = business({ text: 'New typing after send' });
  const op = plan([business()])[0];
  const echoed = merge([c], [note()]);
  assert.equal(echoed.comments.length, 2);
  const bound = applyCraftBinding(echoed.comments, 'C1', { id: 3, nativeKey: 'native-1', projection: op.projection, replies: [] }, context);
  assert.equal(bound.length, 1);
  assert.equal(bound[0].id, 'C1');
  assert.equal(bound[0].text, 'New typing after send');
  assert.deepEqual(bound[0].linkedIssues, { review: 'V1' });
  assert.deepEqual(merge(bound, [note()]).conflicts, []);
});

test('duplicate or invalid stable keys cannot silently merge unrelated native records', () => {
  assert.equal(merge([], [note({ nativeKey: undefined })]).comments.length, 0);
  const duplicate = merge([], [note(), note({ id: 90, text: 'Second native object' })]);
  assert.equal(duplicate.comments.length, 0);
  assert.equal(duplicate.unlinked[0].reason, 'duplicate-native-key');
});

test('all synchronization operations leave their inputs unchanged', () => {
  const comments = [business()];
  const nativeSnapshot = snapshot([note()]);
  const originalComments = structuredClone(comments);
  const originalSnapshot = structuredClone(nativeSnapshot);
  plan(comments);
  const bound = bind(comments[0]);
  mergeNativeComments({ ...context, comments: [bound], snapshot: nativeSnapshot });
  markCraftSaved([bound], { documentId: 'doc-1', revision: 2 });
  assert.deepEqual(comments, originalComments);
  assert.deepEqual(nativeSnapshot, originalSnapshot);
});

test('right text edits preserve a newer native binding and concurrent native reply', () => {
  const baseline = [business()];
  const current = [{ ...baseline[0], nativeAuthor: 'Alice native', mentionedUserIds: ['bob', 'carol'], nativeRef: { documentId: 'doc-1', key: 'new-key', state: 'saved' }, replies: [{ by: 'bob', at: 'native-time', text: 'Concurrent left reply', nativeRef: { key: 'reply-native' } }] }];
  const next = [{ ...baseline[0], text: 'Edited on right', editedAt: 'edited-time' }];
  const result = applyCollaborationEdit(current, baseline, next);
  assert.equal(result[0].text, 'Edited on right');
  assert.equal(result[0].editedAt, 'edited-time');
  assert.equal(result[0].nativeRef, current[0].nativeRef);
  assert.equal(result[0].nativeAuthor, 'Alice native');
  assert.deepEqual(result[0].mentionedUserIds, ['bob', 'carol']);
  assert.equal(result[0].replies, current[0].replies);
});

test('right reply append preserves concurrent left replies, their bindings, and unchanged root fields', () => {
  const reply = { by: 'alice', at: 't1', text: 'Original answer', mentionedUserIds: ['bob'] };
  const baseline = [business({ replies: [reply] })];
  const boundReply = { ...reply, nativeRef: { key: 'bound-reply' }, nativeAuthor: 'Alice' };
  const nativeReply = { by: 'bob', at: 't2', text: 'Added on left', nativeRef: { key: 'left-reply' } };
  const current = [{ ...baseline[0], text: 'Root changed on left', replies: [boundReply, nativeReply] }];
  const added = { by: 'alice', at: 't3', text: 'Added on right', mentionedUserIds: ['bob'] };
  const result = applyCollaborationEdit(current, baseline, [{ ...baseline[0], replies: [reply, added] }]);
  assert.equal(result[0].text, 'Root changed on left');
  assert.equal(result[0].replies.length, 3);
  assert.equal(result[0].replies[0], boundReply);
  assert.equal(result[0].replies[1], nativeReply);
  assert.equal(result[0].replies[2].text, 'Added on right');
  assert.deepEqual(result[0].replies[2].mentionedUserIds, ['bob']);
  const repeated = applyCollaborationEdit(result, baseline, [{ ...baseline[0], replies: [reply, added] }]);
  assert.equal(repeated[0].replies.length, 3);
});

test('right reply edit keeps the latest key, author display, native additions, and unchanged mentions', () => {
  const reply = { by: 'alice', at: 'reply-time', text: 'Old text', mentionedUserIds: ['bob'], nativeRef: { key: 'old-key' } };
  const baseline = [business({ replies: [reply] })];
  const currentReply = { ...reply, nativeRef: { key: 'latest-key', documentId: 'doc-1' }, nativeAuthor: 'Alice native', mentionedUserIds: ['bob', 'carol'] };
  const concurrentReply = { by: 'bob', at: 'other-time', text: 'Left answer', nativeRef: { key: 'left-key' } };
  const current = [{ ...baseline[0], replies: [currentReply, concurrentReply] }];
  const next = [{ ...baseline[0], replies: [{ ...reply, text: 'New right answer' }] }];
  const result = applyCollaborationEdit(current, baseline, next);
  assert.equal(result[0].replies.length, 2);
  assert.equal(result[0].replies[0].text, 'New right answer');
  assert.equal(result[0].replies[0].nativeRef, currentReply.nativeRef);
  assert.equal(result[0].replies[0].nativeAuthor, 'Alice native');
  assert.deepEqual(result[0].replies[0].mentionedUserIds, ['bob', 'carol']);
  assert.equal(result[0].replies[1], concurrentReply);
});

test('hidden tombstones and records omitted from the visible action survive unchanged', () => {
  const visible = business();
  const hidden = business({ id: 'deleted', nativeDeleted: true, nativeRef: { key: 'deleted-key', state: 'deleted' } });
  const concurrent = business({ id: 'left-new', text: 'New native discussion' });
  const current = [visible, hidden, concurrent];
  const result = applyCollaborationEdit(current, [visible], []);
  assert.notEqual(result, current);
  assert.deepEqual(result, current);
  assert.equal(result[1], hidden);
  const deletedSinceRender = [{ ...visible, nativeDeleted: true }];
  assert.equal(applyCollaborationEdit(deletedSinceRender, [visible], [{ ...visible, text: 'Stale edit' }])[0], deletedSinceRender[0]);
});

test('right resolve preserves concurrent linked issues and only patches changed issue kinds', () => {
  const baseline = [business({ linkedIssues: {} })];
  const current = [{ ...baseline[0], linkedIssues: { review: 'left-review' }, nativeRef: { key: 'keep-key' }, mentionedUserIds: ['new-mention'] }];
  const result = applyCollaborationEdit(current, baseline, [{ ...baseline[0], status: '已解决', resolvedBy: 'alice', resolvedAt: 'now' }]);
  assert.equal(result[0].status, '已解决');
  assert.equal(result[0].resolvedBy, 'alice');
  assert.deepEqual(result[0].linkedIssues, { review: 'left-review' });
  assert.deepEqual(result[0].mentionedUserIds, ['new-mention']);
  const linked = applyCollaborationEdit(current, baseline, [{ ...baseline[0], linkedIssues: { clarification: 'right-clarification' } }]);
  assert.deepEqual(linked[0].linkedIssues, { review: 'left-review', clarification: 'right-clarification' });
});

test('unchanged right records use the latest object, and new records are added once', () => {
  const baseline = [business()];
  const latest = { ...baseline[0], text: 'New left text', nativeRef: { key: 'latest' } };
  const added = business({ id: 'right-new', text: 'New right root' });
  const result = applyCollaborationEdit([latest], baseline, [added, ...baseline]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'right-new');
  assert.equal(result[1], latest);
  const repeated = applyCollaborationEdit(result, baseline, [added, ...baseline]);
  assert.equal(repeated.length, 2);
  assert.equal(repeated[1], latest);
  assert.deepEqual(applyCollaborationEdit([], baseline, baseline), []);
});

test('actual mention edits apply while stale native fields and immutable ownership never replace current metadata', () => {
  const original = business({ nativeRef: { key: 'old-key' }, nativeAuthor: 'Old display' });
  const current = [{ ...original, nativeRef: { key: 'new-key', state: 'saved' }, nativeAuthor: 'New display' }];
  const next = [{ ...original, mentionedUserIds: [], nativeRef: { key: 'stale-from-right' }, nativeAuthor: 'Wrong display', createdBy: 'bob' }];
  const result = applyCollaborationEdit(current, [original], next);
  assert.deepEqual(result[0].mentionedUserIds, []);
  assert.equal(result[0].nativeRef, current[0].nativeRef);
  assert.equal(result[0].nativeAuthor, 'New display');
  assert.equal(result[0].createdBy, 'alice');
});

test('collaboration patches do not mutate current, baseline, or user action arrays', () => {
  const baseline = [business({ replies: [{ by: 'alice', at: 't1', text: 'Old' }] })];
  const current = [{ ...baseline[0], nativeRef: { key: 'new-key' }, replies: [{ ...baseline[0].replies[0], nativeRef: { key: 'reply-key' } }] }];
  const next = [{ ...baseline[0], text: 'Updated', replies: [{ ...baseline[0].replies[0], text: 'Updated reply' }] }];
  const originals = structuredClone({ current, baseline, next });
  applyCollaborationEdit(current, baseline, next);
  assert.deepEqual({ current, baseline, next }, originals);
});
