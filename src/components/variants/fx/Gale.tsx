/** Crosswind (gale_lightning id kept): gust lanes, corner vortices, scraps. */
import React, { useMemo } from 'react';
import { INK, between, r1, type Rng } from '../rng';
import { Particles, Sheet, svgUrl, type FxProps } from './parts';

/** A lane image: 2-3 tapered gust strokes, one ending in a curl. 600x120 box. */
function lane(rng: Rng, accent: string) {
  let body = '';
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const y = 25 + i * between(rng, 26, 36);
    const x0 = between(rng, 0, 120);
    const x1 = between(rng, 420, 590);
    const a = between(rng, -14, 14);
    const curl = i === 0;
    const d = curl
      ? `M${r1(x0)},${r1(y)} C${r1(x0 + 150)},${r1(y + a)} ${r1(x1 - 140)},${r1(y - a)} ${r1(x1 - 40)},${r1(y)} c30,0 40,-26 18,-34 c-16,-6 -28,10 -14,18`
      : `M${r1(x0)},${r1(y)} C${r1(x0 + 150)},${r1(y + a)} ${r1(x1 - 140)},${r1(y - a)} ${r1(x1)},${r1(y)}`;
    body +=
      `<path d='${d}' fill='none' stroke='${INK}' stroke-width='15' stroke-linecap='round'/>` +
      `<path d='${d}' fill='none' stroke='${accent}' stroke-width='9' stroke-linecap='round'/>` +
      `<path d='${d}' fill='none' stroke='#fff' stroke-width='1.6' stroke-linecap='round' stroke-dasharray='40 90' opacity='.9'/>`;
  }
  return svgUrl(body, '', '0 0 600 120');
}

function vortex(accent: string) {
  // Archimedean spiral arms, 3 of them.
  let body = '';
  for (let k = 0; k < 3; k++) {
    let d = '';
    for (let t = 0; t <= 1; t += 0.04) {
      const a = k * ((Math.PI * 2) / 3) + t * Math.PI * 2.2;
      const r = 8 + t * 88;
      d += `${t ? 'L' : 'M'}${r1(100 + Math.cos(a) * r)},${r1(100 + Math.sin(a) * r)}`;
    }
    body += `<path d='${d}' fill='none' stroke='${INK}' stroke-width='9' stroke-linecap='round'/><path d='${d}' fill='none' stroke='${accent}' stroke-width='4.5' stroke-linecap='round'/>`;
  }
  return svgUrl(body, '', '0 0 200 200');
}

const SCRAP = (accent: string) =>
  svgUrl(
    `<path d='M10,50 C20,10 70,5 90,30 C70,45 60,85 20,90 Z' fill='${accent}' stroke='${INK}' stroke-width='7'/>`,
    '',
    '0 0 100 100',
  );

export default function Gale({ rngFor, width, accent }: FxProps) {
  const art = useMemo(() => {
    const rng = rngFor('m0');
    return {
      lanes: [0, 1, 2, 3].map(() => lane(rng, accent)),
      fixed: [lane(rng, accent), lane(rng, accent)],
      vortex: vortex(accent),
      scrap: SCRAP(accent),
    };
  }, [rngFor, accent]);
  const lanes = useMemo(() => {
    const rng = rngFor('m1');
    return [
      { y: between(rng, 4, 9), t: between(rng, 2.6, 3.2) },
      { y: between(rng, 22, 30), t: between(rng, 3.2, 3.8) },
      { y: between(rng, 38, 46), t: between(rng, 2.8, 3.4) },
      { y: between(rng, 52, 57), t: between(rng, 3.4, 4) },
    ].map((l, i) => ({ ...l, d: l.t * (0.3 + 0.17 * i) }));
  }, [rngFor]);
  const scraps = useMemo(() => {
    const rng = rngFor('m2');
    return Array.from({ length: 6 }, () => ({
      x: -8,
      y: between(rng, 4, 60),
      d: rng() * 5,
      t: between(rng, 2.8, 4.4),
      s: Math.max(5, (width / 240) * between(rng, 9, 14)),
      dx: between(rng, -20, 20),
      r: between(rng, 300, 720),
    }));
  }, [rngFor, width]);
  return (
    <div
      className="vfx-gale"
      style={{ '--accent': accent, '--cw': `${width}px` } as React.CSSProperties}
    >
      <i className="vfx-gale__vortex tl" style={{ backgroundImage: art.vortex }} />
      <i className="vfx-gale__vortex br" style={{ backgroundImage: art.vortex }} />
      <div className="vfx-gale__lean">
        {/* Static gusts hugging the top and the art's lower edge: the still frame reads as wind on its own. */}
        <Sheet url={art.fixed[0]} className="vfx-gale__fixed t" />
        <Sheet url={art.fixed[1]} className="vfx-gale__fixed m" />
        {lanes.map((l, i) => (
          <Sheet
            key={i}
            url={art.lanes[i]}
            className="vfx-gale__lane"
            style={{ top: `${l.y}%`, animationDuration: `${l.t}s`, animationDelay: `${-l.d}s` }}
          />
        ))}
        <Particles items={scraps} className="vfx-gale__scrap">
          <b style={{ backgroundImage: art.scrap }} />
        </Particles>
      </div>
    </div>
  );
}
