/**
 * v4.2 card pool, built from the universal card catalog (live Supabase
 * `cards` table, or the bundled fallback in `generated-cards.ts`).
 *
 * Each card's CORE IDENTITY is untouched — name, image URL, flavor text,
 * rarity, set. Every card is assigned its v4.2 dice-placement mechanics
 * (Cast Slot threshold, ATK/HP, keywords, effects) deterministically from a
 * hash of its id plus its type and rarity, so the whole set is playable
 * under the rulebook with a wide spread of keywords and archetypes — and the
 * assignment is identical on every client.
 */
import { CardDef, ComboPattern, Effect, EffectTarget, LEADER_HP } from './cards';
import { CardTemplate } from '../../types';
import { GENERATED_CARDS } from '../generated-cards';
import { SIM_TUNING } from './engine';
import { COLOR_OF_KEYWORD, LEADER_COLORS, Color } from './colors';
import { tierCostWeight, tierMagnitude, maxTier } from './keywords';

// ---------------------------------------------------------------------------
// v4.19 keyword tier assignment (see keywords.ts / docs/KEYWORD_TIERS.md).
// Deterministic and rarity-skewed: higher rarity lands higher tiers, the
// same shape as the old per-card magnitude rolls this replaces. Tier
// choices are pinned so every current magnitude maps to the tier printing
// that exact magnitude (Bulwark x -> tier x, Steel 1 -> I, Echo's rarity
// fodder-waiver -> II at Rare+, Pierce's half-ATK cap -> II, ...), so the
// tier system is a re-representation of live balance, not a power shuffle —
// only the new tier-cap printings at the very top of the rarity ladder
// (Guard/Frenzy/Pierce/Anchor III, Ward/Avenge/Aftershock II, ...) are new.
// ---------------------------------------------------------------------------
function tierFor(kw: string, rt: number, primary: boolean): number {
  switch (kw) {
    case 'Guard':
      return primary ? (rt >= 4 ? 3 : 2) : 1;
    case 'Swift':
      return primary ? 2 : 1;
    case 'Frenzy':
      return primary ? (rt >= 4 ? 3 : 2) : 1;
    case 'Ward':
      return rt >= 4 ? 2 : 1;
    case 'Pierce':
      return rt >= 4 ? 3 : 2;
    case 'Anchor':
      return rt >= 4 ? 3 : 2;
    case 'Echo':
      return rt >= 2 ? 2 : 1; // matches the legacy rarity fodder-waiver split
    case 'Twin':
      return Math.min(3, 1 + Math.floor(rt / 2));
    case 'Bulwark':
      return 1 + Math.min(2, Math.floor(rt / 2)); // == the legacy x
    case 'Toll':
    case 'Steel':
      return 1; // legacy flat 1 (manual Steel identities override below)
    case 'Avenge':
      return rt >= 4 ? 2 : 1;
    case 'Aftershock':
      // rt>=3, not >=4: tier>=4 Events route to the bomb branch and never
      // roll Aftershock, so Super-Rare is this keyword's reachable top.
      return rt >= 3 ? 2 : 1;
    case 'Overrun':
      return rt >= 5 ? 2 : 1;
    case 'Rally':
    case 'Tribute':
    case 'Foothold':
      return rt >= 3 ? 2 : 1;
    case 'Scrap':
      return rt >= 2 ? 2 : 1;
    case 'Crescendo':
      return rt >= 3 ? 2 : 1; // magnitudes 4/5 == the legacy x split
    case 'Excavate':
      return 2; // magnitude 2 == the live SIM_TUNING.excavateRate
    default:
      return 1; // Snap, Contested, single-tier keywords
  }
}

function assignTiers(keywords: string[], rt: number, primaryKw?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const kw of keywords) out[kw] = tierFor(kw, rt, kw === primaryKw);
  return out;
}

/** Summed tier costWeight + the tier-cap premium discount — the keyword term
 * of the v4.19 casting-cost recalculation:
 *   costTier = clamp(rarityTier + round(sum(costWeight)/2) - premium, 0, 5)
 * where premium is 1 if the card carries the HIGHEST tier of any keyword
 * with a 3+-tier ladder (the "much cheaper effective cast" half of the
 * tier-cap premium rule; the other half is the tier's own cap rider). */
export function keywordCostTier(rt: number, tiers: Record<string, number>): number {
  let w = 0;
  let premium = 0;
  for (const [kw, t] of Object.entries(tiers)) {
    w += tierCostWeight(kw, t);
    if (maxTier(kw) >= 3 && t === maxTier(kw)) premium = 1;
  }
  return Math.max(0, Math.min(5, rt + Math.round(w / 2) - premium));
}

// v4.16 fix: keyword layering below (secondary keyword, Pierce, Overrun,
// Rally, Bulwark, Toll, Avenge, Steel) each independently rolls on to a
// card with NO check that the combined color identity (colors.ts's
// `cardColors`, which unions COLOR_OF_KEYWORD across every keyword a card
// carries) still fits within some real Leader's 2-color pair
// (LEADER_COLORS). A card whose keywords span 3+ distinct colors, or 2
// colors that no Leader pairs together, becomes illegal for every
// Leader — i.e. undraftable, permanently dead weight in the pool (a full
// audit found 28/284 non-Leader cards, 9.9%, in this state; every def.toll
// card was among them, which is why Toll had literally never fired across
// 66,120 sim games).
//
// Fix at the root: before layering any secondary keyword onto a card,
// check whether the resulting keyword set would still be legal for at
// least one Leader; if not, skip that layer (same pattern as the existing
// probabilistic gates elsewhere in this file that skip additions) rather
// than force an illegal combination onto the card. Purely a skip/no-op
// gate — no new randomness, no change to keywords that already fit.
function wouldBeLegalSomewhere(keywords: string[]): boolean {
  const colors = new Set<Color>();
  for (const kw of keywords) {
    const c = COLOR_OF_KEYWORD[kw];
    if (c) colors.add(c);
  }
  const arr = Array.from(colors);
  if (arr.length === 0) return true; // colorless (Slate) is always legal
  return Object.values(LEADER_COLORS).some((pair) => arr.every((c) => pair.includes(c)));
}

// Deterministic small hash so mechanical assignment is stable per card id.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const pick = <T>(id: string, salt: number, arr: T[]): T => arr[(hash(id) + salt) % arr.length];

const RARITY_TIER: Record<string, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  'Super-Rare': 3,
  // Full-Art sits between Super-Rare and Ultra-Rare (see economy.ts pricing
  // and rarity.ts glow tiers).
  'Full-Art': 4,
  'Ultra-Rare': 5,
  Mythic: 6,
};

// ---------------------------------------------------------------------------
// v4.3 Cast Slot cost vocabulary — every Unit/Charm/Event prices in one of:
//   - Single Die, exact number ('exact')
//   - Combine the value of any number of dice ('sum')
//   - a dice-pattern gate: Pairs, Three/Four/Five of a Kind, Full House,
//     Small/Large Straight, Three Odds, Three Evens (all reuse `comboGate` —
//     already engine-supported on any card type: once-per-turn cap, AI
//     reroll-toward-it, UI badge — so this is pure assignment, no new engine
//     mechanic needed for the pattern formats).
// Harder gates and bigger sum targets skew toward higher rarity, mirroring
// the old plain-threshold scaling this replaces.
// ---------------------------------------------------------------------------
export type CostPick =
  | { kind: 'exact'; value: number }
  | { kind: 'sum'; value: number }
  | { kind: 'gate'; pattern: ComboPattern };

const EASY_GATES: ComboPattern[] = ['AnyPair', 'ThreeOdds', 'ThreeEvens'];
const MID_GATES: ComboPattern[] = ['ThreeKind', 'TwoPair', 'SmallStraight'];
// v4.5 (§7): FullHouse/FourKind/LargeStraight, unchanged from their
// original three-way split — kept here ONLY so pickHardGate() below can
// `pick()` against it with the exact same indices every other card in the
// pool has always resolved against. Do not shrink this array — see the
// v4.5.1 note on pickHardGate() for why a naive removal is a correctness
// bug, not just a design tweak.
const HARD_GATES_RAW: ComboPattern[] = ['FullHouse', 'FourKind', 'LargeStraight'];

/**
 * v4.5.1: FourKind is excluded from general assignment per §7's guidance
 * ("Full House and Large Straight are the practical ceiling... Yahtzee/
 * Four-of-a-Kind gates are flavor-only rarity — a tiny handful of true
 * trophy cards"), but a v4.5 first attempt did this by shrinking the
 * picker array (`HARD_GATES = ['FullHouse', 'LargeStraight']`), which was a
 * correctness bug: `pick()` indexes with `hash(id) % arr.length`, so
 * changing the array's LENGTH reassigns the modulo bucket for every card
 * that rolls into this picker, not just the ones that would've landed on
 * FourKind. That silently reshuffled which specific cards are
 * FullHouse-gated vs. LargeStraight-gated pool-wide — including cards that
 * had nothing to do with FourKind — and a balance-sim re-run traced a
 * severe, otherwise-unexplained regression in both Straight-family
 * Combo-gated archetypes (Diver Straight-Combo 32.7%->14.6%, Sea Witch
 * Bind-Straight Combo 69.1%->54.8%) directly to this one array-shrink, via
 * a dedicated isolate-and-measure sim run against a git worktree checkout
 * of the exact pre/post commit. Fixed the RIGHT way here: `pick()` against
 * the full, original three-option array (stable — every card that
 * previously resolved to FullHouse or LargeStraight still does, byte for
 * byte), then remap ONLY a FourKind result to FullHouse/LargeStraight via a
 * second, independent hash. This changes exactly the cards that need to
 * change and nothing else.
 */
function pickHardGate(id: string): ComboPattern {
  const p = pick(id, 41, HARD_GATES_RAW);
  if (p !== 'FourKind') return p;
  return hash(`${id}:fourkind-remap`) % 2 === 0 ? 'FullHouse' : 'LargeStraight';
}

export function pickCostFormat(id: string, tier: number): CostPick {
  const roll = hash(`${id}:cost`) % 10;
  if (tier <= 1) {
    if (roll < 4) return { kind: 'exact', value: 1 + (hash(`${id}:ev`) % 4) }; // 1-4
    if (roll < 7) return { kind: 'sum', value: 4 + (hash(`${id}:sv`) % 3) }; // 4-6
    return { kind: 'gate', pattern: pick(id, 41, EASY_GATES) };
  }
  if (tier === 2) {
    if (roll < 3) return { kind: 'exact', value: 2 + (hash(`${id}:ev`) % 5) }; // 2-6
    if (roll < 6) return { kind: 'sum', value: 7 + (hash(`${id}:sv`) % 4) }; // 7-10
    if (roll < 8) return { kind: 'gate', pattern: pick(id, 41, MID_GATES) };
    return { kind: 'gate', pattern: pick(id, 41, EASY_GATES) };
  }
  if (tier === 3) {
    if (roll < 3) return { kind: 'sum', value: 9 + (hash(`${id}:sv`) % 5) }; // 9-13
    if (roll < 7) return { kind: 'gate', pattern: pick(id, 41, MID_GATES) };
    return { kind: 'gate', pattern: pickHardGate(id) };
  }
  // tier 4-5 (Ultra-Rare, Mythic): the hardest, highest-payoff formats.
  if (roll < 3) return { kind: 'sum', value: 13 + (hash(`${id}:sv`) % 6) }; // 13-18
  return { kind: 'gate', pattern: pickHardGate(id) };
}

