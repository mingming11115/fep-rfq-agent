import InlineReviewSurface from '../components/InlineReviewSurface';
import { guardCardNavigation } from '../responseCardQueue';
import {getProjectFinalReview,getRequiredFinalReviewers,personName,canAccessProject,getPersonnelContext} from '../personnelDomain';
import {applyFinalReviewDecision,isFinalReviewApproved} from '../finalReviewDomain';
import {canPerform} from '../permissions';
import {shouldOpenSourceUpload,getSourceUploadExitRoute} from '../navigation';
import {snapshotFingerprint,latestSnapshot,checkSnapshotValidity,getFinalReviewScope} from '../snapshotDomain';
import ClarificationPanel from '../components/ClarificationPanel';
import {assertIndependentApproval} from '../reviewDomain';
import React, { useEffect, useRef, useState } from 'react';
import { Upload, FileText, Check, AlertCircle, ArrowRight, Download, Plus, Search, RefreshCw, X, ShieldCheck, ChevronRight, ListChecks } from 'lucide-react';
import { Modal, Drawer } from '../components/ui';
import { makeRequirements } from '../data';
import { BHEL_ID } from '../bhelDemo';
import { makeDocumentDemo } from '../documentMocks';
import { getExportIssues, makeSnapshot, toCsv } from '../domain';
import {getUnconfirmedComplyRows} from '../responseRecommendation';
import UnconfirmedComplyList from '../components/UnconfirmedComplyList';
import './workflow-pages.css';
import ApprovalRoute from '../components/ApprovalRoute';
import { getReviewRoute } from '../rfqWorkflow';
import DocumentWorkbench from '../components/DocumentWorkbench';
import WordCommentsPrototype from '../components/WordCommentsPrototype';
import SourceUploadDialog from '../components/SourceUploadDialog';

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

