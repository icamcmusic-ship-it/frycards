/**
 * Pure helpers behind the deck editor's undo, one-click fixes, tier curve and
 * quickbuild, kept out of the component so they can be unit-tested.
 */
import type { CardDef } from '../game/poker/cards';
import { isPower } from '../game/poker/cards';
import { cardColors, isColorLegal, type Color } from '../game/poker/colors';
import type { ModeConfig } from '../game/poker/constants';
import { shuffle, type Rng } from '../game/poker/rng';
import type { DeckIssue } from './DeckBuilderScreen';

/** Undo steps kept. Even a Deep deck (36 powers + a Location) is well under
 * this many clicks to build, so it covers a whole build session without
 * growing without bound. */
export const UNDO_LIMIT = 100;

/** The history after recording `snapshot` (the list as it was BEFORE an edit). */
export function pushUndo(history: string[][], snapshot: string[]): string[][] {
  const next = [...history, snapshot];
  return next.length > UNDO_LIMIT ? next.slice(next.length - UNDO_LIMIT) : next;
}

/** Copies in `cardIds` whose colours are not a subset of `identity`. Unknown
 * ids are left alone (the legality check reports those separately). */
export function offColourCount(
  cardIds: readonly string[],
  db: ReadonlyMap<string, CardDef>,
  identity: readonly Color[] | undefined,
): number {
  if (!identity) return 0;
  let n = 0;
  for (const id of cardIds) {
    const c = db.get(id);
    if (c && !isColorLegal(c, identity as Color[])) n++;
  }
  return n;
}

/** `cardIds` without the off-colour copies, order preserved. */
export function withoutOffColour(
  cardIds: readonly string[],
  db: ReadonlyMap<string, CardDef>,
  identity: readonly Color[] | undefined,
): string[] {
  if (!identity) return [...cardIds];
  return cardIds.filter((id) => {
    const c = db.get(id);
    return !c || isColorLegal(c, identity as Color[]);
  });
}

/** `cardIds` with every card cut down to `max` copies (the later copies go),
 * order preserved. The fix for a format's copy limit, e.g. after switching a
 * Deep list (3 copies) to Standard (2). */
export function trimCopies(cardIds: readonly string[], max: number): string[] {
  const seen = new Map<string, number>();
  return cardIds.filter((id) => {
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    return n <= max;
  });
}

/** `cardIds` keeping only the first Location (a deck holds exactly one). */
export function keepFirstLocation(
  cardIds: readonly string[],
  db: ReadonlyMap<string, CardDef>,
): string[] {
  let kept = false;
  return cardIds.filter((id) => {
    if (db.get(id)?.type !== 'Location') return true;
    if (kept) return false;
    kept = true;
    return true;
  });
}

/** `cardIds` keeping at most `max` tier-5 copies (the first ones added). */
export function trimTier5(
  cardIds: readonly string[],
  db: ReadonlyMap<string, CardDef>,
  max: number,
): string[] {
  let n = 0;
  return cardIds.filter((id) => {
    const c = db.get(id);
    if (!c || !isPower(c) || c.tier !== 5) return true;
    n++;
    return n <= max;
  });
}

/** `cardIds` with `locationId` in the one Location slot: any Location already
 * there is swapped out in place (so the slot never holds two). */
export function setLocation(
  cardIds: readonly string[],
  db: ReadonlyMap<string, CardDef>,
  locationId: string,
): string[] {
  const rest = cardIds.filter((id) => db.get(id)?.type !== 'Location');
  return [locationId, ...rest];
}

/**
 * The legality banner's one line. Off-colour cards are the common (and
 * one-click fixable) problem, so they get their own headline instead of one
 * sentence per card; everything else is summarised as the first issue plus a
 * count, with the full list one tap away.
 */
