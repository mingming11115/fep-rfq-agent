import { useLayoutEffect, useRef } from 'react';
import { playContentMotion } from '../contentMotion';

export default function useContentTransition(ref, transitionKey, { duration, enabled = true, kind = 'panel', position } = {}) {
  const previousKey = useRef(transitionKey);
  const previousPosition = useRef(position);
  useLayoutEffect(() => {
    if (Object.is(previousKey.current, transitionKey)) { return; }
    previousKey.current = transitionKey;
    const direction = position < previousPosition.current ? -1 : 1;
    previousPosition.current = position;
    if (!enabled) { return; }
    const animation = playContentMotion(ref.current, { kind, direction, duration });
    return () => animation?.cancel();
  }, [ref, transitionKey, duration, enabled, kind, position]);
}
