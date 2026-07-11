/**
 * Shared v4.2 card-face rendering — the ONE card template used everywhere
 * (match UI, deck builder, collection, store/pack reveals) so a card looks
 * and reads identically no matter where it's shown. Real trading-card
 * proportions: 2.5" × 3.5" (5:7).
 */
import React, { useState } from 'react';
import { Dices } from 'lucide-react';
import { CardDef, Effect } from '../game/v3/cards';
import { cn } from '../lib/utils';
import { rarityChip, rarityBorder, rarityGlow, RARITY_HEX } from '../meta/rarity';
import { keywordExplainer } from '../meta/keywords';

export function kwList(def: CardDef): string[] {
  return def.keywords || [];
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
  if (def.comboGate)
    bits.push(`Combo ${def.comboGate}: ${def.onCast ? describeEffect(def.onCast) : ''}`);
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

/** Card art with a graceful fallback if the image 404s or never loads. */
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
    // object-contain: card art is authored at 4:3 and must NEVER be cropped —
    // the frame letterboxes anything off-ratio instead of clipping it.
    <img
      src={def.image}
      className="w-full h-full object-contain"
      draggable={false}
      loading="lazy"
      onError={() => setBroken(true)}
      onLoad={onLoaded}
    />
  );
}

/** Click-to-explain keyword chip; shows a small popup with the glossary text. */
function KeywordChip({
  kw,
  className,
  chipClassName,
}: {
  key?: React.Key;
  kw: string;
  className?: string;
  chipClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const text = keywordExplainer(kw);
  return (
    <span className={cn('relative', className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (text) setOpen((o) => !o);
        }}
        className={cn(chipClassName, text && 'cursor-help underline decoration-dotted')}
        title={text ? 'Tap for details' : undefined}
      >
        {kw}
      </button>
      {open && text && (
        <span
          className="absolute bottom-full left-0 mb-1 z-40 w-44 bg-[var(--c-ink)] text-[var(--c-paper)] text-[9px] font-bold normal-case leading-snug p-2 rounded-sm shadow-hard-black-xs banner-pop block"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <span className="text-[var(--c-yellow)] heading-font block mb-0.5">{kw}</span>
          {text}
        </span>
      )}
    </span>
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
}) {
  const resolvedSize = large ? 'lg' : small ? 'sm' : size;
  const { w, h } = SIZES[resolvedSize];
  const isLg = resolvedSize === 'lg';
  const rules = cardRuleLines(def);
  const set = setStyle(def.set);
  const atkHp = def.type === 'Unit' ? `, ${def.atk} attack, ${def.hp} health` : '';
  const label = `${def.name}, ${def.type}${atkHp}${foil ? ', foil' : ''}`;
  const rarityHex = RARITY_HEX[def.rarity || 'Common'] || RARITY_HEX.Common;

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
      style={{ width: w, height: h }}
      className={cn(
        'relative flex flex-col bg-[var(--c-paper)] text-[var(--c-ink)] border-4 text-left shrink-0 transition-transform overflow-hidden rounded-[4px]',
        rarityBorder(def.rarity),
        onClick && 'btn-pop cursor-pointer',
        dimmed && 'opacity-45 saturate-50',
        highlight && 'ring-4 ring-[var(--c-yellow)] -translate-y-1',
        isLg ? 'shadow-hard-black' : 'shadow-hard-black-xs',
        isLg && !dimmed && rarityGlow(def.rarity),
        foil && !dimmed && 'foil-glow',
      )}
    >
      {/* Header: name + dice-medallion cost badge, tinted per rarity. */}
      <div
        className={cn(
          'flex items-center justify-between gap-1 pl-1.5 pr-1 shrink-0 border-b-2 border-[var(--c-ink)]/15',
          isLg ? 'py-1' : 'py-0.5',
        )}
        style={{ backgroundColor: `color-mix(in srgb, ${rarityHex} 20%, var(--c-paper))` }}
      >
        <span
          className={cn(
            'heading-font leading-tight truncate pr-1',
            isLg ? 'text-[13px]' : 'text-[9px]',
          )}
          title={def.name}
        >
          {def.name}
        </span>
        {def.comboGate ? (
          <span
            className={cn(
              'heading-font shrink-0 flex items-center gap-0.5 rounded-full border-2 border-[var(--c-ink)] bg-[#A855F7] text-white',
              isLg ? 'text-[9px] px-1.5 py-0.5' : 'text-[6px] px-1 py-0.5',
            )}
          >
            {isLg && <Dices className="w-3 h-3" />}
            COMBO
          </span>
        ) : def.type !== 'Location' && def.type !== 'Leader' && def.threshold !== undefined ? (
          <span
            className={cn(
              'heading-font font-mono shrink-0 flex items-center justify-center rounded-full border-2 border-[var(--c-ink)] bg-[var(--c-ink)] text-[var(--c-yellow)]',
              isLg ? 'text-[13px] w-7 h-7' : 'text-[9px] w-4 h-4',
            )}
            title={`Cast Slot ${def.threshold}+`}
          >
            {def.threshold}
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

      {/* Art — a fixed 4:3 window matching the authored art ratio, so the
          full illustration is always visible (object-contain, never cropped). */}
      <div className="relative aspect-[4/3] w-auto shrink-0 mx-1.5 mt-1 border-2 border-[var(--c-ink)] overflow-hidden rounded-[2px] bg-[var(--c-steel)]">
        <CardArt def={def} />
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
          <span
            className={cn('font-mono font-black shrink-0', isLg ? 'text-[13px]' : 'text-[9px]')}
          >
            {def.atk}
            <span className="text-[var(--c-red)]">⚔</span>/{def.hp}
            <span className="text-[#22C55E]">♥</span>
          </span>
        )}
        {def.type === 'Leader' && (
          <span
            className={cn('font-mono font-black shrink-0', isLg ? 'text-[13px]' : 'text-[9px]')}
          >
            {def.hp}
            <span className="text-[#22C55E]">♥</span>
          </span>
        )}
      </div>

      {/* Keywords */}
      {kwList(def).length > 0 && (
        <div
          className={cn(
            'flex flex-wrap gap-0.5 px-1.5 shrink-0',
            isLg ? 'mt-1' : 'mt-0.5 min-h-[9px]',
          )}
        >
          {kwList(def)
            .slice(0, isLg ? 8 : 3)
            .map((kw) => (
              <KeywordChip
                key={kw}
                kw={kw}
                chipClassName={cn(
                  'font-bold px-1.5 bg-[var(--c-yellow)] border border-[var(--c-ink)] leading-tight rounded-full',
                  isLg ? 'text-[9px]' : 'text-[6.5px] px-1',
                )}
              />
            ))}
          {def.comboGate && (
            <span
              className={cn(
                'font-bold px-1.5 bg-[#A855F7] text-white border border-[var(--c-ink)] leading-tight rounded-full',
                isLg ? 'text-[9px]' : 'text-[6.5px] px-1',
              )}
            >
              {def.comboGate}
            </span>
          )}
        </div>
      )}

      {/* Rules text — every ability/effect on its own line. */}
      {rules.length > 0 && (
        <div
          className={cn(
            'px-1.5 shrink-0 leading-snug',
            isLg ? 'mt-1 text-[9.5px] space-y-0.5' : 'mt-0.5 text-[6.5px] line-clamp-2',
          )}
        >
          {isLg ? rules.map((r, i) => <div key={i}>{r}</div>) : <div>{rules.join(' · ')}</div>}
        </div>
      )}

      {/* Flavor text — styled per set (only room for it at the large size). */}
      {isLg && def.flavor && (
        <div className="mt-1 px-1.5 pt-1 border-t border-[var(--c-ink)]/15">
          <p className={cn('text-[9px] leading-snug line-clamp-2', set.className)}>{def.flavor}</p>
        </div>
      )}

      <div className="flex-1" />

      {/* Footer: set/print bar + optional slot content (e.g. deck-count badge). */}
      {def.set && <div className={cn('h-[3px] w-full shrink-0', set.bar)} title={def.set} />}
      {footer}

      {foil && <div className="foil-shimmer absolute inset-0 pointer-events-none opacity-60" />}
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
        {/* Pure enlargement of the exact same global template — a scaled-up
            lg card, so the expanded view can never drift out of sync. */}
        <div className="w-[336px] h-[470px] flex items-center justify-center">
          <div style={{ transform: 'scale(1.4)' }}>
            <CardFace def={def} size="lg" foil={foil} />
          </div>
        </div>
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
