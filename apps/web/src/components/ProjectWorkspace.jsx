import { UiButton } from './AntContent';
import React,{useEffect,useState} from 'react';
import {Drawer,Popover} from 'antd';
import { PageContainer } from '@ant-design/pro-components';
import {ArrowLeft,FileOutput,FileText,ShieldCheck} from "./icons";
export default function ProjectWorkspace({route,summary,project,actorRole,projectInfoPanel,taskContextError,onExitTask,children,onNavigate,onReturn,finalReviewGate,canSubmitFinalReview,canDownload,onLaunchFinalReview,onViewFinalReview}) {
 const [infoOpen,setInfoOpen]=useState(route.page==='settings');
 useEffect(()=>setInfoOpen(route.page==='settings'),[route.page,project.id,actorRole]);
 const canExport=!!(canDownload&&finalReviewGate?.canExport);
 const exportReason=canDownload
   ? finalReviewGate?.reason||'当前版本尚未满足导出条件。'
   : '当前身份没有导出权限，正式文档仅由 SR 导出。';
 const exportLabel=<><FileOutput size={14}/>导出文档</>;
 const snapshot=finalReviewGate?.snapshot;
 const reviewInProgress=snapshot?.status==='审批中'&&!snapshot.stale;
 const isDetail=['response','settings','versions','reviews'].includes(route.page);
 const header=<PageContainer className="rfq-project-heading" ghost breadcrumb={false}
   onBack={onReturn} backIcon={<ArrowLeft size={16}/>}
   title={<h1 className="rfq-page-title" title={project.name}>{project.name}</h1>}

   extra={<>
     {isDetail&&projectInfoPanel&&<UiButton className="btn" aria-haspopup="dialog" aria-expanded={infoOpen} onClick={()=>setInfoOpen(true)}><FileText size={14}/>项目信息</UiButton>}
     {canSubmitFinalReview&&!reviewInProgress&&<UiButton className="btn btn-primary" disabled={!!taskContextError} onClick={onLaunchFinalReview}><ShieldCheck size={14}/>发起最终评审</UiButton>}
     {snapshot&&<UiButton className="btn" onClick={onViewFinalReview}><ShieldCheck size={14}/>{reviewInProgress?'查看最终评审':'评审记录'}</UiButton>}
     {canExport
       ? <UiButton className="btn" onClick={()=>onNavigate('export')}>{exportLabel}</UiButton>
       : <Popover key={`${project.id}:${actorRole}:${exportReason}`} content={exportReason} trigger={['hover','click']} placement="bottomRight">
           <UiButton className="btn ant-btn-disabled" aria-disabled="true">{exportLabel}</UiButton>
         </Popover>}
   </>} />;
 return <div className={`project-workspace ${isDetail?'project-detail-workspace':''}`}>
  {header}
  {taskContextError&&<div className="response-notice response-notice-warning"><span>{taskContextError}</span><UiButton className="btn btn-sm" onClick={onExitTask}>进入最新工作上下文</UiButton></div>}
  {children}
  {isDetail&&projectInfoPanel&&<Drawer title="项目信息" open={infoOpen} onClose={()=>setInfoOpen(false)} width="min(760px, 100vw)" forceRender rootClassName="rfq-project-info-drawer" className="rfq-ant-drawer"><div key={project.id+':'+actorRole}>{projectInfoPanel}</div></Drawer>}
 </div>;
}
