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
  ItemSubtype,
  Effect,
  EssenceCost,
  EventSubtype,
  LeaderAbility,
  TriggeredAbility,
} from './cards';
import { charmSelfHeal, itemSurvives, totalCost } from './cards';
import type { CardTemplate } from '../../types';
import { GENERATED_CARDS } from '../generated-cards';
import { COLORS, KEYWORDS_OF_COLOR, LEADER_COLORS, NEW_KEYWORD_OF_COLOR, Color } from './colors';
import {
  KEYWORD_COLOR,
  KEYWORD_COST,
  KEYWORD_TEXT,
  Keyword,
  isKeyword,
  keywordsForType,
  V75_KEYWORDS,
} from './keywords';

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

/**
 * v13 renamed the `Charm` card type to `Item`. The mechanics hash is
 * `id|type|rarity`, so taking the new spelling into the seed would have
 * reprinted all 61 Items — different cost, different colours, different
 * keywords — which is a set-wide rebalance, not a rename. The seed therefore
 * keeps the ORIGINAL type spelling: an Item hashes as `Charm` forever.
 *
 * Do not "clean this up". Removing the mapping silently reprints every Item
 * in the pool and puts the bundled catalog, the live database and every sim
 * reading out of parity at once.
 */
const SEED_TYPE: Record<string, string> = { Item: 'Charm' };

/** Per-card hash seed: id + type + rarity, per the spec. */
const seedOf = (c: CardTemplate): string =>
  `${c.id}|${SEED_TYPE[c.type] ?? c.type}|${c.rarity ?? 'Common'}`;

/**
 * Per-card total-cost adjustments derived from sim outliers.
 *
 * v6.6 RESET. Every entry here is a single point, in the direction the sims
 * measured. The multi-point stacks this table carried through v6.2-v6.5 were
 * compensating for a lever that did not work: COST_ADJUST fed the same cost
 * figure that Units/Events/Items derive their stat budget and effect
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
  // v16: `phosphor_lich`'s +1 is RETIRED, not carried. It was documented at
  // its STAT_ADJUST entry as INERT ("prints at the cap of 7, so that entry
  // has never changed anything") and the point was explicitly re-actioned
  // through STAT_ADJUST -2 instead. The v16 surcharge-outside-the-clamp rule
  // would have silently brought it back to life ON TOP of both the stat trim
  // that replaced it and the two newly-collected Doublestrike surcharge
  // points (8 -> 9) — three stacked nerfs where one was earned.
  pufferfish_lantern: +1,
  // v6.9: +1 -> +2. The pool's strongest per-cost Item and an outlier in
  // both cohorts (+16.5 n=232 / +17.3 n=357) — a cost-2 re-bondable Item granting
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
  // v7.2 new: the only overperformer to clear the significance gate in BOTH
  // cohorts this pass (+9.6 n=208 / +8.9 n=314).
  submerged_statue: +1,
  // `stone_bubbles` is deliberately NOT priced, and the four trials that led
  // there are the most useful thing this pass found.
  //
  // It is the dominant Sacred carrier, it clears the significance gate in
  // both cohorts, and cost cannot touch it. Every attempt moved the number
  // the WRONG way:
  //
  //   Sacred 1 -> 3 (+1 cost on all 7 carriers)  delta +24.4/+17.3 -> +25.0/+26.9
  //   stone_bubbles +1 (cost 2 -> 3)             still gated, +12.3, win 70.1%
  //   stone_bubbles +2 (cost 2 -> 4)             cohort A +30.9 (win 77.2%),
  //                                              cohort B +7.9 (win 60.7%)
  //
  // Three points of cost, and the delta never once fell in both cohorts — it
  // rose in A every single time, and the one trial that did move B moved A
  // 23 points the other way. Nothing here reproduces, which is precisely what
  // the two-cohort gate exists to refuse.
  //
  // The wrong-way drift in A is the signature of a SELECTION EFFECT in the
  // metric, not an underpriced card. A Location is ramp: it only ever
  // gets played in games where the essence to play it existed, and a MORE
  // expensive Location is only played in games where MORE ramp existed —
  // which are games the player was already winning. So "win rate conditional
  // on having played it" rises with price by construction, and the harness's
  // archetype-normalized delta inherits that. Pricing Locations against this
  // number will always read as under-nerfing and will always invite another
  // point, which is how `abyssal_pathway` reached +3 and `sand_portal`,
  // `glass_kelp_forest`, `jawbone_span`, `magma_conduit_network` and
  // `nanite_culture_lab` all reached +2.
  //
  // v7.4 built that harness fix (`topOverperformersRampMatched`) and v7.5
  // closed it out: under the ramp-matched correction Locations land on top of
  // Units (+3.28 vs +3.20 in cohort A, +3.27 vs +3.08 in B), so the metric is
  // no longer type-biased and the blanket "no Location takes another cost
  // point" block is lifted. Stone Bubbles is the first card through it: it is
  // STILL an outlier after the correction, in both cohorts (+8.0 n=636 /
  // +9.0 n=491), which is exactly the case the block was there to hold back.
  // ...and it went straight back out again. Trialled at +1 and REVERTED: the
  // ramp-matched residual rose in cohort A (+8.0 -> +8.9) while in cohort B
  // the card fell under the 20-game reporting floor entirely. That is the
  // Sacred weight-raise failure from v7.2 §3 reproducing on one card — a
  // "nerf" that deletes the card from decks rather than pricing it. So the
  // block lifting is real and Stone Bubbles is still not price-responsive;
  // its lever is the Sacred EFFECT, which is v7.2 carry-forward #2 and stays
  // open. Left at its natural cost for the third pass running.
  //
  // v7.5, off the ramp-matched list: +8.9 (n=436) / +7.5 (n=502), a cost-1
  // Sanctum and the cheapest card in either cohort's top five. The one cost
  // point this pass that both moved its card and left it playable
  // (-> +7.8 / +2.6, play counts held at n=446 / n=514).
  cold_fire_volcano: +1,
  // Also trialled at +1 and REVERTED, same failure as stone_bubbles:
  //   glowing_glyph_tablet  +7.4 (n=203) / +6.2 (n=167)  -> under the floor
  //                                                         in BOTH cohorts
  //   amethyst_starfish     +7.8 (n=1515) / +6.3 (n=517) -> +7.6 / +7.5 with
  //                                                         play counts down
  //                                                         3x (n=490 / 391)
  // Recorded together because they make one point: at this pool's curve a
  // single cost point is close to BINARY rather than a smooth nerf — it
  // either does not move the residual or it prices the card out of the format
  // — and a residual measured on a third of the games is not the same
  // measurement. Both carried forward for an effect-side or stat-side lever.
  // v7.5 buff, off the ramp-matched list: -4.5 (n=466) / -6.1 (n=145). Read
  // against the EVENT class mean rather than the pool's: Events sit at -0.53 /
  // -0.71 as a type because a one-shot stops paying the moment it resolves,
  // so an Event has to be several points below THAT to be a real
  // underperformer. See metricDiagnostics.residualByType.
  seabed_mandala: -1,
  // v7.2 new: gated in both cohorts (+9.8 n=162 / +10.9 n=900), and cohort B's
  // sample is the largest of any outlier in either list this pass.
  dr_aries_chief_biogeneticist: +1,
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
  // v7.2: -1 -> -2. The only UNDERperformer to clear the significance gate in
  // both cohorts (-3.8 n=1153 / -3.6 n=1826) — and at those sample sizes the
  // two most-played cards in either outlier list, so the small magnitude is
  // well measured rather than noisy.
  ashen_circle_rite: -2,
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
 * Items derive their bond stats from it. Until v6.6 the adjusted cost fed
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
 *
 * v16 — the Unbreakable/cost-cap pass (v7.7 carry-forward #1). The cap now
 * applies to the BASE price only; a positive keyword surcharge is charged in
 * full ON TOP of the capped base, up to KW_SURCHARGE_CEILING. Before this,
 * `Unbreakable` carried KEYWORD_COST 7 (a +4 surcharge, the heaviest in the
 * file) while all three of its carriers landed ON the old all-in cap of 7 —
 * so the printed price collected only part of the surcharge and the keyword
 * was, at the ceiling, free. Four independent per-card levers (cost, keyword
 * bound, effect, stats) were spent on two of the three carriers across
 * v7.4-v7.6 without bringing the keyword into band (+14.6/+12.7/+13.9/+12.9
 * on four cohorts in v7.7), which is what identified the CAP as the
 * mechanism rather than any card.
 *
 * This is also the at-the-cap DOUBLE-PENALTY fix for Events and Items
 * (KNOWN ISSUE marked in v7.8): their effect magnitude is `naturalT - kwAdj`,
 * and with `base + kwAdj` clamped to 7 that subtraction docked the effect
 * for a surcharge the printed price never collected. With the surcharge
 * outside the clamp, subtracting it recovers the base exactly — the same
 * shape as the v6.7 `statBase` fix in mapUnit, finally ported.
 *
 * The ceiling is 9, not unbounded, on the "priced out rather than balanced"
 * record this file keeps re-learning: a cost the format cannot reach does
 * not balance a card, it deletes it. At 9 a mid-base Unbreakable body
 * collects its full surcharge and the two biggest bases (printed base 7)
 * still concede at most 2 points of it.
 */
