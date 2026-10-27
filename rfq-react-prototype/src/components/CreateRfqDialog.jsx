import React,{useState} from 'react';
import {Plus} from 'lucide-react';
import {Modal} from './ui';
import {canPerform} from '../permissions';
import {getPersonnelContext} from '../personnelDomain';
import {readRfqCatalog,saveRfqCatalogRecord,resolveRfqProcessBinding} from '../rfqProcessBinding';
import './create-rfq-dialog.css';

const uid=prefix=>`${prefix}-${crypto.randomUUID()}`;
const empty={name:'',customer:'',equipment:'',owner:'',deadline:'',modelId:'',processId:''};
function Field({label,children,required=false}){return <label className="field"><span>{label}{required&&' *'}</span>{children}</label>;}

export default function CreateRfqDialog({appState,onClose,onCreateProject,onCatalogChange}){
 const buId=appState.activeBuId||appState.businessUnits?.find(b=>getPersonnelContext(appState,appState.actorId,b.id).enabled)?.id;
 const context={state:appState,actorId:appState.actorId,buId};
 const [catalog,setCatalog]=useState(()=>{try{return readRfqCatalog(localStorage,context);}catch(e){return {models:[],processes:[],error:e.message};}});
 const [form,setForm]=useState(empty),[error,setError]=useState(''),[modelDraft,setModelDraft]=useState(null),[processDraft,setProcessDraft]=useState(null),[modelError,setModelError]=useState(''),[processError,setProcessError]=useState('');
 const models=[...new Set(catalog.models.map(m=>m.id))].map(id=>catalog.models.filter(m=>m.id===id).sort((a,b)=>b.version-a.version)[0]);
 const processes=catalog.processes.filter(p=>p.modelId===form.modelId&&p.enabled!==false);
 const canCreate=canPerform(appState.actorRole,'catalog:create',context);
 const change=(key,value)=>{setForm(current=>({...current,[key]:value,...(key==='modelId'?{processId:''}:{})}));setError('');};
 function newModel(){if(!canCreate)return;setModelError('');setModelDraft({id:uid('MOD'),buId,code:'',name:'',revision:'R1',series:'',lifecycle:'研发',config:'',standard:'',options:'',source:'RFQ创建时补充'});}
 function newProcess(){if(!canCreate)return;setProcessError('');setProcessDraft({id:uid('PROC'),buId,modelId:form.modelId,code:'',name:'',conditions:'',enabled:true});}
 function saveModel(){
  try{
   const next=saveRfqCatalogRecord(localStorage,context,'model',modelDraft);setCatalog(next);
   setForm(current=>({...current,modelId:modelDraft.id,processId:'',equipment:current.equipment||`${modelDraft.name} ${modelDraft.revision} · ${modelDraft.config}`}));
   setProcessDraft(current=>current?{...current,modelId:modelDraft.id}:null);
   onCatalogChange?.('新建机型',modelDraft.name,`${buId} · RFQ创建时补充`);setModelDraft(null);setError('');
  }catch(e){setModelError(e.message);}
 }
 function saveProcess(){
  try{
   const next=saveRfqCatalogRecord(localStorage,context,'process',processDraft);setCatalog(next);
   setForm(current=>({...current,modelId:processDraft.modelId,processId:processDraft.id}));
   onCatalogChange?.('新建工艺',processDraft.name,`${buId} · ${processDraft.modelId} · RFQ创建时补充`);setProcessDraft(null);setError('');
  }catch(e){setProcessError(e.message);}
 }
 function create(){
  if(!canPerform(appState.actorRole,'project:create',context))return setError('当前身份没有本BU的RFQ创建权限');
  if(!form.name.trim()||!form.equipment.trim()||!form.owner.trim()||!form.deadline)return setError('请填写项目名称、设备范围、负责人和截止时间');
  if(!form.processId){newProcess();return;}
  try{
   const latest=readRfqCatalog(localStorage,context);setCatalog(latest);
   resolveRfqProcessBinding({...latest,modelId:form.modelId,processId:form.processId,buId});
   if(onCreateProject(form)!==false)onClose();
  }catch(e){setError(e.message);}
 }
 return <>
  <Modal title="新建 RFQ 项目" onClose={onClose} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn btn-primary" onClick={create}>创建并上传资料</button></>}>
   <div className="form-grid">{Object.entries({name:'项目名称',customer:'客户名称',equipment:'设备范围',owner:'负责人',deadline:'客户截止日期'}).map(([key,label])=><Field key={key} label={label} required={key!=='customer'}><input className="input" type={key==='deadline'?'date':'text'} value={form[key]} onChange={e=>change(key,e.target.value)}/></Field>)}</div>
   <div className="rfq-process-fields">
    <div className="rfq-catalog-heading"><strong>关联机型与工艺</strong><span>{appState.businessUnits?.find(b=>b.id===buId)?.name||buId}</span></div>
    <div className="rfq-catalog-field"><Field label="关联机型" required><select className="select" aria-label="关联机型" value={form.modelId} onChange={e=>change('modelId',e.target.value)}><option value="">请选择机型及硬件版本</option>{models.map(m=><option key={m.id} value={m.id}>{m.name} {m.revision} · {m.code}</option>)}</select></Field><button className="btn btn-sm" disabled={!canCreate} onClick={newModel}><Plus size={14}/>新建机型</button></div>
    <div className="rfq-catalog-field"><Field label="关联工艺" required><select className="select" aria-label="关联工艺" disabled={!form.modelId} value={form.processId} onChange={e=>change('processId',e.target.value)}><option value="">{form.modelId?'请选择该机型下的启用工艺':'请先选择机型'}</option>{processes.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></Field><button className="btn btn-sm" disabled={!canCreate} onClick={newProcess}><Plus size={14}/>新建工艺</button></div>
   </div>
   {(error||catalog.error)&&<p className="flow-error-inline" role="alert">{error||catalog.error}</p>}
  </Modal>
  {processDraft&&<Modal title="新建工艺" onClose={()=>setProcessDraft(null)} footer={<><button className="btn" onClick={()=>setProcessDraft(null)}>取消</button><button className="btn btn-primary" onClick={saveProcess}>保存并选用工艺</button></>}>
   <p className="rfq-create-hint">请选择工艺所属机型，保存后自动关联当前RFQ。</p>
   <div className="rfq-catalog-field"><Field label="工艺所属机型" required><select className="select" aria-label="工艺所属机型" value={processDraft.modelId} onChange={e=>setProcessDraft({...processDraft,modelId:e.target.value})}><option value="">请选择机型及硬件版本</option>{models.map(m=><option key={m.id} value={m.id}>{m.name} {m.revision} · {m.code}</option>)}</select></Field><button className="btn btn-sm" disabled={!canCreate} onClick={newModel}><Plus size={14}/>新建机型</button></div>
   <div className="form-grid">{Object.entries({code:'工艺编码',name:'工艺名称',conditions:'适用条件 / 工艺说明'}).map(([key,label])=><Field key={key} label={label} required={key!=='conditions'}><input className="input" value={processDraft[key]} onChange={e=>setProcessDraft({...processDraft,[key]:e.target.value})}/></Field>)}</div>
   {processError&&<p className="flow-error-inline" role="alert">{processError}</p>}
  </Modal>}
  {modelDraft&&<Modal title="新建机型" onClose={()=>setModelDraft(null)} footer={<><button className="btn" onClick={()=>setModelDraft(null)}>取消</button><button className="btn btn-primary" onClick={saveModel}>保存并选用机型</button></>}>
   <div className="form-grid">{Object.entries({code:'机型编码',name:'机型名称',revision:'硬件版本',series:'产品系列',config:'配置定义',standard:'标准配置',options:'可选配置'}).map(([key,label])=><Field key={key} label={label} required={['code','name','revision','config'].includes(key)}><input className="input" value={modelDraft[key]} onChange={e=>setModelDraft({...modelDraft,[key]:e.target.value})}/></Field>)}</div>
   {modelError&&<p className="flow-error-inline" role="alert">{modelError}</p>}
  </Modal>}
 </>;
}
