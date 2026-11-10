import React, {useState} from 'react';
import {Alert, Button, Space} from 'antd';
import {matchClient} from '../requirementMatchClient.js';
import HistoryRecallPicker from './HistoryRecallPicker';
import {Modal} from './ui';

const matches = matchClient();

export default function DocumentRecallControl({projectId, document, ids, historyDocuments, canEdit, disabled, onSaved, toast}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('default');
  const [selection, setSelection] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function start() {
    setSelection(ids);
    setMode(ids.length ? 'selected' : 'default');
    setError('');
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const result = await matches.saveDocumentScope(document.backendDocumentId, mode === 'selected' ? selection : []);
      onSaved(result.historyDocumentIds);
      setOpen(false);
      toast?.(result.queuedCount ? `已提交 ${result.queuedCount} 条应答项重新比对` : '召回范围已保存');
    } catch (cause) {
      console.error('保存原件召回范围失败', cause);
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  const names = ids.map(id => {
    const file = historyDocuments.find(item => item.id === id);
    return file ? [file.name, file.version].filter(Boolean).join(' · ') : '不可用的历史文件';
  });
  return <section className="response-notice" aria-label="当前原件的知识库召回范围">
    <div>
      <strong>当前原件的召回范围</strong>
      <p>{names.length ? names.join('、') : '按三库策略自动比对'}</p>
      {canEdit && <Button size="small" disabled={disabled} onClick={start}>修改范围并重新比对</Button>}
    </div>
    {open && <Modal title="修改原件召回范围" onClose={() => { if (!saving) { setOpen(false); } }}
      footer={<Space><Button disabled={saving} onClick={() => setOpen(false)}>取消</Button>
        <Button type="primary" loading={saving} disabled={mode === 'selected' && !selection.length} onClick={save}>保存并重新比对</Button></Space>}>
      <p>{document.name} · {document.version}</p>
      <p>范围有变化时，重新比对此原件已核对的条款。已解析的条款和人工答复会保留。</p>
      <HistoryRecallPicker projectId={projectId} mode={mode} ids={selection}
        onMode={setMode} onIds={setSelection} disabled={saving}/>
      {error && <Alert type="error" message={error} showIcon/>}
    </Modal>}
  </section>;
}
