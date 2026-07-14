/**
 * v4.2 playtest harness. Plays a round-robin across a wide variety of
 * archetype decks (built from the remapped real card pool), with an advanced
 * CPU (mulligan + deck-aware reroll + combo/lethal-aware placement & combat).
 *
 * Two passes:
 *  1. Twin A/B/C test (errata B): the same deck roster run three times, once
 *     per TwinMode ('oneDiePerTurn' v4.1 baseline, 'sameTurn' fix 1,
 *     'stagedPassive' fix 2), isolating which fix actually resolves the
 *     -22pt Twin regression before picking a default.
 *  2. Full report using the winning Twin mode: leader/archetype win rates,
 *     first-player edge, game length, isolated Location contribution,
 *     per-card usage/impact, decision->win correlation (incl. Echo broken
 *     out by rarity, and the new v4.2 keywords), combo/mechanic activity.
 *
 * Usage: npx tsx scripts/simulate-v4.ts [gamesPerPairing]
 */
import { newGame, mulberry32, Game, DeckDef, remainingHp, TwinMode } from '../src/game/v3/engine';
import { playTurn, maybeMulligan } from '../src/game/v3/ai';
import { Archetype, buildDeck } from '../src/game/v3/decks';
import { POOL_BY_ID, poolByType } from '../src/game/v3/cardpool';

// A varied roster of archetypes across all six real Leaders — sim-only (the
// player-facing "prebuilt archetype" deck picker was removed from the app;
// this fixed, hand-tuned roster is kept here purely so balance simulations
// stay comparable run-over-run).
const ARCHETYPES: Archetype[] = [
  {
    label: 'Abyss Echo-Recursion',
    leaderId: 'avatar_of_the_abyss',
    keywords: ['Echo', 'Twin'],
    effects: ['draw', 'sap'],
    units: 17,
    spells: 9,
    locations: 4,
    comboFamily: 'match',
  },
  {
    label: 'Abyss Sap Burn',
    leaderId: 'avatar_of_the_abyss',
    keywords: ['Frenzy', 'Pierce'],
    effects: ['sap', 'destroy'],
    units: 15,
    spells: 12,
    locations: 3,
    comboFamily: 'none',
  },

  {
    label: 'Sea Witch Bind-Control',
    leaderId: 'ethereal_sea_witch',
    keywords: ['Ward', 'Anchor'],
    effects: ['bind', 'destroy', 'draw'],
    units: 16,
    spells: 11,
    locations: 3,
    comboFamily: 'straight',
  },
  {
    label: 'Sea Witch Anchor-Ramp',
    leaderId: 'ethereal_sea_witch',
    keywords: ['Anchor', 'Ward'],
    effects: ['draw', 'bind'],
    units: 18,
    spells: 8,
    locations: 4,
    comboFamily: 'none',
  },

  {
    label: 'Mer King Guard-Wall',
    leaderId: 'mer_king',
    keywords: ['Guard', 'Ward'],
    effects: ['mend', 'destroy'],
    units: 18,
    spells: 8,
    locations: 4,
    comboFamily: 'none',
  },
  {
    label: 'Mer King Heal-Midrange',
    leaderId: 'mer_king',
    keywords: ['Guard', 'Twin'],
    effects: ['mend', 'buff'],
    units: 16,
    spells: 10,
    locations: 4,
    comboFamily: 'match',
  },

  {
    label: 'Diver Straight-Combo',
    leaderId: 'legendary_diver',
    keywords: ['Swift', 'Frenzy'],
    effects: ['sap', 'draw'],
    units: 15,
    spells: 12,
    locations: 3,
    comboFamily: 'straight',
  },
  {
    label: 'Diver Aggro-Swift',
    leaderId: 'legendary_diver',
    keywords: ['Frenzy', 'Swift', 'Pierce'],
    effects: ['sap'],
    units: 19,
    spells: 8,
    locations: 3,
    comboFamily: 'none',
  },

  {
    label: 'Crimson Frenzy-Aggro',
    leaderId: 'crimson_vector_commander',
    keywords: ['Frenzy', 'Pierce', 'Guard'],
    effects: ['sap'],
    units: 19,
    spells: 8,
    locations: 3,
    comboFamily: 'none',
  },
  {
    label: 'Crimson Match-Combo',
    leaderId: 'crimson_vector_commander',
    keywords: ['Guard', 'Frenzy'],
    effects: ['sap', 'buff'],
    units: 16,
    spells: 11,
    locations: 3,
    comboFamily: 'match',
  },

  {
    label: 'Shinobi Tempo-Anchor',
    leaderId: 'apex_nanite_shinobi',
    keywords: ['Anchor', 'Echo', 'Swift'],
    effects: ['buff', 'sap'],
    units: 17,
    spells: 10,
    locations: 3,
    comboFamily: 'none',
  },
  {
    label: 'Shinobi Echo-Straight',
    leaderId: 'apex_nanite_shinobi',
    keywords: ['Echo', 'Anchor'],
    effects: ['draw', 'sap'],
    units: 16,
    spells: 11,
    locations: 3,
    comboFamily: 'straight',
  },
];

