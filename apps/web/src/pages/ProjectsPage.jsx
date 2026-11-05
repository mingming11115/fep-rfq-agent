import { Segmented } from 'antd';
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
function saved(){try{return JSON.parse(sessionStorage.getItem('rfq.projects.filters'))||{};}catch{return {};}}
export default function ProjectsPage({appState,route,navigate,onCreateProject,onOpenProject,onAppUpdate,onTransferProject,onDeleteProject,onRestoreProject,toast,logEvent}){
 const canManage=canPerform(appState.actorRole,'project:manage'),isBuAdmin=appState.actorRole==='BU管理员';
 const [f,setF]=useState(()=>({tab:'all',query:'',view:'list',...saved()})),[modal,setModal]=useState(canManage&&new URLSearchParams(location.hash.split('?')[1]).get('action')==='create'),[transfer,setTransfer]=useState(null),[to,setTo]=useState(''),[reason,setReason]=useState(''),[deleting,setDeleting]=useState(null);
 useEffect(()=>sessionStorage.setItem('rfq.projects.filters',JSON.stringify(f)),[f]);
 const lastDeleted=Object.values(appState.deletedProjectsById||{}).at(-1);
 const rows=selectProjects(appState,{actorId:appState.actorId,tab:isBuAdmin?'all':f.tab,query:f.query}),change=(key,value)=>setF(old=>({...old,[key]:value}));
 const openModel=p=>{
  if(p.groupId){navigate('capabilities',null,{buId:p.buId,groupId:p.groupId,returnKey:'projects'});return;}
  if(!p.modelId){toast('该 RFQ 尚未绑定机型，请先在项目信息中关联机型','warning');return;}
  navigate('capabilities',null,{buId:p.buId,modelId:p.modelId,returnKey:'projects'});
 };
 const resultsRef=useRef(null),queryFormRef=useRef(null),initialQuery=useRef({query:f.query}),viewFocusRef=useRef(false);
 useLayoutEffect(()=>{
  if(!viewFocusRef.current)return;
  resultsRef.current?.closest('.workspace-page')?.querySelector('input[name="project-view"]:checked')?.focus({preventScroll:true});
  viewFocusRef.current=false;
 },[f.view]);
 useContentTransition(resultsRef,`${f.tab}:${f.view}`,{kind:'rfq-tab',position:['all','initiated','participated'].indexOf(f.tab)});
 const viewControl=<Segmented key="project-view" name="project-view" aria-label="项目视图" value={f.view} onChange={value=>{viewFocusRef.current=true;change('view',value);}} options={[{value:'list',icon:<List size={15}/>,label:'列表'},{value:'cards',icon:<LayoutGrid size={15}/>,label:'卡片'}]}/>;
 return <div className="workspace-page"><PageHeading title={<>{isBuAdmin?'BU RFQ':'我的 RFQ'}</>} actions={<>{canManage&&lastDeleted&&<UiButton className="text-link" onClick={()=>onRestoreProject(lastDeleted.project.id)}>撤销删除</UiButton>}{canManage&&<UiButton className="btn btn-primary" onClick={()=>{setModal(true);}}><Plus size={16}/>新建 RFQ</UiButton>}</>} /><section className="panel"><BusinessTabs className="tabs workspace-tabs">{(isBuAdmin?[['all','全部']]:[['all','全部'],['initiated','我发起的'],['participated','我参与的']]).map(([key,label])=><button key={key} className={(isBuAdmin||f.tab===key)?'active':''} onClick={()=>change('tab',key)}>{label}</button>)}</BusinessTabs><QueryFilter formRef={queryFormRef} className="rfq-query-form" layout="vertical" defaultCollapsed={false}
 initialValues={initialQuery.current} onFinish={async values=>{change('query',values.query||'');return true;}}
 onReset={()=>{queryFormRef.current?.setFieldsValue({query:''});change('query','');}}>
 <ProFormText name="query" label="关键词" placeholder="搜索名称、编号或客户" fieldProps={{'aria-label':'搜索项目',allowClear:true}}/>
 </QueryFilter>
 {f.view==='cards'&&<div className="rfq-project-toolbar"><span className="muted">{rows.length} 个项目</span>{viewControl}</div>}<div ref={resultsRef} className="rfq-project-results">{f.view==='cards'?<div className="workspace-project-grid">{rows.map(p=>{const s=getProjectSummary(appState,p.id,appState.actorId);return <article className="workspace-project-card" key={p.id}><div className="workspace-card-top"><StatusBadge status={s.stage}/><small>{p.id}</small></div><button className="workspace-project-title" onClick={()=>onOpenProject(p.id,'view')}>{p.name}</button><p>{p.customer||'客户待补充'}</p><div className="workspace-project-meta"><span>负责人 <b>{p.owner}</b></span><span>截止 <b>{p.deadline||'未设置'}</b></span></div><div className="workspace-progress"><span style={{width:`${s.total?s.confirmed/s.total*100:0}%`}}/></div><small>确认 {s.confirmed}/{s.total} · 评审 {s.reviews} · 重新确认 {s.rechecks}</small><div className="workspace-card-actions"><UiButton className="btn btn-sm" onClick={()=>onOpenProject(p.id,isBuAdmin?'response':'continue')}>{isBuAdmin?'查看RFQ':'继续处理'} {s.pending>0&&`(${s.pending})`}<ArrowRight size={14}/></UiButton><UiButton className="text-link" title={p.groupPath||(p.modelId?[p.modelName,p.modelRevision].filter(Boolean).join(' · '):'该 RFQ 尚未绑定目录')} onClick={()=>openModel(p)}>查看关联组</UiButton>{canManage&&p.ownerId===appState.actorId&&<><UiButton className="text-link" onClick={()=>{setTransfer(p);setTo('');setReason('');}}>移交</UiButton><UiButton className="text-link workspace-delete-button" onClick={()=>setDeleting(p)}>删除</UiButton></>}</div></article>;})}</div>:<RfqProjectTable viewControl={viewControl} rows={rows} appState={appState} canManage={canManage} isBuAdmin={isBuAdmin} onOpenProject={onOpenProject} onOpenModel={openModel} onTransfer={p=>{setTransfer(p);setTo('');setReason('');}} onDelete={setDeleting}/>}{f.view==='cards'&&!rows.length&&<div className="workspace-empty">{isBuAdmin?'没有符合条件的项目，可调整筛选条件。':'没有符合条件的项目。可调整筛选或新建 RFQ。'}</div>}</div></section>{deleting&&canManage&&<Modal title="删除 RFQ 项目" onClose={()=>setDeleting(null)} footer={<><UiButton className="btn" onClick={()=>setDeleting(null)}>取消</UiButton><UiButton className="btn btn-danger" onClick={()=>{if(onDeleteProject(deleting.id)===false)return;setDeleting(null);}}>确认删除</UiButton></>}><p>确认删除“{deleting.name}”？</p><p className="muted">项目及相关待办将从工作列表移出；删除后可撤销，恢复应答、审批及协作记录。</p></Modal>}{modal&&canManage&&<CreateRfqDialog appState={appState} onClose={()=>setModal(false)} onCreateProject={onCreateProject} onCatalogChange={logEvent}/>}{transfer&&canManage&&<Modal title="移交项目负责人" onClose={()=>setTransfer(null)} footer={<><UiButton className="btn" onClick={()=>setTransfer(null)}>取消</UiButton><UiButton className="btn btn-primary" onClick={()=>{if(!to||!reason.trim()){toast('请选择负责人并填写原因','error');return;}if(onTransferProject(transfer.id,to,reason)===false)return;setTransfer(null);toast('负责人已移交；专业职责与待办处理人继续保留');}}>确认移交</UiButton></>}><p>{transfer.name} · 当前负责人 {transfer.owner}</p><div className="field"><span>新负责人</span><PersonPicker label="新负责人" people={Object.values(appState.accountsById||{}).filter(a=>a.id!==transfer.ownerId&&canAccessProject(appState,a.id,transfer.id)&&getPersonnelContext(appState,a.id,transfer.buId).member?.roles.includes('SR'))} value={to} onChange={setTo} emptyLabel="暂无可接收此项目的已授权SR"/></div><label className="field"><span>移交原因</span><UiTextArea className="input" value={reason} onChange={e=>setReason(e.target.value)}/></label><p className="muted">移交只更改项目负责人。待办改派需在任务中心逐项转办。</p></Modal>}</div>;
}

