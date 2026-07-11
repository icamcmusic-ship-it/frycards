import React from 'react';
import { cn } from '../lib/utils';
import { Coins, Gem } from 'lucide-react';
import { useMeta } from './MetaContext';

/** Comic-pop button used across all meta screens. */
export function PopButton({
  children,
  onClick,
  disabled,
  color = 'yellow',
  className,
  title,
}: {
  key?: React.Key;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  color?: 'yellow' | 'black' | 'red' | 'steel';
  className?: string;
  title?: string;
}) {
  const palette = {
    yellow: 'bg-[#FFD54F] text-[#1A1A1A]',
    black: 'bg-[#1A1A1A] text-[#FFD54F]',
    red: 'bg-[#E53935] text-[#F7F7F7]',
    steel: 'bg-[#2C3E50] text-[#F7F7F7]',
  }[color];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'btn-pop heading-font text-xs px-4 py-2 ink-border-sm shadow-hard-black-xs transition-colors',
        palette,
        disabled && 'opacity-40 cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  );
}

export const RARITY_CHIP: Record<string, string> = {
  Common: 'bg-[#1A1A1A] text-[#F7F7F7]',
  Uncommon: 'bg-[#2C3E50] text-[#F7F7F7]',
  Rare: 'bg-[#E53935] text-[#F7F7F7]',
  'Super-Rare': 'bg-[#1A1A1A] text-[#FFD54F]',
  'Ultra-Rare': 'bg-gradient-to-r from-[#2C3E50] to-[#E53935] text-[#F7F7F7]',
  Mythic: 'bg-gradient-to-r from-[#E53935] to-[#FFD54F] text-[#1A1A1A]',
};

export function GoldChip({ amount }: { amount: number }) {
  return (
    <span className="flex items-center gap-1 bg-[#FFD54F] text-[#1A1A1A] px-2 py-0.5 ink-border-sm heading-font text-xs">
      <Coins className="w-3.5 h-3.5" /> {amount.toLocaleString()}
    </span>
  );
}

export function GemChip({ amount }: { amount: number }) {
  return (
    <span className="flex items-center gap-1 bg-[#2C3E50] text-[#F7F7F7] px-2 py-0.5 ink-border-sm heading-font text-xs">
      <Gem className="w-3.5 h-3.5" /> {amount.toLocaleString()}
    </span>
  );
}

/** Top bar with title, wallet and navigation back to the menu. */
export function MetaHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { profile } = useMeta();
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-[#1A1A1A] px-4 py-2.5 border-b-4 border-[#1A1A1A]">
      <div className="flex items-center gap-3">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        <h1 className="heading-font text-xl text-[#FFD54F]">{title}</h1>
      </div>
      {profile && (
        <div className="flex items-center gap-2">
          <GoldChip amount={profile.gold} />
          <GemChip amount={profile.gems} />
        </div>
      )}
    </div>
  );
}

/** Small toast-style error/success line. */
export function Notice({ text, kind = 'error' }: { text: string; kind?: 'error' | 'success' }) {
  if (!text) return null;
  return (
    <div
      className={cn(
        'text-xs font-bold px-3 py-1.5 ink-border-sm inline-block',
        kind === 'error' ? 'bg-[#E53935] text-[#F7F7F7]' : 'bg-[#FFD54F] text-[#1A1A1A]',
      )}
    >
      {text}
    </div>
  );
}
