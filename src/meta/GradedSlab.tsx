/**
 * The slab — a graded card in its case.
 *
 * v25 shipped this as a coloured rectangle: a 2px padded div with the
 * service's gradient behind it, a label strip carrying a stamp and a number,
 * and the card face sitting directly on the background. It read as a card with
 * a border, which is the one thing a slab must not read as — the whole point
 * of the mini-game is that the encased copy is a DIFFERENT object from the raw
 * one, worth up to twelve times as much, and the picture has to earn that.
 *
 * So this is built like the real thing:
 *
 *  - a moulded acrylic SHELL with a bevel highlight down its top-left edge and
 *    a shadowed inner well, so the case has thickness;
 *  - a three-zone LABEL — service wordmark and cert number, the card's own
 *    name and rarity line, then the grade numeral and its word — laid out the
 *    way every real grading label in the world is laid out;
 *  - a glass GLARE band across the window, and, for the top grades only, a
 *    slow travelling shine (a 10 should be visibly special from across the
 *    Collection, and it is the only grade that gets motion);
 *  - a cert strip along the bottom with a barcode derived from the row id, so
 *    two slabs of the same card are visibly different objects;
 *  - a PENDING state that frosts the window — the card is in the case but its
 *    grade is not rolled yet, and a screen that shows the card crisply while
 *    claiming it is "at the graders" is telling a small lie.
 *
 * Grade tiers get their own case treatment: 10 is gold, 9.5 silver, 9 and 8.5
 * keep the service's own colours, and anything at 7 or below is deliberately
 * flat and grey — a low grade should look like a low grade on the shelf.
 */
import React from 'react';
import { Clock } from 'lucide-react';
import { CardFace, CARD_SIZES } from '../components/CardFaceV4';
import { POOL_BY_ID } from '../game/v3/cardpool';
import { cn } from '../lib/utils';
import { GradedCard, GRADING_SERVICE_BY_ID, GRADE_WORDS, fmtGrade } from './grading';

export type SlabSize = 'compact' | 'standard' | 'full';

/** Card-face size per slab size, plus the label metrics that go with it. */
const SLAB_TIER: Record<
  SlabSize,
  { face: 'compact' | 'standard' | 'full'; pad: number; label: number; grade: number; cert: number }
> = {
  compact: { face: 'compact', pad: 7, label: 8, grade: 20, cert: 5 },
  standard: { face: 'standard', pad: 9, label: 9, grade: 26, cert: 6 },
  full: { face: 'full', pad: 14, label: 12, grade: 44, cert: 8 },
};

/** Case treatment by grade — see the header. `null` grade is still pending. */
function caseTone(grade: number | null): {
  plate: string;
  plateInk: string;
  accent: string;
  shine: boolean;
} {
  if (grade == null)
    return { plate: '#6b6f76', plateInk: '#0d0d0d', accent: '#9aa0a8', shine: false };
  if (grade >= 10) return { plate: '#f0c419', plateInk: '#1a1a1a', accent: '#ffe083', shine: true };
  if (grade >= 9.5)
    return { plate: '#dfe6ec', plateInk: '#1a1a1a', accent: '#ffffff', shine: true };
  if (grade >= 8.5)
    return { plate: '#f7f3e6', plateInk: '#1a1a1a', accent: '#fff8e1', shine: false };
  if (grade >= 7.5)
    return { plate: '#e8e4d8', plateInk: '#1a1a1a', accent: '#f2eee2', shine: false };
  return { plate: '#b9b6ad', plateInk: '#26241f', accent: '#cfccc4', shine: false };
}

/**
 * A stable 8-digit certification number, and the bar pattern printed under it.
 *
 * Derived from the row id rather than stored: the number exists to make two
 * copies of the same card at the same grade tell each other apart on a shelf,
 * and a column that only ever feeds a decoration is a column to migrate, back
 * up and keep in sync forever for no gain.
 */
function certOf(id: string): { no: string; bars: number[] } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const no = String(h % 100000000).padStart(8, '0');
  const bars: number[] = [];
  let x = h || 1;
  for (let i = 0; i < 26; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    bars.push(1 + (x % 3));
  }
  return { no, bars };
}

