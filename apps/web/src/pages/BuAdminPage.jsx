import {Card,Table,Tag,Space,Typography} from 'antd';
import AdminPageHeader from '../components/AdminPageHeader';
import { QueryFilter, ProFormText, ProFormSelect } from '@ant-design/pro-components';
import { UiTag, UiSelect, UiInput, UiButton, BusinessTable, UiCheckbox, UiTextArea } from '../components/AntContent';
import {getDefaultConfirmationActorId,getResponseReview,getReviewActorIds} from '../confirmationPolicy';
import React,{useState,useEffect} from 'react';
import {Plus,Users} from "../components/icons";
import {Modal,EmptyState} from '../components/ui';
import {personName,canManageBu,getPersonnelContext,getEligiblePersonnel,updateBuMember,getProjectReviewSettings,updateProjectAccess,configureProjectFinalReviewers,assignProjectDuty,updatePlatformDirectory,selectPlatformDirectoryAccounts} from '../personnelDomain';
import './management-pages.css';
import PersonPicker from '../components/PersonPicker';
import MatchPolicyPanel from '../components/MatchPolicyPanel';
import {syncBuMember} from '../memberSync';
import {snapshotClient} from '../finalSnapshotClient';

const Field=({label,children})=><div className="field"><span>{label}</span>{children}</div>;
const ErrorBox=({error})=>error?<p className="error-notice" role="alert">{error}</p>:null;
const flip=(list,id)=>list.includes(id)?list.filter(x=>x!==id):[...list,id];

