import { UiButton } from './AntContent';
import React, { useEffect, useRef, useState } from 'react';
import { Dropdown } from 'antd';
import { MessageSquarePlus, Minus, Plus, ExternalLink } from "./icons";
import { makeSourceAnchor, resolveSourceAnchor } from '../documentAnchors';
import { annotatedSegments, makeCommentDraft } from '../documentAnnotations';
import { sectionLabel } from '../documentStructure';
import WordAnnotationCanvas from './WordAnnotationCanvas';
import CraftSourcePane from './CraftSourcePane';
import { officeSourceKey } from '../officeClient';

function SourceExcerptPane({ file, rows, selectedAnchor, showResponses = true, responsePreview, quoteDraft, onSelectAnchor, onQuote, comments = [], activeCommentId, onSelectComment, focusOnMount = false }) {
  const resolved = resolveSourceAnchor(rows, selectedAnchor), active = resolved.row, container = useRef();
  const previousAnchor = useRef(null);
  const [pdf, setPdf] = useState(false), [zoom, setZoom] = useState(100);
  const [selectionError, setSelectionError] = useState('');
  const [contextComment, setContextComment] = useState(null);
  const canAnnotate = Boolean(onQuote) && resolved.status === 'resolved';
  const real = file?.realSource || active?.realSource;
  const word = /\.docx?$/i.test(file?.name || active?.source || '');
  useEffect(() => {
    const key = JSON.stringify([selectedAnchor.projectId, selectedAnchor.fileId, selectedAnchor.sourceVersion, selectedAnchor.requirementId]);
    if (previousAnchor.current === key) return;
    const initial = previousAnchor.current === null;
    previousAnchor.current = key;
    const selection = window.getSelection(), node = selection?.anchorNode;
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    const selectedSection = element?.closest('[data-source-id]');
    if (selectedSection && container.current?.contains(selectedSection) && selectedSection.dataset.sourceId !== selectedAnchor.requirementId) selection.removeAllRanges();
    setSelectionError('');
    if (initial && !focusOnMount) return;
    const target = container.current?.querySelector(`[data-source-id="${CSS.escape(selectedAnchor.requirementId)}"]`);
    if (target && container.current) container.current.scrollTo({ top: container.current.scrollTop + target.getBoundingClientRect().top - container.current.getBoundingClientRect().top - 50, behavior: 'smooth' });
  }, [selectedAnchor.projectId, selectedAnchor.fileId, selectedAnchor.requirementId, selectedAnchor.sourceVersion]);
  useEffect(() => { setPdf(false); }, [file?.id, selectedAnchor.fileId]);
  useEffect(() => {
    const target = activeCommentId && container.current?.querySelector(`[data-comment-ids~="${CSS.escape(activeCommentId)}"]`);
    if (target && container.current) container.current.scrollTo({ top: container.current.scrollTop + target.getBoundingClientRect().top - container.current.getBoundingClientRect().top - container.current.clientHeight / 2, behavior: 'smooth' });
  }, [activeCommentId]);

  function readSelectionDraft() {
    if (resolved.status !== 'resolved') return null;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0), root = container.current;
    if (!root?.contains(range.startContainer) && !root?.contains(range.endContainer)) return null;
    const element = node => node.nodeType === 1 ? node : node.parentElement;
    const textElement = element(range.startContainer)?.closest('[data-source-part]');
    if (!textElement || !root.contains(textElement) || !textElement.contains(range.endContainer)) return { invalid: true };
    const rowId = textElement.closest('[data-source-id]')?.dataset.sourceId;
    const row = rows.find(item => item.id === rowId);
    if (!row) return { invalid: true };
    const quote = range.toString();
    if (!quote.trim() || quote.length > 2000) return { invalid: true };
    const prefix = range.cloneRange(); prefix.selectNodeContents(textElement); prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    const anchor = makeSourceAnchor(row);
    return { row, draft: { quote, anchor: { ...anchor, locator: { ...anchor.locator, quote, textPart: textElement.dataset.sourcePart, textRange: { start, end: start + quote.length } } } } };
  }

  function captureSelection(event) {
    if (!onQuote || event.button !== 0) return;
    const selected = readSelectionDraft();
    setSelectionError(selected?.invalid ? '请在同一条款的编号、标题或正文内选择文字。' : '');
    if (selected?.draft) onQuote(selected.draft.quote, selected.draft.anchor);
  }

  function startNewComment() {
    if (!onQuote || !active || resolved.status !== 'resolved') return;
    const selected = readSelectionDraft();
    if (selected?.invalid) { setSelectionError('请在同一条款的编号、标题或正文内选择文字。'); return; }
    setSelectionError('');
    const draft = makeCommentDraft(selected?.row || active, selected?.draft || quoteDraft);
    onQuote(draft.quote, draft.anchor);
  }

  function captureContextComment(row) {
    if (!canAnnotate) return;
    const selected = readSelectionDraft();
    setSelectionError(selected?.invalid ? '请在同一条款的编号、标题或正文内选择文字。' : '');
    // Capture before the menu takes focus; an earlier selection on another row
    // must not override the clause that was actually right-clicked.
    setContextComment({
      rowId: row.id,
      draft: selected?.invalid ? null : makeCommentDraft(row, selected?.row.id === row.id ? selected.draft : undefined),
    });
  }

  function addContextComment(row) {
    if (!canAnnotate || contextComment?.rowId !== row.id || !contextComment.draft) return;
    const draft = makeCommentDraft(row, contextComment.draft);
    setContextComment(null);
    onQuote(draft.quote, draft.anchor);
  }

  function renderSourcePart(row, part) {
    return annotatedSegments(row, comments, activeCommentId, part).map(segment => segment.commentIds.length ? <mark key={segment.start} data-comment-ids={segment.commentIds.join(' ')} className={`word-comment-highlight ${segment.commentIds.includes(activeCommentId) ? 'selected' : ''}`} onClick={event => { event.stopPropagation(); if (window.getSelection()?.toString()) return; onSelectComment?.(segment.activeId, makeSourceAnchor(row)); }}>{segment.text}</mark> : <React.Fragment key={segment.start}>{segment.text}</React.Fragment>);
  }

  return <section className="source-document detail-source" aria-label="来源原文">
    <div className="detail-source-toolbar"><div><span className="detail-word-icon">W</span><span><strong>{file?.name || active?.source || '来源文档'}</strong><small>{real ? '真实 PDF 原文' : word ? 'Word 示例摘录' : '项目条款摘录'} · {selectedAnchor.sourceVersion}</small></span></div><div className="detail-source-actions">
      <UiButton className="icon-btn" aria-label="缩小原文" disabled={zoom <= 80} onClick={() => setZoom(z => z - 10)}><Minus size={14}/></UiButton><span>{zoom}%</span><UiButton className="icon-btn" aria-label="放大原文" disabled={zoom >= 140} onClick={() => setZoom(z => z + 10)}><Plus size={14}/></UiButton>
      {real && <UiButton className="text-link" onClick={() => setPdf(!pdf)}>{pdf ? '返回条款' : '原始 PDF'}<ExternalLink size={13}/></UiButton>}
    </div></div>
    {resolved.status !== 'resolved' && <div className="response-notice response-notice-warning">{resolved.status === 'stale' ? '当前定位属于旧文件版本，请核对新版本后重新定位。' : '找不到该条款原文，请核对来源文件。'}</div>}
    {pdf && real ? <iframe className="source-pdf" title="原始 RFQ PDF" src={active?.sourceUrl || file?.localUrl}/> : <div className="source-document-scroll" ref={container}>
      <WordAnnotationCanvas rows={rows} responsePreview={responsePreview} activeId={active?.id}
        title={(file?.name || active?.source || '客户要求').replace(/\.[^.]+$/, '')}
        version={selectedAnchor.sourceVersion} subtitle={`客户 RFQ · ${word ? '技术要求' : '要求来源'}`}
        footer={real ? '原文节选 · 完整内容以客户原件为准' : '当前为项目条款摘录，未读取上传 Word 的完整排版'}
        showAnnotations={showResponses} zoom={zoom}
        onSelectRow={row => onSelectAnchor(makeSourceAnchor(row))}
        onNewComment={onQuote ? startNewComment : undefined}
        onDiscuss={onQuote ? row => onQuote(row.sourceOriginal ?? row.original, makeSourceAnchor(row)) : undefined}
      >{anchorProps => rows.map((row, i) => <React.Fragment key={row.id}>
        {(i === 0 || sectionLabel(rows[i - 1]) !== sectionLabel(row)) && <h2 className="word-section-heading">{sectionLabel(row) === '未识别章节' ? '客户要求' : sectionLabel(row)}<span className="wc-format" aria-hidden="true"> ↵</span></h2>}
        <Dropdown trigger={['contextMenu']} disabled={!canAnnotate}
          onOpenChange={open => { if (!open) setContextComment(null); }}
          menu={{ items: [{ key: 'comment', label: '新建批注', icon: <MessageSquarePlus size={14}/>, disabled: contextComment?.rowId !== row.id || !contextComment?.draft }], onClick: ({ domEvent }) => { domEvent.stopPropagation(); addContextComment(row); } }}>
        <section data-source-id={row.id} className={`source-paragraph ${row.id === active?.id && resolved.status === 'resolved' ? 'active' : ''}`} onClick={() => { if (!window.getSelection()?.toString()) onSelectAnchor(makeSourceAnchor(row)); }} onMouseUp={captureSelection} onContextMenu={() => captureContextComment(row)}>
          <div><b><span data-source-part="heading">{renderSourcePart(row, 'heading')}</span><span className="wc-format" aria-hidden="true"> ↵</span></b><small>第 {row.sourcePage || '—'} 页</small></div>
          <p><span data-source-text data-source-part="body" {...anchorProps(row)}>{renderSourcePart(row, 'body')}</span><span className="wc-format" aria-hidden="true"> ↵</span></p>
        </section>
        </Dropdown>
      </React.Fragment>)}</WordAnnotationCanvas>
    </div>}
    <div className="source-quote-toolbar"><span>{rows.length} 条要求 · {comments.filter(c => c.anchor?.fileId === selectedAnchor.fileId && String(c.anchor.sourceVersion) === String(selectedAnchor.sourceVersion)).length} 条批注</span>{onQuote && <UiButton className="text-link" disabled={resolved.status !== 'resolved'} onClick={() => onQuote(active?.sourceOriginal || active?.original, selectedAnchor)}><MessageSquarePlus size={14}/>批注当前条款</UiButton>}<span role={selectionError ? 'status' : undefined}>{selectionError || '选中文字或右键原文可添加批注'}</span></div>
  </section>;
}

export default function SourceDocumentPane(props) {
  const source={projectId:props.selectedAnchor.projectId,fileId:props.selectedAnchor.fileId,sourceVersion:props.selectedAnchor.sourceVersion};
  return <CraftSourcePane showResponses={props.showResponses} responsePreview={props.responsePreview} onQuote={props.onQuote} key={officeSourceKey(source,`${props.officeUser?.id}:${props.canManageOffice}`)} file={props.file} source={source} canManage={Boolean(props.canManageOffice)} user={props.officeUser} rows={props.rows} selectedAnchor={props.selectedAnchor} onSelectAnchor={props.onSelectAnchor} allComments={props.allComments||props.comments} people={props.people} canEditRow={props.canEditRow} onProjectCommentsChange={props.onProjectCommentsChange} activeCommentId={props.activeCommentId} onSelectComment={props.onSelectComment}>
    <SourceExcerptPane {...props}/>
  </CraftSourcePane>;
}
