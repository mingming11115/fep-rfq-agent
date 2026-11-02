import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,Empty,Select,Spin} from 'antd';
import {FullscreenOutlined,FullscreenExitOutlined} from '@ant-design/icons';
import {FileText,Upload} from './icons';
import {craftRequest,craftSourceKey,craftDemoAsset,loadCraftDemo,uploadCraftFile,importOfficeReview,assertCraftSource,createCraftSaveQueue,saveCraftReview,downloadCraftBlob,supportsCraft} from '../craftClient';
import {createCraftProjectEditor} from '../craftEditorBridge';
import CraftResponseAdvice from './CraftResponseAdvice';
import classicTemplate from '../../../demos/craft-review/site/classic.html?raw';
import '../../../demos/craft-review/site/original-comments.css';
import './onlyoffice-source.css';
import './craft-source.css';

const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
const emptyComments=[];

export default function CraftSourcePane({file,source,canManage=false,user,rows=[],selectedAnchor,allComments=emptyComments,people=[],canEditRow=()=>false,onProjectCommentsChange,onSelectAnchor,onSelectComment,activeCommentId,showResponses=true,responsePreview,onQuote,onDocumentOutlineChange,children}){
  const bindingKey='fep-rfq-craft-source:'+craftSourceKey(source);
  const [reference,setReference]=useState(()=>file?.craft||read(bindingKey));
  const [meta,setMeta]=useState(null),[bytes,setBytes]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[excerpt,setExcerpt]=useState(false),[expanded,setExpanded]=useState(false),[retry,setRetry]=useState(0);
  const [editorState,setEditorState]=useState({ready:false,source:{status:'waiting'},unlinked:[],conflicts:[]});
  const [backup,setBackup]=useState(null),[association,setAssociation]=useState({}),[frameEpoch,setFrameEpoch]=useState(0);
  const frame=useRef(null),overlay=useRef(null),tools=useRef(null),picker=useRef(null),editor=useRef(null),saveQueue=useRef(null);
  const alive=useRef(true),generation=useRef(0),dirtyRef=useRef(false),pendingSaves=useRef(0),abortLoad=useRef(null);
  const latest=useRef();latest.current={rows,comments:allComments,people,canEditRow,editDocument:canManage,selectedAnchor,activeCommentId,onProjectCommentsChange,onSelectAnchor,onSelectComment};
  const identity=craftSourceKey(source,user?.id);
  function markDirty(){if(!alive.current)return;generation.current++;dirtyRef.current=true;setDirty(true);if(window.__rfqOfficeUnsaved?.key===identity)window.__rfqOfficeUnsaved.dirty=true;}
  function publish(update){
    const next=typeof update==='function'?update(latest.current.comments):update;
    latest.current={...latest.current,comments:next};latest.current.onProjectCommentsChange?.(update);
  }
  function remember(value){
    setReference(value);
    try{localStorage.setItem(bindingKey,JSON.stringify(value));}catch{setError('文件已上传，但当前浏览器未能保存关联。请保留页面并下载备份。');}
  }
  useEffect(()=>{
    alive.current=true;window.__rfqOfficeUnsaved={key:identity,sourceKey:craftSourceKey(source),dirty:false};
    const unload=event=>{if(dirtyRef.current||pendingSaves.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',unload);
    return()=>{alive.current=false;abortLoad.current?.abort();window.removeEventListener('beforeunload',unload);if(window.__rfqOfficeUnsaved?.key===identity)delete window.__rfqOfficeUnsaved;};
  },[identity]);
  useEffect(()=>{
    const abort=new AbortController();abortLoad.current=abort;setLoading(true);setError('');
    async function load(){
      try{
        let ref=reference;
        if(!ref){
          const old=file?.office||read('fep-rfq-office-source:'+craftSourceKey(source));
          if(old)ref=await importOfficeReview(old,source,abort.signal);
          else if(craftDemoAsset(source))ref=await loadCraftDemo(source,abort.signal);
          else if(file?.realSource&&file.localUrl){
            const url=new URL(file.localUrl,location.origin);
            if(url.origin===location.origin&&/\.pdf$/i.test(url.pathname)){
              const response=await fetch(url.href,{signal:abort.signal});if(!response.ok)throw new Error('项目原始 PDF 读取失败');
              ref=await uploadCraftFile(new File([await response.blob()],file.name||'RFQ.pdf'),source,{signal:abort.signal});
            }
          }
          if(abort.signal.aborted)return;
          if(!ref){setExcerpt(true);setLoading(false);return;}
          remember(ref);return;
        }
        const value=assertCraftSource(await craftRequest(`/documents/${ref.id}`,ref,{signal:abort.signal}),source);
        const binary=await craftRequest(`/documents/${ref.id}/download?kind=review`,ref,{binary:true,signal:abort.signal});
        const content=await binary.arrayBuffer();if(abort.signal.aborted)return;
        setMeta(value);setBytes(content);setLoading(false);
      }catch(cause){if(!abort.signal.aborted){setLoading(false);setError(cause.message);}}
    }
    void load();return()=>abort.abort();
  },[reference?.id,retry]);

  useEffect(()=>{
    if(!bytes||!meta||!reference||!frame.current||!overlay.current||!tools.current)return;
    const abort=new AbortController();
    const template=new DOMParser().parseFromString(classicTemplate,'text/html');
    overlay.current.innerHTML=template.getElementById('original-comments').innerHTML;
    tools.current.innerHTML=template.getElementById('review-tools').innerHTML;
    const engine=meta.fileType==='pdf'?'pdfcraft':'wordcraft';
    const instance=createCraftProjectEditor({frame:frame.current,root:overlay.current,tools:tools.current,source,reference,revision:meta.revision,user,engine,
      getContext:()=>latest.current,onCommentsChange:publish,onState:value=>{if(alive.current)setEditorState(value);},onError:message=>{if(alive.current)setError(message);},onDirty:markDirty,
      onSelectAnchor:anchor=>latest.current.onSelectAnchor?.(anchor),onSelectComment:(id,anchor)=>latest.current.onSelectComment?.(id,anchor),
      onSave:packet=>{
        if(!alive.current)return;
        const blob=new Blob([packet.bytes],{type:meta.fileType==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
        setBackup({blob,name:packet.name});
        if(!packet.review||packet.review.document!==packet.document){markDirty();setError('无法确认这份批阅稿的来源，已保留本地备份。请下载备份后重新打开项目原件。');return;}
        const serial=generation.current;pendingSaves.current++;setSaving(true);
        return saveQueue.current.enqueue(packet.bytes,serial,{review:packet.review}).catch(cause=>{
          if(alive.current){dirtyRef.current=true;setDirty(true);setError(cause.status===409?'原文件已有更新，当前修改已保留。请先下载本地备份，再重新打开最新批阅稿。':cause.message);}
        }).finally(()=>{pendingSaves.current--;if(alive.current)setSaving(pendingSaves.current>0);});
      }});
    editor.current=instance;
    const queue=createCraftSaveQueue({reference,revision:meta.revision,getGeneration:()=>generation.current,
      persist:(ref,content,revision)=>saveCraftReview(ref,content,revision,abort.signal),
      onSaved:(saved,details)=>{
        if(!alive.current)return;
        setMeta(saved);instance.markSaved(saved,details.review);setError('');
        if(details.clean&&instance.checkpointCovers(details.review)){dirtyRef.current=false;setDirty(false);if(window.__rfqOfficeUnsaved?.key===identity)window.__rfqOfficeUnsaved.dirty=false;}
        else{dirtyRef.current=true;setDirty(true);if(window.__rfqOfficeUnsaved?.key===identity)window.__rfqOfficeUnsaved.dirty=true;}
      }});
    saveQueue.current=queue;
    instance.open(meta.name,bytes);
    frame.current.src=`${import.meta.env.BASE_URL}craft-editors/${engine}-classic/index.html?host=parent&comments=classic&readonly=1&body=0&author=${encodeURIComponent(user?.name||'RFQ 用户')}`;
    return()=>{abort.abort();queue.dispose();instance.destroy();if(editor.current===instance)editor.current=null;if(saveQueue.current===queue)saveQueue.current=null;};
  },[bytes,meta?.id,reference?.id,user?.id,frameEpoch]);
  useEffect(()=>{editor.current?.refresh();},[allComments,rows,selectedAnchor?.requirementId,activeCommentId,canEditRow,canManage]);
  useEffect(()=>{editor.current?.setVisible(!excerpt);},[excerpt]);
  useEffect(()=>{
    onDocumentOutlineChange?.({sourceKey:craftSourceKey(source),...editorState.documentOutline,
      ready:loading?false:!bytes||excerpt?true:Boolean(editorState.ready),
      supported:!excerpt&&meta?.fileType==='docx'&&Boolean(editorState.documentOutline?.supported),
      navigateHeading:target=>{
        if(!editor.current)return Promise.resolve(false);
        return editor.current.navigateHeading(target).catch(cause=>{if(alive.current)setError(cause.message);return false;});
      }});
  },[editorState.documentOutline,editorState.ready,loading,bytes,excerpt,meta?.fileType,onDocumentOutlineChange]);

  async function attach(event){
    const original=event.target.files?.[0];event.target.value='';if(!original||!canManage)return;
    if(!supportsCraft(original.name)){setError('请选择 DOCX 或 PDF；旧 DOC 请先另存为 DOCX');return;}
    abortLoad.current?.abort();const abort=new AbortController();abortLoad.current=abort;setLoading(true);setError('');
    try{const value=await uploadCraftFile(original,source,{signal:abort.signal});if(alive.current&&!abort.signal.aborted)remember(value);}
    catch(cause){if(alive.current&&cause.name!=='AbortError'){setError(cause.message);setLoading(false);}}
  }
  function reopen(){
    if(saving||loading)return;
    if(dirtyRef.current&&!window.confirm('重新打开会放弃未保存的正文及未关联批注；协作记录中的批注会保留并重新同步。请先下载本地备份；仍要重新打开吗？'))return;
    generation.current++;dirtyRef.current=false;setDirty(false);
    if(window.__rfqOfficeUnsaved?.key===identity)window.__rfqOfficeUnsaved.dirty=false;
    setBytes(null);setMeta(null);setEditorState({ready:false,source:{status:'waiting'},unlinked:[],conflicts:[]});
    setFrameEpoch(value=>value+1);setRetry(value=>value+1);
  }
  const sourceStatus=editorState.source?.status||'waiting';
  const locationText={waiting:'正在连接原文定位…',matched:'已定位当前条款 · 原文与卡片联动',page:'已跳转来源页 · 请核对条款位置',missing:'未找到唯一原文，请核对文件或使用条款摘录',ambiguous:'原文有多处匹配，请核对条款位置',unsupported:'当前原文暂不支持定位'}[sourceStatus]||'正在定位条款…';
  return <section className={`office-source craft-source detail-source ${expanded?'office-source-expanded':''}`} aria-label="Word / PDF 原文件批阅">
    <link rel="stylesheet" href={`${import.meta.env.BASE_URL}word-comments.css`} precedence="craft-comments"/>
    <div className="office-toolbar"><div className="office-title"><FileText size={17}/><div><strong>{meta?.name||reference?.name||file?.name||'客户原文件'}</strong><small role="status">批阅副本 · {canManage?'可编辑原文':rows.some(row=>canEditRow(row))?'条款批注':'只读'} · 批注与协作记录联动{saving?' · 保存中':dirty?' · 有未保存修改':''}</small></div></div><div className="office-actions"><Button size="small" onClick={()=>setExcerpt(!excerpt)}>{excerpt?'原文件':'条款摘录'}</Button><Button size="small" aria-label={expanded?'还原原文件区':'放大原文件区'} onClick={()=>setExpanded(!expanded)}>{expanded?<FullscreenExitOutlined/>:<FullscreenOutlined/>}</Button></div></div>
    {error&&<Alert type="error" showIcon message={error} action={<div className="office-actions">{backup&&dirty&&<><Button size="small" onClick={()=>downloadCraftBlob(backup.blob,backup.name)}>下载本地备份</Button><Button size="small" disabled={saving||loading} onClick={reopen}>重新打开</Button></>}<Button size="small" disabled={saving} onClick={()=>{if(backup&&dirty&&editor.current){editor.current.save().catch(cause=>setError(cause.message));return;}setError('');if(editor.current)editor.current.retry();else setRetry(v=>v+1);}}>重试</Button></div>}/>}
    {!loading&&!reference&&excerpt&&<Alert type="info" showIcon message="当前来源文件尚未关联原文件，已显示对应条款摘录" action={canManage?<Button size="small" onClick={()=>picker.current?.click()}>上传对应原文件</Button>:undefined}/>}
    {!!editorState.conflicts?.length&&<Alert type="warning" showIcon message="部分批注两边都有新修改，已保留内容，请核对后再保存。"/>}
    {!!editorState.unlinked?.length&&!excerpt&&<div className="craft-unlinked" role="status"><strong>{editorState.unlinked.length} 条文件批注待关联条款</strong>{editorState.unlinked.map(note=><div key={note.nativeKey}><span title={note.text}>{note.text||'空白批注'}</span><Select size="small" aria-label={`为批注选择条款 ${note.id}`} placeholder="选择条款后同步" value={association[note.nativeKey]} onChange={value=>setAssociation(old=>({...old,[note.nativeKey]:value}))} options={rows.filter(row=>canEditRow(row)).map(row=>({value:row.id,label:`${row.clause||'无编号'} ${row.title||row.original?.slice(0,24)||''}`}))}/><Button size="small" disabled={!association[note.nativeKey]} onClick={()=>editor.current?.associate(note.nativeKey,association[note.nativeKey])}>关联并同步</Button></div>)}</div>}
    {reference&&!excerpt&&<div className="office-clause-status" data-clause-status={sourceStatus}><span role="status">{locationText}</span><Button size="small" disabled={!editorState.ready} onClick={()=>editor.current?.locate().catch(cause=>setError(cause.message))}>定位当前条款</Button></div>}
    <div className="office-excerpt" hidden={!excerpt}>{children}</div>
    <div className="craft-native-workspace" hidden={excerpt||!bytes}>
      <div className="word-classic-document review-tools" ref={tools}/>
      <div className="craft-editor-and-advice">
      <div className="craft-editor-viewport"><iframe key={frameEpoch} ref={frame} title={meta?.fileType==='pdf'?'PDF 原文与统一批注':'Word 原文与统一批注'} allow="fullscreen; clipboard-read; clipboard-write"/><div className="word-classic-document original-comments" ref={overlay}/>{!editorState.ready&&<div className="office-loading"><Spin/><span>正在打开原文件…</span></div>}</div>
      {showResponses&&<CraftResponseAdvice rows={rows} responsePreview={responsePreview} activeId={selectedAnchor?.requirementId} geometry={editorState.geometry} frame={frame} onSelectAnchor={anchor=>{const allowed=onSelectAnchor?.(anchor);if(allowed!==false&&editorState.ready)editor.current?.locate(anchor.requirementId).catch(cause=>setError(cause.message));return allowed;}} onQuote={onQuote} canEditRow={canEditRow}/>}
      </div>
    </div>
    {!excerpt&&!bytes&&(loading?<div className="office-missing"><Spin/><p>正在读取项目原件…</p></div>:<div className="office-missing"><Empty description="尚未关联原文件"/><p>原有条款摘录继续保留。上传对应 DOCX / PDF 后，可在这里批阅并同步协作记录。</p>{canManage?<Button type="primary" icon={<Upload size={15}/>} onClick={()=>picker.current?.click()}>上传对应原文件</Button>:<p>请由项目 SR 关联原件；当前身份可查看条款摘录。</p>}</div>)}
    <input ref={picker} type="file" accept=".docx,.pdf" hidden aria-label="上传对应原文件" onChange={attach}/>
  </section>;
}