export function ProjectPersonnelPanel({appState,project,requirements=[],actorId,onPersonnelAction,onConfigureFinalReview}){
 const state=appState,current=project.approvalConfig?.finalReviewers||{},mode=getProjectReviewSettings(state,project.id)?.technicalMode;
 const [form,setForm]=useState(()=>({srId:current.srId||'',technicalIds:current.technicalIds||[],technicalRepresentativeId:current.technicalRepresentativeId||'',technicalMode:mode||'all'}));
 const [reason,setReason]=useState(''),[error,setError]=useState('');
 useEffect(()=>{setForm({srId:current.srId||'',technicalIds:current.technicalIds||[],technicalRepresentativeId:current.technicalRepresentativeId||'',technicalMode:mode||'all'});},[JSON.stringify(current),mode]);
 const managed=canManageBu(state,actorId,project.buId),canEdit=managed||project.ownerId===actorId&&getPersonnelContext(state,actorId,project.buId).member?.roles.includes('SR');
 const candidates=side=>getEligiblePersonnel(state,{buId:project.buId,projectId:project.id,duty:'final-review',side});
 const confirmers=getEligiblePersonnel(state,{buId:project.buId,projectId:project.id,duty:'confirm'});
 const save=async()=>{try{
  if(!canEdit) { throw new Error('无项目分派权限'); }
  const config={...form,technicalRepresentativeId:form.technicalRepresentativeId||null,reason};
  if(state.dataSource==='mysql') { await onConfigureFinalReview(project.id,{...config,version:getProjectReviewSettings(state,project.id)?.version||1}); }
  else if(onPersonnelAction(s=>configureProjectFinalReviewers(s,{actorId,projectId:project.id,...config}))===false) { return; }
  setError('');setReason('');
 }catch(e){ console.error('保存项目人员设置失败', e); setError(e.message);}};
 return <section className="panel personnel-panel"><div className="panel-header"><h2><Users size={17}/> 评审规则与人员</h2><UiTag className="badge">{form.technicalMode==='representative'?'技术负责人代表通过':'技术组全员通过'}</UiTag></div><div className="panel-body"><div className="form-grid"><Field label="最终评审规则"><UiSelect className="select" aria-label="最终评审规则" disabled={!canEdit} value={form.technicalMode} onChange={e=>setForm({...form,technicalMode:e.target.value})}><option value="all">所有指定技术成员均通过</option><option value="representative">指定技术负责人代表通过</option></UiSelect></Field><Field label="SR方最终评审人"><PersonPicker label="SR方最终评审人" disabled={!canEdit} people={candidates('sr')} value={form.srId} resolveName={id=>personName(state,id)} onChange={srId=>setForm({...form,srId})}/></Field><Field label="技术组评审成员"><PersonPicker label="技术组评审成员" multiple disabled={!canEdit} people={candidates('technical')} value={form.technicalIds} resolveName={id=>personName(state,id)} onChange={technicalIds=>setForm({...form,technicalIds,technicalRepresentativeId:technicalIds.includes(form.technicalRepresentativeId)?form.technicalRepresentativeId:''})} emptyLabel="暂无有项目授权的技术候选，请由BU管理员授权"/></Field>{form.technicalMode==='representative'&&<Field label="技术负责人"><PersonPicker label="技术负责人" disabled={!canEdit} people={candidates('technical').filter(m=>form.technicalIds.includes(m.userId))} value={form.technicalRepresentativeId} resolveName={id=>personName(state,id)} onChange={technicalRepresentativeId=>setForm({...form,technicalRepresentativeId})} emptyLabel="请先选择技术组评审成员"/></Field>}</div>{canEdit&&<><Field label="人员配置变更原因"><UiInput className="input" aria-label="人员配置变更原因" value={reason} onChange={e=>setReason(e.target.value)} placeholder="说明技术分工或评审组调整原因"/></Field><ErrorBox error={error}/><UiButton className="btn btn-primary" onClick={save}>保存最终评审配置</UiButton></>}
 {requirements.length>0&&<><h3>条款确认分工</h3><p className="muted">默认由具备确认资格和项目授权的创建人确认，否则由项目负责人确认。可直接指派其他人员；发起评审后由所选评审人共同确认。</p><div className="table-wrap"><BusinessTable className="data-table"><thead><tr><th>条款</th><th>确认责任人</th></tr></thead><tbody>{requirements.map(row=><tr key={row.id}><td>{row.clause} {row.title}</td><td><PersonPicker label={`确认人 ${row.id}`} disabled={!canEdit||!!getResponseReview(state,project.id,row.id)} people={confirmers} value={state.implicitConfirmationIdsByProject?.[project.id]?.includes(row.id)&&row.confirmationAssignmentSource!=='explicit'?'':row.confirmationAssigneeId||''} resolveName={id=>personName(state,id)} placeholder={`默认确认人 · ${personName(state,getDefaultConfirmationActorId(state,project.id))}；输入 @ 选人`} clearLabel="恢复默认确认人" onChange={userId=>{try{onPersonnelAction(s=>assignProjectDuty(s,{actorId,projectId:project.id,userId,duty:'confirm',requirementId:row.id,reason:reason.trim()||'调整条款确认分工'}));setError('');}catch(err){ console.error('保存条款确认分工失败', err); setError(err.message);}}}/>{state.confirmationMigrationNotesByProject?.[project.id]?.[row.id]&&row.confirmationAssignmentSource!=='explicit'&&<small>{state.confirmationMigrationNotesByProject[project.id][row.id]}</small>}{getResponseReview(state,project.id,row.id)&&<small>评审人：{getReviewActorIds(getResponseReview(state,project.id,row.id)).map(id=>personName(state,id)).join('、')}；请在评审中调整。</small>}</td></tr>)}</tbody></BusinessTable></div></>}


 </div></section>;
}

