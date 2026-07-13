/**
 * Shared v4.2 card-face rendering — the ONE card template used everywhere
 * (match UI, deck builder, collection, store/pack reveals) so a card looks
 * and reads identically no matter where it's shown. Real trading-card
 * proportions: 2.5" × 3.5" (5:7).
 */
import React, { useState } from 'react';
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

/** v4.3: short badge text for this card's Cast Slot cost, any format. */
export function costBadge(def: CardDef): string | null {
  if (def.comboGate) return GATE_LABEL[def.comboGate] || def.comboGate;
  if (def.threshold === undefined) return null;
  if (def.castCostKind === 'exact') return `=${def.threshold}`;
  if (def.castCostKind === 'sum') return `Σ${def.threshold}`;
  return `${def.threshold}+`;
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
  isLg,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value?: number;
  maxValue?: number;
  isLg: boolean;
  tint: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full font-mono font-black border',
        isLg ? 'text-[12px] px-1.5 py-0.5' : 'text-[8px] px-1',
      )}
      style={{
        color: tint,
        borderColor: `color-mix(in srgb, ${tint} 45%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${tint} 12%, transparent)`,
      }}
    >
      <Icon className={isLg ? 'w-3 h-3' : 'w-2 h-2'} />
      {value}
      {maxValue !== undefined && <span className="opacity-60 font-bold">/{maxValue}</span>}
    </span>
  );
}

/**
 * v4.3: a keyword pill that opens a small popover with its rules text on
 * click — used anywhere a keyword chip is shown (card template, board
 * Units) so players never have to guess what a keyword does.
 */
export function KeywordChip({ kw, small }: { key?: React.Key; kw: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const text = KEYWORD_GLOSSARY[kw];
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          'font-bold bg-[var(--c-yellow)] border border-[var(--c-ink)] leading-tight rounded-full cursor-help',
          small ? 'text-[6.5px] px-1' : 'text-[9px] px-1.5',
        )}
      >
        {kw}
      </button>
      {open && text && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            className="absolute left-1/2 top-full mt-1 -translate-x-1/2 z-[61] w-[180px] bg-[var(--c-ink)] text-[var(--c-paper)] text-[9px] leading-snug font-bold p-2 ink-border-sm shadow-hard-black-xs text-left normal-case"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="heading-font text-[10px] text-[var(--c-yellow)] mb-1">{kw}</div>
            {text}
          </div>
        </>
      )}
    </span>
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
function CardArt({ def, onLoaded }: { def: CardDef; onLoaded?: () => void }) {
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
  return (
    <img
      src={def.image}
      className="w-full h-full object-contain bg-[var(--c-ink)]"
      draggable={false}
      loading="lazy"
      onError={() => setBroken(true)}
      onLoad={onLoaded}
    />
  );
}

const SIZES = {
  sm: { w: 110, h: 154 },
  md: { w: 140, h: 196 },
  lg: { w: 240, h: 336 },
} as const;

