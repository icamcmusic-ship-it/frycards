/**
 * Constructed formats beyond length (AUDIT §4 R6, §6 Q6). A format sits
 * alongside the mode: the mode is the match length, the format adds deck
 * restrictions on the POWER cards (the Leader and the Location are exempt).
 *
 * - SINGLETON: one copy of each card.
 * - PAUPER: Common and Uncommon only.
 * - MONOCHROME: one of the Leader's colours (plus colourless).
 * - LOW STAKES: no tier 4–5 (no second costs).
 *
 * Pure: the deck builder shows badges, the play screen filters by it and
 * `buildDeck` fills random/bot decks inside it.
 */
import type { CardDef } from './cards';
import { POOL_BY_ID } from './cardpool';
import { cardColors, type Color } from './colors';

export type FormatId = 'open' | 'singleton' | 'pauper' | 'mono' | 'lowstakes';
export const FORMAT_IDS: FormatId[] = ['open', 'singleton', 'pauper', 'mono', 'lowstakes'];

export const FORMATS: Record<FormatId, { label: string; badge: string; blurb: string }> = {
  open: { label: 'Open', badge: 'OPEN', blurb: 'The normal deck rules.' },
  singleton: { label: 'Singleton', badge: 'SINGLETON', blurb: 'One copy of each power card.' },
  pauper: { label: 'Pauper', badge: 'PAUPER', blurb: 'Common and Uncommon power cards only.' },
  mono: {
    label: 'Monochrome',
    badge: 'MONO',
    blurb: "Only one of the Leader's two colours, plus colourless.",
  },
  lowstakes: { label: 'Low Stakes', badge: 'LOW STAKES', blurb: 'No tier 4–5 power cards.' },
};

const isPauper = (d: CardDef) => !d.rarity || d.rarity === 'Common' || d.rarity === 'Uncommon';

/** Card predicate for a format (`mono` needs the chosen colour). */
export function formatCardOk(format: FormatId, d: CardDef, monoColor?: Color): boolean {
  switch (format) {
    case 'pauper':
      return isPauper(d);
    case 'lowstakes':
      return (d.tier ?? 1) <= 3;
    case 'mono': {
      const c = cardColors(d);
      return c.length === 0 || (monoColor !== undefined && c.every((x) => x === monoColor));
    }
    default:
      return true;
  }
}

/** The formats (besides OPEN) a deck already meets. */
export function formatTags(leaderId: string, cardIds: string[]): FormatId[] {
  const leader = POOL_BY_ID[leaderId];
  const powers = cardIds.map((id) => POOL_BY_ID[id]).filter((d) => d && d.type !== 'Location');
  if (!leader || powers.length === 0) return [];
  const out: FormatId[] = [];
  if (new Set(powers.map((d) => d.id)).size === powers.length) out.push('singleton');
  if (powers.every(isPauper)) out.push('pauper');
  if (cardColors(leader).some((c) => powers.every((d) => formatCardOk('mono', d, c))))
    out.push('mono');
  if (powers.every((d) => formatCardOk('lowstakes', d))) out.push('lowstakes');
  return out;
}

export function meetsFormat(format: FormatId, leaderId: string, cardIds: string[]): boolean {
  return format === 'open' || formatTags(leaderId, cardIds).includes(format);
}
