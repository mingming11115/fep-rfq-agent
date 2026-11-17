import React, {useEffect, useRef, useState} from 'react';
import {Alert, Button} from 'antd';
import {api} from '../authClient.js';
import {Modal} from './ui';
import {isSourceParsing} from '../useSourceParsing';
import HistoryRecallPicker from './HistoryRecallPicker';

/** 把阻断明细拼成一行文案；无阻断项时返回空串，用于决定是否展示提示块。 */
function blockerText(blockers) {
  const parts = [];
  if (blockers?.responses > 0) { parts.push(`应答 ${blockers.responses} 条`); }
  if (blockers?.reviews > 0) { parts.push(`评审 ${blockers.reviews} 条`); }
  if (blockers?.snapshots > 0) { parts.push(`定稿快照 ${blockers.snapshots} 份`); }
  return parts.join('、');
}

export default function SourceReparseDialog({project, files, currentFileId, onClose, onReparse, onOpenReplacement}) {
  const available = files.filter(file => !isSourceParsing(file));
  const [fileId, setFileId] = useState(() => currentFileId || (available.length === 1 ? available[0].id : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blockers, setBlockers] = useState(null);
  const submitting = useRef(false);
  const file = files.find(item => item.id === fileId);
  const [recallIds, setRecallIds] = useState(() => file?.historyDocumentIds ?? []);
  const [recallMode, setRecallMode] = useState(() => recallIds.length ? 'selected' : 'default');
  const missingRecallFiles = recallMode === 'selected' && !recallIds.length;
  const close = () => { if (!submitting.current) { onClose(); } };
  const blocked = blockerText(blockers);

  // 提交前先问服务端「这份原件已经产生了什么」，避免用户点了确认才被 409 拦下。
  useEffect(() => {
    let live = true;
    setBlockers(null);
    if (!fileId) { return () => { live = false; }; }
    api.get(`/documents/${encodeURIComponent(fileId)}/parse-blockers`)
      .then(data => { if (live) { setBlockers(data); } })
      .catch(failure => { console.error('读取重解析阻断项失败', failure); });
    return () => { live = false; };
  }, [fileId]);

  async function submit() {
    if (submitting.current || !file || isSourceParsing(file) || missingRecallFiles) { return; }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await onReparse(project.id, file.id, recallMode === 'selected' ? recallIds : []);
      onClose();
    } catch (failure) {
      console.error('重新解析原件失败', failure);
      setError(failure.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <Modal title="重新解析 RFQ 原件" onClose={close} closable={!busy} width={560}
    footer={<><Button disabled={busy} onClick={close}>取消</Button>
      <Button type="primary" loading={busy} disabled={!file || isSourceParsing(file) || missingRecallFiles} onClick={submit}>确认重新解析</Button></>}>
    <p>{project.name}</p>
    {currentFileId ? <p><strong>{file?.name}</strong> {file?.version} · {file?.status}</p> :
      <label className="field"><span>选择文件</span>
        <select className="select" aria-label="选择重新解析的文件" value={fileId} disabled={busy}
          onChange={event => {
            const nextId = event.target.value;
            const ids = files.find(item => item.id === nextId)?.historyDocumentIds ?? [];
            setFileId(nextId);
            setRecallIds(ids);
            setRecallMode(ids.length ? 'selected' : 'default');
            setError('');
          }}>
          <option value="" disabled>请选择一份原件</option>
          {files.map(item => <option key={item.id} value={item.id} disabled={isSourceParsing(item)}>
            {item.name} · {item.version} · {item.status}
          </option>)}
        </select>
      </label>}
    {file && <HistoryRecallPicker projectId={project.backendProjectId || project.id} groupId={project.groupId} mode={recallMode} ids={recallIds}
      onMode={setRecallMode} onIds={setRecallIds} disabled={busy || isSourceParsing(file)}/>}
    {blocked && <Alert type="warning" showIcon message="该原件已产生下游记录，重解析会被拒绝"
      description={<div>
        <p>{blocked}{blockers?.clauses?.length ? `；涉及条款 ${blockers.clauses.join('、')}` : ''}</p>
        <p>请在项目设置「原件换版」登记新版原件，解析新版后核对影响范围；核对完成前正式评审仍沿用原件。</p>
        {onOpenReplacement && <Button size="small" onClick={onOpenReplacement}>去登记新版</Button>}
      </div>}/>}
    <p className="muted">{blocked
      ? '重解析会整体替换条款并重新分配编号，已有应答、评审与定稿记录将无法继续对应。'
      : '解析成功后将更新该文件的抽取条款。已有人工修正或应答记录时，请使用「原件换版」。'}</p>
    {busy && <Alert type="info" showIcon message={`正在重新解析 ${file?.name || ''}`}/>}
    {error && <Alert type="error" showIcon message={error}/>}
  </Modal>;
}