export function CardFace({
  def,
  size = 'md',
  small,
  large,
  dimmed,
  highlight,
  foil,
  onClick,
  footer,
  badge,
  count,
  foilCount,
  maxHp,
}: {
  key?: React.Key;
  def: CardDef;
  /** Card size — real 2.5:3.5 proportions at every tier. */
  size?: 'sm' | 'md' | 'lg';
  /** @deprecated use size="sm" */
  small?: boolean;
  /** @deprecated use size="lg" */
  large?: boolean;
  dimmed?: boolean;
  highlight?: boolean;
  /** Renders the built-in foil treatment: shimmering sheen + pulsing glow ring. */
  foil?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
  badge?: string;
  count?: number;
  foilCount?: number;
  /** Leader template only: shows `${def.hp}/${maxHp}` instead of just current HP. */
  maxHp?: number;
}) {
  const resolvedSize = large ? 'lg' : small ? 'sm' : size;
  const { w, h } = SIZES[resolvedSize];
  const isLg = resolvedSize === 'lg';
  const rules = cardRuleLines(def);
  const set = setStyle(def.set);
  const atkHp = def.type === 'Unit' ? `, ${def.atk} attack, ${def.hp} health` : '';
  const label = `${def.name}, ${def.type}${atkHp}${foil ? ', foil' : ''}`;
  const rarityHex = RARITY_HEX[def.rarity || 'Common'] || RARITY_HEX.Common;
  // Long names/flavor text shrink to fit rather than getting truncated or
  // clipped — the card itself can also grow (min-height, not fixed height)
  // as a last resort so nothing is ever cut off.
  const nameFontPx = isLg
    ? fitFontSize(def.name, 13, 8.5, 15)
    : fitFontSize(def.name, 9, 6.5, 11);
  const flavorFontPx = fitFontSize(def.flavor || '', 9, 6.5, 85);
  // v4.3: Rare+ get a tinted background; Super-Rare/Ultra-Rare/Mythic add an
  // animated sheen; Mythic additionally gets a pulsing frame and a distinct
  // gold-on-red name banner instead of the shared tinted-paper header.
  const mythic = isMythic(def.rarity);
  const animatedFx = rarityAnimated(def.rarity) || mythic;
  const bg = rarityBg(def.rarity);
  const TypeIcon = TYPE_ICON[def.type];

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
      style={{ width: w, minHeight: h, backgroundImage: bg }}
      className={cn(
        'relative flex flex-col bg-[var(--c-paper)] text-[var(--c-ink)] border-4 text-left shrink-0 transition-transform overflow-visible rounded-[4px]',
        rarityBorder(def.rarity),
        onClick && 'btn-pop cursor-pointer',
        dimmed && 'opacity-45 saturate-50',
        highlight && 'ring-4 ring-[var(--c-yellow)] -translate-y-1',
        isLg ? 'shadow-hard-black' : 'shadow-hard-black-xs',
        !dimmed && (mythic ? 'mythic-frame' : isLg && rarityGlow(def.rarity)),
        foil && !dimmed && 'foil-glow',
      )}
    >
      {/* Corner gem — a small decorative flourish marking Rare+ prints,
          echoing the rarity color at a glance even before reading text.
          Positioned at the corner (not negative-offset) since the card
          wrapper clips overflow — the rotated square's tips peek past the
          edge for a "corner tag" look instead of being invisible. */}
      {isLg && def.rarity && def.rarity !== 'Common' && def.rarity !== 'Uncommon' && (
        <span
          aria-hidden
          className="absolute top-0 left-0 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-[var(--c-ink)] z-10"
          style={{ backgroundColor: rarityHex }}
        />
      )}

      {/* Header: name + dice-medallion cost badge. Mythic prints a distinct
          gold-on-red name banner instead of the shared tinted-paper header. */}
      <div
        className={cn(
          'flex items-center justify-between gap-1 pl-1.5 pr-1 shrink-0 border-b-2',
          isLg ? 'py-1' : 'py-0.5',
          mythic ? 'mythic-bg border-[#7A1420]' : 'border-[var(--c-ink)]/15',
        )}
        style={
          mythic
            ? undefined
            : { backgroundColor: `color-mix(in srgb, ${rarityHex} 20%, var(--c-paper))` }
        }
      >
        <span
          className={cn(
            'flex items-center gap-1 min-w-0 heading-font leading-tight',
            mythic && 'text-[var(--c-yellow)]',
          )}
        >
          <TypeIcon
            className={cn(
              'shrink-0 opacity-70',
              isLg ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5',
              mythic && 'opacity-90',
            )}
          />
          <span style={{ fontSize: nameFontPx }}>{def.name}</span>
        </span>
        {def.comboGate ? (
          <span
            className={cn(
              'heading-font shrink-0 flex items-center gap-0.5 rounded-full border-2 border-[var(--c-ink)] bg-[#A855F7] text-white text-center',
              isLg ? 'text-[9px] px-1.5 py-0.5' : 'text-[6px] px-1 py-0.5',
            )}
            title={costSummary(def) || undefined}
          >
            {isLg && <Dices className="w-3 h-3" />}
            {GATE_LABEL[def.comboGate] || def.comboGate}
          </span>
        ) : def.type !== 'Location' && def.type !== 'Leader' && def.threshold !== undefined ? (
          <span
            className={cn(
              'heading-font font-mono shrink-0 flex items-center justify-center rounded-full border-2 border-[var(--c-ink)]',
              def.castCostKind === 'exact'
                ? 'bg-[#0E7490] text-white'
                : def.castCostKind === 'sum'
                  ? 'bg-[#B45309] text-white'
                  : 'bg-[var(--c-ink)] text-[var(--c-yellow)]',
              isLg ? 'text-[11px] px-1.5 h-7 min-w-7' : 'text-[8px] px-1 h-4 min-w-4',
            )}
            title={costSummary(def) || undefined}
          >
            {costBadge(def)}
          </span>
        ) : def.type === 'Location' ? (
          <span
            className={cn(
              'heading-font shrink-0 rounded-full border-2 border-[var(--c-ink)] bg-[var(--c-steel)] text-white',
              isLg ? 'text-[9px] px-1.5 py-0.5' : 'text-[6px] px-1 py-0.5',
            )}
          >
            FREE
          </span>
        ) : null}
      </div>

      {/* Art — fixed 4:3 box so the full uploaded image always shows, never
          cropped; any leftover card height is absorbed by the flex-1 spacer
          further down instead of stretching the art. A rarity-tinted double
          bezel + inner vignette gives the art a "framed" feel instead of a
          flat crop. */}
      <div
        className={cn(
          'relative w-full aspect-[4/3] shrink-0 mx-1.5 mt-1 overflow-hidden rounded-[2px]',
          isLg ? 'border-[3px]' : 'border-2',
          'border-[var(--c-ink)]',
        )}
        style={isLg ? { boxShadow: `inset 0 0 0 2px ${rarityHex}` } : undefined}
      >
        <CardArt def={def} />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: 'inset 0 -18px 22px -14px rgba(0,0,0,0.55)' }}
        />
        {def.rarity && (
          <span
            className={cn(
              'absolute top-1 right-1 font-black rounded-full leading-tight',
              isLg ? 'text-[9px] px-1.5 py-0.5' : 'text-[6px] px-1',
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
              isLg ? 'text-[9px]' : 'text-[7px]',
            )}
          >
            {badge}
          </span>
        )}
        {foil && (
          <span
            className={cn(
              'absolute top-1 left-1 bg-gradient-to-r from-[var(--c-yellow)] via-[#E879F9] to-[var(--c-yellow)] text-[var(--c-ink)] font-black rounded-full',
              isLg ? 'text-[9px] px-1.5 py-0.5' : 'text-[6px] px-1',
            )}
          >
            ✦ FOIL
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

      {/* Type / rarity / stat line */}
      <div
        className={cn(
          'flex items-center justify-between px-1.5 shrink-0',
          isLg ? 'mt-1 text-[10px]' : 'mt-0.5 text-[7px]',
        )}
      >
        <span className="font-bold uppercase text-[var(--c-steel)] truncate">
          {def.type}
          {isLg && def.set ? ` · ${def.set}` : ''}
        </span>
        {def.type === 'Unit' && (
          <span className="flex items-center gap-1 shrink-0">
            <StatChip icon={Swords} value={def.atk} isLg={isLg} tint="var(--c-red)" />
            <StatChip icon={Heart} value={def.hp} isLg={isLg} tint="#22C55E" />
          </span>
        )}
        {def.type === 'Leader' && (
          <span className="shrink-0">
            <StatChip
              icon={Heart}
              value={def.hp}
              maxValue={maxHp}
              isLg={isLg}
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
          height and pushes the footer to the bottom. */}
      <div
        className={cn(
          'flex-1 min-h-0 flex flex-col mx-1.5 mt-1 mb-1 rounded-[3px] border',
          isLg ? 'p-1.5' : 'p-1',
          mythic ? 'border-[#7A1420]/40' : 'border-[var(--c-ink)]/15',
        )}
        style={{
          backgroundColor: mythic
            ? 'color-mix(in srgb, #7A1420 8%, var(--c-paper))'
            : 'color-mix(in srgb, var(--c-ink) 4%, var(--c-paper))',
        }}
      >
        {kwList(def).length > 0 && (
          <div className={cn('flex flex-wrap gap-0.5 shrink-0', !isLg && 'min-h-[9px]')}>
            {kwList(def)
              .slice(0, isLg ? 8 : 3)
              .map((kw) => (
                <KeywordChip key={kw} kw={kw} small={!isLg} />
              ))}
          </div>
        )}

        {rules.length > 0 && (
          <div
            className={cn(
              'shrink-0 leading-snug',
              isLg ? 'mt-1 text-[9.5px] space-y-0.5' : 'mt-0.5 text-[6.5px] line-clamp-2',
              kwList(def).length === 0 && 'mt-0',
            )}
          >
            {isLg ? rules.map((r, i) => <div key={i}>{r}</div>) : <div>{rules.join(' · ')}</div>}
          </div>
        )}

        {isLg && def.flavor && (
          <div className="mt-1 pt-1 border-t border-[var(--c-ink)]/15">
            <p className={cn('leading-snug', set.className)} style={{ fontSize: flavorFontPx }}>
              {def.flavor}
            </p>
          </div>
        )}

        <div className="flex-1" />
      </div>

      {/* Footer: set/print bar + optional slot content (e.g. deck-count badge). */}
      {def.set && <div className={cn('h-[3px] w-full shrink-0', set.bar)} title={def.set} />}
      {footer}

      {foil && <div className="foil-shimmer absolute inset-0 pointer-events-none opacity-60" />}
      {!foil && animatedFx && !dimmed && (
        <div
          className={cn(
            'rarity-sheen absolute inset-0 pointer-events-none',
            mythic ? 'opacity-80' : 'opacity-50',
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
        <CardFace def={def} size="lg" foil={foil} />
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
