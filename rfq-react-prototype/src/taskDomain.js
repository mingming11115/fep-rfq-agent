import {actorIdForRole} from './stateMigration.js';
export const taskLabels={draft:'应答起草',confirm:'条款确认',recheck:'条款复核','review-process':'专业处理','review-approve':'专业批准',clarify:'客户澄清跟进','final-approve':'最终审批'};
export const isTaskPending=task=>['待办理','办理中'].includes(task.status);
export function isQualifiedTaskActor(task,actorId) {
  const qualified={draft:['demo-sales'],confirm:['demo-technical'],recheck:['demo-technical'],'review-process':[task.requiredActorId||'demo-technical'],'review-approve':['demo-approver'],clarify:['demo-sales'],'final-approve':['demo-approver']};
  return !!qualified[task.kind]?.includes(actorId);
}
function taskObject(state,task) {
  const collection={requirement:'requirementsByProject',review:'reviewsByProject',snapshot:'snapshotsByProject'}[task.objectType];
  return state[collection]?.[task.projectId]?.find(o=>o.id===task.objectId);
}
export function getTaskContextError(state,route={}) {
  if(!route.taskId)return '';
  const task=state.tasksById?.[route.taskId],object=task&&taskObject(state,task);
  if(!task||!isTaskPending(task))return '该任务已办结或失效，当前为只读，请进入最新工作上下文';
  if(task.projectId!==route.projectId||!object||(object.version||1)!==task.objectVersion||(object.round||1)!==task.round)return '任务对象版本已变化，当前为只读';
  if(task.assigneeId!==state.actorId)return '当前身份不是此任务的处理人，当前为只读';
  if(!isQualifiedTaskActor(task,state.actorId))return '当前身份不具备该节点的办理资格，请转回具备资格的人员';
  if(route.action==='view')return '当前为任务查看模式，请开始办理或进入最新工作上下文';
  return '';
}
export function assertBusinessAction(state,{projectId,objectType,objectId,action='save',route={},expectedVersion,expectedRound}={}) {
  const contextError=getTaskContextError(state,route);if(contextError)throw new Error(contextError);
  const contextTask=state.tasksById?.[route.taskId];
  if(contextTask&&(contextTask.objectType!==objectType||contextTask.objectId!==objectId))throw new Error('当前任务不属于此业务对象，请进入最新工作上下文');
  const object=taskObject(state,{projectId,objectType,objectId});
  if(!object)throw new Error('业务对象已不存在，请刷新后查看');
  if(expectedVersion!==undefined&&(object.version||1)!==expectedVersion||expectedRound!==undefined&&(object.round||1)!==expectedRound)throw new Error('对象版本或办理轮次已变化，请重新打开');
  const role=state.actorRole;
  const eligible=['approve','reject'].includes(action)?role==='最终审批人':['confirm','adopt'].includes(action)?role==='技术确认人':action==='submit-requirement'?role==='销售负责人':role==='销售负责人'||role==='技术确认人';
  if(!eligible)throw new Error('当前身份不具备该操作的办理职责');
  const tasks=Object.values(state.tasksById||{}).filter(t=>t.projectId===projectId&&t.objectType===objectType&&t.objectId===objectId&&isTaskPending(t));
  if(tasks.length&&!tasks.some(t=>t.assigneeId===state.actorId))throw new Error('当前身份不是该业务节点的处理人，请由当前经办人办理');
  if(tasks.length&&!tasks.some(t=>t.assigneeId===state.actorId&&isQualifiedTaskActor(t,state.actorId)))throw new Error('当前身份不具备该节点的办理资格');
  return true;
}
export function applyTaskAction(task, action) {
  if(!task || !isTaskPending(task)) throw new Error('任务已经办结或失效，请刷新后查看');
  if(task.assigneeId!==action.actorId) throw new Error('当前身份不是此任务的处理人');
  if(task.objectVersion!==action.objectVersion) throw new Error('对象版本已变化，请打开最新任务');
  const allowed={draft:['submit'],confirm:['confirm'],recheck:['confirm'],'review-process':['submit'],'review-approve':['approve','reject'],clarify:['submit'],'final-approve':['approve','reject']};
  const next={...task,history:[...(task.history||[]),{action:action.type,actor:action.actorId,time:action.at,reason:action.reason||'',to:action.to}]};
  if(action.type==='start'||action.type==='save') {
    if(!isQualifiedTaskActor(task,action.actorId))throw new Error('当前身份不具备该节点的办理资格');
    return {...next,status:'办理中',startedAt:task.startedAt||action.at};
  }
  if(action.type==='transfer') {
    if(!action.to||action.to===action.actorId||!action.reason?.trim()) throw new Error('请选择接收人并填写转办原因');
    if(!isQualifiedTaskActor(task,action.to))throw new Error('接收人不具备该节点的办理资格');
    return {...next,assigneeId:action.to,status:'待办理'};
  }
  if(!isQualifiedTaskActor(task,action.actorId))throw new Error('当前身份不具备该节点的办理资格');
  if(action.type==='invalidate') return {...next,status:'已失效'};
  if(!allowed[task.kind]?.includes(action.type)) throw new Error('该动作不能办结当前类型任务');
  return {...next,status:'已办理',completedAt:action.at};
}
export function reconcileTasks(state,{at=new Date().toISOString()}={}) {
  const tasks={...(state.tasksById||{})}, desired=new Set();
  function ensure(project,object,type,kind,assigneeId,extra={}) {
    const version=object.version||1,round=object.round||1;
    const id=`${project.id}:${type}:${object.id}:${kind}:v${version}:r${round}`;
    desired.add(id);
    if(!tasks[id])tasks[id]={id,projectId:project.id,objectType:type,objectId:object.id,objectVersion:version,round,kind,assigneeId,requiredActorId:assigneeId,status:'待办理',arrivedAt:object.createdAt||at,dueAt:object.deadline||project.deadline,title:object.title||object.name||project.name,history:[],...extra};
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
    for(const snapshot of state.snapshotsByProject?.[project.id]||[])if(snapshot.status==='审批中'&&!snapshot.stale)ensure(project,snapshot,'snapshot','final-approve','demo-approver',{snapshotId:snapshot.id,title:`${project.name} · 最终审批`});
  }
  for(const [id,task]of Object.entries(tasks))if(isTaskPending(task)&&!desired.has(id)) {
    const collection=task.objectType==='requirement'?state.requirementsByProject:task.objectType==='review'?state.reviewsByProject:state.snapshotsByProject;
    const object=collection?.[task.projectId]?.find(row=>row.id===task.objectId);
    const sameVersion=(object?.version||1)===task.objectVersion;
    const finished=sameVersion&&((task.objectType==='requirement'&&(object?.status==='已确认'||task.kind==='draft'&&object?.readyForConfirmation))||(task.objectType==='review'&&(object?.status==='已关闭'||task.kind==='review-approve'&&object?.status==='已退回'||task.kind==='review-process'&&['待审批','待批准'].includes(object?.status)))||(task.objectType==='snapshot'&&['已批准','已退回'].includes(object?.status)));
    tasks[id]={...task,status:finished?'已办理':'已失效',...(finished?{completedAt:at}:{}),history:[...(task.history||[]),{action:finished?'业务节点已完成':'对象或版本已变化',time:at}]};
  }
  return {...state,tasksById:tasks};
}
export function selectMyTasks(state,{actorId,projectId,tab='pending'}={}) {
  return Object.values(state.tasksById||{}).filter(task=>task.assigneeId===actorId&&(!projectId||task.projectId===projectId)&&(tab==='all'||tab==='done'&&task.status==='已办理'||tab==='pending'&&isTaskPending(task)))
    .sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999')||a.arrivedAt.localeCompare(b.arrivedAt));
}
