/**
 * Soak + hostile-input fuzzing.
 *
 * edgecases.test.ts pins specific rules interactions with hand-built states.
 * This suite instead tries to BREAK the engine two other ways:
 *
 *  1. Soak: play hundreds of complete AI-vs-AI matches over randomized decks
 *     drawn from the real 292-card catalog, checking a set of hard invariants
 *     after every single turn. A rules bug that only shows up in an unusual
 *     board state has to survive thousands of turns here to stay hidden.
 *  2. Hostile input: throw malformed, adversarial and out-of-turn arguments at
 *     every public engine action and assert they are refused *and* leave the
 *     state byte-for-byte unchanged. The UI is not the only caller — anything
 *     reachable from a console is effectively public API.
 */
import { describe, expect, test } from 'vitest';
import {
  DeckDef,
  GameState,
  PlayerId,
  PlayerState,
  activateLeaderAbility,
  createGame,
  declareAttackers,
  declareGuards,
  endPhase,
  invokeCard,
  invokeLeader,
  mulberry32,
  mulliganHand,
  playWellspring,
  rebondCharm,
  remainingGrit,
  resolveClash,
  tapLocationForEssence,
} from './engine';
import { playTurn, maybeMulliganPlayer } from './ai';
import { buildDeck, randomArchetype } from './decks';
import { POOL_BY_ID } from './cardpool';
import { LEADER_HP, MAX_HAND } from './cards';
import { COLORS } from './colors';

const SEATS: PlayerId[] = ['P1', 'P2'];

/** Everything that must hold at every observable point of every game. */
function checkInvariants(g: GameState, where: string): void {
  const seen = new Map<string, string>();
  const note = (iid: string, zone: string) => {
    const prev = seen.get(iid);
    expect(prev, `${where}: instance ${iid} is in both ${prev} and ${zone}`).toBeUndefined();
    seen.set(iid, zone);
  };

  for (const pid of SEATS) {
    const p: PlayerState = g.players[pid];

    expect(Number.isFinite(p.vitality), `${where}: ${pid} vitality is not finite`).toBe(true);
    expect(p.vitality, `${where}: ${pid} vitality above the starting cap`).toBeLessThanOrEqual(
      LEADER_HP,
    );
    // A lethal hit can drive vitality below zero before the win is recorded;
    // it must never run away into a bottomless number.
    expect(p.vitality, `${where}: ${pid} vitality runaway`).toBeGreaterThan(-1000);

    expect(p.leader.resolve, `${where}: ${pid} resolve is not finite`).toEqual(
      Math.trunc(p.leader.resolve),
    );
    if (p.leader.shattered) {
      expect(p.leader.invoked, `${where}: ${pid} shattered Leader is still invoked`).toBe(false);
    }

    for (const key of Object.keys(p.essence)) {
      const n = p.essence[key as (typeof COLORS)[number]] ?? 0;
      expect(n, `${where}: ${pid} has negative ${key} essence`).toBeGreaterThanOrEqual(0);
      expect(n, `${where}: ${pid} essence pool runaway`).toBeLessThan(500);
    }

    for (const u of p.field) {
      note(u.iid, `${pid}.field`);
      expect(u.owner, `${where}: unit ${u.def.name} sits in the wrong field`).toBe(pid);
      expect(u.damage, `${where}: negative damage on ${u.def.name}`).toBeGreaterThanOrEqual(0);
      // stateBasedChecks runs after every action; nothing dead may be left
      // standing once control returns to a caller.
      expect(
        remainingGrit(g, u),
        `${where}: dead unit ${u.def.name} still on the field`,
      ).toBeGreaterThan(0);
      for (const c of u.charms) note(c.iid, `${pid}.charms(${u.def.name})`);
    }
    for (const c of p.hand) note(c.iid, `${pid}.hand`);
    for (const c of p.deck) note(c.iid, `${pid}.deck`);
    for (const c of p.ashPile) note(c.iid, `${pid}.ash`);
    for (const c of p.voidPile) note(c.iid, `${pid}.void`);
    for (const c of p.wornCharms) note(c.iid, `${pid}.wornCharms`);
    for (const l of p.locations) note(l.iid, `${pid}.locations`);

    expect(p.hand.length, `${where}: ${pid} hand is negative`).toBeGreaterThanOrEqual(0);
  }

  if (g.clash) {
    for (const [attacker, guards] of Object.entries(g.clash.guards)) {
      expect(
        g.clash.attackers.includes(attacker),
        `${where}: guard map references a non-attacker`,
      ).toBe(true);
      expect(new Set(guards).size, `${where}: duplicate guard on one attacker`).toBe(guards.length);
    }
  }

  if (g.winner) {
    expect(SEATS.includes(g.winner), `${where}: winner is not a seat`).toBe(true);
  }
}

