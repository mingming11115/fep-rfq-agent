import React, { useEffect, useRef, useState } from 'react';
import { Mentions } from 'antd';
import { filterPeople } from '../personPicker';
import { mentionIds } from '../antdAdapters';
import { MessageSquare, ArrowUpRight, Check, Send } from 'lucide-react';
import { promoteCommentToIssue, resolveComment } from '../commentDomain';
import { resolveSourceAnchor } from '../documentAnchors';

export default function AnnotationPanel({ people = [], comments, anchor, rows, onChange, onPromote, onLocate, actorId, canEdit, quoteDraft, onClearQuote, activeCommentId, onSelectComment }) {
  const [text, setText] = useState(''), [reply, setReply] = useState({}), [editing, setEditing] = useState(null), [editedText, setEditedText] = useState('');
  const panel = useRef();
  const options = filterPeople(people).map(person => ({ value: person.id, label: person.name + ' · ' + person.id }));
  const current = comments.filter(c => c.anchor.requirementId === anchor.requirementId && c.anchor.fileId === anchor.fileId);
  useEffect(() => {
    const target = panel.current?.querySelector('[data-comment-active="true"]'), scroll = panel.current?.closest('.detail-side-content');
    if (target && scroll) scroll.scrollTo({ top: scroll.scrollTop + target.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 20, behavior: 'smooth' });
  }, [activeCommentId]);
  useEffect(() => { setEditing(null); setEditedText(''); }, [actorId, canEdit]);
  function add() {
    if (!canEdit || !text.trim()) return;
    const id = `COMMENT-${crypto.randomUUID()}`;
    onChange([{ id, anchor: quoteDraft?.anchor || anchor, quote: quoteDraft?.quote || anchor.locator?.quote, text: text.trim(), mentionedUserIds: mentionIds(text.trim(), people), status: '未解决', createdBy: actorId, createdAt: new Date().toISOString(), replies: [], linkedIssues: {} }, ...comments]);
    setText(''); onClearQuote(); onSelectComment?.(id);
  }
  return <div className="annotation-panel" ref={panel}>
    <div className="detail-section-intro"><MessageSquare size={17}/><div><strong>围绕原文讨论</strong><span>批注与对外应答分别保存</span></div><span className="count-pill">{current.length}</span></div>
    {canEdit && <div className="annotation-compose"><blockquote>{quoteDraft?.quote || anchor.locator?.quote}</blockquote><Mentions className="rfq-mentions" aria-label="新增批注内容" placeholder="写下问题或意见，输入 @ 提及项目成员…" options={options} prefix={['@','＠']} value={text} onChange={setText} autoSize={{minRows:3,maxRows:8}}/><div><span className="muted">{quoteDraft ? '已关联所选原文' : '关联当前条款'}</span><button className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={add}><Send size={13}/>保存批注</button></div></div>}
    {current.map(c => {
      const resolved = resolveSourceAnchor(rows, c.anchor), selected = activeCommentId === c.id;
      return <article key={c.id} className={`annotation-card ${selected ? 'active' : ''}`} data-comment-active={selected} data-comment-card-id={c.id} onClick={() => onSelectComment?.(c.id)}>
        <div><span className={`badge ${c.status === '已解决' ? 'success' : 'neutral'}`}>{c.status}</span><button className="text-link" disabled={resolved.status !== 'resolved'} onClick={() => { onSelectComment?.(c.id); onLocate(c.anchor, c.id); }}>定位原文<ArrowUpRight size={12}/></button></div>
        <blockquote>{c.quote}</blockquote>
        {editing === c.id && canEdit && c.createdBy === actorId ? <div className="annotation-edit"><Mentions className="rfq-mentions" aria-label="修改批注" options={options} prefix={['@','＠']} value={editedText} onChange={setEditedText} autoSize={{minRows:3,maxRows:8}}/><button className="text-link" onClick={() => setEditing(null)}>取消</button><button className="text-link" disabled={!editedText.trim()} onClick={() => { if (!canEdit || c.createdBy !== actorId) return; onChange(comments.map(v => v.id === c.id ? { ...v, text: editedText.trim(), mentionedUserIds: mentionIds(editedText.trim(), people), editedAt: new Date().toISOString() } : v)); setEditing(null); }}>保存修改</button></div> : <p>{c.text}</p>}
        <small>{({ 'demo-sales': 'SR', 'demo-technical': '技术', 'demo-approver': '最终审批人' })[c.createdBy] || c.createdBy} · {new Date(c.createdAt).toLocaleString('zh-CN')}</small>
        {resolved.status !== 'resolved' && <p className="response-error">旧版本批注，原文定位需重新核对。</p>}
        <div className="workspace-row-actions">
          {canEdit && c.status !== '已解决' && <button className="text-link" onClick={() => onChange(comments.map(v => v.id === c.id ? resolveComment(v, actorId, new Date().toISOString()) : v))}><Check size={12}/>解决</button>}
          {canEdit && c.createdBy === actorId && <button className="text-link" onClick={() => { setEditing(c.id); setEditedText(c.text); }}>编辑</button>}
          {['review'].map(kind => <button className="text-link" disabled={!c.linkedIssues?.[kind] && (!canEdit || resolved.status !== 'resolved')} key={kind} onClick={() => {
            const issue = promoteCommentToIssue(c, { kind, actor: actorId, at: new Date().toISOString() });
            const id = onPromote(issue); if (id) onChange(comments.map(v => v.id === c.id ? { ...v, linkedIssues: { ...v.linkedIssues, [kind]: id } } : v));
          }}>{c.linkedIssues?.[kind] ? '查看关联' : '转'}{kind === 'review' ? '评审' : '澄清'}</button>)}
        </div>
        {(c.replies || []).map((r, i) => <div className="annotation-reply" key={i}>{r.text}<small>{({ 'demo-sales': 'SR', 'demo-technical': '技术', 'demo-approver': '最终审批人' })[r.by] || r.by}</small></div>)}
        {canEdit && <div className="annotation-reply-form"><Mentions className="rfq-mentions" aria-label={`回复批注 ${c.id}`} placeholder="回复，输入 @ 提及成员…" options={options} prefix={['@','＠']} value={reply[c.id] || ''} onChange={value => setReply({ ...reply, [c.id]: value })} autoSize={{minRows:1,maxRows:5}}/><button className="text-link" disabled={!reply[c.id]?.trim()} onClick={() => { onChange(comments.map(v => v.id === c.id ? { ...v, replies: [...(v.replies || []), { text: reply[c.id].trim(), mentionedUserIds: mentionIds(reply[c.id].trim(), people), by: actorId, at: new Date().toISOString() }] } : v)); setReply({ ...reply, [c.id]: '' }); }}>回复</button></div>}
      </article>;
    })}
    {!current.length && <div className="detail-empty"><MessageSquare size={28}/><strong>本条还没有批注</strong><p>在左侧选中一段文字，记录问题或补充说明。</p></div>}
  </div>;
}
