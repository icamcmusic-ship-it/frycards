/**
 * v4.0 card pool, remapped from the real backend card data.
 *
 * We keep each card's CORE IDENTITY untouched — name, image URL, flavor text,
 * rarity, type, elements — and delete the obsolete resource-era mechanical
 * data (colored costs, attach bonuses, legacy keywords like Overclock/Modularity/
 * Siphon/Phalanx). Every card is then reassigned v4.0 mechanics (Cast Slot
 * threshold, ATK/HP, v4 keywords, effects) deterministically from its type,
 * rarity and elements, so the whole 193-card set becomes playable under the
 * dice-placement rules with a wide spread of keywords and archetypes.
 *
 * The obsolete `Item` type has no home in v4.0 (decks are Locations, Units,
 * Charms, Events) — Items are folded into Charms (one-shot buffs/utility) so
 * their art and names survive, rather than being deleted outright.
 */
import { CardDef, ComboPattern, Effect, EffectTarget, LEADER_HP } from './cards';
import { GENERATED_CARDS } from '../generated-cards';

interface RawCard {
  id: string;
  name: string;
  type: string;
  elements?: string[];
  rarity?: string;
  set?: string;
  image?: string;
  text?: string;
}

// Deterministic small hash so mechanical assignment is stable per card id.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}
const pick = <T>(id: string, salt: number, arr: T[]): T => arr[(hash(id) + salt) % arr.length];

const RARITY_TIER: Record<string, number> = {
  Common: 0, Uncommon: 1, Rare: 2, 'Super-Rare': 3, Legendary: 4, Mythic: 5,
};

// Element -> the v4 keyword flavor it leans into.
const ELEMENT_KEYWORD: Record<string, string> = {
  Frost: 'Ward',
  Order: 'Guard',
  Light: 'Guard',
  Flame: 'Frenzy',
  Chaos: 'Swift',
  Dark: 'Echo',
  Nature: 'Twin',
  Tech: 'Anchor',
};

function primaryElement(c: RawCard): string {
  return c.elements?.[0] || 'Generic';
}

// ---------------------------------------------------------------------------
// Unit mapping
// ---------------------------------------------------------------------------
function mapUnit(c: RawCard): CardDef {
  const tier = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const el = primaryElement(c);
  const el2 = c.elements?.[1];
  // Threshold scales gently with rarity (bombs cost more to land).
  const threshold = Math.min(6, 1 + Math.min(4, tier) + (hash(c.id) % 2 === 0 ? 1 : 0));
  // Stat budget scales with threshold; split by a hashed bias.
  const budget = 2 + threshold * 2 + (tier >= 4 ? 2 : 0);
  const bias = (hash(c.id) >> 3) % 3; // 0 aggro, 1 balanced, 2 defensive
  let atk = bias === 0 ? Math.ceil(budget * 0.62) : bias === 2 ? Math.floor(budget * 0.35) : Math.round(budget * 0.5);
  let hp = Math.max(1, budget - atk);
  atk = Math.max(1, atk);

  const keywords: string[] = [];
  let primaryKw = ELEMENT_KEYWORD[el];
  // v4.0 balance: Swift (haste) on cheap bodies was the dominant aggro engine.
  // On a threshold <= 2 Unit it becomes Guard instead (a cheap early wall),
  // so Swift only shows up where paying for a real tempo body is a choice.
  if (primaryKw === 'Swift' && threshold <= 2) primaryKw = 'Guard';
  // Guard/Ward want more HP; Frenzy/Pierce want more ATK — nudge the split.
  // v4.0 balance: Guard bodies were too soft to wall aggro, so they get a
  // bigger HP bump; Frenzy's ATK bump is trimmed now that its downside is
  // softer (only the 2nd swing doubles retaliation).
  if (primaryKw === 'Guard') { hp += 3; }
  if (primaryKw === 'Ward') { hp += 2; }
  if (primaryKw === 'Frenzy' && hash(c.id) % 2 === 0) { atk += 1; }
  if (primaryKw) keywords.push(primaryKw);

  // Secondary element / higher rarity grants a second keyword sometimes.
  if (tier >= 2 && el2 && ELEMENT_KEYWORD[el2] && ELEMENT_KEYWORD[el2] !== primaryKw) {
    keywords.push(ELEMENT_KEYWORD[el2]);
  }
  if (tier >= 3 && !keywords.includes('Pierce') && (hash(c.id) % 3 === 0)) keywords.push('Pierce');

  const def: CardDef = {
    id: c.id, name: c.name, type: 'Unit', threshold, atk, hp,
    keywords: keywords.length ? keywords : undefined,
    elements: c.elements as any, rarity: c.rarity as any, set: c.set, image: c.image, flavor: c.text,
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
    def.combo = { pattern: pat, effect: pick(c.id, 4, [
      { action: 'buff', value: 1, target: 'self' } as Effect,
      { action: 'sap', value: 2, target: 'anyTarget' } as Effect,
      { action: 'mend', value: 2, target: 'friendlyLeader' } as Effect,
    ]) };
  }

  // Overflow reward on a slice, off the effective threshold.
  if (hash(c.id) % 6 === 0) {
    def.overflow = { amount: 2, effect: { action: 'buff', value: 1, target: 'self' } };
  }
  return def;
}

