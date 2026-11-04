import { UiButton } from './AntContent';
import React,{useEffect,useRef,useState} from 'react';
import { Alert, Input, Select, Steps, Upload as AntUpload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { uploadMetadata } from '../antdAdapters';
import {ShieldCheck} from "./icons";
import {Modal,StatusBadge} from './ui';
import {supportsCraft,uploadCraftFile} from '../craftClient';

function Field({label,children,required=false,wide=false}){return <label className={`field ${wide?'flow-field-wide':''}`}><span>{required&&<i className="flow-required">*</i>}{label}</span>{children}</label>;}

export default function SourceUploadDialog({project,files=[],onSubmit,onClose}){
 const [selected,setSelected]=useState([]),[purpose,setPurpose]=useState('要求来源'),[version,setVersion]=useState('V1.0'),[visibility,setVisibility]=useState('项目成员可见'),[reason,setReason]=useState(''),[error,setError]=useState(''),[fileList,setFileList]=useState([]);
 const duplicates=selected.some(file=>files.some(old=>old.name===file.name));
 const [busy,setBusy]=useState(false);const abort=useRef(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
 async function submit(){
  if(busy)return;
  if(!selected.length)return setError('请选择至少一个文件');
  if(!version.trim())return setError('请填写文件版本');
  if(duplicates&&!reason.trim())return setError('存在同名文件，请填写替换原因；旧版本将继续保留。');
  const incoming=selected.map(file=>({id:`FILE-${crypto.randomUUID()}`,name:file.name,size:file.size,mime:file.type,lastModified:file.lastModified,purpose,version:version.trim(),visibility,reason:reason.trim(),previousVersionId:[...files].reverse().find(old=>old.name===file.name)?.id,status:'排队中',createdAt:new Date().toLocaleString('zh-CN',{hour12:false})}));
  setBusy(true);setError('');abort.current=new AbortController();
  try{
   for(let index=0;index<incoming.length;index++){
    const original=fileList[index]?.originFileObj||fileList[index];
    if(supportsCraft(incoming[index].name))incoming[index].craft=await uploadCraftFile(original,{projectId:project.id,fileId:incoming[index].id,sourceVersion:incoming[index].version},{signal:abort.current.signal});
   }
   if(alive.current)onSubmit(incoming);
  }catch(cause){if(alive.current&&cause.name!=='AbortError')setError(cause.message);}finally{if(alive.current)setBusy(false);}
 }
 return <Modal title="上传并智能解析" onClose={()=>{if(!busy)onClose();}} footer={<><UiButton className="btn" disabled={busy} onClick={onClose}>取消</UiButton><UiButton className="btn btn-primary" disabled={busy} onClick={submit}>{busy?'正在上传原文件…':'上传并开始解析'}</UiButton></>}>
  <Steps size="small" current={0} style={{marginBottom:20}} items={['选择文件','条款解析','应答项对比','查看结果'].map(title=>({title}))}/>
  <div className="dw-mode-note"><ShieldCheck size={19}/><div><strong>上传原件 · 文档批阅 · 应答项处理</strong><p>DOCX / PDF 原文件保存到文档服务，可在详情左侧批阅。条款解析与应答对比仍使用模拟数据。</p></div></div>
  <div className="form-grid"><Field label="文件用途" required><Select aria-label="文件用途" value={purpose} onChange={setPurpose} options={['要求来源','补充附件','应答模板'].map(value=>({value,label:value}))}/></Field><Field label="文件版本" required><Input aria-label="文件版本" value={version} onChange={e=>setVersion(e.target.value)}/></Field><Field label="可见范围"><Select aria-label="可见范围" value={visibility} onChange={setVisibility} options={['项目成员可见','项目负责人及专业人员'].map(value=>({value,label:value}))}/></Field><Field label="关联项目"><Input value={project.name} readOnly/></Field></div>
  <AntUpload.Dragger className="rfq-upload" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
    beforeUpload={()=>false} fileList={fileList} disabled={busy}
    onChange={({fileList:next})=>{setFileList(next);setSelected(uploadMetadata(next));setError('');}}
    itemRender={(node,file)=><div>{node}{files.some(old=>old.name===file.name)&&<StatusBadge status="同名文件 · 新版本"/>}</div>}
  ><p className="ant-upload-drag-icon"><InboxOutlined/></p><p className="ant-upload-text">拖拽文件到这里，或点击选择</p><p className="ant-upload-hint">DOC / DOCX · PDF / Excel / CSV / TXT · 选择后统一提交</p></AntUpload.Dragger>
  {duplicates&&<Field label="替换原因（保留原版本）" required wide><Input.TextArea aria-label="替换原因" value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
  {purpose!=='要求来源'&&<p className="muted">该用途仅登记资料，不触发要求解析。</p>}{error&&<Alert className="rfq-form-error" type="error" showIcon message={error}/>}
 </Modal>;
}
