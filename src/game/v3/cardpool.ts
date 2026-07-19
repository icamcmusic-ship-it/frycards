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
const GATE_DIFFICULTY: Record<ComboPattern, number> = {
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

// ---------------------------------------------------------------------------
// Unit mapping
// ---------------------------------------------------------------------------
function mapUnit(c: CardTemplate): CardDef {
  const tier = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  // Legacy threshold, still the cost basis for Twin cards only (their
  // two-slot exact-face mechanic never went through the v4.3 cost formats).
  const threshold = Math.min(6, 1 + Math.min(4, tier) + (hash(c.id) % 2 === 0 ? 1 : 0));
  // v4.6: pick the REAL cost first (deterministic, so this is the same cost
  // applyCostFormat gets below) — the stat budget must price off what the
  // card actually costs to cast, not the pre-format threshold.
  const cost = pickCostFormat(c.id, tier);

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
    if (secondary !== primaryKw) keywords.push(secondary);
  }
  if (tier >= 3 && !keywords.includes('Pierce') && hash(c.id) % 3 === 0) keywords.push('Pierce');
  // v4.4 Overrun: a direct, targeted counter to the durability-stack meta
  // (Ward/Steel/Bulwark fully zeroing a hit) — layered independently, same
  // pattern as the Pierce secondary roll above.
  // v4.6: prevalence doubled (%8===6 -> %4===2, i.e. also %8===2) — the
  // three durability-stack archetypes (Steel-Scrap Control 81.4%,
  // Guard-Bulwark Turtle 78.0%, Toll-Bulwark Fortress 77.3%) stayed
  // dominant with Overrun too rare to matter as the printed answer. Purely
  // additive: every card that had Overrun still has it.
  if (tier >= 2 && !keywords.includes('Overrun') && hash(c.id) % 4 === 2) keywords.push('Overrun');

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
    hp += SIM_TUNING.guardHpBonus;
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
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
  };

  // v4.3: assign this Unit's real Cast Slot cost format — every non-Twin
  // Unit prices in exact/sum/a dice-pattern gate instead of the old plain
  // "die >= threshold". Twin cards keep the legacy at-least cost (below):
  // their two Cast Slots already require matching an exact rolled face,
  // which is a distinct mechanic from the new 'exact' cost format.
  if (!keywords.includes('Twin')) {
    applyCostFormat(def, pickCostFormat(c.id, tier));
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
    def.twinBonus = pick(c.id, 1, [
      // Balance: capped at Sap 5 (was 2+tier, up to 8) — top-tier Twin bodies
      // already keep their full stat budget at a discounted threshold, so the
      // face-sap rider can't also scale unbounded with rarity.
      { action: 'sap', value: 2 + Math.min(3, tier), target: 'enemyLeader' } as Effect,
      { action: 'buff', value: 1 + Math.floor(tier / 2), target: 'allFriendlyUnits' } as Effect,
      { action: 'draw', value: 1, target: 'none' } as Effect,
    ]);
    // Twin cards use a modest even threshold so pairs are reachable.
    def.threshold = Math.min(5, Math.max(2, threshold - 1));
    // v4.2 Twin errata B, fix 2 (stagedPassive test batch): a small passive
    // while parked in Staging, so the cross-turn cost isn't pure dead tempo.
    def.stagedPassive = { action: 'mend', value: 1, target: 'friendlyLeader' };
  }

  // Some higher-rarity units carry an Ability Slot (utility, not just a body).
  if (tier >= 2 && hash(c.id) % 4 === 1) {
    def.ability = pick(c.id, 2, [
      { threshold: 4, effect: { action: 'mend', value: 2, target: 'friendlyAny' } },
      { threshold: 4, effect: { action: 'sap', value: 2, target: 'anyTarget' } },
      { threshold: 5, effect: { action: 'draw', value: 1, target: 'none' } },
      { threshold: 3, effect: { action: 'buff', value: 1, target: 'friendlyUnit' } },
    ]);
    if (hash(c.id) % 3 === 0) def.keywords = [...(def.keywords || []), 'Rally'];
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

  // v4.2 Unit keywords: Bulwark, Toll, Avenge — layered independently of the
  // primary keyword so reactive shells have scaling defense beyond raw HP.
  if (tier >= 1 && hash(c.id) % 7 === 2) {
    def.bulwark = { x: 1 + Math.min(2, Math.floor(tier / 2)) };
    def.keywords = [...(def.keywords || []), 'Bulwark'];
  }
  if (tier >= 2 && hash(c.id) % 7 === 5) {
    def.toll = { x: 1 };
    def.keywords = [...(def.keywords || []), 'Toll'];
  }
  if (tier >= 1 && hash(c.id) % 11 === 3) {
    def.avenge = true;
    def.keywords = [...(def.keywords || []), 'Avenge'];
  }
  // v4.4 Steel X: a per-turn damage-absorption pool from ANY source (attacks,
  // Sap, Pierce overflow) — the balance-sim answer to an aggression-dominant
  // meta, distinct from Bulwark (attacks only) and Toll (Leader-only).
  if (tier >= 2 && hash(c.id) % 9 === 4) {
    // v4.7: 2/2/3 by tier -> 1/1/2 — the ablation harness measured halved
    // Steel as the ONLY keyword dial that moved the two Steel-labeled
    // durability decks (Steel-Scrap 82->71, Ward-Steel 79->71) after Toll,
    // Avenge and Mend dials all measured ~zero. Steel refreshes every turn,
    // so each point is worth far more than a point of HP.
    def.steel = { x: 1 + (tier >= 4 ? 1 : 0) };
    def.keywords = [...(def.keywords || []), 'Steel'];
  }
  // v4.4: two named cards manually granted Steel as a discrete identity
  // buff, independent of the procedural roll above — both were flagged as
  // underperforming in the balance sim (Tang's Refuge was the weakest
  // Common in the whole pool; Nanite Division Marshal one of the
  // least-cast Ultra-Rares). A defensive identity gives them a reason to
  // see play instead of just scaling their raw stats up.
  const MANUAL_STEEL: Record<string, number> = {
    tang_s_refuge: 2,
    nanite_division_marshal: 3,
  };
  if (MANUAL_STEEL[c.id] !== undefined && !def.steel) {
    def.steel = { x: MANUAL_STEEL[c.id] };
    def.keywords = [...(def.keywords || []), 'Steel'];
  }
  // v4.8: Chrono-Phalanx has sat at the very bottom of the pool for FOUR
  // straight passes (26.4% win-in-deck, 0.36 casts/game) regardless of meta
  // — the v4.7 findings explicitly flagged it as "a redesign, not a stat
  // bump". It's a hard-gate trophy body; give it a trophy identity: +2/+2
  // over budget and Overrun, so the rare turn it lands it actually punches
  // through the durability boards that define the meta.
  if (c.id === 'chrono_phalanx') {
    def.atk = (def.atk || 0) + 2;
    def.hp = (def.hp || 0) + 2;
    if (!def.keywords?.includes('Overrun'))
      def.keywords = [...(def.keywords || []), 'Overrun'];
  }
  // v4.9 ablation dial (live default 0, i.e. off): a flat HP surcharge on
  // any Unit that ends up matching isCheapDurableBody() below — a direct
  // per-card tax on the "wall-list" shape the v4.8 findings' §4 item 1
  // flagged, instead of another keyword- or Leader-targeted lever.
  if (SIM_TUNING.durableBodyTax > 0 && isCheapDurableBody(def)) {
    def.hp = Math.max(1, (def.hp || 0) - SIM_TUNING.durableBodyTax);
  }
  return def;
}

