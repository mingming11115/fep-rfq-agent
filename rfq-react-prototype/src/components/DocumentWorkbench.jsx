import React, { useEffect, useState } from 'react';
import { FileText, RefreshCw, ChevronLeft, ChevronRight, Search, PencilLine, CheckCircle2, AlertCircle, Plus, ArrowRight } from 'lucide-react';
import { Modal, StatusBadge } from './ui';
import './document-workbench.css';
import { documentSections, sectionLabel } from '../documentStructure';
import WordAnnotationCanvas from './WordAnnotationCanvas';

function CorrectionForm({ row, onSave, onCancel }) {
  const [form, setForm] = useState({ clause: row.clause, title: row.title, original: row.original, sourcePage: row.sourcePage || 1 });
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const field = (key, label, area = false) => <label className={area ? 'dw-field dw-wide' : 'dw-field'}><span>{label}</span>{area ? <textarea className="input" aria-label={label} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}/> : <input className="input" aria-label={label} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}/>}</label>;
  return <form className="dw-correction" onSubmit={(e) => { e.preventDefault(); const result = onSave(row, form, reason); if (typeof result === 'string') setError(result); }}>
    <div className="dw-section-heading"><strong>修改抽取字段</strong><span>条款 {row.clause}</span></div>
    <p>修改会同步到细则比对，保留已有答复，受影响的条目需重新复核。</p>
    <div className="dw-fields">{field('clause', '条款编号')}{field('sourcePage', '来源页码 / 工作表')}{field('title', '条目标题')}{field('original', '抽取的要求内容', true)}<label className="dw-field dw-wide"><span>修改原因</span><textarea className="input" aria-label="字段修改原因" placeholder="例如：修正识别错误或原始编号" value={reason} onChange={(e) => setReason(e.target.value)}/></label></div>
    {error && <p className="dw-error" role="alert">{error}</p>}
    <div className="dw-edit-actions"><button type="button" className="btn" onClick={onCancel}>取消修改</button><button className="btn btn-primary" type="submit">保存字段</button></div>
  </form>;
}

