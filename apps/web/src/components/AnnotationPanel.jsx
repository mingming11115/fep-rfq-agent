import { UiButton, UiTag } from './AntContent';
import React, { useEffect, useRef, useState } from 'react';
import { Mentions } from 'antd';
import { filterPeople } from '../personPicker';
import { mentionIds, mentionMatches } from '../antdAdapters';
import { MessageSquare, ArrowUpRight, Check, Send } from "./icons";
import { promoteCommentToIssue, resolveComment } from '../commentDomain';
import { resolveSourceAnchor } from '../documentAnchors';

export default function AnnotationPanel({ people = [], comments, anchor, rows, onChange, onPromote, onLocate, actorId, canEdit, canManage=false, quoteDraft, onClearQuote, activeCommentId, onSelectComment, editRequest, onEditRequestHandled }) {
  const [text, setText] = useState(''), [reply, setReply] = useState({}), [editing, setEditing] = useState(null), [editedText, setEditedText] = useState('');
  const panel = useRef();
  const options = filterPeople(people).map(person => ({ value: person.id, label: person.name + ' · ' + person.id }));
  const current = comments.filter(c => !c.nativeDeleted && c.anchor.requirementId === anchor.requirementId && c.anchor.projectId === anchor.projectId && c.anchor.fileId === anchor.fileId && String(c.anchor.sourceVersion) === String(anchor.sourceVersion));
  const currentRow=resolveSourceAnchor(rows,anchor).row;
  const clauseLabel=[currentRow?.clause&&'条款 '+currentRow.clause,currentRow?.title].filter(Boolean).join(' ');
  useEffect(() => {
    const target = panel.current?.querySelector('[data-comment-active="true"]'), scroll = panel.current?.closest('.detail-side-content');
    if (target && scroll) scroll.scrollTo({ top: scroll.scrollTop + target.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 20, behavior: 'smooth' });
  }, [activeCommentId]);
  useEffect(() => { setEditing(null); setEditedText('');setText('');setReply({}); }, [actorId, canEdit, anchor.projectId, anchor.fileId, anchor.sourceVersion, anchor.requirementId]);
  useEffect(() => {
    const comment=current.find(c=>c.id===editRequest?.id);
    if(canEdit&&comment?.createdBy===actorId&&(!editRequest.actorId||editRequest.actorId===actorId)){setEditing(comment.id);setEditedText(comment.text);}
    if(editRequest)onEditRequestHandled?.(editRequest);
  }, [editRequest]);
  useEffect(()=>{if(editing)panel.current?.querySelector('[aria-label="修改批注"]')?.focus();},[editing]);
  useEffect(()=>{if(quoteDraft&&canEdit)panel.current?.querySelector('[aria-label="新增批注内容"]')?.focus();},[quoteDraft]);
  function remove(comment){
    if(!canEdit||(!canManage&&comment.createdBy!==actorId))return;
    onChange(latest=>latest.map(c=>c.id===comment.id&&!c.nativeDeleted&&(canManage||c.createdBy===actorId)?{...c,nativeDeleted:true,...(c.nativeRef?{nativeRef:{...c.nativeRef,state:'delete-pending'}}:{})}:c));setEditing(null);onSelectComment?.(null);
  }
  function cancelEdit(comment){
    if(!comment.text.trim()&&!(comment.replies||[]).some(reply=>reply.text?.trim()))remove(comment);
    else setEditing(null);
  }
  function add() {
    if (!canEdit || !text.trim()) return;
    const id = `COMMENT-${crypto.randomUUID()}`;
    onChange([{ id, anchor: quoteDraft?.anchor || anchor, quote: quoteDraft?.quote || anchor.locator?.quote, text: text.trim(), mentionedUserIds: mentionIds(text.trim(), people), status: '未解决', createdBy: actorId, createdAt: new Date().toISOString(), replies: [], linkedIssues: {} }, ...comments]);
    setText(''); onClearQuote(); onSelectComment?.(id);
  }
  return <div className="annotation-panel" ref={panel}>
    <div className="detail-section-intro"><MessageSquare size={17}/><div><strong>当前条款讨论</strong><span>{clauseLabel&&clauseLabel+' · '}批注与对外应答分别保存</span></div><span className="count-pill">{current.length}</span></div>
    {canEdit && quoteDraft && <div className="annotation-compose"><blockquote>{quoteDraft.quote}</blockquote><Mentions className="rfq-mentions" aria-label="新增批注内容" placeholder="写下问题或意见，输入 @ 提及项目成员…" options={options} filterOption={mentionMatches} prefix={['@','＠']} value={text} onChange={setText} autoSize={{minRows:3,maxRows:8}}/><div><span className="muted">已关联所选原文</span><UiButton className="text-link" onClick={()=>{setText('');onClearQuote();}}>取消</UiButton><UiButton className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={add}><Send size={13}/>保存批注</UiButton></div></div>}
    {current.map(c => {
      const resolved = resolveSourceAnchor(rows, c.anchor), selected = activeCommentId === c.id;
      const createdAt = c.createdAt && Number.isFinite(new Date(c.createdAt).getTime()) ? new Date(c.createdAt).toLocaleString('zh-CN') : '';
      return <article key={c.id} className={`annotation-card ${selected ? 'active' : ''}`} data-comment-active={selected} data-comment-card-id={c.id} onClick={() => onSelectComment?.(c.id)}>
        <div><UiTag className={`badge ${c.status === '已解决' ? 'success' : 'neutral'}`}>{c.status}</UiTag><UiButton className="text-link" disabled={resolved.status !== 'resolved'} onClick={() => { onSelectComment?.(c.id); onLocate(c.anchor, c.id); }}>定位原文<ArrowUpRight size={12}/></UiButton></div>
        <blockquote>{c.quote}</blockquote>
        {editing === c.id && canEdit && c.createdBy === actorId ? <div className="annotation-edit"><Mentions className="rfq-mentions" aria-label="修改批注" options={options} filterOption={mentionMatches} prefix={['@','＠']} value={editedText} onChange={setEditedText} autoSize={{minRows:3,maxRows:8}}/><UiButton className="text-link" onClick={event => {event.stopPropagation();cancelEdit(c);}}>取消</UiButton><UiButton className="text-link" disabled={!editedText.trim()} onClick={() => { if (!canEdit || c.createdBy !== actorId) return; onChange(comments.map(v => v.id === c.id ? { ...v, text: editedText.trim(), mentionedUserIds: mentionIds(editedText.trim(), people), editedAt: new Date().toISOString() } : v)); setEditing(null); }}>保存修改</UiButton></div> : <p>{c.text||'新批注，等待填写'}</p>}
        <small>{c.nativeAuthor || ({ 'demo-sales': 'SR', 'demo-technical': '技术', 'demo-approver': '最终审批人' })[c.createdBy] || c.createdBy}{createdAt && ` · ${createdAt}`}</small>
        {c.nativeRef && <small>{c.nativeRef.state==='saved'?'原文件已保存':c.nativeRef.state==='conflict'?'原文件有同步冲突，请核对':'原文件待保存'}</small>}
        {resolved.status !== 'resolved' && <p className="response-error">旧版本批注，原文定位需重新核对。</p>}
        <div className="workspace-row-actions">
          {canEdit && <UiButton className="text-link" onClick={() => onChange(comments.map(v => v.id === c.id ? (v.status==='已解决'?{...v,status:'未解决',resolvedBy:undefined,resolvedAt:undefined}:resolveComment(v, actorId, new Date().toISOString())) : v))}><Check size={12}/>{c.status==='已解决'?'重新打开':'解决'}</UiButton>}
          {canEdit && c.createdBy === actorId && <UiButton className="text-link" onClick={() => { setEditing(c.id); setEditedText(c.text); }}>编辑</UiButton>}
          {canEdit && (canManage || c.createdBy===actorId) && <UiButton className="text-link" onClick={event=>{event.stopPropagation();remove(c);}}>删除</UiButton>}
          {['review'].map(kind => <UiButton className="text-link" disabled={!c.linkedIssues?.[kind] && (!canEdit || resolved.status !== 'resolved')} key={kind} onClick={() => {
            const issue = promoteCommentToIssue(c, { kind, actor: actorId, at: new Date().toISOString() });
            const id = onPromote(issue); if (id) onChange(comments.map(v => v.id === c.id ? { ...v, linkedIssues: { ...v.linkedIssues, [kind]: id } } : v));
          }}>{c.linkedIssues?.[kind] ? '查看关联' : '转'}{kind === 'review' ? '评审' : '澄清'}</UiButton>)}
        </div>
        {(c.replies || []).map((r, i) => <div className="annotation-reply" key={i}>{r.text}<small>{r.nativeAuthor || ({ 'demo-sales': 'SR', 'demo-technical': '技术', 'demo-approver': '最终审批人' })[r.by] || r.by}</small></div>)}
        {canEdit && <div className="annotation-reply-form"><Mentions className="rfq-mentions" aria-label={`回复批注 ${c.id}`} placeholder="回复，输入 @ 提及成员…" options={options} filterOption={mentionMatches} prefix={['@','＠']} value={reply[c.id] || ''} onChange={value => setReply({ ...reply, [c.id]: value })} autoSize={{minRows:1,maxRows:5}}/><UiButton className="text-link" disabled={!reply[c.id]?.trim()} onClick={() => { onChange(comments.map(v => v.id === c.id ? { ...v, replies: [...(v.replies || []), { text: reply[c.id].trim(), mentionedUserIds: mentionIds(reply[c.id].trim(), people), by: actorId, at: new Date().toISOString() }] } : v)); setReply({ ...reply, [c.id]: '' }); }}>回复</UiButton></div>}
      </article>;
    })}
    {!current.length && <div className="detail-empty"><MessageSquare size={28}/><strong>本条还没有批注</strong><p>在左侧选中一段文字，记录问题或补充说明。</p></div>}
  </div>;
}
