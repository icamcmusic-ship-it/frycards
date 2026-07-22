/**
 * v4.19 KEYWORD TIER SYSTEM — the single source of truth for what every
 * keyword does at every tier, and what that tier costs.
 *
 * Design contract (see docs/KEYWORD_TIERS.md):
 * - Every keyword has numbered tiers I..maxTier (max V). A given
 *   keyword+tier ALWAYS means the same ability and the same cost
 *   contribution on every card that carries it.
 * - Passive/static tiers contribute a `costWeight` that feeds the card's
 *   casting-cost recalculation in cardpool.ts. Activated tiers bundle their
 *   activation cost into the tier's rules text (`activation`).
 * - A card carrying the HIGHEST tier of a keyword whose ladder is 3+ tiers
 *   deep gets the tier-cap premium: its top tier is a strictly better
 *   variant (the ladder's cap rider) AND the cost recalculation grants an
 *   explicit discount (see cardpool.ts's keywordCostTier / the
 *   TOP_TIER_DISCOUNT rule below).
 *
 * The engine reads all runtime magnitudes FROM this table via
 * `keywordTier()` / `tierMagnitude()` — per-card ad-hoc `x` fields
 * (def.bulwark.x etc.) are kept populated by cardpool.ts purely as a
 * compatibility mirror for the AI/UI, always derived from the tier.
 */
import { CardDef } from './cards';

/** Local copy of engine.ts's rarityTier low-bucket test (kept here to avoid
 * an engine <-> keywords import cycle). */
function isLowRarity(r?: string): boolean {
  return !(
    r === 'Rare' ||
    r === 'Super-Rare' ||
    r === 'Ultra-Rare' ||
    r === 'Mythic' ||
    r === 'Full-Art'
  );
}

export const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;
/** Roman-numeral formatting for a tier number (1-5). */
export function roman(tier: number): string {
  return ROMAN[Math.min(5, Math.max(1, Math.round(tier))) - 1];
}

export interface KeywordTierDef {
  /** Tier-specific rules text (includes the bundled activation cost for
   * activated keywords). */
  description: string;
  /** The tier's numeric parameter, when the keyword has one (Bulwark X,
   * Steel X, Ward spike, Pierce cap divisor, ...). */
  magnitude?: number;
  /** Casting-cost contribution of this tier (passive/static value). Feeds
   * cardpool.ts's cost recalculation. Leader-only keywords weigh 0 —
   * Leaders never pay a Cast Slot cost. */
  costWeight: number;
  /** Bundled activation cost, for activated (non-passive) keywords. */
  activation?: string;
}

interface KeywordDef {
  /** True for activated keywords (the tier bundles an activation cost)
   * rather than passive/static ones. */
  activated?: boolean;
  tiers: KeywordTierDef[]; // index 0 = tier I
}

const KW = (tiers: KeywordTierDef[], activated = false): KeywordDef => ({ tiers, activated });
const T = (
  description: string,
  costWeight: number,
  magnitude?: number,
  activation?: string,
): KeywordTierDef => ({ description, costWeight, magnitude, activation });

/**
 * The central keyword × tier table. Magnitude semantics per keyword:
 * - Bulwark/Steel/Toll/Resolve/Excavate/Crescendo: the keyword's X.
 * - Ward: damage spiked back at a blocked combat attacker.
 * - Guard: bonus max HP printed into the body at pool build.
 * - Swift/Frenzy: bonus ATK printed into the body at pool build.
 * - Pierce: overflow cap divisor (overflow ≤ floor(ATK/magnitude); 0 = uncapped).
 * - Anchor: the per-card discount cap.
 * - Overrun: flat bonus on top of the floor(ATK/2) punch-through.
 * - Avenge: lifetime +1/+1 cap.
 * - Twin: scale of the printed Twin bonus rider.
 * - Rally: bonus added to the borrowed die's value.
 * - Scrap: number of d6 rolled, keeping the highest.
 * - Tribute: minimum dice Pitched to trigger.
 * - Foothold: first-Unit cast discount.
 * - Aftershock: 1 = half-value repeat, 2 = full-value repeat.
 */
