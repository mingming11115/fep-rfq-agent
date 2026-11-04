import {parseRfqSource} from '../rfqSourceClient';
import { UiTag, UiButton, PageHeading, BusinessTabs, BusinessTable, UiInput, UiTextArea, UiSelect, UiCheckbox } from '../components/AntContent';
import ResponseReviewPanel from '../components/ResponseReviewPanel';
import {getReviewActorIds,hasReviewConfirmation} from '../confirmationPolicy';
import InlineReviewSurface from '../components/InlineReviewSurface';
import { guardCardNavigation } from '../responseCardQueue';
import {getProjectFinalReview,getRequiredFinalReviewers,personName} from '../personnelDomain';
import {applyFinalReviewDecision,isFinalReviewApproved} from '../finalReviewDomain';
import {canPerform} from '../permissions';
import {shouldOpenSourceUpload,getSourceUploadExitRoute} from '../navigation';
import {snapshotFingerprint,latestSnapshot,checkSnapshotValidity,getFinalReviewScope} from '../snapshotDomain';
import React, { useEffect, useRef, useState } from 'react';
import { Upload, FileText, Check, AlertCircle, ArrowRight, Download, Plus, Search, RefreshCw, X, ShieldCheck, ChevronRight, ListChecks } from "../components/icons";
import { Modal, Drawer } from '../components/ui';
import { makeRequirements } from '../data';
import { BHEL_ID } from '../bhelDemo';
import { makeDocumentDemo } from '../documentMocks';
import { getExportIssues, makeSnapshot, toCsv } from '../domain';
import {getUnconfirmedComplyRows} from '../responseRecommendation';
import UnconfirmedComplyList from '../components/UnconfirmedComplyList';
import './workflow-pages.css';
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
function Badge({ value }) { return <UiTag className={`badge ${tone(value)}`}>{value || '未设置'}</UiTag>; }
function Notice({ children, type = 'info' }) { return <div className={`flow-notice flow-notice-${type}`}><AlertCircle size={16} /><div>{children}</div></div>; }
function NoRows({ title = '暂无数据', children }) { return <div className="empty-state"><FileText size={34} /><strong>{title}</strong><p>{children}</p></div>; }
function Field({ label, children, required = false, wide = false }) { return <label className={`field ${wide ? 'flow-field-wide' : ''}`}><span>{required && <i className="flow-required">*</i>}{label}</span>{children}</label>; }
function Pager({ count, page = 1, pageSize = 6, onChange }) {
  const last = Math.max(1, Math.ceil(count / pageSize));
  return <div className="flow-pager"><span>共 {count} 条记录</span><div><UiButton className="btn btn-sm" disabled={page <= 1} onClick={() => onChange?.(page - 1)}>上一页</UiButton><UiButton className="btn btn-sm flow-page-number">{page}</UiButton><UiButton className="btn btn-sm" disabled={page >= last} onClick={() => onChange?.(page + 1)}>下一页</UiButton><span>{pageSize} 条 / 页</span></div></div>;
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
      const next = old.map((file) => file.status === '待核对' && !file.backendDocumentId && parsed.some((row) => row.sourceFileId === file.id) ? { ...file, status: '完成' } : file);
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
  async function scheduleParse(file) {
    if(!canManage||file.demoParsePreview||running.current.has(file.id))return;
    running.current.add(file.id);
    setFiles(old=>old.map(f=>f.id===file.id?{...f,status:'处理中',parseStage:'extracting',error:''}:f));
    try {
      const {run,rows}=await parseRfqSource(project.id,file);
      setParsed(old=>[...old.filter(row=>row.sourceFileId!==file.id),...rows]);
      setFiles(old=>old.map(f=>f.id===file.id?{...f,status:run.status==='partial'?'待核对':'完成',parseStage:'completed',parsedCount:rows.length,lastRunId:run.id,parsedAt:now(),error:run.message||''}:f));
      onAnalysisRun({id:run.id,fileId:file.id,sourceVersion:file.version,type:'parse',status:run.status==='partial'?'待核对':'完成',startedAt:run.startedAt,endedAt:run.finishedAt,successCount:rows.length,failedCount:0,needsHumanCount:run.issueCount});
      setActiveId(rows[0]?.id);logEvent('后端解析完成',file.id,`${rows.length} 条要求已从数据库读取`);
    }catch(error){setFiles(old=>old.map(f=>f.id===file.id?{...f,status:'失败',error:error.message}:f));toast(error.message,'error');}
    finally{running.current.delete(file.id);}
  }
  function reparse(file) {
    if(!canManage)return;
    if (running.current.has(file.id)) return;
    setFiles((old) => old.map((f) => f.id === file.id ? { ...f, status: '排队中', parseStage: 'queued', error: '' } : f));
    scheduleParse(file); logEvent('重新解析资料', file.id, '保留已修改条款及已有应答，不重复导入');
    toast('已请求后端重新解析；人工修改由后端校验保护');
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
    toast('原件已上传，正在请求后端解析');
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
    <PageHeading title={<>RFQ 解析</>} description={<>{project.id === BHEL_ID ? 'BHEL IKCCAP0034 · 2018年公开采购历史案例 · 保留原始章节、编号与PDF实际页码。' : '以 DOC / DOCX 为主，保留每份 RFQ 自己的章节、编号与顺序，点击条款进入对应细则比对。'}</>} actions={<>{canManage&&<div className="page-actions"><UiButton className="btn" onClick={() => setWordCommentsOpen(true)}><FileText size={16} />历史批注示例</UiButton><UiButton className="btn" onClick={()=>openEditor()}>人工补录</UiButton><UiButton className="btn" onClick={loadSample}><FileText size={16} />载入示例</UiButton><UiButton className="btn btn-primary" onClick={() => { setUploadOpen(true); setError(''); }}><Upload size={16} />上传资料</UiButton></div>}</>} />{!canManage&&<Notice>来源文件与解析结果为只读；上传、重新解析及修正由SR处理。</Notice>}
    {wordCommentsOpen && canManage && <WordCommentsPrototype projectId={project.id} onClose={() => setWordCommentsOpen(false)} />}
    <Notice>{project.id === BHEL_ID ? '真实RFQ · 原文件为43页PDF，当前精选40条人工核对要求，中文为译文，并非全文自动解析。采购已于2018年截止；供应商能力、应答与评审均为模拟。新上传文件通过后端解析，条款从数据库读取。' : '新上传 DOCX / PDF 由后端解析并保存条款；解析警告需人工核对。演示资料仍为预置示例。'}</Notice>
    <div className="dw-compact-stats"><span>项目资料<strong>{files.length}</strong></span><span>已抽取条款<strong>{parsed.length}</strong></span><span>已自动导入<strong>{parsed.filter((row) => imported.has(row.id)).length}</strong></span><span>失败任务<strong className={files.some((f) => f.status === '失败') ? 'flow-red' : ''}>{files.filter((f) => f.status === '失败').length}</strong></span></div>
    {files.length > 0 ? <DocumentWorkbench readOnly={!canManage} files={files} rows={parsed} responseRows={requirements} imported={imported} selectedId={activeId} onSelect={setActiveId} onCorrect={correctRow} onReparse={reparse} onSupplement={openEditor} onContinue={(id) => navigate('response', id)} /> : <section className="panel"><NoRows title="上传第一份 RFQ，自动抽取要求条款"><span>支持 DOC、DOCX，兼容 PDF、Excel、CSV 和 TXT；载入示例可体验不同客户章节。</span>{canManage&&<UiButton className="btn btn-primary" onClick={() => { setUploadOpen(true); setError(''); }}><Upload size={15}/>上传并解析</UiButton>}</NoRows></section>}
    <details className="panel dw-file-records"><summary>文件与版本记录<span>{files.length} 份资料 · 查看历史版本和失败任务</span></summary><BusinessTabs className="tabs"><button className={fileTab === '文件清单' ? 'active' : ''} onClick={() => setFileTab('文件清单')}>文件清单 <span>{files.length}</span></button><button className={fileTab === '版本记录' ? 'active' : ''} onClick={() => setFileTab('版本记录')}>文件版本</button></BusinessTabs>
      <div className="table-wrap"><BusinessTable className="data-table"><thead><tr><th>文件名称 / 任务编号</th><th>用途</th><th>版本</th><th>处理状态</th><th>上传时间</th><th>操作</th></tr></thead><tbody>{files.map((file) => <tr key={file.id}><td><UiButton className="text-link flow-file-name" onClick={() => setFileDetail(file)}><FileText size={16} />{file.name}</UiButton><div className="muted flow-small">{fileTab === '版本记录' ? (file.previousVersionId ? `替代 ${file.previousVersionId} · ${file.reason}` : '初始版本') : `${file.id} · ${(file.size / 1024 / 1024).toFixed(2)} MB`}</div></td><td>{file.purpose}</td><td>{file.version}</td><td><Badge value={file.status} />{file.error && <div className="flow-error-inline">{file.error}</div>}</td><td className="flow-nowrap">{file.createdAt}</td><td><div className="flow-inline-actions"><UiButton className="text-link" onClick={() => setFileDetail(file)}>详情</UiButton>{canManage && file.status === '失败' && <UiButton className="text-link" onClick={() => { reparse(file); }}>重试</UiButton>}{canManage && file.status === '失败' && <UiButton className="text-link" onClick={() => openEditor(file)}>手动补录</UiButton>}{file.parsedCount > 0 && <UiButton className="text-link" onClick={() => { const row = parsed.find((r) => r.sourceFileId === file.id) || parsed[0]; setActiveId(row?.id); document.querySelector('.dw-workbench')?.scrollIntoView({ behavior: 'smooth' }); }}>查看结果</UiButton>}</div></td></tr>)}</tbody></BusinessTable></div>{!files.length && <NoRows title="还没有项目资料">上传 RFQ 文档，或载入示例体验解析流程。</NoRows>}
    </details>
    {uploadOpen && canManage && <SourceUploadDialog project={project} files={files} onSubmit={upload} onClose={()=>closeUpload(false)}/>}
    {editor && canManage && <Drawer title="补录要求" onClose={() => setEditor(null)} width={600} footer={<><UiButton className="btn" onClick={() => setEditor(null)}>取消</UiButton><UiButton className="btn btn-primary" onClick={saveEditor}>保存补录</UiButton></>}><Notice>保存后自动进入RFQ细则比对。</Notice><div className="form-grid"><Field label="条款编号"><UiInput className="input" value={editor.clause} onChange={(e) => setEditor({ ...editor, clause: e.target.value })} /></Field><Field label="原文章节路径"><UiInput className="input" value={(editor.sectionPath || []).join(' / ')} onChange={(e) => setEditor({ ...editor, sectionPath: e.target.value.split('/').map(s => s.trim()).filter(Boolean) })} placeholder="按原文填写，例如：反应模块 / 温控" /></Field><Field label="条目标题" required wide><UiInput className="input" value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} /></Field><Field label="客户要求原文" required wide><UiTextArea className="input flow-textarea" value={editor.original} onChange={(e) => setEditor({ ...editor, original: e.target.value })} /></Field><Field label="必要条件" wide><UiTextArea className="input" value={asText(editor.conditions)} onChange={(e) => setEditor({ ...editor, conditions: e.target.value })} /></Field><Field label="来源文件 / 多来源定位" required wide><UiTextArea className="input" value={asText(editor.source)} onChange={(e) => setEditor({ ...editor, source: e.target.value })} /></Field><Field label="页码 / 工作表 / 单元格"><UiInput className="input" value={editor.sourcePage || ''} onChange={(e) => setEditor({ ...editor, sourcePage: e.target.value })} /></Field><Field label="补录原因" required wide><UiTextArea className="input" value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="说明补录原因" /></Field></div>{error && <p className="flow-error-inline" role="alert">{error}</p>}</Drawer>}
    {fileDetail && <Drawer title="资料详情与版本" onClose={() => setFileDetail(null)} width={580}><div className="flow-detail-heading"><FileText size={24} /><div><h3>{fileDetail.name}</h3><Badge value={files.find((f) => f.id === fileDetail.id)?.status || fileDetail.status} /></div></div><dl className="flow-description"><dt>资料编号</dt><dd>{fileDetail.id}</dd><dt>用途 / 版本</dt><dd>{fileDetail.purpose} / {fileDetail.version}</dd><dt>可见范围</dt><dd>{fileDetail.visibility || '项目成员可见'}</dd><dt>来源定位</dt><dd>解析后条目保留文件名、页码及条款。</dd><dt>替代版本</dt><dd>{fileDetail.previousVersionId || '初始版本'}</dd><dt>替换原因</dt><dd>{fileDetail.reason || '—'}</dd><dt>原件状态</dt><dd>{fileDetail.realSource ? <a href={fileDetail.localUrl} target="_blank" rel="noreferrer">查看BHEL原始PDF（43页）</a> : fileDetail.craft||fileDetail.office ? '原件已保存，可在详情左侧批阅。' : '仅登记元数据，原文件请在本地查看。'}</dd></dl><Notice>{fileDetail.realSource ? '此文件是从BHEL官网下载的原始PDF。来源页码采用PDF实际页序；中文为译文，摘录仅覆盖精选条款。' : fileDetail.craft||fileDetail.office ? '原件与批阅副本分别保留；文件批注与条款协作记录联动。条款解析仍为现有模拟流程。' : '历史记录未保留原件，可在详情中上传对应文件；条款解析仍为现有模拟流程。'}</Notice>{fileDetail.error && <Notice type="error">{fileDetail.error}</Notice>}<h4>相关条目</h4>{parsed.filter((r) => r.sourceFileId === fileDetail.id).map((r) => <button className="flow-related-row" key={r.id} onClick={() => { setActiveId(r.id); setFileDetail(null); }}>{r.clause} {r.title}<ChevronRight size={15} /></button>)}</Drawer>}
  </div>;
}