export function DocumentsPage({ actorRole, route, project, requirements = [], appState, onImport, onCorrect, toast, navigate, focusedRequirementId, onAnalysisRun = () => {}, onFilesChange, logEvent = () => {} }) {
  const canManage=canPerform(actorRole,'source:manage');
  const [files, setFiles] = useState(() => appState?.documentsByProject?.[project.id] ?? readDocumentState(project.id)?.files ?? (requirements.length ? makeDocumentDemo(project.id).files : []));
  const [parsed, setParsed] = useState(() => {
    const stored=readDocumentState(project.id),currentFiles=appState?.documentsByProject?.[project.id];
    if(currentFiles===undefined)return stored?.parsed || (requirements.length ? makeDocumentDemo(project.id, requirements).parsed : []);
    const currentParsed=(stored?.parsed||[]).filter(row=>currentFiles.some(file=>file.id===row.sourceFileId));
    return [...currentParsed,...structuredClone(requirements.filter(row=>!currentParsed.some(parsedRow=>parsedRow.id===row.id)))];
  });
  const [activeId, setActiveId] = useState(focusedRequirementId || null);
  const [uploadOpen, setUploadOpen] = useState(()=>shouldOpenSourceUpload(route,actorRole));
  const [wordCommentsOpen, setWordCommentsOpen] = useState(false);
  const [fileTab, setFileTab] = useState('文件清单');
  const [fileDetail, setFileDetail] = useState(null);
  const [editor, setEditor] = useState(null);
  const [editReason, setEditReason] = useState('');
  const [error, setError] = useState('');
  const timers = useRef([]);
  const running = useRef(new Set());
  const parsedRef = useRef(parsed);
  parsedRef.current = parsed;
  const imported = new Set(requirements.map((r) => r.id));
  useEffect(() => {
    if(!canManage)return;
    const missing = parsed.filter((row) => !requirements.some((current) => current.id === row.id));
    if (missing.length) onImport(missing);
    setFiles((old) => {
      const next = old.map((file) => file.status === '待核对' && parsed.some((row) => row.sourceFileId === file.id) ? { ...file, status: '完成' } : file);
      return next.some((file, i) => file !== old[i]) ? next : old;
    });
  }, [parsed, requirements, onImport]);
  useEffect(() => { if(!canManage)return;localStorage.setItem(metadataStorage(project.id), JSON.stringify({ files, parsed })); onFilesChange?.(project.id,files); }, [files, parsed, project.id, onFilesChange]);
  useEffect(() => {
    if(!canManage)return;
    files.filter((file) => ['排队中', '处理中'].includes(file.status)).forEach(scheduleParse);
    return () => timers.current.forEach(clearTimeout);
  }, []);
  useUnsavedWarning(!!editor);
  useEffect(()=>{if(shouldOpenSourceUpload(route,actorRole))setUploadOpen(true);},[route?.action,actorRole]);

  function closeUpload(submitted=false) {
    setUploadOpen(false);setError('');
    if(route?.action==='upload'){
      const next=getSourceUploadExitRoute({...route,projectId:project.id},submitted);
      navigate(next.page,null,{...next,action:undefined,taskId:undefined});
    }
  }

  function loadSample() {
    if(!canManage)return;
    const demo = makeDocumentDemo(project.id, requirements.length ? requirements : makeRequirements(project.id));
    setFiles((old) => [...old, ...demo.files.filter((file) => !old.some((existing) => existing.id === file.id))]);
    setParsed((old) => {
      const linked = old.map((row) => {
        const sample = demo.parsed.find((item) => item.id === row.id);
        return sample && !row.sourceFileId ? { ...row, source: sample.source, sourceFileId: sample.sourceFileId, sourceVersion: sample.sourceVersion } : row;
      });
      return [...linked, ...demo.parsed.filter((row) => !old.some((existing) => existing.id === row.id))];
    });
    setActiveId(demo.parsed[0]?.id || parsed[0]?.id);
    onAnalysisRun({id:uid('RUN'),projectId:project.id,fileId:demo.files[0]?.id,sourceVersion:demo.files[0]?.version,type:'parse',status:'完成',startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),successCount:demo.parsed.length,failedCount:0,needsHumanCount:demo.parsed.filter(r=>r.matchLevel==='none').length});
    logEvent('加载解析示例', project.id, '补齐多版本模拟资料及条目来源，保留已有文件和编辑');
    toast(project.id === BHEL_ID ? '已载入BHEL真实RFQ：40条精选要求及原PDF，保留已有编辑' : '已补齐示例：已包含 Safety / Facility 与模块组合两份 Word 示例，以及历史版本和失败案例');
  }
  function scheduleParse(file) {
    if(!canManage)return;
    if(file.demoParsePreview)return;
    if (running.current.has(file.id)) return;
    running.current.add(file.id);
    const runId=uid('RUN'),startedAt=new Date().toISOString();
    const finish=(status,counts={})=>onAnalysisRun({id:runId,fileId:file.id,sourceVersion:file.version,type:'parse',status,startedAt,endedAt:new Date().toISOString(),successCount:0,failedCount:0,needsHumanCount:0,previousRunId:file.lastRunId,...counts});
    const fail = !/\.(pdf|docx?|xlsx?|csv|txt)$/i.test(file.name);
    timers.current.push(setTimeout(() => setFiles((old) => old.map((f) => f.id === file.id ? { ...f, status: '处理中', parseStage: 'extracting', error: '' } : f)), 350));
    if (!fail && file.purpose === '要求来源') {
      for (const [delay, parseStage] of [[1250, 'comparing'], [2250, 'generating']]) {
        timers.current.push(setTimeout(() => setFiles((old) => old.map((f) => f.id === file.id ? { ...f, parseStage } : f)), delay));
      }
    }
    timers.current.push(setTimeout(() => {
      running.current.delete(file.id);
      if (fail) { finish('失败',{failedCount:1}); setFiles((old) => old.map((f) => f.id === file.id ? { ...f, status: '失败', lastRunId:runId, error: '演示解析器仅支持 PDF、Word、Excel、CSV、TXT；请转换格式或手动补录。' } : f)); logEvent('解析失败', file.id, '不支持的文件格式'); return; }
      if (file.purpose !== '要求来源') { finish('完成',{successCount:1}); setFiles((old) => old.map((f) => f.id === file.id ? { ...f, status: '完成' } : f)); return; }
      const previous = parsedRef.current.filter((row) => row.sourceFileId === file.id);
      const rows = previous.length ? previous : project.id === BHEL_ID && file.realSource ? makeDocumentDemo(project.id).parsed : makeRequirements(project.id).slice(0, 4).map((r, index) => ({ ...r, id: `${file.id}-R${index + 1}`, clause: `${index + 1}.1`, status: '待确认', source: file.name, sourceOriginal: r.original, sourceVersion: file.version, sourcePage: index + 2, sourceFileId: file.id, sectionPath: [], confirmedAt: undefined, confirmedBy: undefined, parserNote: '模拟解析结果：未读取原文件，章节待识别', version: 1 }));
      setParsed((old) => old.some((r) => r.sourceFileId === file.id) ? old : [...old, ...rows]);
      setFiles((old) => old.map((f) => f.id === file.id ? { ...f, status: '完成', parseStage: 'completed', parsedCount: rows.length, lastRunId:runId, parsedAt: now(), error: '' } : f));
      finish('完成',{successCount:rows.length,needsHumanCount:rows.filter(r=>r.matchLevel==='none').length});
      setActiveId(rows[0]?.id); logEvent('模拟解析完成', file.id, `${rows.length} 条要求已完成应答项对比，自动进入细则比对`);
    }, !fail && file.purpose === '要求来源' ? 2600 : 1250));
  }
  function reparse(file) {
    if(!canManage)return;
    if (running.current.has(file.id)) return;
    setFiles((old) => old.map((f) => f.id === file.id ? { ...f, status: '排队中', parseStage: 'queued', error: '' } : f));
    scheduleParse(file); logEvent('重新解析资料', file.id, '保留已修改条款及已有应答，不重复导入');
    toast('已重新进入模拟解析队列，保留已修改字段与已有应答');
  }
  function correctRow(row, patch, reason) {
    if(!canManage)return '当前身份无来源修正权限';
    const result = onCorrect(row, patch, reason);
    if (typeof result === 'string') return result;
    setParsed((old) => old.map((item) => item.id === row.id ? { ...item, ...result } : item));
    return result;
  }
  function upload(incoming) {
    if(!canManage)return;
    const nextFiles=[...files,...incoming];
    setFiles(nextFiles);onFilesChange?.(project.id,nextFiles);
    incoming.forEach(scheduleParse);closeUpload(true);
    logEvent('上传资料元数据',project.id,`${incoming.length} 个文件；${incoming[0].purpose}；${incoming[0].version}`);
    toast('文件已进入模拟处理队列；只保存文件名、大小等元数据');
  }
  function openEditor(sourceFile = null) {
    if(!canManage)return;
    setEditor({ id: uid('REQ'), clause: '', title: '', original: '', conclusion: '待确认', draft: '', evidence: '', reason: '', matchLevel: 'none', score: 0, conditions: '', source: sourceFile?.name || '人工补录', sourceFileId: sourceFile?.id, sourcePage: 1, category: '', sectionPath: [], status: '待确认', version: 1 });
    setEditReason(''); setError('');
  }
  function saveEditor() {
    if(!canManage)return;
    if (!editor.title.trim() || !editor.original.trim() || !asText(editor.source).trim()) { setError('请完整填写条目标题、要求原文和来源定位'); return; }
    if (!editReason.trim()) { setError('请填写补录原因'); return; }
    const row = { ...editor, parseHistory: [{ time: now(), action: 'add', reason: editReason }] };
    setParsed((old) => [...old, row]);
    if (editor.sourceFileId) setFiles((old) => old.map((file) => file.id === editor.sourceFileId && file.status === '失败' ? { ...file, status: '完成', error: '', handlingMode: '人工补录' } : file));
    setActiveId(row.id); setEditor(null); logEvent('补录要求', row.id, editReason); toast('补录已保存，自动进入细则比对');
  }
  return <div className="flow-page">
    <div className="page-heading"><div><h1>RFQ 解析</h1><p>{project.id === BHEL_ID ? 'BHEL IKCCAP0034 · 2018年公开采购历史案例 · 保留原始章节、编号与PDF实际页码。' : '以 DOC / DOCX 为主，保留每份 RFQ 自己的章节、编号与顺序，点击条款进入对应细则比对。'}</p></div>{canManage&&<div className="page-actions"><button className="btn" onClick={() => setWordCommentsOpen(true)}><FileText size={16} />历史批注示例</button><button className="btn" onClick={()=>openEditor()}>人工补录</button><button className="btn" onClick={loadSample}><FileText size={16} />载入示例</button><button className="btn btn-primary" onClick={() => { setUploadOpen(true); setError(''); }}><Upload size={16} />上传资料</button></div>}</div>{!canManage&&<Notice>来源文件与解析结果为只读；上传、重新解析及修正由SR处理。</Notice>}
    {wordCommentsOpen && canManage && <WordCommentsPrototype projectId={project.id} onClose={() => setWordCommentsOpen(false)} />}
    <Notice>{project.id === BHEL_ID ? '真实RFQ演示 · 原文件为43页PDF，当前精选40条人工核对要求，中文为译文，并非全文自动解析。采购已于2018年截止；供应商能力、应答与评审均为模拟。新上传文件仍使用模拟解析。' : '交互原型 · 文件仅保存元数据，解析结果使用模拟数据。仅“要求来源”生成要求条目；真实文件内容不会上传或读取。'}</Notice>
    <div className="dw-compact-stats"><span>项目资料<strong>{files.length}</strong></span><span>已抽取条款<strong>{parsed.length}</strong></span><span>已自动导入<strong>{parsed.filter((row) => imported.has(row.id)).length}</strong></span><span>失败任务<strong className={files.some((f) => f.status === '失败') ? 'flow-red' : ''}>{files.filter((f) => f.status === '失败').length}</strong></span></div>
    {files.length > 0 ? <DocumentWorkbench readOnly={!canManage} files={files} rows={parsed} responseRows={requirements} imported={imported} selectedId={activeId} onSelect={setActiveId} onCorrect={correctRow} onReparse={reparse} onSupplement={openEditor} onContinue={(id) => navigate('response', id)} /> : <section className="panel"><NoRows title="上传第一份 RFQ，自动抽取要求条款"><span>支持 DOC、DOCX，兼容 PDF、Excel、CSV 和 TXT；载入示例可体验不同客户章节。</span>{canManage&&<button className="btn btn-primary" onClick={() => { setUploadOpen(true); setError(''); }}><Upload size={15}/>上传并解析</button>}</NoRows></section>}
    <details className="panel dw-file-records"><summary>文件与版本记录<span>{files.length} 份资料 · 查看历史版本和失败任务</span></summary><div className="tabs"><button className={fileTab === '文件清单' ? 'active' : ''} onClick={() => setFileTab('文件清单')}>文件清单 <span>{files.length}</span></button><button className={fileTab === '版本记录' ? 'active' : ''} onClick={() => setFileTab('版本记录')}>文件版本</button></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>文件名称 / 任务编号</th><th>用途</th><th>版本</th><th>处理状态</th><th>上传时间</th><th>操作</th></tr></thead><tbody>{files.map((file) => <tr key={file.id}><td><button className="text-link flow-file-name" onClick={() => setFileDetail(file)}><FileText size={16} />{file.name}</button><div className="muted flow-small">{fileTab === '版本记录' ? (file.previousVersionId ? `替代 ${file.previousVersionId} · ${file.reason}` : '初始版本') : `${file.id} · ${(file.size / 1024 / 1024).toFixed(2)} MB`}</div></td><td>{file.purpose}</td><td>{file.version}</td><td><Badge value={file.status} />{file.error && <div className="flow-error-inline">{file.error}</div>}</td><td className="flow-nowrap">{file.createdAt}</td><td><div className="flow-inline-actions"><button className="text-link" onClick={() => setFileDetail(file)}>详情</button>{canManage && file.status === '失败' && <button className="text-link" onClick={() => { reparse(file); }}>重试</button>}{canManage && file.status === '失败' && <button className="text-link" onClick={() => openEditor(file)}>手动补录</button>}{file.parsedCount > 0 && <button className="text-link" onClick={() => { const row = parsed.find((r) => r.sourceFileId === file.id) || parsed[0]; setActiveId(row?.id); document.querySelector('.dw-workbench')?.scrollIntoView({ behavior: 'smooth' }); }}>查看结果</button>}</div></td></tr>)}</tbody></table></div>{!files.length && <NoRows title="还没有项目资料">上传 RFQ 文档，或载入示例体验解析流程。</NoRows>}
    </details>
    {uploadOpen && canManage && <SourceUploadDialog project={project} files={files} onSubmit={upload} onClose={()=>closeUpload(false)}/>}
    {editor && canManage && <Drawer title="补录要求" onClose={() => setEditor(null)} width={600} footer={<><button className="btn" onClick={() => setEditor(null)}>取消</button><button className="btn btn-primary" onClick={saveEditor}>保存补录</button></>}><Notice>保存后自动进入RFQ细则比对。</Notice><div className="form-grid"><Field label="条款编号"><input className="input" value={editor.clause} onChange={(e) => setEditor({ ...editor, clause: e.target.value })} /></Field><Field label="原文章节路径"><input className="input" value={(editor.sectionPath || []).join(' / ')} onChange={(e) => setEditor({ ...editor, sectionPath: e.target.value.split('/').map(s => s.trim()).filter(Boolean) })} placeholder="按原文填写，例如：反应模块 / 温控" /></Field><Field label="条目标题" required wide><input className="input" value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} /></Field><Field label="客户要求原文" required wide><textarea className="input flow-textarea" value={editor.original} onChange={(e) => setEditor({ ...editor, original: e.target.value })} /></Field><Field label="必要条件" wide><textarea className="input" value={asText(editor.conditions)} onChange={(e) => setEditor({ ...editor, conditions: e.target.value })} /></Field><Field label="来源文件 / 多来源定位" required wide><textarea className="input" value={asText(editor.source)} onChange={(e) => setEditor({ ...editor, source: e.target.value })} /></Field><Field label="页码 / 工作表 / 单元格"><input className="input" value={editor.sourcePage || ''} onChange={(e) => setEditor({ ...editor, sourcePage: e.target.value })} /></Field><Field label="补录原因" required wide><textarea className="input" value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="说明补录原因" /></Field></div>{error && <p className="flow-error-inline" role="alert">{error}</p>}</Drawer>}
    {fileDetail && <Drawer title="资料详情与版本" onClose={() => setFileDetail(null)} width={580}><div className="flow-detail-heading"><FileText size={24} /><div><h3>{fileDetail.name}</h3><Badge value={files.find((f) => f.id === fileDetail.id)?.status || fileDetail.status} /></div></div><dl className="flow-description"><dt>资料编号</dt><dd>{fileDetail.id}</dd><dt>用途 / 版本</dt><dd>{fileDetail.purpose} / {fileDetail.version}</dd><dt>可见范围</dt><dd>{fileDetail.visibility || '项目成员可见'}</dd><dt>来源定位</dt><dd>解析后条目保留文件名、页码及条款。</dd><dt>替代版本</dt><dd>{fileDetail.previousVersionId || '初始版本'}</dd><dt>替换原因</dt><dd>{fileDetail.reason || '—'}</dd><dt>原件状态</dt><dd>{fileDetail.realSource ? <a href={fileDetail.localUrl} target="_blank" rel="noreferrer">查看BHEL原始PDF（43页）</a> : '仅登记元数据，原文件请在本地查看。'}</dd></dl><Notice>{fileDetail.realSource ? '此文件是从BHEL官网下载的原始PDF。来源页码采用PDF实际页序；中文为演示译文，摘录仅覆盖精选条款。' : '原件预览为模拟视图，不会显示或上传真实文件内容。解析异常可重试或补录；条目问题在RFQ细则比对处理。'}</Notice>{fileDetail.error && <Notice type="error">{fileDetail.error}</Notice>}<h4>相关条目</h4>{parsed.filter((r) => r.sourceFileId === fileDetail.id).map((r) => <button className="flow-related-row" key={r.id} onClick={() => { setActiveId(r.id); setFileDetail(null); }}>{r.clause} {r.title}<ChevronRight size={15} /></button>)}</Drawer>}
  </div>;
}

