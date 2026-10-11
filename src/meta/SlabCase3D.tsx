/**
 * The graded slab as a SOLID — the case the 3D Showroom stands in the room.
 *
 * The flat `GradedSlab` plate is the label-and-window artwork; this wraps it
 * in the object a collector actually holds: a thick clear acrylic case with
 *
 *  - a FRONT glass and a BACK glass, a full case-thickness apart, so the plate
 *    holding the card sits in a recessed well you can see down into from an
 *    angle (the clear acrylic margin round it is its own floor plate);
 *  - side walls on all four sides, rounded at the corners (each corner is a
 *    few facets) and shaded across their thickness so both long edges read
 *    as bevels;
 *  - a raised ridge splitting the upper LABEL CHAMBER (cert, grade, service)
 *    from the card well, as on every real case;
 *  - lighting computed from the pose — each face's normal is turned by the
 *    same yaw/pitch as the object, so the specular band on the glass, the
 *    bright bevel and the lit wall all move as it turns, with a thin
 *    red/cyan fringe on the glass rim for the refraction of a thick edge;
 *  - grade effects on the WHOLE object, not just the face: the premium ring
 *    and holo run round the front rim, the walls and the back rim, the glow is
 *    a halo at the case's mid-plane (visible from any side), twinkles sit on
 *    every face, and low grades come back scuffed, chipped and cracked
 *    front, back and edge.
 *
 * Every face is `backface-visibility: hidden`: the case is convex, so the faces
 * pointing away are exactly the ones that must not draw. All animation goes
 * through the `slab-*` classes (slabCss.ts) and this file's own `slab3d-*`
 * classes, which stop under the Motion setting / prefers-reduced-motion.
 */
import React, { useMemo } from 'react';
import { GradedSlab, premiumTier, conditionOf } from './GradedSlab';
import { GradedCard, GRADING_SERVICE_BY_ID, fmtGrade } from './grading';
import { getCardBackImage } from './cardback';
import { CARD_SIZES } from '../components/CardFaceV4';

/** The flat plate's own footprint at the `full` tier (card + 14px padding,
 * 3px ink border, the 56px label, the cert strip) — measured in the harness. */
const PLATE_W = CARD_SIZES.full.w + 28;
const PLATE_H = 448;
/** Where the label chamber ends on the plate (padding + label block + gap). */
const PLATE_LABEL_BOTTOM = 3 + 14 + 56 + 3;
/** Clear acrylic margin between the plate and the outer wall. */
const MARGIN = 13;
/** Case thickness (front glass to back glass). */
export const SLAB_DEPTH = 44;
const RADIUS = 18;
/** Plate depth inside the case: behind centre, so the well reads as deep. */
const PLATE_Z = -6;

export const SLAB_CASE_W = PLATE_W + MARGIN * 2;
export const SLAB_CASE_H = PLATE_H + MARGIN * 2;

/** Pitch limit for the slab: it is heavy and you look AT its faces. */
export const SLAB_MAX_PITCH = 58;

export const SLAB3D_CSS = `
@keyframes slab3d-wall { to { background-position: 300% 0; } }
.slab3d-wall-holo { background-size: 300% 100%; animation: slab3d-wall 6s linear infinite; }
@keyframes slab3d-halo { 0%,100% { opacity: .75; } 50% { opacity: 1; } }
.slab3d-halo { animation: slab3d-halo 3.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  html:not([data-motion='full']) .slab3d-wall-holo,
  html:not([data-motion='full']) .slab3d-halo { animation: none; }
}
html[data-motion='reduced'] .slab3d-wall-holo,
html[data-motion='reduced'] .slab3d-halo,
html[data-motion='static'] .slab3d-wall-holo,
html[data-motion='static'] .slab3d-halo { animation: none; }
`;

type V3 = [number, number, number];
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
/** Key light from the upper left, in front (CSS space: +y is DOWN, +z toward
 * the viewer). */
const LIGHT = norm([-0.45, -0.6, 0.65]);
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);

/** Turn a local normal by the object's pose exactly as the CSS transform
 * `rotateX(pitch) rotateY(yaw)` turns the element. */
