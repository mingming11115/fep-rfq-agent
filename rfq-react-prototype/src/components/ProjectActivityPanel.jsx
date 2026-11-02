import React from 'react';
import { History, MessageSquare, Users, ArrowUpRight, ChevronDown } from "./icons";
import { resolveSourceAnchor } from '../documentAnchors';

function ActivityGroup({title,count,icon:Icon,children}){
  return <details className="detail-activity-group"><summary><Icon size={17}/><strong>{title}</strong><span className="count-pill">{count}</span><ChevronDown size={14} className="detail-activity-chevron" aria-hidden="true"/></summary><div className="detail-activity-group-body">{children}</div></details>;
}

export default function ProjectActivityPanel({ project, requirements, reviews, snapshots = [], comments = [], members = [], audit = [], onLocate }) {
  const ids = new Set([project.id, ...requirements.map(r => r.id), ...reviews.map(r => r.id), ...snapshots.map(s => s.id)]);
  const events = audit.filter(event => ids.has(event.object) || String(event.object || '').startsWith(`${project.id} ·`)).slice(0, 30);
  return <div className="detail-activity">
    <ActivityGroup key={project.id+':members'} title="项目成员" count={members.length} icon={Users}>
    <div className="detail-member-list">{members.map(member => <div key={member.id}><span className="person-avatar">{member.name?.[0] || '员'}</span><span><strong>{member.name}</strong><small>{member.role}</small></span><span className="muted">{member.status}</span></div>)}</div>
    </ActivityGroup>
    <ActivityGroup key={project.id+':comments'} title="全部批注" count={comments.length} icon={MessageSquare}>
    <p className="detail-muted">跨条款查看讨论，点击返回对应原文</p>
    {comments.length ? comments.map(comment => {
      const result = resolveSourceAnchor(requirements.map(r => ({ ...r, projectId: project.id })), comment.anchor);
      return <button className="detail-comment-summary" key={comment.id} onClick={() => onLocate(comment)}><span><b>{result.row?.clause || '原文批注'} · {comment.status}</b><small>{comment.text || '空白批注'}</small><em>{result.status === 'resolved' ? '查看原文与讨论' : '历史版本 · 需要重新核对定位'}</em></span><ArrowUpRight size={14}/></button>;
    }) : <p className="detail-muted">暂无批注，选中原文后即可开始讨论。</p>}
    </ActivityGroup>
    <ActivityGroup key={project.id+':history'} title="操作记录" count={'最近 '+events.length} icon={History}>
    <p className="detail-muted">最近 30 条 · 保留实际处理人与操作时间</p>
    {events.length ? <div className="detail-timeline">{events.map(event => <div key={event.id}><i/><strong>{event.action}</strong><small>{event.time} · {event.actor}</small><p>{event.detail || event.object}</p></div>)}</div> : <p className="detail-muted">本项目暂无操作记录。</p>}
    </ActivityGroup>
  </div>;
}
