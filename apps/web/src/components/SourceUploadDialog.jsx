import {uploadRfqSource} from '../rfqSourceClient';
import { UiButton } from './AntContent';
import React,{useEffect,useRef,useState} from 'react';
import { Alert, Input, Steps, Upload as AntUpload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { uploadMetadata } from '../antdAdapters';

import {Modal,StatusBadge} from './ui';
import {supportsCraft,uploadCraftFile} from '../craftClient';
import HistoryRecallPicker from './HistoryRecallPicker';

function Field({label,children,required=false,wide=false}){return <label className={`field ${wide?'flow-field-wide':''}`}><span>{required&&<i className="flow-required">*</i>}{label}</span>{children}</label>;}

export default function SourceUploadDialog(props){return <SourceUploadSession key={props.project.id} {...props}/>;}
function SourceUploadSession({project,files=[],onSubmit,onClose,open=true,afterClose}){
 const [recallMode,setRecallMode]=useState('default'),[recallIds,setRecallIds]=useState([]);
 const [selected,setSelected]=useState([]),[reason,setReason]=useState(''),[error,setError]=useState(''),[fileList,setFileList]=useState([]);
 const version=`V${files.reduce((latest,file)=>Math.max(latest,Number(/^V([1-9]\d*)(?:\.\d+)?$/.exec(file.version)?.[1]||0)),0)+1}.0`;
 const duplicates=selected.some(file=>files.some(old=>old.name===file.name));
 const [busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false),[stage,setStage]=useState(0),[phases,setPhases]=useState({});
 const abort=useRef(null),alive=useRef(true),running=useRef(false),uploaded=useRef(new Map()),generation=useRef(0),previousOpen=useRef(open);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
 useEffect(()=>{
  const reopening=open&&!previousOpen.current;previousOpen.current=open;
  if(!open) { abort.current?.abort(); }
  if(reopening){generation.current++;running.current=false;uploaded.current.clear();setBusy(false);setFileList([]);setSelected([]);setPhases({});setError('');setStage(0);setSubmitted(false);setRecallMode('default');setRecallIds([]);}
 },[open]);
 function status(uid,patch,phase){if(!alive.current) { return; } setFileList(old=>old.map(file=>file.uid===uid?{...file,...patch}:file));if(phase) { setPhases(old=>({...old,[uid]:phase})); }}
 function cancel(){abort.current?.abort();onClose();}
 async function submit(){
  if(running.current) { return; }
  if(!selected.length) { return setError('请选择至少一个文件'); }
  if(recallMode==='selected'&&!recallIds.length) { return setError('请选择至少一个历史 RFQ 文件版本'); }
  const historyDocumentIds=recallMode==='selected'?recallIds:[];
  if(selected.some(file=>!/\.(docx|pdf)$/i.test(file.name))) { return setError('仅支持 DOCX、PDF；DOC 请先另存为 DOCX'); }
  if(duplicates&&!reason.trim()) { return setError('存在同名文件，请填写替换原因；旧版本将继续保留。'); }
  const incoming=[];
  const attempt=++generation.current,controller=new AbortController();
  const current=()=>alive.current&&attempt===generation.current&&!controller.signal.aborted;
  const check=()=>{if(!current()) { throw new DOMException('请求已取消','AbortError'); }};
  running.current=true;setBusy(true);setStage(1);setSubmitted(false);setError('');abort.current=controller;let activeUid,transferring=true;
  try{
   for(const item of fileList){
    activeUid=item.uid;const original=item.originFileObj||item,key=JSON.stringify([item.uid,version.trim(),reason.trim()]);
    let saved=uploaded.current.get(key);
    check();const progress=event=>{if(current()) { status(item.uid,{status:'uploading',percent:event.percent}); }};
    if(!saved){
     const file={id:`FILE-${crypto.randomUUID()}`,name:original.name,size:original.size,mime:original.type,lastModified:original.lastModified,purpose:'要求来源',version:version.trim(),visibility:'项目成员可见',reason:reason.trim(),previousVersionId:[...files].reverse().find(old=>old.name===original.name)?.id,status:'排队中',createdAt:new Date().toLocaleString('zh-CN',{hour12:false})};
     status(item.uid,{status:'uploading',percent:undefined},'上传原件');
     file.historyDocumentIds=historyDocumentIds;
     saved=await uploadRfqSource(project.id,original,file,undefined,project,{signal:controller.signal,onUploadProgress:progress});
     check();
     uploaded.current.set(key,saved);
    }
    check();
    if(supportsCraft(saved.name)&&!saved.craft){
     status(item.uid,{status:'uploading',percent:undefined},'保存批阅副本');
     saved={...saved,craft:await uploadCraftFile(original,{projectId:project.id,fileId:saved.id,sourceVersion:saved.version},{signal:controller.signal,onUploadProgress:progress})};
     check();
     uploaded.current.set(key,saved);
    }
    incoming.push(saved);status(item.uid,{status:'done',percent:100},'上传完成');
   }
   if(current()){
    transferring=false;setStage(2);
    if(await onSubmit(incoming)===false) { throw new Error('提交解析未完成，请重试'); }
    if(current()) { setSubmitted(true); }
   }
  }catch(cause){ console.error('上传原件失败', cause); if(alive.current&&attempt===generation.current){setSubmitted(false);if(cause.name==='AbortError') { status(activeUid,{status:undefined,percent:undefined},'已取消，可重新上传'); } else{if(transferring) { status(activeUid,{status:'error'},'上传失败，可重试'); } setError(cause.message);}}}finally{if(attempt===generation.current){running.current=false;if(alive.current) { setBusy(false); }}}
 }
 return <Modal open={open} afterClose={afterClose} title="上传并智能解析" onClose={cancel} footer={<><UiButton className="btn" onClick={cancel}>{busy?'取消上传':'取消'}</UiButton><UiButton className="btn btn-primary" loading={busy} disabled={busy||submitted} onClick={submit}>{busy?stage===2?'正在提交解析…':'正在上传原文件…':error?stage===2?'重试提交':'重试上传':'上传并开始解析'}</UiButton></>}>
  <Steps size="small" current={stage} status={error?'error':'process'} style={{marginBottom:20}} items={['选择文件','上传原件','提交解析'].map(title=>({title}))}/>
  <div className="form-grid"><Field label="文件版本" required wide><Input disabled aria-label="文件版本" value={version}/><span className="muted">版本号自动递增：首次上传 V1.0，后续为 V2.0、V3.0。本批文件使用同一版本，旧版继续保留。</span></Field></div>
  <AntUpload.Dragger className="rfq-upload" multiple accept=".docx,.pdf"
    beforeUpload={()=>false} fileList={fileList} disabled={busy||submitted}
    showUploadList={{showRemoveIcon:!busy&&!submitted}}
    onChange={({fileList:next})=>{setFileList(next);setSelected(uploadMetadata(next));setError('');setSubmitted(false);setStage(0);}}
    itemRender={(node,file)=><div>{node}{phases[file.uid]&&<small role="status">{phases[file.uid]}{file.status==='uploading'&&Number.isFinite(file.percent)?` ${Math.round(file.percent)}%`:''}</small>}{files.some(old=>old.name===file.name)&&<StatusBadge status="同名文件 · 新版本"/>}</div>}
  ><p className="ant-upload-drag-icon"><InboxOutlined/></p><p className="ant-upload-text">拖拽文件到这里，或点击选择</p><p className="ant-upload-hint">支持 DOCX、PDF · DOC 请先另存为 DOCX</p></AntUpload.Dragger>
  <HistoryRecallPicker projectId={project.backendProjectId || project.id} groupId={project.groupId} mode={recallMode} ids={recallIds}
    onMode={setRecallMode} onIds={setRecallIds} disabled={busy || submitted || uploaded.current.size > 0}/>
  {selected.length>1&&<small className="muted">本批上传的客户原件使用同一召回范围，解析后可以按原件分别修改。</small>}
  {duplicates&&<Field label="替换原因（保留原版本）" required wide><Input.TextArea disabled={busy||submitted} aria-label="替换原因" value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
  {error&&<Alert className="rfq-form-error" type="error" showIcon message={error}/>}
 </Modal>;
}
