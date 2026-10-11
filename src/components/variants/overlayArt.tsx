/**
 * Procedural overlay art for the seven elemental card variants, drawn as one
 * SVG over the whole card face in the Monochrome & Pop ink style: flat pop
 * colour, hard ink outlines, no gradients on the inked shapes, no motion.
 *
 * Every overlay uses a 750x1050 viewBox — the same frame as the painted
 * drop-in art (`frycards-art.pages.dev/Overlays/<variant>.webp`, see
 * src/meta/variants.ts) — and is seeded by card id, so every copy of a card
 * looks the same and different cards look different.
 *
 * Effects hug the edges so the name, rules and stats stay readable; the
 * "centre" pieces (lightning strike, rift, sunburst) sit in the art window,
 * which on both card templates spans roughly y 60..470.
 */
import React from 'react';
import type { ElementalVariant } from '../../meta/variants';

export const VB_W = 750;
export const VB_H = 1050;
const INK = '#1a1a1a';

/** mulberry32 over an FNV-1a hash of the seed string. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const r2 = (n: number) => Math.round(n * 10) / 10;
const pts = (p: [number, number][]) => p.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');
const between = (rng: Rng, a: number, b: number) => a + rng() * (b - a);

interface ArtProps {
  rng: Rng;
  /** Instance-unique id for <defs> (masks, clips, gradients). */
  id: (name: string) => string;
  /** Outline width in screen px (non-scaling strokes). */
  sw: number;
}

/** Walks the card's border inset by `inset`, returning evenly spaced points
 * with their inward normal — the spine every edge effect grows from. */
function borderWalk(inset: number, step: number) {
  const out: { x: number; y: number; nx: number; ny: number }[] = [];
  const x0 = inset;
  const y0 = inset;
  const x1 = VB_W - inset;
  const y1 = VB_H - inset;
  for (let x = x0; x < x1; x += step) out.push({ x, y: y0, nx: 0, ny: 1 });
  for (let y = y0; y < y1; y += step) out.push({ x: x1, y, nx: -1, ny: 0 });
  for (let x = x1; x > x0; x -= step) out.push({ x, y: y1, nx: 0, ny: -1 });
  for (let y = y1; y > y0; y -= step) out.push({ x: x0, y, nx: 1, ny: 0 });
  return out;
}

/** A seeded point on the border inset by `inset`. */
function borderPoint(rng: Rng, inset: number) {
  const w = VB_W - inset * 2;
  const h = VB_H - inset * 2;
  let t = rng() * (w + h) * 2;
  if (t < w) return { x: inset + t, y: inset };
  t -= w;
  if (t < h) return { x: VB_W - inset, y: inset + t };
  t -= h;
  if (t < w) return { x: VB_W - inset - t, y: VB_H - inset };
  t -= w;
  return { x: inset, y: VB_H - inset - t };
}

const ink = (sw: number, extra = 0) => ({
  stroke: INK,
  strokeWidth: sw + extra,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
  vectorEffect: 'non-scaling-stroke' as const,
});

