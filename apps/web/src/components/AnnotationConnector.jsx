import React, { useEffect, useState } from 'react';

export default function AnnotationConnector({ containerRef, commentId }) {
  const [path, setPath] = useState('');
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !commentId) { setPath(''); return; }
    let frame;
    const draw = () => {
      const mark = root.querySelector(`[data-comment-ids~="${CSS.escape(commentId)}"]`);
      const card = root.querySelector(`[data-comment-card-id="${CSS.escape(commentId)}"]`);
      const paper = root.querySelector('.source-document-scroll');
      const sidebar = root.querySelector('.detail-side-content');
      if (!mark || !card || !paper || !sidebar || !card.getClientRects().length) { setPath(''); return; }
      const base = root.getBoundingClientRect(), source = mark.getBoundingClientRect(), target = card.getBoundingClientRect(), page = paper.getBoundingClientRect(), side = sidebar.getBoundingClientRect();
      if (source.bottom < page.top || source.top > page.bottom || target.top + 20 < side.top || target.top > side.bottom || base.width < 650) { setPath(''); return; }
      const x = source.right - base.left, y = (source.top + source.bottom) / 2 - base.top, edge = page.right - base.left - 5, tx = target.left - base.left, ty = target.top - base.top + 20;
      setPath(`M ${x} ${y} H ${Math.max(x, edge)} L ${tx} ${ty}`);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    const resize = new ResizeObserver(schedule); resize.observe(root);
    const card = root.querySelector(`[data-comment-card-id="${CSS.escape(commentId)}"]`);
    if (card) { resize.observe(card); }
    root.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule); schedule();
    return () => { resize.disconnect(); cancelAnimationFrame(frame); root.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); };
  }, [containerRef, commentId]);
  return path ? <svg className="detail-comment-connector" aria-label="原文与当前批注的连接线"><path d={path} fill="none" stroke="#a17ac0" strokeWidth="1" strokeDasharray="4 4"/></svg> : null;
}
