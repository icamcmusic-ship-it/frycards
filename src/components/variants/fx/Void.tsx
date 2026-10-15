/** Null Tear (void_rift): jagged tear in the art window, deep parallax stars. */
import React, { useMemo } from 'react';
import { INK, between, r1, type Rng } from '../rng';
import { svgUrl, type FxProps } from './parts';

const POP = ['#FF6A2B', '#E6FF2E', '#7CFF4F', '#2DF5D0', '#38D6FF', '#B98CFF', '#ffffff'];

/** Tear polygon in 0..100 of the art box: two jagged edges, top to bottom. */
function tear(rng: Rng) {
  const cx = between(rng, 38, 62);
  const lean = between(rng, -14, 14);
  const n = 9;
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = 4 + t * 92;
    const half = Math.sin(t * Math.PI) * between(rng, 8, 15) + 0.6;
    const x = cx + lean * (t - 0.5) + between(rng, -3, 3);
    L.push([x - half - rng() * 3, y]);
    R.push([x + half + rng() * 3, y + between(rng, -2, 2)]);
  }
  return [...L, ...R.reverse()];
}

function stars(rng: Rng, n: number, big: boolean) {
  let b = '';
  for (let i = 0; i < n; i++) {
    const c = POP[Math.floor(rng() * POP.length)];
    const x = r1(rng() * 400);
    const y = r1(rng() * 400);
    if (big && rng() < 0.35)
      b += `<path d='M${x},${r1(+y - 7)}L${r1(+x + 2)},${r1(+y - 2)}L${r1(+x + 7)},${y}L${r1(+x + 2)},${r1(+y + 2)}L${x},${r1(+y + 7)}L${r1(+x - 2)},${r1(+y + 2)}L${r1(+x - 7)},${y}L${r1(+x - 2)},${r1(+y - 2)}Z' fill='${c}'/>`;
    else b += `<circle cx='${x}' cy='${y}' r='${big ? 2.2 : 1.1}' fill='${c}'/>`;
  }
  return svgUrl(b, '', '0 0 400 400');
}

export default function Void({ rngFor, width, reg, accent }: FxProps) {
  const a = reg?.art;
  const data = useMemo(() => {
    const rng = rngFor('m0');
    const poly = tear(rng);
    const clip = `polygon(${poly.map(([x, y]) => `${r1(x)}% ${r1(y)}%`).join(',')})`;
    const pts = poly.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
    const sv = Math.max(0.6, 240 / width);
    const rim = svgUrl(
      `<polygon points='${pts}' fill='none' stroke='${INK}' stroke-width='${2.4 * sv}' stroke-linejoin='round'/>` +
        `<polygon points='${pts}' fill='none' stroke='${accent}' stroke-width='${1.2 * sv}' stroke-linejoin='round'/>`,
      '',
      '0 0 100 100',
    );
    const glow = svgUrl(
      `<polygon points='${pts}' fill='none' stroke='#fff' stroke-width='3.5' stroke-linejoin='round' filter='url(#g)'/>`,
      `<filter id='g' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='1.6'/></filter>`,
      '0 0 100 100',
    );
    return { clip, rim, glow, far: stars(rng, 140, false), near: stars(rng, 36, true) };
  }, [rngFor, width, accent]);
  if (!a) return null;
  return (
    <div
      className="vfx-void"
      style={
        { left: a.x, top: a.y, width: a.w, height: a.h, '--accent': accent } as React.CSSProperties
      }
    >
      <i className="vfx-void__glow" style={{ backgroundImage: data.glow }} />
      <div className="vfx-void__hole" style={{ clipPath: data.clip }}>
        <i className="vfx-void__neb" />
        <i className="vfx-void__stars far" style={{ backgroundImage: data.far }} />
        <i className="vfx-void__stars near" style={{ backgroundImage: data.near }} />
      </div>
      <i className="vfx-void__rim" style={{ backgroundImage: data.rim }} />
      <i className="vfx-void__slice s1" style={{ backgroundImage: data.rim }} />
      <i className="vfx-void__slice s2" style={{ backgroundImage: data.rim }} />
    </div>
  );
}
