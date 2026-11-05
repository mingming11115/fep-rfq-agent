import React, { useRef, useImperativeHandle } from 'react';
import { Button, Checkbox, Input, Select, Table, Tabs, Tag } from 'antd';
import { PageContainer } from '@ant-design/pro-components';
import { tableChildren, tableData, selectOptions } from '../tableAdapter';
import { nativeTextArea } from '../antdAdapters';

export function PageHeading({ title, description, actions }) {
  return <PageContainer className="rfq-content-heading" ghost breadcrumb={false}
    title={<h1 className="rfq-page-title">{title}</h1>} extra={actions} content={description || undefined} />;
}
const without = (className = '', names = []) => className.split(/\s+/).filter(name => name && !names.includes(name)).join(' ');
export function UiButton({ className = '', type, children, ...props }) {
  const names = className.split(/\s+/);
  const kind = names.includes('btn-primary') || names.includes('btn') && names.includes('active') ? 'primary' : names.includes('text-link') ? 'link' : names.includes('icon-btn') ? 'text' : 'default';
  return <Button {...props} htmlType={type || 'button'} type={kind}
    danger={props.danger || names.includes('btn-danger')}
    size={names.includes('btn-sm') ? 'small' : names.includes('btn-lg') ? 'large' : props.size}
    className={without(className, ['btn','btn-primary','btn-danger','btn-sm','btn-lg','text-link','icon-btn','active'])}>{children}</Button>;
}
export function UiInput({ className, ...props }) {
  return <Input {...props} className={without(className, ['input'])} />;
}
export function UiTextArea({ className, ref, ...props }) {
  const antRef = useRef(null);
  useImperativeHandle(ref, () => nativeTextArea(antRef.current));
  return <Input.TextArea {...props} ref={antRef} className={without(className, ['input'])} />;
}
// Call sites keep their event-based protocol; Select itself is native antd.
export function UiSelect({ children, value, defaultValue, onChange, className, style, ...props }) {
  const options = selectOptions(children);
  return <Select {...props} style={{ width: '100%', ...style }} className={without(className, ['select'])}
    value={value == null ? value : String(value)} defaultValue={defaultValue == null ? defaultValue : String(defaultValue)} options={options}
    onChange={next => onChange?.({ target: { value: next } })} />;
}
export function UiCheckbox(props) { return <Checkbox {...props} />; }
export function UiTag({ className = '', children, ...props }) {
  const names = className.split(/\s+/);
  const color = names.includes('success') ? 'success' : names.includes('warning') ? 'warning' : names.includes('danger') ? 'error' : 'default';
  return <Tag {...props} color={color} className={without(className, ['badge','success','warning','danger','neutral'])}>{children}</Tag>;
}
export function BusinessTable({ children, className = '', ...props }) {
  const data = tableData(children);
  return <Table {...props} {...data} rowKey="key" pagination={false}
    className="rfq-native-table" tableLayout="fixed"
    scroll={{ x: Math.max(560, data.columns.length * 150) }} />;
}
export function BusinessTabs({ children, className = '' }) {
  const buttons = tableChildren(children);
  const active = buttons.findIndex(button => /(?:^|\s)active(?:\s|$)/.test(button.props.className || ''));
  return <Tabs animated={{ inkBar:true, tabPane:false }} className={'rfq-content-tabs ' + without(className, ['tabs','workspace-tabs','mg-tabs','admin-tabs','project-stage-tabs'])}
    activeKey={String(Math.max(0, active))} onChange={key => buttons[Number(key)]?.props.onClick?.()}
    items={buttons.map((button, index) => ({ key: String(index), label: button.props.children,
      disabled: button.props.disabled }))} />;
}
