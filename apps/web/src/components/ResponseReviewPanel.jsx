import { UiButton, UiTag, UiTextArea, UiSelect, UiInput } from './AntContent';
import {reviewEvidenceHref} from '../reviewRequest';
import React,{useEffect,useRef,useState} from 'react';
import {Modal} from './ui';
import ReviewerPicker from './ReviewerPicker';
import {getReviewActorIds,hasReviewConfirmation,hasAssignedConfirmer} from '../confirmationPolicy';
import {getEligiblePersonnel,personName} from '../personnelDomain';
import './response-review.css';

const fieldsFor=(review,row)=>({plan:review.plan||'',impact:review.impact||'',proposedDraft:row.draft||'',proposedConclusion:row.conclusion||'待确认',proposedConclusionText:row.conclusionText||'',conditions:row.conditions||'',evidence:row.evidence||'',reason:row.remark??row.reason??''});
export default function ResponseReviewPanel({review,row,project,state,actorId,onUpdateReview,onAdoptReview,canEdit=true,onClose,Surface,registerGuard,initialAction}){
 const [form,setForm]=useState(()=>fieldsFor(review,row)),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[editPeople,setEditPeople]=useState(initialAction==='reopen'?'reopen':null),[selected,setSelected]=useState(()=>getReviewActorIds(review)),[reason,setReason]=useState(''),[deadline,setDeadline]=useState(review.deadline||project.deadline||''),[leave,setLeave]=useState(null);
 const [keepReason,setKeepReason]=useState('');
 const dirtyRef=useRef(false),baseline=useRef({version:review.version||1,round:review.round||1}),saveRef=useRef(null);
 const ids=getReviewActorIds(review),closed=['已关闭','已取消'].includes(review.status),mine=ids.includes(actorId),manager=project.ownerId===actorId;
 const eligible=getEligiblePersonnel(state,{buId:project.buId,projectId:project.id,duty:'confirm'}).map(p=>p.userId),qualified=mine&&eligible.includes(actorId),editable=qualified&&!closed&&canEdit;
 const voted=hasReviewConfirmation(review,row,actorId),count=ids.filter(id=>hasReviewConfirmation(review,row,id)).length,conflict=dirty&&(baseline.current.version!==(review.version||1)||baseline.current.round!==(review.round||1));
 function mark(value){dirtyRef.current=value;setDirty(value);}
 function change(key,value){setForm(f=>({...f,[key]:value}));mark(true);}
 function guard(next){if(dirtyRef.current){setLeave(()=>next);return false;}return true;}
 useEffect(()=>{if(!dirtyRef.current){setForm(fieldsFor(review,row));baseline.current={version:review.version||1,round:review.round||1};}},[review.version,review.round,review.status,row.version]);
 useEffect(()=>registerGuard?.(guard),[registerGuard]);
 useEffect(()=>{const listener=e=>{if(dirtyRef.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener);},[]);
 function save(action){
  if(conflict){setError('其他评审人已更新内容，请先载入最新版本，当前输入已保留。');return false;}
  if(!action&&!dirty) { return true; }
  if(form.proposedConclusion==='其他'&&!String(form.proposedConclusionText||'').trim()){setError('结论选择「其他」时，请填写自定义结论。');return false;}
  const next=onUpdateReview(review.id,{...(dirty?form:{}),...(action?{action}:{}),note},baseline.current.version,baseline.current.round);
  if(next===false) { return false; }
  baseline.current={version:next.version||1,round:next.round||1};mark(false);setError('');setNote('');return true;
 }
 saveRef.current=save;
 function assign(){const next=onUpdateReview(review.id,{action:editPeople,reviewerIds:selected,deadline,reason},review.version||1,review.round||1);if(next!==false){setEditPeople(null);setReason('');mark(false);setError('');}}
 return <Surface title="应答评审" width={760} onClose={()=>{if(guard(onClose)) { onClose(); }}} footer={<>{closed?(manager||qualified)&&<UiButton className="btn" onClick={()=>{setSelected(ids);setEditPeople('reopen');}}>重新评审</UiButton>:<>{(manager||qualified)&&<UiButton className="btn" disabled={dirty} onClick={()=>{setSelected(ids);setEditPeople('assign');}}>调整评审人</UiButton>}<UiButton className="btn" disabled={!editable||!dirty||conflict} onClick={()=>save()}>保存应答</UiButton><UiButton className="btn btn-primary" disabled={!editable||!!row.pendingReviewProposal||conflict||voted&&!dirty} onClick={()=>save('confirm')}>{voted&&!dirty?'本人已确认':'确认本人评审'}</UiButton></>}</>}>
  <div className="review-response-summary"><div><small>应答 V{row.version||1} · 第 {review.round||1} 轮评审</small><h3>{review.title}</h3></div><UiTag className="badge">{closed?(review.status==='已取消'?'评审已取消':'评审已完成'):`${count} / ${ids.length} 人已确认`}</UiTag></div>
  {reviewEvidenceHref(review.requestEvidenceLink||review.evidence)&&<p><a className="text-link" href={reviewEvidenceHref(review.requestEvidenceLink||review.evidence)} target="_blank" rel="noopener noreferrer">打开关联证据 ↗</a></p>}
  <div className="review-confirmation-list" aria-label="逐人确认状态">{ids.map(id=><div key={id}><strong>{personName(state,id)}</strong><span className={hasReviewConfirmation(review,row,id)?'confirmed':'pending'}>{hasReviewConfirmation(review,row,id)?'已确认':eligible.includes(id)?'待确认':'资格或项目授权已失效，需调整人员'}</span><small>{review.confirmations?.[id]?.note||''}</small></div>)}</div>
  {(closed||hasAssignedConfirmer(row))&&<p className="review-response-notice">{closed?(review.status==='已取消'?'评审已取消，历史记录保留。':row.status==='已确认'?'全部评审人已确认，应答项已确认。':'评审已完成，等待条款确认人确认本条。'):'全部评审人完成本轮评审后，再由条款确认人确认本条。修改应答、方案或评审人后，评审确认需要重新进行。'}</p>}
  {!qualified&&!manager&&<p className="muted">本事项评审人：{ids.map(id=>personName(state,id)).join('、')}。你可以查看处理进度。</p>}
  {conflict&&<div className="response-error" role="alert">评审内容已更新，当前输入尚未覆盖新版本。<UiButton className="text-link" onClick={()=>{setForm(fieldsFor(review,row));baseline.current={version:review.version||1,round:review.round||1};mark(false);setError('');}}>放弃当前输入并载入最新版本</UiButton></div>}
  {row.pendingReviewProposal&&<section className="review-response-notice"><strong>历史评审建议待核对</strong><p>当前应答：{row.draft}</p><p>评审建议：{row.pendingReviewProposal.proposal?.draft}</p>{editable&&<><UiButton className="btn btn-primary" disabled={dirty} onClick={()=>onAdoptReview?.(row.id,row.pendingReviewProposal)}>采用评审建议</UiButton><label className="field"><span>保留当前应答的原因</span><UiTextArea className="input" value={keepReason} onChange={e=>setKeepReason(e.target.value)}/></label><UiButton className="btn" disabled={dirty||!keepReason.trim()} onClick={()=>onAdoptReview?.(row.id,row.pendingReviewProposal,keepReason)}>保留当前应答并记录原因</UiButton></>}</section>}
  <fieldset disabled={!editable} className="review-response-fields"><div className="form-grid">
   <label className="field"><span>最终结论</span><UiSelect className="select" aria-label="评审最终结论" value={form.proposedConclusion} onChange={e=>change('proposedConclusion',e.target.value)}>{['待确认','Comply','有条件 Comply','不满足','不适用','其他'].map(v=><option key={v}>{v}</option>)}</UiSelect></label>
   {form.proposedConclusion==='其他'&&<label className="field response-wide"><span>自定义结论</span><UiInput className="input" aria-label="评审自定义结论" maxLength={60} value={form.proposedConclusionText} onChange={e=>change('proposedConclusionText',e.target.value)} placeholder="填写非标准结论，如：部分满足，替代方案待客户确认"/></label>}
   <label className="field response-wide"><span>回复话术</span><UiTextArea className="input flow-textarea" aria-label="回复话术" value={form.proposedDraft} onChange={e=>change('proposedDraft',e.target.value)}/></label>
   {form.proposedConclusion==='不适用'&&<label className="field response-wide"><span>备注</span><UiTextArea className="input" aria-label="评审备注" value={form.reason} onChange={e=>change('reason',e.target.value)}/></label>}
  </div></fieldset>
  {editable&&<label className="field"><span>本人评审意见（选填）</span><UiTextArea className="input" aria-label="本人评审意见" value={note} onChange={e=>{setNote(e.target.value);mark(true);}}/></label>}
  {dirty&&<p className="muted">存在未保存的评审内容</p>}{error&&<p className="response-error" role="alert">{error}</p>}
  <details className="review-response-history"><summary>评审记录</summary>{(review.replies||[]).map((reply,i)=><p key={`reply-${i}`}>历史回复：{reply.reply} · {reply.assessment} · {reply.at} · {reply.by}</p>)}{(review.history||[]).map((entry,i)=><p key={i}>{entry.time} · {entry.actor} · {entry.action} {entry.reason}</p>)}{(review.confirmationHistory||[]).map((entry,i)=><p key={`old-${i}`}>历史版本 · 评审 V{entry.version}：{Object.values(entry.confirmations).map(v=>`${v.actor} ${v.at}`).join('；')} · 应答：{entry.response?.draft||entry.proposedDraft} · 方案：{entry.plan} · 证据：{entry.evidence}</p>)}</details>
  {editPeople&&<Modal title={editPeople==='reopen'?'重新评审':'调整评审人'} onClose={()=>setEditPeople(null)} footer={<><UiButton className="btn" onClick={()=>setEditPeople(null)}>取消</UiButton><UiButton className="btn btn-primary" disabled={!selected.length||!reason.trim()||!deadline} onClick={assign}>保存评审分工</UiButton></>}><ReviewerPicker state={state} project={project} value={selected} onChange={setSelected}/><label className="field"><span>截止时间</span><UiInput type="date" className="input" aria-label="评审截止时间" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><label className="field"><span>变更原因</span><UiTextArea className="input" aria-label="评审变更原因" value={reason} onChange={e=>setReason(e.target.value)}/></label><p className="muted">保存后全部评审人重新确认；历史记录保留。</p></Modal>}
  {leave&&<Modal title="评审内容尚未保存" onClose={()=>setLeave(null)} footer={<><UiButton className="btn" onClick={()=>setLeave(null)}>继续编辑</UiButton><UiButton className="btn" onClick={()=>{const next=leave;mark(false);setLeave(null);next();}}>放弃修改</UiButton><UiButton className="btn btn-primary" disabled={conflict} onClick={()=>{if(saveRef.current()){const next=leave;setLeave(null);next();}}}>保存后离开</UiButton></>}><p>保存当前应答和评审意见后继续，或放弃本次输入。</p></Modal>}
 </Surface>;
}
