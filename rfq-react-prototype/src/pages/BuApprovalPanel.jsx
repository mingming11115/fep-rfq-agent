import React,{useState} from 'react';
import {Clock3,TrendingDown,TrendingUp,Timer,CalendarCheck2,ArrowUpRight,GitPullRequest} from 'lucide-react';
import './bu-approval.css';

export function approvalHours(value){
 return value==null?'—':value===0?'0':value<0.1?'<0.1':String(Number(value.toFixed(1)));
}
const dateLabel=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'未记录提交时间';

export default function BuApprovalPanel({data,onPeriodChange,onModeChange,onConfigureProject}){
 const [showAll,setShowAll]=useState(false);
 const {current,previous,improvementPercent,pending,phases,periodDays,mode,incompleteRecords}=data;
 const comparable=improvementPercent!==null,slower=comparable&&improvementPercent<0;
 const cards=[
  {label:'平均审批时长',value:approvalHours(current.averageHours),unit:'小时',note:`本期办结 ${current.count} 轮 · 从提交到通过或退回`,Icon:Clock3,tone:'blue'},
  {label:slower?'审批周期延长':'审批周期缩短',value:comparable?String(Math.abs(improvementPercent)):'暂不可比',unit:comparable?'%':'',
   note:comparable?`较上期每轮平均${slower?'增加':'减少'} ${approvalHours(Math.abs(previous.averageHours-current.averageHours))} 小时`:!current.count?'本期暂无有效办结记录':previous.averageHours===0?'上期均值为 0，暂不计算百分比':`前 ${periodDays} 天无可比记录`,Icon:slower?TrendingUp:TrendingDown,tone:slower?'amber':'teal'},
  {label:'审批按期办结率',value:current.onTimeRate==null?'—':String(current.onTimeRate),unit:'%',note:`按项目截止日 · ${current.datedCount} 轮有截止日期`,Icon:CalendarCheck2,tone:'violet'},
  {label:'当前最长待审',value:approvalHours(pending.longestHours),unit:'小时',note:`当前 ${pending.count} 轮待审 · 从提交起计时`,Icon:Timer,tone:'amber'},
 ];
 const comparisonMax=Math.max(1,current.averageHours||0,previous.averageHours||0),phaseMax=Math.max(1,...phases.map(p=>p.averageHours||0));
 return <section className="bu-approval-section" aria-label="审批时效与提效">
  <div className="bu-approval-heading"><div><span className="workspace-eyebrow">APPROVAL EFFICIENCY</span><h2>审批时效与提效</h2><p>按整份应答的最终评审轮次统计，跟踪审批周期与会签等待。</p></div><div className="bu-approval-controls"><select className="select" aria-label="审批统计周期" value={periodDays} onChange={e=>onPeriodChange(Number(e.target.value))}>{[7,30,90].map(days=><option key={days} value={days}>近 {days} 天</option>)}</select><select className="select" aria-label="审批数据口径" value={mode} onChange={e=>onModeChange(e.target.value)}><option value="actual">真实记录</option><option value="sample">演示记录</option></select></div></div>
  {mode==='sample'&&<div className="bu-approval-sample">当前为演示记录，仅用于展示计算结果，不代表实际业务提效。</div>}
  <div className="workspace-stat-grid bu-approval-stats">{cards.map(({label,value,unit,note,Icon,tone})=><article key={label} className={`panel bu-stat bu-stat-${tone}`}><div className="bu-stat-top"><span>{label}</span><span className="bu-stat-icon"><Icon size={19}/></span></div><strong className={value==='暂不可比'?'bu-metric-unavailable':''}>{value}<small>{unit}</small></strong><div className="bu-stat-bottom"><span>{note}</span></div></article>)}</div>

  <div className="bu-approval-analysis"><section className="panel"><div className="workspace-panel-heading"><div><h2>审批周期对比</h2><p>按办结时间归属周期，包含通过与退回。</p></div><span className="badge">等长周期</span></div><div className="bu-approval-comparison">{[{label:`前 ${periodDays} 天`,stats:previous,key:'previous'},{label:`近 ${periodDays} 天`,stats:current,key:'current'}].map(item=><div className={`bu-comparison-row ${item.key}`} key={item.key}><div><span>{item.label}</span><small>{item.stats.count} 轮办结</small></div><div className="bu-comparison-bar"><span style={{width:`${(item.stats.averageHours||0)/comparisonMax*100}%`}}/></div><strong>{approvalHours(item.stats.averageHours)}<small>小时 / 轮</small></strong></div>)}</div><div className={`bu-efficiency-result ${slower?'is-slower':''}`}>{comparable?<><span>{slower?'审批周期延长':'审批周期缩短'}</span><strong>{Math.abs(improvementPercent)}<small>%</small></strong></>:<span>{current.count?'缺少可比的上期基准，暂不计算提效比例。':'当前周期没有有效办结记录。'}</span>}<small>以实际自然时长计算；周期变化不等同人工工时节省。</small></div></section>
   <section className="panel"><div className="workspace-panel-heading"><div><h2>会签环节耗时</h2><p>从提交到本方结束，定位较慢的评审环节。</p></div><GitPullRequest size={18}/></div><div className="bu-approval-phases">{phases.map(phase=><div key={phase.key}><div><span>{phase.label}</span><strong>{approvalHours(phase.averageHours)}<small>小时</small></strong></div><div className="bu-phase-track"><span style={{width:`${(phase.averageHours||0)/phaseMax*100}%`}}/></div><small>{phase.count} 轮有完整环节记录</small></div>)}</div><div className="bu-approval-phase-note">SR 与技术组并行会签，整体时长取必需评审人的最后完成时间。技术组按本轮全员／负责人规则计算。</div></section></div>

  <section className="panel bu-approval-waiting"><div className="workspace-panel-heading"><div><h2>待审项目与等待时长</h2><p>展示当前最新有效轮次，不受上方办结周期限制。</p></div><span className="badge">{pending.count} 轮待审</span></div>{pending.rows.length?<><div className="table-wrap"><table className="data-table"><thead><tr><th>RFQ 项目</th><th>提交时间（北京时间）</th><th>当前等待方</th><th>已等待</th><th>管理</th></tr></thead><tbody>{(showAll?pending.rows:pending.rows.slice(0,5)).map(row=><tr key={`${row.projectId}:${row.snapshotId}`}><td><strong>{row.projectName}</strong><small>{row.projectId} · SR {row.ownerName}</small></td><td>{dateLabel(row.submittedAt)}</td><td>{row.waitingSides.map(side=><span className="badge" key={side}>{side}</span>)}</td><td className="bu-overdue"><strong>{approvalHours(row.hours)}</strong> 小时</td><td><button className="text-link" aria-label={`配置待审项目 ${row.projectId}`} onClick={()=>onConfigureProject(row.projectId)}>配置人员<ArrowUpRight size={13}/></button></td></tr>)}</tbody></table></div>{pending.count>5&&<button className="text-link bu-waiting-toggle" onClick={()=>setShowAll(!showAll)}>{showAll?'收起':`查看全部 ${pending.count} 轮待审`}</button>}</>:<div className="bu-approval-empty"><Clock3 size={18}/><span>当前口径暂无待审项目。</span></div>}{incompleteRecords>0&&<div className="bu-approval-quality">{incompleteRecords} 条记录缺少完整会签或有效时间，未计入已办结时长；待审时间缺失时显示“—”。</div>}</section>
 </section>;
}
