/**
 * v29 suite — the resignation, the attack readout, and the verb table that
 * stopped being maintained by hand.
 *
 * 1. **`humanizeLog`'s verb table, derived from the engine instead of
 *    remembered.** The v18 suite lists every `${pid} <verb>` line the engine
 *    writes and says, in a comment, "update BOTH when a new one is added".
 *    v29 added one (`${pid} concedes.`) and the whole 454-test suite passed
 *    while the defeat screen printed **"You concedes."** — and the same scan
 *    that caught it found `recovers` had been missing since v22, so the Dawn
 *    beat has been reading **"You recovers 2 Vitality at Dawn."** aloud for
 *    seven passes. The list is now read out of `engine.ts` at test time and
 *    checked against the exported table, so the next engine line fails the
 *    build rather than the grammar.
 *
 * 2. **Conceding is an engine outcome.** It used to fire the UI's own
 *    `onResult(false)` and unmount the match in the same tick, which left the
 *    reward round-trip writing into a dead component — the one ending most
 *    likely to be pressed on a bad connection was the one ending that could
 *    never show "couldn't record this match's result". `concedeGame` makes it
 *    an ordinary win/loss the existing result path already handles.
 *
 * 3. **`declareAttackLabel`.** v28 pulled the other two clash primaries out
 *    into pure functions and pinned them, on the argument that an off-by-one
 *    in one of these reads perfectly and is wrong on the exact swing that ends
 *    the game. This is the third, plus the number it never printed: how many
 *    of the opponent's units can legally guard what you just selected.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  SEAT_VERBS,
  SEAT_VERBS_INVARIANT,
  declareAttackLabel,
  humanizeLog,
  phaseAdvanceLabel,
} from '../../components/GameV4';
import { CardDef } from './cards';
import {
  DeckDef,
  GameState,
  UnitInst,
  canGuardAttacker,
  concedeGame,
  createGame,
  makeCardInst,
  mulberry32,
} from './engine';

const CPU = 'Mer-King — Randomized Build';

// ---------------------------------------------------------------------------
// 1. The verb table, derived
// ---------------------------------------------------------------------------
/**
 * Every word the engine writes immediately after a seat id.
 *
 * Matches the three ways the engine names a seat in a log template — `pid`,
 * `p.id` and `state.active` — and takes the bare word that follows. A
 * possessive (`${p.id}'s Regenerate heals…`) is deliberately NOT matched: the
 * humanizer rewrites `P1's` to `your` before the verb rule ever runs, and the
 * verb in those lines belongs to the noun, not to the seat.
 */
function seatVerbsInEngine(): string[] {
  const src = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8');
  const re = /\$\{(?:pid|p\.id|state\.active)\}\s+([a-z][a-z-]*)/g;
  const found = new Set<string>();
  for (const m of src.matchAll(re)) found.add(m[1]);
  return [...found].sort();
}

