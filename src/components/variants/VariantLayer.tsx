/**
 * Lazy-loaded renderer for card variants (see src/meta/variants.ts). CardFace
 * hands over the finished face element; this wraps it:
 *
 * - Elementals: the face, then one static overlay over the whole card — the
 *   painted drop-in art if it exists, else the procedural SVG.
 * - Shattered: the face is drawn once per shard (3-4 shards, seeded per card)
 *   and each copy is clipped to its shard, nudged apart so thin ink gaps
 *   show, and shifted at its own depth by the pointer / device tilt (the
 *   pack opening's foil-shimmer tracking, usePointerVars). `depth` (the 3D
 *   inspector) adds a drop shadow under each shard and a stronger parallax.
 *   Under reduced motion the shards hold still.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePointerVars } from '../../meta/pack/usePointerVars';
import { useReducedMotion } from '../../meta/useMotionMode';
import { CardVariant, variantArtUrl, VARIANT_META } from '../../meta/variants';
import { ElementalSvg, seededRandom } from './overlayArt';

const INK = '#1a1a1a';

/* ---- painted-art drop-in: probe each URL once per session ---- */
const artState = new Map<CardVariant, 'ok' | 'missing' | Promise<void>>();
function probeArt(v: CardVariant): 'ok' | 'missing' | Promise<void> {
  const known = artState.get(v);
  if (known) return known;
  if (typeof Image === 'undefined') {
    artState.set(v, 'missing');
    return 'missing';
  }
  const p = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      artState.set(v, 'ok');
      resolve();
    };
    img.onerror = () => {
      artState.set(v, 'missing');
      resolve();
    };
    img.src = variantArtUrl(v);
  });
  artState.set(v, p);
  return p;
}

function usePaintedArt(v: CardVariant): string | null {
  const [ok, setOk] = useState(() => artState.get(v) === 'ok');
  useEffect(() => {
    let live = true;
    const s = probeArt(v);
    // 'ok' / 'missing' were already read by the initial state.
    if (s !== 'ok' && s !== 'missing') void s.then(() => live && setOk(artState.get(v) === 'ok'));
    return () => {
      live = false;
    };
  }, [v]);
  return ok ? variantArtUrl(v) : null;
}

/* ---- shard geometry ---- */
interface Shard {
  /** clip-path polygon, % of the card */
  poly: [number, number][];
  /** outward nudge, % of the card */
  dx: number;
  dy: number;
  /** parallax depth multiplier */
  depth: number;
}

/** Splits the card into 3-4 shards: rays from a seeded impact point out to
 * the border; each shard is the region between two neighbouring rays. */
export function shardsFor(seed: string): Shard[] {
  const rng = seededRandom(`shattered:${seed}`);
  const ix = 38 + rng() * 24;
  const iy = 30 + rng() * 22;
  const n = rng() < 0.5 ? 3 : 4;
  // spread ray angles round the circle with jitter
  const base = rng() * Math.PI * 2;
  const angles = Array.from(
    { length: n },
    (_, i) => base + ((i + 0.15 + rng() * 0.7) / n) * Math.PI * 2,
  );
  // Hit point of a ray on the 0..100 square (in card %, aspect handled by
  // treating height in the same 0..100 space; rays are visual only).
  const hit = (a: number): [number, number] => {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const tx = dx > 0 ? (100 - ix) / dx : dx < 0 ? -ix / dx : Infinity;
    const ty = dy > 0 ? (100 - iy) / dy : dy < 0 ? -iy / dy : Infinity;
    const t = Math.min(tx, ty);
    return [ix + dx * t, iy + dy * t];
  };
  const corners: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const ang = (p: [number, number]) => {
    let a = Math.atan2(p[1] - iy, p[0] - ix) - base;
    while (a < 0) a += Math.PI * 2;
    return a % (Math.PI * 2);
  };
  const hits = angles.map(hit);
  return hits.map((h, i) => {
    const next = hits[(i + 1) % n];
    const a0 = ang(h);
    let a1 = ang(next);
    if (a1 <= a0) a1 += Math.PI * 2;
    const inside = corners
      .map((c) => ({ c, a: ang(c) < a0 ? ang(c) + Math.PI * 2 : ang(c) }))
      .filter((c) => c.a > a0 && c.a < a1)
      .sort((x, y) => x.a - y.a)
      .map((c) => c.c);
    const poly: [number, number][] = [[ix, iy], h, ...inside, next];
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    const len = Math.hypot(cx - ix, cy - iy) || 1;
    const nudge = 0.9 + rng() * 0.7;
    return {
      poly,
      dx: ((cx - ix) / len) * nudge,
      dy: ((cy - iy) / len) * nudge * 0.75,
      depth: 0.04 + rng() * 0.09,
    };
  });
}

