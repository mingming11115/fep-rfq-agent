import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,Dropdown,Empty,Spin} from 'antd';
import {AimOutlined,FullscreenOutlined,FullscreenExitOutlined} from '@ant-design/icons';
import {FileText,MoreHorizontal,PencilLine,Upload} from './icons';
import {craftRequest,craftSourceKey,craftDemoAsset,loadCraftDemo,uploadCraftFile,importOfficeReview,assertCraftSource,createCraftSaveQueue,saveCraftReview,downloadCraftFile,downloadCraftBlob,supportsCraft} from '../craftClient';
import {createCraftProjectEditor} from '../craftEditorBridge';
import CraftResponseAdvice from './CraftResponseAdvice';
import {AnnotationFilterView} from './annotationFilterView';
import classicTemplate from '../../../../packages/craft-editors/site/classic.html?raw';
import '../../../../packages/craft-editors/site/original-comments.css';
import './onlyoffice-source.css';
import './craft-source.css';

const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
const emptyComments=[];

export default function CraftSourcePane({file,source,canManage=false,user,rows=[],selectedAnchor,allComments=emptyComments,people=[],canEditRow=()=>false,onProjectCommentsChange,onSelectAnchor,onSelectComment,onUnlinkedComment,activeCommentId,showResponses=true,responsePreview,onQuote,onDocumentOutlineChange,toolbar,directory}){
  const bindingKey='fep-rfq-craft-source:'+craftSourceKey(source);
  const [reference,setReference]=useState(()=>file?.craft||read(bindingKey));
  const [meta,setMeta]=useState(null),[bytes,setBytes]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[expanded,setExpanded]=useState(false),[retry,setRetry]=useState(0);
  const [editorState,setEditorState]=useState({ready:false,source:{status:'waiting'},unlinked:[],conflicts:[]});
  const [editorToolsBusy,setEditorToolsBusy]=useState(false);
  const [locationNotice,setLocationNotice]=useState(null),[locationConfirmation,setLocationConfirmation]=useState(0),[locateRequest,setLocateRequest]=useState(null);
  const locationTimer=useRef(null);
  const [backup,setBackup]=useState(null),[frameEpoch,setFrameEpoch]=useState(0);
  const [moreOpen,setMoreOpen]=useState(false),[requestingSave,setRequestingSave]=useState(false),[saveFailed,setSaveFailed]=useState(false),[downloading,setDownloading]=useState(false),[downloadError,setDownloadError]=useState(null);
  const moreTrigger=useRef(null),saveRequest=useRef(false),downloadRequest=useRef(false);
  const frame=useRef(null),overlay=useRef(null),tools=useRef(null),picker=useRef(null),editor=useRef(null),saveQueue=useRef(null);
  const alive=useRef(true),generation=useRef(0),dirtyRef=useRef(false),pendingSaves=useRef(0),abortLoad=useRef(null);
  const latest=useRef();latest.current={rows,comments:allComments,people,canEditRow,editDocument:canManage,selectedAnchor,activeCommentId,onProjectCommentsChange,onSelectAnchor,onSelectComment,onUnlinkedComment};
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
          if(!ref){setLoading(false);return;}
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
    const instance=createCraftProjectEditor({frame:frame.current,root:overlay.current,tools:tools.current,source,reference,revision:meta.revision,user,engine,externalSummaries:true,
      getContext:()=>latest.current,onCommentsChange:publish,onState:value=>{if(alive.current)setEditorState({...value,sessionKey:JSON.stringify([reference.id,frameEpoch])});},onError:message=>{if(alive.current)setError(message);},onDirty:markDirty,
      onSelectAnchor:anchor=>latest.current.onSelectAnchor?.(anchor),onSelectComment:(id,anchor,options)=>latest.current.onSelectComment?.(id,anchor,options),
      onUnlinkedComment:onUnlinkedComment?value=>latest.current.onUnlinkedComment?.(value):undefined,
      onSave:packet=>{
        if(!alive.current)return;
        const blob=new Blob([packet.bytes],{type:meta.fileType==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
        setBackup({blob,name:packet.name});
        if(!packet.review||packet.review.document!==packet.document){markDirty();setSaveFailed(true);setError('无法确认这份批阅稿的来源，已保留本地备份。请下载备份后重新打开项目原件。');return;}
        const serial=generation.current;pendingSaves.current++;setSaving(true);setSaveFailed(false);
        return saveQueue.current.enqueue(packet.bytes,serial,{review:packet.review}).catch(cause=>{
          if(alive.current){dirtyRef.current=true;setDirty(true);setSaveFailed(true);setError(cause.status===409?'原文件已有更新，当前修改已保留。请先下载本地备份，再重新打开最新批阅稿。':cause.message);}
        }).finally(()=>{pendingSaves.current--;if(alive.current)setSaving(pendingSaves.current>0);});
      }});
    editor.current=instance;
    const queue=createCraftSaveQueue({reference,revision:meta.revision,getGeneration:()=>generation.current,
      persist:(ref,content,revision)=>saveCraftReview(ref,content,revision,abort.signal),
      onSaved:(saved,details)=>{
        if(!alive.current)return;
        setMeta(saved);instance.markSaved(saved,details.review);setError('');setSaveFailed(false);
        if(details.clean&&instance.checkpointCovers(details.review)){dirtyRef.current=false;setDirty(false);if(window.__rfqOfficeUnsaved?.key===identity)window.__rfqOfficeUnsaved.dirty=false;}
        else{dirtyRef.current=true;setDirty(true);if(window.__rfqOfficeUnsaved?.key===identity)window.__rfqOfficeUnsaved.dirty=true;}
      }});
    saveQueue.current=queue;
    instance.open(meta.name,bytes);
    frame.current.src=`${import.meta.env.BASE_URL}craft-editors/${engine}-classic/index.html?host=parent&comments=classic&readonly=1&body=0&author=${encodeURIComponent(user?.name||'RFQ 用户')}${engine==='wordcraft'?'&tools=host':''}`;
    return()=>{abort.abort();queue.dispose();instance.destroy();if(editor.current===instance)editor.current=null;if(saveQueue.current===queue)saveQueue.current=null;};
  },[bytes,meta?.id,reference?.id,user?.id,frameEpoch]);
  useEffect(()=>{editor.current?.refresh();},[allComments,rows,selectedAnchor?.requirementId,activeCommentId,canEditRow,canManage]);
  useEffect(()=>{
    onDocumentOutlineChange?.({sourceKey:craftSourceKey(source),...editorState.documentOutline,
      ready:loading?false:!bytes?true:Boolean(editorState.ready),
      supported:meta?.fileType==='docx'&&Boolean(editorState.documentOutline?.supported),
      navigateHeading:target=>{
        if(!editor.current)return Promise.resolve(false);
        return editor.current.navigateHeading(target).catch(cause=>{if(alive.current)setError(cause.message);return false;});
      }});
  },[editorState.documentOutline,editorState.ready,loading,bytes,meta?.fileType,onDocumentOutlineChange]);

  async function attach(event){
    const original=event.target.files?.[0];event.target.value='';if(!original||!canManage)return;
    if(!supportsCraft(original.name)){setError('请选择 DOCX 或 PDF；旧 DOC 请先另存为 DOCX');return;}
    abortLoad.current?.abort();const abort=new AbortController();abortLoad.current=abort;setLoading(true);setError('');
    try{const value=await uploadCraftFile(original,source,{signal:abort.signal});if(alive.current&&!abort.signal.aborted)remember(value);}
    catch(cause){if(alive.current&&cause.name!=='AbortError'){setError(cause.message);setLoading(false);}}
  }
  function reopen(){
    if(saving||loading||saveRequest.current)return;
    if(dirtyRef.current&&!window.confirm('重新打开会放弃未保存的正文及未关联批注；协作记录中的批注会保留并重新同步。请先下载本地备份；仍要重新打开吗？'))return;
    generation.current++;dirtyRef.current=false;setDirty(false);
    if(window.__rfqOfficeUnsaved?.key===identity)window.__rfqOfficeUnsaved.dirty=false;
    setBytes(null);setMeta(null);setSaveFailed(false);setEditorState({ready:false,source:{status:'waiting'},unlinked:[],conflicts:[]});
    setFrameEpoch(value=>value+1);setRetry(value=>value+1);
  }
  async function toggleEditorTools(){
    const instance=editor.current;if(!instance||editorToolsBusy)return;
    setEditorToolsBusy(true);
    try{await instance.setEditorTools(!editorState.editorToolsVisible);}
    catch(cause){if(alive.current)setError(cause.message);}
    finally{if(alive.current)setEditorToolsBusy(false);}
  }
  async function saveFile(){
    if(!canSaveFile||saveRequest.current||pendingSaves.current)return;
    saveRequest.current=true;setRequestingSave(true);
    try{await editor.current.save();}
    catch(cause){if(alive.current){setSaveFailed(true);setError(cause.message);}}
    finally{saveRequest.current=false;if(alive.current)setRequestingSave(false);}
  }
  function retryFile(){
    if(saveFailed||backup&&dirty){void saveFile();return;}
    setError('');if(editor.current)editor.current.retry();else setRetry(value=>value+1);
  }
  async function downloadFile(kind){
    if(!canDownloadFile||downloadRequest.current)return;
    downloadRequest.current=true;setDownloading(true);setDownloadError(null);
    try{await downloadCraftFile({...reference,name:meta.name},kind);}
    catch(cause){if(alive.current)setDownloadError({kind,message:cause.message});}
    finally{downloadRequest.current=false;if(alive.current)setDownloading(false);}
  }
  useEffect(()=>setMoreOpen(false),[expanded]);
  useEffect(()=>{
    if(!moreOpen)return;
    const element=frame.current;let owner;
    const close=()=>setMoreOpen(false);
    const unbind=()=>{owner?.removeEventListener('pointerdown',close);owner?.removeEventListener('focusin',close);};
    const bind=()=>{unbind();try{owner=element?.contentDocument;}catch{owner=null;}owner?.addEventListener('pointerdown',close);owner?.addEventListener('focusin',close);};
    bind();element?.addEventListener('load',bind);
    return()=>{unbind();element?.removeEventListener('load',bind);};
  },[moreOpen]);
  function clearLocationNotice(){window.clearTimeout(locationTimer.current);locationTimer.current=null;setLocationNotice(null);}
  async function locateClause(id=latest.current.selectedAnchor?.requirementId){
    const instance=editor.current;
    if(!canLocate||!instance||!id||(locateRequest?.instance===instance&&locateRequest.id===id))return;
    const request={instance,id};setLocateRequest(request);clearLocationNotice();
    const current=()=>alive.current&&editor.current===instance&&latest.current.selectedAnchor?.requirementId===id;
    try{const result=await instance.locate(id);if(current()&&result?.id===id&&result.status==='matched')setLocationConfirmation(value=>value+1);}
    catch(cause){if(current())setError(cause.message);}
    finally{if(alive.current)setLocateRequest(value=>value===request?null:value);}
  }
  const targetId=selectedAnchor?.requirementId;
  const sourceStatus=targetId&&editorState.source?.selectedId===targetId?editorState.source.status||'waiting':'waiting';
  const locationKey=JSON.stringify([identity,reference?.id,targetId,frameEpoch]);
  const canLocate=Boolean(reference&&bytes&&!loading&&editorState.ready&&editorState.sessionKey===JSON.stringify([reference.id,frameEpoch])&&targetId);
  const locating=Boolean(locateRequest&&locateRequest.id===targetId&&locateRequest.instance===editor.current);
  useEffect(()=>{
    if(!canLocate||sourceStatus!=='matched'){setLocationNotice(null);return;}
    const notice={key:locationKey};setLocationNotice(notice);
    const timer=window.setTimeout(()=>{if(locationTimer.current===timer)locationTimer.current=null;setLocationNotice(value=>value===notice?null:value);},2000);
    locationTimer.current=timer;
    return()=>{window.clearTimeout(timer);if(locationTimer.current===timer)locationTimer.current=null;};
  },[canLocate,sourceStatus,locationKey,locationConfirmation]);
  const showLocationNotice=canLocate&&sourceStatus!=='waiting'&&(sourceStatus!=='matched'||!locating&&locationNotice?.key===locationKey);
  const canSaveFile=Boolean(reference&&bytes&&!loading&&editorState.ready&&editorState.sessionKey===JSON.stringify([reference.id,frameEpoch])&&(canManage||rows.some(row=>canEditRow(row))));
  const canDownloadFile=Boolean(reference&&meta&&!loading);
  const fileState=loading?'loading':!reference?'missing':!bytes?'unopened':saving||requestingSave?'saving':saveFailed?'failed':dirty?'dirty':'saved';
  const fileStateText={loading:'文件加载中',missing:'未关联原件',unopened:'文件未打开',saving:'文件保存中',failed:'文件保存失败',dirty:'文件未保存',saved:'文件已保存'}[fileState];
  const fileName=meta?.name||reference?.name||file?.name||'客户原文件';
  const accessText=canManage?'可编辑原文':rows.some(row=>canEditRow(row))?'条款批注':'只读';
  const locationText={waiting:'正在连接原文定位…',matched:'已定位当前条款 · 原文与卡片联动',page:'已跳转来源页 · 请核对条款位置',missing:'未找到唯一原文，请核对文件和条款内容',ambiguous:'原文有多处匹配，请核对条款位置',unsupported:'当前原文暂不支持定位'}[sourceStatus]||'正在定位条款…';
  return <section className={`office-source craft-source detail-source ${expanded?'office-source-expanded':''}`} aria-label="Word / PDF 原文件批阅">
    <link rel="stylesheet" href={`${import.meta.env.BASE_URL}word-comments.css`} precedence="craft-comments"/>
    <div className={`office-toolbar ${toolbar?'rfq-document-toolbar':''}`} role={toolbar?'toolbar':undefined} aria-label={toolbar?'文档工具栏':undefined}>
      {toolbar?<div className="office-title rfq-document-identity"><div className="rfq-document-file">{toolbar.fileSelector}</div><span className="rfq-document-version">{source.sourceVersion}</span><small className={`rfq-file-state is-${fileState}`} role="status" aria-label="文件保存状态" title={`${fileStateText} · 批阅副本 · ${accessText} · ${fileName}`}><i aria-hidden="true"/><span className="rfq-file-state-label">{fileStateText}</span></small></div>:<div className="office-title"><FileText size={17}/><div><strong>{fileName}</strong><small role="status">批阅副本 · {accessText} · 批注与协作记录联动{saving?' · 保存中':dirty?' · 有未保存修改':''}</small></div></div>}
      <div className="office-actions">{toolbar?.actions}<Button size="small" aria-label="定位当前条款" title={locating?'正在定位当前条款':'定位当前条款'} disabled={!canLocate||locating} loading={locating} icon={<AimOutlined/>} onClick={()=>locateClause()}/>{toolbar&&meta?.fileType==='docx'&&<Button size="small" className={editorState.editorToolsVisible?'rfq-editor-tools active':'rfq-editor-tools'} aria-label="编辑工具" title={editorState.editorToolsVisible?'收起编辑工具':'展开编辑工具'} aria-pressed={Boolean(editorState.editorToolsVisible)} disabled={!editorState.ready||!editorState.editorToolsControlled||editorToolsBusy} loading={editorToolsBusy} onClick={toggleEditorTools}><PencilLine size={14}/><span className="rfq-editor-tools-label">编辑工具</span></Button>}<Button size="small" title={expanded?'还原原文件区':'放大原文件区'} aria-label={expanded?'还原原文件区':'放大原文件区'} onClick={()=>setExpanded(!expanded)}>{expanded?<FullscreenExitOutlined/>:<FullscreenOutlined/>}</Button>
      <Dropdown open={moreOpen} onOpenChange={setMoreOpen} trigger={['click']} placement="bottomRight" destroyOnHidden overlayClassName="rfq-file-menu" menu={{items:[{key:'save',disabled:!canSaveFile||saving||requestingSave,label:<span className="rfq-file-menu-save"><span>保存批阅稿</span><kbd>Ctrl/Cmd+S</kbd></span>},{type:'divider'},{key:'original',disabled:!canDownloadFile||downloading,label:'下载原件'},{key:'review',disabled:!canDownloadFile||downloading,label:'下载已保存批阅稿'}],onClick:({key})=>{setMoreOpen(false);if(key==='save')void saveFile();else void downloadFile(key);},onKeyDown:event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setMoreOpen(false);moreTrigger.current?.focus();}}}}><Button ref={moreTrigger} size="small" aria-label="更多文件操作" title="更多" aria-haspopup="menu" aria-expanded={moreOpen} icon={<MoreHorizontal size={14}/>}/></Dropdown></div>
    </div>
    {directory}
    {downloadError&&<Alert type="error" showIcon message={downloadError.message} action={<Button size="small" disabled={downloading||!canDownloadFile} onClick={()=>downloadFile(downloadError.kind)}>重试下载</Button>}/>}
    {error&&<Alert type="error" showIcon message={error} action={<div className="office-actions">{backup&&dirty&&<><Button size="small" onClick={()=>downloadCraftBlob(backup.blob,backup.name)}>下载本地备份</Button><Button size="small" disabled={saving||requestingSave||loading} onClick={reopen}>重新打开</Button></>}<Button size="small" disabled={saving||requestingSave||Boolean((saveFailed||backup&&dirty)&&!canSaveFile)} onClick={retryFile}>重试</Button></div>}/>}
    {!!editorState.conflicts?.length&&<Alert type="warning" showIcon message="部分批注两边都有新修改，已保留内容，请核对后再保存。"/>}
    {showLocationNotice&&<div className="office-clause-status" data-clause-status={sourceStatus} aria-label="定位结果"><span role="status">{locationText}</span>{sourceStatus!=='matched'&&<div className="office-actions"><Button size="small" disabled={locating} loading={locating} onClick={()=>locateClause()}>重新定位</Button></div>}</div>}
    <div className="craft-native-workspace" hidden={!bytes}>
      <AnnotationFilterView.Provider value={Boolean(bytes)}>
      <div className="word-classic-document review-tools" ref={tools}/>
      <div className="craft-editor-and-advice">
      <div className="craft-editor-viewport"><iframe key={frameEpoch} ref={frame} title={meta?.fileType==='pdf'?'PDF 原文与统一批注':'Word 原文与统一批注'} allow="fullscreen; clipboard-read; clipboard-write"/><div className="word-classic-document original-comments" ref={overlay}/>{!editorState.ready&&<div className="office-loading"><Spin/><span>正在打开原文件…</span></div>}</div>
      <CraftResponseAdvice key={craftSourceKey(source)} showResponses={showResponses} nativeNotes={editorState.nativeNotes} nativeActiveId={editorState.nativeActiveId} onOpenNativeComment={key=>editor.current?.openFileComment(key,{locate:true})} rows={rows} responsePreview={responsePreview} activeId={selectedAnchor?.requirementId} geometry={editorState.geometry} frame={frame} onSelectAnchor={anchor=>{const allowed=onSelectAnchor?.(anchor);if(allowed!==false&&editorState.ready)void locateClause(anchor.requirementId);return allowed;}} onQuote={onQuote} canEditRow={canEditRow}/>
      </div>
      </AnnotationFilterView.Provider>
    </div>
    {!bytes&&(loading?<div className="office-missing"><Spin/><p>正在读取项目原件…</p></div>:<div className="office-missing"><Empty description="尚未关联原文件"/><p>上传对应 DOCX / PDF 后，可在这里批阅并同步协作记录。</p>{canManage?<Button type="primary" icon={<Upload size={15}/>} onClick={()=>picker.current?.click()}>上传对应原文件</Button>:<p>请由项目 SR 关联原件。</p>}</div>)}
    <input ref={picker} type="file" accept=".docx,.pdf" hidden aria-label="上传对应原文件" onChange={attach}/>
  </section>;
}
