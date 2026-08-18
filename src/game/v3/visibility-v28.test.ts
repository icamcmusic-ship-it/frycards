/**
 * v28 CPU-visibility / clash-readout suite.
 *
 * Two findings, both of them a case where the board had the number (or the
 * card) and made the player work it out anyway.
 *
 * 1. **The beat about a unit that died has nothing to point at.** Every
 *    CPU-visibility pass since v18 has closed a silence by asking "which CPU
 *    decision has no beat?", and by v27 they all had one. This is the next
 *    question: which beat has no SUBJECT? A CPU turn is computed in full and
 *    narrated afterwards, so by the time "Your X was shattered." reaches the
 *    screen the board has already stopped drawing X — `unitsNamedIn` scans the
 *    fields, finds nothing, and the single most consequential line of the
 *    opponent's turn is the one line with no highlight. The card is still in a
 *    pile; `buildCpuBeats` finds it there and marks the beat `lost`, and the
 *    board holds the face up for the length of it.
 *
 * 2. **The clash divider's three primaries.** DECLARE ATTACK has printed its
 *    Might and its LETHAL warning since v26. CONFIRM GUARDS printed the
 *    incoming damage only while NOTHING was guarded — it dropped the number
 *    the instant a player assigned their first guard, which is exactly when
 *    "what still gets through?" becomes the question. RESOLVE CLASH, pressed
 *    from BOTH seats at the moment the answer is already fixed, printed
 *    nothing at all. All three now say what pressing them costs.
 */
import { describe, expect, test } from 'vitest';
import { buildCpuBeats, guardConfirmLabel, resolveClashLabelFor } from '../../components/GameV4';
import { CardDef } from './cards';
import { DeckDef, GameState, createGame, makeCardInst, mulberry32 } from './engine';
import { POOL_V4 } from './cardpool';

const LEADER: CardDef = {
  id: 'test_leader',
  name: 'Test Leader',
  type: 'Leader',
  cost: { generic: 1, pips: {} },
  resolve: 3,
};
const U = (id: string, name = id): CardDef => ({
  id,
  name,
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might: 2,
  grit: 4,
});
const FILLER = U('filler');
const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER, [FILLER.id]: FILLER };

function game(): GameState {
  const dd: DeckDef = { leaderId: LEADER.id, cards: Array(30).fill(FILLER.id) };
  return createGame(dd, dd, POOL, { rng: mulberry32(3), shuffle: false, handSize: 0 });
}

describe('a beat about a unit that is already gone', () => {
  test('finds the card in the ash pile and marks the beat lost', () => {
    const g = game();
    const dead = U('ashen_sentinel', 'Ashen Sentinel');
    g.players.P1.ashPile.push(makeCardInst(dead));

    const [beat] = buildCpuBeats(['Ashen Sentinel was shattered.'], 0, [], g);
    expect(beat.lost?.map((l) => l.defId)).toEqual(['ashen_sentinel']);
    // The pile it was found in names its owner, so the spotlight can say
    // whose it was without the board having to remember.
    expect(beat.lost?.[0].owner).toBe('P1');
    // Also pushed to `targets`, which is what buys the beat its longer dwell.
    expect(beat.targets.length).toBe(1);
  });

  test('the void pile counts too — banished is just as gone', () => {
    const g = game();
    const gone = U('tidecaller', 'Tidecaller');
    g.players.P2.voidPile.push(makeCardInst(gone));
    const [beat] = buildCpuBeats(['Tidecaller is banished.'], 0, [], g);
    expect(beat.lost?.map((l) => l.defId)).toEqual(['tidecaller']);
    expect(beat.lost?.[0].owner).toBe('P2');
  });

  test('a unit still on the board is ringed, not held up', () => {
    // The whole point of the ring is that the player can find the thing on the
    // board. Holding a card up for a unit that is standing right there would
    // replace a precise answer with a vaguer one.
    const g = game();
    const alive = U('reef_warden', 'Reef Warden');
    g.players.P1.field.push({
      ...makeCardInst(alive),
      owner: 'P1',
      damage: 0,
      exhausted: false,
      enteredThisTurn: false,
      permMight: 0,
      permGrit: 0,
      items: [],
    });
    g.players.P2.ashPile.push(makeCardInst(alive));

    const [beat] = buildCpuBeats(['Reef Warden is frozen.'], 0, [], g);
    expect(beat.lost).toBeUndefined();
    expect(beat.targets.length).toBe(1);
  });

  test('a structured event always wins — the pile scan is a fallback only', () => {
    const g = game();
    g.players.P1.ashPile.push(makeCardInst(U('ashen_sentinel', 'Ashen Sentinel')));
    const [beat] = buildCpuBeats(
      ['Ashen Sentinel was shattered.'],
      0,
      [{ kind: 'invoke', name: 'Filler', iid: 'x1', defId: 'filler', logAt: 1 }],
      g,
    );
    expect(beat.lost).toBeUndefined();
    expect(beat.cardId).toBe('filler');
  });

  test('only the tail of a pile is scanned', () => {
    // A twentieth-turn ash pile is forty cards deep. A line matching something
    // buried at the bottom of it is matching a coincidence, not this turn.
    const g = game();
    const old = U('driftwood_herald', 'Driftwood Herald');
    g.players.P1.ashPile.push(makeCardInst(old));
    for (let i = 0; i < 10; i++) g.players.P1.ashPile.push(makeCardInst(FILLER));
    const [beat] = buildCpuBeats(['Driftwood Herald was shattered.'], 0, [], g);
    expect(beat.lost).toBeUndefined();
  });
});