const PER_PAIR = parseInt(process.argv[2] || '20', 10);
const MAX_TURNS = 160;

interface Entry {
  key: string;
  label: string;
  leaderId: string;
  deck: DeckDef;
  hasLoc: boolean;
}

function buildRoster(): Entry[] {
  const decks: Entry[] = [];
  for (const arch of ARCHETYPES) {
    const d = buildDeck(arch);
    decks.push({
      key: arch.label,
      label: arch.label,
      leaderId: arch.leaderId,
      deck: d,
      hasLoc: true,
    });
    const stripped: Record<string, number> = {};
    let removed = 0;
    for (const [id, n] of Object.entries(d.cards)) {
      if (POOL_BY_ID[id].type === 'Location') {
        removed += n;
        continue;
      }
      stripped[id] = n;
    }
    if (removed > 0) {
      const fillers = poolByType('Unit')
        .filter((u) => !stripped[u.id])
        .sort((a, b) => (a.threshold ?? 3) - (b.threshold ?? 3));
      let need = removed;
      for (const u of fillers) {
        if (need <= 0) break;
        const c = Math.min(3, need);
        stripped[u.id] = c;
        need -= c;
      }
      decks.push({
        key: arch.label + ' [noLoc]',
        label: arch.label + ' [noLoc]',
        leaderId: arch.leaderId,
        deck: { ...d, cards: stripped },
        hasLoc: false,
      });
    }
  }
  return decks;
}

const DECISION_KEYS = [
  'locationCast',
  'faceAttack',
  'unitAttack',
  'earlyFaceAttack',
  'boardWipe',
  'echoRecast',
  'echoRecast_low',
  'echoRecast_mid',
  'echoRecast_high',
  'twinComplete',
  'twinStagedPassive',
  'leaderAbility',
  'ultimateUsed',
  'aftershockQueued',
  'aftershockResolved',
  'tributeTriggered',
  'wentFirst',
  'mulliganed',
];

interface SuiteResult {
  games: number;
  draws: number;
  timeouts: number;
  deckouts: number;
  firstWins: number;
  totalRounds: number;
  roundBuckets: Record<string, number>;
  leaderW: Record<string, number>;
  leaderN: Record<string, number>;
  archW: Record<string, number>;
  archN: Record<string, number>;
  locW: { loc: number; locN: number; noloc: number; nolocN: number };
  cardCast: Record<string, number>;
  cardInWinDeck: Record<string, number>;
  cardInDeck: Record<string, number>;
  comboTriggers: Record<string, number>;
  echoRecasts: number;
  twinCompletions: number;
  twinAbandons: number;
  scraps: number;
  rallies: number;
  wardBlocks: number;
  dicePitched: number;
  diceWasted: number;
  attacks: number;
  bulwarkReduced: number;
  tollReduced: number;
  decisionAgg: Record<string, { pw: number; pn: number; aw: number; an: number }>;
  errors: string[];
}

