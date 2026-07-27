/**
 * Fry Cards v5.0 card pool, built from the universal card catalog (live
 * Supabase `cards` table, or the bundled fallback in `generated-cards.ts`).
 *
 * Each card's CORE IDENTITY is untouched — name, image URL, flavor text,
 * rarity, set. Every card is assigned its v5 mechanics (Essence Cost,
 * Might/Grit, subtype, keywords, effects, Leader Resolve + abilities)
 * deterministically from a hash of its id plus its type and rarity, so the
 * whole set is playable under the rulebook and the assignment is identical
 * on every client.
 *
 * MUST NOT import engine.ts (spec contract).
 */
import type {
  CardDef,
  CharmSubtype,
  Effect,
  EssenceCost,
  EventSubtype,
  LeaderAbility,
  TriggeredAbility,
} from './cards';
import { totalCost } from './cards';
import type { CardTemplate } from '../../types';
import { GENERATED_CARDS } from '../generated-cards';
import { COLORS, KEYWORDS_OF_COLOR, LEADER_COLORS, NEW_KEYWORD_OF_COLOR, Color } from './colors';
import { KEYWORD_COST, KEYWORD_TEXT, Keyword, isKeyword } from './keywords';

// ---------------------------------------------------------------------------
// Deterministic hashing — FNV-1a, same util style as the v4.x pool, so the
// assignment is stable per card id and identical on every client.
// ---------------------------------------------------------------------------
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const pick = <T>(seed: string, salt: number, arr: T[]): T => arr[(hash(seed) + salt) % arr.length];
/** Uniform integer in [0, n) from a salted hash of the card's seed. */
const roll = (seed: string, salt: string, n: number): number => hash(`${seed}:${salt}`) % n;

const RARITY_TIER: Record<string, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  'Super-Rare': 3,
  'Ultra-Rare': 4,
  'Full-Art': 5,
  // Alt-Art (v7.0) is a separately-illustrated alternate PRINTING of an
  // existing card — collectibility-rarer than Full-Art (see rarity.ts's
  // RARITY_ORDER), but not meant to be a stronger card, so it shares
  // Full-Art's stat-budget tier rather than getting its own higher one.
  'Alt-Art': 5,
  Mythic: 6,
};

/** Per-card hash seed: id + type + rarity, per the spec. */
const seedOf = (c: CardTemplate): string => `${c.id}|${c.type}|${c.rarity ?? 'Common'}`;

/**
 * Per-card total-cost adjustments derived from sim outliers.
 *
 * v6.6 RESET. Every entry here is a single point, in the direction the sims
 * measured. The multi-point stacks this table carried through v6.2-v6.5 were
 * compensating for a lever that did not work: COST_ADJUST fed the same cost
 * figure that Units/Events/Charms derive their stat budget and effect
 * magnitude from, so an adjustment moved a card's power in lockstep with its
 * price and barely changed its win rate (see naturalTotalFor below for the
 * full mechanism and the evidence). Adjustments were therefore stacked to two
 * and three points chasing a number that could not move, printing cards like
 * a cost-1 1/1 (helix_swarm, after three "buffs") and a cost-5 1/1
 * (clockwork_nautilus, after two).
 *
 * With the lever fixed — COST_ADJUST now changes price only — those stacks
 * would over-apply, so each is reset to one point and re-derived from the
 * v6.6 runs. `sunken_archive` is dropped entirely: its v6.2 -1 has since
 * overshot into a +17.6 residual (the single card driving the Sacred keyword
 * flag across three passes).
 *
 * Locations are the exception to the reset and keep their earned stacks:
 * mapLocation never derived any power from cost (its passive, its trigger
 * magnitude and its Bountiful yield are all fixed), so COST_ADJUST was
 * already a clean price-only lever there and those points were real.
 *
 * Entries are added only for outliers whose Wilson 95% interval excludes
 * their own in-deck baseline (`costAbilityOutliersSignificant` in the
 * harness) — the v6.2-v6.5 z-score list was blind to sample size, which is
 * what let three small-n cards overshoot into the opposite sign.
 */