// ---------------------------------------------------------------------------
// Charm / Event / Item mapping (one-shots)
// ---------------------------------------------------------------------------
const SAP_TARGETS: EffectTarget[] = ['anyTarget', 'enemyUnit', 'enemyLeader'];

function mapSpell(c: RawCard, asCharm: boolean): CardDef {
  const tier = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const el = primaryElement(c);
  const type = asCharm ? 'Charm' : 'Event';
  const base: CardDef = {
    id: c.id, name: c.name, type,
    elements: c.elements as any, rarity: c.rarity as any, set: c.set, image: c.image, flavor: c.text,
  };

  // Combo-gated Events at higher rarity (the trophy slot); respect real odds:
  // reserve Yahtzee/FourKind for Mythic/Legendary only, and make them Echo-able.
  if (!asCharm && tier >= 2 && hash(c.id) % 3 === 0) {
    const gate: ComboPattern =
      tier >= 5 ? 'Yahtzee' :
      tier >= 4 ? (hash(c.id) % 2 ? 'FourKind' : 'LargeStraight') :
      tier >= 3 ? (hash(c.id) % 2 ? 'FullHouse' : 'SmallStraight') :
      (hash(c.id) % 2 ? 'ThreeKind' : 'TwoPair');
    base.comboGate = gate;
    if (tier >= 4) base.keywords = ['Echo']; // bricked bombs aren't pure loss
    base.onCast = gate === 'Yahtzee'
      ? { action: 'sap', value: 12, target: 'enemyLeader' }
      : gate === 'FourKind'
        ? { action: 'destroy', target: 'allEnemyUnits' }
        : gate === 'LargeStraight'
          ? { action: 'sap', value: 8, target: 'enemyLeader' }
          : gate === 'FullHouse'
            ? { action: 'buff', value: 2, target: 'allFriendlyUnits' }
            : { action: 'sap', value: 5, target: 'anyTarget' };
    base.flavor = c.text;
    return base;
  }

  // Numeric-threshold one-shots. Charms are cheaper/weaker; Events pricier/stronger.
  const threshold = asCharm
    ? Math.min(4, 1 + Math.min(2, tier))
    : Math.min(6, 3 + Math.min(3, tier));
  base.threshold = threshold;

  const kind = hash(c.id) % 5;
  const power = (asCharm ? 2 : 3) + tier;
  if (el === 'Light' || el === 'Nature' || kind === 0) {
    base.onCast = { action: 'mend', value: power, target: 'friendlyAny' };
  } else if (el === 'Frost' || el === 'Dark' || kind === 1) {
    base.onCast = { action: 'bind', target: 'enemyUnit' };
    if (asCharm) base.threshold = Math.min(4, threshold + 1);
  } else if ((el === 'Order') && !asCharm) {
    base.onCast = { action: 'destroy', target: 'enemyUnit' };
    base.threshold = 6;
  } else if (kind === 2 && !asCharm) {
    base.onCast = { action: 'draw', value: 1 + Math.floor(tier / 2), target: 'none' };
  } else {
    base.onCast = { action: 'sap', value: power, target: pick(c.id, 5, SAP_TARGETS) };
  }

  // Overflow riders on some spells.
  if (hash(c.id) % 4 === 0) {
    base.overflow = { amount: 1, effect: { action: 'sap', value: 2, target: 'enemyLeader' } };
  }
  // Echo on some Dark/Chaos utility so recursion exists outside bombs.
  if ((el === 'Dark' || el === 'Chaos') && hash(c.id) % 3 === 1 && !base.keywords) {
    base.keywords = ['Echo'];
  }
  // Scrap on cheap Tech/Flame charms (dice smoothing).
  if (asCharm && (el === 'Tech' || el === 'Flame') && hash(c.id) % 2 === 0) {
    base.keywords = [...(base.keywords || []), 'Scrap'];
  }
  return base;
}

