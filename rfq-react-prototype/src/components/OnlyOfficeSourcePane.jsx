import React, { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Empty, Spin } from 'antd';
import { FileText, Upload, Download } from './icons';
import { FullscreenOutlined as Maximize, FullscreenExitOutlined as Minimize } from '@ant-design/icons';
import { downloadOfficeFile, loadOfficeApi, officeCanLeave, officeRequest, officeSourceKey, saveReached, savedGeneration, supportsOffice, uploadOfficeFile } from '../officeClient';
import './onlyoffice-source.css';

export default function OnlyOfficeSourcePane({file,source,canManage,user,children}) {
  const bindingKey='fep-rfq-office-source:'+officeSourceKey(source);
  const readBinding=()=>{try{return JSON.parse(localStorage.getItem(bindingKey)||'null');}catch{return null;}};
  const [linked,setLinked]=useState(readBinding), [excerpt,setExcerpt]=useState(false), [expanded,setExpanded]=useState(false);
  const [error,setError]=useState(''),[phase,setPhase]=useState('idle'),[retry,setRetry]=useState(0),[meta,setMeta]=useState(null),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false);
  const fileInput=useRef(),editor=useRef(),active=useRef(true),dirtyRef=useRef(false),savingRef=useRef(false),changeSerial=useRef(0),metaRef=useRef(null);
  const uploadAbort=useRef(null), containerId='rfq-office-'+useId().replace(/:/g,'');
  const dirtyBaseline=useRef(null),flushedGeneration=useRef(0);
  const ref=file?.office || linked;
  const refKey=ref?.id, identity=officeSourceKey(source,`${user?.id}:${canManage}`);
  function markDirty(value) { if(value&&!dirtyRef.current)dirtyBaseline.current=metaRef.current;dirtyRef.current=value;setDirty(value);if(window.__rfqOfficeUnsaved?.key===identity)window.__rfqOfficeUnsaved.dirty=value; }
  function updateMeta(value){metaRef.current=value;setMeta(value);if(dirtyRef.current&&savedGeneration({baseline:dirtyBaseline.current,generation:changeSerial.current,flushedGeneration:flushedGeneration.current},value))markDirty(false);}
  useEffect(()=>{setLinked(readBinding());setExcerpt(false);setError('');},[bindingKey]);
  useEffect(()=>{
    active.current=true; window.__rfqOfficeUnsaved={key:identity,dirty:false};
    const unload=event=>{if(dirtyRef.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',unload);
    return()=>{active.current=false;uploadAbort.current?.abort();window.removeEventListener('beforeunload',unload);if(window.__rfqOfficeUnsaved?.key===identity)delete window.__rfqOfficeUnsaved;};
  },[identity]);
  useEffect(()=>{
    if(!refKey || excerpt)return;
    const abort=new AbortController();let alive=true,instance;
    setError('');setPhase('loading');
    async function mount(){try{
      const data=await officeRequest(`/documents/${refKey}/session`,ref,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({readOnly:!canManage,userId:user?.id,userName:user?.name}),signal:abort.signal});
      const api=await loadOfficeApi(data.apiUrl);if(!alive)return;
      updateMeta(data.document);
      // DocEditor replaces its target element. Recreate it on each mount instead of reusing a removed React child.
      const host=document.getElementById(containerId);if(!host)return;
      const target=document.createElement('div');target.id=containerId+'-editor';host.replaceChildren(target);
      instance=new api.DocEditor(target.id,{...data.config,events:{
        onDocumentReady:()=>{if(alive)setPhase('ready');},
        onDocumentStateChange:event=>{if(!alive)return;if(event.data===true){changeSerial.current++;markDirty(true);}else if(event.data===false){flushedGeneration.current=changeSerial.current;if(metaRef.current)updateMeta(metaRef.current);}},
        onError:event=>{if(alive){setError(event.data?.errorDescription||'原文件打开失败，请检查文档格式和服务连接');setPhase('error');}},
        onRequestClose:()=>{if(officeCanLeave())setExcerpt(true);},
      }});editor.current=instance;
    }catch(cause){if(alive&&cause.name!=='AbortError'){setError(cause.message);setPhase('error');}}}
    mount();
    return()=>{alive=false;abort.abort();instance?.destroyEditor();if(editor.current===instance)editor.current=null;};
  },[refKey,identity,retry,excerpt]);
  useEffect(()=>{
    if(!refKey||excerpt)return;
    let alive=true;const abort=new AbortController();
    const timer=setInterval(async()=>{try{const data=await officeRequest(`/documents/${refKey}`,ref,{signal:abort.signal});if(alive)updateMeta(data);}catch{/* Explicit actions report connection failures; polling never erases the last durable status. */}},3000);
    return()=>{alive=false;abort.abort();clearInterval(timer);};
  },[refKey,identity,excerpt]);
  async function attach(event){
    const original=event.target.files?.[0];event.target.value='';if(!original||!canManage)return;
    if(!supportsOffice(original.name)){setError('请选择 DOCX 或 PDF；旧 DOC 请先另存为 DOCX');return;}
    uploadAbort.current?.abort();const abort=new AbortController();uploadAbort.current=abort;
    setPhase('uploading');setError('');
    try{const value=await uploadOfficeFile(original,source,abort.signal);if(abort.signal.aborted)return;localStorage.setItem(bindingKey,JSON.stringify(value));setLinked(value);setExcerpt(false);}
    catch(cause){if(cause.name!=='AbortError'){setError(cause.message);setPhase('error');}}
  }
  async function save(){
    if(!ref||!canManage||savingRef.current)return;
    savingRef.current=true;setSaving(true);setError('');
    const before=metaRef.current||{},serial=changeSerial.current,reference=ref;
    try{
      let result=await officeRequest(`/documents/${reference.id}/save`,reference,{method:'POST'});
      updateMeta(result.document);
      if(!result.pending&&!dirtyRef.current){updateMeta(result.document);return;}
      for(let i=0;i<35;i++){
        await new Promise(resolve=>setTimeout(resolve,1000));if(!active.current)return;
        const after=await officeRequest(`/documents/${reference.id}`,reference);
        if(after.lastError)throw new Error(after.lastError);
        updateMeta(after);
        if(saveReached(before,after)){if(serial===changeSerial.current)markDirty(false);return;}
        if(!dirtyRef.current)return;
        if(!result.pending&&i%3===2)result=await officeRequest(`/documents/${reference.id}/save`,reference,{method:'POST'});
      }
      throw new Error('尚未收到保存完成确认，请保留编辑器并重试。也可从编辑器下载文件备份。');
    }catch(cause){if(active.current)setError(cause.message);}finally{savingRef.current=false;if(active.current)setSaving(false);}
  }
  async function download(kind){try{setError('');await downloadOfficeFile({...ref,name:meta?.name||ref.name},kind);}catch(cause){setError(cause.message);}}
  const savedAt=meta?.savedAt?new Date(meta.savedAt).toLocaleTimeString('zh-CN',{hour12:false}):null;
  return <section className={`office-source detail-source ${expanded?'office-source-expanded':''}`} aria-label="ONLYOFFICE 原文件批阅">
    <div className="office-toolbar"><div className="office-title"><FileText size={17}/><div><strong>{ref?.name||file?.name||'客户原文件'}</strong><small>{ref?'批阅副本 · '+(canManage?'可编辑与批注':'只读'):'原文件尚未关联'}</small></div></div><div className="office-actions">
      <Button size="small" onClick={()=>{if(officeCanLeave())setExcerpt(value=>!value);}}>{excerpt?'原文件':'条款摘录'}</Button>
      <Button size="small" aria-label={expanded?'还原原文件区':'放大原文件区'} onClick={()=>setExpanded(value=>!value)}>{expanded?<Minimize size={14}/>:<Maximize size={14}/>}</Button>
    </div></div>
    {error&&<Alert type="error" showIcon message={error} action={ref&&<Button size="small" onClick={()=>{if(dirtyRef.current){save();return;}setRetry(value=>value+1);}}>重试连接</Button>}/>}
    {excerpt?<div className="office-excerpt">{children}</div>:ref?<div className="office-editor-body"><div className="office-editor-mount" id={containerId}/>{phase==='loading'&&<div className="office-loading"><Spin/><span>正在打开原文件…</span></div>}</div>:<div className="office-missing"><Empty description="尚未关联原文件"/><p>历史示例只保存了条款摘录。上传真实 DOCX / PDF 后，可直接在这里批阅。</p>{canManage?<Button type="primary" loading={phase==='uploading'} onClick={()=>fileInput.current?.click()} icon={<Upload size={15}/>}>上传对应原文件</Button>:<p>请由项目 SR 补传原件；当前身份可查看条款摘录。</p>}<small>原件单独保留；批阅文件的修改不会自动更新右侧条款。</small></div>}
    <input ref={fileInput} type="file" accept=".docx,.pdf" hidden onChange={attach} aria-label="上传对应原文件"/>
    {ref&&<div className="office-savebar"><span role="status">{saving?'正在等待服务器保存…':dirty?'有修改，尚未确认保存':savedAt?`已保存 · ${savedAt}`:'原件已上传'}{meta?.lastError?' · 保存失败':''}</span><div><Button size="small" onClick={()=>download('original')}>原件</Button><Button size="small" icon={<Download size={13}/>} disabled={dirty||saving} title={dirty?'请先保存原文再下载批阅版':''} onClick={()=>download('review')}>批阅版</Button>{canManage&&<Button size="small" type="primary" disabled={phase!=='ready'} loading={saving} onClick={save}>保存原文</Button>}</div></div>}
  </section>;
}
