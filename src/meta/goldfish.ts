/**
 * Deck Builder analysis helpers (finding 2.6).
 *
 * Two gaps the builder had for a 60-card constructed format:
 *
 *  - No draw simulation. The engine is headless and seedable, so a "test hand"
 *    is close to free — and unlike the auto-build's `Math.random()` shuffle, a
 *    seeded one can be quoted, re-rolled deliberately, and put in a bug report.
 *  - No producible-colour check. The sim carries a `keptColorDeadHand` lapse
 *    counter precisely because a hand you cannot cast is a real failure mode,
 *    and nothing in the builder told a player their curve demanded a colour
 *    their deck could not produce on time.
 *
 * Producible colours are the Leader's identity (basic Wellsprings are
 * auto-supplied inside it — see `wellspringChoices`) plus whatever the deck's
 * own Sanctums produce. Everything here is pure and seeded, which is why it
 * gets unit tests rather than a Playwright sweep.
 */
import { CardDef, totalCost } from '../game/v3/cards';
import { mulberry32 } from '../game/v3/engine';
import { LEADER_COLORS, Color, COLORS } from '../game/v3/colors';
import { STARTING_HAND } from '../game/v3/engine';

export { STARTING_HAND };

/** Seeded Fisher-Yates. Same seed, same hand — that is the entire point. */
export function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const rng = mulberry32(seed >>> 0);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface TestHand {
  seed: number;
  cards: CardDef[];
  /** Mean total cost of the hand. The sim's opening-curve series says hands
   * under 2.5 win 52.6% and hands at 3.5+ win 45.9%, so this number has a
   * known meaning rather than being decoration. */
  averageCost: number;
  /** Cards castable on turn 1 (one Wellspring, so total cost <= 1). */
  turnOnePlays: number;
  /** True when the hand holds no Unit at all — the shape `ai.ts`'s own
   * `handIsKeepable` treats as a mulligan. */
  noUnits: boolean;
}

export function drawTestHand(
  cardIds: readonly string[],
  poolById: Record<string, CardDef>,
  seed: number,
  handSize: number = STARTING_HAND,
): TestHand {
  const cards = seededShuffle(cardIds, seed)
    .map((id) => poolById[id])
    .filter((c): c is CardDef => !!c)
    .slice(0, handSize);
  const total = cards.reduce((s, c) => s + totalCost(c.cost), 0);
  return {
    seed,
    cards,
    averageCost: cards.length ? +(total / cards.length).toFixed(2) : 0,
    turnOnePlays: cards.filter((c) => totalCost(c.cost) <= 1).length,
    noUnits: !cards.some((c) => c.type === 'Unit'),
  };
}

export interface ColorCheck {
  /** Colours this deck can actually make essence in. */
  producible: Color[];
  /** Pip demand per colour across every copy in the deck. */
  demand: Partial<Record<Color, number>>;
  /** Colours the deck asks for but cannot produce — always a real problem. */
  unproducible: Color[];
  /** Sanctum count, since that is the lever a player can pull. */
  sanctums: number;
}

export function checkProducibleColors(
  leaderId: string | null,
  cardIds: readonly string[],
  poolById: Record<string, CardDef>,
): ColorCheck {
  const identity: Color[] = leaderId ? (LEADER_COLORS[leaderId] ?? [...COLORS]) : [...COLORS];
  const producible = new Set<Color>(identity);
  let sanctums = 0;
  const demand: Partial<Record<Color, number>> = {};
  for (const id of cardIds) {
    const c = poolById[id];
    if (!c) continue;
    if (c.type === 'Location') {
      sanctums++;
      if (c.produces) producible.add(c.produces as Color);
    }
    for (const [color, n] of Object.entries(c.cost?.pips ?? {})) {
      if (!n) continue;
      demand[color as Color] = (demand[color as Color] ?? 0) + n;
    }
  }
  const unproducible = (Object.keys(demand) as Color[]).filter((c) => !producible.has(c));
  return { producible: [...producible], demand, unproducible, sanctums };
}
