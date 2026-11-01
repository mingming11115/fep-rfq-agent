import React,{useState} from 'react';
import {SOURCE_ANNOTATION_CONCLUSIONS,selectSourceResponseAnnotations} from '../responseAdvice';
import SourceResponseAnnotation from './SourceResponseAnnotation';
import {makeSourceAnchor} from '../documentAnchors';
import './source-response-annotation.css';

const palette=[{'--wc-color':'#6633a4','--wc-fill':'#d9c6ec'},{'--wc-color':'#df3540','--wc-fill':'#f8d9db'},{'--wc-color':'#008cf0','--wc-fill':'#d1e9fa'}];

export default function CraftResponseAdvice({rows,responsePreview,activeId,onSelectAnchor,onQuote,canEditRow}){
  const [conclusions,setConclusions]=useState(SOURCE_ANNOTATION_CONCLUSIONS);
  const notes=selectSourceResponseAnnotations(rows,{responsePreview,conclusions});
  const select=row=>onSelectAnchor?.(makeSourceAnchor(row));
  return <aside className="craft-response-advice word-classic-document" aria-label="原文件旁的话术批注">
    <header><strong>话术批注</strong><span>{notes.length} 条</span></header>
    <div className="craft-advice-filters" role="group" aria-label="按结论显示话术批注">{SOURCE_ANNOTATION_CONCLUSIONS.map(value=><label key={value}><input type="checkbox" checked={conclusions.includes(value)} onChange={event=>setConclusions(old=>event.target.checked?[...old,value]:old.filter(item=>item!==value))}/>{value}</label>)}</div>
    <div className="craft-advice-list">{notes.map(({row,annotation})=><SourceResponseAnnotation key={row.id} row={row} annotation={annotation} color={palette[Math.max(0,rows.findIndex(item=>item.id===row.id))%3]} active={row.id===activeId} onSelect={select} onOpen={select} onDiscuss={onQuote&&canEditRow?.(row)?item=>onQuote(item.sourceOriginal??item.original,makeSourceAnchor(item)):undefined}/>)}</div>
    {!notes.length&&<p className="craft-advice-empty">当前筛选下没有话术批注</p>}
  </aside>;
}
