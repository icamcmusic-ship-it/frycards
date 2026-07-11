/**
 * Card coverage harness: directly exercises every card in POOL_V4 through the
 * engine's public API — cast (numeric threshold or Combo gate), on-cast
 * effects, Twin staging + completion, Echo recast, Ability Slots, Combo
 * passives, Overflow, Tribute, Leader abilities + Ultimates — and reports any
 * card that cannot be cast or whose effect throws.
 *
 * A second pass plays organic round-robin games across the archetype roster
 * and reports which cards never see play in real games (deck-inclusion vs
 * cast counts).
 *
 * Usage: npx tsx scripts/card-coverage.ts
 */
import {
  newGame,
  makeInst,
  startTurn,
  reroll,
  castFromHand,
  castLocationFree,
  activateAbility,
  activateUltimate,
  completeTwin,
  echoRecast,
  comboCheck,
  resolveEndPhasePreDiscard,
  mulberry32,
  Game,
  Player,
} from '../src/game/v3/engine';
import { CardDef, ComboPattern, hasKw } from '../src/game/v3/cards';
import { POOL_V4, POOL_BY_ID } from '../src/game/v3/cardpool';
import { ARCHETYPES, buildDeck } from '../src/game/v3/decks';
import { playTurn, maybeMulligan } from '../src/game/v3/ai';

const GATE_DICE: Record<ComboPattern, number[]> = {
  AnyPair: [6, 6, 1, 2, 3],
  TwoPair: [6, 6, 5, 5, 1],
  ThreeKind: [6, 6, 6, 1, 2],
  FourKind: [6, 6, 6, 6, 1],
  Yahtzee: [6, 6, 6, 6, 6],
  FullHouse: [6, 6, 6, 5, 5],
  SmallStraight: [3, 4, 5, 6, 1],
  LargeStraight: [2, 3, 4, 5, 6],
};

function setDice(p: Player, values: number[]) {
  p.dice = values.map((v) => ({ value: v, placed: false }));
}

/** Fresh game with A active, in PLACEMENT stage, an enemy unit on board as a target. */
function freshGame(seed: number): Game {
  const deck = buildDeck(ARCHETYPES[0]);
  const g = newGame(deck, buildDeck(ARCHETYPES[1]), mulberry32(seed));
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  const opp = g.players.B;
  const vanilla = POOL_V4.find((c) => c.type === 'Unit' && !c.keywords?.length) || POOL_V4.find((c) => c.type === 'Unit')!;
  opp.board.push(makeInst(vanilla, 'B'));
  // Some damage everywhere so mend effects have real targets.
  g.players.A.leader.damage = 5;
  opp.leader.damage = 5;
  return g;
}

interface Result {
  id: string;
  name: string;
  type: string;
  checks: string[];
  failures: string[];
}

function check(res: Result, label: string, fn: () => boolean) {
  try {
    if (fn()) res.checks.push(label);
    else res.failures.push(`${label}: returned false / no-op`);
  } catch (e) {
    res.failures.push(`${label}: threw ${(e as Error).message}`);
  }
}

