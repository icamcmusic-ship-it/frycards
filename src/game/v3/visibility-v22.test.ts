/**
 * v22 CPU-visibility suite — the turn boundary.
 *
 * Four passes have each closed a place the CPU acted without saying so: v18
 * the clash reaction window, v19 the guard step, v20 the priority window over
 * the stack. Each one found the silence by asking "which CPU DECISION has no
 * beat?" — and every decision now has one.
 *
 * The gap this pass closes is not a decision. It is the two phases the rules
 * run on the opponent's behalf, Dawn and Dusk, which between them can freeze a
 * unit of the player's (Glaciate), erode their deck toward a deck-out loss
 * (Entropic / Blighted), sweep their whole board (Scorched-Earth), heal the
 * opponent (Sacred / Radiant / Regenerate), grow its units (Thriving /
 * Empowering) and draw it cards (Archivist). None of that wrote a single line
 * to the log, so none of it could be narrated no matter how good the narrator
 * got: `runCpuTurn`'s own comment asserted the opponent's Dawn "writes nothing
 * to the log", which was true and was the bug.
 *
 * What is pinned here:
 *
 *  1. Each keyword's Dawn/Dusk proc writes a line naming what it did, and the
 *     one that reaches across the table (Glaciate) names the unit by card, not
 *     by count — a player has to be able to find it on the board.
 *  2. `state.dawnLog` carries exactly the current turn's Dawn lines. The UI
 *     cannot recover them from `log.length` on its own: Dawn runs inside the
 *     `endPhase` that ends the PREVIOUS player's turn, so by the time the
 *     match screen takes its own `logStart` the lines are already behind it.
 *  3. A Dawn that does nothing reports nothing, so the narration does not open
 *     an empty bubble on a board that is waiting for the player.
 *  4. `buildCpuBeats` rings the units a line NAMES when no structured event
 *     covers it. None of these lines has an event behind it — they come from
 *     the rules, not from a decision the AI made — so without the fallback
 *     every one of them would be a sentence with no ring.
 */
import { describe, expect, test } from 'vitest';
import { buildCpuBeats } from '../../components/GameV4';
import { CardDef } from './cards';
import {
  DeckDef,
  GameState,
  PlayerId,
  createGame,
  endPhase,
  makeCardInst,
  mulberry32,
  summonUnit,
} from './engine';

const LEADER: CardDef = {
  id: 'test_leader',
  name: 'Test Leader',
  type: 'Leader',
  cost: { generic: 1, pips: {} },
  resolve: 3,
};

const U = (id: string, keywords: string[] = []): CardDef => ({
  id,
  name: id,
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might: 2,
  grit: 4,
  keywords,
});

const SANCTUM = (id: string, keywords: string[]): CardDef => ({
  id,
  name: id,
  type: 'Location',
  subtype: 'Sanctum',
  cost: { generic: 1, pips: {} },
  keywords,
});

const FILLER = U('filler');
const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER, [FILLER.id]: FILLER };

/**
 * Both seats hold a real (if boring) library. Dawn ends on a Deal, so a
 * zero-card deck ends the game there and every assertion below would be
 * measuring a deck-out instead of the keyword it names.
 */
function game(): GameState {
  const dd: DeckDef = { leaderId: LEADER.id, cards: Array(30).fill(FILLER.id) };
  return createGame(dd, dd, POOL, { rng: mulberry32(11), shuffle: false, handSize: 0 });
}

/** Put a Sanctum on `pid`'s Location row without paying for it. */
function sanctum(state: GameState, pid: PlayerId, def: CardDef): void {
  state.players[pid].locations.push({
    iid: `${def.id}#${state.players[pid].locations.length}`,
    def,
    produces: 'Tide',
    exhausted: false,
  });
}

/**
 * Run the active player's turn out to the opponent's Dawn, the way the match
 * screen does: `endPhase` from Main I all the way through Dusk, at which point
 * `nextTurn` has handed over and run the new active player's Dawn.
 */
function passTurn(state: GameState): void {
  const before = state.active;
  let guard = 12;
  while (state.active === before && !state.winner && guard-- > 0) endPhase(state);
}

