import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, MessageSquarePlus } from 'lucide-react';
import { buildSourceResponseAnnotation } from '../responseAdvice';
import SourceResponseAnnotation from './SourceResponseAnnotation';
import './source-response-annotation.css';

const palette = [
  { '--wc-color': '#6633a4', '--wc-fill': '#d9c6ec' },
  { '--wc-color': '#df3540', '--wc-fill': '#f8d9db' },
  { '--wc-color': '#008cf0', '--wc-fill': '#d1e9fa' },
];
const noResponses = [];

export default function WordAnnotationCanvas({ rows, responseRows = noResponses, responsePreview, activeId, title, version, subtitle, footer, showAnnotations = true, zoom = 100, onSelectRow, onNewComment, onDiscuss, onOpen, children }) {
  const root = useRef(null);
  const [formatting, setFormatting] = useState(true), [paths, setPaths] = useState([]);
  const notes = useMemo(() => {
    const responses = new Map(responseRows.map(row => [row.id, row]));
    return rows.map((row, index) => ({
      row, color: palette[index % palette.length],
      annotation: buildSourceResponseAnnotation(row, responsePreview?.id === row.id ? responsePreview : responses.get(row.id)),
    }));
  }, [rows, responseRows, responsePreview]);
  const byId = new Map(notes.map(note => [note.row.id, note]));
  const current = rows.find(row => row.id === activeId) || rows[0];
  const currentIndex = rows.indexOf(current);
  const select = row => { if (row && row.id !== activeId) onSelectRow?.(row); };
  const anchorProps = row => ({
    'data-response-anchor': row.id,
    className: showAnnotations ? `wc-anchor${row.id === current?.id ? ' wc-anchor-active' : ''}` : undefined,
    style: byId.get(row.id)?.color,
  });

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    if (!showAnnotations) { setPaths([]); return; }
    let frame, disposed = false;
    const layout = () => {
      const canvas = element.querySelector('.wc-canvas'), page = element.querySelector('.wc-page'), margin = element.querySelector('.wc-margin');
      if (!canvas || !page || !margin) return;
      const base = canvas.getBoundingClientRect(), pageRect = page.getBoundingClientRect(), marginRect = margin.getBoundingClientRect();
      const narrow = marginRect.left < pageRect.right - 1;
      if (narrow) {
        margin.style.minHeight = '0px';
        element.querySelectorAll('[data-response-note]').forEach(note => { note.style.top = ''; });
        setPaths(previous => previous.length ? [] : previous);
        return;
      }
      const entries = notes.map(note => {
        const anchor = element.querySelector(`[data-response-anchor="${CSS.escape(note.row.id)}"]`);
        const box = element.querySelector(`[data-response-note="${CSS.escape(note.row.id)}"]`);
        if (!anchor || !box) return null;
        const range = document.createRange(); range.selectNodeContents(anchor);
        const rects = [...range.getClientRects()];
        return rects.length ? { ...note, box, rect: rects.at(-1) } : null;
      }).filter(Boolean).sort((a, b) => a.rect.top - b.rect.top);
      let bottom = 0;
      for (const entry of entries) {
        const desired = entry.rect.top - marginRect.top - (entry.row.id === current?.id ? 40 : 14);
        const top = Math.max(12, desired, bottom);
        entry.box.style.top = `${Math.round(top)}px`;
        bottom = top + entry.box.offsetHeight + 3;
      }
      const content = element.querySelector('[data-word-page-content]').getBoundingClientRect();
      const style = getComputedStyle(page);
      const contentHeight = Math.max(parseFloat(style.minHeight) || 0, content.bottom - pageRect.top + parseFloat(style.paddingBottom));
      margin.style.minHeight = `${Math.ceil(Math.max(contentHeight, bottom + 22))}px`;
      const next = entries.map(entry => {
        const box = entry.box.getBoundingClientRect(), x = entry.rect.right - base.left, y = entry.rect.top - base.top;
        const edge = marginRect.left - base.left, target = box.top - base.top + Math.min(19, box.height / 2);
        const elbow = Math.max(x, pageRect.right - base.left - 68);
        return { id: entry.row.id, d: `M ${x.toFixed(1)} ${y.toFixed(1)} H ${elbow.toFixed(1)} L ${edge.toFixed(1)} ${target.toFixed(1)}`, color: entry.color['--wc-color'], active: entry.row.id === current?.id };
      });
      setPaths(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const schedule = () => { if (disposed) return; cancelAnimationFrame(frame); frame = requestAnimationFrame(layout); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    observer.observe(element.querySelector('[data-word-page-content]'));
    element.querySelectorAll('[data-response-note]').forEach(note => observer.observe(note));
    window.addEventListener('resize', schedule);
    document.fonts?.ready.then(schedule);
    schedule();
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', schedule); };
  }, [notes, current?.id, showAnnotations, formatting, zoom]);

  return <div ref={root} className={`word-classic-document project-word-document${formatting ? '' : ' wc-hide-format'}`}>
    <link rel="stylesheet" href={`${import.meta.env.BASE_URL}word-comments.css`} precedence="word-annotations"/>
    <div className="wc-tools" aria-label="原文应答批注工具栏">
      <span className="wc-file">应答批注 · {rows.length} 条</span>
      {onNewComment && <button type="button" className="wc-button" disabled={!current} onMouseDown={event => event.preventDefault()} onClick={onNewComment}><MessageSquarePlus size={14}/>新建批注</button>}
      <button type="button" className="wc-button" aria-label="上一条应答标注" disabled={currentIndex <= 0} onClick={() => select(rows[currentIndex - 1])}><ChevronUp size={14}/></button>
      <button type="button" className="wc-button" aria-label="下一条应答标注" disabled={currentIndex < 0 || currentIndex >= rows.length - 1} onClick={() => select(rows[currentIndex + 1])}><ChevronDown size={14}/></button>
      <button type="button" className="wc-button" aria-label="显示编辑标记" aria-pressed={formatting} onClick={() => setFormatting(!formatting)}>¶</button>
    </div>
    <div className={`wc-canvas${showAnnotations ? '' : ' wc-without-annotations'}`}>
      <article className="wc-page source-paper word-paper" style={{ '--document-zoom': zoom / 100 }}>
        <div data-word-page-content>
          <header className="wc-doc-head"><span>{subtitle}</span><span>{version}<span className="wc-format" aria-hidden="true"> ↵</span></span></header>
          <h1>{title}<span className="wc-format" aria-hidden="true"> ↵</span></h1>
          {children(anchorProps)}
          {footer && <footer className="wc-project-footer">{footer}</footer>}
        </div>
      </article>
      {showAnnotations && <>
        <aside className="wc-margin" aria-label="与原文对应的应答批注">
          {notes.map(note => <SourceResponseAnnotation key={note.row.id} {...note} active={note.row.id === current?.id} onSelect={select} onDiscuss={onDiscuss} onOpen={onOpen}/>)}
        </aside>
        <svg className="wc-connectors" aria-label="原文与应答批注的彩色连接线">
          {paths.map(path => <path key={path.id} data-response-link={path.id} d={path.d} fill="none" stroke={path.color} strokeWidth="1.15" strokeDasharray={path.active ? undefined : '4 4'}/>)}
        </svg>
      </>}
    </div>
  </div>;
}