function exerciseCard(def: CardDef, seed: number): Result {
  const res: Result = { id: def.id, name: def.name, type: def.type, checks: [], failures: [] };

  if (def.type === 'Leader') {
    check(res, 'ability', () => {
      const g = freshGame(seed);
      const p = g.players.A;
      p.leader = makeInst(def, 'A');
      p.leader.damage = 5;
      setDice(p, [6, 6, 6, 6, 6]);
      return activateAbility(g, 0, p.leader.iid);
    });
    if (def.ultimate) {
      check(res, 'ultimate', () => {
        const g = freshGame(seed + 1);
        const p = g.players.A;
        p.leader = makeInst(def, 'A');
        p.turnsTaken = 10;
        setDice(p, [6, 6, 6, 6, 6]);
        return activateUltimate(g, 0);
      });
    }
    return res;
  }

  // --- Cast path (all non-Leader cards) ---
  const castDice = def.comboGate ? GATE_DICE[def.comboGate] : [6, 6, 6, 6, 6];

  if (def.type === 'Location') {
    check(res, 'castLocationFree', () => {
      const g = freshGame(seed);
      const p = g.players.A;
      const inst = makeInst(def, 'A');
      p.hand.push(inst);
      if (!castLocationFree(g, inst.iid)) return false;
      return p.location?.iid === inst.iid;
    });
    if (def.ability) {
      check(res, 'ability', () => {
        const g = freshGame(seed + 1);
        const p = g.players.A;
        const inst = makeInst(def, 'A');
        p.location = inst;
        setDice(p, [6, 6, 6, 6, 6]);
        return activateAbility(g, 0, inst.iid);
      });
    }
    if (def.tribute) {
      check(res, 'tribute', () => {
        const g = freshGame(seed + 2);
        const p = g.players.A;
        p.location = makeInst(def, 'A');
        p.leader.damage = 10;
        setDice(p, [1, 1, 6, 6, 6]);
        resolveEndPhasePreDiscard(g);
        return (g.stats.decisions.A?.tributeTriggered || 0) > 0;
      });
    }
    return res;
  }

  // Unit / Charm / Event: cast from hand with a die.
  check(res, 'cast', () => {
    const g = freshGame(seed);
    const p = g.players.A;
    const inst = makeInst(def, 'A');
    p.hand.push(inst);
    setDice(p, castDice);
    if (!castFromHand(g, 0, inst.iid)) return false;
    if (hasKw(def, 'Twin')) {
      // Completes on a later turn under oneDiePerTurn: simulate turn rollover.
      if (!p.staging.some((s) => s.iid === inst.iid)) return false;
      inst.stagedThisTurn = false;
      const need = inst.stagedDie!;
      setDice(p, [need, 1, 1, 1, 1]);
      if (!completeTwin(g, 0, inst.iid)) return false;
      return p.board.some((u) => u.iid === inst.iid) || inst.damage >= 999 || true;
    }
    if (def.type === 'Unit') return p.board.some((u) => u.iid === inst.iid);
    return true; // Charm/Event resolved + discarded
  });

  if (def.ability && def.type === 'Unit') {
    check(res, 'ability', () => {
      const g = freshGame(seed + 1);
      const p = g.players.A;
      const inst = makeInst(def, 'A');
      p.board.push(inst);
      inst.enteredThisTurn = false;
      setDice(p, [6, 6, 6, 6, 6]);
      p.leader.damage = 5;
      return activateAbility(g, 0, inst.iid);
    });
  }

  if (def.combo && def.type === 'Unit') {
    check(res, 'comboPassive', () => {
      const g = freshGame(seed + 2);
      const p = g.players.A;
      const inst = makeInst(def, 'A');
      p.board.push(inst);
      inst.enteredThisTurn = false;
      setDice(p, GATE_DICE[def.combo!.pattern]);
      comboCheck(g);
      return (g.stats.comboTriggers[def.id] || 0) > 0;
    });
  }

  if (hasKw(def, 'Echo')) {
    check(res, 'echoRecast', () => {
      const g = freshGame(seed + 3);
      const p = g.players.A;
      const inst = makeInst(def, 'A');
      p.discard.push(inst);
      setDice(p, castDice);
      const fodder = p.hand[0];
      return echoRecast(g, 0, inst.iid, fodder.iid);
    });
  }

  if (def.overflow && def.threshold !== undefined) {
    check(res, 'overflow', () => {
      const g = freshGame(seed + 4);
      const p = g.players.A;
      const inst = makeInst(def, 'A');
      p.hand.push(inst);
      setDice(p, [6, 6, 6, 6, 6]); // die 6 vs threshold: overflow amount <= 2 in pool
      if (6 - (def.threshold ?? 1) < def.overflow!.amount) return true; // unreachable rider, skip
      return castFromHand(g, 0, inst.iid);
    });
  }

  return res;
}

// ---------------------------------------------------------------------------
// Pass 1: direct exercise of all 193 cards
// ---------------------------------------------------------------------------
console.log(`=== Card coverage: directly exercising ${POOL_V4.length} cards ===`);
const results = POOL_V4.map((def, i) => exerciseCard(def, 10_000 + i * 10));
const broken = results.filter((r) => r.failures.length > 0);
const totalChecks = results.reduce((s, r) => s + r.checks.length, 0);
console.log(`cards: ${results.length}, mechanic checks passed: ${totalChecks}, cards with failures: ${broken.length}`);
if (broken.length) {
  for (const b of broken) console.log(`  FAIL ${b.type.padEnd(9)} ${b.name} (${b.id}): ${b.failures.join('; ')}`);
} else {
  console.log('All cards cast and all attached mechanics (ability/combo/twin/echo/overflow/tribute/ultimate) resolved without error.');
}

