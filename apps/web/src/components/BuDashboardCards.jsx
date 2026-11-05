import React from 'react';
import {ProCard,StatisticCard} from '@ant-design/pro-components';
import BuMetricLabel from './BuMetricHelp';
import AnimatedNumber from './AnimatedNumber';

export function BuPanel({title,metric=title,description,extra,children,className='',bodyStyle}){
 return <ProCard className={`bu-card ${className}`} bordered headerBordered
  title={<div className="bu-panel-title"><h2>{metric?<BuMetricLabel metric={metric}>{title}</BuMetricLabel>:title}</h2>{description&&<span>{description}</span>}</div>}
  extra={extra} bodyStyle={bodyStyle}>{children}</ProCard>;
}

export function BuStatisticCard({label,value,unit,note,Icon,tone='blue',onFilter,selected=false}){
 return <StatisticCard className={`bu-stat bu-stat-${tone} ${selected?'is-selected':''}`} bordered
  statistic={{title:<div className="bu-stat-heading"><BuMetricLabel metric={label}/>{Icon&&<span className="bu-stat-icon"><Icon size={18}/></span>}</div>,value,formatter:()=> <AnimatedNumber value={value}/>,suffix:unit}}
  footer={<span className="bu-stat-note">{note}</span>}>
  {onFilter&&<button type="button" className="bu-stat-filter" aria-label={`筛选${label}`} aria-pressed={selected} onClick={onFilter}/>}
 </StatisticCard>;
}
