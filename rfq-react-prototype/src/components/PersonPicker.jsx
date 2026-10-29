import React from 'react';
import { Select } from 'antd';
import { personnelOptions } from '../antdAdapters';

export default function PersonPicker({ people = [], value = '', onChange, multiple = false, disabled = false,
  label = '选择人员', resolveName = id => id, emptyLabel = '暂无可选人员', clearLabel = '清空选择', placeholder = '搜索姓名或账号', ...selectProps }) {
  const options = personnelOptions(people, value, resolveName);
  return <Select {...selectProps} className="rfq-person-select" aria-label={label} showSearch allowClear
    mode={multiple ? 'multiple' : undefined} disabled={disabled}
    value={multiple ? value || [] : value || undefined} options={options}
    placeholder={placeholder} notFoundContent={people.length ? '未找到匹配人员' : emptyLabel}
    filterOption={(input, option) => option.searchText.toLocaleLowerCase().includes(input.trim().replace(/^[@＠]/u, '').toLocaleLowerCase())}
    onChange={next => onChange(next || (multiple ? [] : ''))}
    onInputKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}
  />;
}
