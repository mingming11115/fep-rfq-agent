import React, { useState } from 'react';
import { CornerUpLeft, Ellipsis } from "./icons";

export default function SourceResponseAnnotation({ row, annotation, color, active, onSelect, onDiscuss, onOpen, showQuote = true }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const select = () => { setMenuOpen(false); onSelect?.(row); };
  return <section
    className={`wc-note source-response-annotation source-response-${annotation.kind}${active ? ' wc-note-active' : ''}`}
    style={color} data-response-note={row.id} data-conclusion={annotation.conclusion}
    aria-label={`${row.clause || row.title || '当前条款'} 应答标注`}
    onClick={event => { if (!event.target.closest('button') && !window.getSelection()?.toString()) { select(); } }}
  >
    <div className="wc-note-head">
      {onDiscuss && <button type="button" className="wc-icon" aria-label={`讨论条款 ${row.clause || row.title}`} onClick={() => onDiscuss(row)}><CornerUpLeft size={14}/></button>}
      <button type="button" className="wc-icon" aria-label={`标注操作 ${row.clause || row.title}`} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Ellipsis size={14}/></button>
    </div>
    {showQuote && <div className="wc-mobile-quote">{row.sourceOriginal ?? row.original}</div>}
    <p className="wc-note-body">{annotation.wording || annotation.label}<span className="wc-format" aria-hidden="true"> ↵</span></p>
    {menuOpen && <div className="wc-menu">
      <button type="button" onClick={select}>定位原文</button>
      {onOpen && <button type="button" onClick={() => { setMenuOpen(false); onOpen(row); }}>查看应答</button>}
    </div>}
  </section>;
}
