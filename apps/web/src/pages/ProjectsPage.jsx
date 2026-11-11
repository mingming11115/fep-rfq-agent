import { Card, Progress, Segmented, Table, Typography } from 'antd';
import OverlayPresence from '../components/OverlayPresence';
import { QueryFilter, ProFormText } from '@ant-design/pro-components';
import { UiButton, PageHeading, BusinessTabs, UiInput, UiTextArea } from '../components/AntContent';
import {getPersonnelContext,canAccessProject,personName} from '../personnelDomain';
import React,{useState,useEffect,useLayoutEffect,useRef} from 'react';
import useContentTransition from '../components/useContentTransition';
import {canPerform} from '../permissions';
import {Plus,Search,LayoutGrid,List,ArrowRight} from "../components/icons";
import {Modal,StatusBadge} from '../components/ui';
import PersonPicker from '../components/PersonPicker';
import RfqProjectTable from '../components/RfqProjectTable';
import CreateRfqDialog from '../components/CreateRfqDialog';
import {selectProjects,getProjectSummary} from '../projectSelectors';
import './workspace-pages.css';
function saved(){try{return JSON.parse(sessionStorage.getItem('rfq.projects.filters'))||{};}catch{ console.error('读取项目筛选条件失败'); return {};}}
export default function ProjectsPage({appState,route,navigate,sourceReparse,onCreateProject,onOpenProject,onAppUpdate,onTransferProject,onDeleteProject,onRestoreProject,toast,logEvent}){
 const canManage=canPerform(appState.actorRole,'project:manage'),isBuAdmin=appState.actorRole==='BU管理员';
 const [f,setF]=useState(()=>({tab:'all',query:'',view:'list',...saved()})),[modal,setModal]=useState(canManage&&new URLSearchParams(location.hash.split('?')[1]).get('action')==='create'),[transfer,setTransfer]=useState(null),[to,setTo]=useState(''),[reason,setReason]=useState('');
 const [projectAction,setProjectAction]=useState(null),[actionReason,setActionReason]=useState(''),[submitting,setSubmitting]=useState(false);
 useEffect(()=>sessionStorage.setItem('rfq.projects.filters',JSON.stringify(f)),[f]);
 const lastDeleted=Object.values(appState.deletedProjectsById||{}).at(-1);
 const hasDeletedList=appState.dataSource==='mysql';
 const tabs=isBuAdmin?[['all','全部']]:[['all','全部'],['initiated','我发起的'],['participated','我参与的']];
 if(hasDeletedList) { tabs.push(['archived','已删除']); }
 const tab=tabs.some(([key])=>key===f.tab)?f.tab:'all';
 const rows=selectProjects(appState,{actorId:appState.actorId,tab,query:f.query}),change=(key,value)=>setF(old=>({...old,[key]:value}));
 const canMaintainProject=project=>{
  if(!hasDeletedList) { return canManage&&project.ownerId===appState.actorId; }
  const {enabled,member,managed}=getPersonnelContext(appState,appState.actorId,project.buId);
  return isBuAdmin?managed:canManage&&enabled&&member.roles.includes('SR')&&project.ownerId===appState.actorId;
 };
 const deletedRows=(appState.archivedProjects||[]).filter(p=>`${p.name} ${p.code} ${p.id} ${p.customer||''}`.toLowerCase().includes(f.query.toLowerCase()));
 const restoring=projectAction?.archived===true;
 const actionLabel=restoring?'恢复':'删除';
 function openProjectAction(project){setActionReason('');setProjectAction(project);}
 function closeProjectAction(){if(!submitting) { setProjectAction(null); }}
 async function submitProjectAction(){
  if(submitting||restoring&&!actionReason.trim()) { return; }
  setSubmitting(true);
  try{
   const result=await (restoring?onRestoreProject(projectAction,actionReason):onDeleteProject(projectAction));
   if(result!==false) { setProjectAction(null); }
  }finally{setSubmitting(false);}
 }
 const openModel=p=>{
  if(p.groupId){navigate('capabilities',null,{buId:p.buId,groupId:p.groupId,returnKey:'projects'});return;}
  if(!p.modelId){toast('该 RFQ 尚未绑定机型，请先在项目信息中关联机型','warning');return;}
  navigate('capabilities',null,{buId:p.buId,modelId:p.modelId,returnKey:'projects'});
 };
 const resultsRef=useRef(null),queryFormRef=useRef(null),initialQuery=useRef({query:f.query}),viewFocusRef=useRef(false);
 useLayoutEffect(()=>{
  if(!viewFocusRef.current) { return; }
  resultsRef.current?.closest('.workspace-page')?.querySelector('input[name="project-view"]:checked')?.focus({preventScroll:true});
  viewFocusRef.current=false;
 },[f.view]);
 useContentTransition(resultsRef,tab,{kind:'rfq-tab',position:tabs.findIndex(([key])=>key===tab)});
 useContentTransition(resultsRef,f.view,{kind:'view'});
 const viewControl=<Segmented key="project-view" name="project-view" aria-label="项目视图" value={f.view} onChange={value=>{viewFocusRef.current=true;change('view',value);}} options={[{value:'list',icon:<List size={15}/>,label:'列表'},{value:'cards',icon:<LayoutGrid size={15}/>,label:'卡片'}]}/>;
 return <div className="workspace-page"><PageHeading title={<>{isBuAdmin?'BU RFQ':'我的 RFQ'}</>} actions={<>{canManage&&lastDeleted&&<UiButton className="text-link" onClick={()=>onRestoreProject(lastDeleted.project)}>撤销删除</UiButton>}{canManage&&<UiButton className="btn btn-primary" onClick={()=>{setModal(true);}}><Plus size={16}/>新建 RFQ</UiButton>}</>} /><section className="panel"><BusinessTabs className="tabs workspace-tabs">{tabs.map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>change('tab',key)}>{label}</button>)}</BusinessTabs><QueryFilter formRef={queryFormRef} className="rfq-query-form" layout="vertical" defaultCollapsed={false}
 initialValues={initialQuery.current} onFinish={async values=>{change('query',values.query||'');return true;}}
 onReset={()=>{queryFormRef.current?.setFieldsValue({query:''});change('query','');}}>
 <ProFormText name="query" label="关键词" placeholder="搜索名称、编号或客户" fieldProps={{'aria-label':'搜索项目',allowClear:true}}/>
 </QueryFilter>
 {tab==='archived'?<div ref={resultsRef} className="rfq-project-results">
  <Table rowKey="id" dataSource={deletedRows} locale={{emptyText:'没有符合条件的已删除项目'}} scroll={{x:640}} columns={[
   {title:'项目 / 客户',key:'project',render:(_,p)=><><strong>{p.name}</strong><small className="rfq-table-meta">{p.code||p.id} · {p.customer||'客户待补充'}</small></>},
   {title:'负责人',dataIndex:'ownerId',render:id=>personName(appState,id)},
   {title:'操作',key:'actions',render:(_,p)=>canMaintainProject(p)&&<UiButton className="text-link" onClick={()=>openProjectAction(p)}>恢复项目</UiButton>},
  ]}/>
 </div>:<>
 {f.view==='cards'&&<div className="rfq-project-toolbar"><span className="muted">{rows.length} 个项目</span>{viewControl}</div>}<div ref={resultsRef} className="rfq-project-results">{f.view==='cards'?<div className="workspace-project-grid">{rows.map(project => {
  const summary = getProjectSummary(appState, project.id, appState.actorId);
  const percent = summary.total ? Math.round(summary.confirmed / summary.total * 100) : 0;
  const groupTitle = project.groupPath || (project.modelId
    ? [project.modelName, project.modelRevision].filter(Boolean).join(' · ')
    : '该 RFQ 尚未绑定目录');

  return <Card key={project.id} size="small" className="rfq-project-card"
    title={<button type="button" className="workspace-project-title"
      onClick={() => onOpenProject(project.id, 'view')}>{project.name}</button>}
    extra={<StatusBadge status={summary.stage}/>}
    classNames={{ body: 'rfq-project-card-body' }}>
    <div className="rfq-project-card-identity">
      <Typography.Text>{project.customer || '客户待补充'}</Typography.Text>
      <Typography.Text type="secondary">{project.id}</Typography.Text>
    </div>
    <dl className="rfq-project-card-details">
      <div><dt>负责人</dt><dd>{project.owner}</dd></div>
      <div><dt>截止日期</dt><dd>{project.deadline || '未设置'}</dd></div>
    </dl>
    <div className="rfq-project-card-progress">
      <div className="rfq-project-card-progress-label">
        <span>确认进度</span>
        <span>{summary.confirmed}/{summary.total}</span>
      </div>
      <Progress percent={percent} size="small" showInfo={false} aria-label="确认进度"/>
      <Typography.Text type="secondary">评审 {summary.reviews} · 重新确认 {summary.rechecks}</Typography.Text>
    </div>
    <div className="workspace-card-actions">
      <UiButton className="btn btn-primary btn-sm" onClick={() => onOpenProject(project.id, isBuAdmin ? 'response' : 'continue')}>
        {isBuAdmin ? '查看RFQ' : '继续处理'} {summary.pending > 0 && `(${summary.pending})`}<ArrowRight size={14}/>
      </UiButton>
      <UiButton className="text-link" title={groupTitle} onClick={() => openModel(project)}>查看关联组</UiButton>
      {canManage && project.ownerId === appState.actorId && <UiButton className="text-link"
        onClick={() => { setTransfer(project); setTo(''); setReason(''); }}>移交</UiButton>}
      {canMaintainProject(project) && <UiButton className="text-link workspace-delete-button"
        onClick={() => openProjectAction(project)}>删除</UiButton>}
    </div>
  </Card>;
})}</div>:<RfqProjectTable sourceReparse={sourceReparse} viewControl={viewControl} rows={rows} appState={appState} canManage={canManage} isBuAdmin={isBuAdmin} onOpenProject={onOpenProject} onOpenModel={openModel} onTransfer={p=>{setTransfer(p);setTo('');setReason('');}} onDelete={openProjectAction} canMaintainProject={canMaintainProject}/>}{f.view==='cards'&&!rows.length&&<div className="workspace-empty">{isBuAdmin?'没有符合条件的项目，可调整筛选条件。':'没有符合条件的项目。可调整筛选或新建 RFQ。'}</div>}</div></>}</section>
 <OverlayPresence>{projectAction&&<Modal title={actionLabel+' RFQ 项目'} onClose={closeProjectAction} footer={<>
  <UiButton className="btn" disabled={submitting} onClick={closeProjectAction}>取消</UiButton>
  <UiButton className={restoring?'btn btn-primary':'btn btn-danger'} loading={submitting} disabled={restoring&&!actionReason.trim()} onClick={submitProjectAction}>确认{actionLabel}</UiButton>
 </>}>
  <p>确认{actionLabel}“{projectAction.name}”？</p>
  <p className="muted">{restoring?'项目将恢复至删除前的阶段，并重新出现在活动列表。':hasDeletedList?'项目及相关待办将从工作列表移出。项目资料和工作记录会保留，可在「已删除」中恢复。':'项目及相关待办将从工作列表移出；删除后可撤销，恢复应答、审批及协作记录。'}</p>
  {restoring&&<label className="field"><span>恢复原因</span><UiTextArea aria-label="恢复原因" maxLength={500} value={actionReason} disabled={submitting} onChange={e=>setActionReason(e.target.value)}/></label>}
 </Modal>}</OverlayPresence>
 <OverlayPresence>{modal&&canManage&&<CreateRfqDialog appState={appState} onClose={()=>setModal(false)} onCreateProject={onCreateProject} onCatalogChange={logEvent}/>}</OverlayPresence><OverlayPresence>{transfer&&canManage&&<Modal title="移交项目负责人" onClose={()=>setTransfer(null)} footer={<><UiButton className="btn" onClick={()=>setTransfer(null)}>取消</UiButton><UiButton className="btn btn-primary" onClick={()=>{if(!to||!reason.trim()){toast('请选择负责人并填写原因','error');return;}if(onTransferProject(transfer.id,to,reason)===false) { return; } setTransfer(null);toast('负责人已移交；专业职责与待办处理人继续保留');}}>确认移交</UiButton></>}><p>{transfer.name} · 当前负责人 {transfer.owner}</p><div className="field"><span>新负责人</span><PersonPicker label="新负责人" people={Object.values(appState.accountsById||{}).filter(a=>a.id!==transfer.ownerId&&canAccessProject(appState,a.id,transfer.id)&&getPersonnelContext(appState,a.id,transfer.buId).member?.roles.includes('SR'))} value={to} onChange={setTo} emptyLabel="暂无可接收此项目的已授权SR"/></div><label className="field"><span>移交原因</span><UiTextArea className="input" value={reason} onChange={e=>setReason(e.target.value)}/></label><p className="muted">移交只更改项目负责人。待办改派需在任务中心逐项转办。</p></Modal>}</OverlayPresence></div>;
}

