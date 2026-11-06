import React from 'react';
import { History, ChevronDown } from "./icons";

function ActivityGroup({title,count,icon:Icon,children}){
  return <details className="detail-activity-group" open><summary><Icon size={17}/><strong>{title}</strong><span className="count-pill">{count}</span><ChevronDown size={14} className="detail-activity-chevron" aria-hidden="true"/></summary><div className="detail-activity-group-body">{children}</div></details>;
}

export default function ProjectActivityPanel({ project, requirements, reviews, snapshots = [], audit = [] }) {
  const ids = new Set([project.id, ...requirements.map(r => r.id), ...reviews.map(r => r.id), ...snapshots.map(s => s.id)]);
  const events = audit.filter(event => ids.has(event.object) || String(event.object || '').startsWith(`${project.id} ·`)).slice(0, 30);
  return <div className="detail-activity">
    <ActivityGroup key={project.id+':history'} title="操作记录" count={'最近 '+events.length} icon={History}>
    <p className="detail-muted">最近 30 条 · 保留实际处理人与操作时间</p>
    {events.length ? <div className="detail-timeline">{events.map(event => <div key={event.id}><i/><strong>{event.action}</strong><small>{event.time} · {event.actor}</small><p>{event.detail || event.object}</p></div>)}</div> : <p className="detail-muted">本项目暂无操作记录。</p>}
    </ActivityGroup>
  </div>;
}
