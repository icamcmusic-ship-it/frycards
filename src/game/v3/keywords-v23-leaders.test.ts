/**
 * v23 content tests: the first LEADER keyword generation on v7.8's
 * 'ldr-kw-next' plumbing — Onslaught (Ember), Beacon (Light), Dread (Void).
 *
 * Leaders carry three keywords (Commander, Resolute, Warlord) where every
 * other type now has six or seven — the standing roadmap item. These three are
 * implemented and pinned here engine-side; NONE is printed on a pool card
 * (cardpool's LEADER_NEXT_KEYWORDS stays empty), so the generated pool is
 * byte-identical and the print is a future content pass's own decision.
 */
import { describe, expect, test } from 'vitest';
import { CardDef, LEADER_HP } from './cards';
import {
  DeckDef,
  GameState,
  createGame,
  declareAttackers,
  declareGuards,
  effMight,
  endPhase,
  mulberry32,
  resolveClash,
  summonUnit,
} from './engine';

const LEADER: CardDef = {
  id: 'test_leader',
  name: 'Test Leader',
  type: 'Leader',
  cost: { generic: 0, pips: {} },
  resolve: 3,
  leaderAbilities: [],
};
const ONSLAUGHT_LEADER: CardDef = { ...LEADER, id: 'onslaught_leader', keywords: ['Onslaught'] };
const BEACON_LEADER: CardDef = { ...LEADER, id: 'beacon_leader', keywords: ['Beacon'] };
const DREAD_LEADER: CardDef = { ...LEADER, id: 'dread_leader', keywords: ['Dread'] };
const VANILLA: CardDef = {
  id: 'vanilla',
  name: 'Vanilla',
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might: 2,
  grit: 2,
};
const WISP: CardDef = { ...VANILLA, id: 'wisp', name: 'Wisp', might: 0, grit: 1 };

const POOL: Record<string, CardDef> = {
  [LEADER.id]: LEADER,
  [ONSLAUGHT_LEADER.id]: ONSLAUGHT_LEADER,
  [BEACON_LEADER.id]: BEACON_LEADER,
  [DREAD_LEADER.id]: DREAD_LEADER,
  [VANILLA.id]: VANILLA,
  [WISP.id]: WISP,
};

function game(p1Leader = LEADER.id, p2Leader = LEADER.id): GameState {
  const dd = (leaderId: string): DeckDef => ({ leaderId, cards: Array(30).fill(VANILLA.id) });
  return createGame(dd(p1Leader), dd(p2Leader), POOL, {
    rng: mulberry32(7),
    shuffle: false,
    handSize: 0,
  });
}

/** Advance the active player round to their own next Dawn. */
function toNextDawn(s: GameState): void {
  s.phase = 'Main2';
  endPhase(s); // Dusk -> hands over to the opponent
  s.phase = 'Main2';
  endPhase(s); // opponent's Dusk -> back to us, through our Dawn
}

// ---------------------------------------------------------------------------
describe('v23 Leader keyword — Dread', () => {
  test('enemy units get -1 Might while the Leader is fielded; own units keep theirs', () => {
    const s = game(DREAD_LEADER.id);
    const mine = summonUnit(s, 'P1', VANILLA);
    const theirs = summonUnit(s, 'P2', VANILLA);
    expect(effMight(s, theirs)).toBe(2);

    s.players.P1.leader.invoked = true;
    expect(effMight(s, theirs)).toBe(1);
    expect(effMight(s, mine)).toBe(2);
  });

  test('floors at 0 and switches off when the Leader is shattered', () => {
    const s = game(DREAD_LEADER.id);
    const wisp = summonUnit(s, 'P2', WISP);
    s.players.P1.leader.invoked = true;
    expect(effMight(s, wisp)).toBe(0);

    s.players.P1.leader.shattered = true;
    expect(effMight(s, wisp)).toBe(0); // printed 0 either way
    const body = summonUnit(s, 'P2', VANILLA);
    expect(effMight(s, body)).toBe(2); // no penalty from a shattered Leader
  });

  test('shrinks clash damage the enemy deals', () => {
    const s = game(LEADER.id, DREAD_LEADER.id);
    s.players.P2.leader.invoked = true;
    const a = summonUnit(s, 'P1', VANILLA);
    endPhase(s); // -> Clash
    declareAttackers(s, [a.iid]);
    declareGuards(s, {});
    resolveClash(s);
    // 2 Might attacker under enemy Dread hits for 1.
    expect(s.players.P2.vitality).toBe(LEADER_HP - 1);
  });
});

describe('v23 Leader keyword — Beacon', () => {
  test('restores 1 Vitality at Dawn while invoked, capped at starting Vitality', () => {
    const s = game(BEACON_LEADER.id);
    s.players.P1.leader.invoked = true;
    s.players.P1.vitality = LEADER_HP - 3;
    toNextDawn(s);
    expect(s.players.P1.vitality).toBe(LEADER_HP - 2);
    expect(s.log.some((l) => l.includes('Beacon'))).toBe(true);

    s.players.P1.vitality = LEADER_HP;
    toNextDawn(s);
    expect(s.players.P1.vitality).toBe(LEADER_HP); // never above the cap
  });

  test('does nothing while the Leader sits uninvoked or shattered', () => {
    const s = game(BEACON_LEADER.id);
    s.players.P1.vitality = LEADER_HP - 3;
    toNextDawn(s);
    expect(s.players.P1.vitality).toBe(LEADER_HP - 3);

    s.players.P1.leader.invoked = true;
    s.players.P1.leader.shattered = true;
    toNextDawn(s);
    expect(s.players.P1.vitality).toBe(LEADER_HP - 3);
  });
});

describe('v23 Leader keyword — Onslaught', () => {
  test('attackers hit 1 harder while the Leader is fielded', () => {
    const s = game(ONSLAUGHT_LEADER.id);
    s.players.P1.leader.invoked = true;
    const a = summonUnit(s, 'P1', VANILLA);
    endPhase(s); // -> Clash
    declareAttackers(s, [a.iid]);
    declareGuards(s, {});
    resolveClash(s);
    expect(s.players.P2.vitality).toBe(LEADER_HP - 3); // 2 printed + 1 Onslaught
  });

  test('guards counter-attack at printed Might — the bonus is attack-only', () => {
    const s = game(ONSLAUGHT_LEADER.id);
    s.players.P1.leader.invoked = true;
    const a = summonUnit(s, 'P1', U34());
    const g = summonUnit(s, 'P2', VANILLA);
    endPhase(s); // -> Clash
    declareAttackers(s, [a.iid]);
    declareGuards(s, { [a.iid]: [g.iid] });
    resolveClash(s);
    // The 2/2 guard dies to the boosted attacker; the attacker took only the
    // guard's PRINTED 2, never a mirrored bonus.
    expect(s.players.P2.field.find((u) => u.iid === g.iid)).toBeUndefined();
    expect(a.damage).toBe(2);
  });

  test('no bonus while the Leader sits uninvoked', () => {
    const s = game(ONSLAUGHT_LEADER.id);
    const a = summonUnit(s, 'P1', VANILLA);
    endPhase(s); // -> Clash
    declareAttackers(s, [a.iid]);
    declareGuards(s, {});
    resolveClash(s);
    expect(s.players.P2.vitality).toBe(LEADER_HP - 2);
  });
});

/** A 3/4 body, big enough to survive its guard and carry excess. */
function U34(): CardDef {
  return { ...VANILLA, id: 'bruiser', name: 'Bruiser', might: 3, grit: 4 };
}
