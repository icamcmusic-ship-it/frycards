/**
 * HoloLayer — pointer-driven foil for a FryCards CardFace, one treatment per
 * rarity tier plus two finish overlays (foil copy, serialized copy).
 *
 * Drop-in contract: render it as the LAST child of the element that wraps a
 * CardFace (position: relative, same size as the face), and drive the CSS
 * variables with `useHoloTilt` on an ancestor (or set them yourself).
 * It measures the face's regions (art window, text box, UR stamp, serial
 * plate) by layout offsets — never by getBoundingClientRect, so a tilted or
 * scaled card measures the same as a flat one — and masks each layer to them.
 *
 * Every texture is procedural (see textures.ts). No bitmap foil assets.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { BRUSHED, ETCH, GRAIN, SPARKLE, SWIRL } from './textures';
import { HOLO_CSS } from './holoCss';

const HOLO_STYLE_ID = 'fc-holo-styles';
/** Inject the foil CSS on first use — kept out of the eager stylesheet. */
export function ensureHoloStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(HOLO_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = HOLO_STYLE_ID;
  el.textContent = HOLO_CSS;
  document.head.appendChild(el);
}

export type HoloTier =
  'common' | 'uncommon' | 'rare' | 'super-rare' | 'ultra-rare' | 'mythic' | 'full-art';
export type HoloFinish = 'foil' | 'serialized' | null;

/** FryCards names, shown in UI/tooltips and used in the report. */
export const HOLO_NAMES: Record<HoloTier | 'foil' | 'serialized', string> = {
  common: 'Grease Glare',
  uncommon: 'Fryer Sheen',
  rare: 'Chip-Stack Holo',
  'super-rare': 'Colour Bleed',
  'ultra-rare': 'Contraband Cosmos',
  mythic: 'Opening Night Prism',
  'full-art': 'Headliner Oil Slick',
  foil: 'Grease-Fire Reverse',
  serialized: 'Pit Boss Plate',
};

/** Elemental accents (Monochrome & Pop foil palette). */
export const HOLO_ACCENT: Record<string, string> = {
  Ember: '#FF6A2B',
  Light: '#E6FF2E',
  Tide: '#38D6FF',
  Root: '#7CFF4F',
  Gale: '#2DF5D0',
  Shadow: '#B98CFF',
  Void: '#D9DCE3',
};

export function tierForRarity(rarity?: string): HoloTier {
  switch (rarity) {
    case 'Uncommon':
      return 'uncommon';
    case 'Rare':
      return 'rare';
    case 'Super-Rare':
      return 'super-rare';
    case 'Ultra-Rare':
      return 'ultra-rare';
    case 'Mythic':
      return 'mythic';
    case 'Full-Art':
    case 'Alt-Art':
      return 'full-art';
    default:
      return 'common';
  }
}

type Rect = { x: number; y: number; w: number; h: number };
type Regions = {
  W: number;
  H: number;
  art?: Rect;
  text?: Rect;
  leaves: Rect[];
  /** `[data-holo-protect]` elements (Full-Art headliner title): hard holes in every layer. */
  protect: Rect[];
  seal?: Rect;
  serial?: Rect;
};

/** Position of `el` inside `root` from offset* (layout space, transform-free). */
let tCache = new WeakMap<Element, [number, number]>();
function translateOf(el: HTMLElement): [number, number] {
  let t = tCache.get(el);
  if (!t) {
    const cs = getComputedStyle(el);
    const tf = cs.transform;
    t = [0, 0];
    // Tailwind v4's translate-* utilities use the standalone `translate`
    // property (computed as "<x>px <y>px"), not `transform`.
    if (cs.translate && cs.translate !== 'none') {
      const [tx, ty] = cs.translate.split(' ').map((v) => parseFloat(v) || 0);
      t = [tx ?? 0, ty ?? 0];
    }
    if (tf && tf !== 'none') {
      try {
        const m = new DOMMatrixReadOnly(tf);
        t = [t[0] + m.m41, t[1] + m.m42];
      } catch {
        // unparsable: ignore
      }
    }
    tCache.set(el, t);
  }
  return t;
}

