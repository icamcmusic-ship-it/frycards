/**
 * Shared v4.2 card-face rendering — the ONE card template used everywhere
 * (match UI, deck builder, collection, store/pack reveals) so a card looks
 * and reads identically no matter where it's shown. Real trading-card
 * proportions: 2.5" × 3.5" (5:7).
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dices, Swords, Heart, Crown, MapPin, Wand2, Zap } from 'lucide-react';
import { CardDef, CardType, Effect } from '../game/v3/cards';
import { cn } from '../lib/utils';
import {
  rarityChip,
  rarityBorder,
  rarityGlow,
  rarityBg,
  rarityAnimated,
  isMythic,
  RARITY_HEX,
} from '../meta/rarity';

export function kwList(def: CardDef): string[] {
  return def.keywords || [];
}

/** Small per-type glyph shown next to the name — a quick visual "what is this" cue. */
const TYPE_ICON: Record<CardType, React.ComponentType<{ className?: string }>> = {
  Leader: Crown,
  Unit: Swords,
  Location: MapPin,
  Charm: Wand2,
  Event: Zap,
};

/** v4.3: short rules explainer per keyword, shown in a click-to-open popover. */
export const KEYWORD_GLOSSARY: Record<string, string> = {
  Guard:
    'While you control any Guard Unit, your opponent must attack a Guard Unit first — resolved one at a time until none remain.',
  Swift: "May attack or use an Ability Slot the turn it's cast, instead of waiting a turn.",
  Pierce:
    "Leftover damage past what's needed to destroy the target Unit carries through to the enemy Leader.",
  Ward: 'Prevents the first instance of damage or Removal against this card each turn (not retaliation from its own attack). Refreshes every End Phase.',
  Frenzy:
    'May attack a second time in the same Combat Phase if it survives its first attack. Only the second attack takes doubled retaliation.',
  Anchor:
    "This card's effective Cast Slot cost drops by 1 for each other Anchor card you control in play, to a max total of -2.",
  Echo: 'After this card is discarded (any reason), it can later be recast from Discard by paying its cost plus discarding one extra card from hand.',
  Scrap:
    'Discard this card from hand to reroll one of your unplaced dice, any time during Placement Phase.',
  Rally:
    "Once per turn, activate this card's Ability Slot for free using a die already resting on another exhausted friendly Ability Slot.",
  Twin: 'Has two Cast Slots requiring an identical rolled face value. Filling the first parks it in your Staging Zone until a matching die completes it.',
  Bulwark:
    'Flat reduction to damage this Unit takes from attacks — both when defending and when it deals/takes retaliation while attacking.',
  Toll: 'While this Unit is in play, ALL incoming damage to your Leader (any source) is reduced.',
  Avenge:
    'Permanently gains +1/+1 whenever another friendly Unit dies — an automatic trigger, no priority window.',
  Crescendo: 'Adds bonus value to this Event per die showing a 6 that you placed this turn.',
  Aftershock:
    'After this Event resolves, it queues a smaller repeat of its effect to fire at the very start of your next turn.',
  Snap: 'May be cast during your Reroll Phase, before the reroll window closes, instead of waiting for Placement.',
  Tribute: 'Triggers at your End Phase if you Pitched 2 or more dice this turn.',
  Excavate:
    "This Location's Ability Slot threshold drops the longer it stays continuously in play.",
  Contested:
    "This Location's passive doubles while your opponent controls no Location of their own.",
  Resolve: 'While your Leader is at or below half HP, its Ability Slot threshold drops.',
  Ultimate:
    'A second, once-per-game Leader Ability Slot, usable starting on a specific turn of yours.',
};

/** v4.3: player-facing display label for each dice-pattern gate. */
export const GATE_LABEL: Record<string, string> = {
  AnyPair: 'PAIRS',
  TwoPair: 'TWO PAIR',
  ThreeKind: '3 OF A KIND',
  FourKind: '4 OF A KIND',
  Yahtzee: '5 OF A KIND',
  FullHouse: 'FULL HOUSE',
  SmallStraight: 'SM. STRAIGHT',
  LargeStraight: 'LG. STRAIGHT',
  ThreeOdds: '3 ODDS',
  ThreeEvens: '3 EVENS',
};

/** v4.3: short badge text for this card's Cast Slot cost, any format.
 * `threshold` overrides `def.threshold` — pass the live effective value
 * (post-Anchor-discount) during a match so the badge reflects what it
 * actually costs right now, not just what's printed. */
export function costBadge(def: CardDef, threshold = def.threshold): string | null {
  if (def.comboGate) return GATE_LABEL[def.comboGate] || def.comboGate;
  if (threshold === undefined) return null;
  if (def.castCostKind === 'exact') return `=${threshold}`;
  if (def.castCostKind === 'sum') return `Σ${threshold}`;
  return `${threshold}+`;
}

/** v4.3: one-line plain-English summary of this card's Cast Slot cost. */
export function costSummary(def: CardDef): string | null {
  if (def.comboGate) return `Cast: roll ${GATE_LABEL[def.comboGate] || def.comboGate}`;
  if (def.threshold === undefined) return null;
  if (def.castCostKind === 'exact') return `Cast: one die showing exactly ${def.threshold}`;
  if (def.castCostKind === 'sum') return `Cast: dice totalling ${def.threshold}+`;
  return `Cast: one die ${def.threshold}+`;
}

export function describeEffect(eff: Effect): string {
  const v = eff.value ?? '';
  switch (eff.action) {
    case 'sap':
      return eff.target === 'enemyLeader'
        ? `Sap ${v} enemy Leader`
        : eff.target === 'allEnemyUnits'
          ? `Sap ${v} ALL enemy Units`
          : `Sap ${v}`;
    case 'mend':
      return `Mend ${v}`;
    case 'draw':
      return `Surge (draw ${v})`;
    case 'bind':
      return 'Bind an enemy Unit';
    case 'destroy':
      return eff.target === 'allEnemyUnits' ? 'Destroy ALL enemy Units' : 'Destroy a Unit';
    case 'buff':
      return eff.target === 'allFriendlyUnits'
        ? `All friendly +${v}/+${v}`
        : eff.target === 'self'
          ? `This gains +${v}/+${v}`
          : `A friendly Unit +${v}/+${v}`;
  }
}