/** Apply a cost pick to a CardDef, clearing whichever numeric/gate field it doesn't use. */
export function applyCostFormat(def: CardDef, cost: CostPick) {
  if (cost.kind === 'gate') {
    def.comboGate = cost.pattern;
    def.threshold = undefined;
    def.castCostKind = undefined;
  } else {
    def.threshold = cost.value;
    def.castCostKind = cost.kind;
    def.comboGate = undefined;
  }
}

// The primary keyword wheel each Unit draws from (weights via repetition).
const UNIT_KEYWORDS = ['Ward', 'Guard', 'Guard', 'Frenzy', 'Swift', 'Echo', 'Twin', 'Anchor'];

/**
 * v4.6: a cast cost's real difficulty on a 1-6 "threshold-equivalent" scale,
 * measured (not guessed) from `npm run pattern-hitrate` under the actual
 * 2-reroll rule. The old stat-budget formula priced every Unit off its
 * pre-format `threshold` even though `applyCostFormat` then replaced that
 * cost with something wildly easier or harder:
 * - 'exact' is near-FLAT in difficulty regardless of the printed face
 *   (any specific value among 5 dice with 2 directed rerolls lands ~90% of
 *   the time) — yet an exact-6 card kept stats budgeted for threshold 6.
 *   The balance sim's "most likely OP" list was dominated by exact-cost
 *   Units as a result (Cavernous Watcher: a 9/3 for exact-6; Vector Blade
 *   Captain: a 5/6 Guard/Avenge for exact-2).
 * - straight-family gates are far HARDER than the match-family gates they
 *   shared a tier with (directed 2-reroll hit rates: SmallStraight 44.1%
 *   vs ThreeKind 74.4%/TwoPair 74.1%; LargeStraight 17.7% vs FullHouse
 *   34.7%) — the structural reason every straight-gate archetype in the
 *   sim roster sat 20+pt below its match-family siblings.
 * Gate difficulties also price in the one-Combo-gated-cast-per-turn cap.
 */
export const GATE_DIFFICULTY: Record<ComboPattern, number> = {
  AnyPair: 1.5,
  ThreeOdds: 2,
  ThreeEvens: 2,
  ThreeKind: 3.5,
  TwoPair: 3.5,
  SmallStraight: 4.5,
  FullHouse: 5,
  FourKind: 5.5,
  LargeStraight: 6,
  Yahtzee: 6,
};
export function costDifficulty(cost: CostPick): number {
  if (cost.kind === 'exact') return 2;
  // 'sum' spends SEVERAL dice — the difficulty is the opportunity cost of
  // the dice consumed, scaling with the target (avg die = 3.5).
  if (cost.kind === 'sum') return Math.min(6, 1 + cost.value / 3);
  return GATE_DIFFICULTY[cost.pattern];
}

/**
 * v4.10: costDifficulty() takes a CostPick, but every already-BUILT CardDef
 * in the pool only exposes the applied result (threshold/castCostKind/
 * comboGate), not the original CostPick — so nothing could actually resolve
 * a live card's difficulty without reconstructing one. This is the "cards
 * costs vs ability" analysis simulate-v4.ts's cost-vs-value table needs (see
 * v4.8's CHANGELOG entry, which claimed this table shipped — it never
 * actually did; `costDifficulty` was imported into the harness and never
 * called). 'atLeast'/Twin-format cards (undefined castCostKind, threshold
 * set) aren't a CostPick variant at all — their difficulty is just the
 * printed threshold directly, same 1-6 scale the others normalize to.
 */
export function cardDifficulty(def: CardDef): number {
  if (def.comboGate) return GATE_DIFFICULTY[def.comboGate];
  if (def.castCostKind === 'exact') return 2;
  if (def.castCostKind === 'sum') return Math.min(6, 1 + (def.threshold || 0) / 3);
  if (def.threshold !== undefined) return def.threshold;
  return 3; // Location (free cast) or Leader (no Cast Slot cost) — neutral.
}

