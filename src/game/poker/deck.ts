/**
 * Deck rules for FryCards Poker (Design Spec v0.1, "Table format").
 *
 * A deck is 1 Leader + 1 Location + N power cards (Units, Items, Events).
 * The mode sets N, the copy limit and how many tier-5 cards are allowed. The
 * Leader's two colours decide which colours the deck may contain; colourless
 * cards fit any deck. Old 60-card decks and their share links are invalid in
 * every mode (the collection itself is untouched).
 */
import type { CardDef } from './cards';
import { isPower } from './cards';
import { POOL_BY_ID, POOL_LEADERS, poolByType } from './cardpool';
import { cardColors, isColorLegal, type Color } from './colors';
import { MODES, MODE_IDS, type ModeConfig, type ModeId } from './constants';
import { shuffle, type Rng } from './rng';

export interface DeckDef {
  name: string;
  leader: CardDef;
  location: CardDef;
  powers: CardDef[];
}

export type DeckIssueKind =
  'leader' | 'location' | 'count' | 'copies' | 'tier5' | 'colour' | 'unknown';

export interface DeckIssue {
  kind: DeckIssueKind;
  message: string;
  /** Card ids the issue is about (for one-click fixes in the editor). */
  cards?: string[];
}

export interface DeckCheck {
  issues: DeckIssue[];
  /** Power cards (Units/Items/Events) in the list. */
  powerCount: number;
  locationCount: number;
  tier5: number;
}

/** Most copies of any one card a mode allows. */
export function maxCopies(mode: ModeId): number {
  return MODES[mode].maxCopies;
}

/** Validate a deck list against one mode. `cardIds` holds the Location and
 * the powers (the Leader travels separately, as `decks.leader_id`). */
export function checkDeck(leaderId: string, cardIds: string[], mode: ModeId): DeckCheck {
  const m = MODES[mode];
  const issues: DeckIssue[] = [];
  const leader = POOL_BY_ID[leaderId];
  if (!leader || leader.type !== 'Leader')
    issues.push({ kind: 'leader', message: 'Pick a Leader.' });
  const identity: Color[] = leader ? cardColors(leader) : [];
  const unknown = cardIds.filter((id) => !POOL_BY_ID[id]);
  if (unknown.length)
    issues.push({
      kind: 'unknown',
      message: `${unknown.length} card(s) aren't in the card pool.`,
      cards: unknown,
    });
  const defs = cardIds.map((id) => POOL_BY_ID[id]).filter(Boolean);
  const locations = defs.filter((d) => d.type === 'Location');
  const powers = defs.filter(isPower);
  const leadersInList = defs.filter((d) => d.type === 'Leader');
  if (leadersInList.length)
    issues.push({
      kind: 'leader',
      message: 'Leaders go in the Leader slot, not the deck list.',
      cards: leadersInList.map((d) => d.id),
    });
  if (locations.length !== 1)
    issues.push({
      kind: 'location',
      message:
        locations.length === 0
          ? 'Add exactly one Location.'
          : `A deck holds exactly one Location (this one has ${locations.length}).`,
      cards: locations.map((d) => d.id),
    });
  if (powers.length !== m.powers)
    issues.push({
      kind: 'count',
      message: `${m.label} decks hold exactly ${m.powers} power cards (this one has ${powers.length}).`,
    });
  const counts = new Map<string, number>();
  for (const d of defs) counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
  const over = [...counts.entries()].filter(([, n]) => n > m.maxCopies).map(([id]) => id);
  if (over.length)
    issues.push({
      kind: 'copies',
      message: `At most ${m.maxCopies} copies of a card in ${m.label} (${over.map((id) => POOL_BY_ID[id]?.name ?? id).join(', ')}).`,
      cards: over,
    });
  const tier5 = powers.filter((d) => d.tier === 5).length;
  if (tier5 > m.maxTier5)
    issues.push({
      kind: 'tier5',
      message: `At most ${m.maxTier5} tier-5 card(s) in ${m.label} (this one has ${tier5}).`,
      cards: powers.filter((d) => d.tier === 5).map((d) => d.id),
    });
  if (leader) {
    const off = defs.filter((d) => !isColorLegal(d, identity));
    if (off.length)
      issues.push({
        kind: 'colour',
        message: `${off.length} card(s) are outside ${leader.name}'s colours (${identity.join(' / ')}).`,
        cards: [...new Set(off.map((d) => d.id))],
      });
  }
  return { issues, powerCount: powers.length, locationCount: locations.length, tier5 };
}

/** Every mode this deck is legal in. */
export function legalModes(leaderId: string, cardIds: string[]): ModeId[] {
  return MODE_IDS.filter((m) => checkDeck(leaderId, cardIds, m).issues.length === 0);
}

/** The mode a deck list is aimed at, judged by its power count. */
export function deckMode(cardIds: string[]): ModeId {
  const powers = cardIds.filter((id) => {
    const d = POOL_BY_ID[id];
    return d && isPower(d);
  }).length;
  let best: ModeId = 'standard';
  let gap = Infinity;
  for (const m of MODE_IDS) {
    const g = Math.abs(MODES[m].powers - powers);
    if (g < gap || (g === gap && m === 'standard')) {
      best = m;
      gap = g;
    }
  }
  return best;
}

