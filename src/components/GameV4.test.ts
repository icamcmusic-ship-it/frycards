/**
 * Match-UI guard tests.
 *
 * `activateLeaderAbility` spends the ability's Resolve — and shatters the
 * Leader outright when that takes it to zero — whether or not the effect
 * actually finds anything to resolve against. The CPU has guarded itself
 * against pointing a targeted ability at a board it cannot legally hit since
 * v6.9 (`runLeaderAbility` in ai.ts); the human's ability pill did not, so
 * clicking a "-4: Shatter a target enemy unit" into an empty or entirely
 * Warded enemy board burned four Resolve for nothing and could kill the
 * player's own Leader doing it.
 *
 * These pin the pure predicate the pill's enabled state is derived from.
 */
import { describe, expect, test } from 'vitest';
import {
  FX_MS,
  FX_UNMOUNT_SLACK_MS,
  fxPaceFor,
  fxUnmountMs,
  handLayoutFor,
  leaderAbilityWhy,
  matchOutcome,
  ownDawnGains,
  pendingChoices,
  recommendWellspring,
  shouldConfirmEndTurn,
  summarizeCpuTurn,
} from './GameV4';
import { CARD_SIZES } from './CardFaceV4';
import { CPU_SPEEDS } from '../meta/matchPrefs';
import { CardDef } from '../game/v3/cards';
import { DeckDef, GameState, createGame, mulberry32, summonUnit } from '../game/v3/engine';

/** resolve 5, with a -4 unit-only shatter (the same shape as the live
 * `avatar_of_the_abyss` Leader) plus a -1 'anyTarget' burn, so the suite can
 * tell "no unit to hit" apart from "nothing to hit at all". */
const LEADER: CardDef = {
  id: 'test_leader',
  name: 'Test Leader',
  type: 'Leader',
  cost: { generic: 0, pips: {} },
  resolve: 5,
  leaderAbilities: [
    {
      resolveDelta: -4,
      effect: { action: 'shatter', target: 'enemyUnit' },
      text: '-4: Shatter a target enemy unit.',
    },
    {
      resolveDelta: -1,
      effect: { action: 'damage', value: 2, target: 'anyTarget' },
      text: '-1: Deal 2 damage to any target.',
    },
  ],
};
const VANILLA: CardDef = {
  id: 'vanilla',
  name: 'Vanilla',
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might: 2,
  grit: 2,
};
const WARDED: CardDef = { ...VANILLA, id: 'warded', name: 'Warded', keywords: ['Warded'] };

const POOL: Record<string, CardDef> = {
  [LEADER.id]: LEADER,
  [VANILLA.id]: VANILLA,
  [WARDED.id]: WARDED,
};

function game(): GameState {
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: Array(30).fill(VANILLA.id) });
  const s = createGame(dd(), dd(), POOL, { rng: mulberry32(11), shuffle: false, handSize: 0 });
  s.active = 'P1';
  s.phase = 'Main1';
  s.players.P1.leader.invoked = true;
  s.players.P1.leader.abilityUsedThisTurn = false;
  return s;
}

const SHATTER = 0;
const ANY_TARGET = 1;