export function legalitySummary(
  issues: readonly DeckIssue[],
  offColour: number,
  leaderName: string,
): { headline: string; others: DeckIssue[]; hasDetails: boolean } {
  const others = issues.filter((i) => i.kind !== 'colour');
  if (offColour > 0) {
    return {
      headline: `${offColour} card${offColour === 1 ? '' : 's'} outside ${leaderName}'s colours`,
      others,
      hasDetails: others.length > 0,
    };
  }
  const [first, ...rest] = others;
  return {
    headline: first ? first.text : '',
    others: rest,
    hasDetails: rest.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Tier curve
// ---------------------------------------------------------------------------

/** The five tiers (★ stars / ⚙ gears / ϟ bolts) a power can print at. */
export const TIERS = [1, 2, 3, 4, 5] as const;

/** Power copies per tier, keyed '1'..'5'. Locations, Leaders and unknown ids
 * are not powers and do not count. */
export function tierCurve(
  cardIds: readonly string[],
  db: ReadonlyMap<string, CardDef>,
): Record<string, number> {
  const curve: Record<string, number> = {};
  for (const id of cardIds) {
    const c = db.get(id);
    if (!c || !isPower(c) || !c.tier) continue;
    curve[String(c.tier)] = (curve[String(c.tier)] ?? 0) + 1;
  }
  return curve;
}

/** Pixel height of a tier-curve bar. Absolute rather than a percentage: a
 * percentage height needs a definite-height parent, and the bars used to sit
 * in a column that did not have one, so every bar collapsed to ~4px
 * (audit M4). A tier with any cards always shows at least a visible stub. */
export function curveBarHeight(n: number, max: number, maxPx: number): number {
  if (n <= 0) return 2;
  return Math.min(maxPx, Math.max(4, Math.round((n / Math.max(1, max)) * maxPx)));
}

// ---------------------------------------------------------------------------
// Quickbuild
// ---------------------------------------------------------------------------

/**
 * A legal deck list for `leader` in `mode`, built only from cards the player
 * has free (`available`: copies owned minus copies locked in other decks).
 * Mirrors the CPU's buildDeck (game/poker/deck.ts): on-colour cards before
 * colourless ones, a first pass that aims for ~45% Units and ~25% Items,
 * then fill. The list may come up short when the collection is thin; the
 * legality banner then says by how much.
 */
export function quickbuildIds(
  leader: CardDef,
  mode: ModeConfig,
  pool: readonly CardDef[],
  available: ReadonlyMap<string, number>,
  rng: Rng,
): string[] {
  const identity = cardColors(leader);
  const usable = (c: CardDef) =>
    (available.get(c.id) ?? 0) > 0 && isColorLegal(c, identity) && c.type !== 'Leader';
  const locations = shuffle(
    pool.filter((c) => c.type === 'Location' && usable(c)),
    rng,
  );
  const candidates = shuffle(
    pool.filter((c) => isPower(c) && usable(c)),
    rng,
  );
  candidates.sort((a, b) => (b.colors.length ? 1 : 0) - (a.colors.length ? 1 : 0));
  const want: Record<string, number> = {
    Unit: Math.round(mode.powers * 0.45),
    Item: Math.round(mode.powers * 0.25),
    Event: mode.powers,
  };
  const typeCount: Record<string, number> = { Unit: 0, Item: 0, Event: 0 };
  const counts = new Map<string, number>();
  const powers: string[] = [];
  let tier5 = 0;
  for (let pass = 0; pass < mode.maxCopies + 1 && powers.length < mode.powers; pass++) {
    for (const c of candidates) {
      if (powers.length >= mode.powers) break;
      const n = counts.get(c.id) ?? 0;
      const cap = Math.min(pass + 1, mode.maxCopies, available.get(c.id) ?? 0);
      if (n >= cap) continue;
      if (c.tier === 5 && tier5 >= mode.maxTier5) continue;
      if (pass === 0 && typeCount[c.type] >= want[c.type]) continue;
      powers.push(c.id);
      counts.set(c.id, n + 1);
      typeCount[c.type]++;
      if (c.tier === 5) tier5++;
    }
  }
  return locations.length ? [locations[0].id, ...powers] : powers;
}
