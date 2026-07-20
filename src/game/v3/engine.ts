/**
 * Rulebook v3.0 game engine (dice-placement rules).
 *
 * Turn: Draw -> Roll -> Reroll -> Placement -> Combo Check -> Combat -> End.
 * Five d6 per turn, one reroll of any subset, four legal die destinations
 * (hand Cast Slot, in-play Ability Slot, Staging second Twin slot, Echo
 * recast from Discard). Sequential targeted combat with Guard walls.
 */
import { CardDef, CARD_DB, ComboPattern, DECKLISTS_V3, Effect, EffectTarget, hasKw } from './cards';

/**
 * v4.2 Twin A/B test modes (errata B): the two isolated fixes for Twin's
 * -22pt win-correlation are mutually exclusive, tested as separate batches.
 * - 'oneDiePerTurn' (v4.1 default): the cap that caused the regression.
 * - 'sameTurn' (fix 1): revert the cap — Twin is "two matching dice, any timing".
 * - 'stagedPassive' (fix 2): keep the cap, but staged cards do something while parked.
 */
export type TwinMode = 'oneDiePerTurn' | 'sameTurn' | 'stagedPassive';
export interface RuleConfig {
  twinMode: TwinMode;
  /** v4.3: number of Reroll Phase rerolls allowed per turn (was always 1). */
  rerollsAllowed: number;
}
const DEFAULT_RULES: RuleConfig = { twinMode: 'oneDiePerTurn', rerollsAllowed: 2 };

// ---------------------------------------------------------------------------
// RNG (seeded, for reproducible playtests)
// ---------------------------------------------------------------------------
export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const d6 = (rng: Rng) => Math.floor(rng() * 6) + 1;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export interface Inst {
  def: CardDef;
  iid: string;
  owner: string;
  damage: number;
  permAtk: number;
  permHp: number;
  hasAttacked: boolean;
  attacksMade: number;
  abilityUsed: boolean;
  /** die value resting on the ability slot this turn (for Rally). */
  abilityDie?: number;
  /** index into the owner's `p.dice` of the physical die recorded in
   * `abilityDie` — lets `releaseAbilityDie` return that exact die to the
   * supply (§4) if this card leaves play before the dice are cleared for
   * the turn (e.g. a Location replaced mid-Placement, or a Unit destroyed
   * with a die still resting on the Ability Slot it used this turn). Only
   * ever meaningful within the same Placement Phase — `p.dice` is emptied
   * at End Phase, so a stale index from an earlier turn safely resolves to
   * nothing (see enterPlay's Location-replacement branch / cleanupDeaths). */
  abilityDieIndex?: number;
  /** v4.4: last iid this card's `abilityNoRepeatTarget` Ability buffed —
   * only ever set/read for a Leader whose def carries that flag. */
  lastAbilityTargetIid?: string;
  enteredThisTurn: boolean;
  wardUsed: boolean;
  /** v4.4 Steel X: damage already absorbed by this turn's pool (resets to 0
   * every End Phase, alongside wardUsed — see finishEndPhase). */
  steelUsed: number;
  /** v4.4 Anchor: true once this specific card has received its one-time
   * permanent +1/+1 for reaching the Anchor ramp cap (see ANCHOR_CAP) —
   * never re-granted, and reset only when the card starts a fresh "life"
   * re-entering play (see enterPlay's Unit-entry reset block). */
  anchorCapBonused?: boolean;
  boundThisTurn: boolean;
  boundNextTurn: boolean;
  echoSpent: boolean;
  /** first Twin die value while in Staging. */
  stagedDie?: number;
  stagedTurns: number;
  /** v4.0: true if this Twin card received its first die this same Placement Phase. */
  stagedThisTurn?: boolean;
  /** v4.2 Ultimate(N): true once this Leader's second Ability Slot has fired (once per game). */
  ultimateUsed?: boolean;
  /** v4.2 Excavate: accumulated per-controller-turn threshold reduction while this Location is in play. */
  excavateStacks?: number;
  /** v4.4: stacks of a Combo's own self-buff already applied to this permanent
   * (see the "ramp, not a collapse/snowball" cap comment at comboCheck()). */
  comboSelfBuffStacks?: number;
  /** v4.5: cumulative +1/+1 already granted to this permanent by its own
   * Avenge trigger (see cleanupDeaths' AVENGE_CAP) — same "ramp, not an
   * uncapped snowball" treatment Anchor/Toll/Combo-self-buff already get. */
  avengeStacks?: number;
}

export interface Die {
  value: number;
  placed: boolean;
}

export interface Player {
  id: string;
  leader: Inst;
  deck: Inst[];
  hand: Inst[];
  discard: Inst[];
  banished: Inst[];
  staging: Inst[];
  board: Inst[];
  location: Inst | null;
  dice: Die[];
  /** v4.3: number of Reroll Phase rerolls spent this turn (cap: rules.rerollsAllowed). */
  rerollsUsed: number;
  locationCastThisTurn: boolean;
  turnsTaken: number;
  /** v4.2: at most one Combo-gated card (cast or Echo-recast) per Placement Phase. */
  comboGateCastThisTurn: boolean;
  /** v4.4 Foothold (Location): true once this turn's first-Unit-cast discount
   * has been spent — see footholdActive()/castFromHand(). */
  footholdUsedThisTurn: boolean;
  /** v4.4: true when a Leader ability with `abilityGrantsTempo` (currently
   * only Legendary Diver) has fired this turn and not yet been spent — the
   * next friendly Unit to enter play this turn skips summoning sickness
   * (see enterPlay()). */
  swiftGrantThisTurn: boolean;
  /** v4.7 Fatigue: escalating damage taken per empty-deck Draw Phase
   * (1, then 2, then 3, ...) — see startTurn's Draw Phase. */
  fatigue: number;
}

/** v4.2 Snap: the Reroll Phase window closes (and the Placement window opens)
 * when reroll() is called. The Combat Phase window opens when comboCheck()
 * runs (§3.5 -> §3.6, "Placement -> Combo Check -> Combat") and closes again
 * the moment the turn ends (finishEndPhase resets it, and the next player's
 * startTurn() always sets PRE_REROLL regardless). */
export type TurnStage = 'PRE_REROLL' | 'PLACEMENT' | 'COMBAT';

export interface Game {
  players: Record<string, Player>;
  order: [string, string];
  active: string;
  turn: number;
  winner: string | null; // player id, or 'draw'
  rng: Rng;
  log: string[];
  stats: GameStats;
  rules: RuleConfig;
  stage: TurnStage;
  /** v4.2 Aftershock: queued effects that fire at the start of their owner's next turn, before Draw Phase. */
  pendingAftershocks: { ownerId: string; effect: Effect }[];
  /** True once startTurn() has run for the current `active` player. `stage`
   * alone can't distinguish "new turn, startTurn not called yet" (stale
   * PLACEMENT left over from the *previous* player's turn) from "this
   * player's own Placement Phase" (also PLACEMENT) — this flag is what lets
   * abandonTwin tell those apart. See abandonTwin for why that matters. */
  turnStarted: boolean;
}

export interface GameStats {
  casts: Record<string, number>;
  comboTriggers: Record<string, number>;
  echoRecasts: number;
  twinCompletions: number;
  twinAbandons: number;
  scraps: number;
  rallies: number;
  wardBlocks: number;
  diceWasted: number;
  dicePitched: number;
  attacks: number;
  leaderAbilityUses: Record<string, number>;
  /** v4.1 decision tracking: per-player counts of notable plays (for win-correlation). */
  decisions: Record<string, Record<string, number>>;
  /** v4.2 new-keyword sanity counters: total damage prevented by each mechanic. */
  bulwarkReduced: number;
  tollReduced: number;
  /** v4.4: total damage absorbed by Steel pools, and damage dealt back to
   * attackers whose hit a Ward prevented. */
  steelAbsorbed: number;
  wardPunishDamage: number;
  /** v4.8 instrumentation: total Fatigue damage dealt (empty-deck draws),
   * Overrun punch-through triggers, Pierce overflow damage to Leaders, and
   * one-time Anchor full-ramp bonuses granted. */
  fatigueDamage: number;
  overrunTriggers: number;
  pierceOverflowDamage: number;
  anchorCapBonuses: number;
}

/** Increment a per-player decision counter (v4.1 tracking). */
function decide(g: Game, pid: string, key: string, by = 1) {
  const d = (g.stats.decisions[pid] ||= {});
  d[key] = (d[key] || 0) + by;
}

let iidCounter = 0;
export function makeInst(def: CardDef, owner: string): Inst {
  return {
    def,
    iid: `${def.id}#${++iidCounter}`,
    owner,
    damage: 0,
    permAtk: 0,
    permHp: 0,
    hasAttacked: false,
    attacksMade: 0,
    abilityUsed: false,
    enteredThisTurn: false,
    wardUsed: false,
    steelUsed: 0,
    boundThisTurn: false,
    boundNextTurn: false,
    echoSpent: false,
    stagedTurns: 0,
  };
}

/** v4.2: bucket a card's rarity for Echo win-delta breakdown (errata B). */
export function rarityTier(r?: string): 'low' | 'mid' | 'high' {
  if (r === 'Ultra-Rare' || r === 'Mythic' || r === 'Full-Art') return 'high';
  if (r === 'Rare' || r === 'Super-Rare') return 'mid';
  return 'low';
}

export function opponentOf(g: Game, pid: string): Player {
  return g.players[g.order[0] === pid ? g.order[1] : g.order[0]];
}

// ---------------------------------------------------------------------------
// Stats / derived values
// ---------------------------------------------------------------------------
/** v4.2 Contested: a Location's passive doubles while the opponent controls no Location. */
function locPassiveMultiplier(g: Game, owner: Inst): number {
  const p = g.players[owner.owner];
  if (!p.location?.def.contested) return 1;
  const opp = opponentOf(g, owner.owner);
  return opp.location ? 1 : 2;
}
/** v4.4: bumped from 1 to 2 — the sim measured Locations at -1.4 win% versus
 * spending those Cast Slots on cheap Units instead; their baseline flat
 * passives weren't pulling enough weight over an ~11-round average game to
 * justify the slot (see docs/RULEBOOK.md's Location passives entry). */
const LOC_PASSIVE_FLAT = 2;
export function effAtk(g: Game, u: Inst): number {
  const p = g.players[u.owner];
  let loc = 0;
  if (u.def.type === 'Unit' && p.location?.def.locPassive === 'ATK_ALL') {
    loc = LOC_PASSIVE_FLAT * locPassiveMultiplier(g, u);
  }
  return Math.max(0, (u.def.atk || 0) + u.permAtk + loc);
}
export function effMaxHp(g: Game, u: Inst): number {
  const p = g.players[u.owner];
  let loc = 0;
  if (u.def.type === 'Unit' && p.location?.def.locPassive === 'HP_ALL') {
    loc = LOC_PASSIVE_FLAT * locPassiveMultiplier(g, u);
  }
  const anchor =
    u.def.type === 'Unit' && hasKw(u.def, 'Anchor') ? SIM_TUNING.anchorHpBonus : 0;
  return Math.max(0, (u.def.hp || 0) + u.permHp + loc + anchor);
}
export function remainingHp(g: Game, u: Inst): number {
  return effMaxHp(g, u) - u.damage;
}

/** True if an unused Ward would fully prevent the next hostile damage/Removal instance. */
export function hasUnspentWard(target: Inst): boolean {
  return target.def.type === 'Unit' && hasKw(target.def, 'Ward') && !target.wardUsed;
}

/** v4.4: remaining Steel X absorption this turn, or 0 if this card has none. */
/**
 * v4.7 sim-only ablation knobs. Production code never mutates these — they
 * exist so the ablation harness (scripts/simulate-ablation.ts) can isolate
 * which mechanic actually powers an overperforming archetype by turning one
 * dial per arm, instead of guessing from aggregate keyword win rates (the
 * v4.6 findings §5.1/§5.2 lesson: three straight passes of lever-pulling on
 * Avenge failed because the archetype's label wasn't its engine). Defaults
 * MUST equal live behavior.
 */