function newResult(): SuiteResult {
  return {
    games: 0,
    draws: 0,
    timeouts: 0,
    deckouts: 0,
    firstWins: 0,
    totalRounds: 0,
    roundBuckets: {},
    leaderW: {},
    leaderN: {},
    archW: {},
    archN: {},
    locW: { loc: 0, locN: 0, noloc: 0, nolocN: 0 },
    cardCast: {},
    cardInWinDeck: {},
    cardInDeck: {},
    comboTriggers: {},
    echoRecasts: 0,
    twinCompletions: 0,
    twinAbandons: 0,
    scraps: 0,
    rallies: 0,
    wardBlocks: 0,
    dicePitched: 0,
    diceWasted: 0,
    attacks: 0,
    bulwarkReduced: 0,
    tollReduced: 0,
    decisionAgg: {},
    errors: [],
  };
}

function deckSize(d: DeckDef): number {
  return Object.values(d.cards).reduce((a, b) => a + b, 0);
}
function invariants(g: Game, sizeA: number, sizeB: number, errors: string[]) {
  const sizes: Record<string, number> = { A: sizeA, B: sizeB };
  for (const p of Object.values(g.players)) {
    if (g.winner) break;
    for (const u of p.board)
      if (remainingHp(g, u) <= 0) errors.push(`dead unit on board: ${u.def.name}`);
    if (p.hand.length > 6 && g.active !== p.id) errors.push(`hand overflow ${p.hand.length}`);
    if (p.leader.damage < 0) errors.push('negative leader damage');
    const total =
      p.deck.length +
      p.hand.length +
      p.discard.length +
      p.banished.length +
      p.staging.length +
      p.board.length +
      (p.location ? 1 : 0);
    if (total !== sizes[p.id]) errors.push(`card drift ${total}!=${sizes[p.id]}`);
    // Ward-usage sanity: only a Ward-keyword card can ever have wardUsed set.
    for (const u of [...p.board, p.leader, ...(p.location ? [p.location] : [])]) {
      if (u.wardUsed && !(u.def.type === 'Unit' && u.def.keywords?.includes('Ward'))) {
        errors.push(`wardUsed set on non-Ward card: ${u.def.name}`);
      }
      // abilityDie should only ever be resting on a card whose Ability Slot is
      // marked used — this is what Rally reads to steal a die, and it's also
      // what would have caught activateUltimate() ever setting abilityDie on
      // the Leader (letting Rally illegally pull a die off an Ultimate use).
      if (u.abilityDie !== undefined && !u.abilityUsed) {
        errors.push(`abilityDie set without abilityUsed: ${u.def.name}`);
      }
    }
  }
}