describe('leaderAbilityWhy', () => {
  test('a targeted ability with a live enemy unit is usable', () => {
    const s = game();
    summonUnit(s, 'P2', VANILLA);
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toBeUndefined();
  });

  test('blocks a targeted ability against an EMPTY enemy board', () => {
    const s = game();
    expect(s.players.P2.field).toHaveLength(0);
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toMatch(/no legal target/i);
  });

  test('blocks a targeted ability when every enemy unit is Warded', () => {
    const s = game();
    summonUnit(s, 'P2', WARDED);
    summonUnit(s, 'P2', WARDED);
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toMatch(/no legal target/i);
  });

  test('a Warded board still leaves a non-Warded unit targetable', () => {
    const s = game();
    summonUnit(s, 'P2', WARDED);
    summonUnit(s, 'P2', VANILLA);
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toBeUndefined();
  });

  test("'anyTarget' stays usable on an empty board — it can go face", () => {
    const s = game();
    expect(leaderAbilityWhy(s, 'P1', ANY_TARGET, true)).toBeUndefined();
  });

  test('the guard does not mask the pre-existing reasons', () => {
    const s = game();
    summonUnit(s, 'P2', VANILLA);

    const notMain = leaderAbilityWhy(s, 'P1', SHATTER, false);
    expect(notMain).toMatch(/main phases/i);

    s.players.P1.leader.abilityUsedThisTurn = true;
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toMatch(/already used/i);
    s.players.P1.leader.abilityUsedThisTurn = false;

    s.players.P1.leader.resolve = 3; // -4 is unaffordable
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toMatch(/Needs 4 Resolve/);

    s.players.P1.leader.resolve = 5;
    s.players.P1.leader.invoked = false;
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toMatch(/not on the field/i);
  });

  test('a nonexistent ability index is rejected', () => {
    const s = game();
    summonUnit(s, 'P2', VANILLA);
    expect(leaderAbilityWhy(s, 'P1', 99, true)).toMatch(/No such ability/i);
  });
});

/**
 * The paced-effect drift.
 *
 * v26 scaled every combat animation's CSS duration by `--gv4-pace` so the
 * narration speed would slow down the parts a player is trying to watch — and
 * left the three JS timers that UNMOUNT those elements at their v25 constants.
 * On CINEMATIC (pace 2.6) the phase banner, the damage floats and the hit
 * flash were therefore torn off screen at ~38% of the animation the setting
 * had just lengthened: the slowest rung showed the shortest version of every
 * effect it exists to let you watch.
 *
 * Both halves now come from `FX_MS`. These pin that they agree at EVERY rung,
 * including any rung added later.
 */
describe('paced combat effects', () => {
  test('the element outlives its animation at every narration speed', () => {
    for (const [idx] of CPU_SPEEDS.entries()) {
      const pace = fxPaceFor(idx);
      for (const base of Object.values(FX_MS)) {
        // The animation runs for `base * pace`; the element must still be
        // mounted when it ends.
        expect(fxUnmountMs(base, idx), `${CPU_SPEEDS[idx].label} @ ${base}ms`).toBeGreaterThan(
          base * pace,
        );
      }
    }
  });

  test('the pace floor is 1 — FAST shortens waits, never the feedback', () => {
    const fast = CPU_SPEEDS.findIndex((s) => s.label === 'FAST');
    expect(CPU_SPEEDS[fast].mult).toBeLessThan(1);
    expect(fxPaceFor(fast)).toBe(1);
    expect(fxUnmountMs(FX_MS.float, fast)).toBe(FX_MS.float + FX_UNMOUNT_SLACK_MS);
  });

  test('a slower rung really does hold every effect longer', () => {
    const cinematic = CPU_SPEEDS.findIndex((s) => s.label === 'CINEMATIC');
    const normal = CPU_SPEEDS.findIndex((s) => s.label === 'NORMAL');
    for (const base of Object.values(FX_MS)) {
      expect(fxUnmountMs(base, cinematic)).toBeGreaterThan(fxUnmountMs(base, normal));
    }
  });

  test('an out-of-range speed index falls back to the unscaled pace', () => {
    expect(fxPaceFor(-1)).toBe(1);
    expect(fxPaceFor(999)).toBe(1);
  });
});

describe('pendingChoices', () => {
  test('shows the locked target and flags a target that becomes Warded', () => {
    const s = game();
    summonUnit(s, 'P2', VANILLA);
    const target = s.players.P2.field[0];
    const item = {
      id: 'pending',
      kind: 'trigger' as const,
      controller: 'P1' as const,
      sourceName: 'Removal',
      targetIid: target.iid,
      effect: { action: 'shatter' as const, target: 'enemyUnit' as const },
    };
    expect(pendingChoices(s, item)).toEqual(['Target: Vanilla']);
    target.def = WARDED;
    expect(pendingChoices(s, item)).toEqual(['Target: Warded (no longer legal)']);
    s.players.P2.field = [];
    expect(pendingChoices(s, item)).toEqual(['Target: Target left the field (no longer legal)']);
  });
  test('shows a self Charm as its controller’s Vitality and separates Tool choices', () => {
    const s = game();
    summonUnit(s, 'P1', VANILLA);
    const base = {
      id: 'pending',
      kind: 'card' as const,
      controller: 'P2' as const,
      sourceName: 'Item',
    };
    expect(pendingChoices(s, { ...base, bondTargetIid: 'self' })).toEqual([
      'Bond: Opponent’s Vitality',
    ]);
    expect(
      pendingChoices(s, {
        ...base,
        bondTargetIid: s.players.P1.field[0].iid,
        toolTargetIid: 'gone',
      }),
    ).toEqual(['Bond: Vanilla', 'Weaken: Target left the field']);
  });
});

