import test from 'node:test';
import assert from 'node:assert/strict';
import {craftClauseTargets} from './craftClauseTargets.js';
test('repeated Word clauses use their distinct headings for native navigation',()=>{
  const source={projectId:'P',fileId:'F',sourceVersion:'1'};
  const rows=[{id:'R1',projectId:'P',sourceFileId:'F',clause:'P3',title:'Delivery pending',original:'Same words'},
    {id:'R2',projectId:'P',sourceFileId:'F',clause:'C3',title:'Delivery confirmed',original:'Same words'},
    {id:'R3',projectId:'P',sourceFileId:'F',original:'Unique words'}];
  assert.deepEqual(craftClauseTargets(source,rows,'wordcraft').map(t=>t.quote),['P3 Delivery pending\nSame words','C3 Delivery confirmed\nSame words','Unique words']);
  assert.deepEqual(craftClauseTargets(source,rows,'pdfcraft').map(t=>t.quote),['Same words','Same words','Unique words']);
});

test('Word table targets use native cell text without changing punctuation inside cells',()=>{
  const source={projectId:'P',fileId:'F',sourceVersion:'1'};
  const row=(id,original)=>({id,projectId:'P',sourceFileId:'F',original});
  const rows=[row('table','2：定位精度 Positioning Accuracy：≤ 0.05 mm：B：条件：额定负载'),
    row('model','4 | 噪声 Noise Level | ≤ 65 dB | C | 条件：正常运行'),
    row('paragraph','注：保持原文标点'),row('literal','3：供电：220 V')];
  const blocks=[{type:'table',content:'No | 项目Item | 规格 | Rev | Description\n2 | 定位精度 Positioning Accuracy | ≤ 0.05 mm | B | 条件：额定负载\n3 | 供电 | 220 V\n4 | 噪声 Noise Level | ≤ 65 dB | C | 条件：正常运行'},
    {type:'paragraph',content:'注：保持原文标点'}, {type:'paragraph',content:'3：供电：220 V'}];
  assert.deepEqual(craftClauseTargets(source,rows,'wordcraft',blocks).map(t=>t.quote),
    ['2 定位精度 Positioning Accuracy ≤ 0.05 mm B 条件：额定负载','4 噪声 Noise Level ≤ 65 dB C 条件：正常运行','注：保持原文标点','3：供电：220 V']);
  assert.deepEqual(craftClauseTargets(source,rows,'pdfcraft',blocks).map(t=>t.quote),rows.map(r=>r.original));
});

test('Word table targets locate a unique row when the quote ends at a cell separator',()=>{
  const source={projectId:'P',fileId:'F',sourceVersion:'1'};
  const prefix='1 | 晶圆尺寸 Wafer Size | 300 mm | A |';
  const description='上料模块须支持 300 mm 硅晶圆，并兼容标准 FOUP。';
  const row={id:'R',projectId:'P',sourceFileId:'F',original:prefix};
  const table={type:'table',content:`${prefix} ${description}\n2 | 定位精度 | 0.05 mm | A | 额定负载`};
  const repeated={type:'table',content:`${prefix} 其他要求`};

  assert.equal(craftClauseTargets(source,[row],'wordcraft',[table])[0].quote,
    `1 晶圆尺寸 Wafer Size 300 mm A ${description}`);
  assert.equal(craftClauseTargets(source,[row],'wordcraft',[table,repeated])[0].quote,prefix);
  assert.equal(craftClauseTargets(source,[row],'pdfcraft',[table])[0].quote,prefix);
});

test('Word table targets locate rows when extracted quotes omit trailing empty cells',()=>{
  const source={projectId:'P',fileId:'F',sourceVersion:'1'};
  const table={type:'table',content:'No | Item | Spec | Notes\n1 | 设计压力 | 2 MPa | '};
  const row={id:'R',projectId:'P',sourceFileId:'F',original:'1 | 设计压力 | 2 MPa'};

  assert.equal(craftClauseTargets(source,[row],'wordcraft',[table])[0].quote,'1 设计压力 2 MPa');
});
