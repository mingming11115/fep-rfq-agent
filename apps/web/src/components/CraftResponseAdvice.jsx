import React,{useState,useLayoutEffect,useRef} from 'react';
import {adviceGeometry} from '../craftAdviceGeometry';
import {SOURCE_ANNOTATION_CONCLUSIONS,selectSourceResponseAnnotations} from '../responseAdvice';
import SourceResponseAnnotation from './SourceResponseAnnotation';
import ResponseAnnotationFilter from './ResponseAnnotationFilter';
import {makeSourceAnchor} from '../documentAnchors';
import './source-response-annotation.css';

const palette=[{'--wc-color':'#6633a4','--wc-fill':'#d9c6ec'},{'--wc-color':'#df3540','--wc-fill':'#f8d9db'},{'--wc-color':'#008cf0','--wc-fill':'#d1e9fa'}];

const emptyNotes=[];

export default function CraftResponseAdvice({rows,responsePreview,activeId,onSelectAnchor,onQuote,canEditRow,geometry,frame,nativeNotes=emptyNotes,nativeActiveId,onOpenNativeComment,showResponses=true}){
  const [conclusions,setConclusions]=useState(SOURCE_ANNOTATION_CONCLUSIONS);
  const [showAll,setShowAll]=useState(false);
  const [revealTarget,setRevealTarget]=useState({kind:'response',key:activeId});
  const panel=useRef(null),[link,setLink]=useState({rects:[],path:'',native:[]});
  const notes=showResponses?selectSourceResponseAnnotations(rows,{responsePreview,conclusions,currentOnly:!showAll,activeId}):[];
  const select=row=>{setRevealTarget({kind:'response',key:row.id});onSelectAnchor?.(makeSourceAnchor(row));};
  useLayoutEffect(()=>{setRevealTarget({kind:'response',key:activeId});},[activeId]);
  useLayoutEffect(()=>{
    const note=nativeNotes.find(note=>note.id===nativeActiveId);
    if(note)setRevealTarget({kind:'native',key:note.nativeKey});
  },[nativeActiveId]);
  useLayoutEffect(()=>{
    const owner=panel.current;
    const native=revealTarget.kind==='native'&&[...(owner?.querySelectorAll('[data-native-note]')||[])].find(node=>node.dataset.nativeNote===revealTarget.key);
    const node=native||[...(owner?.querySelectorAll('[data-response-note]')||[])].find(node=>node.dataset.responseNote===(revealTarget.kind==='response'?revealTarget.key:activeId));
    if(!owner||!node)return;
    if(!native&&!showAll&&!nativeNotes.length){owner.scrollTop=0;return;}
    const box=node.getBoundingClientRect(),area=owner.getBoundingClientRect();
    const controls=(owner.querySelector('.craft-advice-scope')?.offsetHeight||0)+(owner.querySelector('.craft-advice-filters')?.offsetHeight||0)||70;
    if(box.top<area.top+controls||box.bottom>area.bottom)owner.scrollTop=Math.max(0,owner.scrollTop+box.top-area.top-controls);
  },[revealTarget,showAll,nativeNotes.length,activeId]);
  useLayoutEffect(()=>{
    const owner=panel.current,stage=owner?.parentElement,card=[...(owner?.querySelectorAll('[data-response-note]')||[])].find(node=>node.dataset.responseNote===activeId);
    if(!stage||!owner)return;
    let request;
    const update=()=>{
      const area=owner.getBoundingClientRect(),stageBox=stage.getBoundingClientRect(),frameBox=frame?.current?.getBoundingClientRect();
      const visibleBox=node=>{if(!node)return null;const box=node.getBoundingClientRect();return box.bottom>area.top&&box.top<area.bottom?box:null;};
      const native=nativeNotes.map(note=>{
        const node=[...owner.querySelectorAll('[data-native-note]')].find(node=>node.dataset.nativeNote===note.nativeKey);
        const {path}=adviceGeometry({geometry:{clip:geometry?.clip,status:'matched',selectedId:note.nativeKey,ranges:note.ranges},activeId:note.nativeKey,frame:frameBox,stage:stageBox,card:visibleBox(node)});
        return {key:note.nativeKey,path,color:palette[(note.color||0)%3]['--wc-color'],active:note.id===nativeActiveId};
      }).filter(item=>item.path);
      const response=showResponses?adviceGeometry({geometry,activeId,frame:frameBox,stage:stageBox,card:visibleBox(card)}):{rects:[],path:''};
      setLink({...response,native});
    };
    const schedule=()=>{cancelAnimationFrame(request);request=requestAnimationFrame(update);};
    const observer=new ResizeObserver(schedule);observer.observe(stage);observer.observe(owner);if(card)observer.observe(card);
    owner.querySelectorAll('[data-native-note]').forEach(node=>observer.observe(node));
    stage.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);schedule();
    return()=>{cancelAnimationFrame(request);observer.disconnect();stage.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);};
  },[activeId,geometry,conclusions,responsePreview,frame,showAll,rows,nativeNotes,nativeActiveId,showResponses,revealTarget]);
  const color=palette[Math.max(0,rows.findIndex(row=>row.id===activeId))%3];
  if(!showResponses&&!nativeNotes.length)return null;
  return <><aside ref={panel} className={`craft-annotation-sidebar word-classic-document${showResponses?' craft-response-advice':''}`} aria-label={showResponses?'原文件旁的应答标注':'原文件旁的批注'}>
    {showResponses&&<>
    <header className="craft-advice-scope"><strong>批注与应答 <span>批注 {nativeNotes.length} · {showAll?'全部':'当前'}应答 {notes.length}</span></strong><button type="button" className="wc-button" aria-pressed={showAll} onClick={()=>{setRevealTarget({kind:'response',key:activeId});setShowAll(!showAll);}}>{showAll?'仅看当前条款':'查看全部标注'}</button></header>
    <div className="craft-advice-filters"><ResponseAnnotationFilter value={conclusions} onChange={setConclusions} editorFrame={frame}/></div>
    </>}
    <div className="craft-advice-list">
      {nativeNotes.map(note=><section key={note.nativeKey} className={`wc-note wc-note-summary craft-native-summary${note.id===nativeActiveId?' wc-note-active':''}`} style={palette[(note.color||0)%3]} data-native-note={note.nativeKey} aria-label={`${note.author||'审阅人'}的文件批注`}>
        <div className="wc-note-head"><span className="wc-author">{note.author||'审阅人'}</span><span className="wc-time">{note.resolved?'已解决':'未解决'}{note.replies?.length?` · ${note.replies.length} 条回复`:''}</span></div>
        <button type="button" className="wc-note-body-button wc-summary-open" aria-label={`打开右侧讨论：${note.text||'新批注'}`} onClick={()=>{setRevealTarget({kind:'native',key:note.nativeKey});onOpenNativeComment?.(note.nativeKey);}}>{note.text||'新批注，等待填写'}</button>
      </section>)}
      {notes.map(({row,annotation})=><SourceResponseAnnotation key={row.id} row={row} annotation={annotation} showQuote={false} color={palette[Math.max(0,rows.findIndex(item=>item.id===row.id))%3]} active={row.id===activeId} onSelect={select} onOpen={select} onDiscuss={onQuote&&canEditRow?.(row)?item=>onQuote(item.sourceOriginal??item.original,makeSourceAnchor(item)):undefined}/>)}
    </div>
    {showResponses&&!notes.length&&<p className="craft-advice-empty" role="status">{showAll?'当前筛选下没有应答标注':rows.some(row=>row.id===activeId)?'当前条款没有符合筛选的应答标注':'请选择条款查看应答标注'}</p>}
  </aside><svg className="craft-advice-links" aria-label="批注及应答标注与原文联动高亮"><g fill={color['--wc-fill']} fillOpacity=".45">{link.rects.map((r,i)=><rect key={i} x={r.x} y={r.y} width={r.w} height={r.h}/>)}</g>{link.path&&<path d={link.path} fill="none" stroke={color['--wc-color']} strokeWidth="1.15"/>}{link.native.map(item=><path key={item.key} data-native-link={item.key} d={item.path} fill="none" stroke={item.color} strokeWidth="1.15" strokeDasharray={item.active?undefined:'4 4'}/>)}</svg></>;
}
