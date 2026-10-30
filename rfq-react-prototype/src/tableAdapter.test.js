import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { tableData, selectOptions } from './tableAdapter.js';
const el = React.createElement;

test('table migration retains keyed rows, cell contents and row actions', () => {
  const open = () => {};
  const action = el('button', { onClick: open }, '打开');
  const { columns, dataSource, onRow } = tableData([
    el('thead', null, el('tr', null, el('th', null, '名称'), el('th', null, '操作'))),
    el('tbody', null, [null, el('tr', { key:'rfq-1', onClick:open, className:'selected' }, el('td', null, '测试 RFQ'), el('td', null, action))]),
  ]);
  assert.equal(dataSource.length, 1);
  assert.equal(dataSource[0].key, 'rfq-1');
  assert.equal(columns[0].title, '名称');
  assert.equal(columns[0].render(null, dataSource[0]), '测试 RFQ');
  assert.equal(columns[1].render(null, dataSource[0]).props.onClick, open);
  assert.equal(onRow(dataSource[0]).onClick, open);
  assert.equal(onRow(dataSource[0]).className, 'selected');
});

test('table migration handles fragments, conditional columns and merged empty rows', () => {
  const {columns,dataSource} = tableData([
    el('thead',null,el('tr',null,el(React.Fragment,null,el('th',null,'用户'),el('th',null,'状态')))),
    el('tbody',null,el(React.Fragment,null,false,el('tr',{key:'empty'},el('td',{colSpan:2},'没有符合条件的用户')))),
  ]);
  assert.equal(columns.length,2);
  assert.equal(columns[0].onCell(dataSource[0]).colSpan,2);
  assert.equal(columns[1].onCell(dataSource[0]).colSpan,0);
  assert.equal(columns[0].render(null,dataSource[0]),'没有符合条件的用户');
});

test('empty table retains columns and has no synthetic business rows', () => {
  const {columns,dataSource}=tableData([el('thead',null,el('tr',null,el('th',null,'项目'))),el('tbody',null,[])]);
  assert.equal(columns.length,1);
  assert.deepEqual(dataSource,[]);
});

test('Select preserves native option text values and string event values', () => {
  const options=selectOptions([
    el('option',null,'全部'),el('option',{value:''},'不限定'),
    el('option',{value:10},'10 条'),el('option',{disabled:true},'待确认'),
  ]);
  assert.deepEqual(options.map(option=>option.value),['全部','','10','待确认']);
  assert.equal(options[3].disabled,true);
});
