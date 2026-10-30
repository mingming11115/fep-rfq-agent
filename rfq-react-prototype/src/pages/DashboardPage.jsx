import React from 'react';
import { Progress } from 'antd';
import { PageHeading, UiButton } from '../components/AntContent';
import { EmptyState, StatusBadge } from '../components/ui';
import { ArrowRight, ClipboardList, FolderKanban, ShieldCheck, Clock3 } from '../components/icons';
import { selectMyTasks, taskLabels, isTaskOverdue } from '../taskDomain';
import { selectProjects, getProjectSummary } from '../projectSelectors';
import { personName } from '../personnelDomain';
import './workspace-pages.css';

export default function DashboardPage({ appState, navigate, onOpenTask, onOpenProject }) {
  const tasks = selectMyTasks(appState, { actorId: appState.actorId });
  const projects = selectProjects(appState, { actorId: appState.actorId });
  const overdue = tasks.filter(task => isTaskOverdue(task)).length;
  const stats = [
    ['我的待办', tasks.length, '项', ClipboardList, 'tasks'],
    ['参与项目', projects.length, '个', FolderKanban, 'projects'],
    ['审批待办', tasks.filter(t => t.kind.endsWith('approve')).length, '项', ShieldCheck, 'tasks'],
    ['需重新确认', tasks.filter(t => t.kind === 'recheck').length, '项', Clock3, 'tasks'],
  ];
  return <div className="workspace-page rfq-dashboard">
    <PageHeading title="工作台" description={<>{personName(appState, appState.actorId)}，当前有 {tasks.length} 项待办{overdue > 0 && <>，其中 {overdue} 项已逾期</>}。</>}
      actions={<UiButton className="btn btn-primary" onClick={() => navigate('tasks')}>处理待办 <ArrowRight/></UiButton>}/>
    <div className="dashboard-summary" aria-label="工作概览">
      {stats.map(([label, count, unit, Icon, page]) => <button className="dashboard-metric" key={label} onClick={() => navigate(page)}>
        <span className="dashboard-metric-label"><Icon size={16}/>{label}</span>
        <span className="dashboard-metric-value">{count}<small>{unit}</small></span>
      </button>)}
    </div>
    <section className="panel">
      <div className="workspace-panel-heading"><h2>优先处理</h2><UiButton className="text-link" onClick={() => navigate('tasks')}>查看全部 <ArrowRight size={13}/></UiButton></div>
      {tasks.slice(0, 5).map(task => <div className={'workspace-todo' + (isTaskOverdue(task) ? ' is-overdue' : '')} key={task.id}>
        <div className="dashboard-task-content">
          <span className="dashboard-task-kind">{taskLabels[task.kind]}</span>
          <UiButton className="text-link" onClick={() => onOpenTask(task, 'view')}>{task.title}</UiButton>
          <small>{appState.projects.find(p => p.id === task.projectId)?.name} · {task.objectId}</small>
        </div>
        <span className={'workspace-todo-deadline' + (isTaskOverdue(task) ? ' is-overdue' : '')}>{isTaskOverdue(task) ? '已逾期 · ' : ''}{task.dueAt || '未设置截止时间'}</span>
        <UiButton className="btn btn-sm" onClick={() => onOpenTask(task, 'start')}>继续处理 <ArrowRight size={13}/></UiButton>
      </div>)}
      {!tasks.length && <EmptyState title="当前没有待办" description="可进入项目查看应答进度。"/>}
    </section>
    <section className="panel">
      <div className="workspace-panel-heading"><h2>我的项目</h2><UiButton className="text-link" onClick={() => navigate('projects')}>查看全部 <ArrowRight size={13}/></UiButton></div>
      <div className="dashboard-project-list">{projects.slice(0, 3).map(project => {
        const summary = getProjectSummary(appState, project.id, appState.actorId);
        return <article className="dashboard-project-row" key={project.id}>
          <div className="dashboard-project-name"><UiButton className="text-link" onClick={() => onOpenProject(project.id, 'view')}>{project.name}</UiButton><small>{project.customer} · {project.id}</small></div>
          <StatusBadge status={summary.stage}/>
          <div className="dashboard-project-progress"><span>已确认 {summary.confirmed}/{summary.total}</span><Progress percent={summary.total ? Math.round(summary.confirmed / summary.total * 100) : 0} showInfo={false} size="small"/></div>
          <UiButton className="btn btn-sm" onClick={() => onOpenProject(project.id, 'continue')}>继续处理{summary.pending > 0 ? '（' + summary.pending + '）' : ''}</UiButton>
        </article>;
      })}</div>
      {!projects.length && <EmptyState title="当前没有项目" description="新建 RFQ 后即可在这里查看进度。"/>}
    </section>
  </div>;
}
