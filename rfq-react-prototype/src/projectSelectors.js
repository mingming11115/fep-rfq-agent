import {canAccessProject} from './personnelDomain.js';
import {isFinalReviewApproved} from './finalReviewDomain.js';
export function selectAccessibleState(state,actorId){
 const projects=(state.projects||[]).filter(p=>canAccessProject(state,actorId,p.id)),ids=new Set(projects.map(p=>p.id)),next={...state,projects,analysisRuns:(state.analysisRuns||[]).filter(r=>ids.has(r.projectId))};
 for(const key of ['requirementsByProject','reviewsByProject','snapshotsByProject','documentsByProject','commentsByProject','membersByProject','exportScopesByProject'])next[key]=Object.fromEntries(Object.entries(state[key]||{}).filter(([id])=>ids.has(id)));
 next.tasksById=Object.fromEntries(Object.entries(state.tasksById||{}).filter(([,t])=>ids.has(t.projectId)));
 next.deletedProjectsById=Object.fromEntries(Object.entries(state.deletedProjectsById||{}).filter(([,b])=>canAccessProject({...state,projects:[...(state.projects||[]),b.project]},actorId,b.project.id)));
 return next;
}
import {selectMyTasks} from './taskDomain.js';
import {checkSnapshotValidity,currentProjectScope,latestSnapshot} from './snapshotDomain.js';
export function selectProjects(state,{actorId,tab='all',query=''}={}) {
 return (state.projects||[]).filter(p=>(state.accountsById?canAccessProject(state,actorId,p.id):(p.ownerId===actorId||p.createdById===actorId||p.participantIds?.includes(actorId)))&&(tab!=='initiated'||p.createdById===actorId)&&(tab!=='participated'||p.participantIds?.includes(actorId))&&`${p.name} ${p.id} ${p.customer}`.toLowerCase().includes(query.toLowerCase()));
}
export function getProjectSourceSummary(state,projectId) {
 const all=state.documentsByProject?.[projectId]||[];
 const files=all.filter(f=>f.purpose==='要求来源'&&!all.some(newer=>newer.previousVersionId===f.id));
 const status=!files.length?'empty':files.some(f=>f.status==='失败')?'failed':files.some(f=>['排队中','处理中'].includes(f.status))?'parsing':'ready';
 return {files,status};
}
export function getProjectSummary(state,projectId,actorId) {
  const rows=state.requirementsByProject?.[projectId]||[],reviews=state.reviewsByProject?.[projectId]||[],snapshots=state.snapshotsByProject?.[projectId]||[];
  const open=reviews.filter(r=>!['已关闭','已取消'].includes(r.status));
  const pending=selectMyTasks(state,{actorId,projectId,tab:'pending'}).length;
  const current=s=>checkSnapshotValidity(s,currentProjectScope(state,projectId,s)).valid;
  const finished=rows.length>0&&rows.every(r=>r.status==='已确认'&&!r.needsReview&&!r.sourceRevision&&!r.sourceCorrected)&&!open.length;
  const {files:sources}=getProjectSourceSummary(state,projectId);
  const parsing=sources.some(f=>['排队中','处理中','失败'].includes(f.status));
  const snapshot=latestSnapshot(snapshots);
  const approved=finished&&!parsing&&snapshot?.status==='已批准'&&(!state.accountsById||isFinalReviewApproved(snapshot))&&current(snapshot);
  const stage=parsing?'解析中':approved?(snapshot.exportedAt?'已导出':'审批完成'):rows.length?'评审中':sources.length?'解析中':'待上传';
  return {stage,pending,total:rows.length,confirmed:rows.filter(r=>r.status==='已确认'&&!r.needsReview).length,reviews:open.filter(r=>r.kind!=='clarification').length,clarifications:open.filter(r=>r.kind==='clarification').length,rechecks:rows.filter(r=>r.needsReview||r.status==='待复核'||r.sourceRevision||r.sourceCorrected).length};
}