// ---------------------------------------------------------------------------
// Unit mapping
// ---------------------------------------------------------------------------
function mapUnit(c: CardTemplate): CardDef {
  const tier = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  // Legacy threshold, still the cost basis for Twin cards only (their
  // two-slot exact-face mechanic never went through the v4.3 cost formats).
  const threshold = Math.min(6, 1 + Math.min(4, tier) + (hash(c.id) % 2 === 0 ? 1 : 0));

  // Keyword selection first, so Twin-ness is known before budgeting.
  // IMPORTANT: every pick() salt and hash(...) condition here is unchanged
  // from v4.5 — reordering must never reassign which keywords a card gets
  // (see pickHardGate's warning about hash-assignment fragility).
  const keywords: string[] = [];
  let primaryKw = pick(c.id, 9, UNIT_KEYWORDS);
  // v4.0 balance: Swift (haste) on cheap bodies was the dominant aggro engine.
  // On a threshold <= 2 Unit it becomes Guard instead (a cheap early wall),
  // so Swift only shows up where paying for a real tempo body is a choice.
  // v4.6 NOTE: a first attempt keyed this off costDifficulty(cost) <= 2 —
  // that converted Swift on every exact-cost/easy-gate card at EVERY tier
  // (a pool-wide keyword reassignment, the exact fragility pickHardGate's
  // comment warns about), and a verification sim measured the fallout
  // directly: Swift's keyword win rate 51.3% -> 33.3%, and Legendary Diver
  // (the Swift-identity Leader) 34.2% -> 27.4%. Reverted to the stable
  // legacy-threshold check.
  if (primaryKw === 'Swift' && threshold <= 2) primaryKw = 'Guard';
  keywords.push(primaryKw);

  // Higher rarity grants a second keyword sometimes.
  if (tier >= 2 && hash(c.id) % 3 !== 0) {
    const secondary = pick(c.id, 13, UNIT_KEYWORDS);
    if (secondary !== primaryKw && wouldBeLegalSomewhere([...keywords, secondary])) {
      keywords.push(secondary);
    }
  }
  if (
    tier >= 3 &&
    !keywords.includes('Pierce') &&
    hash(c.id) % 3 === 0 &&
    wouldBeLegalSomewhere([...keywords, 'Pierce'])
  )
    keywords.push('Pierce');
  // v4.4 Overrun: a direct, targeted counter to the durability-stack meta
  // (Ward/Steel/Bulwark fully zeroing a hit) — layered independently, same
  // pattern as the Pierce secondary roll above.
  // v4.6: prevalence doubled (%8===6 -> %4===2, i.e. also %8===2) — the
  // three durability-stack archetypes (Steel-Scrap Control 81.4%,
  // Guard-Bulwark Turtle 78.0%, Toll-Bulwark Fortress 77.3%) stayed
  // dominant with Overrun too rare to matter as the printed answer. Purely
  // additive: every card that had Overrun still has it.
  if (
    tier >= 2 &&
    !keywords.includes('Overrun') &&
    hash(c.id) % 4 === 2 &&
    wouldBeLegalSomewhere([...keywords, 'Overrun'])
  )
    keywords.push('Overrun');

  // v4.19: the layered keyword ROLLS (ability-Rally, Bulwark, Toll, Avenge,
  // Steel, the manual Steel identities, Chrono-Phalanx's Overrun) moved up
  // from the post-stat section, in their original relative order, so the
  // keyword set at each wouldBeLegalSomewhere() check — and therefore every
  // outcome — is byte-identical to v4.18. They must be known BEFORE cost
  // and stats now, because the v4.19 cost recalculation prices the summed
  // keyword-tier costWeight into the cast cost.
  const hasAbility = tier >= 2 && hash(c.id) % 4 === 1;
  if (hasAbility && hash(c.id) % 3 === 0 && wouldBeLegalSomewhere([...keywords, 'Rally']))
    keywords.push('Rally');
  if (tier >= 1 && hash(c.id) % 7 === 2 && wouldBeLegalSomewhere([...keywords, 'Bulwark']))
    keywords.push('Bulwark');
  if (tier >= 2 && hash(c.id) % 7 === 5 && wouldBeLegalSomewhere([...keywords, 'Toll']))
    keywords.push('Toll');
  if (tier >= 1 && hash(c.id) % 11 === 3 && wouldBeLegalSomewhere([...keywords, 'Avenge']))
    keywords.push('Avenge');
  // v4.21: item 5 — cost-side nudges measured flat at +18.0pt for two
  // passes running and the tier ladder is already floored (see keywords.ts).
  // The only lever left is print rate; cut again (1-in-12 -> 1-in-15).
  if (tier >= 2 && hash(c.id) % 15 === 4 && wouldBeLegalSomewhere([...keywords, 'Steel']))
    keywords.push('Steel');
  const manualSteelX =
    MANUAL_STEEL[c.id] !== undefined && !keywords.includes('Steel') && wouldBeLegalSomewhere([...keywords, 'Steel'])
      ? MANUAL_STEEL[c.id]
      : undefined;
  if (manualSteelX !== undefined) keywords.push('Steel');
  if (c.id === 'chrono_phalanx' && !keywords.includes('Overrun') && wouldBeLegalSomewhere([...keywords, 'Overrun']))
    keywords.push('Overrun');

  // ---- v4.19 keyword tiers + casting-cost recalculation ----
  const keywordTiers = assignTiers(keywords, tier, primaryKw);
  // The two manual Steel identity cards keep their old magnitudes as tiers
  // (x2 -> Steel II, x3 -> Steel III).
  if (manualSteelX !== undefined) keywordTiers.Steel = Math.min(3, Math.max(1, manualSteelX));
  // Cost recalculation: rarity base + summed keyword-tier costWeight, with
  // the tier-cap premium discount — see keywordCostTier()'s formula.
  const costTier = keywordCostTier(tier, keywordTiers);
  const cost = pickCostFormat(c.id, costTier);

  // v4.6 stat budget: the balance sim's "most likely OP" list was dominated
  // by exact-cost Units whose stats were budgeted off the pre-format
  // threshold even though an exact-face cost is near-flat easy regardless
  // of the printed value (~90% with 2 directed rerolls — Cavernous Watcher
  // was a 9/3 for "exactly 6"). Clamp ONLY the exact-cost basis down to the
  // measured difficulty; every other format keeps the legacy threshold
  // basis. (A first attempt re-priced ALL formats off measured difficulty —
  // a verification sim showed that trimming match-gate/easy-gate bodies
  // pool-wide crashed the match-combo archetypes, Crimson Match-Combo
  // 58.6% -> 29.7%, without helping the straight decks it was meant to fix,
  // since almost no straight-gated Units exist. Surgical beats sweeping.)
  const isTwin = keywords.includes('Twin');
  // v4.7: Twin bodies were budgeted off the legacy threshold, then printed
  // at threshold-1 with full stats PLUS a twinBonus rider and a staged
  // passive — and under the 'sameTurn' Twin mode a matching pair is nearly
  // as easy as AnyPair (99.9% hit rate). Twin topped the keyword table
  // (58.1%) and both Twin-labeled archetypes beat 74% with Location decks;
  // Lurking Coral-Prowler was a 9/8 for a printed threshold of 4. Budget
  // off the ACTUAL printed cast threshold instead (see the Twin block
  // below: min(5, max(2, threshold-1))).
  // v4.8: exact-cost basis trimmed a further half-point (2 -> 1.5). The new
  // cost-vs-value harness section showed the ENTIRE "most under-priced" top
  // ten was exact/easy-cost bodies (Flickering Sea Pens/Cavernous Watcher
  // 75.1%, Vector Blade Captain 67.5%...), and those same cheap defensive
  // bodies are the measured engine of the wall decks that top the roster
  // (the v4.8 deck-level ablation put Avenge Grind's list at 93.8% even
  // under a different Leader — the list IS the deck). Hash-stable: only the
  // stat budget moves, never keyword/cost assignment.
  const D =
    !isTwin && cost.kind === 'exact'
      ? Math.min(threshold, SIM_TUNING.exactCostBudgetCap)
      : isTwin
        ? Math.min(5, Math.max(2, threshold - 1))
        : threshold;
  const budget = 2 + Math.round(D * 2) + (tier >= 4 ? 2 : 0);
  const bias = (hash(c.id) >> 3) % 3; // 0 aggro, 1 balanced, 2 defensive
  let atk =
    bias === 0
      ? Math.ceil(budget * 0.62)
      : bias === 2
        ? Math.floor(budget * 0.35)
        : Math.round(budget * 0.5);
  let hp = Math.max(1, budget - atk);
  atk = Math.max(1, atk);

  // Guard wants more HP to actually wall aggro; Frenzy wants a nudged ATK
  // now that its downside is softer (only the 2nd swing doubles retaliation).
  if (primaryKw === 'Guard') {
    // v4.19: Guard II prints the classic bonus; Guard III (tier-cap premium,
    // top rarities) prints +2 more — magnitudes 2/4 in KEYWORD_TIERS.
    hp += SIM_TUNING.guardHpBonus + ((keywordTiers.Guard ?? 1) >= 3 ? 2 : 0);
  }
  // Ward refreshing every End Phase already soaks ~one attack per round for
  // free — no stat bonus on top (Ward-stacked shells dominated with one).
  // v4.4.2: unconditional +2 (was a coin-flip +1) — the v4.4.1 Leader-target
  // carve-out for a behind-on-board Frenzy attacker barely moved the
  // keyword's win rate (48.1% -> 48.5%): the overlap between "behind on
  // Units" and "still has a live Frenzy attacker to swing with" is narrow.
  // A direct raw-stat buff helps every Frenzy card regardless of board
  // state, compensating for the real (and correct) overflow/targeting
  // nerfs from earlier this patch instead of relying on a rarely-triggered
  // conditional.
  if (primaryKw === 'Frenzy') {
    atk += 2;
  }
  // v4.12: Swift has been the pool's single weakest keyword for at least two
  // consecutive full-pool passes (34.7-36.8% deck win%, dead last every time,
  // 15-20pt behind the next-weakest keyword) and it's Legendary Diver's
  // identity keyword — the Leader has posted the worst win rate in the
  // roster (22-24%) every pass this keyword has been measured. Unlike Guard/
  // Frenzy/Anchor, Swift got no compensating stat bonus when those three
  // did. Haste alone (no summoning-sickness turn) isn't pulling its weight
  // against keywords that add durability or damage on top of a body's base
  // stats — give it a modest +1 ATK, the same shape of fix already proven
  // for Frenzy.
  if (primaryKw === 'Swift') {
    atk += 1;
  }
  // v4.7: Anchor bodies must SURVIVE on board for the ramp to exist at all,
  // and the pool's cheap Anchor units were glass (4/2 exact-4 walls that die
  // to everything). The v4.7 ablation measured +2 HP on Anchor Units as the
  // single biggest recovery for the roster-floor ramp archetypes (Abyss
  // Excavate Ramp 14.4% -> 39.2% under the fatigue rule; every Anchor deck
  // improved) while barely moving the top decks.
  // v4.8: +2 -> +3. The round-4 ablation measured one MORE point of Anchor
  // HP as the only dial that lifted every ramp-floor deck at once
  // (Anchor-Scrap 13.8 -> 20.4 -> 29.2 at +1/+2 on top of the v4.7 print)
  // while leaving the roster's top decks flat.
  if (keywords.includes('Anchor')) {
    hp += 3;
  }

  const def: CardDef = {
    id: c.id,
    name: c.name,
    type: 'Unit',
    threshold,
    atk,
    hp,
    keywords,
    keywordTiers,
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
  };
  // v4.19: legacy per-card magnitude fields are compat MIRRORS of the tier
  // table now (the AI/UI key off their presence); the engine reads
  // magnitudes from KEYWORD_TIERS via keywordTier().
  if (keywords.includes('Bulwark'))
    def.bulwark = { x: tierMagnitude('Bulwark', keywordTiers.Bulwark) };
  if (keywords.includes('Toll')) def.toll = { x: tierMagnitude('Toll', keywordTiers.Toll) };
  if (keywords.includes('Steel')) def.steel = { x: tierMagnitude('Steel', keywordTiers.Steel) };
  if (keywords.includes('Avenge')) def.avenge = true;

  // v4.3: assign this Unit's real Cast Slot cost format — every non-Twin
  // Unit prices in exact/sum/a dice-pattern gate instead of the old plain
  // "die >= threshold". Twin cards keep the legacy at-least cost (below):
  // their two Cast Slots already require matching an exact rolled face,
  // which is a distinct mechanic from the new 'exact' cost format.
  // v4.19: the applied cost is the recalculated one (stats/rarity basis +
  // keyword-tier costWeight - tier-cap premium), the same `cost` the stat
  // budget above already priced against.
  if (!keywords.includes('Twin')) {
    applyCostFormat(def, cost);
    applyManualCostAdj(def, c.id);
    // v4.6: same straight-gate compensation mapSpell applies to payoffs —
    // a straight gate is far harder to hit than its match-family tier
    // sibling (see GATE_DIFFICULTY), so the few straight-gated Units get a
    // stat bump for the harder, once-per-turn-capped cast.
    if (def.comboGate === 'SmallStraight') {
      def.atk = (def.atk || 0) + 1;
      def.hp = (def.hp || 0) + 1;
    } else if (def.comboGate === 'LargeStraight') {
      def.atk = (def.atk || 0) + 2;
      def.hp = (def.hp || 0) + 2;
    }
  }

  // Twin units carry a printed Twin bonus (required by §7).
  if (keywords.includes('Twin')) {
    // v4.19: the rider's size is the Twin tier (I/II/III -> small/medium/
    // large — see KEYWORD_TIERS), replacing the old raw-rarity scaling with
    // nearly identical values (top-end sap trimmed 5 -> 4).
    const tt = keywordTiers.Twin ?? 1;
    def.twinBonus = pick(c.id, 1, [
      { action: 'sap', value: 1 + tt, target: 'enemyLeader' } as Effect,
      { action: 'buff', value: tt, target: 'allFriendlyUnits' } as Effect,
      { action: 'draw', value: 1, target: 'none' } as Effect,
    ]);
    // Twin cards use a modest even threshold so pairs are reachable.
    def.threshold = Math.min(5, Math.max(2, threshold - 1));
    // v4.2 Twin errata B, fix 2 (stagedPassive test batch): a small passive
    // while parked in Staging, so the cross-turn cost isn't pure dead tempo.
    def.stagedPassive = { action: 'mend', value: 1, target: 'friendlyLeader' };
  }

  // Some higher-rarity units carry an Ability Slot (utility, not just a body).
  // (v4.19: the Rally roll that used to live here moved into the keyword
  // phase above — `hasAbility` preserves this block's original condition.)
  if (hasAbility) {
    def.ability = pick(c.id, 2, [
      { threshold: 4, effect: { action: 'mend', value: 2, target: 'friendlyAny' } },
      { threshold: 4, effect: { action: 'sap', value: 2, target: 'anyTarget' } },
      { threshold: 5, effect: { action: 'draw', value: 1, target: 'none' } },
      { threshold: 3, effect: { action: 'buff', value: 1, target: 'friendlyUnit' } },
    ]);
  }

  // A Combo passive on a slice of units (points toward archetypes).
  if (tier >= 1 && hash(c.id) % 5 === 0) {
    const pat = pick(c.id, 3, ['AnyPair', 'ThreeKind', 'SmallStraight'] as ComboPattern[]);
    def.combo = {
      pattern: pat,
      effect: pick(c.id, 4, [
        { action: 'buff', value: 1, target: 'self' } as Effect,
        { action: 'sap', value: 2, target: 'anyTarget' } as Effect,
        { action: 'mend', value: 2, target: 'friendlyLeader' } as Effect,
      ]),
    };
  }

  // Overflow reward on a slice, off the effective threshold — only makes
  // sense against a numeric cost that a die can actually exceed: 'sum'
  // (beat the dice-total target by `amount`) or the Twin/undefined "at
  // least" format engine.ts's payableNumeric() falls back to. An 'exact'
  // cost mandates dieValue === threshold with no slack — overflowHit
  // (engine.ts) computes `dieValue - eff`, which is always exactly 0 for an
  // exact-cost card, so Overflow could never trigger there; excluding it
  // here keeps every card carrying the Overflow badge one that can actually
  // fire it. Dice-pattern-gated cards have no numeric threshold to exceed.
  if (def.threshold !== undefined && def.castCostKind !== 'exact' && hash(c.id) % 6 === 0) {
    def.overflow = { amount: 2, effect: { action: 'buff', value: 1, target: 'self' } };
  }

  // v4.2 Unit keywords: Bulwark, Toll, Avenge, Steel — their rolls moved to
  // the v4.19 keyword phase near the top of this function (unchanged hash
  // conditions); their magnitudes now print from the keyword tier table.
  // v4.8: Chrono-Phalanx trophy identity — +2/+2 over budget (its Overrun
  // grant moved to the v4.19 keyword phase above; the Steel roll history
  // lives at MANUAL_STEEL's module-scope declaration).
  if (c.id === 'chrono_phalanx') {
    def.atk = (def.atk || 0) + 2;
    def.hp = (def.hp || 0) + 2;
  }
  // v4.9 ablation dial (live default 0, i.e. off): a flat HP surcharge on
  // any Unit that ends up matching isCheapDurableBody() below — a direct
  // per-card tax on the "wall-list" shape the v4.8 findings' §4 item 1
  // flagged, instead of another keyword- or Leader-targeted lever.
  if (SIM_TUNING.durableBodyTax > 0 && isCheapDurableBody(def)) {
    def.hp = Math.max(1, (def.hp || 0) - SIM_TUNING.durableBodyTax);
  }
  // v4.12: the first full-pool run (292 vs. the prior 193 cards; see
  // BALANCE_SIM_FINDINGS_v4.12.md §2) surfaced a batch of never-before-simmed
  // cards as extreme cost-vs-value RESIDUAL outliers (win% far off the mean
  // of every other card at the same cast-difficulty band). Same named-card
  // identity-patch pattern as MANUAL_STEEL/MANUAL_VALUE_BUFF above — a flat
  // stat trim/bump split across ATK and HP, sized to the measured residual
  // (2pt of stats for the two most extreme, 1pt for the rest).
  if (MANUAL_STAT_TRIM[c.id] !== undefined) {
    const d = MANUAL_STAT_TRIM[c.id];
    const half = Math.trunc(d / 2);
    def.atk = Math.max(1, (def.atk || 0) + half);
    def.hp = Math.max(1, (def.hp || 0) + (d - half));
  }
  return def;
}

