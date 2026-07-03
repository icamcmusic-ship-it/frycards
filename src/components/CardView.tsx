import React from 'react';
import { GameCard, GameState } from '../types';
import { cn } from '../lib/utils';
import { Shield, Snowflake, Flame, Zap } from 'lucide-react';
import { effAttack, totalRemaining, effArmor } from '../game/engine';
import { getCardBackImage } from '../meta/cardback';

interface CardViewProps {
  key?: React.Key;
  card: GameCard;
  onClick?: () => void;
  className?: string;
  selected?: boolean;
  playable?: boolean;
  targetable?: boolean;
  faceDown?: boolean;
  compact?: boolean;
  gameState?: GameState;
}

// Monochrome & Pop element chips: ink/paper/steel with pop yellow + red accents.
const ELEMENT_COLORS: Record<string, string> = {
  Light: 'bg-[#FFD54F] text-[#1A1A1A]',
  Dark: 'bg-[#1A1A1A] text-[#F7F7F7]',
  Frost: 'bg-[#F7F7F7] text-[#2C3E50]',
  Flame: 'bg-[#E53935] text-[#F7F7F7]',
  Tech: 'bg-[#2C3E50] text-[#F7F7F7]',
  Nature: 'bg-[#F7F7F7] text-[#1A1A1A]',
  Order: 'bg-[#FFD54F] text-[#2C3E50]',
  Chaos: 'bg-[#E53935] text-[#1A1A1A]',
  Generic: 'bg-[#2C3E50] text-[#F7F7F7]',
};

const RARITY_STYLE: Record<string, string> = {
  'Common': 'bg-[#1A1A1A] text-[#F7F7F7]',
  'Uncommon': 'bg-[#2C3E50] text-[#F7F7F7]',
  'Rare': 'bg-[#E53935] text-[#F7F7F7]',
  'Super-Rare': 'bg-[#1A1A1A] text-[#FFD54F]',
  'Legendary': 'bg-gradient-to-r from-[#2C3E50] to-[#E53935] text-[#F7F7F7]',
  'Mythic': 'bg-gradient-to-r from-[#E53935] to-[#FFD54F] text-[#1A1A1A]',
};

function getEffectiveAtk(card: GameCard, state?: GameState): number {
  if (state) {
    return effAttack(card, state);
  }
  const item = (card.attachedItems || []).reduce((s, it) => s + (it.attach?.attack || 0), 0);
  return Math.max(0, (card.attack || 0) + card.tempAtk + item - card.witherAtk);
}

function getEffectiveHp(card: GameCard, state?: GameState): number {
  if (state) {
    // Total remaining = base health tier + Item bonus health tier (§5.3).
    return totalRemaining(card, state);
  }
  const itemHp = (card.attachedItems || []).reduce((s, it) => s + (it.attach?.health || 0), 0);
  const baseMax = Math.max(0, (card.health || 0) + card.tempHp - card.witherHp);
  return baseMax + itemHp - card.damageTaken - card.bonusDamage;
}

function costTotal(card: GameCard): number {
  return Object.values(card.cost || {}).reduce((a, b) => a + b, 0);
}