/** Every rules line this card prints, one entry per ability/keyword effect. */
export function cardRuleLines(def: CardDef): string[] {
  const bits: string[] = [];
  if (def.comboGate && def.onCast)
    bits.push(
      `Cast (${GATE_LABEL[def.comboGate] || def.comboGate}): ${describeEffect(def.onCast)}`,
    );
  else if (def.onCast) bits.push(`On cast: ${describeEffect(def.onCast)}`);
  if (def.ability)
    bits.push(`Ability ${def.ability.threshold}+: ${describeEffect(def.ability.effect)}`);
  if (def.combo) bits.push(`Combo ${def.combo.pattern}: ${describeEffect(def.combo.effect)}`);
  if (def.overflow)
    bits.push(`Overflow ${def.overflow.amount}: ${describeEffect(def.overflow.effect)}`);
  if (def.twinBonus) bits.push(`Twin bonus: ${describeEffect(def.twinBonus)}`);
  if (def.stagedPassive) bits.push(`While staged: ${describeEffect(def.stagedPassive)} each turn`);
  if (def.aftershock) bits.push(`Aftershock: ${describeEffect(def.aftershock)} next turn`);
  if (def.crescendo) bits.push(`Crescendo ${def.crescendo.x}: +${def.crescendo.x} per 6 placed`);
  if (def.bulwark) bits.push(`Bulwark ${def.bulwark.x}`);
  if (def.toll) bits.push(`Toll ${def.toll.x}`);
  if (def.avenge) bits.push('Avenge: +1/+1 when another friendly Unit dies');
  if (def.locPassive)
    bits.push(def.locPassive === 'ATK_ALL' ? 'Your Units get +1 ATK' : 'Your Units get +1 max HP');
  if (def.contested) bits.push('Contested: passive doubled while opponent has no Location');
  if (def.excavate) bits.push(`Excavate ${def.excavate.x}: ability cheapens each turn`);
  if (def.tribute) bits.push(`Tribute: ${describeEffect(def.tribute)} if you Pitch 2+`);
  if (def.snap) bits.push('Snap: castable during Reroll Phase');
  if (def.resolve) bits.push(`Resolve ${def.resolve.x}: ability cheapens below half HP`);
  if (def.ultimate)
    bits.push(
      `Ultimate turn ${def.ultimate.unlockTurn}+ (${def.ultimate.threshold}+): ${describeEffect(def.ultimate.effect)}`,
    );
  return bits;
}

/** Flat rules text — used for tooltips/inline text that just want one string. */
export function cardRules(def: CardDef): string {
  return cardRuleLines(def).join(' · ');
}

/** Scales a font size down as text grows past a soft length target, so long
 * names/flavor text shrink to fit instead of getting clipped or truncated.
 * Never shrinks below `min`. */
function fitFontSize(text: string, base: number, min: number, softLimit: number): number {
  if (!text || text.length <= softLimit) return base;
  const scaled = base * (softLimit / text.length);
  return Math.max(min, Math.round(scaled * 10) / 10);
}

/** A small tinted, icon-led stat pill (ATK/HP) — replaces plain emoji text
 * with a proper badge so the stat line reads as UI, not a caption. */
function StatChip({
  icon: Icon,
  value,
  maxValue,
  printed,
  tier,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value?: number;
  maxValue?: number;
  /** v4.3 live-match stats: the printed value this live value has drifted
   * from (buff/nerf). Rendered struck through inside the chip itself, so
   * modified stats live in the normal stat position rather than as an extra
   * badge. Omitted (or equal to `value`) renders a plain chip. */
  printed?: number;
  tier: CardSize;
  tint: string;
}) {
  const textClass =
    tier === 'full'
      ? 'text-[12px] px-1.5 py-0.5'
      : tier === 'standard'
        ? 'text-[10px] px-1.5 py-0.5'
        : tier === 'compact'
          ? 'text-[8px] px-1'
          : 'text-[5.5px] px-0.5';
  const iconClass =
    tier === 'full'
      ? 'w-3 h-3'
      : tier === 'standard'
        ? 'w-2.5 h-2.5'
        : tier === 'compact'
          ? 'w-2 h-2'
          : 'w-1.5 h-1.5';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full font-mono font-black border',
        textClass,
      )}
      style={{
        color: tint,
        borderColor: `color-mix(in srgb, ${tint} 45%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${tint} 12%, transparent)`,
      }}
    >
      <Icon className={iconClass} />
      {printed !== undefined && printed !== value && (
        <s className="opacity-50 font-bold">{printed}</s>
      )}
      {value}
      {maxValue !== undefined && <span className="opacity-60 font-bold">/{maxValue}</span>}
    </span>
  );
}

const POPOVER_WIDTH = 180;

/**
 * v4.3: a keyword pill that opens a small popover with its rules text on
 * click — used anywhere a keyword chip is shown (card template, board
 * Units) so players never have to guess what a keyword does. The popover
 * renders through a portal at a viewport-fixed position computed from the
 * button's own bounding rect (clamped to stay on-screen) rather than as an
 * absolutely-positioned child — every place this chip is used sits inside
 * at least one `overflow-hidden`/`overflow-auto` ancestor (the card face
 * itself, the battlefield shell, scrollable hand/collection rows), which
 * would otherwise clip an absolutely-positioned popover into invisibility.
 */
const SEEN_KEYWORDS_KEY = 'frycards_seen_keywords';

function hasSeenKeyword(kw: string): boolean {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEYWORDS_KEY) || '[]');
    return Array.isArray(seen) && seen.includes(kw);
  } catch {
    return false;
  }
}

function markKeywordSeen(kw: string): void {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEYWORDS_KEY) || '[]');
    const next = Array.isArray(seen) ? seen : [];
    if (!next.includes(kw)) localStorage.setItem(SEEN_KEYWORDS_KEY, JSON.stringify([...next, kw]));
  } catch {
    // localStorage unavailable — auto-introduce simply won't dedupe this session.
  }
}

const AUTO_INTRO_GAP_MS = 3500;
const AUTO_INTRO_VISIBLE_MS = 6000;
/** Module-level, shared by every KeywordChip on the page: when several
 * never-seen keywords mount at once (e.g. a fresh opening hand full of
 * distinct keywords), this staggers their auto-introduce popovers instead
 * of firing them all on top of each other in one unreadable stack. */
let nextAutoIntroSlot = 0;