// ---------------------------------------------------------------------------
// Charm / Event mapping (one-shots)
// ---------------------------------------------------------------------------
const SAP_TARGETS: EffectTarget[] = ['anyTarget', 'enemyUnit', 'enemyLeader'];

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

  // v4.3: assign the real Cast Slot cost format.
  applyCostFormat(base, pickCostFormat(c.id, costTier));

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
  if (!asCharm && hash(c.id) % 5 === 3) {
    // v4.5: baseline x 1 -> 2 — Crescendo measured as the third-weakest
    // keyword (28.6% win rate). A die of value 6 is only a ~1-in-6 shot per
    // die placed, so the old +1-per-six rarely moved the needle on its own
    // effect; doubling it makes a hot roll actually feel like a payoff.
    // v4.8: 2 -> 3 base — Crescendo is still the weakest keyword in the
    // game (37.1% this pass, from 28.6% pre-v4.5); the v4.5 doubling helped
    // but under-shot.
    // v4.9: 3 -> 4 base — third straight pass at the pool bottom (39.2%
    // this pass, essentially flat from v4.8's post-buff 37.1%->39.2%). The
    // v4.8 findings flagged a possible redesign, but this pass's harness
    // additions were aimed at the wall-list/Echo/lapse questions instead —
    // one more incremental step here, still watch-listed for an actual
    // redesign ("+X if you placed any 6", not scaling with count) if this
    // undershoots again.
    base.crescendo = { x: 4 + (tier >= 3 ? 1 : 0) };
    base.keywords = [...(base.keywords || []), 'Crescendo'];
  }
  // v4.2 Aftershock (Event only): a delayed half-value echo of the main
  // effect, resolving at the start of the caster's next turn before Draw.
  // Only attaches to effects with a numeric value >= 1 — a valueless action
  // (bind/destroy) has no "lower-value repeat" (§10): the delayed copy would
  // be a second FULL destroy/Bind for free, not the intended half-strength
  // echo (seabed_mandala shipped exactly that before this guard).
  if (
    !asCharm &&
    tier >= 2 &&
    hash(c.id) % 6 === 4 &&
    base.onCast &&
    (base.onCast.value ?? 0) >= 1
  ) {
    const halfValue = Math.max(1, Math.floor((base.onCast.value || 2) / 2));
    base.aftershock = { action: base.onCast.action, value: halfValue, target: base.onCast.target };
    base.keywords = [...(base.keywords || []), 'Aftershock'];
  }
  // v4.2 Snap (Charm only): castable during the Reroll Phase, not just Placement.
  // Mutually exclusive with Scrap — Scrap's whole identity is "discard this
  // instead of casting it"; if a card also auto-casts via Snap before the
  // AI's Scrap pass ever sees it in hand, Scrap never fires.
  if (asCharm && !base.keywords?.includes('Scrap') && hash(c.id) % 4 === 2) {
    base.snap = true;
    base.keywords = [...(base.keywords || []), 'Snap'];
  }
  return base;
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
  def.onCast = { action: 'buff', value: 2 + (tier >= 3 ? 1 : 0), target: 'friendlyUnit' };
  // v4.4 Foothold: a slice of Locations also cheapen the first Unit cast
  // each turn — gives ramp identities (Excavate/Anchor especially) an actual
  // floor instead of doing nothing on the turns they're setting up.
  if (hash(c.id) % 6 === 3) {
    def.foothold = true;
    def.keywords = ['Foothold'];
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
  if (def.ability && hash(c.id) % 5 === 0) {
    def.tribute = pick(c.id, 7, [
      { action: 'draw', value: 1, target: 'none' } as Effect,
      { action: 'mend', value: 2, target: 'friendlyAny' } as Effect,
    ]);
    def.keywords = [...(def.keywords || []), 'Tribute'];
  } else if (def.ability && hash(c.id) % 5 === 1) {
    // v4.5: x 1 -> 2 — Excavate measured as the second-weakest keyword in
    // the game (32.3% win rate), and it's a slow ramp by design (needs
    // several of the controller's own turns in play to matter); doubling
    // the per-turn rate lets it actually pay off before the game ends.
    def.excavate = { x: 2 };
    def.keywords = [...(def.keywords || []), 'Excavate'];
  } else if (tier >= 1 && hash(c.id) % 5 === 2) {
    def.contested = true;
    def.keywords = [...(def.keywords || []), 'Contested'];
  }
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
  mer_king: { threshold: 5, effect: { action: 'mend', value: 2, target: 'friendlyAny' } },
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
  apex_nanite_shinobi: {
    threshold: 6,
    effect: { action: 'buff', value: 1, target: 'friendlyUnit' },
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
  ethereal_sea_witch: {
    unlockTurn: 5,
    threshold: 5,
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
