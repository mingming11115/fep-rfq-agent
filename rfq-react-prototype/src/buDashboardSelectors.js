import {canManageBu,getPersonnelContext,personName} from './personnelDomain.js';
import {getProjectSummary} from './projectSelectors.js';
import {isTaskPending,isTaskOverdue} from './taskDomain.js';
import {getBuApprovalMetrics} from './buApprovalMetrics.js';

const stages=['待上传','解析中','评审中','审批完成','已导出'];
const taskGroups=[
 {label:'起草与修改',kinds:['draft','response-revise']},
 {label:'条款确认',kinds:['confirm','recheck']},
 {label:'评审处理',kinds:['review-process','review-approve','final-approve']},
 {label:'客户澄清',kinds:['clarify']},
];

// BU management grants access to this overview, not project source or response text.
export function selectBuDashboard(state,{actorId=state.actorId,buId=state.activeBuId||state.businessUnits?.find(b=>canManageBu(state,actorId,b.id))?.id,now=new Date(),approvalPeriodDays=30,approvalDataMode='auto'}={}){
 if(state.actorRole!=='BU管理员'||!canManageBu(state,actorId,buId))return null;
 const bu=state.businessUnits.find(b=>b.id===buId);
 const scopedProjects=(state.projects||[]).filter(p=>p.buId===buId),ids=new Set(scopedProjects.map(p=>p.id));
 const tasks=Object.values(state.tasksById||{}).filter(t=>ids.has(t.projectId)&&isTaskPending(t));
 const overdueTasks=tasks.filter(t=>isTaskOverdue(t,now));
 const projects=scopedProjects.map(project=>{
  const summary=getProjectSummary(state,project.id,actorId),rows=state.requirementsByProject?.[project.id]||[];
  const pending=tasks.filter(t=>t.projectId===project.id).length;
  const confirmed=rows.filter(r=>r.status==='已确认'&&!r.needsReview&&!r.sourceRevision&&!r.sourceCorrected).length;
  return {id:project.id,name:project.name,customer:project.customer||'未填写客户',ownerName:project.ownerId?personName(state,project.ownerId):project.owner||'未分派',deadline:project.deadline||'',
   stage:summary.stage,total:rows.length,confirmed,pending,reviews:summary.reviews,clarifications:summary.clarifications,rechecks:summary.rechecks,
   overdueTasks:overdueTasks.filter(t=>t.projectId===project.id).length,
   overdue:summary.stage!=='已导出'&&isTaskOverdue({status:'待处理',dueAt:project.deadline},now)};
 });
 const members=state.buPersonnelByBuId?.[buId]||[];
 const enabledMembers=members.filter(m=>getPersonnelContext(state,m.userId,buId).enabled);
 const workload=[...new Set([...enabledMembers.map(m=>m.userId),...tasks.map(t=>t.assigneeId)])].map(userId=>{
  const member=members.find(m=>m.userId===userId);
  return {userId:userId||'unassigned',name:personName(state,userId),roles:member?.roles||[],enabled:getPersonnelContext(state,userId,buId).enabled,
   pending:tasks.filter(t=>t.assigneeId===userId).length,overdue:overdueTasks.filter(t=>t.assigneeId===userId).length,
   projects:scopedProjects.filter(p=>p.participantIds?.includes(userId)||p.ownerId===userId).length};
 }).sort((a,b)=>b.pending-a.pending||b.overdue-a.overdue||a.name.localeCompare(b.name,'zh-CN'));
 const totalRequirements=projects.reduce((n,p)=>n+p.total,0),confirmedRequirements=projects.reduce((n,p)=>n+p.confirmed,0);
 return {
  bu:{id:bu.id,name:bu.name},projects,workload,
  approval:getBuApprovalMetrics(state,scopedProjects,{now,periodDays:approvalPeriodDays,dataMode:approvalDataMode}),
  stats:{projects:projects.length,active:projects.filter(p=>p.stage!=='已导出').length,overdueProjects:projects.filter(p=>p.overdue).length,pendingTasks:tasks.length,overdueTasks:overdueTasks.length,
   totalRequirements,confirmedRequirements,confirmationRate:totalRequirements?Math.round(confirmedRequirements/totalRequirements*100):0,enabledMembers:enabledMembers.length},
  stages:stages.map(label=>({label,count:projects.filter(p=>p.stage===label).length})),
  taskGroups:taskGroups.map(({label,kinds})=>({label,count:tasks.filter(t=>kinds.includes(t.kind)).length})),
 };
}
