import React,{useState,useLayoutEffect,useRef} from 'react';
import {adviceGeometry} from '../craftAdviceGeometry';
import {SOURCE_ANNOTATION_CONCLUSIONS,selectSourceResponseAnnotations} from '../responseAdvice';
import SourceResponseAnnotation from './SourceResponseAnnotation';
import ResponseAnnotationFilter from './ResponseAnnotationFilter';
import {makeSourceAnchor} from '../documentAnchors';
import './source-response-annotation.css';

const palette=[{'--wc-color':'#6633a4','--wc-fill':'#d9c6ec'},{'--wc-color':'#df3540','--wc-fill':'#f8d9db'},{'--wc-color':'#008cf0','--wc-fill':'#d1e9fa'}];

export default function CraftResponseAdvice({rows,responsePreview,activeId,onSelectAnchor,onQuote,canEditRow,geometry,frame}){
  const [conclusions,setConclusions]=useState(SOURCE_ANNOTATION_CONCLUSIONS);
  const [showAll,setShowAll]=useState(false);
  const panel=useRef(null),[link,setLink]=useState({rects:[],path:''});
  const notes=selectSourceResponseAnnotations(rows,{responsePreview,conclusions,currentOnly:!showAll,activeId});
  const select=row=>onSelectAnchor?.(makeSourceAnchor(row));
  useLayoutEffect(()=>{if(!showAll&&panel.current)panel.current.scrollTop=0;},[showAll,activeId]);
  useLayoutEffect(()=>{
    const owner=panel.current,stage=owner?.parentElement,card=[...(owner?.querySelectorAll('[data-response-note]')||[])].find(node=>node.dataset.responseNote===activeId);
    if(!stage||!owner)return;
    if(showAll&&card){const box=card.getBoundingClientRect(),area=owner.getBoundingClientRect();if(box.top<area.top||box.bottom>area.bottom)owner.scrollTop+=box.top-area.top-12;}
    let request;
    const update=()=>{if(!card){setLink({rects:[],path:''});return;}const cardBox=card.getBoundingClientRect(),area=owner.getBoundingClientRect();const visible=cardBox.bottom>area.top&&cardBox.top<area.bottom;setLink(adviceGeometry({geometry,activeId,frame:frame?.current?.getBoundingClientRect(),stage:stage.getBoundingClientRect(),card:visible?cardBox:null}));};
    const schedule=()=>{cancelAnimationFrame(request);request=requestAnimationFrame(update);};
    const observer=new ResizeObserver(schedule);observer.observe(stage);if(card)observer.observe(card);
    stage.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);schedule();
    return()=>{cancelAnimationFrame(request);observer.disconnect();stage.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);};
  },[activeId,geometry,conclusions,responsePreview,frame,showAll,rows]);
  const color=palette[Math.max(0,rows.findIndex(row=>row.id===activeId))%3];
  return <><aside ref={panel} className="craft-response-advice word-classic-document" aria-label="原文件旁的应答标注">
    <header className="craft-advice-scope"><strong>应答标注 <span>{showAll?'全部':'当前'} {notes.length} 条</span></strong><button type="button" className="wc-button" aria-pressed={showAll} onClick={()=>setShowAll(!showAll)}>{showAll?'仅看当前条款':'查看全部标注'}</button></header>
    <div className="craft-advice-filters"><ResponseAnnotationFilter value={conclusions} onChange={setConclusions} editorFrame={frame}/></div>
    <div className="craft-advice-list">{notes.map(({row,annotation})=><SourceResponseAnnotation key={row.id} row={row} annotation={annotation} color={palette[Math.max(0,rows.findIndex(item=>item.id===row.id))%3]} active={row.id===activeId} onSelect={select} onOpen={select} onDiscuss={onQuote&&canEditRow?.(row)?item=>onQuote(item.sourceOriginal??item.original,makeSourceAnchor(item)):undefined}/>)}</div>
    {!notes.length&&<p className="craft-advice-empty" role="status">{showAll?'当前筛选下没有应答标注':rows.some(row=>row.id===activeId)?'当前条款没有符合筛选的应答标注':'请选择条款查看应答标注'}</p>}
  </aside><svg className="craft-advice-links" aria-label="应答标注与原文联动高亮"><g fill={color['--wc-fill']} fillOpacity=".45">{link.rects.map((r,i)=><rect key={i} x={r.x} y={r.y} width={r.w} height={r.h}/>)}</g>{link.path&&<path d={link.path} fill="none" stroke={color['--wc-color']} strokeWidth="1.15"/>}</svg></>;
}