/** Shared popover behavior for any clickable keyword mention — the pill chip
 * (kwList) and any inline keyword mention found inside a rules sentence both
 * drive the same click-to-open/auto-introduce popover through this hook, so
 * a keyword is equally clickable whichever form it's rendered in. */
function useKeywordPopover(kw: string, autoIntroduce?: boolean) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Pending auto-close timer for the auto-introduced popover — cleared the
  // moment the player interacts with it manually, so a manual re-open isn't
  // cut short by a timeout scheduled for the earlier auto-open.
  const autoCloseRef = useRef<number | null>(null);
  const text = KEYWORD_GLOSSARY[kw];

  const clearAutoClose = () => {
    if (autoCloseRef.current !== null) {
      window.clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  };

  const computePos = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - POPOVER_WIDTH / 2),
      window.innerWidth - POPOVER_WIDTH - 8,
    );
    return { top: rect.bottom + 4, left };
  };

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearAutoClose();
    if (pos) {
      setPos(null);
      return;
    }
    setPos(computePos());
  };

  const close = () => {
    clearAutoClose();
    setPos(null);
  };

  useEffect(() => {
    if (!autoIntroduce || !text || hasSeenKeyword(kw)) return;
    markKeywordSeen(kw);
    const now = Date.now();
    const showAt = Math.max(now, nextAutoIntroSlot);
    nextAutoIntroSlot = showAt + AUTO_INTRO_GAP_MS;
    const openTimeout = window.setTimeout(() => {
      const next = computePos();
      if (!next) return;
      setPos(next);
      autoCloseRef.current = window.setTimeout(() => {
        autoCloseRef.current = null;
        setPos(null);
      }, AUTO_INTRO_VISIBLE_MS);
    }, showAt - now);
    return () => {
      window.clearTimeout(openTimeout);
      clearAutoClose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pos, btnRef, text, open, close };
}

/** Renders the popover itself (via portal) — shared by the pill chip and the
 * inline keyword link so both look/behave identically once opened. */
function KeywordPopover({
  kw,
  text,
  pos,
  close,
}: {
  kw: string;
  text: string;
  pos: { top: number; left: number };
  close: () => void;
}) {
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998]"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        onWheel={close}
      />
      <div
        style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
        className="fixed z-[9999] bg-[var(--c-ink)] text-[var(--c-paper)] text-[9px] leading-snug font-bold p-2 ink-border-sm shadow-hard-black-xs text-left normal-case"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="heading-font text-[10px] text-[var(--c-yellow)] mb-1">{kw}</div>
        {text}
      </div>
    </>,
    document.body,
  );
}

export function KeywordChip({
  kw,
  small,
  autoIntroduce,
}: {
  key?: React.Key;
  kw: string;
  small?: boolean;
  /** Auto-opens this chip's popover once per device the first time this
   * keyword is ever seen (tracked in localStorage), so new players discover
   * the glossary exists instead of needing to guess a pill is clickable.
   * Only pass this from live-match contexts (hand/board) — passing it from
   * a screen that renders many cards at once (Collection, Deck Builder)
   * would fire a stack of popovers simultaneously. */
  autoIntroduce?: boolean;
}) {
  const { pos, btnRef, text, open, close } = useKeywordPopover(kw, autoIntroduce);

  return (
    <span className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={open}
        className={cn(
          'font-bold bg-[var(--c-yellow)] border border-[var(--c-ink)] leading-tight rounded-full cursor-help',
          small ? 'text-[6.5px] px-1' : 'text-[9px] px-1.5',
        )}
      >
        {kw}
      </button>
      {pos && text && <KeywordPopover kw={kw} text={text} pos={pos} close={close} />}
    </span>
  );
}

/** v4.3.1: an inline, in-sentence keyword mention (e.g. "Twin bonus:" inside
 * a rules line, or a keyword named inside a Combo/Overflow/Aftershock
 * description) — opens the exact same glossary popover as the pill chip
 * above. Previously, only a card's top-of-box keyword pills were clickable;
 * any mention of a keyword *inside* the generated rules sentences (or a
 * pill hidden by the small-card slice cap) had no way to open its
 * definition. This makes every recognized keyword word clickable wherever
 * it appears, not just in the pill row. */
function KeywordText({ kw, small }: { key?: React.Key; kw: string; small?: boolean }) {
  const { pos, btnRef, text, open, close } = useKeywordPopover(kw);
  if (!text) return <>{kw}</>;
  return (
    <span className="relative inline">
      <button
        ref={btnRef}
        type="button"
        onClick={open}
        className={cn(
          'font-bold underline decoration-dotted underline-offset-2 cursor-help',
          small ? 'text-[6.5px]' : undefined,
        )}
      >
        {kw}
      </button>
      {pos && text && <KeywordPopover kw={kw} text={text} pos={pos} close={close} />}
    </span>
  );
}

/** v4.3: click-to-open popover explaining a card's Cast Slot cost — the same
 * portal popover the keyword chips use (see useKeywordPopover's rationale for
 * why it must portal), so the cost badge is no longer a hover-only `title`
 * affordance. Wraps whatever badge content is passed as children in a real
 * <button>; the `title` attr is kept as a desktop hover fallback. */
function CostInfoButton({
  text,
  className,
  title,
  children,
}: {
  text: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) {
      setPos(null);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - POPOVER_WIDTH / 2),
      window.innerWidth - POPOVER_WIDTH - 8,
    );
    setPos({ top: rect.bottom + 4, left });
  };
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={title}
        className={cn('cursor-help', className)}
      >
        {children}
      </button>
      {pos && <KeywordPopover kw="CAST COST" text={text} pos={pos} close={() => setPos(null)} />}
    </>
  );
}

/** Sorted longest-first so a multi-word keyword (if ever added) is matched
 * before any single-word keyword it might contain. */
const KEYWORD_NAMES = Object.keys(KEYWORD_GLOSSARY).sort((a, b) => b.length - a.length);
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** \b word-boundary on both sides — matches a keyword regardless of
 * surrounding punctuation ("Anchor.", "Anchor,", "(Anchor)") or position in
 * the sentence, matches every repeated occurrence (global flag), and never
 * matches a keyword as a partial word inside a longer word (e.g. "Rush"
 * inside "Rushmore") since \b requires an actual word/non-word transition. */
const KEYWORD_TEXT_RE = new RegExp(`\\b(${KEYWORD_NAMES.map(escapeRegExp).join('|')})\\b`, 'g');

