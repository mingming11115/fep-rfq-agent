import React, { useEffect, useRef, useState } from 'react';
import { Upload, FileText, Check, AlertCircle, ArrowRight, Download, Plus, Search, RefreshCw, X, ShieldCheck, ChevronRight, ListChecks } from 'lucide-react';
import { Modal, Drawer } from '../components/ui';
import { makeRequirements } from '../data';
import { makeDocumentDemo } from '../documentMocks';
import { getExportIssues, makeSnapshot, toCsv } from '../domain';
import './workflow-pages.css';

const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toLocaleString('zh-CN', { hour12: false });
const isPendingReview = (review) => ['待审批', '待批准'].includes(review?.status);
const isClosed = (review) => ['已关闭', '已完成', '批准关闭'].includes(review.status);
const isConfirmed = (row) => row.status === '已确认';
const asText = (value) => Array.isArray(value) ? value.map((v) => typeof v === 'string' ? v : v.name || v.title || v.id).filter(Boolean).join('；') : String(value ?? '');
const tone = (status) => /失败|退回|逾期|不满足|失效/.test(status || '') ? 'danger' : /已确认|完成|已关闭|已批准|通过/.test(status || '') ? 'success' : /处理中|待|审批|队列|排队/.test(status || '') ? 'warning' : 'neutral';
function Badge({ value }) { return <span className={`badge ${tone(value)}`}>{value || '未设置'}</span>; }
function Notice({ children, type = 'info' }) { return <div className={`flow-notice flow-notice-${type}`}><AlertCircle size={16} /><div>{children}</div></div>; }
function NoRows({ title = '暂无数据', children }) { return <div className="empty-state"><FileText size={34} /><strong>{title}</strong><p>{children}</p></div>; }
function Field({ label, children, required = false, wide = false }) { return <label className={`field ${wide ? 'flow-field-wide' : ''}`}><span>{required && <i className="flow-required">*</i>}{label}</span>{children}</label>; }
function Pager({ count, page = 1, pageSize = 6, onChange }) {
  const last = Math.max(1, Math.ceil(count / pageSize));
  return <div className="flow-pager"><span>共 {count} 条记录</span><div><button className="btn btn-sm" disabled={page <= 1} onClick={() => onChange?.(page - 1)}>上一页</button><button className="btn btn-sm flow-page-number">{page}</button><button className="btn btn-sm" disabled={page >= last} onClick={() => onChange?.(page + 1)}>下一页</button><span>{pageSize} 条 / 页</span></div></div>;
}
function useUnsavedWarning(dirty) {
  useEffect(() => { const guard = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty]);
}
const metadataStorage = (projectId) => `fep-rfq-documents:${projectId}`;
function readDocumentState(projectId) { try { return JSON.parse(localStorage.getItem(metadataStorage(projectId)) || 'null'); } catch { return null; } }

