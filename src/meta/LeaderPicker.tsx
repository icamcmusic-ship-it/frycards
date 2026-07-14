import React from 'react';
import { POOL_LEADERS } from '../game/v3/cardpool';
import { SafeImage } from './SafeImage';
import { PopButton } from './ui';
import { RARITY_CHIP } from './rarity';
import { RARITIES } from '../types';
import { cn } from '../lib/utils';

// Starter Box picks are capped at Rare or below — enforced again server-side
// by claim_starter_box (this filter is UI-only, not the source of truth).
const STARTER_MAX_RARITY_IDX = RARITIES.indexOf('Rare');

/**
 * Full-screen Leader picker for the one-time Starter Box: the player chooses
 * which Leader to open (Rare rarity or below only) before `claim_starter_box`
 * grants that Leader + its deterministic legal 30-card deck. Leader roster
 * comes straight from POOL_LEADERS (populated at boot by App.tsx's
 * applyCardPool call) so there's no duplicate hand-rolled Leader list to
 * keep in sync.
 */
export function LeaderPicker({
  busy,
  onPick,
  onClose,
}: {
  busy: boolean;
  onPick: (leaderId: string) => void;
  onClose: () => void;
}) {
  const starterLeaders = POOL_LEADERS.filter(
    (l) => RARITIES.indexOf(l.rarity || 'Common') <= STARTER_MAX_RARITY_IDX,
  );
  return (
    <div className="fixed inset-0 bg-[var(--c-ink)]/90 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-yellow max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--c-ink)] sticky top-0">
          <div>
            <div className="heading-font text-sm text-[var(--c-yellow)]">STARTER BOX</div>
            <div className="text-[9px] font-bold text-[var(--c-paper)]/70">
              PICK YOUR LEADER (Rare or below) — this is permanent, but you can build more decks
              later.
            </div>
          </div>
          <PopButton color="yellow" onClick={onClose} disabled={busy}>
            ✕
          </PopButton>
        </div>

        <div className="p-4">
          {starterLeaders.length === 0 ? (
            <div className="text-center font-bold text-[var(--c-steel)] py-10">
              Leaders are still loading — try again in a moment.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {starterLeaders.map((leader) => (
                <button
                  key={leader.id}
                  disabled={busy}
                  onClick={() => onPick(leader.id)}
                  className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm flex flex-col overflow-hidden text-left hover:-translate-y-0.5 hover:shadow-hard-black transition-transform disabled:opacity-50 disabled:cursor-wait"
                >
                  <div className="relative aspect-[3/4] overflow-hidden ink-border-sm m-2 bg-[var(--c-steel)]">
                    <SafeImage
                      src={leader.image || null}
                      alt={leader.name}
                      className="w-full h-full object-cover"
                      fallbackText={leader.name}
                    />
                    <span
                      className={cn(
                        'absolute top-1 left-1 text-[8px] font-black px-1 ink-border-sm',
                        RARITY_CHIP[leader.rarity || 'Common'] || RARITY_CHIP.Common,
                      )}
                    >
                      {(leader.rarity || 'Common').toUpperCase()}
                    </span>
                  </div>
                  <div className="px-2 pb-2">
                    <div className="heading-font text-xs truncate">{leader.name}</div>
                    {leader.flavor && (
                      <p className="text-[9px] font-bold text-[var(--c-steel)] mt-0.5 line-clamp-2">
                        {leader.flavor}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {busy && (
            <div className="mt-4 text-center heading-font text-xs text-[var(--c-red)]">
              OPENING YOUR STARTER BOX…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
