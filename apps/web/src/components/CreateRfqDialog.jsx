import React,{useEffect,useState} from 'react';
import {Alert,Form,Select} from 'antd';
import {ModalForm,ProFormDatePicker,ProFormText} from '@ant-design/pro-components';
import dayjs from 'dayjs';
import {formDate} from '../antdAdapters';
import {readGenericCatalog,resolveGroupBinding,nodeEnabled,nodePath,catalogKey} from '../genericCatalog';
import {readRfqCatalog} from '../rfqProcessBinding';
import {canPerform} from '../permissions';
import {getPersonnelContext,getProjectOwnerCandidates,getEligiblePersonnel,personName} from '../personnelDomain';
import {createProjectPersonnel} from '../projectDomain';
import PersonPicker from './PersonPicker';
import './create-rfq-dialog.css';
const empty={name:'',customer:'',owner:'',ownerId:'',deadline:'',groupId:'',technicalMode:'all',srId:'',technicalIds:[],technicalRepresentativeId:''};
export default function CreateRfqDialog({appState,onClose,onCreateProject}){
 const buId=appState.activeBuId||appState.businessUnits?.find(b=>getPersonnelContext(appState,appState.actorId,b.id).enabled)?.id;
 const context={state:appState,actorId:appState.actorId,buId};
 const readGroups=()=>readGenericCatalog(localStorage,buId,readRfqCatalog(localStorage,context));
 const [groups,setGroups]=useState(()=>{try{return readGroups();}catch(error){return {nodes:[],schema:{levels:[]},error:error.message};}});
 const [form,setForm]=useState(empty),[error,setError]=useState('');const [formApi]=Form.useForm();
 const srCandidates=getEligiblePersonnel(appState,{buId,duty:'final-review',side:'sr'}).filter(p=>!form.technicalIds.includes(p.userId));
 const technicalCandidates=getEligiblePersonnel(appState,{buId,duty:'final-review',side:'technical'}).filter(p=>p.userId!==form.srId);
 const enabledGroups=groups.nodes.filter(n=>nodeEnabled(groups,n.id));
 useEffect(()=>{formApi.setFieldsValue({...form,deadline:form.deadline?dayjs(form.deadline):undefined});},[form,formApi]);
 useEffect(()=>{const refresh=e=>{if(e.key&&e.key!==catalogKey(buId))return;try{setGroups(readGroups());}catch(cause){setError(cause.message);}};window.addEventListener('storage',refresh);return()=>window.removeEventListener('storage',refresh);},[buId]);
 function changeValues(changed,values){setForm(current=>{const next={...current,...values,deadline:formDate(values.deadline)};if('ownerId' in changed){next.ownerId=changed.ownerId||'';next.owner=next.ownerId?personName(appState,next.ownerId):'';if(!current.srId||current.srId===current.ownerId)next.srId=srCandidates.some(p=>p.userId===next.ownerId)?next.ownerId:'';}return next;});setError('');}
 function create(){
  try{
   if(!canPerform(appState.actorRole,'project:create',context))throw new Error('当前身份没有本BU的RFQ创建权限');
   if(!form.name.trim()||!form.ownerId||!form.deadline)throw new Error('请填写项目名称、负责人和截止时间');
   const latest=readGroups();setGroups(latest);resolveGroupBinding(latest,form.groupId,buId);
   createProjectPersonnel(appState,{...form,buId});if(onCreateProject(form)===false)return false;onClose();return true;
  }catch(cause){setError(cause.message);return false;}
 }
 return <ModalForm title="新建 RFQ 项目" open form={formApi} width={760} className="rfq-create-form" layout="vertical" onOpenChange={open=>{if(!open)onClose();}} onValuesChange={changeValues} onFinish={create} modalProps={{maskClosable:false,centered:true,styles:{body:{maxHeight:'calc(100dvh - 220px)',overflowY:'auto',paddingTop:12}}}} submitter={{searchConfig:{submitText:'创建并上传资料',resetText:'取消'},resetButtonProps:{onClick:onClose},submitButtonProps:{disabled:!enabledGroups.length}}}>
  <div className="rfq-create-grid"><ProFormText name="name" label="项目名称" placeholder="请输入项目名称" rules={[{required:true,whitespace:true,message:'请填写项目名称'}]}/><ProFormText name="customer" label="客户名称" placeholder="请输入客户名称"/><Form.Item name="ownerId" label="负责人" rules={[{required:true,message:'请选择本BU的负责人'}]}><PersonPicker label="负责人" people={getProjectOwnerCandidates(appState,{buId})} resolveName={id=>personName(appState,id)} emptyLabel="本BU暂无有效SR，请联系BU管理员添加"/></Form.Item><ProFormDatePicker name="deadline" label="客户截止日期" width="lg" fieldProps={{style:{width:'100%'},'aria-label':'客户截止日期'}} rules={[{required:true,message:'请选择客户截止日期'}]}/></div>
  <Form.Item name="groupId" label="关联分组" rules={[{required:true,message:'请选择当前BU的分组'}]}><Select aria-label="关联分组" showSearch optionFilterProp="label" placeholder="请选择分组" options={enabledGroups.map(n=>({value:n.id,label:nodePath(groups,n.id)}))}/></Form.Item>
  {!enabledGroups.length&&<Alert type="info" showIcon message="当前BU暂无启用分组，请联系BU管理员在知识库中配置分组。"/>}
  <div className="rfq-create-grid"><Form.Item name="srId" label="SR方最终评审人"><PersonPicker label="SR方最终评审人" people={srCandidates} resolveName={id=>personName(appState,id)} emptyLabel="本BU暂无具有最终评审资格的SR"/></Form.Item><Form.Item name="technicalIds" label="技术组评审成员"><PersonPicker label="技术组评审成员" multiple people={technicalCandidates} resolveName={id=>personName(appState,id)} emptyLabel="本BU暂无具有最终评审资格的技术人员"/></Form.Item></div>
  {(error||groups.error)&&<Alert className="rfq-form-error" type="error" showIcon message={error||groups.error}/>}
 </ModalForm>;
}
