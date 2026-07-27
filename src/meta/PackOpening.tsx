import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Coins, Sparkles, Zap } from 'lucide-react';
import { PackPull, quicksellCards } from '../lib/supabase';
import { CardDef } from '../game/v3/cards';
import { POOL_BY_ID } from '../game/v3/cardpool';
import { CardFace, CARD_SIZES } from '../components/CardFaceV4';
import { PopButton, Notice } from './ui';
import { cn } from '../lib/utils';
import { RARITY_CHIP, RARITY_HEX, rarityGlow, rarityTier } from './rarity';
import { getCardBackImage } from './cardback';
import { SafeImage } from './SafeImage';
import { useMeta } from './MetaContext';
import { fmtCredits, quicksellPrice } from './economy';

/**
 * Full-screen pack-opening experience:
 *   Stage 1 "pack"    — the pack art, ripped open by dragging across the foil.
 *   Stage 2 "reveal"  — one large card at a time, click to 3D-flip, rarity
 *                       glow bursts, foil sheen. "REVEAL ALL" skips ahead.
 *   Stage 3 "summary" — full haul grid, rarity chips, credit conversions and a
 *                       best-pull spotlight, then ADD TO COLLECTION.
 */

// Ranking comes from rarity.ts's RARITY_ORDER, not a local copy. The local
// copy this file used to keep had drifted: it was missing 'Alt-Art'
// entirely, so `indexOf` returned -1 and every Alt-Art pull was clamped to
// rank 0 — sorted, spotlighted and glowed as if it were a Common.
const rarityRank = (r: string) => rarityTier(r);
const isRarePlus = (r: string) => rarityRank(r) >= rarityRank('Rare');

/** Resolve a pack pull to its v4.2 card definition (with a minimal fallback). */
function pullToDef(pull: PackPull): CardDef {
  return (
    POOL_BY_ID[pull.card_id] || {
      id: pull.card_id,
      name: pull.name,
      rarity: pull.rarity as CardDef['rarity'],
      type: pull.card_type as CardDef['type'],
      image: pull.image_url || undefined,
    }
  );
}

