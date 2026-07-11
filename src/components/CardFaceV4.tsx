/**
 * Shared v4.2 card-face rendering — the ONE card template used everywhere
 * (match UI, deck builder, collection, store/pack reveals) so a card looks
 * and reads identically no matter where it's shown. Real trading-card
 * proportions: 2.5" × 3.5" (5:7).
 */
import React, { useState } from 'react';
import { CardDef, Effect } from '../game/v3/cards';
import { cn } from '../lib/utils';
import { rarityChip, rarityBorder, rarityGlow } from '../meta/rarity';

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
    <img
      src={def.image}
      className="w-full h-full object-cover"
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
  const label = `${def.name}, ${def.type}${atkHp}`;

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
      )}
    >
      {/* Header: name + cost */}
      <div
        className={cn(
          'flex items-center justify-between gap-1 px-1.5 shrink-0',
          isLg ? 'py-1' : 'py-0.5',
        )}
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
              'font-bold bg-[#A855F7] text-white px-1 shrink-0 rounded-sm',
              isLg ? 'text-[10px]' : 'text-[7px]',
            )}
          >
            COMBO
          </span>
        ) : def.type !== 'Location' && def.type !== 'Leader' && def.threshold !== undefined ? (
          <span
            className={cn(
              'font-mono font-bold bg-[var(--c-ink)] text-[var(--c-yellow)] px-1 shrink-0 rounded-sm',
              isLg ? 'text-[13px]' : 'text-[10px]',
            )}
          >
            {def.threshold}+
          </span>
        ) : def.type === 'Location' ? (
          <span
            className={cn(
              'font-bold bg-[var(--c-steel)] text-white px-1 shrink-0 rounded-sm',
              isLg ? 'text-[10px]' : 'text-[7px]',
            )}
          >
            FREE
          </span>
        ) : null}
      </div>

      {/* Art — fills all remaining space, cropped to fit (never a fixed 4:3 box). */}
      <div className="relative flex-1 min-h-0 mx-1.5 border-2 border-[var(--c-ink)] overflow-hidden rounded-[2px]">
        <CardArt def={def} />
        {def.rarity && (
          <span
            className={cn(
              'absolute top-1 right-1 font-black px-1 rounded-sm leading-tight',
              isLg ? 'text-[9px]' : 'text-[6px]',
              rarityChip(def.rarity),
            )}
          >
            {def.rarity}
          </span>
        )}
        {badge && (
          <span
            className={cn(
              'absolute top-1 left-1 bg-[var(--c-red)] text-white font-black px-1 rounded-sm',
              isLg ? 'text-[9px]' : 'text-[7px]',
            )}
          >
            {badge}
          </span>
        )}
        {(foilCount || 0) > 0 && (
          <span className="absolute bottom-1 right-1 bg-[var(--c-yellow)] text-[var(--c-ink)] text-[8px] font-black px-1 rounded-sm">
            ✦ {foilCount}
          </span>
        )}
        {count !== undefined && count > 0 && (
          <span className="absolute bottom-1 left-1 bg-[var(--c-ink)] text-[var(--c-yellow)] text-[8px] font-black px-1 rounded-sm">
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
              <span
                key={kw}
                className={cn(
                  'font-bold px-1 bg-[var(--c-yellow)] border border-[var(--c-ink)] leading-tight rounded-sm',
                  isLg ? 'text-[9px]' : 'text-[6.5px]',
                )}
              >
                {kw}
              </span>
            ))}
          {def.comboGate && (
            <span
              className={cn(
                'font-bold px-1 bg-[#A855F7] text-white border border-[var(--c-ink)] leading-tight rounded-sm',
                isLg ? 'text-[9px]' : 'text-[6.5px]',
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
    </div>
  );
}
