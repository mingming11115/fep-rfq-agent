import React, {useEffect, useState} from 'react';
import {Alert, Button, Radio, Select} from 'antd';
import {matchClient} from '../requirementMatchClient.js';

const matches = matchClient();
const statusLabels = {ready:'可召回', index_pending:'等待索引', unpublished:'无已发布条款'};

export default function HistoryRecallPicker({projectId, groupId, mode, ids, onMode, onIds, disabled}) {
  const [options, setOptions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (mode !== 'selected') { return; }
    let active = true;
    setLoading(true);
    setError('');
    matches.historyOptions(projectId).then(rows => {
      if (active) { setOptions(rows); }
    }).catch(cause => {
      console.error('读取历史 RFQ 召回选项失败', cause);
      if (active) { setError(cause.message); }
    }).finally(() => {
      if (active) { setLoading(false); }
    });
    return () => { active = false; };
  }, [projectId, mode, attempt]);

  return <div className="field">
    <strong>知识库召回范围</strong>
    <Radio.Group aria-label="知识库召回范围" disabled={disabled} value={mode}
      onChange={event => onMode(event.target.value)}
      options={[{label:groupId ? '所有同 Group RFQ 比对' : '旧项目自动比对',value:'default'},
        {label:'仅从指定历史 RFQ 文件召回',value:'selected'}]}/>
    {mode === 'selected' && <>
      <Select aria-label="历史 RFQ 参考文件" mode="multiple" allowClear maxCount={20}
        placeholder="请选择历史 RFQ 文件版本" optionFilterProp="label" value={ids} onChange={onIds}
        disabled={disabled} loading={loading}
        notFoundContent={loading ? '正在读取文件' : '当前项目没有可选文件'}
        options={options.map(row => ({value:row.id, label:[row.name || row.id, row.version, statusLabels[row.status]].filter(Boolean).join(' · '),
          disabled:row.status === 'unpublished'}))}/>
      {error && <Alert type="error" message={error} action={<Button size="small" onClick={() => setAttempt(value => value + 1)}>重试</Button>}/>}
      <small className="muted">只召回所选版本的已发布条款。共享条款索引未就绪时，比对会等待同步。</small>
    </>}
  </div>;
}
