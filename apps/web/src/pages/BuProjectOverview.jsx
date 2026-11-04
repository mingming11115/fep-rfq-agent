import React,{useEffect,useRef} from 'react';
import {ProTable} from '@ant-design/pro-components';
import {Alert,Avatar,Badge,Button,Empty,List,Progress,Space,Tag,Typography} from 'antd';
import {ArrowUpRight,BookOpen,ShieldCheck,Users} from '../components/icons';
import {BuPanel} from '../components/BuDashboardCards';
import BuMetricLabel from '../components/BuMetricHelp';
import {approvalHours} from './BuApprovalPanel';

const stageColors=['default','processing','blue','cyan','success'];
const stageStrokes=['#bfbfbf','#1677ff','#597ef7','#13c2c2','#52c41a'];
const focusOptions={all:'全部项目',active:'进行中项目',overdue:'逾期项目',pending:'有待办的项目'};
const initialFilters={query:'',stage:'all',focus:'all'};
const {Text}=Typography;

export default function BuProjectOverview({data,isMock,query,stage,focus,onFilters,onStage,navigate}){
 const formRef=useRef(null);
 useEffect(()=>{formRef.current?.setFieldsValue({query,stage,focus});},[query,stage,focus]);
 const {stats,stages,projects,workload,taskGroups,approval}=data;
 const rows=projects.filter(p=>`${p.id} ${p.name} ${p.customer} ${p.ownerName}`.toLowerCase().includes(query.trim().toLowerCase())
  &&(stage==='all'||p.stage===stage)&&(focus==='all'||focus==='active'&&p.stage!=='已导出'||focus==='overdue'&&p.overdue||focus==='pending'&&p.pending>0))
  .sort((a,b)=>Number(b.overdue)-Number(a.overdue)||(a.deadline||'9999').localeCompare(b.deadline||'9999')||a.id.localeCompare(b.id));
 const columns=[
  {title:'关键词',dataIndex:'query',hideInTable:true,fieldProps:{placeholder:'项目、客户或负责人','aria-label':'搜索看板项目',allowClear:true}},
  {title:'项目 / 客户',dataIndex:'name',search:false,width:250,render:(_,p)=><div className="bu-table-project">{isMock?<Text strong type={p.overdue?'danger':undefined}>{p.name}</Text>:<Button type="link" danger={p.overdue} onClick={()=>navigate('response',null,{projectId:p.id,returnKey:'dashboard'})}>{p.name}</Button>}<Text type="secondary">{p.id} · {p.customer}</Text></div>},
  {title:'SR负责人',dataIndex:'ownerName',search:false,width:110},
  {title:'项目阶段',dataIndex:'stage',valueType:'select',valueEnum:{all:'全部阶段',...Object.fromEntries(stages.map(s=>[s.label,s.label]))},fieldProps:{'aria-label':'看板项目阶段'},width:110,render:(_,p)=><Tag color={stageColors[stages.findIndex(s=>s.label===p.stage)]}>{p.stage}</Tag>},
  {title:'关注范围',dataIndex:'focus',hideInTable:true,valueType:'select',valueEnum:focusOptions,fieldProps:{'aria-label':'看板项目关注'}},
  {title:<BuMetricLabel metric="最新审批用时"/>,key:'approval',search:false,width:155,render:(_,p)=>{
   const round=approval.byProject[p.id];
   return <div className="bu-table-stack"><span className={round?.status==='已退回'?'bu-attention':undefined}>{approvalHours(round?.hours)}{round?.hours!=null&&' 小时'}</span><Text type={round?.status==='已退回'?'danger':'secondary'}>{round?.status==='审批中'?(round.hours!=null?'待审中 · 持续计时':'待审中 · 提交时间未记录'):round?.status||'暂无审批记录'}</Text></div>;
  }},
  {title:<BuMetricLabel metric="条款确认"/>,key:'confirmation',search:false,width:145,render:(_,p)=><div className="bu-table-stack"><span>{p.confirmed} / {p.total}</span><Progress percent={p.total?Math.round(p.confirmed/p.total*100):0} showInfo={false} size="small"/></div>},
  {title:<BuMetricLabel metric="未完成事项"/>,key:'pending',search:false,width:170,sorter:(a,b)=>a.pending-b.pending,render:(_,p)=><div className="bu-table-stack"><span>{p.pending} 项待办{p.overdueTasks>0&&<Text type="danger"> · {p.overdueTasks} 逾期</Text>}</span><Text type="secondary">评审 {p.reviews} · 复核 {p.rechecks}</Text></div>},
  {title:<BuMetricLabel metric="截止日期"/>,dataIndex:'deadline',search:false,width:135,sorter:(a,b)=>(a.deadline||'9999').localeCompare(b.deadline||'9999'),render:(_,p)=><div className="bu-table-stack"><Text type={p.overdue?'danger':undefined}>{p.deadline||'未设置'}</Text>{p.overdue&&<Badge status="error" text="已逾期"/>}</div>},
  {title:'操作',key:'actions',search:false,width:120,fixed:'right',render:(_,p)=>isMock?<Text type="secondary">模拟项目</Text>:<Button type="link" aria-label={`配置人员 ${p.id}`} onClick={()=>navigate('bu-admin',null,{projectId:p.id})}>配置人员<ArrowUpRight size={12}/></Button>},
 ];
 const workloadMax=Math.max(1,...workload.map(m=>m.pending));
 return <div className="bu-project-content">
  <div className="bu-overview-grid">
   <BuPanel title="项目阶段分布" extra={<Tag>{stats.projects} 个项目</Tag>}>
    <div className="bu-stage-list">{stages.map((item,index)=><button type="button" key={item.label} className={`bu-stage-item ${stage===item.label?'is-selected':''}`} aria-pressed={stage===item.label} onClick={()=>onStage(stage===item.label?'all':item.label)}><Badge color={stageStrokes[index]} text={item.label}/><strong>{item.count}<small>个</small></strong><Progress percent={stats.projects?item.count/stats.projects*100:0} showInfo={false} size="small" strokeColor={stageStrokes[index]}/></button>)}</div>
   </BuPanel>
   <BuPanel title="条款确认进度" extra={<Tag color="blue">{stats.totalRequirements} 条</Tag>}>
    <div className="bu-confirm-body"><div className="bu-confirm-summary"><Progress type="circle" percent={stats.confirmationRate} size={112} strokeWidth={8}/><BuMetricLabel metric="确认完成率"/></div><div className="bu-confirm-details"><div><BuMetricLabel metric="已确认条款"/><Text strong>{stats.confirmedRequirements}</Text></div><div><BuMetricLabel metric="待完成条款"/><Text strong>{stats.totalRequirements-stats.confirmedRequirements}</Text></div><Text type="secondary">需复核条款计入待完成</Text></div></div>
   </BuPanel>
  </div>
  <ProTable className="bu-project-panel rfq-ant-table" formRef={formRef} rowKey="id" columns={columns} dataSource={rows}
   headerTitle={<h2 className="bu-table-heading">项目进度总览</h2>} toolbar={{subTitle:`${rows.length} / ${projects.length} 个项目`}}
   search={{labelWidth:'auto',defaultCollapsed:false,span:{xs:24,sm:12,md:8,lg:8,xl:8,xxl:8}}}
   form={{initialValues:initialFilters}} onSubmit={values=>onFilters({query:values.query||'',stage:values.stage||'all',focus:values.focus||'all'})}
   onReset={()=>onFilters({query:'',stage:'all',focus:'all'})} options={{reload:false,density:true,setting:true,fullScreen:true}}
   scroll={{x:1295}} pagination={{defaultPageSize:10,showSizeChanger:true,showTotal:total=>`共 ${total} 个项目`}}
   locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={projects.length?'没有符合条件的项目':'当前 BU 暂无 RFQ 项目'}/>}}/>
  <div className="bu-team-grid">
   <BuPanel title="人员负荷" extra={<Space><Users size={14}/><BuMetricLabel metric="有效成员">{stats.enabledMembers} 位有效成员</BuMetricLabel></Space>}>
    <List dataSource={workload.slice(0,6)} locale={{emptyText:'尚无业务成员'}} renderItem={(member,index)=><List.Item className="bu-workload-row"><List.Item.Meta avatar={<Avatar style={{background:['#e6f4ff','#e6fffb','#f9f0ff'][index%3],color:['#1677ff','#08979c','#722ed1'][index%3]}}>{member.name.slice(0,1)}</Avatar>} title={<Space>{member.name}{!member.enabled&&<Tag color="error">待重新配置</Tag>}</Space>} description={`${member.roles.join(' / ')||'待配置职责'} · ${member.projects} 个授权项目`}/><Progress className="bu-workload-progress" strokeColor={member.overdue?'var(--bu-danger)':undefined} percent={member.pending/workloadMax*100} showInfo={false} size="small"/><div className="bu-workload-count"><Text strong>{member.pending} 项待办</Text><Text type={member.overdue?'danger':'secondary'}>{member.overdue?`${member.overdue} 项逾期`:'无逾期'}</Text></div></List.Item>}/>
    <div className="bu-card-footer"><Text type="secondary">{workload.length>6?`展示负荷最高的 6 人，共 ${workload.length} 人`:'按当前未完成任务数排序'}</Text><Button type="link" onClick={()=>navigate('bu-admin')}>人员管理</Button></div>
   </BuPanel>
   <BuPanel title="待办分布" extra={<Tag>{stats.pendingTasks} 项</Tag>}>
    <div className="bu-task-groups">{taskGroups.map((group,index)=><div key={group.label}><div><BuMetricLabel metric={group.label==='条款确认'?'条款确认任务':group.label}>{group.label}</BuMetricLabel><Text strong>{group.count} 项</Text></div><Progress percent={stats.pendingTasks?group.count/stats.pendingTasks*100:0} showInfo={false} strokeColor={['#1677ff','#13c2c2','#722ed1'][index]} size="small"/></div>)}</div>
    <Alert type={stats.overdueTasks?'error':'success'} showIcon message={stats.overdueTasks?`${stats.overdueTasks} 项任务已逾期，请跟进项目负责人`:'当前没有逾期待办'}/>
    <div className="bu-management-links"><Button icon={<BookOpen size={15}/>} onClick={()=>navigate('knowledge')}>知识管理</Button><Button icon={<ShieldCheck size={15}/>} onClick={()=>navigate('audit')}>审计记录</Button></div>
   </BuPanel>
  </div>
 </div>;
}
