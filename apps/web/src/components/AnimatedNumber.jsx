import React, { useEffect, useRef, useState } from 'react';

export default function AnimatedNumber({ value, duration = 260 }) {
  const canAnimate = Number.isFinite(value) && typeof requestAnimationFrame === 'function';
  const [shown, setShown] = useState(() => (canAnimate ? 0 : value));
  const current = useRef(shown);
  useEffect(() => {
    if (!canAnimate) {
      current.current = value;
      setShown(value);
      return;
    }
    const from = current.current;
    if (from === value) { return; }

    let frame;
    let start;
    const tick = (now) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / duration);
      const next = Math.round(from + (value - from) * (1 - Math.pow(1 - progress, 3)));
      current.current = next;
      setShown(next);
      if (progress < 1) { frame = requestAnimationFrame(tick); }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [canAnimate, value, duration]);
  return <span aria-label={String(value)}><span aria-hidden="true">{shown}</span></span>;
}