export const KEYWORD_TIERS: Record<string, KeywordDef> = {
  Guard: KW([
    T('Enemies must attack your Guard Units first.', 0.5, 0),
    T('Enemies must attack your Guard Units first. This body is printed with +2 max HP.', 1, 2),
    T('Enemies must attack your Guard Units first. This body is printed with +4 max HP.', 1.5, 4),
  ]),
  Swift: KW([
    T("May attack or use its Ability Slot the turn it's cast.", 0.5, 0),
    T("May attack or use its Ability Slot the turn it's cast. Printed with +1 ATK.", 1, 1),
  ]),
  // v4.25 tried raising these weights 1/1.5/2 -> 1.5/2/2.5, mirroring the
  // v4.19.1 fix that took Avenge from a similarly-shaped +15.0pt delta down
  // to today's +5.6pt. A full-scale verification run showed ZERO movement
  // (delta identical before/after, +10.0pt both runs) — investigated and
  // reverted; see the pool-shape note below for why, and
  // BALANCE_SIM_FINDINGS_v4.25.md for the full writeup. Left at the
  // original weights rather than ship a no-op change.
  //
  // Why the lever doesn't work here (unlike Avenge): keywordCostTier()
  // clamps the computed cost tier to [0,5] (cardpool.ts). Pierce's 8-card
  // pool is disproportionately Super-Rare+/Full-Art multi-keyword bodies
  // (Frenzy+Pierce+Overrun, Guard+Pierce, Twin+Pierce+Rally, …) whose
  // combined keyword weight already pins them at the tier-5 ceiling before
  // any Pierce-specific change — raising Pierce's own weight has nothing
  // left to push against. Avenge's pool skewed toward lower-rarity/fewer-
  // keyword cards with real tier headroom, which is why the identical lever
  // worked there. A real Pierce fix needs either a lever that isn't clamped
  // (e.g. trimming the overflow-damage magnitude itself) or targeting the
  // specific low-rarity Pierce outliers directly rather than the keyword's
  // shared cost weight — carried forward as a design-tension watch item.
  Pierce: KW([
    T(
      'Leftover damage past a destroyed blocker carries to the enemy Leader, capped at a third of ATK (min 1).',
      1,
      3,
    ),
    T(
      'Leftover damage past a destroyed blocker carries to the enemy Leader, capped at half ATK (min 1).',
      1.5,
      2,
    ),
    T('ALL leftover damage past a destroyed blocker carries to the enemy Leader, uncapped.', 2, 0),
  ]),
  Ward: KW([
    T(
      'Prevents the first damage/Removal against this card each turn; a blocked combat hit spikes 1 back at the attacker.',
      1,
      1,
    ),
    T(
      'Prevents the first damage/Removal against this card each turn; a blocked combat hit spikes 2 back at the attacker.',
      1.5,
      2,
    ),
  ]),
  Frenzy: KW([
    T('May attack twice; the second swing takes doubled retaliation and avoids the enemy Leader.', 0.5, 0),
    T('Frenzy I, and this body is printed with +2 ATK.', 1, 2),
    T('Attacks twice with NO doubled retaliation on the second swing. Printed with +2 ATK.', 1.5, 2),
  ]),
  Anchor: KW([
    T('Cast cost -1 per other friendly Anchor card in play, max -2.', 0.5, 2),
    T('Cast cost -1 per other friendly Anchor card in play, max -3. +2/+2 the first time it enters at full ramp.', 1, 3),
    T('Anchor II, but the one-time full-ramp bonus is +3/+3.', 1.5, 3),
  ]),
  Echo: KW(
    [
      T('Recast once from Discard: pay its cost and discard one extra card from hand.', 0.5, 1, 'its cast cost + discard 1 card'),
      // v4.19.1: costWeight 1 -> 0.5. Echo measured a near-zero +0.4pt delta
      // across 163k casts with a 42.2% deck baseline (the weakest keyword
      // family) — the fodder-free tier II was priced like a premium it
      // doesn't deliver. Now weighs the same as tier I.
      T('Recast once from Discard by paying only its cast cost — no extra discard.', 0.5, 2, 'its cast cost'),
    ],
    true,
  ),
  Scrap: KW(
    [
      T('Discard from hand: reroll one unplaced die, rolling 2d6 and keeping the higher.', 0.5, 2, 'discard this card'),
      T('Discard from hand: reroll one unplaced die, rolling 3d6 and keeping the highest.', 1, 3, 'discard this card'),
    ],
    true,
  ),
  Rally: KW(
    [
      T("Once per turn, activate this card's Ability Slot with a die already resting on another exhausted friendly Ability Slot.", 0.5, 0, 'a die on an exhausted friendly Ability Slot'),
      T('Rally I, and the borrowed die counts as +1 higher for the threshold.', 1, 1, 'a die on an exhausted friendly Ability Slot'),
    ],
    true,
  ),
  Twin: KW([
    T('Two Cast Slots needing an identical rolled face. Completing it grants a small bonus rider.', 1, 1),
    T('Two Cast Slots needing an identical rolled face. Completing it grants a medium bonus rider.', 1.5, 2),
    T('Two Cast Slots needing an identical rolled face. Completing it grants a large bonus rider.', 2, 3),
  ]),
  Bulwark: KW([
    T('Attacks against this Unit (and its retaliation taken) deal 1 less damage.', 0.5, 1),
    T('Attacks against this Unit (and its retaliation taken) deal 2 less damage.', 1, 2),
    T('Attacks against this Unit (and its retaliation taken) deal 3 less damage.', 1.5, 3),
  ]),
  // v4.19.1: costWeight 1/1.5/2 -> 0.5/1/1.5. Toll measured only +2.8pt
  // delta at the roster's steepest non-Steel pricing, and both Toll-identity
  // archetypes (Crimson Toll-Bulwark Fortress, Mer King Toll-Echo Control)
  // sat in the roster's bottom half — a uniform one-step cheapening.
  Toll: KW([
    T('All incoming damage to your Leader is reduced by 1 while this Unit lives.', 0.5, 1),
    T('All incoming damage to your Leader is reduced by 2 while this Unit lives.', 1, 2),
    T('All incoming damage to your Leader is reduced by 3 while this Unit lives.', 1.5, 3),
  ]),
  // v4.19.1: costWeight 1.5/2/2.5 -> 2.5/3/3.5. Steel measured +17.7pt
  // cast-win delta in the first tier-system run — the #1 keyword offender
  // again despite three prior power/print trims (its per-fire magnitude is
  // already at the floor). The cost recalculation rounds sum(w)/2, so a
  // +0.5 step is a no-op for most cards; +1 reliably prices multi-keyword
  // Steel bodies one full cost tier up while leaving solo Steel I intact.
  // v4.20: BALANCE_SIM_FINDINGS_v4.20.md item 5 asked for a direct per-tier
  // magnitude cut on Steel (cost-side nudges have measured flat at +18.0pt
  // for two passes running). Deliberately NOT done this pass: tier I is
  // already floored at magnitude 1 (v4.16/v4.18), and the tier ladder's own
  // design contract (see this file's header) requires each tier to be a
  // "strictly better variant" than the last — with only 3 integer tiers
  // there's no room left to compress II/III without either breaking that
  // ordering or dropping a tier entirely (a bigger structural change than a
  // single-pass patch). If Steel still needs to come down, the next real
  // lever is reducing keyword PRINT RATE (as v4.18 did, 1-in-9 -> 1-in-12)
  // rather than another magnitude/cost step on an already-floored ladder.
  Steel: KW([
    T('The first 1 damage this Unit would take each turn, from any source, is prevented.', 2.5, 1),
    T('The first 2 damage this Unit would take each turn, from any source, is prevented.', 3, 2),
    T('The first 3 damage this Unit would take each turn, from any source, is prevented.', 3.5, 3),
  ]),
  // v4.19.1: costWeight 1/1.5 -> 2/2.5. Avenge measured +15.0pt delta
  // (second-worst keyword this run) — same +1 pricing step as Steel above.
  //
  // v4.20: the same item-5 magnitude-cut ask does NOT apply to Avenge the
  // way it does to Steel — the tier `magnitude` values below (2/3) are
  // COSMETIC ONLY for this keyword. The actual in-game cap is
  // SIM_TUNING.avengeCap (engine.ts), which every Avenge card obeys
  // regardless of which tier it's printed at; only costWeight and this cap
  // have any real effect on this keyword.
  // v4.21: applied the cap cut — SIM_TUNING.avengeCap 2 -> 1 (see
  // cleanupDeaths in engine.ts). Left the tier magnitude numbers below
  // as-is; they remain cosmetic until tier magnitude is wired to a real
  // per-card cap.
  Avenge: KW([
    T('Permanently +1/+1 whenever another friendly Unit dies, up to +2/+2 lifetime.', 2, 2),
    T('Permanently +1/+1 whenever another friendly Unit dies, up to +3/+3 lifetime.', 2.5, 3),
  ]),
  Overrun: KW([
    T('If its combat damage is fully prevented, punches floor(ATK/2) (min 1) through anyway.', 0.5, 0),
    T('If its combat damage is fully prevented, punches floor(ATK/2)+1 through anyway.', 1, 1),
  ]),
  Crescendo: KW([
    T('+4 to this Event\'s numeric effect if any of your dice shows 5-6 this turn.', 0.5, 4),
    T('+5 to this Event\'s numeric effect if any of your dice shows 5-6 this turn.', 1, 5),
    T('+6 to this Event\'s numeric effect if any of your dice shows 5-6 this turn.', 1.5, 6),
    T('+7 to this Event\'s numeric effect if any of your dice shows 5-6 this turn.', 2, 7),
    T('+8 to this Event\'s numeric effect if any of your dice shows 5-6 this turn.', 2.5, 8),
  ]),
  Aftershock: KW([
    T('At the start of your next turn, repeats this effect at half value.', 1, 1),
    T('At the start of your next turn, repeats this effect at FULL value.', 1.5, 2),
  ]),
  Snap: KW([T('May be cast during your Reroll Phase, before the reroll window closes.', 0.5, 0)]),
  Tribute: KW([
    T('Triggers at your End Phase if you Pitched 2+ dice this turn.', 0.5, 2),
    T('Triggers at your End Phase if you Pitched ANY die this turn.', 1, 1),
  ]),
  Excavate: KW([
    T("This Location's Ability threshold drops 1 per full turn in play (min 1).", 0.5, 1),
    T("This Location's Ability threshold drops 2 per full turn in play (min 1).", 1, 2),
    T("This Location's Ability threshold drops 3 per full turn in play (min 1).", 1.5, 3),
  ]),
  Contested: KW([
    T("This Location's passive doubles while your opponent controls no Location.", 0.5, 0),
  ]),
  Foothold: KW([
    T('Your first Unit cast each turn costs 1 less.', 0.5, 1),
    T('Your first Unit cast each turn costs 2 less.', 1, 2),
  ]),
  // Leader-only keywords: Leaders never pay a Cast Slot cost — weight 0.
  Resolve: KW([
    T('While your Leader is at/below half HP, its Ability threshold drops by 1.', 0, 1),
    T('While your Leader is at/below half HP, its Ability threshold drops by 2.', 0, 2),
  ]),
  Ultimate: KW([
    T('A second, once-per-game Leader Ability Slot, unlocked on a printed turn.', 0, 0),
  ]),
};