/** Splits `text` on every recognized keyword mention and renders each one as
 * a clickable `KeywordText`, so any card sentence — combo text, "while
 * staged" passives, Overflow/Aftershock/Ultimate lines, etc — gets working
 * click-to-define keywords wherever they're mentioned, not just when a
 * keyword is its own top-level pill. */
export function renderKeywordText(text: string, small?: boolean): React.ReactNode {
  if (!text) return text;
  const parts = text.split(KEYWORD_TEXT_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    // Odd indices are the captured keyword matches (String.split keeps
    // capture groups in the output array); even indices are plain text.
    i % 2 === 1 ? (
      <KeywordText key={i} kw={part} small={small} />
    ) : (
      part && <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

/** Per-set flavor-text styling — a distinct "print run" identity per set. */
function setStyle(set?: string): { label: string; className: string; bar: string } {
  switch (set) {
    case 'Blue Coral':
      return {
        label: 'BLUE CORAL',
        className: 'text-[#0E7490] italic',
        bar: 'bg-[#0E7490]',
      };
    case 'Crimson Circuit':
      return {
        label: 'CRIMSON CIRCUIT',
        className: 'text-[#B91C1C] italic',
        bar: 'bg-[#B91C1C]',
      };
    case 'Full Arts Collection 1':
      return {
        label: 'FULL ARTS COLLECTION 1',
        className: 'text-[#2DD4BF] italic',
        bar: 'bg-[#2DD4BF]',
      };
    default:
      return {
        label: set || '',
        className: 'text-[var(--c-steel)] italic',
        bar: 'bg-[var(--c-steel)]',
      };
  }
}

/** Card art with a graceful fallback if the image 404s or never loads. Uses
 * object-contain (not cover) so the full 4:3 art is always visible — never
 * cropped — inside its fixed-aspect box; art narrower than 4:3 letterboxes
 * instead of losing its edges. */
/** True when `src` points at a video file rather than a still image — Full-Art
 * cards may be a short looping clip instead of a static image. Sniffed from
 * the file extension (ignoring any querystring) since that's all a plain
 * URL string gives us; no separate "is this a video" field on CardDef. */
function isVideoSrc(src: string): boolean {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(src);
}

function CardArt({
  def,
  onLoaded,
  cover,
}: {
  def: CardDef;
  onLoaded?: () => void;
  /** Full-Art template: the image fills its box edge-to-edge (object-cover)
   * instead of ever letterboxing — the whole card is the art, so a
   * letterboxed bar would read as a rendering bug rather than the intended
   * treatment. */
  cover?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (!def.image || broken) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[var(--c-steel)] text-[var(--c-paper)]">
        <span className="text-[9px] font-black uppercase tracking-wide opacity-70">{def.type}</span>
        <span className="heading-font text-[10px] opacity-50 px-2 text-center leading-tight">
          NO IMAGE
        </span>
      </div>
    );
  }
  const artClass = cn('w-full h-full bg-[var(--c-ink)]', cover ? 'object-cover' : 'object-contain');
  if (isVideoSrc(def.image)) {
    return (
      <video
        src={def.image}
        className={artClass}
        autoPlay
        loop
        muted
        playsInline
        disablePictureInPicture
        controls={false}
        onError={() => setBroken(true)}
        onLoadedData={onLoaded}
      />
    );
  }
  return (
    <img
      src={def.image}
      className={artClass}
      draggable={false}
      loading="lazy"
      onError={() => setBroken(true)}
      onLoad={onLoaded}
    />
  );
}

/** The three fixed pixel sizes for `CardFace`'s `size` prop — exported so any
 * wrapper that needs to reserve exact space for a card (e.g. a flip-reveal
 * container) can read the real dimensions instead of hardcoding a magic
 * number that could silently drift out of sync with this table. */
export const CARD_SIZES = {
  micro: { w: 78, h: 109 },
  compact: { w: 110, h: 154 },
  standard: { w: 140, h: 196 },
  full: { w: 240, h: 336 },
} as const;
const SIZES = CARD_SIZES;

export type CardSize = keyof typeof SIZES;

/** Hand-tuned per-tier presentation values. `compact` and `standard` are NOT
 * just a linear shrink of `full` — each tier gets its own font sizes, border
 * weights, keyword caps and content toggles so small cards stay legible
 * instead of reusing full-size styling squeezed into a smaller box. Only
 * three fixed tiers exist anywhere in the app; nothing renders at an
 * arbitrary pixel size. */
const TIER: Record<
  CardSize,
  {
    outerBorder: string;
    rounded: string;
    shadow: string;
    showGlow: boolean;
    showCornerGem: boolean;
    headerPy: string;
    typeIconSize: string;
    nameFont: { base: number; min: number; soft: number };
    comboBadge: string;
    showDiceIcon: boolean;
    costBadge: string;
    freeBadge: string;
    artBorder: string;
    artRing: boolean;
    rarityChip: string;
    artBadge: string;
    foilBadge: string;
    typeLine: string;
    showSetSuffix: boolean;
    textBoxPad: string;
    keywordMax: number;
    keywordSmall: boolean;
    rules: string;
    rulesMultiline: boolean;
    showFlavor: boolean;
  }
> = {
  micro: {
    outerBorder: 'border',
    rounded: 'rounded-[2px]',
    shadow: 'shadow-hard-black-xs',
    showGlow: false,
    showCornerGem: false,
    headerPy: 'py-[1px]',
    typeIconSize: 'w-2 h-2',
    nameFont: { base: 7, min: 5.5, soft: 9 },
    comboBadge: 'text-[5.5px] px-0.5 py-[1px]',
    showDiceIcon: false,
    costBadge: 'text-[6.5px] px-0.5 h-3 min-w-3',
    freeBadge: 'text-[5.5px] px-0.5 py-[1px]',
    artBorder: 'border',
    artRing: false,
    rarityChip: 'text-[5px] px-0.5',
    artBadge: 'text-[5.5px]',
    foilBadge: 'text-[5px] px-0.5',
    typeLine: 'mt-0 text-[5.5px]',
    showSetSuffix: false,
    textBoxPad: 'p-0.5',
    keywordMax: 0,
    keywordSmall: true,
    rules: 'hidden',
    rulesMultiline: false,
    showFlavor: false,
  },
  compact: {
    outerBorder: 'border-2',
    rounded: 'rounded-[3px]',
    shadow: 'shadow-hard-black-xs',
    showGlow: false,
    showCornerGem: false,
    headerPy: 'py-0.5',
    typeIconSize: 'w-2.5 h-2.5',
    nameFont: { base: 9.5, min: 7, soft: 11 },
    comboBadge: 'text-[6.5px] px-1 py-0.5',
    showDiceIcon: false,
    costBadge: 'text-[8px] px-1 h-4 min-w-4',
    freeBadge: 'text-[6.5px] px-1 py-0.5',
    artBorder: 'border',
    artRing: false,
    rarityChip: 'text-[6px] px-1',
    artBadge: 'text-[6.5px]',
    foilBadge: 'text-[6px] px-1',
    typeLine: 'mt-0.5 text-[7px]',
    showSetSuffix: false,
    textBoxPad: 'p-1',
    keywordMax: 2,
    keywordSmall: true,
    rules: 'mt-0.5 text-[6.5px] line-clamp-1',
    rulesMultiline: false,
    showFlavor: false,
  },
  standard: {
    outerBorder: 'border-[3px]',
    rounded: 'rounded-[4px]',
    shadow: 'shadow-hard-black-xs',
    showGlow: false,
    showCornerGem: false,
    headerPy: 'py-0.5',
    typeIconSize: 'w-3 h-3',
    nameFont: { base: 11, min: 8, soft: 13 },
    comboBadge: 'text-[7.5px] px-1 py-0.5',
    showDiceIcon: false,
    costBadge: 'text-[9px] px-1 h-5 min-w-5',
    freeBadge: 'text-[7.5px] px-1 py-0.5',
    artBorder: 'border-2',
    artRing: false,
    rarityChip: 'text-[7px] px-1',
    artBadge: 'text-[7.5px]',
    foilBadge: 'text-[7px] px-1',
    typeLine: 'mt-0.5 text-[8px]',
    showSetSuffix: false,
    textBoxPad: 'p-1',
    keywordMax: 4,
    keywordSmall: false,
    rules: 'mt-0.5 text-[7.5px] line-clamp-2',
    rulesMultiline: false,
    showFlavor: false,
  },
  full: {
    outerBorder: 'border-4',
    rounded: 'rounded-[4px]',
    shadow: 'shadow-hard-black',
    showGlow: true,
    showCornerGem: true,
    headerPy: 'py-1',
    typeIconSize: 'w-3.5 h-3.5',
    nameFont: { base: 13, min: 8.5, soft: 15 },
    comboBadge: 'text-[9px] px-1.5 py-0.5',
    showDiceIcon: true,
    costBadge: 'text-[11px] px-1.5 h-7 min-w-7',
    freeBadge: 'text-[9px] px-1.5 py-0.5',
    artBorder: 'border-[3px]',
    artRing: true,
    rarityChip: 'text-[9px] px-1.5 py-0.5',
    artBadge: 'text-[9px]',
    foilBadge: 'text-[9px] px-1.5 py-0.5',
    typeLine: 'mt-1 text-[10px]',
    showSetSuffix: true,
    textBoxPad: 'p-1.5',
    keywordMax: 8,
    keywordSmall: false,
    rules: 'mt-1 text-[9.5px] space-y-0.5',
    rulesMultiline: true,
    showFlavor: true,
  },
};

export function CardFace({
  def,
  size = 'standard',
  dimmed,
  highlight,
  foil,
  foilEffect = true,
  onClick,
  footer,
  badge,
  count,
  foilCount,
  maxHp,
  live,
  effectiveThreshold,
  introduceKeywords,
  serial,
}: {
  key?: React.Key;
  def: CardDef;
  /** Card size — one of three fixed, hand-tuned tiers (real 2.5:3.5
   * proportions at every tier): `compact` for dense rows (hand, discard,
   * showcases), `standard` for a browsable grid (deck builder pool), `full`
   * for the primary "read the whole card" view (collection grid, inspector,
   * pack reveal). */
  size?: CardSize;
  dimmed?: boolean;
  highlight?: boolean;
  /** Renders the built-in foil treatment: shimmering sheen + pulsing glow ring. */
  foil?: boolean;
  /** Set false to suppress the animated shimmer overlay while still showing
   * the foil badge/glow — for callers (Card3DInspector) that layer their
   * own pointer-driven holographic sheen and would otherwise double up two
   * competing animated overlays on the same card. */
  foilEffect?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
  badge?: string;
  count?: number;
  foilCount?: number;
  /** Leader template only: shows `${def.hp}/${maxHp}` instead of just current HP. */
  maxHp?: number;
  /** Live-match only (Units on the battlefield): effective ATK / current HP /
   * effective max HP. Rendered in the normal StatChip position — green when
   * above the printed value, red when below/damaged, with the printed value
   * struck through inside the chip — never as a separate extra badge. */
  live?: { atk: number; hp: number; maxHp: number };
  /** Live-match only: this card's Cast threshold after Anchor discounts, so
   * the cost badge can show the real number alongside the printed one
   * instead of leaving the discount invisible. Omit outside a match. */
  effectiveThreshold?: number;
  /** Live-match only: auto-opens each of this card's keyword glossary
   * popovers once per device, the first time that keyword is ever seen, so
   * new players discover the glossary exists instead of needing to guess
   * they can click a keyword pill. */
  introduceKeywords?: boolean;
  /** A numbered Serialized print (see grant_pack_contents' 1%-per-pack roll
   * and player_serialized_cards) — the rarest possible pull, always foil-free
   * and never quick-sellable. Renders a rotating prismatic frame + an
   * engraved number plate instead of the normal rarity treatment. */
  serial?: { number: number; cap: number };
}) {
  const { w, h } = SIZES[size];
  const cfg = TIER[size];
  const rules = cardRuleLines(def);
  const set = setStyle(def.set);
  const atkHp = def.type === 'Unit' ? `, ${def.atk} attack, ${def.hp} health` : '';
  // Serialized prints can never be foil (see quicksell_cards/grant_pack_contents).
  const isFoil = foil && !serial;
  const label = `${def.name}, ${def.type}${atkHp}${isFoil ? ', foil' : ''}${serial ? `, Serialized #${serial.number} of ${serial.cap}` : ''}`;
  const rarityHex = RARITY_HEX[def.rarity || 'Common'] || RARITY_HEX.Common;
  // Long names/flavor text shrink to fit via fitFontSize below. The card's
  // own footprint is a hard 2.5:3.5 (w:h) rectangle at every tier — it never
  // grows to accommodate overflow; any residual overflow clips at the
  // (already overflow-hidden) outer edge instead of distorting the ratio.
  const nameFontPx = fitFontSize(def.name, cfg.nameFont.base, cfg.nameFont.min, cfg.nameFont.soft);
  const flavorFontPx = fitFontSize(def.flavor || '', 9, 6.5, 85);
  // v4.3: Rare+ get a tinted background; Super-Rare/Ultra-Rare/Mythic add an
  // animated sheen; Mythic additionally gets a pulsing frame and a distinct
  // gold-on-red name banner instead of the shared tinted-paper header.
  const mythic = isMythic(def.rarity) && !serial;
  const animatedFx = (rarityAnimated(def.rarity) || mythic) && !serial;
  const bg = rarityBg(def.rarity);
  const TypeIcon = TYPE_ICON[def.type];
  // Full-Art: the uploaded image fills the entire card footprint edge to
  // edge instead of sitting in a boxed 4:3 art window; every normal piece of
  // card text (header, stat line, text box) instead floats on top of it in
  // semi-transparent panels so the art itself is the whole card, not just a
  // fraction of it.
  const fullArt = def.rarity === 'Full-Art' && !serial;
  // Ultra-Rare: a visibly stronger treatment than the shared Rare+ template
  // (heavier glow, a gold hairline border ring around the art, and a
  // brighter/faster sheen sweep) so it doesn't just look like Super-Rare
  // with a different tint.
  const ultra = def.rarity === 'Ultra-Rare' && !serial;

  return (
    // A plain <div role="button"> rather than a <button>: the footer can
    // carry its own interactive control (e.g. a "details" button), and
    // nested <button> elements are invalid HTML / break screen-reader and
    // keyboard navigation.
    <div
      role="button"
      tabIndex={onClick ? 0 : -1}
      aria-disabled={!onClick}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{ width: w, height: h, backgroundImage: bg }}
      className={cn(
        'relative flex flex-col bg-[var(--c-paper)] text-[var(--c-ink)] text-left shrink-0 transition-transform overflow-hidden',
        cfg.outerBorder,
        cfg.rounded,
        rarityBorder(def.rarity),
        onClick && 'btn-pop cursor-pointer',
        dimmed && 'opacity-45 saturate-50',
        highlight && 'ring-4 ring-[var(--c-yellow)] -translate-y-1',
        cfg.shadow,
        !dimmed &&
          (serial
            ? 'serialized-frame'
            : mythic
              ? 'mythic-frame'
              : ultra
                ? 'ultra-frame'
                : cfg.showGlow && rarityGlow(def.rarity)),
        // Mythic already animates its own box-shadow pulse (mythic-frame) —
        // stacking foil-glow's competing box-shadow keyframes on the same
        // element causes the two animations to visibly stutter against each
        // other, so a mythic foil gets only the (already more intense) frame.
        isFoil && !dimmed && !mythic && 'foil-glow',
      )}
    >
      {/* Corner gem — a small decorative flourish marking Rare+ prints,
          echoing the rarity color at a glance even before reading text.
          Positioned at the corner (not negative-offset) since the card
          wrapper clips overflow — the rotated square's tips peek past the
          edge for a "corner tag" look instead of being invisible. */}
      {cfg.showCornerGem && def.rarity && def.rarity !== 'Common' && def.rarity !== 'Uncommon' && (
        <span
          aria-hidden
          className="absolute top-0 left-0 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-[var(--c-ink)] z-10"
          style={{ backgroundColor: rarityHex }}
        />
      )}

      {/* Header: name + dice-medallion cost badge. Mythic prints a distinct
          gold-on-red name banner instead of the shared tinted-paper header.
          Full-Art drops the boxed panel entirely — the name/icon float
          directly on the full-bleed art (which sits behind as an absolutely-
          positioned layer) with a text-shadow for legibility instead of a
          background chip, so nothing visually competes with the art itself.
          The vignette overlay (below, layered under this header) carries the
          actual contrast work at the top edge. */}
      <div
        className={cn(
          'relative flex items-center justify-between gap-1 pl-1.5 pr-1 shrink-0 z-10',
          cfg.headerPy,
          !fullArt && 'border-b-2',
          mythic ? 'mythic-bg border-[#7A1420]' : !fullArt && 'border-[var(--c-ink)]/15',
        )}
        style={
          mythic || fullArt
            ? undefined
            : { backgroundColor: `color-mix(in srgb, ${rarityHex} 20%, var(--c-paper))` }
        }
      >
        <span
          className={cn(
            'flex items-center gap-1 min-w-0 heading-font leading-tight',
            mythic ? 'text-[var(--c-yellow)]' : fullArt && 'text-white',
          )}
          style={fullArt ? { textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.5)' } : undefined}
          title={def.name}
        >
          <TypeIcon
            className={cn(
              'shrink-0 opacity-70',
              cfg.typeIconSize,
              mythic && 'opacity-90',
              fullArt && 'opacity-95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]',
            )}
          />
          <span className="break-words" style={{ fontSize: nameFontPx }}>
            {def.name}
          </span>
        </span>
        {def.comboGate ? (
          <CostInfoButton
            text={`${costSummary(def)}. Your final five-die roll must genuinely contain this pattern; the die placed to cast can be any value. Max one Combo-gated card per turn.`}
            className={cn(
              'heading-font shrink-0 flex items-center gap-0.5 rounded-full border-2 border-[var(--c-ink)] bg-[#A855F7] text-white text-center',
              cfg.comboBadge,
            )}
            title={costSummary(def) || undefined}
          >
            {cfg.showDiceIcon && <Dices className="w-3 h-3" />}
            {GATE_LABEL[def.comboGate] || def.comboGate}
          </CostInfoButton>
        ) : def.type !== 'Location' && def.type !== 'Leader' && def.threshold !== undefined ? (
          <span
            className={cn(
              'flex flex-col items-end shrink-0',
              // Centering a two-line stack (badge + "was X") shifts the
              // badge itself higher than the single-line case — nudge the
              // whole stack down so the badge still lines up with the name.
              effectiveThreshold !== undefined && effectiveThreshold !== def.threshold && 'mt-1.5',
            )}
          >
            <CostInfoButton
              text={
                effectiveThreshold !== undefined && effectiveThreshold !== def.threshold
                  ? `${costSummary(def)} — reduced to ${effectiveThreshold} this turn (Anchor).`
                  : `${costSummary(def)}.`
              }
              className={cn(
                'heading-font font-mono flex items-center justify-center rounded-full border-2 border-[var(--c-ink)]',
                def.castCostKind === 'exact'
                  ? 'bg-[#0E7490] text-white'
                  : def.castCostKind === 'sum'
                    ? 'bg-[#B45309] text-white'
                    : 'bg-[var(--c-ink)] text-[var(--c-yellow)]',
                cfg.costBadge,
              )}
              title={
                effectiveThreshold !== undefined && effectiveThreshold !== def.threshold
                  ? `${costSummary(def)} — reduced to ${effectiveThreshold} this turn`
                  : costSummary(def) || undefined
              }
            >
              {costBadge(def, effectiveThreshold ?? def.threshold)}
            </CostInfoButton>
            {effectiveThreshold !== undefined && effectiveThreshold !== def.threshold && (
              <span className="text-[6px] font-bold text-[var(--c-steel)] line-through leading-none mt-0.5">
                was {costBadge(def)}
              </span>
            )}
          </span>
        ) : def.type === 'Location' ? (
          <CostInfoButton
            text="Locations cast free: once per turn, as a bonus action alongside your five die placements — no die, no Cast Slot. Max one Location in play."
            className={cn(
              'heading-font shrink-0 rounded-full border-2 border-[var(--c-ink)] bg-[var(--c-steel)] text-white',
              cfg.freeBadge,
            )}
            title="Cast: free — once per turn as a bonus action"
          >
            FREE
          </CostInfoButton>
        ) : null}
      </div>

      {/* Art — Full-Art fills the entire card footprint edge-to-edge behind
          every other layer (absolutely positioned, out of flow, so the
          header/stat-line/text box that follow simply overlay it in normal
          flow). Every other rarity keeps the classic fixed 4:3 boxed art so
          the full uploaded image always shows, never cropped. */}
      <div
        className={cn(
          'relative overflow-hidden',
          fullArt
            ? 'absolute inset-0 z-0 rounded-none border-0'
            : cn(
                'w-full aspect-[4/3] shrink-0 mx-1.5 mt-1 rounded-[2px]',
                cfg.artBorder,
                'border-[var(--c-ink)]',
              ),
        )}
        style={!fullArt && cfg.artRing ? { boxShadow: `inset 0 0 0 2px ${rarityHex}` } : undefined}
      >
        <CardArt def={def} cover={fullArt} />
        <div
          className="absolute inset-0 pointer-events-none"
          style={
            fullArt
              ? {
                  // A single continuous scrim carries all the contrast work
                  // now that the header/type-line/text-box no longer paint
                  // their own boxed backgrounds — dark enough at the very
                  // top for the name and at the bottom ~45% for stats/
                  // keywords/rules/flavor to always read regardless of the
                  // art's own brightness, clear through the middle so the
                  // art still reads as the whole card. The radial pass adds
                  // a soft edge/corner vignette so any art unifies with the
                  // frame instead of looking like a cropped rectangle.
                  background: [
                    'radial-gradient(120% 90% at 50% 42%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)',
                    'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.08) 16%, rgba(0,0,0,0.02) 38%, rgba(0,0,0,0.15) 52%, rgba(0,0,0,0.62) 66%, rgba(0,0,0,0.96) 100%)',
                  ].join(', '),
                }
              : { boxShadow: 'inset 0 -18px 22px -14px rgba(0,0,0,0.55)' }
          }
        />
        {/* Full-Art's art box IS the whole card (absolute inset-0), so this
            chip's usual top-right corner is the same corner the header's
            cost badge occupies in normal flow — showing both collided the
            two together. The Full-Art treatment already reads as its own
            rarity at a glance, so skip the redundant chip there instead. */}
        {def.rarity && !fullArt && (
          <span
            className={cn(
              'absolute top-1 right-1 font-black rounded-full leading-tight',
              cfg.rarityChip,
              rarityChip(def.rarity),
            )}
          >
            {def.rarity}
          </span>
        )}
        {badge && (
          <span
            className={cn(
              'absolute top-1 left-1 bg-[var(--c-red)] text-white font-black px-1 rounded-full',
              cfg.artBadge,
            )}
          >
            {badge}
          </span>
        )}
        {isFoil && (
          <span
            className={cn(
              'absolute top-1 left-1 bg-gradient-to-r from-[var(--c-yellow)] via-[#E879F9] to-[var(--c-yellow)] text-[var(--c-ink)] font-black rounded-full',
              cfg.foilBadge,
            )}
          >
            ✦ FOIL
          </span>
        )}
        {serial && (
          <span
            className={cn(
              'serial-plate absolute top-1 left-1 font-black rounded-full tracking-wide',
              cfg.foilBadge,
            )}
            title={`Serialized print — #${serial.number} of ${serial.cap} ever made`}
          >
            #{serial.number}/{serial.cap}
          </span>
        )}
        {(foilCount || 0) > 0 && (
          <span className="absolute bottom-1 right-1 bg-[var(--c-yellow)] text-[var(--c-ink)] text-[8px] font-black px-1 rounded-full">
            ✦ {foilCount}
          </span>
        )}
        {count !== undefined && count > 0 && (
          <span className="absolute bottom-1 left-1 bg-[var(--c-ink)] text-[var(--c-yellow)] text-[8px] font-black px-1 rounded-full">
            ×{count}
          </span>
        )}
      </div>

      {/* Full-Art pins the type-line + text-box group to the bottom edge as
          one block (via this wrapper) instead of letting it sit directly
          under the header like every other rarity — that leaves a real
          clear window of art in the middle of the card instead of the art
          only ever peeking through above/below two stacked text panels.
          `display: contents` makes the wrapper invisible to layout for
          every other rarity, so their structure/behavior is unchanged. */}
      <div className={fullArt ? 'flex flex-col flex-1 min-h-0 justify-end' : 'contents'}>
      {/* Type / rarity / stat line — sits on the same continuous bottom
          scrim as the text box below it now (no boxed pill of its own),
          reading as one unbroken panel over the art instead of a stack of
          separate floating chips. */}
      <div
        className={cn(
          'relative z-10 flex items-center justify-between shrink-0',
          cfg.typeLine,
          'px-1.5',
        )}
      >
        <span
          className={cn(
            'font-bold uppercase truncate',
            fullArt ? 'text-white/85' : 'text-[var(--c-steel)]',
          )}
          style={fullArt ? { textShadow: '0 1px 2px rgba(0,0,0,0.9)' } : undefined}
        >
          {def.type}
          {cfg.showSetSuffix && def.set ? ` · ${def.set}` : ''}
        </span>
        {def.type === 'Unit' &&
          (live ? (
            // Live battlefield stats in the same StatChip slots the printed
            // values use: green = buffed above printed, red = below printed /
            // damaged, printed value struck through inside the chip.
            <span
              className="flex items-center gap-1 shrink-0"
              title={`Printed ${def.atk}/${def.hp}`}
            >
              <StatChip
                icon={Swords}
                value={live.atk}
                printed={def.atk}
                tier={size}
                tint={live.atk > (def.atk ?? 0) ? '#16A34A' : 'var(--c-red)'}
              />
              <StatChip
                icon={Heart}
                value={live.hp}
                maxValue={live.maxHp !== live.hp ? live.maxHp : undefined}
                printed={live.maxHp !== (def.hp ?? 0) ? (def.hp ?? 0) : undefined}
                tier={size}
                tint={
                  live.hp < live.maxHp
                    ? 'var(--c-red)'
                    : live.maxHp > (def.hp ?? 0)
                      ? '#16A34A'
                      : '#22C55E'
                }
              />
            </span>
          ) : (
            <span className="flex items-center gap-1 shrink-0">
              <StatChip icon={Swords} value={def.atk} tier={size} tint="var(--c-red)" />
              <StatChip icon={Heart} value={def.hp} tier={size} tint="#22C55E" />
            </span>
          ))}
        {def.type === 'Leader' && (
          <span className="shrink-0">
            <StatChip
              icon={Heart}
              value={def.hp}
              maxValue={maxHp}
              tier={size}
              tint={
                maxHp !== undefined && def.hp !== undefined && def.hp * 2 <= maxHp
                  ? 'var(--c-red)'
                  : '#22C55E'
              }
            />
          </span>
        )}
      </div>

      {/* Text box — keywords/rules/flavor sit on a subtly shaded, bordered
          panel (a real "text box" like a printed card) instead of floating
          directly on the paper background. flex-1 so it fills the remaining
          height and pushes the footer to the bottom. Full-Art drops the
          boxed panel — no border, no background of its own, no side margin
          — so it reads as the same unbroken bottom scrim as the type line
          above it rather than a separate floating glass rectangle; the
          vignette overlay behind the art is what actually darkens this
          whole region, with a per-line text-shadow as a legibility backstop
          for whatever the art itself looks like underneath. */}
      <div
        className={cn(
          'relative z-10 flex flex-col',
          fullArt ? 'shrink-0' : 'flex-1 min-h-0',
          cfg.textBoxPad,
          fullArt
            ? 'text-white'
            : cn(
                'mx-1.5 mt-1 mb-1 rounded-[3px] border',
                mythic ? 'border-[#7A1420]/40' : 'border-[var(--c-ink)]/15',
              ),
        )}
        style={
          fullArt
            ? undefined
            : {
                backgroundColor: mythic
                  ? 'color-mix(in srgb, #7A1420 8%, var(--c-paper))'
                  : 'color-mix(in srgb, var(--c-ink) 4%, var(--c-paper))',
              }
        }
      >
        {kwList(def).length > 0 && cfg.keywordMax > 0 && (
          <div className={cn('flex flex-wrap gap-0.5 shrink-0', size !== 'full' && 'min-h-[9px]')}>
            {kwList(def)
              .slice(0, cfg.keywordMax)
              .map((kw) => (
                <KeywordChip
                  key={kw}
                  kw={kw}
                  small={cfg.keywordSmall}
                  autoIntroduce={introduceKeywords}
                />
              ))}
          </div>
        )}

        {rules.length > 0 && (
          <div
            className={cn('shrink-0 leading-snug', cfg.rules, kwList(def).length === 0 && 'mt-0')}
            style={fullArt ? { textShadow: '0 1px 2px rgba(0,0,0,0.9)' } : undefined}
          >
            {cfg.rulesMultiline ? (
              rules.map((r, i) => <div key={i}>{renderKeywordText(r)}</div>)
            ) : (
              <div>{renderKeywordText(rules.join(' · '), true)}</div>
            )}
          </div>
        )}

        {cfg.showFlavor && def.flavor && (
          <div
            className={cn(
              'mt-1 pt-1 border-t',
              fullArt ? 'border-white/20' : 'border-[var(--c-ink)]/15',
            )}
          >
            <p
              className={cn('leading-snug break-words', set.className)}
              style={{
                fontSize: flavorFontPx,
                textShadow: fullArt ? '0 1px 2px rgba(0,0,0,0.9)' : undefined,
              }}
            >
              {def.flavor}
            </p>
          </div>
        )}

        {!fullArt && <div className="flex-1" />}
      </div>
      </div>

      {/* Footer: set/print bar + optional slot content (e.g. deck-count badge). */}
      {def.set && (
        <div className={cn('relative z-10 h-[3px] w-full shrink-0', set.bar)} title={def.set} />
      )}
      {footer}

      {serial && !dimmed && (
        <div className="serialized-sheen absolute inset-0 pointer-events-none" />
      )}
      {isFoil && foilEffect && (
        <div className="foil-shimmer absolute inset-0 pointer-events-none opacity-60" />
      )}
      {!isFoil && !serial && animatedFx && !dimmed && (
        <div
          className={cn(
            'rarity-sheen absolute inset-0 pointer-events-none',
            mythic ? 'opacity-80' : ultra ? 'opacity-70' : 'opacity-50',
          )}
        />
      )}
    </div>
  );
}

/**
 * Universal expanded/zoomed card view — same CardFace used everywhere else,
 * just large and centered in a modal. Pass `actions` for context-specific
 * controls (e.g. quicksell buttons in the Collection).
 */
export function CardInspectorModal({
  def,
  foil,
  onClose,
  actions,
}: {
  def: CardDef;
  foil?: boolean;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--c-ink)]/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <CardFace def={def} size="full" foil={foil} />
        {actions}
        <button
          onClick={onClose}
          className="btn-pop heading-font text-xs bg-[var(--c-ink)] text-[var(--c-yellow)] px-4 py-2 ink-border-sm shadow-hard-black-xs"
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
