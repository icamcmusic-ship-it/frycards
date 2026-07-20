/**
 * v4.7 ablation harness. The v4.6 findings (§5.1/§5.2) showed that lever-
 * pulling on an overperforming archetype's *label* keyword fails when the
 * deck's real engine is something else. This script pits the four
 * problem archetypes (Shinobi Avenge Grind + the three durability stacks)
 * against a fixed opponent roster, once per ablation arm, turning exactly
 * ONE engine dial per arm via SIM_TUNING. Whichever dial actually moves the
 * archetype's win rate is the mechanic that powers it.
 *
 * Usage: npx tsx scripts/simulate-ablation.ts [gamesPerPairing]
 */
import { newGame, mulberry32, DeckDef, SIM_TUNING } from '../src/game/v3/engine';
import { playTurn, maybeMulligan } from '../src/game/v3/ai';
import { Archetype, buildDeck } from '../src/game/v3/decks';
import { rebuildPool } from '../src/game/v3/cardpool';

// The archetypes under the microscope (copied verbatim from simulate-v4.ts
// so results are comparable):
const SUBJECTS: Archetype[] = [
  {
    label: 'Shinobi Avenge Grind',
    leaderId: 'apex_nanite_shinobi',
    keywords: ['Avenge', 'Toll'],
    effects: ['mend', 'sap'],
    units: 19,
    spells: 7,
    locations: 4,
    comboFamily: 'none',
  },
  {
    label: 'Shinobi Steel-Scrap Control',
    leaderId: 'apex_nanite_shinobi',
    keywords: ['Steel', 'Scrap'],
    effects: ['destroy', 'bind'],
    units: 16,
    spells: 10,
    locations: 4,
    comboFamily: 'none',
  },
  {
    label: 'Mer King Guard-Bulwark Turtle',
    leaderId: 'mer_king',
    keywords: ['Guard', 'Bulwark'],
    effects: ['mend', 'destroy'],
    units: 19,
    spells: 7,
    locations: 4,
    comboFamily: 'none',
  },
  {
    label: 'Sea Witch Ward-Steel Wall',
    leaderId: 'ethereal_sea_witch',
    keywords: ['Ward', 'Steel'],
    effects: ['bind', 'mend'],
    units: 18,
    spells: 8,
    locations: 4,
    comboFamily: 'none',
  },
];

// Round-2 subjects: the roster-floor ramp decks + Diver Rally Tempo.
SUBJECTS.push(
  {
    label: 'Sea Witch Anchor-Scrap Ramp',
    leaderId: 'ethereal_sea_witch',
    keywords: ['Anchor', 'Scrap'],
    effects: ['draw', 'bind'],
    units: 15,
    spells: 12,
    locations: 3,
    comboFamily: 'none',
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
    label: 'Abyss Excavate Ramp',
    leaderId: 'avatar_of_the_abyss',
    keywords: ['Anchor', 'Scrap'],
    effects: ['sap', 'draw'],
    units: 14,
    spells: 11,
    locations: 5,
    comboFamily: 'none',
  },
  {
    label: 'Diver Rally Tempo',
    leaderId: 'legendary_diver',
    keywords: ['Rally', 'Swift'],
    effects: ['buff', 'draw'],
    units: 17,
    spells: 9,
    locations: 4,
    comboFamily: 'match',
  },
);

// v4.8 deck-level ablation of Shinobi Avenge Grind (findings v4.7 §4.1):
// same list-shape under a different Leader (isolates the Shinobi kit), and
// the same Leader with the mend package stripped (isolates the wall/mend
// engine). Whichever variant collapses names the real power source.
SUBJECTS.push(
  {
    label: 'AvengeGrind-DiverLdr',
    leaderId: 'legendary_diver',
    keywords: ['Avenge', 'Toll'],
    effects: ['mend', 'sap'],
    units: 19,
    spells: 7,
    locations: 4,
    comboFamily: 'none',
  },
  {
    label: 'AvengeGrind-noMend',
    leaderId: 'apex_nanite_shinobi',
    keywords: ['Avenge', 'Toll'],
    effects: ['sap'],
    units: 19,
    spells: 7,
    locations: 4,
    comboFamily: 'none',
  },
  {
    label: 'AvengeGrind-noGuard',
    leaderId: 'apex_nanite_shinobi',
    keywords: ['Avenge', 'Toll', 'Swift'],
    effects: ['mend', 'sap'],
    units: 14,
    spells: 12,
    locations: 4,
    comboFamily: 'none',
  },
);

