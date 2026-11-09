import React,{useContext,useEffect,useId,useRef,useState} from 'react';
import {Popover} from 'antd';
import {Filter} from './icons';
import {SOURCE_ANNOTATION_CONCLUSIONS} from '../responseAdvice';
import {AnnotationFilterView} from './annotationFilterView';

export default function ResponseAnnotationFilter({value,onChange,disabled=false,editorFrame}){
  const [open,setOpen]=useState(false),menuId=useId(),trigger=useRef(null),menu=useRef(null);
  const available=useContext(AnnotationFilterView)&&!disabled;
  const all=value.length===SOURCE_ANNOTATION_CONCLUSIONS.length;
  const summary=all?'全部结论':`已选 ${value.length} 类`;
  const focusOption=()=>menu.current?.querySelector('input')?.focus({preventScroll:true});
  useEffect(()=>{if(!available) { setOpen(false); }},[available]);
  useEffect(()=>{
    const frame=editorFrame?.current,document=frame?.contentDocument;
    if(!open||!available||!document) { return; }
    const close=()=>setOpen(false);
    document.addEventListener('pointerdown',close,true);document.addEventListener('focusin',close,true);frame.addEventListener('load',close);
    return()=>{document.removeEventListener('pointerdown',close,true);document.removeEventListener('focusin',close,true);frame.removeEventListener('load',close);};
  },[open,available,editorFrame]);
  function closeOnEscape(event){
    if(event.key!=='Escape') { return; }
    event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus({preventScroll:true});
  }
  const content=<div id={menuId} ref={menu} className="response-annotation-filter-menu" role="dialog" aria-label="应答标注结论筛选" onKeyDown={closeOnEscape}>
    <div role="group" aria-label="按结论显示应答标注">{SOURCE_ANNOTATION_CONCLUSIONS.map(conclusion=><label key={conclusion}>
      <input type="checkbox" aria-label={`显示 ${conclusion} 标注`} disabled={!available} checked={value.includes(conclusion)} onChange={event=>onChange(event.target.checked?[...value,conclusion]:value.filter(item=>item!==conclusion))}/>{conclusion}
    </label>)}</div>
    <footer><button type="button" disabled={!available||all} onClick={()=>{onChange([...SOURCE_ANNOTATION_CONCLUSIONS]);focusOption();}}>全选</button><button type="button" disabled={!available||!value.length} onClick={()=>{onChange([]);focusOption();}}>清空</button></footer>
  </div>;
  return <Popover content={content} trigger="click" placement="bottomRight" zIndex={1100} open={open&&available} onOpenChange={setOpen} destroyOnHidden afterOpenChange={visible=>{if(visible&&available) { focusOption(); }}}>
    <button type="button" ref={trigger} className="wc-button response-annotation-filter-trigger" aria-label={`筛选应答标注：${summary}`} aria-haspopup="dialog" aria-expanded={open&&available} aria-controls={open&&available?menuId:undefined} disabled={!available} onKeyDown={closeOnEscape}><Filter size={13} aria-hidden="true"/><span>{summary}</span></button>
  </Popover>;
}
