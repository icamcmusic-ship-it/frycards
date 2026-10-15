/**
 * Spring-smoothed pointer / touch / device-orientation driver for HoloLayer.
 *
 * Writes CSS custom properties straight onto `ref.current` from a rAF loop —
 * no React state, no re-render per pointer event. The loop parks itself once
 * the spring settles, so an idle card costs nothing.
 *
 *   --px --py   pointer 0..1 across the card      --mx --my   same, as %
 *   --rx --ry   tilt in deg                        --hyp       0..1 distance from centre
 *   --act       0..1 "is being handled" (fades the foil in/out)
 *   --bgx --bgy background-position % (37..63, poke-holo style parallax)
 */
import { useEffect, useRef, type RefObject } from 'react';

export type HoloPose = { px: number; py: number; act: number };
export type HoloHandle = {
  set(p: Partial<HoloPose>, snap?: boolean): void;
  /** One left-to-right pass of light across the card (pack reveal of UR+). */
  sweep(ms?: number): void;
};

/**
 * One semi-implicit Euler spring step (same feel as svelte/motion's spring
 * that poke-holo uses). Mutates `cur`/`vel`; returns whether still moving.
 */
export function springStep(
  cur: HoloPose,
  vel: HoloPose,
  tgt: HoloPose,
  stiffness: number,
  damping: number,
): boolean {
  let moving = false;
  for (const k of ['px', 'py', 'act'] as const) {
    const f = (tgt[k] - cur[k]) * stiffness;
    vel[k] = (vel[k] + f) * (1 - damping);
    cur[k] += vel[k];
    if (Math.abs(vel[k]) > 1e-4 || Math.abs(tgt[k] - cur[k]) > 1e-4) moving = true;
  }
  return moving;
}

const REST: HoloPose = { px: 0.5, py: 0.5, act: 0 };
/** Pose shown when motion is reduced: a fixed, readable "held to the light". */
export const STILL_POSE: HoloPose = { px: 0.3, py: 0.25, act: 0.55 };

export function useHoloTilt(
  ref: RefObject<HTMLElement | null>,
  {
    maxTilt = 14,
    reduced = false,
    orientation = false,
    interactive = true,
    stiffness = 0.07,
    damping = 0.26,
  }: {
    maxTilt?: number;
    reduced?: boolean;
    /** Follow DeviceOrientationEvent (phones). Caller handles iOS permission. */
    orientation?: boolean;
    interactive?: boolean;
    stiffness?: number;
    damping?: number;
  } = {},
) {
  const handle = useRef<HoloHandle | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cur = { ...REST };
    const vel = { px: 0, py: 0, act: 0 };
    let tgt: HoloPose = { ...REST };
    let raf = 0;
    let rotate = !reduced;

    const write = (p: HoloPose) => {
      const dx = p.px - 0.5;
      const dy = p.py - 0.5;
      const s = el.style;
      s.setProperty('--px', p.px.toFixed(4));
      s.setProperty('--py', p.py.toFixed(4));
      s.setProperty('--mx', `${(p.px * 100).toFixed(2)}%`);
      s.setProperty('--my', `${(p.py * 100).toFixed(2)}%`);
      s.setProperty('--bgx', `${(37 + p.px * 26).toFixed(2)}%`);
      s.setProperty('--bgy', `${(33 + p.py * 34).toFixed(2)}%`);
      s.setProperty('--hyp', Math.min(1, Math.hypot(dx, dy) * 2).toFixed(4));
      s.setProperty('--act', Math.max(0, Math.min(1, p.act)).toFixed(4));
      const rx = rotate ? -dy * 2 * maxTilt * p.act : 0;
      const ry = rotate ? dx * 2 * maxTilt * p.act : 0;
      s.setProperty('--rx', `${rx.toFixed(2)}deg`);
      s.setProperty('--ry', `${ry.toFixed(2)}deg`);
    };

    const step = () => {
      const moving = springStep(cur, vel, tgt, stiffness, damping);
      write(cur);
      raf = moving ? requestAnimationFrame(step) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };
    const set = (p: Partial<HoloPose>, snap = false) => {
      tgt = { ...tgt, ...p };
      if (snap || reduced) {
        Object.assign(cur, tgt);
        vel.px = vel.py = vel.act = 0;
        write(cur);
        return;
      }
      kick();
    };
    const timers: number[] = [];
    const sweep = (ms = 1100) => {
      if (reduced) return;
      set({ px: 0.05, py: 0.3, act: 1 }, true);
      timers.push(window.setTimeout(() => set({ px: 0.95, py: 0.7 }), 30));
      timers.push(window.setTimeout(() => set({ px: 0.5, py: 0.5, act: 0.35 }), ms));
    };
    handle.current = { set, sweep };

    if (reduced) {
      // Still a foil — just a motionless one. No tilt, no listeners.
      rotate = false;
      set(STILL_POSE, true);
      return () => {
        handle.current = null;
        timers.forEach(clearTimeout);
      };
    }
    write(cur);

    const fromPoint = (x: number, y: number) => {
      // offsetWidth/Height + the un-transformed parent rect: measuring the
      // tilted element itself would feed the tilt back into the pointer.
      const r = (el.parentElement ?? el).getBoundingClientRect();
      set({
        px: Math.min(1, Math.max(0, (x - r.left) / r.width)),
        py: Math.min(1, Math.max(0, (y - r.top) / r.height)),
        act: 1,
      });
    };
    const onMove = (e: PointerEvent) => fromPoint(e.clientX, e.clientY);
    const onLeave = () => set({ px: 0.5, py: 0.5, act: 0 });
    const host = el.parentElement ?? el;
    if (interactive) {
      host.addEventListener('pointermove', onMove);
      host.addEventListener('pointerdown', onMove);
      host.addEventListener('pointerleave', onLeave);
      host.addEventListener('pointercancel', onLeave);
    }

    let base: { b: number; g: number } | null = null;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      base ??= { b: e.beta, g: e.gamma };
      const g = Math.max(-1, Math.min(1, (e.gamma - base.g) / 30));
      const b = Math.max(-1, Math.min(1, (e.beta - base.b) / 30));
      set({ px: 0.5 + g / 2, py: 0.5 + b / 2, act: Math.min(1, 0.35 + Math.hypot(g, b)) });
    };
    if (orientation) window.addEventListener('deviceorientation', onOrient);

    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerdown', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointercancel', onLeave);
      window.removeEventListener('deviceorientation', onOrient);
      timers.forEach(clearTimeout);
      handle.current = null;
    };
  }, [ref, maxTilt, reduced, orientation, interactive, stiffness, damping]);
  return handle;
}
