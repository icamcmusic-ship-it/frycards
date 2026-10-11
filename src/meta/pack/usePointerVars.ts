import { useEffect, type RefObject } from 'react';

type OrientationCtor = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * The pack-opening foil shimmer's pointer/tilt tracking, shared: writes the
 * pointer (or device tilt) position over `host` as `--mx` / `--my` (0%..100%)
 * on `target`. Device tilt is used where it arrives without a permission
 * prompt (iOS needs a tap; FoilShimmer handles that). Does nothing under
 * reduced motion, so anything reading the vars falls back to its default.
 */
export function usePointerVars(
  target: RefObject<HTMLElement | null>,
  host: RefObject<HTMLElement | null> | 'parent',
  reducedMotion: boolean,
  resetOnLeave = false,
) {
  useEffect(() => {
    const el = target.current;
    const h = host === 'parent' ? el?.parentElement : host.current;
    if (!el || !h || reducedMotion) return;
    const set = (x: number, y: number) => {
      el.style.setProperty('--mx', `${Math.round(x * 100)}%`);
      el.style.setProperty('--my', `${Math.round(y * 100)}%`);
    };
    const onMove = (e: PointerEvent) => {
      const r = h.getBoundingClientRect();
      if (!r.width || !r.height) return;
      set(
        Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
      );
    };
    const onLeave = () => {
      el.style.removeProperty('--mx');
      el.style.removeProperty('--my');
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      set(
        0.5 + Math.max(-1, Math.min(1, e.gamma / 35)) / 2,
        0.5 + Math.max(-1, Math.min(1, (e.beta - 45) / 35)) / 2,
      );
    };
    h.addEventListener('pointermove', onMove);
    if (resetOnLeave) h.addEventListener('pointerleave', onLeave);
    const DOE = (typeof window !== 'undefined' ? window.DeviceOrientationEvent : undefined) as
      (typeof DeviceOrientationEvent & OrientationCtor) | undefined;
    const tilt = !!DOE && typeof DOE.requestPermission !== 'function';
    if (tilt) window.addEventListener('deviceorientation', onTilt);
    return () => {
      h.removeEventListener('pointermove', onMove);
      h.removeEventListener('pointerleave', onLeave);
      if (tilt) window.removeEventListener('deviceorientation', onTilt);
    };
  }, [target, host, reducedMotion, resetOnLeave]);
}
