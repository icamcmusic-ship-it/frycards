/**
 * The 3D Showroom stage — a card (or a slab) as a physical object in a room.
 *
 * `Card3DInspector` is the "hold it up to the light" view: a flat face that
 * tilts ±14° under the pointer and flips on a button. That is the right thing
 * for a modal hanging off a grid, and it is deliberately NOT this. Here the
 * card is a solid with thickness, standing in an environment, and the player
 * has the controls: a full 360° yaw (drag past the edge and the object keeps
 * turning — you see the back, then the front again, with the four edges
 * passing through), a pitch that goes far enough to look at the card from
 * above or below, a zoom that runs from "on the shelf" to "reading the
 * copyright line", and momentum, so a flick spins it.
 *
 * Everything is CSS 3D — `transform-style: preserve-3d` on a stack of six
 * faces — rather than a WebGL dependency. The card face is the same
 * `<CardFace>` React tree the rest of the game renders, so the object in the
 * room is the real card, not a screenshot of one.
 *
 * ENVIRONMENT. Rarity picks the room. Common through Rare stand in a plain
 * photographer's studio (a soft key light and a vignette). **Super-Rare and
 * above each get their own** — an ion sweep, a gold-dust hall, an aurora, a
 * prism chamber, an ember storm — plus per-rarity CARD EFFECTS that live in
 * the 3D space with the object: an orbiting ring of motes at the card's own
 * depth, a rim light that tracks the yaw, and a floor glow in the room's
 * colour. The rarer the card, the more the room does.
 *
 * Reduced motion is honoured throughout: the ambient room animations and the
 * spin momentum stop, and auto-spin never starts. Manual control still works —
 * a player who asked for less motion asked for less AMBIENT motion, not for a
 * turntable that refuses to turn.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CardDef } from '../game/v3/cards';
import { CardFace, CARD_SIZES } from './CardFaceV4';
import { getCardBackImage } from '../meta/cardback';
import { rarityTier } from '../meta/rarity';
import { cn } from '../lib/utils';

/** Zoom limits. 0.35 fits the whole object plus room on a short phone; 3.2 is
 * far enough in to read the smallest rules text on a `full` card face. */
export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 3.2;
/** Pitch is clamped rather than free: past ~80° the card is edge-on and there
 * is nothing to look at, and letting it roll over the pole inverts the drag
 * direction, which feels broken rather than free. Yaw is deliberately NOT
 * clamped — that is the whole point of the room. */
export const MAX_PITCH = 80;

/** Card stock, in the same px space as CARD_SIZES. A real card is ~0.3mm on a
 * 63mm face; at that ratio the edge would be a half-pixel and the object would
 * read as a plane. This is a deliberate stylization — thick enough to see the
 * solid turn over, thin enough to still be a card. */
const CARD_THICKNESS = 9;
/** The acrylic case is genuinely a chunky object, so the slab keeps a much
 * heavier edge. */
const SLAB_THICKNESS = 34;
/** Vertical room the HUD strip needs at the bottom of the stage — subtracted
 * from the fit budget so the controls never sit on top of the object. */
const HUD_RESERVE = 84;

export type ShowroomMood = 'studio' | 'ion' | 'gold' | 'aurora' | 'prism' | 'ember';

/** Everything the room needs to know about the object standing in it. */
export type RoomTheme = {
  mood: ShowroomMood;
  /** Display name of the treatment, printed on the HUD. */
  label: string;
  /** Key light / rim / particle colour. */
  key: string;
  accent: string;
  /** Backdrop gradient behind everything. */
  backdrop: string;
  /** Orbiting motes in the 3D space. 0 = none (the plain studio). */
  motes: number;
  /** Rarity tier that earned this room, for the "SUPER-RARE+" HUD note. */
  premium: boolean;
};

/**
 * Room per rarity. Super-Rare is the floor for a special room — that is the
 * brief's line, and it is also where the pack odds start calling a pull
 * notable, so the two agree.
 */