const KW_SURCHARGE_CEILING = 9;
function naturalTotalFor(base: number, kwAdj: number, lo = 1, hi = 7): number {
  return Math.max(lo, Math.min(KW_SURCHARGE_CEILING, Math.min(hi, Math.max(lo, base)) + kwAdj));
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
  //
  // v7.4: the three cards the Unbreakable salvage band prints (see
  // pickUnitKeywords). Unbreakable carries the heaviest weight in
  // KEYWORD_COST (7, i.e. +3.5), and all three land ON the cost cap of 7 —
  // so the printed price collects only part of that surcharge and the body
  // keeps the stats of its pre-keyword base cost. That is the "keywords are
  // free stats" skew the stat-budget comment in mapUnit warns about,
  // resurfacing at the ceiling. Measured as the pool's #1 keyword outlier in
  // both cohorts on first print (+7.6 n=218 / +8.5 n=122, carrier win 69.3% /
  // 73.8%, ~5k activations a run), so it is trimmed on arrival rather than
  // shipped and walked back. COST_ADJUST is provably a no-op at the cap.
  the_pier_side_menace: -3, // 8/7, the largest body of the three
  the_wolf_of_wall_street: -2, // 6/6 plus a recurring at-Dawn weaken
  skyborne_skeleton_dragon: -2, // 4/7 plus a death-trigger buff
  //
  // v7.5: all three re-measured PER CARD rather than as one keyword. The v7.4
  // roadmap carried Unbreakable forward because the KEYWORD-level delta
  // disagreed across cohorts (+4.5 n=183 / +10.6 n=139) — but that number is
  // a mixture over three carriers, which is the mistake the v7.2 Doublestrike
  // note closed from the other direction. Per card the ramp-matched residual
  // reproduces cleanly, and the three do NOT agree with each other:
  //
  //   the_wolf_of_wall_street  +11.4 (n=504) / +16.1 (n=343)  -> -2 becomes -3
  //   the_pier_side_menace     +11.9 (n=516) / +11.1 (n=881)  -> -3 becomes -4
  //   skyborne_skeleton_dragon  +3.5 (n=557) /  +2.3 (n=766)  -> in band, alone
  //
  // v7.8 correction: the two arrows above never landed — the shipped values
  // are still Wolf -2 and Menace -3, and the v7.7 findings doc (§6) reads
  // those as the live baselines. Do NOT derive the next lever from the
  // arrow targets; the v7.7 carry-forward (Unbreakable and the cost cap)
  // owns whether these move at all.
  //
  // v16 — that pass ran, and these trims STAY as shipped. The carriers now
  // also pay the full (ceiling-9) keyword surcharge and Unbreakable itself
  // is once per game at the brink; with all of that stacked the keyword
  // reads +9.7/+8.8/+8.6/+8.6 — in band on four cohorts for the first time —
  // and neither carrier shows the priced-out signature (plays held). If a
  // future pass finds these cards NEGATIVE, unwind these stat trims first:
  // they were earned as substitutes for a surcharge the price now collects.
  //
  // So Unbreakable is not uniformly underpriced: two of its three bodies are,
  // and the keyword's own number was reading their average. The third is
  // deliberately NOT stacked with them.
  //
  // v7.5, at the cost cap for the same reason (COST_ADJUST clips to nothing):
  blight_snarler: -2, // +8.6 (n=605) / +6.1 (n=470), a Venomous+Ambush 7-drop
  // phosphor_lich also carries a COST_ADJUST +1 from v6.9, which is INERT: it
  // prints at the cap of 7, so that entry has never changed anything. The
  // stat budget is the only live lever. +10.6 (n=159) / +7.2 (n=1,133).
  phosphor_lich: -2,
};
const statAdjustFor = (id: string): number => STAT_ADJUST[id] ?? 0;

/**
 * v7.5: per-card adjustment to the MAGNITUDE of a card's printed ability —
 * the third lever, and the one that pass had to build because the other two
 * were measured inert on the cards that needed them.
 *
 * COST_ADJUST is a no-op at the cost cap of 7 (recorded since v5.3) and
 * STAT_ADJUST turned out to be a no-op as well on a body whose value is not
 * its stat line. The v7.5 Unbreakable pass measured both to exhaustion on
 * `the_wolf_of_wall_street` and `the_pier_side_menace` — five and six points
 * of stat trim, plus bounding the keyword itself to once per turn — and the
 * residual did not move on either card. What moved it was this: the ability
 * printed BESIDE the keyword.
 *
 * v7.6 renamed it from `UNIT_EFFECT_ADJUST` and wired it into `mapLocation`
 * as well, because the same finding turned out to be true of a Location. A
 * Sanctum's printed trigger had no lever at all, and `stone_bubbles` — six
 * passes of failed price levers, then two failed effect levers on its KEYWORD
 * this pass — turned out to print `At Dusk, a target enemy unit gets -1/-1`
 * beside the Sacred it was being blamed for. Same shape as the Wolf's, same
 * conclusion, one card type over. See BALANCE_SIM_FINDINGS §1.
 *
 * The clamp floor is 0, and 0 means the card prints NO ability — text, trigger
 * and all. That is deliberate and it is the only way this lever reaches a card
 * whose magnitude already sits at the minimum of 1: on a cheap card,
 * `ceil(naturalCost / 2)` is 1 before any adjustment, so "trim the magnitude"
 * has nowhere to go and the only remaining question the harness can ask is
 * whether the ability should be printed at all. Every entry below records the
 * measurement that set it.
 */
