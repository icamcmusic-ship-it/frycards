import { useEffect, type RefObject } from 'react';
import {
  INK_DARK,
  INK_LIGHT,
  MC_HALO_ALPHA,
  MC_REGIONS,
  inkHalo,
  nextInk,
  regionStats,
} from './artInk';

/** Sample grid: tiny on purpose (a 16×16 readback is ~1 kB). */
const GRID = 16;
/** About four samples a second. */
const PERIOD_MS = 250;

/** True when motion is reduced: the in-app setting, or the OS setting unless
 * the in-app setting forces full motion. */
export function motionReduced(): boolean {
  if (typeof document === 'undefined') return true;
  const mode = document.documentElement.getAttribute('data-motion');
  if (mode === 'reduced') return true;
  if (mode === 'full') return false;
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/** Apply an ink to a face: CSS vars only, so no React re-render per frame. */
export function setInkVars(el: HTMLElement, ink: 'light' | 'dark'): void {
  el.style.setProperty('--mc-ink', ink === 'dark' ? INK_DARK : INK_LIGHT);
  el.style.setProperty('--mc-ink-halo', inkHalo(ink));
  el.dataset.ink = ink;
}

/**
 * Mythic "Opening Credits": keep the title lockup legible over the looping
 * video by sampling the frame under the title region on a 16×16 offscreen
 * canvas about four times a second and switching the title ink (light/dark)
 * through CSS vars, with hysteresis (`nextInk`) and a CSS colour transition so
 * it never strobes.
 *
 * Sampling pauses while the card is off-screen, the tab is hidden, or motion
 * is reduced (OS or in-app), and the face falls back to `staticInk` (the
 * build-time choice). A cross-origin video without CORS taints the canvas:
 * the SecurityError is caught, sampling stops for good and the static ink
 * stays.
 */
export function useVideoInk(
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  staticInk: 'light' | 'dark',
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!enabled) return;
    setInkVars(root, staticInk);
    if (typeof IntersectionObserver === 'undefined') return;
    let ink = staticInk;
    let visible = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let dead = false;
    let lastTime = -1;
    let ctx: CanvasRenderingContext2D | null = null;

    const sample = () => {
      const video = root.querySelector('video');
      if (!video || video.readyState < 2) return;
      // A paused frame only needs reading once.
      if (video.paused && video.currentTime === lastTime) return;
      lastTime = video.currentTime;
      if (!ctx) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = GRID;
        ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return stop(true);
      }
      try {
        // object-fit: cover on a card-shaped box: crop the frame to 5:7.
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) return;
        const box = root.clientWidth / Math.max(1, root.clientHeight);
        let sw = vw;
        let sh = vh;
        if (vw / vh > box) sw = vh * box;
        else sh = vw / box;
        ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, GRID, GRID);
        const { data } = ctx.getImageData(0, 0, GRID, GRID);
        // The halo pool lifts when the face is collapsed (.mc-col).
        const halo = root.classList.contains('mc-col') ? MC_HALO_ALPHA.tucked : MC_HALO_ALPHA.open;
        const stats = regionStats(data, GRID, GRID, MC_REGIONS.title, () => halo);
        const next = nextInk(ink, stats.mean);
        if (next !== ink) {
          ink = next;
          setInkVars(root, ink);
        }
      } catch {
        // SecurityError: a cross-origin frame without CORS taints the canvas.
        // Never retry; keep the build-time ink.
        stop(true);
      }
    };
    const start = () => {
      if (dead || timer || !visible || document.hidden || motionReduced()) return;
      timer = setInterval(sample, PERIOD_MS);
      sample();
    };
    function stop(fatal = false) {
      if (timer) clearInterval(timer);
      timer = null;
      if (fatal) {
        dead = true;
        ink = staticInk;
        setInkVars(root!, staticInk);
      }
    }
    const update = () => {
      if (visible && !document.hidden && !motionReduced()) start();
      else {
        stop();
        // Reduced motion: hold the static choice rather than a stale frame's.
        if (motionReduced() && ink !== staticInk) {
          ink = staticInk;
          setInkVars(root, staticInk);
        }
      }
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    io.observe(root);
    document.addEventListener('visibilitychange', update);
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    } catch {
      mq = null;
    }
    mq?.addEventListener?.('change', update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    return () => {
      stop();
      io.disconnect();
      mo.disconnect();
      mq?.removeEventListener?.('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [rootRef, enabled, staticInk]);
}

/** Hosts known to answer art requests with `Access-Control-Allow-Origin: *`
 * (the Pages art site's _headers, and public Supabase Storage), where the
 * video can be requested with `crossOrigin="anonymous"` and stay readable.
 * Elsewhere crossOrigin is left unset: setting it on a host without CORS
 * would fail the video load outright. */
export function corsReadable(url: string): boolean {
  if (/^(blob:|data:)/.test(url)) return true;
  try {
    const u = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
    if (typeof location !== 'undefined' && u.origin === location.origin) return true;
    return (
      /(^|\.)frycards-art\.pages\.dev$/.test(u.hostname) ||
      (/\.supabase\.(co|in)$/.test(u.hostname) &&
        u.pathname.startsWith('/storage/v1/object/public/'))
    );
  } catch {
    return false;
  }
}
