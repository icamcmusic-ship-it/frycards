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
    yellow: 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
    black: 'bg-[var(--c-ink)] text-[var(--c-yellow)]',
    red: 'bg-[var(--c-red)] text-[var(--c-paper)]',
    steel: 'bg-[var(--c-steel)] text-[var(--c-paper)]',
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
  Common: 'bg-[var(--c-ink)] text-[var(--c-paper)]',
  Uncommon: 'bg-[var(--c-steel)] text-[var(--c-paper)]',
  Rare: 'bg-[var(--c-red)] text-[var(--c-paper)]',
  'Super-Rare': 'bg-[var(--c-ink)] text-[var(--c-yellow)]',
  'Ultra-Rare': 'bg-gradient-to-r from-[var(--c-steel)] to-[var(--c-red)] text-[var(--c-paper)]',
  Mythic: 'bg-gradient-to-r from-[var(--c-red)] to-[var(--c-yellow)] text-[var(--c-ink)]',
};

export function GoldChip({ amount }: { amount: number }) {
  return (
    <span className="flex items-center gap-1 bg-[var(--c-yellow)] text-[var(--c-ink)] px-2 py-0.5 ink-border-sm heading-font text-xs">
      <Coins className="w-3.5 h-3.5" /> {amount.toLocaleString()}
    </span>
  );
}

export function GemChip({ amount }: { amount: number }) {
  return (
    <span className="flex items-center gap-1 bg-[var(--c-steel)] text-[var(--c-paper)] px-2 py-0.5 ink-border-sm heading-font text-xs">
      <Gem className="w-3.5 h-3.5" /> {amount.toLocaleString()}
    </span>
  );
}

/** Top bar with title, wallet and navigation back to the menu. */
export function MetaHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { profile } = useMeta();
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-[var(--c-ink)] px-4 py-2.5 border-b-4 border-[var(--c-ink)]">
      <div className="flex items-center gap-3">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        <h1 className="heading-font text-xl text-[var(--c-yellow)]">{title}</h1>
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
        kind === 'error'
          ? 'bg-[var(--c-red)] text-[var(--c-paper)]'
          : 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
      )}
    >
      {text}
    </div>
  );
}