export const PRINTED_EFFECT_ADJUST: Record<string, number> = {
  // The Wolf of Wall Street: `At Dawn, a target enemy unit gets -2/-2` on an
  // Unbreakable body — unconditional recurring removal that the opponent has
  // no way to switch off, which is the shape LEADER_MINUS_ABILITY_OVERRIDE
  // calls "the strongest kit shape in the game", printed on a Unit. Its
  // ramp-matched residual was +11.4 (n=504) / +16.1 (n=343) and survived
  // every price and stat lever aimed at it.
  // v7.6: -2 -> -4, which takes the magnitude to 0 and prints the ability off
  // the card entirely. v7.5 shipped the -2 and asked for a re-check after one
  // pass with Unbreakable bounded; the re-check says the bound did nothing for
  // it (+10.4 / +8.2, against +11.4 / +16.1 before the -2), so the same lever
  // was pulled again as far as it goes: +9.0 / +5.0, down in both cohorts with
  // the sample held (498 -> 497, 338 -> 331). Note -3 would have been a no-op:
  // `themedEffect` floors its magnitude at 1 internally, so -1/-1 is the
  // smallest weaken that can be printed and 0 is the next step down.
  the_wolf_of_wall_street: -4,
  // The Pier-Side Menace took the SAME trial and REVERTED, on both halves of
  // the bar: +10.7 -> +13.4 in cohort A against +10.6 -> +7.6 in B (opposite
  // signs), and its cohort-A play count fell 520 -> 356. That is the "priced
  // out rather than balanced" signature this project keeps meeting — a
  // residual measured on two thirds of the plays is not the same measurement —
  // and it is the first time it has shown up on an EFFECT lever rather than a
  // cost one. Stays at -2 (its `enters: deal 1 damage`).
  the_pier_side_menace: -2,
  // v16 (v7.7 carry-forward #4): Amethyst Starfish, the biggest un-actioned
  // single-card outlier in the file — +9.1/+11.7/+8.4/+9.9 ramp-state residual
  // on four cohorts at n=490-1,543, reproducing in every run since v7.5 and
  // never moved. Cost is refuted on it (the v7.5 +1 trial cut its play count
  // 3x — priced out, not balanced). Its print is a 5/3 Reckless for 5 with
  // `At Dawn, deal 3 damage to any target`: free recurring any-target reach,
  // the exact shape the Wolf and Stone Bubbles findings keep converging on —
  // the ability beside the keyword is the card. Sentinel's whole -2 Leader
  // ability is 2 damage to any target ONCE; this did 3 every Dawn. First
  // step on the effect lever: -1, printing `At Dawn, deal 2 damage to any
  // target`, measured +9.5/+10.1/+6.8/+9.6 -> +8.7/+9.2/+6.1/+8.7 (four
  // cohorts, play counts held) — real but only about a point. Second step,
  // -2, printing `At Dawn, deal 1 damage to any target`: +7.0/+7.4/+4.8/+7.6,
  // in band in all four with the play counts still held (n=1560/512/538/1096
  // against baseline 1532/510/490/1078). Ships at -2 — the first lever ever
  // to move this card without deleting it from decks (the v7.5 cost point
  // cut its plays 3x and was reverted).
  amethyst_starfish: -2,
  // v7.6: Stone Bubbles, the top carry-forward for three passes and the item
  // six cost trials and two Sacred EFFECT trials had all failed to move. It
  // prints `At Dusk, a target enemy unit gets -1/-1` — recurring, unconditional,
  // unanswerable, on a 2-cost Sanctum — beside the Sacred it was being blamed
  // for. Its magnitude was already the minimum of 1, so the only move left was
  // 0: +9.2 / +7.3 -> +2.6 / +2.9 with the sample intact (772 -> 769, 484 ->
  // 486), the first change of any kind ever to move this card.
  stone_bubbles: -1,
};

// ---------------------------------------------------------------------------
// Color assignment. Two-color cards must only use pairs some Leader actually
// has (LEADER_COLORS), otherwise they'd be undraftable dead weight — the
// exact bug the v4.16 pool audit found (28/284 cards illegal for every
// Leader). Enforced at assignment time by picking pairs from this list.
// ---------------------------------------------------------------------------
//
// v7.3: deduplicated by UNORDERED pair. `pick` indexes with `% arr.length`, so
// this list's LENGTH is an input to every two-colour card's colour roll — and
// its length was simply the number of Leaders. Adding the ninth Leader (Void
// Mother, ['Void', 'Shadow']) therefore re-rolled the colours, cost, stats,
// keywords and effect of every two-colour card in the pool: 50+ cards
// reprinted from a catalog edit that had nothing to do with them, invalidating
// every per-card COST_ADJUST/STAT_ADJUST entry in this file at a stroke.
// Draft legality is an unordered property — Void/Shadow is the same playable
// pair as Avatar of the Abyss's Shadow/Void — so a Leader that re-uses an
// existing pair now adds nothing here and the pool re-prints identically.
const LEGAL_PAIRS: [Color, Color][] = [];
for (const p of Object.values(LEADER_COLORS)) {
  const pair = [p[0], p[1]] as [Color, Color];
  const has = LEGAL_PAIRS.some(
    (q) => (q[0] === pair[0] && q[1] === pair[1]) || (q[0] === pair[1] && q[1] === pair[0]),
  );
  if (!has) LEGAL_PAIRS.push(pair);
}

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
  // Round the magnitude and reapply the sign — plain Math.round() rounds
  // halves toward +∞ (Math.round(-0.5) === -0), so a negative-weight keyword
  // like Warded (-1) rounded to 0 and never printed its documented discount,
  // while a +1 keyword rounded to a full point. Symmetric rounding keeps the
  // discount and charge sides consistent.
  return Math.sign(w) * Math.round(Math.abs(w) / 2);
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

/** Colours whose KEYWORDS_OF_COLOR list carries Unbreakable — the only ones
 * allowed to print it through the salvage band below. */
const UNBREAKABLE_COLORS = new Set<Color>(['Root', 'Void']);

/** How many keywords this Unit rolls on its own, before any salvage band.
 * Split out because `forceFx` keys off a card having rolled NOTHING, which is
 * not the same question as its final keyword list being empty. */
function naturalKeywordCount(seed: string, rt: number): number {
  const r = roll(seed, 'kwcount', 10);
  if (rt >= 4) return r < 2 ? 0 : r < 6 ? 1 : 2;
  if (rt >= 2) return r < 3 ? 0 : r < 8 ? 1 : 2;
  return r < 5 ? 0 : r < 9 ? 1 : 2;
}

