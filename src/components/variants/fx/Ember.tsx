/** Grease Fire (ember_sparks): flicker flames + rising embers + heat glow. */
import React, { useMemo } from 'react';
import { INK, VB_H, VB_W, between, r1, type Rng } from '../rng';
import { Particles, Sheet, rough, svgUrl, vbStroke, type FxProps } from './parts';

function tongue(x: number, by: number, w: number, h: number, lean: number) {
  // Teardrop flame: base centred on x, tip at (x+lean, by-h).
  const tx = x + lean;
  const ty = by - h;
  return `M${r1(x - w / 2)},${by} C${r1(x - w / 2)},${r1(by - h * 0.45)} ${r1(tx - w * 0.15)},${r1(ty + h * 0.35)} ${r1(tx)},${r1(ty)} C${r1(tx + w * 0.2)},${r1(ty + h * 0.4)} ${r1(x + w / 2)},${r1(by - h * 0.4)} ${r1(x + w / 2)},${by} Z`;
}

function flames(rng: Rng, scale: number) {
  const out: string[] = [];
  // bottom edge
  for (let x = -10; x < VB_W + 20; x += between(rng, 34, 52)) {
    out.push(
      tongue(
        x,
        VB_H + 6,
        between(rng, 60, 96) * scale,
        between(rng, 70, 170) * scale,
        between(rng, -18, 18),
      ),
    );
  }
  // lower sides: licks rising along the edge, shrinking upward
  for (const side of [0, 1]) {
    for (let y = VB_H; y > 380; y -= between(rng, 38, 56)) {
      const f = (y - 380) / (VB_H - 380);
      const x = side ? VB_W + 4 : -4;
      out.push(
        tongue(
          x,
          y,
          between(rng, 60, 90) * scale,
          (50 + 130 * f) * scale + rng() * 24,
          side ? -between(rng, 26, 48) : between(rng, 26, 48),
        ),
      );
    }
  }
  return out.join(' ');
}

export default function Ember({ rngFor, width, accent }: FxProps) {
  const art = useMemo(() => {
    const rng = rngFor('m0');
    const s = vbStroke(width, 1.6);
    const outer = flames(rng, 1);
    const inner = flames(rng, 0.55);
    return {
      outer: svgUrl(
        `<g filter='url(#r)'><path d='${outer}' fill='${accent}' stroke='${INK}' stroke-width='${s}' stroke-linejoin='round'/></g>`,
        rough('r', 0.03, 14, 7),
      ),
      inner: svgUrl(
        `<g filter='url(#r)'><path d='${inner}' fill='#FFE14D' stroke='${INK}' stroke-width='${s * 0.6}'/></g>`,
        rough('r', 0.04, 10, 11),
      ),
    };
  }, [rngFor, width, accent]);
  const embers = useMemo(() => {
    const rng = rngFor('m1');
    return Array.from({ length: 16 }, (_, i) => ({
      // Half from the side flames, half from the bottom edge.
      x: i % 2 ? (rng() < 0.5 ? between(rng, 1, 9) : between(rng, 91, 99)) : between(rng, 4, 96),
      y: i % 2 ? between(rng, 55, 95) : between(rng, 88, 100),
      d: rng() * 6,
      t: between(rng, 3.2, 6),
      s: Math.max(3, (width / 240) * between(rng, 5.5, 9)),
      dx: between(rng, -30, 30) * (width / 240),
      r: between(rng, 90, 360),
    }));
  }, [rngFor, width]);
  return (
    <div className="vfx-ember" style={{ '--accent': accent } as React.CSSProperties}>
      <i className="vfx-ember__glow" />
      <div className="vfx-tilt-grow">
        <Sheet url={art.outer} className="vfx-ember__flame a" />
        <Sheet url={art.inner} className="vfx-ember__flame b" />
      </div>
      <div className="vfx-par-1">
        <Particles items={embers} className="vfx-ember__spark" />
      </div>
    </div>
  );
}
