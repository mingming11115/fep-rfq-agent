import React,{useState,useEffect} from 'react';
import {ArrowUpRight,ArrowRight,FolderKanban,Activity,Clock3,ClipboardList,Users,ShieldCheck,BookOpen,Search,SlidersHorizontal,CheckCircle2,AlertTriangle} from 'lucide-react';
import {canManageBu} from '../personnelDomain';
import {selectBuDashboard} from '../buDashboardSelectors';
import BuApprovalPanel,{approvalHours} from './BuApprovalPanel';
import './workspace-pages.css';
import './bu-dashboard.css';

const stageColors=['#9aabc1','#e8ae4f','#5888e7','#47a7a2','#69ab81'];

export default function BuDashboardPage({appState:state,onSelectBu,navigate}){
 const [query,setQuery]=useState(''),[stage,setStage]=useState('all'),[focus,setFocus]=useState('all');
 const [approvalPeriodDays,setApprovalPeriodDays]=useState(30),[approvalDataMode,setApprovalDataMode]=useState('auto');
 const [,setMetricRefresh]=useState(0);
 useEffect(()=>{const timer=setInterval(()=>setMetricRefresh(value=>value+1),60000);return()=>clearInterval(timer);},[]);
 const bus=state.businessUnits.filter(b=>canManageBu(state,state.actorId,b.id));
 const data=selectBuDashboard(state,{approvalPeriodDays,approvalDataMode});
 if(!data)return <div className="panel workspace-empty">当前账号没有此 BU 的看板权限。</div>;
 const {stats,projects,workload,stages,taskGroups,bu,approval}=data;
 const rows=projects.filter(p=>`${p.id} ${p.name} ${p.customer} ${p.ownerName}`.toLowerCase().includes(query.trim().toLowerCase())
  &&(stage==='all'||p.stage===stage)&&(focus==='all'||focus==='active'&&p.stage!=='已导出'||focus==='overdue'&&p.overdue||focus==='pending'&&p.pending>0))
  .sort((a,b)=>Number(b.overdue)-Number(a.overdue)||(a.deadline||'9999').localeCompare(b.deadline||'9999')||a.id.localeCompare(b.id));
 const statsCards=[
  {label:'RFQ 项目总数',value:stats.projects,unit:'个',note:'当前 BU 的全部项目',Icon:FolderKanban,filter:'all',tone:'blue'},
  {label:'进行中项目',value:stats.active,unit:'个',note:'尚未完成正式导出',Icon:Activity,filter:'active',tone:'teal'},
  {label:'逾期项目',value:stats.overdueProjects,unit:'个',note:'截止日已过且尚未导出',Icon:Clock3,filter:'overdue',tone:'amber'},
  {label:'待办任务',value:stats.pendingTasks,unit:'项',note:`其中 ${stats.overdueTasks} 项已逾期`,Icon:ClipboardList,filter:'pending',tone:'violet'},
 ];
 const reset=()=>{setQuery('');setStage('all');setFocus('all');};
 const setProjectFilter=filter=>{setQuery('');setStage('all');setFocus(filter);};
 const configureProject=id=>navigate('bu-admin',null,{projectId:id});
 const workloadMax=Math.max(1,...workload.map(m=>m.pending));

 return <div className="workspace-page bu-dashboard">
  <div className="page-heading bu-dashboard-heading"><div><span className="workspace-eyebrow">BUSINESS UNIT OVERVIEW</span><h1>BU看板</h1><p>查看 {bu.name} 的审批效率、RFQ 进展与交付风险。</p></div>
   <div className="bu-dashboard-actions"><label className="bu-dashboard-bu"><span>当前 BU</span><select className="select" aria-label="看板BU" value={bu.id} onChange={e=>{reset();onSelectBu(e.target.value);}}>{bus.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><button className="btn btn-primary" onClick={()=>navigate('bu-admin')}><SlidersHorizontal size={15}/>BU人员与规则</button></div>
  </div>

  <BuApprovalPanel data={approval} onPeriodChange={setApprovalPeriodDays} onModeChange={setApprovalDataMode} onConfigureProject={configureProject}/>

  <div className="bu-business-heading"><h2>业务规模与交付风险</h2><span>项目进度、有效待办与团队负荷</span></div>
  <div className="workspace-stat-grid bu-dashboard-stats">{statsCards.map(({label,value,unit,note,Icon,filter,tone})=><button key={filter} className={`panel bu-stat bu-stat-${tone} ${focus===filter?'is-selected':''}`} aria-pressed={focus===filter} onClick={()=>setProjectFilter(filter)}><div className="bu-stat-top"><span>{label}</span><span className="bu-stat-icon"><Icon size={19}/></span></div><strong>{value}<small>{unit}</small></strong><div className="bu-stat-bottom"><span>{note}</span><ArrowUpRight size={15}/></div></button>)}</div>

  <div className="bu-overview-grid">
   <section className="panel bu-stage-panel"><div className="workspace-panel-heading"><div><h2>项目阶段分布</h2><p>从来源上传到正式交付，点击阶段筛选项目。</p></div><span className="badge">共 {stats.projects} 个</span></div>
    <div className="bu-stage-body"><div className="bu-stage-track" role="img" aria-label={stages.map(s=>`${s.label} ${s.count} 个`).join('，')}>{stages.map((s,i)=><span key={s.label} style={{width:`${stats.projects?s.count/stats.projects*100:0}%`,background:stageColors[i]}}/>)}</div>
     <div className="bu-stage-legend">{stages.map((s,i)=><button key={s.label} className={stage===s.label?'active':''} aria-pressed={stage===s.label} onClick={()=>{setQuery('');setFocus('all');setStage(stage===s.label?'all':s.label);}}><span><i style={{background:stageColors[i]}}/>{s.label}</span><strong>{s.count}<small>个项目</small></strong></button>)}</div>
    </div>
   </section>
   <section className="panel bu-confirm-panel"><div className="workspace-panel-heading"><div><h2>条款确认进度</h2><p>按当前有效确认统计。</p></div><CheckCircle2 size={20}/></div><div className="bu-confirm-body"><div className="bu-confirm-ring" style={{'--progress':`${stats.confirmationRate}%`}} role="img" aria-label={`条款确认率 ${stats.confirmationRate}%`}><span><strong>{stats.confirmationRate}<small>%</small></strong><small>确认完成率</small></span></div><div className="bu-confirm-details"><p><i/><span>已确认条款</span><strong>{stats.confirmedRequirements}</strong></p><p><i/><span>待完成条款</span><strong>{stats.totalRequirements-stats.confirmedRequirements}</strong></p><small>共 {stats.totalRequirements} 条 · 需复核条款计入待完成</small></div></div></section>
  </div>

  <section className="panel bu-project-panel"><div className="workspace-panel-heading"><div><h2>项目进度总览</h2><p>查看交付日期、确认进度与未完成事项。</p></div><span className="bu-overview-note"><ShieldCheck size={14}/>管理概览</span></div>
   <div className="workspace-filters bu-project-filters"><label className="workspace-search"><Search size={16}/><input className="input" aria-label="搜索看板项目" placeholder="搜索项目、客户或负责人" value={query} onChange={e=>setQuery(e.target.value)}/></label><select className="select" aria-label="看板项目阶段" value={stage} onChange={e=>setStage(e.target.value)}><option value="all">全部阶段</option>{stages.map(s=><option key={s.label} value={s.label}>{s.label}（{s.count}）</option>)}</select><select className="select" aria-label="看板项目关注" value={focus} onChange={e=>setFocus(e.target.value)}><option value="all">全部项目</option><option value="active">进行中项目</option><option value="overdue">逾期项目</option><option value="pending">有待办的项目</option></select>{(query||stage!=='all'||focus!=='all')&&<button className="text-link" onClick={reset}>清除筛选</button>}<span className="bu-filter-count">{rows.length} / {projects.length} 个项目</span></div>
   {rows.length?<div className="table-wrap"><table className="data-table bu-project-table"><thead><tr><th>RFQ 项目</th><th>SR负责人</th><th>当前阶段</th><th>最新审批用时</th><th>条款确认</th><th>未完成事项</th><th>截止日期</th><th>管理</th></tr></thead><tbody>{rows.map(p=><tr key={p.id}><td><strong className="bu-project-name">{p.name}</strong><small>{p.id} · {p.customer}</small></td><td>{p.ownerName}</td><td><span className={`bu-stage-badge bu-stage-${stages.findIndex(s=>s.label===p.stage)}`}>{p.stage}</span></td><td><span className="bu-approval-time">{approvalHours(approval.byProject[p.id]?.hours)}{approval.byProject[p.id]?.hours!=null&&<small>小时</small>}</span><small className="bu-approval-time-note">{approval.byProject[p.id]?.status==='审批中'?(approval.byProject[p.id]?.hours!=null?'待审中 · 持续计时':'待审中 · 提交时间未记录'):approval.byProject[p.id]?.status||'暂无审批记录'}</small></td><td><div className="bu-table-progress"><div className="workspace-progress"><span style={{width:`${p.total?p.confirmed/p.total*100:0}%`}}/></div><span>{p.confirmed} / {p.total}</span></div></td><td><span>{p.pending} 项待办{p.overdueTasks>0&&<em> · {p.overdueTasks} 逾期</em>}</span><small>评审 {p.reviews} · 澄清 {p.clarifications} · 复核 {p.rechecks}</small></td><td><span className={p.overdue?'bu-overdue':''}>{p.deadline||'未设置'}</span>{p.overdue&&<small className="bu-overdue">已逾期</small>}</td><td><button className="text-link" aria-label={`配置人员 ${p.id}`} onClick={()=>configureProject(p.id)}>配置人员<ArrowUpRight size={13}/></button></td></tr>)}</tbody></table></div>:<div className="workspace-empty bu-project-empty"><FolderKanban size={30}/><strong>{projects.length?'没有符合条件的项目':'当前 BU 暂无 RFQ 项目'}</strong><p>{projects.length?'调整搜索或筛选条件，查看其他项目。':'SR 创建项目后，这里会显示实际业务进度。'}</p>{projects.length>0&&<button className="btn btn-sm" onClick={reset}>查看全部项目</button>}</div>}
   <div className="workspace-panel-footer">项目统计覆盖当前 BU；条款原文与应答按项目授权查看。逾期按北京时间截止日结束计算。</div>
  </section>

  <div className="bu-team-grid"><section className="panel"><div className="workspace-panel-heading"><div><h2>人员负荷</h2><p>按当前未完成任务数排序，便于安排分工。</p></div><span className="badge"><Users size={13}/>{stats.enabledMembers} 位有效成员</span></div>
   <div className="bu-workload-list">{workload.slice(0,6).map((m,i)=><div className="bu-workload-row" key={m.userId}><span className={`bu-person-avatar bu-person-${i%3}`}>{m.name.slice(0,1)}</span><div className="bu-person-info"><strong>{m.name}{!m.enabled&&<small>待重新配置</small>}</strong><small>{m.roles.join(' / ')||'待配置职责'} · {m.projects} 个授权项目</small></div><div className="bu-workload-bar"><span style={{width:`${m.pending/workloadMax*100}%`}}/></div><div className="bu-workload-count"><strong>{m.pending}<small>项待办</small></strong><span className={m.overdue?'bu-overdue':''}>{m.overdue?`${m.overdue} 项逾期`:'无逾期'}</span></div></div>)}{!workload.length&&<div className="workspace-empty">尚无业务成员，可在 BU 管理中配置人员。</div>}</div><div className="bu-panel-link"><span>{workload.length>6?`展示负荷最高的 6 人，共 ${workload.length} 人`:'调整人员资格与项目授权'}</span><button className="text-link" onClick={()=>navigate('bu-admin')}>人员管理<ArrowRight size={14}/></button></div>
  </section>
  <section className="panel"><div className="workspace-panel-heading"><div><h2>待办分布</h2><p>统计本 BU 各业务环节的有效待办。</p></div><span className="badge">{stats.pendingTasks} 项</span></div><div className="bu-task-groups">{taskGroups.map((group,i)=><div key={group.label}><span><i style={{background:stageColors[i+1]}}/>{group.label}</span><div className="bu-task-bar"><span style={{width:`${stats.pendingTasks?group.count/stats.pendingTasks*100:0}%`,background:stageColors[i+1]}}/></div><strong>{group.count}</strong></div>)}</div><div className={`bu-task-notice ${stats.overdueTasks?'has-overdue':''}`}>{stats.overdueTasks?<AlertTriangle size={16}/>:<CheckCircle2 size={16}/>}<span>{stats.overdueTasks?`${stats.overdueTasks} 项任务已逾期，请跟进对应项目负责人。`:'当前没有逾期待办。'}</span></div>
   <div className="bu-management-links"><button onClick={()=>navigate('knowledge')}><BookOpen size={17}/><span><strong>知识库审核</strong><small>标准回复与历史 RFQ</small></span><ArrowUpRight size={15}/></button><button onClick={()=>navigate('audit')}><ShieldCheck size={17}/><span><strong>BU审计记录</strong><small>查看人员与规则变更</small></span><ArrowUpRight size={15}/></button></div>
  </section></div>
 </div>;
}
