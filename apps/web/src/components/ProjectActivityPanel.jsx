import React, { useEffect, useState } from 'react';
import { Alert, Skeleton, Tag } from 'antd';
import { api } from '../authClient.js';
import { ChevronDown, Clock3, History } from './icons';
import { EmptyState } from './ui';
import './project-activity.css';

function getConfirmationChange({ action, objectType, detail }, accountsById) {
  if (action !== '分派条款确认人' || objectType !== 'requirement') return null;
  const assignment = /^(.+?) -> (.+?)：([\s\S]*)$/.exec(detail || '');
  if (!assignment) return null;

  const [, beforeId, afterId, reason] = assignment;
  const before = beforeId === 'null' ? '默认确认人' : accountsById[beforeId]?.name || beforeId;
  const after = accountsById[afterId]?.name || afterId;
  return { before, after, reason };
}

export default function ProjectActivityPanel({ project, requirements, reviews, snapshots = [], audit = [], databaseBacked, accountsById = {} }) {
  const [activity, setActivity] = useState(null);
  useEffect(() => {
    if (!databaseBacked) return;
    let cancelled = false;
    api.get(`/projects/${encodeURIComponent(project.id)}/activity`).then(events => {
      if (!cancelled) setActivity({ events });
    }, error => {
      if (!cancelled) setActivity({ error: error.message });
    });
    return () => { cancelled = true; };
  }, [databaseBacked, project.id]);

  const ids = new Set([project.id, ...requirements.map(r => r.id), ...reviews.map(r => r.id), ...snapshots.map(s => s.id)]);
  const events = databaseBacked ? (activity?.events || []).map(event => ({
    ...event,
    object: event.objectId,
    confirmationChange: getConfirmationChange(event, accountsById),
    actor: accountsById[event.actorId]?.name || event.actorId || '系统',
    time: new Date(event.createdAt).toLocaleString('zh-CN', { hour12: false }),
  })) : audit.filter(event => ids.has(event.object) || String(event.object || '').startsWith(`${project.id} ·`)).slice(0, 30);
  const loading = databaseBacked && !activity;

  return <div className="detail-activity">
    <details className="detail-activity-group" open>
      <summary>
        <span className="detail-activity-icon" aria-hidden="true"><History size={17}/></span>
        <span className="detail-activity-heading"><strong>操作记录</strong><small>由新到旧 · 最多 30 条</small></span>
        {!loading && !activity?.error && <Tag bordered={false} className="detail-activity-count">{events.length} 条</Tag>}
        <ChevronDown size={14} className="detail-activity-chevron" aria-hidden="true"/>
      </summary>
      <div className="detail-activity-group-body">
        {loading ? <div role="status" className="detail-activity-loading">
          <span>正在读取操作记录…</span><Skeleton active title={false} paragraph={{ rows: 2 }}/>
        </div> : activity?.error ? <Alert type="error" showIcon message="读取操作记录失败" description={activity.error}/>
          : events.length ? <ol className="detail-timeline" aria-label="项目操作时间线" role="list">
            {events.map((event, index) => <li key={event.id} className="detail-activity-entry" style={{ '--entry-index': index }}>
              <article className="detail-activity-card">
                <div className="detail-activity-card-title">
                  <strong>{event.action}</strong>
                  {event.result && <Tag bordered={false} color={event.result === '失败' ? 'error' : 'success'}>{event.result}</Tag>}
                </div>
                <small className="detail-activity-meta">
                  <Clock3 size={12} aria-hidden="true"/>{' '}
                  {event.createdAt ? <time dateTime={event.createdAt}>{event.time}</time> : event.time}{' · '}{event.actor}
                </small>
                {event.confirmationChange ? <>
                  <div className="detail-activity-assignment">
                    <span>{event.confirmationChange.before}</span>{' → '}<span>{event.confirmationChange.after}</span>
                  </div>
                  {event.confirmationChange.reason && <p className="detail-activity-reason"><span>原因</span>{' '}{event.confirmationChange.reason}</p>}
                </> : <p>{event.detail || event.object}</p>}
              </article>
            </li>)}
          </ol> : <EmptyState title="本项目暂无操作记录。"/>}
      </div>
    </details>
  </div>;
}