export default function DocumentWorkbench({readOnly=false, files, rows, responseRows = [], imported, selectedId, onSelect, onCorrect, onReparse, onSupplement, onContinue }) {
  const [fileId, setFileId] = useState(() => rows[0]?.sourceFileId || files.find((f) => f.purpose === '要求来源')?.id || files[0]?.id || '');
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('');
  const [editing, setEditing] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const selected = rows.find((row) => row.id === selectedId);
  const file = files.find((f) => f.id === fileId) || files.find((f) => f.id === selected?.sourceFileId) || files[0];
  const fileRows = rows.filter((row) => row.sourceFileId === file?.id || (!row.sourceFileId && row.source === file?.name));
  const active = fileRows.find((row) => row.id === selectedId) || fileRows[0];
  const pages = [...new Set(fileRows.map((row) => String(row.sourcePage || 1)))];
  const [previewPage, setPreviewPage] = useState(null);
  const page = previewPage && pages.includes(previewPage) ? previewPage : String(active?.sourcePage || pages[0] || 1);
  const sections = documentSections(fileRows.map(row => ({ ...row, sourceFileId: file?.id })), file?.id);
  const currentSection = sections.find(item => item.key === section);
  const shown = fileRows.filter((row) => `${sectionLabel(row)} ${row.clause} ${row.title} ${row.original}`.toLowerCase().includes(query.toLowerCase()) && (!currentSection || currentSection.rowIds.includes(row.id)));
  const busy = ['排队中', '处理中'].includes(file?.status);
  const pageRows = fileRows.filter(row => String(row.sourcePage || 1) === page);
  const follow = (action) => { if (editing) { setPendingAction(() => action); return false; } action(); return true; };
  useEffect(() => {
    if (!editing) return;
    const previous = window.__rfqRequestNavigation;
    const guard = (action) => { setPendingAction(() => () => { if (!previous || previous(action)) action(); }); return false; };
    const unload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.__rfqRequestNavigation = guard;
    window.addEventListener('beforeunload', unload);
    return () => { if (window.__rfqRequestNavigation === guard) { if (previous) window.__rfqRequestNavigation = previous; else delete window.__rfqRequestNavigation; } window.removeEventListener('beforeunload', unload); };
  }, [editing]);
  useEffect(() => {
    if (selected?.sourceFileId && selected.sourceFileId !== fileId) { setFileId(selected.sourceFileId); setPreviewPage(null); setSection(''); setQuery(''); }
  }, [selectedId]);
  function changeFile(id) { follow(() => { setFileId(id); setPreviewPage(null); setQuery(''); setSection(''); onSelect(rows.find((row) => row.sourceFileId === id)?.id || null); }); }
  function save(row, patch, reason) { const result = onCorrect(row, patch, reason); if (typeof result === 'string') return result; setEditing(null); setPreviewPage(null); }
  return <section className="panel dw-workbench" aria-label="文档与解析结果">
    <div className="dw-toolbar"><div className="dw-file-picker"><FileText size={20}/><div><label htmlFor="dw-source-file">当前文档</label><select id="dw-source-file" aria-label="当前解析文档" value={file?.id || ''} onChange={(e) => changeFile(e.target.value)}>{files.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.version}</option>)}</select></div></div><div className="dw-toolbar-actions"><StatusBadge status={file?.status === '完成' ? '解析完成' : file?.status || '尚未上传'}/><button className="btn btn-sm" disabled={readOnly || !file || busy || file.purpose !== '要求来源'} onClick={() => follow(() => onReparse(file))}><RefreshCw size={14} className={busy ? 'dw-spinning' : ''}/>{busy ? '解析中' : file?.status === '失败' ? '重新尝试' : '重新解析'}</button></div></div>
    <div className={`dw-status ${file?.status === '失败' ? 'dw-status-error' : ''}`} role="status">{file?.status === '失败' ? <AlertCircle size={17}/> : busy ? <RefreshCw size={17} className="dw-spinning"/> : <CheckCircle2 size={17}/>}<div><strong>{file?.status === '失败' ? '解析未完成' : busy ? file.status === '排队中' ? '文件已入队，等待解析' : '正在识别文档并抽取条款' : file?.purpose !== '要求来源' ? '资料已登记' : '解析条款已自动同步'}</strong><span>{file?.status === '失败' ? file.error : busy ? '完成后自动进入 RFQ细则比对，无需确认导入。' : file?.purpose !== '要求来源' ? '补充附件和应答模板不生成要求条目。' : `${fileRows.filter((row) => imported.has(row.id)).length} / ${fileRows.length} 条已导入 · ${file?.parsedAt ? `最近解析 ${file.parsedAt}` : '支持随时修正抽取字段'}`}</span></div></div>
    <div className="dw-layout"><nav className="dw-outline" aria-label="本份 RFQ 原始章节"><h2>原始章节</h2><button className={!section ? 'active' : ''} onClick={() => follow(() => { setSection(''); setQuery(''); })}>全部条款 <span>{fileRows.length}</span></button>{sections.map(item => <button key={item.key} className={section === item.key ? 'active' : ''} style={{ paddingLeft: 12 + Math.max(0, item.path.length - 1) * 12 }} onClick={() => follow(() => { setSection(item.key); setQuery(''); const first = fileRows.find(row => item.rowIds.includes(row.id)); onSelect(first?.id); setPreviewPage(null); })}><span>{item.path.at(-1) || '未识别章节'}</span><small>{item.rowIds.length}</small></button>)}{!sections.length && <p>完成解析后显示本文件目录</p>}</nav><div className="dw-split">
      <section className="dw-original" aria-label="文档原文预览"><div className="dw-pane-heading"><h2><FileText size={16}/>文档原文</h2><span className="dw-demo-label">{file?.realSource ? '真实PDF · 英文摘录' : '模拟预览'}</span></div><div className="dw-page-controls"><div><button className="icon-btn" aria-label="上一来源页" disabled={pages.indexOf(page) <= 0} onClick={() => setPreviewPage(pages[pages.indexOf(page) - 1])}><ChevronLeft size={15}/></button><select aria-label="预览来源页" value={page} onChange={(e) => setPreviewPage(e.target.value)}>{(pages.length ? pages : ['1']).map((p) => <option key={p} value={p}>第 {p} 页 / 定位</option>)}</select><button className="icon-btn" aria-label="下一来源页" disabled={pages.indexOf(page) >= pages.length - 1} onClick={() => setPreviewPage(pages[pages.indexOf(page) + 1])}><ChevronRight size={15}/></button></div></div>
        <div className="dw-paper-scroll">{file?.realSource && <div style={{padding: '12px 16px'}}><a className="text-link" href={`${file.localUrl}#page=${page}`} target="_blank" rel="noreferrer">打开原始PDF · 第 {page} 页 ↗</a><span style={{margin: '0 12px'}}>·</span><a className="text-link" href={file.originalUrl} target="_blank" rel="noreferrer">BHEL官网来源 ↗</a><iframe key={page} title={`BHEL原始PDF第${page}页`} src={`${file.localUrl}#page=${page}&view=FitH`} style={{width: '100%', height: 480, border: '1px solid #e2e8f0', marginTop: 12}} /></div>}<WordAnnotationCanvas rows={pageRows} responseRows={responseRows} activeId={active?.id} title={file?.name || '尚无文档'} version={`${file?.version || ''} / 第 ${page} 页`} subtitle={file?.realSource ? '客户采购文件 · 英文原文节选' : '客户采购文件 · 示例摘录'} footer={file?.realSource ? '摘录来自BHEL原始PDF；中文为译文，页码为PDF实际页序。原文冲突保留并发起澄清。' : '此处为模拟原文摘录，未读取本地文件内容'} onSelectRow={row => follow(() => { setPreviewPage(null); onSelect(row.id); })} onOpen={row => follow(() => onContinue(row.id))}>{anchorProps => <>{pageRows.map(row => <button key={row.id} className={`dw-source-block ${row.id === active?.id ? 'active' : ''}`} onClick={() => follow(() => { setPreviewPage(null); onSelect(row.id); })}><span>{row.clause}　{row.title}<span className="wc-format" aria-hidden="true"> ↵</span></span><p><span data-source-text {...anchorProps(row)}>{row.sourceOriginal ?? row.original}</span><span className="wc-format" aria-hidden="true"> ↵</span></p><small>{row.id === active?.id ? '对应右侧条款' : '点击定位抽取条款'}</small></button>)}{!fileRows.length && <div className="dw-paper-empty"><FileText size={36}/><strong>{busy ? '文档处理中' : file?.status === '失败' ? '暂时无法生成摘录' : '暂无要求摘录'}</strong><p>{busy ? '条款抽取完成后在这里显示对应来源。' : '可重试解析，或补录要求条目。'}</p></div>}</>}</WordAnnotationCanvas></div>
      </section>
      <section className="dw-results" aria-label="抽取条款"><div className="dw-pane-heading"><h2>抽取条款 <span>{fileRows.length}</span></h2><button className="text-link" disabled={readOnly} onClick={() => {if(!readOnly)follow(() => onSupplement(file));}}><Plus size={14}/>补录</button></div>{editing && !readOnly ? <CorrectionForm key={editing.id} row={editing} onSave={save} onCancel={() => follow(() => setEditing(null))}/> : <><div className="dw-result-tools"><label><Search size={15}/><input className="input" aria-label="搜索抽取条款" placeholder="搜索章节、条款或内容" value={query} onChange={(e) => setQuery(e.target.value)}/></label></div><div className="dw-result-list">{shown.map((row) => <article key={row.id} className={`dw-result-card ${row.id === active?.id ? 'active' : ''}`}><button className="dw-result-title" disabled={!imported.has(row.id)} onClick={() => follow(() => onContinue(row.id))}><span>{row.clause || "无编号"}</span><strong>{row.title}</strong><ArrowRight size={14}/></button><div className="dw-result-meta"><span>{sectionLabel(row)}</span><span>来源：第 {row.sourcePage || 1} 页</span><span className="dw-synced">{imported.has(row.id) ? '已自动导入' : '同步中'}</span></div><p>{row.original}</p><div className="dw-card-actions"><small>{row.sourceCorrected ? '已修改 · 原文摘录保留' : file?.realSource ? '真实要求 · 中文译文' : '模拟抽取结果'}</small><button className="text-link" onClick={() => { onSelect(row.id); setPreviewPage(null); }}>定位原文</button><button className="text-link" disabled={readOnly} onClick={() => { if(readOnly)return;onSelect(row.id); setPreviewPage(null); setEditing(row); }}><PencilLine size={13}/>修改字段</button></div></article>)}{!shown.length && <div className="dw-results-empty"><ListEmpty/><strong>{fileRows.length ? '没有匹配的条款' : busy ? '正在抽取条款' : '暂无解析结果'}</strong><p>{fileRows.length ? '调整搜索关键词或章节。' : '可重新解析，或使用补录入口添加要求。'}</p></div>}</div></>}
      </section>
    </div></div><div className="dw-footer"><button className="btn btn-primary" disabled={!active || !imported.has(active.id)} onClick={() => follow(() => onContinue(active.id))}>进入 RFQ细则比对<ArrowRight size={15}/></button></div>
    {pendingAction && <Modal title="抽取字段尚未保存" onClose={() => setPendingAction(null)} footer={<><button className="btn" onClick={() => setPendingAction(null)}>继续编辑</button><button className="btn btn-primary" onClick={() => { const action = pendingAction; setEditing(null); setPendingAction(null); action(); }}>放弃修改</button></>}><p>离开会丢失本次字段修改，已导入的条款保持不变。</p></Modal>}
  </section>;
}
function ListEmpty() { return <FileText size={32}/>; }
