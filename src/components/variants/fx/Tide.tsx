/** Flash Freeze (tide_frost): fractal frost corners, glint sweep, snow. */
import React, { useMemo } from 'react';
import { INK, VB_H, VB_W, between, r1, type Rng } from '../rng';
import { Particles, Sheet, rough, svgUrl, vbStroke, type FxProps } from './parts';

/** Fern-like ice branch: spine + 60° side barbs, recursing once. */
function branch(
  rng: Rng,
  x: number,
  y: number,
  a: number,
  len: number,
  depth: number,
  out: string[],
) {
  const ex = x + Math.cos(a) * len;
  const ey = y + Math.sin(a) * len;
  out.push(`M${r1(x)},${r1(y)}L${r1(ex)},${r1(ey)}`);
  if (depth <= 0) return;
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const px = x + (ex - x) * t;
    const py = y + (ey - y) * t;
    const l = len * (0.42 - t * 0.22) * between(rng, 0.8, 1.15);
    branch(rng, px, py, a + Math.PI / 3, l, depth - 1, out);
    branch(rng, px, py, a - Math.PI / 3, l, depth - 1, out);
  }
}

function corner(rng: Rng, cx: number, cy: number, dirA: number, size: number) {
  const out: string[] = [];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = dirA + ((i + 0.5) / n - 0.5) * (Math.PI / 2) * 0.9 + between(rng, -0.08, 0.08);
    branch(rng, cx, cy, a, size * between(rng, 0.65, 1), 2, out);
  }
  return out.join('');
}

function rime(rng: Rng, cx: number, cy: number, r: number) {
  // Lumpy quarter-blob of rime hugging a corner.
  const pts: string[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * between(rng, 0.55, 1);
    pts.push(`${r1(cx + Math.cos(a) * rr)},${r1(cy + Math.sin(a) * rr)}`);
  }
  return `M${pts.join('L')}Z`;
}

export default function Tide({ rngFor, width, accent }: FxProps) {
  const art = useMemo(() => {
    const rng = rngFor('m0');
    const s = vbStroke(width, 1.4);
    const C: [number, number, number, number][] = [
      [0, 0, Math.PI / 4, 300],
      [VB_W, 0, (3 * Math.PI) / 4, 280],
      [VB_W, VB_H, (-3 * Math.PI) / 4, 190],
      [0, VB_H, -Math.PI / 4, 200],
    ];
    const ice = C.map(([x, y, a, l]) => corner(rng, x, y, a, l)).join('');
    const pools = C.map(([x, y, , l]) => rime(rng, x, y, l * 0.42)).join('');
    const body =
      `<g filter='url(#r)'><path d='${pools}' fill='${accent}' fill-opacity='.38' stroke='${INK}' stroke-width='${s}'/></g>` +
      `<path d='${ice}' fill='none' stroke='${INK}' stroke-width='${s * 3.2}' stroke-linecap='round'/>` +
      `<path d='${ice}' fill='none' stroke='#fff' stroke-width='${s * 1.6}' stroke-linecap='round'/>` +
      `<path d='${ice}' fill='none' stroke='${accent}' stroke-width='${s * 0.6}' stroke-linecap='round'/>`;
    return {
      ice: svgUrl(body, rough('r', 0.05, 16, 5)),
      // Mask for the glint: the frost strokes only, thick.
      mask: svgUrl(
        `<path d='${ice}' fill='none' stroke='#fff' stroke-width='${s * 3.2}' stroke-linecap='round'/>`,
      ),
    };
  }, [rngFor, width, accent]);
  const snow = useMemo(() => {
    const rng = rngFor('m1');
    return Array.from({ length: 9 }, (_, i) => ({
      x: i % 2 ? between(rng, 2, 18) : between(rng, 82, 98),
      y: between(rng, -6, 4),
      d: rng() * 9,
      t: between(rng, 6, 10),
      s: Math.max(3, (width / 240) * between(rng, 3, 5.5)),
      dx: between(rng, -16, 16),
    }));
  }, [rngFor, width]);
  return (
    <div className="vfx-tide" style={{ '--accent': accent } as React.CSSProperties}>
      <div className="vfx-par-1">
        <Sheet url={art.ice} />
        <div
          className="vfx-tide__glintbox"
          style={{ WebkitMaskImage: art.mask, maskImage: art.mask }}
        >
          <i className="vfx-tide__glint" />
        </div>
      </div>
      <Particles items={snow} className="vfx-tide__flake" />
    </div>
  );
}
