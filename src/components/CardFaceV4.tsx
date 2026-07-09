/**
 * Shared v4.2 card-face rendering — used by the match UI (GameV4) and the
 * deck builder, so both present the same card identity and rules text
 * instead of drifting into two different "what does this card do" reads.
 */
import React from 'react';
import { CardDef, Effect } from '../game/v3/cards';
import { cn } from '../lib/utils';

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

export function cardRules(def: CardDef): string {
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
  return bits.join(' · ');
}

/** Rarity accent colors, shared between the deck builder and match UI. */
export const RARITY_COLOR: Record<string, string> = {
  Common: 'bg-[#2C3E50] text-[#F7F7F7]',
  Uncommon: 'bg-[#43A047] text-white',
  Rare: 'bg-[#29B6F6] text-[#1A1A1A]',
  'Super-Rare': 'bg-[#8E44AD] text-white',
  Legendary: 'bg-[#FFD54F] text-[#1A1A1A]',
  Mythic: 'bg-[#E53935] text-white',
};

export function CardFace({
  def,
  small,
  dimmed,
  highlight,
  onClick,
  footer,
  badge,
  count,
}: {
  def: CardDef;
  small?: boolean;
  dimmed?: boolean;
  highlight?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
  badge?: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'relative bg-[#F7F7F7] text-[#1A1A1A] ink-border-sm text-left shrink-0 transition-transform',
        small ? 'w-[104px]' : 'w-[128px]',
        onClick && 'btn-pop cursor-pointer',
        dimmed && 'opacity-45',
        highlight && 'ring-4 ring-[#FFD54F] -translate-y-1',
      )}
    >
      <div className="flex items-center justify-between px-1 pt-0.5">
        <span className="heading-font text-[9px] leading-tight truncate pr-1">{def.name}</span>
        {def.comboGate ? (
          <span className="text-[8px] font-bold bg-[#8E44AD] text-white px-0.5 shrink-0">
            COMBO
          </span>
        ) : def.type !== 'Location' && def.threshold !== undefined ? (
          <span className="text-[10px] font-mono font-bold bg-[#1A1A1A] text-[#FFD54F] px-1 shrink-0">
            {def.threshold}+
          </span>
        ) : def.type === 'Location' ? (
          <span className="text-[8px] font-bold bg-[#2C3E50] text-white px-0.5 shrink-0">FREE</span>
        ) : null}
      </div>
      {def.image && (
        <div
          className={cn(
            'ink-border-sm mx-1 mt-0.5 overflow-hidden relative',
            small ? 'h-[52px]' : 'h-[66px]',
          )}
        >
          <img
            src={def.image}
            className="w-full h-full object-cover"
            draggable={false}
            loading="lazy"
          />
          {def.rarity && (
            <span
              className={cn(
                'absolute top-0.5 right-0.5 text-[6px] font-bold px-0.5',
                RARITY_COLOR[def.rarity] || RARITY_COLOR.Common,
              )}
            >
              {def.rarity}
            </span>
          )}
          {badge && (
            <span className="absolute top-0.5 left-0.5 bg-[#E53935] text-white text-[7px] font-black px-1">
              {badge}
            </span>
          )}
          {count !== undefined && count > 0 && (
            <span className="absolute bottom-0.5 right-0.5 bg-[#1A1A1A] text-[#FFD54F] text-[8px] font-black px-1">
              ×{count}
            </span>
          )}
        </div>
      )}
      <div className="px-1 pb-0.5">
        <div className="flex flex-wrap gap-0.5 mt-0.5 min-h-[10px]">
          {kwList(def)
            .slice(0, 4)
            .map((kw) => (
              <span
                key={kw}
                className="text-[7px] font-bold px-0.5 bg-[#FFD54F] ink-border-sm leading-tight"
              >
                {kw}
              </span>
            ))}
          {def.comboGate && (
            <span className="text-[7px] font-bold px-0.5 bg-[#8E44AD] text-white ink-border-sm leading-tight">
              {def.comboGate}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[8px] font-bold uppercase text-[#2C3E50]">{def.type}</span>
          {def.type === 'Unit' && (
            <span className="text-[10px] font-mono font-bold">
              {def.atk}
              <span className="text-[#E53935]">⚔</span>/{def.hp}
              <span className="text-[#43A047]">♥</span>
            </span>
          )}
        </div>
        {footer}
      </div>
    </button>
  );
}
