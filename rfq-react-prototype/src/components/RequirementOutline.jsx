import { UiCheckbox } from './AntContent';
import React from 'react';
import {sectionLabel} from '../documentStructure';
import {StatusBadge} from './ui';
export default function RequirementOutline({rows,selectedId,onSelect,selected=[],onCheck,getStatusLabel=row=>row.status}){return <nav className="source-outline" aria-label="原文目录">{rows.map((r,i)=><React.Fragment key={r.id}>{(i===0||sectionLabel(rows[i-1])!==sectionLabel(r))&&<h3>{sectionLabel(r)}</h3>}<div className={r.id===selectedId?'active':''}>{onCheck&&<UiCheckbox type="checkbox" aria-label={`选择条款 ${r.clause||'无编号'} ${r.title}`} checked={selected.includes(r.id)} onChange={e=>onCheck(r.id,e.target.checked)}/>}<button onClick={()=>onSelect(r)}><span>{r.clause||'无编号'} <StatusBadge status={getStatusLabel(r)}/></span><strong>{r.title}</strong></button></div></React.Fragment>)}{!rows.length&&<p className="muted">当前筛选下暂无条款。</p>}</nav>;}
