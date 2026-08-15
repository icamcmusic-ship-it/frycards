/**
 * Chaos monkey: instead of the AI's *sensible* play, drive both seats with
 * RANDOM legal actions — random Wellspring colours, random taps, random
 * invokes with random (often nonsensical) targets and bond targets, random
 * attacker sets, random guard assignments, and reaction-window plays by either
 * side. That reaches board states the CPU never builds on purpose: items
 * bonded to about-to-die bodies, mass-weakened fields, clashes resolved with
 * essence still floating, Leaders shattered mid-combat.
 *
 * After every single action it re-asserts the engine's hard invariants — no
 * duplicated instances, no negative essence, no zombie units sitting at lethal
 * damage, no vitality above the cap — and requires every game to terminate.
 *
 * fuzz.test.ts covers the other two angles: AI-vs-AI soak, and hostile input.
 */
import { describe, expect, test } from 'vitest';
import {
  GameState,
  PlayerId,
  createGame,
  mulberry32,
  playWellspring,
  tapLocationForEssence,
  invokeCard,
  invokeLeader,
  canInvoke,
  canInvokeLeader,
  activateLeaderAbility,
  declareAttackers,
  declareGuards,
  resolveClash,
  endPhase,
  legalAttackers,
  legalGuardsFor,
  wellspringChoices,
  effGrit,
  effMight,
  rebondItem,
  mulliganHand,
  opponentOf,
} from './engine';
import { buildDeck, randomArchetype } from './decks';
import { POOL_BY_ID } from './cardpool';
import { LEADER_HP } from './cards';
import { COLORS } from './colors';

const SEATS: PlayerId[] = ['P1', 'P2'];
// Each seed is a full random-action match with a per-action invariant sweep;
// 60 keeps the suite quick while still covering thousands of turns. A stress
// pass raises it without editing this file:
//
//   CHAOS_SEEDS=500 npx vitest run src/game/v3/chaos.test.ts
const SEEDS = Math.max(1, Number(process.env.CHAOS_SEEDS) || 60);

function check(g: GameState, where: string) {
  const seen = new Set<string>();
  for (const pid of SEATS) {
    const p = g.players[pid];
    expect(p.vitality, `${where} vit`).toBeLessThanOrEqual(LEADER_HP);
    expect(Number.isFinite(p.vitality), `${where} vit finite`).toBe(true);
    for (const t of COLORS) expect(p.essence[t] ?? 0, `${where} essence`).toBeGreaterThanOrEqual(0);
    for (const z of [p.deck, p.hand, p.ashPile, p.voidPile])
      for (const c of z) {
        expect(seen.has(c.iid), `${where} dup ${c.iid}`).toBe(false);
        seen.add(c.iid);
      }
    for (const u of p.field) {
      expect(seen.has(u.iid), `${where} dup unit ${u.iid}`).toBe(false);
      seen.add(u.iid);
      expect(u.owner, `${where} owner`).toBe(pid);
      expect(u.damage, `${where} dmg<grit`).toBeLessThan(Math.max(1, effGrit(g, u) + 1));
      expect(effMight(g, u), `${where} might>=0`).toBeGreaterThanOrEqual(0);
      // a live unit must not be sitting at lethal damage after checks settle
      if (!(u.def.keywords ?? []).includes('Unbreakable')) {
        expect(
          u.damage < effGrit(g, u) || effGrit(g, u) === 0,
          `${where} zombie unit ${u.def.name}`,
        ).toBe(true);
      }
      expect(u.items.length, `${where} item runaway`).toBeLessThan(30);
    }
    expect(p.leader.resolve, `${where} resolve`).toBeGreaterThanOrEqual(0);
  }
  if (g.clash) expect(['guards', 'reaction', 'done']).toContain(g.clash.step);
}