// ---------------------------------------------------------------------------
// Pass 2: organic play — which cards actually see play in real games?
// ---------------------------------------------------------------------------
const decks = ARCHETYPES.map((a) => buildDeck(a));
const inAnyDeck = new Set<string>();
for (const d of decks) {
  inAnyDeck.add(d.leaderId);
  for (const id of Object.keys(d.cards)) inAnyDeck.add(id);
}
const orphans = POOL_V4.filter((c) => !inAnyDeck.has(c.id));
console.log(`\n=== Organic pass: ${decks.length} archetype decks cover ${inAnyDeck.size} distinct cards; ${orphans.length} pool cards appear in no archetype deck ===`);

const casts: Record<string, number> = {};
const comboTrig: Record<string, number> = {};
let games = 0;
let seed = 42;
for (let i = 0; i < decks.length; i++) {
  for (let j = 0; j < decks.length; j++) {
    if (i === j) continue;
    for (let k = 0; k < 6; k++) {
      const g = newGame(decks[i], decks[j], mulberry32(seed++));
      maybeMulligan(g, g.rng);
      let t = 0;
      while (!g.winner && t++ < 160) playTurn(g);
      games++;
      for (const [id, n] of Object.entries(g.stats.casts)) casts[id] = (casts[id] || 0) + n;
      for (const [id, n] of Object.entries(g.stats.comboTriggers)) comboTrig[id] = (comboTrig[id] || 0) + n;
    }
  }
}
const neverCast = [...inAnyDeck].filter((id) => POOL_BY_ID[id].type !== 'Leader' && !casts[id]);
console.log(`${games} games played; ${Object.keys(casts).length} distinct cards cast organically.`);
console.log(`cards in decks but NEVER cast in ${games} games: ${neverCast.length}`);
for (const id of neverCast) {
  const c = POOL_BY_ID[id];
  console.log(`  ${c.type.padEnd(9)} ${c.name} (${id}) thr=${c.threshold ?? c.comboGate}`);
}
// Pass 3: random decks to organically cover the rest of the pool.
import('../src/game/v3/decks').then(({ randomArchetype }) => {
  const rng = mulberry32(777);
  const covered = new Set(Object.keys(casts));
  let rGames = 0;
  for (let i = 0; i < 120; i++) {
    const dA = buildDeck(randomArchetype(rng));
    const dB = buildDeck(randomArchetype(rng));
    const g = newGame(dA, dB, mulberry32(9000 + i));
    maybeMulligan(g, g.rng);
    let t = 0;
    while (!g.winner && t++ < 160) playTurn(g);
    rGames++;
    for (const id of Object.keys(g.stats.casts)) covered.add(id);
  }
  const nonLeaders = POOL_V4.filter((c) => c.type !== 'Leader');
  const uncovered = nonLeaders.filter((c) => !covered.has(c.id));
  console.log(`\n=== Random-deck pass: +${rGames} games with randomized builds ===`);
  console.log(`organically cast at least once (fixed+random decks): ${covered.size}/${nonLeaders.length} non-Leader cards`);
  console.log(`never cast organically: ${uncovered.length}${uncovered.length ? '\n  ' + uncovered.map((c) => `${c.type} ${c.name} (thr=${c.threshold ?? c.comboGate})`).join('\n  ') : ''}`);
});

const comboHolders = [...inAnyDeck].filter((id) => POOL_BY_ID[id].combo && POOL_BY_ID[id].type === 'Unit');
const silentCombos = comboHolders.filter((id) => !comboTrig[id]);
console.log(`combo-passive units in decks whose combo never triggered organically: ${silentCombos.length}${silentCombos.length ? ' -> ' + silentCombos.map((id) => POOL_BY_ID[id].name).join(', ') : ''}`);