// A fixed, varied opponent roster (mid-tier decks from the main sim — not
// the other subjects, so subject-vs-subject mirror noise doesn't pollute
// the read):
const OPPONENTS: Archetype[] = [
  {
    label: 'Abyss Sap-Echo Control',
    leaderId: 'avatar_of_the_abyss',
    keywords: ['Echo', 'Toll'],
    effects: ['sap', 'destroy'],
    units: 15,
    spells: 11,
    locations: 4,
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
    label: 'Mer King Twin Heal',
    leaderId: 'mer_king',
    keywords: ['Guard', 'Twin'],
    effects: ['mend', 'buff'],
    units: 16,
    spells: 10,
    locations: 4,
    comboFamily: 'match',
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
    label: 'Abyss Twin Value',
    leaderId: 'avatar_of_the_abyss',
    keywords: ['Twin', 'Rally'],
    effects: ['draw', 'buff'],
    units: 16,
    spells: 10,
    locations: 4,
    comboFamily: 'match',
  },
];

interface Arm {
  name: string;
  apply: () => void;
}
const DEFAULTS = { ...SIM_TUNING };
const ARMS: Arm[] = [
  { name: 'baseline', apply: () => {} },
  { name: 'tollCap 3->1', apply: () => (SIM_TUNING.tollCap = 1) },
  { name: 'avengeCap 2->0', apply: () => (SIM_TUNING.avengeCap = 0) },
  { name: 'steelMult 1->0.5', apply: () => (SIM_TUNING.steelMult = 0.5) },
  { name: 'mendMult 1->0.5', apply: () => (SIM_TUNING.mendMult = 0.5) },
  // Round 2 (v4.7): the round-1 read was that NO labeled keyword powers the
  // top decks — the shared trait is unit-heavy/low-draw lists in a meta
  // where 24% of games end in instant deck-out losses. Fatigue converts the
  // attrition endgame into damage instead of a coin-flip-by-deck-size.
  { name: 'deckout fatigue', apply: () => (SIM_TUNING.deckout = 'fatigue') },
  { name: 'fatigue+steel.5', apply: () => { SIM_TUNING.deckout = 'fatigue'; SIM_TUNING.steelMult = 0.5; } },
  { name: 'anchorDraw', apply: () => (SIM_TUNING.anchorCapBonusDraw = true) },
  { name: 'fatigue+anchDraw', apply: () => { SIM_TUNING.deckout = 'fatigue'; SIM_TUNING.anchorCapBonusDraw = true; } },
  // Round 3 (v4.7, run AFTER the Twin/Steel print nerfs + AI fixes landed):
  { name: 'anchorHp+1', apply: () => (SIM_TUNING.anchorHpBonus = 1) },
  { name: 'fat+anchorHp+2', apply: () => { SIM_TUNING.deckout = 'fatigue'; SIM_TUNING.anchorHpBonus = 2; } },
  // Round 4 (v4.8): Echo fodder economics (findings v4.7 §4.3). The
  // momentumOff arm ran here once and led to Momentum's outright removal.
  { name: 'echoNoFodder', apply: () => (SIM_TUNING.echoWaiveAllFodder = true) },
  // Round 5 (v4.9): the wall-list meta (v4.8 findings §4 item 1) — three
  // independent levers on the cheap-durable-body list shape the harness's
  // new density-vs-win correlation confirmed (low density 46.2% vs high
  // density 58.4%, same baseline pass). These three mutate mapUnit()'s
  // CARD-BUILD math, not something read live during play, so they need the
  // pool actually rebuilt to take effect — see `poolAffecting` below.
  { name: 'exactCostCap 1.5->1.0', apply: () => (SIM_TUNING.exactCostBudgetCap = 1.0) },
  // v4.10: live default is now 2 (shipped in v4.9) — this arm's label
  // updated to match; the old 'guardHpBonus 3->2' arm is gone, since it's
  // now a no-op against the live baseline (was only meaningful pre-v4.9).
  { name: 'guardHpBonus 2->1', apply: () => (SIM_TUNING.guardHpBonus = 1) },
  { name: 'durableBodyTax +1', apply: () => (SIM_TUNING.durableBodyTax = 1) },
  { name: 'durableBodyTax +2', apply: () => (SIM_TUNING.durableBodyTax = 2) },
  // Round 6 (v4.10, v4.9 findings §4 item 5): Locations' persistent small
  // negative isolated contribution (-0.5 to -1.3 win% every pass since
  // v4.4) never had its own dedicated ablation arm before — only the
  // general keyword/wall-list levers happened to touch it in passing. These
  // three isolate each of the three Location-only levers independently
  // (the on-cast board-impact buff, Excavate's per-turn rate, Foothold's
  // Cast Slot discount) so whichever one actually moves the isolated
  // Location-vs-stripped number is identifiable instead of guessed.
  { name: 'locOnCastBuff 2->3', apply: () => (SIM_TUNING.locOnCastBuffBase = 3) },
  { name: 'excavateRate 2->3', apply: () => (SIM_TUNING.excavateRate = 3) },
  { name: 'footholdDiscount 1->2', apply: () => (SIM_TUNING.footholdDiscount = 2) },
  {
    name: 'locBundle (all 3)',
    apply: () => {
      SIM_TUNING.locOnCastBuffBase = 3;
      SIM_TUNING.excavateRate = 3;
      SIM_TUNING.footholdDiscount = 2;
    },
  },
];
// Arms whose dial only takes effect once the pool is rebuilt from templates
// (mapUnit()-time math) — every other arm's dial is read live during play.
const POOL_AFFECTING_ARMS = new Set([
  'exactCostCap 1.5->1.0',
  'guardHpBonus 2->1',
  'durableBodyTax +1',
  'durableBodyTax +2',
  'locOnCastBuff 2->3',
  'excavateRate 2->3',
  'locBundle (all 3)',
]);

