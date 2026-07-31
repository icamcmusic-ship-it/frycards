import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { UpdateKind } from '../lib/appVersion';

const COPY: Record<UpdateKind, { head: string; body: string }> = {
  build: {
    head: 'NEW VERSION AVAILABLE',
    body: 'A newer build of Fry Cards is live. Refresh to get it — your collection and progress are on the server, so nothing is lost.',
  },
  catalog: {
    head: 'CARDS UPDATED',
    body: "The card database changed since you opened the game, so what you're looking at may be out of date. Refresh to load the current cards.",
  },
};

/**
 * The "you're running an old copy" prompt. Deliberately a docked banner rather
 * than a modal: nothing here is urgent enough to interrupt what the player is
 * doing, and a refresh mid-action is worse than a stale card face.
 */
export function UpdateBanner({
  kind,
  onRefresh,
  onDismiss,
}: {
  kind: UpdateKind;
  onRefresh: () => void;
  onDismiss: () => void;
}) {
  const copy = COPY[kind];
  return (
    <div
      role="status"
      aria-live="polite"
      // Above every screen's own sticky header (z-30) but inside the safe
      // area, so it clears a phone's home indicator instead of sitting under it.
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-2xl bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-md shadow-hard-black px-3 py-2.5 flex items-center gap-3">
        <RefreshCw className="w-5 h-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="heading-font text-[12px] leading-tight">{copy.head}</div>
          <p className="text-[11px] font-bold leading-snug mt-0.5">{copy.body}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="btn-pop heading-font text-[11px] px-3 py-1.5 bg-[var(--c-ink)] text-[var(--c-yellow)] ink-border-sm shadow-hard-black-xs shrink-0"
        >
          REFRESH
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss update notice"
          className="shrink-0 p-1 hover:opacity-60"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
