/**
 * "Rematch last setup" (AUDIT U22 / U66): the last table the player sat at,
 * kept per device. Fixed-seed tables (replays, the Daily Table) are stored
 * without their seed so a rematch rolls a fresh deal, and stay unrewarded
 * only if they were unrewarded for another reason (a pasted deck).
 */
import type { PlaySetup } from '../components/PokerMatch';

const KEY = 'frycards:last-setup';

export function saveLastSetup(s: PlaySetup): void {
  if (s.tutorial) return;
  try {
    // A replay's or daily's seed is not part of "the setup".
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { seed, tag, ...rest } = s;
    const unrewarded = rest.unrewarded && !seed ? true : undefined;
    localStorage.setItem(KEY, JSON.stringify({ ...rest, unrewarded }));
  } catch {
    /* storage off */
  }
}

export function loadLastSetup(): PlaySetup | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PlaySetup;
    if (!s || typeof s.mode !== 'string' || typeof s.seats !== 'number') return null;
    if (s.kind === 'custom' && !s.deck?.leader_id) return null;
    return s;
  } catch {
    return null;
  }
}

/** "Standard · 6 seats · Mer-King deck" */
export function describeSetup(s: PlaySetup): string {
  const mode = s.mode[0].toUpperCase() + s.mode.slice(1);
  const deck = s.kind === 'custom' ? s.deck.name : 'random deck';
  return `${mode} · ${s.seats} seats · ${deck}`;
}
