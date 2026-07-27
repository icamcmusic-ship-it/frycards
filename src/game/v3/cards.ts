/**
 * Fry Cards v5.0 card data model. Essence-based costs, Might/Grit units,
 * Location/Charm/Event subtypes, Leaders with Resolve. Replaces the v4.x
 * dice-placement model (Cast Slots, thresholds, combos) entirely.
 *
 */
import type { EssenceType } from './colors';

export type { EssenceType };

export type CardType = 'Leader' | 'Unit' | 'Location' | 'Charm' | 'Event';

export type Rarity =
  'Common' | 'Uncommon' | 'Rare' | 'Super-Rare' | 'Ultra-Rare' | 'Full-Art' | 'Mythic';

/** Location subtypes: Wellsprings are basic (essence only, auto-supplied by
 * the engine, not collectible); Sanctums are collectible utility Locations. */
export type LocationSubtype = 'Wellspring' | 'Sanctum';
/** Charm subtypes: Bound dies with its unit; Worn survives and can re-bond. */
export type CharmSubtype = 'Bound' | 'Worn';
/** Event subtypes: Quick = any priority window; Slow = own main phase only. */
export type EventSubtype = 'Quick' | 'Slow';
export type CardSubtype = LocationSubtype | CharmSubtype | EventSubtype;

/** An Essence Cost: colored pips + a generic amount payable with anything. */
export interface EssenceCost {
  generic: number;
  pips: Partial<Record<EssenceType, number>>;
}

/** Total essence value (converted cost). */
export function totalCost(cost?: EssenceCost): number {
  if (!cost) return 0;
  return cost.generic + Object.values(cost.pips).reduce((a, b) => a + (b ?? 0), 0);
}

export type EffectAction =
  | 'damage' // deal damage to a unit or player
  | 'heal' // restore Vitality / remove marked damage
  | 'draw' // Deal cards
  | 'buff' // +value Might and +value Grit
  | 'shatter' // destroy → Ash-pile
  | 'banish' // remove → The Void
  | 'erode' // mill opponent
  | 'recover' // ready a friendly permanent
  | 'exhaust' // v6.9: tap an enemy unit — it can't attack or guard until it recovers
  | 'weaken'; // v6.9: permanently shrink a unit's Might and Grit

export type EffectTarget =
  | 'enemyUnit'
  | 'friendlyUnit'
  | 'anyTarget' // enemy unit or the enemy player
  | 'enemyPlayer'
  | 'friendlyPlayer'
  | 'friendlyAny' // friendly unit or yourself
  | 'allEnemyUnits'
  | 'allFriendlyUnits'
  | 'self'
  | 'none';

export interface Effect {
  action: EffectAction;
  value?: number;
  target: EffectTarget;
}

/** Triggered ability timing per rulebook §11. */
export type TriggerWhen = 'enters' | 'dies' | 'dealsClashDamage' | 'atDawn' | 'atDusk';

export interface TriggeredAbility {
  when: TriggerWhen;
  effect: Effect;
}

/** A Leader ability: costs Resolve to activate (negative delta spends,
 * positive builds), once per turn. */
export interface LeaderAbility {
  resolveDelta: number; // e.g. +1 or -2 applied to the Leader's Resolve
  effect: Effect;
  text?: string;
}

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  subtype?: CardSubtype;
  /** Core identity preserved from the backend card catalog. */
  rarity?: Rarity;
  set?: string;
  image?: string;
  flavor?: string;

  /** Essence Cost. Every invokable card has one (Leaders included). */
  cost?: EssenceCost;

  /** Unit stats. */
  might?: number;
  grit?: number;

  /** Keywords from the Fry Cards set — see keywords.ts KEYWORDS. */
  keywords?: string[];

  /** Effect on invoke (Events resolve this then go to the Ash-pile; Units
   * trigger it on entering the field). */
  onInvoke?: Effect;
  /** Triggered abilities ("When/Whenever/At ..."). */
  triggers?: TriggeredAbility[];

  // -- Location (Sanctum) --
  /** Essence Type this Location produces when exhausted. */
  produces?: EssenceType;
  /** Sanctum static passive for the controller's units. */
  locPassive?: 'MIGHT_ALL' | 'GRIT_ALL';

  // -- Charm --
  /** Stat/keyword grants while bonded to a unit. */
  bond?: { might?: number; grit?: number; grants?: string[] };
  /** Worn Charms: essence cost (generic) to re-bond to another unit. */
  rebondCost?: number;

  // -- Leader --
  /** Starting Resolve (loyalty). Shattered at 0. */
  resolve?: number;
  /** Activated abilities, one activation per turn, cost/build Resolve. */
  leaderAbilities?: LeaderAbility[];

  text?: string;
}

/** Starting Vitality per rulebook §3. (Name kept from v4.x for the many
 * screens that import it; it is now the PLAYER's life total, not a Leader
 * HP stat.) */
export const LEADER_HP = 20;
export const STARTING_VITALITY = LEADER_HP;

/** Hand size cap enforced at Dusk (Shed down to 7). */
export const MAX_HAND = 7;