describe('humanizeLog verb table', () => {
  test('the engine writes no seat-prefixed verb the humanizer has not been taught', () => {
    const known = new Set<string>([...SEAT_VERBS, ...SEAT_VERBS_INVARIANT]);
    const missing = seatVerbsInEngine().filter((v) => !known.has(v));
    expect(
      missing,
      `engine.ts writes "\${pid} ${missing.join('/')}" and GameV4's SEAT_VERBS does not list ` +
        `it — the line will print in the third person against a second-person subject ` +
        `("You concedes.").`,
    ).toEqual([]);
  });

  test('the scan actually finds the verbs (a regex that matches nothing passes everything)', () => {
    // The guard above is only as good as its scan: a template-literal syntax
    // change that made the regex miss would turn the whole test green forever.
    const found = seatVerbsInEngine();
    expect(found).toContain('invokes');
    expect(found).toContain('concedes');
    expect(found.length).toBeGreaterThanOrEqual(8);
  });

  test('every listed verb renders in the second person for P1', () => {
    for (const v of SEAT_VERBS) {
      const out = humanizeLog(`P1 ${v} something.`, CPU);
      expect(out, `${v} -> ${out}`).not.toMatch(/\bP1\b/);
      expect(out, `${v} -> ${out}`).toBe(
        `You ${v.slice(0, -1)} something.`.replace(/^./, (c) => c.toUpperCase()),
      );
    }
    for (const v of SEAT_VERBS_INVARIANT) {
      expect(humanizeLog(`P1 ${v} something.`, CPU)).toBe(`You ${v} something.`);
    }
  });

  test('the two lines the scan caught', () => {
    expect(humanizeLog('P1 concedes.', CPU)).toBe('You concede.');
    expect(humanizeLog('P1 recovers 2 Vitality at Dawn.', CPU)).toBe(
      'You recover 2 Vitality at Dawn.',
    );
    // The opponent's copies stay third person.
    expect(humanizeLog('P2 concedes.', CPU)).toBe(`${CPU} concedes.`);
    expect(humanizeLog('P2 recovers 2 Vitality at Dawn.', CPU)).toBe(
      `${CPU} recovers 2 Vitality at Dawn.`,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Conceding
// ---------------------------------------------------------------------------
const LEADER: CardDef = {
  id: 'v29_leader',
  name: 'V29 Leader',
  type: 'Leader',
  cost: { generic: 1, pips: {} },
  resolve: 3,
};
const U = (id: string, over: Partial<CardDef> = {}): CardDef => ({
  id,
  name: id,
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might: 2,
  grit: 4,
  ...over,
});
const FILLER = U('v29_filler');
const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER, [FILLER.id]: FILLER };
function game(): GameState {
  const dd: DeckDef = { leaderId: LEADER.id, cards: Array(30).fill(FILLER.id) };
  return createGame(dd, dd, POOL, { rng: mulberry32(29), shuffle: false, handSize: 0 });
}

describe('concedeGame', () => {
  test('hands the match to the opponent and says so in the log', () => {
    const g = game();
    expect(concedeGame(g, 'P1')).toBe(true);
    expect(g.winner).toBe('P2');
    expect(g.log[g.log.length - 1]).toBe('P1 concedes.');
  });

  test('either seat can resign', () => {
    const g = game();
    concedeGame(g, 'P2');
    expect(g.winner).toBe('P1');
  });

  test('a decided match cannot be re-decided', () => {
    // The concede control is still on screen behind the game-over dialog on
    // some paths; pressing it must not hand the match to the loser.
    const g = game();
    concedeGame(g, 'P1');
    expect(concedeGame(g, 'P2')).toBe(false);
    expect(g.winner).toBe('P2');
    expect(g.log.filter((l) => l.includes('concedes')).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. DECLARE ATTACK
// ---------------------------------------------------------------------------
describe('declareAttackLabel', () => {
  test('prints the count and the Might', () => {
    expect(declareAttackLabel(3, 11, 20, 2)).toBe('⚔ DECLARE ATTACK — 3 · 11 MIGHT · 2 CAN GUARD');
  });

  test('LETHAL fires AT the Vitality total, not one point past it', () => {
    expect(declareAttackLabel(1, 9, 10, 1)).not.toContain('LETHAL');
    expect(declareAttackLabel(1, 10, 10, 1)).toContain('LETHAL IF UNGUARDED');
    expect(declareAttackLabel(1, 11, 10, 1)).toContain('LETHAL IF UNGUARDED');
  });

  test('a foe already at 0 gets no kill promise', () => {
    expect(declareAttackLabel(1, 4, 0, 1)).toBe('⚔ DECLARE ATTACK — 1 · 4 MIGHT · 1 CAN GUARD');
  });

  test('nothing can guard: the hedge is replaced, not stacked', () => {
    // "LETHAL IF UNGUARDED · 0 CAN GUARD" makes a player read two clauses to
    // reach one fact.
    expect(declareAttackLabel(2, 12, 10, 0)).toBe(
      '⚔ DECLARE ATTACK — 2 · 12 MIGHT · LETHAL — UNGUARDABLE',
    );
    expect(declareAttackLabel(2, 4, 10, 0)).toBe('⚔ DECLARE ATTACK — 2 · 4 MIGHT · UNGUARDABLE');
  });
});

describe('canGuardAttacker — the rule the label counts through', () => {
  const unit = (name: string, over: Partial<CardDef> = {}): CardDef =>
    U(`v29_${name.toLowerCase()}`, { name, ...over });
  const put = (g: GameState, pid: 'P1' | 'P2', def: CardDef): UnitInst => {
    const inst: UnitInst = {
      ...makeCardInst(def),
      owner: pid,
      damage: 0,
      exhausted: false,
      enteredThisTurn: false,
      permMight: 0,
      permGrit: 0,
      items: [],
    };
    g.players[pid].field.push(inst);
    return inst;
  };

  test('an exhausted body cannot guard', () => {
    const g = game();
    const atk = put(g, 'P1', unit('Attacker'));
    const grd = put(g, 'P2', unit('Blocker'));
    expect(canGuardAttacker(g, atk, grd)).toBe(true);
    grd.exhausted = true;
    expect(canGuardAttacker(g, atk, grd)).toBe(false);
  });

  test('Aerial needs Aerial or Skywatch — the case a naive count gets wrong', () => {
    const g = game();
    const atk = put(g, 'P1', unit('Flier', { keywords: ['Aerial'] }));
    const ground = put(g, 'P2', unit('Ground'));
    const sky = put(g, 'P2', unit('Watcher', { keywords: ['Skywatch'] }));
    expect(canGuardAttacker(g, atk, ground)).toBe(false);
    expect(canGuardAttacker(g, atk, sky)).toBe(true);
  });

  test('Nimble is caught only by a strictly smaller body', () => {
    const g = game();
    const atk = put(g, 'P1', unit('Quick', { might: 3, keywords: ['Nimble'] }));
    const equal = put(g, 'P2', unit('Equal', { might: 3 }));
    const smaller = put(g, 'P2', unit('Smaller', { might: 2 }));
    expect(canGuardAttacker(g, atk, equal)).toBe(false);
    expect(canGuardAttacker(g, atk, smaller)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. The phase button
// ---------------------------------------------------------------------------
describe('phaseAdvanceLabel', () => {
  const none = { playable: 0, shed: 0, wellspringWasted: false };

  test('the plain labels', () => {
    expect(phaseAdvanceLabel('Main1', none)).toBe('TO CLASH \u25b8');
    expect(phaseAdvanceLabel('Clash', none)).toBe('SKIP TO MAIN II \u25b8');
    expect(phaseAdvanceLabel('Main2', none)).toBe('END TURN \u25b8');
    expect(phaseAdvanceLabel('Dawn', none)).toBe('NEXT \u25b8');
    expect(phaseAdvanceLabel('Dusk', none)).toBe('NEXT \u25b8');
  });

  test('both warnings, and both at once', () => {
    expect(phaseAdvanceLabel('Main2', { ...none, playable: 2 })).toBe(
      'END TURN \u25b8 \u00b7 2 PLAYABLE',
    );
    expect(phaseAdvanceLabel('Main2', { ...none, wellspringWasted: true })).toBe(
      'END TURN \u25b8 \u00b7 WELLSPRING UNPLAYED',
    );
    expect(phaseAdvanceLabel('Main2', { playable: 2, shed: 0, wellspringWasted: true })).toBe(
      'END TURN \u25b8 \u00b7 2 PLAYABLE \u00b7 WELLSPRING UNPLAYED',
    );
  });

  test('the shed count replaces the playable count but not the Wellspring warning', () => {
    // Shedding is what happens next either way; the Wellspring is the thing
    // pressing this button makes permanent, so it survives.
    expect(phaseAdvanceLabel('Main2', { playable: 3, shed: 2, wellspringWasted: false })).toBe(
      'END TURN (shed 2) \u25b8',
    );
    expect(phaseAdvanceLabel('Main2', { playable: 3, shed: 2, wellspringWasted: true })).toBe(
      'END TURN (shed 2) \u25b8 \u00b7 WELLSPRING UNPLAYED',
    );
  });

  test('Main I warns about castable cards but Clash never carries a warning', () => {
    // Moving to the Clash does not spend or waste anything — the player comes
    // back to Main II with the same hand and the same allowance.
    expect(phaseAdvanceLabel('Main1', { playable: 2, shed: 0, wellspringWasted: true })).toBe(
      'TO CLASH \u25b8 \u00b7 2 PLAYABLE \u00b7 WELLSPRING UNPLAYED',
    );
    expect(phaseAdvanceLabel('Clash', { playable: 9, shed: 4, wellspringWasted: true })).toBe(
      'SKIP TO MAIN II \u25b8',
    );
  });
});
