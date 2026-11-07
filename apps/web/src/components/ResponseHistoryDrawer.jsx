import React, { useEffect, useState } from 'react';
import { Alert, List, Skeleton, Tag } from 'antd';
import { UiButton } from './AntContent';
import { Drawer, EmptyState, Modal } from './ui';
import { loadResponseHistory } from '../responseClient';
import './response-history.css';

const fields = [
  ['conclusion', '最终结论'], ['draft', '应答正文'], ['conditions', '适用条件'],
  ['reason', '备注'], ['evidence', '证据'],
];

function versionEntry(item, kind) {
  const historyVersion = kind === 'confirmation' ? item.confirmationVersion : item.checkpointVersion;
  return { item, kind, historyVersion, key: `${kind}:${historyVersion}`, label: kind === 'confirmation' ? `V${historyVersion}` : `检查点 R${historyVersion}` };
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

export default function ResponseHistoryDrawer({ requirement, canRestore, dirty, onRestore, onClose, open, afterOpenChange }) {
  const [history, setHistory] = useState(null);
  const [selection, setSelection] = useState(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadResponseHistory(requirement.id).then(data => {
      if (!cancelled) setHistory(data);
    }, failure => {
      if (!cancelled) setError(failure.message);
    });
    return () => { cancelled = true; };
  }, [requirement.id]);

  const versions = (history?.versions || []).map(item => versionEntry(item, 'confirmation'));
  const entries = [...versions, ...(history?.checkpoints || []).map(item => versionEntry(item, 'checkpoint'))];
  const latest = versions[0];
  const selected = entries.find(entry => entry.key === selection) || versions[1] || entries[0];
  const comparing = latest && selected && latest.key !== selected.key;
  const canSelectRestore = selected && (comparing || selected.kind === 'checkpoint' || requirement.status !== '已确认');
  const readyToRestore = canRestore && !dirty && canSelectRestore && !busy;
  const selectedSource = selected?.item;
  const sourceChanged = selectedSource && (
    selectedSource.sourceDocumentId && selectedSource.sourceDocumentId !== requirement.sourceFileId ||
    selectedSource.original != null && selectedSource.original !== requirement.original ||
    selectedSource.sourceRequirementText != null && selectedSource.sourceRequirementText !== requirement.requirementText ||
    selectedSource.sourceConditions != null && selectedSource.sourceConditions !== requirement.conditionsText
  );

  async function restore() {
    if (!readyToRestore) return;
    setBusy(true);
    setError('');
    try {
      if (await onRestore(selected) !== false) onClose();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Drawer title="确认历史" width="min(780px, 100vw)" open={open} afterOpenChange={afterOpenChange}
      onClose={() => { if (!busy) onClose(); }}
      footer={<div className="rfq-confirm-history-footer">
        {dirty && canRestore && <small>请先保存当前编辑，再恢复旧版。</small>}
        <UiButton disabled={busy} onClick={onClose}>关闭</UiButton>
        {canRestore && selected && <UiButton className="btn btn-primary" disabled={!readyToRestore} onClick={() => {
          setError(''); setConfirmationOpen(true);
        }}>恢复为草稿</UiButton>}
      </div>}>
      <div className="rfq-confirm-history">
        <p className="rfq-confirm-history-caption">条款 {requirement.clause || '无编号'} · {requirement.title}</p>
        {error && !confirmationOpen && <Alert type="error" showIcon message={error}/>}
        {!history ? !error && <Skeleton active/> : !selected ? <EmptyState title="暂无确认历史" description="确认本条后，可在这里查看完整应答版本。"/>
          : <div className="rfq-confirm-history-layout">
            <List size="small" aria-label="选择应答版本" dataSource={entries} rowKey="key" renderItem={entry => <List.Item>
              <button type="button" className="rfq-confirm-history-version" aria-pressed={selected.key === entry.key}
                disabled={busy} onClick={() => setSelection(entry.key)}>
                <span><strong>{entry.label}</strong>{entry.key === latest?.key && <Tag color="blue">最近确认</Tag>}</span>
                <small>{[entry.item.confirmedBy || entry.item.checkpointBy || entry.item.confirmedById, formatTime(entry.item.confirmedAt || entry.item.checkpointAt)].filter(Boolean).join(' · ')}</small>
                {entry.item.restoredFromVersion && <small>恢复自 V{entry.item.restoredFromVersion}{entry.item.restoredBy ? ` · ${entry.item.restoredBy}` : ''}</small>}
              </button>
            </List.Item>}/>
            <section className="rfq-confirm-history-comparison" aria-label="版本详情">
              {sourceChanged && <Alert type="warning" showIcon message="历史版本的来源条款有变化，恢复后请核对当前原文。"/>}
              <div className={`rfq-confirm-history-columns${comparing ? ' is-comparing' : ''}`}>
                {(comparing ? [latest, selected] : [selected]).map(entry => <section key={entry.key}>
                  <h3>{entry.key === latest?.key ? `最近确认 ${entry.label}` : entry.label}</h3>
                  <dl>{fields.map(([key, label]) => {
                    const value = entry.item[key] || '';
                    const changed = comparing && (latest.item[key] || '') !== (selected.item[key] || '');
                    return <div key={key} className={changed ? 'is-changed' : undefined}><dt>{label}{changed && <small> · 有变化</small>}</dt><dd>{value || '—'}</dd></div>;
                  })}</dl>
                </section>)}
              </div>
            </section>
          </div>}
      </div>
    </Drawer>
    {confirmationOpen && open !== false && <Modal title={`恢复 ${selected.label} 为草稿`} onClose={() => { if (!busy) setConfirmationOpen(false); }}
      footer={<><UiButton disabled={busy} onClick={() => setConfirmationOpen(false)}>取消</UiButton>
        <UiButton className="btn btn-primary" loading={busy} disabled={!readyToRestore} onClick={restore}>恢复为草稿</UiButton></>}>
      <p>把所选版本的应答带回当前条款，由当前确认人核对后确认。</p>
      {requirement.status !== '已确认' && <p>已保存的在编草稿会先保留为检查点。</p>}
      {error && <Alert type="error" showIcon message={error}/>}
    </Modal>}
  </>;
}
