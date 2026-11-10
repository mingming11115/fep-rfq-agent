import React, {useState} from 'react';
import {Alert, Button, Card, Input, Select, Space, Tag} from 'antd';
import {api} from '../authClient.js';
import {Modal} from './ui';
import HistoryRecallPicker from './HistoryRecallPicker';

const labels = {pending:'待核对',active:'已生效',cancelled:'已取消'};
const path = (projectId, newId) => `/projects/${encodeURIComponent(projectId)}/document-replacements/${encodeURIComponent(newId)}`;

export default function ProjectReplacementPanel({project, files, actorRole, actorId, onReload, toast}) {
  const [sourceId, setSourceId] = useState('');
  const [file, setFile] = useState(null);
  const [recallMode, setRecallMode] = useState('default');
  const [recallIds, setRecallIds] = useState([]);
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const replacements = project.replacements || [];
  const canEdit = !project.archived && (actorRole === 'BU管理员' || actorRole === 'SR' && actorId === project.ownerId);
  const activeFiles = files.filter(file => file.activeForApproval !== false && !replacements.some(item => item.oldDocumentId === file.id && item.status === 'pending'));

  async function run(action) {
    if (busy) { return; }
    setBusy(true);
    setError('');
    try { await action(); }
    catch (error) { console.error('执行原件替换操作失败', error); setError(error.message); }
    finally { setBusy(false); }
  }
  async function upload() {
    const body = new FormData();
    body.append('file', file);
    if (recallMode === 'selected') {
      recallIds.forEach(id => body.append('historyDocumentIds', id));
    }
    await api.upload(`/projects/${encodeURIComponent(project.id)}/documents/${encodeURIComponent(sourceId)}/replacement`, body);
    setFile(null);
    setSourceId('');
    await onReload?.();
    toast('新版已登记，可解析并核对影响范围');
  }
  async function parse(id) {
    const result = await api.post(`/documents/${encodeURIComponent(id)}/parse-runs`);
    await onReload?.();
    if (!['completed','partial'].includes(result.status)) { throw new Error(result.message || '解析失败'); }
    toast('新版已解析，可核对条款');
  }
  async function inspect(id) {
    setPreview(await api.get(path(project.id, id)));
    setReason('');
  }
  async function apply(kind) {
    if (!reason.trim()) { throw new Error('请填写处理说明'); }
    await api.post(`${path(project.id, preview.newDocumentId)}/${kind}`, {reason, fingerprint:preview.fingerprint});
    setPreview(null);
    await onReload?.();
    toast(kind === 'activate' ? '新版已生效，受影响的条款需重新确认' : '新版已取消');
  }

  return <Card title={`当前工作版本 V${project.workVersion || 1}`}>
    {error && !preview && <Alert type="error" message={error} showIcon/>}
    {canEdit && <><Space wrap>
      <Select aria-label="要替换的原件" placeholder="选择要替换的原件" value={sourceId || undefined}
        disabled={busy} onChange={id=>{
          const ids = activeFiles.find(row=>row.id===id)?.historyDocumentIds || [];
          setSourceId(id);
          setFile(null);
          setRecallIds(ids);
          setRecallMode(ids.length ? 'selected' : 'default');
        }} options={activeFiles.map(row => ({value:row.id,label:`${row.name} · ${row.version}`}))} style={{minWidth:260}}/>
      <Input aria-label="新版原件" type="file" accept=".docx,.pdf" key={sourceId} onChange={event => setFile(event.target.files[0] || null)}/>
      <Button disabled={!sourceId || !file || recallMode === 'selected' && !recallIds.length} loading={busy} onClick={() => run(upload)}>登记新版</Button>
    </Space>{sourceId && <HistoryRecallPicker projectId={project.id} groupId={project.groupId} mode={recallMode} ids={recallIds}
      onMode={setRecallMode} onIds={setRecallIds} disabled={busy}/>}</>}
    <p>核对完成前，正式评审范围沿用原件。新版解析后可先起草应答。</p>
    {replacements.map(item => {
      const next = files.find(file => file.id === item.newDocumentId);
      return <p key={item.newDocumentId}><Space wrap>
        <span>{next?.name || item.newDocumentId}</span><Tag>{labels[item.status]}</Tag>
        {item.workVersion && <span>工作版本 V{item.workVersion}</span>}
        {canEdit && item.status === 'pending' && next?.status !== '完成' &&
          <Button size="small" loading={busy} onClick={() => run(() => parse(item.newDocumentId))}>解析新版</Button>}
        <Button size="small" disabled={busy} onClick={() => run(() => inspect(item.newDocumentId))}>查看影响范围</Button>
      </Space></p>;
    })}
    {preview && <Modal title="核对新版原件影响范围" width={920} onClose={() => { if (!busy) { setPreview(null); } }}
      footer={<Space><Button onClick={() => setPreview(null)} disabled={busy}>关闭</Button>
        {canEdit && preview.status === 'pending' && <Button danger disabled={busy} onClick={() => run(() => apply('cancel'))}>取消新版</Button>}
        {canEdit && preview.canActivate && <Button type="primary" loading={busy} onClick={() => run(() => apply('activate'))}>确认范围并生效</Button>}
      </Space>}>
      {error && <Alert type="error" message={error} showIcon/>}
      {preview.status === 'pending' && !preview.canActivate && <Alert type="info" message="解析完成并核对新版全部条款后才能生效。"/>}
      <div className="form-grid">
        {[[preview.oldName,preview.before],[preview.newName,preview.after]].map(([name,rows],index) => <section key={index}>
          <h3>{index ? '新版' : '原件'}　{name}（{rows.length} 条）</h3>
          <ol>{rows.map(row => <li key={row.id}><strong>{row.clause} {row.title}</strong><p>{row.original}</p>
            {row.status !== 'VALID' && <Tag color="orange">条款待核对</Tag>}</li>)}</ol>
        </section>)}
      </div>
      {canEdit && preview.status === 'pending' && <Input.TextArea aria-label="范围核对说明" placeholder="说明来源完整性、影响范围和处理原因"
        value={reason} maxLength={900} onChange={event => setReason(event.target.value)}/>}
    </Modal>}
  </Card>;
}
