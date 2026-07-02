import React from 'react';
import { GameCard } from '../types';
import { cn } from '../lib/utils';
import { Heart, Sword, Shield, Snowflake, Flame } from 'lucide-react';

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
}

const ELEMENT_COLORS: Record<string, string> = {
  Light: 'bg-yellow-500/20 text-yellow-200',
  Dark: 'bg-purple-900/40 text-purple-200',
  Frost: 'bg-cyan-500/20 text-cyan-200',
  Flame: 'bg-orange-600/20 text-orange-200',
  Tech: 'bg-sky-500/20 text-sky-200',
  Nature: 'bg-emerald-600/20 text-emerald-200',
  Order: 'bg-amber-400/20 text-amber-100',
  Chaos: 'bg-rose-600/20 text-rose-200',
  Generic: 'bg-slate-600/30 text-slate-200',
};

function effAtk(card: GameCard): number {
  const item = (card.attachedItems || []).reduce((s, it) => s + (it.attach?.attack || 0), 0);
  return Math.max(0, (card.attack || 0) + card.tempAtk + item - card.witherAtk);
}
function bonusHp(card: GameCard): number {
  return (card.attachedItems || []).reduce((s, it) => s + (it.attach?.health || 0), 0);
}
function healthRemaining(card: GameCard): number {
  const max = Math.max(1, (card.health || 0) + card.tempHp - card.witherHp);
  return max + bonusHp(card) - card.damageTaken - card.bonusDamage;
}

export function CardView({ card, onClick, className, selected, playable, targetable, faceDown, compact }: CardViewProps) {
  const size = compact ? 'w-24 h-36' : 'w-28 h-40';

  if (faceDown) {
    return (
      <div className={cn(size, 'rounded-lg bg-slate-800 border-2 border-slate-600 shadow-md flex items-center justify-center', className)}>
        <div className="w-14 h-14 rounded-full border-2 border-slate-500 opacity-50 flex items-center justify-center">
          <div className="w-7 h-7 rotate-45 bg-slate-500" />
        </div>
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
        'relative rounded-lg overflow-hidden flex flex-col select-none transition-transform',
        'bg-slate-900 border-2 border-slate-700 shadow-lg text-xs',
        size,
        isLeader && (compact ? '' : 'w-32 h-44') + ' border-amber-500/50',
        playable && 'cursor-pointer hover:-translate-y-2 hover:shadow-xl hover:border-emerald-500 ring-1 ring-emerald-500/40',
        targetable && 'cursor-pointer ring-2 ring-fuchsia-400 animate-pulse',
        selected && 'ring-4 ring-emerald-500 border-emerald-500 -translate-y-2',
        onClick && !playable && !targetable && 'cursor-pointer hover:border-blue-400',
        card.frozen > 0 && 'ring-2 ring-cyan-400',
        card.summoningSickness && 'opacity-80',
        card.exhausted && 'rotate-6 opacity-75 grayscale-[0.3]',
        className
      )}
    >
      {/* Title */}
      <div className="px-1.5 py-1 flex justify-between items-center bg-slate-800/90 border-b border-slate-700 gap-1">
        <span className="font-bold truncate text-slate-100 text-[11px]">{card.name}</span>
        {card.cost && (
          <span className="shrink-0 flex gap-0.5">
            {Object.entries(card.cost).map(([el, amt]) => (
              <span key={el} className={cn('px-1 rounded-sm text-[9px] font-mono font-bold', ELEMENT_COLORS[el] || 'bg-slate-700')}>
                {amt}{el === 'Generic' ? '' : el[0]}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Art (4:3) */}
      <div className="relative w-full aspect-[4/3] bg-slate-950 overflow-hidden">
        {card.image ? (
          <img src={card.image} alt={card.name} className="w-full h-full object-cover" loading="lazy" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">{card.type}</div>
        )}
        <div className="absolute top-0.5 left-0.5 flex gap-0.5">
          {card.elements.map((e) => (
            <span key={e} className={cn('px-1 rounded-sm text-[8px] font-semibold', ELEMENT_COLORS[e])}>{e[0]}</span>
          ))}
        </div>
        {/* Status badges */}
        <div className="absolute top-0.5 right-0.5 flex flex-col gap-0.5 items-end">
          {card.armor > 0 && <span className="flex items-center gap-0.5 px-1 rounded-sm bg-slate-800/90 text-slate-200 text-[8px]"><Shield className="w-2.5 h-2.5" />{card.armor}</span>}
          {card.frozen > 0 && <Snowflake className="w-3 h-3 text-cyan-300" />}
          {card.scorch > 0 && <span className="flex items-center gap-0.5 px-1 rounded-sm bg-orange-900/80 text-orange-200 text-[8px]"><Flame className="w-2.5 h-2.5" />{card.scorch}</span>}
        </div>
      </div>

      {/* Text / keywords */}
      <div className="flex-1 px-1 py-0.5 bg-slate-900/70 overflow-hidden">
        {card.keywords && card.keywords.length > 0 && (
          <div className="flex flex-wrap gap-0.5">
            {card.keywords.map((kw) => (
              <span key={kw} className="text-[8px] font-medium px-1 bg-indigo-500/20 text-indigo-200 rounded-sm">{kw}</span>
            ))}
          </div>
        )}
        {card.attachedItems && card.attachedItems.length > 0 && (
          <div className="text-[8px] text-emerald-300 truncate">+{card.attachedItems.map((i) => i.name).join(', ')}</div>
        )}
      </div>

      {/* Stats */}
      {showStats && (
        <div className="px-1.5 py-1 flex justify-between items-center bg-slate-800 border-t border-slate-700 font-mono text-sm">
          <div className="flex items-center gap-1 text-amber-400">
            <Sword className="w-3.5 h-3.5" />
            <span>{effAtk(card)}</span>
          </div>
          <div className={cn('flex items-center gap-1', card.damageTaken > 0 ? 'text-rose-400' : 'text-rose-500')}>
            <span>{healthRemaining(card)}</span>
            <Heart className="w-3.5 h-3.5" />
          </div>
        </div>
      )}
    </div>
  );
}
