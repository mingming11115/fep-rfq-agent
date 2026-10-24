import React, {useEffect, useId, useRef} from 'react';
import {createPortal} from 'react-dom';
import {normalizeTaskStatus} from '../taskStatus';
import {X, Inbox, ChevronLeft, ChevronRight} from 'lucide-react';

const overlayStack=[];
let originalOverflow='';

function Overlay({title,onClose,children,footer,width=640,drawer=false}) {
  const id=useId(), ref=useRef(null), closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{const previous=document.activeElement;if(!overlayStack.length)originalOverflow=document.body.style.overflow;overlayStack.push(ref);document.body.style.overflow='hidden';ref.current?.focus();const key=(e)=>{if(overlayStack.at(-1)!==ref)return;if(e.key==='Escape'){e.preventDefault();closeRef.current?.();}if(e.key==='Tab'){const all=ref.current?.querySelectorAll('button:not(:disabled),input,select,textarea,[tabindex="0"]');if(!all?.length){e.preventDefault();return;}const first=all[0],last=all[all.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',key);return()=>{const i=overlayStack.indexOf(ref);if(i>=0)overlayStack.splice(i,1);if(!overlayStack.length)document.body.style.overflow=originalOverflow;document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus?.();else overlayStack.at(-1)?.current?.focus();};},[]);
  return createPortal(<div className={`overlay ${drawer?'drawer-overlay':''}`} onMouseDown={e=>{if(e.target===e.currentTarget)onClose?.();}}><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className={drawer?'drawer':'modal'} style={{width}}><header className="dialog-header"><h2 id={id}>{title}</h2><button className="icon-btn" aria-label="关闭弹窗" onClick={onClose}><X size={20}/></button></header><div className="dialog-body">{children}</div>{footer&&<footer className="dialog-footer">{footer}</footer>}</section></div>,document.body);
}
export function Modal(props){return <Overlay {...props}/>;}
export function Drawer(props){return <Overlay {...props} width={props.width||660} drawer/>;}
export const displayStatus=normalizeTaskStatus;
export function StatusBadge({status,value,children,tone}) {const text=displayStatus(status||value||children||'待确认');const type=tone||(/已确认|已关闭|已批准|已发布|已处理|已导出|完成|有效|生效|通过|Comply/.test(text)&&!/有条件/.test(text)?'success':/失败|不满足|撤销|过期|退回|失效/.test(text)?'danger':/待|评审|解析中|处理中|有条件|审批/.test(text)?'warning':'neutral');return <span className={`badge ${type}`}><i/>{text}</span>;}
export function EmptyState({title='暂无数据',description,children,action}){return <div className="empty-state"><Inbox size={38}/><strong>{title}</strong><p>{description||children}</p>{action}</div>;}
export function Pagination({count,page,onChange,pageSize=10}){const pages=Math.max(1,Math.ceil(count/pageSize));return <div className="pagination"><span>共 {count} 条记录</span><div><button className="icon-btn" aria-label="上一页" disabled={page<=1} onClick={()=>onChange(page-1)}><ChevronLeft size={16}/></button>{Array.from({length:Math.min(pages,5)},(_,i)=><button key={i} className={`page-number ${page===i+1?'active':''}`} onClick={()=>onChange(i+1)}>{i+1}</button>)}<button className="icon-btn" aria-label="下一页" disabled={page>=pages} onClick={()=>onChange(page+1)}><ChevronRight size={16}/></button><span>{pageSize} 条 / 页</span></div></div>;}
