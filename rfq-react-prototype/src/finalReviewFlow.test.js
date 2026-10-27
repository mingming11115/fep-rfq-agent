import test from 'node:test';
import assert from 'node:assert/strict';
import * as flow from './finalReviewFlow.js';
import { snapshotFingerprint } from './snapshotDomain.js';

function fixture() {
  const row = { id: 'R', clause: '1', original: '要求', conclusion: 'Comply', draft: '满足要求', evidence: '测试报告', status: '已确认', version: 1 };
  const project = { id: 'P', equipment: '设备A', approvalConfig: {} };
  const scope = { rows: [row], sourceVersions: ['F:v1'], configuration: { equipment: '设备A', approvalConfig: {} }, template: { id: 'standard', version: 'V2.1' }, mapping: { draft: 'draft' }, attachments: [] };
  const snapshot = { id: 'S', projectId: 'P', status: '已批准', createdAt: '2026-10-27T01:00:00Z', rows: [row], approvalScope: scope, approvalFingerprint: snapshotFingerprint(scope), finalReview: { policy: 'sr-and-technical', technicalMode: 'all', reviewers: { srId: 'sr', technicalIds: ['t'] }, decisions: { sr: { actorId: 'sr', result: 'approved' }, technicalByActorId: { t: { actorId: 't', result: 'approved' } } } } };
  return { projects: [project], requirementsByProject: { P: [row] }, reviewsByProject: { P: [] }, documentsByProject: { P: [{ id: 'F', version: 'v1', purpose: '要求来源', status: '完成' }] }, snapshotsByProject: { P: [snapshot] }, exportScopesByProject: { P: scope } };
}

test('export unlocks only after every required reviewer approves the current snapshot', () => {
  const state = fixture();
  assert.equal(flow.getFinalReviewGate(state, 'P').canExport, true);
  state.snapshotsByProject.P[0].status = '审批中';
  delete state.snapshotsByProject.P[0].finalReview.decisions.technicalByActorId.t;
  assert.equal(flow.getFinalReviewGate(state, 'P').canExport, false);
  state.snapshotsByProject.P = [];
  assert.equal(flow.getFinalReviewGate(state, 'P').canExport, false);
});

test('a later rejected or pending round locks export despite an older matching approval', () => {
  for (const status of ['审批中', '已退回']) {
    const state = fixture();
    state.snapshotsByProject.P.push({ ...state.snapshotsByProject.P[0], id: 'NEW', status, createdAt: '2026-10-27T02:00:00Z' });
    assert.equal(flow.getFinalReviewGate(state, 'P').canExport, false);
  }
});

test('changes to response, source, mapping or reviewer configuration lock export immediately', () => {
  const changes = [
    state => { state.requirementsByProject.P = [{ ...state.requirementsByProject.P[0], draft: '新版答复', version: 2 }]; },
    state => { state.documentsByProject.P.push({ id: 'F2', version: 'v2', purpose: '要求来源', status: '完成' }); },
    state => { state.exportScopesByProject.P = { ...state.exportScopesByProject.P, mapping: { draft: 'conditions' } }; },
    state => { state.projects[0].approvalConfig = { finalReviewers: { srId: 'new-sr' } }; },
    state => { state.snapshotsByProject.P[0].stale = true; },
  ];
  for (const change of changes) {
    const state = fixture(); change(state);
    assert.equal(flow.getFinalReviewGate(state, 'P').canExport, false);
  }
});

test('unfinished source parsing and open review issues keep document export locked', () => {
  const state = fixture();
  state.documentsByProject.P[0].status = '处理中';
  assert.equal(flow.getFinalReviewGate(state, 'P').canExport, false);
  state.documentsByProject.P[0].status = '完成';
  state.reviewsByProject.P.push({ id: 'REV', status: '待处理' });
  assert.equal(flow.getFinalReviewGate(state, 'P').canExport, false);
});
