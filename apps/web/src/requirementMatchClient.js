import { api } from './authClient.js';

const requirement = id => `/requirements/${encodeURIComponent(id)}`;
const policy = id => `/business-units/${encodeURIComponent(id)}/match-policy`;

export const MATCH_LIBRARIES = {
  standard_reply: '标准回复库', history_rfq: '历史 RFQ 库', capability: '能力边界库',
};

export function matchClient(client = api) {
  return {
    current: id => client.get(`${requirement(id)}/match-result`),
    retry: (id, sourceRequirementVersion, requestId = crypto.randomUUID()) =>
      client.post(`${requirement(id)}/match-runs`, { sourceRequirementVersion, requestId }),
    input: id => client.get(`${requirement(id)}/match-input`),
    saveInput: (id, input) => client.put(`${requirement(id)}/match-input`, input),
    reject: (id, runId, reason) => client.post(`${requirement(id)}/match-runs/${encodeURIComponent(runId)}/reject`, {reason}),
    review: (id, input) => client.post(`${requirement(id)}/match-deviation/review`, input),
    closeDeviation: (id, version, reason) => client.post(`${requirement(id)}/match-deviation/close`, {version, reason}),
    policy: buId => client.get(policy(buId)),
    savePolicy: (buId, input) => client.put(policy(buId), input),
  };
}

export function matchStages(run) {
  const stages = run?.status === 'completed' ? run.result?.stages : run?.stages;
  return (run?.matchOrder ?? Object.keys(MATCH_LIBRARIES)).map(library => ({
    status: 'not_run', ...stages?.[library], library,
  }));
}

export function matchNeedsPolling(run) {
  return ['queued', 'running', 'retry_wait'].includes(run?.status) ||
    (run?.status === 'blocked' && matchStages(run).some(stage => stage.reason === 'INDEX_NOT_READY'));
}
