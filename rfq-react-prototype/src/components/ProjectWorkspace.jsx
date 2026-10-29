import React from 'react';
import {ArrowLeft,FileOutput,ShieldCheck} from 'lucide-react';
export default function ProjectWorkspace({route,summary,project,taskContextError,onExitTask,children,onNavigate,onReturn,finalReviewGate,canSubmitFinalReview,canDownload,onLaunchFinalReview,onViewFinalReview}) {
 const canExport=!!(canDownload&&finalReviewGate?.canExport);
 const exportReason=canDownload?finalReviewGate?.reason:'应答文档由SR在最终评审通过后导出';
 const snapshot=finalReviewGate?.snapshot;
 const reviewInProgress=snapshot?.status==='审批中'&&!snapshot.stale;
 const isDetail=['response','settings','versions','reviews'].includes(route.page);
 const inlineHeader=isDetail&&React.isValidElement(children);
 const header=<div className="project-context">
   <button className="text-link" onClick={onReturn}><ArrowLeft size={14}/>{route.returnKey==='export'?'返回评审与导出':route.returnKey==='tasks'?'返回任务中心':'返回我的 RFQ'}</button>
   <div className="project-title-row">
    <h1>{project.name}</h1>
    <div className="project-final-actions">
    <div className="page-actions">
     {canSubmitFinalReview&&!reviewInProgress&&<button className="btn btn-primary" disabled={!!taskContextError} onClick={onLaunchFinalReview}><ShieldCheck size={14}/>发起最终评审</button>}
     {snapshot&&<button className="btn" onClick={onViewFinalReview}><ShieldCheck size={14}/>{reviewInProgress?'查看最终评审':'评审记录'}</button>}
     <button className="btn" disabled={!canExport} title={exportReason} onClick={()=>onNavigate('export')}><FileOutput size={14}/>导出文档</button>
    </div>
    </div>
   </div>
   {project.processId&&<p className="project-process-binding">关联工艺：{project.modelName} {project.modelRevision} / {project.processCode} · {project.processName}</p>}
  </div>;
 return <div className={`project-workspace ${isDetail?'project-detail-workspace':''}`}>
  {!inlineHeader&&header}
  {!isDetail&&<div className="tabs project-stage-tabs">{[['documents','RFQ解析'],['response','RFQ细则比对'],['export','导出文档']].map(([key,label])=><button key={key} className={(route.page===key||key==='response'&&route.page==='reviews')?'active':''} disabled={key==='export'&&!canExport} title={key==='export'?exportReason:undefined} onClick={()=>onNavigate(key)}>{label}</button>)}</div>}
  {taskContextError&&<div className="response-notice response-notice-warning"><span>{taskContextError}</span><button className="btn btn-sm" onClick={onExitTask}>进入最新工作上下文</button></div>}
  {inlineHeader?React.cloneElement(children,{workspaceHeader:header}):children}
 </div>;
}
