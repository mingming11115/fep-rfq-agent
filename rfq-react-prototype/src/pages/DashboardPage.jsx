import React from 'react';
import {getRoleDescription} from '../permissions';
import {ArrowUpRight,ClipboardList,FolderKanban,ShieldCheck,Clock3,AlertTriangle} from 'lucide-react';
import {selectMyTasks,taskLabels,isTaskOverdue} from '../taskDomain';
import {selectProjects,getProjectSummary} from '../projectSelectors';
import './workspace-pages.css';
export default function DashboardPage({appState,navigate,onOpenTask,onOpenProject}){
 const tasks=selectMyTasks(appState,{actorId:appState.actorId}),projects=selectProjects(appState,{actorId:appState.actorId});
 const stats=[['我的待办',tasks.length,ClipboardList,'tasks'],['参与项目',projects.length,FolderKanban,'projects'],['审批待办',tasks.filter(t=>t.kind.endsWith('approve')).length,ShieldCheck,'tasks'],['需重新确认',tasks.filter(t=>t.kind==='recheck').length,Clock3,'tasks']];
 return <div className="workspace-page"><div className="page-heading"><div><span className="workspace-eyebrow">RFQ WORKSPACE</span><h1>工作台</h1><p>你好，{appState.actorRole}。{getRoleDescription(appState.actorRole)}</p></div></div><div className="workspace-stat-grid">{stats.map(([label,n,Icon,page])=><button className="panel workspace-stat" key={label} onClick={()=>navigate(page)}><Icon size={22}/><span>{label}<strong>{n}<small>项</small></strong></span><ArrowUpRight size={16}/></button>)}</div><section className="panel"><div className="workspace-panel-heading"><div><h2>优先处理</h2><p>与任务中心共用同一份待办，按截止时间排列。</p></div><button className="text-link" onClick={()=>navigate('tasks')}>全部 {tasks.length} 项 →</button></div>{tasks.slice(0,5).map(t=>{
  const overdue=isTaskOverdue(t);
  return <div className={`workspace-todo${overdue?' is-overdue':''}`} key={t.id}>
   <div><span className="badge">{taskLabels[t.kind]}</span>{overdue&&<span className="workspace-overdue-badge"><AlertTriangle size={12} aria-hidden="true"/>已延期</span>}<button className="text-link" onClick={()=>onOpenTask(t,'view')}>{t.title}</button><small>{appState.projects.find(p=>p.id===t.projectId)?.name} · {t.objectId}</small></div>
   <span className={`workspace-todo-deadline${overdue?' is-overdue':''}`}>截止 {t.dueAt||'未设置'}</span>
   <button className="btn btn-primary btn-sm" onClick={()=>onOpenTask(t,'start')}>继续处理</button>
  </div>;
 })}{!tasks.length&&<div className="workspace-empty">当前没有待办，可以进入项目查看进度。</div>}</section><section className="panel"><div className="workspace-panel-heading"><div><h2>最近项目</h2><p>查看确认进度与评审进展。</p></div><button className="text-link" onClick={()=>navigate('projects')}>我的 RFQ →</button></div><div className="workspace-project-grid">{projects.slice(0,3).map(p=>{const s=getProjectSummary(appState,p.id,appState.actorId);return <article className="workspace-project-card" key={p.id}><span className="badge">{s.stage}</span><h3>{p.name}</h3><p>{p.customer} · {p.id}</p><div className="workspace-progress"><span style={{width:`${s.total?s.confirmed/s.total*100:0}%`}}/></div><small>已确认 {s.confirmed}/{s.total} · 评审 {s.reviews}</small><button className="text-link" onClick={()=>onOpenProject(p.id,'continue')}>继续处理 · {s.pending} 项我的待办 →</button></article>;})}</div></section></div>;
}
