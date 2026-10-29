import React from 'react';
import { Badge, Drawer as AntDrawer, Empty, Modal as AntModal, Pagination as AntPagination } from 'antd';
import { normalizeTaskStatus } from '../taskStatus';
import { statusTone } from '../antdAdapters';

export function Modal({ onClose, children, footer = null, width = 640, ...props }) {
  return <AntModal {...props} open onCancel={onClose} width={width} footer={footer}
    className="rfq-ant-modal" styles={{ body: { paddingTop: 16, maxHeight: '70dvh', overflowY: 'auto' } }}>
    {children}
  </AntModal>;
}
export function Drawer({ onClose, children, footer, width = 660, ...props }) {
  return <AntDrawer {...props} open onClose={onClose} width={width} footer={footer}
    className="rfq-ant-drawer">{children}</AntDrawer>;
}
export const displayStatus = status => normalizeTaskStatus(status === '待复核' ? '待确认' : status);
const badgeStatuses = { success: 'success', danger: 'error', warning: 'warning', neutral: 'default' };
export function StatusBadge({ status, value, children, tone }) {
  const text = displayStatus(status || value || children || '待确认');
  const type = statusTone(text, tone);
  return <span className={'badge badge-ant ' + type}>
    <Badge status={badgeStatuses[type] || 'default'} text={text} />
  </span>;
}
export function EmptyState({ title = '暂无数据', description, children, action }) {
  return <div className="empty-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
    description={<><strong>{title}</strong><p>{description || children}</p></>}>{action}</Empty></div>;
}
export function Pagination({ count, page, onChange, pageSize = 10 }) {
  return <div className="pagination"><AntPagination total={count} current={page}
    pageSize={pageSize} onChange={onChange} showSizeChanger={false}
    showTotal={total => '共 ' + total + ' 条记录'} hideOnSinglePage={false} /></div>;
}