export function ReviewsPage({ project, requirements = [], reviews = [], onUpdateReview, onConfirmReviewed, toast, navigate, actorRole, actorId, appState,canBusinessAction, logEvent = () => {}, embedded = false, inline = false, registerNavigationGuard, initialReviewId = null, initialAction = null, onCloseEmbedded }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('总应答项');
  const reviewGroups = [
    { label: '总应答项', matches: () => true },
    { label: '未处理', matches: (review) => !isClosed(review) && !isPendingReview(review) },
    { label: '已审核', matches: isClosed },
    { label: '待确认', matches: isPendingReview },
  ];
  const [type, setType] = useState('全部类型');
  const [source, setSource] = useState('全部来源');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [activeId, setActiveId] = useState(initialReviewId);
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
  const reviewBaseline=useRef({});
  const active = reviews.find((r) => r.id === activeId);
  const canReviewEdit=!!active&&canBusinessAction('review',active.id);
  const canReopen=!!active&&canBusinessAction('review',active.id,'reopen');
  const canCommunicate=!!active&&canBusinessAction('review',active.id,'communicate');
  const canReviewApprove=!!active&&canBusinessAction('review',active.id,'approve');
  const requirement = requirements.find((r) => r.id === active?.requirementId);
  const filtered = reviews.filter((r) => `${r.id} ${r.title} ${r.owner} ${r.description}`.toLowerCase().includes(query.toLowerCase()) && reviewGroups.find((group) => group.label === status).matches(r) && (type === '全部类型' || r.type === type) && (source === '全部来源' || asText(r.source).includes(source)) && (!mine || r.owner === actorRole || (actorRole === 'SR' && r.owner === project.owner) || (actorRole === '最终审批人' && isPendingReview(r))));
  const shown = filtered.slice((page - 1) * 6, page * 6);
  const change = (field, value) => { setForm((old) => ({ ...old, [field]: value })); dirtyRef.current = true; setDirty(true); };
  function clearDirty() { dirtyRef.current = false; setDirty(false); }
  function guardLeave(next) { if (dirtyRef.current) { leaveNext.current = next; setLeaveOpen(true); return false; } return true; }
  function finishLeave(save) { if (save && !savePlan()) return; clearDirty(); const next = leaveNext.current || (() => setActiveId(null)); leaveNext.current = null; setLeaveOpen(false); next(); }
  useUnsavedWarning(dirty);
  useEffect(() => { const previous = registerNavigationGuard ? null : window.__rfqRequestNavigation; const hook = next => guardCardNavigation({ dirty: dirtyRef.current, onBlock: action => { leaveNext.current = action; setLeaveOpen(true); }, previous }, next); if (registerNavigationGuard) return registerNavigationGuard(hook); window.__rfqRequestNavigation = hook; return () => { if (window.__rfqRequestNavigation === hook) { if (previous) window.__rfqRequestNavigation = previous; else delete window.__rfqRequestNavigation; } }; }, [registerNavigationGuard]);
  useEffect(() => { if (initialReviewId) { const review = reviews.find((item) => item.id === initialReviewId); if (review) { openReview(review); if(initialAction==='reopen'&&isClosed(review)){setAction('reopen');setActionReason('');setAssignee(review.ownerId||'');setDeadline(review.deadline||project.deadline||'');} } } }, []);
  useEffect(() => { if (embedded && !activeId) onCloseEmbedded?.(); }, [embedded, activeId]);
  useEffect(() => { setPage(1); }, [query, status, type, source, mine]);
  useEffect(() => { setPage((old) => Math.min(old, Math.max(1, Math.ceil(filtered.length / 6)))); }, [filtered.length]);
  function openReview(review) {
    const next = () => { const req = requirements.find((r) => r.id === review.requirementId); setActiveId(review.id); reviewBaseline.current={version:review.version||1,round:review.round||1};setDetailTab('处理方案'); clearDirty(); setError(''); setForm({ plan: review.plan || '', impact: asText(review.impact), evidence: asText(review.evidence), conclusion: review.proposedConclusion || req?.conclusion || '待确认', draft: review.proposedDraft || req?.draft || '', customerCommunication: review.customerCommunication || '未沟通', acceptanceResult: review.acceptanceResult || '未验收' }); };
    if (guardLeave(next)) next();
  }
  function historyEntry(label, reason) { return { id: uid('EVENT'), action: label, actor: actorRole, time: now(), reason }; }
  function savePlan(closeAfter = false) {
    if (!active || !canReviewEdit || isClosed(active) || isPendingReview(active)) { toast('已关闭或待批准事项为只读，请返回核对当前状态'); return false; }
    const patch = { plan: form.plan, impact: form.impact, evidence: form.evidence, proposedConclusion: form.conclusion, proposedDraft: form.draft, ...(actorRole === 'SR' ? { customerCommunication: form.customerCommunication, acceptanceResult: form.acceptanceResult } : {}), history: [...(active.history || []), historyEntry('保存处理方案', '保存草稿，尚未批准')] };
    if (onUpdateReview(active.id, patch,reviewBaseline.current.version,reviewBaseline.current.round) === false) return false; logEvent('保存评审方案', active.id, '保存方案、影响及证据'); clearDirty(); toast('处理方案已保存'); if (closeAfter) { setActiveId(null); setLeaveOpen(false); } return true;
  }
  function saveCommunication() {
    if(!active||!canCommunicate)return;
    const updated=onUpdateReview(active.id,{customerCommunication:form.customerCommunication,acceptanceResult:form.acceptanceResult,history:[...(active.history||[]),historyEntry('登记沟通与验收','SR登记，专业方案保持不变')]},reviewBaseline.current.version,reviewBaseline.current.round);
    if(updated===false)return;clearDirty();toast('沟通与验收记录已保存，专业方案和任务归属保持不变');
  }
  function startAction(kind) {
    setAction(kind); setActionReason(''); setAssignee(active?.ownerId || ''); setDeadline(active?.deadline || '2026-10-28'); setError('');
  }
  function performAction() {
    if (!active) return;
    const route = getReviewRoute(requirement, project.approvalConfig);
    if (['submit','approve'].includes(action) && (!active.ownerId || !active.approverId)) { setError('请在项目人员配置中补齐专业处理人与指定批准人。'); return; }
    if (['assign', 'reject', 'reopen'].includes(action) && !actionReason.trim()) { setError('请填写本次操作原因，记录将保留在事项历史中。'); return; }
    if (['approve', 'reject'].includes(action) && !canBusinessAction('review',active.id,action)) { setError('当前人员不是本事项的有效专业批准人。'); return; }
    if (['approve', 'reject'].includes(action) && !isPendingReview(active)) { setError('事项状态已变化，只有待批准事项可以批准或退回。'); return; }
    if (action === 'submit' && (isClosed(active) || isPendingReview(active))) { setError('事项状态已变化，请返回核对后再提交。'); return; }
    if (action === 'submit' && (!form.plan.trim() || !active.owner || !active.deadline)) { setError('提交前请填写处理方案，并完成责任人与截止时间分派。'); return; }
    if (['assign', 'reopen'].includes(action) && (!assignee.trim() || !deadline)) { setError('请填写责任人及截止时间。'); return; }
    if (action === 'reopen' && !isClosed(active)) { setError('只有已关闭事项可以重新评审。'); return; }
    if(action==='approve'){try{assertIndependentApproval(active,{id:actorId,role:actorRole},{state:appState,actorId,projectId:project.id});}catch(e){setError(e.message);return;}}
    if (action === 'approve' && !form.plan.trim()) { setError('处理方案为空，不能批准关闭。'); return; }
    const labels = { assign: '重新分派', submit: '提交专业批准', approve: '批准关闭', reject: '退回修改', reopen: '重新评审' };
    const statuses = { assign: active.status, submit: '待审批', approve: '已关闭', reject: '已退回', reopen: '待处理' };
    const reason = actionReason.trim() || (action === 'approve' ? '方案及必要条件核对通过，相关应答仍需确认。' : '处理方案已就绪，提交专业批准。');
    const patch = { status: statuses[action], history: [...(active.history || []), historyEntry(labels[action], action === 'assign' ? `${active.owner} → ${assignee}；${reason}` : reason)] };
    if (action === 'assign') Object.assign(patch, { owner: personName(appState,assignee.trim()),ownerId:assignee.trim(), deadline, reason });
    if (action === 'submit') Object.assign(patch, { plan: form.plan, impact: form.impact, evidence: form.evidence, proposedConclusion: form.conclusion, proposedDraft: form.draft, submittedBy: actorRole, submittedById:actorId,requirementVersion:requirement?.version||1,requirementAtSubmission:structuredClone(requirement),submittedAt: now(), ...(actorRole === 'SR' ? { customerCommunication: form.customerCommunication, acceptanceResult: form.acceptanceResult } : {}) });
    if (action === 'approve') Object.assign(patch, { approvedBy: actorRole,approvedById:actorId, approvedAt: now(), approvalReason: reason });
    if(['reopen','reject'].includes(action))patch.round=(active.round||1)+1;
    if (action === 'reopen') Object.assign(patch, { reason, owner: personName(appState,assignee.trim()) || active.owner,ownerId:assignee.trim()||active.ownerId, deadline: deadline || active.deadline });
    const updated=onUpdateReview(active.id, patch,reviewBaseline.current.version,reviewBaseline.current.round);if(updated===false)return;
    if(updated&&typeof updated==='object')reviewBaseline.current={version:updated.version||1,round:updated.round||1};
    logEvent(labels[action], active.id, reason); toast(action === 'approve' ? '事项已批准关闭；请核对差异并采用建议，人工答复已保留' : `${labels[action]}成功`); setAction(null); if (action === 'submit') clearDirty();
  }
  const closed = active && isClosed(active);
  const actions = { assign: '分派 / 改派事项', submit: '提交专业批准', approve: '批准并关闭事项', reject: '退回处理方案', reopen: '重新评审' };
  const ReviewSurface = inline ? InlineReviewSurface : Drawer;
  return <div className={`flow-page ${inline ? 'response-inline-review' : ''}`}>
    {!embedded && <><div className="workbench-view-heading"><p className="muted">集中处理关联条目的差距、待澄清事项与专业评审。</p></div>
    <div className="flow-stat-strip">{reviewGroups.map((group) => <div key={group.label}><span>{group.label}</span><strong>{reviews.filter(group.matches).length}</strong></div>)}</div>
    <section className="panel"><div className="flow-filterbar flow-review-filters"><Field label="搜索事项"><input className="input" placeholder="事项编号、名称、责任人" value={query} onChange={(e) => setQuery(e.target.value)} /></Field><Field label="事项类型"><select className="select" value={type} onChange={(e) => setType(e.target.value)}><option>全部类型</option>{[...new Set(reviews.map((r) => r.type))].filter(Boolean).map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="处理状态"><select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>{reviewGroups.map((group) => <option key={group.label}>{group.label}</option>)}</select></Field><Field label="偏离来源"><select className="select" value={source} onChange={(e) => setSource(e.target.value)}><option>全部来源</option>{[...new Set(reviews.flatMap((r) => asText(r.source).split(/[；、]/)))].filter(Boolean).map((v) => <option key={v}>{v}</option>)}</select></Field><div className="flow-filter-buttons"><button className="btn btn-primary" onClick={() => { setPage(1); toast(`已查询到 ${filtered.length} 个事项`); }}>查询</button><button className="btn" onClick={() => { setQuery(''); setStatus('总应答项'); setType('全部类型'); setSource('全部来源'); setMine(false); }}>重置</button></div></div>
      <div className="panel-header flow-table-heading"><h2>偏离及待确认事项</h2><label className="flow-checkbox-label"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />仅看本人待办</label></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>事项 / 关联条目</th><th>来源与类别</th><th>影响</th><th>责任人</th><th>截止时间</th><th>状态</th><th>操作</th></tr></thead><tbody>{shown.map((review) => <tr key={review.id}><td><button className="text-link" onClick={() => openReview(review)}>{review.title}</button><div className="muted flow-small">{review.id} · {requirements.find((r) => r.id === review.requirementId)?.clause || review.requirementId}</div></td><td><span>{review.type}</span><div className="muted flow-small">{asText(review.source)}</div></td><td><div className="flow-table-impact">{asText(review.impact) || '待评估'}</div></td><td>{review.owner || <span className="flow-red">未分派</span>}</td><td className="flow-nowrap">{review.deadline || '未设置'}</td><td><Badge value={review.status} /></td><td><button className="text-link" onClick={() => openReview(review)}>{isClosed(review) ? '查看 / 重新评审' : '处理事项'}</button></td></tr>)}</tbody></table></div>{!shown.length && <NoRows title={reviews.length ? '没有符合条件的事项' : '暂无偏离或待评审事项'}>{reviews.length ? '调整查询条件或清除筛选。' : '在细则比对页签将需要专业判断的条目转入评审。'}{!reviews.length && <button className="btn btn-primary" onClick={() => navigate('response', requirement?.id)}>查看细则比对</button>}</NoRows>}<Pager count={filtered.length} page={page} onChange={setPage} />
    </section>
    <Notice>“用户未接受”表示内部使用者未接受匹配结果。客户沟通接受与实际验收分别记录；批准事项不会自动确认关联应答。</Notice>
    </>}
    {active?.kind==='clarification'&&<ReviewSurface title="客户澄清跟进" width={680} onClose={()=>{const next=()=>setActiveId(null);if(guardLeave(next))next();}}><ClarificationPanel key={active.id} issue={active} onDirtyChange={value=>{dirtyRef.current=value;setDirty(value);}} onChange={(id,patch)=>onUpdateReview(id,patch,reviewBaseline.current.version,reviewBaseline.current.round)} actorId={actorId} actorRole={actorRole} canEdit={canReviewEdit} toast={toast}/>{!inline && <button className="text-link" onClick={()=>navigate('response',active.requirementId)}>返回关联条款 →</button>}</ReviewSurface>}
    {active && active.kind!=='clarification' && <ReviewSurface title="事项详情与处理" width={720} onClose={() => { const next = () => setActiveId(null); if (guardLeave(next)) next(); }} footer={<>{closed ? <button className="btn" disabled={!canReopen} onClick={() => startAction('reopen')}><RefreshCw size={15} />重新评审</button> : <><button className="btn" disabled={!canReviewEdit} onClick={() => startAction('assign')}>分派 / 改派</button><button className="btn" disabled={!canReviewEdit||isPendingReview(active)} onClick={() => savePlan()}>保存方案</button>{!isPendingReview(active) && <button className="btn btn-primary" disabled={!canReviewEdit} onClick={() => startAction('submit')}>提交专业批准</button>}{isPendingReview(active) && <><button className="btn btn-danger" disabled={!canReviewApprove} onClick={() => startAction('reject')}>退回</button><button className="btn btn-primary" disabled={!canReviewApprove} onClick={() => startAction('approve')}>批准关闭</button></>}</>}</>}>
      <ApprovalRoute requirement={requirement} config={project.approvalConfig} review={active}/><div className="flow-detail-top"><div><span className="muted flow-small">{active.id}</span><h3>{active.title}</h3></div><Badge value={active.status} /></div><dl className="flow-description"><dt>事项类型 / 来源</dt><dd>{active.type} · {asText(active.source)}</dd><dt>责任人 / 截止</dt><dd>{active.owner || '未分派'} / {active.deadline || '未设置'}</dd><dt>要求与差距</dt><dd>{active.description || active.reason || '待补充问题说明'}</dd></dl>
      {!inline && <div className="flow-requirement-card"><div><strong>{requirement?.clause} {requirement?.title || '关联要求'}</strong><button className="text-link" onClick={() => navigate('response', requirement?.id)}>定位要求<ArrowRight size={13} /></button></div><p>{requirement?.original || '关联条目已不可用，请联系项目负责人核对。'}</p><small>来源：{asText(requirement?.source)} · 第 {requirement?.sourcePage || '—'} 页</small></div>}
      {closed && <Notice>已关闭结果与处理记录保留为只读。可重新评审并保留上一轮记录，关联条款将进入评审中。</Notice>}{isPendingReview(active) && <Notice>正在等待专业批准。当前职责：{actorRole}。由本事项指定的专业批准人处理。</Notice>}
      <div className="tabs flow-inner-tabs">{['处理方案', '沟通与验收', '处理记录'].map((tab) => <button className={detailTab === tab ? 'active' : ''} key={tab} onClick={() => setDetailTab(tab)}>{tab}</button>)}</div>
      {detailTab === '处理方案' && <div className="form-grid"><Field label="处理方案" required wide><textarea className="input flow-textarea" value={form.plan} readOnly={!canReviewEdit||closed||isPendingReview(active)} onChange={(e) => change('plan', e.target.value)} placeholder="说明可执行方案、必要条件、差距弥补措施及证据" /></Field><Field label="成本 / 交期 / 质量影响" wide><textarea className="input" value={form.impact} readOnly={!canReviewEdit||closed||isPendingReview(active)} onChange={(e) => change('impact', e.target.value)} placeholder="分别说明影响；无影响也请明确记录" /></Field><Field label="证据与依据" wide><textarea className="input" value={form.evidence} readOnly={!canReviewEdit||closed||isPendingReview(active)} onChange={(e) => change('evidence', e.target.value)} placeholder="资料编号、版本、适用条件及证据定位" /></Field><Field label="评审建议结论"><select className="select" disabled={!canReviewEdit||closed||isPendingReview(active)} value={form.conclusion} onChange={(e) => change('conclusion', e.target.value)}>{[...new Set([form.conclusion, 'Comply', '有条件 Comply', '不满足', '不适用', '待确认'])].map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="关联应答处理"><input className="input" readOnly value="批准后回到待确认" /></Field><Field label="评审建议答复" wide><textarea className="input flow-textarea" value={form.draft} readOnly={!canReviewEdit||closed||isPendingReview(active)} onChange={(e) => change('draft', e.target.value)} /></Field><span className="muted flow-small">{dirty ? '● 存在未保存修改' : '方案已保存 / 只读核对'}</span></div>}
      {detailTab === '沟通与验收' && <><Notice>客户沟通与验收结果由SR独立登记，不改变技术方案或审批结果。</Notice><div className="form-grid flow-spaced"><Field label="客户沟通结果"><select className="select" value={form.customerCommunication} disabled={!canCommunicate} onChange={(e) => change('customerCommunication', e.target.value)}><option>未沟通</option><option>待客户澄清</option><option>客户已接受</option><option>客户未接受</option></select></Field><Field label="实际验收结果"><select className="select" value={form.acceptanceResult} disabled={!canCommunicate} onChange={(e) => change('acceptanceResult', e.target.value)}><option>未验收</option><option>验收通过</option><option>验收不通过</option></select></Field></div>{canCommunicate&&<button className="btn btn-primary" onClick={saveCommunication}>保存沟通与验收记录</button>}</>}
      {detailTab === '处理记录' && <div className="flow-timeline">{(active.history || []).length ? (active.history || []).map((entry, index) => <div className="flow-timeline-item" key={entry?.id || index}><i /><strong>{typeof entry === 'string' ? entry : entry.action || entry.title || '事项更新'}</strong>{typeof entry === 'object' && <><small>{entry.time || entry.createdAt || '—'} · {entry.actor || entry.by || '系统'}</small><p>{entry.reason || entry.detail || entry.description || '—'}</p></>}</div>) : <NoRows title="暂无历史操作">后续分派、方案、批准、退回和重新评审记录将保留在此。</NoRows>}</div>}
    </ReviewSurface>}
    {action && active && <Modal title={actions[action]} onClose={() => setAction(null)} footer={<><button className="btn" onClick={() => setAction(null)}>取消</button><button className={`btn ${action === 'reject' ? 'btn-danger' : 'btn-primary'}`} onClick={performAction}>确认{actions[action].replace('事项', '')}</button></>}><div className="flow-modal-object"><strong>{active.title}</strong><span>{active.id} · <Badge value={active.status} /></span></div>{action === 'approve' && <Notice>请核对方案、证据及承诺条件。批准关闭后，关联应答仍须由责任人在细则比对页签确认。</Notice>}{action === 'submit' && <><Notice>将当前处理方案提交专业批准；提交后待批准内容以只读方式展示。</Notice><div className="flow-preview-text">{form.plan || '尚未填写处理方案'}</div></>}{['assign', 'reopen'].includes(action) && <div className="form-grid flow-spaced"><Field label="责任人" required><select className="select" aria-label="专业事项处理人" value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">请选择有项目权限的技术人员</option>{Object.values(appState?.accountsById||{}).filter(a=>canAccessProject(appState,a.id,project.id)&&getPersonnelContext(appState,a.id,project.buId).member?.roles.includes(active.kind==='clarification'?'SR':'技术')).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field><Field label="截止时间" required><input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field></div>}<Field label={action === 'reopen' ? '重新评审原因' : action === 'assign' ? '分派 / 改派原因' : action === 'reject' ? '退回原因' : '处理意见'} required={['assign', 'reject', 'reopen'].includes(action)} wide><textarea className="input flow-textarea" value={actionReason} onChange={(e) => setActionReason(e.target.value)} placeholder="记录具体意见，便于后续追溯" /></Field>{error && <p className="flow-error-inline" role="alert">{error}</p>}</Modal>}
    {leaveOpen && <Modal title="处理方案尚未保存" onClose={() => { setLeaveOpen(false); leaveNext.current = null; }} footer={<><button className="btn" onClick={() => { setLeaveOpen(false); leaveNext.current = null; }}>取消离开</button><button className="btn" onClick={() => finishLeave(false)}>放弃修改</button>{active?.kind!=='clarification'&&<button className="btn btn-primary" onClick={() => finishLeave(true)}>保存后离开</button>}</>}><p>{active?.kind==='clarification'?'客户回复尚未登记，取消离开后可继续填写并登记；放弃修改将丢弃本次输入。':'当前编辑尚未保存。保存成功后继续跳转，或放弃本次修改；取消会保留当前输入。'}</p></Modal>}
  </div>;
}

export function ExportPage({ project, requirements = [], reviews = [], snapshots = [], appState, onSnapshot, onExportScope,route,canBusinessAction,taskContextError,toast, navigate, actorRole,actorId, launchOnly = false, onClose, onSubmitted, logEvent = () => {} }) {
  const columns = [{ key: 'clause', label: '条款编号', required: true }, { key: 'original', label: '客户要求', required: true }, { key: 'conclusion', label: '应答结论', required: true }, { key: 'draft', label: '对外答复', required: true }, { key: 'conditions', label: '适用条件', required: true }, { key: 'status', label: '确认状态', required: false }];
  const templates = [{ id: 'standard', title: '标准 RFQ 应答矩阵', version: 'V2.1', description: '逐条列出客户要求、结论与最终答复，适合技术应答。' }, { id: 'customer', title: '客户条款对照清单', version: 'V1.3', description: '以客户条款为索引，保留全部必要条件与批准状态。' }, { id: 'delivery', title: '交付条件核对清单', version: 'V1.0', description: '集中核对承诺条件，供交付前再次对照确认。' }];
  const savedExport=(()=>{try{return JSON.parse(sessionStorage.getItem(`rfq.export.settings.${project.id}`))||{};}catch{return {};}})();
  const [tab, setTab] = useState(route?.snapshotId || actorRole === '最终审批人' ? '审批与快照' : savedExport.tab || '模板与映射');
  const storedScope=appState?.exportScopesByProject?.[project.id];
  const [templateId, setTemplateId] = useState(storedScope?.template?.id||savedExport.templateId||'standard');
  const [mapping, setMapping] = useState(storedScope?.mapping||savedExport.mapping||Object.fromEntries(columns.map((c) => [c.key, c.key])));
  const [checked, setChecked] = useState(false);
  const [detailId, setDetailId] = useState(route?.snapshotId||null);
  const [action, setAction] = useState(launchOnly?'submit':null);
  useEffect(()=>{
    if(route?.snapshotId){setDetailId(route.snapshotId);setTab('审批与快照');}
    else if(route?.action==='configure'){setDetailId(null);setTab('模板与映射');}
  },[route]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState(() => { let saved=[];try { const stored=JSON.parse(localStorage.getItem(`fep-rfq-export-history:${project.id}`) || '[]');if(Array.isArray(stored))saved=stored; } catch {} return [...new Map([...snapshots.flatMap(snapshot=>snapshot.exports||[]),...saved].map(record=>[record.id,record])).values()]; });
  const activeTemplate = templates.find((t) => t.id === templateId) || templates[0];
  const projectSnapshots = snapshots.filter((s) => s.projectId === project.id);
  const detail = projectSnapshots.find((s) => s.id === detailId);
  const savedApproval = (() => { try { return JSON.parse(localStorage.getItem(`fep-rfq-management-approval-${project.id}`) || 'null'); } catch { return null; } })();
  const effectiveApproval = project.approvalConfig !== undefined ? project.approvalConfig : savedApproval || { final: '最终审批人' };
  const finalReviewConfig=(()=>{try{return {value:getProjectFinalReview(appState,project.id),error:''};}catch(e){return {value:null,error:e.message};}})();
  const requiredFinalReviewers=finalReviewConfig.value?getRequiredFinalReviewers(finalReviewConfig.value):[];
  const approvalConfigIssues=finalReviewConfig.error?[{id:'approval-config',label:'SR与技术组最终评审配置',message:finalReviewConfig.error}]:[];
  const storedDocuments=readDocumentState(project.id),currentFiles=appState?.documentsByProject?.[project.id];
  const documentState = currentFiles !== undefined ? { files: currentFiles, parsed: (storedDocuments?.parsed||[]).filter(row=>currentFiles.some(file=>file.id===row.sourceFileId)) } : storedDocuments;
  const unimportedParsed = (documentState?.parsed || []).filter((r) => !requirements.some((current) => current.id === r.id));
  const unfinishedFiles = (documentState?.files || []).filter((f) => f.purpose === '要求来源' && !(documentState?.files || []).some((newer) => newer.previousVersionId === f.id) && ['排队中', '处理中', '失败'].includes(f.status));
  const documentIssues = [...unimportedParsed.map((r) => ({ id: `document-${r.id}`, label: `${r.clause} ${r.title}`, message: '解析条目尚未自动同步，请返回解析页完成同步' })), ...unfinishedFiles.map((f) => ({ id: `document-${f.id}`, label: f.name, message: f.status === '失败' ? `要求来源解析失败：${f.error || '请重试或补录'}` : `要求来源仍在${f.status}，请等待解析完成` }))];
  const mappingIssues = columns.filter((c) => c.required && mapping[c.key] !== c.key).map((c) => ({ id: `mapping-${c.key}`, label: `${c.label}映射`, message: !mapping[c.key] ? '必要列尚未映射，请补全字段映射' : '必要列必须与同名业务字段对应，避免遗漏承诺或错误映射' }));
  const issues = [...getExportIssues(requirements, reviews, project.id), ...documentIssues, ...mappingIssues, ...approvalConfigIssues];
  const unconfirmedComply=getUnconfirmedComplyRows(requirements,project.id);
  const pending = projectSnapshots.filter((s) => s.status === '审批中'&&!s.stale);
  const approvalScope={rows:requirements,sourceVersions:(documentState?.files||[]).filter(f=>f.purpose==='要求来源').map(f=>`${f.id}:${f.version}`),configuration:{equipment:project.equipment,approvalConfig:effectiveApproval,personnel:getFinalReviewScope(appState,project.id)},template:activeTemplate,mapping,attachments:[]};
  useEffect(()=>{sessionStorage.setItem(`rfq.export.settings.${project.id}`,JSON.stringify({...savedExport,tab,templateId,mapping}));onExportScope?.(approvalScope);},[tab,templateId,JSON.stringify(mapping),JSON.stringify(approvalScope)]);
  const approved = projectSnapshots.filter((s) => s.status === '已批准');
  const signature = (rows) => JSON.stringify(rows.map((r) => ({ id: r.id, version: r.version, status: r.status, original: r.original, conclusion: r.conclusion, draft: r.draft, conditions: r.conditions, evidence: r.evidence, reason: r.reason, owner: r.owner })).sort((a, b) => a.id.localeCompare(b.id)));
  function validity(snapshot) {
    if (!snapshot) return { valid: false, message: '未选择批准快照' };
    if (approvalConfigIssues.length) return { valid: false, message: approvalConfigIssues[0].message };
    if (snapshot.status !== '已批准') return { valid: false, message: snapshot.status === '审批中' ? '快照尚在审批中' : '快照未经批准' };
    if (!isFinalReviewApproved(snapshot)) return { valid: false, message: 'SR与技术组尚未完成本版本所需的全部评审' };
    if (documentIssues.length) return { valid: false, message: '来源资料仍有失败任务或未同步条目，请完成解析后重新提交' };
    const scopeCheck=checkSnapshotValidity(snapshot,approvalScope,latestSnapshot(projectSnapshots));if(!scopeCheck.valid)return {valid:false,message:scopeCheck.reasons.join('；')};
    if (signature(snapshot.rows || []) !== signature(requirements)) return { valid: false, message: '当前工作内容或条目版本已变化，请重新提交新快照' };
    if (getExportIssues(requirements, reviews, project.id).length) return { valid: false, message: '当前工作版本存在未确认内容或未关闭事项' };
    return { valid: true, message: '与当前工作版本一致，可以正式导出' };
  }
  const downloadable = approved.find((s) => validity(s).valid);
  useEffect(() => { localStorage.setItem(`fep-rfq-export-history:${project.id}`, JSON.stringify(history)); }, [history, project.id]);
  useEffect(()=>{if(savedExport.scroll)requestAnimationFrame(()=>window.scrollTo(0,savedExport.scroll));},[]);
  function goIssue(issue) {
    sessionStorage.setItem(`rfq.export.settings.${project.id}`,JSON.stringify({...savedExport,tab,templateId,mapping,scroll:window.scrollY}));
    if(issue.route){navigate(issue.route.page,issue.route.requirementId,{...issue.route,returnKey:'export'});return;}
    if (issue.id === 'approval-config') navigate('settings');
    else if (String(issue.id).startsWith('document-')) navigate('documents');
    else if (String(issue.id).startsWith('mapping-')) setTab('模板与映射');
    else if (issue.id === 'empty-requirements') navigate('documents');
    else if (reviews.some((r) => r.id === issue.id)) navigate('reviews',issue.requirementId,{reviewId:issue.id,returnKey:'export'});
    else navigate('response',issue.id,{returnKey:'export'});
  }
  function mappedRows(rows, selectedMapping) { return rows.map((row) => ({ ...row, ...Object.fromEntries(columns.map((c) => [c.key, row[selectedMapping[c.key]] ?? ''])) })); }
  function saveFile(content, filename) {
    const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function downloadDraft() {
    if(!canPerform(actorRole,'export:download'))return toast('请由SR下载应答文件','error');
    const rows = mappedRows(requirements, mapping).map((r, index) => ({ ...r, status: `${isConfirmed(requirements[index]) ? '内部草稿 / 已确认' : '内部草稿 / 未确认'}`, draft: `${isConfirmed(requirements[index]) ? '[内部草稿] ' : '[内部草稿 / 未确认] '}${r.draft || '答复待补充'}` }));
    const filename = `${project.name}_内部草稿_未确认内容请核对_${Date.now()}.csv`;
    try {
      saveFile(`内部草稿 / 包含未确认内容 / 仅供内部核对\r\n${toCsv(rows)}`, filename);
      setHistory((old) => [{ id: uid('EXP'), type: '内部草稿', filename, createdAt: now(), actor: actorRole, status: '已生成', snapshotId: '当前工作版本', template: activeTemplate.title, rowCount: rows.length }, ...old]); logEvent('下载内部草稿', project.id, `${rows.length} 条；显式标记内部草稿与未确认`); toast('内部草稿已生成，未确认内容已显式标记');
    } catch (err) { toast(`生成失败：${err.message}`); logEvent('草稿生成失败', project.id, err.message); }
  }
  function closeAction() { if(launchOnly)onClose?.();else setAction(null); }
  function locateIssue(issue) {
    if(launchOnly){
      onClose?.();
      if(String(issue.id).startsWith('mapping-')){
        navigate('export',null,{snapshotId:undefined,taskId:undefined,action:'configure',returnKey:'response'});
        return;
      }
    }
    setAction(null);goIssue(issue);
  }
  function startAction(kind, snapshotId = null) { if (snapshotId) setDetailId(snapshotId); setAction(kind); setReason(''); setError(''); if (kind === 'submit') setChecked(true); }
  function submitSnapshot() {
    if(!canPerform(actorRole,'snapshot:submit'))return setError('当前身份无提交快照权限');
    const currentIssues = [...getExportIssues(requirements, reviews, project.id), ...documentIssues, ...mappingIssues, ...approvalConfigIssues];
    if (currentIssues.length) { setError(`当前仍有 ${currentIssues.length} 个检查项未通过，请返回修正。`); return; }
    const latest=latestSnapshot(projectSnapshots);
    const existing = pending.find((s) => s.id===latest?.id&&s.approvalFingerprint===snapshotFingerprint(approvalScope));
    if (existing) { setAction(null); setDetailId(existing.id); toast('当前版本已在最终评审中'); onSubmitted?.(existing.id); return; }
    const returned=latest?.status==='已退回'?latest:null;
    const snapshot = { ...makeSnapshot(project.id, requirements, actorRole), ...(returned?{revisionOf:returned.id}:{}), approvalFingerprint:snapshotFingerprint(approvalScope),approvalScope:structuredClone(approvalScope),createdById:actorId,finalReview:structuredClone(finalReviewConfig.value),template: { ...activeTemplate }, mapping: { ...mapping }, approvalConfig: { ...effectiveApproval }, submissionReason: reason.trim() || '必需人工确认已完成，系统推荐Comply未人工确认项交由本轮评审核对', history: [{ id: uid('EVENT'), action: '提交快照审批', actor: actorRole, time: now(), reason: reason.trim() || '检查通过，冻结应答快照' }], attachments: [] };
    if(onSnapshot(snapshot)===false)return; logEvent('提交快照审批', snapshot.id, `${requirements.length} 条要求；系统推荐Comply未人工确认 ${unconfirmedComply.length} 条；${activeTemplate.title} ${activeTemplate.version}`); toast('已冻结快照，等待指定SR与技术组评审'); setAction(null); setDetailId(snapshot.id); setTab('审批与快照'); onSubmitted?.(snapshot.id);
  }
  function reviewSnapshot() {
    const current = projectSnapshots.find((s) => s.id === detailId);
    if (!current || current.status !== '审批中') { setError('对象状态已变化，请返回快照列表核对'); return; }
    if (approvalConfigIssues.length) { setError(approvalConfigIssues[0].message); return; }
    if(!canBusinessAction('snapshot',current.id,'approve'))return setError('当前人员没有本轮最终评审任务');
    if (action === 'reject' && !reason.trim()) { setError('退回必须填写具体原因'); return; }
    if(action==='approve'&&!checkSnapshotValidity(current,approvalScope,latestSnapshot(projectSnapshots)).valid){setError('批准范围已经变化，请重新提交快照');return;}
    if (action === 'approve' && (signature(current.rows || []) !== signature(requirements) || getExportIssues(requirements, reviews, project.id).length || documentIssues.length)) { setError('当前工作数据已变化或检查未通过，请退回原快照并提交新快照'); return; }
    const label = action === 'approve' ? '批准定稿' : '退回快照';
    let patch;
    try{const side=getRequiredFinalReviewers(current.finalReview).find(r=>r.actorId===actorId)?.side;patch=applyFinalReviewDecision(current,{actorId,side,result:action==='approve'?'approved':'rejected',reason});}catch(e){setError(e.message);return;}
    if(onSnapshot(patch)===false)return; logEvent(label,current.id,reason);toast(patch.status==='已批准'?'SR与技术组已全部通过，可正式导出':patch.status==='已退回'?'快照已退回，修改重提后需重新评审':'本人已通过，继续等待其他必需评审人');setAction(null);
  }

  function downloadFormal() {
    if(!canPerform(actorRole,'export:download'))return setError('请由SR正式导出');
    const current = projectSnapshots.find((s) => s.id === detailId);
    const check = validity(current);
    if (!check.valid) { setError(check.message); logEvent('正式导出被阻止', current?.id || project.id, check.message); return; }
    const rows = mappedRows(current.rows, current.mapping || Object.fromEntries(columns.map((c) => [c.key, c.key]))).map(row=>({...row,status:current.unconfirmedComplyIds?.includes(row.id)?'最终评审已通过（未逐条人工确认）':row.status}));
    const filename = `${project.name}_正式应答_${current.id.slice(0, 18)}.csv`;
    try {
      saveFile(toCsv(rows), filename);
      const record = { id: uid('EXP'), type: '正式应答', filename, createdAt: now(), actor: actorRole, status: '已生成', snapshotId: current.id, template: current.template?.title || '标准 RFQ 应答矩阵', rowCount: rows.length };
      setHistory((old) => [record, ...old]);
      onSnapshot({ ...current, exports: [...(current.exports || []), record],exportedAt:new Date().toISOString() }); logEvent('正式导出', current.id, `当前有效性校验通过；${rows.length} 条；CSV UTF-8`); toast('正式应答已导出，记录已绑定批准快照'); setAction(null); setTab('导出记录');
    } catch (err) { setError(`文件生成失败：${err.message}`); logEvent('正式导出失败', current.id, err.message); }
  }
  function snapshotTable(snapshot) { const priority=new Set(snapshot.unconfirmedComplyIds||[]),rows=[...(snapshot.rows||[])].sort((a,b)=>Number(priority.has(b.id))-Number(priority.has(a.id)));return <div className="table-wrap flow-snapshot-table"><table className="data-table"><thead><tr><th>条款</th><th>客户要求</th><th>最终结论</th><th>冻结答复</th><th>必要条件</th><th>人工确认</th><th>版本</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.clause}</td><td>{r.original}</td><td><Badge value={r.conclusion} /></td><td>{r.draft}</td><td>{asText(r.conditions) || '—'}</td><td>{priority.has(r.id)?'未人工确认 · 系统推荐Comply':r.status==='已确认'?'已人工确认':r.status}</td><td>V{r.version || 1}</td></tr>)}</tbody></table></div>; }
  const actionDialog = action && <Modal title={{ submit: '发起最终评审', approve: '通过本方最终评审', reject: '退回应答快照', formal: '正式导出检查' }[action]} width={720} onClose={closeAction} footer={<><button className="btn" onClick={closeAction}>取消</button><button className={`btn ${action === 'reject' ? 'btn-danger' : 'btn-primary'}`} disabled={action === 'submit' && (issues.length > 0 || !!taskContextError)} onClick={action === 'submit' ? submitSnapshot : action === 'formal' ? downloadFormal : reviewSnapshot}>{action === 'submit' ? '确认发起' : action === 'formal' ? '生成正式 CSV 文件' : action === 'approve' ? '确认通过本方评审' : '确认退回'}</button></>}>
      {action === 'submit' ? <><UnconfirmedComplyList rows={unconfirmedComply} onLocate={row=>locateIssue({id:row.id,route:{page:'response',requirementId:row.id,fileId:row.sourceFileId,sourceVersion:row.sourceVersion}})}/><Notice type={issues.length ? 'warning' : 'info'}>{issues.length ? `检查未通过，共 ${issues.length} 个阻断项。修正后可再次提交。` : `检查通过，将冻结 ${requirements.length} 条要求。提交后由指定SR与技术组按本轮规则评审。`}</Notice>{issues.length > 0 && <div className="flow-modal-issues">{issues.map((issue, index) => <div key={`${issue.id}-${index}`}><strong>{issue.label}</strong><p>{issue.message}</p><button className="text-link" onClick={() => locateIssue(issue)}>定位修正<ArrowRight size={13} /></button></div>)}</div>}<dl className="flow-description"><dt>项目</dt><dd>{project.name}</dd><dt>模板版本</dt><dd>{activeTemplate.title} {activeTemplate.version}</dd><dt>人工确认</dt><dd>{requirements.filter(isConfirmed).length} / {requirements.length} 条已确认；系统推荐 Comply 未人工确认 {unconfirmedComply.length} 条</dd><dt>SR评审人</dt><dd>{requiredFinalReviewers.filter(r=>r.side==='sr').map(r=>personName(appState,r.actorId)).join('、')||'尚未配置'}</dd><dt>技术评审人</dt><dd>{requiredFinalReviewers.filter(r=>r.side==='technical').map(r=>personName(appState,r.actorId)).join('、')||'尚未配置'}</dd><dt>通过规则</dt><dd>SR方通过 + {finalReviewConfig.value?.technicalMode==='representative'?'技术负责人代表通过':'技术组全员通过'}</dd><dt>提交身份</dt><dd>{personName(appState,actorId)} · {actorRole}</dd><dt>对外附件</dt><dd>0 个 · 不包含内部证据</dd></dl>{actorRole === '最终审批人' && <Notice type="warning">请由SR提交快照，并分别完成SR与技术组评审。</Notice>}</> : <><div className="flow-modal-object"><strong className="flow-snapshot-id">{detail?.id || '快照不可用'}</strong><span>{detail?.rows?.length || 0} 条 · {detail?.template?.title || '标准模板'}</span></div>{action === 'formal' ? <><Notice type={validity(detail).valid ? 'info' : 'error'}>{validity(detail).message}</Notice><dl className="flow-description"><dt>已批准快照</dt><dd>{detail?.status || '—'}</dd><dt>条目版本校验</dt><dd>{validity(detail).valid ? '通过 · 与当前版本逐条一致' : '未通过'}</dd><dt>对外字段</dt><dd>条款、客户要求、应答结论、最终答复、适用条件、确认状态</dd><dt>附件清单</dt><dd>0 个 · 不打包内部证据</dd><dt>生成格式</dt><dd>CSV · UTF-8 BOM</dd></dl></> : <Notice>{action === 'approve' ? '核对冻结内容及必要条件后批准。批准仅绑定本快照；后续工作修改需重新审批。' : '退回原因会保存至快照历史。原快照内容继续保留，修订后需提交新快照。'}</Notice>}</>}
      {action !== 'formal' && <Field label={action === 'reject' ? '退回原因' : action === 'submit' ? '发起说明' : '处理意见'} required={action === 'reject'} wide><textarea className="input flow-textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === 'reject' ? '请说明需要修订的条目和原因' : action === 'submit' ? '补充本轮评审说明（选填）' : '补充核对意见（选填）'} /></Field>}{error && <p className="flow-error-inline" role="alert">{error}</p>}
    </Modal>;
  if(launchOnly)return actionDialog;
  return <div className="flow-page">
    <div className="page-heading"><div><h1>{actorRole==='技术'?'应答最终评审':'导出文档'}</h1><p>核对模板与字段，冻结应答快照，由指定SR与技术组共同评审。</p></div><div className="page-actions"><button className="btn" disabled={!canPerform(actorRole,'export:download')} onClick={downloadDraft}><Download size={16} />下载内部草稿</button><button className="btn btn-primary" disabled={!!taskContextError||!canPerform(actorRole,'snapshot:submit')} onClick={() => startAction('submit')}><ShieldCheck size={16} />发起最终评审</button></div></div>
    {!canPerform(actorRole,'export:download')&&<Notice>模板与映射为只读。SR提交快照；技术组按BU规则评审，SR方仍须单独通过。应答文件由SR下载。</Notice>}
    <div className="flow-export-steps"><div className="flow-step done"><span>1</span><div><strong>核对内容与模板</strong><small>完成条目确认及字段映射</small></div></div><ChevronRight size={18} /><div className={`flow-step ${pending.length || approved.length ? 'done' : ''}`}><span>2</span><div><strong>冻结快照并审批</strong><small>指定SR与技术组核对</small></div></div><ChevronRight size={18} /><div className={`flow-step ${downloadable ? 'done' : ''}`}><span>3</span><div><strong>正式导出</strong><small>校验批准及当前有效性</small></div></div></div>
    {issues.length ? <Notice type="warning">当前有 <b>{issues.length}</b> 个提交阻断项。可随时生成内部草稿；正式应答需完成必需人工确认、事项关闭及最终评审。<button className="text-link flow-notice-action" onClick={() => { setChecked(true); document.getElementById('flow-export-checks')?.scrollIntoView({ behavior: 'smooth' }); }}>查看检查结果</button></Notice> : <Notice>当前工作版本检查通过。{downloadable ? '已有当前有效的批准快照，可执行正式导出。' : '请完成指定SR与技术组的本轮最终评审。'}</Notice>}
    <section className="panel"><div className="tabs">{['模板与映射', '内容预览', '审批与快照', '导出记录'].map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}{t === '审批与快照' && <span>{projectSnapshots.length}</span>}{t === '导出记录' && <span>{history.length}</span>}</button>)}</div>
      {tab === '模板与映射' && <div className="panel-body"><div className="flow-section-title"><h3>选择内置模板</h3><span className="muted flow-small">本原型实际生成 UTF-8 CSV 文件</span></div><div className="flow-template-grid">{templates.map((template) => <button key={template.id} disabled={!!taskContextError||!canPerform(actorRole,'export:configure')} className={`flow-template-card ${templateId === template.id ? 'active' : ''}`} onClick={() => {if(canPerform(actorRole,'export:configure'))setTemplateId(template.id);}}><FileText size={25} /><div><strong>{template.title}</strong><p>{template.description}</p><span>CSV · {template.version}</span></div>{templateId === template.id && <Check size={17} className="flow-template-check" />}</button>)}</div><div className="flow-section-title flow-spaced"><h3>字段映射</h3><span className="muted flow-small">必要列不可缺省；条件按原文保留</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>模板列名</th><th>来源字段</th><th>要求</th><th>检查结果</th></tr></thead><tbody>{columns.map((column) => <tr key={column.key}><td>{column.label}</td><td><select className="select" aria-label={`${column.label}映射`} disabled={!!taskContextError||!canPerform(actorRole,'export:configure')} value={mapping[column.key]} onChange={(e) => {if(canPerform(actorRole,'export:configure'))setMapping((old) => ({ ...old, [column.key]: e.target.value }));}}><option value="">不映射</option>{columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></td><td>{column.required ? <span className="flow-required">必填 / 保留</span> : '可选'}</td><td>{mapping[column.key] === column.key ? <span className="flow-check-ok"><Check size={14} />映射正确</span> : column.required ? <span className="flow-red">请修正映射</span> : <span className="muted">未映射 / 自定义</span>}</td></tr>)}</tbody></table></div><Notice>对外文件包含本次要求、最终答复及必要条件；内部评审、成本、历史项目名称、批注和检索引用不进入 CSV。内部证据不自动作为对外附件。</Notice></div>}
      {tab === '内容预览' && <><div className="panel-header"><div><h2>{activeTemplate.title}</h2><span className="muted flow-small">当前工作版本预览 · {requirements.length} 条要求 · 非审批快照</span></div><button className="btn btn-sm" disabled={!canPerform(actorRole,'export:download')} onClick={downloadDraft}><Download size={14} />内部草稿</button></div><div className="table-wrap"><table className="data-table"><thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{mappedRows(requirements.slice((page - 1) * 6, page * 6), mapping).map((row) => <tr key={row.id}><td>{row.clause || '—'}</td><td className="flow-preview-requirement">{row.original}</td><td><Badge value={row.conclusion} /></td><td className="flow-preview-reply">{row.draft || <span className="flow-red">待补充</span>}</td><td>{asText(row.conditions) || '—'}</td><td><Badge value={row.status} /></td></tr>)}</tbody></table></div>{!requirements.length && <NoRows title="暂无可预览条目">请先解析要求；空项目仍可下载带内部草稿标记的 CSV。</NoRows>}<Pager count={requirements.length} page={page} onChange={setPage} /><div className="flow-attachment-panel"><h4>附件分标检查</h4><div><span>内部证据引用</span><b>{requirements.filter((r) => asText(r.evidence)).length} 条</b><span>拟对外批准附件</span><b>0 个</b></div><p className="muted">本次 CSV 不打包任何附件。内部证据引用仅用于核对，不作为自动外发附件。</p></div></>}
      {tab === '审批与快照' && <><div className="panel-header"><h2>应答快照</h2><span className="muted flow-small">源数据修改不覆盖已有快照</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>快照编号 / 模板</th><th>条目</th><th>提交人 / 时间</th><th>审批状态</th><th>当前有效性</th><th>操作</th></tr></thead><tbody>{[...projectSnapshots].reverse().map((snapshot) => <tr key={snapshot.id}><td><button className="text-link flow-snapshot-id" onClick={() => setDetailId(snapshot.id)}>{snapshot.id}</button><div className="muted flow-small">{snapshot.template?.title || '标准 RFQ 应答矩阵'} · {snapshot.template?.version || 'V2.1'}</div></td><td>{snapshot.rows?.length || 0}</td><td>{snapshot.createdBy}<div className="muted flow-small">{new Date(snapshot.createdAt).toLocaleString('zh-CN', { hour12: false })}</div></td><td><Badge value={snapshot.status} /></td><td><span className={validity(snapshot).valid ? 'flow-check-ok' : 'muted flow-small'}>{validity(snapshot).valid ? <><Check size={14} />当前有效</> : snapshot.stale ? '本轮已失效，请重新提交' : snapshot.status === '已批准' ? '工作版本已变化 / 不可重新导出' : '待批准后校验'}</span></td><td><div className="flow-inline-actions"><button className="text-link" onClick={() => setDetailId(snapshot.id)}>{snapshot.status === '审批中' && canBusinessAction('snapshot',snapshot.id,'approve') ? '审批' : '查看'}</button>{snapshot.status === '已批准' && <button className="text-link" disabled={!canPerform(actorRole,'export:download')||!validity(snapshot).valid} onClick={() => startAction('formal', snapshot.id)}>正式导出</button>}</div></td></tr>)}</tbody></table></div>{!projectSnapshots.length && <NoRows title="尚未创建应答快照">完成检查后提交审批，系统将冻结本次条目及版本。</NoRows>}</>}
      {tab === '导出记录' && <><div className="panel-header"><h2>文件生成记录</h2><span className="muted flow-small">正式文件绑定实际批准快照</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>文件名称</th><th>类型 / 结果</th><th>快照</th><th>生成时间 / 人员</th><th>操作</th></tr></thead><tbody>{history.slice((historyPage - 1) * 6, historyPage * 6).map((item) => { const snapshot = projectSnapshots.find((s) => s.id === item.snapshotId); return <tr key={item.id}><td className="flow-history-file"><FileText size={15} />{item.filename}<div className="muted flow-small">{item.template} · {item.rowCount} 条 · UTF-8 CSV</div></td><td><Badge value={item.type} /><div className="muted flow-small">{item.status}</div></td><td><span className="flow-small flow-snapshot-id">{item.snapshotId}</span>{snapshot && <div className={`flow-small ${validity(snapshot).valid ? 'flow-check-ok' : 'flow-red'}`}>{validity(snapshot).valid ? '当前可重新导出' : '历史记录：当前不可重新导出'}</div>}</td><td className="flow-nowrap">{item.createdAt}<div className="muted flow-small">{item.actor}</div></td><td>{snapshot ? <button className="text-link" onClick={() => setDetailId(snapshot.id)}>文件包详情</button> : <button className="text-link" onClick={downloadDraft}>生成当前草稿</button>}</td></tr>; })}</tbody></table></div>{!history.length && <NoRows title="暂无导出记录">下载内部草稿或正式应答后，将生成可追溯记录。</NoRows>}<Pager count={history.length} page={historyPage} onChange={setHistoryPage} /></>}
    </section>
    <section className="panel" id="flow-export-checks"><div className="panel-header"><h2><ListChecks size={18} />提交与定稿检查</h2><button className="btn btn-sm" onClick={() => { setChecked(true); toast(issues.length ? `检查完成：${issues.length} 个阻断项` : '全部检查通过，可提交快照审批'); }}><RefreshCw size={14} />重新检查</button></div><div className="flow-check-summary"><span className={`flow-check-indicator ${issues.length ? 'warning' : 'success'}`}>{issues.length ? <AlertCircle size={21} /> : <ShieldCheck size={21} />}</span><div><strong>{issues.length ? `${issues.length} 个待修正项` : '当前工作版本检查通过'}</strong><p>人工确认 {requirements.filter(isConfirmed).length} / {requirements.length} 条 · 系统推荐 Comply 未人工确认 {unconfirmedComply.length} 条 · 未关闭事项 {reviews.filter((r) => !isClosed(r)).length} 个 · {checked ? '已重新核对当前版本' : '实时检查结果'}</p></div></div>{issues.length > 0 && <div className="flow-issue-list">{issues.map((issue, index) => <div className="flow-issue-row" key={`${issue.id}-${index}`}><AlertCircle size={15} /><div><strong>{issue.label}</strong><p>{issue.message}</p></div><button className="text-link" onClick={() => goIssue(issue)}>前往修正<ArrowRight size={13} /></button></div>)}</div>}<div className="flow-bottom-actions"><span className="muted">审批快照不可编辑；新工作版本需要重新提交和批准。</span><div className="flow-inline-actions"><button className="btn" onClick={() => { setTab('审批与快照'); }}>查看快照</button><button className="btn btn-primary" disabled={!canPerform(actorRole,'export:download')||!downloadable} onClick={() => startAction('formal', downloadable?.id)}><Download size={16} />正式导出</button></div></div></section>
    {detail && <Drawer title="应答快照 · 只读审批" width={1000} onClose={() => setDetailId(null)} footer={<><button className="btn" onClick={() => setDetailId(null)}>返回列表</button>{detail.status === '审批中' && <><button className="btn btn-danger" disabled={!canBusinessAction('snapshot',detail.id,'approve')} onClick={() => startAction('reject', detail.id)}>退回</button><button className="btn btn-primary" disabled={!canBusinessAction('snapshot',detail.id,'approve')} onClick={() => startAction('approve', detail.id)}>通过本方评审</button></>}{detail.status === '已批准' && <button className="btn btn-primary" disabled={!canPerform(actorRole,'export:download')||!validity(detail).valid} onClick={() => startAction('formal', detail.id)}><Download size={15} />正式导出</button>}</>}><UnconfirmedComplyList frozen rows={(detail.rows||[]).filter(row=>detail.unconfirmedComplyIds?.includes(row.id))}/><div className="flow-detail-top"><div><span className="muted flow-small">固定快照编号</span><h3 className="flow-snapshot-id">{detail.id}</h3></div><Badge value={detail.status} /></div><dl className="flow-description"><dt>提交人 / 时间</dt><dd>{detail.createdBy} / {new Date(detail.createdAt).toLocaleString('zh-CN', { hour12: false })}</dd><dt>模板版本</dt><dd>{detail.template?.title || '标准 RFQ 应答矩阵'} {detail.template?.version || 'V2.1'}</dd><dt>批准人</dt><dd>{detail.reviewedBy || '查看下方逐人评审记录'}</dd><dt>处理意见</dt><dd>{detail.reviewReason || detail.submissionReason || '—'}</dd><dt>外发附件</dt><dd>0 个；内部证据不自动作为对外附件</dd></dl><Notice type={detail.status === '已批准' && !validity(detail).valid ? 'warning' : 'info'}>{detail.stale ? '本轮快照已失效，请按当前人员与规则重新提交。' : detail.status === '已批准' ? validity(detail).message : '此处展示冻结快照，不随当前工作内容修改。当前身份：' + actorRole + '；SR与技术组均须通过。'}</Notice><FinalReviewProgress snapshot={detail} appState={appState}/><h4 className="flow-spaced">冻结应答内容（{detail.rows?.length || 0} 条）</h4>{snapshotTable(detail)}<h4 className="flow-spaced">审批与导出记录</h4><div className="flow-timeline">{(detail.history || []).map((entry, index) => <div className="flow-timeline-item" key={entry.id || index}><i /><strong>{entry.action}</strong><small>{entry.time} · {entry.actor}</small><p>{entry.reason}</p></div>)}{(detail.exports || []).map((record) => <div className="flow-timeline-item" key={record.id}><i /><strong>正式导出 CSV</strong><small>{record.createdAt} · {record.actor}</small><p>{record.filename}</p></div>)}</div></Drawer>}
    {actionDialog}
  </div>;
}

function FinalReviewProgress({snapshot,appState}){
 let required;try{required=getRequiredFinalReviewers(snapshot.finalReview);}catch{return <Notice>历史快照缺少SR与技术组完整评审记录；重新提交后才能按新规则正式导出。</Notice>;}
 return <section className="panel personnel-panel"><div className="panel-header"><h3>本轮逐人最终评审</h3><span className="badge">{snapshot.finalReview.technicalMode==='all'?'技术组全员通过':'技术负责人代表通过'}</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>评审方</th><th>指定人员</th><th>结果</th><th>意见</th></tr></thead><tbody>{required.map(r=>{const vote=r.side==='sr'?snapshot.finalReview.decisions?.sr:snapshot.finalReview.decisions?.technicalByActorId?.[r.actorId];return <tr key={r.actorId}><td>{r.side==='sr'?'SR方':'技术方'}</td><td>{personName(appState,r.actorId)}</td><td>{vote?.result==='approved'?'已通过':vote?.result==='rejected'?'已退回':snapshot.stale?'本轮已失效':snapshot.status==='已退回'?'本轮已取消':'待评审'}</td><td>{vote?.reason||'—'}</td></tr>;})}</tbody></table></div></section>;
}
