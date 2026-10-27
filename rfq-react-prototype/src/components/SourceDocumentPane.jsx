import React, { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, Minus, Plus, ExternalLink } from 'lucide-react';
import { makeSourceAnchor, resolveSourceAnchor } from '../documentAnchors';
import { annotatedSegments } from '../documentAnnotations';
import { sectionLabel } from '../documentStructure';
import WordAnnotationCanvas from './WordAnnotationCanvas';

export default function SourceDocumentPane({ file, rows, selectedAnchor, showResponses = true, responsePreview, onSelectAnchor, onQuote, comments = [], activeCommentId, onSelectComment, focusOnMount = false }) {
  const resolved = resolveSourceAnchor(rows, selectedAnchor), active = resolved.row, container = useRef();
  const previousAnchor = useRef(null);
  const [pdf, setPdf] = useState(false), [zoom, setZoom] = useState(100);
  const real = file?.realSource || active?.realSource;
  const word = /\.docx?$/i.test(file?.name || active?.source || '');
  useEffect(() => {
    if (previousAnchor.current === selectedAnchor.requirementId) return;
    const initial = previousAnchor.current === null;
    previousAnchor.current = selectedAnchor.requirementId;
    if (initial && !focusOnMount) return;
    const target = container.current?.querySelector(`[data-source-id="${CSS.escape(selectedAnchor.requirementId)}"]`);
    if (target && container.current) container.current.scrollTo({ top: container.current.scrollTop + target.getBoundingClientRect().top - container.current.getBoundingClientRect().top - 50, behavior: 'smooth' });
  }, [selectedAnchor.requirementId, selectedAnchor.sourceVersion]);
  useEffect(() => { setPdf(false); }, [file?.id, selectedAnchor.fileId]);
  useEffect(() => {
    const target = activeCommentId && container.current?.querySelector(`[data-comment-ids~="${CSS.escape(activeCommentId)}"]`);
    if (target && container.current) container.current.scrollTo({ top: container.current.scrollTop + target.getBoundingClientRect().top - container.current.getBoundingClientRect().top - container.current.clientHeight / 2, behavior: 'smooth' });
  }, [activeCommentId]);

  function captureSelection(row) {
    if (!onQuote || resolved.status !== 'resolved') return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0), article = container.current?.querySelector(`[data-source-id="${CSS.escape(row.id)}"]`), textElement = article?.querySelector('[data-source-text]');
    if (!textElement?.contains(range.startContainer) || !textElement.contains(range.endContainer)) return;
    const quote = range.toString();
    if (!quote.trim() || quote.length > 2000) return;
    const prefix = range.cloneRange(); prefix.selectNodeContents(textElement); prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    const anchor = makeSourceAnchor(row);
    onQuote(quote, { ...anchor, locator: { ...anchor.locator, quote, textRange: { start, end: start + quote.length } } });
  }

  return <section className="source-document detail-source" aria-label="来源原文">
    <div className="detail-source-toolbar"><div><span className="detail-word-icon">W</span><span><strong>{file?.name || active?.source || '来源文档'}</strong><small>{real ? '真实 PDF 原文' : word ? 'Word 示例摘录' : '项目条款摘录'} · {selectedAnchor.sourceVersion}</small></span></div><div className="detail-source-actions">
      <button className="icon-btn" aria-label="缩小原文" disabled={zoom <= 80} onClick={() => setZoom(z => z - 10)}><Minus size={14}/></button><span>{zoom}%</span><button className="icon-btn" aria-label="放大原文" disabled={zoom >= 140} onClick={() => setZoom(z => z + 10)}><Plus size={14}/></button>
      {real && <button className="text-link" onClick={() => setPdf(!pdf)}>{pdf ? '返回条款' : '原始 PDF'}<ExternalLink size={13}/></button>}
    </div></div>
    {resolved.status !== 'resolved' && <div className="response-notice response-notice-warning">{resolved.status === 'stale' ? '当前定位属于旧文件版本，请核对新版本后重新定位。' : '找不到该条款原文，请核对来源文件。'}</div>}
    {pdf && real ? <iframe className="source-pdf" title="原始 RFQ PDF" src={active?.sourceUrl || file?.localUrl}/> : <div className="source-document-scroll" ref={container}>
      <WordAnnotationCanvas rows={rows} responsePreview={responsePreview} activeId={active?.id}
        title={(file?.name || active?.source || '客户要求').replace(/\.[^.]+$/, '')}
        version={selectedAnchor.sourceVersion} subtitle={`客户 RFQ · ${word ? '技术要求' : '要求来源'}`}
        footer={real ? '原文节选 · 完整内容以客户原件为准' : '当前为项目条款摘录，未读取上传 Word 的完整排版'}
        showAnnotations={showResponses} zoom={zoom}
        onSelectRow={row => onSelectAnchor(makeSourceAnchor(row))}
        onDiscuss={onQuote ? row => onQuote(row.sourceOriginal ?? row.original, makeSourceAnchor(row)) : undefined}
      >{anchorProps => rows.map((row, i) => <React.Fragment key={row.id}>
        {(i === 0 || sectionLabel(rows[i - 1]) !== sectionLabel(row)) && <h2 className="word-section-heading">{sectionLabel(row) === '未识别章节' ? '客户要求' : sectionLabel(row)}<span className="wc-format" aria-hidden="true"> ↵</span></h2>}
        <section data-source-id={row.id} className={`source-paragraph ${row.id === active?.id && resolved.status === 'resolved' ? 'active' : ''}`} onClick={() => { if (!window.getSelection()?.toString()) onSelectAnchor(makeSourceAnchor(row)); }} onMouseUp={() => captureSelection(row)}>
          <div><b>{row.clause || '无编号'}　{row.title}<span className="wc-format" aria-hidden="true"> ↵</span></b><small>第 {row.sourcePage || '—'} 页</small></div>
          <p><span data-source-text {...anchorProps(row)}>{annotatedSegments(row, comments, activeCommentId).map(segment => segment.commentIds.length ? <mark key={segment.start} data-comment-ids={segment.commentIds.join(' ')} className={`word-comment-highlight ${segment.commentIds.includes(activeCommentId) ? 'selected' : ''}`} onClick={event => { event.stopPropagation(); if (window.getSelection()?.toString()) return; onSelectComment?.(segment.activeId, makeSourceAnchor(row)); }}>{segment.text}</mark> : <React.Fragment key={segment.start}>{segment.text}</React.Fragment>)}</span><span className="wc-format" aria-hidden="true"> ↵</span></p>
        </section>
      </React.Fragment>)}</WordAnnotationCanvas>
    </div>}
    <div className="source-quote-toolbar"><span>{rows.length} 条要求 · {comments.filter(c => c.anchor?.fileId === selectedAnchor.fileId && String(c.anchor.sourceVersion) === String(selectedAnchor.sourceVersion)).length} 条批注</span>{onQuote && <button className="text-link" disabled={resolved.status !== 'resolved'} onClick={() => onQuote(active?.sourceOriginal || active?.original, selectedAnchor)}><MessageSquarePlus size={14}/>批注当前条款</button>}<span>选中文字可添加批注</span></div>
  </section>;
}