function runGame(
  r: SuiteResult,
  decks: Entry[],
  a: Entry,
  b: Entry,
  seed: number,
  twinMode: TwinMode,
) {
  const rng = mulberry32(seed);
  const g = newGame(a.deck, b.deck, rng, { twinMode });
  const mull = maybeMulligan(g, rng);
  const sizeA = deckSize(a.deck),
    sizeB = deckSize(b.deck);
  const firstPlayer = g.active;
  let rounds = 0;
  while (!g.winner && rounds < MAX_TURNS) {
    playTurn(g);
    invariants(g, sizeA, sizeB, r.errors);
    rounds++;
  }
  r.games++;
  r.totalRounds += rounds / 2;
  const bucket = rounds / 2 < 4 ? '<4' : rounds / 2 < 7 ? '4-6' : rounds / 2 < 11 ? '7-10' : '11+';
  r.roundBuckets[bucket] = (r.roundBuckets[bucket] || 0) + 1;

  if (!g.winner) {
    r.timeouts++;
    return;
  }
  if (g.winner !== 'draw') {
    for (const pid of ['A', 'B'] as const) {
      const won = g.winner === pid;
      const d = g.stats.decisions[pid] || {};
      for (const key of DECISION_KEYS) {
        let present: boolean;
        if (key === 'wentFirst') present = firstPlayer === pid;
        else if (key === 'mulliganed') present = !!mull[pid];
        else present = (d[key] || 0) > 0;
        const agg = (r.decisionAgg[key] ||= { pw: 0, pn: 0, aw: 0, an: 0 });
        if (present) {
          agg.pn++;
          if (won) agg.pw++;
        } else {
          agg.an++;
          if (won) agg.aw++;
        }
      }
    }
  }
  if (g.winner === 'draw') {
    r.draws++;
  } else {
    if (g.winner === firstPlayer) r.firstWins++;
    const winSide = g.winner as 'A' | 'B';
    const winEntry = winSide === 'A' ? a : b;
    const loseEntry = winSide === 'A' ? b : a;
    r.leaderW[winEntry.leaderId] = (r.leaderW[winEntry.leaderId] || 0) + 1;
    r.leaderN[winEntry.leaderId] = (r.leaderN[winEntry.leaderId] || 0) + 1;
    r.leaderN[loseEntry.leaderId] = (r.leaderN[loseEntry.leaderId] || 0) + 1;
    r.archW[winEntry.key] = (r.archW[winEntry.key] || 0) + 1;
  }
  r.archN[a.key] = (r.archN[a.key] || 0) + 1;
  r.archN[b.key] = (r.archN[b.key] || 0) + 1;
  if (g.log.some((l) => l.includes('decked out'))) r.deckouts++;

  for (const [entry, side] of [
    [a, 'A'],
    [b, 'B'],
  ] as const) {
    const won = g.winner === side;
    if (entry.hasLoc) {
      r.locW.locN++;
      if (won) r.locW.loc++;
    } else {
      r.locW.nolocN++;
      if (won) r.locW.noloc++;
    }
  }

  const s = g.stats;
  r.echoRecasts += s.echoRecasts;
  r.twinCompletions += s.twinCompletions;
  r.twinAbandons += s.twinAbandons;
  r.scraps += s.scraps;
  r.rallies += s.rallies;
  r.wardBlocks += s.wardBlocks;
  r.dicePitched += s.dicePitched;
  r.diceWasted += s.diceWasted;
  r.attacks += s.attacks;
  r.bulwarkReduced += s.bulwarkReduced;
  r.tollReduced += s.tollReduced;
  for (const [id, n] of Object.entries(s.comboTriggers))
    r.comboTriggers[id] = (r.comboTriggers[id] || 0) + n;
  for (const [id, n] of Object.entries(s.casts)) r.cardCast[id] = (r.cardCast[id] || 0) + n;
  for (const [entry, side] of [
    [a, 'A'],
    [b, 'B'],
  ] as const) {
    const won = g.winner === side;
    for (const id of Object.keys(entry.deck.cards)) {
      r.cardInDeck[id] = (r.cardInDeck[id] || 0) + 1;
      if (won) r.cardInWinDeck[id] = (r.cardInWinDeck[id] || 0) + 1;
    }
  }
}

function runSuite(
  decks: Entry[],
  perPair: number,
  twinMode: TwinMode,
  seedBase: number,
): SuiteResult {
  const r = newResult();
  let seed = seedBase;
  for (let i = 0; i < decks.length; i++) {
    for (let j = 0; j < decks.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < perPair; k++) runGame(r, decks, decks[i], decks[j], seed++, twinMode);
    }
  }
  return r;
}

const pct = (w: number, n: number) => (n ? ((100 * w) / n).toFixed(1) : '—');