export const SLAB_CSS = `
@keyframes slab-shine {
  0% { transform: translateX(-120%) rotate(8deg); opacity: 0; }
  12% { opacity: 0.85; }
  55% { opacity: 0.5; }
  100% { transform: translateX(240%) rotate(8deg); opacity: 0; }
}
.slab-shine { animation: slab-shine 4.5s ease-in-out infinite; }
@property --slab-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
@keyframes slab-spin { to { --slab-angle: 360deg; } }
@keyframes slab-holo { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
@keyframes slab-twinkle { 0%, 100% { opacity: 0; transform: scale(0.4) rotate(0deg); } 50% { opacity: 1; transform: scale(1) rotate(45deg); } }
.slab-ring { animation: slab-spin 6s linear infinite; }
.slab-holo { background-size: 200% 100%; animation: slab-holo 5s linear infinite; }
.slab-twinkle { animation: slab-twinkle 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  html:not([data-motion='full']) .slab-shine { animation: none; opacity: 0.25; }
  html:not([data-motion='full']) .slab-ring,
  html:not([data-motion='full']) .slab-holo,
  html:not([data-motion='full']) .slab-twinkle { animation: none; }
}
/* The in-app Motion setting (useMotionMode sets <html data-motion="reduced">). */
html[data-motion='reduced'] .slab-shine { animation: none; opacity: 0.25; }
html[data-motion='reduced'] .slab-ring,
html[data-motion='reduced'] .slab-holo,
html[data-motion='reduced'] .slab-twinkle { animation: none; }
`;

/**
 * Premium case for the top three grades. A 9 (MINT) gets a cool holo-steel
 * case, a 9.5 (MINT+) a prismatic one, and a 10 (GEM MINT) a gold case with a
 * turning ring and sparkles — the three should be told apart across a shelf.
 */
export type PremiumTier = 'mint' | 'mintplus' | 'gem' | null;
export function premiumTier(grade: number | null): PremiumTier {
  if (grade == null) return null;
  if (grade >= 10) return 'gem';
  if (grade >= 9.5) return 'mintplus';
  if (grade >= 9) return 'mint';
  return null;
}
const PREMIUM: Record<
  Exclude<PremiumTier, null>,
  { ring: string; shell: string; badge: string }
> = {
  mint: {
    ring: 'conic-gradient(from var(--slab-angle), #9fd8ff, #e9f6ff, #5aa9e6, #e9f6ff, #9fd8ff)',
    shell: 'linear-gradient(135deg, #3c5a73 0%, #a9cbe3 45%, #3c5a73 100%)',
    badge: 'MINT',
  },
  mintplus: {
    ring: 'conic-gradient(from var(--slab-angle), #ff7ad9, #ffd36e, #7dffb0, #6ec8ff, #b98bff, #ff7ad9)',
    shell:
      'linear-gradient(110deg, #2b2440 0%, #6d5ba8 20%, #3f8fb0 40%, #5fb07a 60%, #b0904a 80%, #2b2440 100%)',
    badge: 'MINT+',
  },
  gem: {
    ring: 'conic-gradient(from var(--slab-angle), #fff3b0, #f0c419, #8a5a00, #ffe083, #fffbe6, #f0c419, #fff3b0)',
    shell:
      'linear-gradient(135deg, #5a3b00 0%, #f0c419 35%, #fff3b0 50%, #c48a00 70%, #5a3b00 100%)',
    badge: '◆ GEM MINT',
  },
};

/**
 * Condition damage, drawn on the card under the glass. Graders grade the
 * card's condition, so a low number must LOOK like the copy that earned it:
 * 7.x is a single soft corner, 6.x adds edge whitening and a scuff, 5.x is
 * creased, yellowed and in a cracked case. Deterministic per slab (seeded by
 * the cert hash), so the same slab is always damaged the same way.
 */
export function conditionOf(grade: number | null): 0 | 1 | 2 | 3 {
  if (grade == null || grade >= 8) return 0;
  if (grade >= 7) return 1;
  if (grade >= 6) return 2;
  return 3;
}
/** A small LCG stream — pure per seed, so the same slab always wears the same way. */
function seededRandom(seed: number): () => number {
  const state = { x: seed >>> 0 };
  return () => {
    state.x = (Math.imul(state.x, 1664525) + 1013904223) >>> 0;
    return state.x / 4294967296;
  };
}

