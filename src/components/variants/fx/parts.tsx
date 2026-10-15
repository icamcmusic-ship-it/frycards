import React from 'react';
import type { Regions } from '../regions';
import { VB_H, VB_W, type Rng } from '../rng';

export interface FxProps {
  /** A fresh seeded RNG per part key (card id + variant + part): each memo
   * draws its own stream, so StrictMode's double-invoked memos and prod
   * render the same card. */
  rngFor: (part: string) => Rng;
  /** Card px width (stroke scaling, particle sizing). */
  width: number;
  height: number;
  reg: Regions | null;
  masks: { frame: React.CSSProperties; art: React.CSSProperties };
  accent: string;
}

/** A static SVG (string) as a data-URI background; rasterised once by the
 * browser and cached, filters included, so animating its box is free. */
export function svgUrl(body: string, defs = '', vb = `0 0 ${VB_W} ${VB_H}`) {
  const s = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb}' preserveAspectRatio='none'><defs>${defs}</defs>${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
}

export function Sheet({
  url,
  className = '',
  style,
}: {
  key?: React.Key;
  url: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return <i className={`vfx__sheet ${className}`} style={{ backgroundImage: url, ...style }} />;
}

/** Roughen ink edges once (no animation of the filter itself). */
export const rough = (id: string, freq = 0.035, scale = 10, seed = 3) =>
  `<filter id='${id}' x='-10%' y='-10%' width='120%' height='120%'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='2' seed='${seed}'/><feDisplacementMap in='SourceGraphic' scale='${scale}' xChannelSelector='R' yChannelSelector='G'/></filter>`;

export type P = {
  x: number;
  y: number;
  d: number;
  t: number;
  s: number;
  dx?: number;
  r?: number;
  k?: number;
};

/** N particle spans, one shared keyframe; all per-particle values are vars. */
export function Particles({
  items,
  className,
  children,
}: {
  items: P[];
  className: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      {items.map((p, i) => (
        <i
          key={i}
          className={`vfx__p ${className}`}
          style={
            {
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.s,
              height: p.s,
              animationDuration: `${p.t}s`,
              animationDelay: `${-p.d}s`,
              '--dx': `${p.dx ?? 0}px`,
              '--r': `${p.r ?? 0}deg`,
              '--k': p.k ?? 1,
            } as React.CSSProperties
          }
        >
          {children}
        </i>
      ))}
    </>
  );
}

export const sw = (width: number) =>
  width < 100 ? 0.7 : width < 160 ? 1 : width < 260 ? 1.4 : 1.8;
/** Stroke width in viewBox units that renders as `px` screen px. */
export const vbStroke = (width: number, px: number) => (px * VB_W) / width;