describe('guardConfirmLabel', () => {
  test('prints the residual whether or not any guard is assigned', () => {
    // The regression this exists for: the number used to vanish the moment the
    // player assigned their first guard.
    expect(guardConfirmLabel(7, 20, false)).toBe('🛡 NO GUARDS — TAKE 7');
    expect(guardConfirmLabel(7, 20, true)).toBe('🛡 CONFIRM GUARDS — TAKE 7');
  });

  test('says so when the assignment stops everything', () => {
    expect(guardConfirmLabel(0, 20, true)).toBe('🛡 CONFIRM GUARDS — NOTHING GETS THROUGH');
    expect(guardConfirmLabel(0, 20, false)).toBe('🛡 CONFIRM GUARDS — NOTHING GETS THROUGH');
  });

  test('LETHAL fires AT the Vitality total, not one point past it', () => {
    expect(guardConfirmLabel(9, 10, true)).not.toContain('LETHAL');
    expect(guardConfirmLabel(10, 10, true)).toContain('· LETHAL');
    expect(guardConfirmLabel(11, 10, true)).toContain('· LETHAL');
  });
});

describe('resolveClashLabelFor', () => {
  test('names the seat pressing it', () => {
    expect(resolveClashLabelFor(6, 20, false)).toBe('💥 RESOLVE CLASH — DEAL 6');
    expect(resolveClashLabelFor(6, 20, true)).toBe('💥 RESOLVE CLASH — TAKE 6');
  });

  test('stays plain when nothing reaches a Vitality plate', () => {
    // Every attacker guarded: the clash still has to resolve, but there is no
    // number to promise and inventing a "DEAL 0" would read as a bug.
    expect(resolveClashLabelFor(0, 20, false)).toBe('💥 RESOLVE CLASH');
  });

  test('LETHAL fires at the total, from either seat', () => {
    expect(resolveClashLabelFor(10, 10, false)).toBe('💥 RESOLVE CLASH — DEAL 10 · LETHAL');
    expect(resolveClashLabelFor(10, 10, true)).toBe('💥 RESOLVE CLASH — TAKE 10 · LETHAL');
    expect(resolveClashLabelFor(9, 10, true)).not.toContain('LETHAL');
  });

  test('a player already at 0 does not get a LETHAL badge', () => {
    // Vitality 0 means the match is over; the divider should not be printing a
    // kill promise against a corpse.
    expect(resolveClashLabelFor(4, 0, true)).toBe('💥 RESOLVE CLASH — TAKE 4');
  });
});

describe('the name-matching fallback is only safe while names are unique', () => {
  test('no printed card name is a substring of another', () => {
    // Both `unitsNamedIn` and the pile scan decide what a log line is ABOUT by
    // testing whether a card's name appears in it. That is exact today: across
    // the 297-card pool no name contains another. The day a set ships "Tide
    // Herald" alongside "Herald", every line about the long one silently rings
    // the short one as well — a wrong highlight, which is worse than none,
    // because the player trusts it. The guard belongs here rather than in the
    // catalog suite: this is the assumption that breaks, and this is the file
    // that explains why it matters.
    const names = [...new Set(POOL_V4.map((c) => c.name).filter(Boolean))];
    const collisions: string[] = [];
    for (const a of names) {
      for (const b of names) {
        if (a !== b && b.includes(a)) collisions.push(`"${a}" is a substring of "${b}"`);
      }
    }
    expect(collisions).toEqual([]);
  });
});
