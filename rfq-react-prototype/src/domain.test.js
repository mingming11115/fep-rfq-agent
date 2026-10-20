import test from 'node:test';
import assert from 'node:assert/strict';

// Missing exports produce assertion failures while the test-first API is being built.
const domain = await import('./domain.js').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const data = await import('./data.js').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const call = (name, ...args) => {
  assert.equal(typeof domain[name], 'function', `Domain API ${name} is required`);
  return domain[name](...args);
};
const validRow = (patch = {}) => ({
  id: 'req-test', clause: '2.1', title: '样品测试', category: '技术',
  original: '按双方确认的样品方案测试。', conclusion: 'Comply',
  draft: '按确认后的样品方案执行。', status: '待确认', owner: '技术确认人',
  source: '客户 RFQ（模拟）.pdf', sourcePage: 3, matchLevel: 'standard', score: 92,
  conditions: '', reason: '', evidence: '模拟测试方案 V1，第 3 页', version: 1,
  ...patch,
});

test('a conditional reply cannot be confirmed until its conditions are explicit', () => {
  const row = validRow({ conclusion: '有条件 Comply', conditions: '  ' });
  assert.throws(() => call('confirmRequirement', row), /适用条件/);
  const confirmed = call('confirmRequirement', { ...row, conditions: '选配 X 已确认，按约定材料测试。' });
  assert.equal(confirmed.status, '已确认');
  assert.ok(Number.isFinite(Date.parse(confirmed.confirmedAt)));
  assert.equal(row.status, '待确认');
});

test('an unresolved conclusion, missing reply, missing owner, or missing compliance evidence blocks confirmation', () => {
  for (const [patch, message] of [
    [{ original: '  ' }, /客户要求原文/],
    [{ conclusion: '待确认' }, /最终结论/],
    [{ draft: '  ' }, /对外答复/],
    [{ owner: '' }, /责任人/],
    [{ evidence: '' }, /证据/],
  ]) {
    assert.throws(() => call('confirmRequirement', validRow(patch)), message);
  }
});

test('not-applicable replies require a scope reason while non-compliance need not invent evidence', () => {
  assert.throws(() => call('confirmRequirement', validRow({ conclusion: '不适用', reason: '', evidence: '' })), /范围依据/);
  assert.equal(call('requirementValidation', validRow({ conclusion: '不适用', reason: '本次采购不含该设备。', evidence: '' })).length, 0);
  assert.equal(call('requirementValidation', validRow({ conclusion: '不满足', evidence: '' })).length, 0);
});

test('changing confirmed requirements invalidates confirmation without mutating the previous version', () => {
  const row = Object.freeze(validRow({ status: '已确认', version: 3, confirmedAt: '2026-10-20T08:00:00.000Z' }));
  for (const patch of [
    { original: '修订后的要求。' }, { conclusion: '不满足' }, { draft: '更新后的对外答复。' },
    { conditions: '新增材料限制。' }, { evidence: '模拟测试方案 V2' },
  ]) {
    const updated = call('applyRequirementEdit', row, patch);
    assert.equal(updated.status, '待确认');
    assert.equal(updated.version, 4);
    assert.equal(updated.confirmedAt, undefined);
  }
  assert.equal(row.status, '已确认');
  assert.equal(row.version, 3);
});

test('saving identical values preserves the confirmed version', () => {
  const row = validRow({ status: '已确认', version: 3, confirmedAt: '2026-10-20T08:00:00.000Z' });
  const updated = call('applyRequirementEdit', row, { draft: row.draft, conclusion: row.conclusion });
  assert.deepEqual(updated, row);
  assert.notEqual(updated, row);
});

test('an empty or partly unconfirmed response is blocked from submission', () => {
  const emptyIssues = call('getExportIssues', [], []);
  assert.ok(emptyIssues.some((issue) => /没有|尚无|至少/.test(issue.message)));
  const issues = call('getExportIssues', [validRow(), validRow({ id: 'req-2', status: '已确认' })], []);
  assert.ok(issues.some((issue) => issue.id === 'req-test' && /确认/.test(issue.message)));
  assert.ok(issues.every((issue) => issue.label && issue.message));
});

