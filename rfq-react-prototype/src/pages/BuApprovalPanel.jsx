import React from 'react';
import {ProTable} from '@ant-design/pro-components';
import {Alert,Button,Empty,Progress,Segmented,Space,Tag,Typography} from 'antd';
import {CalendarCheck2,Clock3,Timer,TrendingDown,TrendingUp} from '../components/icons';
import {BuPanel,BuStatisticCard} from '../components/BuDashboardCards';
import BuMetricLabel from '../components/BuMetricHelp';
import BuApprovalCharts from './BuApprovalCharts';
import './bu-approval.css';

export function approvalHours(value){return value==null?'—':value===0?'0':value<0.1?'<0.1':String(Number(value.toFixed(1)));}
const {Text}=Typography;
const dateLabel=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'未记录提交时间';

export default function BuApprovalPanel({data,onPeriodChange,onConfigureProject}){
 const {current,previous,improvementPercent,pending,phases,periodDays,mode,incompleteRecords}=data;
 const comparable=improvementPercent!==null,slower=comparable&&improvementPercent<0;
 const cards=[
  {label:'平均审批时长',value:approvalHours(current.averageHours),unit:'小时',note:`本期办结 ${current.count} 轮 · 含通过与退回`,Icon:Clock3,tone:'blue'},
  {label:slower?'审批周期延长':'审批周期缩短',value:comparable?String(Math.abs(improvementPercent)):'暂不可比',unit:comparable?'%':'',note:comparable?`较上期平均${slower?'增加':'减少'} ${approvalHours(Math.abs(previous.averageHours-current.averageHours))} 小时`:!current.count?'本期暂无有效办结记录':previous.averageHours===0?'上期均值为 0，暂不可比':'缺少可比的上期记录',Icon:slower?TrendingUp:TrendingDown,tone:slower?'danger':'teal'},
  {label:'审批按期办结率',value:current.onTimeRate==null?'—':String(current.onTimeRate),unit:'%',note:`${current.datedCount} 轮有截止日期`,Icon:CalendarCheck2,tone:'violet'},
  {label:'当前最长待审',value:approvalHours(pending.longestHours),unit:'小时',note:`当前 ${pending.count} 轮待审 · 实时计时`,Icon:Timer,tone:pending.longestHours>0?'danger':'blue'},
 ];
 const comparisonMax=Math.max(1,current.averageHours||0,previous.averageHours||0),phaseMax=Math.max(1,...phases.map(p=>p.averageHours||0));
 const waitingColumns=[
  {title:'项目 / SR负责人',dataIndex:'projectName',width:260,render:(_,row)=><div className="bu-table-stack"><Text strong>{row.projectName}</Text><Text type="secondary">{row.projectId} · {row.ownerName}</Text></div>},
  {title:<BuMetricLabel metric="提交时间">提交时间（北京时间）</BuMetricLabel>,dataIndex:'submittedAt',width:190,render:(_,row)=>dateLabel(row.submittedAt)},
  {title:<BuMetricLabel metric="当前等待方"/>,dataIndex:'waitingSides',width:170,render:(_,row)=><Space wrap>{row.waitingSides.map(side=><Tag color={side==='SR'?'blue':'purple'} key={side}>{side}</Tag>)}</Space>},
  {title:<BuMetricLabel metric="已等待"/>,dataIndex:'hours',width:140,render:(_,row)=><Text type={row.hours>0?'danger':undefined} strong>{approvalHours(row.hours)} 小时</Text>},
  {title:'操作',key:'actions',width:120,fixed:'right',render:(_,row)=>onConfigureProject?<Button type="link" aria-label={`配置待审项目 ${row.projectId}`} onClick={()=>onConfigureProject(row.projectId)}>配置人员</Button>:<Text type="secondary">模拟项目</Text>},
 ];
 return <section className="bu-approval-section" aria-label="审批时效与提效">
  <div className="bu-approval-toolbar"><div><h2>审批时效与提效</h2><Text type="secondary">按办结时间统计，自然小时计时</Text></div><Segmented aria-label="审批统计周期" value={periodDays} options={[7,30,90].map(days=>({label:`近 ${days} 天`,value:days}))} onChange={onPeriodChange}/></div>
  <div className="bu-metric-grid bu-approval-stats">{cards.map(card=><BuStatisticCard key={card.label} {...card}/>)}</div>
  <BuApprovalCharts key={`${periodDays}-${mode}`} data={data} formatHours={approvalHours}/>
  <div className="bu-approval-analysis">
   <BuPanel title="审批周期对比" extra={<Tag>等长周期</Tag>}>
    <div className="bu-approval-comparison">{[{label:`前 ${periodDays} 天`,stats:previous,key:'previous'},{label:`近 ${periodDays} 天`,stats:current,key:'current'}].map(item=><div className="bu-comparison-row" key={item.key}><div><Text>{item.label}</Text><Text type="secondary">{item.stats.count} 轮办结</Text></div><Progress percent={(item.stats.averageHours||0)/comparisonMax*100} showInfo={false} strokeColor={item.key==='current'?(slower?'var(--bu-danger)':'#1677ff'):'#bfbfbf'}/><div className="bu-comparison-value"><Text strong>{approvalHours(item.stats.averageHours)}</Text><Text type="secondary">小时 / 轮</Text></div></div>)}</div>
    <Alert type={slower?'error':comparable?'success':'info'} showIcon message={comparable?`${slower?'审批周期延长':'审批周期缩短'} ${Math.abs(improvementPercent)}%`:'当前周期暂无可比的上期基准'} description="周期变化不等同人工工时节省"/>
   </BuPanel>
   <BuPanel title="会签环节耗时" extra={<Tag color="blue">并行会签</Tag>}>
    <div className="bu-approval-phases">{phases.map((phase,index)=><div key={phase.key}><div><BuMetricLabel metric={phase.label}/><Text strong>{approvalHours(phase.averageHours)} 小时</Text></div><Progress percent={(phase.averageHours||0)/phaseMax*100} showInfo={false} size="small" strokeColor={index?'#13c2c2':'#1677ff'}/><Text type="secondary">{phase.count} 轮有完整环节记录</Text></div>)}</div><Text type="secondary" className="bu-phase-note">SR 与技术组并行，整体时长按本轮必需评审人计算。</Text>
   </BuPanel>
  </div>
  <ProTable className="bu-approval-waiting rfq-ant-table" rowKey="snapshotId" dataSource={pending.rows} columns={waitingColumns} search={false}
   headerTitle={<h2 className="bu-table-heading"><BuMetricLabel metric="待审项目与等待时长"/></h2>} toolBarRender={()=>[<Tag color={pending.count>0?'error':'default'} key="pending">{pending.count} 轮待审</Tag>]} options={false}
   scroll={{x:880}} pagination={pending.count>5?{defaultPageSize:5,showSizeChanger:true,showTotal:total=>`共 ${total} 轮待审`}:false}
   locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前暂无待审项目"/>}}/>
  {incompleteRecords>0&&<Alert type="error" showIcon message={`${incompleteRecords} 条记录缺少完整会签或有效时间，未计入办结时长`}/>}
 </section>;
}