describe('the opponent’s Dawn and Dusk say what they did', () => {
  test('Glaciate names the unit it froze, not just a count', () => {
    const state = game();
    // P2's Sanctum freezes one of P1's units at P2's Dawn.
    sanctum(state, 'P2', SANCTUM('rime_shelf', ['Glaciate']));
    const victim = summonUnit(state, 'P1', U('Ghost Tunicate'))!;
    passTurn(state); // P1's turn ends, P2's Dawn runs

    expect(state.active).toBe('P2');
    expect(victim.exhausted).toBe(true);
    const line = state.dawnLog.find((l) => l.includes('Glaciate'));
    expect(line).toBeDefined();
    // The card, by name. "P2's Glaciate freezes 1 unit" is the version that
    // leaves the player hunting the board for a greyed-out card.
    expect(line).toContain('Ghost Tunicate');
  });

  test('the healing, growth and draw a Dawn hands the opponent are all reported', () => {
    const state = game();
    state.players.P2.vitality = 10;
    summonUnit(state, 'P2', U('Sunlit Ray', ['Radiant', 'Thriving']));
    // Three Sanctums: the Archivist gate is `sanctumCount >= 3`.
    sanctum(state, 'P2', SANCTUM('reading_room', ['Archivist']));
    sanctum(state, 'P2', SANCTUM('quiet_shelf', []));
    sanctum(state, 'P2', SANCTUM('still_pool', ['Sacred']));
    passTurn(state);

    const dawn = state.dawnLog.join('\n');
    expect(dawn).toContain('Thriving');
    expect(dawn).toContain('Vitality'); // Radiant + Sacred, one aggregated line
    expect(dawn).toContain('Archivist');
  });

  test('a Dawn with nothing to report writes nothing', () => {
    const state = game();
    summonUnit(state, 'P2', U('Plain Body'));
    passTurn(state);
    expect(state.dawnLog).toEqual([]);
  });

  test('dawnLog holds THIS turn’s Dawn only — it does not accumulate', () => {
    const state = game();
    sanctum(state, 'P2', SANCTUM('rime_shelf', ['Glaciate']));
    summonUnit(state, 'P1', U('Ghost Tunicate'));
    passTurn(state); // P2's Dawn — Glaciate fires
    expect(state.dawnLog.some((l) => l.includes('Glaciate'))).toBe(true);
    passTurn(state); // P1's Dawn — nothing of P1's procs
    expect(state.dawnLog).toEqual([]);
  });

  test('the Dusk sweeps that cross the table are reported', () => {
    const state = game();
    // P1 is active on turn 1; give P1 the Dusk keywords so they fire on the
    // turn we are about to end.
    summonUnit(state, 'P1', U('Rot Herald', ['Entropic']));
    sanctum(state, 'P1', SANCTUM('ash_field', ['Scorched-Earth']));
    sanctum(state, 'P1', SANCTUM('slag_pit', ['Blighted']));
    sanctum(state, 'P1', SANCTUM('cinder_row', []));
    const target = summonUnit(state, 'P2', U('Kelp Walker'))!;
    const deckBefore = state.players.P2.deck.length;
    passTurn(state);

    const log = state.log.join('\n');
    expect(log).toContain('Entropic');
    expect(log).toContain('Blighted');
    expect(log).toContain('Scorched-Earth');
    // And they are reports of something that really happened.
    expect(state.players.P2.deck.length).toBeLessThan(deckBefore);
    expect(target.damage).toBeGreaterThan(0);
  });
});

describe('beats built from rules lines still ring the cards they name', () => {
  test('a Dawn line with no event behind it rings the unit it names', () => {
    const state = game();
    const victim = summonUnit(state, 'P1', U('Ghost Tunicate'))!;
    // Exactly the shape `runCpuTurn` builds: the Dawn lines, no events at all.
    const beats = buildCpuBeats(["Kuro's Glaciate freezes Ghost Tunicate."], 0, [], state);
    expect(beats).toHaveLength(1);
    expect(beats[0].targets).toContain(victim.iid);
  });

  test('without the board there are no rings — the fallback is opt-in', () => {
    const state = game();
    summonUnit(state, 'P1', U('Ghost Tunicate'));
    const beats = buildCpuBeats(["Kuro's Glaciate freezes Ghost Tunicate."], 0, []);
    expect(beats[0].targets).toEqual([]);
  });

  test('a structured event still wins over the name scan', () => {
    const state = game();
    const mine = summonUnit(state, 'P1', U('Ghost Tunicate'))!;
    const theirs = summonUnit(state, 'P2', U('Reef Hound'))!;
    const beats = buildCpuBeats(
      ['P2 invokes Reef Hound on Ghost Tunicate.'],
      0,
      [{ kind: 'invoke', iid: theirs.iid, name: 'Reef Hound', defId: 'Reef Hound', logAt: 1 }],
      state,
    );
    // The event's actor/target, not both units scraped out of the sentence.
    expect(beats[0].actors).toEqual([theirs.iid]);
    expect(beats[0].targets).not.toContain(mine.iid);
  });
});

describe('a card instance can be made without a board', () => {
  test('makeCardInst is still the helper these fixtures rely on', () => {
    expect(makeCardInst(U('x')).def.name).toBe('x');
  });
});