test('invalid confirmed rows and every open review block submission', () => {
  const issues = call('getExportIssues', [validRow({ status: '已确认', conclusion: '有条件 Comply' })], [
    { id: 'review-1', title: '样品验证', status: '处理中' },
    { id: 'review-2', title: '商务批准', status: '待审批' },
    { id: 'review-3', title: '已补齐附件', status: '已关闭' },
  ]);
  assert.ok(issues.some((issue) => issue.id === 'req-test' && /适用条件/.test(issue.message)));
  assert.ok(issues.some((issue) => issue.id === 'review-1'));
  assert.ok(issues.some((issue) => issue.id === 'review-2'));
  assert.ok(!issues.some((issue) => issue.id === 'review-3'));
  assert.deepEqual(call('getExportIssues', [validRow({ status: '已确认' })], []), []);
});

test('a snapshot starts in approval and remains unchanged when source data is edited later', () => {
  const rows = [validRow({ status: '已确认', citations: [{ page: 3, text: '模拟依据' }] })];
  const snapshot = call('makeSnapshot', 'RFQ-001', rows, '销售负责人');
  assert.equal(snapshot.status, '审批中');
  assert.equal(snapshot.projectId, 'RFQ-001');
  assert.equal(snapshot.createdBy, '销售负责人');
  assert.ok(Number.isFinite(Date.parse(snapshot.createdAt)));
  assert.ok(snapshot.id);
  snapshot.status = '已批准';
  rows[0].draft = '后续工作版本';
  rows[0].citations[0].text = '后续引用';
  assert.equal(snapshot.rows[0].draft, '按确认后的样品方案执行。');
  assert.equal(snapshot.rows[0].citations[0].text, '模拟依据');
  assert.notEqual(call('makeSnapshot', 'RFQ-001', rows, '销售负责人').id, snapshot.id);
});

test('CSV preserves commas, quotes and line breaks and excludes internal evidence', () => {
  const csv = call('toCsv', [validRow({ original: '材料 A, 材料 B', draft: '答复 "A"\n第二行' })]);
  assert.equal(csv, '条款,客户要求,应答结论,对外答复,适用条件,确认状态\r\n2.1,"材料 A, 材料 B",Comply,"答复 ""A""\n第二行",,待确认');
  assert.ok(!csv.includes('模拟测试方案'));
});

test('CSV neutralizes formula-leading values without changing ordinary content', () => {
  const csv = call('toCsv', [validRow({
    clause: '=1+1', original: '+SUM(A1:A2)', conclusion: '-1+2',
    draft: '@SUM(A1:A2)', conditions: '  =HYPERLINK("x")', status: '普通文本',
  })]);
  const line = csv.split('\r\n')[1];
  assert.equal(line, "'=1+1,'+SUM(A1:A2),'-1+2,'@SUM(A1:A2),\"'  =HYPERLINK(\"\"x\"\")\",普通文本");
  assert.equal(call('toCsv', []), '条款,客户要求,应答结论,对外答复,适用条件,确认状态');
});

test('CSV preserves ordinary leading whitespace and line breaks', () => {
  const csv = call('toCsv', [validRow({ original: '\n客户补充说明', draft: '\t普通答复' })]);
  assert.ok(csv.includes('"\n客户补充说明"'));
  assert.ok(csv.includes(',\t普通答复,'));
  assert.ok(!csv.includes("'\n客户补充说明"));
});

test('demo projects have independent working rows and do not imply standard hits are confirmed', () => {
  assert.equal(typeof data.createDemoState, 'function', 'Demo state factory is required');
  const state = data.createDemoState();
  assert.equal(state.projects.length, 3);
  const rows = state.requirementsByProject['RFQ-001'];
  assert.equal(rows.length, 12);
  assert.ok(rows.some((row) => row.matchLevel === 'standard' && row.score > 80 && row.draft && row.status === '待确认'));
  assert.ok(rows.some((row) => row.matchLevel === 'history'));
  assert.ok(rows.some((row) => row.matchLevel === 'none' && row.conclusion === '待确认'));
  assert.ok(state.reviewsByProject['RFQ-001'].every((review) => rows.some((row) => row.id === review.requirementId)));
  rows[0].draft = '仅编辑本实例';
  assert.notEqual(state.requirementsByProject['RFQ-002'][0].draft, '仅编辑本实例');
  assert.notEqual(data.createDemoState().requirementsByProject['RFQ-001'][0].draft, '仅编辑本实例');
});
