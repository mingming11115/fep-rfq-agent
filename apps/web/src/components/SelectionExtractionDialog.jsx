import React, {useEffect, useRef, useState} from 'react';
import {Alert, Card, Checkbox, Input, Modal, Space, Spin, Typography} from 'antd';
import {api} from '../authClient.js';
import {readRequirementSpecification} from '../requirementSpecification.js';

export default function SelectionExtractionDialog({file, selection, onSave, onClose}) {
  const [preview, setPreview] = useState(null);
  const [included, setIncluded] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const request = useRef(null);
  const savingRef = useRef(false);
  const candidates = preview?.candidates || [];
  const selected = candidates.filter(candidate => included.includes(candidate.id));

  useEffect(() => {
    let active = true;
    request.current ??= api.post(`/documents/${encodeURIComponent(file.backendDocumentId)}/selection-extraction`, selection);
    request.current.then(result => {
      if (!active) { return; }
      setPreview(result);
      setIncluded(result.candidates.map(candidate => candidate.id));
    }).catch(cause => {
      if (active) { setError(cause.message || '原文抽取失败'); }
    });
    return () => { active = false; };
  }, [file.backendDocumentId, selection]);

  function edit(id, field, value) {
    setPreview(current => ({...current, candidates: current.candidates.map(candidate =>
      candidate.id === id ? {...candidate, [field]:value} : candidate)}));
  }

  async function save() {
    if (savingRef.current || !selected.length || selected.some(row => !row.requirementText?.trim())) { return; }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave(file, selection, selected);
      onClose();
    } catch (cause) {
      setError(cause.message || '添加条款失败');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <Modal open title="抽取条款" width={780} onCancel={onClose} onOk={save}
    okText={selected.length ? `添加到应答（${selected.length}）` : '添加到应答'} cancelText="取消"
    confirmLoading={saving} closable={!saving} maskClosable={false} keyboard={!saving}
    cancelButtonProps={{disabled:saving}}
    okButtonProps={{disabled:!selected.length || selected.some(row => !row.requirementText?.trim())}}>
    <Space direction="vertical" size="middle" style={{width:'100%'}}>
      <Typography.Text type="secondary">{file.name}{selection.page ? ` · 第 ${selection.page} 页` : ''}</Typography.Text>
      <Input.TextArea aria-label="选中的原文" readOnly value={selection.text} autoSize={{minRows:2,maxRows:4}}/>
      {error && <Alert type="error" showIcon message={error}/>}
      {!preview && !error && <Spin tip="正在抽取选中的原文"><div style={{height:70}}/></Spin>}
      {preview?.issues?.length > 0 && <Alert type="warning" showIcon message={preview.issues.join('；')}/>}
      {preview && !candidates.length && <Alert type="info" showIcon message="未识别到可应答条款，请重新选择包含客户要求的原文。"/>}
      {candidates.map((candidate, index) => {
        const specification = readRequirementSpecification(candidate.metricsJson);
        const update = field => event => edit(candidate.id, field, event.target.value);
        return <Card key={candidate.id} size="small" title={<Checkbox disabled={saving} checked={included.includes(candidate.id)}
          onChange={event => setIncluded(current => event.target.checked ? [...current, candidate.id] : current.filter(id => id !== candidate.id))}>
          添加候选条款 {index + 1}
        </Checkbox>}>
          <Space direction="vertical" size="small" style={{width:'100%'}}>
            <Typography.Paragraph type="secondary">{candidate.originalText}</Typography.Paragraph>
            <Space wrap>
              <label>条款编号 <Input disabled={saving} value={candidate.customerClauseNo || ''} maxLength={64} onChange={update('customerClauseNo')}/></label>
              <label>标题 <Input disabled={saving} value={candidate.title || ''} maxLength={300} onChange={update('title')}/></label>
            </Space>
            <label>客户要求<Input.TextArea disabled={saving} value={candidate.requirementText || ''} autoSize={{minRows:2,maxRows:6}} onChange={update('requirementText')}/></label>
            {specification && <Typography.Text>规格　{specification}</Typography.Text>}
            {candidate.conditionsText && <label>适用条件<Input disabled={saving} value={candidate.conditionsText} onChange={update('conditionsText')}/></label>}
          </Space>
        </Card>;
      })}
    </Space>
  </Modal>;
}