const COST_ADJUST: Record<string, number> = {
  // --- nerfs: cost up, power unchanged ---
  // v6.7: the only cost-ability outlier this pass to clear BOTH gates — the
  // Wilson-CI-excludes-baseline bar AND reproduces with the same sign in
  // both cohorts (+7.7 residual, n=508, cohort A; +15.8, n=491, cohort B).
  // v6.9: `boneplate_sentinel`'s v6.7 +1 is RETIRED, not carried. That nerf
  // was earned specifically as "a Venomous cost-5 Unit"; the v6.9 keyword
  // pass re-printed the card as a Withering cost-5 Unit, so the property the
  // adjustment was measured against is gone. Left un-adjusted for the next
  // pass to re-derive from the card as it now prints.
  // v6.9: +2 -> +3. Reproduces as an overperformer in both cohorts
  // (+13.1 n=87 / +11.0 n=385) — a Sanctum that ramps AND pings every Dusk.
  abyssal_pathway: +3,
  // v6.9 new: a cost-1 Sanctum that ramps AND sweeps every enemy unit for 1
  // at Dusk. Both cohorts (+14.4 n=206 / +12.8 n=470).
  galleon_shipwreck: +1,
  amber_sphere: +1,
  ashhound_pack: +1,
  black_coral_thicket: +1,
  caldera_harvest_works: +1,
  chalice_of_quicksilver: +1,
  clawblade_greatsword: +1,
  constellation_crabs: +1,
  cracked_wastes: +1,
  crowned_manatee: +1,
  deceptive_angler: +1,
  dissolving_persona: +1,
  fissure_gas_bunker: +1,
  gearbone_sentinel: +1,
  glass_kelp_forest: +2,
  glass_shrimp: +1,
  haunted_submarine: +1,
  heart_coral: +1,
  jawbone_span: +2,
  kinetic_anchor_monolith: +1,
  kinetic_siphon_swarm: +1,
  kinetix_blacksite_cavern: +1,
  kraken_s_monolith: +1,
  // v6.9: this entry is INERT and kept only as a signpost. The card prints at
  // total cost 7 (base 6 + Reckless surcharge 1), so mapUnit's 1..7 clamp
  // swallows any raise — a +2 trial re-ran byte-identical (+9.7 / +10.5, the
  // same residuals as +1). Actioned through STAT_ADJUST instead; see there.
  kunoichi_of_the_magma_rings: +1,
  magma_conduit_network: +2,
  merfolk_ritual: +1,
  nanite_culture_lab: +2,
  nebula_clutch: +1,
  needle_seamstress: +1,
  neon_moray: +1,
  phosphor_lich: +1,
  pufferfish_lantern: +1,
  // v6.9: +1 -> +2. The pool's strongest per-cost Charm and an outlier in
  // both cohorts (+16.5 n=232 / +17.3 n=357) — a cost-2 Worn Charm granting
  // +1/+0 AND Aerial, re-bondable for 1.
  resonant_shuriken: +2,
  ribcage_titan: +1,
  ribvault_cathedral: +1,
  sand_portal: +2,
  scallop_map: +1,
  shattered_horizon_protagonist: +1,
  shinobi_operations_base: +1,
  skydark_locust_host: +1,
  slate_scaled_serpent: +1,
  smokeveil_striketeam: +1,
  submerged_temple: +1,
  thornfang_vine: +1,
  urnbearer_of_blight: +1,
  violet_haze_kunoichi: +1,
  volcanic_nanite_core: +1,
  worm_brain_host: +1,
  // v6.6: the sole remaining driver of the Sacred keyword flag. Sacred has
  // been outside the +-10 band for four consecutive passes; the new per-card
  // carrier breakdown pins it on two cards, and reverting sunken_archive's
  // overshot v6.2 cut took that one to a flat +0.0 residual. Skull Cathedral
  // is what is left, confirmed positive in BOTH cohorts this pass
  // (+6.6 / +12.6) — a per-card price rise, not another blanket weight cut.
  skull_cathedral: +1,
  // --- buffs: cost down, power unchanged ---
  ashen_circle_rite: -1,
  bioluminescent_tide: -1,
  blood_moon_descent: -1,
  bubble_harvest: -1,
  cavernous_watcher: -1,
  celestial_attunement: -1,
  clockwork_nautilus: -1,
  consuming_ash_cloud: -1,
  coral_collapse: -1,
  flash_freeze: -1,
  floating_jellyfish: -1,
  glowing_manta: -1,
  helix_swarm: -1,
  marble_reef_shark: -1,
  mermaid_statue: -1,
  nanite_purge_protocol: -1,
  obsidian_scalpel: -1,
  porcelain_lobster: -1,
  research_fleet: -1,
  ruthless_succession: -1,
  secret_lair: -2,
  silver_chimera: -1,
  sonic_shatter: -1,
  sovereign_spires_of_arrak_zul: -1,
  submerged_starfall: -1,
  tectonic_rift: -1,
  the_mirrored_trench: -2,
  towering_tsunami: -1,
  zen_decay: -1,
};

const adjustFor = (id: string): number => COST_ADJUST[id] ?? 0;

/**
 * v6.6 — COST_ADJUST is a PRICE-ONLY lever.
 *
 * Units derive their stat budget from their cost (`statBase` in mapUnit),
 * Events derive their effect magnitude from it (`eventEffect`'s `v`), and
 * Charms derive their bond stats from it. Until v6.6 the adjusted cost fed
 * those derivations, so a COST_ADJUST moved the card's POWER in lockstep
 * with its price and was close to balance-neutral in both directions:
 *
 *   -1 cost on an underperformer  ->  cheaper, but weaker: not a buff
 *   +1 cost on an overperformer   ->  pricier, but stronger: not a nerf
 *
 * That is why the v6.2-v6.5 findings docs kept recording adjustments that
 * "didn't take" and had to be stacked to two and three points — and why
 * three of them (heart_of_the_thermal_grid, shatterline,
 * sovereign_spires_of_arrak_zul) overshot into the opposite sign instead.
 * The stacked results speak for themselves at the extremes: helix_swarm
 * (three cuts, intended as a buff) printed as a cost-1 **1/1**, and
 * clockwork_nautilus (two cuts) as a cost-5 **1/1** carrying two keywords,
 * while glass_shrimp (three raises, intended as a nerf) GAINED stats each
 * time and its residual never moved.
 *
 * `naturalTotalFor` returns the cost the card would print at with no
 * adjustment, and every stat/magnitude derivation now uses it. COST_ADJUST
 * therefore changes only what the card costs, making it monotonic: a cut is
 * always a buff, a raise is always a nerf.
 */
function naturalTotalFor(base: number, kwAdj: number, lo = 1, hi = 7): number {
  return Math.max(lo, Math.min(hi, base + kwAdj));
}

/** v5.3: per-card STAT-budget adjustments, for overperformers already at the
 * cost cap of 7 where a COST_ADJUST would be clipped to nothing. */
const STAT_ADJUST: Record<string, number> = {
  nanite_division_marshal: -2, // +8.5/+13.7 residual both seeds at cost 7
  familiar_in_the_dark: -4, // v6.2: +13.2 residual at cost 7 (COST_ADJUST
  // clips to nothing at the ceiling) — trim the stat budget instead. v6.3:
  // STILL +10.3 residual (z=1.87, n=544) after the first -2 — repeat
  // overperformer, third point stacked (-3). v6.4: STILL +10.6 residual
  // (z=1.84, n=139) after that — fourth point stacked.
  // v6.9: +9.7 (n=563) / +10.2 (n=507) — reproduces in both cohorts. Printed
  // at the cost cap of 7 (a 2/7 Unbreakable + Immobile wall), so COST_ADJUST
  // clips to nothing; trim the stat budget instead, same as the three below.
  spectral_leviathan: -2,
  // v6.9: +9.7 (n=154) / +10.5 (n=159), reproducing in both cohorts. A 6/4
  // Reckless body with a 3-damage any-target death trigger, printed at the
  // cost cap of 7 — so COST_ADJUST is provably a no-op here (verified by
  // re-run) and the stat budget is the only live lever.
  kunoichi_of_the_magma_rings: -2,
  wingbone_horror: -3, // v6.4: +10.3 residual, z=1.77, n=336, cost 7 already
  // (COST_ADJUST would clip to nothing at the ceiling) — trim stat budget.
  // v6.5: STILL +8.5 residual (z=1.50, n=336) after that — third point
  // stacked.
};
const statAdjustFor = (id: string): number => STAT_ADJUST[id] ?? 0;

