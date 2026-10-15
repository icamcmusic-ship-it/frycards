/**
 * Lazy-loaded renderer for card variants (see src/meta/variants.ts). CardFace
 * hands over the finished face element; this wraps it with the variant's
 * animated ink (fx/*), or splits it into shards (Smash Cut).
 *
 * Props: variant, seed (card id), width, height, face, depth (0 flat, 1 the
 * 3D inspector), plus:
 *   live     ask for full animation (Card3DInspector, PackOpening reveal)
 *   reduced  override the motion setting (tests, gallery)
 *   readable keep the text-protect masks (default true)
 *
 * Grid and table cards show a still, seeded frame until hovered or focused;
 * at most MAX_LIVE cards animate at once, never off-screen, in a hidden tab
 * or under reduced motion (useVariantFx). Tilt comes from the holo system's
 * --px/--py/--act vars when an ancestor's useHoloTilt writes them.
 *
 * The ink sits at z 70, above the holo layers (z 60), so holo blends never
 * wash it out.
 *
 * Painted-art drop-in: when `Overlays/<id>.webp` exists (variantArtUrl) it
 * replaces the procedural ink (Smash Cut keeps its shards and lays the art
 * on top), exactly as in v1.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  type CardVariant,
  type ElementalVariant,
  VARIANT_META,
  variantArtUrl,
} from '../../meta/variants';
import { textMasks, useRegions } from './regions';
import { seededRandom } from './rng';
import { useVariantFx } from './useVariantFx';
import { VARIANT_CSS } from './variantsCss';
import Ember from './fx/Ember';
import Tide from './fx/Tide';
import Root from './fx/Root';
import Gale from './fx/Gale';
import Light from './fx/Light';
import Shadow from './fx/Shadow';
import Void from './fx/Void';
import Shattered from './fx/Shattered';
import type { FxProps } from './fx/parts';

export { shardsFor } from './fx/Shattered';

const STYLE_ID = 'fc-variant-styles';
/** Inject the variant CSS on first use, kept out of the eager stylesheet. */
export function ensureVariantStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = VARIANT_CSS;
  document.head.appendChild(el);
}

const FX: Record<ElementalVariant, React.ComponentType<FxProps>> = {
  ember_sparks: Ember,
  tide_frost: Tide,
  root_overgrown: Root,
  gale_lightning: Gale,
  light_radiant: Light,
  shadow_ink: Shadow,
  void_rift: Void,
};

/** Per-part RNG factory: the same card id + variant + part always draws the
 * same stream, however many times React runs a memo (StrictMode). */
export function rngFactory(variant: CardVariant, seed: string) {
  return (part: string) => seededRandom(`${variant}:v2:${seed}:${part}`);
}

/* ---- painted-art drop-in: probe each URL once per session (v1) ---- */
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

export function usePaintedArt(v: CardVariant): string | null {
  const [ok, setOk] = useState(() => artState.get(v) === 'ok');
  useEffect(() => {
    let live = true;
    const s = probeArt(v);
    if (s !== 'ok' && s !== 'missing') void s.then(() => live && setOk(artState.get(v) === 'ok'));
    return () => {
      live = false;
    };
  }, [v]);
  return ok ? variantArtUrl(v) : null;
}

export default function VariantLayer({
  variant,
  seed,
  width,
  height,
  face,
  depth = 0,
  live,
  reduced,
  readable = true,
}: {
  variant: CardVariant;
  /** Card id: every copy of a card draws the same ink. */
  seed: string;
  width: number;
  height: number;
  face: React.ReactElement;
  depth?: number;
  live?: boolean;
  reduced?: boolean;
  readable?: boolean;
}) {
  ensureVariantStyles();
  const ref = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const fx = useVariantFx(ref, { live, depth, reduced });
  const reg = useRegions(faceRef);
  const masks = textMasks(reg, readable);
  const rngFor = useMemo(() => rngFactory(variant, seed), [variant, seed]);
  const art = usePaintedArt(variant);
  const meta = VARIANT_META[variant];
  const common = {
    'data-variant': variant,
    'data-live': fx.live ? '1' : undefined,
    'data-reduced': fx.reduced ? '1' : undefined,
  };
  const radius = Math.max(3, width * 0.035);
  if (variant === 'shattered') {
    return (
      <div ref={ref} className="vfx-host relative shrink-0" style={{ width, height }} {...common}>
        <Shattered face={face} seed={seed} width={width} height={height} depth={depth} />
        {art && (
          <img
            src={art}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 70 }}
            draggable={false}
          />
        )}
        <span className="sr-only">{meta.name} variant</span>
      </div>
    );
  }
  const Fx = FX[variant];
  return (
    <div ref={ref} className="vfx-host relative shrink-0" style={{ width, height }} {...common}>
      <div ref={faceRef} style={{ width, height }}>
        {face}
      </div>
      <div
        aria-hidden
        className={`vfx vfx--${variant}`}
        style={{ borderRadius: radius, ...masks.frame }}
        data-variant-art={art ? 'painted' : 'procedural'}
      >
        {art ? (
          <img src={art} alt="" className="vfx__sheet w-full h-full" draggable={false} />
        ) : (
          reg && (
            <Fx
              rngFor={rngFor}
              width={width}
              height={height}
              reg={reg}
              masks={masks}
              accent={meta.hex}
            />
          )
        )}
      </div>
      <span className="sr-only">{meta.name} variant</span>
    </div>
  );
}