export function turn(n: V3, yaw: number, pitch: number): V3 {
  const a = (yaw * Math.PI) / 180;
  const b = (pitch * Math.PI) / 180;
  const x1 = n[0] * Math.cos(a) + n[2] * Math.sin(a);
  const z1 = -n[0] * Math.sin(a) + n[2] * Math.cos(a);
  const y1 = n[1];
  return [x1, y1 * Math.cos(b) - z1 * Math.sin(b), y1 * Math.sin(b) + z1 * Math.cos(b)];
}
/** Diffuse and specular terms for a face with local normal `n`. */
export function shade(n: V3, yaw: number, pitch: number): { diff: number; spec: number } {
  const w = turn(n, yaw, pitch);
  const d = w[0] * LIGHT[0] + w[1] * LIGHT[1] + w[2] * LIGHT[2];
  const h = w[0] * HALF[0] + w[1] * HALF[1] + w[2] * HALF[2];
  return { diff: Math.max(0, d), spec: Math.pow(Math.max(0, h), 28) };
}

/** One strip of the side wall, standing on the perimeter. */
type Strip = { x: number; y: number; len: number; phi: number; key: string };
function perimeter(w: number, h: number, r: number, facets = 4): Strip[] {
  const out: Strip[] = [];
  const hw = w / 2;
  const hh = h / 2;
  out.push({ key: 'r', x: hw, y: 0, len: h - 2 * r, phi: 0 });
  out.push({ key: 'b', x: 0, y: hh, len: w - 2 * r, phi: 90 });
  out.push({ key: 'l', x: -hw, y: 0, len: h - 2 * r, phi: 180 });
  out.push({ key: 't', x: 0, y: -hh, len: w - 2 * r, phi: 270 });
  const step = 90 / facets;
  const chord = 2 * r * Math.sin(((step / 2) * Math.PI) / 180) + 0.8;
  const corners: [number, number, number][] = [
    [hw - r, hh - r, 0],
    [-hw + r, hh - r, 90],
    [-hw + r, -hh + r, 180],
    [hw - r, -hh + r, 270],
  ];
  // Each facet sits at the arc's apothem so it meets its neighbours.
  const apo = r * Math.cos(((step / 2) * Math.PI) / 180);
  corners.forEach(([cx, cy, start], ci) => {
    for (let i = 0; i < facets; i++) {
      const phi = start + step * (i + 0.5);
      const rad = (phi * Math.PI) / 180;
      out.push({
        key: `c${ci}${i}`,
        x: cx + apo * Math.cos(rad),
        y: cy + apo * Math.sin(rad),
        len: chord,
        phi,
      });
    }
  });
  return out;
}

const GLOW: Record<'mint' | 'mintplus' | 'gem' | 'pristine', string> = {
  mint: 'rgba(110,200,255,0.75)',
  mintplus: 'rgba(185,139,255,0.8)',
  gem: 'rgba(240,196,25,0.9)',
  // PRISTINE: the black-label case — a gold halo around a black shell.
  pristine: 'rgba(232,199,106,1)',
};
const RING: Record<'mint' | 'mintplus' | 'gem' | 'pristine', string> = {
  mint: 'conic-gradient(from var(--slab-angle), #9fd8ff, #e9f6ff, #5aa9e6, #e9f6ff, #9fd8ff)',
  mintplus:
    'conic-gradient(from var(--slab-angle), #ff7ad9, #ffd36e, #7dffb0, #6ec8ff, #b98bff, #ff7ad9)',
  gem: 'conic-gradient(from var(--slab-angle), #fff3b0, #f0c419, #8a5a00, #ffe083, #fffbe6, #f0c419, #fff3b0)',
  pristine:
    'conic-gradient(from var(--slab-angle), #0b0b0b, #e8c76a, #fff6d6, #0b0b0b, #b8892b, #fff6d6, #0b0b0b)',
};
const WALL_HOLO: Record<'mint' | 'mintplus' | 'gem' | 'pristine', string> = {
  mint: 'linear-gradient(90deg, #5aa9e6, #e9f6ff, #9fd8ff, #3c5a73, #5aa9e6)',
  mintplus: 'linear-gradient(90deg, #ff7ad9, #ffd36e, #7dffb0, #6ec8ff, #b98bff, #ff7ad9)',
  gem: 'linear-gradient(90deg, #8a5a00, #f0c419, #fff3b0, #c48a00, #ffe083, #8a5a00)',
  pristine: 'linear-gradient(90deg, #050505, #c9a24a, #fff1c2, #050505, #e8c76a, #050505)',
};