// ---------------------------------------------------------------------------
// Color assignment. Two-color cards must only use pairs some Leader actually
// has (LEADER_COLORS), otherwise they'd be undraftable dead weight — the
// exact bug the v4.16 pool audit found (28/284 cards illegal for every
// Leader). Enforced at assignment time by picking pairs from this list.
// ---------------------------------------------------------------------------
const LEGAL_PAIRS: [Color, Color][] = Object.values(LEADER_COLORS).map(
  (p) => [p[0], p[1]] as [Color, Color],
);

/** Colors for a non-Leader card: [] colorless (~8%), 2 on-pair colors
 * (~15%, more at high rarity), else 1 color. */
function pickColors(seed: string, rt: number): Color[] {
  const r = roll(seed, 'colors', 100);
  if (r < 8) return [];
  const twoChance = 15 + rt * 3; // rarer cards skew multicolor
  if (r < 8 + twoChance) {
    const pair = pick(seed, 7, LEGAL_PAIRS);
    return [...pair];
  }
  return [pick(seed, 3, COLORS)];
}

// ---------------------------------------------------------------------------
// Essence cost. Target total ≈ clamp(1 + rt/2 + spread(0..3), 1, 7), adjusted
// by keyword cost weights (+1 per 2 weight; Immobile's negative weight
// discounts). Pips: 1 per color; "deeply colored" high-rarity single-color
// cards (~20%) print 2 pips of their color. Generic = total - pips.
// ---------------------------------------------------------------------------
function baseTotal(seed: string, rt: number): number {
  const spread = roll(seed, 'spread', 4); // 0..3
  return Math.max(1, Math.min(7, Math.round(1 + rt / 2 + spread)));
}

function keywordCostAdj(keywords: string[]): number {
  let w = 0;
  for (const kw of keywords) if (isKeyword(kw)) w += KEYWORD_COST[kw];
  return Math.round(w / 2);
}

function buildCost(seed: string, colors: Color[], total: number, rt: number): EssenceCost {
  const pips: Partial<Record<Color, number>> = {};
  let pipSum = 0;
  if (colors.length === 1 && rt >= 3 && roll(seed, 'deep', 5) === 0) {
    pips[colors[0]] = 2; // deeply colored high-rarity card
    pipSum = 2;
  } else {
    for (const c of colors) {
      pips[c] = 1;
      pipSum += 1;
    }
  }
  const t = Math.max(total, pipSum);
  return { generic: t - pipSum, pips };
}

// ---------------------------------------------------------------------------
// Color-themed effects (spec themes: Ember damage, Tide draw, Root buff,
// Gale recover/draw, Light heal, Shadow small damage/erode, Void
// banish/erode). `v` is the scaled magnitude for the card's cost.
// ---------------------------------------------------------------------------
/**
 * v6.9 new-generation ability branch. Each Essence Type gained one fresh
 * effect shape on top of its legacy theme; this rolls whether a given card
 * takes it. Kept as its OWN salted roll (rather than widening each colour's
 * existing 2-way roll) so the legacy branches keep the exact indices they
 * had — only the ~1-in-3 of cards that opt in re-print, instead of the whole
 * pool re-rolling and invalidating every per-card balance adjustment.
 */
function takesNewAbility(seed: string, salt: string): boolean {
  return roll(seed, `newfx-${salt}`, 3) === 0;
}

/** The v6.9 ability added to each Essence Type's vocabulary. */
function newThemedEffect(color: Color | undefined, v: number): Effect | undefined {
  const val = Math.max(1, v);
  switch (color) {
    case 'Ember': // sweeping fire, not just a single bolt
      return {
        action: 'damage',
        value: Math.max(1, Math.min(3, Math.ceil(val / 2))),
        target: 'allEnemyUnits',
      };
    case 'Tide': // tempo denial
      return { action: 'exhaust', target: 'enemyUnit' };
    case 'Root': // mass regrowth
      return { action: 'heal', value: val, target: 'allFriendlyUnits' };
    case 'Gale': // gust one blocker out of the way
      return { action: 'exhaust', target: 'enemyUnit' };
    case 'Light': // a blessing over the whole board
      return { action: 'heal', value: Math.max(1, Math.ceil(val / 2)), target: 'allFriendlyUnits' };
    case 'Shadow': // attrition rather than removal
      return {
        action: 'weaken',
        value: Math.max(1, Math.min(3, Math.ceil(val / 2))),
        target: 'enemyUnit',
      };
    case 'Void': // unmake it a piece at a time
      return {
        action: 'weaken',
        value: Math.max(1, Math.min(3, Math.ceil(val / 2))),
        target: 'enemyUnit',
      };
    default:
      return undefined;
  }
}

function themedEffect(seed: string, color: Color | undefined, v: number): Effect {
  const val = Math.max(1, v);
  if (takesNewAbility(seed, 'themed')) {
    const nu = newThemedEffect(color, val);
    if (nu) return nu;
  }
  switch (color) {
    case 'Ember':
      return { action: 'damage', value: val, target: 'anyTarget' };
    case 'Tide':
      return {
        action: 'draw',
        value: Math.max(1, Math.min(3, Math.ceil(val / 2))),
        target: 'none',
      };
    case 'Root':
      return { action: 'buff', value: Math.max(1, Math.ceil(val / 2)), target: 'friendlyUnit' };
    case 'Gale':
      return roll(seed, 'gale-fx', 2) === 0
        ? { action: 'recover', target: 'friendlyUnit' }
        : { action: 'draw', value: 1, target: 'none' };
    case 'Light':
      return { action: 'heal', value: val, target: 'friendlyAny' };
    case 'Shadow':
      return roll(seed, 'shadow-fx', 2) === 0
        ? {
            action: 'damage',
            value: Math.max(1, Math.min(3, Math.ceil(val / 2))),
            target: 'enemyUnit',
          }
        : {
            action: 'erode',
            value: Math.max(1, Math.min(3, Math.ceil(val / 2))),
            target: 'enemyPlayer',
          };
    case 'Void':
      return roll(seed, 'void-fx', 2) === 0
        ? { action: 'erode', value: Math.max(1, Math.min(4, val)), target: 'enemyPlayer' }
        : {
            action: 'damage',
            value: Math.max(1, Math.min(3, Math.ceil(val / 2))),
            target: 'enemyUnit',
          };
    default:
      // Colorless: neutral utility.
      return roll(seed, 'gray-fx', 2) === 0
        ? { action: 'draw', value: 1, target: 'none' }
        : {
            action: 'damage',
            value: Math.max(1, Math.min(2, Math.ceil(val / 2))),
            target: 'enemyUnit',
          };
  }
}

