import React from 'react';
import {displayStatus} from './ui';
import {ArrowLeft,FileOutput,Workflow,ShieldCheck} from 'lucide-react';
export default function ProjectWorkspace({route,summary,project,task,taskContextError,onExitTask,children,onNavigate,onReturn,finalReviewGate,canSubmitFinalReview,canDownload,onLaunchFinalReview,onViewFinalReview}) {
 const canExport=!!(canDownload&&finalReviewGate?.canExport);
 const exportReason=canDownload?finalReviewGate?.reason:'应答文档由SR在最终评审通过后导出';
 const snapshot=finalReviewGate?.snapshot;
 const reviewInProgress=snapshot?.status==='审批中'&&!snapshot.stale;
 return <div className={`project-workspace ${['response','settings','versions','reviews'].includes(route.page)?'project-detail-workspace':''}`}>
  <div className="project-context">
   <div><button className="text-link" onClick={onReturn}><ArrowLeft size={14}/>{route.returnKey==='export'?'返回评审与导出':route.returnKey==='tasks'?'返回任务中心':'返回我的 RFQ'}</button><h1>{project.name}</h1><p>{project.id} · 工作版本 V{project.version||1} · {project.customer||'客户待补充'} · 截止 {project.deadline||'未设置'}<span className="stage-tag">{summary.stage}</span></p>{project.processId&&<p className="project-process-binding">关联工艺：{project.modelName} {project.modelRevision} / {project.processCode} · {project.processName}</p>}</div>
   <div className="project-final-actions">
    <div className="page-actions">
     {canSubmitFinalReview&&!reviewInProgress&&<button className="btn btn-primary" disabled={!!taskContextError} onClick={onLaunchFinalReview}><ShieldCheck size={14}/>发起最终评审</button>}
     {snapshot&&<button className="btn" onClick={onViewFinalReview}><ShieldCheck size={14}/>{reviewInProgress?'查看最终评审':'评审记录'}</button>}
     <button className="btn" disabled={!canExport} title={exportReason} onClick={()=>onNavigate('export')}><FileOutput size={14}/>导出文档</button>
    </div>
    <small className={`project-export-status ${canExport?'approved':''}`} role="status">{exportReason}</small>
   </div>
  </div>
  {!['response','settings','versions','reviews'].includes(route.page)&&<div className="tabs project-stage-tabs">{[['documents','RFQ解析'],['response','RFQ细则比对'],['export','导出文档']].map(([key,label])=><button key={key} className={(route.page===key||key==='response'&&route.page==='reviews')?'active':''} disabled={key==='export'&&!canExport} title={key==='export'?exportReason:undefined} onClick={()=>onNavigate(key)}>{label}</button>)}</div>}
  {taskContextError&&<div className="response-notice response-notice-warning"><span>{taskContextError}</span><button className="btn btn-sm" onClick={onExitTask}>进入最新工作上下文</button></div>}
  {task&&<div className={`workspace-task ${['已失效','已取消'].includes(task.status)?'stale':''}`}><Workflow size={16}/><strong>{task.title}</strong><span>{displayStatus(task.status)} · 对象 V{task.objectVersion} · 截止 {task.dueAt||'未设置'}</span></div>}
  {children}
 </div>;
}