export const SIM_TUNING = {
  /** cap in tollReduction() — live value 3. */
  tollCap: 3,
  /** lifetime Avenge +1/+1 cap — live value AVENGE_CAP. */
  avengeCap: 2,
  /** multiplier on Steel X absorption — live value 1. */
  steelMult: 1,
  /** multiplier on all Mend values — live value 1. */
  mendMult: 1,
  /** empty-deck Draw Phase rule — 'loss' (§9 instant deck-out) or 'fatigue'
   * (escalating 1, 2, 3... Leader damage per missed draw). */
  deckout: 'fatigue' as 'loss' | 'fatigue',
  /** v4.7 candidate: Anchor's one-time full-ramp bonus also draws a card. */
  anchorCapBonusDraw: false,
  /** flat bonus HP on Anchor-keyword Units. v4.7 introduced it as an ablation
   * candidate; v4.11 measured 0 -> 1 and DELIBERATELY DID NOT SHIP it. In
   * isolation (scripts/simulate-ablation.ts, fixed opponent roster) it read
   * as a clean roster-floor lift — the bottom ramp decks rose (Sea Witch
   * Anchor-Scrap 21.0% -> 30.8%, Abyss Excavate Ramp 50.0% -> 56.3%) with top
   * decks flat. But the FULL 33,840-game round-robin exposed collateral the
   * fixed-opponent ablation could not: it WIDENED the Leader win-rate spread
   * 14.1pt -> 16.8pt by sinking Mer-King further (43.7% -> 41.5%, Guard-
   * Bulwark Turtle 74.5% -> 69.6%) — Mer-King is the only Leader with no ramp
   * archetype, so its walls simply get ground down by the now-stronger ramp
   * decks. Widening the spread by sinking the already-lowest Leader is the
   * opposite of the goal; kept off. See docs/BALANCE_SIM_FINDINGS_v4.11.md
   * §2.1 (a clean ablation-vs-full-sim divergence). Live value 0. */
  anchorHpBonus: 0,
  /** v4.11: base value of a Crescendo Event's flat "rolled any 6 this turn"
   * bonus (cardpool.ts mapSpell, tier>=3 gets +1 on top). A dedicated dial so
   * v4.10's flagged open question (§4 item 3 — "does the base value itself
   * need a step now the trigger is reliable?") is ablatable instead of
   * hardcoded. Measured 4 -> 5: Crescendo's keyword win% stayed 41.3% ->
   * 41.3% (null) because exactly one pool card carries Crescendo (harness
   * keyword-health table), so the aggregate is insensitive to a +1 on that
   * one card — the same null the four pre-redesign base bumps hit, for a
   * different reason. Not shipped; live value 4. */
  crescendoBase: 4,
  /** v4.8 A/B arm: waive the Echo extra-discard fodder cost at EVERY rarity
   * (live behavior only waives mid-rarity) — the dedicated look at Echo's
   * fodder economics the v4.7 findings called for (§4.3). Live: false. */
  echoWaiveAllFodder: false,
  /** v4.9 ablation dials for the "wall-list meta" open question (v4.8
   * findings §4 item 1) — cardpool.ts's mapUnit() reads these instead of the
   * hardcoded constants they replace, so the deck-level durable-body-density
   * correlation the harness now measures can be traced to a SPECIFIC lever
   * instead of another guessed sweeping stat cut (the known v4.6 failure
   * mode). Defaults MUST equal live behavior. */
  /** stat-budget basis cap for a non-Twin exact-cost Unit — live value 1.5
   * (cardpool.ts mapUnit's `D` calc). */
  exactCostBudgetCap: 1.5,
  /** flat HP bonus a Guard-primary-keyword Unit gets ON TOP of its stat
   * budget. v4.9: 3 -> 2 — the ablation isolating the wall-list meta (v4.8
   * findings §4 item 1) found this the one lever that BOTH compresses the
   * dominant wall decks (Mer King Guard-Bulwark Turtle 77.5% -> 69.4%,
   * Shinobi Avenge Grind 84.6% -> 78.8%) AND lifts the roster-floor ramp
   * decks (Shinobi Tempo-Anchor 11.0% -> 19.6%, Abyss Excavate Ramp 42.1% ->
   * 49.4%) in the same pass — every keyword-targeted lever tried since v4.6
   * only ever did one of those. A harder cut to 1 measured even bigger
   * movement (Turtle -> 60.4%) but risked the known v4.6 overshoot failure
   * mode; see docs/BALANCE_SIM_FINDINGS_v4.9.md. */
  guardHpBonus: 2,
  /** v4.9: flat HP surcharge (subtracted) on any Unit that will end up
   * matching cardpool.ts's isCheapDurableBody() — a per-card "list density"
   * tax, live value 0 (i.e. off; the wall-list hypothesis needs to be
   * ablated before this becomes a live rule). */
  durableBodyTax: 0,
  /** v4.10 ablation dials for Locations' persistent small negative isolated
   * contribution (v4.4-v4.9 findings, never given its own dedicated lever —
   * see docs/BALANCE_SIM_FINDINGS_v4.9.md §4 item 5). All three are
   * pool-affecting (read by cardpool.ts's mapLocation at build time) except
   * footholdDiscount, which is read live by effThreshold below. Defaults
   * MUST equal live behavior. */
  /** flat value of a Location's on-cast board-impact buff (cardpool.ts
   * mapLocation's `def.onCast`, tier>=3 gets +1 on top).
   * v4.10: 2 -> 3 — a dedicated ablation battery for Locations' persistent
   * small negative isolated contribution (v4.4-v4.9 findings, never given
   * its own lever — v4.9 findings §4 item 5) found this the only one of
   * three Location-only dials (this, excavateRate, footholdDiscount) with
   * any measured effect at all: excavateRate and footholdDiscount both
   * moved the one-Excavate/-Foothold-primary subject decks by exactly
   * ZERO, a genuinely dead lever on both counts. This one moved Sea Witch
   * Ward-Steel Wall +3.1pt with no measured downside on any other subject —
   * shipped as the only lever this pass's ablation actually supported. */
  locOnCastBuffBase: 3,
  /** Excavate X per-controller-turn Ability threshold discount — live value 2. */
  excavateRate: 2,
  /** Foothold's Cast Slot threshold discount on the first Unit cast each turn — live value 1. */
  footholdDiscount: 1,
};

export function steelRemaining(target: Inst): number {
  const x = Math.floor((target.def.steel?.x || 0) * SIM_TUNING.steelMult);
  return Math.max(0, x - target.steelUsed);
}

/**
 * Would `rawAtk` combat damage actually destroy `target` this attack?
 * Accounts for an unused Ward (full prevention), Steel X (per-turn
 * absorption) and Bulwark X (flat combat damage reduction) — naive
 * `remainingHp(g, t) <= atk` ignores all three and mistakes a warded/
 * steeled/bulwarked unit for a safe kill.
 */
/** v4.6: a single Unit's combined Steel+Bulwark prevention per hit is capped
 * (same "ramp, not a collapse" ceiling Toll/Anchor/Avenge/Combo-self-buff
 * use) — dual Steel+Bulwark bodies were the stickiest piece of the
 * durability-stack decks that have topped every sim roster (Steel-Scrap
 * Control 86.0%, Guard-Bulwark Turtle 84.4%, Ward-Steel Wall 83.0%), and
 * both keyword-prevalence and Overrun-strength levers failed to dent them. */
export const STEEL_BULWARK_CAP = 4;

export function willKillInCombat(g: Game, target: Inst, rawAtk: number): boolean {
  if (target.def.type !== 'Unit') return false;
  if (hasUnspentWard(target)) return false;
  const prevention = Math.min(
    STEEL_BULWARK_CAP,
    steelRemaining(target) + (target.def.bulwark?.x || 0),
  );
  const dmg = Math.max(0, rawAtk - prevention);
  return dmg >= remainingHp(g, target);
}

/** Would `rawValue` non-combat (Sap) damage kill? Bulwark doesn't apply outside
 * combat (§10 — Toll is the direct/Sap damage answer), but Steel X does
 * (its rules text is explicitly "from any source"). */
export function wouldSapKill(g: Game, target: Inst, rawValue: number): boolean {
  if (target.def.type !== 'Unit') return false;
  if (hasUnspentWard(target)) return false;
  return Math.max(0, rawValue - steelRemaining(target)) >= remainingHp(g, target);
}

/** v4.4: cap on how many times a card's own self-buff Combo may re-trigger
 * (see comboCheck()) — same "ramp, not a collapse" ceiling Anchor/Toll use. */
export const MAX_COMBO_SELF_BUFF_STACKS = 3;

/** v4.5: cap on total permanent +1/+1 a single card may gain from its own
 * Avenge trigger over its lifetime (see cleanupDeaths()) — same "ramp, not
 * a collapse" ceiling as MAX_COMBO_SELF_BUFF_STACKS/ANCHOR_CAP/Toll's cap. */
// v4.6: 3 -> 2 — the cap-at-3 barely moved Avenge's numbers (keyword win
// rate 57.2% -> 56.5%, Shinobi Avenge Grind 90.9% -> 91.6% across two full
// 22,560-game passes), exactly the "needs a tighter cap (2?)" follow-up the
// v4.5 findings doc predicted. Mer King Avenge Swarm (72.4%) is the second
// data point that the keyword itself, not one Leader kit, is the outlier.
export const AVENGE_CAP = 2;

/** v4.4: raised from 2 to 3 — the sim showed Anchor decks underperforming
 * (see docs/RULEBOOK.md's Anchor entry) with a flat diminishing-returns
 * curve and no swing potential; a deeper ramp plus the one-time cap bonus
 * below give Anchor an actual payoff moment. */
export const ANCHOR_CAP = 3;

/** Anchor: effective Cast threshold = printed - (# other in-play Anchor cards), min 1. */
/** v4.4 Foothold (Location): true while this player's first-Unit-cast
 * discount is still available this turn — read-only (no side effects), so
 * it's safe for the UI to query repeatedly; castFromHand() is what actually
 * spends it. */
export function footholdActive(g: Game, pid: string): boolean {
  const p = g.players[pid];
  return !!p.location?.def.foothold && !p.footholdUsedThisTurn;
}

export function effThreshold(g: Game, pid: string, def: CardDef): number {
  const t = def.threshold ?? 1;
  let reduction = 0;
  if (hasKw(def, 'Anchor')) {
    const p = g.players[pid];
    const inPlay = [...p.board, p.location].filter(
      (c): c is Inst => !!c && hasKw(c.def, 'Anchor'),
    ).length;
    // v4.0: cap the reduction so Anchor is ramp, not a threshold collapse
    // that lets a wide Anchor board dump its whole hand at threshold 1.
    reduction += Math.min(ANCHOR_CAP, inPlay);
  }
  // v4.4 Foothold: stacks with Anchor — a ramp deck built around both gets
  // to actually feel it on the turn that matters most (the first Unit).
  if (def.type === 'Unit' && footholdActive(g, pid)) reduction += SIM_TUNING.footholdDiscount;
  return Math.max(1, t - reduction);
}

/** v4.4: the first time an Anchor Unit's own discount would hit ANCHOR_CAP
 * (i.e. it has ANCHOR_CAP-or-more other Anchor cards already in play the
 * moment it enters), it permanently gains +1/+1 — once per card life, reset
 * alongside its other stint-scoped state if it later re-enters play (see
 * enterPlay). Checked only for the entering card itself, not retroactively
 * for cards already in play, so casting your 4th Anchor card rewards THAT
 * card, not a silent buff to the three already on board. */
