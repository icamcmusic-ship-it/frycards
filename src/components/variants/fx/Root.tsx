/** Overgrowth (root_overgrown): side vines, swaying leaves, rising spores. */
import React, { useMemo } from 'react';
import { INK, VB_H, VB_W, between, r1, type Rng } from '../rng';
import { Particles, Sheet, rough, svgUrl, vbStroke, type FxProps } from './parts';

function vine(rng: Rng, x0: number, side: 1 | -1, top: number) {
  // Wavy stem up the edge from the bottom corner.
  let d = `M${x0},${VB_H + 10}`;
  const pts: [number, number, number][] = [];
  let y = VB_H + 10;
  let x = x0;
  while (y > top) {
    const ny = y - between(rng, 70, 110);
    const nx = x0 + side * between(rng, 4, 34);
    d += ` Q${r1(x + side * between(rng, 10, 40))},${r1((y + ny) / 2)} ${r1(nx)},${r1(ny)}`;
    pts.push([nx, ny, rng()]);
    x = nx;
    y = ny;
  }
  return { d, pts };
}

const LEAF = (s: number, fill: string) =>
  svgUrl(
    `<path d='M50,96 C12,70 10,30 50,4 C90,30 88,70 50,96Z' fill='${fill}' stroke='${INK}' stroke-width='${s}'/><path d='M50,92 L50,16' stroke='${INK}' stroke-width='${s * 0.7}' fill='none'/>`,
    '',
    '0 0 100 100',
  );

export default function Root({ rngFor, width, accent }: FxProps) {
  const { stems, leaves, leaf } = useMemo(() => {
    const rng = rngFor('m0');
    const s = vbStroke(width, 1.6);
    const L = vine(rng, 8, 1, between(rng, 120, 260));
    const R = vine(rng, VB_W - 8, -1, between(rng, 160, 360));
    const curl = (x: number, y: number, k: 1 | -1) =>
      `M${x},${y} q${k * 40},-10 ${k * 46},30 q${k * 4},30 ${-k * 22},26 q${-k * 16},-4 ${-k * 6},-18`;
    const stemD = `${L.d} ${R.d} ${curl(20, 110, 1)} ${curl(VB_W - 20, 150, -1)}`;
    const stems = svgUrl(
      `<g filter='url(#r)'><path d='${stemD}' fill='none' stroke='${INK}' stroke-width='${s * 5}' stroke-linecap='round'/><path d='${stemD}' fill='none' stroke='${accent}' stroke-width='${s * 2.6}' stroke-linecap='round'/></g>`,
      rough('r', 0.02, 6, 2),
    );
    const leaves = [
      ...L.pts.map((p) => [...p, 1] as const),
      ...R.pts.map((p) => [...p, -1] as const),
    ].flatMap(([x, y, k, side]) => {
      const n = k > 0.4 ? 2 : 1;
      return Array.from({ length: n }, (_, j) => ({
        x: (x / VB_W) * 100,
        y: (y / VB_H) * 100,
        // Point outward-and-up from the stem, alternate sides.
        r: side * (j ? between(rng, 20, 60) : between(rng, 80, 130)),
        g: Math.floor(rng() * 3),
        size: between(rng, 0.075, 0.11),
        d: rng() * 4,
      }));
    });
    return { stems, leaves, leaf: LEAF(4, accent) };
  }, [rngFor, width, accent]);
  const spores = useMemo(() => {
    const rng = rngFor('m1');
    return Array.from({ length: 8 }, () => ({
      x: between(rng, 4, 96),
      y: between(rng, 50, 80),
      d: rng() * 8,
      t: between(rng, 5, 8),
      s: Math.max(2.5, (width / 240) * between(rng, 2.5, 4.5)),
      dx: between(rng, -14, 14),
    }));
  }, [rngFor, width]);
  return (
    <div className="vfx-root" style={{ '--accent': accent } as React.CSSProperties}>
      <div className="vfx-par-1">
        <Sheet url={stems} />
        {leaves.map((l, i) => (
          <i
            key={i}
            className={`vfx-root__leaf g${l.g}`}
            style={
              {
                left: `${l.x}%`,
                top: `${l.y}%`,
                width: width * l.size,
                height: width * l.size,
                backgroundImage: leaf,
                '--r': `${l.r}deg`,
                animationDelay: `${-l.d}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <Particles items={spores} className="vfx-root__spore" />
    </div>
  );
}
