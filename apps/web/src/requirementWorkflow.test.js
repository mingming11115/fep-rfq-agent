import test from 'node:test';
import assert from 'node:assert/strict';
import * as reviews from './reviewDomain.js';
import { upgradePrototypeState } from './stateMigration.js';
import { reconcileTasks } from './taskDomain.js';
import { confirmRequirement } from './domain.js';

const actor = { id: 'demo-technical', role: '技术确认人' };
const requirement = { id: 'R', title: '安全联锁', version: 2, status: '已确认', original: '开门停止运动', draft: '配备门禁联锁', conclusion: 'Comply', evidence: '安全方案 V1', owner: '技术确认人', confirmedAt: '2026-10-23', confirmedBy: '技术确认人' };
const closed = { id: 'D', requirementId: 'R', status: '已关闭', version: 1, round: 1, owner: '技术确认人', deadline: '2026-10-28', plan: '补充联锁功能', proposedDraft: '按已确认方案执行', approvedAt: '2026-10-23', approvedById: 'demo-approver', submittedById: 'demo-technical', submittedAt: '2026-10-22', requirementAtSubmission: structuredClone(requirement), history: [{ action: '批准关闭', actor: '最终审批人' }] };
const input = { reason: '客户增加新的安全条件', owner: '技术确认人', deadline: '2026-10-29', actor, at: '2026-10-24T08:00:00Z' };

test('adopting an approved review returns the clause to pending confirmation', () => {
  const next = reviews.applyReviewProposal(requirement, reviews.prepareReviewProposal(requirement, closed), { expectedVersion: 2, actor });
  assert.equal(next.status, '待确认');
  assert.equal(next.needsReview, true);
  assert.match(next.confirmationReason, /确认/);
  assert.equal(next.confirmedAt, undefined);
});

test('a clarification on a confirmed clause binds its proposal to the new clause version', () => {
  const started = reviews.beginReview(requirement, { id: 'C', requirementId: 'R', kind: 'clarification', status: '待处理', requirementVersion: requirement.version });
  assert.equal(started.requirement.version, 3);
  assert.equal(started.requirement.status, '评审中');
  assert.equal(started.requirement.confirmedAt, undefined);
  assert.equal(started.review.requirementVersion, 3);
  assert.equal(started.review.requirementAtSubmission.draft, requirement.draft);
  const replied = reviews.recordClarificationReply(started.review, { reply: '客户确认补充方案', sufficient: true, assessment: '覆盖新增的安全条件', suggestion: '配备门禁联锁并增加复位确认' }, actor);
  const pending = reviews.requirementAfterReview(started.requirement, started.review, replied);
  const adopted = reviews.applyReviewProposal(pending, pending.pendingReviewProposal, { expectedVersion: 3, actor });
  assert.equal(adopted.status, '待确认');
  assert.equal(adopted.draft, '配备门禁联锁并增加复位确认');
  assert.equal(requirement.version, 2);
});

test('legacy pending rechecks migrate without changing answers or historical snapshots', () => {
  const old = { projects: [{ id: 'P' }], requirementsByProject: { P: [{ ...requirement, status: '待复核', pendingReviewProposal: { reviewId: 'D' } }] }, snapshotsByProject: { P: [{ id: 'S', status: '已批准', rows: [{ ...requirement, status: '待复核' }] }] } };
  const next = upgradePrototypeState(old, { members: [] });
  assert.equal(next.requirementsByProject.P[0].status, '待确认');
  assert.equal(next.requirementsByProject.P[0].draft, requirement.draft);
  assert.equal(next.requirementsByProject.P[0].needsReview, true);
  assert.deepEqual(next.snapshotsByProject, old.snapshotsByProject);
  assert.deepEqual(upgradePrototypeState(next, { members: [] }), next);
});

test('restarting a closed review archives its approval and opens a fresh processing round', () => {
  const next = reviews.reopenReview(closed, input);
  assert.equal(next.id, closed.id);
  assert.equal(next.status, '待处理');
  assert.equal(next.round, 2);
  assert.equal(next.version, 2);
  assert.equal(next.approvedAt, undefined);
  assert.equal(next.submittedById, undefined);
  assert.equal(next.requirementAtSubmission, undefined);
  assert.equal(next.roundHistory[0].approvedById, 'demo-approver');
  assert.equal(next.roundHistory[0].plan, closed.plan);
  assert.equal(next.history.at(-1).action, '重新评审');
  assert.equal(closed.status, '已关闭');
  assert.equal(closed.history.length, 1);
});

test('restarting a review requires a closed matter, a reason and an authorized processor', () => {
  assert.throws(() => reviews.reopenReview({ ...closed, status: '处理中' }, input), /已关闭/);
  assert.throws(() => reviews.reopenReview(closed, { ...input, reason: ' ' }), /原因/);
  assert.throws(() => reviews.reopenReview(closed, { ...input, actor: { id: 'demo-approver', role: '最终审批人' } }), /职责|权限/);
  assert.throws(() => reviews.reopenReview(closed, { ...input, owner: '' }), /责任人/);
});

test('a new review round invalidates clause confirmation and retains completed tasks and snapshots', () => {
  const nextReview = reviews.reopenReview(closed, input);
  const nextRow = reviews.requirementAfterReview(requirement, closed, nextReview);
  assert.equal(nextRow.status, '评审中');
  assert.equal(nextRow.confirmedAt, undefined);
  assert.equal(nextRow.pendingReviewProposal, null);
  assert.equal(nextRow.version, 3);
  const historicalTask = { id: 'old-approval', projectId: 'P', objectType: 'review', objectId: 'D', objectVersion: 1, round: 1, kind: 'review-approve', assigneeId: 'demo-approver', status: '已处理', result: '批准', history: [] };
  const snapshot = { id: 'S', status: '已批准', rows: [structuredClone(requirement)] };
  const state = reconcileTasks({ projects: [{ id: 'P' }], requirementsByProject: { P: [nextRow] }, reviewsByProject: { P: [nextReview] }, snapshotsByProject: { P: [snapshot] }, tasksById: { 'old-approval': historicalTask } });
  assert.deepEqual(state.tasksById['old-approval'], historicalTask);
  assert.deepEqual(state.snapshotsByProject.P[0], snapshot);
  assert.equal(Object.values(state.tasksById).filter(task => task.kind === 'review-process' && task.round === 2 && task.status === '待处理').length, 1);
  assert.equal(Object.values(state.tasksById).filter(task => task.objectType === 'requirement' && task.status === '待处理').length, 0);
  const ended = reviews.requirementAfterReview(nextRow, nextReview, { ...nextReview, status: '已关闭' });
  assert.equal(ended.status, '待确认');
  assert.ok(ended.pendingReviewProposal);
  assert.equal(confirmRequirement({ ...ended, pendingReviewProposal: null }).status, '已确认');
});
