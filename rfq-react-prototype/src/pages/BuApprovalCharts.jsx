import { UiTag } from '../components/AntContent';
import React,{useId,useState} from 'react';
import {buildApprovalLineGeometry} from '../approvalChartGeometry';
import './bu-approval-charts.css';

const colors={current:'#5c88d5',previous:'#a4b2c6',approved:'#67aaa1',rejected:'#dca66a'};
const hoursText=(value,formatHours)=>value===null?'无办结记录':`${formatHours(value)} 小时`;

function ApprovalTrend({charts,formatHours}){
 const [active,setActive]=useState(null),gradientId=useId().replaceAll(':','');
 const {trend,bucketDays}=charts,geometry=buildApprovalLineGeometry(trend),{plot}=geometry;
 const lastRecorded=trend.findLastIndex(point=>point.averageHours!==null||point.previousAverageHours!==null);
 const selectedIndex=active??lastRecorded,selected=trend[selectedIndex];
 const columnWidth=(plot.right-plot.left)/Math.max(1,trend.length-1);
 const pointDescription=point=>`${point.rangeLabel}，本期${hoursText(point.averageHours,formatHours)}，${point.count}轮；上一周期${point.previousRangeLabel}，${hoursText(point.previousAverageHours,formatHours)}，${point.previousCount}轮`;
 return <section className="panel bu-chart-panel bu-trend-panel">
  <div className="workspace-panel-heading"><div><h2>审批时长趋势</h2><p>本期与上期平均审批时长；无记录区间保留空档。</p></div><UiTag className="badge">每 {bucketDays} 天</UiTag></div>
  <div className="bu-chart-legend"><span><i style={{background:colors.current}}/>本期</span><span><i className="is-dashed"/>上期对应区间</span><small>单位：小时／轮</small></div>
  <div className="bu-trend-canvas">
   <svg className="bu-trend-svg" viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="group" aria-label="审批时长趋势图" onMouseLeave={()=>setActive(null)}>
    <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors.current} stopOpacity=".16"/><stop offset="100%" stopColor={colors.current} stopOpacity="0"/></linearGradient></defs>
    {geometry.ticks.map(tick=><g key={tick.value}><line x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} className="bu-chart-gridline"/><text x={plot.left-12} y={tick.y+4} textAnchor="end" className="bu-chart-axis">{Number(tick.value.toPrecision(3))}</text></g>)}
    {geometry.series.current.filter(segment=>segment.length>1).map((segment,index)=><polygon key={index} points={`${segment[0].x},${plot.bottom} ${segment.map(point=>`${point.x},${point.y}`).join(' ')} ${segment.at(-1).x},${plot.bottom}`} fill={`url(#${gradientId})`}/>)}
    {Object.entries(geometry.series).map(([series,segments])=>segments.filter(segment=>segment.length>1).map((segment,index)=><polyline key={`${series}-${index}`} points={segment.map(point=>`${point.x},${point.y}`).join(' ')} fill="none" stroke={colors[series]} strokeWidth="2.5" strokeDasharray={series==='previous'?'6 5':undefined} vectorEffect="non-scaling-stroke"/>))}
    {geometry.points.map((point,index)=>{
     const datum=trend[index],left=Math.max(plot.left,point.x-columnWidth/2),right=Math.min(plot.right,point.x+columnWidth/2);
     return <g key={index} className="bu-chart-point" role="button" tabIndex="0" aria-label={pointDescription(datum)} onMouseEnter={()=>setActive(index)} onFocus={()=>setActive(index)} onBlur={()=>setActive(null)} onClick={()=>setActive(index)} onKeyDown={event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();setActive(index);}}}>
      <rect x={left} y={plot.top} width={Math.max(1,right-left)} height={plot.bottom-plot.top} fill="transparent"/>
      {selectedIndex===index&&<line x1={point.x} x2={point.x} y1={plot.top} y2={plot.bottom} stroke="#dde6f3" strokeDasharray="3 4"/>}
      {point.previousY!==null&&<circle cx={point.x} cy={point.previousY} r={selectedIndex===index?5:3.5} fill="white" stroke={colors.previous} strokeWidth="2"/>}
      {point.currentY!==null&&<circle cx={point.x} cy={point.currentY} r={selectedIndex===index?5.5:4} fill={colors.current} stroke="white" strokeWidth="2"/>}
      <text x={point.x} y={plot.bottom+26} textAnchor={index===0?'start':index===trend.length-1?'end':'middle'} className="bu-chart-axis">{datum.label}</text>
     </g>;
    })}
   </svg>
   {lastRecorded<0&&<div className="bu-chart-empty-overlay">当前周期与上期暂无有效办结记录</div>}
  </div>
  <div className="bu-trend-readout" aria-live="polite">{selected?<><span>{selected.rangeLabel}</span><span><i style={{background:colors.current}}/>本期 <strong>{hoursText(selected.averageHours,formatHours)}</strong><small>{selected.count} 轮</small></span><span><i style={{background:colors.previous}}/>上期 {selected.previousRangeLabel} <strong>{hoursText(selected.previousAverageHours,formatHours)}</strong><small>{selected.previousCount} 轮</small></span></>:<span>有有效办结记录后，将展示趋势；缺失记录不会记为 0 小时。</span>}</div>
 </section>;
}

