/**
 * Test helpers: build small rigged tables without going through a full deck
 * builder. Test-only (imported by *.test.ts files).
 */
import type { CardDef } from './cards';
import { POOL_BY_ID, poolByType } from './cardpool';
import { MODES, type ModeId } from './constants';
import { buildDeck } from './deck';
import { applyInPlace, createMatch, personaFor, type Action, type Match, type PCard } from './engine';
import type { Card } from './evaluator';
import { rngOn } from './rng';

/** Parse "As Kd 7h" into cards. */
export function cards(s: string): Card[] {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => ({ r: '23456789TJQKA'.indexOf(x[0].toUpperCase()) + 2, s: 'shdc'.indexOf(x[1].toLowerCase()) }));
}

export function pcards(s: string, idBase = 100): PCard[] {
  return cards(s).map((c, i) => ({ ...c, id: idBase + i, knownTo: [] }));
}

/** A table of `seats` CPU decks, no hand started. */
export function table(seats = 3, mode: ModeId = 'standard', seed = 7): Match {
  const rng = rngOn({ rng: seed });
  const leaders = poolByType('Leader');
  return createMatch({
    seed,
    mode,
    seats: Array.from({ length: seats }, (_, i) => {
      const leader = leaders[i % leaders.length];
      return {
        name: `S${i}`,
        human: i === 0,
        deck: buildDeck(leader, MODES[mode], rng),
        persona: personaFor(leader),
      };
    }),
  });
}

/** Force the next hand's Location rule to Plain Table (or another rule). */
export function forceRule(m: Match, id: NonNullable<CardDef['rule']>['id'] = 'plain', param?: number): void {
  const card: CardDef = { id: `__test_${id}`, name: id, type: 'Location', colors: [], rule: { id, param } };
  m.bag.unshift({ card });
}

/** Start a hand with a fixed button, given rule, and rigged hole cards /
 * upcoming deck (board cards are dealt after a burn each street). */
export function rigHand(
  m: Match,
  opts: { holes?: string[]; deck?: string; button?: number; rule?: NonNullable<CardDef['rule']>['id']; param?: number } = {},
): Match {
  forceRule(m, opts.rule ?? 'plain', opts.param);
  if (opts.button !== undefined) {
    // startHand moves the button one seat on from the last hand.
    m.button = m.handNo === 0 ? opts.button : (opts.button - 1 + m.seats.length) % m.seats.length;
  }
  applyInPlace(m, { type: 'start' });
  const h = m.hand!;
  if (opts.holes) {
    opts.holes.forEach((s, i) => {
      if (s) h.holes[i] = pcards(s, 200 + i * 10);
    });
  }
  if (opts.deck) {
    // Board order: burn, flop×3, burn, turn, burn, river.
    const want = pcards(opts.deck, 300);
    const used = new Set([...h.holes.flat(), ...want].map((c) => c.r * 4 + c.s));
    const rest = h.deck.filter((c) => !used.has(c.r * 4 + c.s));
    const filler = () => rest.shift()!;
    const ordered: PCard[] = [];
    // want = flop1 flop2 flop3 turn river
    ordered.push(filler(), ...want.slice(0, 3), filler(), want[3], filler(), want[4]);
    h.deck = [...ordered.filter(Boolean), ...rest];
  }
  return m;
}

export function act(m: Match, ...actions: Action[]): Match {
  for (const a of actions) applyInPlace(m, a);
  return m;
}

/** Put a specific power card in a seat's hand; returns its uid. */
export function give(m: Match, seat: number, def: CardDef | string): string {
  const d = typeof def === 'string' ? POOL_BY_ID[def] : def;
  const uid = `t${seat}:${m.seats[seat].hand.length}:${d.id}`;
  m.seats[seat].hand.push({ uid, def: d });
  return uid;
}

/** A synthetic power card for focused tests. */
export function power(
  effect: CardDef['effect'],
  opts: Partial<CardDef> = {},
): CardDef {
  return {
    id: `__p_${effect?.kw}_${opts.tier ?? 1}_${(opts.mods ?? []).map((x) => x.kw).join('')}`,
    name: `Test ${effect?.kw}`,
    type: 'Event',
    subtype: 'Slow',
    colors: [],
    tier: 1,
    effect,
    mods: [],
    ...opts,
  };
}
