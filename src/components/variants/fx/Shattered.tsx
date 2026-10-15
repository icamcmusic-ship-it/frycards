/** Smash Cut (shattered): shard split + tilt parallax + breathing + crack glint. */
import React, { useMemo, useRef } from 'react';
import { seededRandom } from '../rng';
import { maskStyle, textMasks, useRegions, type Hole } from '../regions';

export interface Shard {
  poly: [number, number][];
  dx: number;
  dy: number;
  depth: number;
}

/** Same geometry as the v1 shardsFor (same seed -> same cracks on owned cards). */
export function shardsFor(seed: string): { shards: Shard[]; ix: number; iy: number } {
  const rng = seededRandom(`shattered:${seed}`);
  const ix = 38 + rng() * 24;
  const iy = 30 + rng() * 22;
  const n = rng() < 0.5 ? 3 : 4;
  const base = rng() * Math.PI * 2;
  const angles = Array.from(
    { length: n },
    (_, i) => base + ((i + 0.15 + rng() * 0.7) / n) * Math.PI * 2,
  );
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
  const shards = hits.map((h, i) => {
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
  return { shards, ix, iy };
}

const clip = (poly: [number, number][]) =>
  `polygon(${poly.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`;

export default function Shattered({
  face,
  seed,
  width,
  height,
  depth,
}: {
  face: React.ReactElement;
  seed: string;
  width: number;
  height: number;
  depth: number;
}) {
  const { shards, ix, iy } = useMemo(() => shardsFor(seed), [seed]);
  const firstRef = useRef<HTMLDivElement>(null);
  const reg = useRegions(firstRef);
  const masks = textMasks(reg);
  // Still plate: the face again, untransformed, shown only over the rules box
  // and every text line. The cracks (v1 geometry) still run everywhere else.
  const plate = useMemo(() => {
    if (!reg) return null;
    const holes: Hole[] = reg.leaves.map((r) => ({ r, keep: 1, pad: 6 }));
    if (reg.text) holes.push({ r: reg.text, keep: 1, pad: 1 });
    // base = an empty rect: only the holes (keep 1) show.
    return maskStyle(reg.W, reg.H, { x: 0, y: 0, w: 0, h: 0 }, holes);
  }, [reg]);
  // Parallax in px per unit of (--px - .5): depth * card width * amp.
  const amp = 1 + depth * 1.6;
  const cracks = shards.map((s) => s.poly[1]);
  return (
    <div
      className="vfx-shatter"
      style={{ width, height, borderRadius: Math.max(3, width * 0.035) }}
    >
      {shards.map((s, i) => {
        const k = s.depth * amp * width * 0.5;
        const style = {
          clipPath: clip(s.poly),
          '--bx': `${s.dx.toFixed(2)}%`,
          '--by': `${s.dy.toFixed(2)}%`,
          '--k': `${k.toFixed(1)}px`,
          animationDelay: `${-i * 0.7}s`,
        } as React.CSSProperties;
        return (
          <React.Fragment key={i}>
            {depth > 0 && (
              <div
                aria-hidden
                className="vfx-shard vfx-shard--shadow"
                style={{ ...style, left: (2 + i) * depth, top: (3 + i) * depth }}
              />
            )}
            <div
              ref={i === 0 ? firstRef : undefined}
              aria-hidden={i > 0 || undefined}
              {...(i > 0 ? { inert: true } : {})}
              className="vfx-shard"
              style={{ ...style, pointerEvents: i > 0 ? 'none' : undefined }}
            >
              {face}
              <svg
                aria-hidden
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="vfx-shard__edge"
              >
                <polygon
                  points={s.poly.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="none"
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth={width < 100 ? 0.8 : 1.4}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          </React.Fragment>
        );
      })}
      {plate && (
        <div className="vfx-shatter__plate" style={plate} aria-hidden {...{ inert: true }}>
          {face}
        </div>
      )}
      <div className="vfx-shatter__fx" style={masks.frame} aria-hidden>
        <i className="vfx-shatter__flare" style={{ left: `${ix}%`, top: `${iy}%` }} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="vfx-shatter__glint">
          {cracks.map(([x, y], i) => (
            <line key={i} x1={ix} y1={iy} x2={x} y2={y} />
          ))}
        </svg>
        {cracks.map(([x, y], i) => (
          <i
            key={i}
            className="vfx-shatter__spark"
            style={
              {
                left: `${ix}%`,
                top: `${iy}%`,
                '--ex': (x - ix).toFixed(2),
                '--ey': (y - iy).toFixed(2),
                animationDelay: `${-i * 0.9}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
