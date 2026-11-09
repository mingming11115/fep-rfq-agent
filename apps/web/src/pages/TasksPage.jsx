import { QueryFilter, ProFormText, ProFormSelect } from '@ant-design/pro-components';
import { PageHeading } from '../components/AntContent';
import React, { useEffect, useRef, useState } from 'react';
import useContentTransition from '../components/useContentTransition';
import { Button, Checkbox, Form, Input, Select, Space, Tabs } from 'antd';
import { DrawerForm, ProFormTextArea, ProTable } from '@ant-design/pro-components';
import { StatusBadge } from '../components/ui';
import PersonPicker from '../components/PersonPicker';
import OverlayPresence from '../components/OverlayPresence';
import { selectMyTasks, taskLabels, isTaskPending, isTaskOverdue, isQualifiedTaskActor } from '../taskDomain';
import './workspace-pages.css';

function load() { try { return JSON.parse(sessionStorage.getItem('rfq.tasks.filters')) || {}; } catch { console.error('读取待办筛选条件失败'); return {}; } }
export default function TasksPage({ appState, onOpenTask, onTaskAction }) {
  const [filters, setFilters] = useState(() => ({ tab: 'pending', query: '', projectId: '', kind: '', overdue: false, ...load() }));
  const [transfer, setTransfer] = useState(null);
  const resultsRef = useRef(null), queryFormRef = useRef(null), tableActionRef = useRef(null);
  const initialQuery = useRef({query:filters.query,projectId:filters.projectId,kind:filters.kind});
  useContentTransition(resultsRef, filters.tab, { kind:'tab', position:['pending','done','all'].indexOf(filters.tab) });
  useEffect(() => { sessionStorage.setItem('rfq.tasks.filters', JSON.stringify(filters)); }, [filters]);
  const applyFilters = patch => {
    setFilters(current => ({ ...current, ...patch }));
    tableActionRef.current?.setPageInfo({ current: 1 });
  };
  const names = Object.fromEntries(Object.values(appState.accountsById || {}).map(account => [account.id, account.name]));
  const all = selectMyTasks(appState, { actorId: appState.actorId, tab: filters.tab });
  const rows = all.filter(task => (!filters.projectId || task.projectId === filters.projectId)
    && (!filters.kind || task.kind === filters.kind) && (!filters.overdue || isTaskOverdue(task))
    && (task.title + ' ' + task.objectId + ' ' + task.projectId).toLowerCase().includes(filters.query.toLowerCase()));
  const columns = [
    { title: '任务 / 关联对象', dataIndex: 'title', width: 280, render: (_, task) => <><Button type="link" onClick={() => onOpenTask(task, 'view')}>{task.title}</Button><small className="rfq-table-meta">{appState.projects.find(p => p.id === task.projectId)?.name} · {task.objectId} · V{task.objectVersion}</small></> },
    { title: '任务类型', dataIndex: 'kind', width: 120, render: (_, task) => <>{taskLabels[task.kind]}{task.reviewSide && <small className="rfq-table-meta">{task.reviewSide === 'sr' ? 'SR方' : '技术方'}</small>}</> },
    { title: '任务状态', dataIndex: 'status', width: 130, render: (_, task) => <Space direction="vertical" size={4}><StatusBadge status={task.status}/>{isTaskOverdue(task) && <StatusBadge status="逾期" tone="danger"/>}</Space> },
    { title: '处理结果', dataIndex: 'result', width: 100 },
    { title: '处理人', dataIndex: 'assigneeId', width: 100, render: (_, task) => names[task.assigneeId] || task.assigneeId },
    { title: '到达 / 截止', dataIndex: 'dueAt', width: 200, sorter: (a, b) => String(a.dueAt || '').localeCompare(String(b.dueAt || '')), render: (_, task) => <><span>{task.dueAt || '未设置截止'}</span><small className="rfq-table-meta">到达 {new Date(task.arrivedAt).toLocaleDateString('zh-CN')}{task.completedAt ? ' · 完成 ' + new Date(task.completedAt).toLocaleDateString('zh-CN') : ''}</small></> },
    { title: '操作', key: 'actions', width: 160, fixed: 'right', render: (_, task) => <Space wrap>
      <Button type="link" onClick={() => onOpenTask(task, isTaskPending(task) ? 'start' : 'view')}>{isTaskPending(task) ? task.status === '处理中' ? '继续处理' : '开始处理' : '查看'}</Button>
      {appState.dataSource !== 'mysql' && isTaskPending(task) && task.kind !== 'final-approve' && <Button type="link" onClick={() => setTransfer(task)}>转办</Button>}
    </Space> },
  ];
  return <div className="workspace-page">
    <PageHeading title={<>任务中心</>} />
    <section className="panel">
      <Tabs animated={{ inkBar:true, tabPane:false }} className="rfq-panel-tabs" activeKey={filters.tab} onChange={tab => applyFilters({ tab })} items={[
        ['pending', '待办'], ['done', '已处理'], ['all', '全部'],
      ].map(([key, label]) => ({ key, label: label + ' ' + selectMyTasks(appState, { actorId: appState.actorId, tab: key }).length }))}/>
      <QueryFilter formRef={queryFormRef} className="rfq-query-form" layout="vertical" defaultCollapsed={false}
        initialValues={initialQuery.current}
        onFinish={async values => {
          applyFilters({ query: values.query || '', projectId: values.projectId || '', kind: values.kind || '' });
          return true;
        }}
        onReset={() => {
          const emptyQuery = { query: '', projectId: '', kind: '' };
          queryFormRef.current?.setFieldsValue(emptyQuery);
          applyFilters({ ...emptyQuery, overdue: false });
        }}>
        <ProFormText name="query" label="关键词" placeholder="项目、条款或任务关键词" fieldProps={{'aria-label':'搜索任务',allowClear:true}}/>
        <ProFormSelect name="projectId" label="关联项目"
          fieldProps={{ 'aria-label': '任务项目', onChange: value => applyFilters({ projectId: value ?? '' }) }}
          options={[{value:'',label:'全部项目'},...appState.projects.map(p=>({value:p.id,label:p.name}))]}/>
        <ProFormSelect name="kind" label="任务类型"
          fieldProps={{ 'aria-label': '任务类型', onChange: value => applyFilters({ kind: value ?? '' }) }}
          options={[{value:'',label:'全部类型'},...Object.entries(taskLabels).map(([value,label])=>({value,label}))]}/>
      </QueryFilter>
      <div ref={resultsRef} className="rfq-task-results"><ProTable actionRef={tableActionRef} className="rfq-ant-table" rowKey="id" columns={columns} dataSource={rows} search={false}
        headerTitle={<span className="muted">{rows.length} 项任务</span>} tooltip="查看任务不会自动接手；保存草稿不会完成任务。"
        toolBarRender={()=>[<Checkbox key="overdue" checked={filters.overdue} onChange={event => applyFilters({ overdue: event.target.checked })}>仅逾期</Checkbox>]}
        options={{ reload: false, density: true, setting: true, fullScreen: true }} scroll={{ x: 1140 }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true }} locale={{ emptyText: '暂无符合条件的任务，可调整筛选条件' }}/>
      </div>
    </section>
    <OverlayPresence kind="drawer-form">{transfer && <DrawerForm title="任务转办" open width={520} onOpenChange={open => { if (!open) { setTransfer(null); } }}
      initialValues={{ to: undefined, reason: '' }} submitter={{ searchConfig: { submitText: '确认转办', resetText: '取消' } }}
      onFinish={values => !!onTaskAction(transfer.id, { type: 'transfer', to: values.to, reason: values.reason.trim() })}>
      <p style={{ marginBottom: 20 }}>{transfer.title} · 截止 {transfer.dueAt || '未设置'}</p>
      <Form.Item name="to" label="新处理人" rules={[{ required: true, message: '请选择接收人' }]}><PersonPicker label="新处理人" people={Object.values(appState.accountsById || {}).filter(a => a.id !== appState.actorId && isQualifiedTaskActor(transfer, a.id, appState))} emptyLabel="暂无具有本节点处理资格的其他人员"/></Form.Item>
      <ProFormTextArea name="reason" label="转办原因" rules={[{ required: true, whitespace: true, message: '请填写转办原因' }]} fieldProps={{ autoSize: { minRows: 3, maxRows: 6 } }}/>
      <p className="muted">仅可转给具备节点资格的人员；保留原到达时间、期限和处理历史。</p>
    </DrawerForm>}</OverlayPresence>
  </div>;
}