const PER_PAIR = parseInt(process.argv[2] || '60', 10);
const MAX_TURNS = 160;

function play(a: DeckDef, b: DeckDef, seed: number): 'A' | 'B' | 'none' {
  const rng = mulberry32(seed);
  const g = newGame(a, b, rng, { twinMode: 'sameTurn' });
  maybeMulligan(g, rng);
  let rounds = 0;
  while (!g.winner && rounds < MAX_TURNS) {
    playTurn(g);
    rounds++;
  }
  return g.winner === 'A' || g.winner === 'B' ? g.winner : 'none';
}

const subjectDecks = SUBJECTS.map((s) => ({ label: s.label, deck: buildDeck(s) }));
const oppDecks = OPPONENTS.map((o) => buildDeck(o));

console.log(
  `=== v4.7 ablation: ${SUBJECTS.length} subjects x ${OPPONENTS.length} opponents x ${PER_PAIR}/pairing x2 sides, per arm ===`,
);
const header = ['arm'.padEnd(18), ...subjectDecks.map((s) => s.label.slice(0, 22).padStart(24))];
console.log(header.join(''));

for (const arm of ARMS) {
  Object.assign(SIM_TUNING, DEFAULTS);
  arm.apply();
  if (POOL_AFFECTING_ARMS.has(arm.name)) rebuildPool();
  const cells: string[] = [];
  for (const subj of subjectDecks) {
    let w = 0,
      n = 0;
    let seed = 90_000;
    for (const opp of oppDecks) {
      for (let k = 0; k < PER_PAIR; k++) {
        const r1 = play(subj.deck, opp, seed++);
        if (r1 !== 'none') {
          n++;
          if (r1 === 'A') w++;
        }
        const r2 = play(opp, subj.deck, seed++);
        if (r2 !== 'none') {
          n++;
          if (r2 === 'B') w++;
        }
      }
    }
    cells.push(`${((100 * w) / n).toFixed(1)}% (n=${n})`.padStart(24));
  }
  console.log(arm.name.padEnd(18) + cells.join(''));
}
Object.assign(SIM_TUNING, DEFAULTS);
rebuildPool();
