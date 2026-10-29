import React,{useEffect,useState} from 'react';
import { Alert, Form } from 'antd';
import { ModalForm, ProFormDatePicker, ProFormRadio, ProFormText } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import {formDate} from '../antdAdapters';
import {Plus} from 'lucide-react';
import {Modal} from './ui';
import {canPerform} from '../permissions';
import {getPersonnelContext,getProjectOwnerCandidates,getEligiblePersonnel,personName} from '../personnelDomain';
import {createProjectPersonnel} from '../projectDomain';
import {readRfqCatalog,saveRfqCatalogRecord,resolveRfqProcessBinding} from '../rfqProcessBinding';
import {buildCapabilityTree} from '../capabilityTree';
import CapabilityTree from './CapabilityTree';
import PersonPicker from './PersonPicker';
import './create-rfq-dialog.css';

const uid=prefix=>`${prefix}-${crypto.randomUUID()}`;
const empty={name:'',customer:'',owner:'',ownerId:'',deadline:'',modelId:'',processId:'',technicalMode:'all',srId:'',technicalIds:[],technicalRepresentativeId:''};
function Field({label,children,required=false,as:Tag='label'}){return <Tag className="field"><span>{label}{required&&' *'}</span>{children}</Tag>;}

export default function CreateRfqDialog({appState,onClose,onCreateProject,onCatalogChange}){
 const buId=appState.activeBuId||appState.businessUnits?.find(b=>getPersonnelContext(appState,appState.actorId,b.id).enabled)?.id;
 const context={state:appState,actorId:appState.actorId,buId};
 const [catalog,setCatalog]=useState(()=>{try{return readRfqCatalog(localStorage,context);}catch(e){return {models:[],processes:[],error:e.message};}});
 const [form,setForm]=useState(empty),[error,setError]=useState(''),[modelDraft,setModelDraft]=useState(null),[processDraft,setProcessDraft]=useState(null),[modelError,setModelError]=useState(''),[processError,setProcessError]=useState('');
 const [formApi]=Form.useForm();
 useEffect(()=>{formApi.setFieldsValue({...form,deadline:form.deadline?dayjs(form.deadline):undefined});},[form,formApi]);
 function changeValues(changed,values){
  setForm(current=>{
   const next={...current,...values,deadline:formDate(values.deadline)};
   if('ownerId' in changed){next.ownerId=changed.ownerId||'';next.owner=next.ownerId?personName(appState,next.ownerId):'';if(!current.srId||current.srId===current.ownerId)next.srId=srCandidates.some(p=>p.userId===next.ownerId)?next.ownerId:'';}
   if('technicalMode' in changed)next.technicalRepresentativeId='';
   if('technicalIds' in changed&&!next.technicalIds?.includes(current.technicalRepresentativeId))next.technicalRepresentativeId='';
   return next;
  });setError('');
 }
 const models=[...new Set(catalog.models.map(m=>m.id))].map(id=>catalog.models.filter(m=>m.id===id).sort((a,b)=>b.version-a.version)[0]);
 const processes=catalog.processes.filter(p=>p.modelId===form.modelId&&p.enabled!==false);
 const buName=appState.businessUnits?.find(b=>b.id===buId)?.name||buId;
 const tree=buildCapabilityTree({buId,buName,models:catalog.models,processes:catalog.processes.filter(p=>p.enabled!==false)});
 const modelTree={...tree,children:tree.children.map(node=>({...node,children:[]}))};
 const selectedModel=models.find(m=>m.id===form.modelId),selectedProcess=processes.find(p=>p.id===form.processId);
 const processModel=models.find(m=>m.id===processDraft?.modelId);
 const selectedKey=form.processId?`process:${form.processId}`:form.modelId?`model:${form.modelId}`:'';
 const canCreate=canPerform(appState.actorRole,'catalog:create',context);
 const srCandidates=getEligiblePersonnel(appState,{buId,duty:'final-review',side:'sr'}).filter(p=>!form.technicalIds.includes(p.userId));
 const technicalCandidates=getEligiblePersonnel(appState,{buId,duty:'final-review',side:'technical'}).filter(p=>p.userId!==form.srId);
 const change=(key,value)=>{setForm(current=>({...current,[key]:value,...(key==='modelId'?{processId:''}:key==='technicalMode'?{technicalRepresentativeId:''}:{})}));setError('');};
 function changeOwner(ownerId){
  setForm(current=>({...current,ownerId,owner:ownerId?personName(appState,ownerId):'',...(!current.srId||current.srId===current.ownerId?{srId:srCandidates.some(p=>p.userId===ownerId)?ownerId:''}:{})}));setError('');
 }
 function selectProcessNode(node){setForm(current=>({...current,modelId:node.modelId||'',processId:node.kind==='process'?node.processId:''}));setError('');}
 function newModel(){if(!canCreate)return;setModelError('');setModelDraft({id:uid('MOD'),buId,code:'',name:'',revision:'R1',series:'',lifecycle:'研发',config:'',standard:'',options:'',source:'RFQ创建时补充'});}
 function newProcess(){if(!canCreate)return;setProcessError('');setProcessDraft({id:uid('PROC'),buId,modelId:form.modelId,code:'',name:'',conditions:'',enabled:true});}
 function saveModel(){
  try{
   const next=saveRfqCatalogRecord(localStorage,context,'model',modelDraft);setCatalog(next);
   setForm(current=>({...current,modelId:modelDraft.id,processId:''}));
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
  if(!form.name.trim()||!form.ownerId||!form.deadline)return setError('请填写项目名称、负责人和截止时间');
  try{
   createProjectPersonnel(appState,{...form,buId});
   if(!form.processId){if(canCreate)newProcess();else setError('请选择具体工艺，或联系BU管理员补充工艺目录');return false;}
   const latest=readRfqCatalog(localStorage,context);setCatalog(latest);
   resolveRfqProcessBinding({...latest,modelId:form.modelId,processId:form.processId,buId});
   if(onCreateProject(form)===false)return false;onClose();return true;
  }catch(e){setError(e.message);return false;}
 }
 return <>
  <ModalForm title="新建 RFQ 项目" open form={formApi} width={760} className="rfq-create-form"
   layout="vertical" onOpenChange={open=>{if(!open)onClose();}} onValuesChange={changeValues}
   onFinish={create} modalProps={{maskClosable:false,centered:true,styles:{body:{maxHeight:'calc(100dvh - 220px)',overflowY:'auto',paddingTop:12}}}} submitter={{searchConfig:{submitText:'创建并上传资料',resetText:'取消'},resetButtonProps:{onClick:onClose}}}>
   <div className="rfq-create-grid">
    <ProFormText name="name" label="项目名称" placeholder="请输入项目名称" rules={[{required:true,whitespace:true,message:'请填写项目名称'}]}/>
    <ProFormText name="customer" label="客户名称" placeholder="请输入客户名称"/>
    <Form.Item name="ownerId" label="负责人" rules={[{required:true,message:'请选择本BU的负责人'}]}><PersonPicker label="负责人" people={getProjectOwnerCandidates(appState,{buId})} resolveName={id=>personName(appState,id)} emptyLabel="本BU暂无有效SR，请联系BU管理员添加"/></Form.Item>
    <ProFormDatePicker name="deadline" label="客户截止日期" width="lg" fieldProps={{style:{width:'100%'},'aria-label':'客户截止日期'}} rules={[{required:true,message:'请选择客户截止日期'}]}/>
   </div>
   <ProFormRadio.Group name="technicalMode" label="最终评审规则" formItemProps={{htmlFor:null}} fieldProps={{'aria-label':'最终评审规则'}} options={[{value:'all',label:'所有指定技术成员均通过'},{value:'representative',label:'指定技术负责人代表通过'}]}/>
   <div className="rfq-create-grid">
    <Form.Item name="srId" label="SR方最终评审人"><PersonPicker label="SR方最终评审人" people={srCandidates} resolveName={id=>personName(appState,id)} emptyLabel="本BU暂无具有最终评审资格的SR"/></Form.Item>
    <Form.Item name="technicalIds" label="技术组评审成员"><PersonPicker label="技术组评审成员" multiple people={technicalCandidates} resolveName={id=>personName(appState,id)} emptyLabel="本BU暂无具有最终评审资格的技术人员"/></Form.Item>
    {form.technicalMode==='representative'&&<Form.Item name="technicalRepresentativeId" label="技术负责人"><PersonPicker label="技术负责人" people={technicalCandidates.filter(p=>form.technicalIds.includes(p.userId))} resolveName={id=>personName(appState,id)} emptyLabel="请先选择技术组评审成员"/></Form.Item>}
   </div>
   <div className="rfq-process-fields">
    <div className="rfq-catalog-heading"><strong>关联工艺 *</strong><div className="rfq-tree-actions"><button type="button" className="btn btn-sm" disabled={!canCreate} onClick={newModel}><Plus size={14}/>新建机型</button><button type="button" className="btn btn-sm" disabled={!canCreate} onClick={newProcess}><Plus size={14}/>新建工艺</button></div></div>
    <div className="rfq-catalog-tree"><CapabilityTree root={tree} selectedKey={selectedKey} onSelect={selectProcessNode} terminalKinds={['process']} ariaLabel="选择RFQ关联工艺" emptyLabels={{bu:'暂无机型，请先新建机型',model:'暂无启用工艺，可新建工艺'}} revealSelection/></div>
    {(selectedProcess||selectedModel)&&<div className="rfq-tree-selection" role="status" aria-label="已选工艺">{selectedProcess?<>已选工艺：<strong>{selectedModel?.name} {selectedModel?.revision} / {selectedProcess.code} · {selectedProcess.name}</strong></>:<>已选机型：{selectedModel.name} {selectedModel.revision} · 请继续选择具体工艺</>}</div>}
   </div>
   {(error||catalog.error)&&<Alert className="rfq-form-error" type="error" showIcon message={error||catalog.error}/>}
  </ModalForm>
  {processDraft&&<Modal title="新建工艺" onClose={()=>setProcessDraft(null)} footer={<><button className="btn" onClick={()=>setProcessDraft(null)}>取消</button><button className="btn btn-primary" onClick={saveProcess}>保存并选用工艺</button></>}>
   <p className="rfq-create-hint">请选择工艺所属机型，保存后自动关联当前RFQ。</p>
   <div className="rfq-catalog-heading"><strong>工艺所属机型 *</strong><button className="btn btn-sm" disabled={!canCreate} onClick={newModel}><Plus size={14}/>新建机型</button></div>
   <div className="rfq-catalog-tree rfq-model-tree"><CapabilityTree root={modelTree} selectedKey={processDraft.modelId?`model:${processDraft.modelId}`:''} onSelect={node=>setProcessDraft({...processDraft,modelId:node.kind==='model'?node.modelId:''})} terminalKinds={['model']} ariaLabel="选择工艺所属机型" emptyLabels={{bu:'暂无机型，请先新建机型'}} revealSelection/></div>
   <div className="rfq-tree-selection" role="status" aria-label="已选机型">{processModel?`${processModel.name} ${processModel.revision}`:'请选择工艺所属机型'}</div>
   <div className="form-grid">{Object.entries({code:'工艺编码',name:'工艺名称',conditions:'适用条件 / 工艺说明'}).map(([key,label])=><Field key={key} label={label} required={key!=='conditions'}><input className="input" value={processDraft[key]} onChange={e=>setProcessDraft({...processDraft,[key]:e.target.value})}/></Field>)}</div>
   {processError&&<p className="flow-error-inline" role="alert">{processError}</p>}
  </Modal>}
  {modelDraft&&<Modal title="新建机型" onClose={()=>setModelDraft(null)} footer={<><button className="btn" onClick={()=>setModelDraft(null)}>取消</button><button className="btn btn-primary" onClick={saveModel}>保存并选用机型</button></>}>
   <div className="form-grid">{Object.entries({code:'机型编码',name:'机型名称',revision:'硬件版本',series:'产品系列',config:'配置定义',standard:'标准配置',options:'可选配置'}).map(([key,label])=><Field key={key} label={label} required={['code','name','revision','config'].includes(key)}><input className="input" value={modelDraft[key]} onChange={e=>setModelDraft({...modelDraft,[key]:e.target.value})}/></Field>)}</div>
   {modelError&&<p className="flow-error-inline" role="alert">{modelError}</p>}
  </Modal>}
 </>;
}