describe('chaos monkey — random legal actions', () => {
  test('random-action games stay consistent and terminate', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rng = mulberry32(seed * 13);
      const g = createGame(
        buildDeck(randomArchetype(rng)),
        buildDeck(randomArchetype(rng)),
        POOL_BY_ID,
        {
          rng: mulberry32(seed * 7),
          firstPlayer: seed % 2 ? 'P1' : 'P2',
        },
      );
      if (rng() < 0.3) mulliganHand(g, 'P1');
      if (rng() < 0.3) mulliganHand(g, 'P2');
      let steps = 0;
      while (!g.winner && steps < 4000) {
        steps++;
        const pid = g.active;
        const p = g.players[pid];
        const r = rng();
        if (g.clash && g.clash.step === 'guards') {
          // random guards
          const assign: Record<string, string[]> = {};
          const used = new Set<string>();
          for (const a of g.clash.attackers) {
            const legal = legalGuardsFor(g, a).filter((u) => !used.has(u.iid));
            if (legal.length && rng() < 0.6) {
              const n = rng() < 0.5 ? 1 : Math.min(2, legal.length);
              const pick = legal.slice(0, n).map((u) => u.iid);
              pick.forEach((i) => used.add(i));
              assign[a] = pick;
            }
          }
          if (!declareGuards(g, assign)) declareGuards(g, {});
          check(g, `s${seed} guards`);
          continue;
        }
        if (g.clash && g.clash.step === 'reaction') {
          // either side may fire quick effects; just resolve most of the time
          if (rng() < 0.25) {
            const side = rng() < 0.5 ? pid : opponentOf(pid);
            const sp = g.players[side];
            for (const l of sp.locations)
              if (!l.exhausted && rng() < 0.5) tapLocationForEssence(g, side, l.iid);
            const c = sp.hand.find((h) => canInvoke(g, side, h.iid));
            if (c) invokeCard(g, side, c.iid);
          }
          resolveClash(g);
          check(g, `s${seed} resolve`);
          continue;
        }
        if (g.clash && g.clash.step === 'done') {
          endPhase(g);
          check(g, `s${seed} endclash`);
          continue;
        }
        if (g.phase === 'Clash') {
          const atk = legalAttackers(g, pid);
          if (atk.length && rng() < 0.7) {
            const chosen = atk.filter(() => rng() < 0.7).map((u) => u.iid);
            if (chosen.length) {
              declareAttackers(g, chosen);
              check(g, `s${seed} declare`);
              continue;
            }
          }
          endPhase(g);
          check(g, `s${seed} skipclash`);
          continue;
        }
        // main phases
        if (r < 0.2) {
          const ch = wellspringChoices(g, pid);
          playWellspring(g, pid, ch[Math.floor(rng() * ch.length)]);
        } else if (r < 0.45) {
          const loc = p.locations.filter((l) => !l.exhausted);
          if (loc.length) tapLocationForEssence(g, pid, loc[Math.floor(rng() * loc.length)].iid);
        } else if (r < 0.6) {
          if (canInvokeLeader(g, pid)) invokeLeader(g, pid);
          else activateLeaderAbility(g, pid, Math.floor(rng() * 2));
        } else if (r < 0.85) {
          const playable = p.hand.filter((c) => canInvoke(g, pid, c.iid));
          if (playable.length) {
            const c = playable[Math.floor(rng() * playable.length)];
            const targets = [...g.players.P1.field, ...g.players.P2.field].map((u) => u.iid);
            invokeCard(g, pid, c.iid, {
              targetIid: rng() < 0.5 ? targets[Math.floor(rng() * targets.length)] : undefined,
              bondTargetIid: p.field.length
                ? p.field[Math.floor(rng() * p.field.length)].iid
                : undefined,
            });
          }
          if (p.unbondedItems.length && p.field.length)
            rebondItem(g, pid, p.unbondedItems[0].iid, p.field[0].iid);
        } else {
          endPhase(g);
        }
        check(g, `s${seed} main`);
      }
      expect(steps, `seed ${seed} did not terminate`).toBeLessThan(4000);
    }
  }, 600_000);
});
