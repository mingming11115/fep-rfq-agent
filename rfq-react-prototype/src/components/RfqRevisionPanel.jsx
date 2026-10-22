import React, { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Modal } from './ui';
import { diffRfqRequirements } from '../rfqWorkflow';
import '../pages/rfq-enhancements.css';
const labels = { added: '新增', modified: '修改', removed: '删除', unchanged: '不变' };
export default function RfqRevisionPanel({ project, requirements, actorRole, onApply, onRecorded }) {
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [source, setSource] = useState(''), [reason, setReason] = useState(''), [preview, setPreview] = useState(null), [error, setError] = useState('');
  function sample() {
    const current = requirements.filter((row) => !row.removedFromSource);
    const updated = current.filter((row) => row.clause !== '6.1').map((row, index) => ({ ...row, original: index === 2 ? `${row.original} 新版补充：须提交英文测试报告。` : row.original }));
    let clause = '7.1'; while (current.some((row) => row.clause === clause)) clause += '.1';
    updated.push({ clause, title: '远程诊断接口', category: '技术', original: '提供可授权关闭的远程诊断接口。' });
    setText(updated.map((row) => [row.clause, row.title, row.category, row.original.replaceAll('\n', ' ')].join(' | ')).join('\n')); setSource('客户 RFQ 新版（结构化演示）'); setReason('客户补充要求与交付范围'); setPreview(null); setError('');
  }
  function compare() {
    try {
      const incoming = text.split('\n').filter((line) => line.trim()).map((line, index) => { const parts = line.split(/\t|\|/).map((part) => part.trim()); if (parts.length < 4) throw new Error(`第 ${index + 1} 行格式不完整，需要条款编号、标题、类别、要求原文`); return { clause: parts[0], title: parts[1], category: parts[2], original: parts.slice(3).join(' | ') }; });
      const changes = diffRfqRequirements(requirements, incoming); setPreview({ incoming, changes, base: JSON.stringify(requirements) }); setError('');
    } catch (e) { setError(e.message); setPreview(null); }
  }
  function apply() {
    if (!source.trim() || !reason.trim()) return setError('请填写新版来源与变更原因');
    if (!preview || preview.base !== JSON.stringify(requirements)) return setError('工作条目已变化，请重新生成变更清单');
    if (!preview.changes.some((entry) => entry.kind !== 'unchanged')) return setError('未检测到条款变化');
    const result = onApply?.(preview.incoming, source, reason);
    if (!result) return;
    onRecorded?.({ id: `${project.id}-RFQ-${Date.now()}`, number: (project.version || 1) + 1, title: '客户 RFQ 条款变更', source, reason, unchecked: '按条款编号比较结构化原文；真实文件及图表解析未接入。', impacted: result.affectedIds, rows: structuredClone(result.rows.filter((row) => result.affectedIds.includes(row.id))), changes: result.changes, status: '待复核', createdAt: new Date().toLocaleString('zh-CN'), createdBy: actorRole });
    setOpen(false);
  }
  return <><div className="rfq-revision-entry"><div><h2><GitBranch size={15}/> 新版 RFQ 影响检查</h2><p>按条款定位变化，只复核受影响的应答，保留原有答复及历史快照。</p></div><button className="btn" disabled={actorRole !== '销售负责人' || !requirements.length} onClick={() => { setOpen(true); setPreview(null); setError(''); }}>比对新版 RFQ</button></div>{open && <Modal title="新版 RFQ · 变更与应答影响" width={920} onClose={() => setOpen(false)} footer={<><button className="btn" onClick={() => setOpen(false)}>取消</button><button className="btn" onClick={compare}>生成变更清单</button><button className="btn btn-primary" disabled={!preview || !preview.changes.some((entry) => entry.kind !== 'unchanged')} onClick={apply}>应用新版并复核影响项</button></>}><p className="rfq-revision-instruction">原型使用结构化条款演示。粘贴完整新版清单，一行一条：条款编号 | 标题 | 类别 | 要求原文。未出现的旧条款会标记为删除；真实文件解析暂未接入。</p><button className="text-link" onClick={sample}>载入新版示例</button><textarea className="rfq-revision-input" aria-label="新版 RFQ 条款" value={text} onChange={(event) => { setText(event.target.value); setPreview(null); }} placeholder="2.1 | 安全防护 | 技术 | 防护门开启时停止危险运动。"/><div className="form-grid"><label className="field"><span>新版来源</span><input className="input" value={source} onChange={(e) => setSource(e.target.value)}/></label><label className="field"><span>变更原因</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)}/></label></div>{error && <p className="error-notice" role="alert">{error}</p>}{preview && <><div className="rfq-revision-summary">{Object.entries(labels).map(([key, label]) => <span key={key}>{label} <b>{preview.changes.filter((entry) => entry.kind === key).length}</b></span>)}</div><p className="rfq-revision-instruction">修改和删除项的旧应答保留；新增项进入待确认。删除项保留历史，需在工作台确认范围处置。</p>{preview.changes.filter((entry) => entry.kind !== 'unchanged').map((entry) => <section className={`rfq-revision-change ${entry.kind}`} key={entry.clause}><header><strong>{entry.clause} · {entry.after?.title || entry.before?.title}</strong><span>{labels[entry.kind]}</span></header><div><article><small>原条款 · {entry.before?.title || "无"} · {entry.before?.category || "—"}</small>{entry.before?.original || '原版本无此条款'}</article><article><small>新条款 · {entry.after?.title || "无"} · {entry.after?.category || "—"}</small>{entry.after?.original || '新版已删除，保留原应答供范围处置'}</article></div></section>)}</>}</Modal>}</>;
}