function effectText(e: Effect): string {
  const v = e.value ?? 0;
  switch (e.action) {
    case 'damage':
      if (e.target === 'anyTarget') return `deal ${v} damage to any target`;
      if (e.target === 'allEnemyUnits') return `deal ${v} damage to each enemy unit`;
      if (e.target === 'enemyPlayer') return `deal ${v} damage to the enemy player`;
      return `deal ${v} damage to a target enemy unit`;
    case 'heal':
      if (e.target === 'friendlyPlayer') return `restore ${v} Vitality`;
      if (e.target === 'allFriendlyUnits') return `heal ${v} from each of your units`;
      return `heal ${v} from a friendly unit or yourself`;
    case 'exhaust':
      if (e.target === 'allEnemyUnits') return 'exhaust each enemy unit';
      return 'exhaust a target enemy unit';
    case 'weaken':
      if (e.target === 'allEnemyUnits') return `each enemy unit gets -${v}/-${v}`;
      return `a target enemy unit gets -${v}/-${v}`;
    case 'draw':
      return v === 1 ? 'Deal a card' : `Deal ${v} cards`;
    case 'buff':
      if (e.target === 'allFriendlyUnits') return `your units get +${v}/+${v}`;
      if (e.target === 'self') return `this unit gets +${v}/+${v}`;
      return `a friendly unit gets +${v}/+${v}`;
    case 'shatter':
      if (e.target === 'allEnemyUnits') return 'shatter each enemy unit';
      return 'shatter a target enemy unit';
    case 'banish':
      return 'banish a target enemy unit';
    case 'erode':
      return `erode ${v} (the enemy mills ${v})`;
    case 'recover':
      return 'recover a friendly unit';
    default:
      return '';
  }
}

const TRIGGER_TEXT: Record<TriggeredAbility['when'], string> = {
  enters: 'When this unit enters the field',
  dies: 'When this unit dies',
  dealsClashDamage: 'Whenever this unit deals clash damage',
  atDawn: 'At Dawn',
  atDusk: 'At Dusk',
};

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Unit mapping
// ---------------------------------------------------------------------------
/** Keywords legal on any card regardless of color (colorless picks). */
const NEUTRAL_KEYWORDS: Keyword[] = ['Alert', 'Skywatch', 'Warded', 'Ambush', 'Overrun'];
/** Premium keywords restricted to rt >= 4. */
const PREMIUM = new Set<string>(['Doublestrike', 'Unbreakable']);

function pickUnitKeywords(seed: string, colors: Color[], rt: number): string[] {
  // 0-2 keywords, more at higher rarity.
  const r = roll(seed, 'kwcount', 10);
  let count: number;
  if (rt >= 4) count = r < 2 ? 0 : r < 6 ? 1 : 2;
  else if (rt >= 2) count = r < 3 ? 0 : r < 8 ? 1 : 2;
  else count = r < 5 ? 0 : r < 9 ? 1 : 2;
  if (count === 0) return [];

  const legal = (kw: string) => !PREMIUM.has(kw) || rt >= 4;
  const primaryList = (colors[0] ? KEYWORDS_OF_COLOR[colors[0]] : NEUTRAL_KEYWORDS).filter(legal);
  const out: string[] = [];
  if (primaryList.length) out.push(pick(seed, 9, primaryList) as string);
  if (count >= 2) {
    const secondList = (colors[1] ? KEYWORDS_OF_COLOR[colors[1]] : primaryList).filter(
      (kw) => legal(kw) && !out.includes(kw),
    );
    if (secondList.length) out.push(pick(seed, 13, secondList) as string);
  }
  // v6.9: roughly a quarter of keyword-carrying units swap their PRIMARY
  // keyword for their colour's new-generation one (NEW_KEYWORD_OF_COLOR).
  // A swap, not an addition — an extra keyword would hand those cards a free
  // power bump on top of the new text. Rolled on its own salt so the legacy
  // picks above keep their exact indices and the rest of the pool re-prints
  // identically; the cost surcharge re-derives from KEYWORD_COST either way.
  if (out.length && colors[0] && roll(seed, 'newkw', 100) < 30) {
    const fresh = NEW_KEYWORD_OF_COLOR[colors[0]];
    if (fresh && !out.includes(fresh)) out[0] = fresh;
  }
  // Two-colour cards roll the same substitution for their SECOND keyword
  // against their SECOND colour, so a gold card can carry new-generation text
  // from either half of its identity.
  if (out.length >= 2 && colors[1] && roll(seed, 'newkw2', 100) < 30) {
    const fresh = NEW_KEYWORD_OF_COLOR[colors[1]];
    if (fresh && !out.includes(fresh)) out[1] = fresh;
  }
  return out;
}

