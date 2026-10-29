import { useLayoutEffect, useRef } from 'react';

export default function useContentTransition(ref, transitionKey, { duration = 150, enabled = true } = {}) {
  const previousKey = useRef(transitionKey);
  useLayoutEffect(() => {
    if (Object.is(previousKey.current, transitionKey)) return;
    previousKey.current = transitionKey;
    const element = ref.current;
    if (!enabled || !element?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const animation = element.animate([{ opacity: 0.72 }, { opacity: 1 }], {
      duration, easing: 'cubic-bezier(0.2, 0, 0, 1)',
    });
    return () => animation.cancel();
  }, [ref, transitionKey, duration, enabled]);
}