/** Highest tier defined for a keyword (1..5). Unknown keywords report 1. */
export function maxTier(kw: string): number {
  return KEYWORD_TIERS[kw]?.tiers.length ?? 1;
}

/** Tier-specific rules text (includes the bundled activation cost, when the
 * keyword is activated). Clamps to the keyword's real ladder. */
export function tierDescription(kw: string, tier: number): string {
  const def = KEYWORD_TIERS[kw];
  if (!def) return kw;
  const t = def.tiers[Math.min(def.tiers.length, Math.max(1, tier)) - 1];
  return t.activation ? `${t.description} (Cost: ${t.activation}.)` : t.description;
}

/** The tier's numeric parameter (see the semantics table above). */
export function tierMagnitude(kw: string, tier: number): number {
  const def = KEYWORD_TIERS[kw];
  if (!def) return 0;
  return def.tiers[Math.min(def.tiers.length, Math.max(1, tier)) - 1].magnitude ?? 0;
}

/** The tier's casting-cost contribution. */
export function tierCostWeight(kw: string, tier: number): number {
  const def = KEYWORD_TIERS[kw];
  if (!def) return 0;
  return def.tiers[Math.min(def.tiers.length, Math.max(1, tier)) - 1].costWeight;
}

/**
 * The tier a card carries for a keyword. Pool cards store explicit tiers
 * (`def.keywordTiers`, assigned deterministically in cardpool.ts); legacy /
 * hand-built defs (the curated CARDS_V3 set, engine tests) fall back to a
 * per-keyword default that reproduces the exact pre-tier behavior:
 * numeric-field keywords read their old `x`, Pierce defaults to the old
 * half-ATK cap (tier II), Echo to the old rarity-based fodder waiver, and
 * everything else to tier I.
 */