/* ------------------------------------------------------------------ Ember */
function EmberSparks({ rng, sw }: ArtProps) {
  const sparks = Array.from({ length: 20 }, () => {
    // Sparks hug the side and bottom edges, clear of the rules text.
    const side = rng();
    const x =
      side < 0.4
        ? between(rng, 20, 730)
        : side < 0.7
          ? between(rng, 14, 70)
          : between(rng, 680, 736);
    const y = side < 0.4 ? between(rng, 990, 1036) : between(rng, 120, 1010);
    const s = between(rng, 12, 28);
    return { x, y, s, hot: rng() < 0.45, rot: between(rng, 0, 90) };
  });
  const streaks = Array.from({ length: 7 }, () => {
    const x = rng() < 0.5 ? between(rng, 20, 70) : between(rng, 680, 730);
    const y = between(rng, 700, 1020);
    const len = between(rng, 40, 90);
    const dx = between(rng, -18, 18);
    return { x, y, x2: x + dx, y2: y - len };
  });
  return (
    <>
      {/* heat edge: stepped bands, hottest at the rim */}
      <rect
        x="6"
        y="6"
        width={VB_W - 12}
        height={VB_H - 12}
        rx="22"
        fill="none"
        stroke="#F97316"
        strokeWidth="26"
        opacity="0.32"
      />
      <rect
        x="4"
        y="4"
        width={VB_W - 8}
        height={VB_H - 8}
        rx="22"
        fill="none"
        stroke="#FB923C"
        strokeWidth="13"
        opacity="0.7"
      />
      <rect
        x="3"
        y="3"
        width={VB_W - 6}
        height={VB_H - 6}
        rx="22"
        fill="none"
        stroke="#FDE047"
        strokeWidth="5"
      />
      <rect
        x="22"
        y="22"
        width={VB_W - 44}
        height={VB_H - 44}
        rx="14"
        fill="none"
        {...ink(sw * 0.6)}
        opacity="0.55"
      />
      {/* bottom glow pool */}
      <path
        d={`M0 ${VB_H} L0 990 Q 200 965 375 985 Q 560 1000 750 975 L750 ${VB_H} Z`}
        fill="#F97316"
        opacity="0.3"
      />
      {streaks.map((s, i) => (
        <line
          key={`s${i}`}
          x1={s.x}
          y1={s.y}
          x2={s.x2}
          y2={s.y2}
          stroke="#FDBA74"
          strokeWidth={sw * 1.2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          opacity="0.85"
        />
      ))}
      {sparks.map((p, i) => {
        const d = p.s;
        const star: [number, number][] = [
          [0, -d],
          [d * 0.26, -d * 0.26],
          [d, 0],
          [d * 0.26, d * 0.26],
          [0, d],
          [-d * 0.26, d * 0.26],
          [-d, 0],
          [-d * 0.26, -d * 0.26],
        ];
        return (
          <polygon
            key={i}
            transform={`translate(${r2(p.x)} ${r2(p.y)}) rotate(${r2(p.rot)})`}
            points={pts(star)}
            fill={p.hot ? '#FDE047' : '#F97316'}
            {...ink(sw * 0.8)}
          />
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------- Tide */
function frostBand(rng: Rng, depth: number) {
  // One jagged band all the way round: each border point pushed inward by a
  // seeded spike, so the frost "creeps" unevenly.
  const walk = borderWalk(0, 22);
  const inner = walk.map((p, i) => {
    // Shallow along the top so the card name stays readable.
    const d = p.ny > 0 ? depth * 0.3 : depth;
    const spike = i % 2 === 0 ? between(rng, d * 0.35, d) : between(rng, d * 0.1, d * 0.4);
    return [p.x + p.nx * spike, p.y + p.ny * spike] as [number, number];
  });
  const outer = `M0 0 H${VB_W} V${VB_H} H0 Z`;
  return `${outer} M${inner.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(' L')} Z`;
}

function Snowflake({
  x,
  y,
  r,
  rot,
  sw,
}: {
  key?: React.Key;
  x: number;
  y: number;
  r: number;
  rot: number;
  sw: number;
}) {
  const arms = [0, 60, 120, 180, 240, 300];
  return (
    <g transform={`translate(${r2(x)} ${r2(y)}) rotate(${r2(rot)})`}>
      {arms.map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <line
            x1="0"
            y1="0"
            x2="0"
            y2={-r}
            stroke={INK}
            strokeWidth={sw * 2.6}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
          <line
            x1="0"
            y1={-r * 0.55}
            x2={r * 0.25}
            y2={-r * 0.78}
            stroke={INK}
            strokeWidth={sw * 2.2}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
          <line
            x1="0"
            y1={-r * 0.55}
            x2={-r * 0.25}
            y2={-r * 0.78}
            stroke={INK}
            strokeWidth={sw * 2.2}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2={-r}
            stroke="#E0F2FE"
            strokeWidth={sw * 1.2}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
          <line
            x1="0"
            y1={-r * 0.55}
            x2={r * 0.25}
            y2={-r * 0.78}
            stroke="#E0F2FE"
            strokeWidth={sw}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
          <line
            x1="0"
            y1={-r * 0.55}
            x2={-r * 0.25}
            y2={-r * 0.78}
            stroke="#E0F2FE"
            strokeWidth={sw}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
        </g>
      ))}
      <polygon
        points={pts(
          arms.map((a) => [
            Math.sin((a * Math.PI) / 180) * r * 0.22,
            -Math.cos((a * Math.PI) / 180) * r * 0.22,
          ]),
        )}
        fill="#38BDF8"
        {...ink(sw * 0.8)}
      />
    </g>
  );
}

function TideFrost({ rng, sw }: ArtProps) {
  const outerBand = frostBand(rng, 74);
  const innerBand = frostBand(rng, 40);
  // Top crystals tuck into the corners above the masthead text; the bottom
  // pair can sit larger.
  const corners: [number, number, number][] = [
    [26, 26, 0.55],
    [VB_W - 26, 26, 0.55],
    [VB_W - 62, VB_H - 62, 1],
    [62, VB_H - 62, 1],
  ];
  const flecks = Array.from({ length: 26 }, () => {
    const p = borderPoint(rng, between(rng, 24, 96));
    return { x: p.x, y: p.y, s: between(rng, 3, 7) };
  });
  return (
    <>
      <path d={outerBand} fill="#BAE6FD" fillRule="evenodd" opacity="0.78" {...ink(sw * 0.9)} />
      <path d={innerBand} fill="#F0F9FF" fillRule="evenodd" opacity="0.92" />
      {flecks.map((f, i) => (
        <rect
          key={i}
          x={r2(f.x - f.s / 2)}
          y={r2(f.y - f.s / 2)}
          width={r2(f.s)}
          height={r2(f.s)}
          transform={`rotate(45 ${r2(f.x)} ${r2(f.y)})`}
          fill="#fff"
          {...ink(sw * 0.5)}
        />
      ))}
      {corners.map(([x, y, k], i) => (
        <Snowflake
          key={i}
          x={x}
          y={y}
          r={between(rng, 44, 56) * k}
          rot={between(rng, 0, 30)}
          sw={sw}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------- Root */
function RootOvergrown({ rng, sw }: ArtProps) {
  // A wobbling vine traced round the border; leaves sprout at intervals.
  const walk = borderWalk(18, 30);
  const phase = rng() * Math.PI * 2;
  const vine = walk.map((p, i) => {
    const wob = Math.sin(i * 0.55 + phase) * 11 + Math.sin(i * 1.7 + phase * 2) * 4;
    return [p.x + p.nx * (wob + 8), p.y + p.ny * (wob + 8)] as [number, number];
  });
  let d = `M${r2(vine[0][0])} ${r2(vine[0][1])}`;
  for (let i = 1; i < vine.length; i++) {
    const [px, py] = vine[i - 1];
    const [x, y] = vine[i];
    d += ` Q${r2(px)} ${r2(py)} ${r2((px + x) / 2)} ${r2((py + y) / 2)}`;
  }
  d += ' Z';
  const leaves = vine
    .map(([x, y], i) => ({ x, y, p: walk[i] }))
    .filter((_, i) => i % 3 === Math.floor(phase) % 3 || rng() < 0.12)
    // no leaves over the name along the top edge
    .filter((l) => !(l.p.ny > 0 && l.x < 600))
    .map((l, i) => {
      const inward = Math.atan2(l.p.ny, l.p.nx) * (180 / Math.PI);
      const side = i % 2 === 0 ? 1 : -1;
      return {
        ...l,
        rot: inward + side * between(rng, 25, 60) - 90,
        s: between(rng, 0.8, 1.35),
        dark: rng() < 0.4,
      };
    });
  // a couple of tendrils curling inward from the corners
  const curls = [
    [40, VB_H - 40, 1, -1],
    [VB_W - 40, VB_H - 40, -1, -1],
  ].map(
    ([x, y, sx, sy]) =>
      `M${x} ${y} q ${sx * 70} ${sy * 10} ${sx * 80} ${sy * 70} q ${sx * 4} ${sy * 40} ${sx * -30} ${sy * 36} q ${sx * -22} ${sy * -6} ${sx * -6} ${sy * -24}`,
  );
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke={INK}
        strokeWidth={sw * 5.2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        stroke="#65A30D"
        strokeWidth={sw * 3}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      {curls.map((c, i) => (
        <g key={i}>
          <path
            d={c}
            fill="none"
            stroke={INK}
            strokeWidth={sw * 4}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
          <path
            d={c}
            fill="none"
            stroke="#65A30D"
            strokeWidth={sw * 2}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
        </g>
      ))}
      {leaves.map((l, i) => (
        <g
          key={i}
          transform={`translate(${r2(l.x)} ${r2(l.y)}) rotate(${r2(l.rot)}) scale(${r2(l.s)})`}
        >
          <path
            d="M0 0 C 14 -10, 34 -10, 46 0 C 34 10, 14 10, 0 0 Z"
            fill={l.dark ? '#15803D' : '#4ADE80'}
            {...ink(sw * 0.9)}
          />
          <line
            x1="4"
            y1="0"
            x2="38"
            y2="0"
            stroke={INK}
            strokeWidth={sw * 0.6}
            vectorEffect="non-scaling-stroke"
            opacity="0.7"
          />
        </g>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------- Gale */
function bolt(
  rng: Rng,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  segs: number,
  jitter: number,
) {
  const p: [number, number][] = [[x0, y0]];
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    p.push([
      x0 + (x1 - x0) * t + between(rng, -jitter, jitter),
      y0 + (y1 - y0) * t + between(rng, -jitter * 0.3, jitter * 0.3),
    ]);
  }
  p.push([x1, y1]);
  return p;
}

function GaleLightning({ rng, sw }: ArtProps) {
  const ix = between(rng, 240, 510);
  const iy = between(rng, 300, 420);
  // Bolts enter from the side edges below the masthead, so the name stays clear.
  const fromLeft = rng() < 0.5;
  const main = bolt(rng, fromLeft ? -10 : VB_W + 10, between(rng, 90, 180), ix, iy, 7, 40);
  const forks = Array.from({ length: 3 }, (_, k) => {
    const from = main[2 + k] ?? main[2];
    const tx = from[0] + between(rng, -220, 220);
    const ty = from[1] + between(rng, 60, 180);
    return bolt(rng, from[0], from[1], tx, ty, 4, 22);
  });
  const second = bolt(
    rng,
    fromLeft ? VB_W + 10 : -10,
    between(rng, 300, 520),
    ix + between(rng, -20, 20),
    iy,
    5,
    34,
  );
  const pl = (p: [number, number][]) => p.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');
  const burst = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? between(rng, 62, 86) : between(rng, 22, 32);
    return [ix + Math.cos(a) * r, iy + Math.sin(a) * r] as [number, number];
  });
  const lines = (p: [number, number][], w: number) => (
    <>
      <polyline
        points={pl(p)}
        fill="none"
        stroke={INK}
        strokeWidth={sw * (w + 2.4)}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="miter"
        strokeLinecap="round"
      />
      <polyline
        points={pl(p)}
        fill="none"
        stroke="#FDE047"
        strokeWidth={sw * w}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="miter"
        strokeLinecap="round"
      />
      <polyline
        points={pl(p)}
        fill="none"
        stroke="#fff"
        strokeWidth={sw * w * 0.35}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="miter"
        strokeLinecap="round"
      />
    </>
  );
  return (
    <>
      {/* electric rim */}
      <rect
        x="5"
        y="5"
        width={VB_W - 10}
        height={VB_H - 10}
        rx="20"
        fill="none"
        stroke="#FACC15"
        strokeWidth="9"
        opacity="0.75"
      />
      <circle cx={ix} cy={iy} r="150" fill="#FEF9C3" opacity="0.28" />
      {forks.map((f, i) => (
        <g key={i}>{lines(f, 1.4)}</g>
      ))}
      {lines(second, 1.8)}
      {lines(main, 2.8)}
      <polygon points={pts(burst)} fill="#fff" {...ink(sw * 1.1)} />
      <circle cx={ix} cy={iy} r="16" fill="#FDE047" {...ink(sw)} />
      <circle
        cx={ix}
        cy={iy}
        r="104"
        fill="none"
        {...ink(sw * 0.8)}
        strokeDasharray="6 10"
        opacity="0.6"
      />
    </>
  );
}

/* ------------------------------------------------------------------ Light */
function LightRadiant({ rng, sw, id }: ArtProps) {
  const cx = 375;
  const cy = between(rng, 250, 300);
  const n = 18;
  const off = rng() * (Math.PI / n);
  const rays = Array.from({ length: n }, (_, i) => {
    const a0 = off + (i / n) * Math.PI * 2;
    const a1 = a0 + (Math.PI / n) * 0.9;
    const R = 1400;
    return [
      [cx, cy],
      [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R],
      [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R],
    ] as [number, number][];
  });
  return (
    <>
      <defs>
        {/* Rays read as coming from BEHIND the art: masked out of the art
            window and faded over the rules box. */}
        <mask id={id('lr-mask')}>
          <rect width={VB_W} height={VB_H} fill="#fff" />
          <rect x="48" y="70" width="654" height="430" rx="10" fill="#000" />
          <rect x="24" y="6" width="702" height="62" fill="#000" />
          <rect x="40" y="590" width="670" height="400" rx="10" fill="#1a1a1a" />
        </mask>
      </defs>
      <g mask={`url(#${id('lr-mask')})`}>
        {rays.map((r, i) => (
          <polygon key={i} points={pts(r)} fill={i % 2 ? '#FDE047' : '#FEF3C7'} opacity="0.62" />
        ))}
      </g>
      {/* halo edge */}
      <rect
        x="10"
        y="10"
        width={VB_W - 20}
        height={VB_H - 20}
        rx="22"
        fill="none"
        stroke="#FEF3C7"
        strokeWidth="22"
        opacity="0.75"
      />
      <rect
        x="6"
        y="6"
        width={VB_W - 12}
        height={VB_H - 12}
        rx="22"
        fill="none"
        stroke="#FACC15"
        strokeWidth="9"
      />
      <rect
        x="6"
        y="6"
        width={VB_W - 12}
        height={VB_H - 12}
        rx="22"
        fill="none"
        {...ink(sw * 0.8)}
      />
      <rect
        x="26"
        y="26"
        width={VB_W - 52}
        height={VB_H - 52}
        rx="14"
        fill="none"
        {...ink(sw * 0.6)}
        opacity="0.5"
      />
      {[
        [70, 70],
        [680, 70],
        [70, 980],
        [680, 980],
      ].map(([x, y], i) => (
        <polygon
          key={i}
          transform={`translate(${x} ${y})`}
          points={pts([
            [0, -20],
            [5, -5],
            [20, 0],
            [5, 5],
            [0, 20],
            [-5, 5],
            [-20, 0],
            [-5, -5],
          ])}
          fill="#FDE047"
          {...ink(sw * 0.8)}
        />
      ))}
    </>
  );
}

/* ----------------------------------------------------------------- Shadow */
function ShadowInk({ rng, sw }: ArtProps) {
  // Ink pools: a band of overlapping blobs along every edge, heavier at the
  // bottom, with a few drips running inward.
  const walk = borderWalk(0, 46);
  const blobs = walk.map((p) => {
    // heavy pooling at the bottom, light along the masthead
    const heavy = p.ny < 0 ? 1.5 : p.ny > 0 ? 0.55 : 1;
    return { x: p.x, y: p.y, r: between(rng, 18, 44) * heavy };
  });
  // drips run down the side edges, clear of the name and rules
  const drips = Array.from({ length: 6 }, (_, i) => {
    const x = i % 2 ? between(rng, 6, 30) : between(rng, 720, 744);
    const y = between(rng, 120, 820);
    return { x, y, len: between(rng, 60, 160), w: between(rng, 9, 16) };
  });
  const tendrils = Array.from({ length: 5 }, () => {
    const p = walk[Math.floor(rng() * walk.length)];
    const reach = between(rng, 110, 220);
    const bend = between(rng, -90, 90);
    const ex = p.x + p.nx * reach + p.ny * bend * 0.5;
    const ey = p.y + p.ny * reach + p.nx * bend * 0.5;
    const cx = p.x + p.nx * reach * 0.5 + p.ny * bend;
    const cy = p.y + p.ny * reach * 0.5 + p.nx * bend;
    return `M${r2(p.x)} ${r2(p.y)} Q${r2(cx)} ${r2(cy)} ${r2(ex)} ${r2(ey)}`;
  });
  return (
    <>
      {tendrils.map((t, i) => (
        <g key={i}>
          <path
            d={t}
            fill="none"
            stroke="#7E22CE"
            strokeWidth="34"
            strokeLinecap="round"
            opacity="0.18"
          />
          <path
            d={t}
            fill="none"
            stroke={INK}
            strokeWidth="16"
            strokeLinecap="round"
            opacity="0.32"
          />
          <path
            d={t}
            fill="none"
            stroke={INK}
            strokeWidth={sw * 1.2}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            opacity="0.8"
          />
        </g>
      ))}
      <rect x="0" y="0" width={VB_W} height={VB_H} fill="none" stroke={INK} strokeWidth="30" />
      {blobs.map((b, i) => (
        <circle key={i} cx={r2(b.x)} cy={r2(b.y)} r={r2(b.r)} fill={INK} />
      ))}
      {drips.map((d, i) => (
        <g key={`d${i}`}>
          <rect
            x={r2(d.x - d.w / 2)}
            y={r2(d.y)}
            width={r2(d.w)}
            height={r2(d.len)}
            rx={r2(d.w / 2)}
            fill={INK}
          />
          <circle cx={r2(d.x)} cy={r2(d.y + d.len)} r={r2(d.w * 0.8)} fill={INK} />
        </g>
      ))}
      {/* a violet sheen catching the wet ink */}
      {blobs
        .filter((_, i) => i % 4 === 0)
        .map((b, i) => (
          <ellipse
            key={`h${i}`}
            cx={r2(b.x - b.r * 0.25)}
            cy={r2(b.y - b.r * 0.3)}
            rx={r2(b.r * 0.28)}
            ry={r2(b.r * 0.14)}
            fill="#C084FC"
            opacity="0.7"
          />
        ))}
    </>
  );
}

/* ------------------------------------------------------------------- Void */
function VoidRift({ rng, sw, id }: ArtProps) {
  const cx = between(rng, 260, 490);
  const cy = between(rng, 230, 330);
  const n = 22;
  const hole = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rx = 150 * (0.62 + rng() * 0.45) * (i % 2 ? 0.8 : 1);
    const ry = 112 * (0.62 + rng() * 0.45) * (i % 2 ? 0.8 : 1);
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as [number, number];
  });
  // torn paper lip: the same outline pushed outward
  const lip = hole.map(
    ([x, y]) => [cx + (x - cx) * 1.12, cy + (y - cy) * 1.12] as [number, number],
  );
  const stars = Array.from({ length: 34 }, () => {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng());
    return {
      x: cx + Math.cos(a) * 120 * r,
      y: cy + Math.sin(a) * 88 * r,
      s: between(rng, 1.5, 5),
      big: rng() < 0.15,
    };
  });
  const cracks = Array.from({ length: 5 }, (_, i) => {
    const [x, y] = lip[(i * 5 + Math.floor(rng() * 3)) % n];
    const dx = (x - cx) / 150;
    const dy = (y - cy) / 112;
    return bolt(rng, x, y, x + dx * between(rng, 60, 130), y + dy * between(rng, 60, 130), 3, 14);
  });
  return (
    <>
      <defs>
        <clipPath id={id('vr-hole')}>
          <polygon points={pts(hole)} />
        </clipPath>
        <radialGradient id={id('vr-deep')} cx="50%" cy="50%" r="60%">
          <stop offset="0" stopColor="#4C1D95" />
          <stop offset="0.6" stopColor="#1E1B4B" />
          <stop offset="1" stopColor="#030014" />
        </radialGradient>
      </defs>
      <rect
        x="4"
        y="4"
        width={VB_W - 8}
        height={VB_H - 8}
        rx="22"
        fill="none"
        stroke="#EC4899"
        strokeWidth="7"
        opacity="0.8"
      />
      {cracks.map((c, i) => (
        <polyline
          key={i}
          points={c.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ')}
          fill="none"
          {...ink(sw * 1.4)}
        />
      ))}
      <polygon points={pts(lip)} fill="#F5F5F4" {...ink(sw * 1.2)} />
      <polygon points={pts(hole)} fill={`url(#${id('vr-deep')})`} {...ink(sw * 1.6)} />
      <g clipPath={`url(#${id('vr-hole')})`}>
        <ellipse
          cx={cx + 30}
          cy={cy - 10}
          rx="90"
          ry="34"
          fill="#EC4899"
          opacity="0.35"
          transform={`rotate(-18 ${r2(cx)} ${r2(cy)})`}
        />
        {stars.map((s, i) =>
          s.big ? (
            <polygon
              key={i}
              transform={`translate(${r2(s.x)} ${r2(s.y)})`}
              points={pts([
                [0, -9],
                [2, -2],
                [9, 0],
                [2, 2],
                [0, 9],
                [-2, 2],
                [-9, 0],
                [-2, -2],
              ])}
              fill="#fff"
            />
          ) : (
            <circle key={i} cx={r2(s.x)} cy={r2(s.y)} r={r2(s.s / 2)} fill="#fff" />
          ),
        )}
      </g>
    </>
  );
}

const ART: Record<ElementalVariant, (p: ArtProps) => React.ReactElement> = {
  ember_sparks: EmberSparks,
  tide_frost: TideFrost,
  root_overgrown: RootOvergrown,
  gale_lightning: GaleLightning,
  light_radiant: LightRadiant,
  shadow_ink: ShadowInk,
  void_rift: VoidRift,
};

/** Outline weight per rendered card width, so micro cards keep hairlines. */
export function strokeFor(width: number): number {
  return width < 100 ? 0.7 : width < 160 ? 1 : width < 260 ? 1.4 : 1.8;
}

export function ElementalSvg({
  variant,
  seed,
  width,
  uid,
}: {
  variant: ElementalVariant;
  seed: string;
  width: number;
  /** Unique per instance: ids in <defs> must not collide across cards. */
  uid: string;
}) {
  const Art = ART[variant];
  const rng = seededRandom(`${variant}:${seed}`);
  const svg = (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      aria-hidden
      focusable="false"
      style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
    >
      <Art rng={rng} sw={strokeFor(width)} id={(n) => `${n}-${uid}`} />
    </svg>
  );
  return svg;
}
