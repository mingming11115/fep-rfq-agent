import { UiButton, BusinessTabs } from './AntContent';
import React from 'react';
import { PageContainer } from '@ant-design/pro-components';
import {ArrowLeft,FileOutput,ShieldCheck} from "./icons";
export default function ProjectWorkspace({route,summary,project,taskContextError,onExitTask,children,onNavigate,onReturn,finalReviewGate,canSubmitFinalReview,canDownload,onLaunchFinalReview,onViewFinalReview}) {
 const canExport=!!(canDownload&&finalReviewGate?.canExport);
 const exportReason=canDownload?finalReviewGate?.reason:'应答文档由SR在最终评审通过后导出';
 const snapshot=finalReviewGate?.snapshot;
 const reviewInProgress=snapshot?.status==='审批中'&&!snapshot.stale;
 const isDetail=['response','settings','versions','reviews'].includes(route.page);
 const header=<PageContainer className="rfq-project-heading" ghost breadcrumb={false}
   onBack={onReturn} backIcon={<ArrowLeft size={16}/>}
   title={<h1 className="rfq-page-title" title={project.name}>{project.name}</h1>}
   content={project.processId ? <>关联工艺：{project.modelName} {project.modelRevision} / {project.processCode} · {project.processName}</> : undefined}
   extra={<>
     {canSubmitFinalReview&&!reviewInProgress&&<UiButton className="btn btn-primary" disabled={!!taskContextError} onClick={onLaunchFinalReview}><ShieldCheck size={14}/>发起最终评审</UiButton>}
     {snapshot&&<UiButton className="btn" onClick={onViewFinalReview}><ShieldCheck size={14}/>{reviewInProgress?'查看最终评审':'评审记录'}</UiButton>}
     <UiButton className="btn" disabled={!canExport} title={exportReason} onClick={()=>onNavigate('export')}><FileOutput size={14}/>导出文档</UiButton>
   </>} />;
 return <div className={`project-workspace ${isDetail?'project-detail-workspace':''}`}>
  {header}
  {!isDetail&&<BusinessTabs className="tabs project-stage-tabs">{[['documents','RFQ解析'],['response','RFQ细则比对'],['export','导出文档']].map(([key,label])=><button key={key} className={(route.page===key||key==='response'&&route.page==='reviews')?'active':''} disabled={key==='export'&&!canExport} title={key==='export'?exportReason:undefined} onClick={()=>onNavigate(key)}>{label}</button>)}</BusinessTabs>}
  {taskContextError&&<div className="response-notice response-notice-warning"><span>{taskContextError}</span><UiButton className="btn btn-sm" onClick={onExitTask}>进入最新工作上下文</UiButton></div>}
  {children}
 </div>;
}
