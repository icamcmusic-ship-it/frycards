import React, { useState } from 'react';
import { GameCard } from '../types';
import { cn } from '../lib/utils';
import { Heart, Sword } from 'lucide-react';

interface CardViewProps {
  key?: React.Key;
  card: GameCard;
  onClick?: () => void;
  className?: string;
  selected?: boolean;
  playable?: boolean;
  faceDown?: boolean;
}

export function CardView({ card, onClick, className, selected, playable, faceDown }: CardViewProps) {
  if (faceDown) {
    return (
      <div 
        className={cn(
          "w-28 h-40 rounded-lg bg-slate-800 border-2 border-slate-600 shadow-md flex items-center justify-center",
          className
        )}
      >
        <div className="w-16 h-16 rounded-full border-2 border-slate-500 opacity-50 flex items-center justify-center">
          <div className="w-8 h-8 rotate-45 bg-slate-500" />
        </div>
      </div>
    );
  }

  const isLeader = card.type === 'Leader';
  const healthRemaining = (card.health || 0) - card.damageTaken;

  return (
    <div 
      onClick={playable || onClick ? onClick : undefined}
      className={cn(
        "relative w-28 h-40 rounded-lg overflow-hidden flex flex-col select-none transition-transform",
        "bg-slate-900 border-2 border-slate-700 shadow-lg text-xs",
        playable && "cursor-pointer hover:-translate-y-2 hover:shadow-xl hover:border-emerald-500",
        selected && "ring-4 ring-emerald-500 border-emerald-500 -translate-y-2",
        onClick && !playable && "cursor-pointer hover:border-blue-400",
        (card.exhausted || card.summoningSickness) && "opacity-75 grayscale-[0.3]",
        card.exhausted && "rotate-6",
        isLeader && "w-32 h-44 border-amber-500/50",
        className
      )}
    >
      <div className="p-1.5 flex justify-between items-center bg-slate-800/80 border-b border-slate-700">
        <span className="font-bold truncate px-1 text-slate-100">{card.name}</span>
      </div>
      
      <div className="flex-1 p-2 flex flex-col gap-1 bg-slate-900/50">
        <div className="flex gap-1 text-[10px] text-slate-400">
          {card.elements.map(e => <span key={e}>{e}</span>)}
        </div>
        
        {card.cost && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(card.cost).map(([el, amt]) => (
              <span key={el} className="px-1.5 py-0.5 rounded-sm bg-slate-800 border border-slate-700 text-[10px] font-mono font-medium text-slate-300">
                {amt} {el !== 'Generic' ? el.charAt(0) : '*'}
              </span>
            ))}
          </div>
        )}
        
        {card.keywords && card.keywords.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1">
            {card.keywords.map(kw => (
              <span key={kw} className="text-[9px] font-medium px-1 bg-indigo-500/20 text-indigo-300 rounded-sm">
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {(card.attack !== undefined || card.health !== undefined) && (
        <div className="p-1.5 flex justify-between items-center bg-slate-800 border-t border-slate-700 font-mono text-sm">
          <div className="flex items-center gap-1 text-amber-500">
            <Sword className="w-3.5 h-3.5" />
            <span>{card.attack}</span>
          </div>
          <div className="flex items-center gap-1 text-rose-500">
            <span>{healthRemaining}</span>
            <Heart className="w-3.5 h-3.5" />
          </div>
        </div>
      )}
      
      {card.damageTaken > 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30 text-rose-600">
          <Heart className="w-16 h-16 fill-current" />
        </div>
      )}
    </div>
  );
}
