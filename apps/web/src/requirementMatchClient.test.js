import test from 'node:test';
import assert from 'node:assert/strict';
import { matchClient, matchStages, matchNeedsPolling } from './requirementMatchClient.js';

test('uses the active requirement and sends optimistic versions for writes', async () => {
  const calls = [];
  const client = matchClient(Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method, (...args) => calls.push([method, ...args])])));
  await client.current('R/1');
  await client.retry('R/1', 0, 'operation-1');
  await client.saveInput('R/1', { sourceRequirementVersion: 0, version: 2, context: {} });
  await client.savePolicy('BU/1', { version: 1, matchOrder: ['history_rfq', 'standard_reply', 'capability'] });
  await client.projectPolicy('P/1');
  await client.saveProjectPolicy('P/1', { version: 2, matchOrder: ['history_rfq', 'standard_reply', 'capability'],
    similarity: { standardReply: 0.8, historyRfq: 0.74 },
    enabled: { standardReply: true, historyRfq: true, capability: false } });
  await client.resetProjectPolicy('P/1');
  assert.deepEqual(calls, [
    ['get', '/requirements/R%2F1/match-result'],
    ['post', '/requirements/R%2F1/match-runs', { sourceRequirementVersion: 0, requestId: 'operation-1' }],
    ['put', '/requirements/R%2F1/match-input', { sourceRequirementVersion: 0, version: 2, context: {} }],
    ['put', '/business-units/BU%2F1/match-policy', { version: 1, matchOrder: ['history_rfq', 'standard_reply', 'capability'] }],
    ['get', '/projects/P%2F1/match-policy'],
    ['put', '/projects/P%2F1/match-policy', { version: 2, matchOrder: ['history_rfq', 'standard_reply', 'capability'],
      similarity: { standardReply: 0.8, historyRfq: 0.74 },
      enabled: { standardReply: true, historyRfq: true, capability: false } }],
    ['delete', '/projects/P%2F1/match-policy'],
  ]);
});

test('keeps the persisted order and renders nothing when every library is switched off', () => {
  assert.deepEqual(matchStages({ status: 'completed', matchOrder: [], result: { skipped: true, stages: {} } }), []);
});

test('shows results in the order persisted on the run and never uses a superseded candidate', () => {
  const completed = { status: 'completed', matchOrder: ['capability', 'history_rfq', 'standard_reply'],
    result: { stages: { history_rfq: { status: 'hit', candidates: [{ id: 'H1', version: 3 }] } } } };
  assert.deepEqual(matchStages(completed).map(stage => [stage.library, stage.status]), [
    ['capability', 'not_run'], ['history_rfq', 'hit'], ['standard_reply', 'not_run'],
  ]);
  assert.equal(matchStages(completed)[1].candidates[0].version, 3);
  assert.ok(matchStages({ ...completed, status: 'superseded' }).every(stage => !stage.candidates));
  assert.equal(matchNeedsPolling({ status: 'blocked', stages: { standard_reply: { reason: 'INDEX_NOT_READY' } } }), true);
  assert.equal(matchNeedsPolling({ status: 'blocked', stages: { capability: { reason: 'MISSING_CAPABILITY_INPUT' } } }), false);
});