export function roomForRarity(rarity?: string): RoomTheme {
  switch (rarity) {
    case 'Super-Rare':
      return {
        mood: 'ion',
        label: 'ION SWEEP',
        key: '#4fc3ff',
        accent: '#b6ecff',
        backdrop: 'radial-gradient(120% 90% at 50% 8%, #123a52 0%, #0b1d2b 45%, #05090f 100%)',
        motes: 14,
        premium: true,
      };
    case 'Ultra-Rare':
      return {
        mood: 'gold',
        label: 'GILDED HALL',
        key: '#ffd45e',
        accent: '#fff2c2',
        backdrop: 'radial-gradient(120% 90% at 50% 6%, #4a3a12 0%, #241a06 48%, #0a0703 100%)',
        motes: 20,
        premium: true,
      };
    case 'Full-Art':
      return {
        mood: 'aurora',
        label: 'AURORA VAULT',
        key: '#3ff0c0',
        accent: '#c8fff0',
        backdrop: 'radial-gradient(120% 90% at 50% 8%, #0f4a42 0%, #072722 48%, #030c0b 100%)',
        motes: 22,
        premium: true,
      };
    case 'Alt-Art':
      return {
        mood: 'prism',
        label: 'PRISM CHAMBER',
        key: '#ff77d9',
        accent: '#ffd6f4',
        backdrop: 'radial-gradient(120% 90% at 50% 8%, #4a1244 0%, #26082444 48%, #0a0410 100%)',
        motes: 26,
        premium: true,
      };
    case 'Mythic':
      return {
        mood: 'ember',
        label: 'EMBER FORGE',
        key: '#ff8a3d',
        accent: '#ffd7a8',
        backdrop: 'radial-gradient(120% 90% at 50% 10%, #5a1608 0%, #2a0a05 46%, #0c0402 100%)',
        motes: 30,
        premium: true,
      };
    default:
      return {
        mood: 'studio',
        label: 'STUDIO',
        key: '#cfd8e3',
        accent: '#ffffff',
        backdrop: 'radial-gradient(120% 90% at 50% 4%, #2b3038 0%, #16191e 50%, #08090b 100%)',
        motes: 0,
        premium: false,
      };
  }
}

/** True for the rarities that earn a special room — Super-Rare and up. */
export function isPremiumRarity(rarity?: string): boolean {
  return rarityTier(rarity) >= rarityTier('Super-Rare');
}

export const SHOWROOM_CSS = `
@keyframes showroom-sweep {
  0% { transform: translate3d(-40%, 0, 0) rotate(12deg); opacity: 0; }
  20% { opacity: 0.65; }
  80% { opacity: 0.4; }
  100% { transform: translate3d(140%, 0, 0) rotate(12deg); opacity: 0; }
}
@keyframes showroom-drift {
  0% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.15; }
  50% { transform: translate3d(0, -26px, 0) scale(1.35); opacity: 0.75; }
  100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.15; }
}
@keyframes showroom-aurora {
  0% { transform: translate3d(-12%, 0, 0) skewX(-14deg) scaleY(1); opacity: 0.35; }
  50% { transform: translate3d(12%, -4%, 0) skewX(10deg) scaleY(1.25); opacity: 0.7; }
  100% { transform: translate3d(-12%, 0, 0) skewX(-14deg) scaleY(1); opacity: 0.35; }
}
@keyframes showroom-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.9; }
}
.showroom-sweep { animation: showroom-sweep 7s linear infinite; }
.showroom-drift { animation: showroom-drift 6s ease-in-out infinite; }
.showroom-aurora { animation: showroom-aurora 11s ease-in-out infinite; }
.showroom-pulse { animation: showroom-pulse 3.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .showroom-sweep, .showroom-drift, .showroom-aurora, .showroom-pulse {
    animation: none;
  }
}
`;

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Live camera state. Yaw is unbounded (wrapped only for DISPLAY). */
export type Pose = { yaw: number; pitch: number; zoom: number };
export const DEFAULT_POSE: Pose = { yaw: 0, pitch: 0, zoom: 1 };

/** Wrap any yaw into 0…359 for the readout, so a card spun eleven times does
 * not report 3960°. */
export function displayYaw(yaw: number): number {
  return ((Math.round(yaw) % 360) + 360) % 360;
}

/** Which side of the object is facing the camera at this yaw — drives the
 * FRONT/BACK readout and the aria live text, so a screen-reader user knows
 * what the turntable is showing. */
export function facingSide(yaw: number): 'front' | 'back' | 'edge' {
  const y = displayYaw(yaw);
  if (y > 80 && y < 100) return 'edge';
  if (y > 260 && y < 280) return 'edge';
  return y > 90 && y < 270 ? 'back' : 'front';
}

