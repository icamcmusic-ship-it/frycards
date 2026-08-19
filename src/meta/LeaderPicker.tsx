import React, { useEffect, useState } from 'react';
import { POOL_LEADERS } from '../game/v3/cardpool';
import { LEADER_COLORS } from '../game/v3/colors';
import { COLOR_PIP } from './colors';
import { EssenceIcon } from '../components/EssenceIcon';
import { SafeImage } from './SafeImage';
import { PopButton } from './ui';
import { RARITY_CHIP } from './rarity';
import { RARITIES } from '../types';
import { cn } from '../lib/utils';
import { useFocusTrap } from '../components/useFocusTrap';

// Deck Box picks are capped at Rare or below — enforced again server-side
// by claim_deck_box (this filter is UI-only, not the source of truth).
const DECK_BOX_MAX_RARITY_IDX = RARITIES.indexOf('Rare');

/**
 * Full-screen Leader picker for the one-time Deck Box: the player chooses
 * which Leader to build around (Rare rarity or below only) before `claim_deck_box`
 * grants that Leader + its deterministic legal 60-card deck. Leader roster
 * comes straight from POOL_LEADERS (populated at boot by App.tsx's
 * applyCardPool call) so there's no duplicate hand-rolled Leader list to
 * keep in sync.
 */
export function LeaderPicker({
  busy,
  error,
  onPick,
  onClose,
}: {
  busy: boolean;
  /** Claim failure to show INSIDE the dialog — the Store's own error Notice
   * renders underneath this opaque full-screen overlay, so without this a
   * failed claim looked like the picker silently ignoring the tap. */
  error?: string;
  onPick: (leaderId: string) => void;
  onClose: () => void;
}) {
  const deckBoxLeaders = POOL_LEADERS.filter(
    (l) => RARITIES.indexOf(l.rarity || 'Common') <= DECK_BOX_MAX_RARITY_IDX,
  );
  // v30 — this used to be a `useRef` plus an effect that focused the dialog
  // once. Moving focus in does not keep it there: a dialog mounts at the end
  // of the DOM, so Tab from its last control walks off the document and back
  // in at the TOP of the page, which is what the dialog is covering. See
  // `useFocusTrap`.
  const dialogRef = useFocusTrap<HTMLDivElement>();
  // The parent's `busy` prop only flips true after onPick's async claim call
  // actually starts — a fast double-click on a tile (or two different tiles)
  // before that re-render lands could fire onPick twice. This local latch
  // closes that window without waiting on the parent.
  const [pickStarted, setPickStarted] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // If the claim fails, the parent drops `busy` back to false but this
  // dialog stays open for a retry — release the local latch so the tiles
  // become clickable again instead of being stuck disabled forever.
  useEffect(() => {
    if (!busy) setPickStarted(false);
  }, [busy]);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 bg-[var(--c-ink)]/90 z-50 flex items-center justify-center p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Deck Box — pick your Leader"
    >
      <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-yellow max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--c-ink)] sticky top-0">
          <div>
            <div className="heading-font text-sm text-[var(--c-yellow)]">DECK BOX</div>
            <div className="text-[9px] font-bold text-[var(--c-paper)]/70">
              PICK YOUR LEADER (Rare or below) — this is permanent, but you can build more decks
              later.
            </div>
          </div>
          <PopButton color="yellow" onClick={onClose} disabled={busy} ariaLabel="Close Deck Box">
            ✕
          </PopButton>
        </div>

        <div className="p-4">
          {error && (
            <div
              role="alert"
              className="mb-3 bg-[var(--c-red)] text-[var(--c-paper)] font-bold text-[11px] px-3 py-2 ink-border-sm"
            >
              {error}
            </div>
          )}
          {deckBoxLeaders.length === 0 ? (
            <div className="text-center font-bold text-[var(--c-steel)] py-10">
              Leaders are still loading — try again in a moment.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {deckBoxLeaders.map((leader) => (
                <button
                  key={leader.id}
                  disabled={busy || pickStarted}
                  onClick={() => {
                    setPickStarted(true);
                    onPick(leader.id);
                  }}
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
                    {(LEADER_COLORS[leader.id] ?? []).length > 0 && (
                      <div
                        className="flex items-center gap-1 mt-0.5"
                        title={`Essence identity: ${(LEADER_COLORS[leader.id] ?? []).join(' / ')}`}
                      >
                        {(LEADER_COLORS[leader.id] ?? []).map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center gap-0.5 text-[8px] font-black text-[var(--c-steel)]"
                          >
                            <span
                              className="w-3 h-3 rounded-full inline-flex items-center justify-center border border-[var(--c-ink)]"
                              style={{ backgroundColor: COLOR_PIP[c].bg }}
                            >
                              <EssenceIcon type={c} color={COLOR_PIP[c].fg} size={8} />
                            </span>
                            {c.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    )}
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
              BUILDING YOUR DECK…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
