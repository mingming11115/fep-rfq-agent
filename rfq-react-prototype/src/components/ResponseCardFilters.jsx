import React from 'react';
import { Search } from 'lucide-react';

export const EMPTY_CARD_FILTERS = { query: '', type: 'all', status: 'all', source: 'all' };
const groups = [['all', '总应答项'], ['pending', '未处理'], ['confirmed', '已审核'], ['waiting', '待确认']];

export default function ResponseCardFilters({ stats, filters, draft, sources, disabled, onDraftChange, onApply, onReset }) {
  const change = (field, value) => onDraftChange({ ...draft, [field]: value });
  return <div className="response-card-top">
    <div className="response-card-stats" aria-label="应答统计">{groups.map(([key, label]) => <button type="button" key={key} disabled={disabled} aria-pressed={filters.status === key} onClick={() => onApply({ ...draft, status: key })}><span>{label}</span><strong>{stats[key]}</strong></button>)}</div>
    <div className="response-card-filters" role="search" aria-label="搜索和筛选应答">
      <label className="response-card-search"><span>搜索事项</span><div><Search size={14}/><input className="input" aria-label="搜索事项" placeholder="条款编号、要求名称、责任人" value={draft.query} disabled={disabled} onChange={e => change('query', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onApply(draft); } }}/></div></label>
      <label><span>事项类型</span><select className="select" aria-label="事项类型" value={draft.type} disabled={disabled} onChange={e => change('type', e.target.value)}><option value="all">全部类型</option><option value="ordinary">一般应答</option><option value="review">评审</option></select></label>
      <label><span>处理状态</span><select className="select" aria-label="处理状态" value={draft.status} disabled={disabled} onChange={e => change('status', e.target.value)}>{groups.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label><span>偏离来源</span><select className="select" aria-label="偏离来源" value={draft.source} disabled={disabled} onChange={e => change('source', e.target.value)}><option value="all">全部来源</option>{sources.map(source => <option key={source}>{source}</option>)}</select></label>
      <div><button type="button" className="btn btn-primary" disabled={disabled} onClick={() => onApply(draft)}>查询</button><button type="button" className="btn" disabled={disabled} onClick={onReset}>重置</button></div>
    </div>
  </div>;
}