const clip = (poly: [number, number][]) =>
  `polygon(${poly.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`;

function ShatteredCard({
  face,
  seed,
  width,
  height,
  depth,
  art,
}: {
  face: React.ReactElement;
  seed: string;
  width: number;
  height: number;
  depth: number;
  art: string | null;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  usePointerVars(ref, ref, reduced, true);
  const shards = useMemo(() => shardsFor(seed), [seed]);
  const amp = 1 + depth * 1.6;
  return (
    <div
      ref={ref}
      className="relative shrink-0"
      data-variant="shattered"
      style={{ width, height, borderRadius: Math.max(3, width * 0.035), background: INK }}
    >
      {shards.map((s, i) => {
        const move = reduced
          ? `translate(${s.dx.toFixed(2)}%, ${s.dy.toFixed(2)}%)`
          : `translate(calc(${s.dx.toFixed(2)}% + (var(--mx, 50%) - 50%) * ${(s.depth * amp).toFixed(3)}), calc(${s.dy.toFixed(2)}% + (var(--my, 50%) - 50%) * ${(s.depth * amp).toFixed(3)}))`;
        return (
          <React.Fragment key={i}>
            {depth > 0 && (
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  clipPath: clip(s.poly),
                  background: 'rgba(0,0,0,0.55)',
                  transform: `${move} translate(${(2 + i) * depth}px, ${(3 + i) * depth}px)`,
                  transition: 'transform 120ms linear',
                }}
              />
            )}
            <div
              aria-hidden={i > 0 || undefined}
              // Only the first shard keeps the face interactive; the others
              // are visual copies (inert so their chips are not tabbable).
              {...(i > 0 ? { inert: true } : {})}
              className={i > 0 ? 'absolute inset-0 pointer-events-none' : 'absolute inset-0'}
              style={{
                clipPath: clip(s.poly),
                transform: move,
                transition: 'transform 120ms linear',
              }}
            >
              {face}
              <svg
                aria-hidden
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 pointer-events-none"
                width="100%"
                height="100%"
              >
                <polygon
                  points={s.poly.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="none"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={width < 100 ? 0.8 : 1.4}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          </React.Fragment>
        );
      })}
      {art && (
        <img
          src={art}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full pointer-events-none"
          draggable={false}
        />
      )}
    </div>
  );
}

export default function VariantLayer({
  variant,
  seed,
  width,
  height,
  face,
  depth = 0,
}: {
  variant: CardVariant;
  /** Card id: every copy of a card draws the same overlay. */
  seed: string;
  width: number;
  height: number;
  face: React.ReactElement;
  /** 0 = flat; 1 = the 3D inspector (shard drop-shadows, more parallax). */
  depth?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const art = usePaintedArt(variant);
  if (variant === 'shattered') {
    return (
      <ShatteredCard
        face={face}
        seed={seed}
        width={width}
        height={height}
        depth={depth}
        art={art}
      />
    );
  }
  return (
    <div
      className="relative shrink-0"
      data-variant={variant}
      style={{ width, height }}
      title={undefined}
    >
      {face}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none overflow-hidden z-40"
        style={{ borderRadius: Math.max(3, width * 0.035) }}
        data-variant-art={art ? 'painted' : 'procedural'}
      >
        {art ? (
          <img src={art} alt="" className="absolute inset-0 w-full h-full" draggable={false} />
        ) : (
          <ElementalSvg variant={variant} seed={seed} width={width} uid={uid} />
        )}
      </div>
      <span className="sr-only">{VARIANT_META[variant].name} variant</span>
    </div>
  );
}
