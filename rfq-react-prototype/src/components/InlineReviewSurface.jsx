import React from 'react';
import { X } from 'lucide-react';

export default function InlineReviewSurface({ title, onClose, footer, children }) {
  return <section className="response-inline-issue" aria-label={title}>
    <header><h3>{title}</h3><button type="button" className="icon-btn" aria-label={`收起${title}`} onClick={onClose}><X size={15}/></button></header>
    <div className="response-inline-body">{children}</div>
    {footer && <footer>{footer}</footer>}
  </section>;
}