export function deckDefFromCustom(leaderId: string, cardIds: string[], name: string): DeckDef {
  const leader = POOL_BY_ID[leaderId];
  if (!leader) throw new Error(`Unknown Leader ${leaderId}`);
  const defs = cardIds.map((id) => POOL_BY_ID[id]).filter(Boolean);
  const location = defs.find((d) => d.type === 'Location') ?? defaultLocation(cardColors(leader));
  return { name, leader, location, powers: defs.filter(isPower) };
}

function defaultLocation(identity: Color[]): CardDef {
  const locs = poolByType('Location').filter((d) => isColorLegal(d, identity));
  return locs[0] ?? poolByType('Location')[0];
}

/**
 * Build a legal deck for a Leader from the whole pool — the random quick
 * match and every CPU seat use this. Tier mix follows the card pyramid, with
 * a light preference for the Leader's own colours over colourless cards.
 */
/** Effects that only pay off in a narrow spot (an all-in before the river, a
 * cast to answer, a Feint to call); a CPU deck carries at most one. */
const SITUATIONAL = new Set<string>(['Rerun', 'Snuff', 'Call Out']);
/** Effects that rebuild a losing hand (the spec's revive target). */
const REVIVES = new Set<string>(['Redraw', 'Windfall', 'Wild', 'Bloom', 'Exhume']);

export function buildDeck(leader: CardDef, mode: ModeConfig, rng: Rng, name?: string): DeckDef {
  const identity = cardColors(leader);
  const legal = (d: CardDef) => isColorLegal(d, identity);
  const locs = shuffle(poolByType('Location').filter(legal), rng);
  const location = locs[0] ?? defaultLocation(identity);
  const candidates = shuffle(
    [...poolByType('Unit'), ...poolByType('Item'), ...poolByType('Event')].filter(legal),
    rng,
  );
  // On-colour cards first, colourless after.
  candidates.sort((a, b) => (b.colors.length ? 1 : 0) - (a.colors.length ? 1 : 0));
  const powers: CardDef[] = [];
  const counts = new Map<string, number>();
  let tier5 = 0;
  const want: Record<string, number> = {
    Unit: Math.round(mode.powers * 0.45),
    Item: Math.round(mode.powers * 0.25),
    Event: mode.powers,
  };
  const typeCount: Record<string, number> = { Unit: 0, Item: 0, Event: 0 };
  // A playable curve: mostly cheap casts, a few expensive ones. A random
  // fill can hand one Leader a deck of tier-4 cards it can rarely afford,
  // which is a deck-spread gap that has nothing to do with the Leader.
  const tierCap: Record<number, number> = {
    3: Math.floor(mode.powers * 0.3),
    4: Math.max(1, Math.floor(mode.powers * 0.125)),
  };
  const tierCount: Record<number, number> = {};
  let situational = 0;
  let revives = 0;
  // Every deck gets its share of revives (Redraw is open to every colour).
  // Without this, how many a random fill happened to draw decided most of
  // the gap between the best and worst CPU deck.
  const reviveTarget = Math.round(mode.powers * 0.15);
  const isRevive = (d: CardDef) => !!d.effect && REVIVES.has(d.effect.kw);
  const add = (d: CardDef) => {
    const tier = d.tier ?? 1;
    powers.push(d);
    counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
    typeCount[d.type]++;
    tierCount[tier] = (tierCount[tier] ?? 0) + 1;
    if (d.effect && SITUATIONAL.has(d.effect.kw)) situational++;
    if (isRevive(d)) revives++;
    if (tier === 5) tier5++;
  };
  // Cheapest revives first, one copy each, then a second copy.
  const reviveCards = candidates.filter(isRevive).sort((a, b) => (a.tier ?? 1) - (b.tier ?? 1));
  for (let copy = 1; copy <= mode.maxCopies && revives < reviveTarget; copy++)
    for (const d of reviveCards) {
      if (revives >= reviveTarget) break;
      if ((counts.get(d.id) ?? 0) >= copy) continue;
      const tier = d.tier ?? 1;
      if (tier === 5 && tier5 >= mode.maxTier5) continue;
      if ((tierCount[tier] ?? 0) >= (tierCap[tier] ?? Infinity)) continue;
      add(d);
    }
  for (let pass = 0; pass < 3 && powers.length < mode.powers; pass++) {
    for (const d of candidates) {
      if (powers.length >= mode.powers) break;
      const n = counts.get(d.id) ?? 0;
      if (n >= Math.min(pass + 1, mode.maxCopies)) continue;
      if (d.tier === 5 && tier5 >= mode.maxTier5) continue;
      if (pass === 0 && typeCount[d.type] >= want[d.type]) continue;
      // The curve, the revive share and the one-situational-card rule give
      // way on the last pass so a small colour pool still fills the deck.
      if (pass < 2) {
        const tier = d.tier ?? 1;
        if ((tierCount[tier] ?? 0) >= (tierCap[tier] ?? Infinity)) continue;
        if (d.effect && SITUATIONAL.has(d.effect.kw) && situational >= 1) continue;
        if (isRevive(d) && revives >= reviveTarget) continue;
      }
      add(d);
    }
  }
  return { name: name ?? `${leader.name}'s deck`, leader, location, powers };
}

export function randomLeader(rng: Rng): CardDef {
  return POOL_LEADERS[rng.int(POOL_LEADERS.length)];
}

/** Deck list (Location + powers) as stored in `decks.card_ids`. */
export function deckCardIds(deck: DeckDef): string[] {
  return [deck.location.id, ...deck.powers.map((p) => p.id)];
}