export function CardView({ card, onClick, className, selected, playable, targetable, faceDown, compact, gameState }: CardViewProps) {
  // Standard vertical TCG proportions: 5:7 outer frame.
  const size = compact ? 'w-[104px] h-[146px]' : 'w-[120px] h-[168px]';

  if (faceDown) {
    const back = getCardBackImage();
    return (
      <div className={cn(size, 'classic-black-back ink-border-sm shadow-hard-black-xs flex items-center justify-center overflow-hidden', className)}>
        {back ? (
          <img src={back} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-10 h-10 bg-[#FFD54F] ink-border-sm rotate-45 flex items-center justify-center opacity-90">
            <span className="-rotate-45 heading-font text-[10px] text-[#1A1A1A]">POP</span>
          </div>
        )}
      </div>
    );
  }

  const isLeader = card.type === 'Leader';
  const showStats = card.attack !== undefined || card.health !== undefined;

  return (
    <div
      onClick={onClick}
      title={card.text}
      className={cn(
        'relative overflow-hidden flex flex-col select-none transition-transform bg-[#F7F7F7] text-[#1A1A1A] ink-border-sm shadow-hard-black-xs',
        size,
        isLeader && 'border-[#FFD54F]',
        playable && 'cursor-pointer hover:-translate-y-2 outline outline-2 outline-[#FFD54F]',
        targetable && 'cursor-pointer outline outline-4 outline-[#E53935] animate-pulse',
        selected && 'outline outline-4 outline-[#FFD54F] -translate-y-2',
        onClick && !playable && !targetable && 'cursor-pointer hover:outline hover:outline-2 hover:outline-[#2C3E50]',
        card.frozen > 0 && 'outline outline-2 outline-[#2C3E50]',
        card.summoningSickness && 'opacity-80',
        card.exhausted && 'rotate-6 opacity-75 grayscale-[0.4]',
        className
      )}
    >
      {/* Top row: rarity chip + cast cost */}
      <div className="px-1 pt-0.5 pb-0.5 flex justify-between items-center gap-1">
        <span className={cn('px-1 text-[7px] font-black font-mono heading-font truncate', RARITY_STYLE[card.rarity || 'Common'])}>
          {(card.rarity || card.type).toUpperCase()}
        </span>
        {card.cost && (
          <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-black heading-font">
            <Zap className="w-2.5 h-2.5" />{costTotal(card)}
            <span className="flex gap-px">
              {Object.entries(card.cost).map(([el, amt]) => el !== 'Generic' && (
                <span key={el} className={cn('px-0.5 text-[7px] font-bold', ELEMENT_COLORS[el])}>{amt}{el[0]}</span>
              ))}
            </span>
          </span>
        )}
      </div>

      {/* 4:3 art panel inside the vertical frame */}
      <div className="relative w-full aspect-[4/3] bg-[#2C3E50] ink-border-sm overflow-hidden mx-auto" style={{ width: 'calc(100% - 8px)' }}>
        {card.image ? (
          <img src={card.image} alt={card.name} className="w-full h-full object-cover" loading="lazy" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#F7F7F7] text-[10px] heading-font">{card.type}</div>
        )}
        {/* Status badges */}
        <div className="absolute top-0.5 right-0.5 flex flex-col gap-0.5 items-end">
          {card.armor !== undefined && effArmor(card) > 0 && <span className="flex items-center gap-0.5 px-1 bg-[#1A1A1A] text-[#F7F7F7] text-[8px] font-bold"><Shield className="w-2.5 h-2.5" />{effArmor(card)}</span>}
          {card.frozen > 0 && <span className="px-0.5 bg-[#F7F7F7]"><Snowflake className="w-3 h-3 text-[#2C3E50]" /></span>}
          {card.scorch > 0 && <span className="flex items-center gap-0.5 px-1 bg-[#E53935] text-[#F7F7F7] text-[8px] font-bold"><Flame className="w-2.5 h-2.5" />{card.scorch}</span>}
          {card.glitched && <span className="px-1 bg-[#2C3E50] text-[#FFD54F] text-[7px] font-mono font-bold">GLITCH</span>}
        </div>
        {(card.attachedItems || []).length > 0 && (
          <div className="absolute bottom-0.5 left-0.5 px-1 bg-[#1A1A1A] text-[#FFD54F] text-[7px] font-bold heading-font truncate max-w-[95%]">
            +{card.attachedItems.map((i) => i.name).join(', ')}
          </div>
        )}
      </div>

      {/* Name + keywords */}
      <div className="flex-1 px-1 pt-0.5 overflow-hidden">
        <div className="heading-font text-[8.5px] leading-tight truncate">{card.name}</div>
        {card.keywords && card.keywords.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {card.keywords.map((kw) => (
              <span key={kw} className="text-[7px] font-bold px-0.5 bg-[#FFD54F] text-[#1A1A1A]">{kw}</span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom stats bar */}
      {showStats ? (
        <div className="px-1 py-0.5 flex justify-between items-center border-t-2 border-[#1A1A1A]">
          <span className="bg-[#1A1A1A] text-[#FFD54F] px-1 text-[9px] font-black heading-font">ATK {getEffectiveAtk(card, gameState)}</span>
          <span className="text-[7px] font-mono font-bold text-[#2C3E50] uppercase truncate px-0.5">{card.type}</span>
          <span className={cn('px-1 text-[9px] font-black heading-font', card.damageTaken + card.bonusDamage > 0 ? 'bg-[#E53935] text-[#F7F7F7]' : 'bg-[#2C3E50] text-[#F7F7F7]')}>
            DEF {getEffectiveHp(card, gameState)}
          </span>
        </div>
      ) : (
        <div className="px-1 py-0.5 border-t-2 border-[#1A1A1A] text-[7px] font-mono font-bold text-[#2C3E50] uppercase flex justify-between">
          <span>{card.type}</span>
          {card.type === 'Charm' && card.charmDuration !== undefined && <span>{card.charmDuration}T</span>}
          {card.type === 'Charm' && card.charmDuration === undefined && card.duration !== undefined && <span>{card.duration}T</span>}
        </div>
      )}
    </div>
  );
}