// v4.4: two named cards manually granted Steel as a discrete identity buff,
// independent of the procedural 1-in-12 roll (both were flagged as
// underperformers: Tang's Refuge the weakest Common in the pool, Nanite
// Division Marshal one of the least-cast Ultra-Rares). v4.19: their old x
// values are now Steel tiers II/III — the pool's only Steel above tier I
// (procedural Steel prints tier I, the v4.16/v4.18-trimmed flat 1).
const MANUAL_STEEL: Record<string, number> = {
  tang_s_refuge: 2,
  // v4.19.1: 3 -> 2. Steel III made it the pool's only Steel tier-cap
  // premium card — the premium's full cost-tier discount priced an
  // Ultra-Rare at ~1.5 pips/cast, and the archetype-normalized table put it
  // at +21.0pt, the single worst residual in the pool. Tier II keeps the
  // identity buff without the cap discount.
  nanite_division_marshal: 2,
};

const MANUAL_STAT_TRIM: Record<string, number> = {
  // nerfs (win% far ABOVE their cost band's mean)
  // v4.12 verification pass: -1/-1 (from -2) barely moved Vampire Squid/
  // Half-Faded Shade's residual (+44.8 -> +42.7, +35.9 -> +33.9 — noise-level)
  // -- both stack Guard+Bulwark (durability-stack shape, see the recurring
  // "wall-list meta" findings) on top of already-generous ATK, so a bigger
  // cut is warranted. Where the Deep Meets the Sky similarly barely moved
  // (+38.2 -> +34.7).
  vampire_squid: -4,
  half_faded_shade: -4,
  where_the_deep_meets_the_sky: -4,
  // v4.23: the_wolf_of_wall_street's -1 (v4.20) overshot the other way —
  // this pass it's back on the cardsToBuff list (resid=-32.2pt, n=912),
  // the same "re-applied nerf overshot, revert instead of compounding"
  // shape mesozoic_exchange_student already went through below. Reverted
  // (entry removed) rather than buffed on top of a nerf that's clearly
  // too big now.
  // v4.18: the_wolf_of_wall_street's -1 (v4.12) overshot — the v4.18
  // baseline shows it now at the OPPOSITE extreme (win%=7.8 vs a 45.9
  // cost-band mean, resid=-38.1pt, cardsToBuff top 5) instead of the
  // over-performer it was patched for. Reverted rather than re-nerfed.
  mesozoic_exchange_student: -1,
  blind_colossus: -2,
  fayes_true_face: -2,
  vlad_from_accounting: -1,
  // buffs (win% far BELOW their cost band's mean)
  void_mother: 2,
  // v4.20: familiar_in_the_dark's halved +1 (v4.19.1) still barely moved
  // the residual (+19.3 -> +19.6pt, flat across two passes) — the buff
  // itself, not its size, was the problem. Removed entirely.
  // v4.19.1: first archetype-normalized outlier pass (cardArchNormalized,
  // n>=400, archSpread>=2 — the lens v4.18 flagged as missing). Uniform
  // small trims for the residual top of the table; sized -2 for the two
  // biggest multi-archetype offenders, -1 for the smaller-sample one.
  cervine_channeler: -2, // +20.9pt, n=1343, spread 4
  dr_aries_chief_biogeneticist: -2, // +19.0pt, n=1043, ~1.5 pips/cast
  worm_brain_host: -1, // +19.0pt, n=475, spread 2
  // v4.18: butterflyfish_school's +1 (v4.12) overshot — the v4.18 baseline
  // shows it now at the OPPOSITE extreme (win%=76.5 vs a 42.1 cost-band
  // mean, resid=+34.4pt, cardsToNerf top 3) instead of the under-performer
  // it was patched for. Reverted rather than re-buffed further.
  // v4.17 Item B: residual cost-band outliers whose lever is raw stats (no
  // onCast to adjust via MANUAL_VALUE_BUFF). Stack sizes proportionate to
  // how far off the measured residual was — the two identical-statline
  // Frenzy Commons (Wasteland Aberration/Kinetix Enforcer) and the two
  // Guard-durability Uncommons get the standard -1; Astral Shoal is a
  // Full-Art trophy body with FOUR keywords stacked (Guard/Echo/Bulwark/
  // Steel) behind a FullHouse gate, so it gets the bigger -2 given to other
  // multi-keyword durability trophies above.
  smokeveil_striketeam: 1,
  wasteland_aberration: -1,
  // v4.22: repeat-offender escalation — three of these (astral_shoal,
  // kinetix_enforcer, boneplate_sentinel) held their v4.17 trim size flat
  // across two more full-scale passes (26,448 games, zero invariant
  // violations) without the residual meaningfully closing, the same
  // "barely moved, take a bigger step" pattern this file's other repeat
  // offenders (vampire_squid/half_faded_shade, the_locksmiths_regret/
  // the_abyssal_gate) already went through. swaying_garden is a v4.19.1
  // -1 that likewise hasn't moved (still #4 cardsToNerf this pass,
  // n=912). where_the_deep_meets_the_sky is NOT re-escalated here despite
  // still showing +32.7pt resid — it's already at -4 (this file's largest
  // stat trim, and already the pool's max cast-difficulty band at 6.0);
  // carried forward as a design-tension case (see BALANCE_SIM_FINDINGS_
  // v4.22.md) rather than blindly stacking a 5th stat cut.
  boneplate_sentinel: -2,
  amethyst_starfish: -1,
  // v4.23: repeat-offender escalation — these five held their v4.22 trim
  // size flat across another full-scale pass (26,448 games, zero invariant
  // violations) without the residual closing, so each takes one more step
  // (same pattern as v4.22's own escalations above).
  kinetix_enforcer: -3, // was -2, still #3 cardsToNerf, +32.6pt resid
  swaying_garden: -3, // was -2, still #8 cardsToNerf, +31.2pt resid
  astral_shoal: -4, // was -3, still #1 cardsToNerf, +35.5pt resid
  clockwork_nautilus: -2, // was -1, still top-12 cardsToNerf, +31.2pt resid
  gulper_eel: -2, // was -1, still top-12 cardsToNerf, +31.2pt resid
  playful_otters: -2, // was -1, still top-12 cardsToNerf, +31.2pt resid
  cavernous_watcher: -2, // was -1, still top-12 cardsToNerf, +31.3pt resid
  // v4.22: cardsToBuff bottom-12 (win% far below cost-band mean) whose
  // lever is raw Unit stats. phantom_squadron and glowing_manta also
  // register as "under-costed" on the printed-power costVsAbilityMismatches
  // table (a different, stats-only metric) — that's the expected shape for
  // a card whose kit doesn't deliver on its paper efficiency; the buff here
  // follows the MEASURED win-rate residual, not the printed-power read (see
  // findings doc for the reasoning).
  phantom_squadron: 1,
  glowing_manta: 1,
  // v4.23: new cardsToBuff first-pass entry (n=912, resid=-32.3pt).
  nebula_snail: 1,
};

// ---------------------------------------------------------------------------
// Charm / Event mapping (one-shots)
// ---------------------------------------------------------------------------
const SAP_TARGETS: EffectTarget[] = ['anyTarget', 'enemyUnit', 'enemyLeader'];

/**
 * v4.10: Mer-King's two chronically weak archetypes (Twin Heal 37.1%, Avenge
 * Swarm 43.2% this pass — see docs/BALANCE_SIM_FINDINGS_v4.10.md; three
 * Leader-kit-level compensation attempts already tried and reverted in
 * v4.9, findings §2.2) got a dedicated per-card "cast this game -> win%"
 * breakdown this pass (simulate-v4.ts's archCardCastInGame/InWinGame — a
 * fixed-decklist archetype's win-IN-DECK is identical for every card since
 * every copy is in every game; only whether it actually got cast varies).
 * These six were consistently the bottom of their own archetype's cast-win%
 * table, not just weak in the abstract pool-wide numbers. Same small
 * named-card identity-patch pattern as MANUAL_STEEL below — a modest +1 to
 * each card's on-cast payoff, applied post-hoc in mapSpell/mapLocation.
 */
/**
 * v4.17: per-card cost-vs-ability outliers from the 66,120-game costVsAbility
 * Mismatches table — same named-card identity-patch pattern as MANUAL_STEEL/
 * MANUAL_VALUE_BUFF, but nudging the CAST cost side instead of the payoff
 * side. Numeric-cost cards (exact/sum) get a small threshold bump (harder to
 * hit); gate-cost cards get remapped one difficulty step up within
 * GATE_DIFFICULTY (see below), applied post-hoc after applyCostFormat in
 * both mapUnit and mapSpell (Locations never carry a Cast Slot cost at all,
 * so under-costed Locations are compensated via MANUAL_VALUE_BUFF instead —
 * see mapLocation). Two flagged cards (ash_shaper_mystic, rune_etched_tablet)
 * were part of the 28 "illegal everywhere" cards the wouldBeLegalSomewhere()
 * fix this pass made legal for the first time — their z-scores were measured
 * on a near-zero prior sample, so they're deliberately left out here pending
 * a fresh read with real sample size, rather than risk double-nerfing a card
 * that may not actually be an outlier once it's actually being drafted.
 */