export function DocumentsPage({ project, requirements = [], onImport, toast, navigate, logEvent = () => {} }) {
  const [files, setFiles] = useState(() => readDocumentState(project.id)?.files || makeDocumentDemo(project.id).files);
  const [parsed, setParsed] = useState(() => readDocumentState(project.id)?.parsed || makeDocumentDemo(project.id, requirements.length ? requirements : makeRequirements(project.id)).parsed);
  const [selected, setSelected] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [purpose, setPurpose] = useState('要求来源');
  const [replacementReason, setReplacementReason] = useState('');
  const [version, setVersion] = useState('V1.0');
  const [visibility, setVisibility] = useState('项目成员可见');
  const [fileTab, setFileTab] = useState('文件清单');
  const [fileDetail, setFileDetail] = useState(null);
  const [editor, setEditor] = useState(null);
  const [editMode, setEditMode] = useState('edit');
  const [editReason, setEditReason] = useState('');
  const [secondText, setSecondText] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('全部类别');
  const [page, setPage] = useState(1);
  const inputRef = useRef(null);
  const timers = useRef([]);
  const imported = new Set(requirements.map((r) => r.id));
  const active = parsed.find((r) => r.id === activeId) || parsed[0];
  const filtered = parsed.filter((r) => `${r.clause} ${r.title} ${r.original}`.toLowerCase().includes(search.toLowerCase()) && (category === '全部类别' || category === r.category));
  const shown = filtered.slice((page - 1) * 6, page * 6);
  const selectable = selected.filter((id) => parsed.some((r) => r.id === id) && !imported.has(id));
  useEffect(() => { localStorage.setItem(metadataStorage(project.id), JSON.stringify({ files, parsed })); }, [files, parsed, project.id]);
  useEffect(() => {
    files.filter((file) => ['排队中', '处理中'].includes(file.status)).forEach(scheduleParse);
    return () => timers.current.forEach(clearTimeout);
  }, []);
  useEffect(() => { setPage(1); }, [search, category]);
  useEffect(() => { setPage((old) => Math.min(old, Math.max(1, Math.ceil(filtered.length / 6)))); }, [filtered.length]);
  useUnsavedWarning(!!editor);

  function loadSample() {
    const demo = makeDocumentDemo(project.id, requirements.length ? requirements : makeRequirements(project.id));
    setFiles((old) => [...old, ...demo.files.filter((file) => !old.some((existing) => existing.id === file.id))]);
    setParsed((old) => {
      const linked = old.map((row) => {
        const sample = demo.parsed.find((item) => item.id === row.id);
        return sample && !row.sourceFileId ? { ...row, source: sample.source, sourceFileId: sample.sourceFileId, sourceVersion: sample.sourceVersion } : row;
      });
      return [...linked, ...demo.parsed.filter((row) => !old.some((existing) => existing.id === row.id))];
    });
    setActiveId(parsed[0]?.id || demo.parsed[0]?.id);
    logEvent('加载解析示例', project.id, '补齐多版本模拟资料及条目来源，保留已有文件和编辑');
    toast('已补齐示例：9 条文件版本记录，包含替换原因、附件、模板与失败案例');
  }
  function scheduleParse(file) {
    const fail = !/\.(pdf|docx?|xlsx?|csv|txt)$/i.test(file.name);
    timers.current.push(setTimeout(() => setFiles((old) => old.map((f) => f.id === file.id ? { ...f, status: '处理中', error: '' } : f)), 350));
    timers.current.push(setTimeout(() => {
      if (fail) { setFiles((old) => old.map((f) => f.id === file.id ? { ...f, status: '失败', error: '演示解析器仅支持 PDF、Word、Excel、CSV、TXT；请转换格式或手动补录。' } : f)); logEvent('解析失败', file.id, '不支持的文件格式'); return; }
      if (file.purpose !== '要求来源') { setFiles((old) => old.map((f) => f.id === file.id ? { ...f, status: '完成' } : f)); return; }
      const rows = makeRequirements(project.id).slice(0, 4).map((r, index) => ({ ...r, id: `${file.id}-R${index + 1}`, clause: `${index + 1}.1`, status: '待确认', source: file.name, sourcePage: index + 2, sourceFileId: file.id, confirmedAt: undefined, confirmedBy: undefined, parserNote: '模拟解析结果，请与真实原件核对', version: 1 }));
      setParsed((old) => old.some((r) => r.sourceFileId === file.id) ? old : [...old, ...rows]);
      setFiles((old) => old.map((f) => f.id === file.id ? { ...f, status: '待核对', parsedCount: rows.length } : f));
      setActiveId(rows[0]?.id); logEvent('模拟解析完成', file.id, `${rows.length} 条待核对要求`);
    }, 1250));
  }
  function upload() {
    if (!uploadFiles.length) { setError('请选择至少一个文件'); return; }
    if (!version.trim()) { setError('请填写文件版本'); return; }
    const duplicates = uploadFiles.some((f) => files.some((old) => old.name === f.name));
    if (duplicates && !replacementReason.trim()) { setError('存在同名文件，请填写替换原因；旧版本将继续保留。'); return; }
    const incoming = uploadFiles.map((f) => ({ id: uid('FILE'), name: f.name, size: f.size, mime: f.type, lastModified: f.lastModified, purpose, version, visibility, reason: replacementReason.trim(), previousVersionId: files.find((old) => old.name === f.name)?.id, status: '排队中', createdAt: now() }));
    setFiles((old) => [...old, ...incoming]); incoming.forEach(scheduleParse); setUploadOpen(false); setUploadFiles([]); setError('');
    logEvent('上传资料元数据', project.id, `${incoming.length} 个文件；${purpose}；${version}`); toast('文件已进入模拟处理队列；只保存文件名、大小等元数据');
  }
  function openEditor(mode, row = active, sourceFile = null) {
    if (mode === 'merge' && selected.length < 2) { toast('请先选择至少两条要求'); return; }
    const base = row || makeRequirements(project.id)[0];
    if (!base) return;
    const rows = parsed.filter((r) => selected.includes(r.id));
    const draft = mode === 'add' ? { ...base, id: uid('REQ'), clause: `${parsed.length + 1}.1`, title: '', original: '', conclusion: '待确认', draft: '', evidence: '', reason: '', matchLevel: 'none', score: 0, confirmedAt: undefined, confirmedBy: undefined, conditions: '', source: sourceFile?.name || '人工补录', sourceFileId: sourceFile?.id, sourcePage: 1, category: '技术', status: '待确认', version: 1 } : mode === 'merge' ? { ...rows[0], id: uid('REQ'), title: rows.map((r) => r.title).join(' / '), original: rows.map((r) => r.original).join('\n'), source: [...new Set(rows.map((r) => `${asText(r.source)}（第 ${r.sourcePage || 1} 页）`))].join('；'), sourcePage: '多来源', conditions: [...new Set(rows.map((r) => asText(r.conditions)).filter(Boolean))].join('；'), parentIds: rows.map((r) => r.id), status: '待确认' } : { ...base, conditions: asText(base.conditions), source: asText(base.source) };
    setEditor(draft); setEditMode(mode); setSecondText(''); setEditReason(''); setError('');
  }
  function saveEditor() {
    if (!editor.title.trim() || !editor.original.trim() || !asText(editor.source).trim()) { setError('请完整填写条目标题、要求原文和来源定位'); return; }
    if (!editReason.trim()) { setError('请填写本次修订或补录原因'); return; }
    if (editMode === 'split' && !secondText.trim()) { setError('请填写拆分后第二条要求的原文'); return; }
    const touched = editMode === 'merge' ? editor.parentIds : [editor.id];
    if (touched.some((id) => imported.has(id))) { setError('已导入要求请前往RFQ比对页修订，避免覆盖已确认内容。'); return; }
    let output = [{ ...editor, status: '待确认', version: Number(editor.version || 0) + 1, ...(editMode === 'split' || editMode === 'merge' ? { parseParents: parsed.filter((r) => touched.includes(r.id)).map((r) => ({ ...r })) } : {}), parseHistory: [...(editor.parseHistory || []), { time: now(), action: editMode, reason: editReason }] }];
    if (editMode === 'split') output = [{ ...output[0], id: uid('REQ'), parentId: editor.id, title: `${editor.title}（1）` }, { ...output[0], id: uid('REQ'), parentId: editor.id, clause: `${editor.clause}.2`, title: `${editor.title}（2）`, original: secondText }];
    setParsed((old) => [...old.filter((r) => !touched.includes(r.id) || editMode === 'add'), ...output]);
    if (editMode === 'add' && editor.sourceFileId) setFiles((old) => old.map((file) => file.id === editor.sourceFileId && file.status === '失败' ? { ...file, status: '待核对', error: '', handlingMode: '人工补录' } : file));
    setSelected((old) => old.filter((id) => !touched.includes(id))); setActiveId(output[0].id); setEditor(null); logEvent('解析条目修订', editor.id, `${editMode}：${editReason}`); toast('修订已保存；条目回到待核对，来源信息已保留');
  }
  function confirmImport() {
    const rows = parsed.filter((r) => selectable.includes(r.id));
    if (!rows.length) { toast('请先选择尚未导入的条目'); return; }
    onImport(rows.map((r) => ({ ...r, status: '待确认', parseConfirmed: true })));
    const sourceIds = rows.map((r) => r.sourceFileId).filter(Boolean);
    setFiles((old) => old.map((f) => sourceIds.includes(f.id) && parsed.filter((r) => r.sourceFileId === f.id).every((r) => imported.has(r.id) || selectable.includes(r.id)) ? { ...f, status: '完成' } : f));
    setSelected([]); logEvent('确认解析并匹配', project.id, `明确选中 ${rows.length} 条；其余条目保留待核对`); toast(`已导入 ${rows.length} 条要求，进入RFQ比对`); navigate('response');
  }
  const editTitles = { edit: '修订解析条目', add: '人工补录要求', split: '拆分要求条目', merge: '合并要求条目' };
  return <div className="flow-page">
    <div className="page-heading"><div><h1>RFQ 解析</h1><p>上传客户资料，核对解析结果并保留每一条要求的来源。</p></div><div className="page-actions"><button className="btn" onClick={loadSample}><FileText size={16} />载入示例</button><button className="btn btn-primary" onClick={() => { setUploadOpen(true); setError(''); }}><Upload size={16} />上传资料</button></div></div>
    <Notice>交互原型 · 文件仅保存元数据，解析结果使用模拟数据。仅“要求来源”生成要求条目；真实文件内容不会上传或读取。</Notice>
    <div className="flow-stat-strip"><div><span>已添加资料</span><strong>{files.length}</strong></div><div><span>解析条目</span><strong>{parsed.length}</strong></div><div><span>待核对导入</span><strong>{parsed.filter((r) => !imported.has(r.id)).length}</strong></div><div><span>失败任务</span><strong className={files.some((f) => f.status === '失败') ? 'flow-red' : ''}>{files.filter((f) => f.status === '失败').length}</strong></div></div>
    <section className="panel"><div className="panel-header"><h2>项目资料</h2><span className="muted">上传完成不代表证据有效</span></div><div className="tabs"><button className={fileTab === '文件清单' ? 'active' : ''} onClick={() => setFileTab('文件清单')}>文件清单 <span>{files.length}</span></button><button className={fileTab === '版本记录' ? 'active' : ''} onClick={() => setFileTab('版本记录')}>文件版本</button></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>文件名称 / 任务编号</th><th>用途</th><th>版本</th><th>处理状态</th><th>上传时间</th><th>操作</th></tr></thead><tbody>{files.map((file) => <tr key={file.id}><td><button className="text-link flow-file-name" onClick={() => setFileDetail(file)}><FileText size={16} />{file.name}</button><div className="muted flow-small">{fileTab === '版本记录' ? (file.previousVersionId ? `替代 ${file.previousVersionId} · ${file.reason}` : '初始版本') : `${file.id} · ${(file.size / 1024 / 1024).toFixed(2)} MB`}</div></td><td>{file.purpose}</td><td>{file.version}</td><td><Badge value={file.status} />{file.error && <div className="flow-error-inline">{file.error}</div>}</td><td className="flow-nowrap">{file.createdAt}</td><td><div className="flow-inline-actions"><button className="text-link" onClick={() => setFileDetail(file)}>详情</button>{file.status === '失败' && <button className="text-link" onClick={() => { setFiles((old) => old.map((f) => f.id === file.id ? { ...f, status: '排队中' } : f)); scheduleParse(file); toast('已重新进入模拟解析队列'); }}>重试</button>}{file.status === '失败' && <button className="text-link" onClick={() => openEditor('add', null, file)}>手动补录</button>}{file.status === '待核对' && <button className="text-link" onClick={() => { const row = parsed.find((r) => r.sourceFileId === file.id) || parsed[0]; setActiveId(row?.id); document.getElementById('flow-parsed-table')?.scrollIntoView({ behavior: 'smooth' }); }}>核对条目</button>}</div></td></tr>)}</tbody></table></div>{!files.length && <NoRows title="还没有项目资料">上传 RFQ 文档，或载入示例体验解析流程。</NoRows>}
    </section>
    <section className="panel" id="flow-parsed-table"><div className="panel-header"><h2>解析结果核对</h2><button className="text-link" onClick={() => openEditor('add')}><Plus size={15} />补录条目</button></div>
      <div className="flow-filterbar"><label className="flow-search"><Search size={16} /><input className="input" aria-label="搜索解析条目" placeholder="搜索条款编号、标题或原文" value={search} onChange={(e) => setSearch(e.target.value)} /></label><select className="select" aria-label="条目类别" value={category} onChange={(e) => setCategory(e.target.value)}><option>全部类别</option>{[...new Set(parsed.map((r) => r.category))].filter(Boolean).map((v) => <option key={v}>{v}</option>)}</select><button className="btn" onClick={() => { setSearch(''); setCategory('全部类别'); }}>重置</button></div>
      <div className="flow-selection"><span>已选择 <b>{selected.length}</b> 条，其中 <b>{selectable.length}</b> 条可导入</span><div className="flow-inline-actions"><button className="text-link" disabled={selected.length < 2} onClick={() => openEditor('merge')}>合并所选</button><button className="text-link" onClick={() => setSelected([])}>清空选择</button></div></div>
      <div className="flow-parse-split"><div className="flow-original-pane"><div className="flow-pane-title"><FileText size={15} />来源定位 / 原文对照</div>{active ? <><div className="flow-source-location">{asText(active.source)}<br /><span>第 {active.sourcePage || 1} 页 · 条款 {active.clause}</span></div><div className="flow-paper"><div className="flow-paper-watermark">模拟原文视图</div><small>{project.customer || '客户'} · 技术要求</small><h3>{active.clause} {active.title}</h3><p className="flow-source-highlight">{active.original}</p><p className="muted flow-small">此处仅展示模拟条文与来源元数据。真实文件请在本地核对原件。</p><div className="flow-paper-line" /><div className="flow-paper-line" /><div className="flow-paper-line flow-short" /></div></> : <NoRows title="等待核对">添加资料后，选择右侧条目定位来源。</NoRows>}</div>
        <div className="flow-parsed-list"><div className="table-wrap"><table className="data-table"><thead><tr><th className="flow-check-cell"><input type="checkbox" aria-label="选择本页未导入条目" checked={shown.some((r) => !imported.has(r.id)) && shown.filter((r) => !imported.has(r.id)).every((r) => selected.includes(r.id))} onChange={(e) => setSelected((old) => e.target.checked ? [...new Set([...old, ...shown.filter((r) => !imported.has(r.id)).map((r) => r.id)])] : old.filter((id) => !shown.some((r) => r.id === id)))} /></th><th>条款 / 要求条目</th><th>类别</th><th>核对状态</th><th>操作</th></tr></thead><tbody>{shown.map((row) => <tr key={row.id} className={active?.id === row.id ? 'flow-row-active' : ''} onClick={() => setActiveId(row.id)}><td><input type="checkbox" aria-label={`选择 ${row.title}`} disabled={imported.has(row.id)} checked={selected.includes(row.id)} onChange={(e) => setSelected((old) => e.target.checked ? [...old, row.id] : old.filter((id) => id !== row.id))} onClick={(e) => e.stopPropagation()} /></td><td><button className="text-link" onClick={() => setActiveId(row.id)}>{row.clause} {row.title}</button><div className="flow-cell-excerpt">{row.original}</div>{row.parentId && <span className="muted flow-small">拆分自 {row.parentId}</span>}{row.parentIds && <span className="muted flow-small">保留 {row.parentIds.length} 个父条目来源</span>}</td><td>{row.category}</td><td><Badge value={imported.has(row.id) ? '已导入' : '待核对'} /></td><td><div className="flow-inline-actions"><button className="text-link" disabled={imported.has(row.id)} onClick={(e) => { e.stopPropagation(); openEditor('edit', row); }}>编辑</button><button className="text-link" disabled={imported.has(row.id)} onClick={(e) => { e.stopPropagation(); openEditor('split', row); }}>拆分</button></div></td></tr>)}</tbody></table></div>{!shown.length && <NoRows title={parsed.length ? '没有符合条件的条目' : '尚未生成解析条目'}>{parsed.length ? '调整关键词或重置筛选。' : '可载入示例、上传要求来源，或手动补录。'}</NoRows>}<Pager count={filtered.length} page={page} onChange={setPage} /></div>
      </div><div className="flow-bottom-actions"><span className="muted">仅选中条目进入匹配；导入后仍需人工确认答复。</span><button className="btn btn-primary" disabled={!selectable.length} onClick={confirmImport}>确认所选并匹配（{selectable.length}）<ArrowRight size={16} /></button></div>
    </section>
    {uploadOpen && <Modal title="上传项目资料" onClose={() => setUploadOpen(false)} footer={<><button className="btn" onClick={() => setUploadOpen(false)}>取消</button><button className="btn btn-primary" onClick={upload}>上传并模拟处理</button></>}>
      <Notice>原型只记录文件元数据；不会读取、上传或解析真实文件内容。</Notice><div className="form-grid"><Field label="文件用途" required><select className="select" value={purpose} onChange={(e) => setPurpose(e.target.value)}><option>要求来源</option><option>补充附件</option><option>应答模板</option></select></Field><Field label="文件版本" required><input className="input" value={version} onChange={(e) => setVersion(e.target.value)} /></Field><Field label="可见范围"><select className="select" value={visibility} onChange={(e) => setVisibility(e.target.value)}><option>项目成员可见</option><option>项目负责人及专业人员</option></select></Field><Field label="关联项目"><input className="input" value={project.name} readOnly /></Field></div>
      <button className="flow-dropzone" onClick={() => inputRef.current?.click()}><Upload size={28} /><strong>点击选择本地文件</strong><span>PDF / Word / Excel / CSV / TXT · 可多选</span></button><input ref={inputRef} className="flow-hidden" type="file" multiple onChange={(e) => setUploadFiles(Array.from(e.target.files || []).map((f) => ({ name: f.name, size: f.size, type: f.type, lastModified: f.lastModified })))} />
      {uploadFiles.map((f, i) => <div className="flow-upload-item" key={`${f.name}-${i}`}><FileText size={16} /><span>{f.name}<small>{(f.size / 1024).toFixed(1)} KB</small></span>{files.some((old) => old.name === f.name) && <Badge value="同名文件 · 新版本" />}<button className="text-link" aria-label={`移除 ${f.name}`} onClick={() => setUploadFiles((old) => old.filter((_, n) => n !== i))}><X size={16} /></button></div>)}
      {uploadFiles.some((f) => files.some((old) => old.name === f.name)) && <Field label="替换原因（保留原版本）" required wide><textarea className="input" value={replacementReason} onChange={(e) => setReplacementReason(e.target.value)} placeholder="说明版本变化及受影响范围" /></Field>}{purpose !== '要求来源' && <p className="muted">该用途仅登记资料，不触发要求解析。</p>}{error && <p className="flow-error-inline" role="alert">{error}</p>}
    </Modal>}
    {editor && <Drawer title={editTitles[editMode]} onClose={() => setEditor(null)} width={600} footer={<><button className="btn" onClick={() => setEditor(null)}>取消</button><button className="btn btn-primary" onClick={saveEditor}>保存修订</button></>}><Notice>保存后回到待核对。拆分保留父条目，合并保留全部来源；不会自动确认应答。</Notice><div className="form-grid"><Field label="条款编号"><input className="input" value={editor.clause} onChange={(e) => setEditor({ ...editor, clause: e.target.value })} /></Field><Field label="类别"><select className="select" value={editor.category} onChange={(e) => setEditor({ ...editor, category: e.target.value })}>{[...new Set(['技术参数', '交期', '商务', '验收', '质量', ...parsed.map((r) => r.category)])].map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="条目标题" required wide><input className="input" value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} /></Field><Field label={editMode === 'split' ? '第一条要求原文' : '客户要求原文'} required wide><textarea className="input flow-textarea" value={editor.original} onChange={(e) => setEditor({ ...editor, original: e.target.value })} /></Field>{editMode === 'split' && <Field label="第二条要求原文" required wide><textarea className="input flow-textarea" value={secondText} onChange={(e) => setSecondText(e.target.value)} placeholder="录入拆分后的独立要求；原有来源与条件会同时保留" /></Field>}<Field label="必要条件" wide><textarea className="input" value={asText(editor.conditions)} onChange={(e) => setEditor({ ...editor, conditions: e.target.value })} /></Field><Field label="来源文件 / 多来源定位" required wide><textarea className="input" value={asText(editor.source)} readOnly={editMode !== 'add'} onChange={(e) => setEditor({ ...editor, source: e.target.value })} /></Field><Field label="页码 / 工作表 / 单元格"><input className="input" value={editor.sourcePage || ''} onChange={(e) => setEditor({ ...editor, sourcePage: e.target.value })} /></Field><Field label="修订原因" required wide><textarea className="input" value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="说明修订内容及原因" /></Field></div>{error && <p className="flow-error-inline" role="alert">{error}</p>}</Drawer>}
    {fileDetail && <Drawer title="资料详情与版本" onClose={() => setFileDetail(null)} width={580}><div className="flow-detail-heading"><FileText size={24} /><div><h3>{fileDetail.name}</h3><Badge value={files.find((f) => f.id === fileDetail.id)?.status || fileDetail.status} /></div></div><dl className="flow-description"><dt>资料编号</dt><dd>{fileDetail.id}</dd><dt>用途 / 版本</dt><dd>{fileDetail.purpose} / {fileDetail.version}</dd><dt>可见范围</dt><dd>{fileDetail.visibility || '项目成员可见'}</dd><dt>来源定位</dt><dd>解析后条目保留文件名、页码及条款。</dd><dt>替代版本</dt><dd>{fileDetail.previousVersionId || '初始版本'}</dd><dt>替换原因</dt><dd>{fileDetail.reason || '—'}</dd><dt>原件状态</dt><dd>仅登记元数据，原文件请在本地查看。</dd></dl><Notice>原件预览为模拟视图，不会显示或上传真实文件内容。缺页、低可信及解析失败必须人工核对。</Notice>{fileDetail.error && <Notice type="error">{fileDetail.error}</Notice>}<h4>相关条目</h4>{parsed.filter((r) => r.sourceFileId === fileDetail.id).map((r) => <button className="flow-related-row" key={r.id} onClick={() => { setActiveId(r.id); setFileDetail(null); }}>{r.clause} {r.title}<ChevronRight size={15} /></button>)}</Drawer>}
  </div>;
}

