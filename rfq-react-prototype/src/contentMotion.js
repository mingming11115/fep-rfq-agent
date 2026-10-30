const activeAnimations = new WeakMap();
const easing = 'cubic-bezier(0.2, 0, 0, 1)';

export function playContentMotion(element, { kind = 'panel', direction = 1, duration,
  reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false } = {}) {
  if (!element) return null;
  activeAnimations.get(element)?.cancel();
  activeAnimations.delete(element);
  if (reducedMotion || !element.animate) return null;
  const offset = direction < 0 ? -8 : 8;
  const motions = {
    page: { from: { opacity: 0, transform: 'translateY(5px)' }, duration: 180 },
    panel: { from: { opacity: 0.4, transform: 'translateY(3px)' }, duration: 150 },
    tab: { from: { opacity: 0.4, transform: `translateX(${offset}px)` }, duration: 150 },
    view: { from: { opacity: 0.35, transform: 'translateY(4px)' }, duration: 180 },
    'card-in': { from: { opacity: 0, transform: `translateX(${-offset * 2}px)` }, duration: 160 },
    'card-out': { to: { opacity: 0, transform: `translateX(${offset * 2}px)` }, duration: 140 },
  };
  const motion = motions[kind] || motions.panel;
  const rest = { opacity: 1, transform: 'translate(0, 0)' };
  const animation = element.animate([motion.from || rest, motion.to || rest], {
    duration: duration ?? motion.duration, easing, fill: kind === 'card-out' ? 'forwards' : 'none',
  });
  activeAnimations.set(element, animation);
  const release = () => { if (activeAnimations.get(element) === animation) activeAnimations.delete(element); };
  animation.finished.then(release, release);
  return animation;
}
