/**
 * Text-protect masking, shared with the holo layer's approach: measure the
 * face's art window and every text leaf by layout offsets (transform-free,
 * so a tilted/scaled card measures like a flat one), then build one SVG
 * luminance mask per layer. Built on measure, zero per-frame cost.
 */
import { useLayoutEffect, useState } from 'react';
import type React from 'react';

export type Rect = { x: number; y: number; w: number; h: number };
export type Regions = {
  W: number;
  H: number;
  art?: Rect;
  text?: Rect;
  leaves: Rect[];
  /** Measured mid-turn (offsets only): measure again once it lands. */
  turned?: boolean;
};

function within(el: HTMLElement, root: HTMLElement): Rect | undefined {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    const p = n.offsetParent as HTMLElement | null;
    if (!p) return undefined;
    if (!root.contains(p) && p !== root) {
      let rx = 0;
      let ry = 0;
      let r: HTMLElement | null = root;
      while (r && r !== p) {
        rx += r.offsetLeft;
        ry += r.offsetTop;
        r = r.offsetParent as HTMLElement | null;
      }
      return { x: x - rx, y: y - ry, w: el.offsetWidth, h: el.offsetHeight };
    }
    n = p;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/** The face's screen box and scale. `flat` = no rotation/skew in the way
 * (uniform scale), so client rects map straight back to face pixels. */
function frameOf(root: HTMLElement) {
  const R = root.getBoundingClientRect();
  const sx = R.width / (root.offsetWidth || 1);
  const sy = R.height / (root.offsetHeight || 1);
  return { R, sx, sy, flat: sx > 0 && Math.abs(sx - sy) < 0.01 };
}

/** Client-rect measure (follows transforms inside the face, e.g. scaled
 * text), falling back to layout offsets while the card is turned. */
function rectIn(el: HTMLElement, root: HTMLElement, f: ReturnType<typeof frameOf>) {
  if (!f.flat) return within(el, root);
  const r = el.getBoundingClientRect();
  return {
    x: (r.left - f.R.left) / f.sx,
    y: (r.top - f.R.top) / f.sy,
    w: r.width / f.sx,
    h: r.height / f.sy,
  };
}

function union(rs: Rect[]): Rect | undefined {
  if (!rs.length) return undefined;
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  const r = Math.max(...rs.map((r) => r.x + r.w));
  const b = Math.max(...rs.map((r) => r.y + r.h));
  return { x, y, w: r - x, h: b - y };
}

/** `face` = the element holding ONE copy of the CardFace. */
export function measure(face: HTMLElement): Regions {
  const W = face.offsetWidth;
  const H = face.offsetHeight;
  const f = frameOf(face);
  const skip = (el: Element) => !!el.closest('.vfx, .holo');
  const media = Array.from(face.querySelectorAll<HTMLElement>('img, video'))
    .filter((el) => !skip(el))
    .map((el) => rectIn(el, face, f))
    .filter((r): r is Rect => !!r && r.w * r.h > W * H * 0.08)
    .map((r) => {
      const x = Math.max(0, r.x);
      const y = Math.max(0, r.y);
      return { x, y, w: Math.min(W, r.x + r.w) - x, h: Math.min(H, r.y + r.h) - y };
    })
    .sort((a, b) => b.w * b.h - a.w * a.h);
  const leaves: Rect[] = [];
  const all: Rect[] = [];
  face.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (skip(el) || el.classList.contains('sr-only')) return;
    const own = Array.from(el.childNodes).some(
      (c) => c.nodeType === 3 && (c.textContent || '').trim().length > 0,
    );
    if (!own || el.offsetWidth === 0) return;
    const r = rectIn(el, face, f);
    if (!r || r.w * r.h > W * H * 0.4) return;
    all.push(r);
    if (r.y + r.h / 2 > H * 0.5 && r.y < H - 2) leaves.push(r);
  });
  let text = union(leaves);
  if (text) {
    const p = 4;
    text = {
      x: Math.max(0, text.x - p),
      y: text.y - p,
      w: Math.min(W, text.w + 2 * p),
      h: Math.min(H - text.y + p, text.h + 2 * p),
    };
  }
  return { W, H, art: media[0], text, leaves: all, turned: !f.flat };
}

