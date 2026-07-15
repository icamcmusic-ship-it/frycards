import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Coins, Sparkles, Zap } from 'lucide-react';
import { PackPull, quicksellCards } from '../lib/supabase';
import { CardDef } from '../game/v3/cards';
import { POOL_BY_ID } from '../game/v3/cardpool';
import { CardFace, CARD_SIZES } from '../components/CardFaceV4';
import { PopButton, Notice } from './ui';
import { cn } from '../lib/utils';
import { RARITY_CHIP, RARITY_HEX, rarityGlow } from './rarity';
import { getCardBackImage } from './cardback';
import { SafeImage } from './SafeImage';
import { useMeta } from './MetaContext';
import { fmtCredits } from './economy';

/**
 * Full-screen pack-opening experience:
 *   Stage 1 "pack"    — the pack art, ripped open by dragging across the foil.
 *   Stage 2 "reveal"  — one large card at a time, click to 3D-flip, rarity
 *                       glow bursts, foil sheen. "REVEAL ALL" skips ahead.
 *   Stage 3 "summary" — full haul grid, rarity chips, shard conversions and a
 *                       best-pull spotlight, then ADD TO COLLECTION.
 */

const RARITY_ORDER = [
  'Common',
  'Uncommon',
  'Rare',
  'Super-Rare',
  'Full-Art',
  'Ultra-Rare',
  'Mythic',
];
const rarityRank = (r: string) => Math.max(0, RARITY_ORDER.indexOf(r));
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
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
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
        <img src={back} className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="heading-font text-[var(--c-yellow)] text-xl rotate-[-8deg]">FRYCARDS</div>
      )}
    </div>
  );
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
          className="absolute top-[12%] block"
          style={{
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
  // Big hauls (bulk opens, boxes) skip the one-at-a-time reveal — clicking
  // through 30+ flips is a chore, and the grouped summary is the payoff.
  const bigHaul = pulls.length > 12;
  const [stage, setStage] = useState<Stage>('pack');

  return (
    <div className="fixed inset-0 bg-[var(--c-ink)]/95 z-50 flex flex-col items-center justify-center p-4 overflow-y-auto">
      <style>{PACK_OPENING_CSS}</style>
      <div className="absolute inset-0 starburst-ray opacity-20 pointer-events-none" />
      {stage === 'pack' && (
        <TearStage
          packName={packName}
          packImageUrl={packImageUrl}
          reducedMotion={reducedMotion}
          onTorn={() => setStage(bigHaul ? 'summary' : 'reveal')}
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

  const finishTear = () => {
    if (tornRef.current) return;
    tornRef.current = true;
    setProgress(1);
    setTorn(true);
    window.setTimeout(onTorn, reducedMotion ? 120 : 850);
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
          width: 'min(420px, 86vw)',
          animation: shaking
            ? `po-shake ${Math.max(0.12, 0.3 - progress * 0.18)}s linear infinite`
            : torn && !reducedMotion
              ? 'none'
              : undefined,
        }}
      >
        {/* The tear-off foil strip */}
        <div
          ref={stripRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn(
            'relative h-16 ink-border-md overflow-hidden po-anim z-10',
            !torn && 'cursor-grab active:cursor-grabbing',
          )}
          style={{
            background:
              'repeating-linear-gradient(115deg, #C9CED6 0px, #F3F4F6 10px, #AEB6C2 20px, #E5E7EB 30px)',
            transform: torn
              ? undefined
              : `translateX(${progress * 14}px) rotate(${progress * 2}deg)`,
            animation:
              torn && !reducedMotion
                ? 'po-strip-fly 0.8s cubic-bezier(.4,-0.1,.7,.4) forwards'
                : undefined,
            opacity: torn && reducedMotion ? 0 : undefined,
            // serrated bottom edge
            clipPath:
              'polygon(0 0, 100% 0, 100% 88%, 96% 100%, 92% 88%, 88% 100%, 84% 88%, 80% 100%, 76% 88%, 72% 100%, 68% 88%, 64% 100%, 60% 88%, 56% 100%, 52% 88%, 48% 100%, 44% 88%, 40% 100%, 36% 88%, 32% 100%, 28% 88%, 24% 100%, 20% 88%, 16% 100%, 12% 88%, 8% 100%, 4% 88%, 0 100%)',
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center gap-2 pointer-events-none">
            <span className="heading-font text-[11px] text-[var(--c-ink)] tracking-widest">
              {progress > 0.03 ? 'KEEP RIPPING ▸▸' : '◂ TEAR HERE ▸'}
            </span>
          </div>
          {/* rip progress darkening */}
          <div
            className="absolute inset-y-0 left-0 bg-[var(--c-ink)]/25 pointer-events-none"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        {/* The pack body */}
        <div
          className="relative ink-border-md shadow-hard-yellow overflow-hidden bg-[var(--c-ink)] po-anim"
          style={{
            aspectRatio: '77 / 96',
            marginTop: -2,
            animation:
              torn && !reducedMotion ? 'po-pack-drop 0.9s ease-in 0.35s forwards' : undefined,
          }}
        >
          <SafeImage
            src={packImageUrl}
            alt={packName}
            className="w-full h-full object-cover"
            fallbackText={packName}
          />
          {/* serrated raw edge left behind at the top once torn */}
          {torn && (
            <div
              className="absolute top-0 inset-x-0 h-3 bg-[#E5E7EB] border-b-2 border-[var(--c-ink)]"
              style={{
                clipPath:
                  'polygon(0 0, 100% 0, 100% 40%, 96% 100%, 92% 40%, 88% 100%, 84% 40%, 80% 100%, 76% 40%, 72% 100%, 68% 40%, 64% 100%, 60% 40%, 56% 100%, 52% 40%, 48% 100%, 44% 40%, 40% 100%, 36% 40%, 32% 100%, 28% 40%, 24% 100%, 20% 40%, 16% 100%, 12% 40%, 8% 100%, 4% 40%, 0 100%)',
              }}
            />
          )}
        </div>

        {torn && !reducedMotion && <FoilScraps />}
      </div>

      {/* progress meter + accessible fallback */}
      <div className="mt-6 w-56 h-2.5 ink-border-sm bg-[var(--c-paper)]/20 overflow-hidden relative">
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
        CARD {index + 1} / {pulls.length} —{' '}
        {currentShown ? 'CLICK TO CONTINUE ▸' : 'CLICK TO FLIP'}
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
          !current.converted_to_shards &&
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
              currentShown && !current.converted_to_shards && rarityGlow(current.rarity),
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
                dimmed={current.converted_to_shards}
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
              {current.converted_to_shards && currentShown && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="heading-font text-lg bg-[var(--c-ink)] text-[#67E8F9] px-3 py-1.5 ink-border-md shadow-hard-black-xs">
                    ✦ +{current.shards} SHARDS
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        {currentShown &&
          rarityRank(current.rarity) >= rarityRank('Super-Rare') &&
          !current.converted_to_shards && (
            <div className="absolute -inset-12 pointer-events-none starburst-ray opacity-70 -z-10" />
          )}
      </div>

      {/* rarity readout */}
      <div className="h-9 mt-4 flex items-center">
        {currentShown && (
          <div
            className={cn(
              'heading-font text-sm px-3 py-1 ink-border-sm',
              current.converted_to_shards
                ? 'bg-[var(--c-ink)] text-[#67E8F9]'
                : RARITY_CHIP[current.rarity] || RARITY_CHIP.Common,
            )}
          >
            {current.converted_to_shards
              ? `DUPLICATE PROTECTED — ${current.rarity.toUpperCase()} → SHARDS`
              : `${current.rarity.toUpperCase()}${current.foil ? ' · FOIL ✦' : ''}${
                  current.serialized ? ` · SERIALIZED #${current.serial_number}/${current.serial_cap}` : ''
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

  // Big hauls (bulk opens, boxes) collapse identical pulls into one compact
  // card with a ×N count instead of a wall of 30+ full-size cards.
  const grouped = pulls.length > 12;
  const groups = useMemo(() => {
    const m = new Map<
      string,
      { pull: PackPull; count: number; indices: number[] }
    >();
    pulls.forEach((p, i) => {
      const key = `${p.card_id}:${p.foil}:${p.serialized ? `s${p.serial_number}` : ''}:${p.converted_to_shards}`;
      const g = m.get(key) || { pull: p, count: 0, indices: [] };
      g.count += 1;
      g.indices.push(i);
      m.set(key, g);
    });
    return [...m.values()].sort(
      (a, b) =>
        rarityRank(b.pull.rarity) - rarityRank(a.pull.rarity) ||
        Number(b.pull.foil) - Number(a.pull.foil) ||
        a.pull.name.localeCompare(b.pull.name),
    );
  }, [pulls]);

  const shardsGained = pulls.reduce((s, p) => s + (p.converted_to_shards ? p.shards : 0), 0);
  const convertedCount = pulls.filter((p) => p.converted_to_shards).length;

  // Best pull: highest rarity (kept copies beat shard conversions, foils win ties).
  const bestIndex = useMemo(() => {
    let best = 0;
    const score = (p: PackPull) =>
      rarityRank(p.rarity) * 100 +
      (p.converted_to_shards ? 0 : 10) +
      (p.foil ? 1 : 0) +
      (p.serialized ? 1000 : 0);
    pulls.forEach((p, i) => {
      if (score(p) > score(pulls[best])) best = i;
    });
    return best;
  }, [pulls]);

  // Quicksell straight from the haul — mostly for the common/uncommon
  // clutter a big box tends to dump, without a separate trip to Collection.
  const { refreshCollection, refreshProfile } = useMeta();
  const [sold, setSold] = useState<Set<number>>(new Set());
  const [sellBusy, setSellBusy] = useState(false);
  const [sellError, setSellError] = useState('');
  const [sellNotice, setSellNotice] = useState('');

  const clutterIndices = pulls
    .map((_, i) => i)
    .filter(
      (i) =>
        !sold.has(i) &&
        !pulls[i].converted_to_shards &&
        (pulls[i].rarity === 'Common' || pulls[i].rarity === 'Uncommon'),
    );

  const quicksellClutter = async () => {
    if (sellBusy || clutterIndices.length === 0) return;
    setSellBusy(true);
    setSellError('');
    setSellNotice('');
    // group by (card_id, foil) so identical pulls sell in one RPC call each
    const groups = new Map<string, { cardId: string; foil: boolean; qty: number; indices: number[] }>();
    for (const i of clutterIndices) {
      const p = pulls[i];
      const key = `${p.card_id}:${p.foil}`;
      const g = groups.get(key) || { cardId: p.card_id, foil: p.foil, qty: 0, indices: [] };
      g.qty += 1;
      g.indices.push(i);
      groups.set(key, g);
    }
    let totalCredits = 0;
    let totalCards = 0;
    const newlySold = new Set<number>();
    for (const g of groups.values()) {
      const { data, error } = await quicksellCards(g.cardId, g.qty, g.foil);
      if (error) {
        setSellError(error);
        break;
      }
      if (data) {
        totalCredits += data.total;
        totalCards += data.sold;
        g.indices.forEach((i) => newlySold.add(i));
      }
    }
    setSellBusy(false);
    if (newlySold.size > 0) setSold((s) => new Set([...s, ...newlySold]));
    if (totalCards > 0) {
      setSellNotice(`Quicksold ${totalCards} card${totalCards === 1 ? '' : 's'} for ${fmtCredits(totalCredits)}.`);
      refreshCollection();
      refreshProfile();
    }
  };

  return (
    <div className="relative flex flex-col items-center max-h-full w-full">
      <h2 className="heading-font text-2xl text-[var(--c-yellow)] mb-1 text-center">
        {packName.toUpperCase()}
      </h2>
      <p className="text-[var(--c-paper)]/70 text-xs font-bold mb-4">
        Your haul — {pulls.length} card{pulls.length === 1 ? '' : 's'}
      </p>

      <div className="flex flex-wrap justify-center gap-2 mb-5">
        {rarityCounts.map(([r, n]) => (
          <span
            key={r}
            className={cn(
              'text-[10px] font-black px-2 py-1 ink-border-sm',
              RARITY_CHIP[r] || RARITY_CHIP.Common,
            )}
          >
            {r.toUpperCase()} ×{n}
          </span>
        ))}
        {shardsGained > 0 && (
          <span className="text-[10px] font-black px-2 py-1 ink-border-sm bg-[var(--c-ink)] text-[#67E8F9]">
            ✦ +{shardsGained} SHARDS
          </span>
        )}
      </div>

      {grouped && (
        <div className="flex flex-col items-center mb-5">
          {/* Best-pull spotlight, full size, above the compact haul grid. */}
          <div className="relative mb-2">
            <div className="absolute -inset-10 pointer-events-none starburst-ray opacity-60 -z-10" />
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 heading-font text-[10px] bg-[var(--c-yellow)] text-[var(--c-ink)] px-2 py-0.5 ink-border-sm shadow-hard-black-xs flex items-center gap-1 whitespace-nowrap">
              <Sparkles className="w-3 h-3" />{' '}
              {pulls[bestIndex]?.serialized ? 'SERIALIZED!' : 'BEST PULL'}
            </div>
            <div className={cn(rarityGlow(pulls[bestIndex]?.rarity))}>
              <CardFace
                def={pullToDef(pulls[bestIndex])}
                size="full"
                foil={pulls[bestIndex]?.foil}
                serial={
                  pulls[bestIndex]?.serialized
                    ? {
                        number: pulls[bestIndex].serial_number!,
                        cap: pulls[bestIndex].serial_cap!,
                      }
                    : undefined
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2 max-w-5xl px-2 max-h-[38vh] overflow-y-auto">
            {groups.map((grp, gi) => {
              const allSold = grp.indices.every((i) => sold.has(i));
              return (
                <div key={gi} className="relative">
                  <CardFace
                    def={pullToDef(grp.pull)}
                    size="compact"
                    foil={grp.pull.foil}
                    count={grp.count > 1 ? grp.count : undefined}
                    dimmed={grp.pull.converted_to_shards || allSold}
                    serial={
                      grp.pull.serialized
                        ? { number: grp.pull.serial_number!, cap: grp.pull.serial_cap! }
                        : undefined
                    }
                  />
                  {(grp.pull.converted_to_shards || allSold) && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="heading-font text-[9px] bg-[var(--c-ink)] text-[#67E8F9] px-1.5 py-0.5 ink-border-sm">
                        {allSold && !grp.pull.converted_to_shards
                          ? 'SOLD'
                          : `✦ +${grp.pull.shards * grp.count}`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center items-end gap-5 max-w-6xl mb-4 px-2">
        {!grouped &&
          pulls.map((pull, i) => {
          const def = pullToDef(pull);
          const isBest = i === bestIndex && pulls.length > 1;
          return (
            // Split static positioning (outer, e.g. the best-pull scale-up)
            // from the entrance animation (inner): both set `transform`, and
            // stacking them on one element meant the animation — which has
            // no `forwards` fill — reverted to the outer's static transform
            // the instant it finished, producing a visible snap/jump.
            // Nested elements compose their transforms instead of fighting.
            <div key={i} className={cn('relative', isBest && 'scale-110 z-10 mx-3')}>
              <div
                className="relative po-anim"
                style={{
                  animation: reducedMotion ? undefined : 'po-card-out 0.35s ease-out backwards',
                  animationDelay: reducedMotion ? undefined : `${i * 70}ms`,
                }}
              >
                {isBest && (
                  <>
                    <div className="absolute -inset-10 pointer-events-none starburst-ray opacity-60 -z-10" />
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 heading-font text-[10px] bg-[var(--c-yellow)] text-[var(--c-ink)] px-2 py-0.5 ink-border-sm shadow-hard-black-xs flex items-center gap-1 whitespace-nowrap">
                      <Sparkles className="w-3 h-3" /> {pull.serialized ? 'SERIALIZED!' : 'BEST PULL'}
                    </div>
                  </>
                )}
                <div className={cn(!pull.converted_to_shards && !sold.has(i) && rarityGlow(pull.rarity))}>
                  <CardFace
                    def={def}
                    size="full"
                    foil={pull.foil}
                    dimmed={pull.converted_to_shards || sold.has(i)}
                    serial={
                      pull.serialized
                        ? { number: pull.serial_number!, cap: pull.serial_cap! }
                        : undefined
                    }
                  />
                </div>
                {sold.has(i) && !pull.converted_to_shards && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="heading-font text-sm bg-[var(--c-ink)] text-[var(--c-yellow)] px-2 py-1 ink-border-sm shadow-hard-black-xs">
                      SOLD
                    </span>
                  </div>
                )}
                {pull.converted_to_shards && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="heading-font text-sm bg-[var(--c-ink)] text-[#67E8F9] px-2 py-1 ink-border-sm shadow-hard-black-xs">
                      ✦ +{pull.shards} SHARDS
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {convertedCount > 0 && (
        <p className="text-[10px] font-bold text-[#67E8F9] mb-4 text-center max-w-md">
          {convertedCount} pull{convertedCount === 1 ? '' : 's'}{' '}
          {convertedCount === 1 ? 'was' : 'were'} past your copy cap and converted to ✦{' '}
          {shardsGained} shards instead of a duplicate.
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
              {sellBusy ? 'SELLING…' : `QUICKSELL COMMONS & UNCOMMONS (${clutterIndices.length})`}
            </span>
          </PopButton>
        )}
        <PopButton color="red" onClick={onDone}>
          DONE ✓
        </PopButton>
      </div>
      <div className="h-4 shrink-0" />
    </div>
  );
}
