import {getResponseReview,getReviewActorIds} from '../confirmationPolicy';
import React,{useState,useEffect} from 'react';
import {Plus,Users} from 'lucide-react';
import {Modal,EmptyState} from '../components/ui';
import {personName,canManageBu,getPersonnelContext,getEligiblePersonnel,updateBuMember,getProjectReviewSettings,updateProjectAccess,configureProjectFinalReviewers,assignProjectDuty,updatePlatformDirectory,selectPlatformDirectoryAccounts} from '../personnelDomain';
import './management-pages.css';
import PersonPicker from '../components/PersonPicker';

const Field=({label,children})=><div className="field"><span>{label}</span>{children}</div>;
const ErrorBox=({error})=>error?<p className="error-notice" role="alert">{error}</p>:null;
const flip=(list,id)=>list.includes(id)?list.filter(x=>x!==id):[...list,id];

export function ProjectPersonnelPanel({appState,project,requirements=[],actorId,onPersonnelAction}){
 const state=appState,current=project.approvalConfig?.finalReviewers||{},mode=getProjectReviewSettings(state,project.id)?.technicalMode;
 const [form,setForm]=useState(()=>({srId:current.srId||'',technicalIds:current.technicalIds||[],technicalRepresentativeId:current.technicalRepresentativeId||'',technicalMode:mode||'all'}));
 const [reason,setReason]=useState(''),[error,setError]=useState('');
 useEffect(()=>{setForm({srId:current.srId||'',technicalIds:current.technicalIds||[],technicalRepresentativeId:current.technicalRepresentativeId||'',technicalMode:mode||'all'});},[JSON.stringify(current),mode]);
 const managed=canManageBu(state,actorId,project.buId),canEdit=managed||project.ownerId===actorId&&getPersonnelContext(state,actorId,project.buId).member?.roles.includes('SR');
 const candidates=side=>getEligiblePersonnel(state,{buId:project.buId,projectId:project.id,duty:'final-review',side});
 const confirmers=getEligiblePersonnel(state,{buId:project.buId,projectId:project.id,duty:'confirm'});
 const save=()=>{try{if(!canEdit)throw new Error('无项目分派权限');if(onPersonnelAction(s=>configureProjectFinalReviewers(s,{actorId,projectId:project.id,...form,technicalRepresentativeId:form.technicalRepresentativeId||null,reason}))!==false){setError('');setReason('');}}catch(e){setError(e.message);}};
 return <section className="panel personnel-panel"><div className="panel-header"><h2><Users size={17}/> 评审规则与人员</h2><span className="badge">{form.technicalMode==='representative'?'技术负责人代表通过':'技术组全员通过'}</span></div><div className="panel-body"><p className="muted">SR和技术组都通过后，才能正式导出。</p><div className="form-grid"><Field label="评审类型"><select className="select" aria-label="技术组最终评审规则" disabled={!canEdit} value={form.technicalMode} onChange={e=>setForm({...form,technicalMode:e.target.value})}><option value="all">所有指定技术成员均通过</option><option value="representative">指定技术负责人代表通过</option></select></Field><Field label="SR方最终评审人"><PersonPicker label="SR方最终评审人" disabled={!canEdit} people={candidates('sr')} value={form.srId} resolveName={id=>personName(state,id)} onChange={srId=>setForm({...form,srId})}/></Field><Field label="技术组评审成员"><PersonPicker label="技术组评审成员" multiple disabled={!canEdit} people={candidates('technical')} value={form.technicalIds} resolveName={id=>personName(state,id)} onChange={technicalIds=>setForm({...form,technicalIds,technicalRepresentativeId:technicalIds.includes(form.technicalRepresentativeId)?form.technicalRepresentativeId:''})} emptyLabel="暂无有项目授权的技术候选，请由BU管理员授权"/></Field>{form.technicalMode==='representative'&&<Field label="技术负责人"><PersonPicker label="技术负责人" disabled={!canEdit} people={candidates('technical').filter(m=>form.technicalIds.includes(m.userId))} value={form.technicalRepresentativeId} resolveName={id=>personName(state,id)} onChange={technicalRepresentativeId=>setForm({...form,technicalRepresentativeId})} emptyLabel="请先选择技术组评审成员"/></Field>}</div>{canEdit&&<><Field label="人员配置变更原因"><input className="input" aria-label="人员配置变更原因" value={reason} onChange={e=>setReason(e.target.value)} placeholder="说明技术分工或评审组调整原因"/></Field><ErrorBox error={error}/><button className="btn btn-primary" onClick={save}>保存最终评审配置</button></>}
 {requirements.length>0&&<><h3>条款确认分工</h3><p className="muted">默认由项目SR确认。可直接指派其他人员；发起评审后由所选评审人共同确认。</p><div className="table-wrap"><table className="data-table"><thead><tr><th>条款</th><th>确认责任人</th></tr></thead><tbody>{requirements.map(row=><tr key={row.id}><td>{row.clause} {row.title}</td><td><PersonPicker label={`确认人 ${row.id}`} disabled={!canEdit||!!getResponseReview(state,project.id,row.id)} people={confirmers} value={state.implicitConfirmationIdsByProject?.[project.id]?.includes(row.id)&&row.confirmationAssignmentSource!=='explicit'?'':row.confirmationAssigneeId||''} resolveName={id=>personName(state,id)} placeholder={`默认 SR · ${personName(state,project.ownerId)}；输入 @ 选人`} clearLabel="恢复默认 SR" onChange={userId=>{try{onPersonnelAction(s=>assignProjectDuty(s,{actorId,projectId:project.id,userId,duty:'confirm',requirementId:row.id,reason:reason.trim()||'调整条款确认分工'}));setError('');}catch(err){setError(err.message);}}}/>{state.confirmationMigrationNotesByProject?.[project.id]?.[row.id]&&row.confirmationAssignmentSource!=='explicit'&&<small>{state.confirmationMigrationNotesByProject[project.id][row.id]}</small>}{getResponseReview(state,project.id,row.id)&&<small>评审人：{getReviewActorIds(getResponseReview(state,project.id,row.id)).map(id=>personName(state,id)).join('、')}；请在评审中调整。</small>}</td></tr>)}</tbody></table></div></>}


 </div></section>;
}