function within(el: HTMLElement, root: HTMLElement): Rect | undefined {
  // offsetLeft/Top are measured from the offsetParent's PADDING edge, so each
  // hop through an intermediate offsetParent adds that parent's border
  // (clientLeft/Top) — CardFace's 4px frame shifted every mask otherwise.
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    // A 2D translate (a centred "TAP TO SHOW TEXT" pill) moves the element
    // without moving its offsets; fold it in. The tilt itself lives above
    // root, so it never shows up here.
    const t = translateOf(n);
    x += t[0];
    y += t[1];
    const p = n.offsetParent as HTMLElement | null;
    if (!p) return undefined;
    if (!root.contains(p) && p !== root) {
      // offsetParent jumped past root: subtract root's own offset chain
      // (to root's padding edge, which is what `inset: 0` layers sit on).
      let rx = root.clientLeft;
      let ry = root.clientTop;
      let r: HTMLElement | null = root;
      while (r && r !== p) {
        rx += r.offsetLeft;
        ry += r.offsetTop;
        r = r.offsetParent as HTMLElement | null;
        if (r && r !== p) {
          rx += r.clientLeft;
          ry += r.clientTop;
        }
      }
      return { x: x - rx, y: y - ry, w: el.offsetWidth, h: el.offsetHeight };
    }
    if (p !== root) {
      x += p.clientLeft;
      y += p.clientTop;
    }
    n = p;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function union(rs: Rect[]): Rect | undefined {
  if (!rs.length) return undefined;
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  const r = Math.max(...rs.map((r) => r.x + r.w));
  const b = Math.max(...rs.map((r) => r.y + r.h));
  return { x, y, w: r - x, h: b - y };
}

function measure(root: HTMLElement): Regions {
  tCache = new WeakMap();
  const W = root.offsetWidth;
  const H = root.offsetHeight;
  const media = Array.from(root.querySelectorAll<HTMLElement>('img, video'))
    .map((el) => within(el, root))
    .filter((r): r is Rect => !!r && r.w * r.h > W * H * 0.08)
    // Clip to the card: art that bleeds/zooms past the frame still masks to it.
    .map((r) => {
      const x = Math.max(0, r.x);
      const y = Math.max(0, r.y);
      return { x, y, w: Math.min(W, r.x + r.w) - x, h: Math.min(H, r.y + r.h) - y };
    })
    .sort((a, b) => b.w * b.h - a.w * a.h);
  // Text box: every text-bearing leaf in the lower half (rules, keywords,
  // flavor, type line). Union, padded. This is what the strong foils avoid.
  const leaves: Rect[] = [];
  const all: Rect[] = [];
  // Every element that prints its own text (titles, small print, chips),
  // not just p/span/div: a missed <h3> or <small> was a hole the foil filled.
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (el.closest('.holo') || el instanceof SVGElement) return;
    const own = Array.from(el.childNodes).some(
      (c) => c.nodeType === 3 && (c.textContent || '').trim().length > 1,
    );
    if (!own || el.offsetWidth === 0) return;
    const r = within(el, root);
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
  const q = (s: string) => {
    const el = root.querySelector<HTMLElement>(s);
    return el ? within(el, root) : undefined;
  };
  const protect: Rect[] = [];
  root.querySelectorAll<HTMLElement>('[data-holo-protect]').forEach((el) => {
    const r = within(el, root);
    if (r && r.w > 0 && r.h > 0) protect.push(r);
  });
  return {
    W,
    H,
    art: media[0],
    text,
    leaves: all,
    protect,
    seal: q('.ur-seal'),
    serial: q('.serial-plate'),
  };
}

/**
 * One SVG luminance mask per layer: start from `base` (whole card or a rect),
 * punch soft holes (keep = 0 → fully off, 0.2 → 20% strength). Built once per
 * measure, so the per-frame cost is zero; overlapping holes are fine.
 */
type Hole = { r?: Rect; keep: number; pad?: number };
function maskStyle(W: number, H: number, base: Rect | 'all', hs: Hole[]): React.CSSProperties {
  if (!W || !H) return {};
  const b = base === 'all' ? { x: 0, y: 0, w: W, h: H } : base;
  let body = `<rect x='${b.x}' y='${b.y}' width='${b.w}' height='${b.h}' fill='#fff'/>`;
  for (const h of hs) {
    if (!h.r || h.r.w <= 0 || h.r.h <= 0) continue;
    const p = h.pad ?? 0;
    const g = Math.round(h.keep * 255);
    body += `<rect x='${h.r.x - p}' y='${h.r.y - p}' width='${h.r.w + 2 * p}' height='${h.r.h + 2 * p}' rx='${2 + p}' fill='rgb(${g},${g},${g})'/>`;
  }
  const url = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><defs><filter id='f'><feGaussianBlur stdDeviation='1.2'/></filter><mask id='m'><rect width='100%' height='100%' fill='#000'/><g filter='url(#f)'>${body}</g></mask></defs><rect width='100%' height='100%' fill='#000' mask='url(#m)'/></svg>`,
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

function overlap(a?: Rect, b?: Rect): Rect | undefined {
  if (!a || !b) return undefined;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bt = Math.min(a.y + a.h, b.y + b.h);
  return r > x && bt > y ? { x, y, w: r - x, h: bt - y } : undefined;
}

export function HoloLayer({
  tier,
  finish = null,
  colour,
  readable = true,
  glareOnly = false,
}: {
  /** Table hand/board cards: the cheap glare only, no tier layers. */
  glareOnly?: boolean;
  tier: HoloTier;
  /** Copy-level finish laid over the tier effect. */
  finish?: HoloFinish;
  /** Card colour name (Ember, Tide, …) — tints Colour Bleed and the reverse. */
  colour?: string | null;
  /** Keep the strong layers off the text box (default on; off only for QA). */
  readable?: boolean;
}) {
  ensureHoloStyles();
  const ref = useRef<HTMLDivElement>(null);
  const [reg, setReg] = useState<Regions | null>(null);

  useLayoutEffect(() => {
    const root = ref.current?.parentElement;
    if (!root) return;
    let t = 0;
    const run = () => {
      cancelAnimationFrame(t);
      t = requestAnimationFrame(() => setReg(measure(root)));
    };
    run();
    // Fonts, art and the face's own text-fit ladder all move the regions
    // after first paint; re-measure on any of them (cheap: ~0.2 ms).
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(run);
    ro?.observe(root);
    // Our own layers' mask styles change on every measure: ignore those, or a
    // measure would schedule the next one.
    const self = ref.current;
    const mo = new MutationObserver((recs) => {
      if (recs.some((r) => !self?.contains(r.target))) run();
    });
    mo.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    root.addEventListener('load', run, true);
    document.fonts?.ready.then(run);
    return () => {
      cancelAnimationFrame(t);
      ro?.disconnect();
      mo.disconnect();
      root.removeEventListener('load', run, true);
    };
  }, []);

  const W = reg?.W ?? 0;
  const H = reg?.H ?? 0;
  const art = reg?.art;
  // The text box can overlap the art (Full-Art, Mythic): only its part below
  // the art top is "text", and for frame masks art+text must not overlap.
  const text = readable ? reg?.text : undefined;
  const artOnly =
    art && text && overlap(art, text) ? { ...art, h: Math.max(0, text.y - art.y) } : art;
  const accent = HOLO_ACCENT[colour ?? ''] ?? '#FFD54F';

  const L = (cls: string, style?: React.CSSProperties) => (
    <i key={cls} className={`holo__l ${cls}`} style={style} />
  );
  // Every text line is a hard hole; the text box as a whole is a soft one.
  const lines: Hole[] = readable
    ? [
        ...(reg?.leaves ?? []).map((r) => ({ r, keep: 0, pad: 2 })),
        ...(reg?.protect ?? []).map((r) => ({ r, keep: 0, pad: 3 })),
      ]
    : [];
  // Mythic's lattice bled into the small italic flavour at full tilt, so its
  // text box is a hard hole rather than a 22% one.
  const box: Hole[] = text ? [{ r: text, keep: tier === 'mythic' ? 0 : 0.22 }] : [];
  const artClip = art ? maskStyle(W, H, art, lines) : { display: 'none' };
  const noText = maskStyle(W, H, 'all', [...box, ...lines]);
  const frame = maskStyle(W, H, 'all', [
    { r: artOnly, keep: 0 },
    { r: text, keep: 0.12 },
    ...lines,
  ]);

  let layers: React.ReactNode[] = [];
  switch (glareOnly ? 'common' : tier) {
    case 'common':
      break;
    case 'uncommon':
      layers = [L('fx-sheen', noText)];
      break;
    case 'rare':
      layers = [L('fx-bars', artClip)];
      break;
    case 'super-rare':
      layers = [L('fx-bleed', artClip), L('fx-bleed-frame', frame)];
      break;
    case 'ultra-rare':
      layers = [
        L('fx-cosmos', frame),
        L('fx-etch', frame),
        reg?.seal &&
          L('fx-seal', {
            left: reg.seal.x,
            top: reg.seal.y,
            width: reg.seal.w,
            height: reg.seal.h,
            inset: 'auto',
          }),
      ];
      break;
    case 'mythic':
      layers = [L('fx-prism', noText), L('fx-prism-flare', noText)];
      break;
    case 'full-art':
      layers = [L('fx-slick', noText)];
      break;
  }
  const fin = glareOnly ? null : finish;
  if (fin === 'foil') layers.push(L('fx-reverse', frame));
  if (fin === 'serialized') {
    layers.push(L('fx-brushed', noText));
    if (reg?.serial)
      layers.push(
        L('fx-serial', {
          left: reg.serial.x - 2,
          top: reg.serial.y - 2,
          width: reg.serial.w + 4,
          height: reg.serial.h + 4,
          inset: 'auto',
        }),
      );
  }

  return (
    <div
      ref={ref}
      aria-hidden
      className={`holo holo--${tier}${finish ? ` holo--${finish}` : ''}`}
      style={
        {
          '--accent': accent,
          '--grain': GRAIN,
          '--brushed': BRUSHED,
          '--swirl': SWIRL,
          '--sparkle': SPARKLE,
          '--etch': ETCH,
        } as React.CSSProperties
      }
    >
      {reg && layers}
      {L('fx-glare', reg ? maskStyle(W, H, 'all', lines) : undefined)}
    </div>
  );
}

/** Per-tier blend-layer count (incl. glare) — see README/report for budget. */
export const HOLO_LAYER_COST: Record<HoloTier | 'foil' | 'serialized', number> = {
  common: 1,
  uncommon: 2,
  rare: 2,
  'super-rare': 3,
  'ultra-rare': 4,
  mythic: 3,
  'full-art': 2,
  foil: 1,
  serialized: 2,
};
