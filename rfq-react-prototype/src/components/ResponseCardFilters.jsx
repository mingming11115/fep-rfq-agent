import React, { useRef, useState } from 'react';
import { Button, Input, Popover, Select } from 'antd';
import { Search, SlidersHorizontal } from "./icons";
import {RESPONSE_STATUS_LABELS} from '../responseCardQueue';

export const EMPTY_CARD_FILTERS = { query: '', status: 'all', source: 'all', type: 'all' };
const groups = [['all', '全部'], ...Object.entries(RESPONSE_STATUS_LABELS)];

export function ResponseCardQuery({ filters, draft, sources = [], disabled, onDraftChange, onApply, compact=false }) {
  const [open, setOpen] = useState(false);
  const [searchOpen,setSearchOpen]=useState(false),searchInput=useRef(null);
  const [conditions, setConditions] = useState(EMPTY_CARD_FILTERS);
  const activeFilters = ['status', 'source', 'type'].filter(key => filters[key] && filters[key] !== 'all').length;
  const change = (key, value) => setConditions(current => ({ ...current, [key]: value }));
  const apply = values => { setOpen(false); onApply(values); };
  const toggleFilters=value=>{if(disabled)return;if(value)setConditions({...EMPTY_CARD_FILTERS,...filters});setOpen(value);};
  const content = <div className="response-filter-popover">
    <label><span>处理状态</span><Select aria-label="处理状态筛选" value={conditions.status} onChange={value => change('status', value)} options={groups.map(([value, label]) => ({ value, label }))}/></label>
    <label><span>事项类型</span><Select aria-label="事项类型筛选" value={conditions.type || 'all'} onChange={value => change('type', value)} options={[{ value: 'all', label: '全部类型' }, { value: 'ordinary', label: '普通应答' }, { value: 'review', label: '专项评审' }, { value: 'clarification', label: '客户澄清' }]}/></label>
    <label><span>偏离来源</span><Select aria-label="偏离来源筛选" value={conditions.source} onChange={value => change('source', value)} options={[{ value: 'all', label: '全部来源' }, ...sources.map(value => ({ value, label: value }))]}/></label>
    <div className="response-filter-popover-actions"><Button onClick={() => apply({ ...EMPTY_CARD_FILTERS })}>重置筛选</Button><Button type="primary" onClick={() => apply({ ...draft, ...conditions, query: draft.query })}>应用筛选</Button></div>
  </div>;
  const filterButton=<Button className={activeFilters ? 'response-filter-trigger is-active' : 'response-filter-trigger'} aria-label={activeFilters ? `筛选应答，已启用 ${activeFilters} 项` : '筛选应答'} aria-expanded={open && !disabled} disabled={disabled} onClick={compact?()=>toggleFilters(!open):undefined} icon={<SlidersHorizontal size={14}/>}>{activeFilters > 0 && <span>{activeFilters}</span>}</Button>;
  const query=<div className={`response-card-query ${compact?'response-card-query-popup':''}`} role="search" aria-label="搜索应答" onKeyDown={event=>{if(compact&&event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);setSearchOpen(false);}}}>
    <Input.Search ref={searchInput} aria-label="搜索事项" placeholder="搜索条款、要求或责任人" value={draft.query} disabled={disabled} allowClear onChange={e => onDraftChange({ ...draft, query: e.target.value })} onSearch={query => onApply({ ...draft, query })}/>
    {compact?filterButton:<Popover title="筛选应答" content={content} trigger="click" placement="bottomRight" open={open && !disabled} onOpenChange={toggleFilters}>{filterButton}</Popover>}
    {compact&&open&&!disabled&&content}
  </div>;
  if(!compact)return query;
  const active=Boolean(filters.query?.trim()||activeFilters);
  return <Popover title="搜索与筛选应答" content={query} trigger="click" placement="bottomRight" open={searchOpen&&!disabled} onOpenChange={value=>{if(!disabled)setSearchOpen(value);if(!value)setOpen(false);}} afterOpenChange={value=>{if(value)searchInput.current?.focus();}}>
    <Button size="small" className={active?'response-query-trigger is-active':'response-query-trigger'} aria-label="搜索与筛选应答" title={active?'搜索与筛选应答（已启用条件）':'搜索与筛选应答'} aria-expanded={searchOpen&&!disabled} disabled={disabled} icon={<Search size={14}/>}/>
  </Popover>;
}

export default function ResponseCardFilters({ stats, filters, draft, disabled, onApply }) {
  return <div className="response-card-top">
    <div className="response-card-stats" aria-label="应答统计">{groups.map(([key, label]) => <button type="button" key={key} disabled={disabled} aria-pressed={filters.status === key} onClick={() => onApply({ ...draft, status: key })}><span>{label}</span><strong>{stats[key]}</strong></button>)}</div>
  </div>;
}
