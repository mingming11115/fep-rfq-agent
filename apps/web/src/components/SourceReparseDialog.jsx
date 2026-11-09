import React, {useRef, useState} from 'react';
import {Alert, Button} from 'antd';
import {Modal} from './ui';
import {isSourceParsing} from '../useSourceParsing';

export default function SourceReparseDialog({project, files, currentFileId, onClose, onReparse}) {
  const available = files.filter(file => !isSourceParsing(file));
  const [fileId, setFileId] = useState(() => currentFileId || (available.length === 1 ? available[0].id : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const file = files.find(item => item.id === fileId);
  const close = () => { if (!submitting.current) onClose(); };

  async function submit() {
    if (submitting.current || !file || isSourceParsing(file)) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await onReparse(project.id, file.id);
      onClose();
    } catch (failure) {
      setError(failure.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <Modal title="重新解析 RFQ 原件" onClose={close} closable={!busy} width={560}
    footer={<><Button disabled={busy} onClick={close}>取消</Button>
      <Button type="primary" loading={busy} disabled={!file || isSourceParsing(file)} onClick={submit}>确认重新解析</Button></>}>
    <p>{project.name}</p>
    {currentFileId ? <p><strong>{file?.name}</strong> {file?.version} · {file?.status}</p> :
      <label className="field"><span>选择文件</span>
        <select className="select" aria-label="选择重新解析的文件" value={fileId} disabled={busy}
          onChange={event => { setFileId(event.target.value); setError(''); }}>
          <option value="" disabled>请选择一份原件</option>
          {files.map(item => <option key={item.id} value={item.id} disabled={isSourceParsing(item)}>
            {item.name} · {item.version} · {item.status}
          </option>)}
        </select>
      </label>}
    <p className="muted">解析成功后将更新该文件的抽取条款。已有人工修正或应答记录时，请使用「原件换版」。</p>
    {busy && <Alert type="info" showIcon message={`正在重新解析 ${file?.name || ''}`}/>}
    {error && <Alert type="error" showIcon message={error}/>}
  </Modal>;
}
