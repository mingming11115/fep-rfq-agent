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

test('automatic parsing adds all new requirements without confirming replies or overwriting existing work', () => {
  const existing = validRow({ status: '已确认', draft: '人工修订后的答复', version: 4 });
  const parsed = [validRow(), validRow({ id: 'new-row', status: '已确认', confirmedBy: '演示样例', confirmedAt: '2026-10-20' })];
  const result = call('importParsedRequirements', [existing], parsed);
  assert.deepEqual(result[0], existing);
  assert.equal(result[1].status, '待确认');
  assert.equal(result[1].confirmedAt, undefined);
  assert.equal(result[1].confirmedBy, undefined);
  assert.equal(result[1].source, parsed[1].source);
  assert.deepEqual(call('importParsedRequirements', result, parsed), result);
});

test('correcting extracted source fields retains the reply and original excerpt while invalidating old confirmation', () => {
  const original = validRow({ status: '已确认', version: 4, confirmedBy: '技术确认人', confirmedAt: '2026-10-20' });
  const corrected = call('correctParsedRequirement', original, { original: '更新后的客户要求', category: '商务', sourcePage: '5', draft: '不得覆盖应答' }, '修正识别错误');
  assert.equal(corrected.original, '更新后的客户要求');
  assert.equal(corrected.sourceOriginal, '按双方确认的样品方案测试。');
  assert.equal(corrected.sourcePage, '5');
  assert.equal(corrected.draft, '按确认后的样品方案执行。');
  assert.equal(corrected.status, '待确认');
  assert.equal(corrected.version, 5);
  assert.equal(corrected.matchLevel, 'none');
  assert.equal(corrected.score, 0);
  assert.equal(corrected.confirmedAt, undefined);
  assert.equal(corrected.confirmedBy, undefined);
  assert.equal(corrected.sourceCorrected, true);
  assert.equal(corrected.parseHistory.at(-1).reason, '修正识别错误');
  const again = call('correctParsedRequirement', corrected, { title: '再次修正标题' }, '修正标题');
  assert.equal(again.sourceOriginal, '按双方确认的样品方案测试。');
  assert.equal(original.original, '按双方确认的样品方案测试。');
});

test('extraction corrections reject incomplete fields and unchanged saves do not create versions', () => {
  const original = validRow({ status: '已确认', version: 4 });
  for (const field of ['title', 'original', 'sourcePage']) {
    assert.throws(() => call('correctParsedRequirement', original, { [field]: ' ' }, '修正识别错误'), /完整|页码/);
  }
  assert.throws(() => call('correctParsedRequirement', original, { title: '新标题' }, ' '), /原因/);
  assert.equal(call('correctParsedRequirement', original, { title: original.title }, ''), original);
});

test('a conditional reply still needs explicit conditions before formal export', () => {
  const row = validRow({ conclusion: '有条件 Comply', conditions: '  ' });
  assert.ok(call('getExportIssues', [{ ...row, status: '已确认' }], []).some(issue => /适用条件/.test(issue.message)));
  const confirmed = call('confirmRequirement', { ...row, conditions: '选配 X 已确认，按约定材料测试。' });
  assert.equal(confirmed.status, '已确认');
  assert.ok(Number.isFinite(Date.parse(confirmed.confirmedAt)));
  assert.equal(row.status, '待确认');
});

test('an unresolved conclusion or missing source blocks confirmation', () => {
  for (const [patch, message] of [
    [{ original: '  ' }, /客户要求原文/],
    [{ conclusion: '待确认' }, /最终结论/],
  ]) {
    assert.throws(() => call('confirmRequirement', validRow(patch)), message);
  }
});

test('confirmation and export do not require the removed owner field', () => {
  for (const owner of [undefined, '', '  ']) {
    const row = validRow({ owner });
    const confirmed = call('confirmRequirement', row);
    assert.equal(confirmed.status, '已确认');
    assert.equal(row.status, '待确认');
    assert.deepEqual(call('getExportIssues', [confirmed], []), []);
  }
});

