import {getProjectSummary} from './projectSelectors.js';
import {selectResponseCards} from './responseCardQueue.js';
import {createDemoState} from './data.js';
import {upgradePrototypeState} from './stateMigration.js';

const preferredProjects = {
  待上传: 'RFQ-DEMO-UPLOAD', 解析中: 'RFQ-DEMO-PARSING',
  评审中: 'RFQ-001', 审批完成: 'RFQ-002', 已导出: 'RFQ-003',
};
const projectMaps = ['requirementsByProject', 'reviewsByProject', 'snapshotsByProject',
  'documentsByProject', 'exportScopesByProject', 'commentsByProject', 'membersByProject',
  'implicitConfirmationIdsByProject', 'confirmationMigrationNotesByProject'];

// A one-time edit of the synthetic BU's presentation data, not a limit on future work.
export function tidyDemoState(previous) {
  if (previous.demoCleanupVersion === 1 || !previous.projects.some(p => p.buId === 'BU-DEMO')) return previous;
  const state = structuredClone(previous);
  const examples = state.projects.filter(p => p.buId === 'BU-DEMO');
  const removedProjects = new Set();
  for (const [stage, preferredId] of Object.entries(preferredProjects)) {
    const group = examples.filter(p => getProjectSummary(state, p.id, 'demo-sales').stage === stage);
    const keep = group.find(p => p.id === preferredId) || group[0];
    for (const project of group) if (project !== keep) removedProjects.add(project.id);
  }
  state.projects = state.projects.filter(p => !removedProjects.has(p.id));
  for (const key of projectMaps) if (state[key])
    state[key] = Object.fromEntries(Object.entries(state[key]).filter(([id]) => !removedProjects.has(id)));
  state.analysisRuns = (state.analysisRuns || []).filter(run => !removedProjects.has(run.projectId));

  const seed = createDemoState(), fallback = upgradePrototypeState(seed, seed);
  for (const [stage, preferredId] of Object.entries(preferredProjects)) {
    if (state.projects.some(p => p.buId === 'BU-DEMO' && getProjectSummary(state, p.id, 'demo-sales').stage === stage)) continue;
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
    const rows = state.requirementsByProject[project.id] || [], reviews = state.reviewsByProject[project.id] || [];
    const selected = ['pending', 'waiting', 'confirmed'].flatMap(status => {
      const candidates = selectResponseCards(rows, reviews, {status});
      const row = candidates.find(r => r.demoStatusExample) || candidates[0];
      return row ? [row] : [];
    });
    const rowIds = new Set(selected.map(r => r.id));
    state.requirementsByProject[project.id] = selected;
    state.reviewsByProject[project.id] = reviews.filter(r => rowIds.has(r.requirementId));
    const reviewIds = new Set(state.reviewsByProject[project.id].map(r => r.id));
    retainedRows.set(project.id, rowIds);
    retainedReviews.set(project.id, reviewIds);
    const fileIds = new Set(selected.map(r => r.sourceFileId).filter(Boolean));
    state.documentsByProject[project.id] = (state.documentsByProject[project.id] || [])
      .filter(file => fileIds.has(file.id))
      .map(file => ({...file, parsedCount: selected.filter(r => r.sourceFileId === file.id).length}));
    state.commentsByProject[project.id] = (state.commentsByProject[project.id] || [])
      .filter(comment => rowIds.has(comment.anchor?.requirementId));
    if (state.implicitConfirmationIdsByProject?.[project.id])
      state.implicitConfirmationIdsByProject[project.id] = state.implicitConfirmationIdsByProject[project.id].filter(id => rowIds.has(id));
  }
  state.tasksById = Object.fromEntries(Object.entries(state.tasksById || {}).filter(([, task]) => {
    if (removedProjects.has(task.projectId)) return false;
    if (!retainedRows.has(task.projectId)) return true;
    if (task.objectType === 'review') return retainedReviews.get(task.projectId).has(task.objectId);
    if (task.objectType === 'requirement') return retainedRows.get(task.projectId).has(task.objectId);
    return !task.requirementId || retainedRows.get(task.projectId).has(task.requirementId);
  }));
  if (!state.projects.some(p => p.id === state.activeProjectId))
    state.activeProjectId = state.projects.find(p => p.id === 'RFQ-001')?.id || state.projects[0]?.id || null;
  state.demoCleanupVersion = 1;
  return state;
}

export function tidyStoredDemo(storage, previous) {
  if (previous.demoCleanupVersion === 1) return previous;
  const next = tidyDemoState(previous), related = {};
  if (next === previous) return previous;
  for (const project of previous.projects) {
    const key = `fep-rfq-documents:${project.id}`;
    related[key] = storage.getItem(key);
  }
  storage.setItem('fep-rfq-demo-before-cleanup-v1', JSON.stringify({savedAt: new Date().toISOString(), state: previous, related}));
  for (const project of next.projects) {
    const reviewDemo = project.buId === 'BU-DEMO' && getProjectSummary(next, project.id, 'demo-sales').stage === '评审中';
    if (!reviewDemo && JSON.stringify(previous.requirementsByProject[project.id]) === JSON.stringify(next.requirementsByProject[project.id])) continue;
    storage.setItem(`fep-rfq-documents:${project.id}`, JSON.stringify({
      files: next.documentsByProject[project.id], parsed: next.requirementsByProject[project.id],
    }));
  }
  storage.setItem('fep-rfq-app-v1', JSON.stringify(next));
  return next;
}
