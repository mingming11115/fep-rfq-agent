import React,{useRef,useState} from 'react';
import {Tooltip} from 'antd';
import {HelpCircle} from './icons';
import './bu-metric-help.css';

const explanations={
 '平均审批时长':'本期审批从提交到办结的平均时长，含通过与退回。',
 '审批周期缩短':'本期平均审批时长较上一等长周期缩短的比例。',
 '审批周期延长':'本期平均审批时长较上一等长周期增加的比例。',
 '审批按期办结率':'在项目截止日内办结的审批占比，不含无截止日期的轮次。',
 '当前最长待审':'当前待审轮次中，从提交到现在等待最久的时长。',
 '审批时长趋势':'本期与上期各时间段的平均审批时长，无记录时留空。',
 '审批耗时分布':'本期办结审批在各耗时区间的数量和占比。',
 '审批结果分布':'本期已通过、已退回的数量和占比，不含待审。',
 '审批周期对比':'本期与上一等长周期的每轮平均审批时长对比。',
 '会签环节耗时':'SR 与技术组各自的平均评审时长，两方并行、不相加。',
 'SR方评审':'从本轮提交到 SR 给出评审结果的平均时长。',
 '技术组评审':'从提交到技术组完成评审的平均时长，按全员或负责人规则计算。',
 '待审项目与等待时长':'各项目最新待审轮次及等待时长，按等待最久排序。',
 '提交时间':'本轮最终审批的提交时间，以北京时间显示。',
 '当前等待方':'本轮尚未完成评审的 SR 方或技术组。',
 '已等待':'本轮审批从提交到现在的时长，含夜间和周末。',
 'RFQ 项目总数':'当前 BU 的全部 RFQ 项目数，含已导出项目。',
 '进行中项目':'当前 BU 尚未正式导出的项目数，含审批完成的项目。',
 '逾期项目':'已过截止日且尚未正式导出的项目数，按北京时间计算。',
 '待办任务':'当前 BU 中待处理或处理中的有效任务总数。',
 '项目阶段分布':'各项目当前阶段的数量分布，点击阶段可筛选。',
 '条款确认进度':'当前 BU 条款的确认情况，需复核或来源变更的计入待完成。',
 '确认完成率':'有效确认条款数 ÷ 全部条款数，需复核的条款不算完成。',
 '已确认条款':'已确认且无需复核、来源未变更的条款数。',
 '待完成条款':'尚未有效确认的条款数，包含待复核条款。',
 '最新审批用时':'最新审批轮次从提交到办结的时长，待审则计时到现在。',
 '条款确认':'该项目有效确认条款数 / 条款总数。',
 '未完成事项':'项目的有效待办数，并列出未关闭评审和待复核条款数。',
 '截止日期':'项目交付截止日，以北京时间当天结束为准。',
 '人员负荷':'成员的待办、逾期及授权项目数，按待办量展示前 6 人。',
 '有效成员':'当前 BU 内已启用且具有 SR 或技术角色的成员数。',
 '待办分布':'按起草修改、条款确认、评审处理分组统计有效待办。',
 '起草与修改':'应答起草与修改的未完成任务数。',
 '条款确认任务':'条款确认与重新确认的未完成任务数。',
 '评审处理':'评审、专业批准、最终审批及澄清的未完成任务数。',
};

export default function BuMetricLabel({metric,children}){
 const [open,setOpen]=useState(false),focused=useRef(false);
 return <span className="bu-metric-label">{children??metric}<Tooltip title={explanations[metric]} trigger={['hover']} open={open} onOpenChange={next=>{if(next||!focused.current)setOpen(next);}} mouseEnterDelay={.15} classNames={{root:'bu-metric-tooltip'}}><button type="button" className="bu-metric-help" aria-label={`${metric}指标说明`} aria-expanded={open} onFocus={()=>{focused.current=true;setOpen(true);}} onBlur={()=>{focused.current=false;setOpen(false);}} onClick={event=>{event.stopPropagation();setOpen(true);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape')setOpen(false);}}><HelpCircle size={13}/></button></Tooltip></span>;
}