/**
 * E5 — the recap credits the player's own Dawn to the opponent's turn.
 *
 * The player's Dawn runs inside the `endPhase` that ends the opponent's turn,
 * so its Deal and heals are already in the state the recap measures. These pin
 * that they are taken back out.
 */
describe('turn recap (E5)', () => {
  const snap = { vitality: 20, fieldIids: ['u1', 'u2'], hand: 5, logAt: 2 };
  const now = (over: Partial<Parameters<typeof summarizeCpuTurn>[1]> = {}) => ({
    vitality: 20,
    fieldIids: ['u1', 'u2'],
    hand: 5,
    log: ['x', 'y'],
    ...over,
  });

  test('the Dawn Deal is not "+1 card to you"', () => {
    // The opponent did nothing; the player's Dawn dealt one card.
    const recap = summarizeCpuTurn(snap, now({ hand: 6 }), { ran: true, lines: [] });
    expect(recap.cardsDrawnByMe).toBe(0);
    expect(recap.noAction).toBe(true);
  });

  test('a card the opponent made you draw still counts on top of the Deal', () => {
    const recap = summarizeCpuTurn(snap, now({ hand: 7 }), { ran: true, lines: [] });
    expect(recap.cardsDrawnByMe).toBe(1);
  });

  test('Dawn heals are not subtracted from the damage the opponent dealt', () => {
    // Took 5 during the opponent's turn, then Radiant/Sacred healed 2 at Dawn.
    const dawn = ['P1 recovers 2 Vitality at Dawn.'];
    const recap = summarizeCpuTurn(
      snap,
      now({ vitality: 17, log: ['x', 'y', 'P2 attacks with Bear.', ...dawn] }),
      { ran: true, lines: dawn },
    );
    expect(recap.vitalityLost).toBe(5);
    expect(recap.attacked).toBe(true);
  });

  test("the Dawn lines are not counted as the opponent's log lines", () => {
    const dawn = ['P1 recovers 1 Vitality at Dawn.', "P1's Archivist deals 2 extra card(s)."];
    const recap = summarizeCpuTurn(
      snap,
      now({ hand: 8, log: ['x', 'y', 'P2 plays Wall.', ...dawn] }),
      { ran: true, lines: dawn },
    );
    expect(recap.lines).toBe(1);
    expect(recap.cardsPlayed).toBe(1);
    // 8 in hand = 5 + Deal 1 + Archivist 2.
    expect(recap.cardsDrawnByMe).toBe(0);
  });

  test("a recovery that never reached the player's Dawn subtracts nothing", () => {
    const recap = summarizeCpuTurn(snap, now({ hand: 6 }), { ran: false, lines: [] });
    expect(recap.cardsDrawnByMe).toBe(1);
  });

  test('ownDawnGains reads the exact-amount lines', () => {
    expect(ownDawnGains([], { dealt: true })).toEqual({ cards: 1, vitality: 0 });
    expect(
      ownDawnGains(
        [
          'P1 recovers 3 Vitality at Dawn.',
          "P1's Leader restores 1 Vitality (Beacon).",
          "P1's Archivist deals 2 extra card(s).",
          "Mind Well's trigger deals 1 card to P1.",
          "Mind Well's trigger deals 1 card to P2.",
        ],
        { dealt: true },
      ),
    ).toEqual({ cards: 4, vitality: 4 });
  });
});

