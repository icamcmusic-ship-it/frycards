/**
 * Decides whether a variant card animates ("live") and feeds it tilt.
 *
 * live = wantsMotion && onScreen && tabVisible && withinBudget
 *   wantsMotion: not reduced (OS setting OR in-app <html data-motion>), and
 *                one of: `live` prop (inspector / reveal), depth > 0, hover/focus.
 *   withinBudget: at most MAX_LIVE cards animate at once; claims are ranked
 *                by priority (explicit/inspector 2, hover 1) then recency.
 * When not live the CSS holds every keyframe paused on a seeded frame, so
 * grids and the table show a still, "mid-action" card at zero cost.
 *
 * Tilt: if an ancestor already drives --px/--py/--act (holo/useHoloTilt,
 * which marks its element [data-tilt-vars]), the layer just inherits them. Otherwise this hook writes them
 * on the variant root from pointer events (no rAF, no React state).
 */
import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';

/** Most variant cards animating at once (inspector + reveal + hovers). */
export let MAX_LIVE = 4;
export function setMaxLiveVariants(n: number) {
  MAX_LIVE = n;
  emit();
}

type Claim = { id: number; pri: number; t: number };
const claims = new Map<number, Claim>();
const subs = new Set<() => void>();
let liveIds = new Set<number>();
function emit() {
  const ranked = [...claims.values()].sort((a, b) => b.pri - a.pri || b.t - a.t);
  liveIds = new Set(ranked.slice(0, MAX_LIVE).map((c) => c.id));
  subs.forEach((f) => f());
}
let seq = 0;
let clock = 0;
function claim(id: number, pri: number) {
  if (pri <= 0) {
    if (claims.delete(id)) emit();
    return;
  }
  const c = claims.get(id);
  if (c && c.pri === pri) return;
  claims.set(id, { id, pri, t: ++clock });
  emit();
}
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

/* ---- reduced motion: OS + in-app attribute (matches useReducedMotion) ---- */
function readReduced(): boolean {
  if (typeof document === 'undefined') return true;
  const m = document.documentElement.dataset.motion;
  if (m === 'reduced') return true;
  if (m === 'full') return false;
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
function subscribeReduced(f: () => void) {
  const mo = new MutationObserver(f);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  const mq =
    typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  mq?.addEventListener('change', f);
  return () => {
    mo.disconnect();
    mq?.removeEventListener('change', f);
  };
}
export function useReducedMotionV2(force?: boolean) {
  const r = useSyncExternalStore(subscribeReduced, readReduced, () => true);
  return force ?? r;
}

/* ---- tab visibility (one listener for all cards) ---- */
const readVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
function subscribeVisible(f: () => void) {
  document.addEventListener('visibilitychange', f);
  return () => document.removeEventListener('visibilitychange', f);
}

/* ---- one IntersectionObserver for all cards ---- */
const ioCbs = new WeakMap<Element, (v: boolean) => void>();
let io: IntersectionObserver | null = null;
function observe(el: Element, cb: (v: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined') {
    cb(true);
    return () => {};
  }
  io ??= new IntersectionObserver(
    (es) => es.forEach((e) => ioCbs.get(e.target)?.(e.isIntersecting)),
    { rootMargin: '64px' },
  );
  ioCbs.set(el, cb);
  io.observe(el);
  return () => {
    io?.unobserve(el);
    ioCbs.delete(el);
  };
}

export function useVariantFx(
  ref: RefObject<HTMLElement | null>,
  {
    live: liveProp,
    depth = 0,
    reduced: reducedProp,
  }: { live?: boolean; depth?: number; reduced?: boolean },
) {
  const reduced = useReducedMotionV2(reducedProp);
  const visible = useSyncExternalStore(subscribeVisible, readVisible, () => false);
  const [onScreen, setOnScreen] = useState(false);
  const [hover, setHover] = useState(false);
  const [id] = useState(() => ++seq);
  useSyncExternalStore(
    subscribe,
    () => liveIds.has(id),
    () => false,
  );

  useEffect(() => {
    const el = ref.current;
    return el ? observe(el, setOnScreen) : undefined;
  }, [ref]);

  // Hover/focus wake + standalone tilt vars.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const host = el.parentElement ?? el;
    // Read on use: an ancestor's useHoloTilt marks its host after our effect.
    const driven = () => !!el.parentElement?.closest('[data-tilt-vars]');
    const on = () => setHover(true);
    const off = () => {
      setHover(false);
      if (!driven()) {
        el.style.removeProperty('--px');
        el.style.removeProperty('--py');
        el.style.removeProperty('--act');
      }
    };
    const move = (e: PointerEvent) => {
      if (driven() || reduced) return;
      const r = host.getBoundingClientRect();
      if (!r.width) return;
      el.style.setProperty(
        '--px',
        Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)).toFixed(3),
      );
      el.style.setProperty(
        '--py',
        Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)).toFixed(3),
      );
      el.style.setProperty('--act', '1');
    };
    host.addEventListener('pointerenter', on);
    host.addEventListener('pointerleave', off);
    host.addEventListener('pointermove', move);
    host.addEventListener('focusin', on);
    host.addEventListener('focusout', off);
    return () => {
      host.removeEventListener('pointerenter', on);
      host.removeEventListener('pointerleave', off);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('focusin', on);
      host.removeEventListener('focusout', off);
    };
  }, [ref, reduced]);

  const pri = reduced || !onScreen || !visible ? 0 : liveProp || depth > 0 ? 2 : hover ? 1 : 0;
  useEffect(() => {
    claim(id, pri);
  }, [id, pri]);
  useEffect(() => () => claim(id, 0), [id]);

  return { live: pri > 0 && liveIds.has(id), reduced };
}
