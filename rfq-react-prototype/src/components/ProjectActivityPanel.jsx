import React from 'react';
import { History, MessageSquare, Users, ArrowUpRight } from 'lucide-react';
import { resolveSourceAnchor } from '../documentAnchors';

export default function ProjectActivityPanel({ project, requirements, reviews, snapshots = [], comments = [], members = [], audit = [], onLocate }) {
  const ids = new Set([project.id, ...requirements.map(r => r.id), ...reviews.map(r => r.id), ...snapshots.map(s => s.id)]);
  const events = audit.filter(event => ids.has(event.object) || String(event.object || '').startsWith(`${project.id} ·`)).slice(0, 30);
  return <div className="detail-activity">
    <div className="detail-section-intro"><Users size={17}/><div><strong>项目协作</strong><span>{members.length} 位成员 · 共同维护本轮应答</span></div></div>
    <div className="detail-member-list">{members.map(member => <div key={member.id}><span className="person-avatar">{member.name?.[0] || '员'}</span><span><strong>{member.name}</strong><small>{member.role}</small></span><span className="muted">{member.status}</span></div>)}</div>
    <div className="detail-section-intro"><MessageSquare size={17}/><div><strong>全部批注</strong><span>跨条款查看讨论，点击返回对应原文</span></div><span className="count-pill">{comments.length}</span></div>
    {comments.length ? comments.map(comment => {
      const result = resolveSourceAnchor(requirements.map(r => ({ ...r, projectId: project.id })), comment.anchor);
      return <button className="detail-comment-summary" key={comment.id} onClick={() => onLocate(comment)}><span><b>{result.row?.clause || '原文批注'} · {comment.status}</b><small>{comment.text || '空白批注'}</small><em>{result.status === 'resolved' ? '查看原文与讨论' : '历史版本 · 需要重新核对定位'}</em></span><ArrowUpRight size={14}/></button>;
    }) : <p className="detail-muted">暂无批注，选中原文后即可开始讨论。</p>}
    <div className="detail-section-intro"><History size={17}/><div><strong>操作记录</strong><span>保留实际处理人与操作时间</span></div></div>
    {events.length ? <div className="detail-timeline">{events.map(event => <div key={event.id}><i/><strong>{event.action}</strong><small>{event.time} · {event.actor}</small><p>{event.detail || event.object}</p></div>)}</div> : <p className="detail-muted">本项目暂无操作记录。</p>}
  </div>;
}