/** Stable 0..1 stream for placing scuffs/twinkles per slab. */
function stream(seedStr: string): () => number {
  let x = 2166136261;
  for (let i = 0; i < seedStr.length; i++) x = Math.imul(x ^ seedStr.charCodeAt(i), 16777619);
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function Twinkle({ left, top, delay, size = 12 }: Record<string, number>) {
  return (
    <span
      aria-hidden
      className="slab-twinkle absolute pointer-events-none"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        animationDelay: `${delay}s`,
        background:
          'radial-gradient(circle, #fff 0 20%, transparent 21%), conic-gradient(from 45deg, transparent 0 20%, #fff8c4 20% 30%, transparent 30% 45%, #fff8c4 45% 55%, transparent 55% 70%, #fff8c4 70% 80%, transparent 80%)',
      }}
    />
  );
}

/** Damage on a glass face, in a 100×140 box: scuffs (≥1), more scuffs (≥2), a
 * spidered crack through label chamber and window (3). */
function GlassDamage({ level, seed }: { level: number; seed: string }) {
  const paths = useMemo(() => {
    const r = stream(seed);
    const scuffs: string[] = [];
    const n = level === 1 ? 2 : level === 2 ? 5 : 7;
    for (let i = 0; i < n; i++) {
      const x = 8 + r() * 84;
      const y = 8 + r() * 124;
      scuffs.push(
        `M${x.toFixed(1)} ${y.toFixed(1)} l${(r() * 14 - 7).toFixed(1)} ${(r() * 6 - 3).toFixed(1)}`,
      );
    }
    let crack = '';
    let branches = '';
    if (level === 3) {
      let x = 62 + r() * 30;
      let y = -1;
      crack = `M${x.toFixed(1)} ${y}`;
      while (y < 70) {
        x += r() * 12 - 7;
        y += 6 + r() * 9;
        crack += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
        if (r() < 0.45)
          branches += `M${x.toFixed(1)} ${y.toFixed(1)} l${(r() * 16 - 4).toFixed(1)} ${(r() * 10 - 2).toFixed(1)} `;
      }
    }
    return { scuffs, crack, branches };
  }, [level, seed]);
  return (
    <svg
      aria-hidden
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
    >
      {paths.scuffs.map((d, i) => (
        <path key={i} d={d} stroke="rgba(255,255,255,0.35)" strokeWidth="0.35" fill="none" />
      ))}
      {paths.crack && (
        <>
          <path d={paths.crack} stroke="rgba(0,0,0,0.45)" strokeWidth="1.1" fill="none" />
          <path d={paths.crack} stroke="rgba(255,255,255,0.95)" strokeWidth="0.55" fill="none" />
          <path d={paths.branches} stroke="rgba(255,255,255,0.75)" strokeWidth="0.35" fill="none" />
        </>
      )}
    </svg>
  );
}

const face: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  backfaceVisibility: 'hidden',
  WebkitBackfaceVisibility: 'hidden',
};

/** The premium conic ring, drawn as a border on a glass face. */
function Ring({ bg, inset = 0 }: { bg: string; inset?: number }) {
  return (
    <div
      aria-hidden
      className="slab-ring absolute pointer-events-none"
      style={{
        inset,
        borderRadius: RADIUS,
        padding: 4,
        background: bg,
        WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
      }}
    />
  );
}

/** The plate is the expensive subtree (a whole CardFace); it does not depend
 * on the pose, so it is not re-rendered 60×/s while the case turns. */
const Plate = React.memo(function Plate({ g }: { g: GradedCard }) {
  return <GradedSlab g={g} size="full" embedded />;
});