// ---------------------------------------------------------------------------
// Pass 1: Twin A/B/C test (errata B) — isolate which fix actually works.
// ---------------------------------------------------------------------------
const roster = buildRoster();
const abPerPair = Math.max(4, Math.floor(PER_PAIR / 2));
console.log(`\n=== Twin A/B/C test: ${abPerPair}/pairing per mode, ${roster.length} decks ===`);
const modes: TwinMode[] = ['oneDiePerTurn', 'sameTurn', 'stagedPassive'];
const abResults: Record<TwinMode, SuiteResult> = {} as any;
for (const mode of modes) {
  abResults[mode] = runSuite(roster, abPerPair, mode, 5000 + modes.indexOf(mode) * 100000);
}
console.log(
  'Mode'.padEnd(16),
  'games'.padStart(7),
  'TwinComplete did%'.padStart(19),
  'did-not%'.padStart(10),
  'delta'.padStart(8),
  '(n did)',
);
for (const mode of modes) {
  const r = abResults[mode];
  const decisive = r.games - r.draws - r.timeouts;
  const d = r.decisionAgg['twinComplete'] || { pw: 0, pn: 0, aw: 0, an: 0 };
  const withP = d.pn ? (100 * d.pw) / d.pn : NaN;
  const without = d.an ? (100 * d.aw) / d.an : NaN;
  const delta = withP - without;
  console.log(
    mode.padEnd(16),
    `${decisive}`.padStart(7),
    (isNaN(withP) ? ' n/a' : withP.toFixed(1)).padStart(19),
    (isNaN(without) ? ' n/a' : without.toFixed(1)).padStart(10),
    (isNaN(delta) ? ' n/a' : (delta >= 0 ? '+' : '') + delta.toFixed(1)).padStart(8),
    `(${d.pn})`,
  );
}
console.log(
  `(Twin completions logged: oneDiePerTurn=${abResults.oneDiePerTurn.twinCompletions}, sameTurn=${abResults.sameTurn.twinCompletions}, stagedPassive=${abResults.stagedPassive.twinCompletions})`,
);
console.log('\nTwin-heavy archetype win rate by mode (decks that draft Twin cards):');
for (const label of ['Abyss Echo-Recursion', 'Mer King Heal-Midrange']) {
  const cells = modes.map((mode) => {
    const r = abResults[mode];
    return `${mode}=${pct(r.archW[label] || 0, r.archN[label] || 0)}%`;
  });
  console.log(`  ${label.padEnd(24)} ${cells.join('  ')}`);
}

// Pick the mode whose twinComplete delta is least negative (closest to neutral/positive).
const deltaOf = (mode: TwinMode) => {
  const d = abResults[mode].decisionAgg['twinComplete'] || { pw: 0, pn: 0, aw: 0, an: 0 };
  const withP = d.pn ? (100 * d.pw) / d.pn : 0;
  const without = d.an ? (100 * d.aw) / d.an : 0;
  return d.pn > 0 ? withP - without : -999;
};
const winningMode = modes.slice().sort((x, y) => deltaOf(y) - deltaOf(x))[0];
console.log(
  `\n=> Selected Twin mode for the full report: '${winningMode}' (highest twinComplete win-delta of the three).`,
);

// ---------------------------------------------------------------------------
// Pass 2: full report using the winning Twin mode.
// ---------------------------------------------------------------------------
const R = runSuite(roster, PER_PAIR, winningMode, 1000);

console.log(
  `\n\n=== v4.2 Full Playtest Report (twinMode='${winningMode}'): ${R.games} games, ${roster.length} decks (${ARCHETYPES.length} archetypes +Location-stripped twins), ${PER_PAIR}/pairing ===`,
);
console.log(
  `avg length: ${(R.totalRounds / R.games).toFixed(1)} rounds   draws: ${R.draws}   deckouts: ${R.deckouts}   timeouts@${MAX_TURNS}t: ${R.timeouts}`,
);
console.log(`first-player win rate: ${pct(R.firstWins, R.games - R.draws - R.timeouts)}%`);
console.log('game-length distribution (rounds):', R.roundBuckets);

console.log("\n--- Leader win rates (aggregated over that leader's archetypes) ---");
for (const l of Object.keys(R.leaderN).sort(
  (a, b) => (R.leaderW[b] || 0) / R.leaderN[b] - (R.leaderW[a] || 0) / R.leaderN[a],
)) {
  console.log(
    `${POOL_BY_ID[l].name.padEnd(26)} ${pct(R.leaderW[l] || 0, R.leaderN[l])}%  (n=${R.leaderN[l]})`,
  );
}

console.log('\n--- Archetype win rates (Location decks only) ---');
for (const a of ARCHETYPES) {
  console.log(
    `${a.label.padEnd(28)} ${pct(R.archW[a.label] || 0, R.archN[a.label] || 0)}%  (n=${R.archN[a.label] || 0})`,
  );
}

console.log('\n--- ISOLATED Location contribution ---');
console.log(`Location decks:        ${pct(R.locW.loc, R.locW.locN)}%  (n=${R.locW.locN})`);
console.log(`Location-stripped:     ${pct(R.locW.noloc, R.locW.nolocN)}%  (n=${R.locW.nolocN})`);
console.log(
  `=> Locations are worth ${((100 * R.locW.loc) / R.locW.locN - (100 * R.locW.noloc) / R.locW.nolocN).toFixed(1)} win% vs. filling their slots with cheap Units`,
);

