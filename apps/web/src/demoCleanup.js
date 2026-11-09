import {getProjectSummary} from './projectSelectors.js';
import {createDemoState} from './data.js';
import {upgradePrototypeState} from './stateMigration.js';
import {selectResponseCards, RESPONSE_STATUS_LABELS} from './responseCardQueue.js';
import {getEligiblePersonnel, personName} from './personnelDomain.js';

const cleanupVersion = 4;
const conclusions = ['Comply', '有条件 Comply', '不满足', '不适用', '待确认'];
const processingStates = [['pending', RESPONSE_STATUS_LABELS.pending, 'P'], ['waiting', RESPONSE_STATUS_LABELS.waiting, 'R'], ['confirmed', RESPONSE_STATUS_LABELS.confirmed, 'C']];
const preferredProjects = {
  待上传: 'RFQ-DEMO-UPLOAD', 解析中: 'RFQ-DEMO-PARSING',
  评审中: 'RFQ-001', 审批完成: 'RFQ-002', 已导出: 'RFQ-003',
};
const projectMaps = ['requirementsByProject', 'reviewsByProject', 'snapshotsByProject',
  'documentsByProject', 'exportScopesByProject', 'commentsByProject', 'membersByProject',
  'implicitConfirmationIdsByProject', 'confirmationMigrationNotesByProject'];