test('clause confirmation does not require removed response fields and preserves existing content', () => {
  for (const conclusion of ['Comply', '有条件 Comply', '不满足']) {
    const row = validRow({ conclusion, draft: '', conditions: '', evidence: '' });
    const confirmed = call('confirmRequirement', row);
    assert.equal(confirmed.status, '已确认');
    assert.ok(Number.isFinite(Date.parse(confirmed.confirmedAt)));
    assert.equal(row.status, '待确认');
    assert.equal(confirmed.draft, '');
    assert.equal(confirmed.conditions, '');
    assert.equal(confirmed.evidence, '');
  }
  const row = validRow({ conditions: '选配 X', evidence: '安全方案 V2' });
  const confirmed = call('confirmRequirement', row);
  assert.equal(confirmed.draft, row.draft);
  assert.equal(confirmed.conditions, '选配 X');
  assert.equal(confirmed.evidence, '安全方案 V2');
});

test('formal export still checks response completeness after clause confirmation', () => {
  const confirmed = call('confirmRequirement', validRow({ conclusion: '有条件 Comply', draft: '', conditions: '', evidence: '' }));
  const issues = call('getExportIssues', [confirmed], []);
  assert.ok(issues.some(issue => /对外答复/.test(issue.message)));
  assert.ok(issues.some(issue => /适用条件/.test(issue.message)));
  assert.ok(issues.some(issue => /证据/.test(issue.message)));
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
  assert.equal(state.projects.length, 4);
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

const workflow = await import('./rfqWorkflow.js').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const workflowCall = (name, ...args) => {
  assert.equal(typeof workflow[name], 'function', `Workflow API ${name} is required`);
  return workflow[name](...args);
};
test('parameter comparison converts compatible units and distinguishes limits', () => {
  const base = { requested: { value: 50, unit: 'μm', operator: '<=' }, capability: { value: 0.06, unit: 'mm' }, contextMatches: true, evidence: '报告 V1' };
  assert.equal(workflowCall('compareParameter', base).status, 'gap');
  assert.equal(workflowCall('compareParameter', base).difference, 10);
  assert.equal(workflowCall('compareParameter', { ...base, capability: { value: 0.05, unit: 'mm' } }).status, 'pass');
  assert.equal(workflowCall('compareParameter', { ...base, requested: { value: 50, unit: 'μm', operator: '>=' } }).status, 'pass');
});
test('missing evidence, incompatible units and unmatched conditions never imply compliance', () => {
  const base = { requested: { value: 50, unit: 'μm', operator: '<=' }, capability: { value: 40, unit: 'μm' }, contextMatches: true, evidence: '报告 V1' };
  for (const patch of [{ evidence: '' }, { contextMatches: false }, { capability: { value: 40, unit: '周' } }, { requested: { value: '', unit: 'μm', operator: '<=' } }]) {
    assert.equal(workflowCall('compareParameter', { ...base, ...patch }).status, 'pending');
  }
});
test('review routing explains category and obeys configured professional owners', () => {
  const route = workflowCall('getReviewRoute', validRow({ category: '商务', conclusion: '不满足' }), { business: '商务组', final: '最终审批人' });
  assert.equal(route.owner, '商务组');
  assert.ok(route.reasons.some((reason) => reason.includes('商务')));
  assert.equal(route.approver, '最终审批人');
  assert.equal(workflowCall('getReviewRoute', validRow({ category: '技术' })).owner, '技术确认人');
});
test('RFQ revisions only invalidate changed, added and removed clauses and preserve human answers', () => {
  const old = [validRow({ clause: '1', status: '已确认', confirmedBy: '技术确认人' }), validRow({ id: 'same', clause: '2', status: '已确认' }), validRow({ id: 'removed', clause: '3', status: '已确认' })];
  const incoming = [{ ...old[0], original: '新精度要求' }, old[1], { clause: '4', title: '新增要求', category: '技术', original: '提交测试结果' }];
  const diff = workflowCall('diffRfqRequirements', old, incoming);
  assert.deepEqual(diff.map((entry) => entry.kind), ['modified', 'unchanged', 'added', 'removed']);
  const result = workflowCall('applyRfqRevision', old, incoming, '客户新版', 'RFQ V2');
  assert.equal(result.rows.find((r) => r.id === old[0].id).draft, old[0].draft);
  assert.equal(result.rows.find((r) => r.id === old[0].id).confirmedBy, undefined);
  assert.equal(result.rows.find((r) => r.id === 'same').status, '已确认');
  assert.equal(result.rows.find((r) => r.id === 'removed').removedFromSource, true);
  assert.equal(result.affectedIds.length, 3);
  assert.equal(old[0].original, '按双方确认的样品方案测试。');
});
test('RFQ revision validation rejects empty input and duplicate clause numbers', () => {
  assert.throws(() => workflowCall('diffRfqRequirements', [validRow()], []), /至少/);
  assert.throws(() => workflowCall('diffRfqRequirements', [validRow()], [validRow(), validRow()]), /重复/);
});
test('restored clauses reuse the original identity and require review again', () => {
  const old = validRow({ removedFromSource: true, status: '已确认' });
  const result = workflowCall('applyRfqRevision', [old], [{ ...old, removedFromSource: false }], '客户恢复条款', 'RFQ V3');
  assert.equal(result.rows[0].id, old.id);
  assert.equal(result.rows[0].removedFromSource, false);
  assert.equal(result.rows[0].status, '待确认');
});

test('changed RFQ text invalidates stale matching and deleted clauses need explicit scope disposition', () => {
  const old = validRow({ status: '已确认', matchLevel: 'standard', score: 98 });
  const result = workflowCall('applyRfqRevision', [old], [{ ...old, original: '客户更新为不同材料' }], '材料变化', 'RFQ V2');
  assert.equal(result.rows[0].matchLevel, 'none');
  assert.equal(result.rows[0].score, 0);
  assert.ok(call('requirementValidation', validRow({ removedFromSource: true })).some((issue) => issue.includes('删除')));
  assert.equal(call('requirementValidation', validRow({ removedFromSource: true, conclusion: '不适用', reason: '客户新版删除该要求' })).length, 0);
});

test('new and reclassified RFQ clauses follow the current project responsibility configuration', () => {
  const old = validRow({ category: '技术', owner: '技术确认人' });
  const incoming = [{ ...old, category: '商务' }, { clause: '9.1', title: '新商务条款', category: '商务', original: '明确付款里程碑' }];
  const result = workflowCall('applyRfqRevision', [old], incoming, '职责变化', 'RFQ V2', { business: '商务组', final: '最终审批人' });
  assert.deepEqual(result.rows.map((row) => row.owner), ['商务组', '商务组']);
});

test('reclassified clauses reroute open reviews but preserve closed history and same-category assignees', () => {
  const before = validRow({ category: '技术' });
  const after = { ...before, category: '商务' };
  const review = { id: 'review-1', status: '待审批', owner: '技术确认人', submittedBy: '销售负责人', approvedBy: '最终审批人', plan: '已填写方案' };
  const updated = workflowCall('refreshReviewForRevision', review, before, after, { business: '商务组', final: '最终审批人' });
  assert.equal(updated.owner, '商务组');
  assert.equal(updated.routing.owner, '商务组');
  assert.equal(updated.status, '待处理');
  assert.equal(updated.submittedBy, undefined);
  assert.equal(updated.approvedBy, undefined);
  assert.equal(updated.plan, review.plan);
  assert.equal(workflowCall('refreshReviewForRevision', { ...review, status: '已关闭' }, before, after).status, '已关闭');
  assert.equal(workflowCall('refreshReviewForRevision', { ...review, owner: '指定专家' }, before, before).owner, '指定专家');
});

const structure = await import('./documentStructure.js').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
test('document outline preserves customer hierarchy and source order without merging duplicate or missing numbers', () => {
  assert.equal(typeof structure.documentSections, 'function');
  const rows = [
    { id: 'a', sourceFileId: 'doc-a', clause: '1', sectionPath: ['Safety', 'Interlock'] },
    { id: 'b', sourceFileId: 'doc-a', clause: '1', sectionPath: ['Facility'] },
    { id: 'c', sourceFileId: 'doc-a', clause: '', sectionPath: ['Safety', 'Interlock'] },
    { id: 'd', sourceFileId: 'doc-b', clause: '1', sectionPath: ['反应模块'] },
    { id: 'e', sourceFileId: 'doc-a', clause: '' },
  ];
  const sections = structure.documentSections(rows, 'doc-a');
  assert.deepEqual(sections.map(s => [s.path, s.rowIds]), [
    [['Safety'], ['a', 'c']], [['Safety', 'Interlock'], ['a', 'c']],
    [['Facility'], ['b']], [[], ['e']],
  ]);
  assert.deepEqual(structure.documentSections(rows, 'doc-b').map(s => s.path), [['反应模块']]);
});
test('source corrections allow an unnumbered clause without inventing numbering or changing its identity', () => {
  const row = validRow({ sectionPath: ['反应模块', '温控'] });
  const corrected = call('correctParsedRequirement', row, { clause: '', title: '温控要求' }, '原文没有编号');
  assert.equal(corrected.clause, '');
  assert.equal(corrected.id, 'req-test');
  assert.deepEqual(corrected.sectionPath, ['反应模块', '温控']);
});

test('reloading Word examples preserves independent source identities and does not duplicate imported examples', async () => {
  const { makeDocumentDemo } = await import('./documentMocks.js');
  const first = makeDocumentDemo('test');
  const again = makeDocumentDemo('test', first.parsed);
  assert.equal(new Set(again.parsed.map(r => r.id)).size, again.parsed.length);
  const moduleRows = again.parsed.filter(r => r.sourceFileId === 'test-DEMO-FILE-CUSTOMER-B');
  assert.deepEqual(moduleRows.map(r => [r.clause, r.sectionPath]), [
    ['1.1', ['反应模块', '温度控制']], ['1.1', ['中转模块']], ['', ['中转模块']],
  ]);
  const imported = call('importParsedRequirements', first.parsed, again.parsed);
  assert.equal(imported.length, first.parsed.length);
});


test('BHEL demo keeps real source pages, distinct section identities, and fictional supplier responses', async () => {
  const { BHEL_ID, makeBhelRequirements, makeBhelReviews } = await import('./bhelDemo.js');
  const { makeDocumentDemo } = await import('./documentMocks.js');
  const rows = makeBhelRequirements();
  assert.equal(rows.length, 40);
  assert.equal(new Set(rows.map(row => row.id)).size, 40);
  assert.equal(new Set(rows.map(row => JSON.stringify([row.sectionPath, row.clause]))).size, 40);
  assert.ok(rows.every(row => row.realSource && row.sourceOriginal && row.sourcePage >= 1 && row.sourcePage <= 43 && row.status === '待确认'));
  assert.ok(rows.every(row => row.draft.includes('演示草稿')));
  assert.ok(rows.find(row => row.id === 'BHEL-REQ-003').original.includes('12 周'));
  assert.ok(rows.find(row => row.id === 'BHEL-REQ-029').original.includes('50 μm'));
  assert.ok(makeBhelReviews().every(review => rows.some(row => row.id === review.requirementId)));
  const doc = makeDocumentDemo(BHEL_ID, rows);
  assert.equal(doc.files.length, 1);
  assert.equal(doc.files[0].realSource, true);
  assert.equal(doc.parsed.length, rows.length);
  assert.ok(doc.parsed.every(row => row.sourceFileId === doc.files[0].id));
  assert.equal(makeDocumentDemo(BHEL_ID, doc.parsed).parsed.length, 40);
});