const MANUAL_THRESHOLD_ADJ: Record<string, number> = {
  // Item A: under-costed, nudge the numeric cost up by the smallest unit
  // (+1 threshold on exact-cost Charms).
  // v4.20: driftwood_harp/ribbone_longbow's +1 (v4.17) held stable at a
  // repeat top-10 z-score across two more passes without regressing —
  // taking a second +1 step (Deceptive Angler/Abyssal Dragonfish/Ember
  // Whisperer/Boneplate Sentinel/Iron-Scaled Snail also z >= +2.0 but this
  // pass only re-sizes the two already-numeric-cost repeat offenders;
  // Deceptive Angler gets its own gate bump below, and the remaining Units
  // are left for a fresh read next pass rather than compounding blind).
  driftwood_harp: 2,
  ribbone_longbow: 2,
  // v4.21: item 4 — costVsAbilityMismatches repeat-10, first patch for the
  // pool's two remaining highest-z numeric-cost offenders not yet touched
  // (Abyssal Dragonfish +3.07, Ember Whisperer +3.07). No-op if either
  // procedurally lands on a gate cost instead of numeric.
  abyssal_dragonfish: 1,
  ember_whisperer: 1,
  // Item B buffs: value-less bind/destroy effects can't take a value bump,
  // so the buff lever is the cost side instead — ease the numeric cost down
  // by the smallest unit.
  bubble_harvest: -1,
  bone_splinter_quill: -1,
};
const MANUAL_GATE_OVERRIDE: Record<string, ComboPattern> = {
  // Item A: under-costed gate-cost Units, bumped one difficulty step up.
  // (ash_shaper_mystic intentionally omitted — see comment above.)
  // v4.20: deceptive_angler's ThreeEvens (v4.17) held the pool's single
  // worst costVsAbilityMismatches z-score flat across two more passes
  // (z=+3.33) — taking a second difficulty step.
  deceptive_angler: 'ThreeKind', // was AnyPair -> ThreeEvens (v4.17) -> ThreeKind
  blind_colossus: 'ThreeKind', // was ThreeOdds
  // Item B buffs: value-less destroy Events, eased one difficulty step down
  // so the payoff (already strong at full value) is reachable more often.
  shark_gathering: 'ThreeKind', // was FullHouse
  locust_veil: 'ThreeKind', // was FullHouse
};
/** Apply MANUAL_THRESHOLD_ADJ/MANUAL_GATE_OVERRIDE post-hoc to an already
 * cost-formatted CardDef (called after applyCostFormat in mapUnit/mapSpell). */
function applyManualCostAdj(def: CardDef, id: string) {
  const gateOverride = MANUAL_GATE_OVERRIDE[id];
  if (gateOverride !== undefined && def.comboGate !== undefined) {
    def.comboGate = gateOverride;
  }
  const adj = MANUAL_THRESHOLD_ADJ[id];
  if (adj !== undefined && def.threshold !== undefined) {
    def.threshold = Math.max(1, def.threshold + adj);
    // An exact cost must stay payable by a single d6 (v4.19: cost-tier
    // recalculation can shift the exact face up before this adj applies).
    if (def.castCostKind === 'exact') def.threshold = Math.min(6, def.threshold);
  }
}

const MANUAL_VALUE_BUFF: Record<string, number> = {
  kinetic_piercer: 1,
  isle_of_the_ancients: 1,
  hive_power_cell: 1,
  consuming_ash_cloud: 1,
  towering_tsunami: 1,
  narwhal_staff: 1,
  // v4.12: same first-full-pool-run cost-vs-value residual outliers as
  // MANUAL_STAT_TRIM above, for the non-Unit (Charm/Event/Location) side —
  // see BALANCE_SIM_FINDINGS_v4.12.md §2. One over-priced Charm nerfed
  // alongside the under-priced batch buffed.
  // v4.12 verification pass: +1 barely moved the two worst-residual charms/
  // events (Locksmith's Regret -27.8 -> -25.5, Abyssal Gate -22.4 -> -21.8);
  // doubled to +2 for those and Wraithlight Lantern/Familiar in the Dark's
  // sibling non-Unit cards.
  the_locksmiths_regret: 2,
  the_abyssal_gate: 2,
  wraithlight_lantern: 2,
  magma_conduit_network: 1,
  // v4.23: jawbone_span's +1 (v4.12) has flipped — it's now #10 cardsToNerf
  // (resid=+29.3pt, n=912) instead of an underperformer. Reverted (entry
  // removed) rather than compounding into a fresh nerf on the same lever.
  black_smoker: 1,
  kinetix_blacksite_cavern: 1,
  glowing_glyph_tablet: -1,
  // v4.17: cardsToBuff/cardsToNerf residual outliers (Item B) whose lever is
  // an onCast VALUE, not raw stats — Charms/Events/Locations. mist_ghost_ship/
  // ribvault_cathedral are also Item A cost-vs-ability outliers, but Locations
  // never carry a Cast Slot cost (see MANUAL_THRESHOLD_ADJ comment above), so
  // their nudge lands here instead, trimming the onCast buff value they get
  // for free every turn. nanite_culture_lab/the_descent were part of the 28
  // "illegal everywhere" fix this pass (near-zero prior sample) and are
  // deliberately left unchanged pending a fresh read.
  jagged_dragonfang_blade: 1,
  jarred_sunspark: 1,
  shimmering_statue: 1,
  diamond_anchor: 1,
  abyssal_pathway: -1,
  sunken_meadow: -1,
  obsidian_altar: -1,
  sovereign_spires_of_arrak_zul: -1,
  // v4.22: mist_ghost_ship/ribvault_cathedral's v4.17 -1 held flat across
  // three more passes without the costVsAbilityMismatches z-score closing
  // (still top-10 this pass at +2.65 each) — same repeat-offender
  // escalation pattern as the_locksmiths_regret/the_abyssal_gate above.
  mist_ghost_ship: -2,
  ribvault_cathedral: -2,
  // v4.23: petrified_ribs_citadel's v4.22 -1 held flat (still #2 cardsToNerf,
  // +33.2pt resid) — same repeat-offender escalation as mist_ghost_ship/
  // ribvault_cathedral above.
  petrified_ribs_citadel: -2,
  heart_of_the_thermal_grid: -1,
  // v4.22: cardsToBuff bottom-12 whose lever is onCast value (Charm/Event,
  // no Cast Slot cost to ease further where already at floor). All n=912+,
  // all first-pass entries with no prior manual patch. locust_veil already
  // has a MANUAL_GATE_OVERRIDE easing its combo gate (v4.17); still the
  // pool's #3 worst residual this pass, so it also gets a value buff here
  // rather than a third gate step.
  // v4.23: six of these held their v4.22 +1 flat across another full-scale
  // pass without the residual closing — escalated to +2 (same pattern as
  // the other repeat-offender escalations this pass). kinetic_siphon_swarm/
  // diver_s_lantern dropped off the top-10 cardsToBuff list this run, so
  // they're left at +1 rather than escalated blind.
  pulsing_heartstone: 2, // was 1, still #1 cardsToBuff, -41.8pt resid
  thornfang_vine: 2, // was 1, still #3 cardsToBuff, -37.0pt resid
  locust_veil: 2, // was 1, still #2 cardsToBuff, -37.6pt resid
  amber_sphere: 2, // was 1, still top-5 cardsToBuff, -34.1pt resid
  resonant_shuriken: 2, // was 1, still top-5 cardsToBuff, -34.1pt resid
  coral_collapse: 2, // was 1, still top-6 cardsToBuff, -32.8pt resid, n=3648
  kinetic_siphon_swarm: 1,
  diver_s_lantern: 1,
  // v4.23: new cardsToBuff first-pass entries, both Rare Locations, n=912.
  blackspire_obelisk: 1,
  ossuary_vault: 1,
};

