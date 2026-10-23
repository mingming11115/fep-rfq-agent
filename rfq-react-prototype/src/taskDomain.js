import {actorIdForRole} from './stateMigration.js';
export const taskLabels={draft:'应答起草',confirm:'条款确认',recheck:'条款复核','review-process':'专业处理','review-approve':'专业批准',clarify:'客户澄清跟进','final-approve':'最终审批'};
export const isTaskPending=task=>['待办理','办理中'].includes(task.status);
export function applyTaskAction(task, action) {
  if(!task || !isTaskPending(task)) throw new Error('任务已经办结或失效，请刷新后查看');
  if(task.assigneeId!==action.actorId) throw new Error('当前身份不是此任务的处理人');
  if(task.objectVersion!==action.objectVersion) throw new Error('对象版本已变化，请打开最新任务');
  const allowed={draft:['submit'],confirm:['confirm'],recheck:['confirm'],'review-process':['submit'],'review-approve':['approve','reject'],clarify:['submit'],'final-approve':['approve','reject']};
  const next={...task,history:[...(task.history||[]),{action:action.type,actor:action.actorId,time:action.at,reason:action.reason||'',to:action.to}]};
  if(action.type==='start'||action.type==='save') return {...next,status:'办理中',startedAt:task.startedAt||action.at};
  if(action.type==='transfer') {
    if(!action.to||action.to===action.actorId||!action.reason?.trim()) throw new Error('请选择接收人并填写转办原因');
    return {...next,assigneeId:action.to,status:'待办理'};
  }
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
    if(!tasks[id])tasks[id]={id,projectId:project.id,objectType:type,objectId:object.id,objectVersion:version,round,kind,assigneeId,status:'待办理',arrivedAt:object.createdAt||at,dueAt:object.deadline||project.deadline,title:object.title||object.name||project.name,history:[],...extra};
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
    const finished=sameVersion&&((task.objectType==='requirement'&&(object?.status==='已确认'||task.kind==='draft'&&object?.readyForConfirmation))||(task.objectType==='review'&&(object?.status==='已关闭'||task.kind==='review-process'&&['待审批','待批准'].includes(object?.status)))||(task.objectType==='snapshot'&&['已批准','已退回'].includes(object?.status)));
    tasks[id]={...task,status:finished?'已办理':'已失效',...(finished?{completedAt:at}:{}),history:[...(task.history||[]),{action:finished?'业务节点已完成':'对象或版本已变化',time:at}]};
  }
  return {...state,tasksById:tasks};
}
export function selectMyTasks(state,{actorId,projectId,tab='pending'}={}) {
  return Object.values(state.tasksById||{}).filter(task=>task.assigneeId===actorId&&(!projectId||task.projectId===projectId)&&(tab==='all'||tab==='done'&&task.status==='已办理'||tab==='pending'&&isTaskPending(task)))
    .sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999')||a.arrivedAt.localeCompare(b.arrivedAt));
}