function applyAnchorCapBonus(g: Game, p: Player, c: Inst) {
  if (c.def.type !== 'Unit' || !hasKw(c.def, 'Anchor') || c.anchorCapBonused) return;
  const others = [...p.board, p.location].filter(
    (x): x is Inst => !!x && x.iid !== c.iid && hasKw(x.def, 'Anchor'),
  ).length;
  if (others >= ANCHOR_CAP) {
    c.anchorCapBonused = true;
    // v4.5: +1/+1 -> +2/+2 — Anchor-ramp archetypes measured as the weakest
    // decks in the whole roster (Abyss Excavate Ramp 12.8%, Sea Witch
    // Anchor-Scrap Ramp 22.7%, Shinobi Tempo-Anchor 24.3%), and Anchor
    // itself was the weakest of the "core nine" v4.0 keywords (48.1% win
    // rate) even after the v4.4 cap-to-3 change. A bigger one-time payoff
    // gives the archetype an actual swing moment instead of just a smaller
    // discount ceiling.
    c.permAtk += 2;
    c.permHp += 2;
    g.stats.anchorCapBonuses++;
    g.log.push(`${c.def.name}'s Anchor reached full ramp — permanent +2/+2.`);
    if (SIM_TUNING.anchorCapBonusDraw) drawCards(g, p, 1);
  }
}

/**
 * v4.2: effective Ability Slot threshold, covering Resolve X (Leader, while
 * at/below half HP) and Excavate X (Location, -X per controller turn in play).
 */
export function effAbilityThreshold(g: Game, u: Inst): number {
  let t = u.def.ability?.threshold ?? 1;
  if (u.def.resolve && u.def.type === 'Leader') {
    const max = effMaxHp(g, u);
    if (max > 0 && remainingHp(g, u) * 2 <= max) t -= u.def.resolve.x;
  }
  if (u.def.excavate && u.def.type === 'Location') {
    t -= u.def.excavate.x * (u.excavateStacks || 0);
  }
  return Math.max(1, t);
}

/** v4.2 Toll X: sum of Toll on a player's board, reducing all incoming Leader damage. */
export function tollReduction(g: Game, ownerId: string): number {
  const total = g.players[ownerId].board.reduce((s, u) => s + (u.def.toll?.x || 0), 0);
  // Same "ramp, not a collapse" cap Anchor uses: uncapped, a wide Toll board
  // could zero out an entire class of face damage (Sap, Pierce overflow,
  // Crescendo burn) at once rather than just blunting it.
  return Math.min(SIM_TUNING.tollCap, total);
}

// ---------------------------------------------------------------------------
// Combo patterns (subset-based, §6)
// ---------------------------------------------------------------------------
export function matchesPattern(values: number[], pattern: ComboPattern): boolean {
  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const cs = Object.values(counts);
  const distinct = new Set(values);
  const hasRun = (len: number) => {
    for (let s = 1; s + len - 1 <= 6; s++) {
      let ok = true;
      for (let v = s; v < s + len; v++) if (!distinct.has(v)) ok = false;
      if (ok) return true;
    }
    return false;
  };
  switch (pattern) {
    case 'AnyPair':
      return cs.some((c) => c >= 2);
    case 'TwoPair':
      return cs.filter((c) => c >= 2).length >= 2;
    case 'ThreeKind':
      return cs.some((c) => c >= 3);
    case 'FourKind':
      return cs.some((c) => c >= 4);
    case 'Yahtzee':
      return cs.some((c) => c >= 5);
    case 'FullHouse':
      return Object.entries(counts).some(
        ([v, c]) => c >= 3 && Object.entries(counts).some(([w, d]) => w !== v && d >= 2),
      );
    case 'SmallStraight':
      return hasRun(4);
    case 'LargeStraight':
      return hasRun(5);
    case 'ThreeOdds':
      return values.filter((v) => v % 2 === 1).length >= 3;
    case 'ThreeEvens':
      return values.filter((v) => v % 2 === 0).length >= 3;
  }
}