export function ReviewsPage({ project, requirements = [], reviews = [], onUpdateReview, onConfirmReviewed, toast, navigate, actorRole, logEvent = () => {} }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('全部状态');
  const [type, setType] = useState('全部类型');
  const [source, setSource] = useState('全部来源');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [activeId, setActiveId] = useState(null);
  const [detailTab, setDetailTab] = useState('处理方案');
  const [form, setForm] = useState({ plan: '', impact: '', evidence: '', conclusion: '', draft: '', customerCommunication: '未沟通', acceptanceResult: '未验收' });
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const leaveNext = useRef(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [action, setAction] = useState(null);
  const [actionReason, setActionReason] = useState('');
  const [assignee, setAssignee] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');
  const active = reviews.find((r) => r.id === activeId);
  const requirement = requirements.find((r) => r.id === active?.requirementId);
  const filtered = reviews.filter((r) => `${r.id} ${r.title} ${r.owner} ${r.description}`.toLowerCase().includes(query.toLowerCase()) && (status === '全部状态' || r.status === status) && (type === '全部类型' || r.type === type) && (source === '全部来源' || asText(r.source).includes(source)) && (!mine || r.owner === actorRole || (actorRole === '销售负责人' && r.owner === project.owner) || (actorRole === '最终审批人' && isPendingReview(r))));
  const shown = filtered.slice((page - 1) * 6, page * 6);
  const change = (field, value) => { setForm((old) => ({ ...old, [field]: value })); dirtyRef.current = true; setDirty(true); };
  function clearDirty() { dirtyRef.current = false; setDirty(false); }
  function guardLeave(next) { if (dirtyRef.current) { leaveNext.current = next; setLeaveOpen(true); return false; } return true; }
  function finishLeave(save) { if (save && !savePlan()) return; clearDirty(); const next = leaveNext.current || (() => setActiveId(null)); leaveNext.current = null; setLeaveOpen(false); next(); }
  useUnsavedWarning(dirty);
  useEffect(() => { const hook = (next) => guardLeave(next); window.__rfqRequestNavigation = hook; return () => { if (window.__rfqRequestNavigation === hook) delete window.__rfqRequestNavigation; }; }, []);
  useEffect(() => { setPage(1); }, [query, status, type, source, mine]);
  useEffect(() => { setPage((old) => Math.min(old, Math.max(1, Math.ceil(filtered.length / 6)))); }, [filtered.length]);
  function openReview(review) {
    const next = () => { const req = requirements.find((r) => r.id === review.requirementId); setActiveId(review.id); setDetailTab('处理方案'); clearDirty(); setError(''); setForm({ plan: review.plan || '', impact: asText(review.impact), evidence: asText(review.evidence), conclusion: review.proposedConclusion || req?.conclusion || '待确认', draft: review.proposedDraft || req?.draft || '', customerCommunication: review.customerCommunication || '未沟通', acceptanceResult: review.acceptanceResult || '未验收' }); };
    if (guardLeave(next)) next();
  }
  function historyEntry(label, reason) { return { id: uid('EVENT'), action: label, actor: actorRole, time: now(), reason }; }
  function savePlan(closeAfter = false) {
    if (!active || isClosed(active) || isPendingReview(active)) { toast('已关闭或待批准事项为只读，请返回核对当前状态'); return false; }
    const patch = { plan: form.plan, impact: form.impact, evidence: form.evidence, proposedConclusion: form.conclusion, proposedDraft: form.draft, ...(actorRole === '销售负责人' ? { customerCommunication: form.customerCommunication, acceptanceResult: form.acceptanceResult } : {}), history: [...(active.history || []), historyEntry('保存处理方案', '保存草稿，尚未批准')] };
    if (onUpdateReview(active.id, patch) === false) return false; logEvent('保存评审方案', active.id, '保存方案、影响及证据'); clearDirty(); toast('处理方案已保存'); if (closeAfter) { setActiveId(null); setLeaveOpen(false); } return true;
  }
  function startAction(kind) {
    setAction(kind); setActionReason(''); setAssignee(active?.owner || '技术确认人'); setDeadline(active?.deadline || '2026-10-28'); setError('');
  }
  function performAction() {
    if (!active) return;
    if (['assign', 'reject', 'reopen'].includes(action) && !actionReason.trim()) { setError('请填写本次操作原因，记录将保留在事项历史中。'); return; }
    if (['approve', 'reject'].includes(action) && actorRole !== '最终审批人') { setError('当前身份无专业批准权限，请切换为最终审批人。'); return; }
    if (['approve', 'reject'].includes(action) && !isPendingReview(active)) { setError('事项状态已变化，只有待批准事项可以批准或退回。'); return; }
    if (action === 'submit' && (isClosed(active) || isPendingReview(active))) { setError('事项状态已变化，请返回核对后再提交。'); return; }
    if (action === 'submit' && (!form.plan.trim() || !active.owner || !active.deadline)) { setError('提交前请填写处理方案，并完成责任人与截止时间分派。'); return; }
    if (['assign', 'reopen'].includes(action) && (!assignee.trim() || !deadline)) { setError('请填写责任人及截止时间。'); return; }
    if (action === 'reopen' && !isClosed(active)) { setError('只有已关闭事项可以重开。'); return; }
    if (action === 'approve' && active.submittedBy === actorRole) { setError('提交人与批准人需独立，请由另一职责提交后再批准。'); return; }
    if (action === 'approve' && !form.plan.trim()) { setError('处理方案为空，不能批准关闭。'); return; }
    const labels = { assign: '重新分派', submit: '提交专业批准', approve: '批准关闭', reject: '退回修改', reopen: '条件变化重开' };
    const statuses = { assign: active.status, submit: '待审批', approve: '已关闭', reject: '已退回', reopen: '待处理' };
    const reason = actionReason.trim() || (action === 'approve' ? '方案及必要条件核对通过，相关应答仍需确认。' : '处理方案已就绪，提交专业批准。');
    const patch = { status: statuses[action], history: [...(active.history || []), historyEntry(labels[action], action === 'assign' ? `${active.owner} → ${assignee}；${reason}` : reason)] };
    if (action === 'assign') Object.assign(patch, { owner: assignee.trim(), deadline, reason });
    if (action === 'submit') Object.assign(patch, { plan: form.plan, impact: form.impact, evidence: form.evidence, proposedConclusion: form.conclusion, proposedDraft: form.draft, submittedBy: actorRole, submittedAt: now(), ...(actorRole === '销售负责人' ? { customerCommunication: form.customerCommunication, acceptanceResult: form.acceptanceResult } : {}) });
    if (action === 'approve') Object.assign(patch, { approvedBy: actorRole, approvedAt: now(), approvalReason: reason });
    if (action === 'reopen') Object.assign(patch, { reason, owner: assignee.trim() || active.owner, deadline: deadline || active.deadline });
    onUpdateReview(active.id, patch);
    if (['approve', 'reopen'].includes(action) && requirement) onConfirmReviewed(requirement.id, { status: '待确认', ...(action === 'approve' ? { conclusion: form.conclusion, draft: form.draft || requirement.draft, evidence: form.evidence.trim() || requirement.evidence } : {}), reason: `${labels[action]}：${reason}` });
    logEvent(labels[action], active.id, reason); toast(action === 'approve' ? '事项已批准关闭；关联应答仍需在RFQ比对页人工确认' : `${labels[action]}成功`); setAction(null); if (action === 'submit') clearDirty();
  }
  const closed = active && isClosed(active);
  const actions = { assign: '分派 / 改派事项', submit: '提交专业批准', approve: '批准并关闭事项', reject: '退回处理方案', reopen: '条件变化重开事项' };
  return <div className="flow-page">
    <div className="page-heading"><div><h1>偏离项管理</h1><p>跟踪待澄清、差距与专业评审，保留完整的处理和批准记录。</p></div><button className="btn" onClick={() => navigate('response')}>返回RFQ比对<ArrowRight size={15} /></button></div>
    <div className="flow-stat-strip"><div><span>事项总数</span><strong>{reviews.length}</strong></div><div><span>待处理 / 退回</span><strong>{reviews.filter((r) => !isClosed(r) && !isPendingReview(r)).length}</strong></div><div><span>待专业批准</span><strong>{reviews.filter((r) => isPendingReview(r)).length}</strong></div><div><span>已批准关闭</span><strong>{reviews.filter(isClosed).length}</strong></div></div>
    <section className="panel"><div className="flow-filterbar flow-review-filters"><Field label="搜索事项"><input className="input" placeholder="事项编号、名称、责任人" value={query} onChange={(e) => setQuery(e.target.value)} /></Field><Field label="事项类型"><select className="select" value={type} onChange={(e) => setType(e.target.value)}><option>全部类型</option>{[...new Set(reviews.map((r) => r.type))].filter(Boolean).map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="处理状态"><select className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option>全部状态</option>{[...new Set([...reviews.map((r) => r.status), '待处理', '待审批', '已退回', '已关闭'])].map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="偏离来源"><select className="select" value={source} onChange={(e) => setSource(e.target.value)}><option>全部来源</option>{[...new Set(reviews.flatMap((r) => asText(r.source).split(/[；、]/)))].filter(Boolean).map((v) => <option key={v}>{v}</option>)}</select></Field><div className="flow-filter-buttons"><button className="btn btn-primary" onClick={() => { setPage(1); toast(`已查询到 ${filtered.length} 个事项`); }}>查询</button><button className="btn" onClick={() => { setQuery(''); setStatus('全部状态'); setType('全部类型'); setSource('全部来源'); setMine(false); }}>重置</button></div></div>
      <div className="panel-header flow-table-heading"><h2>偏离及待确认事项</h2><label className="flow-checkbox-label"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />仅看本人待办</label></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>事项 / 关联条目</th><th>来源与类别</th><th>影响</th><th>责任人</th><th>截止时间</th><th>状态</th><th>操作</th></tr></thead><tbody>{shown.map((review) => <tr key={review.id}><td><button className="text-link" onClick={() => openReview(review)}>{review.title}</button><div className="muted flow-small">{review.id} · {requirements.find((r) => r.id === review.requirementId)?.clause || review.requirementId}</div></td><td><span>{review.type}</span><div className="muted flow-small">{asText(review.source)}</div></td><td><div className="flow-table-impact">{asText(review.impact) || '待评估'}</div></td><td>{review.owner || <span className="flow-red">未分派</span>}</td><td className="flow-nowrap">{review.deadline || '未设置'}</td><td><Badge value={review.status} /></td><td><button className="text-link" onClick={() => openReview(review)}>{isClosed(review) ? '查看 / 重开' : '处理事项'}</button></td></tr>)}</tbody></table></div>{!shown.length && <NoRows title={reviews.length ? '没有符合条件的事项' : '暂无偏离或待评审事项'}>{reviews.length ? '调整查询条件或清除筛选。' : '在RFQ比对页将需要专业判断的条目转入评审。'}{!reviews.length && <button className="btn btn-primary" onClick={() => navigate('response')}>前往RFQ比对</button>}</NoRows>}<Pager count={filtered.length} page={page} onChange={setPage} />
    </section>
    <Notice>“用户未接受”表示内部使用者未接受匹配结果。客户沟通接受与实际验收分别记录；批准事项不会自动确认关联应答。</Notice>
    {active && <Drawer title="事项详情与处理" width={720} onClose={() => { const next = () => setActiveId(null); if (guardLeave(next)) next(); }} footer={<>{closed ? <button className="btn" onClick={() => startAction('reopen')}><RefreshCw size={15} />条件变化重开</button> : <><button className="btn" onClick={() => startAction('assign')}>分派 / 改派</button><button className="btn" disabled={isPendingReview(active)} onClick={() => savePlan()}>保存方案</button>{!isPendingReview(active) && <button className="btn btn-primary" onClick={() => startAction('submit')}>提交专业批准</button>}{isPendingReview(active) && <><button className="btn btn-danger" disabled={actorRole !== '最终审批人'} onClick={() => startAction('reject')}>退回</button><button className="btn btn-primary" disabled={actorRole !== '最终审批人'} onClick={() => startAction('approve')}>批准关闭</button></>}</>}</>}>
      <div className="flow-detail-top"><div><span className="muted flow-small">{active.id}</span><h3>{active.title}</h3></div><Badge value={active.status} /></div><dl className="flow-description"><dt>事项类型 / 来源</dt><dd>{active.type} · {asText(active.source)}</dd><dt>责任人 / 截止</dt><dd>{active.owner || '未分派'} / {active.deadline || '未设置'}</dd><dt>要求与差距</dt><dd>{active.description || active.reason || '待补充问题说明'}</dd></dl>
      <div className="flow-requirement-card"><div><strong>{requirement?.clause} {requirement?.title || '关联要求'}</strong><button className="text-link" onClick={() => navigate('response')}>定位要求<ArrowRight size={13} /></button></div><p>{requirement?.original || '关联条目已不可用，请联系项目负责人核对。'}</p><small>来源：{asText(requirement?.source)} · 第 {requirement?.sourcePage || '—'} 页</small></div>
      {closed && <Notice>已关闭结果与处理记录保留为只读。条件变化请使用“重开”，关联应答将回到待确认。</Notice>}{isPendingReview(active) && <Notice>正在等待专业批准。当前职责：{actorRole}。只有最终审批人可以批准或退回。</Notice>}
      <div className="tabs flow-inner-tabs">{['处理方案', '沟通与验收', '处理记录'].map((tab) => <button className={detailTab === tab ? 'active' : ''} key={tab} onClick={() => setDetailTab(tab)}>{tab}</button>)}</div>
      {detailTab === '处理方案' && <div className="form-grid"><Field label="处理方案" required wide><textarea className="input flow-textarea" value={form.plan} readOnly={closed || isPendingReview(active)} onChange={(e) => change('plan', e.target.value)} placeholder="说明可执行方案、必要条件、差距弥补措施及证据" /></Field><Field label="成本 / 交期 / 质量影响" wide><textarea className="input" value={form.impact} readOnly={closed || isPendingReview(active)} onChange={(e) => change('impact', e.target.value)} placeholder="分别说明影响；无影响也请明确记录" /></Field><Field label="证据与依据" wide><textarea className="input" value={form.evidence} readOnly={closed || isPendingReview(active)} onChange={(e) => change('evidence', e.target.value)} placeholder="资料编号、版本、适用条件及证据定位" /></Field><Field label="评审建议结论"><select className="select" disabled={closed || isPendingReview(active)} value={form.conclusion} onChange={(e) => change('conclusion', e.target.value)}>{[...new Set([form.conclusion, 'Comply', '有条件 Comply', '不满足', '不适用', '待确认'])].map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="关联应答处理"><input className="input" readOnly value="批准后回到待确认" /></Field><Field label="评审建议答复" wide><textarea className="input flow-textarea" value={form.draft} readOnly={closed || isPendingReview(active)} onChange={(e) => change('draft', e.target.value)} /></Field><span className="muted flow-small">{dirty ? '● 存在未保存修改' : '方案已保存 / 只读核对'}</span></div>}
      {detailTab === '沟通与验收' && <><Notice>客户沟通结果由销售负责人录入，与验收结果分开保存。</Notice><div className="form-grid flow-spaced"><Field label="客户沟通结果"><select className="select" value={form.customerCommunication} disabled={closed || actorRole !== '销售负责人' || isPendingReview(active)} onChange={(e) => change('customerCommunication', e.target.value)}><option>未沟通</option><option>待客户澄清</option><option>客户已接受</option><option>客户未接受</option></select></Field><Field label="实际验收结果"><select className="select" value={form.acceptanceResult} disabled={closed || actorRole !== '销售负责人' || isPendingReview(active)} onChange={(e) => change('acceptanceResult', e.target.value)}><option>未验收</option><option>验收通过</option><option>验收不通过</option></select></Field></div></>}
      {detailTab === '处理记录' && <div className="flow-timeline">{(active.history || []).length ? (active.history || []).map((entry, index) => <div className="flow-timeline-item" key={entry?.id || index}><i /><strong>{typeof entry === 'string' ? entry : entry.action || entry.title || '事项更新'}</strong>{typeof entry === 'object' && <><small>{entry.time || entry.createdAt || '—'} · {entry.actor || entry.by || '系统'}</small><p>{entry.reason || entry.detail || entry.description || '—'}</p></>}</div>) : <NoRows title="暂无历史操作">后续分派、方案、批准、退回和重开记录将保留在此。</NoRows>}</div>}
    </Drawer>}
    {action && active && <Modal title={actions[action]} onClose={() => setAction(null)} footer={<><button className="btn" onClick={() => setAction(null)}>取消</button><button className={`btn ${action === 'reject' ? 'btn-danger' : 'btn-primary'}`} onClick={performAction}>确认{actions[action].replace('事项', '')}</button></>}><div className="flow-modal-object"><strong>{active.title}</strong><span>{active.id} · <Badge value={active.status} /></span></div>{action === 'approve' && <Notice>请核对方案、证据及承诺条件。批准关闭后，关联应答仍须由责任人在RFQ比对页确认。</Notice>}{action === 'submit' && <><Notice>将当前处理方案提交专业批准；提交后待批准内容以只读方式展示。</Notice><div className="flow-preview-text">{form.plan || '尚未填写处理方案'}</div></>}{['assign', 'reopen'].includes(action) && <div className="form-grid flow-spaced"><Field label="责任人" required><input className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)} list="flow-review-owners" /><datalist id="flow-review-owners"><option>技术确认人</option><option>销售负责人</option><option>质量负责人</option></datalist></Field><Field label="截止时间" required><input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field></div>}<Field label={action === 'reopen' ? '新条件与重开原因' : action === 'assign' ? '分派 / 改派原因' : action === 'reject' ? '退回原因' : '处理意见'} required={['assign', 'reject', 'reopen'].includes(action)} wide><textarea className="input flow-textarea" value={actionReason} onChange={(e) => setActionReason(e.target.value)} placeholder="记录具体意见，便于后续追溯" /></Field>{error && <p className="flow-error-inline" role="alert">{error}</p>}</Modal>}
    {leaveOpen && <Modal title="处理方案尚未保存" onClose={() => { setLeaveOpen(false); leaveNext.current = null; }} footer={<><button className="btn" onClick={() => { setLeaveOpen(false); leaveNext.current = null; }}>取消离开</button><button className="btn" onClick={() => finishLeave(false)}>放弃修改</button><button className="btn btn-primary" onClick={() => finishLeave(true)}>保存后离开</button></>}><p>当前编辑尚未保存。保存成功后继续跳转，或放弃本次修改；取消会保留当前输入。</p></Modal>}
  </div>;
}

export function ExportPage({ project, requirements = [], reviews = [], snapshots = [], onSnapshot, toast, navigate, actorRole, logEvent = () => {} }) {
  const columns = [{ key: 'clause', label: '条款编号', required: true }, { key: 'original', label: '客户要求', required: true }, { key: 'conclusion', label: '应答结论', required: true }, { key: 'draft', label: '对外答复', required: true }, { key: 'conditions', label: '适用条件', required: true }, { key: 'status', label: '确认状态', required: false }];
  const templates = [{ id: 'standard', title: '标准 RFQ 应答矩阵', version: 'V2.1', description: '逐条列出客户要求、结论与最终答复，适合技术应答。' }, { id: 'customer', title: '客户条款对照清单', version: 'V1.3', description: '以客户条款为索引，保留全部必要条件与批准状态。' }, { id: 'delivery', title: '交付条件核对清单', version: 'V1.0', description: '集中核对承诺条件，供交付前再次对照确认。' }];
  const [tab, setTab] = useState('模板与映射');
  const [templateId, setTemplateId] = useState('standard');
  const [mapping, setMapping] = useState(Object.fromEntries(columns.map((c) => [c.key, c.key])));
  const [checked, setChecked] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem(`fep-rfq-export-history:${project.id}`) || '[]'); } catch { return []; } });
  const activeTemplate = templates.find((t) => t.id === templateId) || templates[0];
  const projectSnapshots = snapshots.filter((s) => s.projectId === project.id);
  const detail = projectSnapshots.find((s) => s.id === detailId);
  const savedApproval = (() => { try { return JSON.parse(localStorage.getItem(`fep-rfq-management-approval-${project.id}`) || 'null'); } catch { return null; } })();
  const effectiveApproval = project.approvalConfig !== undefined ? project.approvalConfig : savedApproval || { final: '最终审批人' };
  const configuredFinalApprover = typeof effectiveApproval?.final === 'string' ? effectiveApproval.final.trim() : '';
  const approvalConfigIssues = configuredFinalApprover === '最终审批人' ? [] : [{ id: 'approval-config', label: '项目最终批准人配置', message: configuredFinalApprover ? '项目最终批准身份须为独立最终审批人，请在项目设置中修正' : '尚未配置项目最终批准人，请先补齐独立审批配置' }];
  const documentState = readDocumentState(project.id);
  const unimportedParsed = (documentState?.parsed || []).filter((r) => !requirements.some((current) => current.id === r.id));
  const unfinishedFiles = (documentState?.files || []).filter((f) => f.purpose === '要求来源' && !(documentState?.files || []).some((newer) => newer.previousVersionId === f.id) && ['排队中', '处理中', '失败'].includes(f.status));
  const documentIssues = [...unimportedParsed.map((r) => ({ id: `document-${r.id}`, label: `${r.clause} ${r.title}`, message: '来源解析条目尚未核对导入，部分导入不会排除此缺项' })), ...unfinishedFiles.map((f) => ({ id: `document-${f.id}`, label: f.name, message: f.status === '失败' ? `要求来源解析失败：${f.error || '请重试或补录'}` : `要求来源仍在${f.status}，请等待并核对解析结果` }))];
  const mappingIssues = columns.filter((c) => c.required && mapping[c.key] !== c.key).map((c) => ({ id: `mapping-${c.key}`, label: `${c.label}映射`, message: !mapping[c.key] ? '必要列尚未映射，请补全字段映射' : '必要列必须与同名业务字段对应，避免遗漏承诺或错误映射' }));
  const issues = [...getExportIssues(requirements, reviews), ...documentIssues, ...mappingIssues, ...approvalConfigIssues];
  const pending = projectSnapshots.filter((s) => s.status === '审批中');
  const approved = projectSnapshots.filter((s) => s.status === '已批准');
  const signature = (rows) => JSON.stringify(rows.map((r) => ({ id: r.id, version: r.version, status: r.status, original: r.original, conclusion: r.conclusion, draft: r.draft, conditions: r.conditions, evidence: r.evidence, reason: r.reason, owner: r.owner })).sort((a, b) => a.id.localeCompare(b.id)));
  function validity(snapshot) {
    if (!snapshot) return { valid: false, message: '未选择批准快照' };
    if (approvalConfigIssues.length) return { valid: false, message: approvalConfigIssues[0].message };
    if (snapshot.status !== '已批准') return { valid: false, message: snapshot.status === '审批中' ? '快照尚在审批中' : '快照未经批准' };
    if (snapshot.reviewedBy !== '最终审批人' || snapshot.createdBy === snapshot.reviewedBy) return { valid: false, message: '缺少有效的独立最终批准记录' };
    if (documentIssues.length) return { valid: false, message: '来源资料仍有失败任务或未核对条目，请完成解析后重新提交' };
    if (signature(snapshot.rows || []) !== signature(requirements)) return { valid: false, message: '当前工作内容或条目版本已变化，请重新提交新快照' };
    if (getExportIssues(requirements, reviews).length) return { valid: false, message: '当前工作版本存在未确认内容或未关闭事项' };
    return { valid: true, message: '与当前工作版本一致，可以正式导出' };
  }
  const downloadable = approved.find((s) => validity(s).valid);
  useEffect(() => { localStorage.setItem(`fep-rfq-export-history:${project.id}`, JSON.stringify(history)); }, [history, project.id]);
  function goIssue(issue) {
    if (issue.id === 'approval-config') navigate('settings');
    else if (String(issue.id).startsWith('document-')) navigate('documents');
    else if (String(issue.id).startsWith('mapping-')) setTab('模板与映射');
    else if (issue.id === 'empty-requirements') navigate('documents');
    else if (reviews.some((r) => r.id === issue.id)) navigate('reviews');
    else navigate('response');
  }
  function mappedRows(rows, selectedMapping) { return rows.map((row) => ({ ...row, ...Object.fromEntries(columns.map((c) => [c.key, row[selectedMapping[c.key]] ?? ''])) })); }
  function saveFile(content, filename) {
    const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function downloadDraft() {
    const rows = mappedRows(requirements, mapping).map((r, index) => ({ ...r, status: `${isConfirmed(requirements[index]) ? '内部草稿 / 已确认' : '内部草稿 / 未确认'}`, draft: `${isConfirmed(requirements[index]) ? '[内部草稿] ' : '[内部草稿 / 未确认] '}${r.draft || '答复待补充'}` }));
    const filename = `${project.name}_内部草稿_未确认内容请核对_${Date.now()}.csv`;
    try {
      saveFile(`内部草稿 / 包含未确认内容 / 仅供内部核对\r\n${toCsv(rows)}`, filename);
      setHistory((old) => [{ id: uid('EXP'), type: '内部草稿', filename, createdAt: now(), actor: actorRole, status: '已生成', snapshotId: '当前工作版本', template: activeTemplate.title, rowCount: rows.length }, ...old]); logEvent('下载内部草稿', project.id, `${rows.length} 条；显式标记内部草稿与未确认`); toast('内部草稿已生成，未确认内容已显式标记');
    } catch (err) { toast(`生成失败：${err.message}`); logEvent('草稿生成失败', project.id, err.message); }
  }
  function startAction(kind, snapshotId = null) { if (snapshotId) setDetailId(snapshotId); setAction(kind); setReason(''); setError(''); if (kind === 'submit') setChecked(true); }
  function submitSnapshot() {
    const currentIssues = [...getExportIssues(requirements, reviews), ...documentIssues, ...mappingIssues, ...approvalConfigIssues];
    if (currentIssues.length) { setError(`当前仍有 ${currentIssues.length} 个检查项未通过，请返回修正。`); return; }
    if (actorRole === '最终审批人') { setError('最终审批人不能提交本人待批准快照，请切换为销售负责人或技术确认人后提交。'); return; }
    const existing = pending.find((s) => signature(s.rows || []) === signature(requirements) && s.template?.id === templateId && JSON.stringify(s.mapping) === JSON.stringify(mapping));
    if (existing) { setAction(null); setDetailId(existing.id); toast('相同内容已在审批中，已打开原快照'); return; }
    const snapshot = { ...makeSnapshot(project.id, requirements, actorRole), template: { ...activeTemplate }, mapping: { ...mapping }, approvalConfig: { ...effectiveApproval }, submissionReason: reason.trim() || '已完成内部确认、专业事项及字段分标检查', history: [{ id: uid('EVENT'), action: '提交快照审批', actor: actorRole, time: now(), reason: reason.trim() || '检查通过，冻结应答快照' }], attachments: [] };
    onSnapshot(snapshot); logEvent('提交快照审批', snapshot.id, `${requirements.length} 条要求；${activeTemplate.title} ${activeTemplate.version}`); toast('已冻结审批快照，请由独立最终审批人核对'); setAction(null); setDetailId(snapshot.id); setTab('审批与快照');
  }
  function reviewSnapshot() {
    const current = projectSnapshots.find((s) => s.id === detailId);
    if (!current || current.status !== '审批中') { setError('对象状态已变化，请返回快照列表核对'); return; }
    if (approvalConfigIssues.length) { setError(approvalConfigIssues[0].message); return; }
    if (actorRole !== '最终审批人') { setError('当前身份无最终审批权限'); return; }
    if (actorRole !== configuredFinalApprover) { setError('当前身份与项目配置的最终批准人不一致'); return; }
    if (current.createdBy === actorRole) { setError('提交人与最终批准人必须独立，不能批准本人提交的快照'); return; }
    if (action === 'reject' && !reason.trim()) { setError('退回必须填写具体原因'); return; }
    if (action === 'approve' && (signature(current.rows || []) !== signature(requirements) || getExportIssues(requirements, reviews).length || documentIssues.length)) { setError('当前工作数据已变化或检查未通过，请退回原快照并提交新快照'); return; }
    const label = action === 'approve' ? '批准定稿' : '退回快照';
    const patch = { ...current, status: action === 'approve' ? '已批准' : '已退回', reviewedAt: new Date().toISOString(), reviewedBy: actorRole, reviewReason: reason.trim() || '快照内容、必要条件和附件分标检查通过', history: [...(current.history || []), { id: uid('EVENT'), action: label, actor: actorRole, time: now(), reason: reason.trim() || '批准定稿' }] };
    onSnapshot(patch); logEvent(label, current.id, patch.reviewReason); toast(action === 'approve' ? '快照已批准，当前有效性检查通过后可正式导出' : '快照已退回，原内容继续保留'); setAction(null);
  }
  function downloadFormal() {
    const current = projectSnapshots.find((s) => s.id === detailId);
    const check = validity(current);
    if (!check.valid) { setError(check.message); logEvent('正式导出被阻止', current?.id || project.id, check.message); return; }
    const rows = mappedRows(current.rows, current.mapping || Object.fromEntries(columns.map((c) => [c.key, c.key])));
    const filename = `${project.name}_正式应答_${current.id.slice(0, 18)}.csv`;
    try {
      saveFile(toCsv(rows), filename);
      const record = { id: uid('EXP'), type: '正式应答', filename, createdAt: now(), actor: actorRole, status: '已生成', snapshotId: current.id, template: current.template?.title || '标准 RFQ 应答矩阵', rowCount: rows.length };
      setHistory((old) => [record, ...old]);
      onSnapshot({ ...current, exports: [...(current.exports || []), record] }); logEvent('正式导出', current.id, `当前有效性校验通过；${rows.length} 条；CSV UTF-8`); toast('正式应答已导出，记录已绑定批准快照'); setAction(null); setTab('导出记录');
    } catch (err) { setError(`文件生成失败：${err.message}`); logEvent('正式导出失败', current.id, err.message); }
  }
  function snapshotTable(snapshot) { return <div className="table-wrap flow-snapshot-table"><table className="data-table"><thead><tr><th>条款</th><th>客户要求</th><th>最终结论</th><th>冻结答复</th><th>必要条件</th><th>版本</th></tr></thead><tbody>{(snapshot.rows || []).map((r) => <tr key={r.id}><td>{r.clause}</td><td>{r.original}</td><td><Badge value={r.conclusion} /></td><td>{r.draft}</td><td>{asText(r.conditions) || '—'}</td><td>V{r.version || 1}</td></tr>)}</tbody></table></div>; }
  return <div className="flow-page">
    <div className="page-heading"><div><h1>导出文档</h1><p>核对模板与字段，冻结应答快照，由独立审批人批准定稿。</p></div><div className="page-actions"><button className="btn" onClick={downloadDraft}><Download size={16} />下载内部草稿</button><button className="btn btn-primary" onClick={() => startAction('submit')}><ShieldCheck size={16} />提交快照审批</button></div></div>
    <div className="flow-export-steps"><div className="flow-step done"><span>1</span><div><strong>核对内容与模板</strong><small>完成条目确认及字段映射</small></div></div><ChevronRight size={18} /><div className={`flow-step ${pending.length || approved.length ? 'done' : ''}`}><span>2</span><div><strong>冻结快照并审批</strong><small>独立最终批准人核对</small></div></div><ChevronRight size={18} /><div className={`flow-step ${downloadable ? 'done' : ''}`}><span>3</span><div><strong>正式导出</strong><small>校验批准及当前有效性</small></div></div></div>
    {issues.length ? <Notice type="warning">当前有 <b>{issues.length}</b> 个提交阻断项。可随时生成内部草稿；正式应答需完成确认、事项关闭及独立审批。<button className="text-link flow-notice-action" onClick={() => { setChecked(true); document.getElementById('flow-export-checks')?.scrollIntoView({ behavior: 'smooth' }); }}>查看检查结果</button></Notice> : <Notice>当前工作版本检查通过。{downloadable ? '已有当前有效的批准快照，可执行正式导出。' : '请提交快照，并切换独立最终审批人完成批准。'}</Notice>}
    <section className="panel"><div className="tabs">{['模板与映射', '内容预览', '审批与快照', '导出记录'].map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}{t === '审批与快照' && <span>{projectSnapshots.length}</span>}{t === '导出记录' && <span>{history.length}</span>}</button>)}</div>
      {tab === '模板与映射' && <div className="panel-body"><div className="flow-section-title"><h3>选择内置模板</h3><span className="muted flow-small">本原型实际生成 UTF-8 CSV 文件</span></div><div className="flow-template-grid">{templates.map((template) => <button key={template.id} className={`flow-template-card ${templateId === template.id ? 'active' : ''}`} onClick={() => setTemplateId(template.id)}><FileText size={25} /><div><strong>{template.title}</strong><p>{template.description}</p><span>CSV · {template.version}</span></div>{templateId === template.id && <Check size={17} className="flow-template-check" />}</button>)}</div><div className="flow-section-title flow-spaced"><h3>字段映射</h3><span className="muted flow-small">必要列不可缺省；条件按原文保留</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>模板列名</th><th>来源字段</th><th>要求</th><th>检查结果</th></tr></thead><tbody>{columns.map((column) => <tr key={column.key}><td>{column.label}</td><td><select className="select" aria-label={`${column.label}映射`} value={mapping[column.key]} onChange={(e) => setMapping((old) => ({ ...old, [column.key]: e.target.value }))}><option value="">不映射</option>{columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></td><td>{column.required ? <span className="flow-required">必填 / 保留</span> : '可选'}</td><td>{mapping[column.key] === column.key ? <span className="flow-check-ok"><Check size={14} />映射正确</span> : column.required ? <span className="flow-red">请修正映射</span> : <span className="muted">未映射 / 自定义</span>}</td></tr>)}</tbody></table></div><Notice>对外文件包含本次要求、最终答复及必要条件；内部评审、成本、历史项目名称、批注和检索引用不进入 CSV。内部证据不自动作为对外附件。</Notice></div>}
      {tab === '内容预览' && <><div className="panel-header"><div><h2>{activeTemplate.title}</h2><span className="muted flow-small">当前工作版本预览 · {requirements.length} 条要求 · 非审批快照</span></div><button className="btn btn-sm" onClick={downloadDraft}><Download size={14} />内部草稿</button></div><div className="table-wrap"><table className="data-table"><thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{mappedRows(requirements.slice((page - 1) * 6, page * 6), mapping).map((row) => <tr key={row.id}><td>{row.clause || '—'}</td><td className="flow-preview-requirement">{row.original}</td><td><Badge value={row.conclusion} /></td><td className="flow-preview-reply">{row.draft || <span className="flow-red">待补充</span>}</td><td>{asText(row.conditions) || '—'}</td><td><Badge value={row.status} /></td></tr>)}</tbody></table></div>{!requirements.length && <NoRows title="暂无可预览条目">请先解析要求；空项目仍可下载带内部草稿标记的 CSV。</NoRows>}<Pager count={requirements.length} page={page} onChange={setPage} /><div className="flow-attachment-panel"><h4>附件分标检查</h4><div><span>内部证据引用</span><b>{requirements.filter((r) => asText(r.evidence)).length} 条</b><span>拟对外批准附件</span><b>0 个</b></div><p className="muted">本次 CSV 不打包任何附件。内部证据引用仅用于核对，不作为自动外发附件。</p></div></>}
      {tab === '审批与快照' && <><div className="panel-header"><h2>应答快照</h2><span className="muted flow-small">源数据修改不覆盖已有快照</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>快照编号 / 模板</th><th>条目</th><th>提交人 / 时间</th><th>审批状态</th><th>当前有效性</th><th>操作</th></tr></thead><tbody>{[...projectSnapshots].reverse().map((snapshot) => <tr key={snapshot.id}><td><button className="text-link flow-snapshot-id" onClick={() => setDetailId(snapshot.id)}>{snapshot.id}</button><div className="muted flow-small">{snapshot.template?.title || '标准 RFQ 应答矩阵'} · {snapshot.template?.version || 'V2.1'}</div></td><td>{snapshot.rows?.length || 0}</td><td>{snapshot.createdBy}<div className="muted flow-small">{new Date(snapshot.createdAt).toLocaleString('zh-CN', { hour12: false })}</div></td><td><Badge value={snapshot.status} /></td><td><span className={validity(snapshot).valid ? 'flow-check-ok' : 'muted flow-small'}>{validity(snapshot).valid ? <><Check size={14} />当前有效</> : snapshot.status === '已批准' ? '工作版本已变化 / 不可重新导出' : '待批准后校验'}</span></td><td><div className="flow-inline-actions"><button className="text-link" onClick={() => setDetailId(snapshot.id)}>{snapshot.status === '审批中' && actorRole === '最终审批人' ? '审批' : '查看'}</button>{snapshot.status === '已批准' && <button className="text-link" disabled={!validity(snapshot).valid} onClick={() => startAction('formal', snapshot.id)}>正式导出</button>}</div></td></tr>)}</tbody></table></div>{!projectSnapshots.length && <NoRows title="尚未创建应答快照">完成检查后提交审批，系统将冻结本次条目及版本。</NoRows>}</>}
      {tab === '导出记录' && <><div className="panel-header"><h2>文件生成记录</h2><span className="muted flow-small">正式文件绑定实际批准快照</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>文件名称</th><th>类型 / 结果</th><th>快照</th><th>生成时间 / 人员</th><th>操作</th></tr></thead><tbody>{history.slice((historyPage - 1) * 6, historyPage * 6).map((item) => { const snapshot = projectSnapshots.find((s) => s.id === item.snapshotId); return <tr key={item.id}><td className="flow-history-file"><FileText size={15} />{item.filename}<div className="muted flow-small">{item.template} · {item.rowCount} 条 · UTF-8 CSV</div></td><td><Badge value={item.type} /><div className="muted flow-small">{item.status}</div></td><td><span className="flow-small flow-snapshot-id">{item.snapshotId}</span>{snapshot && <div className={`flow-small ${validity(snapshot).valid ? 'flow-check-ok' : 'flow-red'}`}>{validity(snapshot).valid ? '当前可重新导出' : '历史记录：当前不可重新导出'}</div>}</td><td className="flow-nowrap">{item.createdAt}<div className="muted flow-small">{item.actor}</div></td><td>{snapshot ? <button className="text-link" onClick={() => setDetailId(snapshot.id)}>文件包详情</button> : <button className="text-link" onClick={downloadDraft}>生成当前草稿</button>}</td></tr>; })}</tbody></table></div>{!history.length && <NoRows title="暂无导出记录">下载内部草稿或正式应答后，将生成可追溯记录。</NoRows>}<Pager count={history.length} page={historyPage} onChange={setHistoryPage} /></>}
    </section>
    <section className="panel" id="flow-export-checks"><div className="panel-header"><h2><ListChecks size={18} />提交与定稿检查</h2><button className="btn btn-sm" onClick={() => { setChecked(true); toast(issues.length ? `检查完成：${issues.length} 个阻断项` : '全部检查通过，可提交快照审批'); }}><RefreshCw size={14} />重新检查</button></div><div className="flow-check-summary"><span className={`flow-check-indicator ${issues.length ? 'warning' : 'success'}`}>{issues.length ? <AlertCircle size={21} /> : <ShieldCheck size={21} />}</span><div><strong>{issues.length ? `${issues.length} 个待修正项` : '当前工作版本检查通过'}</strong><p>已确认 {requirements.filter(isConfirmed).length} / {requirements.length} 条 · 未关闭事项 {reviews.filter((r) => !isClosed(r)).length} 个 · {checked ? '已重新核对当前版本' : '实时检查结果'}</p></div></div>{issues.length > 0 && <div className="flow-issue-list">{issues.map((issue, index) => <div className="flow-issue-row" key={`${issue.id}-${index}`}><AlertCircle size={15} /><div><strong>{issue.label}</strong><p>{issue.message}</p></div><button className="text-link" onClick={() => goIssue(issue)}>前往修正<ArrowRight size={13} /></button></div>)}</div>}<div className="flow-bottom-actions"><span className="muted">审批快照不可编辑；新工作版本需要重新提交和批准。</span><div className="flow-inline-actions"><button className="btn" onClick={() => { setTab('审批与快照'); }}>查看快照</button><button className="btn btn-primary" disabled={!downloadable} onClick={() => startAction('formal', downloadable?.id)}><Download size={16} />正式导出</button></div></div></section>
    {detail && <Drawer title="应答快照 · 只读审批" width={1000} onClose={() => setDetailId(null)} footer={<><button className="btn" onClick={() => setDetailId(null)}>返回列表</button>{detail.status === '审批中' && <><button className="btn btn-danger" disabled={actorRole !== '最终审批人' || detail.createdBy === actorRole} onClick={() => startAction('reject', detail.id)}>退回</button><button className="btn btn-primary" disabled={actorRole !== '最终审批人' || detail.createdBy === actorRole} onClick={() => startAction('approve', detail.id)}>批准定稿</button></>}{detail.status === '已批准' && <button className="btn btn-primary" disabled={!validity(detail).valid} onClick={() => startAction('formal', detail.id)}><Download size={15} />正式导出</button>}</>}><div className="flow-detail-top"><div><span className="muted flow-small">固定快照编号</span><h3 className="flow-snapshot-id">{detail.id}</h3></div><Badge value={detail.status} /></div><dl className="flow-description"><dt>提交人 / 时间</dt><dd>{detail.createdBy} / {new Date(detail.createdAt).toLocaleString('zh-CN', { hour12: false })}</dd><dt>模板版本</dt><dd>{detail.template?.title || '标准 RFQ 应答矩阵'} {detail.template?.version || 'V2.1'}</dd><dt>批准人</dt><dd>{detail.reviewedBy || '等待独立最终审批人'}</dd><dt>处理意见</dt><dd>{detail.reviewReason || detail.submissionReason || '—'}</dd><dt>外发附件</dt><dd>0 个；内部证据不自动作为对外附件</dd></dl><Notice type={detail.status === '已批准' && !validity(detail).valid ? 'warning' : 'info'}>{detail.status === '已批准' ? validity(detail).message : '此处展示冻结快照，不随当前工作内容修改。当前身份：' + actorRole + '；提交人与最终批准人须独立。'}</Notice><h4 className="flow-spaced">冻结应答内容（{detail.rows?.length || 0} 条）</h4>{snapshotTable(detail)}<h4 className="flow-spaced">审批与导出记录</h4><div className="flow-timeline">{(detail.history || []).map((entry, index) => <div className="flow-timeline-item" key={entry.id || index}><i /><strong>{entry.action}</strong><small>{entry.time} · {entry.actor}</small><p>{entry.reason}</p></div>)}{(detail.exports || []).map((record) => <div className="flow-timeline-item" key={record.id}><i /><strong>正式导出 CSV</strong><small>{record.createdAt} · {record.actor}</small><p>{record.filename}</p></div>)}</div></Drawer>}
    {action && <Modal title={{ submit: '提交应答快照审批', approve: '批准快照定稿', reject: '退回应答快照', formal: '正式导出检查' }[action]} width={650} onClose={() => setAction(null)} footer={<><button className="btn" onClick={() => setAction(null)}>取消</button><button className={`btn ${action === 'reject' ? 'btn-danger' : 'btn-primary'}`} disabled={action === 'submit' && issues.length > 0} onClick={action === 'submit' ? submitSnapshot : action === 'formal' ? downloadFormal : reviewSnapshot}>{action === 'submit' ? '检查通过并提交' : action === 'formal' ? '生成正式 CSV 文件' : action === 'approve' ? '确认批准定稿' : '确认退回'}</button></>}>
      {action === 'submit' ? <><Notice type={issues.length ? 'warning' : 'info'}>{issues.length ? `检查未通过，共 ${issues.length} 个阻断项。修正后可再次提交。` : `检查通过，将冻结 ${requirements.length} 条要求。提交后由独立最终审批人批准。`}</Notice>{issues.length > 0 && <div className="flow-modal-issues">{issues.map((issue, index) => <div key={`${issue.id}-${index}`}><strong>{issue.label}</strong><p>{issue.message}</p><button className="text-link" onClick={() => { setAction(null); goIssue(issue); }}>定位修正<ArrowRight size={13} /></button></div>)}</div>}<dl className="flow-description"><dt>项目</dt><dd>{project.name}</dd><dt>模板版本</dt><dd>{activeTemplate.title} {activeTemplate.version}</dd><dt>提交身份</dt><dd>{actorRole}</dd><dt>对外附件</dt><dd>0 个 · 不包含内部证据</dd></dl>{actorRole === '最终审批人' && <Notice type="warning">请以销售负责人或技术确认人身份提交，保证最终审批独立。</Notice>}</> : <><div className="flow-modal-object"><strong className="flow-snapshot-id">{detail?.id || '快照不可用'}</strong><span>{detail?.rows?.length || 0} 条 · {detail?.template?.title || '标准模板'}</span></div>{action === 'formal' ? <><Notice type={validity(detail).valid ? 'info' : 'error'}>{validity(detail).message}</Notice><dl className="flow-description"><dt>已批准快照</dt><dd>{detail?.status || '—'}</dd><dt>条目版本校验</dt><dd>{validity(detail).valid ? '通过 · 与当前版本逐条一致' : '未通过'}</dd><dt>对外字段</dt><dd>条款、客户要求、应答结论、最终答复、适用条件、确认状态</dd><dt>附件清单</dt><dd>0 个 · 不打包内部证据</dd><dt>生成格式</dt><dd>CSV · UTF-8 BOM</dd></dl></> : <Notice>{action === 'approve' ? '核对冻结内容及必要条件后批准。批准仅绑定本快照；后续工作修改需重新审批。' : '退回原因会保存至快照历史。原快照内容继续保留，修订后需提交新快照。'}</Notice>}</>}
      {action !== 'formal' && <Field label={action === 'reject' ? '退回原因' : '处理意见'} required={action === 'reject'} wide><textarea className="input flow-textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === 'reject' ? '请说明需要修订的条目和原因' : '补充核对意见（选填）'} /></Field>}{error && <p className="flow-error-inline" role="alert">{error}</p>}
    </Modal>}
  </div>;
}