function mapUnit(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const colors = pickColors(seed, rt);
  const keywords = pickUnitKeywords(seed, colors, rt);
  const base = baseTotal(seed, rt);
  const kwAdj = keywordCostAdj(keywords);
  const total = Math.max(1, Math.min(7, base + kwAdj + adjustFor(c.id)));
  const cost = buildCost(seed, colors, total, rt);

  // Stats: might+grit ≈ 2*(natural total MINUS the keyword surcharge) +
  // spread. The keyword surcharge must not feed the stat budget — otherwise
  // keywords are free stats (the exact skew the v5.0 sims found: Quickstrike
  // carriers at 80% win). Ember/Gale lean might, Root/Light lean grit.
  // v6.6: derived from the NATURAL (pre-COST_ADJUST) cost so a balance cut
  // lowers only the price, never the body — see naturalTotalFor.
  const naturalT = totalCost(buildCost(seed, colors, naturalTotalFor(base, kwAdj), rt));
  // v6.7 fix: statBase used to be `naturalT - max(0, kwAdj)`, which is only
  // equal to `base` when `base + kwAdj` doesn't hit naturalTotalFor's 1..7
  // clamp. On a two-keyword card whose surcharge pushes base+kwAdj PAST 7,
  // the clamp already caps the price (the card can't actually charge for the
  // full surcharge), but this line still subtracted the FULL kwAdj from the
  // clamped total — docking stats a second time for a surcharge the printed
  // cost never collected. That is what the v6.6 printedBudgetOutliers audit
  // flagged on 8 double-keyword Units (e.g. Iron-Scaled Snail, Topographic
  // Behemoth): a cost-7 card with the stat total of a cost-4/5 card. Off the
  // clamp the two expressions are identical (naturalT - kwAdj = base), so
  // this is a no-op there and only removes the double penalty at the ceiling.
  const statBase = Math.max(1, base);
  const budget = Math.max(
    2,
    2 * statBase + (roll(seed, 'stat-spread', 4) - 1) + statAdjustFor(c.id),
  );
  const primary = colors[0];
  const mightShare =
    primary === 'Ember' || primary === 'Gale'
      ? 0.62
      : primary === 'Root' || primary === 'Light'
        ? 0.38
        : 0.5;
  let might = Math.round(budget * mightShare);
  if (keywords.includes('Immobile')) might = Math.min(might, Math.max(0, Math.floor(budget * 0.3)));
  might = Math.max(0, might);
  const grit = Math.max(1, budget - might);

  const def: CardDef = {
    id: c.id,
    name: c.name,
    type: 'Unit',
    cost,
    might,
    grit,
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
  };
  if (keywords.length) def.keywords = keywords;

  const lines: string[] = [];
  for (const kw of keywords) {
    if (isKeyword(kw)) lines.push(`${kw} — ${KEYWORD_TEXT[kw]}`);
  }

  // ~25% of units carry an on-enter effect or a triggered ability, themed by
  // primary color, scaled to the card's NATURAL cost (v6.6: like the stat
  // budget above, so a COST_ADJUST changes price only — see naturalTotalFor).
  if (roll(seed, 'unit-fx', 4) === 0) {
    const v = Math.max(1, Math.min(4, Math.ceil(naturalT / 2)));
    const fx = themedEffect(seed, primary, v);
    const when = pick(seed, 17, ['enters', 'enters', 'dies', 'atDawn', 'atDusk'] as const);
    if (when === 'enters') {
      def.onInvoke = fx;
      lines.push(`When this unit enters the field, ${effectText(fx)}.`);
    } else {
      def.triggers = [{ when, effect: fx }];
      lines.push(`${TRIGGER_TEXT[when]}, ${effectText(fx)}.`);
    }
  }
  def.text = lines.join(' ');
  return def;
}

// ---------------------------------------------------------------------------
// Event mapping
// ---------------------------------------------------------------------------
function eventEffect(seed: string, color: Color | undefined, t: number, slow: boolean): Effect {
  // Slow events get roughly +1 value for the same cost.
  const v = Math.max(1, Math.min(7, Math.ceil(t * 0.9) + (slow ? 1 : 0)));
  if (takesNewAbility(seed, 'event')) {
    const nu = newThemedEffect(color, v);
    if (nu) return nu;
  }
  switch (color) {
    case 'Void':
      if (t >= 3) return { action: 'banish', target: 'enemyUnit' };
      return { action: 'erode', value: Math.min(4, v), target: 'enemyPlayer' };
    case 'Shadow':
      if (t >= 3) return { action: 'shatter', target: 'enemyUnit' };
      return { action: 'damage', value: Math.min(3, v), target: 'enemyUnit' };
    case 'Ember':
      return { action: 'damage', value: Math.min(6, v), target: 'anyTarget' };
    case 'Tide':
      return { action: 'draw', value: Math.max(1, Math.min(4, Math.ceil(v / 2))), target: 'none' };
    case 'Light':
      return roll(seed, 'light-ev', 2) === 0
        ? { action: 'heal', value: Math.min(6, v + 1), target: 'friendlyAny' }
        : { action: 'buff', value: Math.max(1, Math.ceil(v / 2)), target: 'friendlyUnit' };
    case 'Root':
      return {
        action: 'buff',
        value: Math.max(1, Math.min(3, Math.ceil(v / 3))),
        target: 'allFriendlyUnits',
      };
    case 'Gale':
      return roll(seed, 'gale-ev', 2) === 0
        ? { action: 'recover', target: 'friendlyUnit' }
        : { action: 'draw', value: Math.max(1, Math.min(3, Math.ceil(v / 2))), target: 'none' };
    default:
      return themedEffect(seed, undefined, v);
  }
}

function mapEvent(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const colors = pickColors(seed, rt);
  // v6.0 Event keywords: ~12% Surge (conditional discount), ~8% Resonant
  // (double resolution, rare+ only). Surcharges come from KEYWORD_COST via
  // keywordCostAdj — the effect is scaled from the PRE-surcharge total so it
  // doesn't double a full-cost effect for free.
  const kwRoll = roll(seed, 'ev-kw', 100);
  const keywords: string[] = kwRoll < 14 ? ['Surge'] : kwRoll < 26 && rt >= 1 ? ['Resonant'] : [];
  const kwAdj = keywordCostAdj(keywords);
  const base = baseTotal(seed, rt);
  const total = Math.max(1, Math.min(7, base + adjustFor(c.id) + kwAdj));
  const cost = buildCost(seed, colors, total, rt);
  // v6.6: effect magnitude scales off the NATURAL (pre-COST_ADJUST) cost, so
  // a balance cut makes the Event cheaper without shrinking its effect (and a
  // raise makes it pricier without growing it) — see naturalTotalFor.
  const naturalT = totalCost(buildCost(seed, colors, naturalTotalFor(base, kwAdj), rt));
  const t = Math.max(1, naturalT - kwAdj);
  const subtype: EventSubtype = roll(seed, 'ev-sub', 100) < 45 ? 'Quick' : 'Slow';
  const fx = eventEffect(seed, colors[0], t, subtype === 'Slow');
  const def: CardDef = {
    id: c.id,
    name: c.name,
    type: 'Event',
    subtype,
    cost,
    onInvoke: fx,
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
    text: `${subtype} — ${cap(effectText(fx))}.`,
  };
  if (keywords.length) def.keywords = keywords;
  return def;
}