function mapSpell(c: CardTemplate, asCharm: boolean): CardDef {
  const tier = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const type = asCharm ? 'Charm' : 'Event';
  const base: CardDef = {
    id: c.id,
    name: c.name,
    type,
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
  };

  // v4.1 guidance B: Yahtzee/Four-of-a-Kind are FLAVOUR-ONLY rarity, not a
  // functional cost tier. The practical Combo-gate ceiling is Full House /
  // Large Straight. Anything that "wants a Yahtzee payoff" is printed at a high
  // numeric threshold with a Combo BONUS (not a requirement) so it's never a
  // dead card. Exactly one true trophy card in the whole pool keeps a Yahtzee
  // gate as a "once in fifty games" moment.
  const TROPHY_ID = 'submerged_starfall'; // the single Mythic trophy
  if (!asCharm && c.id === TROPHY_ID) {
    base.comboGate = 'Yahtzee';
    base.onCast = { action: 'sap', value: 20, target: 'enemyLeader' };
    return base;
  }
  // v4.1: reactive-support answer — half of all Super-Rare Events (tier 3
  // exactly) are board wipes (Sap X to all enemy Units), the removal density
  // reactive shells need. Must be tier === 3, not >= 3: the tier >= 4 branch
  // right below reuses this same `hash(c.id) % 2` roll for its own decision,
  // so `>= 3` here silently ate every tier >= 4 Event with an even hash,
  // permanently routing them away from the dedicated tier >= 4 "comeback
  // pass" logic (its Echo keyword, steeper :bomb cost format, etc).
  if (!asCharm && tier === 3 && hash(c.id) % 2 === 0) {
    base.onCast = { action: 'sap', value: 2 + tier, target: 'allEnemyUnits' };
    // v4.3: a board wipe earns its old "threshold 6" steepness via a hard
    // numeric/gate cost format instead of a flat die minimum.
    applyCostFormat(base, pickCostFormat(c.id, Math.max(4, tier)));
    return base;
  }
  if (!asCharm && tier >= 4) {
    // v4.3 comeback pass: the top of the Event pool is where a player behind
    // on board finds real outs. Most tier 4+ Events are now full board wipes
    // or heavy AoE sap (3+ to every enemy Unit) behind a steep cost format;
    // only a hash-picked slice keeps the old single-target trophy bomb.
    applyCostFormat(base, pickCostFormat(`${c.id}:bomb`, 5));
    const swing = hash(`${c.id}:swing`) % 3;
    if (swing === 0) {
      base.onCast = { action: 'destroy', target: 'allEnemyUnits' };
    } else if (swing === 1) {
      base.onCast = { action: 'sap', value: 3 + Math.min(2, tier - 4), target: 'allEnemyUnits' };
    } else {
      // Would-be trophy bomb -> steep cost format + Combo bonus rider.
      base.onCast = { action: 'sap', value: 6, target: 'anyTarget' };
      base.combo = {
        pattern: hash(c.id) % 2 ? 'FourKind' : 'LargeStraight',
        effect: { action: 'sap', value: 6, target: 'enemyLeader' },
      };
    }
    base.keywords = ['Echo'];
    base.keywordTiers = assignTiers(base.keywords, tier); // Echo II at rt>=4
    return base;
  }
  // Practical Combo-gated Events cap at Full House / Large Straight.
  if (!asCharm && tier >= 2 && hash(c.id) % 3 === 0) {
    const gate: ComboPattern =
      tier >= 3
        ? hash(c.id) % 2
          ? 'FullHouse'
          : 'LargeStraight'
        : hash(c.id) % 2
          ? 'ThreeKind'
          : 'TwoPair';
    base.comboGate = gate;
    // v4.2 errata A: repeatable face-only burn compounds badly over a ~10-round
    // game — the Large-Straight line is retargeted off pure face damage AND
    // dropped in power (both levers, not either/or).
    base.onCast =
      gate === 'LargeStraight'
        ? { action: 'sap', value: 5, target: 'anyTarget' }
        : gate === 'FullHouse'
          ? { action: 'buff', value: 2, target: 'allFriendlyUnits' }
          : { action: 'sap', value: 5, target: 'anyTarget' };
    applyManualCostAdj(base, c.id);
    return base;
  }

  // Power/cost tier — Charms are cheaper/weaker; Events pricier/stronger.
  // `wasCheap`/`wasSteep` feed the v4.3 cost-format pick below, replacing
  // what used to be direct threshold bumps (bind/destroy costing more).
  const baseTier = asCharm ? Math.min(2, tier) : Math.min(5, 1 + tier);
  let costTier = baseTier;
  const wasCheap = asCharm && tier === 0;

  const kind = hash(c.id) % 5;
  const power = (asCharm ? 2 : 3) + tier;
  if (kind === 0) {
    base.onCast = { action: 'mend', value: power, target: 'friendlyAny' };
  } else if (kind === 1) {
    base.onCast = { action: 'bind', target: 'enemyUnit' };
    // Bind still prices one tier up, but a Charm's bump is capped at tier 2:
    // tier 3 rolls hard gates (FourKind ~13% directed hit rate), which left
    // Rare bind Charms near-dead in hand (0.61 casts/game, 31% win-in-deck).
    if (asCharm) costTier = Math.min(2, baseTier + 1);
  } else if (kind === 2 && !asCharm) {
    if (hash(c.id) % 2 === 0) {
      base.onCast = { action: 'destroy', target: 'enemyUnit' };
      costTier = 5;
    } else {
      base.onCast = { action: 'draw', value: 1 + Math.floor(tier / 2), target: 'none' };
    }
  } else {
    base.onCast = { action: 'sap', value: power, target: pick(c.id, 5, SAP_TARGETS) };
  }

  // v4.19: keyword riders (Echo/Scrap/Crescendo/Aftershock/Snap) are rolled
  // BEFORE the cost format now (their hash conditions unchanged — all pure
  // functions of the id, so reordering changes no outcomes), because the
  // recalculated cost prices in the summed keyword-tier costWeight.
  assignSpellKeywords(c, base, asCharm, tier, wasCheap);
  const kwTiers = assignTiers(base.keywords || [], tier);
  base.keywordTiers = (base.keywords || []).length > 0 ? kwTiers : undefined;
  // v4.19 Aftershock II (rt>=4): the delayed repeat is FULL value, not half.
  if (base.aftershock && (kwTiers.Aftershock ?? 1) >= 2 && base.onCast)
    base.aftershock = { ...base.aftershock, value: base.onCast.value };

  // v4.3: assign the real Cast Slot cost format — v4.19: recalculated from
  // the power/cost tier plus keyword-tier costWeight (see keywordCostTier).
  applyCostFormat(base, pickCostFormat(c.id, keywordCostTier(costTier, kwTiers)));
  applyManualCostAdj(base, c.id);

  // v4.6: straight-family gates are measurably HARDER than the match-family
  // gates they share a cost tier with (directed 2-reroll hit rates:
  // SmallStraight 44.1% vs ThreeKind 74.4%/TwoPair 74.1%; LargeStraight
  // 17.7% vs FullHouse 34.7% — `npm run pattern-hitrate`), yet a
  // straight-gated spell printed the same power as its match-gated tier
  // sibling. That structural under-payment is why all three straight-family
  // archetypes in the sim roster (two Leaders' Straight-Combo decks plus
  // Shinobi Echo-Straight) sat 20+pt below their match-family siblings.
  // Compensate the payoff for the rarer, harder cast.
  if (base.onCast && (base.onCast.value ?? 0) >= 1) {
    if (base.comboGate === 'SmallStraight')
      base.onCast = { ...base.onCast, value: (base.onCast.value || 0) + 1 };
    if (base.comboGate === 'LargeStraight')
      base.onCast = { ...base.onCast, value: (base.onCast.value || 0) + 2 };
  }

  // Overflow riders on some spells — numeric cost formats only, excluding
  // 'exact' (see mapUnit: an exact-cost die can never exceed its own
  // threshold, so overflowHit could never fire).
  if (base.threshold !== undefined && base.castCostKind !== 'exact' && hash(c.id) % 4 === 0) {
    base.overflow = { amount: 1, effect: { action: 'sap', value: 2, target: 'enemyLeader' } };
  }
  if (MANUAL_VALUE_BUFF[c.id] !== undefined && base.onCast) {
    base.onCast = { ...base.onCast, value: (base.onCast.value || 0) + MANUAL_VALUE_BUFF[c.id] };
  }
  return base;
}

/** v4.19: the spell keyword riders, verbatim from mapSpell's old tail (same
 * hash rolls), extracted so they can run before the cost recalculation. */
function assignSpellKeywords(
  c: CardTemplate,
  base: CardDef,
  asCharm: boolean,
  tier: number,
  wasCheap: boolean,
) {
  // Echo on a slice of utility so recursion exists outside bombs.
  if (hash(c.id) % 5 === 1 && !base.keywords) {
    base.keywords = ['Echo'];
  }
  // Scrap on a slice of cheap charms (dice smoothing).
  if (asCharm && wasCheap && hash(c.id) % 3 === 0) {
    base.keywords = [...(base.keywords || []), 'Scrap'];
  }
  // v4.2 Crescendo X (Event only): the preferred pattern for "big roll payoff"
  // cards going forward — scales with a hot roll (dice of value 6 placed this
  // turn) without ever being a dead card, sidestepping the trophy-gate problem
  // structurally instead of needing rarity guidance to manage it.
  if (!asCharm && hash(c.id) % 5 === 3 && wouldBeLegalSomewhere([...(base.keywords || []), 'Crescendo'])) {
    // v4.5: baseline x 1 -> 2 — Crescendo measured as the third-weakest
    // keyword (28.6% win rate). A die of value 6 is only a ~1-in-6 shot per
    // die placed, so the old +1-per-six rarely moved the needle on its own
    // effect; doubling it makes a hot roll actually feel like a payoff.
    // v4.8: 2 -> 3 base — Crescendo is still the weakest keyword in the
    // game (37.1% this pass, from 28.6% pre-v4.5); the v4.5 doubling helped
    // but under-shot.
    // v4.9: 3 -> 4 base — third straight pass at the pool bottom (39.2%
    // this pass, essentially flat from v4.8's post-buff 37.1%->39.2%).
    // v4.10: undershot AGAIN (36.4%, down further) — this confirmed the
    // v4.8/v4.9-flagged redesign was overdue; see engine.ts's withCrescendo
    // for the actual mechanic change (flat "rolled any 6" bonus, no more
    // per-die-placed scaling). Base value left as-is here since the
    // redesign itself is the lever this pass, not another size bump —
    // watch-listed for a value tweak once the new trigger's own baseline is
    // measured.
    base.crescendo = { x: SIM_TUNING.crescendoBase + (tier >= 3 ? 1 : 0) };
    base.keywords = [...(base.keywords || []), 'Crescendo'];
  }
  // v4.2 Aftershock (Event only): a delayed half-value echo of the main
  // effect, resolving at the start of the caster's next turn before Draw.
  // Only attaches to effects with a numeric value >= 1 — a valueless action
  // (bind/destroy) has no "lower-value repeat" (§10): the delayed copy would
  // be a second FULL destroy/Bind for free, not the intended half-strength
  // echo (seabed_mandala shipped exactly that before this guard).
  // v4.19.1: gate loosened (tier>=2 + %6===4 -> tier>=1 + %3!==0). The v4.19
  // value>=1 guard was correct, but only 39 Events exist in the live pool
  // and every valued tier>=2 Event is consumed by the earlier gate/wipe/bomb
  // branches (which return before this roll) — the combined conditions left
  // ZERO Aftershock printings, and the sim measured 0 engagement because
  // the keyword no longer existed, not because it underperformed. The old
  // bucket was empty, so no existing card's roll changes.
  if (
    !asCharm &&
    tier >= 1 &&
    hash(c.id) % 3 !== 0 &&
    base.onCast &&
    (base.onCast.value ?? 0) >= 1 &&
    wouldBeLegalSomewhere([...(base.keywords || []), 'Aftershock'])
  ) {
    const halfValue = Math.max(1, Math.floor((base.onCast.value || 2) / 2));
    base.aftershock = { action: base.onCast.action, value: halfValue, target: base.onCast.target };
    base.keywords = [...(base.keywords || []), 'Aftershock'];
  }
  // v4.2 Snap (Charm only): castable during the Reroll Phase, not just Placement.
  // Mutually exclusive with Scrap — Scrap's whole identity is "discard this
  // instead of casting it"; if a card also auto-casts via Snap before the
  // AI's Scrap pass ever sees it in hand, Scrap never fires.
  if (
    asCharm &&
    !base.keywords?.includes('Scrap') &&
    hash(c.id) % 4 === 2 &&
    wouldBeLegalSomewhere([...(base.keywords || []), 'Snap'])
  ) {
    base.snap = true;
    base.keywords = [...(base.keywords || []), 'Snap'];
  }
}