export default function BuAdminPage({appState:state,actorId,onPersonnelAction,onConfigureFinalReview,onReload,onSelectBu,route}){
 const bus=state.businessUnits.filter(b=>canManageBu(state,actorId,b.id));
 const [buId,setBuId]=useState(bus.some(b=>b.id===state.activeBuId)?state.activeBuId:bus[0]?.id||''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[edit,setEdit]=useState(null),[reason,setReason]=useState(''),[error,setError]=useState(''),[projectId,setProjectId]=useState('');
 useEffect(()=>{setProjectId(state.projects.some(p=>p.id===route?.projectId&&p.buId===buId)?route.projectId:'');},[buId,route?.projectId]);
 const members=state.buPersonnelByBuId[buId]||[],projects=state.projects.filter(p=>p.buId===buId),project=projects.find(p=>p.id===projectId);
 const open=m=>{setEdit(m?{...m,projectIds:projects.filter(p=>p.participantIds?.includes(m.userId)).map(p=>p.id)}:{userId:'',roles:['技术'],enabled:true,canConfirm:true,canFinalReview:true,resourceQualifications:[],projectIds:[]});setReason('');setError('');};
 const run=fn=>{try{if(onPersonnelAction(fn)!==false){setError('');return true;}}catch(e){ console.error('执行 BU 人员管理操作失败', e); setError(e.message);}return false;};
 const save=async()=>{const {userId,projectIds,codes=[],...rest}=edit;if(state.dataSource==='mysql'&&!reason.trim()){setError('请填写变更原因');return;}if(!userId){setError('请选择账号');return;}const patch={roles:rest.roles,enabled:rest.enabled,canConfirm:rest.canConfirm,canFinalReview:rest.canFinalReview,resourceQualifications:rest.resourceQualifications};try{await syncBuMember(buId,userId,patch,codes);}catch(e){ console.error('同步 BU 成员失败', e); setError(e.message||'同步到服务器失败');return;}if(state.dataSource==='mysql'){
   try{
    for(const p of projects){
     const enabled=projectIds.includes(p.id);
     if(enabled===Boolean(p.participantIds?.includes(userId))||p.ownerId===userId) { continue; }
     await snapshotClient().setMember(p.id,userId,{version:p.version,enabled,reason:reason.trim()});
    }
    await onReload?.();setEdit(null);
   }catch(e){ console.error('更新 BU 成员项目分工失败', e); setError(e.message);await onReload?.();}
   return;
  }if(run(s=>{let next=updateBuMember(s,{actorId,buId,userId,patch,reason});if(patch.enabled&&patch.roles.length) { for(const p of projects)next=updateProjectAccess(next,{actorId,projectId:p.id,userId,enabled:projectIds.includes(p.id),reason}); } return next;})) { setEdit(null); }};
 const [memberPage,setMemberPage]=useState(1);
 useEffect(()=>setMemberPage(1),[buId,query,filter]);
 const rows=members.filter(m=>`${personName(state,m.userId)} ${m.userId}`.toLowerCase().includes(query.toLowerCase())&&(filter==='all'||filter==='enabled'&&m.enabled||filter==='confirm'&&m.canConfirm||filter==='review'&&m.canFinalReview||m.roles.includes(filter)));
 if(!bus.length) { return <div className="panel panel-body">当前账号没有可管理的BU。</div>; }
 return <div className="management-page bu-admin-page admin-management-page"><AdminPageHeader title={<>BU管理</>} description="维护本BU成员、业务资格和项目授权，配置项目最终评审人员。" actions={<><UiSelect className="select" aria-label="管理BU" value={buId} onChange={e=>{setBuId(e.target.value);onSelectBu?.(e.target.value);setEdit(null);setError('');}}>{bus.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</UiSelect></>} />
 <Card className="admin-management-card" title="BU人员范围" extra={<UiButton className="btn btn-primary" onClick={()=>open(null)}><Plus size={15}/>添加成员</UiButton>}><QueryFilter className="rfq-query-form" layout="vertical" defaultCollapsed={false}
 initialValues={{query:'',filter:'all'}} onFinish={async values=>{setQuery(values.query||'');setFilter(values.filter||'all');return true;}}
 onReset={()=>{setQuery('');setFilter('all');}}>
 <ProFormText name="query" label="关键词" placeholder="搜索姓名或账号" fieldProps={{'aria-label':'搜索BU人员',allowClear:true}}/>
 <ProFormSelect name="filter" label="人员范围" fieldProps={{'aria-label':'人员筛选'}} options={[["all","全部人员"],["enabled","启用人员"],["SR","SR"],["技术","技术"],["confirm","可确认"],["review","可最终评审"]].map(([value,label])=>({value,label}))}/>
 </QueryFilter><Table rowKey="userId" dataSource={rows} scroll={{x:1000}} pagination={{current:memberPage,pageSize:10,onChange:setMemberPage,showSizeChanger:false,showTotal:total=>`共 ${total} 位成员`}} locale={{emptyText:'暂无符合条件的成员'}} columns={[
 {title:'姓名 / 账号',key:'name',width:180,render:(_,m)=><div className="admin-member-name"><Typography.Text strong>{personName(state,m.userId)}</Typography.Text><small>{m.userId}</small></div>},
 {title:'业务角色',key:'roles',width:150,render:(_,m)=><Space size={[4,4]} wrap>{m.roles.length?m.roles.map(role=><Tag key={role} color={role==='SR'?'blue':'purple'}>{role}</Tag>):<Tag>BU管理</Tag>}</Space>},
 {title:'确认资格',key:'confirm',width:120,render:(_,m)=><Tag color={m.canConfirm?'success':'default'}>{m.canConfirm?'允许':'未授权'}</Tag>},
 {title:'最终评审资格',key:'review',width:140,render:(_,m)=><Tag color={m.canFinalReview?'success':'default'}>{m.canFinalReview?'允许':'未授权'}</Tag>},
 {title:'授权项目',key:'projects',width:120,render:(_,m)=>canManageBu(state,m.userId,buId)?'全部 RFQ':projects.filter(p=>p.participantIds?.includes(m.userId)).length},
 {title:'状态',key:'status',width:110,render:(_,m)=><Tag color={m.enabled?'success':'default'}>{m.enabled?'启用':'已停用'}</Tag>},
 {title:'操作',key:'actions',width:120,fixed:'right',render:(_,m)=><UiButton className="text-link" onClick={()=>open(m)}>配置范围</UiButton>}
 ]}/></Card>
 {state.dataSource==='mysql'&&buId&&<MatchPolicyPanel key={`${actorId}:${buId}`} buId={buId}/>}
 <Card className="admin-management-card" title="最终评审配置"><UiSelect className="admin-project-select" aria-label="配置项目" value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">请选择项目</option>{projects.map(p=><option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}</UiSelect></Card>{project&&<ProjectPersonnelPanel key={project.id} appState={state} project={project} actorId={actorId} onPersonnelAction={onPersonnelAction} onConfigureFinalReview={onConfigureFinalReview}/>}
 {edit&&<Modal title="配置BU人员与项目范围" onClose={()=>setEdit(null)} footer={<><UiButton className="btn" onClick={()=>setEdit(null)}>取消</UiButton><UiButton className="btn btn-primary" onClick={save}>保存人员范围</UiButton></>}><div className="form-grid"><Field label="目录账号"><PersonPicker label="目录账号" disabled={members.some(m=>m.userId===edit.userId)} people={Object.values(state.accountsById).filter(a=>!a.systemAdmin&&a.enabled)} value={edit.userId} resolveName={id=>personName(state,id)} onChange={userId=>setEdit({...edit,userId})}/></Field><Field label="业务角色"><div className="personnel-checks">{['SR','技术'].map(role=><label key={role}><UiCheckbox type="checkbox" checked={edit.roles.includes(role)} onChange={()=>setEdit({...edit,roles:flip(edit.roles,role)})}/>{role}</label>)}</div></Field></div><div className="personnel-checks">{[['enabled','启用业务资格'],['canConfirm','允许条款确认'],['canFinalReview','允许最终评审']].map(([key,label])=><label key={key}><UiCheckbox type="checkbox" checked={!!edit[key]} disabled={key==='canFinalReview'&&!edit.canConfirm} onChange={e=>setEdit({...edit,[key]:e.target.checked,...(key==='canConfirm'&&!e.target.checked?{canFinalReview:false}:{})})}/>{label}</label>)}</div>{state.accountsById[edit.userId]?.managedBuIds?.includes(buId)&&<Field label="资料发布资格"><div className="personnel-checks">{[['knowledge-publish','知识审核发布'],['capability-publish','机型能力审核发布']].map(([id,label])=><label key={id}><UiCheckbox type="checkbox" checked={edit.resourceQualifications.includes(id)} onChange={()=>setEdit({...edit,resourceQualifications:flip(edit.resourceQualifications,id)})}/>{label}</label>)}</div></Field>}<Field label="可参与项目"><div className="personnel-checks">{projects.map(p=><label key={p.id}><UiCheckbox type="checkbox" checked={edit.projectIds.includes(p.id)} onChange={()=>setEdit({...edit,projectIds:flip(edit.projectIds,p.id)})}/>{p.id} · {p.name}</label>)}</div></Field><p className="muted">范围变更后，失去资格的未完成任务将停止并提示重新分派；历史记录保留。</p><Field label="变更原因"><UiTextArea className="input" aria-label="人员变更原因" value={reason} onChange={e=>setReason(e.target.value)}/></Field><ErrorBox error={error}/></Modal>}
 </div>;
}


export { default as PlatformAdminPage } from './PlatformAdminPage';