export function ReviewsPage({project,requirements=[],reviews=[],onUpdateReview,onAdoptReview,toast,navigate,actorRole,actorId,appState,canBusinessAction,embedded=false,inline=false,registerNavigationGuard,initialReviewId=null,initialAction=null,onCloseEmbedded}){
 const [query,setQuery]=useState(''),[status,setStatus]=useState('全部'),[type,setType]=useState('全部类别'),[mine,setMine]=useState(false),[activeId,setActiveId]=useState(initialReviewId);
 const normalGuard=useRef(null);
 const active=reviews.find(r=>r.id===activeId),row=requirements.find(r=>r.id===active?.requirementId),Surface=inline?InlineReviewSurface:Drawer;
 const guard=next=>normalGuard.current?normalGuard.current(next):true;
 useEffect(()=>{const previous=registerNavigationGuard?null:window.__rfqRequestNavigation;const hook=next=>guard(next)&&(!previous||previous(next));if(registerNavigationGuard)return registerNavigationGuard(hook);window.__rfqRequestNavigation=hook;return()=>{if(window.__rfqRequestNavigation===hook)window.__rfqRequestNavigation=previous;};},[registerNavigationGuard]);
 useEffect(()=>{if(initialReviewId)setActiveId(initialReviewId);},[initialReviewId]);
 useEffect(()=>{if(embedded&&!activeId)onCloseEmbedded?.();},[embedded,activeId]);
 const open=r=>{const next=()=>setActiveId(r.id);if(guard(next))next();};
 const close=()=>setActiveId(null);
 const filtered=reviews.filter(r=>`${r.title} ${r.id} ${r.description||''} ${r.owner||''}`.toLowerCase().includes(query.toLowerCase())&&(status==='全部'||status==='已完成'?status==='全部'||isClosed(r):!isClosed(r))&&(type==='全部类别'||r.type===type)&&(!mine||getReviewActorIds(r).includes(actorId)));
 return <div className={`flow-page ${inline?'response-inline-review':''}`}>
  {!embedded&&<><div className="workbench-view-heading"><p className="muted">查看评审进度；全部评审人确认同一版应答后完成。</p></div><section className="panel"><div className="flow-filterbar flow-review-filters"><Field label="搜索事项"><UiInput className="input" placeholder="事项编号、名称或评审人" value={query} onChange={e=>setQuery(e.target.value)}/></Field><Field label="评审类别"><UiSelect className="select" value={type} onChange={e=>setType(e.target.value)}><option>全部类别</option>{[...new Set(reviews.map(r=>r.type).filter(Boolean))].map(t=><option key={t}>{t}</option>)}</UiSelect></Field><Field label="处理状态"><UiSelect className="select" value={status} onChange={e=>setStatus(e.target.value)}>{['全部','未完成','已完成'].map(s=><option key={s}>{s}</option>)}</UiSelect></Field><label className="flow-checkbox-label"><UiCheckbox type="checkbox" checked={mine} onChange={e=>setMine(e.target.checked)}/>仅看本人评审</label></div><div className="table-wrap"><BusinessTable className="data-table"><thead><tr><th>事项 / 关联应答</th><th>评审类别</th><th>评审人</th><th>确认进度</th><th>截止时间</th><th>操作</th></tr></thead><tbody>{filtered.map(r=>{const req=requirements.find(v=>v.id===r.requirementId),ids=getReviewActorIds(r);return <tr key={r.id}><td><UiButton className="text-link" onClick={()=>open(r)}>{r.title}</UiButton><small>{req?.clause} · {r.id}</small></td><td>{r.type||'—'}</td><td>{ids.map(id=>personName(appState,id)).join('、')||'待选择'}</td><td>{isClosed(r)?'全部已确认':`${ids.filter(id=>hasReviewConfirmation(r,req,id)).length} / ${ids.length} 人已确认`}</td><td>{r.deadline||'未设置'}</td><td><UiButton className="text-link" onClick={()=>open(r)}>{isClosed(r)?'查看结果':'处理评审'}</UiButton></td></tr>;})}</tbody></BusinessTable>{!filtered.length&&<NoRows title="暂无符合条件的事项">可从应答项发起评审。</NoRows>}</div></section></>}

  {active&&row&&<ResponseReviewPanel key={active.id} review={active} row={row} project={project} state={appState} actorId={actorId} onUpdateReview={onUpdateReview} onAdoptReview={onAdoptReview} canEdit={canBusinessAction('review',active.id)} Surface={Surface} onClose={close} initialAction={initialAction} registerGuard={fn=>{normalGuard.current=fn;return()=>{normalGuard.current=null;};}}/>}
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
  function snapshotTable(snapshot) { const priority=new Set(snapshot.unconfirmedComplyIds||[]),rows=[...(snapshot.rows||[])].sort((a,b)=>Number(priority.has(b.id))-Number(priority.has(a.id)));return <div className="table-wrap flow-snapshot-table"><BusinessTable className="data-table"><thead><tr><th>条款</th><th>客户要求</th><th>最终结论</th><th>冻结答复</th><th>必要条件</th><th>人工确认</th><th>版本</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.clause}</td><td>{r.original}</td><td><Badge value={r.conclusion} /></td><td>{r.draft}</td><td>{asText(r.conditions) || '—'}</td><td>{priority.has(r.id)?'未人工确认 · 系统推荐Comply':r.status==='已确认'?'已人工确认':r.status}</td><td>V{r.version || 1}</td></tr>)}</tbody></BusinessTable></div>; }
  const actionDialog = action && <Modal title={{ submit: '发起最终评审', approve: '通过本方最终评审', reject: '退回应答快照', formal: '正式导出检查' }[action]} width={720} onClose={closeAction} footer={<><UiButton className="btn" onClick={closeAction}>取消</UiButton><UiButton className={`btn ${action === 'reject' ? 'btn-danger' : 'btn-primary'}`} disabled={action === 'submit' && (issues.length > 0 || !!taskContextError)} onClick={action === 'submit' ? submitSnapshot : action === 'formal' ? downloadFormal : reviewSnapshot}>{action === 'submit' ? '确认发起' : action === 'formal' ? '生成正式 CSV 文件' : action === 'approve' ? '确认通过本方评审' : '确认退回'}</UiButton></>}>
      {action === 'submit' ? <><UnconfirmedComplyList rows={unconfirmedComply} onLocate={row=>locateIssue({id:row.id,route:{page:'response',requirementId:row.id,fileId:row.sourceFileId,sourceVersion:row.sourceVersion}})}/><Notice type={issues.length ? 'warning' : 'info'}>{issues.length ? `检查未通过，共 ${issues.length} 个阻断项。修正后可再次提交。` : `检查通过，将冻结 ${requirements.length} 条要求。提交后由指定SR与技术组按本轮规则评审。`}</Notice>{issues.length > 0 && <div className="flow-modal-issues">{issues.map((issue, index) => <div key={`${issue.id}-${index}`}><strong>{issue.label}</strong><p>{issue.message}</p><UiButton className="text-link" onClick={() => locateIssue(issue)}>定位修正<ArrowRight size={13} /></UiButton></div>)}</div>}<dl className="flow-description"><dt>项目</dt><dd>{project.name}</dd><dt>模板版本</dt><dd>{activeTemplate.title} {activeTemplate.version}</dd><dt>人工确认</dt><dd>{requirements.filter(isConfirmed).length} / {requirements.length} 条已确认；系统推荐 Comply 未人工确认 {unconfirmedComply.length} 条</dd><dt>SR评审人</dt><dd>{requiredFinalReviewers.filter(r=>r.side==='sr').map(r=>personName(appState,r.actorId)).join('、')||'尚未配置'}</dd><dt>技术评审人</dt><dd>{requiredFinalReviewers.filter(r=>r.side==='technical').map(r=>personName(appState,r.actorId)).join('、')||'尚未配置'}</dd><dt>通过规则</dt><dd>SR方通过 + {finalReviewConfig.value?.technicalMode==='representative'?'技术负责人代表通过':'技术组全员通过'}</dd><dt>提交身份</dt><dd>{personName(appState,actorId)} · {actorRole}</dd><dt>对外附件</dt><dd>0 个 · 不包含内部证据</dd></dl>{actorRole === '最终审批人' && <Notice type="warning">请由SR提交快照，并分别完成SR与技术组评审。</Notice>}</> : <><div className="flow-modal-object"><strong className="flow-snapshot-id">{detail?.id || '快照不可用'}</strong><span>{detail?.rows?.length || 0} 条 · {detail?.template?.title || '标准模板'}</span></div>{action === 'formal' ? <><Notice type={validity(detail).valid ? 'info' : 'error'}>{validity(detail).message}</Notice><dl className="flow-description"><dt>已批准快照</dt><dd>{detail?.status || '—'}</dd><dt>条目版本校验</dt><dd>{validity(detail).valid ? '通过 · 与当前版本逐条一致' : '未通过'}</dd><dt>对外字段</dt><dd>条款、客户要求、应答结论、最终答复、适用条件、确认状态</dd><dt>附件清单</dt><dd>0 个 · 不打包内部证据</dd><dt>生成格式</dt><dd>CSV · UTF-8 BOM</dd></dl></> : <Notice>{action === 'approve' ? '核对冻结内容及必要条件后批准。批准仅绑定本快照；后续工作修改需重新审批。' : '退回原因会保存至快照历史。原快照内容继续保留，修订后需提交新快照。'}</Notice>}</>}
      {action !== 'formal' && <Field label={action === 'reject' ? '退回原因' : action === 'submit' ? '发起说明' : '处理意见'} required={action === 'reject'} wide><UiTextArea className="input flow-textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === 'reject' ? '请说明需要修订的条目和原因' : action === 'submit' ? '补充本轮评审说明（选填）' : '补充核对意见（选填）'} /></Field>}{error && <p className="flow-error-inline" role="alert">{error}</p>}
    </Modal>;
  if(launchOnly)return actionDialog;
  return <div className="flow-page">
    <PageHeading title={<>{actorRole==='技术'?'应答最终评审':'导出文档'}</>} description={<>核对模板与字段，冻结应答快照，由指定SR与技术组共同评审。</>} actions={<><div className="page-actions"><UiButton className="btn" disabled={!canPerform(actorRole,'export:download')} onClick={downloadDraft}><Download size={16} />下载内部草稿</UiButton><UiButton className="btn btn-primary" disabled={!!taskContextError||!canPerform(actorRole,'snapshot:submit')} onClick={() => startAction('submit')}><ShieldCheck size={16} />发起最终评审</UiButton></div></>} />
    {!canPerform(actorRole,'export:download')&&<Notice>模板与映射为只读。SR提交快照；技术组按BU规则评审，SR方仍须单独通过。应答文件由SR下载。</Notice>}
    <div className="flow-export-steps"><div className="flow-step done"><span>1</span><div><strong>核对内容与模板</strong><small>完成条目确认及字段映射</small></div></div><ChevronRight size={18} /><div className={`flow-step ${pending.length || approved.length ? 'done' : ''}`}><span>2</span><div><strong>冻结快照并审批</strong><small>指定SR与技术组核对</small></div></div><ChevronRight size={18} /><div className={`flow-step ${downloadable ? 'done' : ''}`}><span>3</span><div><strong>正式导出</strong><small>校验批准及当前有效性</small></div></div></div>
    {issues.length ? <Notice type="warning">当前有 <b>{issues.length}</b> 个提交阻断项。可随时生成内部草稿；正式应答需完成必需人工确认、事项关闭及最终评审。<UiButton className="text-link flow-notice-action" onClick={() => { setChecked(true); document.getElementById('flow-export-checks')?.scrollIntoView({ behavior: 'smooth' }); }}>查看检查结果</UiButton></Notice> : <Notice>当前工作版本检查通过。{downloadable ? '已有当前有效的批准快照，可执行正式导出。' : '请完成指定SR与技术组的本轮最终评审。'}</Notice>}
    <section className="panel"><BusinessTabs className="tabs">{['模板与映射', '内容预览', '审批与快照', '导出记录'].map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}{t === '审批与快照' && <span>{projectSnapshots.length}</span>}{t === '导出记录' && <span>{history.length}</span>}</button>)}</BusinessTabs>
      {tab === '模板与映射' && <div className="panel-body"><div className="flow-section-title"><h3>选择内置模板</h3><span className="muted flow-small">本原型实际生成 UTF-8 CSV 文件</span></div><div className="flow-template-grid">{templates.map((template) => <button key={template.id} disabled={!!taskContextError||!canPerform(actorRole,'export:configure')} className={`flow-template-card ${templateId === template.id ? 'active' : ''}`} onClick={() => {if(canPerform(actorRole,'export:configure'))setTemplateId(template.id);}}><FileText size={25} /><div><strong>{template.title}</strong><p>{template.description}</p><span>CSV · {template.version}</span></div>{templateId === template.id && <Check size={17} className="flow-template-check" />}</button>)}</div><div className="flow-section-title flow-spaced"><h3>字段映射</h3><span className="muted flow-small">必要列不可缺省；条件按原文保留</span></div><div className="table-wrap"><BusinessTable className="data-table"><thead><tr><th>模板列名</th><th>来源字段</th><th>要求</th><th>检查结果</th></tr></thead><tbody>{columns.map((column) => <tr key={column.key}><td>{column.label}</td><td><UiSelect className="select" aria-label={`${column.label}映射`} disabled={!!taskContextError||!canPerform(actorRole,'export:configure')} value={mapping[column.key]} onChange={(e) => {if(canPerform(actorRole,'export:configure'))setMapping((old) => ({ ...old, [column.key]: e.target.value }));}}><option value="">不映射</option>{columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</UiSelect></td><td>{column.required ? <span className="flow-required">必填 / 保留</span> : '可选'}</td><td>{mapping[column.key] === column.key ? <span className="flow-check-ok"><Check size={14} />映射正确</span> : column.required ? <span className="flow-red">请修正映射</span> : <span className="muted">未映射 / 自定义</span>}</td></tr>)}</tbody></BusinessTable></div><Notice>对外文件包含本次要求、最终答复及必要条件；内部评审、成本、历史项目名称、批注和检索引用不进入 CSV。内部证据不自动作为对外附件。</Notice></div>}
      {tab === '内容预览' && <><div className="panel-header"><div><h2>{activeTemplate.title}</h2><span className="muted flow-small">当前工作版本预览 · {requirements.length} 条要求 · 非审批快照</span></div><UiButton className="btn btn-sm" disabled={!canPerform(actorRole,'export:download')} onClick={downloadDraft}><Download size={14} />内部草稿</UiButton></div><div className="table-wrap"><BusinessTable className="data-table"><thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{mappedRows(requirements.slice((page - 1) * 6, page * 6), mapping).map((row) => <tr key={row.id}><td>{row.clause || '—'}</td><td className="flow-preview-requirement">{row.original}</td><td><Badge value={row.conclusion} /></td><td className="flow-preview-reply">{row.draft || <span className="flow-red">待补充</span>}</td><td>{asText(row.conditions) || '—'}</td><td><Badge value={row.status} /></td></tr>)}</tbody></BusinessTable></div>{!requirements.length && <NoRows title="暂无可预览条目">请先解析要求；空项目仍可下载带内部草稿标记的 CSV。</NoRows>}<Pager count={requirements.length} page={page} onChange={setPage} /><div className="flow-attachment-panel"><h4>附件分标检查</h4><div><span>内部证据引用</span><b>{requirements.filter((r) => asText(r.evidence)).length} 条</b><span>拟对外批准附件</span><b>0 个</b></div><p className="muted">本次 CSV 不打包任何附件。内部证据引用仅用于核对，不作为自动外发附件。</p></div></>}
      {tab === '审批与快照' && <><div className="panel-header"><h2>应答快照</h2><span className="muted flow-small">源数据修改不覆盖已有快照</span></div><div className="table-wrap"><BusinessTable className="data-table"><thead><tr><th>快照编号 / 模板</th><th>条目</th><th>提交人 / 时间</th><th>审批状态</th><th>当前有效性</th><th>操作</th></tr></thead><tbody>{[...projectSnapshots].reverse().map((snapshot) => <tr key={snapshot.id}><td><UiButton className="text-link flow-snapshot-id" onClick={() => setDetailId(snapshot.id)}>{snapshot.id}</UiButton><div className="muted flow-small">{snapshot.template?.title || '标准 RFQ 应答矩阵'} · {snapshot.template?.version || 'V2.1'}</div></td><td>{snapshot.rows?.length || 0}</td><td>{snapshot.createdBy}<div className="muted flow-small">{new Date(snapshot.createdAt).toLocaleString('zh-CN', { hour12: false })}</div></td><td><Badge value={snapshot.status} /></td><td><span className={validity(snapshot).valid ? 'flow-check-ok' : 'muted flow-small'}>{validity(snapshot).valid ? <><Check size={14} />当前有效</> : snapshot.stale ? '本轮已失效，请重新提交' : snapshot.status === '已批准' ? '工作版本已变化 / 不可重新导出' : '待批准后校验'}</span></td><td><div className="flow-inline-actions"><UiButton className="text-link" onClick={() => setDetailId(snapshot.id)}>{snapshot.status === '审批中' && canBusinessAction('snapshot',snapshot.id,'approve') ? '审批' : '查看'}</UiButton>{snapshot.status === '已批准' && <UiButton className="text-link" disabled={!canPerform(actorRole,'export:download')||!validity(snapshot).valid} onClick={() => startAction('formal', snapshot.id)}>正式导出</UiButton>}</div></td></tr>)}</tbody></BusinessTable></div>{!projectSnapshots.length && <NoRows title="尚未创建应答快照">完成检查后提交审批，系统将冻结本次条目及版本。</NoRows>}</>}
      {tab === '导出记录' && <><div className="panel-header"><h2>文件生成记录</h2><span className="muted flow-small">正式文件绑定实际批准快照</span></div><div className="table-wrap"><BusinessTable className="data-table"><thead><tr><th>文件名称</th><th>类型 / 结果</th><th>快照</th><th>生成时间 / 人员</th><th>操作</th></tr></thead><tbody>{history.slice((historyPage - 1) * 6, historyPage * 6).map((item) => { const snapshot = projectSnapshots.find((s) => s.id === item.snapshotId); return <tr key={item.id}><td className="flow-history-file"><FileText size={15} />{item.filename}<div className="muted flow-small">{item.template} · {item.rowCount} 条 · UTF-8 CSV</div></td><td><Badge value={item.type} /><div className="muted flow-small">{item.status}</div></td><td><span className="flow-small flow-snapshot-id">{item.snapshotId}</span>{snapshot && <div className={`flow-small ${validity(snapshot).valid ? 'flow-check-ok' : 'flow-red'}`}>{validity(snapshot).valid ? '当前可重新导出' : '历史记录：当前不可重新导出'}</div>}</td><td className="flow-nowrap">{item.createdAt}<div className="muted flow-small">{item.actor}</div></td><td>{snapshot ? <UiButton className="text-link" onClick={() => setDetailId(snapshot.id)}>文件包详情</UiButton> : <UiButton className="text-link" onClick={downloadDraft}>生成当前草稿</UiButton>}</td></tr>; })}</tbody></BusinessTable></div>{!history.length && <NoRows title="暂无导出记录">下载内部草稿或正式应答后，将生成可追溯记录。</NoRows>}<Pager count={history.length} page={historyPage} onChange={setHistoryPage} /></>}
    </section>
    <section className="panel" id="flow-export-checks"><div className="panel-header"><h2><ListChecks size={18} />提交与定稿检查</h2><UiButton className="btn btn-sm" onClick={() => { setChecked(true); toast(issues.length ? `检查完成：${issues.length} 个阻断项` : '全部检查通过，可提交快照审批'); }}><RefreshCw size={14} />重新检查</UiButton></div><div className="flow-check-summary"><span className={`flow-check-indicator ${issues.length ? 'warning' : 'success'}`}>{issues.length ? <AlertCircle size={21} /> : <ShieldCheck size={21} />}</span><div><strong>{issues.length ? `${issues.length} 个待修正项` : '当前工作版本检查通过'}</strong><p>人工确认 {requirements.filter(isConfirmed).length} / {requirements.length} 条 · 系统推荐 Comply 未人工确认 {unconfirmedComply.length} 条 · 未关闭事项 {reviews.filter((r) => !isClosed(r)).length} 个 · {checked ? '已重新核对当前版本' : '实时检查结果'}</p></div></div>{issues.length > 0 && <div className="flow-issue-list">{issues.map((issue, index) => <div className="flow-issue-row" key={`${issue.id}-${index}`}><AlertCircle size={15} /><div><strong>{issue.label}</strong><p>{issue.message}</p></div><UiButton className="text-link" onClick={() => goIssue(issue)}>前往修正<ArrowRight size={13} /></UiButton></div>)}</div>}<div className="flow-bottom-actions"><span className="muted">审批快照不可编辑；新工作版本需要重新提交和批准。</span><div className="flow-inline-actions"><UiButton className="btn" onClick={() => { setTab('审批与快照'); }}>查看快照</UiButton><UiButton className="btn btn-primary" disabled={!canPerform(actorRole,'export:download')||!downloadable} onClick={() => startAction('formal', downloadable?.id)}><Download size={16} />正式导出</UiButton></div></div></section>
    {detail && <Drawer title="应答快照 · 只读审批" width={1000} onClose={() => setDetailId(null)} footer={<><UiButton className="btn" onClick={() => setDetailId(null)}>返回列表</UiButton>{detail.status === '审批中' && <><UiButton className="btn btn-danger" disabled={!canBusinessAction('snapshot',detail.id,'approve')} onClick={() => startAction('reject', detail.id)}>退回</UiButton><UiButton className="btn btn-primary" disabled={!canBusinessAction('snapshot',detail.id,'approve')} onClick={() => startAction('approve', detail.id)}>通过本方评审</UiButton></>}{detail.status === '已批准' && <UiButton className="btn btn-primary" disabled={!canPerform(actorRole,'export:download')||!validity(detail).valid} onClick={() => startAction('formal', detail.id)}><Download size={15} />正式导出</UiButton>}</>}><UnconfirmedComplyList frozen rows={(detail.rows||[]).filter(row=>detail.unconfirmedComplyIds?.includes(row.id))}/><div className="flow-detail-top"><div><span className="muted flow-small">固定快照编号</span><h3 className="flow-snapshot-id">{detail.id}</h3></div><Badge value={detail.status} /></div><dl className="flow-description"><dt>提交人 / 时间</dt><dd>{detail.createdBy} / {new Date(detail.createdAt).toLocaleString('zh-CN', { hour12: false })}</dd><dt>模板版本</dt><dd>{detail.template?.title || '标准 RFQ 应答矩阵'} {detail.template?.version || 'V2.1'}</dd><dt>批准人</dt><dd>{detail.reviewedBy || '查看下方逐人评审记录'}</dd><dt>处理意见</dt><dd>{detail.reviewReason || detail.submissionReason || '—'}</dd><dt>外发附件</dt><dd>0 个；内部证据不自动作为对外附件</dd></dl><Notice type={detail.status === '已批准' && !validity(detail).valid ? 'warning' : 'info'}>{detail.stale ? '本轮快照已失效，请按当前人员与规则重新提交。' : detail.status === '已批准' ? validity(detail).message : '此处展示冻结快照，不随当前工作内容修改。当前身份：' + actorRole + '；SR与技术组均须通过。'}</Notice><FinalReviewProgress snapshot={detail} appState={appState}/><h4 className="flow-spaced">冻结应答内容（{detail.rows?.length || 0} 条）</h4>{snapshotTable(detail)}<h4 className="flow-spaced">审批与导出记录</h4><div className="flow-timeline">{(detail.history || []).map((entry, index) => <div className="flow-timeline-item" key={entry.id || index}><i /><strong>{entry.action}</strong><small>{entry.time} · {entry.actor}</small><p>{entry.reason}</p></div>)}{(detail.exports || []).map((record) => <div className="flow-timeline-item" key={record.id}><i /><strong>正式导出 CSV</strong><small>{record.createdAt} · {record.actor}</small><p>{record.filename}</p></div>)}</div></Drawer>}
    {actionDialog}
  </div>;
}

