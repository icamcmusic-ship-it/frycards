/** Ink Spill (shadow_ink): edge ink pools, stretching drips, drifting smoke. */
import React, { useMemo } from 'react';
import { INK, VB_H, VB_W, between, r1, type Rng } from '../rng';
import { Particles, Sheet, rough, svgUrl, vbStroke, type FxProps } from './parts';

/** Closed ink shape: card border with a noisy inner edge reaching `reach`. */
function pool(rng: Rng) {
  const pts: string[] = [];
  const reach = (along: number, edge: 'top' | 'side' | 'bottom') => {
    const base = edge === 'top' ? 34 : edge === 'bottom' ? 30 : 22;
    const bulge =
      Math.max(0, Math.sin(along * Math.PI * between(rng, 1.5, 3))) * (edge === 'side' ? 26 : 44);
    return base + bulge + rng() * 14;
  };
  const N = 22;
  const inner: [number, number][] = [];
  for (let i = 0; i <= N; i++) inner.push([(i / N) * VB_W, reach(i / N, 'top')]);
  for (let i = 1; i <= N; i++) inner.push([VB_W - reach(i / N, 'side'), (i / N) * VB_H]);
  for (let i = 1; i <= N; i++) inner.push([VB_W - (i / N) * VB_W, VB_H - reach(i / N, 'bottom')]);
  for (let i = 1; i < N; i++) inner.push([reach(i / N, 'side'), VB_H - (i / N) * VB_H]);
  for (const [x, y] of inner) pts.push(`${r1(x)},${r1(y)}`);
  // outer rect clockwise, inner ring counter-clockwise -> evenodd ring
  return `M-20,-20H${VB_W + 20}V${VB_H + 20}H-20Z M${pts.join('L')}Z`;
}

export default function Shadow({ rngFor, width, accent }: FxProps) {
  const art = useMemo(() => {
    const rng = rngFor('m0');
    const s = vbStroke(width, 1.6);
    const ring = pool(rng);
    const blots = Array.from({ length: 5 }, () => {
      const x = between(rng, 40, VB_W - 40);
      const y = rng() < 0.5 ? between(rng, 40, 90) : between(rng, VB_H - 90, VB_H - 40);
      return `M${r1(x)},${r1(y)}m-${r1(between(rng, 6, 14))},0a10,10 0 1,0 20,0a10,10 0 1,0 -20,0`;
    }).join('');
    const ink = svgUrl(
      `<g filter='url(#r)'><path d='${ring} ${blots}' fill-rule='evenodd' fill='${INK}' stroke='${accent}' stroke-width='${s * 2.2}'/></g>`,
      rough('r', 0.022, 34, 9),
    );
    const smoke = svgUrl(
      `<rect width='100%' height='100%' filter='url(#s)'/>`,
      `<filter id='s' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.012 .02' numOctaves='3' seed='${Math.floor(rng() * 99)}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.45  0 0 0 0 0.3  0 0 0 0 0.7  0 0 0 3.2 -1.55'/></filter>`,
      '0 0 400 400',
    );
    const drip = svgUrl(
      `<path d='M30,0 L30,140 C30,170 10,175 10,190 A20,20 0 0,0 50,190 C50,175 30,170 30,140' fill='${INK}' stroke='${accent}' stroke-width='5'/>`,
      '',
      '0 0 60 220',
    );
    return { ink, smoke, drip };
  }, [rngFor, width, accent]);
  const drips = useMemo(() => {
    const rng = rngFor('m1');
    return Array.from({ length: 5 }, () => ({
      x: between(rng, 8, 90),
      y: 1,
      d: rng() * 6,
      t: between(rng, 5, 8),
      s: (width / 240) * between(rng, 13, 19),
      k: between(rng, 1, 1.5),
    }));
  }, [rngFor, width]);
  return (
    <div className="vfx-shadow" style={{ '--accent': accent } as React.CSSProperties}>
      <div className="vfx-shadow__smokebox">
        <Sheet url={art.smoke} className="vfx-shadow__smoke a" />
        <Sheet url={art.smoke} className="vfx-shadow__smoke b" />
      </div>
      <div className="vfx-par-1 vfx-shadow__ink">
        <Sheet url={art.ink} />
      </div>
      <Particles items={drips} className="vfx-shadow__drip">
        <b style={{ backgroundImage: art.drip }} />
      </Particles>
    </div>
  );
}