// ---------------------------------------------------------------------------
// Location mapping
// ---------------------------------------------------------------------------
function mapLocation(c: RawCard): CardDef {
  const tier = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const threshold = Math.min(5, 2 + Math.min(2, tier));
  const def: CardDef = {
    id: c.id, name: c.name, type: 'Location', threshold,
    elements: c.elements as any, rarity: c.rarity as any, set: c.set, image: c.image, flavor: c.text,
  };
  // v4.0 guidance F: Locations must earn a full die. Every Location gets a
  // passive AND (at higher rarity) its own Ability Slot, so the casting die
  // isn't the only value it ever returns.
  const el = primaryElement(c);
  def.locPassive = el === 'Flame' || el === 'Chaos' || el === 'Dark' ? 'ATK_ALL' : 'HP_ALL';
  if (tier >= 1) {
    def.ability = pick(c.id, 6, [
      { threshold: 3, effect: { action: 'draw', value: 1, target: 'none' } },
      { threshold: 4, effect: { action: 'sap', value: 2, target: 'anyTarget' } },
      { threshold: 3, effect: { action: 'mend', value: 2, target: 'friendlyAny' } },
      { threshold: 4, effect: { action: 'buff', value: 1, target: 'friendlyUnit' } },
    ]);
  }
  return def;
}

// ---------------------------------------------------------------------------
// Leader mapping (6 real leaders, 28 HP, one Ability Slot, no ATK)
// ---------------------------------------------------------------------------
const LEADER_ABILITIES: Record<string, CardDef['ability']> = {
  avatar_of_the_abyss: { threshold: 5, effect: { action: 'sap', value: 3, target: 'anyTarget' } },
  ethereal_sea_witch: { threshold: 4, effect: { action: 'bind', target: 'enemyUnit' } },
  // v4.0 balance: Mer King and Apex were the two weakest leaders (~24%); make
  // their abilities cheaper / more impactful so a defensive/tempo plan can keep up.
  mer_king: { threshold: 4, effect: { action: 'mend', value: 4, target: 'friendlyAny' } },
  legendary_diver: { threshold: 5, effect: { action: 'draw', value: 1, target: 'none' } },
  crimson_vector_commander: { threshold: 5, effect: { action: 'sap', value: 3, target: 'enemyLeader' } },
  apex_nanite_shinobi: { threshold: 4, effect: { action: 'buff', value: 2, target: 'friendlyUnit' } },
};

function mapLeader(c: RawCard): CardDef {
  return {
    id: c.id, name: c.name, type: 'Leader', hp: LEADER_HP,
    ability: LEADER_ABILITIES[c.id] ||
      { threshold: 5, effect: { action: 'sap', value: 2, target: 'anyTarget' } },
    elements: c.elements as any, rarity: c.rarity as any, set: c.set, image: c.image, flavor: c.text,
  };
}

// ---------------------------------------------------------------------------
// Build the pool
// ---------------------------------------------------------------------------
export const POOL_V4: CardDef[] = (GENERATED_CARDS as RawCard[]).map((c) => {
  switch (c.type) {
    case 'Leader': return mapLeader(c);
    case 'Unit': return mapUnit(c);
    case 'Location': return mapLocation(c);
    case 'Charm': return mapSpell(c, true);
    case 'Event': return mapSpell(c, false);
    case 'Item': return mapSpell(c, true); // obsolete type folded into Charms
    default: return mapUnit(c);
  }
});

export const POOL_BY_ID: Record<string, CardDef> = Object.fromEntries(
  POOL_V4.map((c) => [c.id, c]),
);
export const POOL_LEADERS = POOL_V4.filter((c) => c.type === 'Leader');
export function poolByType(t: string): CardDef[] {
  return POOL_V4.filter((c) => c.type === t);
}
export function poolByElement(el: string): CardDef[] {
  return POOL_V4.filter((c) => c.elements?.includes(el as any));
}
export function poolHasKeyword(kw: string): CardDef[] {
  return POOL_V4.filter((c) => c.keywords?.includes(kw));
}