export function useRegions(ref: React.RefObject<HTMLElement | null>): Regions | null {
  const [reg, setReg] = useState<Regions | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    let t = 0;
    let last = '';
    let retry = 0;
    let retries = 0;
    const run = () => {
      cancelAnimationFrame(t);
      t = requestAnimationFrame(() => {
        const r = measure(root);
        const k = JSON.stringify(r);
        if (k !== last) {
          last = k;
          setReg(r);
        }
        // A card mid-flip (pack reveal) measures by offsets; look again
        // once it has turned face-on.
        if (r.turned && retries++ < 20) retry = window.setTimeout(run, 250);
      });
    };
    run();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(run) : null;
    ro?.observe(root);
    // Only childList: our own style writes (pointer vars) must not re-measure.
    const mo = new MutationObserver(run);
    mo.observe(root, { subtree: true, childList: true, characterData: true });
    root.addEventListener('load', run, true);
    root.addEventListener('loadedmetadata', run, true);
    void document.fonts?.ready.then(run);
    return () => {
      cancelAnimationFrame(t);
      clearTimeout(retry);
      ro?.disconnect();
      mo.disconnect();
      root.removeEventListener('load', run, true);
      root.removeEventListener('loadedmetadata', run, true);
    };
  }, [ref]);
  return reg;
}

export type Hole = { r?: Rect; keep: number; pad?: number; rx?: number };

/** base: 'all' | rect; holes punched to `keep` (0 = gone). Soft 1.2px edge. */
export function maskStyle(
  W: number,
  H: number,
  base: Rect | 'all',
  hs: Hole[],
  feather = 1.2,
): React.CSSProperties {
  if (!W || !H) return {};
  const b = base === 'all' ? { x: 0, y: 0, w: W, h: H } : base;
  let body = `<rect x='${b.x}' y='${b.y}' width='${b.w}' height='${b.h}' fill='#fff'/>`;
  for (const h of hs) {
    if (!h.r || h.r.w <= 0 || h.r.h <= 0) continue;
    const p = h.pad ?? 0;
    const g = Math.round(h.keep * 255);
    body += `<rect x='${h.r.x - p}' y='${h.r.y - p}' width='${h.r.w + 2 * p}' height='${h.r.h + 2 * p}' rx='${h.rx ?? 2 + p}' fill='rgb(${g},${g},${g})'/>`;
  }
  const url = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><defs><filter id='f'><feGaussianBlur stdDeviation='${feather}'/></filter><mask id='m'><rect width='100%' height='100%' fill='#000'/><g filter='url(#f)'>${body}</g></mask></defs><rect width='100%' height='100%' fill='#000' mask='url(#m)'/></svg>`,
  )}")`;
  return {
    WebkitMaskImage: url,
    maskImage: url,
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
  } as React.CSSProperties;
}

/** The two masks every variant uses. */
export function textMasks(reg: Regions | null, readable = true) {
  if (!reg)
    return {
      frame: { visibility: 'hidden' } as React.CSSProperties,
      art: { visibility: 'hidden' } as React.CSSProperties,
    };
  const { W, H } = reg;
  const lines: Hole[] = readable ? reg.leaves.map((r) => ({ r, keep: 0, pad: 3 })) : [];
  const box: Hole[] = readable && reg.text ? [{ r: reg.text, keep: 0.18, pad: 2 }] : [];
  return {
    /** Whole card minus text (soft box, hard lines). */
    frame: maskStyle(W, H, 'all', [...box, ...lines]),
    /** Art window only, minus any text over it (Full-Art, Mythic). */
    art: reg.art
      ? maskStyle(W, H, reg.art, [...box, ...lines])
      : ({ display: 'none' } as React.CSSProperties),
  };
}
