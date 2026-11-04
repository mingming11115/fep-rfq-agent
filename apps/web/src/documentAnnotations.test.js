import test from 'node:test';
import assert from 'node:assert/strict';
import { commentTextRange, annotatedSegments } from './documentAnnotations.js';
import * as annotations from './documentAnnotations.js';

const row = { id: 'R', projectId: 'P', sourceFileId: 'F', sourceVersion: 'V1', original: '确认条件；再次确认条件。' };
const note = (id, start, end) => ({ id, quote: row.original.slice(start, end), anchor: { projectId: 'P', fileId: 'F', sourceVersion: 'V1', requirementId: 'R', locator: { textRange: { start, end } } } });

test('selected offsets identify the second occurrence of repeated text', () => {
  assert.deepEqual(commentTextRange(row, note('C', 7, 11)), { start: 7, end: 11 });
});
test('comments from another project, file, requirement or source version cannot highlight this source', () => {
  for (const [key, value] of [['projectId', 'OTHER'], ['fileId', 'OTHER'], ['requirementId', 'OTHER'], ['sourceVersion', 'V2']]) {
    const comment = note('C', 0, 4);
    comment.anchor[key] = value;
    assert.equal(commentTextRange(row, comment), null);
  }
});
test('changed source text does not silently reuse an old offset', () => {
  assert.equal(commentTextRange({ ...row, original: '原文已经改变' }, note('C', 0, 4)), null);
});
test('legacy unique quotes resolve, but ambiguous repeated quotes remain unhighlighted', () => {
  const comment = note('C', 0, 4);
  delete comment.anchor.locator.textRange;
  assert.equal(commentTextRange(row, comment), null);
  comment.quote = '再次确认';
  assert.deepEqual(commentTextRange(row, comment), { start: 5, end: 9 });
});
test('overlapping notes preserve source text and all note identities, preferring the active note', () => {
  const segments = annotatedSegments(row, [note('A', 0, 4), note('B', 2, 7)], 'B');
  assert.equal(segments.map(s => s.text).join(''), row.original);
  const overlap = segments.find(s => s.start === 2);
  assert.deepEqual(overlap.commentIds, ['A', 'B']);
  assert.equal(overlap.activeId, 'B');
  assert.deepEqual(annotatedSegments({ ...row, original: '' }, []), []);
});

test('new comment keeps the selected second occurrence and its exact offsets', () => {
  const selected = note('C', 7, 11);
  const before = structuredClone(selected);
  const draft = annotations.makeCommentDraft?.(row, selected);
  assert.equal(draft?.quote, '确认条件');
  assert.deepEqual(draft?.anchor.locator.textRange, { start: 7, end: 11 });
  assert.equal(draft?.anchor.locator.quote, '确认条件');
  assert.deepEqual(selected, before);
});

test('new comment without a selection targets the complete current source', () => {
  const draft = annotations.makeCommentDraft?.(row);
  assert.equal(draft?.quote, row.original);
  assert.equal(draft?.anchor.requirementId, 'R');
  assert.equal(draft?.anchor.fileId, 'F');
  assert.equal(draft?.anchor.sourceVersion, 'V1');
});

test('new comment cannot reuse a selection from another clause, file, project or source version', () => {
  for (const [key, value] of [['projectId', 'OTHER'], ['fileId', 'OTHER'], ['requirementId', 'OTHER'], ['sourceVersion', 'V2']]) {
    const selected = note('C', 7, 11);
    selected.anchor[key] = value;
    const draft = annotations.makeCommentDraft?.(row, selected);
    assert.equal(draft?.quote, row.original, key);
    assert.equal(draft?.anchor.requirementId, 'R');
    assert.equal(draft?.anchor.sourceVersion, 'V1');
    assert.equal(draft?.anchor.locator.textRange, undefined);
  }
});

test('changed source content invalidates a previously captured selection for a new comment', () => {
  const current = { ...row, sourceOriginal: '客户更新后的原文。' };
  const draft = annotations.makeCommentDraft?.(current, note('C', 7, 11));
  assert.equal(draft?.quote, '客户更新后的原文。');
  assert.equal(draft?.anchor.locator.quote, '客户更新后的原文。');
  assert.equal(draft?.anchor.locator.textRange, undefined);
});

const numberedRow = { ...row, clause: '2.1', title: '安全联锁', original: '防护门打开时停止运动。' };
const headingNote = { id: 'HEADING', quote: '2.1', anchor: { projectId: 'P', fileId: 'F', sourceVersion: 'V1', requirementId: 'R', locator: { textPart: 'heading', quote: '2.1', textRange: { start: 0, end: 3 } } } };

test('a clause-number selection stays anchored to its heading rather than the body', () => {
  const draft = annotations.makeCommentDraft(numberedRow, headingNote);
  assert.equal(draft.quote, '2.1');
  assert.equal(draft.anchor.locator.textPart, 'heading');
  assert.deepEqual(draft.anchor.locator.textRange, { start: 0, end: 3 });
  assert.deepEqual(commentTextRange(numberedRow, draft, 'heading'), { start: 0, end: 3 });
  assert.equal(commentTextRange(numberedRow, draft), null);
});

test('saving a 2.1 heading comment highlights only that number, leaving body and next item unchanged', () => {
  const heading = annotatedSegments(numberedRow, [headingNote], 'HEADING', 'heading');
  assert.equal(heading.map(s => s.text).join(''), '2.1　安全联锁');
  assert.equal(heading.filter(s => s.commentIds.length).map(s => s.text).join(''), '2.1');
  assert.ok(annotatedSegments(numberedRow, [headingNote], 'HEADING').every(s => !s.commentIds.length));
  const repeatedNumber = { ...numberedRow, original: '2.1 正文也出现了同样的编号。' };
  assert.equal(commentTextRange(repeatedNumber, headingNote), null);
  assert.ok(annotatedSegments(repeatedNumber, [headingNote], 'HEADING').every(s => !s.commentIds.length));
  const next = { ...numberedRow, id: 'NEXT', clause: '2.2' };
  assert.ok(annotatedSegments(next, [headingNote], 'HEADING', 'heading').every(s => !s.commentIds.length));
});

test('selected title text keeps its exact heading offsets', () => {
  const selected = structuredClone(headingNote);
  selected.quote = '安全联锁';
  selected.anchor.locator = { textPart: 'heading', quote: selected.quote, textRange: { start: 4, end: 8 } };
  assert.deepEqual(commentTextRange(numberedRow, selected, 'heading'), { start: 4, end: 8 });
  assert.equal(annotations.makeCommentDraft(numberedRow, selected).quote, '安全联锁');
});

test('unknown source parts are rejected and existing body comments remain compatible', () => {
  const invalid = structuredClone(headingNote);
  invalid.quote = '防护门';
  invalid.anchor.locator = { textPart: 'unknown', quote: invalid.quote, textRange: { start: 0, end: 3 } };
  assert.equal(commentTextRange(numberedRow, invalid, 'unknown'), null);
  assert.equal(annotations.makeCommentDraft(numberedRow, invalid).quote, numberedRow.original);
  assert.deepEqual(commentTextRange(row, note('OLD', 7, 11)), { start: 7, end: 11 });
});
