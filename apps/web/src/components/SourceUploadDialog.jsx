import {uploadRfqSource} from '../rfqSourceClient';
import { UiButton } from './AntContent';
import React,{useEffect,useRef,useState} from 'react';
import { Alert, Input, Steps, Upload as AntUpload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { uploadMetadata } from '../antdAdapters';

import {Modal,StatusBadge} from './ui';
import {supportsCraft,uploadCraftFile} from '../craftClient';

function Field({label,children,required=false,wide=false}){return <label className={`field ${wide?'flow-field-wide':''}`}><span>{required&&<i className="flow-required">*</i>}{label}</span>{children}</label>;}

export default function SourceUploadDialog({project,files=[],onSubmit,onClose}){
 const [selected,setSelected]=useState([]),[version,setVersion]=useState('V1.0'),[reason,setReason]=useState(''),[error,setError]=useState(''),[fileList,setFileList]=useState([]);
 const duplicates=selected.some(file=>files.some(old=>old.name===file.name));
 const [busy,setBusy]=useState(false);const abort=useRef(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
 async function submit(){
  if(busy)return;
  if(!selected.length)return setError('请选择至少一个文件');
  if(selected.some(file=>!/\.(docx|pdf)$/i.test(file.name)))return setError('仅支持 DOCX、PDF；DOC 请先另存为 DOCX');
  if(!/^V[1-9]\d*\.(0|[1-9]\d*)$/.test(version.trim()))return setError('请使用规范版本号，例如 V1.0、V1.1、V2.0');
  if(selected.some(file=>files.some(old=>old.name===file.name&&old.version===version.trim())))return setError('同名文件已存在此版本，请填写新版本');
  if(duplicates&&!reason.trim())return setError('存在同名文件，请填写替换原因；旧版本将继续保留。');
  const incoming=selected.map(file=>({id:`FILE-${crypto.randomUUID()}`,name:file.name,size:file.size,mime:file.type,lastModified:file.lastModified,purpose:'要求来源',version:version.trim(),visibility:'项目成员可见',reason:reason.trim(),previousVersionId:[...files].reverse().find(old=>old.name===file.name)?.id,status:'排队中',createdAt:new Date().toLocaleString('zh-CN',{hour12:false})}));
  setBusy(true);setError('');abort.current=new AbortController();
  try{
   for(let index=0;index<incoming.length;index++){
    const original=fileList[index]?.originFileObj||fileList[index];
    incoming[index]=await uploadRfqSource(project.id,original,incoming[index],undefined,project);
    if(supportsCraft(incoming[index].name))incoming[index].craft=await uploadCraftFile(original,{projectId:project.id,fileId:incoming[index].id,sourceVersion:incoming[index].version},{signal:abort.current.signal});
   }
   if(alive.current)onSubmit(incoming);
  }catch(cause){if(alive.current&&cause.name!=='AbortError')setError(cause.message);}finally{if(alive.current)setBusy(false);}
 }
 return <Modal title="上传并智能解析" onClose={()=>{if(!busy)onClose();}} footer={<><UiButton className="btn" disabled={busy} onClick={onClose}>取消</UiButton><UiButton className="btn btn-primary" disabled={busy} onClick={submit}>{busy?'正在上传原文件…':'上传并开始解析'}</UiButton></>}>
  <Steps size="small" current={0} style={{marginBottom:20}} items={['选择文件','条款解析','应答项对比','查看结果'].map(title=>({title}))}/>
  <div className="form-grid"><Field label="文件版本" required wide><Input aria-label="文件版本" value={version} placeholder="例如 V1.0" onChange={e=>setVersion(e.target.value)}/><span className="muted">首次上传 V1.0，小幅修订 V1.1，重大修订 V2.0。本批文件使用同一版本；同名文件不能重复版本，旧版继续保留。</span></Field></div>
  <AntUpload.Dragger className="rfq-upload" multiple accept=".docx,.pdf"
    beforeUpload={()=>false} fileList={fileList} disabled={busy}
    onChange={({fileList:next})=>{setFileList(next);setSelected(uploadMetadata(next));setError('');}}
    itemRender={(node,file)=><div>{node}{files.some(old=>old.name===file.name)&&<StatusBadge status="同名文件 · 新版本"/>}</div>}
  ><p className="ant-upload-drag-icon"><InboxOutlined/></p><p className="ant-upload-text">拖拽文件到这里，或点击选择</p><p className="ant-upload-hint">支持 DOCX、PDF · DOC 请先另存为 DOCX</p></AntUpload.Dragger>
  {duplicates&&<Field label="替换原因（保留原版本）" required wide><Input.TextArea aria-label="替换原因" value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
  {error&&<Alert className="rfq-form-error" type="error" showIcon message={error}/>}
 </Modal>;
}