/** The player's live roll = the values of all five dice this turn (placement never changes values). */
export function rollValues(p: Player): number[] {
  return p.dice.map((d) => d.value);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
/** A deck definition: which Leader, and a card-id -> copies map. */
export interface DeckDef {
  leaderId: string;
  cards: Record<string, number>;
  /** optional resolver so callers can supply their own card DB (e.g. POOL_V4). */
  resolve?: (id: string) => CardDef;
  /** optional human label for reporting. */
  label?: string;
}

export function newGame(
  a: string | DeckDef,
  b: string | DeckDef,
  rng: Rng,
  rules: Partial<RuleConfig> = {},
): Game {
  const deckA: DeckDef = typeof a === 'string' ? { leaderId: a, cards: DECKLISTS_V3[a] } : a;
  const deckB: DeckDef = typeof b === 'string' ? { leaderId: b, cards: DECKLISTS_V3[b] } : b;
  const mk = (id: string, dd: DeckDef): Player => {
    const resolve = dd.resolve || ((cid: string) => CARD_DB[cid]);
    const leaderDef = resolve(dd.leaderId);
    const deck: Inst[] = [];
    for (const [cid, n] of Object.entries(dd.cards)) {
      for (let i = 0; i < n; i++) deck.push(makeInst(resolve(cid), id));
    }
    return {
      id,
      leader: makeInst(leaderDef, id),
      deck,
      hand: [],
      discard: [],
      fatigue: 0,
      banished: [],
      staging: [],
      board: [],
      location: null,
      dice: [],
      rerollsUsed: 0,
      locationCastThisTurn: false,
      turnsTaken: 0,
      comboGateCastThisTurn: false,
      footholdUsedThisTurn: false,
      swiftGrantThisTurn: false,
    };
  };
  const g: Game = {
    players: { A: mk('A', deckA), B: mk('B', deckB) },
    order: ['A', 'B'],
    active: rng() < 0.5 ? 'A' : 'B',
    turn: 0,
    winner: null,
    rng,
    log: [],
    stats: {
      casts: {},
      comboTriggers: {},
      echoRecasts: 0,
      twinCompletions: 0,
      twinAbandons: 0,
      scraps: 0,
      rallies: 0,
      wardBlocks: 0,
      diceWasted: 0,
      dicePitched: 0,
      attacks: 0,
      leaderAbilityUses: {},
      decisions: { A: {}, B: {} },
      bulwarkReduced: 0,
      tollReduced: 0,
      steelAbsorbed: 0,
      wardPunishDamage: 0,
      fatigueDamage: 0,
      overrunTriggers: 0,
      pierceOverflowDamage: 0,
      anchorCapBonuses: 0,
    },
    rules: { ...DEFAULT_RULES, ...rules },
    stage: 'PRE_REROLL',
    pendingAftershocks: [],
    turnStarted: false,
  };
  for (const p of Object.values(g.players)) {
    shuffle(p.deck, rng);
    // v4.3: starting hand of 7 (was 5) — with the End Phase cap raised to 8,
    // a fuller opening hand gives both players real turn-1 options without
    // forcing an immediate discard.
    for (let i = 0; i < 7; i++) p.hand.push(p.deck.pop()!);
  }
  return g;
}

function shuffle<T>(arr: T[], rng: Rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---------------------------------------------------------------------------
// Deaths & win check
// ---------------------------------------------------------------------------
function discardCard(g: Game, p: Player, c: Inst) {
  // Echo: a spent-Echo card that would be discarded again is banished instead.
  if (c.echoSpent) p.banished.push(c);
  else p.discard.push(c);
}

export function cleanupDeaths(g: Game) {
  for (const p of Object.values(g.players)) {
    const dead = p.board.filter((u) => remainingHp(g, u) <= 0);
    if (dead.length === 0) continue;
    const survivors = p.board.filter((u) => remainingHp(g, u) > 0);
    // v4.2 Avenge: state-based, no priority window — every surviving Avenge
    // Unit gets +1/+1 for each friendly Unit that just died, automatically.
    // v4.5: capped at AVENGE_CAP total — this was the one repeating stat
    // mechanic in the game with NO cap (Anchor/Toll/Combo-self-buff all use
    // the same "ramp, not a collapse" ceiling), and the sim measured it as
    // the single strongest keyword (57.2% win rate) anchoring a 90.9%-win
    // archetype even after two rounds of unrelated Leader-Ability nerfs to
    // that archetype's Leader.
    for (const u of survivors) {
      if (u.def.avenge) {
        u.avengeStacks = u.avengeStacks || 0;
        const gain = Math.min(dead.length, Math.max(0, SIM_TUNING.avengeCap - u.avengeStacks));
        if (gain > 0) {
          u.permAtk += gain;
          u.permHp += gain;
          u.avengeStacks += gain;
        }
      }
    }
    p.board = survivors;
    for (const u of dead) {
      g.log.push(`${u.def.name} was destroyed.`);
      releaseAbilityDie(p, u);
      discardCard(g, p, u);
    }
  }
  checkWin(g);
}

function checkWin(g: Game) {
  if (g.winner) return;
  const dead = Object.values(g.players).filter((p) => remainingHp(g, p.leader) <= 0);
  if (dead.length === 2) g.winner = 'draw';
  else if (dead.length === 1) g.winner = opponentOf(g, dead[0].id).id;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
/**
 * Consume Ward if the effect is hostile targeting (damage or Removal against
 * the card, §10 Ward). Returns true if the effect was prevented.
 */
function wardCheck(g: Game, target: Inst, hostile: boolean): boolean {
  if (!hostile || target.def.type !== 'Unit') return false;
  if (hasKw(target.def, 'Ward') && !target.wardUsed) {
    target.wardUsed = true;
    g.stats.wardBlocks++;
    g.log.push(`${target.def.name}'s Ward prevented the effect.`);
    return true;
  }
  return false;
}

/**
 * v4.2 Crescendo X: bonus to an Event's numeric effect on a hot roll.
 *
 * v4.10 redesign: Crescendo sat at the bottom of the keyword table for FOUR
 * straight passes (28.6% v4.4 -> 36.4% this pass) despite three rounds of
 * flat base-value bumps (1->2->3->4, docs/RULEBOOK.md's changelog). Scaling
 * the bonus by the COUNT of sixes placed this turn almost never mattered —
 * rolling 2+ sixes in one 5-die turn is rare — so every bump just enlarged a
 * bonus that wasn't reliably firing at all; the real problem was
 * reliability, not size. It also only counted a six that was specifically
 * PLACED (spent on some cast), so a six that got rerolled away, or simply
 * had nothing worth spending it on before this card's own turn, never
 * counted even though the player visibly rolled a hot die. Redesigned per
 * the v4.8/v4.9 findings' flagged fix ("+X if you placed any 6," a
 * deterministic floor instead of scaling with count): a flat bonus the
 * moment ANY die shows a 6 ROLLED this turn (not just placed), dropping the
 * per-die multiplier entirely — "did I roll a six" instead of "how many
 * sixes did I manage to spend."
 */
function withCrescendo(p: Player, c: Inst, eff: Effect): Effect {
  if (!c.def.crescendo) return eff;
  if (!rollValues(p).some((v) => v === 6)) return eff;
  return { ...eff, value: (eff.value || 0) + c.def.crescendo.x };
}

/** v4.2 Aftershock: queue the delayed half-value repeat for the caster's next startTurn. */
function queueAftershock(g: Game, p: Player, c: Inst) {
  if (!c.def.aftershock) return;
  g.pendingAftershocks.push({ ownerId: p.id, effect: c.def.aftershock });
  decide(g, p.id, 'aftershockQueued');
}

function drawCards(g: Game, p: Player, n: number) {
  // Non-Draw-Phase draws never deck anyone out (§9).
  for (let i = 0; i < n; i++) {
    if (p.deck.length > 0) p.hand.push(p.deck.pop()!);
  }
}

/**
 * Apply an effect. `targetIid` selects the specific target where a choice
 * exists; the caller (AI/UI) is responsible for choosing a legal one.
 */
export function applyEffect(
  g: Game,
  ownerId: string,
  eff: Effect,
  targetIid?: string,
  self?: Inst,
) {
  const p = g.players[ownerId];
  const opp = opponentOf(g, ownerId);
  const v = eff.value || 0;
  const find = (iid?: string): Inst | undefined =>
    [...p.board, ...opp.board, p.leader, opp.leader].find((c) => c.iid === iid);
  // Defense-in-depth: enforce the EffectTarget contract against whatever
  // targetIid was actually supplied, rather than trusting every caller to
  // only ever pass a legal id. autoTarget/the UI's target pickers already
  // only ever offer legal choices, so this doesn't change any current
  // behavior — it just stops a self-targeted Bind/Sap/destroy on an
  // 'enemyUnit'/'anyTarget' effect from silently doing something to a
  // friendly Unit instead of the "does nothing" the rulebook documents.
  const findFor = (target: EffectTarget, iid?: string): Inst | undefined => {
    const t = find(iid);
    if (!t) return undefined;
    const isEnemy = t.owner !== ownerId;
    switch (target) {
      case 'enemyUnit':
        return isEnemy && t.def.type === 'Unit' ? t : undefined;
      case 'friendlyUnit':
        return !isEnemy && t.def.type === 'Unit' ? t : undefined;
      case 'anyTarget':
        return isEnemy ? t : undefined;
      case 'friendlyAny':
        return !isEnemy ? t : undefined;
      default:
        return t;
    }
  };

  const dmg = (t: Inst, amount: number, hostile: boolean) => {
    if (wardCheck(g, t, hostile)) return;
    // v4.4 Steel X: absorbs up to X non-combat hostile damage (Sap, Removal)
    // per turn too — "from any source" per its rules text, not attacks-only
    // like Bulwark.
    if (hostile && t.def.type === 'Unit' && t.def.steel) {
      const absorbed = Math.min(amount, steelRemaining(t));
      if (absorbed > 0) {
        t.steelUsed += absorbed;
        g.stats.steelAbsorbed += absorbed;
        amount -= absorbed;
      }
    }
    // v4.2 Toll X: friendly Units reduce ALL incoming Leader damage, any source.
    if (t.def.type === 'Leader' && hostile) {
      const toll = Math.min(amount, tollReduction(g, t.owner));
      g.stats.tollReduced += toll;
      t.damage += amount - toll;
    } else {
      t.damage += amount;
    }
  };

  switch (eff.action) {
    case 'sap': {
      if (eff.target === 'allEnemyUnits') {
        // v4.1: board-wipe answer for reactive decks (guidance D).
        if (opp.board.length >= 2) decide(g, ownerId, 'boardWipe');
        for (const u of [...opp.board]) dmg(u, v, true);
        break;
      }
      let t: Inst | undefined;
      if (eff.target === 'enemyLeader') t = opp.leader;
      else if (eff.target === 'self') t = self;
      else t = findFor(eff.target, targetIid);
      if (t) dmg(t, v, t.owner !== ownerId);
      break;
    }
    case 'destroy': {
      if (eff.target === 'allEnemyUnits') {
        for (const u of [...opp.board]) {
          if (!wardCheck(g, u, true)) u.damage += 999;
        }
      } else {
        const t = findFor(eff.target, targetIid);
        if (t && t.def.type === 'Unit' && !wardCheck(g, t, t.owner !== ownerId)) t.damage += 999;
      }
      break;
    }
    case 'mend': {
      // §5 targeting: a 'friendlyUnit'-only Mend must fizzle when no legal
      // Unit target exists (or the supplied iid is illegal) — it never
      // spills onto the Leader. Only 'friendlyAny'/'friendlyLeader' may
      // default to the Leader.
      let t: Inst | undefined;
      if (eff.target === 'friendlyLeader') t = p.leader;
      else if (eff.target === 'self') t = self;
      else {
        t = findFor(eff.target, targetIid);
        if (!t && eff.target === 'friendlyAny') t = p.leader;
      }
      if (t && t.owner === ownerId)
        t.damage = Math.max(0, t.damage - Math.floor(v * SIM_TUNING.mendMult));
      break;
    }
    case 'draw':
      drawCards(g, p, v);
      break;
    case 'bind': {
      // Ward only stops damage/Removal (§10) — Bind is neither, so it isn't
      // checked or consumed by Ward.
      const t = findFor(eff.target, targetIid);
      if (t && t.def.type === 'Unit') {
        t.boundNextTurn = true;
        g.log.push(`${t.def.name} was Bound.`);
      }
      break;
    }
    case 'buff': {
      if (eff.target === 'allFriendlyUnits') {
        for (const u of p.board) {
          u.permAtk += v;
          u.permHp += v;
        }
      } else if (eff.target === 'self' && self) {
        self.permAtk += v;
        self.permHp += v;
      } else {
        const t = find(targetIid);
        if (t && t.def.type === 'Unit' && t.owner === ownerId) {
          t.permAtk += v;
          t.permHp += v;
        }
      }
      break;
    }
  }
  cleanupDeaths(g);
}

// ---------------------------------------------------------------------------
// Turn scaffolding
// ---------------------------------------------------------------------------
export function startTurn(g: Game) {
  g.turn++;
  const p = g.players[g.active];
  p.turnsTaken++;
  p.rerollsUsed = 0;
  p.locationCastThisTurn = false;
  p.comboGateCastThisTurn = false;
  p.footholdUsedThisTurn = false;
  p.swiftGrantThisTurn = false;
  g.stage = 'PRE_REROLL';
  g.turnStarted = true;
  for (const u of [...p.board, p.leader]) {
    u.hasAttacked = false;
    u.attacksMade = 0;
    u.abilityUsed = false;
    u.abilityDie = undefined;
    u.abilityDieIndex = undefined;
    u.enteredThisTurn = false;
    u.boundThisTurn = u.boundNextTurn;
    u.boundNextTurn = false;
  }
  if (p.location) {
    p.location.abilityUsed = false;
    p.location.abilityDie = undefined;
    p.location.abilityDieIndex = undefined;
    // v4.2 Excavate X: Ability Slot threshold drops by X per controller turn in play.
    if (p.location.def.excavate) p.location.excavateStacks = (p.location.excavateStacks || 0) + 1;
  }
  // v4.2 Twin stagedPassive: fires once per controller turn while parked,
  // starting the turn AFTER the card was staged (it's staged mid-Placement of
  // the turn it first went to Staging, so the earliest a full "parked turn"
  // has elapsed is the start of the controller's next turn).
  for (const s of p.staging) {
    s.stagedTurns++;
    s.stagedThisTurn = false;
    // Rulebook §7's "keep the cap, but give staged cards a passive" describes
    // 'stagedPassive' as a variant of the capped ('oneDiePerTurn') behavior,
    // isolated from the uncapped 'sameTurn' arm — firing this unconditionally
    // regardless of twinMode collapsed that isolation (every A/B/C sim arm,
    // including 'sameTurn', got the passive) and let it leak into live play
    // under any mode. DEFAULT_RULES.twinMode is 'oneDiePerTurn', not
    // 'sameTurn', so this only changes the 'sameTurn' sim arm's behavior.
    if (s.def.stagedPassive && g.rules.twinMode !== 'sameTurn') {
      applyEffect(g, p.id, s.def.stagedPassive, autoTarget(g, p.id, s.def.stagedPassive), s);
      decide(g, p.id, 'twinStagedPassive');
    }
  }

  // v4.2 Aftershock: delayed effects fire now, before the Draw Phase.
  const mine = g.pendingAftershocks.filter((a) => a.ownerId === p.id);
  g.pendingAftershocks = g.pendingAftershocks.filter((a) => a.ownerId !== p.id);
  for (const a of mine) {
    applyEffect(g, p.id, a.effect, autoTarget(g, p.id, a.effect), p.leader);
    decide(g, p.id, 'aftershockResolved');
  }

  // Draw Phase (first player skips on the very first turn).
  const isFirstPlayerFirstTurn = g.turn === 1;
  if (!isFirstPlayerFirstTurn) {
    if (p.deck.length === 0) {
      if (SIM_TUNING.deckout === 'loss') {
        // Deck-out loss (§9, pre-v4.7).
        g.winner = opponentOf(g, p.id).id;
        g.log.push(`${p.id} decked out.`);
        return;
      }
      // v4.7 Fatigue: escalating Leader damage (1, then 2, then 3, ...)
      // instead of an instant loss. The v4.7 ablation showed the four
      // dominant "durability" archetypes weren't powered by their labeled
      // keywords at all — 24% of all games ended in instant deckouts, and
      // the instant-loss rule made every card-draw effect a liability in
      // long games while unit-heavy grinders won attrition by default.
      p.fatigue += 1;
      g.log.push(`${p.id} is out of cards — fatigue ${p.fatigue} damage.`);
      p.leader.damage += p.fatigue;
      g.stats.fatigueDamage += p.fatigue;
      decide(g, p.id, 'fatigued');
      checkWin(g);
      if (g.winner) return;
    } else {
      p.hand.push(p.deck.pop()!);
    }
  }

  // Roll Phase. v4.8: the Momentum comeback rule (v4.4-v4.7: a bonus die,
  // +1 ATK, an Ability discount and a card when behind on HP + board) is
  // REMOVED — the dedicated on/off A/B it finally got measured no systemic
  // benefit at all: leader spread was slightly BETTER without it (11.3pt vs
  // 12.3pt), games ran a full round shorter, and the weakest roster deck
  // gained +9pt with it off. Four rounds of stacking riders never made the
  // trigger correlate with winning; the rule was complexity without a
  // comeback (see docs/BALANCE_SIM_FINDINGS_v4.8.md).
  p.dice = Array.from({ length: 5 }, () => ({ value: d6(g.rng), placed: false }));
}

/**
 * Mulligan (§2 setup): shuffle the player's hand back into their deck and
 * redraw 7 (v4.3, was 5). Once per player, enforced by the caller/UI.
 */
export function mulliganRedraw(g: Game, pid: string) {
  const p = g.players[pid];
  p.deck.push(...p.hand);
  p.hand = [];
  for (let i = p.deck.length - 1; i > 0; i--) {
    const j = Math.floor(g.rng() * (i + 1));
    [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
  }
  for (let i = 0; i < 7; i++) p.hand.push(p.deck.pop()!);
}

/**
 * Reroll Phase: reroll any subset of unplaced dice. May be called up to
 * `rules.rerollsAllowed` times per turn (v4.3: default 2, was always 1) —
 * each call spends one reroll. The Placement window opens once the
 * allowance is exhausted, or the caller passes an empty selection to end
 * the Reroll Phase voluntarily before then.
 */
export function reroll(g: Game, indices: number[]) {
  const p = g.players[g.active];
  // §3.3/§3.4: the Reroll window is closed for good once the Placement Phase
  // opens — including when the player voluntarily ended it early with an
  // empty selection while rerolls were still unspent.
  if (g.stage !== 'PRE_REROLL') return;
  if (p.rerollsUsed >= g.rules.rerollsAllowed) {
    g.stage = 'PLACEMENT';
    return;
  }
  for (const i of indices) {
    const d = p.dice[i];
    if (d && !d.placed) d.value = d6(g.rng);
  }
  p.rerollsUsed++;
  if (indices.length === 0 || p.rerollsUsed >= g.rules.rerollsAllowed) {
    g.stage = 'PLACEMENT';
  }
}

/** Rerolls still available this Reroll Phase. */
export function rerollsRemaining(g: Game, pid: string): number {
  const p = g.players[pid];
  return Math.max(0, g.rules.rerollsAllowed - p.rerollsUsed);
}

// ---------------------------------------------------------------------------
// Placement actions (active player only)
// ---------------------------------------------------------------------------
function pickDie(p: Player, dieIndex: number): Die | null {
  const die = p.dice[dieIndex];
  return die && !die.placed ? die : null;
}

/**
 * §4: if a card leaves play while a die is resting on one of its slots, that
 * die is immediately returned to the supply. Only Ability Slot dice need
 * this (Cast Slot dice are already "spent" the instant the card resolves —
 * there's no persistent slot left behind to vacate); see `abilityDieIndex`.
 * Note: don't cross-check `die.value` against `c.abilityDie` here — Rally
 * (activateViaRally) clears the *source* card's `abilityDie` the moment its
 * die's value is copied onto the Rally card, while deliberately leaving the
 * source's `abilityDieIndex` pointing at the real physical die (still
 * correctly exhausted). If the source later leaves play, that index is the
 * only reliable link back to it.
 */
function releaseAbilityDie(p: Player, c: Inst) {
  if (c.abilityDieIndex === undefined) return;
  const die = p.dice[c.abilityDieIndex];
  if (die && die.placed) die.placed = false;
  c.abilityDieIndex = undefined;
}

function enterPlay(
  g: Game,
  p: Player,
  c: Inst,
  dieValue: number,
  viaEcho = false,
  targetIid?: string,
) {
  g.stats.casts[c.def.id] = (g.stats.casts[c.def.id] || 0) + 1;
  // v4.10: per-player, per-card cast tracking (mirrors the existing
  // `echoCard:${id}` decision) — the pool-wide `casts` counter above can't
  // tell which side cast a card when both decks include the same id, and
  // says nothing about win correlation. Needed to diagnose a specific
  // archetype's weak cards directly (a fixed-decklist archetype's "card
  // present in deck -> win%" is always identical to the deck's own win rate,
  // since every copy is in every one of that archetype's games — only
  // whether the card actually got CAST that game varies).
  decide(g, p.id, `cardCast:${c.def.id}`);
  const eff = effThreshold(g, p.id, c.def);
  const overflowHit =
    !!c.def.overflow && c.def.threshold !== undefined && dieValue - eff >= c.def.overflow.amount;
  // Must be set before any discardCard() call below — an Echo-recast Charm/
  // Event resolves-then-discards immediately, and that discard IS the "next
  // time this Echoed card would be discarded again" that Rulebook §10 sends
  // to the Banished Zone instead of back to Discard.
  if (viaEcho) c.echoSpent = true;

  if (c.def.type === 'Unit') {
    // A Unit (re)entering play — whether a fresh cast, a completed Twin, or
    // an Echo recast reusing the same Inst — starts a clean "life": nothing
    // it accumulated on a previous stint in play (buffs, exhaustion, a
    // pending Bind) should carry over.
    c.enteredThisTurn = true;
    c.damage = 0;
    c.permAtk = 0;
    c.permHp = 0;
    c.comboSelfBuffStacks = 0;
    c.avengeStacks = 0;
    c.hasAttacked = false;
    c.attacksMade = 0;
    c.abilityUsed = false;
    c.abilityDie = undefined;
    c.abilityDieIndex = undefined;
    c.wardUsed = false;
    c.steelUsed = 0;
    c.anchorCapBonused = false;
    c.boundThisTurn = false;
    c.boundNextTurn = false;
    // v4.4.2: a pending Diver-style tempo grant (abilityGrantsTempo) is
    // spent by the next Unit to enter play this turn, whichever destination
    // it came through — treats it as if it had innate Swift for this stint
    // AND now also a permanent +1/+1 (v4.4.1's sickness-skip alone barely
    // moved Diver's win rate, 33.7% -> 34.2%).
    // v4.6: +1/+1 -> +2/+2 — Diver stayed the weakest Leader through two
    // rounds of kit buffs, and this pass's exact-cost stat clamp (correct
    // pool-wide) incidentally trimmed the cheap aggressive bodies Diver's
    // tempo plan leans on hardest. Strengthening the tempo grant compensates
    // inside Diver's own identity instead of another threshold change.
    if (p.swiftGrantThisTurn) {
      c.enteredThisTurn = false;
      c.permAtk += 2;
      c.permHp += 2;
      p.swiftGrantThisTurn = false;
    }
    p.board.push(c);
    applyAnchorCapBonus(g, p, c);
  } else if (c.def.type === 'Location') {
    if (p.location) {
      g.log.push(`${p.location.def.name} was replaced.`);
      releaseAbilityDie(p, p.location);
      discardCard(g, p, p.location);
    }
    c.excavateStacks = 0; // fresh Location life: no unearned Excavate discount
    p.location = c;
    p.locationCastThisTurn = true;
    // v4.4: Locations can now carry an onCast effect, same field Units and
    // Charms/Events already use — previously ignored for this type entirely.
    // The balance sim found Locations a persistent net negative even after
    // doubling their passive value; the diagnosis was opportunity cost, not
    // passive size — a Location competing for a deck slot against a Unit
    // that gives an immediate, upfront effect always loses that comparison
    // if the Location's own value is 100% deferred to "the passive adds up
    // eventually." A modest immediate effect narrows that gap directly.
    if (c.def.onCast) {
      // v4.5 Contested: previously only doubled the ambient locPassive
      // (ATK_ALL/HP_ALL) — the on-cast effect (a Location's only other
      // source of value since v4.4.2) was left out, so Contested measured
      // as the weakest keyword in the game (28.4% win rate) despite
      // Locations overall still running a net-negative isolated
      // contribution even a doubled ambient passive alone can't fix.
      const contestedMult = c.def.contested && !opponentOf(g, p.id).location ? 2 : 1;
      const onCast =
        contestedMult > 1
          ? { ...c.def.onCast, value: (c.def.onCast.value || 0) * contestedMult }
          : c.def.onCast;
      applyEffect(g, p.id, onCast, targetIid ?? autoTarget(g, p.id, onCast), c);
    }
    cleanupDeaths(g); // HP_ALL leaving can kill units
  } else {
    // Charm / Event: resolve then discard.
    if (c.def.onCast) {
      const eff = withCrescendo(p, c, c.def.onCast);
      applyEffect(g, p.id, eff, targetIid ?? autoTarget(g, p.id, eff), c);
      queueAftershock(g, p, c);
    }
    resolveCastComboBonus(g, p, c);
    discardCard(g, p, c);
  }
  if (c.def.type === 'Unit' && c.def.onCast) {
    applyEffect(g, p.id, c.def.onCast, targetIid ?? autoTarget(g, p.id, c.def.onCast), c);
  }
  if (overflowHit && c.def.overflow) {
    g.log.push(`${c.def.name} Overflow triggered.`);
    applyEffect(g, p.id, c.def.overflow.effect, autoTarget(g, p.id, c.def.overflow.effect), c);
  }
  cleanupDeaths(g);
}

/**
 * Default target chooser for effects whose caller didn't pick one (Combo
 * bonuses, Overflow, Twin bonuses). Simple but sensible.
 */
/** `excludeIid`: skip this specific permanent when picking a target — used
 * by activateAbility() for a `abilityNoRepeatTarget` Leader Ability so the
 * auto-pick path (no explicit UI/AI target) never just re-selects whatever
 * it bought last turn. */
export function autoTarget(
  g: Game,
  ownerId: string,
  eff: Effect,
  excludeIid?: string,
): string | undefined {
  const p = g.players[ownerId];
  const opp = opponentOf(g, ownerId);
  const byAtk = (a: Inst, b: Inst) => effAtk(g, b) - effAtk(g, a);
  switch (eff.target) {
    case 'enemyUnit': {
      // Prefer a kill (matches the anyTarget heuristic below) over always
      // chipping the biggest body — otherwise removal wastes value chipping
      // a tough unit while a nearly-dead one survives untouched.
      const v = eff.value || 0;
      const killable = opp.board.filter((u) => wouldSapKill(g, u, v)).sort(byAtk)[0];
      if (killable) return killable.iid;
      // `destroy` ignores `v` (wouldSapKill(_,_,0) never matches a living
      // unit) and `sap` fully fizzles against Ward (applyEffect's `destroy`/
      // `sap` branches both check hasUnspentWard) — an uncapped fallback
      // that only sorts by ATK can burn removal on a Warded target while an
      // unwarded, actually-killable one sits right there. Prefer unwarded.
      const unwarded = opp.board.filter((u) => !hasUnspentWard(u)).sort(byAtk)[0];
      if (unwarded) return unwarded.iid;
      const t = [...opp.board].sort(byAtk)[0];
      return t?.iid;
    }
    case 'anyTarget': {
      const v = eff.value || 0;
      const killable = opp.board.filter((u) => wouldSapKill(g, u, v)).sort(byAtk)[0];
      if (killable) return killable.iid;
      const big = [...opp.board].sort(byAtk)[0];
      // Prefer face damage if no good unit target.
      if (big && effAtk(g, big) >= 3) return big.iid;
      return opp.leader.iid;
    }
    case 'friendlyUnit': {
      // v4.5: was `.sort(byAtk)[0]` — always the biggest-ATK Unit, which is
      // "rich get richer": whichever Unit is already the board's biggest
      // threat gets even bigger, instead of spreading the buff to the Unit
      // that actually needs it to trade favorably. Target `target: 'friendlyUnit'`
      // is buff-only (see catalog.test.ts's TARGETS_BY_ACTION), so lowest
      // ATK first is the more useful default fallback.
      const t = [...p.board].filter((u) => u.iid !== excludeIid).sort((a, b) => byAtk(b, a))[0];
      return t?.iid;
    }
    case 'friendlyAny': {
      // Compare the Leader against board Units on actual damage taken,
      // rather than always defaulting to the Leader — otherwise a Unit
      // sitting at near-lethal damage gets ignored in favor of topping off
      // a Leader with only a point or two of damage.
      const v = eff.value || 0;
      const hurtPool = [p.leader, ...p.board].filter((u) => u.damage > 0);
      if (hurtPool.length === 0) return p.leader.iid;
      const noWaste = hurtPool.filter((u) => u.damage >= v).sort((a, b) => b.damage - a.damage)[0];
      if (noWaste) return noWaste.iid;
      return [...hurtPool].sort((a, b) => b.damage - a.damage)[0].iid;
    }
    default:
      return undefined;
  }
}

/**
 * v4.3: normalize a single die index or a multi-die selection (needed for
 * 'sum' cast costs) into an array of that player's still-unplaced Die
 * objects, or null if the selection is invalid (missing/already-placed/
 * duplicate index).
 */
function pickDice(p: Player, dieIndex: number | number[]): Die[] | null {
  const idxs = Array.isArray(dieIndex) ? dieIndex : [dieIndex];
  if (idxs.length === 0 || new Set(idxs).size !== idxs.length) return null;
  const dice = idxs.map((i) => pickDie(p, i));
  return dice.every((d): d is Die => !!d) ? dice : null;
}

/**
 * v4.3: does this die selection legally pay a card's Cast Slot cost? Covers
 * the two numeric cost formats — the three pattern-based formats (Pairs and
 * every kind/straight/house/parity pattern) are already handled by the
 * pre-existing `comboGate` check at each call site, since `comboGate` is
 * usable on any card type now, not just Events.
 */
function payableNumeric(g: Game, pid: string, def: CardDef, dice: Die[]): boolean {
  const eff = effThreshold(g, pid, def);
  if (def.castCostKind === 'sum') {
    return dice.reduce((s, d) => s + d.value, 0) >= eff;
  }
  if (def.castCostKind === 'exact') {
    return dice.length === 1 && dice[0].value === eff;
  }
  return dice.length === 1 && dice[0].value >= eff;
}

/** Destination 1: cast a card from hand. `dieIndex` is an array for 'sum'-cost cards. */
export function castFromHand(
  g: Game,
  dieIndex: number | number[],
  cardIid: string,
  targetIid?: string,
): boolean {
  const p = g.players[g.active];
  const dice = pickDice(p, dieIndex);
  const idx = p.hand.findIndex((c) => c.iid === cardIid);
  if (!dice || idx < 0) return false;
  const c = p.hand[idx];

  // v4.1: Locations never use a die — they cast free via castLocationFree().
  if (c.def.type === 'Location') return false;

  // §3.4/§3.6: casting is a Placement Phase action (or Reroll Phase, for
  // Snap). Once comboCheck() has opened the Combat window, the cast window
  // is closed for the rest of the turn — every other placement action
  // already rejects non-PLACEMENT stages, but this function only checked
  // the PRE_REROLL side, silently allowing casts mid-Combat.
  if (g.stage === 'COMBAT') return false;
  // v4.2 Snap: everything else must wait for the Placement Phase to open.
  if (g.stage === 'PRE_REROLL' && !c.def.snap) return false;

  if (c.def.comboGate) {
    // v4.2 systemic fix (errata A): at most one Combo-gated card per turn,
    // regardless of how many qualify — closes the general chaining failure
    // mode, not just the one offending card.
    if (p.comboGateCastThisTurn) return false;
    if (dice.length !== 1) return false;
    if (!matchesPattern(rollValues(p), c.def.comboGate)) return false;
    // any die value works
    // RULING (Snap + comboGate): a Snap card cast during the Reroll Phase
    // checks the pattern against the *live roll at cast time*. The card is
    // fully resolved immediately (§2: no stack) — later rerolls this same
    // turn breaking the pattern never un-resolve it.
  } else {
    if (!payableNumeric(g, p.id, c.def, dice)) return false;
  }

  for (const die of dice) die.placed = true;
  // The die whose value drives Twin staging / Overflow math: for 'sum'-cost
  // cards this is the total of every die spent (Twin never uses 'sum' — see
  // cardpool.ts), otherwise the one die placed.
  const primaryValue =
    c.def.castCostKind === 'sum' ? dice.reduce((s, d) => s + d.value, 0) : dice[0].value;
  p.hand.splice(idx, 1);
  if (c.def.comboGate) p.comboGateCastThisTurn = true;
  // v4.4 Foothold: the discount effThreshold() already applied above (via
  // payableNumeric's effective-threshold check) is spent the moment a Unit
  // is actually cast — "the first Unit you cast," not every Unit for the
  // rest of the turn.
  if (c.def.type === 'Unit' && footholdActive(g, p.id)) p.footholdUsedThisTurn = true;

  if (hasKw(c.def, 'Twin')) {
    // First Twin slot filled -> Staging Zone.
    c.stagedDie = primaryValue;
    c.stagedTurns = 0;
    c.stagedThisTurn = true;
    p.staging.push(c);
    g.log.push(`${c.def.name} moved to Staging (die ${primaryValue}).`);
    // v4.2 Twin A/B test (errata B, mode 'sameTurn'): if a second unplaced die
    // already matches, complete it immediately in the same Placement Phase.
    if (g.rules.twinMode === 'sameTurn') {
      const placedIdx = Array.isArray(dieIndex) ? dieIndex[0] : dieIndex;
      const matchIdx = p.dice.findIndex(
        (d, i) => i !== placedIdx && !d.placed && d.value === primaryValue,
      );
      if (matchIdx >= 0) completeTwin(g, matchIdx, c.iid);
    }
    return true;
  }
  if (c.def.onCast && targetIid) {
    // Caller-specified target overrides autoTarget: pre-resolve here.
    // (Stat counting stays inside the Charm/Event branch — a targeted Unit
    // falls through to enterPlay(), which counts the cast itself; counting
    // here too double-counted every targeted Unit cast.)
    if (c.def.type === 'Charm' || c.def.type === 'Event') {
      g.stats.casts[c.def.id] = (g.stats.casts[c.def.id] || 0) + 1;
      decide(g, p.id, `cardCast:${c.def.id}`);
      applyEffect(g, p.id, withCrescendo(p, c, c.def.onCast), targetIid, c);
      queueAftershock(g, p, c);
      const eff = effThreshold(g, p.id, c.def);
      if (
        c.def.overflow &&
        c.def.threshold !== undefined &&
        primaryValue - eff >= c.def.overflow.amount
      ) {
        applyEffect(g, p.id, c.def.overflow.effect, autoTarget(g, p.id, c.def.overflow.effect), c);
      }
      resolveCastComboBonus(g, p, c);
      discardCard(g, p, c);
      cleanupDeaths(g);
      return true;
    }
  }
  enterPlay(g, p, c, primaryValue, false, targetIid);
  return true;
}

/**
 * v4.1 free Location cast: once per turn, cast one Location from hand for free
 * as a bonus action — no die, no threshold. All Location restrictions still
 * apply (max 1 in play, no same-name replacement, max 1 cast per turn).
 */
export function castLocationFree(g: Game, cardIid: string): boolean {
  const p = g.players[g.active];
  // `!g.turnStarted` closes the between-turns gap: finishEndPhase leaves
  // stage at PLACEMENT (deliberately, to keep the Combat window shut) with
  // `active` already flipped. Die-costed actions are safe there because
  // p.dice is empty, but this action is die-free — without this check the
  // incoming player could slip in a free Location cast before their own
  // startTurn() ran (against a stale locationCastThisTurn flag, no less).
  if (g.stage !== 'PLACEMENT' || !g.turnStarted) return false;
  const idx = p.hand.findIndex((c) => c.iid === cardIid);
  if (idx < 0) return false;
  const c = p.hand[idx];
  if (c.def.type !== 'Location') return false;
  if (p.locationCastThisTurn) return false;
  if (p.location?.def.id === c.def.id) return false;
  p.hand.splice(idx, 1);
  enterPlay(g, p, c, 0); // dieValue unused for Locations
  decide(g, p.id, 'locationCast');
  return true;
}

/** Destination 2: activate an Ability Slot on a card in play (or the Leader / Location). */
export function activateAbility(
  g: Game,
  dieIndex: number,
  cardIid: string,
  targetIid?: string,
): boolean {
  const p = g.players[g.active];
  if (g.stage !== 'PLACEMENT') return false;
  const die = pickDie(p, dieIndex);
  const c = [...p.board, p.leader, p.location].find((x): x is Inst => !!x && x.iid === cardIid);
  if (!die || !c || !c.def.ability || c.abilityUsed) return false;
  if (c.def.type === 'Unit') {
    if (c.hasAttacked || c.boundThisTurn) return false;
    if (c.enteredThisTurn && !hasKw(c.def, 'Swift')) return false;
  }
  if (die.value < effAbilityThreshold(g, c)) return false;
  // v4.4: an `abilityNoRepeatTarget` Ability (currently only Apex Nanite
  // Shinobi's Leader Ability) can't buff the same permanent two
  // activations in a row. An explicit re-pick of last turn's target is
  // rejected outright; the auto-pick path (AI, or UI with no target chosen)
  // just excludes it and picks the next-best legal target instead.
  let resolvedTarget: string | undefined;
  if (c.def.abilityNoRepeatTarget) {
    if (targetIid && targetIid === c.lastAbilityTargetIid) return false;
    resolvedTarget = targetIid ?? autoTarget(g, p.id, c.def.ability.effect, c.lastAbilityTargetIid);
    if (!resolvedTarget) return false; // no other legal target exists this turn
  } else {
    resolvedTarget = targetIid ?? autoTarget(g, p.id, c.def.ability.effect);
  }
  die.placed = true;
  c.abilityUsed = true;
  c.abilityDie = die.value;
  c.abilityDieIndex = dieIndex;
  if (c.def.type === 'Leader') {
    g.stats.leaderAbilityUses[c.def.id] = (g.stats.leaderAbilityUses[c.def.id] || 0) + 1;
    decide(g, p.id, 'leaderAbility');
  }
  applyEffect(g, p.id, c.def.ability.effect, resolvedTarget, c);
  if (c.def.abilityNoRepeatTarget) c.lastAbilityTargetIid = resolvedTarget;
  // v4.4 Diver: draw-a-card Ability that also grants tempo — the next
  // friendly Unit cast this turn skips summoning sickness (see enterPlay).
  if (c.def.abilityGrantsTempo) p.swiftGrantThisTurn = true;
  return true;
}

/** Rally: activate this card's ability using a die resting on another exhausted friendly Ability Slot. */
export function activateViaRally(
  g: Game,
  rallyIid: string,
  sourceIid: string,
  targetIid?: string,
): boolean {
  const p = g.players[g.active];
  if (g.stage !== 'PLACEMENT') return false;
  const c = p.board.find((x) => x.iid === rallyIid);
  const src = [...p.board, p.leader, p.location].find((x): x is Inst => !!x && x.iid === sourceIid);
  // "Once per turn" (§10) is per Rally card, not a whole-player budget —
  // that's already enforced below by c.abilityUsed, same as any other
  // Ability Slot exhaustion.
  if (!c || !src || !hasKw(c.def, 'Rally') || !c.def.ability || c.abilityUsed) return false;
  if (c.hasAttacked || c.boundThisTurn) return false;
  if (c.enteredThisTurn && !hasKw(c.def, 'Swift')) return false;
  if (src.iid === c.iid || !src.abilityUsed || src.abilityDie === undefined) return false;
  if (src.abilityDie < effAbilityThreshold(g, c)) return false;
  c.abilityUsed = true;
  c.abilityDie = src.abilityDie;
  src.abilityDie = undefined; // die moves; source stays exhausted
  g.stats.rallies++;
  applyEffect(
    g,
    p.id,
    c.def.ability.effect,
    targetIid ?? autoTarget(g, p.id, c.def.ability.effect),
    c,
  );
  return true;
}

/**
 * v4.2 Ultimate(N): a Leader's second, once-per-game Ability Slot, usable
 * only from the controller's Nth own turn onward. Independent of the
 * Leader's normal Ability Slot (its own die, its own exhaustion).
 */
export function activateUltimate(g: Game, dieIndex: number, targetIid?: string): boolean {
  const p = g.players[g.active];
  if (g.stage !== 'PLACEMENT') return false;
  const leader = p.leader;
  const ult = leader.def.ultimate;
  if (!ult || leader.ultimateUsed) return false;
  if (p.turnsTaken < ult.unlockTurn) return false;
  const die = pickDie(p, dieIndex);
  // RULING: Resolve X discounts only the Leader's *normal* Ability Slot
  // (effAbilityThreshold). Ultimate(N) is "entirely independent of its
  // normal one" (§10) — its printed threshold is never reduced by Resolve,
  // Anchor (Cast Slots only) or anything else.
  if (!die || die.value < ult.threshold) return false;
  die.placed = true;
  leader.ultimateUsed = true;
  decide(g, p.id, 'ultimateUsed');
  // v4.6 instrumentation: the balance sim kept measuring Ultimate usage as
  // correlated with LOSING, but couldn't separate "already losing, used it
  // anyway" from "using it caused the loss" (the deck-membership confound
  // flagged in docs/BALANCE_SIM_FINDINGS_v4.5.md §3). Record the board state
  // at the moment of activation so the sim can split the win-delta by it.
  const oppAtUlt = opponentOf(g, p.id);
  const behindAtUlt =
    remainingHp(g, p.leader) * 2 <= effMaxHp(g, p.leader) ||
    p.board.length < oppAtUlt.board.length;
  decide(g, p.id, behindAtUlt ? 'ultimateUsedBehind' : 'ultimateUsedAhead');
  applyEffect(g, p.id, ult.effect, targetIid ?? autoTarget(g, p.id, ult.effect), leader);
  return true;
}

/** Destination 3: complete a staged Twin card (exact same face value). */
export function completeTwin(g: Game, dieIndex: number, cardIid: string): boolean {
  const p = g.players[g.active];
  if (g.stage !== 'PLACEMENT') return false;
  const die = pickDie(p, dieIndex);
  const idx = p.staging.findIndex((c) => c.iid === cardIid);
  if (!die || idx < 0) return false;
  const c = p.staging[idx];
  if (die.value !== c.stagedDie) return false;
  // v4.2 Twin A/B test (errata B): the one-die-per-turn cap applies in every
  // mode except 'sameTurn', which reverts to same-Placement-Phase completion
  // by design. A literal `=== 'oneDiePerTurn'` check left 'stagedPassive'
  // (whose rulebook description is explicitly "keep the cap, but give staged
  // cards a passive") with no cap at all — same-turn completion was legal in
  // that mode too, contradicting its own name.
  if (g.rules.twinMode !== 'sameTurn' && c.stagedThisTurn) return false;
  die.placed = true;
  p.staging.splice(idx, 1);
  c.stagedDie = undefined;
  g.stats.twinCompletions++;
  decide(g, p.id, 'twinComplete');
  enterPlay(g, p, c, die.value);
  if (c.def.twinBonus) {
    applyEffect(g, p.id, c.def.twinBonus, autoTarget(g, p.id, c.def.twinBonus), c);
  }
  return true;
}

/** Destination 4: Echo-recast from Discard (die meets threshold + discard one
 * card from hand — waived for mid/high-rarity cards, see `waiveFodder` below).
 * `dieIndex` is an array for 'sum'-cost cards. `discardIid` is unused/
 * optional when the recast card is mid-rarity. */
export function echoRecast(
  g: Game,
  dieIndex: number | number[],
  cardIid: string,
  discardIid?: string,
  targetIid?: string,
): boolean {
  const p = g.players[g.active];
  // `!g.turnStarted`: same between-turns hole as castLocationFree — an
  // Echo-recast of a *Location* spends no die, so the empty-dice guard that
  // protects every other placement action between turns doesn't apply here.
  if (g.stage !== 'PLACEMENT' || !g.turnStarted) return false;
  const idx = p.discard.findIndex((c) => c.iid === cardIid);
  if (idx < 0) return false;
  const c = p.discard[idx];
  if (!hasKw(c.def, 'Echo') || c.echoSpent) return false;
  // v4.4: mid-rarity Echo recasts waive the extra-discard cost entirely —
  // the sim measured recasting a mid-rarity card as correlated with LOSING
  // (a losing player reaching for a comeback that isn't one), while low- and
  // high-rarity Echo recasts both correlated with winning. Low/high keep the
  // full "discard one extra card" cost (see docs/RULEBOOK.md's Echo entry).
  // v4.8: the waiver widens to HIGH rarity too (was mid-only) — the decision
  // table has high-rarity Echo recasts as the clearest positive line in the
  // Echo family (+5.8pt) yet still taxed a real card, while the round-4
  // echoNoFodder ablation arm lifted the Echo-themed floor decks (Shinobi
  // Tempo-Anchor 11.5 -> 19.0). Low rarity keeps the full fodder cost.
  const waiveFodder = SIM_TUNING.echoWaiveAllFodder || rarityTier(c.def.rarity) !== 'low';
  let dIdx = -1;
  if (!waiveFodder) {
    dIdx = p.hand.findIndex((h) => h.iid === discardIid);
    if (dIdx < 0) return false;
  }
  if (c.def.type === 'Location') {
    if (p.locationCastThisTurn) return false;
    if (p.location?.def.id === c.def.id) return false;
  }
  // v4.1: Locations are die-free / Cast-Slot-free, even Echo-recast — only
  // non-Location cards spend a die meeting their normal Cast Slot threshold.
  let dice: Die[] = [];
  if (c.def.type !== 'Location') {
    const picked = pickDice(p, dieIndex);
    if (!picked) return false;
    dice = picked;
    if (c.def.comboGate) {
      // v4.2: the one-Combo-gated-card-per-turn cap also covers Echo recasts.
      if (p.comboGateCastThisTurn) return false;
      if (dice.length !== 1) return false;
      if (!matchesPattern(rollValues(p), c.def.comboGate)) return false;
    } else if (!payableNumeric(g, p.id, c.def, dice)) {
      return false;
    }
  }
  for (const die of dice) die.placed = true;
  const primaryValue =
    dice.length === 0
      ? 0
      : c.def.castCostKind === 'sum'
        ? dice.reduce((s, d) => s + d.value, 0)
        : dice[0].value;
  if (c.def.comboGate) p.comboGateCastThisTurn = true;
  p.discard.splice(idx, 1);
  if (!waiveFodder) {
    const extra = p.hand.splice(dIdx, 1)[0];
    discardCard(g, p, extra);
  }
  g.stats.echoRecasts++;
  // v4.9: per-card "was this card Echo-recast at least once this game" flag,
  // piggybacked on the existing per-player decision counters — the harness
  // correlates it with the game's win/loss the same way it does every other
  // decision key, giving a per-card Echo win-delta instead of only the
  // rarity-tier buckets recorded below (v4.8 findings §4 item 2).
  decide(g, p.id, `echoCard:${c.def.id}`);
  decide(g, p.id, 'echoRecast');
  // v4.2 errata B: break the Echo win-delta out by what's being recast, so a
  // "commons drag the average down" story can be told apart from "overpriced
  // across the board".
  decide(g, p.id, `echoRecast_${rarityTier(c.def.rarity)}`);

  if (hasKw(c.def, 'Twin')) {
    // Echo must fill Twin's first Cast Slot the same way a fresh cast does —
    // straight to Staging, still needing a second exact-matching die on a
    // later turn — not a one-die completion via enterPlay(). Must be marked
    // spent before it lands in Staging: if it's later abandoned back to
    // Discard, §10 sends an already-Echoed card to Banished instead.
    c.echoSpent = true;
    c.stagedDie = primaryValue;
    c.stagedTurns = 0;
    c.stagedThisTurn = true;
    p.staging.push(c);
    g.log.push(`${c.def.name} Echoed back into Staging (die ${primaryValue}).`);
    if (g.rules.twinMode === 'sameTurn') {
      const placedIdx = Array.isArray(dieIndex) ? dieIndex[0] : dieIndex;
      const matchIdx = p.dice.findIndex(
        (d, i) => i !== placedIdx && !d.placed && d.value === primaryValue,
      );
      if (matchIdx >= 0) completeTwin(g, matchIdx, c.iid);
    }
    return true;
  }

  enterPlay(g, p, c, primaryValue, true, targetIid);
  return true;
}

/** Scrap: discard a Scrap card from hand to reroll one unplaced die. */
export function scrap(g: Game, handIid: string, dieIndex: number): boolean {
  const p = g.players[g.active];
  if (g.stage !== 'PLACEMENT') return false;
  const die = pickDie(p, dieIndex);
  const idx = p.hand.findIndex((c) => c.iid === handIid && hasKw(c.def, 'Scrap'));
  if (!die || idx < 0) return false;
  const c = p.hand.splice(idx, 1)[0];
  discardCard(g, p, c);
  die.value = d6(g.rng);
  g.stats.scraps++;
  return true;
}

/** Voluntary Twin abandonment (start of turn, before Draw — call before startTurn draws, or
 * during that same turn's Reroll Phase, mirroring Snap Charms' PRE_REROLL window). Blocked once
 * the active player has entered their own Placement Phase — full board/roll information is
 * known by then and other cards may already have been cast this turn. */
export function abandonTwin(g: Game, cardIid: string): boolean {
  if (g.turnStarted && g.stage !== 'PRE_REROLL') return false;
  const p = g.players[g.active];
  const idx = p.staging.findIndex((c) => c.iid === cardIid);
  if (idx < 0) return false;
  const c = p.staging.splice(idx, 1)[0];
  c.stagedDie = undefined;
  p.hand.push(c);
  g.stats.twinAbandons++;
  return true;
}

// ---------------------------------------------------------------------------
// Combo Check (§3.5)
// ---------------------------------------------------------------------------
export function comboCheck(g: Game) {
  // Idempotence guard: comboCheck is the one-shot Placement->Combat turnstile
  // (see the stage flip below). Without this, a second call in the same
  // turn would double-apply every qualifying Combo bonus (permanent
  // permAtk/permHp buffs, Sap damage, etc.) instead of being a harmless no-op.
  if (g.stage !== 'PLACEMENT') return;
  const p = g.players[g.active];
  const values = rollValues(p);
  const holders = [...p.board, p.location].filter((c): c is Inst => !!c && !!c.def.combo);
  for (const c of holders) {
    if (g.winner) break;
    if (!p.board.includes(c) && p.location !== c) continue; // died mid-loop
    if (matchesPattern(values, c.def.combo!.pattern)) {
      const combo = c.def.combo!;
      // v4.4: a self-buff Combo re-triggers every one of the controller's
      // turns for as long as the card survives, unlike every other repeating
      // mechanic in the game (Anchor capped at 2, Toll capped at 3) — left
      // uncapped this snowballs a cheap Unit into an unkillable permanent
      // stat monster. Cap it the same "ramp, not a collapse" way.
      if (combo.effect.action === 'buff' && combo.effect.target === 'self') {
        c.comboSelfBuffStacks = c.comboSelfBuffStacks || 0;
        if (c.comboSelfBuffStacks >= MAX_COMBO_SELF_BUFF_STACKS) continue;
        c.comboSelfBuffStacks++;
      }
      g.stats.comboTriggers[c.def.id] = (g.stats.comboTriggers[c.def.id] || 0) + 1;
      applyEffect(g, p.id, combo.effect, autoTarget(g, p.id, combo.effect), c);
    }
  }
  // §3.5 -> §3.6: Combo Check is the one-way turnstile into the Combat Phase
  // — this is the only place `attack()` will ever run. Set unconditionally
  // (even if a Combo effect just ended the game) since nothing further reads
  // stage once g.winner is set.
  g.stage = 'COMBAT';
}

/**
 * A Charm/Event's own `.combo` bonus (cardpool.ts's "Combo bonus, not a
 * requirement" rider on steep-cost Events) can never be picked up by
 * `comboCheck()` above — that function only scans permanents still sitting
 * in `p.board`/`p.location` at the Combat Phase transition, but Charms/
 * Events resolve immediately and go straight to Discard. Check it inline,
 * right when the card resolves, against the roll that paid for it.
 */
function resolveCastComboBonus(g: Game, p: Player, c: Inst) {
  if (!c.def.combo) return;
  if (matchesPattern(rollValues(p), c.def.combo.pattern)) {
    g.stats.comboTriggers[c.def.id] = (g.stats.comboTriggers[c.def.id] || 0) + 1;
    applyEffect(g, p.id, c.def.combo.effect, autoTarget(g, p.id, c.def.combo.effect), c);
  }
}

// ---------------------------------------------------------------------------
// Combat (§8): sequential targeted attacks.
// ---------------------------------------------------------------------------
export function canAttack(g: Game, u: Inst): boolean {
  const p = g.players[u.owner];
  if (g.winner) return false;
  if (u.def.type !== 'Unit') return false;
  if (p.turnsTaken <= 1) return false; // no attacks on your first turn
  if (u.boundThisTurn || u.abilityUsed) return false;
  if (u.enteredThisTurn && !hasKw(u.def, 'Swift')) return false;
  const maxAttacks = hasKw(u.def, 'Frenzy') ? 2 : 1;
  return u.attacksMade < maxAttacks;
}

/** `attackerIid`, when given, is used to apply the v4.4 Frenzy restriction
 * below — omit it (as the AI's pre-attacker-choice lethal-check heuristic
 * and combat-log/inspector callers do) to get the plain Guard-aware target
 * list with no per-attacker filtering. */
export function legalTargets(g: Game, attackerOwner: string, attackerIid?: string): Inst[] {
  const opp = opponentOf(g, attackerOwner);
  const guards = opp.board.filter((u) => hasKw(u.def, 'Guard'));
  if (guards.length > 0) return guards;
  const targets: Inst[] = [...opp.board, opp.leader];
  if (attackerIid) {
    const owner = g.players[attackerOwner];
    const att = owner.board.find((u) => u.iid === attackerIid);
    // v4.4 Frenzy: the second (bonus) swing can't target the enemy Leader
    // directly — keeps Frenzy a board-control tool instead of also doubling
    // as a second face-attack roll (the sim's single strongest win signal).
    // Falls back to allowing the Leader if it's the only target left (an
    // empty enemy board shouldn't leave a Frenzy swing with nothing to hit).
    // v4.4.1: the restriction only applies while this player is even or
    // ahead on board — the first version measured as an overcorrection
    // (Frenzy's keyword-wide win rate fell from ~60%+ to below average), so
    // Frenzy keeps its face-damage upside as a comeback tool specifically
    // when its controller is BEHIND on Units, while staying a board-control
    // tool the rest of the time.
    const behind = owner.board.length < opp.board.length;
    if (att && hasKw(att.def, 'Frenzy') && att.attacksMade >= 1 && !behind) {
      const noLeader = targets.filter((t) => t.def.type !== 'Leader');
      return noLeader.length > 0 ? noLeader : targets;
    }
  }
  return targets;
}

export function attack(g: Game, attackerIid: string, targetIid: string): boolean {
  // §3.5/§3.6: attacks only ever happen in the Combat Phase, which comboCheck()
  // is the sole gateway into — this rejects an attack declared before Combo
  // Check has run (or after the turn's already ended) instead of silently
  // allowing combat to interleave with Placement.
  if (g.stage !== 'COMBAT') return false;
  const p = g.players[g.active];
  const att = p.board.find((u) => u.iid === attackerIid);
  if (!att || !canAttack(g, att)) return false;
  const targets = legalTargets(g, p.id, att.iid);
  const tgt = targets.find((t) => t.iid === targetIid);
  if (!tgt) return false;

  g.stats.attacks++;
  att.hasAttacked = true;
  const attackNumber = att.attacksMade + 1; // 1 = first swing, 2 = Frenzy swing
  att.attacksMade++;

  const atk = effAtk(g, att);
  decide(g, p.id, tgt.def.type === 'Leader' ? 'faceAttack' : 'unitAttack');
  if (g.turn <= 4 && tgt.def.type === 'Leader') decide(g, p.id, 'earlyFaceAttack');
  if (tgt.def.type === 'Leader') {
    // One-directional: Leaders have no ATK, no retaliation. Toll (v4.2)
    // reduces this like any other incoming Leader damage.
    const toll = Math.min(atk, tollReduction(g, tgt.owner));
    g.stats.tollReduced += toll;
    tgt.damage += atk - toll;
    g.log.push(`${att.def.name} hit the Leader for ${atk}.`);
    cleanupDeaths(g);
    return true;
  }

  // Simultaneous math off pre-attack stats.
  const tgtHp = remainingHp(g, tgt);
  let dmgToTarget = atk;
  // Ward: prevents the first instance of damage from being attacked; before multipliers.
  if (hasKw(tgt.def, 'Ward') && !tgt.wardUsed) {
    tgt.wardUsed = true;
    g.stats.wardBlocks++;
    dmgToTarget = 0;
    // v4.4: a prevented hit spikes 1 damage back at the attacker — gives Ward
    // decks a way to punish the attacker that's beating them instead of just
    // delaying it by one turn (see docs/RULEBOOK.md's Ward entry). Scoped to
    // combat only — Ward blocking a non-combat effect (wardCheck) has no
    // concrete "attacker" Unit to punish.
    att.damage += 1;
    g.stats.wardPunishDamage += 1;
    g.log.push(`${tgt.def.name}'s Ward spiked 1 damage back at ${att.def.name}.`);
  } else {
    // v4.4 Steel X: absorbs up to X damage from ANY source each turn, checked
    // Ward (full prevention) -> Steel (per-turn pool) -> Bulwark (flat
    // reduction) -> Frenzy (multiplier).
    // v4.6: combined Steel+Bulwark prevention per hit caps at
    // STEEL_BULWARK_CAP (see its comment).
    let prevented = 0;
    if (tgt.def.steel) {
      const absorbed = Math.min(
        dmgToTarget,
        steelRemaining(tgt),
        STEEL_BULWARK_CAP - prevented,
      );
      if (absorbed > 0) {
        tgt.steelUsed += absorbed;
        g.stats.steelAbsorbed += absorbed;
        dmgToTarget -= absorbed;
        prevented += absorbed;
      }
    }
    if (tgt.def.bulwark) {
      // v4.2 Bulwark X: flat reduction to damage taken from attacks, checked
      // Ward (full prevention) -> Bulwark (flat reduction) -> Frenzy (multiplier).
      const reduced = Math.min(dmgToTarget, tgt.def.bulwark.x, STEEL_BULWARK_CAP - prevented);
      if (reduced > 0) {
        g.stats.bulwarkReduced += reduced;
        dmgToTarget -= reduced;
      }
    }
  }
  // v4.4 Overrun: a direct, targeted counter to the durability-stack meta
  // (Ward/Steel/Bulwark all fully zeroing this hit) without touching the
  // numbers that made those keywords good answers to Pierce/Frenzy. Doesn't
  // apply to retaliation, and never fires off a 0-ATK attacker.
  if (hasKw(att.def, 'Overrun') && dmgToTarget === 0 && atk > 0) {
    // v4.6: 1 -> half the attacker's ATK (rounded down, min 1). A flat 1
    // measured as no answer at all: the four durability-stack archetypes
    // (Ward-Steel Wall 87.8%, Guard-Bulwark Turtle 85.9%, Steel-Scrap
    // Control 83.6%, Toll-Bulwark Fortress 74.6%) stayed the top of the
    // roster through both a prevalence doubling and every adjacent nerf.
    // Mirrors Pierce's existing floor(atk/2) overflow cap, so "half ATK"
    // is already the established magnitude for punch-through effects.
    dmgToTarget = Math.max(1, Math.floor(atk / 2));
    g.stats.overrunTriggers++;
    g.log.push(`${att.def.name}'s Overrun punched ${dmgToTarget} damage through.`);
  }
  // v4.0 Bind: a bound Unit deals no retaliation damage this turn.
  // RULING on Bind's retaliation window (§10): boundThisTurn is set at the
  // start of the bound Unit's controller's turn and only cleared at the
  // start of that controller's *following* turn (startTurn touches only the
  // active player's cards). Retaliation only ever happens on the opponent's
  // turn, so the no-retaliation window is the binder's turn AFTER the bound
  // turn — which is exactly what makes the rulebook's "a completely safe
  // target for one turn" real. On the turn Bind is cast, the target still
  // retaliates normally (Bind is disruption aimed at upcoming turns).
  let retaliation = tgt.boundThisTurn ? 0 : effAtk(g, tgt);
  // v4.4 Steel X: also absorbs retaliation damage the attacker itself takes,
  // before Bulwark and Frenzy's multiplier — Ward never protects the
  // attacker on its own attack, but Steel (a per-turn pool, not a single
  // prevented instance) still does.
  // v4.6: the STEEL_BULWARK_CAP applies here too, symmetric with defense.
  let retPrevented = 0;
  if (att.def.steel) {
    const absorbed = Math.min(
      retaliation,
      steelRemaining(att),
      STEEL_BULWARK_CAP - retPrevented,
    );
    if (absorbed > 0) {
      att.steelUsed += absorbed;
      g.stats.steelAbsorbed += absorbed;
      retaliation -= absorbed;
      retPrevented += absorbed;
    }
  }
  // v4.2 Bulwark X: also reduces retaliation damage the attacker itself takes,
  // before Frenzy's multiplier — same Ward -> Bulwark -> Frenzy sequence.
  if (att.def.bulwark) {
    const reduced = Math.min(retaliation, att.def.bulwark.x, STEEL_BULWARK_CAP - retPrevented);
    if (reduced > 0) {
      g.stats.bulwarkReduced += reduced;
      retaliation -= reduced;
    }
  }
  // v4.0 Frenzy: only the SECOND (bonus) swing takes doubled retaliation.
  if (hasKw(att.def, 'Frenzy') && attackNumber === 2) retaliation *= 2;
  // v4.4: capped at half the attacker's effective ATK (rounded down, min 1).
  // The naive "leftover damage" formula (dmgToTarget - tgtHp) is ALREADY
  // bounded by (atk - 1) any time tgtHp >= 1 — a "cap at atk - 1" would be a
  // no-op. The sim flagged Pierce as consistently overperforming, so this is
  // a real reduction: a big Pierce attacker blowing through a 1-HP chip
  // block now sends at most half its ATK to the Leader, not nearly all of
  // it (see docs/RULEBOOK.md's Pierce entry).
  const pierceOverflow =
    hasKw(att.def, 'Pierce') && dmgToTarget >= tgtHp && tgtHp > 0
      ? Math.min(dmgToTarget - tgtHp, Math.max(1, Math.floor(atk / 2)))
      : 0;

  tgt.damage += dmgToTarget;
  att.damage += retaliation; // Ward never protects the attacker on its own attack
  if (pierceOverflow > 0) {
    const oppLeader = opponentOf(g, p.id).leader;
    const toll = Math.min(pierceOverflow, tollReduction(g, oppLeader.owner));
    g.stats.tollReduced += toll;
    oppLeader.damage += pierceOverflow - toll;
    g.stats.pierceOverflowDamage += pierceOverflow - toll;
    g.log.push(`${att.def.name} Pierced for ${pierceOverflow}.`);
  }
  cleanupDeaths(g);
  return true;
}

// ---------------------------------------------------------------------------
// End Phase (§3.7)
// ---------------------------------------------------------------------------
/**
 * Fallback discard choice when nobody supplied an explicit pick: discard a
 * duplicate copy if the hand holds one (a spare of something you're already
 * holding is the safest cut), otherwise discard the highest-threshold card
 * (the one least likely to be castable soon), not the cheapest.
 */
export function defaultDiscardChoice(hand: Inst[]): Inst {
  const idCounts = new Map<string, number>();
  for (const c of hand) idCounts.set(c.def.id, (idCounts.get(c.def.id) || 0) + 1);
  const dupes = hand.filter((c) => (idCounts.get(c.def.id) || 0) > 1);
  const pool = dupes.length > 0 ? dupes : hand;
  return [...pool].sort((a, b) => (b.def.threshold ?? 3) - (a.def.threshold ?? 3))[0];
}

/**
 * First half of End Phase: Pitch unplaced dice for Mend 1, then Tribute if 2+
 * were pitched. Split out from the discard step so callers that need to
 * *know the final hand size before offering a discard choice* (a Tribute
 * effect can draw a card) can resolve this first and only then decide
 * whether a discard picker is needed.
 */
export function resolveEndPhasePreDiscard(g: Game) {
  const p = g.players[g.active];
  // v4.0 Pitch: any die still unplaced may be pitched for Mend 1 to your Leader.
  // Pitch itself is always available (§3.4) regardless of Leader HP — a die
  // pitched at full HP still counts as Pitched for Tribute (§10), it just has
  // nothing to heal, which is what makes it "wasted".
  let pitchedThisTurn = 0;
  for (const d of p.dice) {
    if (d.placed) continue;
    pitchedThisTurn++;
    g.stats.dicePitched++;
    if (p.leader.damage > 0) {
      p.leader.damage = Math.max(0, p.leader.damage - 1);
    } else {
      g.stats.diceWasted++;
    }
  }
  // v4.2 Tribute: Location bonus if you Pitched 2+ dice this turn.
  if (p.location?.def.tribute && pitchedThisTurn >= 2) {
    applyEffect(
      g,
      p.id,
      p.location.def.tribute,
      autoTarget(g, p.id, p.location.def.tribute),
      p.location,
    );
    decide(g, p.id, 'tributeTriggered');
  }
}

/** v4.3 End Phase hand cap (was 6) — raised alongside the 7-card starting
 * hand so a keep-everything opening doesn't force a discard on turn 1. */
export const HAND_LIMIT = 8;

/** Second half of End Phase: discard down to HAND_LIMIT, then reset/pass the turn. */
export function finishEndPhase(g: Game, discardChooser?: (hand: Inst[]) => Inst) {
  const p = g.players[g.active];
  // Discard down to the hand cap (v4.3: 8, was 6).
  while (p.hand.length > HAND_LIMIT) {
    const pick = discardChooser ? discardChooser(p.hand) : defaultDiscardChoice(p.hand);
    const idx = p.hand.indexOf(pick);
    const c = p.hand.splice(idx >= 0 ? idx : p.hand.length - 1, 1)[0];
    discardCard(g, p, c);
    g.log.push(`${p.id} discarded ${c.def.name} (hand size).`);
  }
  // Exhaustion clears at start of next own turn; Ward and Steel both refresh
  // each turn for everyone (leader is never a Unit, so steelUsed is a no-op
  // there, but resetting it unconditionally keeps this loop uniform).
  for (const pl of Object.values(g.players)) {
    for (const u of [...pl.board, pl.leader]) {
      u.wardUsed = false;
      u.steelUsed = 0;
    }
  }
  p.dice = [];
  g.active = opponentOf(g, p.id).id;
  g.turnStarted = false;
  // Leave the Combat window closed between turns — the next player's
  // startTurn() always resets to PRE_REROLL anyway, but this closes the
  // brief gap (active already flipped, startTurn not yet called) during
  // which a stale COMBAT stage would otherwise still let attack() through.
  g.stage = 'PLACEMENT';
}

export function endTurn(g: Game, discardChooser?: (hand: Inst[]) => Inst) {
  resolveEndPhasePreDiscard(g);
  finishEndPhase(g, discardChooser);
}
