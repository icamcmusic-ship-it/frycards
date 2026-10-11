/**
 * Card of the Day: PLAY WITH IT (audit Q5). A table built around the day's
 * card: a Leader whose colours allow it (the card itself when it is a
 * Leader), a deck filled by `buildDeck` with the card forced in (2 copies, 1
 * at tier 5; a Location becomes the deck's Location). Unrewarded practice, so
 * it works for guests and never claims a deck the player does not own.
 *
 * Imported on click from the main menu, so the deck builder code stays out
 * of the eager bundle.
 */
import type { CardDef } from '../game/poker/cards';
import { buildDeck, deckCardIds } from '../game/poker/deck';
import { cardColors, isColorLegal } from '../game/poker/colors';
import { POOL_LEADERS } from '../game/poker/cardpool';
import { MODES } from '../game/poker/constants';
import { fnv } from '../game/poker/mutators';
import { rngOn } from '../game/poker/rng';
import type { DeckRow } from '../lib/supabase';
import type { PlaySetup } from '../components/PokerMatch';
import { loadCpuDifficulty } from './matchPrefs';
import { utcDayKey } from './cardOfTheDay';

export function playWithCardSetup(card: CardDef, day = utcDayKey()): PlaySetup | null {
  const rng = rngOn({ rng: fnv(`fry-cotd-play:${day}:${card.id}`) | 1 });
  const leaders =
    card.type === 'Leader' ? [card] : POOL_LEADERS.filter((l) => isColorLegal(card, cardColors(l)));
  if (!leaders.length) return null;
  const leader = leaders[rng.int(leaders.length)];
  const mode = MODES.standard;
  const deck = buildDeck(leader, mode, rng, `${card.name} of the Day`);
  if (card.type === 'Location') {
    deck.location = card;
  } else if (card.type !== 'Leader') {
    const copies = Math.min(mode.maxCopies, card.tier === 5 ? 1 : 2);
    let powers = deck.powers.filter((p) => p.id !== card.id);
    // A tier-5 card counts against the deck's tier-5 cap: drop another one.
    if (card.tier === 5) {
      const other = powers.findIndex((p) => p.tier === 5);
      if (other >= 0 && powers.filter((p) => p.tier === 5).length >= mode.maxTier5)
        powers.splice(other, 1);
    }
    powers = powers.slice(0, mode.powers - copies);
    for (let i = 0; i < copies; i++) powers.push(card);
    deck.powers = powers;
  }
  return {
    mode: mode.id,
    seats: 6,
    difficulty: loadCpuDifficulty(),
    unrewarded: true,
    tag: `Card of the Day ${day}`,
    kind: 'custom',
    deck: {
      id: `cotd:${day}`,
      name: `${leader.name} · ${card.name}`,
      leader_id: leader.id,
      card_ids: deckCardIds(deck),
    } as DeckRow,
  };
}