// ---------------------------------------------------------------------------
// Charm mapping
// ---------------------------------------------------------------------------
function mapCharm(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const colors = pickColors(seed, rt);
  const subtype: CharmSubtype = roll(seed, 'ch-sub', 100) < 60 ? 'Bound' : 'Worn';
  // v6.0 Charm keywords: ~12% Runic (bond cantrip); ~12% of BOUND charms
  // Soulbound (returns to hand when its unit dies). Surcharges come from
  // KEYWORD_COST via keywordCostAdj.
  const kwRoll = roll(seed, 'ch-kw2', 100);
  const charmKws: string[] =
    kwRoll < 12 ? ['Runic'] : kwRoll < 24 && subtype === 'Bound' ? ['Soulbound'] : [];
  const kwAdj = keywordCostAdj(charmKws);
  const base = baseTotal(seed, rt);
  const total = Math.max(1, Math.min(7, base + adjustFor(c.id) + kwAdj));
  const cost = buildCost(seed, colors, total, rt);
  // Bond stats scale from the pre-surcharge total (keywords are never free
  // stats). v6.6: and from the NATURAL (pre-COST_ADJUST) cost, so a balance
  // cut lowers only the price, never the bond — see naturalTotalFor.
  const naturalT = totalCost(buildCost(seed, colors, naturalTotalFor(base, kwAdj), rt));
  const t = Math.max(1, naturalT - kwAdj);

  const statBudget = Math.max(1, t + 1 - (subtype === 'Worn' ? 1 : 0));
  const mShare = roll(seed, 'ch-split', 3); // 0 mighty, 1 even, 2 gritty
  const might =
    mShare === 0
      ? Math.ceil(statBudget * 0.7)
      : mShare === 2
        ? Math.floor(statBudget * 0.3)
        : Math.round(statBudget / 2);
  const grit = Math.max(0, statBudget - might);
  const bond: NonNullable<CardDef['bond']> = {};
  if (might > 0) bond.might = might;
  if (grit > 0) bond.grit = grit;

  // Some charms (~40%) grant an on-color keyword to the bonded unit.
  let grantText = '';
  if (roll(seed, 'ch-kw', 5) < 2) {
    const list = (colors[0] ? KEYWORDS_OF_COLOR[colors[0]] : NEUTRAL_KEYWORDS).filter(
      (kw) => (!PREMIUM.has(kw) || rt >= 4) && kw !== 'Immobile',
    );
    if (list.length) {
      // v6.9: same substitution rule as pickUnitKeywords — a share of Charms
      // now grant their colour's new-generation keyword instead of a legacy one.
      const fresh = colors[0] ? NEW_KEYWORD_OF_COLOR[colors[0]] : undefined;
      const kw =
        fresh && roll(seed, 'ch-newkw', 100) < 26 ? fresh : (pick(seed, 21, list) as string);
      bond.grants = [kw];
      grantText = ` and ${kw}`;
    }
  }

  const def: CardDef = {
    id: c.id,
    name: c.name,
    type: 'Charm',
    subtype,
    cost,
    bond,
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
  };
  if (charmKws.length) def.keywords = charmKws;
  const statText = `+${bond.might ?? 0}/+${bond.grit ?? 0}`;
  if (subtype === 'Worn') {
    def.rebondCost = Math.max(1, Math.ceil(t / 2));
    def.text = `Worn — bonded unit gets ${statText}${grantText}. Re-bond ${def.rebondCost}.`;
  } else {
    def.text = `Bound — bonded unit gets ${statText}${grantText}.`;
  }
  return def;
}

// ---------------------------------------------------------------------------
// Location mapping — every collectible Location is a Sanctum: exhausts for 1
// essence of its type AND carries a static passive or a small trigger.
// ---------------------------------------------------------------------------
function mapLocation(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  // Sanctums are always mono-colored: their produced type IS their identity.
  const produces = pick(seed, 3, COLORS);
  // v6.0 Location keywords: ~12% Bountiful (taps for 2 essence — replaces
  // any other ability), ~14% Sacred (Dawn lifegain). Surcharges come from
  // KEYWORD_COST via keywordCostAdj.
  const kwRoll = roll(seed, 'loc-kw2', 100);
  const locKws: string[] = kwRoll < 12 ? ['Bountiful'] : kwRoll < 26 ? ['Sacred'] : [];
  const kwAdj = keywordCostAdj(locKws);
  // Base total keeps the pre-v6 1..4 clamp so keyword-free Sanctums price
  // identically; the keyword surcharge stacks on top (ceiling 6).
  const total = Math.min(
    6,
    Math.max(
      1,
      Math.min(4, 1 + Math.floor(rt / 2) + roll(seed, 'loc-spread', 2) + adjustFor(c.id)),
    ) + kwAdj,
  );
  const cost: EssenceCost = { generic: total - 1, pips: { [produces]: 1 } };

  const def: CardDef = {
    id: c.id,
    name: c.name,
    type: 'Location',
    subtype: 'Sanctum',
    cost,
    produces,
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
  };
  if (locKws.length) def.keywords = locKws;
  const base = locKws.includes('Bountiful')
    ? `Sanctum — exhaust: add TWO ${produces} essence.`
    : `Sanctum — exhaust: add one ${produces} essence.`;
  if (locKws.includes('Bountiful')) {
    // Bountiful is the whole card: double essence, no second ability.
    def.text = base;
  } else if (roll(seed, 'loc-kind', 2) === 0) {
    def.locPassive = roll(seed, 'loc-passive', 2) === 0 ? 'MIGHT_ALL' : 'GRIT_ALL';
    def.text = `${base} Your units get +1 ${def.locPassive === 'MIGHT_ALL' ? 'Might' : 'Grit'}.`;
  } else {
    const fx = themedEffect(seed, produces, 1);
    const when = pick(seed, 23, ['atDawn', 'atDusk'] as const);
    def.triggers = [{ when, effect: fx }];
    def.text = `${base} ${TRIGGER_TEXT[when]}, ${effectText(fx)}.`;
  }
  return def;
}

// ---------------------------------------------------------------------------
// Leader mapping — identities from LEADER_COLORS; cost 3-4 total (+1 for
// Commander/Resolute, so 3-5) with one pip of each identity color, Resolve 3-6 by
// rarity, and two abilities (a minus spender themed to the first color, and
// a small plus builder).
// ---------------------------------------------------------------------------
function leaderMinusAbility(seed: string, color: Color): LeaderAbility {
  switch (color) {
    case 'Ember':
      return {
        resolveDelta: -1,
        effect: { action: 'damage', value: 2, target: 'anyTarget' },
        text: '-1: Deal 2 damage to any target.',
      };
    case 'Tide':
      return {
        resolveDelta: -1,
        effect: { action: 'draw', value: 1, target: 'none' },
        text: '-1: Deal a card.',
      };
    case 'Root':
      return {
        resolveDelta: -2,
        effect: { action: 'buff', value: 2, target: 'friendlyUnit' },
        text: '-2: A friendly unit gets +2/+2.',
      };
    case 'Gale':
      return {
        resolveDelta: -1,
        effect: { action: 'recover', target: 'friendlyUnit' },
        text: '-1: Recover a friendly unit.',
      };
    case 'Light':
      return {
        resolveDelta: -1,
        effect: { action: 'heal', value: 3, target: 'friendlyAny' },
        text: '-1: Heal 3 from a friendly unit or yourself.',
      };
    case 'Shadow':
      return {
        resolveDelta: -2,
        effect: { action: 'shatter', target: 'enemyUnit' },
        text: '-2: Shatter a target enemy unit.',
      };
    case 'Void':
      return {
        resolveDelta: -2,
        effect: { action: 'banish', target: 'enemyUnit' },
        text: '-2: Banish a target enemy unit.',
      };
  }
}