// A one-time edit of the synthetic BU's presentation data, not a limit on future work.
export function tidyDemoState(previous) {
  if (previous.demoCleanupVersion >= cleanupVersion || !previous.projects.some(p => p.buId === 'BU-DEMO')) { return previous; }
  const state = structuredClone(previous);
  if (previous.demoCleanupVersion >= 3) {
    // This revision changes presentation wording only; later user work stays intact.
    const labels = {'未处理': '待处理', '待确认': '评审中', '已审核': '已确认'};
    for (const project of state.projects.filter(p => p.buId === 'BU-DEMO')) {
      for (const row of state.requirementsByProject[project.id] || []) {
        if (!row.demoMatrixExample) { continue; }
        for (const [before, after] of Object.entries(labels)) {
          if (row.title?.endsWith(`（${before}示例）`)) { row.title = row.title.slice(0, -`（${before}示例）`.length) + `（${after}示例）`; }
          if (row.sectionPath?.length === 1 && row.sectionPath[0] === before) { row.sectionPath = [after]; }
        }
      }
      for (const review of state.reviewsByProject[project.id] || [])
        if (review.sample && review.description === '模拟评审事项，用于演示待确认状态下的本种应答结论。') { review.description = '模拟评审事项，用于演示评审中状态下的本种应答结论。'; }
    }
    state.demoCleanupVersion = cleanupVersion;
    return state;
  }
  const examples = state.projects.filter(p => p.buId === 'BU-DEMO');
  const removedProjects = new Set();
  for (const [stage, preferredId] of Object.entries(preferredProjects)) {
    const group = examples.filter(p => getProjectSummary(state, p.id, 'demo-sales').stage === stage);
    const keep = group.find(p => p.id === preferredId) || group[0];
    for (const project of group) if (project !== keep) { removedProjects.add(project.id); }
  }
  state.projects = state.projects.filter(p => !removedProjects.has(p.id));
  for (const key of projectMaps) if (state[key]) {
    state[key] = Object.fromEntries(Object.entries(state[key]).filter(([id]) => !removedProjects.has(id)));
  }
  state.analysisRuns = (state.analysisRuns || []).filter(run => !removedProjects.has(run.projectId));

  const seed = createDemoState(), fallback = upgradePrototypeState(seed, seed);
  for (const [stage, preferredId] of Object.entries(preferredProjects)) {
    if (state.projects.some(p => p.buId === 'BU-DEMO' && getProjectSummary(state, p.id, 'demo-sales').stage === stage)) { continue; }
    let id = preferredId;
    while (state.projects.some(p => p.id === id)) id += '-DEMO';
    // Only fresh synthetic examples are renamed; existing approvals are never rewritten.
    const copy = value => JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'string' ? item.replaceAll(preferredId, id) : item));
    state.projects.push(copy(fallback.projects.find(p => p.id === preferredId)));
    for (const key of projectMaps) if (fallback[key]?.[preferredId] !== undefined) {
      state[key] ||= {};
      state[key][id] = copy(fallback[key][preferredId]);
    }
  }

  const retainedRows = new Map(), retainedReviews = new Map();
  for (const project of state.projects.filter(p => p.buId === 'BU-DEMO' && getProjectSummary(state, p.id, 'demo-sales').stage === '评审中')) {
    const rows = [...(state.requirementsByProject[project.id] || [])], reviews = [...(state.reviewsByProject[project.id] || [])];
    const files = [...(state.documentsByProject[project.id] || [])];
    const exampleId = fallback.requirementsByProject[project.id]?.length ? project.id : 'RFQ-001';
    const copy = value => JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'string' ? item.replaceAll(exampleId, project.id) : item));
    const matrixFileId = `${project.id}-DEMO-FILE-RESPONSE-MATRIX`, at = new Date().toISOString();
    const reviewerId = getEligiblePersonnel(state, {buId: project.buId, projectId: project.id, duty: 'confirm'})
      .find(person => person.roles.includes('技术'))?.userId;
    const selected = [];
    // Retain existing answers in their exact cells; fill only missing combinations.
    for (const [processingStatus, label, prefix] of processingStates) for (const [index, conclusion] of conclusions.entries()) {
      const candidates = selectResponseCards(rows, reviews, {status: processingStatus}).filter(row => row.conclusion === conclusion);
      const current = candidates.find(row => row.demoStatusExample) || candidates[0];
      if (current) { selected.push(current); continue; }
      const base = rows.find(row => row.conclusion === conclusion) || copy(fallback.requirementsByProject[exampleId].find(row => row.conclusion === conclusion));
      let id = `${project.id}-DEMO-MATRIX-${processingStatus}-${index + 1}`;
      while (rows.some(row => row.id === id) || selected.some(row => row.id === id)) id += '-DEMO';
      const row = {
        id, clause: `${prefix}${index + 1}`, title: `${base.title}（${label}示例）`, category: base.category,
        original: base.original, sourceOriginal: base.original, conclusion, draft: base.draft,
        conditions: base.conditions || (conclusion === '有条件 Comply' ? '以双方确认的配置、材料及验收方案为准。' : ''),
        reason: base.reason || '', evidence: base.evidence || '', version: 1,
        source: '应答状态与结论矩阵示例.docx', sourceFileId: matrixFileId, sourceVersion: 'V1.0',
        sourcePage: 1, sourceOrder: selected.length, sourceAnchor: `matrix-${processingStatus}-${index + 1}`, sectionPath: [label],
        status: processingStatus === 'confirmed' ? '已确认' : processingStatus === 'waiting' ? '评审中' : '待确认',
        owner: personName(state, project.ownerId), confirmationAssigneeId: project.ownerId,
        readyForConfirmation: processingStatus === 'pending', matchLevel: 'none', score: 0,
        sample: true, demoMatrixExample: true, deadline: project.deadline,
      };
      if (processingStatus === 'confirmed') {
        row.confirmedAt = at; row.confirmedBy = '模拟审核'; row.confirmedById = project.ownerId;
        // This display-only cell keeps the normal final-conclusion/export gate.
        if (conclusion === '待确认') { row.confirmationReason = '矩阵展示样例：内容已审核，结论仍待确认，不能作为最终处置。'; }
      }
      if (processingStatus === 'waiting') { reviews.push({
        id: `${id}-REVIEW`, requirementId: id, kind: 'review', title: `${base.title} · ${conclusion}评审示例`,
        type: '应答评审', source: '状态与结论矩阵演示', status: '待处理', version: 1, round: 1, requirementVersion: 1,
        ownerId: reviewerId || null, owner: reviewerId ? personName(state, reviewerId) : '待分派', reviewerIds: reviewerId ? [reviewerId] : [],
        confirmations: {}, deadline: project.deadline, description: '模拟评审事项，用于演示评审中状态下的本种应答结论。',
        plan: '核对客户要求、结论和应答内容，再完成本人评审。', proposedDraft: row.draft, proposedConclusion: conclusion,
        conditions: row.conditions, evidence: row.evidence, reason: row.reason, sample: true,
        history: [{time: at, actor: '系统演示', action: '创建状态与结论矩阵示例'}],
      }); }
      selected.push(row);
    }
    if (selected.some(row => row.sourceFileId === matrixFileId) && !files.some(file => file.id === matrixFileId)) {
      files.push({id: matrixFileId, name: '应答状态与结论矩阵示例.docx', purpose: '要求来源', version: 'V1.0', status: '完成', createdAt: at, sample: true, size: 1482000, visibility: '项目成员可见'});
    }
    const rowIds = new Set(selected.map(r => r.id));
    state.requirementsByProject[project.id] = selected;
    state.reviewsByProject[project.id] = reviews.filter(r => rowIds.has(r.requirementId));
    const reviewIds = new Set(state.reviewsByProject[project.id].map(r => r.id));
    retainedRows.set(project.id, rowIds);
    retainedReviews.set(project.id, reviewIds);
    const fileIds = new Set(selected.map(r => r.sourceFileId).filter(Boolean));
    state.documentsByProject[project.id] = files
      .filter(file => fileIds.has(file.id))
      .map(file => ({...file, parsedCount: selected.filter(r => r.sourceFileId === file.id).length}));
    state.commentsByProject[project.id] = (state.commentsByProject[project.id] || [])
      .filter(comment => rowIds.has(comment.anchor?.requirementId));
    if (state.implicitConfirmationIdsByProject?.[project.id]) {
      state.implicitConfirmationIdsByProject[project.id] = state.implicitConfirmationIdsByProject[project.id].filter(id => rowIds.has(id));
    }
  }
  state.tasksById = Object.fromEntries(Object.entries(state.tasksById || {}).filter(([, task]) => {
    if (removedProjects.has(task.projectId)) { return false; }
    if (!retainedRows.has(task.projectId)) { return true; }
    if (task.objectType === 'review') { return retainedReviews.get(task.projectId).has(task.objectId); }
    if (task.objectType === 'requirement') { return retainedRows.get(task.projectId).has(task.objectId); }
    return !task.requirementId || retainedRows.get(task.projectId).has(task.requirementId);
  }));
  if (!state.projects.some(p => p.id === state.activeProjectId)) {
    state.activeProjectId = state.projects.find(p => p.id === 'RFQ-001')?.id || state.projects[0]?.id || null;
  }
  state.demoCleanupVersion = cleanupVersion;
  return state;
}

export function tidyStoredDemo(storage, previous) {
  if (previous.demoCleanupVersion >= cleanupVersion) { return previous; }
  const next = tidyDemoState(previous), related = {};
  if (next === previous) { return previous; }
  for (const project of previous.projects) {
    const key = `fep-rfq-documents:${project.id}`;
    related[key] = storage.getItem(key);
  }
  storage.setItem(`fep-rfq-demo-before-cleanup-v${cleanupVersion}`, JSON.stringify({savedAt: new Date().toISOString(), state: previous, related}));
  for (const project of next.projects) {
    const reviewDemo = project.buId === 'BU-DEMO' && getProjectSummary(next, project.id, 'demo-sales').stage === '评审中';
    if (!reviewDemo && JSON.stringify(previous.requirementsByProject[project.id]) === JSON.stringify(next.requirementsByProject[project.id])) { continue; }
    storage.setItem(`fep-rfq-documents:${project.id}`, JSON.stringify({
      files: next.documentsByProject[project.id], parsed: next.requirementsByProject[project.id],
    }));
  }
  storage.setItem('fep-rfq-app-v1', JSON.stringify(next));
  return next;
}