function usePrefersReducedMotion(): boolean {
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

/** Face-down card showing the player's equipped card back. */
function CardBackFace() {
  const back = getCardBackImage();
  return (
    <div className="w-full h-full bg-[var(--c-ink)] ink-border-md shadow-hard-black overflow-hidden flex items-center justify-center">
      {back ? (
        <img src={back} alt="Card back" className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="heading-font text-[var(--c-yellow)] text-xl rotate-[-8deg]">FRY CARDS</div>
      )}
    </div>
  );
}

/**
 * How much of the pack art the tear-off strip covers, measured from the top.
 * The strip is a clipped copy of the artwork itself, so the rip reads as the
 * real top of the pack coming away rather than a grey bar bolted above it.
 */
const TEAR_FRAC = 0.15;

/**
 * Serrated edge, as a clip-path polygon, running along a horizontal line at
 * `atPct` of the element's height. `side: 'below'` keeps everything under the
 * line (the pack body once the strip is gone); `'above'` keeps the strip.
 */
function serratedPolygon(atPct: number, side: 'above' | 'below', teeth = 26): string {
  const amp = 1.6; // tooth depth, in % of element height
  const zig = Array.from({ length: teeth + 1 }, (_, i) => {
    const x = (i / teeth) * 100;
    const y = atPct + (i % 2 === 0 ? -amp : amp);
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
  });
  return side === 'below'
    ? `polygon(${zig.join(', ')}, 100% 100%, 0 100%)`
    : `polygon(0 0, 100% 0, ${zig.slice().reverse().join(', ')})`;
}

/** Foil scraps + confetti burst spawned when the pack tears open. */
function FoilScraps({ count = 22 }: { count?: number }) {
  // Deterministic per-index jitter (render must stay pure — no Math.random).
  const jitter = (i: number, salt: number) => {
    const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const scraps = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: 8 + jitter(i, 1) * 84,
        dx: (jitter(i, 2) - 0.5) * 260,
        dy: -(60 + jitter(i, 3) * 240),
        rot: (jitter(i, 4) - 0.5) * 720,
        delay: jitter(i, 5) * 0.12,
        dur: 0.7 + jitter(i, 6) * 0.6,
        size: 5 + jitter(i, 7) * 9,
        color: ['#E5E7EB', '#D4AF37', 'var(--c-yellow)', 'var(--c-red)', '#A5B4BC'][i % 5],
      })),
    [count],
  );
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible z-20">
      {scraps.map((s, i) => (
        <span
          key={i}
          className="absolute block"
          style={{
            top: `${TEAR_FRAC * 100}%`,
            left: `${s.left}%`,
            width: s.size,
            height: s.size * 0.6,
            background: s.color,
            border: '1px solid var(--c-ink)',
            animation: `po-scrap ${s.dur}s cubic-bezier(.2,.7,.4,1) ${s.delay}s forwards`,
            ['--dx' as string]: `${s.dx}px`,
            ['--dy' as string]: `${s.dy}px`,
            ['--rot' as string]: `${s.rot}deg`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

const PACK_OPENING_CSS = `
@keyframes po-shake {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  20% { transform: translate(-3px, 1px) rotate(-0.8deg); }
  40% { transform: translate(3px, -1px) rotate(0.8deg); }
  60% { transform: translate(-2px, -1px) rotate(-0.5deg); }
  80% { transform: translate(2px, 1px) rotate(0.5deg); }
}
@keyframes po-strip-fly {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  100% { transform: translate(46%, -130vh) rotate(38deg); opacity: 0; }
}
@keyframes po-scrap {
  0% { opacity: 1; transform: translate(0, 0) rotate(0deg); }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); }
}
@keyframes po-pack-drop {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(28vh) scale(0.9) rotate(-3deg); opacity: 0; }
}
@keyframes po-card-out {
  0% { transform: translateY(60px) scale(0.85); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes po-glow-burst {
  0% { transform: scale(0.3); opacity: 0.95; }
  100% { transform: scale(2.1); opacity: 0; }
}
@keyframes po-sheen {
  0% { transform: translateX(-130%) skewX(-18deg); }
  100% { transform: translateX(230%) skewX(-18deg); }
}
@keyframes po-flip-in {
  0% { transform: rotateY(180deg); }
  100% { transform: rotateY(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .po-anim { animation: none !important; }
}
`;

type Stage = 'pack' | 'reveal' | 'summary';

export function PackOpening({
  packName,
  packImageUrl,
  pulls,
  onDone,
}: {
  packName: string;
  packImageUrl: string | null;
  pulls: PackPull[];
  onDone: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  // An empty pull list (bad server response) would strand the player on a
  // reveal stage that renders nothing — go straight to the summary instead.
  const [stage, setStage] = useState<Stage>(pulls.length === 0 ? 'summary' : 'pack');
  const dialogRef = useRef<HTMLDivElement>(null);

  // The pack/collection grant already happened server-side before this modal
  // ever mounts (see StoreScreen's openPack callers) — this whole component
  // is just a replayable presentation layer, so it's safe to let Escape
  // dismiss it outright like every other overlay in the app, and to move
  // focus in on open / restore it on close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);
  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => prevFocused?.focus?.();
  }, []);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Opening ${packName}`}
      className="fixed inset-0 bg-[var(--c-ink)]/95 z-50 flex flex-col items-center justify-center p-4 overflow-y-auto outline-none"
    >
      <style>{PACK_OPENING_CSS}</style>
      <div className="absolute inset-0 starburst-ray opacity-20 pointer-events-none" />
      {stage === 'pack' && (
        <TearStage
          packName={packName}
          packImageUrl={packImageUrl}
          reducedMotion={reducedMotion}
          // Every haul — including boxes and bulk opens — goes through the
          // interactive click-to-flip reveal; the REVEAL ALL button in that
          // stage is the deliberate skip for players who don't want 36 flips.
          onTorn={() => setStage('reveal')}
        />
      )}
      {stage === 'reveal' && (
        <RevealStage
          packName={packName}
          pulls={pulls}
          reducedMotion={reducedMotion}
          onDone={() => setStage('summary')}
        />
      )}
      {stage === 'summary' && (
        <SummaryStage
          packName={packName}
          pulls={pulls}
          reducedMotion={reducedMotion}
          onDone={onDone}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 1 — rip the foil
// ---------------------------------------------------------------------------
function TearStage({
  packName,
  packImageUrl,
  reducedMotion,
  onTorn,
}: {
  packName: string;
  packImageUrl: string | null;
  reducedMotion: boolean;
  onTorn: () => void;
}) {
  const [progress, setProgress] = useState(0); // 0..1 tear progress
  const [torn, setTorn] = useState(false);
  const dragging = useRef<{ startX: number; startProgress: number } | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const tornRef = useRef(false);
  // The vertical pack/box renders aren't all the same shape (a booster pack is
  // much narrower than a box), and the strip is positioned as a percentage of
  // the pack's height — so size the frame to the art rather than cropping the
  // art to a guessed frame. The default is a placeholder until it loads.
  const [aspectRatio, setAspectRatio] = useState('77 / 96');
  const onArtLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w > 0 && h > 0) setAspectRatio(`${w} / ${h}`);
  };
  const tearTimer = useRef<number | null>(null);

  // Defense-in-depth: nothing unmounts this stage before the timer fires
  // today, but nothing guarantees that stays true — an uncleared timer would
  // call onTorn() (a setState on an unmounted parent) if that ever changes.
  useEffect(() => {
    return () => {
      if (tearTimer.current != null) window.clearTimeout(tearTimer.current);
    };
  }, []);

  const finishTear = () => {
    if (tornRef.current) return;
    tornRef.current = true;
    setProgress(1);
    setTorn(true);
    tearTimer.current = window.setTimeout(onTorn, reducedMotion ? 120 : 850);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (tornRef.current) return;
    dragging.current = { startX: e.clientX, startProgress: progress };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || tornRef.current) return;
    const width = stripRef.current?.offsetWidth || 300;
    const p = Math.min(
      1,
      Math.max(
        dragging.current.startProgress,
        dragging.current.startProgress + (e.clientX - dragging.current.startX) / (width * 0.85),
      ),
    );
    setProgress(p);
    if (p >= 1) finishTear();
  };
  const onPointerUp = () => {
    dragging.current = null;
    if (!tornRef.current && progress >= 0.92) finishTear();
  };

  const shaking = !reducedMotion && !torn && progress > 0.03 && progress < 1;

  return (
    <div className="relative flex flex-col items-center">
      <h2 className="heading-font text-2xl text-[var(--c-yellow)] mb-1 relative text-center">
        {packName.toUpperCase()}
      </h2>
      <p className="text-[var(--c-paper)]/70 text-xs font-bold mb-6 relative">
        Grab the foil strip and drag right to rip it open ▸
      </p>

      <div
        className={cn('relative select-none touch-none po-anim')}
        style={{
          // Height-driven so a tall box render can't run off the bottom of the
          // viewport; width follows the art's own ratio (clamped on narrow
          // phones, where the pack is the widest thing on screen).
          height: 'min(58vh, 460px)',
          width: 'auto',
          maxWidth: '86vw',
          aspectRatio,
          animation: shaking
            ? `po-shake ${Math.max(0.12, 0.3 - progress * 0.18)}s linear infinite`
            : torn && !reducedMotion
              ? 'none'
              : undefined,
        }}
      >
        {/* The pack body — full artwork. Once the strip is gone the top slice
            is clipped away along a serrated line, so the rip cuts through the
            art itself instead of leaving a bar sitting above it. */}
        <div
          className="absolute inset-0 po-anim"
          style={{
            animation:
              torn && !reducedMotion ? 'po-pack-drop 0.9s ease-in 0.35s forwards' : undefined,
          }}
        >
          <div
            className="absolute inset-0 ink-border-md shadow-hard-yellow overflow-hidden bg-[var(--c-ink)]"
            style={{
              clipPath: torn ? serratedPolygon(TEAR_FRAC * 100, 'below') : undefined,
            }}
          >
            <SafeImage
              src={packImageUrl}
              alt={packName}
              className="w-full h-full object-cover"
              fallbackText={packName}
              eager
              onLoad={onArtLoad}
            />
          </div>
          {/* torn paper edge left behind where the strip came away */}
          {torn && (
            <div
              className="absolute inset-x-0 bg-[#E5E7EB]"
              style={{
                top: `${TEAR_FRAC * 100 - 1.6}%`,
                height: '3.4%',
                clipPath: serratedPolygon(50, 'below', 26),
              }}
            />
          )}
        </div>

        {/* The tear-off strip: a clipped copy of the top of the artwork, so it
            reads as the actual top of the pack peeling off. */}
        <div
          ref={stripRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn(
            'absolute inset-x-0 top-0 overflow-hidden po-anim z-10 ink-border-md',
            !torn && 'cursor-grab active:cursor-grabbing',
          )}
          style={{
            height: `${TEAR_FRAC * 100}%`,
            transform: torn
              ? undefined
              : `translateX(${progress * 14}px) rotate(${progress * 2}deg)`,
            transformOrigin: 'left center',
            animation:
              torn && !reducedMotion
                ? 'po-strip-fly 0.8s cubic-bezier(.4,-0.1,.7,.4) forwards'
                : undefined,
            opacity: torn && reducedMotion ? 0 : undefined,
            clipPath: serratedPolygon(100 - 6, 'above'),
          }}
        >
          {/* the same artwork, sized to the whole pack, so only its top band
              shows through this clipped window — a 1:1 continuation of the
              body art underneath */}
          <div
            className="absolute top-0 left-0 w-full pointer-events-none"
            style={{ height: `${100 / TEAR_FRAC}%` }}
          >
            <SafeImage
              src={packImageUrl}
              alt=""
              className="w-full h-full object-cover"
              fallbackClassName="bg-[var(--c-steel)]"
              eager
            />
          </div>
          {/* foil sheen over the art so the strip still reads as tear-off foil */}
          <div
            className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-50"
            style={{
              background:
                'repeating-linear-gradient(115deg, rgba(201,206,214,0.9) 0px, rgba(243,244,246,0.9) 10px, rgba(174,182,194,0.9) 20px, rgba(229,231,235,0.9) 30px)',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center gap-2 pointer-events-none">
            <span className="heading-font text-[11px] text-[var(--c-ink)] tracking-widest bg-[var(--c-yellow)]/90 px-2 py-0.5 ink-border-sm">
              {progress > 0.03 ? 'KEEP RIPPING ▸▸' : '◂ TEAR HERE ▸'}
            </span>
          </div>
          {/* rip progress darkening */}
          <div
            className="absolute inset-y-0 left-0 bg-[var(--c-ink)]/25 pointer-events-none"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        {torn && !reducedMotion && <FoilScraps />}
      </div>

      {/* progress meter + accessible fallback */}
      <div
        className="mt-6 w-56 h-2.5 ink-border-sm bg-[var(--c-paper)]/20 overflow-hidden relative"
        role="progressbar"
        aria-label="Tearing pack open"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div className="h-full bg-[var(--c-yellow)]" style={{ width: `${progress * 100}%` }} />
      </div>
      <button
        onClick={finishTear}
        className="mt-3 text-[10px] font-black text-[var(--c-paper)]/60 underline decoration-2 underline-offset-2 hover:text-[var(--c-paper)] relative"
      >
        JUST TEAR IT OPEN FOR ME
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 2 — one-at-a-time 3D flip reveal
// ---------------------------------------------------------------------------
const CARD_SCALE = 1.06; // full tier is 240x336; scale to ~356px tall so it reads premium
// Round only the width, then derive height from the exact 2.5:3.5 ratio —
// rounding both independently can drift the rendered card off-ratio by a
// pixel or two.
const CARD_W = Math.round(CARD_SIZES.full.w * CARD_SCALE);
const CARD_H = Math.round((CARD_W * CARD_SIZES.full.h) / CARD_SIZES.full.w);

function RevealStage({
  packName,
  pulls,
  reducedMotion,
  onDone,
}: {
  packName: string;
  pulls: PackPull[];
  reducedMotion: boolean;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [burstKey, setBurstKey] = useState(0);

  const current = pulls[index];
  const currentShown = revealed.has(index);
  const currentDef = current ? pullToDef(current) : null;

  const flip = () => {
    if (currentShown || !current) return;
    setRevealed((r) => new Set(r).add(index));
    setBurstKey((k) => k + 1);
  };
  const next = () => {
    if (index >= pulls.length - 1) onDone();
    else setIndex((i) => i + 1);
  };
  // Click the card itself to flip it face-up, then click again to advance —
  // no need to reach for the separate NEXT button once it's revealed.
  const onCardClick = () => (currentShown ? next() : flip());

  if (!current) return null;

  const glowColor = RARITY_HEX[current.rarity] || RARITY_HEX.Common;

  return (
    <div className="relative flex flex-col items-center">
      <h2 className="heading-font text-2xl text-[var(--c-yellow)] mb-1 text-center">
        {packName.toUpperCase()}
      </h2>
      <div className="text-[10px] font-mono font-bold text-[var(--c-paper)]/50 mb-5">
        CARD {index + 1} / {pulls.length} — {currentShown ? 'CLICK TO CONTINUE ▸' : 'CLICK TO FLIP'}
      </div>

      {/* 3D flip container */}
      <div
        onClick={onCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onCardClick();
          }
        }}
        className="relative po-anim cursor-pointer hover:-translate-y-2 transition-transform"
        style={{
          width: CARD_W,
          height: CARD_H,
          perspective: '1100px',
          animation: !reducedMotion && !currentShown ? 'po-card-out 0.35s ease-out' : undefined,
        }}
        key={index}
      >
        {/* rarity glow burst on flip (Rare+) */}
        {currentShown &&
          isRarePlus(current.rarity) &&
          !current.converted_to_credits &&
          !reducedMotion && (
            <div
              key={burstKey}
              className="absolute inset-0 pointer-events-none z-0 po-anim"
              style={{
                background: `radial-gradient(circle, ${glowColor}CC 0%, ${glowColor}44 40%, transparent 70%)`,
                animation: 'po-glow-burst 0.7s ease-out forwards',
              }}
            />
          )}
        <div
          className="relative w-full h-full"
          style={{
            transformStyle: 'preserve-3d',
            transition: reducedMotion ? undefined : 'transform 0.55s cubic-bezier(.3,1.2,.5,1)',
            transform: currentShown ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* back face */}
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
            <CardBackFace />
          </div>
          {/* front face */}
          <div
            className={cn(
              'absolute inset-0',
              currentShown && !current.converted_to_credits && rarityGlow(current.rarity),
            )}
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div
              style={{
                transform: `scale(${CARD_SCALE})`,
                transformOrigin: 'top left',
                width: CARD_SIZES.full.w,
                height: CARD_SIZES.full.h,
              }}
              className="relative"
            >
              <CardFace
                def={currentDef!}
                size="full"
                foil={current.foil}
                dimmed={current.converted_to_credits}
                serial={
                  current.serialized
                    ? { number: current.serial_number!, cap: current.serial_cap! }
                    : undefined
                }
              />
              {/* foil sheen sweep */}
              {currentShown && current.foil && !reducedMotion && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div
                    className="absolute inset-y-0 w-1/3 po-anim"
                    style={{
                      background:
                        'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.75) 50%, transparent 100%)',
                      animation: 'po-sheen 1.1s ease-in-out 0.4s',
                      transform: 'translateX(-130%) skewX(-18deg)',
                    }}
                  />
                </div>
              )}
              {current.converted_to_credits && currentShown && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="heading-font text-lg bg-[var(--c-ink)] text-[#67E8F9] px-3 py-1.5 ink-border-md shadow-hard-black-xs">
                    +{fmtCredits(current.credit_value)} CREDITS
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        {currentShown &&
          rarityRank(current.rarity) >= rarityRank('Super-Rare') &&
          !current.converted_to_credits && (
            <div className="absolute -inset-12 pointer-events-none starburst-ray opacity-70 -z-10" />
          )}
      </div>

      {/* rarity readout */}
      <div className="h-9 mt-4 flex items-center">
        {currentShown && (
          <div
            className={cn(
              'heading-font text-sm px-3 py-1 ink-border-sm',
              current.converted_to_credits
                ? 'bg-[var(--c-ink)] text-[#67E8F9]'
                : RARITY_CHIP[current.rarity] || RARITY_CHIP.Common,
            )}
          >
            {current.converted_to_credits
              ? `OVER COPY CAP — ${(current.rarity || 'COMMON').toUpperCase()} → CREDITS`
              : `${(current.rarity || 'COMMON').toUpperCase()}${current.foil ? ' · FOIL ✦' : ''}${
                  current.serialized
                    ? ` · SERIALIZED #${current.serial_number}/${current.serial_cap}`
                    : ''
                }`}
          </div>
        )}
      </div>

      {/* progress pips */}
      <div className="flex gap-1.5 mt-3 max-w-full flex-wrap justify-center px-4">
        {pulls.map((p, i) => (
          <span
            key={i}
            className="w-3 h-4 ink-border-sm"
            style={{
              background: revealed.has(i)
                ? RARITY_HEX[p.rarity] || RARITY_HEX.Common
                : i === index
                  ? 'var(--c-yellow)'
                  : 'rgba(255,255,255,0.15)',
            }}
          />
        ))}
      </div>

      <div className="flex gap-3 mt-6">
        <PopButton color="yellow" onClick={onDone}>
          <span className="flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" /> REVEAL ALL
          </span>
        </PopButton>
        <PopButton color="black" onClick={next} disabled={!currentShown}>
          {index < pulls.length - 1 ? 'NEXT ▸' : 'SEE YOUR HAUL ▸'}
        </PopButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 3 — haul summary
// ---------------------------------------------------------------------------
function SummaryStage({
  packName,
  pulls,
  reducedMotion,
  onDone,
}: {
  packName: string;
  pulls: PackPull[];
  reducedMotion: boolean;
  onDone: () => void;
}) {
  const rarityCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pulls) m.set(p.rarity, (m.get(p.rarity) || 0) + 1);
    return [...m.entries()].sort((a, b) => rarityRank(b[0]) - rarityRank(a[0]));
  }, [pulls]);

  const creditsGained = pulls.reduce(
    (s, p) => s + (p.converted_to_credits ? p.credit_value : 0),
    0,
  );
  const convertedCount = pulls.filter((p) => p.converted_to_credits).length;
  const foilCount = pulls.filter((p) => p.foil).length;
  // Quicksell value of everything the player actually KEPT. Over-cap pulls are
  // excluded because they were already paid out as credits above.
  const haulValue = pulls.reduce(
    (s, p) => s + (p.converted_to_credits ? 0 : quicksellPrice(p.rarity, p.foil)),
    0,
  );

  // Best pull: highest rarity (kept copies beat credit conversions, foils win ties).
  const bestIndex = useMemo(() => {
    let best = 0;
    const score = (p: PackPull) =>
      rarityRank(p.rarity) * 100 +
      (p.converted_to_credits ? 0 : 10) +
      (p.foil ? 1 : 0) +
      (p.serialized ? 1000 : 0);
    pulls.forEach((p, i) => {
      if (score(p) > score(pulls[best])) best = i;
    });
    return best;
  }, [pulls]);

  // One layout for every haul size. The old summary branched into two
  // near-duplicate render paths at 12 cards (a wall of full-size cards below,
  // a spotlight + compact grid above) which had drifted apart — different
  // sold/converted badges, different best-pull markup, different sort. The
  // spotlight is always shown and the rest always collapses identical pulls,
  // so a 5-card pack and a 49-card box read the same way.
  const groups = useMemo(() => {
    const m = new Map<string, { pull: PackPull; count: number; indices: number[] }>();
    pulls.forEach((p, i) => {
      if (i === bestIndex) return; // the spotlight already shows this copy
      const key = `${p.card_id}:${p.foil}:${p.serialized ? `s${p.serial_number}` : ''}:${p.converted_to_credits}`;
      const g = m.get(key) || { pull: p, count: 0, indices: [] };
      g.count += 1;
      g.indices.push(i);
      m.set(key, g);
    });
    return [...m.values()].sort(
      (a, b) =>
        rarityRank(b.pull.rarity) - rarityRank(a.pull.rarity) ||
        Number(b.pull.foil) - Number(a.pull.foil) ||
        (a.pull.name || '').localeCompare(b.pull.name || ''),
    );
  }, [pulls, bestIndex]);

  // Quicksell straight from the haul — mostly for the common/uncommon
  // clutter a big box tends to dump, without a separate trip to Collection.
  const { refreshCollection, refreshProfile } = useMeta();
  const [sold, setSold] = useState<Set<number>>(new Set());
  const [sellBusy, setSellBusy] = useState(false);
  const [sellError, setSellError] = useState('');
  const [sellNotice, setSellNotice] = useState('');
  // quicksellClutter's RPC loop can easily outlive this component (the user
  // can hit DONE — or the parent can unmount this stage — before all groups
  // have settled) — guard every setState after an await so a late response
  // doesn't fire into an unmounted component.
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const clutterIndices = pulls
    .map((_, i) => i)
    .filter(
      (i) =>
        !sold.has(i) &&
        !pulls[i].converted_to_credits &&
        (pulls[i].rarity === 'Common' || pulls[i].rarity === 'Uncommon'),
    );
  const clutterValue = clutterIndices.reduce(
    (s, i) => s + quicksellPrice(pulls[i].rarity, pulls[i].foil),
    0,
  );

  const quicksellClutter = async () => {
    if (sellBusy || clutterIndices.length === 0) return;
    if (
      !confirm(`Quicksell ${clutterIndices.length} common/uncommon card(s)? This can't be undone.`)
    )
      return;
    setSellBusy(true);
    setSellError('');
    setSellNotice('');
    // group by (card_id, foil) so identical pulls sell in one RPC call each
    const sellGroups = new Map<
      string,
      { cardId: string; foil: boolean; qty: number; indices: number[] }
    >();
    for (const i of clutterIndices) {
      const p = pulls[i];
      const key = `${p.card_id}:${p.foil}`;
      const g = sellGroups.get(key) || { cardId: p.card_id, foil: p.foil, qty: 0, indices: [] };
      g.qty += 1;
      g.indices.push(i);
      sellGroups.set(key, g);
    }
    let totalCredits = 0;
    let totalCards = 0;
    let shortfall = false;
    const newlySold = new Set<number>();
    try {
      for (const g of sellGroups.values()) {
        const { data, error } = await quicksellCards(g.cardId, g.qty, g.foil);
        if (!mountedRef.current) return;
        if (error) {
          setSellError(error);
          break;
        }
        if (data) {
          totalCredits += data.total;
          totalCards += data.sold;
          // The server can sell fewer than requested (e.g. another tab already
          // sold/locked some copies) — only mark that many pulls as sold, not
          // the whole group, or the UI shows cards as gone that the player
          // still owns.
          if (data.sold < g.qty) shortfall = true;
          g.indices.slice(0, data.sold).forEach((i) => newlySold.add(i));
        }
      }
    } catch {
      if (mountedRef.current)
        setSellError('Something went wrong — check your connection and try again.');
    } finally {
      if (mountedRef.current) setSellBusy(false);
    }
    if (!mountedRef.current) return;
    if (newlySold.size > 0) setSold((s) => new Set([...s, ...newlySold]));
    if (totalCards > 0) {
      setSellNotice(
        `Quicksold ${totalCards} card${totalCards === 1 ? '' : 's'} for ${fmtCredits(totalCredits)}${shortfall ? ' (some copies were no longer available)' : ''}.`,
      );
      refreshCollection();
      refreshProfile();
    }
  };

  // Defensive: a purchase response with zero cards should never reach this
  // stage, but pulls[bestIndex]/pullToDef below aren't optional-chained and
  // would throw on an empty array — fail soft instead of white-screening
  // the pack-opening modal.
  if (pulls.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        <p className="text-sm opacity-70">No cards were opened.</p>
        <PopButton color="yellow" onClick={onDone}>
          Done
        </PopButton>
      </div>
    );
  }

  const best = pulls[bestIndex];

  return (
    <div className="relative flex flex-col items-center w-full max-w-5xl max-h-full">
      <h2 className="heading-font text-2xl text-[var(--c-yellow)] text-center">
        {packName.toUpperCase()}
      </h2>

      {/* Headline numbers, read left to right: how much, how shiny, how much
          it's worth. Previously the only summary was a row of rarity chips
          plus a paragraph of small print. */}
      <div className="flex flex-wrap justify-center gap-2 mt-3 mb-4">
        <StatTile label="CARDS" value={String(pulls.length)} />
        {foilCount > 0 && <StatTile label="FOILS ✦" value={String(foilCount)} accent="yellow" />}
        <StatTile
          label="TOP PULL"
          value={(best.rarity || 'Common').toUpperCase()}
          rarity={best.rarity}
        />
        <StatTile label="HAUL VALUE" value={fmtCredits(haulValue)} />
        {creditsGained > 0 && (
          <StatTile label="OVER CAP → ✦" value={fmtCredits(creditsGained)} accent="cyan" />
        )}
      </div>

      {/* Spotlight */}
      <div className="relative mb-4 shrink-0">
        <div className="absolute -inset-10 pointer-events-none starburst-ray opacity-60 -z-10" />
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 heading-font text-[10px] bg-[var(--c-yellow)] text-[var(--c-ink)] px-2 py-0.5 ink-border-sm shadow-hard-black-xs flex items-center gap-1 whitespace-nowrap">
          <Sparkles className="w-3 h-3" /> {best.serialized ? 'SERIALIZED!' : 'BEST PULL'}
        </div>
        <div
          className={cn('po-anim', !best.converted_to_credits && rarityGlow(best.rarity))}
          style={{ animation: reducedMotion ? undefined : 'po-card-out 0.35s ease-out' }}
        >
          <CardFace
            def={pullToDef(best)}
            size="full"
            foil={best.foil}
            dimmed={best.converted_to_credits}
            serial={
              best.serialized ? { number: best.serial_number!, cap: best.serial_cap! } : undefined
            }
          />
        </div>
      </div>

      {/* Rarity breakdown */}
      <div className="flex flex-wrap justify-center gap-1.5 mb-3">
        {rarityCounts.map(([r, n]) => (
          <span
            key={r}
            className={cn(
              'text-[10px] font-black px-2 py-0.5 ink-border-sm',
              RARITY_CHIP[r] || RARITY_CHIP.Common,
            )}
          >
            {(r || 'Common').toUpperCase()} ×{n}
          </span>
        ))}
      </div>

      {/* The rest of the haul */}
      {groups.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 px-2 max-h-[34vh] overflow-y-auto mb-4">
          {groups.map((grp, gi) => {
            const allSold = grp.indices.every((i) => sold.has(i));
            const spent = grp.pull.converted_to_credits || allSold;
            return (
              <div key={gi} className="relative">
                <CardFace
                  def={pullToDef(grp.pull)}
                  size="compact"
                  foil={grp.pull.foil}
                  count={grp.count > 1 ? grp.count : undefined}
                  dimmed={spent}
                  serial={
                    grp.pull.serialized
                      ? { number: grp.pull.serial_number!, cap: grp.pull.serial_cap! }
                      : undefined
                  }
                />
                {spent && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="heading-font text-[9px] bg-[var(--c-ink)] text-[#67E8F9] px-1.5 py-0.5 ink-border-sm">
                      {allSold && !grp.pull.converted_to_credits
                        ? 'SOLD'
                        : `+${fmtCredits(grp.pull.credit_value * grp.count)}`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {convertedCount > 0 && (
        <p className="text-[10px] font-bold text-[#67E8F9] mb-3 text-center max-w-md">
          {convertedCount} pull{convertedCount === 1 ? '' : 's'}{' '}
          {convertedCount === 1 ? 'was' : 'were'} past your copy cap, so{' '}
          {convertedCount === 1 ? 'it was' : 'they were'} paid out as ✦ {fmtCredits(creditsGained)}{' '}
          credits instead of a copy you couldn't play.
        </p>
      )}

      {sellError && (
        <div className="mb-3">
          <Notice text={sellError} />
        </div>
      )}
      {sellNotice && (
        <div className="mb-3">
          <Notice text={sellNotice} kind="success" />
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {clutterIndices.length > 0 && (
          <PopButton color="steel" disabled={sellBusy} onClick={quicksellClutter}>
            <span className="flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" />
              {sellBusy
                ? 'SELLING…'
                : `QUICKSELL ${clutterIndices.length} C/U — ${fmtCredits(clutterValue)}`}
            </span>
          </PopButton>
        )}
        <PopButton color="red" disabled={sellBusy} onClick={onDone}>
          DONE ✓
        </PopButton>
      </div>
      <div className="h-4 shrink-0" />
    </div>
  );
}

/** One headline number in the summary's stat strip. */
function StatTile({
  label,
  value,
  accent,
  rarity,
}: {
  label: string;
  value: string;
  accent?: 'yellow' | 'cyan';
  rarity?: string;
}) {
  return (
    <div className="ink-border-sm bg-[var(--c-ink)] px-3 py-1.5 text-center min-w-[84px]">
      <div className="text-[8px] font-black tracking-widest text-[var(--c-paper)]/50">{label}</div>
      <div
        className="heading-font text-sm leading-tight"
        style={{
          color: rarity
            ? RARITY_HEX[rarity] || RARITY_HEX.Common
            : accent === 'cyan'
              ? '#67E8F9'
              : accent === 'yellow'
                ? 'var(--c-yellow)'
                : 'var(--c-paper)',
        }}
      >
        {value}
      </div>
    </div>
  );
}
