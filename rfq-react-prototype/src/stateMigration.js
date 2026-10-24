export const actorIdForRole = role => role === '销售负责人' ? 'demo-sales' : /最终|批准人/.test(role || '') ? 'demo-approver' : 'demo-technical';
export function getActor(state) { return { id: state.actorId || actorIdForRole(state.actorRole), role: state.actorRole || '销售负责人' }; }
export function upgradePrototypeState(previous, demo) {
  const state = structuredClone(previous?.projects?.length ? previous : demo);
  state.schemaVersion = 2;
  state.actorRole ||= '销售负责人';
  state.actorId ||= actorIdForRole(state.actorRole);
  state.tasksById ||= {};
  state.analysisRuns ||= [];
  state.commentsByProject ||= {};
  state.navigationContext ||= {};
  state.members ||= structuredClone(demo.members || []);
  state.audit ||= [];
  state.membersByProject ||= {};
  for (const key of ['requirementsByProject', 'reviewsByProject', 'snapshotsByProject']) {
    state[key] ||= {};
    for (const project of state.projects) state[key][project.id] ||= [];
  }
  for (const project of state.projects) {
    state.commentsByProject[project.id] ||= [];
    state.membersByProject[project.id] ||= structuredClone(state.members);
    project.createdById ||= 'demo-sales';
    project.ownerId ||= 'demo-sales';
    project.participantIds ||= ['demo-sales', 'demo-technical', 'demo-approver'];
  }
  return state;
}
