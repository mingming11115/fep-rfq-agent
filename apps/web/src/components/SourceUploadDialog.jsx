import {uploadRfqSource} from '../rfqSourceClient';
import { UiButton } from './AntContent';
import React,{useEffect,useRef,useState} from 'react';
import { Alert, Input, Steps, Upload as AntUpload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { uploadMetadata } from '../antdAdapters';

import {Modal,StatusBadge} from './ui';
import {supportsCraft,uploadCraftFile} from '../craftClient';

function Field({label,children,required=false,wide=false}){return <label className={`field ${wide?'flow-field-wide':''}`}><span>{required&&<i className="flow-required">*</i>}{label}</span>{children}</label>;}

export default function SourceUploadDialog(props){return <SourceUploadSession key={props.project.id} {...props}/>;}
function SourceUploadSession({project,files=[],onSubmit,onClose,open=true,afterClose}){
 const [selected,setSelected]=useState([]),[version,setVersion]=useState('V1.0'),[reason,setReason]=useState(''),[error,setError]=useState(''),[fileList,setFileList]=useState([]);
 const duplicates=selected.some(file=>files.some(old=>old.name===file.name));
 const [busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false),[stage,setStage]=useState(0),[phases,setPhases]=useState({});
 const abort=useRef(null),alive=useRef(true),running=useRef(false),uploaded=useRef(new Map());
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
 useEffect(()=>{if(!open)abort.current?.abort();},[open]);
 function status(uid,patch,phase){if(!alive.current)return;setFileList(old=>old.map(file=>file.uid===uid?{...file,...patch}:file));if(phase)setPhases(old=>({...old,[uid]:phase}));}
 function cancel(){abort.current?.abort();onClose();}
 async function submit(){
  if(running.current)return;
  if(!selected.length)return setError('请选择至少一个文件');
  if(selected.some(file=>!/\.(docx|pdf)$/i.test(file.name)))return setError('仅支持 DOCX、PDF；DOC 请先另存为 DOCX');
  if(!/^V[1-9]\d*\.(0|[1-9]\d*)$/.test(version.trim()))return setError('请使用规范版本号，例如 V1.0、V1.1、V2.0');
  if(selected.some(file=>files.some(old=>old.name===file.name&&old.version===version.trim())))return setError('同名文件已存在此版本，请填写新版本');
  if(duplicates&&!reason.trim())return setError('存在同名文件，请填写替换原因；旧版本将继续保留。');
  const incoming=[];
  running.current=true;setBusy(true);setStage(1);setSubmitted(false);setError('');abort.current=new AbortController();let activeUid,transferring=true;
  try{
   for(const item of fileList){
    activeUid=item.uid;const original=item.originFileObj||item,key=JSON.stringify([item.uid,version.trim(),reason.trim()]);
    let saved=uploaded.current.get(key);
    const progress=event=>status(item.uid,{status:'uploading',percent:event.percent});
    if(!saved){
     const file={id:`FILE-${crypto.randomUUID()}`,name:original.name,size:original.size,mime:original.type,lastModified:original.lastModified,purpose:'要求来源',version:version.trim(),visibility:'项目成员可见',reason:reason.trim(),previousVersionId:[...files].reverse().find(old=>old.name===original.name)?.id,status:'排队中',createdAt:new Date().toLocaleString('zh-CN',{hour12:false})};
     status(item.uid,{status:'uploading',percent:undefined},'上传原件');
     saved=await uploadRfqSource(project.id,original,file,undefined,project,{signal:abort.current.signal,onUploadProgress:progress});
     uploaded.current.set(key,saved);
    }
    if(abort.current.signal.aborted)throw new DOMException('请求已取消','AbortError');
    if(supportsCraft(saved.name)&&!saved.craft){
     status(item.uid,{status:'uploading',percent:undefined},'保存批阅副本');
     saved={...saved,craft:await uploadCraftFile(original,{projectId:project.id,fileId:saved.id,sourceVersion:saved.version},{signal:abort.current.signal,onUploadProgress:progress})};
     uploaded.current.set(key,saved);
    }
    incoming.push(saved);status(item.uid,{status:'done',percent:100},'上传完成');
   }
   if(alive.current&&!abort.current.signal.aborted){
    transferring=false;setStage(2);
    if(await onSubmit(incoming)===false)throw new Error('提交解析未完成，请重试');
    if(alive.current&&!abort.current.signal.aborted)setSubmitted(true);
   }
  }catch(cause){if(alive.current){setSubmitted(false);if(cause.name==='AbortError')status(activeUid,{status:undefined,percent:undefined},'已取消，可重新上传');else{if(transferring)status(activeUid,{status:'error'},'上传失败，可重试');setError(cause.message);}}}finally{running.current=false;if(alive.current)setBusy(false);}
 }
 return <Modal open={open} afterClose={afterClose} title="上传并智能解析" onClose={cancel} footer={<><UiButton className="btn" onClick={cancel}>{busy?'取消上传':'取消'}</UiButton><UiButton className="btn btn-primary" loading={busy} disabled={busy||submitted} onClick={submit}>{busy?stage===2?'正在提交解析…':'正在上传原文件…':error?stage===2?'重试提交':'重试上传':'上传并开始解析'}</UiButton></>}>
  <Steps size="small" current={stage} status={error?'error':'process'} style={{marginBottom:20}} items={['选择文件','上传原件','提交解析'].map(title=>({title}))}/>
  <div className="form-grid"><Field label="文件版本" required wide><Input disabled={busy||submitted} aria-label="文件版本" value={version} placeholder="例如 V1.0" onChange={e=>setVersion(e.target.value)}/><span className="muted">首次上传 V1.0，小幅修订 V1.1，重大修订 V2.0。本批文件使用同一版本；同名文件不能重复版本，旧版继续保留。</span></Field></div>
  <AntUpload.Dragger className="rfq-upload" multiple accept=".docx,.pdf"
    beforeUpload={()=>false} fileList={fileList} disabled={busy||submitted}
    showUploadList={{showRemoveIcon:!busy&&!submitted}}
    onChange={({fileList:next})=>{setFileList(next);setSelected(uploadMetadata(next));setError('');setSubmitted(false);setStage(0);}}
    itemRender={(node,file)=><div>{node}{phases[file.uid]&&<small role="status">{phases[file.uid]}{file.status==='uploading'&&Number.isFinite(file.percent)?` ${Math.round(file.percent)}%`:''}</small>}{files.some(old=>old.name===file.name)&&<StatusBadge status="同名文件 · 新版本"/>}</div>}
  ><p className="ant-upload-drag-icon"><InboxOutlined/></p><p className="ant-upload-text">拖拽文件到这里，或点击选择</p><p className="ant-upload-hint">支持 DOCX、PDF · DOC 请先另存为 DOCX</p></AntUpload.Dragger>
  {duplicates&&<Field label="替换原因（保留原版本）" required wide><Input.TextArea disabled={busy||submitted} aria-label="替换原因" value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
  {error&&<Alert className="rfq-form-error" type="error" showIcon message={error}/>}
 </Modal>;
}
