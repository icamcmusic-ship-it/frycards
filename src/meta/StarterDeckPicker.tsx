import React, { useEffect, useRef, useState } from 'react';
import { POOL_BY_ID } from '../game/v3/cardpool';
import { LEADER_COLORS } from '../game/v3/colors';
import { COLOR_PIP } from './colors';
import { EssenceIcon } from '../components/EssenceIcon';
import { SafeImage } from './SafeImage';
import { PopButton } from './ui';
import type { StarterDeckKey } from '../lib/supabase';

/**
 * The three fixed prebuilt Starter Box decks: Common/Uncommon-heavy with a
 * small handful of Rares, no Super-Rare-or-above, all non-foil (mirrors the
 * server-side `claim_starter_deck` RPC — this is display metadata only, not
 * the source of truth for what gets granted).
 */
const STARTER_DECKS: {
  key: StarterDeckKey;
  leaderId: string;
  style: string;
  blurb: string;
}[] = [
  {
    key: 'aggro',
    leaderId: 'legendary_diver',
    style: 'AGGRO',
    blurb: 'Cheap, fast Ember/Gale units that pressure the board from turn one.',
  },
  {
    key: 'midrange',
    leaderId: 'mer_king',
    style: 'MIDRANGE',
    blurb: 'Tide/Root value creatures and ramp — grind out an edge over a long game.',
  },
  {
    key: 'control',
    leaderId: 'ruinwalker_overseer',
    style: 'CONTROL',
    blurb: 'Root/Void removal and resilience — survive the early game, win the late game.',
  },
];

/**
 * Alternate Starter Box flow: instead of picking a Leader for a randomized
 * legal deck (see LeaderPicker), the player picks one of three fixed
 * prebuilt decks built for a clear, beginner-friendly playstyle. Consumes
 * the same one-time Starter Box grant.
 */
export function StarterDeckPicker({
  busy,
  onPick,
  onClose,
}: {
  busy: boolean;
  onPick: (deckKey: StarterDeckKey) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pickStarted, setPickStarted] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  useEffect(() => {
    if (!busy) setPickStarted(false);
  }, [busy]);

  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => prevFocused?.focus?.();
  }, []);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 bg-[var(--c-ink)]/90 z-50 flex items-center justify-center p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Starter Box — pick a prebuilt deck"
    >
      <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-yellow max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--c-ink)] sticky top-0">
          <div>
            <div className="heading-font text-sm text-[var(--c-yellow)]">STARTER BOX</div>
            <div className="text-[9px] font-bold text-[var(--c-paper)]/70">
              PICK A PREBUILT DECK — ready to play, no Super-Rare-or-above cards, only a handful of
              Rares.
            </div>
          </div>
          <PopButton color="yellow" onClick={onClose} disabled={busy} ariaLabel="Close Starter Box">
            ✕
          </PopButton>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STARTER_DECKS.map((deck) => {
            const leader = POOL_BY_ID[deck.leaderId];
            const colors = LEADER_COLORS[deck.leaderId] ?? [];
            return (
              <button
                key={deck.key}
                disabled={busy || pickStarted}
                onClick={() => {
                  setPickStarted(true);
                  onPick(deck.key);
                }}
                className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm flex flex-col overflow-hidden text-left hover:-translate-y-0.5 hover:shadow-hard-black transition-transform disabled:opacity-50 disabled:cursor-wait"
              >
                <div className="relative aspect-[3/4] overflow-hidden ink-border-sm m-2 bg-[var(--c-steel)]">
                  <SafeImage
                    src={leader?.image || null}
                    alt={leader?.name ?? deck.style}
                    className="w-full h-full object-cover"
                    fallbackText={leader?.name ?? deck.style}
                  />
                  <span className="absolute top-1 left-1 text-[8px] font-black px-1 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm">
                    {deck.style}
                  </span>
                </div>
                <div className="px-2 pb-2">
                  <div className="heading-font text-xs truncate">{leader?.name ?? deck.style}</div>
                  {colors.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      {colors.map((c) => (
                        <span
                          key={c}
                          className="w-3 h-3 rounded-full inline-flex items-center justify-center border border-[var(--c-ink)]"
                          style={{ backgroundColor: COLOR_PIP[c].bg }}
                        >
                          <EssenceIcon type={c} color={COLOR_PIP[c].fg} size={8} />
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[9px] font-bold text-[var(--c-steel)] mt-1">{deck.blurb}</p>
                </div>
              </button>
            );
          })}
        </div>
        {busy && (
          <div className="pb-4 text-center heading-font text-xs text-[var(--c-red)]">
            OPENING YOUR STARTER BOX…
          </div>
        )}
      </div>
    </div>
  );
}
