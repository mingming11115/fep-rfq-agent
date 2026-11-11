import {useEffect,useRef,useState} from 'react';
import {Alert,Spin} from 'antd';
import {createKnowledgeLibraryClient} from '../knowledgeLibraryClient';

const targetId='history-clause';

export default function HistoryOriginalPreview({buId,documentId,row}){
 const frame=useRef(null);
 const [loading,setLoading]=useState(true),[notice,setNotice]=useState(null);
 const anchor=row?.requirementAnchor||row?.answerAnchor||'';
 const part=anchor.startsWith('answer:')?'answer':'main';
 const answerOnly=!row?.requirementAnchor&&Boolean(row?.answerAnchor);
 const quote=answerOnly?row.answer||'':row?.originalText||row?.requirement||'';
 const title=answerOnly?'':row?.title||'';
 const description=answerOnly?'':row?.requirement||'';
 const pageNumber=Number(/:page-(\d+)(?:\/|$)/.exec(anchor)?.[1]);

 useEffect(()=>{
  const viewer=frame.current;
  const abort=new AbortController();
  const origin=window.location.origin;
  const hasQuote=Boolean(quote.trim());
  let engine='',filename='',bytes=null,opened=false,configured=false,timer;
  function finish(message,type='warning'){
   clearTimeout(timer);
   setLoading(false);
   setNotice(message?{message,type}:null);
  }
  function receive(event){
   if(event.origin!==origin||event.source!==viewer.contentWindow||abort.signal.aborted) { return; }
   const message=event.data;
   if(message?.type===engine+':ready'&&bytes&&!opened){
    opened=true;
    viewer.contentWindow.postMessage({type:engine+':open',name:filename,bytes},origin,[bytes]);
    return;
   }
   if(message?.type===engine+':failed'){
    finish('无法预览原文，请下载原件核对。','error');
    return;
   }
   if(!opened||![engine+':reviewState',engine+':reviewResult'].includes(message?.type)) { return; }
   let payload;
   try{payload=typeof message.payload==='string'?JSON.parse(message.payload):message.payload;}
   catch{finish('无法读取原文定位结果，请在原件中核对。');return;}
   if(message.type===engine+':reviewState'&&payload?.document&&payload.fileName===filename){
    // PdfCraft draws its toolbar on the canvas. Its viewport starts below that toolbar.
    const top=payload.clip?.y;
    if(engine==='pdfcraft'&&Number.isFinite(top)&&top>=0) {
     viewer.style.setProperty('--history-preview-top',`${top}px`);
    }
    if(configured) { return; }
    configured=true;
    const externalTools=engine==='wordcraft';
    if(!hasQuote&&!externalTools){finish();return;}
    const target={id:targetId,quote,title,description,editable:false,
     page:pageNumber>0?pageNumber-1:null};
    viewer.contentWindow.postMessage({type:engine+':review',payload:JSON.stringify({
     document:payload.document,request:1,action:'configure',
     params:{editable:false,editDocument:false,externalTools,targets:hasQuote?[target]:[],selectedId:hasQuote?targetId:null},
    })},origin);
   }else if(message.type===engine+':reviewResult'&&configured&&payload?.request===1){
    finish(!hasQuote||(payload.ok&&payload.result?.status==='matched')?'':'已打开原件，无法唯一定位该条款，请在原文中核对。');
   }
  }
  window.addEventListener('message',receive);
  viewer.style.removeProperty('--history-preview-top');
  setLoading(true);setNotice(null);
  async function load(){
   try{
    const original=await createKnowledgeLibraryClient(buId).historyOriginal(documentId,part,{signal:abort.signal});
    filename=original.filename;
    bytes=await original.blob.arrayBuffer();
    if(abort.signal.aborted) { return; }
    engine=/\.pdf$/i.test(filename)?'pdfcraft':'wordcraft';
    timer=setTimeout(()=>finish('原文预览或定位超时，请下载原件核对。'),30000);
    viewer.src=`${import.meta.env?.BASE_URL||'/'}craft-editors/${engine}-classic/index.html?host=parent&comments=classic&readonly=1&body=0${engine==='wordcraft'?'&tools=host':''}`;
   }catch(cause){
    if(!abort.signal.aborted) { finish(cause.message,'error'); }
   }
  }
  void load();
  return()=>{abort.abort();clearTimeout(timer);window.removeEventListener('message',receive);};
 },[buId,documentId,part,quote,title,description,pageNumber]);

 return <div className="history-original-preview">
  {loading&&<Spin tip="正在打开原文并定位"><div className="history-original-progress"/></Spin>}
  {notice&&<Alert showIcon {...notice}/>}
  <div className="history-original-viewport"><iframe ref={frame} title="历史 RFQ 原文"/></div>
 </div>;
}