function FinalReviewProgress({snapshot,appState}){
 let required;try{required=getRequiredFinalReviewers(snapshot.finalReview);}catch{return <Notice>历史快照缺少SR与技术组完整评审记录；重新提交后才能按新规则正式导出。</Notice>;}
 return <section className="panel personnel-panel"><div className="panel-header"><h3>本轮逐人最终评审</h3><UiTag className="badge">{snapshot.finalReview.technicalMode==='all'?'技术组全员通过':'技术负责人代表通过'}</UiTag></div><div className="table-wrap"><BusinessTable className="data-table"><thead><tr><th>评审方</th><th>指定人员</th><th>结果</th><th>意见</th></tr></thead><tbody>{required.map(r=>{const vote=r.side==='sr'?snapshot.finalReview.decisions?.sr:snapshot.finalReview.decisions?.technicalByActorId?.[r.actorId];return <tr key={r.actorId}><td>{r.side==='sr'?'SR方':'技术方'}</td><td>{personName(appState,r.actorId)}</td><td>{vote?.result==='approved'?'已通过':vote?.result==='rejected'?'已退回':snapshot.stale?'本轮已失效':snapshot.status==='已退回'?'本轮已取消':'待评审'}</td><td>{vote?.reason||'—'}</td></tr>;})}</tbody></BusinessTable></div></section>;
}
