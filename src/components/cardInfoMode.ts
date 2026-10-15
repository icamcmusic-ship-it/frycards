import React from 'react';

/**
 * How the info pull-tab faces (Mythic, Full-Art) open. 'auto' = each
 * template's default (Mythic expanded, Full-Art tucked); 'open' = every face
 * expanded with all its text (the table, the Deck Builder and the sell
 * picker, where cost and rules are the point, and the layout audit);
 * 'tucked' = every tab face tucked.
 *
 * Lives in its own tiny module so the App root can provide the player's
 * Settings choice without pulling the card face into the eager bundle.
 */
export type CardInfoModeValue = 'auto' | 'open' | 'tucked';
export const CardInfoMode = React.createContext<CardInfoModeValue>('auto');

/** Settings → CARD TEXT (audit 3.6): 'auto' (template default) or 'open'. */
export const CARD_TEXT_KEY = 'frycards:card-text';
export type CardTextPref = 'auto' | 'open';

const subs = new Set<() => void>();
export function loadCardTextPref(): CardTextPref {
  try {
    return window.localStorage.getItem(CARD_TEXT_KEY) === 'open' ? 'open' : 'auto';
  } catch {
    return 'auto';
  }
}
export function saveCardTextPref(v: CardTextPref): void {
  try {
    window.localStorage.setItem(CARD_TEXT_KEY, v);
  } catch {
    /* private mode: the choice lasts this session via the subscribers */
  }
  current = v;
  subs.forEach((f) => f());
}
let current: CardTextPref | null = null;
export function useCardTextPref(): CardTextPref {
  return React.useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => (current ??= loadCardTextPref()),
    () => 'auto',
  );
}

/** Audit 2.6: the one-time "tap to show / hold to hide" hint on a tucked
 * face, retired for good on the player's first toggle. */
export const TUCK_HINT_KEY = 'frycards:tuck-hint-seen';
let hintSeen: boolean | null = null;
export function tuckHintSeen(): boolean {
  if (hintSeen == null) {
    try {
      hintSeen = window.localStorage.getItem(TUCK_HINT_KEY) === '1';
    } catch {
      hintSeen = false;
    }
  }
  return hintSeen;
}
export function markTuckHintSeen(): void {
  if (hintSeen) return;
  hintSeen = true;
  try {
    window.localStorage.setItem(TUCK_HINT_KEY, '1');
  } catch {
    /* ignore */
  }
}