// ---------------------------------------------------------------------------
// Location mapping
// ---------------------------------------------------------------------------
function mapLocation(c: CardTemplate): CardDef {
  const tier = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  // v4.1: Locations no longer print a Cast Slot threshold at all — they cast
  // free once per turn as a bonus action (castLocationFree). They keep a
  // passive and (at higher rarity) an Ability Slot, which still costs a die.
  const def: CardDef = {
    id: c.id,
    name: c.name,
    type: 'Location',
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
  };
  def.locPassive = hash(c.id) % 2 === 0 ? 'ATK_ALL' : 'HP_ALL';
  // v4.4.2: every Location resolves a small effect the moment it enters play
  // (see enterPlay in engine.ts, which previously ignored `onCast` for this
  // type entirely). v4.4.1 tried Mend 1 to the Leader here and Locations'
  // isolated contribution got WORSE (-2.1 -> -5.3 win%), not better — Leader
  // HP isn't what a Location is actually competing against; a Unit's
  // immediate impact is board presence. Switched to a direct board-impact
  // effect instead: +1/+1 to a friendly Unit (a no-op turn 1 before any
  // Unit is out, same as most tempo tools are early, but real value every
  // turn after).
  // v4.5: scales with rarity tier (was a flat 1 regardless) — every other
  // rarity-scaled effect in the pool (Unit stat budgets, Event power) grows
  // with tier, but this one didn't, undervaluing higher-rarity Locations
  // relative to the Units they compete against for a deck slot.
  // v4.6: base 1 -> 2 — Locations still measured net negative in isolation
  // (-1.9 win% vs. Location-stripped twins) after the v4.4.2 on-cast add
  // and the v4.5 rarity scaling; the on-cast effect is the one lever that
  // directly closes the "a Unit gives immediate board value" gap.
  def.onCast = {
    action: 'buff',
    value: SIM_TUNING.locOnCastBuffBase + (tier >= 3 ? 1 : 0),
    target: 'friendlyUnit',
  };
  // v4.4 Foothold: a slice of Locations also cheapen the first Unit cast
  // each turn — gives ramp identities (Excavate/Anchor especially) an actual
  // floor instead of doing nothing on the turns they're setting up.
  if (hash(c.id) % 6 === 3 && wouldBeLegalSomewhere([...(def.keywords || []), 'Foothold'])) {
    def.foothold = true;
    def.keywords = [...(def.keywords || []), 'Foothold'];
  }
  if (tier >= 1) {
    def.ability = pick(c.id, 6, [
      { threshold: 3, effect: { action: 'draw', value: 1, target: 'none' } },
      { threshold: 4, effect: { action: 'sap', value: 2, target: 'anyTarget' } },
      { threshold: 3, effect: { action: 'mend', value: 2, target: 'friendlyAny' } },
      { threshold: 4, effect: { action: 'buff', value: 1, target: 'friendlyUnit' } },
    ]);
  }
  // v4.2 Location keywords: Tribute (synergy with Pitch), Excavate (ramp
  // identity), Contested (arms-race decision) — each on its own slice.
  if (
    def.ability &&
    hash(c.id) % 5 === 0 &&
    wouldBeLegalSomewhere([...(def.keywords || []), 'Tribute'])
  ) {
    def.tribute = pick(c.id, 7, [
      { action: 'draw', value: 1, target: 'none' } as Effect,
      { action: 'mend', value: 2, target: 'friendlyAny' } as Effect,
    ]);
    def.keywords = [...(def.keywords || []), 'Tribute'];
  } else if (
    def.ability &&
    hash(c.id) % 5 === 1 &&
    wouldBeLegalSomewhere([...(def.keywords || []), 'Excavate'])
  ) {
    // v4.5: x 1 -> 2 — Excavate measured as the second-weakest keyword in
    // the game (32.3% win rate), and it's a slow ramp by design (needs
    // several of the controller's own turns in play to matter); doubling
    // the per-turn rate lets it actually pay off before the game ends.
    def.excavate = { x: SIM_TUNING.excavateRate };
    def.keywords = [...(def.keywords || []), 'Excavate'];
  } else if (
    tier >= 1 &&
    hash(c.id) % 5 === 2 &&
    wouldBeLegalSomewhere([...(def.keywords || []), 'Contested'])
  ) {
    def.contested = true;
    def.keywords = [...(def.keywords || []), 'Contested'];
  }
  if (MANUAL_VALUE_BUFF[c.id] !== undefined && def.onCast) {
    def.onCast = { ...def.onCast, value: (def.onCast.value || 0) + MANUAL_VALUE_BUFF[c.id] };
  }
  // v4.19: Location keyword tiers (Foothold/Tribute/Excavate/Contested).
  // Locations cast free, so tiers carry no cost consequence here — but
  // Foothold II / Tribute II are real upgrades at Super-Rare+.
  if (def.keywords && def.keywords.length > 0)
    def.keywordTiers = assignTiers(def.keywords, tier);
  return def;
}

// ---------------------------------------------------------------------------
// Leader mapping (64 HP, one Ability Slot + one Ultimate, no ATK)
// ---------------------------------------------------------------------------
const LEADER_ABILITIES: Record<string, CardDef['ability']> = {
  // v4.4 balance: weakest leader after the Crimson/Mer-King pass (44.4%) — the
  // only Leader still gated at a threshold-6 ability. Lowered to 5 so it fires
  // at the same rate as the rest of the roster.
  // v4.5: value 2 -> 3 — Abyss is now the second-weakest leader (42.7%,
  // 22,560-game pass), and the every-turn ability's value hadn't moved since
  // v4.4's threshold fix. A direct power bump instead of another frequency
  // change, since frequency was already brought in line with the roster.
  avatar_of_the_abyss: { threshold: 5, effect: { action: 'sap', value: 3, target: 'anyTarget' } },
  // v4.1 balance: Bind's retaliation-stop buff + 64 HP long games made an
  // every-turn threshold-4 leader Bind a permanent board lock (96.6% archetype
  // win rate) — raised to 6 so it's a high roll, not a routine.
  ethereal_sea_witch: { threshold: 5, effect: { action: 'bind', target: 'enemyUnit' } },
  // v4.5: value 3 -> 2 — Mer-King is now the strongest leader (57.8%), and
  // its Guard-Bulwark/Avenge-adjacent archetypes (Guard-Bulwark Turtle
  // 78.7%, Twin Heal 62.0%) lean on this every-turn sustain more than any
  // other single lever on the Leader. A direct value cut, not another
  // frequency change (threshold 5 already matches the rest of the roster).
  // v4.9: Mer-King is EVERY ONE of its 3 archetypes' primary Guard user, so
  // this pass's wall-list fix (guardHpBonus 3->2, see SIM_TUNING) landed on
  // Mer-King alone: 48.4% -> 42.9% leader win rate (worst in the roster)
  // while every other Leader held or improved, and Mer King Avenge Swarm
  // specifically cratered 51.0% -> 39.5%. A first attempt bumped THIS
  // every-turn Ability's value (2 -> 3) — it mostly re-buffed Guard-Bulwark
  // Turtle back toward its pre-nerf number (73.4% -> 77.4%, nearly the
  // 77.5%/80.2% pre-v4.9 range) since a repeatable per-turn effect rewards
  // whichever archetype best exploits repetition (an explicit mend/control
  // shell) far more than Avenge Swarm (barely moved, 39.5% -> 40.9%).
  // Reverted; see the Ultimate entry below for the once-per-game version of
  // this same compensation instead.
  // v4.16: value 2 -> 1 — Mer King Guard-Bulwark Turtle is STILL the most
  // extreme archetype outlier in the whole roster (95.9% win rate, n=2280),
  // re-confirmed for at least two straight passes, and the prior findings
  // doc already isolated it to Mer-King's own kit (not Guard/Bulwark
  // pool-wide — those keywords are fine on every other Leader). The v4.9
  // note directly above explains WHY a bump here overshoots specifically
  // toward Turtle: an every-turn repeatable mend rewards whichever
  // archetype best compounds repetition over a long game, and a
  // durability-stack wall deck that never has to spend its Ability Slot on
  // anything but sustain is exactly that shape. Applying the same logic in
  // reverse — cutting the per-turn value — should trim Turtle's
  // infinite-sustain loop disproportionately without touching the Leader's
  // other, much weaker archetypes (Twin Heal, Avenge Swarm) nearly as hard.
  mer_king: { threshold: 5, effect: { action: 'mend', value: 1, target: 'friendlyAny' } },
  // v4.4.2: threshold 5 -> 3 — the first tempo-grant version (unlocked at 5,
  // same as everyone else) barely moved Diver's win rate (33.7% -> 34.2%).
  // Firing 2-3 turns earlier on average is a much bigger lever than the
  // tempo grant's own mechanics; see enterPlay() for the now-stronger grant
  // (skips summoning sickness AND +1/+1, not just the sickness skip).
  legendary_diver: { threshold: 3, effect: { action: 'draw', value: 1, target: 'none' } },
  // v4.4 balance: weakest leader of the six at 44.0% (11k-game pass) — face
  // sap 4 -> 5 keeps its identity (pure reach) with a small power nudge.
  crimson_vector_commander: {
    threshold: 4,
    effect: { action: 'sap', value: 5, target: 'enemyLeader' },
  },
  // v4.4.2: threshold 4 -> 5, value 2 -> 1 — the abilityNoRepeatTarget
  // targeting restriction (still on) barely moved the needle (Steel-Scrap
  // Control 90.1% -> 90.0%, Avenge Grind 95.1% -> 94.5%): with only 2-3
  // Units usually in play, "can't repeat the same target" just alternates
  // between them, so total stat investment across the game barely dropped.
  // Cutting the value in half AND raising the gate is a direct cut to the
  // engine's total output per game, not just its distribution.
  // v4.5: threshold 5 -> 6 — Shinobi is still the second-strongest leader
  // (57.3%) and anchors the two most dominant archetypes in the whole
  // roster (Avenge Grind 90.9%, Steel-Scrap Control 83.9%) even after two
  // rounds of value/targeting cuts. Both of those cuts changed the
  // Ability's output per activation; this cuts its *frequency* instead —
  // the one lever not yet touched.
  // v4.19.1: threshold 6 -> 5, reverting the v4.5 frequency nerf. The
  // condition that justified three straight Shinobi cuts (Steel-Scrap
  // Control 84-90%, Avenge Grind 91-95%) has inverted under the keyword
  // tier system: Steel/Avenge bodies now pay real cost weight, and Shinobi
  // is the roster floor by 13pt (31.4%; Steel-Scrap Control 33.9%/15.4%,
  // Echo-Straight 40.5%/15.0%). Value stays 1 and abilityNoRepeatTarget
  // stays on — only the frequency lever is returned.
  apex_nanite_shinobi: {
    threshold: 5,
    effect: { action: 'buff', value: 1, target: 'friendlyUnit' },
  },
  // v4.16: ROOT CAUSE found for Sovereign Crimson Assault sitting at 29.0%
  // (n=2280), the weakest archetype in the roster — sovereign_of_the_dying_star
  // had NO entry in this table at all (nor in LEADER_RESOLVE/LEADER_ULTIMATE
  // below), so it was silently falling back to mapLeader()'s generic default
  // Ability (`sap 2 anyTarget` @ threshold 5) with no Resolve and no
  // Ultimate whatsoever — every other one of the 8 Leaders has a hand-tuned
  // kit including both. This isn't a Pierce problem (the keyword itself
  // measures a positive delta when it fires this pass) or a card-composition
  // problem; the Leader was simply never given a real kit. Printed a
  // face-damage Ability matching its Crimson/Obsidian aggro-reach identity,
  // in line with crimson_vector_commander's face-sap Ability above.
  // v4.16.1: a face-only Ability (sap 4 enemyLeader) measured WORSE than the
  // old anonymous default (sap 2 anyTarget) it replaced -- Crimson Assault
  // 29.0% -> 21.6%. The default's `anyTarget` flexibility (snipe a blocker OR
  // push face) mattered more to an aggro deck's board race than the raw
  // value bump did. Kept `anyTarget` and raised the value instead, so it's
  // still a real upgrade over the default rather than a narrower Ability.
  sovereign_of_the_dying_star: {
    threshold: 4,
    effect: { action: 'sap', value: 3, target: 'anyTarget' },
  },
};