export function keywordTier(def: CardDef, kw: string): number {
  const explicit = def.keywordTiers?.[kw];
  if (explicit !== undefined) return Math.min(maxTier(kw), Math.max(1, explicit));
  const clamp = (n: number) => Math.min(maxTier(kw), Math.max(1, n));
  switch (kw) {
    case 'Bulwark':
      return clamp(def.bulwark?.x ?? 1);
    case 'Toll':
      return clamp(def.toll?.x ?? 1);
    case 'Steel':
      return clamp(def.steel?.x ?? 1);
    case 'Resolve':
      return clamp(def.resolve?.x ?? 1);
    case 'Excavate':
      return clamp(def.excavate?.x ?? 2);
    case 'Crescendo':
      return clamp((def.crescendo?.x ?? 4) - 3);
    case 'Pierce':
      return 2; // legacy behavior: half-ATK overflow cap
    case 'Anchor':
      return 2; // legacy behavior: cap 3, +2/+2 full-ramp bonus
    case 'Echo':
      return isLowRarity(def.rarity) ? 1 : 2; // legacy fodder waiver
    default:
      return 1;
  }
}

/** Convenience: the runtime magnitude of `kw` on this card (0 if absent). */
export function kwMag(def: CardDef, kw: string): number {
  if (!def.keywords?.includes(kw)) return 0;
  return tierMagnitude(kw, keywordTier(def, kw));
}