function leaderPlusAbility(seed: string, color: Color): LeaderAbility {
  switch (color) {
    case 'Tide':
    case 'Gale':
      return {
        resolveDelta: 1,
        effect: { action: 'draw', value: 1, target: 'none' },
        text: '+1: Deal a card.',
      };
    case 'Light':
    case 'Root':
      return {
        resolveDelta: 1,
        effect: { action: 'heal', value: 2, target: 'friendlyPlayer' },
        text: '+1: Restore 2 Vitality.',
      };
    default:
      return {
        resolveDelta: 1,
        effect: { action: 'buff', value: 1, target: 'friendlyUnit' },
        text: '+1: A friendly unit gets +1/+1.',
      };
  }
}

/** v6.2: Leader kit overrides for repeat-offender outliers. mapLeader's
 * output is otherwise fully procedural (hash-derived), with no per-Leader
 * manual lever — this is the Leader-kit equivalent of COST_ADJUST/
 * STAT_ADJUST for regular cards. Avatar of the Abyss stacked max Resolve
 * (Mythic rarity, 6), an unconditional -2 Shatter (better than most other
 * colors' minus abilities), AND the Commander keyword's global +1 Might aura
 * — flagged as an outlier in the v6.1 findings doc (67.0% win rate, "watch")
 * and CONFIRMED as a Leader-kit-level problem (not cohort luck) by the v6.2
 * deckSeed-pinned leaderPairSuite: it beat every other pinned Leader deck
 * (58.3%-100%) and led the random-cohort matchup table at 70.3%. Per the
 * v4.24 precedent (strip a keyword from a repeat-offender once stat/cost
 * trims have nowhere left to go — a Leader has no stat/cost budget to trim),
 * its Commander keyword is stripped here.
 */
const LEADER_KEYWORD_STRIP: Record<string, string[]> = {
  avatar_of_the_abyss: ['Commander'], // v6.2: 67.0% -> 70.3% win rate, repeat offender
  // v6.7: Crimson Vector Commander has read as the #2 (and in some cohorts
  // #1) Leader every pass since v6.1 without ever getting a dedicated look —
  // the 3rd carry-forward pass on this item (v6.6 doc carry-forward #1). Its
  // kit is a cheap, efficient -1: 2-damage-anyTarget removal/reach ability
  // (Resolve 6, only 4 total cost to invoke) PLUS the same Commander
  // keyword (global +1 Might to every friendly unit while the Leader is
  // fielded) that was the first lever pulled on Avatar of the Abyss. The
  // v6.6/v6.7 leaderKitDiagnostics split confirms these are two DIFFERENT
  // engines, not one: Avatar's win rate climbs with game length (52% at
  // <=10 turns to 69-79% at 21+, an attrition kit built around its
  // repeatable -3 Shatter), while Crimson's is the mirror image (82-92% at
  // <=10 turns collapsing to 20-22% at 21+ turns) — a tempo/aggro kit where
  // a permanently buffed board plus cheap reach snowballs early and falls
  // off once the game goes long. Since the SAME aura keyword is implicated
  // and the same lever already proved effective on Avatar, strip Commander
  // here too rather than reach for an untested lever on the first pass.
  crimson_vector_commander: ['Commander'],
};

/** v6.3: Leader-kit minus-ability resolve-cost override — the next lever
 * flagged in the v6.2 carry-forward once a Leader has no keyword left to
 * strip. Avatar of the Abyss's Commander strip (above) brought its
 * random-cohort win rate back to 67.8% (its pre-v6.1-flag level, unchanged),
 * but the v6.3 deckSeed-pinned leaderPairSuite still has it clearly on top
 * (77.4% average across all six pinned opposing Leaders) — its -2 Shatter is
 * simply cheaper than every other color's minus ability of equal power
 * (Void's -2 Banish is the only other removal at that price, and Ember/Tide/
 * Gale/Light minus abilities all cost only -1 for a smaller effect). Bump its
 * Resolve cost -2 -> -3, matching the "trim ability cost efficiency" lever
 * named in the v6.2 doc rather than a further keyword strip. */
const LEADER_MINUS_RESOLVE_OVERRIDE: Record<string, number> = {
  // v6.9: -3 -> -4. Avatar has now topped the Leader spread in BOTH cohorts
  // for three consecutive passes (65.5% / 76.1% here) and the kit
  // diagnostics finally isolate the mechanism the v6.7 carry-forward asked
  // for: it is not a tempo spike (its win rate CLIMBS with game length in
  // both cohorts, to 72.6% and 87.1% past turn 30) but sheer volume — 10.2
  // and 9.0 ability activations per game, the most of any Leader by a clear
  // margin, on an unconditional Shatter. Resolve 6 against a -3 bought two
  // full removals per tank with the +1 builder refilling it; at -4 it buys
  // one, and rebuilding to a second costs four turns of not removing
  // anything. Same lever as v6.3, one point, price-only.
  avatar_of_the_abyss: -4,
  // v6.9: Crimson Vector Commander is the v6.7 carry-forward #2 coming due.
  // That doc applied the Commander strip, said cohort B still read it on top,
  // and named the exact next lever ("the same minus-ability resolve-cost bump
  // used on Avatar in v6.3") to be pulled after one watch pass. This is that
  // pass, and it now finishes FIRST in both cohorts (62.6% / 76.5%), with B
  // having climbed since. The kit diagnostics are unchanged and unambiguous:
  // 87.9-88.6% at <=10 turns collapsing to 23-30% past turn 30 — a tempo
  // spike, driven by an Ember `-1: 2 damage to any target` that Resolve 6
  // pays for six times over. At -2 it gets three, which is still the most
  // reach of any kit but no longer an every-turn faucet.
  crimson_vector_commander: -2,
};

