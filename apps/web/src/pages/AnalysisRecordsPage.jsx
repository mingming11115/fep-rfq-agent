import { QueryFilter, ProFormSelect } from '@ant-design/pro-components';
import { PageHeading } from '../components/AntContent';
import React, { useState } from 'react';
import { Button, Select, Space } from 'antd';
import { ProDescriptions, ProTable } from '@ant-design/pro-components';
import { Drawer, StatusBadge } from '../components/ui';

export default function AnalysisRecordsPage({ appState, onOpenProject }) {
  const [projectId, setProjectId] = useState(''), [detail, setDetail] = useState(null);
  const runs = appState.analysisRuns.filter(run => !projectId || run.projectId === projectId);
  const projectName = id => appState.projects.find(project => project.id === id)?.name || id;
  const columns = [
    { title: '项目 / 批次', key: 'project', width: 240, render: (_, run) => <>{projectName(run.projectId)}<small className="rfq-table-meta">{run.id}</small></> },
    { title: '文件版本', key: 'source', width: 220, render: (_, run) => <>{run.fileName || run.fileId}<small className="rfq-table-meta">{run.sourceVersion || '未记录'}</small></> },
    { title: '分析类型', dataIndex: 'type', width: 110, render: (_, run) => run.type === 'parse' ? '条款解析' : '三级匹配' },
    { title: '时间', key: 'time', width: 190, sorter: (a, b) => new Date(a.endedAt || a.startedAt) - new Date(b.endedAt || b.startedAt), render: (_, run) => new Date(run.endedAt || run.startedAt).toLocaleString('zh-CN') },
    { title: '状态 / 结果', dataIndex: 'status', width: 230, render: (_, run) => <><StatusBadge status={run.status}/><small className="rfq-table-meta">成功 {run.successCount || 0} · 失败 {run.failedCount || 0} · 需核对 {run.needsHumanCount || 0}</small></> },
    { title: '操作', key: 'actions', fixed: 'right', width: 170, render: (_, run) => <Space><Button type="link" onClick={() => setDetail(run)}>查看本次</Button><Button type="link" onClick={() => onOpenProject(run.projectId, 'documents', { fileId: run.fileId, sourceVersion: run.sourceVersion })}>回到文件</Button></Space> },
  ];
  return <div className="workspace-page">
    <PageHeading title={<>AI 分析记录</>} description={<>逐次保留来源版本、解析和匹配结果；当前原型执行模拟分析。</>} actions={<></>} />
    <section className="panel"><QueryFilter className="rfq-query-form" layout="vertical" defaultCollapsed={false}
 onFinish={async values=>{setProjectId(values.projectId||'');return true;}} onReset={()=>setProjectId('')}>
 <ProFormSelect name="projectId" label="关联项目" fieldProps={{'aria-label':'分析记录项目'}} options={[{value:'',label:'全部项目'},...appState.projects.map(p=>({value:p.id,label:p.name}))]}/>
 </QueryFilter>
      <ProTable className="rfq-ant-table" rowKey="id" columns={columns} dataSource={runs} search={false} headerTitle="分析运行记录"
        options={{ reload: false, density: true, setting: true, fullScreen: true }} scroll={{ x: 1160 }} pagination={{ defaultPageSize: 10, showSizeChanger: true }} locale={{ emptyText: '暂无本轮分析记录，解析文件后会保留运行结果' }}/>
    </section>
    {detail && <Drawer title="本次分析详情" onClose={() => setDetail(null)}><ProDescriptions column={1} dataSource={detail} columns={[
      { title: '批次', dataIndex: 'id' }, { title: '项目', render: () => projectName(detail.projectId) },
      { title: '来源文件', render: () => detail.fileName || detail.fileId }, { title: '来源版本', dataIndex: 'sourceVersion' },
      { title: '状态', render: () => <StatusBadge status={detail.status}/> },
      { title: '执行说明', render: () => detail.detail || '来源及执行结果见记录。重新解析从当前文件发起，原记录保留。' },
    ]}/></Drawer>}
  </div>;
}
