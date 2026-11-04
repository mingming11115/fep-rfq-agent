import React from 'react';
import { Button, Dropdown, Progress, Space, Typography } from 'antd';
import { MoreHorizontal } from './icons';
import { ProTable } from '@ant-design/pro-components';
import { StatusBadge } from './ui';
import { getProjectSummary } from '../projectSelectors';

export default function RfqProjectTable({ rows, appState, canManage, isBuAdmin, onOpenProject, onOpenModel, onTransfer, onDelete, viewControl }) {
  const data = rows.map(project => ({ ...project, summary: getProjectSummary(appState, project.id, appState.actorId) }));
  const columns = [
    { title: '项目 / 客户', dataIndex: 'name', width: 260, render: (_, p) => <><Button type="link" onClick={() => onOpenProject(p.id, 'view')}>{p.name}</Button><small className="rfq-table-meta">{p.id} · {p.customer || '客户待补充'}</small></> },
    { title: '阶段', dataIndex: ['summary', 'stage'], width: 110, render: (_, p) => <StatusBadge status={p.summary.stage}/> },
    { title: '确认进度', key: 'progress', width: 160, render: (_, p) => <><span>{p.summary.confirmed}/{p.summary.total}</span><Progress percent={p.summary.total ? Math.round(p.summary.confirmed / p.summary.total * 100) : 0} showInfo={false} size="small"/></> },
    { title: '评审 / 重新确认', key: 'reviews', width: 140, render: (_, p) => p.summary.reviews + ' / ' + p.summary.rechecks },
    { title: '负责人', dataIndex: 'owner', width: 100 },
    { title: '截止日期', dataIndex: 'deadline', valueType: 'date', width: 130, sorter: (a, b) => String(a.deadline || '').localeCompare(String(b.deadline || '')) },
    { title: '操作', key: 'actions', width: 220, fixed: 'right', render: (_, p) => <Space size={12}>
      <Button type="link" onClick={() => onOpenProject(p.id, isBuAdmin ? 'response' : 'continue')}>{isBuAdmin ? '查看RFQ' : '继续处理'}</Button>
      <Button type="link" title={p.groupPath || (p.modelId ? [p.modelName, p.modelRevision].filter(Boolean).join(' · ') : '该 RFQ 尚未绑定目录')} onClick={() => onOpenModel(p)}>查看关联目录</Button>
      <Dropdown trigger={['click']} menu={{ items: [
        { key:'settings',label:isBuAdmin?'项目配置':'编辑项目',onClick:()=>onOpenProject(p.id,'settings') },
        ...(canManage && p.ownerId===appState.actorId ? [
          { type:'divider' },
          { key:'transfer',label:'移交负责人',onClick:()=>onTransfer(p) },
          { key:'delete',label:'删除项目',danger:true,onClick:()=>onDelete(p) },
        ] : []),
      ] }}><Button type="text" aria-label={`更多操作 ${p.name}`} icon={<MoreHorizontal/>}/></Dropdown>
    </Space> },
  ];
  return <ProTable className="rfq-ant-table" rowKey="id" columns={columns} dataSource={data} search={false}
    headerTitle={<Typography.Text type="secondary">{rows.length} 个项目</Typography.Text>} toolBarRender={()=>viewControl?[viewControl]:[]}
    options={{ reload: false, density: true, setting: true, fullScreen: true }}
    columnsState={{ persistenceKey: 'rfq-project-columns:' + appState.actorId, persistenceType: 'localStorage' }}
    scroll={{ x: 1175 }} pagination={{ defaultPageSize: 10, showSizeChanger: true, showTotal: total => '共 ' + total + ' 个项目' }}/>
}