/**
 * v6.9: Leader PLUS-ability override — the buff-side counterpart to the two
 * nerf levers above, added because the Leader spread has a bottom as well as
 * a top and nothing existed to act on it.
 *
 * Ethereal Sea Witch has finished LAST in both cohorts of this pass (35.2%
 * and 25.2%, the widest deficit any Leader has posted) and has never been
 * actioned. The diagnostics rule out misplay: it invokes early (turn 4.6/4.7,
 * the cheapest kit in the game) and activates an ability 8.6-8.9 times per
 * game, more than any Leader except Avatar — it is using its kit constantly
 * and still losing. The cause is structural. Its Tide/Light identity rolls
 * `-1: Deal a card` and `+1: Restore 2 Vitality`: the only kit in the pool
 * with NO board interaction whatsoever, in a game where 92-94% of wins come
 * from reducing Vitality. Drawing and gaining 2 life cannot answer a board.
 *
 * The fix gives it interaction without taking anything away: the plus
 * ability (the dead half — 2 Vitality a turn is close to irrelevant at these
 * win rates) becomes a v6.9 `exhaust`, which is Tide's own tempo-denial
 * identity and, on a resolve-BUILDING ability, is a soft answer rather than
 * removal — the exhausted unit recovers at its controller's next Dawn.
 */
const LEADER_PLUS_ABILITY_OVERRIDE: Record<string, LeaderAbility> = {
  ethereal_sea_witch: {
    resolveDelta: 1,
    effect: { action: 'exhaust', target: 'enemyUnit' },
    text: '+1: Exhaust a target enemy unit.',
  },
  // Ruin-Walker Overseer is the same structural failure with a different
  // shape, also below baseline in both cohorts (43.1% / 31.5%) and also
  // never actioned. Its Root/Void roll produced `-2: A friendly unit gets
  // +2/+2` AND `+1: A friendly unit gets +1/+1` — a kit whose two abilities
  // are the SAME effect at two sizes, so there is nothing to choose between
  // them and no answer to anything the opponent does. The plus side takes
  // the Void half of its identity instead, as v6.9 `weaken`: still a small
  // resolve-building effect, but one that touches the board.
  ruinwalker_overseer: {
    resolveDelta: 1,
    effect: { action: 'weaken', value: 1, target: 'enemyUnit' },
    text: '+1: A target enemy unit gets -1/-1.',
  },
};

function mapLeader(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const identity = LEADER_COLORS[c.id] ?? [pick(seed, 3, COLORS), pick(seed, 11, COLORS)];
  const pips: Partial<Record<Color, number>> = {};
  for (const col of identity) pips[col] = (pips[col] ?? 0) + 1;
  const pipSum = Object.values(pips).reduce((a, b) => a + (b ?? 0), 0);
  // v6.0 Leader keywords: each Leader rolls Commander (+1 Might aura while
  // fielded), Resolute (Resolve regen at Dawn), or neither. Surcharges come
  // from KEYWORD_COST via keywordCostAdj.
  const kwRoll = roll(seed, 'ldr-kw6', 6);
  const stripped = new Set(LEADER_KEYWORD_STRIP[c.id] ?? []);
  const leaderKws: string[] = (kwRoll < 2 ? ['Commander'] : kwRoll < 4 ? ['Resolute'] : []).filter(
    (kw) => !stripped.has(kw),
  );
  const total = 3 + roll(seed, 'ldr-cost', 2) + keywordCostAdj(leaderKws); // 3-5
  const cost: EssenceCost = { generic: Math.max(0, total - pipSum), pips };
  const resolve = Math.max(3, Math.min(6, 3 + Math.floor(rt / 2)));
  const minus = leaderMinusAbility(seed, identity[0]);
  const minusOverride = LEADER_MINUS_RESOLVE_OVERRIDE[c.id];
  if (minusOverride !== undefined) {
    minus.text = minus.text.replace(`${minus.resolveDelta}:`, `${minusOverride}:`);
    minus.resolveDelta = minusOverride;
  }
  const plus = LEADER_PLUS_ABILITY_OVERRIDE[c.id]
    ? { ...LEADER_PLUS_ABILITY_OVERRIDE[c.id] }
    : leaderPlusAbility(seed, identity[1] ?? identity[0]);
  const def: CardDef = {
    id: c.id,
    name: c.name,
    type: 'Leader',
    cost,
    resolve,
    leaderAbilities: [minus, plus],
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
    text: `Leader — Resolve ${resolve}. ${minus.text} ${plus.text}`,
  };
  if (leaderKws.length) def.keywords = leaderKws;
  return def;
}

// ---------------------------------------------------------------------------
// Build the pool
// ---------------------------------------------------------------------------
function mapCard(c: CardTemplate): CardDef {
  switch (c.type) {
    case 'Leader':
      return mapLeader(c);
    case 'Unit':
      return mapUnit(c);
    case 'Location':
      return mapLocation(c);
    case 'Charm':
      return mapCharm(c);
    case 'Event':
      return mapEvent(c);
    default:
      return mapUnit(c);
  }
}

export const POOL_V4: CardDef[] = [];
export const POOL_BY_ID: Record<string, CardDef> = {};
export const POOL_LEADERS: CardDef[] = [];

/**
 * (Re)build the pool from a universal card catalog. Called once at startup
 * with the live Supabase catalog; falls back to the bundled data below.
 * Refuses a pool with no Leaders (a broken fetch shouldn't brick the game).
 */
let lastTemplates: CardTemplate[] = GENERATED_CARDS;
export function applyCardPool(templates: CardTemplate[]): boolean {
  const defs = templates.map(mapCard);
  if (!defs.some((d) => d.type === 'Leader')) return false;
  lastTemplates = templates;
  POOL_V4.length = 0;
  POOL_V4.push(...defs);
  for (const k of Object.keys(POOL_BY_ID)) delete POOL_BY_ID[k];
  for (const d of defs) POOL_BY_ID[d.id] = d;
  POOL_LEADERS.length = 0;
  POOL_LEADERS.push(...defs.filter((d) => d.type === 'Leader'));
  return true;
}

/** Re-derive the pool from the last-loaded template set. */
export function rebuildPool(): boolean {
  return applyCardPool(lastTemplates);
}

// Bundled fallback pool, active until/unless the live catalog loads.
applyCardPool(GENERATED_CARDS);

export function poolByType(t: string): CardDef[] {
  return POOL_V4.filter((c) => c.type === t);
}
export function poolHasKeyword(kw: string): CardDef[] {
  return POOL_V4.filter((c) => c.keywords?.includes(kw));
}
