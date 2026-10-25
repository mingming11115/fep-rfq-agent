import test from 'node:test';
import assert from 'node:assert/strict';
import { commentTextRange, annotatedSegments } from './documentAnnotations.js';

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