export interface CardKeyword {
  kw: string;
  tier: number;
  /** Roman-numeral tier label ('' for single-tier keywords, e.g. plain "Snap"). */
  roman: string;
  /** Display label, e.g. "Bulwark II" or "Snap". */
  label: string;
  description: string;
  maxTier: number;
  /** True when this card carries the keyword's highest tier of a 3+-tier ladder. */
  atCap: boolean;
}

/** A card's keywords with tiers — the UI's chip list. */
export function cardKeywords(def: CardDef): CardKeyword[] {
  return (def.keywords || []).map((kw) => {
    const tier = keywordTier(def, kw);
    const mt = maxTier(kw);
    const r = mt > 1 ? roman(tier) : '';
    return {
      kw,
      tier,
      roman: r,
      label: r ? `${kw} ${r}` : kw,
      description: tierDescription(kw, tier),
      maxTier: mt,
      atCap: mt >= 3 && tier === mt,
    };
  });
}

/**
 * Tier-cap premium rule: a card carrying the HIGHEST tier of any keyword
 * whose ladder is 3+ tiers deep. Such a card both gets the ladder's cap
 * rider (a strictly better variant, defined in the table) AND an explicit
 * casting-cost discount in cardpool.ts's cost recalculation.
 */
export function hasTierCapPremium(def: CardDef): boolean {
  return cardKeywords(def).some((k) => k.atCap);
}

/** Summed costWeight of every keyword tier a card carries — the keyword term
 * of the casting-cost recalculation. */
export function cardKeywordWeight(def: CardDef): number {
  return cardKeywords(def).reduce((s, k) => s + tierCostWeight(k.kw, k.tier), 0);
}

