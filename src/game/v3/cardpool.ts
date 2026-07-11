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
  'Ultra-Rare': 4,
  'Full-Art': 4,
  Mythic: 5,
};

// The primary keyword wheel each Unit draws from (weights via repetition).
const UNIT_KEYWORDS = ['Ward', 'Guard', 'Guard', 'Frenzy', 'Swift', 'Echo', 'Twin', 'Anchor'];

// ---------------------------------------------------------------------------
// Unit mapping
// ---------------------------------------------------------------------------
function mapUnit(c: CardTemplate): CardDef {
  const tier = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  // Threshold scales gently with rarity (bombs cost more to land).
  const threshold = Math.min(6, 1 + Math.min(4, tier) + (hash(c.id) % 2 === 0 ? 1 : 0));
  // Stat budget scales with threshold; split by a hashed bias.
  const budget = 2 + threshold * 2 + (tier >= 4 ? 2 : 0);
  const bias = (hash(c.id) >> 3) % 3; // 0 aggro, 1 balanced, 2 defensive
  let atk =
    bias === 0
      ? Math.ceil(budget * 0.62)
      : bias === 2
        ? Math.floor(budget * 0.35)
        : Math.round(budget * 0.5);
  let hp = Math.max(1, budget - atk);
  atk = Math.max(1, atk);

  const keywords: string[] = [];
  let primaryKw = pick(c.id, 9, UNIT_KEYWORDS);
  // v4.0 balance: Swift (haste) on cheap bodies was the dominant aggro engine.
  // On a threshold <= 2 Unit it becomes Guard instead (a cheap early wall),
  // so Swift only shows up where paying for a real tempo body is a choice.
  if (primaryKw === 'Swift' && threshold <= 2) primaryKw = 'Guard';
  // Guard wants more HP to actually wall aggro; Frenzy wants a nudged ATK
  // now that its downside is softer (only the 2nd swing doubles retaliation).
  if (primaryKw === 'Guard') {
    hp += 3;
  }
  // Ward refreshing every End Phase already soaks ~one attack per round for
  // free — no stat bonus on top (Ward-stacked shells dominated with one).
  if (primaryKw === 'Frenzy' && hash(c.id) % 2 === 0) {
    atk += 1;
  }
  keywords.push(primaryKw);

  // Higher rarity grants a second keyword sometimes.
  if (tier >= 2 && hash(c.id) % 3 !== 0) {
    const secondary = pick(c.id, 13, UNIT_KEYWORDS);
    if (secondary !== primaryKw) keywords.push(secondary);
  }
  if (tier >= 3 && !keywords.includes('Pierce') && hash(c.id) % 3 === 0) keywords.push('Pierce');

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

  // Twin units carry a printed Twin bonus (required by §7).
  if (keywords.includes('Twin')) {
    def.twinBonus = pick(c.id, 1, [
      { action: 'sap', value: 2 + tier, target: 'enemyLeader' } as Effect,
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

  // Overflow reward on a slice, off the effective threshold.
  if (hash(c.id) % 6 === 0) {
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
  // v4.1: reactive-support answer — half of all Super-Rare+ Events are board
  // wipes (Sap X to all enemy Units), the removal density reactive shells need.
  if (!asCharm && tier >= 3 && hash(c.id) % 2 === 0) {
    base.onCast = { action: 'sap', value: 2 + tier, target: 'allEnemyUnits' };
    base.threshold = 6;
    return base;
  }
  if (!asCharm && tier >= 4) {
    // Would-be trophy bomb -> high numeric threshold + Combo bonus rider.
    base.threshold = 6;
    base.onCast = { action: 'sap', value: 6, target: 'anyTarget' };
    base.combo = {
      pattern: hash(c.id) % 2 ? 'FourKind' : 'LargeStraight',
      effect: { action: 'sap', value: 6, target: 'enemyLeader' },
    };
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

  // Numeric-threshold one-shots. Charms are cheaper/weaker; Events pricier/stronger.
  const threshold = asCharm
    ? Math.min(4, 1 + Math.min(2, tier))
    : Math.min(6, 3 + Math.min(3, tier));
  base.threshold = threshold;

  const kind = hash(c.id) % 5;
  const power = (asCharm ? 2 : 3) + tier;
  if (kind === 0) {
    base.onCast = { action: 'mend', value: power, target: 'friendlyAny' };
  } else if (kind === 1) {
    base.onCast = { action: 'bind', target: 'enemyUnit' };
    if (asCharm) base.threshold = Math.min(4, threshold + 1);
  } else if (kind === 2 && !asCharm) {
    if (hash(c.id) % 2 === 0) {
      base.onCast = { action: 'destroy', target: 'enemyUnit' };
      base.threshold = 6;
    } else {
      base.onCast = { action: 'draw', value: 1 + Math.floor(tier / 2), target: 'none' };
    }
  } else {
    base.onCast = { action: 'sap', value: power, target: pick(c.id, 5, SAP_TARGETS) };
  }

  // Overflow riders on some spells.
  if (hash(c.id) % 4 === 0) {
    base.overflow = { amount: 1, effect: { action: 'sap', value: 2, target: 'enemyLeader' } };
  }
  // Echo on a slice of utility so recursion exists outside bombs.
  if (hash(c.id) % 5 === 1 && !base.keywords) {
    base.keywords = ['Echo'];
  }
  // Scrap on a slice of cheap charms (dice smoothing).
  if (asCharm && base.threshold <= 2 && hash(c.id) % 3 === 0) {
    base.keywords = [...(base.keywords || []), 'Scrap'];
  }
  // v4.2 Crescendo X (Event only): the preferred pattern for "big roll payoff"
  // cards going forward — scales with a hot roll (dice of value 6 placed this
  // turn) without ever being a dead card, sidestepping the trophy-gate problem
  // structurally instead of needing rarity guidance to manage it.
  if (!asCharm && hash(c.id) % 5 === 3) {
    base.crescendo = { x: 1 + (tier >= 3 ? 1 : 0) };
    base.keywords = [...(base.keywords || []), 'Crescendo'];
  }
  // v4.2 Aftershock (Event only): a delayed half-value echo of the main
  // effect, resolving at the start of the caster's next turn before Draw.
  if (!asCharm && tier >= 2 && hash(c.id) % 6 === 4 && base.onCast) {
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
    def.keywords = ['Tribute'];
  } else if (def.ability && hash(c.id) % 5 === 1) {
    def.excavate = { x: 1 };
    def.keywords = ['Excavate'];
  } else if (tier >= 1 && hash(c.id) % 5 === 2) {
    def.contested = true;
    def.keywords = ['Contested'];
  }
  return def;
}

// ---------------------------------------------------------------------------
// Leader mapping (64 HP, one Ability Slot + one Ultimate, no ATK)
// ---------------------------------------------------------------------------
const LEADER_ABILITIES: Record<string, CardDef['ability']> = {
  avatar_of_the_abyss: { threshold: 5, effect: { action: 'sap', value: 3, target: 'anyTarget' } },
  // v4.1 balance: Bind's retaliation-stop buff + 64 HP long games made an
  // every-turn threshold-4 leader Bind a permanent board lock (96.6% archetype
  // win rate) — raised to 6 so it's a high roll, not a routine.
  ethereal_sea_witch: { threshold: 6, effect: { action: 'bind', target: 'enemyUnit' } },
  // v4.0 balance: Mer King and Apex were the two weakest leaders (~24%); make
  // their abilities cheaper / more impactful so a defensive/tempo plan can keep up.
  mer_king: { threshold: 4, effect: { action: 'mend', value: 4, target: 'friendlyAny' } },
  legendary_diver: { threshold: 5, effect: { action: 'draw', value: 1, target: 'none' } },
  crimson_vector_commander: {
    threshold: 5,
    effect: { action: 'sap', value: 3, target: 'enemyLeader' },
  },
  apex_nanite_shinobi: {
    threshold: 4,
    effect: { action: 'buff', value: 2, target: 'friendlyUnit' },
  },
};

// v4.2 Resolve X: while at/below half HP, Ability Slot threshold -X. Given to
// the leaders whose plan is reactive/defensive — a direct answer to the
// measured +19pt early-face-attack dominance, without touching combat math.
const LEADER_RESOLVE: Record<string, number> = {
  mer_king: 2,
  apex_nanite_shinobi: 2,
  ethereal_sea_witch: 1,
};

// v4.2 Ultimate(N): a second, once-per-game Ability Slot from the controller's
// Nth own turn on — the answer to "reactive leaders lack inevitability".
// Every Leader gets one; the unlock turn and power are tuned per archetype.
const LEADER_ULTIMATE: Record<string, CardDef['ultimate']> = {
  avatar_of_the_abyss: {
    unlockTurn: 5,
    threshold: 6,
    effect: { action: 'sap', value: 8, target: 'anyTarget' },
  },
  ethereal_sea_witch: {
    unlockTurn: 6,
    threshold: 6,
    effect: { action: 'bind', target: 'enemyUnit' },
  },
  mer_king: {
    unlockTurn: 4,
    threshold: 5,
    effect: { action: 'mend', value: 8, target: 'friendlyAny' },
  },
  legendary_diver: {
    unlockTurn: 5,
    threshold: 6,
    effect: { action: 'draw', value: 2, target: 'none' },
  },
  crimson_vector_commander: {
    unlockTurn: 5,
    threshold: 6,
    effect: { action: 'sap', value: 6, target: 'enemyLeader' },
  },
  apex_nanite_shinobi: {
    unlockTurn: 4,
    threshold: 5,
    effect: { action: 'buff', value: 3, target: 'allFriendlyUnits' },
  },
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
export function applyCardPool(templates: CardTemplate[]): boolean {
  const defs = templates.map(mapCard);
  if (!defs.some((d) => d.type === 'Leader')) return false;
  POOL_V4.length = 0;
  POOL_V4.push(...defs);
  for (const k of Object.keys(POOL_BY_ID)) delete POOL_BY_ID[k];
  for (const d of defs) POOL_BY_ID[d.id] = d;
  POOL_LEADERS.length = 0;
  POOL_LEADERS.push(...defs.filter((d) => d.type === 'Leader'));
  return true;
}

// Bundled fallback pool, active until/unless the live catalog loads.
applyCardPool(GENERATED_CARDS);

export function poolByType(t: string): CardDef[] {
  return POOL_V4.filter((c) => c.type === t);
}
export function poolHasKeyword(kw: string): CardDef[] {
  return POOL_V4.filter((c) => c.keywords?.includes(kw));
}
