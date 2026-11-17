import { api } from './authClient.js';

const requirement = id => `/requirements/${encodeURIComponent(id)}`;
const policy = id => `/business-units/${encodeURIComponent(id)}/match-policy`;
const projectPolicy = id => `/projects/${encodeURIComponent(id)}/match-policy`;

export const MATCH_LIBRARIES = {
  standard_reply: '标准回复库', history_rfq: '历史 RFQ 库', capability: '能力边界库',
};

export function matchClient(client = api) {
  return {
    historyOptions: projectId => client.get(`/projects/${encodeURIComponent(projectId)}/history-recall-options`),
    current: id => client.get(`${requirement(id)}/match-result`),
    retry: (id, sourceRequirementVersion, requestId = crypto.randomUUID()) =>
      client.post(`${requirement(id)}/match-runs`, { sourceRequirementVersion, requestId }),
    input: id => client.get(`${requirement(id)}/match-input`),
    saveInput: (id, input) => client.put(`${requirement(id)}/match-input`, input),
    review: (id, input) => client.post(`${requirement(id)}/match-deviation/review`, input),
    closeDeviation: (id, version, reason) => client.post(`${requirement(id)}/match-deviation/close`, {version, reason}),
    policy: buId => client.get(policy(buId)),
    savePolicy: (buId, input) => client.put(policy(buId), input),
    projectPolicy: projectId => client.get(projectPolicy(projectId)),
    saveProjectPolicy: (projectId, input) => client.put(projectPolicy(projectId), input),
    resetProjectPolicy: projectId => client.delete(projectPolicy(projectId)),
  };
}

export function matchStages(run) {
  const stages = run?.status === 'completed' ? run.result?.stages : run?.stages;
  const order = run?.matchOrder ?? Object.keys(MATCH_LIBRARIES);
  // 三库全关时整轮 skipped，由面板顶部统一提示，这里不逐库列出。
  if (order.length === 0) { return []; }
  const rows = order.map(library => ({
    status: 'not_run', ...stages?.[library], library,
  }));
  // 项目配置关闭的库不在 matchOrder 中；显式占位，避免整行消失被误认为漏比对。
  for (const library of Object.keys(MATCH_LIBRARIES)) {
    if (!order.includes(library)) { rows.push({ library, status: 'disabled' }); }
  }
  return rows;
}

export function matchNeedsPolling(run) {
  return ['queued', 'running', 'retry_wait'].includes(run?.status) ||
    (run?.status === 'blocked' && matchStages(run).some(stage => stage.reason === 'INDEX_NOT_READY'));
}