function ApprovalDistribution({bins,total}){
 const [active,setActive]=useState(null),width=430,height=225,plot={left:38,right:410,top:28,bottom:182};
 const maximum=Math.max(1,...bins.map(bin=>bin.count)),step=(plot.right-plot.left)/bins.length,barWidth=36;
 const selected=active===null?null:bins[active];
 return <section className="panel bu-chart-panel"><div className="workspace-panel-heading"><div><h2>审批耗时分布</h2><p>按本期办结轮次统计，查看较长审批的占比。</p></div><UiTag className="badge">{total} 轮</UiTag></div>
  <div className="bu-distribution-canvas"><svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label="审批耗时分布柱状图" onMouseLeave={()=>setActive(null)}>
   {[0,1,2].map(index=>{const value=Math.ceil(maximum/2)*index,y=plot.bottom-value/(Math.ceil(maximum/2)*2)*(plot.bottom-plot.top);return <g key={index}><line x1={plot.left} x2={plot.right} y1={y} y2={y} className="bu-chart-gridline"/><text x={plot.left-10} y={y+4} textAnchor="end" className="bu-chart-axis">{value}</text></g>;})}
   {bins.map((bin,index)=>{
    const x=plot.left+step*(index+.5),barHeight=bin.count/(Math.ceil(maximum/2)*2)*(plot.bottom-plot.top),percentage=total?`${Math.round(bin.count/total*100)}%`:'—';
    return <g key={bin.label} className="bu-chart-bar" tabIndex="0" role="button" aria-label={`${bin.label}，${bin.count}轮，占${percentage}`} onMouseEnter={()=>setActive(index)} onFocus={()=>setActive(index)} onBlur={()=>setActive(null)} onClick={()=>setActive(index)} onKeyDown={event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();setActive(index);}}}>
     <rect x={x-step/2+4} y={plot.top} width={step-8} height={plot.bottom-plot.top} fill="transparent"/>
     <rect x={x-barWidth/2} y={plot.bottom-barHeight} width={barWidth} height={barHeight} rx="4" fill={active===index?'#4778c9':index===3?'#d9ad70':'#8cace0'}/>
     <text x={x} y={plot.bottom-barHeight-10} textAnchor="middle" className="bu-chart-value">{bin.count}</text>
     <text x={x} y={plot.bottom+27} textAnchor="middle" className="bu-chart-axis">{bin.label}</text>
    </g>;
   })}
  </svg>{!total&&<div className="bu-chart-empty-overlay">当前周期暂无有效办结记录</div>}</div>
  <div className="bu-chart-footer" aria-live="polite">{selected?`${selected.label}：${selected.count} 轮，占本期 ${total?`${Math.round(selected.count/total*100)}%`:'—'}`:'自然小时；将鼠标移到柱形或用 Tab 查看各区间。'}</div>
 </section>;
}

function ApprovalOutcomes({parts,total,pending}){
 const [active,setActive]=useState(null),selected=parts.find(part=>part.key===active),label=selected?.label||'本期办结',value=selected?.count??total;
 let offset=0;
 return <section className="panel bu-chart-panel"><div className="workspace-panel-heading"><div><h2>审批结果分布</h2><p>仅统计本期通过与退回，待审单独列出。</p></div><UiTag className="badge">当前待审 {pending} 轮</UiTag></div>
  <div className="bu-outcome-body"><svg className="bu-outcome-ring" viewBox="0 0 210 210" role="group" aria-label="本期审批结果环形图" onMouseLeave={()=>setActive(null)}>
   <circle cx="105" cy="105" r="77" fill="none" stroke="#edf1f7" strokeWidth="19"/>
   {parts.map(part=>{
    const portion=total?part.count/total*100:0,start=offset;offset+=portion;
    return part.count>0?<circle key={part.key} className="bu-chart-ring-segment" cx="105" cy="105" r="77" pathLength="100" fill="none" stroke={colors[part.key]} strokeWidth={active===part.key?23:19} strokeDasharray={`${portion} ${100-portion}`} strokeDashoffset={-start} transform="rotate(-90 105 105)" tabIndex="0" role="button" aria-label={`${part.label}，${part.count}轮，占${Math.round(portion)}%`} onMouseEnter={()=>setActive(part.key)} onFocus={()=>setActive(part.key)} onBlur={()=>setActive(null)} onClick={()=>setActive(part.key)} onKeyDown={event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();setActive(part.key);}}}/>:null;
   })}
   <text x="105" y="105" textAnchor="middle" className="bu-outcome-number">{value}</text><text x="105" y="129" textAnchor="middle" className="bu-outcome-label">{label} · 轮</text>
  </svg><div className="bu-outcome-legend">{parts.map(part=><button key={part.key} className={active===part.key?'active':''} onMouseEnter={()=>setActive(part.key)} onMouseLeave={()=>setActive(null)} onFocus={()=>setActive(part.key)} onBlur={()=>setActive(null)} onClick={()=>setActive(part.key)} aria-pressed={active===part.key}><span><i style={{background:colors[part.key]}}/>{part.label}</span><strong>{part.count}<small>轮</small></strong><em>{total?`${Math.round(part.count/total*100)}%`:'—'}</em></button>)}</div></div>
  <div className="bu-chart-footer">{total?'通过与退回构成本期办结总量；当前待审不计入结果占比。':'暂无有效办结记录，待审不会视为已办结。'}</div>
 </section>;
}

export default function BuApprovalCharts({data,formatHours}){
 return <div className="bu-approval-charts"><ApprovalTrend charts={data.charts} formatHours={formatHours}/><div className="bu-approval-chart-pair"><ApprovalDistribution bins={data.charts.durations} total={data.current.count}/><ApprovalOutcomes parts={data.charts.outcomes} total={data.current.count} pending={data.pending.count}/></div></div>;
}
