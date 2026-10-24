import {actorIdForRole} from './stateMigration.js';
import {normalizeTaskStatus} from './taskStatus.js';
import {latestSnapshot} from './snapshotDomain.js';
export const taskLabels={draft:'应答起草',confirm:'条款确认',recheck:'条款复核','review-process':'专业处理','review-approve':'专业批准',clarify:'客户澄清跟进','response-revise':'应答修改','final-approve':'最终审批'};
export const isTaskPending=task=>['待处理','处理中'].includes(normalizeTaskStatus(task.status));
export function isTaskOverdue(task,now=new Date()){
  const dueAt=/^\d{4}-\d{2}-\d{2}$/.test(task.dueAt)?`${task.dueAt}T23:59:59.999+08:00`:task.dueAt;
  return isTaskPending(task)&&!!dueAt&&new Date(dueAt)<now;
}
export function isQualifiedTaskActor(task,actorId) {
  const qualified={draft:['demo-sales'],confirm:['demo-technical'],recheck:['demo-technical'],'review-process':[task.requiredActorId||'demo-technical'],'review-approve':['demo-approver'],clarify:['demo-sales'],'response-revise':[task.requiredActorId||'demo-sales'],'final-approve':['demo-approver']};
  return !!qualified[task.kind]?.includes(actorId);
}
function taskObject(state,task) {
  const collection={requirement:'requirementsByProject',review:'reviewsByProject',snapshot:'snapshotsByProject'}[task.objectType];
  return state[collection]?.[task.projectId]?.find(o=>o.id===task.objectId);
}
export function getTaskContextError(state,route={}) {
  if(!route.taskId)return '';
  const task=state.tasksById?.[route.taskId],object=task&&taskObject(state,task);
  if(!task||!isTaskPending(task))return '该任务已完成或失效，当前为只读，请进入最新工作上下文';
  if(task.projectId!==route.projectId||!object||(object.version||1)!==task.objectVersion||(object.round||1)!==task.round)return '任务对象版本已变化，当前为只读';
  if(task.assigneeId!==state.actorId)return '当前身份不是此任务的处理人，当前为只读';
  if(!isQualifiedTaskActor(task,state.actorId))return '当前身份不具备该节点的处理资格，请转回具备资格的人员';
  if(route.action==='view')return '当前为任务查看模式，请开始处理或进入最新工作上下文';
  return '';
}
export function assertBusinessAction(state,{projectId,objectType,objectId,action='save',route={},expectedVersion,expectedRound}={}) {
  const contextError=getTaskContextError(state,route);if(contextError)throw new Error(contextError);
  const contextTask=state.tasksById?.[route.taskId];
  const revisionContext=contextTask?.kind==='response-revise'&&contextTask.projectId===projectId&&['requirement','review'].includes(objectType);
  if(contextTask&&(contextTask.projectId!==projectId||!revisionContext&&(contextTask.objectType!==objectType||contextTask.objectId!==objectId)))throw new Error('当前任务不属于此业务对象，请进入最新工作上下文');
  const object=taskObject(state,{projectId,objectType,objectId});
  if(!object)throw new Error('业务对象已不存在，请刷新后查看');
  if(objectType==='snapshot'&&['approve','reject'].includes(action)&&latestSnapshot(state.snapshotsByProject?.[projectId])?.id!==objectId)throw new Error('审批轮次已变化，请处理最新快照');
  if(expectedVersion!==undefined&&(object.version||1)!==expectedVersion||expectedRound!==undefined&&(object.round||1)!==expectedRound)throw new Error('对象版本或处理轮次已变化，请重新打开');
  const role=state.actorRole;
  const eligible=['approve','reject'].includes(action)?role==='最终审批人':['confirm','adopt'].includes(action)?role==='技术确认人':action==='submit-requirement'?role==='销售负责人':role==='销售负责人'||role==='技术确认人';
  if(!eligible)throw new Error('当前身份不具备该操作的处理职责');
  const tasks=Object.values(state.tasksById||{}).filter(t=>t.projectId===projectId&&t.objectType===objectType&&t.objectId===objectId&&isTaskPending(t));
  if(tasks.length&&!tasks.some(t=>t.assigneeId===state.actorId))throw new Error('当前身份不是该业务节点的处理人，请由当前处理人处理');
  if(tasks.length&&!tasks.some(t=>t.assigneeId===state.actorId&&isQualifiedTaskActor(t,state.actorId)))throw new Error('当前身份不具备该节点的处理资格');
  return true;
}
export function applyTaskAction(task, action) {
  if(!task || !isTaskPending(task)) throw new Error('任务已经完成或失效，请刷新后查看');
  if(task.assigneeId!==action.actorId) throw new Error('当前身份不是此任务的处理人');
  if(task.objectVersion!==action.objectVersion) throw new Error('对象版本已变化，请打开最新任务');
  const allowed={draft:['submit'],confirm:['confirm'],recheck:['confirm'],'review-process':['submit'],'review-approve':['approve','reject'],clarify:['submit'],'response-revise':['submit'],'final-approve':['approve','reject']};
  const next={...task,history:[...(task.history||[]),{action:action.type,actor:action.actorId,time:action.at,reason:action.reason||'',to:action.to}]};
  if(action.type==='start'||action.type==='save') {
    if(!isQualifiedTaskActor(task,action.actorId))throw new Error('当前身份不具备该节点的处理资格');
    return {...next,status:'处理中',startedAt:task.startedAt||action.at};
  }
  if(action.type==='transfer') {
    if(!action.to||action.to===action.actorId||!action.reason?.trim()) throw new Error('请选择接收人并填写转办原因');
    if(!isQualifiedTaskActor(task,action.to))throw new Error('接收人不具备该节点的处理资格');
    return {...next,assigneeId:action.to,status:'待处理'};
  }
  if(!isQualifiedTaskActor(task,action.actorId))throw new Error('当前身份不具备该节点的处理资格');
  if(action.type==='invalidate') return {...next,status:'已失效'};
  if(!allowed[task.kind]?.includes(action.type)) throw new Error('该动作不能完成当前类型任务');
  const result={confirm:'已确认',approve:'批准',reject:'退回',submit:task.kind==='clarify'?'澄清已解决':'已提交'}[action.type];
  return {...next,status:'已处理',result,completedAt:action.at};
}
export function reconcileTasks(state,{at=new Date().toISOString()}={}) {
  const tasks=Object.fromEntries(Object.entries(state.tasksById||{}).map(([id,t])=>[id,{...t,status:normalizeTaskStatus(t.status)}])), desired=new Set();
  function ensure(project,object,type,kind,assigneeId,extra={}) {
    const version=object.version||1,round=object.round||1;
    const id=`${project.id}:${type}:${object.id}:${kind}:v${version}:r${round}`;
    desired.add(id);
    if(!tasks[id])tasks[id]={id,projectId:project.id,objectType:type,objectId:object.id,objectVersion:version,round,kind,assigneeId,requiredActorId:assigneeId,status:'待处理',arrivedAt:object.createdAt||at,dueAt:object.deadline||project.deadline,title:object.title||object.name||project.name,history:[],...extra};
    else if(!tasks[id].requiredActorId)tasks[id]={...tasks[id],requiredActorId:assigneeId};
  }
  for(const project of state.projects||[]) {
    const reviews=state.reviewsByProject?.[project.id]||[];
    for(const row of state.requirementsByProject?.[project.id]||[]) {
      if(row.status==='已确认')continue;
      if(reviews.some(r=>r.requirementId===row.id&&!['已关闭','已取消'].includes(r.status)))continue;
      const kind=row.needsReview||row.status==='待复核'?'recheck':row.readyForConfirmation?'confirm':'draft';
      ensure(project,row,'requirement',kind,kind==='draft'?'demo-sales':'demo-technical',{requirementId:row.id});
    }
    for(const review of reviews) {
      if(['已关闭','已取消'].includes(review.status))continue;
      const approval=['待审批','待批准'].includes(review.status);
      const kind=review.kind==='clarification'?'clarify':approval?'review-approve':'review-process';
      ensure(project,review,'review',kind,approval?'demo-approver':kind==='clarify'?'demo-sales':actorIdForRole(review.owner),{requirementId:review.requirementId,reviewId:review.id});
    }
    const snapshots=state.snapshotsByProject?.[project.id]||[],latest=latestSnapshot(snapshots);
    for(const snapshot of snapshots){
      if(snapshot===latest&&snapshot.status==='审批中'&&!snapshot.stale)ensure(project,snapshot,'snapshot','final-approve','demo-approver',{snapshotId:snapshot.id,title:`${project.name} · 最终审批`});
      if(snapshot===latest&&snapshot.status==='已退回')ensure(project,snapshot,'snapshot','response-revise',snapshot.createdById||(snapshot.createdBy?actorIdForRole(snapshot.createdBy):'demo-sales'),{snapshotId:snapshot.id,title:`${project.name} · 退回修改`,arrivedAt:snapshot.reviewedAt||at});
    }
  }
  for(const [id,task]of Object.entries(tasks))if(isTaskPending(task)&&!desired.has(id)) {
    const collection=task.objectType==='requirement'?state.requirementsByProject:task.objectType==='review'?state.reviewsByProject:state.snapshotsByProject;
    const object=collection?.[task.projectId]?.find(row=>row.id===task.objectId);
    const sameVersion=(object?.version||1)===task.objectVersion;
    let result;
    if(sameVersion&&object){
      if(task.objectType==='requirement')result=task.kind==='draft'&&object.readyForConfirmation?'已提交':object.status==='已确认'?'已确认':undefined;
      if(task.objectType==='review')result=task.kind==='review-approve'?(object.status==='已退回'?'退回':object.status==='已关闭'?'批准':undefined):object.status==='已关闭'?(task.kind==='clarify'?'澄清已解决':'已提交'):['待审批','待批准'].includes(object.status)?'已提交':undefined;
      if(task.objectType==='snapshot')result=task.kind==='response-revise'?(latestSnapshot(state.snapshotsByProject?.[task.projectId])?.id!==object.id?'已提交':undefined):object.status==='已批准'?'批准':object.status==='已退回'?'退回':undefined;
    }
    const status=result?'已处理':object?.status==='已取消'?'已取消':'已失效';
    tasks[id]={...task,status,...(result?{result,completedAt:at}:{}),history:[...(task.history||[]),{action:result?'业务节点已完成':status==='已取消'?'业务事项已取消':'对象或版本已变化',result,time:at}]};
  }
  return {...state,tasksById:tasks};
}
export function startTaskForObject(state,{projectId,objectType,objectId,actorId,at=new Date().toISOString()}) {
  const next=reconcileTasks(state,{at}),tasksById={...next.tasksById};
  for(const [id,task]of Object.entries(tasksById))if(task.projectId===projectId&&task.assigneeId===actorId&&isTaskPending(task)&&isQualifiedTaskActor(task,actorId)&&((task.objectType===objectType&&task.objectId===objectId)||task.kind==='response-revise'&&['requirement','review'].includes(objectType))&&task.status!=='处理中')tasksById[id]=applyTaskAction(task,{type:'save',actorId,objectVersion:task.objectVersion,at});
  return {...next,tasksById};
}
export function selectMyTasks(state,{actorId,projectId,tab='pending'}={}) {
  return Object.values(state.tasksById||{}).filter(task=>task.assigneeId===actorId&&(!projectId||task.projectId===projectId)&&(tab==='all'||tab==='done'&&normalizeTaskStatus(task.status)==='已处理'||tab==='pending'&&isTaskPending(task)))
    .sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999')||a.arrivedAt.localeCompare(b.arrivedAt));
}
