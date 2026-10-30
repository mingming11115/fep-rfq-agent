import React, { useState } from 'react';
import { Button, Input, Popover, Select } from 'antd';
import { SlidersHorizontal } from "./icons";
import {RESPONSE_STATUS_LABELS} from '../responseCardQueue';

export const EMPTY_CARD_FILTERS = { query: '', status: 'all', source: 'all', type: 'all' };
const groups = [['all', '全部'], ...Object.entries(RESPONSE_STATUS_LABELS)];

export function ResponseCardQuery({ filters, draft, sources = [], disabled, onDraftChange, onApply }) {
  const [open, setOpen] = useState(false);
  const [conditions, setConditions] = useState(EMPTY_CARD_FILTERS);
  const activeFilters = ['status', 'source', 'type'].filter(key => filters[key] && filters[key] !== 'all').length;
  const change = (key, value) => setConditions(current => ({ ...current, [key]: value }));
  const apply = values => { setOpen(false); onApply(values); };
  const content = <div className="response-filter-popover">
    <label><span>处理状态</span><Select aria-label="处理状态筛选" value={conditions.status} onChange={value => change('status', value)} options={groups.map(([value, label]) => ({ value, label }))}/></label>
    <label><span>事项类型</span><Select aria-label="事项类型筛选" value={conditions.type || 'all'} onChange={value => change('type', value)} options={[{ value: 'all', label: '全部类型' }, { value: 'ordinary', label: '普通应答' }, { value: 'review', label: '专项评审' }, { value: 'clarification', label: '客户澄清' }]}/></label>
    <label><span>偏离来源</span><Select aria-label="偏离来源筛选" value={conditions.source} onChange={value => change('source', value)} options={[{ value: 'all', label: '全部来源' }, ...sources.map(value => ({ value, label: value }))]}/></label>
    <div className="response-filter-popover-actions"><Button onClick={() => apply({ ...EMPTY_CARD_FILTERS })}>重置筛选</Button><Button type="primary" onClick={() => apply({ ...draft, ...conditions, query: draft.query })}>应用筛选</Button></div>
  </div>;
  return <div className="response-card-query" role="search" aria-label="搜索应答">
    <Input.Search aria-label="搜索事项" placeholder="搜索条款、要求或责任人" value={draft.query} disabled={disabled} allowClear onChange={e => onDraftChange({ ...draft, query: e.target.value })} onSearch={query => onApply({ ...draft, query })}/>
    <Popover title="筛选应答" content={content} trigger="click" placement="bottomRight" open={open && !disabled} onOpenChange={value => { if (disabled) return; if (value) setConditions({ ...EMPTY_CARD_FILTERS, ...filters }); setOpen(value); }}>
      <Button className={activeFilters ? 'response-filter-trigger is-active' : 'response-filter-trigger'} aria-label={activeFilters ? `筛选应答，已启用 ${activeFilters} 项` : '筛选应答'} aria-expanded={open && !disabled} disabled={disabled} icon={<SlidersHorizontal size={14}/>}>{activeFilters > 0 && <span>{activeFilters}</span>}</Button>
    </Popover>
  </div>;
}

export default function ResponseCardFilters({ stats, filters, draft, disabled, onApply }) {
  return <div className="response-card-top">
    <div className="response-card-stats" aria-label="应答统计">{groups.map(([key, label]) => <button type="button" key={key} disabled={disabled} aria-pressed={filters.status === key} onClick={() => onApply({ ...draft, status: key })}><span>{label}</span><strong>{stats[key]}</strong></button>)}</div>
  </div>;
}
