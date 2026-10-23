import {selectMyTasks} from './taskDomain.js';
export function getProjectSummary(state,projectId,actorId) {
  const rows=state.requirementsByProject?.[projectId]||[],reviews=state.reviewsByProject?.[projectId]||[],snapshots=state.snapshotsByProject?.[projectId]||[];
  const open=reviews.filter(r=>!['已关闭','已取消'].includes(r.status));
  const pending=selectMyTasks(state,{actorId,projectId,tab:'pending'}).length;
  const stage=snapshots.some(s=>s.status==='审批中'&&!s.stale)?'最终审批中':snapshots.some(s=>s.status==='已批准'&&s.exportedAt&&!s.stale)?'本轮已完成':rows.length?'应答编制中':'待上传';
  return {stage,pending,total:rows.length,confirmed:rows.filter(r=>r.status==='已确认'&&!r.needsReview).length,reviews:open.filter(r=>r.kind!=='clarification').length,clarifications:open.filter(r=>r.kind==='clarification').length,rechecks:rows.filter(r=>r.needsReview||r.status==='待复核'||r.sourceRevision||r.sourceCorrected).length};
}
