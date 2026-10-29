import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState} from './data.js';
import {upgradePrototypeState} from './stateMigration.js';
import {reconcileTasks} from './taskDomain.js';
import {getProjectSummary} from './projectSelectors.js';
import {responseCardStats} from './responseCardQueue.js';
import * as cleanup from './demoCleanup.js';

const legacy = () => {
  const demo = createDemoState();
  return reconcileTasks(upgradePrototypeState(demo, demo));
};

test('presentation demo has one RFQ per stage and one response per conclusion covering every processing status', () => {
  const before = legacy();
  const next = cleanup.tidyDemoState(before);
  assert.deepEqual(next.projects.map(p => getProjectSummary(next, p.id, 'demo-sales').stage).sort(),
    ['待上传', '解析中', '评审中', '审批完成', '已导出'].sort());
  assert.deepEqual(responseCardStats(next.requirementsByProject['RFQ-001'], next.reviewsByProject['RFQ-001']),
    {all: 5, pending: 1, confirmed: 1, waiting: 3});
  assert.deepEqual(next.requirementsByProject['RFQ-001'].map(row => row.conclusion).sort(),
    ['Comply', '有条件 Comply', '不满足', '不适用', '待确认'].sort());
  for (const row of next.requirementsByProject['RFQ-001'])
    assert.ok(next.documentsByProject['RFQ-001'].some(file => file.id === row.sourceFileId));
  for (const review of next.reviewsByProject['RFQ-001'])
    assert.ok(next.requirementsByProject['RFQ-001'].some(r => r.id === review.requirementId));
  for (const task of Object.values(next.tasksById)) {
    assert.ok(next.projects.some(p => p.id === task.projectId));
    if (task.projectId === 'RFQ-001') assert.ok(next.requirementsByProject['RFQ-001'].some(r => r.id === task.requirementId));
  }
  assert.deepEqual(next.snapshotsByProject['RFQ-003'], before.snapshotsByProject['RFQ-003']);
  assert.equal(before.projects.length, 6);
});

test('the previous three-response demo upgrades without losing edited replies or approved projects', () => {
  const before = legacy(), pid = 'RFQ-001';
  before.demoCleanupVersion = 1;
  before.requirementsByProject[pid] = before.requirementsByProject[pid].filter(row => row.demoStatusExample);
  before.reviewsByProject[pid] = before.reviewsByProject[pid].filter(review => before.requirementsByProject[pid].some(row => row.id === review.requirementId));
  before.documentsByProject[pid] = before.documentsByProject[pid].filter(file => file.id.endsWith('CLAUSE-STATUSES'));
  before.requirementsByProject[pid][0].draft = '保留现有人工答复';
  const next = reconcileTasks(cleanup.tidyDemoState(before));
  assert.deepEqual(next.requirementsByProject[pid].map(row => row.conclusion).sort(),
    ['Comply', '有条件 Comply', '不满足', '不适用', '待确认'].sort());
  assert.equal(next.requirementsByProject[pid].find(row => row.conclusion === 'Comply').draft, '保留现有人工答复');
  assert.deepEqual(next.snapshotsByProject['RFQ-002'], before.snapshotsByProject['RFQ-002']);
  assert.deepEqual(next.snapshotsByProject['RFQ-003'], before.snapshotsByProject['RFQ-003']);
  for (const row of next.requirementsByProject[pid]) {
    assert.ok(next.documentsByProject[pid].some(file => file.id === row.sourceFileId));
    if (row.status === '评审中') {
      const review = next.reviewsByProject[pid].find(review => review.requirementId === row.id);
      assert.ok(review?.reviewerIds.length);
      assert.ok(Object.values(next.tasksById).some(task => task.objectId === review.id));
    }
  }
  assert.deepEqual(cleanup.tidyDemoState(upgradePrototypeState(next, createDemoState())), next);
});

test('cleanup runs once and leaves other BUs and subsequent work intact', () => {
  const before = legacy();
  before.projects.push({id: 'OTHER', buId: 'OTHER-BU'});
  before.requirementsByProject.OTHER = [{id: 'OTHER-R', draft: '其他BU人工应答'}];
  const normalized = upgradePrototypeState(before, createDemoState());
  normalized.requirementsByProject['RFQ-001'].find(r => r.id.endsWith('DOC-EXAMPLE-6')).draft = '保留人工答复';
  const next = cleanup.tidyDemoState(normalized);
  assert.deepEqual(next.requirementsByProject.OTHER, before.requirementsByProject.OTHER);
  assert.equal(next.requirementsByProject['RFQ-001'][0].draft, '保留人工答复');
  next.requirementsByProject['RFQ-001'].push({id: 'NEW', status: '待确认'});
  assert.deepEqual(cleanup.tidyDemoState(upgradePrototypeState(next, createDemoState())), next);
});

test('cleanup fills stages absent from an older browser demo with valid synthetic examples', () => {
  const before = legacy();
  before.snapshotsByProject['RFQ-002'] = [];
  before.snapshotsByProject['RFQ-003'] = [];
  const next = cleanup.tidyDemoState(before);
  assert.deepEqual(next.projects.map(p => getProjectSummary(next, p.id, 'demo-sales').stage).sort(),
    ['待上传', '解析中', '评审中', '审批完成', '已导出'].sort());
});

test('a workspace containing only another BU does not receive demo projects', () => {
  const before = {projects: [{id: 'OTHER', buId: 'OTHER-BU'}], requirementsByProject: {OTHER: [{id: 'R', draft: '人工应答'}]}};
  assert.deepEqual(cleanup.tidyDemoState(before), before);
});

test('stored cleanup backs up previous data and synchronizes parsed cache before reload', () => {
  const before = legacy();
  const data = new Map([['fep-rfq-app-v1', JSON.stringify(before)],
    ['fep-rfq-documents:RFQ-001', JSON.stringify({files: before.documentsByProject['RFQ-001'], parsed: before.requirementsByProject['RFQ-001']})]]);
  const storage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value)};
  const next = cleanup.tidyStoredDemo(storage, before);
  const backup = JSON.parse(data.get('fep-rfq-demo-before-cleanup-v2'));
  assert.deepEqual(backup.state, JSON.parse(JSON.stringify(before)));
  const parsed = JSON.parse(data.get('fep-rfq-documents:RFQ-001')).parsed;
  assert.deepEqual(parsed, JSON.parse(JSON.stringify(next.requirementsByProject['RFQ-001'])));
  assert.deepEqual(cleanup.tidyStoredDemo(storage, upgradePrototypeState(next, createDemoState())), next);
  const failingStorage = {...storage, setItem: () => {throw new Error('quota');}};
  assert.throws(() => cleanup.tidyStoredDemo(failingStorage, before), /quota/);
  assert.equal(before.projects.length, 6);
});

test('an old parsed cache cannot restore extra rows when the working responses are already compact', () => {
  const old = legacy(), before = cleanup.tidyDemoState(old);
  delete before.demoCleanupVersion;
  const data = new Map([['fep-rfq-documents:RFQ-001', JSON.stringify({files: old.documentsByProject['RFQ-001'], parsed: old.requirementsByProject['RFQ-001']})]]);
  const storage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value)};
  cleanup.tidyStoredDemo(storage, before);
  assert.equal(JSON.parse(data.get('fep-rfq-documents:RFQ-001')).parsed.length, 5);
});