describe('soak — full AI matches over randomized real-catalog decks', () => {
  test('200 seeded matches finish cleanly with every invariant intact', () => {
    const TURN_CAP = 400;
    let decided = 0;

    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = mulberry32(seed * 7919);
      const a: DeckDef = buildDeck(randomArchetype(rng));
      const b: DeckDef = buildDeck(randomArchetype(rng));
      const g = createGame(a, b, POOL_BY_ID, {
        rng: mulberry32(seed * 104729),
        firstPlayer: seed % 2 === 0 ? 'P1' : 'P2',
      });

      for (const pid of SEATS) maybeMulliganPlayer(g, pid, rng);
      checkInvariants(g, `seed ${seed} setup`);

      let turns = 0;
      while (!g.winner && turns < TURN_CAP) {
        playTurn(g, g.active);
        turns += 1;
        checkInvariants(g, `seed ${seed} turn ${turns}`);
      }

      // A match that never resolves is itself the bug — the CPU is capable of
      // passing every phase, so an unbounded game means a stuck phase machine.
      expect(turns, `seed ${seed} never terminated`).toBeLessThan(TURN_CAP);
      expect(g.winner, `seed ${seed} ended with no winner`).not.toBeNull();
      decided += 1;
    }

    expect(decided).toBe(200);
  }, 120_000);

  test('hands never exceed the cap once a turn has been completed', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const rng = mulberry32(seed * 31337);
      const g = createGame(
        buildDeck(randomArchetype(rng)),
        buildDeck(randomArchetype(rng)),
        POOL_BY_ID,
        { rng: mulberry32(seed * 65537) },
      );
      let turns = 0;
      while (!g.winner && turns < 60) {
        const acting = g.active;
        playTurn(g, acting);
        turns += 1;
        // Dusk sheds the acting player down to MAX_HAND; the player who is
        // about to act may legitimately be holding more mid-Deal.
        expect(
          g.players[acting].hand.length,
          `seed ${seed}: ${acting} left its turn holding ${g.players[acting].hand.length}`,
        ).toBeLessThanOrEqual(MAX_HAND);
      }
    }
  }, 60_000);
});