function pickUnitKeywords(seed: string, colors: Color[], rt: number): string[] {
  // 0-2 keywords, more at higher rarity.
  const count = naturalKeywordCount(seed, rt);
  if (count === 0) {
    // v7.4: **Unbreakable printed on ZERO cards** — rulebook text and a fully
    // implemented engine keyword that no card in the 297-card pool could ever
    // carry. It is PREMIUM (rt >= 4, so 21 eligible Units), it lives at index
    // 1 of two FOUR-entry colour lists, and it needs Root or Void as the
    // PRIMARY colour: that intersection is empty on the real catalog.
    // (Doublestrike clears the same gate only because Shadow's list has two
    // entries, giving it a 1-in-2 rather than a 1-in-4.)
    //
    // Salvaged the way v7.3 salvaged Warlord's zero carriers: a band that
    // fires only where NO keyword was rolled at all, so every existing
    // carrier re-prints byte-identically and no colour list changes length
    // (growing one would re-roll the keyword of every card sharing it).
    // Rarity floor drops to Rare because rt >= 4 is 21 cards — thin enough
    // that "printable" and "unprintable" are the same thing.
    if (rt >= 2 && colors[0] && UNBREAKABLE_COLORS.has(colors[0])) return ['Unbreakable'];
    return [];
  }

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
  // v6.9: 30% of keyword-carrying units swap their PRIMARY
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

/**
 * v7.3: the new keyword a NON-Unit card of this type and colour prints.
 *
 * Prefers the keyword whose KEYWORD_COLOR matches the card's own colour, and
 * falls back to any v7.3 keyword legal on the type when the colour has none.
 * The fallback is what makes these printable at all: each type only gained
 * TWO new keywords, so a strict colour match would leave five of the seven
 * colours with nothing and — measured on the real pool — left Echoing, Ritual
 * and Bulwark with ZERO carriers, i.e. dead text.
 */
function freshKeywordFor(
  seed: string,
  type: CardDef['type'],
  color: Color | undefined,
): string | undefined {
  // v7.5: the newest generation is EXCLUDED here. `pick` indexes modulo the
  // list's length, so letting these into this list would re-roll the keyword
  // of every card of the type whose own colour has no match and falls back to
  // `all` — see V75_KEYWORDS. They get their own band and their own list.
  const all = keywordsForType(type).filter(
    (kw) => KEYWORD_COLOR[kw] !== undefined && !V75_KEYWORDS.includes(kw),
  );
  if (!all.length) return undefined;
  const onColor = color ? all.filter((kw) => KEYWORD_COLOR[kw] === color) : [];
  const list = onColor.length ? onColor : all;
  return pick(seed, 27, list) as string;
}

/**
 * v7.5: the same roll over the NEW keyword generation only, drawn on a roll
 * band of its own so no existing carrier re-prints.
 *
 * It keeps `freshKeywordFor`'s colour fallback, and for the reason that
 * function records: a STRICT colour match prints nothing. Measured on the real
 * pool with the fallback removed — 297 cards, a 12-point band per type — Fate,
 * Exhume and Scorched-Earth all landed ZERO carriers, which is exactly the
 * dead-text failure `catalog.test.ts` exists to catch and the third time this
 * project has walked into it. The fallback list here is only ever the two
 * keywords of the card's own type, and its length is fixed, so unlike
 * `freshKeywordFor`'s it cannot grow and re-roll anything later.
 */
function freshKeywordV75For(
  seed: string,
  type: CardDef['type'],
  color: Color | undefined,
): string | undefined {
  const all = keywordsForType(type).filter((kw) => V75_KEYWORDS.includes(kw));
  if (!all.length) return undefined;
  const onColor = color ? all.filter((kw) => KEYWORD_COLOR[kw] === color) : [];
  if (onColor.length) return onColor[0];
  // Off-colour, the pair is split by the card's OWN colour rather than by a
  // fresh roll. A two-entry list is small enough that a hash over it is not
  // reliably even, and measured on the real pool it was not: rolling the
  // fallback gave Glaciate eight Locations and Scorched-Earth one, and Fate
  // zero Events across two band widths. Indexing by colour spreads the pair
  // deterministically over the seven Essence Types instead, so neither of a
  // generation's keywords can be starved by luck the way Doublestrike's two
  // carriers were.
  const i = color ? COLORS.indexOf(color) : hash(seed);
  return all[((i % all.length) + all.length) % all.length];
}

function mapUnit(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const colors = pickColors(seed, rt);
  const keywords = pickUnitKeywords(seed, colors, rt);
  const base = baseTotal(seed, rt);
  const kwAdj = keywordCostAdj(keywords);
  // v16: the keyword surcharge rides OUTSIDE the base's 7-clamp (up to
  // KW_SURCHARGE_CEILING) so a premium keyword is actually charged for at the
  // ceiling — see naturalTotalFor. COST_ADJUST stays INSIDE the clamp: its
  // no-op-at-the-cap behaviour is load-bearing (several entries above are
  // documented as inert signposts and re-pricing them here would silently
  // stack them onto the STAT_ADJUST that replaced them).
  const total = Math.max(
    1,
    Math.min(KW_SURCHARGE_CEILING, Math.min(7, Math.max(1, base + adjustFor(c.id))) + kwAdj),
  );
  const cost = buildCost(seed, colors, total, rt);

  // Stats: might+grit ≈ 2*(natural total MINUS the keyword surcharge) +
  // spread. The keyword surcharge must not feed the stat budget — otherwise
  // keywords are free stats (the exact skew the v5.0 sims found: Quickstrike
  // carriers at 80% win). Ember/Gale lean might, Root/Light lean grit.
  // v6.6: derived from the NATURAL (pre-COST_ADJUST) cost so a balance cut
  // lowers only the price, never the body — see naturalTotalFor.
  // v16: pinned to the OLD 7-capped total, deliberately NOT naturalTotalFor's
  // new surcharge-above-the-cap rule. naturalT feeds the printed EFFECT
  // magnitude below, and letting it ride up with the raised price ceiling
  // would grow the printed ability of the exact cards the ceiling exists to
  // nerf (measured before pinning: the Menace's enters-damage went 1 -> 2 and
  // the Wolf's v7.6-deleted Dawn weaken reprinted itself). The cost-cap
  // change is a pure price lever; every unit's rules text is byte-identical
  // to the v7.7 pool.
  const naturalT = totalCost(buildCost(seed, colors, Math.max(1, Math.min(7, base + kwAdj)), rt));
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
  //
  // v7.3: a Unit at Rare or above ALWAYS gets one. Vanilla bodies are a
  // legitimate part of the curve, but only at Common/Uncommon — a card the
  // player opened as a Rare, Super-Rare, Ultra-Rare, Full-Art, Alt-Art or
  // Mythic pull that rolled zero keywords AND lost the 1-in-4 effect roll
  // printed as a blank stat line with no rules text at all (37 such cards in
  // the v7.2 pool, including Full-Art pulls). The effect magnitude already
  // scales off the natural cost, so the forced roll prints the same size
  // effect the card would have got had the 1-in-4 landed.
  // Keyed off the card rolling NOTHING of its own, not off the final list
  // being empty: the Unbreakable salvage band hands a keyword to some of these
  // cards, and that must not silently cost them the ability this guarantees.
  const forceFx = rt >= 2 && naturalKeywordCount(seed, rt) === 0;
  if (forceFx || roll(seed, 'unit-fx', 4) === 0) {
    // v7.6: floor of 0 rather than 1 — see PRINTED_EFFECT_ADJUST. No Unit
    // entry currently reaches it (both sit at magnitude 1 after their -2), so
    // this re-prints the pool byte-identically; it exists so the lever can
    // reach a card whose magnitude is already at the minimum.
    const v = Math.max(
      0,
      Math.min(4, Math.ceil(naturalT / 2) + (PRINTED_EFFECT_ADJUST[c.id] ?? 0)),
    );
    if (v > 0) {
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
  // v6.0 Event keywords: 14% Surge (conditional discount), 12% Resonant
  // (double resolution, rare+ only). Surcharges come from KEYWORD_COST via
  // keywordCostAdj — the effect is scaled from the PRE-surcharge total so it
  // doesn't double a full-cost effect for free.
  // v7.3 adds a third band (26..42) for the new Event keywords. The 0..26
  // bands are untouched, so every existing Surge/Resonant carrier re-prints
  // byte-identically and only cards that previously rolled NO keyword pick
  // one up — priced, as always, through KEYWORD_COST.
  // v7.5 adds a FOURTH band (42..62) for Fate/Exhume — wider than the Item
  // and Location bands because there are only 41 Events in the pool, and a
  // 12-point band put just two of them in range, on the same rule: the
  // 0..42 bands are untouched, so every existing carrier re-prints
  // byte-identically and only cards that previously rolled nothing pick one up.
  //
  // v7.6 widens it again, 62 -> 76, and the Item band 52 -> 70. That is v7.5
  // carry-forward #9: `Blessed` printed on ONE card and `Exhume` on two, which
  // is the Doublestrike width — a delta at that sample is a fact about two
  // cards' Leader cohorts, not about the keyword, and v7.5 correctly refused
  // to act on either. Blessed 1 -> 5 carriers and Exhume 2 -> 6 (Fate 7 -> 9,
  // Freeze-Dry 4 -> 8), and both now read in band with real samples: Blessed
  // -1.0 / +0.7 at n=643/1684, Exhume -2.2 / -0.7 at n=495/667, against the
  // -9.6 / +0.8 cohort split that was all v7.5 could see.
  //
  // Widening upward only is what makes this safe: verified card by card, zero
  // existing carriers changed keyword and 14 cards that had rolled NOTHING
  // picked one up. It is still a content change and it moved the meta — see
  // the Glaciate note in keywords.ts.
  const kwRoll = roll(seed, 'ev-kw', 100);
  const evFresh =
    kwRoll >= 26 && kwRoll < 42
      ? freshKeywordFor(seed, 'Event', colors[0])
      : kwRoll >= 42 && kwRoll < 76
        ? freshKeywordV75For(seed, 'Event', colors[0])
        : undefined;
  const keywords: string[] = evFresh
    ? [evFresh]
    : kwRoll < 14
      ? ['Surge']
      : kwRoll < 26 && rt >= 1
        ? ['Resonant']
        : [];
  const kwAdj = keywordCostAdj(keywords);
  const base = baseTotal(seed, rt);
  const total = Math.max(1, Math.min(7, base + adjustFor(c.id) + kwAdj));
  const cost = buildCost(seed, colors, total, rt);
  // v6.6: effect magnitude scales off the NATURAL (pre-COST_ADJUST) cost, so
  // a balance cut makes the Event cheaper without shrinking its effect (and a
  // raise makes it pricier without growing it) — see naturalTotalFor.
  const naturalT = totalCost(buildCost(seed, colors, naturalTotalFor(base, kwAdj), rt));
  // v16: the v7.8 KNOWN ISSUE here is fixed — naturalTotalFor now carries the
  // surcharge outside the base clamp, so subtracting kwAdj recovers the base
  // instead of docking the effect for a surcharge the (still 7-capped)
  // printed price never collected. The at-the-cap double penalty the v6.7
  // statBase fix removed for Units is finally gone here too.
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
// Item mapping
// ---------------------------------------------------------------------------
function mapItem(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const colors = pickColors(seed, rt);
  // v13 subtype split. The old roll was a two-way Bound(60)/Worn(40) on this
  // same salt; the three-way keeps the SAME salt and the same 60/40 cut point
  // so a Charm is exactly the old Bound band and Weapon+Tool are exactly the
  // old Worn band — only the 78..100 slice of what used to be Worn becomes a
  // Tool. Re-salting here would re-roll all 61 Items for no reason.
  const subRoll = roll(seed, 'ch-sub', 100);
  const subtype: ItemSubtype = subRoll < 60 ? 'Charm' : subRoll < 78 ? 'Weapon' : 'Tool';
  const survives = itemSurvives(subtype);
  // v6.0 Item keywords: ~12% Runic (bond cantrip); ~12% of CHARM items
  // Soulbound (returns to hand when its unit dies). Surcharges come from
  // KEYWORD_COST via keywordCostAdj.
  // v7.5 adds a fourth band (40..52) for Freeze-Dry/Blessed, widened to 40..70
  // in v7.6 — see the Event mapper for the rule these bands follow and for why
  // the widening happened.
  const kwRoll = roll(seed, 'ch-kw2', 100);
  const chFresh =
    kwRoll >= 24 && kwRoll < 40
      ? freshKeywordFor(seed, 'Item', colors[0])
      : kwRoll >= 40 && kwRoll < 70
        ? freshKeywordV75For(seed, 'Item', colors[0])
        : undefined;
  const itemKws: string[] = chFresh
    ? [chFresh]
    : kwRoll < 12
      ? ['Runic']
      : kwRoll < 24 && subtype === 'Charm'
        ? ['Soulbound']
        : [];
  const kwAdj = keywordCostAdj(itemKws);
  const base = baseTotal(seed, rt);
  const total = Math.max(1, Math.min(7, base + adjustFor(c.id) + kwAdj));
  const cost = buildCost(seed, colors, total, rt);
  // Bond stats scale from the pre-surcharge total (keywords are never free
  // stats). v6.6: and from the NATURAL (pre-COST_ADJUST) cost, so a balance
  // cut lowers only the price, never the bond — see naturalTotalFor.
  const naturalT = totalCost(buildCost(seed, colors, naturalTotalFor(base, kwAdj), rt));
  // v16: same at-the-cap double-penalty fix as mapEvent above — see the note
  // there and naturalTotalFor. The Item's printed price keeps its 7-cap; only
  // the bond derivation stops paying for a surcharge never charged.
  const t = Math.max(1, naturalT - kwAdj);

  // A Charm pays nothing for permanence it does not have, a Weapon pays one
  // point of bond for surviving its unit, and a Tool pays a second for the
  // enemy it weakens on the way in.
  const statBudget = Math.max(1, t + 1 - (survives ? 1 : 0) - (subtype === 'Tool' ? 1 : 0));
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

  // Some items (~40%) grant an on-color keyword to the bonded unit.
  let grantText = '';
  if (roll(seed, 'ch-kw', 5) < 2) {
    const list = (colors[0] ? KEYWORDS_OF_COLOR[colors[0]] : NEUTRAL_KEYWORDS).filter(
      (kw) => (!PREMIUM.has(kw) || rt >= 4) && kw !== 'Immobile',
    );
    if (list.length) {
      // v6.9: same substitution rule as pickUnitKeywords — a share of Items
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
    type: 'Item',
    subtype,
    cost,
    bond,
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
  };
  if (itemKws.length) def.keywords = itemKws;
  const statText = `+${bond.might ?? 0}/+${bond.grit ?? 0}`;
  if (survives) {
    def.rebondCost = Math.max(1, Math.ceil(t / 2));
  }
  if (subtype === 'Tool') {
    def.nerf = 1 + (rt >= 4 ? 1 : 0);
    def.text =
      `Tool — bonded unit gets ${statText}${grantText}; a target enemy unit gets ` +
      `-${def.nerf}/-${def.nerf}. Re-bond ${def.rebondCost}.`;
  } else if (subtype === 'Weapon') {
    def.text = `Weapon — bonded unit gets ${statText}${grantText}. Re-bond ${def.rebondCost}.`;
  } else {
    def.text =
      `Charm — bonded unit gets ${statText}${grantText}. ` +
      `Or cast it on yourself to restore ${charmSelfHeal(bond)} Vitality.`;
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
  // v7.5 adds a fourth band (42..54) for Scorched-Earth/Glaciate — see the
  // Event mapper for the rule these bands follow.
  const kwRoll = roll(seed, 'loc-kw2', 100);
  const locFresh =
    kwRoll >= 26 && kwRoll < 42
      ? freshKeywordFor(seed, 'Location', produces)
      : kwRoll >= 42 && kwRoll < 54
        ? freshKeywordV75For(seed, 'Location', produces)
        : undefined;
  const locKws: string[] = locFresh
    ? [locFresh]
    : kwRoll < 12
      ? ['Bountiful']
      : kwRoll < 26
        ? ['Sacred']
        : [];
  const kwAdj = keywordCostAdj(locKws);
  // Base total keeps the pre-v6 1..4 clamp so keyword-free Sanctums price
  // identically; COST_ADJUST is applied OUTSIDE that clamp — per its header
  // it is a price-only lever whose points must stay real, and inside the
  // clamp any adjustment landing on a base-4 Sanctum silently vanished (the
  // kunoichi_of_the_magma_rings failure, one type over). Verified
  // byte-identical on the current pool: no live Location entry clips.
  // The keyword surcharge stacks on top (ceiling 6, floor 1).
  const total = Math.min(
    6,
    Math.max(
      1,
      Math.min(4, 1 + Math.floor(rt / 2) + roll(seed, 'loc-spread', 2)) + adjustFor(c.id),
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
    // v7.6: a Sanctum's printed trigger goes through PRINTED_EFFECT_ADJUST
    // like a Unit's. Its natural magnitude is a hardcoded 1, so the only move
    // this lever has here is 0 — print no ability — which is exactly the
    // question `stone_bubbles` needed asked of it.
    const v = Math.max(0, 1 + (PRINTED_EFFECT_ADJUST[c.id] ?? 0));
    if (v > 0) {
      const fx = themedEffect(seed, produces, v);
      const when = pick(seed, 23, ['atDawn', 'atDusk'] as const);
      def.triggers = [{ when, effect: fx }];
      def.text = `${base} ${TRIGGER_TEXT[when]}, ${effectText(fx)}.`;
    } else {
      def.text = base;
    }
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
  //
  // v17: -4 -> -3, the walk-back the v16 carry-forward scheduled after its
  // watch pass. The -2 -> -3 -> -4 ladder was measured on the pre-v8,
  // pre-three-deck instruments; on the clean instrument Avatar reads last or
  // next-to-last in all four cohorts (34.5-42.3 pinned) with small deck
  // spreads — an over-nerf reading, not a deck roll. One point back,
  // price-only, measured alone.
  avatar_of_the_abyss: -3,
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
  //
  // v17: -2 -> -3. The v16 carry-forward's condition came due: on the
  // three-deck pinned suite (the clean instrument), Sentinel finished FIRST
  // in all four cohorts for the second consecutive pass (64.9/69.6/63.7/65.5,
  // worst deck >= 54.8%), and the doc named this exact lever. Resolve 5
  // against -3 buys one removal with change; the +1 builder buys a second
  // every three turns instead of every other turn.
  crimson_vector_commander: -3,
  void_mother: -4,
};

/**
 * v7.5: Leader RESOLVE override — the third per-Leader lever, and the one the
 * v7.4 roadmap named for Void Mother alongside "price the minus".
 *
 * `mapLeader` derives Resolve from rarity (`3 + floor(rarityTier / 2)`), so
 * the size of a Leader's ability budget is a side effect of which rarity slot
 * its card happens to sit in. v7.2 §1 recorded the consequence from the other
 * direction — six cards moved rarity for bookkeeping reasons and that single
 * edit was "the largest balance change in this pass" — so a rarity edit is
 * precisely the wrong tool for a balance problem: it also re-seeds the card
 * (`seedOf` is `id|type|rarity`) and reprints its cost, keywords and kit.
 * This lever moves Resolve alone, leaving the print untouched.
 */
const LEADER_RESOLVE_OVERRIDE: Record<string, number> = {
  void_mother: 5,
  // v18, NOT SHIPPED — recorded so nobody spends it twice. The v17
  // carry-forward scheduled `crimson_vector_commander: 4` (Sentinel's other
  // half of the v16 lever pair) if the fresh baseline still had it first in
  // 3+ cohorts. It did (61.0 / 61.9 / 58.0 / 62.2), so the lever was spent
  // and measured on all four cohorts: **59.5 / 61.9 / 58.9 / 59.8** — a mean
  // of -0.75 points, with cohort C going UP, and Sentinel still first in the
  // same three tables. The diagnostic says why, and it is not noise:
  // abilityUsesPerGame did not fall at all (7.95→8.19, 7.24→7.63,
  // 8.53→8.59, 7.65→7.61). The Resolve CEILING is not the binding
  // constraint — the kit spends at 3 and rebuilds with its +1, so it never
  // banks near the ceiling and lowering it from 5 to 4 changes nothing it
  // does. Reverted rather than printed: a price change that measurably moves
  // neither the win rate nor the ability cadence is a strictly worse card
  // for no gain. See docs/BALANCE_SIM_FINDINGS_v19.md §1 — which spent that
  // "next lever" too, and refuted it.
};

/**
 * v7.7: Leader ESSENCE-COST override — the lever v7.6 carry-forward #5 said
 * would have to be found rather than looked up, and the one hole left in the
 * per-Leader toolkit.
 *
 * Five Leader levers existed (strip a keyword, reprice the minus, override the
 * Resolve, replace either ability) and not one of them could change what a
 * Leader costs to put on the table. `mapLeader` prices it at
 * `3 + roll(0..1) + keywordCostAdj(keywords)`, so a Leader's arrival turn is
 * a coin flip plus whichever keyword it happened to roll — and the spread that
 * produces is not small. Measured, cohort A:
 *
 *   Void Mother 6.4   Ethereal 6.5   Ruin-Walker 6.6   Sentinel 6.7
 *   Mer-King 6.9      Legendary Diver 7.2
 *   Avatar 8.4        Sovereign 8.4   Kuro 8.4
 *
 * Two full turns between the earliest and the latest kit in the game.
 *
 * Kuro, the Unseen is the case that forced it. It is the joint LATEST-arriving
 * Leader at turn 8.4, it is one of the most expensive at 5 total, and it has
 * the LOWEST printed Resolve in the pool at 3 — it pays a Commander surcharge
 * on top of the smallest ability budget anyone has. Its kit is not idle
 * (0.1% idle rate, 6.6-7.2 activations a game) and it is not misused; its win
 * rate by game length is 54.0% at 11-20 turns and 28.3% at 21-30, which is a
 * Leader that arrives late and then cannot out-grind. Every other lever on it
 * is spent: v7.5 repriced its minus, v7.6 spent and reverted the Resolve
 * point, and its minus ability is already a hand override.
 *
 * Price-only by construction: nothing in `mapLeader` derives from `total`
 * (Resolve comes from rarity, both abilities from the colour identity), so
 * unlike the Unit/Event/Item mappers there is no power term to keep in step.
 */
const LEADER_COST_OVERRIDE: Record<string, number> = {
  apex_nanite_shinobi: 4,
  // v18 — Sovereign of the Dying Star, 5 -> 4. The v17 carry-forward's #2
  // ("Sovereign is the virgin case: it has never had a dedicated look") after
  // its watch pass on the post-Avatar field, which confirmed the reading:
  // 38.1 / 35.7 / 39.6 / 35.1, last or next-to-last in all four cohorts with
  // deck spreads of 3.6 / 11.6 / 3.6 / 6.3 — a kit reading, not a deck roll.
  //
  // It is Kuro's case again, exactly, and the same lever answers it. Sovereign
  // pays a Commander surcharge on top of an Uncommon's rarity-derived Resolve,
  // so it carries the JOINT-HIGHEST invoke cost (5) and the LOWEST Resolve (3)
  // in the pool, and it arrives at turn 8.3 — the latest of any Leader but
  // Avatar, which has Resolve 6 and an unconditional Shatter to justify it.
  // The kit is not idle or misplayed: its Ember minus is `-1: Deal 2 damage to
  // any target`, the same reach Sentinel tops three cohorts with, at a THIRD
  // of the price. It simply gets fewer turns to use it — 6.32 activations a
  // game, the lowest of any Leader in the run. One point off the cost buys
  // back the arrival turn without touching the ability economy.
  //
  // Price-only by construction (see the header above): nothing in `mapLeader`
  // derives from `total`.
  sovereign_of_the_dying_star: 4,
};

/**
 * v7.6 — Kuro, the Unseen (`apex_nanite_shinobi`) TRIED HERE AND REVERTED, and
 * the reason is a rule about carried-forward measurements rather than a fact
 * about this Leader.
 *
 * v7.5 repriced Kuro's minus (-2 -> -1), held the Resolve point back under the
 * "one lever per Leader per pass" rule, and measured it in isolation first so
 * the next pass would not have to re-derive it: Resolve 4 alone, +2.3 (A) /
 * +3.6 (B). This pass spent it — `apex_nanite_shinobi: 4` — and it did NOT
 * reproduce: 43.3 -> 44.5 (A) and 40.1 -> 39.4 (B), opposite signs, which is
 * the bar this project has used since v6.6.
 *
 * The two levers are not additive, and could not have been. That +2.3 / +3.6
 * was measured against the -2 minus, where a Resolve-3 tank bought ONE use and
 * stranded a point — the fourth point of Resolve was buying a second
 * activation. Against the -1 that shipped, a tank already buys three, and the
 * fourth point buys a fourth activation of an ability that is no longer the
 * constraint. A measurement of lever B taken while lever A was unspent expires
 * the moment A ships.
 *
 * So: an isolated measurement of an unspent lever is a hypothesis for the next
 * pass, not a result banked for it. Kuro stays at its printed Resolve 3 and
 * the next lever on it has to be found rather than looked up.
 */

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

/**
 * v7.2: Leader MINUS-ability override — the effect-side counterpart to
 * LEADER_MINUS_RESOLVE_OVERRIDE (which only ever changed the price) and to
 * LEADER_PLUS_ABILITY_OVERRIDE (which only ever reached the plus half).
 *
 * The reason it is needed is structural, and worth stating plainly because it
 * explains most of the Leader spread this project has been chasing since
 * v6.1. `mapLeader` derives the minus ability from `identity[0]` and the plus
 * ability from `identity[1]` — and those are not rolled. They are the literal
 * array order in `LEADER_COLORS`, hand-written in colors.ts. So which of a
 * Leader's two colours it gets its ANSWER from is decided by which one
 * happens to be written first:
 *
 *   avatar_of_the_abyss  ['Shadow', 'Void']  -> minus = Shadow  `Shatter`
 *   apex_nanite_shinobi  ['Gale',  'Shadow'] -> minus = Gale    `Recover`
 *   ethereal_sea_witch   ['Tide',  'Light']  -> minus = Tide    `Deal a card`
 *   ruinwalker_overseer  ['Root',  'Void']   -> minus = Root    `+2/+2`
 *
 * Avatar — first in both cohorts for four consecutive passes — is the one
 * whose first colour is Shadow. Apex, Ethereal and Ruin-Walker are the three
 * whose first colour yields a minus ability that does not touch the enemy
 * board at all, and they are the bottom three in both cohorts. Apex's
 * `-1: Recover a friendly unit` is the clearest case: the CPU declines to use
 * it almost entirely (179 uses across 2,604 games in cohort A) and loses 79%
 * of the games where it does, while its Shadow half — the best minus ability
 * in the game — is unreachable because it is written second.
 *
 * The systemic fix (let the kit take its minus from whichever half is
 * interactive) would re-roll all eight Leaders at once and invalidate every
 * per-Leader adjustment in this file. This lever instead hands the two
 * Leaders that finished bottom in BOTH cohorts an ability drawn from their
 * OWN other colour — what a colour-aware roll would have produced — and
 * leaves the balanced Leaders untouched.
 */
const LEADER_MINUS_ABILITY_OVERRIDE: Record<string, LeaderAbility> = {
  // Apex Nanite Shinobi (Gale/Shadow): 30.6% (A) / 38.2% (B), last in both.
  // Deliberately NOT given Shadow's `-2: Shatter` — that is Avatar's kit, and
  // at Resolve 5 it would buy two unconditional removals a tank, which is
  // strictly better than the Leader that has topped the spread for four
  // passes. Takes Shadow's Withering flavour instead: a permanent shrink is
  // real board interaction and a soft answer, repeatable at -1, but it never
  // kills a big body outright.
  // Apex took three trials to land, and the two failures are the useful part
  // of the record: `-1: -2/-2` OVERSHOT to 61.6% (A) / 55.6% (B), last place
  // to FIRST in A, because a permanent shrink five times a tank is removal on
  // anything the deck plays. Dropping the effect to `-1: -1/-1` then
  // UNDERSHOT and split the cohorts (39.0% / 34.0%) — too small to answer
  // anything. The size was never the problem; the frequency was. Shipped at
  // the original -2/-2 with the price doubled, so Resolve 5 buys two shrinks a
  // tank instead of five.
  apex_nanite_shinobi: {
    resolveDelta: -1,
    effect: { action: 'weaken', value: 2, target: 'enemyUnit' },
    text: '-1: A target enemy unit gets -2/-2.',
  },
  // Ruin-Walker Overseer is the third Leader with the identity[0] problem and
  // the last one still below baseline in both cohorts (41.1% / 38.0%). v6.9
  // gave its PLUS half a Void `weaken`, which moved it but left the kit with
  // no actual answer: its minus is still Root's `-2: A friendly unit gets
  // +2/+2`, so both halves point at its own board. Takes its own Void half's
  // Banish — the ability `mapLeader` would already have given it had its
  // colour pair been written the other way round.
  // Priced at -3, not the -2 the Void table prints. At -2 it overshot as hard
  // as Apex did (46.4% -> 68.2% in A, first by nine points), for the reason
  // Avatar's minus ability has now been repriced twice: unconditional removal
  // that a full Resolve tank buys TWICE is the strongest kit shape in the
  // game, whichever way it is worded. At -3 a Resolve-4 tank buys one, and
  // the +1 half needs three turns to fund the next.
  ruinwalker_overseer: {
    resolveDelta: -3,
    effect: { action: 'banish', target: 'enemyUnit' },
    text: '-3: Banish a target enemy unit.',
  },
  // Ethereal Sea Witch (Tide/Light): 40.4% / 34.6%, still bottom-two in both
  // after v6.9's plus-ability buff moved it +4.2 / +6.9. Carry-forward #5
  // asked for one settling pass before a second point; this is that pass and
  // the deficit did not close, so the second point is due. Its remaining dead
  // half is the minus (`-1: Deal a card`, 40.1% across 1,375 games). Bounded
  // deliberately against Legendary Diver's healthy `-1: Deal 2 damage to ANY
  // target` (54.7% / 59.5%) by dropping the face-reach half: unit-only, so it
  // answers a board without ever closing a game out of nowhere.
  ethereal_sea_witch: {
    resolveDelta: -1,
    effect: { action: 'damage', value: 2, target: 'enemyUnit' },
    text: '-1: Deal 2 damage to a target enemy unit.',
  },
  // v7.4 Mer-King (Tide/Root): 35.1% (n=1488) / 33.4% (n=1860) — bottom or
  // second-bottom in both cohorts on the two largest Leader samples in the
  // run. It is the ONLY Leader left whose minus does not touch the enemy
  // board, and `minusColorFor` cannot help it: neither Tide (`Deal a card`)
  // nor Root (`+2/+2 on a friendly unit`) yields an interactive minus, so
  // there is no half to draw from. Its whole kit points inward — `-1: Deal a
  // card` and `+1: Restore 2 Vitality` — which is the Ruin-Walker failure
  // shape with the volume turned up: no answer to anything, at either price.
  //
  // Every small interactive effect is already spoken for, and three of them
  // sit on PLUS halves where they GAIN resolve (Ethereal's +1 exhaust,
  // Ruin-Walker's +1 weaken) — so handing Mer-King the same effect on a minus
  // would print a strictly dominated ability. It takes a shape no other
  // Leader has instead: the tide going out, shrinking the whole enemy board
  // at once. Colour-honest for Tide and Root, and `weaken`/`allEnemyUnits` is
  // an already-implemented path in applyEffect.
  //
  // Priced at -3 on purpose, against the two overshoots this table records.
  // Apex measured 61.6%/55.6% and Ruin-Walker 68.2% when their answers were
  // cheap enough for a full tank to buy twice; board-wide is stronger than
  // single-target, so at Resolve 4 this buys exactly one, and the +1 half
  // needs three turns to fund the next.
  mer_king: {
    resolveDelta: -3,
    effect: { action: 'weaken', value: 1, target: 'allEnemyUnits' },
    text: '-3: All enemy units get -1/-1.',
  },
  // v19, NOT SHIPPED — Sentinel of the Nether Pit, recorded here so the third
  // lever on this kit is not spent a fourth time.
  //
  // The v18 carry-forward named it exactly: not the price, the EFFECT. Bound
  // the Ember minus to `enemyUnit`, dropping the `any target` face reach, on
  // the v7.5 Ethereal Sea Witch precedent. The baseline met the condition
  // (Sentinel first in all FOUR cohorts: 61.9 / 60.7 / 58.0 / 61.6), so the
  // lever was spent and measured alone:
  //
  //   61.3 / 63.4 / 59.5 / 61.6 — a mean of **+0.9 points**, still first in
  //   all four, with cohort B up 2.7. Taking the finisher off the kit did not
  //   move the kit.
  //
  // That is now THREE sequential levers on this Leader that measured nothing:
  // the v17 minus reprice (-2 → -3), the v18 Resolve trim (5 → 4, mean -0.75,
  // cadence unmoved), and this one. The v19 findings doc §1 explains why, and
  // the explanation is not about the card: on the sim's own random-deck arm
  // Sentinel reads 30.8 / 53.0 / 42.1 / 43.8 — a mean of 42.5%, BELOW the
  // midpoint, and dead last in the pool in cohort A. Its pinned reading sits
  // +18.1 points above its random-deck reading, the largest divergence in the
  // pool. Three pinned decks are what finishes first; the kit does not.
  //
  // No further lever belongs on this card until the pinned suite can tell the
  // two apart. See docs/BALANCE_SIM_FINDINGS_v19.md §1.
};

/** Does this ability actually reach across the table? */
function isInteractive(a: LeaderAbility): boolean {
  return (
    a.effect.target === 'enemyUnit' ||
    a.effect.target === 'anyTarget' ||
    a.effect.target === 'enemyPlayer' ||
    a.effect.target === 'allEnemyUnits'
  );
}

/**
 * v7.4: which half of a Leader's identity supplies its MINUS ability.
 *
 * It used to be `identity[0]` — literal array order in `LEADER_COLORS`,
 * hand-written in colors.ts and never rolled. So whether a Leader's one
 * answer touched the enemy board came down to which of its two colours
 * happened to be typed first, and the three Leaders whose first colour
 * produced an inert minus were the bottom three of the v7.2 pass. See the
 * LEADER_MINUS_ABILITY_OVERRIDE header for the full diagnosis.
 *
 * The rule now prefers whichever half yields an ability that reaches the
 * opponent, falling back to `identity[0]` when both halves do or neither
 * does. Deliberately no-op on the current nine Leaders: the only two it would
 * flip (Apex Nanite Shinobi, Ruin-Walker Overseer) already carry hand
 * overrides that outrank it — and those overrides are NOT redundant, because
 * both encode a price the raw colour table overshoots at. Apex was measured
 * at 61.6%/55.6% with Shadow's own `-2: Shatter`-shaped effect, and
 * Ruin-Walker at 68.2% with Void's printed `-2: Banish`; they ship at halved
 * frequency for that reason. What this rule buys is that the NEXT Leader
 * printed does not need a fourth hand patch to get an answer.
 */
function minusColorFor(identity: Color[]): Color {
  const first = identity[0];
  const second = identity[1];
  if (!second) return first;
  const a = leaderMinusAbility('', first);
  const b = leaderMinusAbility('', second);
  if (isInteractive(a)) return first;
  return isInteractive(b) ? second : first;
}

/**
 * The Leader keyword vocabulary as of v7.3, FROZEN.
 *
 * `mapLeader`'s roll 4-5 branch previously drew from
 * `keywordsForType('Leader')` via `freshKeywordFor`, whose `pick` indexes
 * MODULO the list's length — so adding a 4th coloured Leader keyword to
 * keywords.ts would have re-rolled the keyword of all nine existing Leaders
 * and invalidated every per-Leader adjustment (LEADER_KEYWORD_STRIP, cost and
 * Resolve overrides). That is the same trap the v7.3 colour-pair note and the
 * v7.5 V75_KEYWORDS split record, and this is the same fix: the existing
 * generation is pinned to its own fixed list here, and any FUTURE Leader
 * keyword must go into LEADER_NEXT_KEYWORDS below and roll on its own band.
 *
 * INVARIANT (verified byte-identical at the split, scripts/verify-pool.ts):
 * the generated pool is unchanged by this restructure, and adding entries to
 * LEADER_NEXT_KEYWORDS cannot change any existing Leader's keyword outcome —
 * the 'ldr-kw6' band and this frozen list are never touched again.
 */
const V73_LEADER_KEYWORDS: readonly string[] = ['Warlord'];

/**
 * Future Leader keyword generations, drawn on their OWN roll band
 * ('ldr-kw-next') so no existing Leader re-prints — mirror of
 * `freshKeywordV75For`. Currently empty on purpose: this pass is plumbing
 * only, no new keywords. When a new Leader keyword lands, add it here (and to
 * keywords.ts) — it will only ever be offered to Leaders that end the frozen
 * v7.3 path with NO keyword, exactly how the v7.5 split let only keyword-less
 * cards pick up the new generation.
 */
const LEADER_NEXT_KEYWORDS: readonly string[] = [];

/** Roll 4-5 Leader keyword from the FROZEN v7.3 list only (see above). */
function leaderFreshKeywordFor(seed: string, color: Color | undefined): string | undefined {
  // Same selection logic as freshKeywordFor, restricted to the frozen list so
  // future additions to keywordsForType('Leader') cannot re-roll it.
  const all = V73_LEADER_KEYWORDS.filter((kw) => KEYWORD_COLOR[kw as Keyword] !== undefined);
  if (!all.length) return undefined;
  const onColor = color ? all.filter((kw) => KEYWORD_COLOR[kw as Keyword] === color) : [];
  const list = onColor.length ? onColor : all;
  return pick(seed, 27, [...list]);
}

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
  // v7.3: rolls 4-5 (previously "no keyword") now take a new Leader keyword,
  // matched against whichever half of the identity has one. Rolls 0..3 keep
  // Commander/Resolute exactly as before, and LEADER_KEYWORD_STRIP still
  // applies last so a stripped Leader stays stripped.
  // v7.8: this branch is pinned to V73_LEADER_KEYWORDS (see the comment on
  // that constant) so adding future Leader keywords cannot re-roll it.
  const leaderFreshColor =
    identity.find((col) =>
      V73_LEADER_KEYWORDS.some((kw) => KEYWORD_COLOR[kw as Keyword] === col),
    ) ?? identity[0];
  const ldrFresh = kwRoll >= 4 ? leaderFreshKeywordFor(seed, leaderFreshColor) : undefined;
  const leaderKws: string[] = (
    ldrFresh ? [ldrFresh] : kwRoll < 2 ? ['Commander'] : kwRoll < 4 ? ['Resolute'] : []
  ).filter((kw) => !stripped.has(kw));
  // v7.8: future Leader keyword generations roll on their OWN band, offered
  // only to Leaders the frozen path left keyword-less — the V75_KEYWORDS
  // pattern. A no-op while LEADER_NEXT_KEYWORDS is empty.
  if (!leaderKws.length && LEADER_NEXT_KEYWORDS.length) {
    const onColor = identity
      .map((col) => LEADER_NEXT_KEYWORDS.find((kw) => KEYWORD_COLOR[kw as Keyword] === col))
      .find((kw) => kw !== undefined);
    const next =
      onColor ?? LEADER_NEXT_KEYWORDS[roll(seed, 'ldr-kw-next', LEADER_NEXT_KEYWORDS.length)];
    if (next && !stripped.has(next)) leaderKws.push(next);
  }
  const total =
    LEADER_COST_OVERRIDE[c.id] ?? 3 + roll(seed, 'ldr-cost', 2) + keywordCostAdj(leaderKws); // 3-5
  const cost: EssenceCost = { generic: Math.max(0, total - pipSum), pips };
  const resolve = LEADER_RESOLVE_OVERRIDE[c.id] ?? Math.max(3, Math.min(6, 3 + Math.floor(rt / 2)));
  const minus = LEADER_MINUS_ABILITY_OVERRIDE[c.id]
    ? { ...LEADER_MINUS_ABILITY_OVERRIDE[c.id] }
    : leaderMinusAbility(seed, minusColorFor(identity));
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
/**
 * Layer the Creator's overrides (if any) over a generated card.
 *
 * Deliberately shallow and deliberately last: every mechanic is still
 * GENERATED from `id|type|rarity`, and an override replaces the finished
 * value rather than feeding back into the roll — so overriding a card's cost
 * cannot silently move its stats, its keywords or anything else, and removing
 * the override restores exactly the generated card.
 *
 * `undefined` entries are ignored (they mean "not overridden"); an explicit
 * `null` clears the field, which is how the editor un-prints a rules line.
 */
function applyOverrides(def: CardDef, overrides?: CardTemplate['overrides']): CardDef {
  if (!overrides) return def;
  const out = { ...def } as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) continue;
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out as unknown as CardDef;
}

function mapCard(c: CardTemplate): CardDef {
  return applyOverrides(mapGeneratedCard(c), c.overrides);
}

function mapGeneratedCard(c: CardTemplate): CardDef {
  switch (c.type) {
    case 'Leader':
      return mapLeader(c);
    case 'Unit':
      return mapUnit(c);
    case 'Location':
      return mapLocation(c);
    case 'Item':
      return mapItem(c);
    case 'Event':
      return mapEvent(c);
    default:
      return mapUnit(c);
  }
}

/**
 * Derive one card's v5 mechanics from its universal identity, without touching
 * the live pool.
 *
 * The server cannot compute these — they are hashed from `id|type|rarity` by
 * the code above — so the `cards.essence_cost/might/grit/keywords/...` columns
 * every server RPC reads have to be written by a client that ran this. That is
 * what `scripts/sync-cards-db.ts` does in bulk for the bundled catalog, and
 * what the Creator's card tools (approve a submission, bulk add) do for a
 * single new card, so a freshly printed card is never left with the null
 * mechanics columns that `pick_deck_bucket` and `verify:pool` read as drift.
 */
export function deriveCardMechanics(t: CardTemplate): CardDef {
  return mapCard(t);
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
