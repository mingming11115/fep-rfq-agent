import React from 'react';
import {getEligiblePersonnel,personName} from '../personnelDomain';

export default function ReviewerPicker({state,project,value=[],onChange,disabled=false}){
 const people=getEligiblePersonnel(state,{buId:project.buId,projectId:project.id,duty:'confirm'});
 const missing=value.filter(id=>!people.some(p=>p.userId===id));
 return <div className="reviewer-picker" role="group" aria-label="评审人（可多选）">
  {people.map(p=><label key={p.userId}><input type="checkbox" disabled={disabled} checked={value.includes(p.userId)} onChange={()=>onChange(value.includes(p.userId)?value.filter(id=>id!==p.userId):[...value,p.userId])}/><span>{p.name}<small>{p.roles.join(' / ')}</small></span></label>)}
  {missing.map(id=><label key={id} className="response-error"><input type="checkbox" disabled={disabled} checked onChange={()=>onChange(value.filter(v=>v!==id))}/>{personName(state,id)}（资格或项目授权已失效，请移除）</label>)}
  {!people.length&&<p className="muted">暂无可选评审人，请在项目人员配置中添加有确认资格的成员。</p>}
 </div>;
}