// v4.2 Resolve X: while at/below half HP, Ability Slot threshold -X. Given to
// the leaders whose plan is reactive/defensive — a direct answer to the
// measured +19pt early-face-attack dominance, without touching combat math.
// v4.3 comeback pass: assignment rate raised — nearly every leader now
// carries at least Resolve 1, so falling behind always cheapens your answer.
const LEADER_RESOLVE: Record<string, number> = {
  // v4.4: Abyss was the one roster hole in the v4.3 "nearly every leader"
  // Resolve widening, and measured weakest (44.4%) — Resolve 1 closes it.
  avatar_of_the_abyss: 1,
  // v4.9: tried 2 -> 3 as a third guardHpBonus-compensation attempt (targeted
  // at "behind" specifically, unlike the Ability/Ultimate bumps, which both
  // rewarded Guard-Bulwark Turtle — the archetype LEAST often behind — more
  // than the two Mer-King archetypes that actually cratered). Measured
  // ZERO effect (43.0% -> 43.0%, archetypes within noise): the Leader
  // Ability's threshold 5 was already low enough that Resolve rarely
  // changed whether it fired. Reverted; see docs/BALANCE_SIM_FINDINGS_v4.9.md.
  mer_king: 2,
  apex_nanite_shinobi: 2,
  ethereal_sea_witch: 2,
  // v4.8: 1 -> 2 — Diver is still the weakest Leader (43.4%) after the
  // v4.6 flag fix finally turned its tempo grant on; a deeper Resolve
  // cheapens the draw+tempo Ability exactly when Diver is losing, without
  // touching its rate when ahead.
  legendary_diver: 2,
  crimson_vector_commander: 2,
  // v4.16: see the Ability-table note above — Sovereign had no Resolve at
  // all, unlike every other Leader. Given the same value as its closest
  // aggro-identity sibling, crimson_vector_commander, so falling behind
  // cheapens its face-damage Ability the same way it does for the rest of
  // the roster.
  sovereign_of_the_dying_star: 2,
};

// v4.2 Ultimate(N): a second, once-per-game Ability Slot from the controller's
// Nth own turn on — the answer to "reactive leaders lack inevitability".
// Every Leader gets one; the unlock turn and power are tuned per archetype.
// v4.3 comeback pass: Ultimates strengthened into genuine swing turns — the
// reactive leaders' Ultimates are now board wipes / mass sap, and the rest
// got a straight power bump, so a player behind on board always has a
// once-per-game out sitting on their Leader.
const LEADER_ULTIMATE: Record<string, CardDef['ultimate']> = {
  // v4.5: left at 4 (not also bumped) — a verification sim after buffing
  // BOTH the Ability (above) and this Ultimate together overshot hard
  // (Abyss 42.7% -> 55.8%, Pierce Aggro specifically 67.8% -> 79.9%): the
  // every-turn Ability alone compounds enough across an ~11-round game.
  // Stacking a second buff on the once-per-game Ultimate on top of that was
  // double-counting the same fix.
  // v4.8: value 4 -> 3 — Abyss is now the strongest Leader (56.2%) after
  // holding steady at the top for two passes; trimming the once-per-game
  // mass sap is the lever that doesn't touch its every-turn identity (the
  // v4.5 note above already warned the Ability+Ultimate pair overshoots
  // when buffed together — the same logic applies in reverse).
  avatar_of_the_abyss: {
    unlockTurn: 5,
    threshold: 6,
    effect: { action: 'sap', value: 3, target: 'allEnemyUnits' },
  },
  // v4.19.1: threshold 5 -> 6. Sea Witch has topped the roster for three
  // straight passes (61-64%) carrying the strongest Ultimate in the game (a
  // full board wipe) at an ordinary threshold. Gating it behind a natural 6
  // keeps the identity swing but makes it a high roll, without touching the
  // every-turn Bind kit.
  ethereal_sea_witch: {
    unlockTurn: 5,
    threshold: 6,
    effect: { action: 'destroy', target: 'allEnemyUnits' },
  },
  // v4.4 balance: strongest leader at 55.6% — Ultimate mend 8 -> 6 trims the
  // top without touching his every-turn plan.
  // v4.5: value 6 -> 5 — still the strongest leader (57.8%) after the v4.4
  // trim; cutting the once-per-game top-up alongside the Ability value cut
  // above trims both compounding sustain sources at once.
  // v4.9: value 5 -> 6 — the once-per-game compensation for the guardHpBonus
  // 3->2 wall-list fix (see the Ability entry above for why the repeatable
  // Ability version overshot toward Guard-Bulwark Turtle specifically
  // instead of lifting Mer-King broadly).
  mer_king: {
    unlockTurn: 4,
    threshold: 5,
    effect: { action: 'mend', value: 6, target: 'friendlyAny' },
  },
  // v4.5: threshold 6 -> 5, value 3 -> 4 — Diver is the weakest leader in
  // the roster (39.6%) and its Ultimate was gated at the single hardest
  // threshold in the game while granting the least game-swinging effect
  // (pure card draw, no board/face impact). Easier to land and stronger
  // once it lands.
  legendary_diver: {
    unlockTurn: 5,
    threshold: 5,
    effect: { action: 'draw', value: 4, target: 'none' },
  },
  crimson_vector_commander: {
    unlockTurn: 4,
    threshold: 5,
    effect: { action: 'sap', value: 12, target: 'enemyLeader' },
  },
  // v4.4.2: value 3 -> 2 — a second compounding source on top of the
  // Ability nerf above; trimming both matters more than trimming either
  // alone against a durability-stack board that survives to cash in every
  // buff it's given.
  apex_nanite_shinobi: {
    unlockTurn: 4,
    threshold: 5,
    effect: { action: 'buff', value: 2, target: 'allFriendlyUnits' },
  },
  // v4.16: see the Ability-table note above — Sovereign had no Ultimate at
  // all, i.e. no once-per-game comeback swing while every other Leader has
  // one. A reach finisher fits its face-damage identity, sized between
  // crimson_vector_commander's (12, the roster's other pure-reach Leader)
  // and the weaker legendary_diver's — same unlock turn as the other
  // aggro-leaning Leaders above.
  sovereign_of_the_dying_star: {
    unlockTurn: 4,
    threshold: 5,
    effect: { action: 'sap', value: 10, target: 'enemyLeader' },
  },
};

// v4.6 BUG FIX: the v4.4 Leader-Ability behavior flags were implemented in
// the engine (enterPlay's tempo grant, activateAbility's no-repeat-target
// rule), documented in the rulebook, and referenced by two rounds of balance
// notes — but mapLeader() below NEVER actually assigned them to any Leader,
// so neither has ever been live in a sim or a real match. This silently
// explains two long-standing findings-doc mysteries: Diver "buffed twice,
// still net down" (its v4.4.2 tempo-grant buff never activated), and
// Shinobi's targeting nerf that "barely moved the needle" (it was never on).
const LEADER_ABILITY_FLAGS: Record<string, Partial<CardDef>> = {
  legendary_diver: { abilityGrantsTempo: true },
  apex_nanite_shinobi: { abilityNoRepeatTarget: true },
};

function mapLeader(c: CardTemplate): CardDef {
  const resolveX = LEADER_RESOLVE[c.id];
  return {
    id: c.id,
    name: c.name,
    type: 'Leader',
    hp: LEADER_HP,
    ability: LEADER_ABILITIES[c.id] || {
      threshold: 5,
      effect: { action: 'sap', value: 2, target: 'anyTarget' },
    },
    ...LEADER_ABILITY_FLAGS[c.id],
    resolve: resolveX ? { x: resolveX } : undefined,
    ultimate: LEADER_ULTIMATE[c.id],
    keywords: [...(resolveX ? ['Resolve'] : []), ...(LEADER_ULTIMATE[c.id] ? ['Ultimate'] : [])],
    // v4.19: Leader keyword tiers — Resolve's tier IS its X; Ultimate is
    // single-tier. Leaders pay no Cast Slot cost, so these weigh 0.
    keywordTiers: {
      ...(resolveX ? { Resolve: resolveX } : {}),
      ...(LEADER_ULTIMATE[c.id] ? { Ultimate: 1 } : {}),
    },
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
  };
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
      return mapSpell(c, true);
    case 'Event':
      return mapSpell(c, false);
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

/**
 * v4.9: re-derive the pool from the last-loaded template set. Needed by the
 * ablation harness whenever a SIM_TUNING dial affects mapUnit()'s CARD-BUILD
 * math (exactCostBudgetCap, guardHpBonus, durableBodyTax) rather than
 * something read live during play (tollCap, steelMult, ...) — those dials
 * only take effect the moment the pool is rebuilt, since CardDefs are baked
 * once at import time otherwise. A no-op for every other ablation arm.
 */
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

/**
 * v4.9: a "cheap durable body" — the v4.8 findings' §4 item 1 open question
 * ("the lever must target the cheap-durable-body list SHAPE, not keywords or
 * Leader kits"). An exact-cost Unit is near-flat-easy to cast regardless of
 * its printed face (~90% with 2 directed rerolls, see costDifficulty), and a
 * defensive stat split (HP well above ATK, or an explicit durability
 * keyword) is what actually walls a board rather than trading into it. This
 * is a measurement helper, not a rule — deckDurableBodyDensity() below feeds
 * the harness's density-vs-win correlation so the next balance lever (a
 * second exact-cost budget step, pricing Guard's HP bonus into the budget,
 * or a per-deck density surcharge) can be picked from data instead of guessed.
 */
export function isCheapDurableBody(def: CardDef): boolean {
  if (def.type !== 'Unit') return false;
  const durableStats = (def.hp || 0) - (def.atk || 0) >= 2;
  const durableKw = ['Guard', 'Bulwark', 'Toll', 'Steel', 'Ward'].some((k) =>
    def.keywords?.includes(k),
  );
  if (!durableStats && !durableKw) return false;
  return def.castCostKind === 'exact' || (def.threshold !== undefined && def.threshold <= 2);
}

/** Total copies of `isCheapDurableBody` Units in a deck (id -> copies map),
 * resolved against `resolve` (defaults to POOL_BY_ID) so this works for both
 * the live pool and a fixed sim-only DeckDef.cards map. */
export function deckDurableBodyDensity(
  cards: Record<string, number>,
  resolve: (id: string) => CardDef = (id) => POOL_BY_ID[id],
): number {
  let n = 0;
  for (const [id, copies] of Object.entries(cards)) {
    const def = resolve(id);
    if (def && isCheapDurableBody(def)) n += copies;
  }
  return n;
}