describe('recommendWellspring (the turn-1 primary)', () => {
  const costs = [
    { generic: 1, pips: { Tide: 2 } },
    { generic: 0, pips: { Tide: 1, Void: 1 } },
  ];

  test('prefers the colour that unlocks the most cards', () => {
    expect(recommendWellspring(['Tide', 'Void'], { Void: 2, Tide: 1 }, costs)).toBe('Void');
  });

  test('falls back to the colour the hand asks for most', () => {
    expect(recommendWellspring(['Void', 'Tide'], {}, costs)).toBe('Tide');
  });

  test('then to the first colour the Leader may play, and to nothing if there is none', () => {
    expect(recommendWellspring(['Void', 'Tide'], {}, [])).toBe('Void');
    expect(recommendWellspring([], {}, costs)).toBeNull();
  });
});

describe('shouldConfirmEndTurn', () => {
  test('asks only when a playable card AND spendable essence remain', () => {
    expect(shouldConfirmEndTurn({ playable: 2, spendableEssence: 3, suppressed: false })).toBe(
      true,
    );
    expect(shouldConfirmEndTurn({ playable: 0, spendableEssence: 3, suppressed: false })).toBe(
      false,
    );
    expect(shouldConfirmEndTurn({ playable: 2, spendableEssence: 0, suppressed: false })).toBe(
      false,
    );
  });

  test('"don\'t ask again" silences it', () => {
    expect(shouldConfirmEndTurn({ playable: 2, spendableEssence: 3, suppressed: true })).toBe(
      false,
    );
  });
});

describe('matchOutcome', () => {
  test('maps the engine winner to a seat-relative result, draws included', () => {
    expect(matchOutcome('P1')).toBe('win');
    expect(matchOutcome('P2')).toBe('loss');
    expect(matchOutcome('draw')).toBe('draw');
    expect(matchOutcome(null)).toBeNull();
  });
});

describe('hand layout', () => {
  const GAP = 6;
  const PAD = 16;

  test('a 390x844 phone shows WHOLE cards edge to edge, in a dock at least 160px tall', () => {
    const l = handLayoutFor(390, 844);
    expect(l.strip).toBe(true);
    expect(l.dockH).toBeGreaterThanOrEqual(160);
    // The row is exactly N whole cards plus gaps and padding — never N and a half.
    const cardPx = CARD_SIZES.compact.w * l.scale;
    const n = Math.round((390 - PAD + GAP) / (cardPx + GAP));
    expect(n * cardPx + (n - 1) * GAP + PAD).toBeCloseTo(390, 5);
    expect(n).toBeGreaterThanOrEqual(3);
    // And the card is shown in full, not the top 60% of it.
    expect(l.cardH).toBeLessThanOrEqual(l.dockH);
  });

  test('desktop keeps full-size fanned cards with the dock around 22vh', () => {
    const l = handLayoutFor(1440, 900);
    expect(l.strip).toBe(false);
    expect(l.scale).toBe(1);
    expect(l.dockH).toBeGreaterThanOrEqual(160);
    expect(l.dockH).toBeLessThanOrEqual(Math.round(900 * 0.22));
    // The arc's outer cards swing below the middle ones, so the fan sits a
    // little above the dock's floor and every card stays whole.
    expect(l.fanLift).toBeGreaterThan(0);
    expect(l.fanLift + l.cardH).toBeLessThanOrEqual(l.dockH);
  });

  test('a phone in landscape shrinks the hand to keep the board on one screen', () => {
    const l = handLayoutFor(844, 390);
    expect(l.scale).toBeLessThan(1);
    expect(l.dockH).toBeLessThan(160);
    expect(l.cardH).toBeLessThanOrEqual(l.dockH);
  });

  test('narrow phones never drop below three whole cards', () => {
    for (const w of [320, 360, 375, 414]) {
      const l = handLayoutFor(w, 800);
      const cardPx = CARD_SIZES.compact.w * l.scale;
      expect(3 * cardPx + 2 * GAP + PAD).toBeLessThanOrEqual(w + 0.01);
    }
  });
});