function Damage({ level, seed }: { level: 1 | 2 | 3; seed: number }) {
  const rnd = seededRandom(seed || 7);
  const corners: [number, number][] = [
    [0, 0],
    [100, 0],
    [0, 140],
    [100, 140],
  ];
  const worn = corners.filter((_, i) => i === Math.floor(rnd() * 4) || rnd() < (level - 1) * 0.35);
  const scratches = level >= 2 ? 2 + Math.floor(rnd() * 3) : 0;
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
      aria-hidden
    >
      {level >= 2 && (
        // edge whitening — a ragged pale frame
        <rect
          x="0.8"
          y="0.8"
          width="98.4"
          height="138.4"
          fill="none"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth={level === 3 ? 2.4 : 1.4}
          strokeDasharray={level === 3 ? '3 1.5 6 2' : '5 3 2 4'}
        />
      )}
      {worn.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={3 + level * 2.2} fill="rgba(255,255,255,0.82)" />
      ))}
      {Array.from({ length: scratches }, (_, i) => {
        const x1 = rnd() * 90 + 5;
        const y1 = rnd() * 120 + 10;
        return (
          <line
            key={`s${i}`}
            x1={x1}
            y1={y1}
            x2={x1 + (rnd() - 0.5) * 40}
            y2={y1 + (rnd() - 0.2) * 30}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="0.5"
          />
        );
      })}
      {level === 3 && (
        <>
          {/* the crease: a dark fold line with a light ridge beside it */}
          <path
            d={`M -2 ${40 + rnd() * 50} L 102 ${30 + rnd() * 70}`}
            stroke="rgba(0,0,0,0.45)"
            strokeWidth="1.1"
            fill="none"
          />
          <path
            d={`M -2 ${41 + rnd() * 50} L 102 ${31 + rnd() * 70}`}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="0.6"
            fill="none"
          />
          {/* water stain */}
          <ellipse
            cx={20 + rnd() * 60}
            cy={30 + rnd() * 80}
            rx={10 + rnd() * 8}
            ry={7 + rnd() * 6}
            fill="rgba(140,100,30,0.16)"
            stroke="rgba(120,80,20,0.25)"
            strokeWidth="0.6"
          />
        </>
      )}
    </svg>
  );
}