// ---------------------------------------------------------------------------
// Structured mechanic labels — so the UI can render every non-keyword
// mechanic (onCast/ability/combo/overflow/twin bonus/aftershock/ultimate)
// as short chips instead of free-form rules text.
// ---------------------------------------------------------------------------
const TARGET_LABEL: Record<string, string> = {
  enemyUnit: 'an enemy Unit',
  friendlyUnit: 'a friendly Unit',
  anyTarget: 'any enemy',
  enemyLeader: 'the enemy Leader',
  friendlyLeader: 'your Leader',
  friendlyAny: 'a friendly card',
  allEnemyUnits: 'all enemy Units',
  allFriendlyUnits: 'all friendly Units',
  self: 'itself',
  none: '',
};

/** Short rules label for an Effect, e.g. "Sap 3 (any enemy)". */
export function effectLabel(eff: { action: string; value?: number; target: string }): string {
  const t = TARGET_LABEL[eff.target] ?? '';
  const suffix = t ? ` (${t})` : '';
  switch (eff.action) {
    case 'sap':
      return `Sap ${eff.value ?? 0}${suffix}`;
    case 'mend':
      return `Mend ${eff.value ?? 0}${suffix}`;
    case 'draw':
      return `Surge${(eff.value ?? 1) > 1 ? ` ${eff.value}` : ''}`;
    case 'bind':
      return `Bind${suffix}`;
    case 'destroy':
      return `Destroy${suffix}`;
    case 'buff':
      return `+${eff.value ?? 0}/+${eff.value ?? 0}${suffix}`;
    default:
      return eff.action;
  }
}

export interface MechanicLabel {
  kind:
    | 'onCast'
    | 'ability'
    | 'combo'
    | 'overflow'
    | 'twinBonus'
    | 'aftershock'
    | 'tribute'
    | 'locPassive'
    | 'ultimate'
    | 'stagedPassive';
  label: string;
}

const PATTERN_LABEL: Record<string, string> = {
  AnyPair: 'Pairs',
  TwoPair: 'Two Pair',
  ThreeKind: '3 of a Kind',
  FourKind: '4 of a Kind',
  Yahtzee: '5 of a Kind',
  FullHouse: 'Full House',
  SmallStraight: 'Sm. Straight',
  LargeStraight: 'Lg. Straight',
  ThreeOdds: '3 Odds',
  ThreeEvens: '3 Evens',
};

/**
 * Every non-keyword mechanic on a card as short structured labels — with
 * `cardKeywords()`, this fully expresses a card's mechanics with no
 * free-form rules text.
 */
export function mechanicLabels(def: CardDef): MechanicLabel[] {
  const out: MechanicLabel[] = [];
  if (def.onCast) out.push({ kind: 'onCast', label: `On cast: ${effectLabel(def.onCast)}` });
  if (def.ability)
    out.push({
      kind: 'ability',
      label: `Ability ${def.ability.threshold}+: ${effectLabel(def.ability.effect)}`,
    });
  if (def.combo)
    out.push({
      kind: 'combo',
      label: `Combo ${PATTERN_LABEL[def.combo.pattern] ?? def.combo.pattern}: ${effectLabel(def.combo.effect)}`,
    });
  if (def.overflow)
    out.push({
      kind: 'overflow',
      label: `Overflow ${def.overflow.amount}: ${effectLabel(def.overflow.effect)}`,
    });
  if (def.twinBonus)
    out.push({ kind: 'twinBonus', label: `Twin bonus: ${effectLabel(def.twinBonus)}` });
  if (def.stagedPassive)
    out.push({ kind: 'stagedPassive', label: `While staged: ${effectLabel(def.stagedPassive)}` });
  if (def.aftershock)
    out.push({ kind: 'aftershock', label: `Aftershock: ${effectLabel(def.aftershock)}` });
  if (def.tribute) out.push({ kind: 'tribute', label: `Tribute: ${effectLabel(def.tribute)}` });
  if (def.locPassive)
    out.push({
      kind: 'locPassive',
      label: def.locPassive === 'ATK_ALL' ? 'Your Units get +2 ATK' : 'Your Units get +2 max HP',
    });
  if (def.ultimate)
    out.push({
      kind: 'ultimate',
      label: `Ultimate (turn ${def.ultimate.unlockTurn}+, die ${def.ultimate.threshold}+): ${effectLabel(def.ultimate.effect)}`,
    });
  return out;
}