export default function BuAdminPage({appState:state,actorId,onPersonnelAction,onSelectBu,route}){
 const bus=state.businessUnits.filter(b=>canManageBu(state,actorId,b.id));
 const [buId,setBuId]=useState(bus.some(b=>b.id===state.activeBuId)?state.activeBuId:bus[0]?.id||''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[edit,setEdit]=useState(null),[reason,setReason]=useState(''),[error,setError]=useState(''),[projectId,setProjectId]=useState('');
 useEffect(()=>{setProjectId(state.projects.some(p=>p.id===route?.projectId&&p.buId===buId)?route.projectId:'');},[buId,route?.projectId]);
 const members=state.buPersonnelByBuId[buId]||[],projects=state.projects.filter(p=>p.buId===buId),project=projects.find(p=>p.id===projectId);
 const open=m=>{setEdit(m?{...m,projectIds:projects.filter(p=>p.participantIds?.includes(m.userId)).map(p=>p.id)}:{userId:'',roles:['技术'],enabled:true,canConfirm:true,canFinalReview:true,resourceQualifications:[],projectIds:[]});setReason('');setError('');};
 const run=fn=>{try{if(onPersonnelAction(fn)!==false){setError('');return true;}}catch(e){setError(e.message);}return false;};
 const save=()=>{const {userId,projectIds,...patch}=edit;if(run(s=>{let next=updateBuMember(s,{actorId,buId,userId,patch,reason});if(patch.enabled&&patch.roles.length)for(const p of projects)next=updateProjectAccess(next,{actorId,projectId:p.id,userId,enabled:projectIds.includes(p.id),reason});return next;}))setEdit(null);};
 const rows=members.filter(m=>`${personName(state,m.userId)} ${m.userId}`.toLowerCase().includes(query.toLowerCase())&&(filter==='all'||filter==='enabled'&&m.enabled||filter==='confirm'&&m.canConfirm||filter==='review'&&m.canFinalReview||m.roles.includes(filter)));
 if(!bus.length)return <div className="panel panel-body">当前账号没有可管理的BU。</div>;
 return <div className="management-page bu-admin-page"><div className="page-heading"><div><h1>BU管理</h1></div><select className="select" aria-label="管理BU" value={buId} onChange={e=>{setBuId(e.target.value);onSelectBu?.(e.target.value);setEdit(null);setError('');}}>{bus.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
 <section className="panel"><div className="panel-header"><h2>BU人员范围</h2><button className="btn btn-primary" onClick={()=>open(null)}><Plus size={15}/>添加成员</button></div><div className="toolbar"><input className="input" aria-label="搜索BU人员" placeholder="搜索姓名或账号" value={query} onChange={e=>setQuery(e.target.value)}/><select className="select" aria-label="人员筛选" value={filter} onChange={e=>setFilter(e.target.value)}>{[['all','全部人员'],['enabled','启用人员'],['SR','SR'],['技术','技术'],['confirm','可确认'],['review','可最终评审']].map(([k,t])=><option key={k} value={k}>{t}</option>)}</select></div><div className="table-wrap"><table className="data-table mg-table"><thead><tr><th>姓名／账号</th><th>业务角色</th><th>确认资格</th><th>最终评审资格</th><th>授权项目</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.map(m=><tr key={m.userId}><td>{personName(state,m.userId)}<small>{m.userId}</small></td><td>{m.roles.join('／')||'BU管理'}</td><td>{m.canConfirm?'允许':'未授权'}</td><td>{m.canFinalReview?'允许':'未授权'}</td><td>{projects.filter(p=>p.participantIds?.includes(m.userId)).length}</td><td>{m.enabled?'启用':'已停用'}</td><td><button className="text-link" onClick={()=>open(m)}>配置范围</button></td></tr>)}</tbody></table></div></section>
 <section className="panel panel-body"><h2>最终评审配置</h2><select className="select" aria-label="配置项目" value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">请选择项目</option>{projects.map(p=><option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}</select><p className="muted">成员的项目访问权在“配置范围”中维护；加入BU不自动获得所有项目权限。</p></section>{project&&<ProjectPersonnelPanel key={project.id} appState={state} project={project} actorId={actorId} onPersonnelAction={onPersonnelAction}/>}
 {edit&&<Modal title="配置BU人员与项目范围" onClose={()=>setEdit(null)} footer={<><button className="btn" onClick={()=>setEdit(null)}>取消</button><button className="btn btn-primary" onClick={save}>保存人员范围</button></>}><div className="form-grid"><Field label="目录账号"><PersonPicker label="目录账号" disabled={members.some(m=>m.userId===edit.userId)} people={Object.values(state.accountsById).filter(a=>!a.systemAdmin&&a.enabled)} value={edit.userId} resolveName={id=>personName(state,id)} onChange={userId=>setEdit({...edit,userId})}/></Field><Field label="业务角色"><div className="personnel-checks">{['SR','技术'].map(role=><label key={role}><input type="checkbox" checked={edit.roles.includes(role)} onChange={()=>setEdit({...edit,roles:flip(edit.roles,role)})}/>{role}</label>)}</div></Field></div><div className="personnel-checks">{[['enabled','启用业务资格'],['canConfirm','允许条款确认'],['canFinalReview','允许最终评审']].map(([key,label])=><label key={key}><input type="checkbox" checked={!!edit[key]} disabled={key==='canFinalReview'&&!edit.canConfirm} onChange={e=>setEdit({...edit,[key]:e.target.checked,...(key==='canConfirm'&&!e.target.checked?{canFinalReview:false}:{})})}/>{label}</label>)}</div>{state.accountsById[edit.userId]?.managedBuIds?.includes(buId)&&<Field label="资料发布资格"><div className="personnel-checks">{[['knowledge-publish','知识审核发布'],['capability-publish','机型能力审核发布']].map(([id,label])=><label key={id}><input type="checkbox" checked={edit.resourceQualifications.includes(id)} onChange={()=>setEdit({...edit,resourceQualifications:flip(edit.resourceQualifications,id)})}/>{label}</label>)}</div></Field>}<Field label="可参与项目"><div className="personnel-checks">{projects.map(p=><label key={p.id}><input type="checkbox" checked={edit.projectIds.includes(p.id)} onChange={()=>setEdit({...edit,projectIds:flip(edit.projectIds,p.id)})}/>{p.id} · {p.name}</label>)}</div></Field><p className="muted">范围变更后，失去资格的未完成任务将停止并提示重新分派；历史记录保留。</p><Field label="变更原因"><textarea className="input" aria-label="人员变更原因" value={reason} onChange={e=>setReason(e.target.value)}/></Field><ErrorBox error={error}/></Modal>}
 </div>;
}

export function PlatformAdminPage({appState:state,actorId,onPersonnelAction}){
 const [edit,setEdit]=useState(null),[kind,setKind]=useState('account'),[reason,setReason]=useState(''),[error,setError]=useState('');
 const [buId,setBuId]=useState(()=>state.businessUnits.some(b=>b.id===state.activeBuId)?state.activeBuId:'');
 const accounts=selectPlatformDirectoryAccounts(state),rows=accounts.filter(a=>!buId||a.buIds.includes(buId));
 const selectedBu=state.businessUnits.find(b=>b.id===buId),buName=id=>state.businessUnits.find(b=>b.id===id)?.name||id;
 const open=(type,record)=>{setKind(type);setEdit(record?structuredClone(record):{id:crypto.randomUUID(),name:'',enabled:true,managedBuIds:[]});setReason('');setError('');};
 const save=()=>{try{
  if(onPersonnelAction(s=>updatePlatformDirectory(s,{actorId,kind,record:edit,reason}))===false)return;
  if(kind==='bu')setBuId(edit.id);
  else if(!state.accountsById[edit.id]&&buId&&!edit.managedBuIds?.includes(buId))setBuId('');
  setEdit(null);
 }catch(e){setError(e.message);}};
 const toggleAccount=id=>{try{
  if(onPersonnelAction(s=>{const account=s.accountsById[id];if(!account)throw new Error('账号不存在，请刷新后重试');const enabled=!account.enabled;return updatePlatformDirectory(s,{actorId,kind:'account',record:{...account,enabled},reason:`${enabled?'启用':'停用'}账号：${account.name}`});})!==false)setError('');
 }catch(e){setError(e.message);}};
 return <div className="management-page platform-directory">
  <div className="page-heading"><div><h1>系统配置与运维</h1><p>平台账号与BU目录管理。项目业务权限由BU范围和项目授权共同控制。</p></div></div>
  <section className="panel">
   <div className="panel-header"><h2>BU组织</h2><button className="btn" onClick={()=>open('bu')}><Plus size={15}/>新增BU</button></div>
   <div className="panel-body platform-bu-body">
    <div className="platform-bu-options" role="group" aria-label="按BU筛选账号">
     <button className={`btn ${!buId?'is-selected':''}`} aria-pressed={!buId} aria-controls="platform-account-list" onClick={()=>setBuId('')}>全部账号<span>{accounts.length}</span></button>
     {state.businessUnits.map(b=><button className={`btn ${buId===b.id?'is-selected':''}`} aria-pressed={buId===b.id} aria-controls="platform-account-list" key={b.id} onClick={()=>setBuId(b.id)}>{b.name}<span>{accounts.filter(a=>a.buIds.includes(b.id)).length}</span></button>)}
    </div>
    <div className="platform-bu-summary"><span>选择BU，查看下方关联账号。</span>{selectedBu&&<button className="text-link" onClick={()=>open('bu',selectedBu)}>维护当前BU</button>}</div>
   </div>
  </section>
  <section className="panel" id="platform-account-list">
   <div className="panel-header"><div><h2>账号目录</h2><p className="platform-directory-scope" role="status">{selectedBu?selectedBu.name:'全部BU及平台账号'} · {rows.length} 个账号</p></div><button className="btn btn-primary" onClick={()=>open('account')}><Plus size={15}/>新增账号</button></div>
   <ErrorBox error={!edit&&error}/>
   {rows.length?<div className="table-wrap"><table className="data-table mg-table"><thead><tr><th>姓名／账号</th><th>所属BU</th><th>管理职责</th><th>状态</th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td>{a.name}<small>{a.id}</small></td><td>{a.buIds.map(buName).join('、')||(a.systemAdmin?'平台级':'未归属BU')}</td><td>{a.systemAdmin?'后台管理':a.managedBuIds?.length?`BU管理员 · ${a.managedBuIds.map(buName).join('、')}`:'业务账号'}</td><td><button type="button" className="platform-account-switch" role="switch" aria-label={`账号状态 ${a.name}`} aria-checked={!!a.enabled} disabled={a.id===actorId} title={a.id===actorId?'当前登录账号不能停用':`点击${a.enabled?'停用':'启用'}账号`} onClick={()=>toggleAccount(a.id)}><span className="platform-account-switch-track" aria-hidden="true"/><span>{a.enabled?'启用':'停用'}</span></button></td></tr>)}</tbody></table></div>:<EmptyState title="此BU暂无关联账号" description="新增账号时可指定BU管理职责；业务成员由对应BU管理员添加。"/>}
  </section>
  {edit&&<Modal title={kind==='bu'?'维护BU':'新增账号'} onClose={()=>setEdit(null)} footer={<><button className="btn" onClick={()=>setEdit(null)}>取消</button><button className="btn btn-primary" onClick={save}>保存目录配置</button></>}>
   <Field label="名称"><input className="input" aria-label="目录名称" value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></Field>
   {kind==='account'&&<><label className="workspace-check"><input type="checkbox" checked={edit.enabled} onChange={e=>setEdit({...edit,enabled:e.target.checked})}/>启用账号</label><Field label="BU管理职责"><div className="personnel-checks">{state.businessUnits.map(b=><label key={b.id}><input type="checkbox" checked={edit.managedBuIds?.includes(b.id)} onChange={()=>setEdit({...edit,managedBuIds:flip(edit.managedBuIds||[],b.id)})}/>{b.name}</label>)}</div></Field></>}
   <Field label="变更原因"><textarea className="input" aria-label="目录变更原因" value={reason} onChange={e=>setReason(e.target.value)}/></Field><ErrorBox error={error}/>
  </Modal>}
 </div>;
}
