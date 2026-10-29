import React,{useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AtSign,Check,X} from 'lucide-react';
import {filterPeople} from '../personPicker';
import './person-picker.css';

export default function PersonPicker({people=[],value='',onChange,multiple=false,disabled=false,label='选择人员',resolveName=id=>id,emptyLabel='暂无可选人员',clearLabel='清空选择',placeholder='输入 @姓名或账号'}) {
 const id=useId(),root=useRef(null),input=useRef(null),list=useRef(null);
 const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(0),[position,setPosition]=useState(null);
 const ids=multiple?value:(value?[value]:[]),options=filterPeople(people,query),selected=filterPeople(people);
 const expanded=open&&!disabled;
 useLayoutEffect(()=>{
  if(!expanded)return;
  const place=()=>{const rect=root.current.getBoundingClientRect(),below=window.innerHeight-rect.bottom-8,above=rect.top-8,up=below<180&&above>below;
   setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-Math.min(rect.width,window.innerWidth-16)-8)),width:Math.min(rect.width,window.innerWidth-16),maxHeight:Math.min(260,Math.max(80,up?above:below)),...(up?{bottom:window.innerHeight-rect.top+4}:{top:rect.bottom+4})});};
  const observer=new ResizeObserver(place);observer.observe(root.current);
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[expanded]);
 useLayoutEffect(()=>{list.current?.querySelector('[data-active="true"]')?.scrollIntoView({block:'nearest'});},[active]);
 function choose(person){
  if(disabled)return;
  onChange(multiple?(ids.includes(person.id)?ids.filter(v=>v!==person.id):[...ids,person.id]):person.id);
  setQuery('');setActive(0);setOpen(multiple);input.current?.focus();
 }
 function remove(personId){if(disabled)return;onChange(multiple?ids.filter(v=>v!==personId):'');input.current?.focus();}
 function keydown(e){
  if(e.nativeEvent.isComposing||e.keyCode===229)return;
  if(e.key==='Escape'&&expanded){e.preventDefault();e.stopPropagation();setOpen(false);return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   e.preventDefault();setOpen(true);setActive(expanded?Math.max(0,Math.min(options.length-1,active+(e.key==='ArrowDown'?1:-1))):0);
  }else if(e.key==='Enter'&&expanded){e.preventDefault();if(options[active])choose(options[active]);}
 }
 return <div ref={root} className={`person-picker ${disabled?'is-disabled':''}`} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){setOpen(false);setQuery('');}}}>
  <div className="person-picker-control" onClick={()=>input.current?.focus()}>
   <AtSign size={15} className="person-picker-icon" aria-hidden="true"/>
   {ids.map(personId=>{const person=selected.find(p=>p.id===personId);return <span className={`person-picker-chip ${!person?'is-invalid':''}`} key={personId} title={personId}>
    @{person?.name||resolveName(personId)}{!person&&<small>（需重新选择）</small>}
    {!disabled&&<button type="button" aria-label={`移除 ${person?.name||resolveName(personId)}`} onClick={e=>{e.stopPropagation();remove(personId);}}><X size={12}/></button>}
   </span>;})}
   <input ref={input} role="combobox" aria-label={label} aria-expanded={expanded} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={expanded&&options[active]?`${id}-option-${active}`:undefined} autoComplete="off" disabled={disabled} placeholder={placeholder} value={query} onFocus={()=>{setOpen(true);setActive(0);}} onClick={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setActive(0);setOpen(true);}} onKeyDown={keydown}/>
  </div>
  {expanded&&position&&createPortal(<div className="person-picker-popup" style={position} onMouseDown={e=>e.preventDefault()}>
   <div className="person-picker-heading">选择人员{multiple?' · 可多选':''}<span>@姓名 / 账号</span></div>
   <div ref={list} role="listbox" id={`${id}-list`} aria-label={`${label}候选`} aria-multiselectable={multiple||undefined}>
    {options.map((person,index)=><button type="button" role="option" tabIndex={-1} id={`${id}-option-${index}`} key={person.id} aria-selected={ids.includes(person.id)} data-active={index===active} onMouseEnter={()=>setActive(index)} onClick={()=>choose(person)}>
     <span className="person-picker-avatar">{person.name?.[0]||'人'}</span><span className="person-picker-info"><strong>{person.name}</strong><small>{person.id}{person.roles?.length?` · ${person.roles.join(' / ')}`:''}</small></span>{ids.includes(person.id)&&<Check size={15}/>}
    </button>)}
    {!options.length&&<p role="status" className="person-picker-empty">{people.length?'未找到匹配人员':emptyLabel}</p>}
   </div>
   {!multiple&&ids.length>0&&<button type="button" className="person-picker-clear" onClick={()=>{remove(ids[0]);setOpen(false);}}>{clearLabel}</button>}
  </div>,document.body)}
 </div>;
}
