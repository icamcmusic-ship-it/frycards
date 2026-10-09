/**
 * Pure helpers behind the deck editor's undo, colour-fix and cost-curve
 * features, kept out of the component so they can be unit-tested.
 */
import type { CardDef } from '../game/v3/cards';
import { isColorLegal, type Color } from '../game/v3/colors';
import type { DeckIssue } from './DeckBuilderScreen';

/** Undo steps kept. A 60-card deck is ~60 clicks to build; this covers a
 * whole build session without growing without bound. */
export const UNDO_LIMIT = 100;

/** The history after recording `snapshot` (the list as it was BEFORE an edit). */
export function pushUndo(history: string[][], snapshot: string[]): string[][] {
  const next = [...history, snapshot];
  return next.length > UNDO_LIMIT ? next.slice(next.length - UNDO_LIMIT) : next;
}

/** Copies in `cardIds` whose colours are not a subset of `identity`. Unknown
 * ids are left alone (validateDeckList reports those separately). */
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

/** Pixel height of a cost-curve bar. Absolute rather than a percentage: a
 * percentage height needs a definite-height parent, and the bars used to sit
 * in a column that did not have one, so every bar collapsed to ~4px
 * (audit M4). A card at a bucket always shows at least a visible stub. */
export function curveBarHeight(n: number, max: number, maxPx: number): number {
  if (n <= 0) return 2;
  return Math.min(maxPx, Math.max(4, Math.round((n / Math.max(1, max)) * maxPx)));
}