console.log('\n--- Mechanic activity (totals) ---');
console.log({
  echoRecasts: R.echoRecasts,
  twinCompletions: R.twinCompletions,
  twinAbandons: R.twinAbandons,
  scraps: R.scraps,
  rallies: R.rallies,
  wardBlocks: R.wardBlocks,
  attacks: R.attacks,
  bulwarkReduced: R.bulwarkReduced,
  tollReduced: R.tollReduced,
});
console.log(
  `Pitch (v4.0): dice pitched for Mend 1 = ${R.dicePitched}; truly wasted (leader full) = ${R.diceWasted}`,
);
console.log(
  `avg dice pitched+wasted per player-turn: ${((R.dicePitched + R.diceWasted) / (R.totalRounds * 2)).toFixed(2)}`,
);

console.log('\n--- Decision -> win correlation (win% when the player DID vs DID NOT do it) ---');
const decRows = DECISION_KEYS.map((k) => {
  const d = R.decisionAgg[k] || { pw: 0, pn: 0, aw: 0, an: 0 };
  const withP = d.pn ? (100 * d.pw) / d.pn : NaN;
  const without = d.an ? (100 * d.aw) / d.an : NaN;
  return { k, withP, without, delta: withP - without, pn: d.pn, an: d.an };
}).sort((a, b) => Math.abs(isNaN(b.delta) ? 0 : b.delta) - Math.abs(isNaN(a.delta) ? 0 : a.delta));
for (const r of decRows) {
  const sign = r.delta >= 0 ? '+' : '';
  console.log(
    `${r.k.padEnd(20)} did=${isNaN(r.withP) ? ' n/a' : r.withP.toFixed(1).padStart(5)}%  did-not=${isNaN(r.without) ? ' n/a' : r.without.toFixed(1).padStart(5)}%  delta=${isNaN(r.delta) ? ' n/a' : sign + r.delta.toFixed(1) + 'pt'}  (did n=${r.pn})`,
  );
}
console.log(
  '\n(Echo broken out by rarity of the card recast — see echoRecast_low/mid/high above.)',
);

console.log('\n--- Combo passive triggers ---');
console.log(
  Object.fromEntries(
    Object.entries(R.comboTriggers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([id, n]) => [POOL_BY_ID[id]?.name || id, n]),
  ),
);

const rows = Object.keys(R.cardInDeck)
  .filter((id) => POOL_BY_ID[id].type !== 'Leader' && R.cardInDeck[id] >= 40)
  .map((id) => ({
    name: POOL_BY_ID[id].name,
    type: POOL_BY_ID[id].type,
    winPct: (100 * (R.cardInWinDeck[id] || 0)) / R.cardInDeck[id],
    castsPerGame: (R.cardCast[id] || 0) / R.cardInDeck[id],
    n: R.cardInDeck[id],
  }));
console.log('\n--- Most likely OP (highest win% in deck, min n=40) ---');
for (const r of [...rows].sort((a, b) => b.winPct - a.winPct).slice(0, 12))
  console.log(
    `${r.name.padEnd(26)} ${r.type.padEnd(9)} win%=${r.winPct.toFixed(1).padStart(5)} casts/g=${r.castsPerGame.toFixed(2)} (n=${r.n})`,
  );
console.log('\n--- Most "useless" (lowest cast rate / lowest win%) ---');
for (const r of [...rows]
  .sort((a, b) => a.castsPerGame - b.castsPerGame || a.winPct - b.winPct)
  .slice(0, 12))
  console.log(
    `${r.name.padEnd(26)} ${r.type.padEnd(9)} casts/g=${r.castsPerGame.toFixed(2)} win%=${r.winPct.toFixed(1)} (n=${r.n})`,
  );

console.log(
  R.errors.length
    ? `\n!!! ${[...new Set(R.errors)].length} invariant violation types:\n  ${[...new Set(R.errors)].slice(0, 10).join('\n  ')}`
    : '\nNo invariant violations.',
);