describe('hostile input — malformed arguments are refused without side effects', () => {
  /** A live mid-game state that has real units, locations and a hand. */
  function midGame(seed = 4242): GameState {
    const rng = mulberry32(seed);
    const g = createGame(
      buildDeck(randomArchetype(rng)),
      buildDeck(randomArchetype(rng)),
      POOL_BY_ID,
      { rng: mulberry32(seed + 1) },
    );
    for (let i = 0; i < 8 && !g.winner; i += 1) playTurn(g, g.active);
    return g;
  }

  /** Structural fingerprint of everything an action could plausibly corrupt. */
  function snapshot(g: GameState): string {
    return JSON.stringify({
      active: g.active,
      phase: g.phase,
      turn: g.turn,
      winner: g.winner,
      clash: g.clash,
      players: SEATS.map((pid) => {
        const p = g.players[pid];
        return {
          vitality: p.vitality,
          essence: p.essence,
          leader: p.leader,
          hand: p.hand.map((c) => c.iid),
          deck: p.deck.map((c) => c.iid),
          field: p.field.map((u) => [u.iid, u.damage, u.exhausted, u.charms.map((c) => c.iid)]),
          locations: p.locations.map((l) => [l.iid, l.exhausted]),
          ash: p.ashPile.map((c) => c.iid),
          void: p.voidPile.map((c) => c.iid),
          worn: p.wornCharms.map((c) => c.iid),
        };
      }),
    });
  }

  /** Values a caller should never be able to smuggle into an id parameter. */
  const NASTY_IDS: unknown[] = [
    '',
    ' ',
    'nope',
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    '#1',
    '../../etc/passwd',
    'P1',
    'P2',
    null,
    undefined,
    0,
    -1,
    NaN,
    Infinity,
    {},
    [],
    () => undefined,
  ];

  test('invokeCard rejects every malformed card id and changes nothing', () => {
    const g = midGame();
    const before = snapshot(g);
    for (const pid of SEATS) {
      for (const id of NASTY_IDS) {
        expect(invokeCard(g, pid, id as string), `invokeCard accepted ${String(id)}`).toBe(false);
      }
    }
    expect(snapshot(g)).toBe(before);
    checkInvariants(g, 'invokeCard fuzz');
  });

  test('tapLocationForEssence and rebondCharm reject every malformed id', () => {
    const g = midGame(99);
    const before = snapshot(g);
    for (const pid of SEATS) {
      for (const id of NASTY_IDS) {
        expect(tapLocationForEssence(g, pid, id as string)).toBe(false);
        expect(rebondCharm(g, pid, id as string, id as string)).toBe(false);
      }
    }
    expect(snapshot(g)).toBe(before);
  });

  test('playWellspring rejects unknown, prototype-shaped and non-string essence types', () => {
    const g = midGame(7);
    const before = snapshot(g);
    for (const pid of SEATS) {
      for (const t of ['Fire', '', '__proto__', 'constructor', null, 7, {}]) {
        expect(playWellspring(g, pid, t as never), `playWellspring accepted ${String(t)}`).toBe(
          false,
        );
      }
    }
    expect(snapshot(g)).toBe(before);
  });

  test('activateLeaderAbility rejects out-of-range, fractional and non-numeric indices', () => {
    const g = midGame(11);
    const before = snapshot(g);
    for (const pid of SEATS) {
      for (const i of [-1, 1.5, 99, NaN, Infinity, -Infinity, null, undefined, '0', {}]) {
        expect(
          activateLeaderAbility(g, pid, i as number),
          `activateLeaderAbility accepted index ${String(i)}`,
        ).toBe(false);
      }
    }
    expect(snapshot(g)).toBe(before);
  });

  test('declareAttackers rejects garbage rosters and never opens a clash', () => {
    const g = midGame(21);
    // Get to a Clash with no clash open yet.
    let guard = 0;
    while (g.phase !== 'Clash' && !g.winner && guard < 20) {
      endPhase(g);
      guard += 1;
    }
    const before = snapshot(g);
    for (const roster of [
      NASTY_IDS as string[],
      ['nope'],
      ['__proto__'],
      // The opponent's own units are never a legal attack roster.
      g.players[g.active === 'P1' ? 'P2' : 'P1'].field.map((u) => u.iid),
      // A duplicate of one real attacker.
      [...(g.players[g.active].field[0] ? [g.players[g.active].field[0].iid] : []), 'nope'],
    ]) {
      if (roster.length === 0) continue;
      expect(declareAttackers(g, roster)).toBe(false);
    }
    expect(g.clash).toBeNull();
    expect(snapshot(g)).toBe(before);
  });

  test('declareGuards rejects prototype-keyed and non-array assignment maps', () => {
    const g = midGame(33);
    const before = snapshot(g);
    for (const assignments of [
      { __proto__: ['x'] },
      { constructor: ['x'] },
      { nope: ['nope'] },
      { nope: 'not-an-array' },
      { nope: null },
    ]) {
      expect(declareGuards(g, assignments as never)).toBe(false);
    }
    expect(snapshot(g)).toBe(before);
    // The prototype-keyed attempt must not have polluted Object.prototype.
    expect(({} as Record<string, unknown>).nope).toBeUndefined();
    expect(snapshot(g)).toBe(before);
  });

  test('resolveClash and mulliganHand are refused outside their windows', () => {
    const g = midGame(55);
    const before = snapshot(g);
    if (!g.clash) expect(resolveClash(g)).toBe(false);
    for (const pid of SEATS) expect(mulliganHand(g, pid)).toBe(false);
    expect(snapshot(g)).toBe(before);
  });

  test('nothing is legal once a winner exists, however malformed the call', () => {
    const rng = mulberry32(1234);
    const g = createGame(
      buildDeck(randomArchetype(rng)),
      buildDeck(randomArchetype(rng)),
      POOL_BY_ID,
      { rng: mulberry32(4321) },
    );
    let turns = 0;
    while (!g.winner && turns < 400) {
      playTurn(g, g.active);
      turns += 1;
    }
    expect(g.winner).not.toBeNull();

    const before = snapshot(g);
    for (const pid of SEATS) {
      const p = g.players[pid];
      expect(invokeCard(g, pid, p.hand[0]?.iid ?? 'nope')).toBe(false);
      expect(invokeLeader(g, pid)).toBe(false);
      expect(activateLeaderAbility(g, pid, 0)).toBe(false);
      expect(playWellspring(g, pid, 'Ember')).toBe(false);
      expect(tapLocationForEssence(g, pid, p.locations[0]?.iid ?? 'nope')).toBe(false);
      expect(mulliganHand(g, pid)).toBe(false);
    }
    expect(
      declareAttackers(
        g,
        g.players[g.active].field.map((u) => u.iid),
      ),
    ).toBe(false);
    expect(resolveClash(g)).toBe(false);
    expect(endPhase(g)).toBe(false);
    expect(snapshot(g)).toBe(before);
  });
});