export function clampPose(p: Pose): Pose {
  return {
    yaw: p.yaw,
    pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p.pitch)),
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, p.zoom)),
  };
}

/**
 * The six-faced solid. `front`/`back` are arbitrary React trees so the same
 * geometry carries a raw card, a slab, or anything else with two sides.
 */
function Solid({
  w,
  h,
  thickness,
  front,
  back,
  edge,
}: {
  w: number;
  h: number;
  thickness: number;
  front: React.ReactNode;
  back: React.ReactNode;
  /** Edge colour of the stock — paper white for a card, tinted acrylic for a
   * slab. */
  edge: string;
}) {
  const t = thickness / 2;
  const face: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    backfaceVisibility: 'hidden',
  };
  return (
    <>
      <div
        style={{
          ...face,
          width: w,
          height: h,
          transform: `translate(-50%, -50%) translateZ(${t}px)`,
        }}
      >
        {front}
      </div>
      <div
        style={{
          ...face,
          width: w,
          height: h,
          transform: `translate(-50%, -50%) rotateY(180deg) translateZ(${t}px)`,
        }}
      >
        {back}
      </div>
      {/* Four edges of the stock. `backfaceVisibility: visible` here on
          purpose — an edge seen from its inside is what stops the solid
          showing a hole while it turns. */}
      {[
        { tf: `translate(-50%, -50%) rotateY(90deg) translateZ(${w / 2}px)`, w: thickness, h },
        { tf: `translate(-50%, -50%) rotateY(-90deg) translateZ(${w / 2}px)`, w: thickness, h },
        { tf: `translate(-50%, -50%) rotateX(90deg) translateZ(${h / 2}px)`, w, h: thickness },
        { tf: `translate(-50%, -50%) rotateX(-90deg) translateZ(${h / 2}px)`, w, h: thickness },
      ].map((e, i) => (
        <div
          key={i}
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: e.w,
            height: e.h,
            transform: e.tf,
            background: edge,
            boxShadow: 'inset 0 0 6px rgba(0,0,0,0.55)',
          }}
        />
      ))}
    </>
  );
}

/** Motes orbiting the object, placed on a ring at the card's own depth so
 * they pass in FRONT of it and BEHIND it as the room turns. */
function Motes({ theme, radius, reduced }: { theme: RoomTheme; radius: number; reduced: boolean }) {
  const motes = useMemo(() => {
    const out: { a: number; z: number; y: number; s: number; d: number }[] = [];
    // Deterministic placement (a hash walk, not Math.random) so the ring does
    // not re-scatter on every React re-render — which, with a pose changing at
    // 60fps under the pointer, would be every frame.
    let x = 0x9e3779b9;
    const next = () => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x / 0xffffffff;
    };
    for (let i = 0; i < theme.motes; i++) {
      out.push({
        a: (i / theme.motes) * 360 + next() * 18,
        z: (next() - 0.5) * radius * 1.1,
        y: (next() - 0.5) * radius * 1.5,
        s: 3 + next() * 7,
        d: next() * 6,
      });
    }
    return out;
  }, [theme.motes, radius]);

  if (!theme.motes) return null;
  return (
    <div
      aria-hidden
      style={{ position: 'absolute', left: '50%', top: '50%', transformStyle: 'preserve-3d' }}
    >
      {motes.map((m, i) => (
        <div
          key={i}
          className={reduced ? undefined : 'showroom-drift'}
          style={{
            position: 'absolute',
            width: m.s,
            height: m.s,
            marginLeft: -m.s / 2,
            marginTop: -m.s / 2,
            borderRadius: '50%',
            background: i % 3 === 0 ? theme.accent : theme.key,
            boxShadow: `0 0 ${m.s * 2.5}px ${theme.key}`,
            opacity: reduced ? 0.4 : undefined,
            animationDelay: `${m.d}s`,
            transform: `rotateY(${m.a}deg) translateZ(${radius + m.z}px) translateY(${m.y}px)`,
          }}
        />
      ))}
    </div>
  );
}

