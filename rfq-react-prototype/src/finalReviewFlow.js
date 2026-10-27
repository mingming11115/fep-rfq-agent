import { getExportIssues } from './domain.js';
import { isFinalReviewApproved } from './finalReviewDomain.js';
import { getProjectFinalReview } from './personnelDomain.js';
import { checkSnapshotValidity, currentProjectScope, latestSnapshot } from './snapshotDomain.js';

export function getFinalReviewGate(state, projectId) {
  const snapshot = latestSnapshot(state.snapshotsByProject?.[projectId] || []);
  const locked = reason => ({ canExport: false, snapshot, reason });
  if (!snapshot) return locked('请先发起最终评审，审批通过后可导出文档');
  if (snapshot.status !== '已批准' || !isFinalReviewApproved(snapshot)) {
    return locked(snapshot.status === '已退回' ? '最终评审已退回，请修订后重新发起' : '最终评审尚未全部通过，审批通过后可导出文档');
  }
  const validity = checkSnapshotValidity(snapshot, currentProjectScope(state, projectId, snapshot));
  if (!validity.valid) return locked('当前版本已变化，请重新发起最终评审');
  if (getExportIssues(state.requirementsByProject?.[projectId], state.reviewsByProject?.[projectId], projectId).length) {
    return locked('应答确认或关联事项尚未完成，请处理后重新发起最终评审');
  }
  const files = state.documentsByProject?.[projectId] || [];
  if (files.some(file => file.purpose === '要求来源' && !files.some(next => next.previousVersionId === file.id) && ['排队中', '处理中', '失败'].includes(file.status))) {
    return locked('来源资料尚未完成解析，请处理后重新发起最终评审');
  }
  if (state.accountsById) {
    try { getProjectFinalReview(state, projectId); }
    catch { return locked('评审人员配置已变化，请重新配置并发起最终评审'); }
  }
  return { canExport: true, snapshot, reason: '当前版本最终评审已通过，可导出文档' };
}