export function GradedSlab({
  g,
  size = 'compact',
  onClick,
  selected,
  /** Ratio 0…1 of the way through the turnaround — draws a fill on the label
   * of a pending slab instead of a bare clock. */
  progress,
}: {
  /** Declared so a `key` on a mapped <GradedSlab> typechecks — React strips it
   * before the props ever reach this function. */
  key?: React.Key;
  g: GradedCard;
  size?: SlabSize;
  onClick?: () => void;
  selected?: boolean;
  progress?: number;
}) {
  const def = POOL_BY_ID[g.card_id];
  const svc = GRADING_SERVICE_BY_ID[g.service];
  if (!def) return null;
  const tier = SLAB_TIER[size];
  const graded = g.grade != null;
  const tone = caseTone(g.grade);
  const cert = certOf(g.id);
  const word = graded ? (GRADE_WORDS[String(g.grade)] ?? 'GRADED') : 'AT THE GRADERS';
  const premium = premiumTier(g.grade);
  const prem = premium ? PREMIUM[premium] : null;
  const condition = conditionOf(g.grade);
  const certSeed = parseInt(cert.no, 10);

  const interactive = !!onClick;
  return (
    // A <div role="button">, never a <button>: CardFace prints its keyword and
    // cost chips as real buttons, and nesting one inside another is invalid
    // HTML that breaks keyboard and screen-reader navigation (v26 audit).
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick || e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={
        graded
          ? `${def.name}, graded ${fmtGrade(g.grade!)} ${word} by ${svc.name}, certificate ${cert.no}`
          : `${def.name}, at the graders with ${svc.name}`
      }
      className={cn(
        'relative shrink-0 select-none',
        interactive && 'btn-pop cursor-pointer',
        selected && 'ring-4 ring-[var(--c-yellow)]',
      )}
      style={{
        // The case is exactly as wide as the card it holds. Without this the
        // label — which wants room for a name AND a grade block — set the
        // width, and every slab carried a strip of empty acrylic down its
        // right-hand side where the card was not.
        width: CARD_SIZES[tier.face].w + tier.pad * 2,
        padding: tier.pad,
        borderRadius: Math.round(tier.pad * 1.4),
        border: '3px solid var(--c-ink)',
        // The acrylic itself: the service's colour under a vertical sheen.
        backgroundImage: `linear-gradient(150deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.06) 26%, rgba(0,0,0,0.16) 60%, rgba(255,255,255,0.18) 100%), ${prem ? prem.shell : svc.slab.frame}`,
        boxShadow: prem
          ? `inset 0 2px 0 rgba(255,255,255,0.7), inset 0 -3px 6px rgba(0,0,0,0.45), 4px 4px 0 rgba(0,0,0,0.6), 0 0 ${premium === 'gem' ? 18 : 10}px ${premium === 'gem' ? 'rgba(240,196,25,0.75)' : premium === 'mintplus' ? 'rgba(185,139,255,0.6)' : 'rgba(110,200,255,0.55)'}`
          : 'inset 0 2px 0 rgba(255,255,255,0.55), inset 0 -3px 6px rgba(0,0,0,0.45), 4px 4px 0 rgba(0,0,0,0.6)',
      }}
    >
      {/* Premium ring: a turning conic border on MINT and up. */}
      {prem && (
        <div
          className="slab-ring absolute pointer-events-none"
          style={{
            inset: -3,
            borderRadius: Math.round(tier.pad * 1.4) + 2,
            padding: 3,
            background: prem.ring,
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
          aria-hidden
        />
      )}
      {premium === 'gem' &&
        [
          [8, 18],
          [88, 40],
          [14, 78],
          [80, 92],
        ].map(([lx, ty], i) => (
          <span
            key={i}
            className="slab-twinkle absolute pointer-events-none z-10"
            style={{
              left: `${lx}%`,
              top: `${ty}%`,
              width: 10,
              height: 10,
              animationDelay: `${i * 0.6}s`,
              background:
                'radial-gradient(circle, #fff 0 20%, transparent 21%), conic-gradient(from 45deg, transparent 0 20%, #fff8c4 20% 30%, transparent 30% 45%, #fff8c4 45% 55%, transparent 55% 70%, #fff8c4 70% 80%, transparent 80%)',
            }}
            aria-hidden
          />
        ))}
      {/* Label — the part a collector reads first. */}
      <div
        className="relative flex items-stretch gap-1 mb-1.5 overflow-hidden"
        style={{
          background: tone.plate,
          color: tone.plateInk,
          border: '2px solid var(--c-ink)',
          borderRadius: 3,
        }}
      >
        {prem && (
          <div
            className="slab-holo absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                premium === 'gem'
                  ? 'linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.65) 25%, rgba(255,240,180,0) 50%, rgba(255,255,255,0.5) 75%, rgba(255,255,255,0) 100%)'
                  : 'linear-gradient(100deg, rgba(255,122,217,0.25), rgba(255,211,110,0.25), rgba(125,255,176,0.25), rgba(110,200,255,0.25), rgba(185,139,255,0.25), rgba(255,122,217,0.25))',
              mixBlendMode: 'multiply',
              opacity: premium === 'mint' ? 0.55 : 0.9,
            }}
            aria-hidden
          />
        )}
        {/* Pending fill: the label doubles as the turnaround progress bar. */}
        {!graded && progress !== undefined && (
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`,
              background: 'rgba(255,255,255,0.5)',
            }}
            aria-hidden
          />
        )}
        <div className="relative flex-1 min-w-0 px-1.5 py-1">
          <div
            className="heading-font leading-none truncate"
            style={{ fontSize: tier.label, letterSpacing: '0.04em' }}
          >
            {size === 'full'
              ? svc.slab.stamp
              : `${svc.short}${size === 'standard' ? ` · ${svc.slab.stamp.split('·')[1]?.trim() ?? 'GRADED'}` : ''}`}
          </div>
          <div
            className="font-black leading-tight truncate"
            style={{ fontSize: tier.label + 1 }}
            title={def.name}
          >
            {def.name}
          </div>
          <div
            className="font-bold leading-none truncate opacity-70"
            style={{ fontSize: tier.cert + 1 }}
          >
            {def.rarity ?? 'Common'}
            {g.foil ? ' · FOIL ✦' : ''} · {def.set ?? 'FRYCARDS'}
          </div>
        </div>
        <div
          className="relative flex flex-col items-center justify-center px-1.5"
          style={{ borderLeft: '2px solid var(--c-ink)', minWidth: tier.grade * 1.5 }}
        >
          {graded ? (
            <>
              <span className="heading-font leading-none" style={{ fontSize: tier.grade }}>
                {fmtGrade(g.grade!)}
              </span>
              <span
                className="heading-font leading-none whitespace-nowrap"
                style={{ fontSize: tier.cert }}
              >
                {prem ? prem.badge : word}
              </span>
            </>
          ) : (
            <>
              <Clock style={{ width: tier.grade * 0.6, height: tier.grade * 0.6 }} aria-hidden />
              <span className="heading-font leading-none" style={{ fontSize: tier.cert }}>
                PENDING
              </span>
            </>
          )}
        </div>
      </div>

      {/* Window — the card under glass. */}
      <div
        className="relative overflow-hidden"
        style={{
          borderRadius: 3,
          boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.55), inset 0 6px 12px rgba(0,0,0,0.35)',
        }}
      >
        <div
          className={cn(!graded && 'blur-[2px] saturate-50 opacity-80')}
          style={{
            display: 'block',
            // Age shows: low grades are faded and yellowed under the glass.
            filter:
              condition === 3
                ? 'sepia(0.45) saturate(0.7) brightness(0.95)'
                : condition === 2
                  ? 'sepia(0.18) saturate(0.85)'
                  : undefined,
          }}
        >
          <CardFace def={def} size={tier.face} foil={g.foil} />
        </div>
        {condition > 0 && <Damage level={condition as 1 | 2 | 3} seed={certSeed} />}
        {/* Static glare across the top-left of the glass. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(118deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.06) 22%, rgba(255,255,255,0) 46%)',
          }}
          aria-hidden
        />
        {/* The top-grade travelling shine. */}
        {tone.shine && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
            <div
              className="slab-shine absolute top-0 bottom-0"
              style={{
                width: '38%',
                background: `linear-gradient(90deg, transparent, ${tone.accent}, transparent)`,
                filter: 'blur(2px)',
              }}
            />
          </div>
        )}
        {condition === 3 && (
          // A cracked case: grade-5 copies come back in a chipped shell.
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 140"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              d={`M ${70 + (certSeed % 20)} -1 L ${62 + (certSeed % 9)} 14 L 74 22 L 66 38`}
              stroke="rgba(255,255,255,0.9)"
              strokeWidth="0.8"
              fill="none"
            />
            <path
              d="M 66 38 L 58 44 M 74 22 L 84 26"
              stroke="rgba(255,255,255,0.7)"
              strokeWidth="0.5"
              fill="none"
            />
          </svg>
        )}
        {!graded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className="heading-font bg-[var(--c-ink)]/80 text-[var(--c-paper)] px-2 py-1 ink-border-sm"
              style={{ fontSize: tier.label }}
            >
              SEALED
            </span>
          </div>
        )}
      </div>

      {/* Cert strip. */}
      <div
        className="flex items-center justify-between gap-1 mt-1 px-1"
        style={{ color: 'rgba(255,255,255,0.85)' }}
      >
        <span className="flex items-end gap-[1px] h-3" aria-hidden>
          {cert.bars.map((w, i) => (
            <span
              key={i}
              style={{
                width: w,
                height: '100%',
                background: i % 2 ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.6)',
              }}
            />
          ))}
        </span>
        <span className="font-mono leading-none" style={{ fontSize: tier.cert }}>
          #{cert.no}
        </span>
      </div>
    </div>
  );
}