/** The room behind the object: backdrop, per-mood ambient light, floor. */
function Backdrop({ theme, reduced }: { theme: RoomTheme; reduced: boolean }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{ background: theme.backdrop }}
    >
      {theme.mood === 'ion' && (
        <>
          <div
            className={reduced ? undefined : 'showroom-sweep'}
            style={{
              position: 'absolute',
              inset: '-20% -60%',
              width: '40%',
              background: `linear-gradient(90deg, transparent, ${theme.key}55, transparent)`,
              filter: 'blur(18px)',
            }}
          />
          <div
            className={reduced ? undefined : 'showroom-sweep'}
            style={{
              position: 'absolute',
              inset: '-20% -60%',
              width: '22%',
              animationDelay: '3.2s',
              background: `linear-gradient(90deg, transparent, ${theme.accent}44, transparent)`,
              filter: 'blur(10px)',
            }}
          />
        </>
      )}
      {theme.mood === 'gold' && (
        <div
          className={reduced ? undefined : 'showroom-pulse'}
          style={{
            position: 'absolute',
            inset: 0,
            background: `conic-gradient(from 200deg at 50% 0%, transparent 0deg, ${theme.key}33 24deg, transparent 48deg, ${theme.accent}22 90deg, transparent 130deg)`,
          }}
        />
      )}
      {theme.mood === 'aurora' && (
        <>
          <div
            className={reduced ? undefined : 'showroom-aurora'}
            style={{
              position: 'absolute',
              left: '-10%',
              right: '-10%',
              top: '4%',
              height: '46%',
              background: `linear-gradient(180deg, ${theme.key}00, ${theme.key}66, ${theme.accent}22, transparent)`,
              filter: 'blur(26px)',
            }}
          />
          <div
            className={reduced ? undefined : 'showroom-aurora'}
            style={{
              position: 'absolute',
              left: '-10%',
              right: '-10%',
              top: '18%',
              height: '34%',
              animationDelay: '2.5s',
              background: `linear-gradient(180deg, transparent, #6ea8ff55, transparent)`,
              filter: 'blur(30px)',
            }}
          />
        </>
      )}
      {theme.mood === 'prism' && (
        <div
          className={reduced ? undefined : 'showroom-pulse'}
          style={{
            position: 'absolute',
            inset: 0,
            background: `conic-gradient(from 0deg at 50% 50%, #ff008855, #ffe50044, #00ffa344, #00b2ff55, #c400ff55, #ff008855)`,
            filter: 'blur(60px)',
            opacity: 0.55,
          }}
        />
      )}
      {theme.mood === 'ember' && (
        <div
          className={reduced ? undefined : 'showroom-pulse'}
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(60% 45% at 50% 92%, ${theme.key}77 0%, #e11d2e33 40%, transparent 72%)`,
          }}
        />
      )}
      {/* Vignette — every room gets one; it is what makes the object read as
          lit rather than pasted on. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(70% 60% at 50% 45%, transparent 30%, rgba(0,0,0,0.62) 100%)',
        }}
      />
    </div>
  );
}

/**
 * The stage. Owns nothing but presentation: the pose is the caller's, so a
 * screen can drive it from buttons, keys, sliders and the pointer at once.
 */
export function Showroom3D({
  def,
  foil,
  serial,
  slab,
  pose,
  onPose,
  spinSpeed = 0,
  className,
  /** Larger objects (a slab is a card plus its case) need the camera further
   * back or they clip the frustum at high zoom. */
  scaleHint = 1,
}: {
  def: CardDef;
  foil?: boolean;
  serial?: { number: number; cap: number };
  /** When present, this React tree stands in the room instead of a bare card
   * face — the slab, with its own width/height. */
  slab?: { node: React.ReactNode; w: number; h: number; edge: string };
  pose: Pose;
  /** MUST be referentially stable across renders (a `useState` setter, or a
   * `useCallback`): the momentum/auto-spin rAF loop closes over it, and a
   * fresh identity every render would tear the loop down and rebuild it 60
   * times a second. */
  onPose: (next: Pose | ((p: Pose) => Pose)) => void;
  /** Degrees per second of hands-off turntable rotation. 0 = parked. */
  spinSpeed?: number;
  className?: string;
  scaleHint?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const theme = useMemo(() => roomForRarity(def.rarity), [def.rarity]);
  const stageRef = useRef<HTMLDivElement>(null);

  const w = slab?.w ?? CARD_SIZES.full.w;
  const h = slab?.h ?? CARD_SIZES.full.h;

  // The stage's own box, so the object can be FITTED to it rather than drawn
  // at its literal pixel size. Without this a 336px card (or a 424px slab) at
  // "1.00×" simply overflowed a 320px-tall phone stage and sat under the HUD:
  // the first thing a phone player saw was a cropped card. `zoom` stays the
  // user-facing multiplier — 1.00× means "fits the room", at every viewport.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const measure = () => setBox({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const fit = useMemo(() => {
    if (!box || box.w === 0 || box.h === 0) return 1;
    // HUD_RESERVE keeps the controls strip off the object at 1.00×.
    return Math.min(1, (box.h - HUD_RESERVE) / h, (box.w * 0.9) / w);
  }, [box, w, h]);
  const thickness = slab ? SLAB_THICKNESS : CARD_THICKNESS;
  const back = getCardBackImage();

  // ---- drag + momentum ----------------------------------------------------
  // A pointer drag turns the object; releasing mid-flick hands the leftover
  // velocity to a decaying rAF loop, so the turntable coasts instead of
  // stopping dead under the finger. Refs, not state: this runs per frame.
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const vel = useRef({ yaw: 0, pitch: 0 });
  const spin = useRef(0);
  const raf = useRef(0);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  // The rAF loop reads the spin speed from a ref rather than closing over the
  // prop, so changing the speed does not rebuild the loop (and lose the
  // momentum sitting in `vel`). Written in an effect, not in render: a ref
  // mutated during render is a render side effect, and under StrictMode's
  // double render it would be applied twice.
  useEffect(() => {
    spin.current = reduced ? 0 : spinSpeed;
  }, [spinSpeed, reduced]);

  useEffect(() => {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const v = vel.current;
      const spinning = spin.current !== 0;
      const coasting = Math.abs(v.yaw) > 0.5 || Math.abs(v.pitch) > 0.5;
      if (spinning || coasting) {
        onPose((p) =>
          clampPose({
            ...p,
            yaw: p.yaw + v.yaw * dt + spin.current * dt,
            pitch: p.pitch + v.pitch * dt,
          }),
        );
        // Exponential decay: ~95% of the velocity survives each 1/60s frame,
        // so a flick coasts for about a second before it settles.
        const decay = Math.pow(0.06, dt);
        v.yaw *= decay;
        v.pitch *= decay;
        if (!coasting) {
          v.yaw = 0;
          v.pitch = 0;
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [onPose]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    vel.current = { yaw: 0, pitch: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // A two-finger pinch also delivers pointermove for the first finger. Left
    // alone that spins the object while the player is only trying to zoom.
    if (pinch.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
    // 0.55°/px horizontally: a 650px drag is one full revolution, which is
    // about the width of the stage — "swipe across the card to turn it right
    // around" is the gesture this is tuned for.
    vel.current = { yaw: dx * 12, pitch: -dy * 9 };
    onPose((p) => clampPose({ ...p, yaw: p.yaw + dx * 0.55, pitch: p.pitch - dy * 0.42 }));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
    pinch.current = null;
    if (reduced) vel.current = { yaw: 0, pitch: 0 };
  };

  const onWheel = (e: React.WheelEvent) => {
    // No preventDefault: the stage sits in a scrollable page and React binds
    // wheel passively, so the zoom is applied and the page is left alone by
    // the stage's own `overscroll-contain` instead.
    const factor = Math.exp(-e.deltaY * 0.0016);
    onPose((p) => clampPose({ ...p, zoom: p.zoom * factor }));
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!pinch.current) {
      pinch.current = { dist, zoom: pose.zoom };
      return;
    }
    onPose((p) => clampPose({ ...p, zoom: pinch.current!.zoom * (dist / pinch.current!.dist) }));
  };

  const { yaw, pitch, zoom } = pose;
  // Rim light strength: brightest when the object is edge-on to the key light,
  // which is what a rim light does.
  const rim = Math.abs(Math.sin((yaw * Math.PI) / 180));

  return (
    <div
      ref={stageRef}
      className={cn('relative overflow-hidden select-none touch-none', className)}
      style={{ overscrollBehavior: 'contain', cursor: 'grab' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
      onWheel={onWheel}
      onTouchMove={onTouchMove}
      onTouchEnd={() => (pinch.current = null)}
      role="img"
      aria-label={`${def.name}${slab ? ' in its graded case' : ''}, ${def.rarity ?? 'Common'}, standing in the ${theme.label} environment. Drag to turn it.`}
    >
      <Backdrop theme={theme} reduced={reduced} />

      {/* Camera. The perspective origin sits slightly above centre so the
          object is seen from a natural standing height rather than dead on.
          `inert`: the object in the room is scenery, not a control panel. The
          card face and the slab both render real <button> chips (cost pips,
          keyword links), and inside a drag surface those would swallow the
          gesture that turns the object and put a dozen tab stops behind a
          rotating card. The stage's own aria-label below names what is
          standing here; the picker underneath is the control. */}
      <div
        inert
        className="absolute inset-0 flex items-center justify-center"
        style={{ perspective: 1500 * scaleHint, perspectiveOrigin: '50% 42%' }}
      >
        <div
          style={{
            transformStyle: 'preserve-3d',
            transform: `scale(${fit * zoom}) rotateX(${pitch}deg) rotateY(${yaw}deg)`,
            transition: 'none',
            willChange: 'transform',
          }}
        >
          <div style={{ position: 'relative', width: w, height: h, transformStyle: 'preserve-3d' }}>
            <Solid
              w={w}
              h={h}
              thickness={thickness}
              edge={slab?.edge ?? 'linear-gradient(90deg,#f4efe2,#cbc4b2)'}
              front={
                slab ? (
                  slab.node
                ) : (
                  <div className="relative premium-boost">
                    <CardFace def={def} size="full" foil={foil} serial={serial} />
                    {/* Rim light — a hard edge highlight that swings with the
                        yaw, so the object reads as lit by the room. */}
                    <div
                      aria-hidden
                      className="absolute inset-0 pointer-events-none mix-blend-screen"
                      style={{
                        opacity: theme.premium ? 0.15 + rim * 0.5 : 0.08 + rim * 0.2,
                        background: `linear-gradient(${90 + yaw}deg, ${theme.key}00 30%, ${theme.accent}cc 50%, ${theme.key}00 70%)`,
                      }}
                    />
                    {/* Premium card effect: a per-room wash that only the
                        Super-Rare-and-up treatments get. */}
                    {theme.premium && (
                      <div
                        aria-hidden
                        className={cn(
                          'absolute inset-0 pointer-events-none',
                          theme.mood === 'ember' ? 'mix-blend-screen' : 'mix-blend-overlay',
                        )}
                        style={{
                          opacity: 0.28 + rim * 0.35,
                          background:
                            theme.mood === 'prism'
                              ? `linear-gradient(${120 + yaw * 1.5}deg, #ff008899, #ffe50077, #00ffa377, #00b2ff99, #c400ff88)`
                              : `linear-gradient(${120 + yaw}deg, transparent 20%, ${theme.key}aa 50%, transparent 80%)`,
                        }}
                      />
                    )}
                  </div>
                )
              }
              back={
                <div
                  className={cn(
                    'w-full h-full rounded-[6px] border-4 border-[var(--c-ink)] overflow-hidden',
                    !back && !slab && 'classic-black-back',
                  )}
                  style={
                    slab
                      ? { background: slab.edge }
                      : back
                        ? {
                            backgroundImage: `url(${back})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }
                        : undefined
                  }
                />
              }
            />
            <Motes theme={theme} radius={Math.max(w, h) * 0.78} reduced={reduced} />
          </div>
        </div>
      </div>

      {/* Floor pool — sits under the object in screen space (not the 3D
          space): a contact shadow that keeps the object from floating. */}
      <div
        aria-hidden
        className="absolute left-1/2 pointer-events-none"
        style={{
          bottom: '10%',
          width: w * fit * zoom * 1.1,
          height: 26 * fit * zoom,
          marginLeft: -(w * fit * zoom * 1.1) / 2,
          borderRadius: '50%',
          background: `radial-gradient(50% 50% at 50% 50%, ${theme.premium ? theme.key + 'aa' : 'rgba(0,0,0,0.75)'} 0%, transparent 70%)`,
          filter: 'blur(6px)',
          opacity: 0.7,
        }}
      />
    </div>
  );
}