export function SlabCase3D({ g, yaw, pitch }: { g: GradedCard; yaw: number; pitch: number }) {
  const svc = GRADING_SERVICE_BY_ID[g.service];
  const tier = premiumTier(g.grade, !!g.pristine);
  const condition = conditionOf(g.grade);
  const W = SLAB_CASE_W;
  const H = SLAB_CASE_H;
  const t = SLAB_DEPTH / 2;
  const strips = useMemo(() => perimeter(W, H, RADIUS), [W, H]);
  const back = getCardBackImage();
  const glow = tier ? GLOW[tier] : null;

  const front = shade([0, 0, 1], yaw, pitch);
  const rear = shade([0, 0, -1], yaw, pitch);
  // Where the specular band crosses the glass: it slides opposite the turn,
  // the way a reflection in a held sheet of glass does.
  const bandPos = (y: number, p: number) => 50 - y * 1.3 + p * 0.4;
  const fy = ((((yaw + 180) % 360) + 360) % 360) - 180;
  const by = (((yaw % 360) + 360) % 360) - 180;

  const rnd = stream(g.id + 'tw');
  const twinkles =
    tier === 'gem' || tier === 'mintplus' || tier === 'pristine'
      ? Array.from({ length: tier === 'mintplus' ? 3 : tier === 'pristine' ? 7 : 5 }, (_, i) => ({
          left: 6 + rnd() * 88,
          top: 4 + rnd() * 92,
          delay: i * 0.55,
        }))
      : [];

  const glass = (
    spec: number,
    diff: number,
    pos: number,
    mirror: boolean,
  ): React.CSSProperties => ({
    background: [
      // the moving specular band
      `linear-gradient(${mirror ? 62 : 118}deg, transparent ${pos - 22}%, rgba(255,255,255,${(0.05 + spec * 0.5).toFixed(3)}) ${pos - 4}%, rgba(255,255,255,${(0.12 + spec * 0.55).toFixed(3)}) ${pos}%, transparent ${pos + 14}%)`,
      // a soft secondary sheen
      `linear-gradient(180deg, rgba(255,255,255,${(0.08 + diff * 0.08).toFixed(3)}) 0%, rgba(255,255,255,0) 30%, rgba(0,0,0,0.06) 100%)`,
    ].join(','),
  });

  /** Rim of a glass face: the clear margin, bevelled, with a chromatic fringe
   * on its inner edge for the refraction of the thick acrylic. */
  const rim = (diff: number, spec: number, yy: number) => {
    const shift = Math.max(-1.5, Math.min(1.5, yy / 30));
    return (
      <>
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: RADIUS,
            border: `${MARGIN}px solid rgba(225,235,245,${(0.16 + diff * 0.14).toFixed(3)})`,
            boxShadow: [
              `inset 1.5px 1.5px 0 rgba(255,255,255,${(0.45 + spec * 0.5).toFixed(3)})`,
              `inset -1.5px -1.5px 0 rgba(0,0,0,0.35)`,
              `0 0 0 2px var(--c-ink, #111)`,
            ].join(','),
          }}
        />
        {/* the bevel highlight on the outer edge */}
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            inset: 2,
            borderRadius: RADIUS - 2,
            border: '3px solid transparent',
            background: `linear-gradient(135deg, rgba(255,255,255,${(0.35 + spec * 0.6).toFixed(3)}), rgba(255,255,255,0.04) 40%, rgba(0,0,0,0.25)) border-box`,
            WebkitMask: 'linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />
        {/* refraction fringe on the inner edge of the margin */}
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            inset: MARGIN - 1,
            borderRadius: 6,
            boxShadow: `${shift}px 0 0 1px rgba(255,60,90,0.28), ${-shift}px 0 0 1px rgba(60,220,255,0.28)`,
          }}
        />
      </>
    );
  };

  return (
    <>
      {/* Halo at the mid-plane: the grade glow, visible from any side. */}
      {glow && (
        <div
          aria-hidden
          className="slab3d-halo"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: W,
            height: H,
            borderRadius: RADIUS,
            transform: 'translate(-50%, -50%)',
            boxShadow: `0 0 34px 10px ${glow}, 0 0 70px 18px ${glow.replace(/[\d.]+\)$/, '0.35)')}`,
          }}
        />
      )}

      {/* Back glass. */}
      <div
        style={{
          ...face,
          width: W,
          height: H,
          borderRadius: RADIUS,
          overflow: 'hidden',
          transform: `translate(-50%, -50%) rotateY(180deg) translateZ(${t}px)`,
          background: `linear-gradient(rgba(10,12,16,0.55), rgba(10,12,16,0.55)), ${svc.slab.frame}`,
        }}
      >
        {/* back of the label chamber */}
        <div
          className="absolute flex items-center justify-between px-3"
          style={{
            left: MARGIN + 17,
            right: MARGIN + 17,
            top: MARGIN + 17,
            height: PLATE_LABEL_BOTTOM - 22,
            background: svc.slab.label,
            color: svc.slab.labelText,
            border: '2px solid var(--c-ink, #111)',
            borderRadius: 3,
          }}
        >
          <div className="heading-font leading-tight" style={{ fontSize: 13 }}>
            {svc.slab.stamp}
            <div className="font-mono" style={{ fontSize: 10, opacity: 0.8 }}>
              {g.grade != null ? `GRADE ${fmtGrade(g.grade)}` : 'PENDING'} · {svc.short}
            </div>
          </div>
          <span className="flex items-stretch gap-[1px] h-7" aria-hidden>
            {Array.from({ length: 22 }, (_, i) => (
              <span
                key={i}
                style={{ width: 1 + ((i * 7 + g.id.length) % 3), background: svc.slab.labelText }}
              />
            ))}
          </span>
        </div>
        {/* card back in the well */}
        <div
          className={back ? 'absolute' : 'absolute classic-black-back'}
          style={{
            left: MARGIN + 17,
            right: MARGIN + 17,
            top: MARGIN + PLATE_LABEL_BOTTOM + 3,
            height: CARD_SIZES.full.h,
            borderRadius: 6,
            border: '4px solid var(--c-ink, #111)',
            filter: condition === 3 ? 'sepia(0.4)' : undefined,
            ...(back
              ? {
                  backgroundImage: `url(${back})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : null),
          }}
        />
        {tier && (
          <div
            aria-hidden
            className="slab-holo absolute inset-0 pointer-events-none"
            style={{ backgroundImage: WALL_HOLO[tier], opacity: 0.16, mixBlendMode: 'screen' }}
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0"
          style={glass(rear.spec, rear.diff, bandPos(by, -pitch), true)}
        />
        {rim(rear.diff, rear.spec, by)}
        {tier && <Ring bg={RING[tier]} />}
        {condition > 0 && <GlassDamage level={condition} seed={g.id + 'back'} />}
        {twinkles.slice(0, 3).map((tw, i) => (
          <Twinkle key={i} left={100 - tw.left} top={tw.top} delay={tw.delay + 0.3} />
        ))}
      </div>

      {/* The clear acrylic floor of the well, behind the plate. */}
      <div
        aria-hidden
        style={{
          ...face,
          width: W - 4,
          height: H - 4,
          borderRadius: RADIUS - 2,
          transform: `translate(-50%, -50%) translateZ(${PLATE_Z - 3}px)`,
          background: `linear-gradient(160deg, rgba(210,225,240,0.5), rgba(120,140,160,0.35) 60%, rgba(200,215,230,0.45)), ${svc.slab.frame}`,
          boxShadow: 'inset 0 0 18px rgba(0,0,0,0.55)',
        }}
      />

      {/* The plate: label chamber + card well. */}
      <div
        style={{
          ...face,
          width: PLATE_W,
          height: PLATE_H,
          transform: `translate(-50%, -50%) translateZ(${PLATE_Z}px)`,
        }}
      >
        <Plate g={g} />
      </div>

      {/* Front glass. */}
      <div
        style={{
          ...face,
          width: W,
          height: H,
          borderRadius: RADIUS,
          overflow: 'hidden',
          transform: `translate(-50%, -50%) translateZ(${t}px)`,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={glass(front.spec, front.diff, bandPos(fy, pitch), false)}
        />
        {/* the ridge between the label chamber and the card well */}
        <div
          aria-hidden
          className="absolute"
          style={{
            left: MARGIN - 1,
            right: MARGIN - 1,
            top: MARGIN + PLATE_LABEL_BOTTOM - 4,
            height: 6,
            borderRadius: 3,
            background: `linear-gradient(180deg, rgba(255,255,255,${(0.55 + front.spec * 0.4).toFixed(3)}), rgba(200,215,230,0.25) 45%, rgba(0,0,0,0.35))`,
          }}
        />
        {rim(front.diff, front.spec, fy)}
        {tier && <Ring bg={RING[tier]} />}
        {tier && (
          <div
            aria-hidden
            className="slab-holo absolute pointer-events-none"
            style={{
              inset: 0,
              borderRadius: RADIUS,
              border: `${MARGIN - 4}px solid transparent`,
              backgroundImage: WALL_HOLO[tier],
              backgroundOrigin: 'border-box',
              WebkitMask: 'linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
              opacity: 0.4,
              mixBlendMode: 'screen',
            }}
          />
        )}
        {condition > 0 && <GlassDamage level={condition} seed={g.id + 'front'} />}
        {twinkles.map((tw, i) => (
          <Twinkle key={i} left={tw.left} top={tw.top} delay={tw.delay} />
        ))}
      </div>

      {/* Side walls, on all four sides and round the corners. */}
      {strips.map((s, i) => {
        const rad = (s.phi * Math.PI) / 180;
        const l = shade([Math.cos(rad), Math.sin(rad), 0], yaw, pitch);
        const lit = 0.32 + l.diff * 0.5;
        const chip = condition === 3 && (s.key === 'c00' || s.key === 'r' || s.key === 'c21');
        return (
          <div
            key={s.key}
            aria-hidden
            style={{
              ...face,
              width: SLAB_DEPTH,
              height: s.len,
              transform: `translate(-50%, -50%) translate3d(${s.x}px, ${s.y}px, 0) rotateZ(${s.phi}deg) rotateY(90deg)`,
              // Across the thickness: bright bevel, clear body, bright bevel.
              background: [
                `linear-gradient(90deg, rgba(255,255,255,${(0.35 + l.spec * 0.6).toFixed(3)}) 0, rgba(255,255,255,0.08) 14%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.08) 86%, rgba(255,255,255,${(0.3 + l.spec * 0.5).toFixed(3)}) 100%)`,
                `linear-gradient(rgba(0,0,0,${(0.55 - lit * 0.5).toFixed(3)}), rgba(0,0,0,${(0.55 - lit * 0.5).toFixed(3)}))`,
                `linear-gradient(90deg, rgba(200,215,230,0.55), rgba(160,180,200,0.4), rgba(200,215,230,0.55))`,
                svc.slab.frame,
              ].join(','),
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35)',
            }}
          >
            {tier && (
              <div
                className="slab3d-wall-holo absolute inset-0"
                style={{
                  backgroundImage: WALL_HOLO[tier],
                  opacity: 0.55 + l.spec * 0.4,
                  mixBlendMode: 'screen',
                  animationDelay: `${-i * 0.15}s`,
                }}
              />
            )}
            {(tier === 'gem' || tier === 'pristine') && (s.key === 'r' || s.key === 'l') && (
              <>
                <Twinkle left={50} top={22} delay={i * 0.4} size={10} />
                <Twinkle left={40} top={70} delay={i * 0.4 + 1.1} size={9} />
              </>
            )}
            {condition >= 2 && (s.key === 'l' || s.key === 'b') && (
              <div
                className="absolute"
                style={{
                  left: '20%',
                  right: '30%',
                  top: '35%',
                  height: 1,
                  background: 'rgba(255,255,255,0.45)',
                  transform: 'rotate(-14deg)',
                }}
              />
            )}
            {chip && (
              <div
                className="absolute"
                style={{
                  left: '58%',
                  top: s.key === 'r' ? '18%' : '20%',
                  width: '42%',
                  height: s.key === 'r' ? 22 : '60%',
                  background: 'rgba(10,10,10,0.6)',
                  clipPath: 'polygon(100% 0, 15% 40%, 60% 55%, 0 70%, 100% 100%)',
                  borderLeft: '1px solid rgba(255,255,255,0.8)',
                }}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
