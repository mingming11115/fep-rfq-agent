import test from 'node:test';
import assert from 'node:assert/strict';
import { selectResponseCards, responseCardStats, nextResponseCard, transitionConfirmedCard, guardCardNavigation } from './responseCardQueue.js';

const rows = [
  { id: 'a', clause: '1.1', title: '安全联锁', owner: '顾工', status: '待确认' },
  { id: 'b', clause: '1.2', title: '交付周期', status: '评审中' },
  { id: 'c', clause: '2.1', title: '供电参数', status: '待确认' },
  { id: 'd', clause: '2.2', title: '资料', status: '已确认' },
  { id: 'e', clause: '3.1', title: '培训', status: '待确认', pendingReviewProposal: { reviewId: 'closed' } },
];
const reviews = [
  { id: 'rev', requirementId: 'b', kind: 'review', title: '核实排产', source: '条件差异', status: '待审批' },
  { id: 'clar', requirementId: 'c', kind: 'clarification', source: '客户要求待澄清', status: '待处理' },
  { id: 'closed', requirementId: 'e', kind: 'review', status: '已关闭' },
];

test('statistics count each response once and keep open matters and unapplied proposals waiting', () => {
  assert.deepEqual(responseCardStats(rows, reviews), { all: 5, pending: 1, confirmed: 1, waiting: 3 });
  assert.deepEqual(responseCardStats([], []), { all: 0, pending: 0, confirmed: 0, waiting: 0 });
});

test('combined search type status and deviation filters select linked response cards', () => {
  assert.deepEqual(selectResponseCards(rows, reviews, { query: '核实排产', type: 'review', status: 'waiting', source: '条件差异' }).map(r => r.id), ['b']);
  assert.deepEqual(selectResponseCards(rows, reviews, { type: 'clarification' }).map(r => r.id), ['c']);
  assert.deepEqual(selectResponseCards(rows, reviews, { status: 'pending', query: '顾工' }).map(r => r.id), ['a']);
  assert.deepEqual(selectResponseCards(rows, reviews, { query: '不存在' }), []);
  assert.deepEqual(selectResponseCards(rows, reviews, { status: 'confirmed' }).map(r => r.id), ['d']);
});

test('next response follows the current filtered order and wraps past confirmed and deferred cards', () => {
  assert.equal(nextResponseCard(rows, 'b', ['c']).id, 'e');
  assert.equal(nextResponseCard(rows, 'e', ['b', 'c']).id, 'a');
  assert.equal(nextResponseCard(rows, 'missing').id, 'a');
  assert.equal(nextResponseCard([rows[0]], 'a'), null);
  assert.equal(nextResponseCard([rows[3]], 'missing'), null);
  assert.equal(nextResponseCard(rows, 'a', ['b', 'c', 'e']), null);
  assert.equal(nextResponseCard([], 'missing'), null);
});

test('failed confirmation leaves the current card in place without animation or advancement', async () => {
  const events = [];
  assert.equal(await transitionConfirmedCard({ confirm: () => false, animate: () => events.push('animate'), advance: () => events.push('advance') }), false);
  assert.deepEqual(events, []);
  await assert.rejects(transitionConfirmedCard({ confirm: () => { throw new Error('stale version'); }, animate: () => events.push('animate'), advance: () => events.push('advance') }), /stale version/);
  assert.deepEqual(events, []);
});

test('the next card is revealed only after successful confirmation and completed motion', async () => {
  const events = [];
  let finish;
  const animation = new Promise(resolve => { finish = resolve; });
  const pending = transitionConfirmedCard({ confirm: () => { events.push('confirmed'); return true; }, animate: async () => { events.push('animate'); await animation; }, advance: () => events.push('advance') });
  await Promise.resolve();
  assert.deepEqual(events, ['confirmed', 'animate']);
  finish();
  assert.equal(await pending, true);
  assert.deepEqual(events, ['confirmed', 'animate', 'advance']);
});

test('leaving a dirty inline issue still checks the response draft before navigating', () => {
  let resumeIssue, resumeResponse;
  let navigations = 0;
  const next = () => navigations++;
  const previous = action => { resumeResponse = action; return false; };
  assert.equal(guardCardNavigation({ dirty: true, onBlock: action => { resumeIssue = action; }, previous }, next), false);
  assert.equal(navigations, 0);
  resumeIssue();
  assert.equal(navigations, 0);
  resumeResponse();
  assert.equal(navigations, 1);
  assert.equal(guardCardNavigation({ dirty: false, previous: () => true }, next), true);
});
