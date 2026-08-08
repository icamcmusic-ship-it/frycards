/**
 * v18 CPU-visibility suite — the pieces of "the player can always see what the
 * opponent is doing" that are pure enough to pin.
 *
 *  1. `humanizeLog`'s verb table. A seat-prefixed verb the engine logs but the
 *     table omits falls through to the bare `P1 -> you` rule and prints third
 *     person against a second-person subject. `casts` (engine.ts's v13
 *     self-cast Charm line) was the surviving case: "you casts Fry's Charm on
 *     themselves". Every `${pid} <verb>` line the engine emits is enumerated
 *     here, so adding one without teaching the humanizer fails the suite.
 *  2. `buildCpuBeats` lines log lines up with the AI's event stream, and now
 *     also carries the played card's catalog id (the mid-board spotlight) and
 *     an attack flag (the attackers' lunge). A beat with no matching event is
 *     still a beat — narration must never drop a log line.
 *  3. The clash-reaction events the UI narrates carry `defId`, which is what
 *     the spotlight looks the card face up by. `reactionPlays` has no
 *     `playTurn` wrapper stamping `logAt`, so the UI stamps it — the beats
 *     built from a hand-stamped stream have to line up the same way.
 */
import { describe, expect, test } from 'vitest';
import { buildCpuBeats, humanizeLog } from '../../components/GameV4';
import type { CpuTurnEvent } from './ai';
import { POOL_BY_ID } from './cardpool';

const CPU = 'Mer-King — Randomized Build';

describe('humanizeLog', () => {
  test('every seat-prefixed verb the engine logs reads in second person', () => {
    // Mirrors the `${pid} <verb>` / `${p.id} <verb>` / `${state.active} <verb>`
    // lines in engine.ts. Update BOTH when a new one is added.
    const lines = [
      'P1 mulligans to 6.',
      'P1 must Deal from an empty deck and loses.',
      'P1 sheds Glass Squid.',
      'P1 plays a Tide Wellspring.',
      'P1 invokes Glass Squid.',
      'P1 re-bonds Rusted Fin to Glass Squid.',
      'P1 invokes their Leader, Mer-King.',
      'P1 attacks with 3 unit(s).',
      "P1 casts Fry's Charm on themselves and restores 2 Vitality.",
    ];
    for (const l of lines) {
      const out = humanizeLog(l, CPU);
      expect(out, `${l} -> ${out}`).not.toMatch(/\bP1\b/);
      // The third-person -s is the actual defect: "you casts", "you sheds".
      expect(out, `${l} -> ${out}`).not.toMatch(
        /\byou (invokes|plays|attacks|sheds|mulligans|casts)\b/i,
      );
    }
  });

  test('the self-cast Charm line reads "You cast … on yourself"', () => {
    expect(humanizeLog("P1 casts Fry's Charm on themselves.", CPU)).toBe(
      "You cast Fry's Charm on yourself.",
    );
  });

  test('the opponent is named, never printed as a seat id', () => {
    expect(humanizeLog('P2 invokes Glass Squid.', CPU)).toBe(`${CPU} invokes Glass Squid.`);
    expect(humanizeLog("P2's Leader Mer-King is shattered.", CPU)).toBe(
      `${CPU}'s Leader Mer-King is shattered.`,
    );
    // Clash damage names the seat as the TARGET, not the subject.
    expect(humanizeLog('Glass Squid hits P1 for 3 Vitality.', CPU)).toBe(
      'Glass Squid hits you for 3 Vitality.',
    );
  });

  test("a player's own possessive becomes 'your'", () => {
    expect(humanizeLog("Void Reaper banishes the top card of P1's deck.", CPU)).toBe(
      'Void Reaper banishes the top card of your deck.',
    );
  });
});

describe('buildCpuBeats', () => {
  const invokeEvent = (logAt: number, defId: string, targetIid?: string): CpuTurnEvent => ({
    kind: 'invoke',
    name: defId,
    defId,
    iid: 'u1',
    targetIid,
    logAt,
  });

  test('a beat is produced for every log line, event or not', () => {
    const beats = buildCpuBeats(['a', 'b', 'c'], 10, []);
    expect(beats.map((b) => b.text)).toEqual(['a', 'b', 'c']);
    expect(beats.every((b) => b.actors.length === 0 && b.targets.length === 0)).toBe(true);
  });

  test('an invoke beat carries the card id (spotlight) and its target', () => {
    const [defId] = Object.keys(POOL_BY_ID);
    const beats = buildCpuBeats(['line 0', 'line 1'], 5, [invokeEvent(6, defId, 'e9')]);
    // logAt 6 is "the log was 6 long when this fired", so it owns absolute
    // index 5 (the first line) and not index 6.
    expect(beats[0].cardId).toBe(defId);
    expect(beats[0].actors).toEqual(['u1']);
    expect(beats[0].targets).toEqual(['e9']);
    expect(beats[1].cardId).toBeUndefined();
  });

  test('an attack beat flags its attackers for the lunge animation', () => {
    const beats = buildCpuBeats(['attacks with 2 unit(s).'], 0, [
      { kind: 'attack', iids: ['a1', 'a2'], names: ['A', 'B'], logAt: 1 },
    ]);
    expect(beats[0].attacking).toBe(true);
    expect(beats[0].actors).toEqual(['a1', 'a2']);
  });

  test('a leader beat rings the Leader thumbnail rather than a unit', () => {
    const beats = buildCpuBeats(['uses an ability'], 0, [
      { kind: 'leaderAbility', name: 'L', targetIid: 'e1', logAt: 1 },
    ]);
    expect(beats[0].leaderActing).toBe(true);
    expect(beats[0].targets).toEqual(['e1']);
    expect(beats[0].actors).toEqual([]);
  });

  test('hand-stamped reaction events line up the same way as playTurn events', () => {
    // runCpuClashReactions stamps `logAt` itself (reactionPlays has no
    // wrapper doing it) — two reaction plays over four log lines.
    const [a, b] = Object.keys(POOL_BY_ID);
    const beats = buildCpuBeats(['r0', 'r1', 'r2', 'r3'], 100, [
      invokeEvent(102, a),
      invokeEvent(104, b),
    ]);
    expect(beats.map((x) => x.cardId)).toEqual([a, a, b, b]);
  });
});