export function hasKw(def: CardDef, kw: string): boolean {
  return !!def.keywords?.includes(kw);
}

const cost = (generic: number, pips: Partial<Record<EssenceType, number>> = {}): EssenceCost => ({
  generic,
  pips,
});

const U = (
  id: string,
  name: string,
  c: EssenceCost,
  might: number,
  grit: number,
  extra: Partial<CardDef> = {},
): CardDef => ({ id, name, type: 'Unit', cost: c, might, grit, ...extra });

/** Small curated starter set (offline/dev fallback; the real pool comes from
 * cardpool.ts over the full catalog). */
export const CARDS_V3: CardDef[] = [
  {
    id: 'leader_ember',
    name: 'Emberlord Kaz',
    type: 'Leader',
    cost: cost(1, { Ember: 2 }),
    resolve: 4,
    leaderAbilities: [
      {
        resolveDelta: -1,
        effect: { action: 'damage', value: 2, target: 'anyTarget' },
        text: '-1: 2 damage to any target.',
      },
      {
        resolveDelta: 1,
        effect: { action: 'buff', value: 1, target: 'friendlyUnit' },
        text: '+1: a friendly unit gets +1/+1.',
      },
    ],
    text: 'Leader — Resolve 4.',
  },
  {
    id: 'leader_verdant',
    name: 'Root Matriarch',
    type: 'Leader',
    cost: cost(2, { Root: 2 }),
    resolve: 5,
    leaderAbilities: [
      {
        resolveDelta: -1,
        effect: { action: 'heal', value: 3, target: 'friendlyAny' },
        text: '-1: heal 3.',
      },
      {
        resolveDelta: 1,
        effect: { action: 'draw', value: 1, target: 'none' },
        text: '+1: Deal a card.',
      },
    ],
    text: 'Leader — Resolve 5.',
  },

  U('cinder_whelp', 'Cinder Whelp', cost(0, { Ember: 1 }), 2, 1, { keywords: ['Reckless'] }),
  U('tide_scout', 'Tide Scout', cost(1, { Tide: 1 }), 1, 2, {
    onInvoke: { action: 'draw', value: 1, target: 'none' },
    text: 'When this unit enters the field, Deal a card.',
  }),
  U('root_guardian', 'Root Guardian', cost(2, { Root: 1 }), 2, 5, { keywords: ['Skywatch'] }),
  U('gale_harrier', 'Gale Harrier', cost(1, { Gale: 1 }), 2, 2, { keywords: ['Aerial'] }),
  U('lightbound_healer', 'Lightbound Healer', cost(1, { Light: 1 }), 2, 3, {
    keywords: ['Siphon'],
  }),
  U('shadow_asp', 'Shadow Asp', cost(1, { Shadow: 1 }), 1, 1, { keywords: ['Venomous'] }),
  U('void_maw', 'Void Maw', cost(4, { Void: 2 }), 6, 6, { keywords: ['Unbreakable', 'Immobile'] }),
  U('war_titan', 'War Titan', cost(5, { Root: 1 }), 7, 7, { keywords: ['Overrun'] }),

  {
    id: 'ember_bolt',
    name: 'Ember Bolt',
    type: 'Event',
    subtype: 'Quick',
    cost: cost(1, { Ember: 1 }),
    onInvoke: { action: 'damage', value: 3, target: 'anyTarget' },
    text: 'Quick — 3 damage to any target.',
  },
  {
    id: 'undertow',
    name: 'Undertow',
    type: 'Event',
    subtype: 'Slow',
    cost: cost(2, { Tide: 1 }),
    onInvoke: { action: 'draw', value: 2, target: 'none' },
    text: 'Slow — Deal two cards.',
  },
  {
    id: 'oblivion_rift',
    name: 'Oblivion Rift',
    type: 'Event',
    subtype: 'Slow',
    cost: cost(3, { Void: 2 }),
    onInvoke: { action: 'banish', target: 'enemyUnit' },
    text: 'Slow — Banish a target enemy unit.',
  },
  {
    id: 'wardens_sigil',
    name: "Warden's Sigil",
    type: 'Charm',
    subtype: 'Bound',
    cost: cost(1, { Light: 1 }),
    bond: { might: 1, grit: 2 },
    text: 'Bound — bonded unit gets +1/+2.',
  },
  {
    id: 'stormforged_blade',
    name: 'Stormforged Blade',
    type: 'Charm',
    subtype: 'Worn',
    cost: cost(2, { Ember: 1 }),
    rebondCost: 2,
    bond: { might: 2, grants: ['Quickstrike'] },
    text: 'Worn — bonded unit gets +2/+0 and Quickstrike. Re-bond 2.',
  },
  {
    id: 'sanctum_of_embers',
    name: 'Sanctum of Embers',
    type: 'Location',
    subtype: 'Sanctum',
    cost: cost(2),
    produces: 'Ember',
    locPassive: 'MIGHT_ALL',
    text: 'Sanctum — exhaust: add one Ember essence. Your units get +1 Might.',
  },
];

export const CARD_DB: Record<string, CardDef> = Object.fromEntries(CARDS_V3.map((c) => [c.id, c]));
