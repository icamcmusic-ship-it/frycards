/**
 * Card data for Rulebook v3.0 (dice-placement rules).
 * Every non-Leader card prints a Cast Slot threshold (1-6), or is a
 * Combo-gated Event with a pattern cost instead.
 */

export type ComboPattern =
  | 'AnyPair'
  | 'TwoPair'
  | 'ThreeKind'
  | 'SmallStraight'
  | 'FullHouse'
  | 'LargeStraight'
  | 'FourKind'
  | 'Yahtzee'
  /** v4.3: at least 3 of your 5 dice show an odd value. */
  | 'ThreeOdds'
  /** v4.3: at least 3 of your 5 dice show an even value. */
  | 'ThreeEvens';

export type EffectAction = 'sap' | 'mend' | 'draw' | 'bind' | 'destroy' | 'buff';
export type EffectTarget =
  | 'enemyUnit'
  | 'friendlyUnit'
  | 'anyTarget' // enemy unit or enemy leader (AI picks); sap/destroy style
  | 'enemyLeader'
  | 'friendlyLeader'
  | 'friendlyAny' // friendly unit or own leader (mend style)
  | 'allEnemyUnits'
  | 'allFriendlyUnits'
  | 'self'
  | 'none';

export interface Effect {
  action: EffectAction;
  value?: number;
  target: EffectTarget;
}

export type CardType = 'Leader' | 'Unit' | 'Location' | 'Charm' | 'Event';

export type Rarity =
  'Common' | 'Uncommon' | 'Rare' | 'Super-Rare' | 'Full-Art' | 'Ultra-Rare' | 'Mythic';

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  /** Core identity preserved from the backend card catalog. */
  rarity?: Rarity;
  set?: string;
  image?: string;
  flavor?: string;
  /**
   * Cast Slot cost target. Undefined only for Combo-gated cards and Leaders.
   * Paired with `castCostKind` (v4.3) to pick how the die(s) placed here must
   * relate to this number — see `castCostKind`.
   */
  threshold?: number;
  /**
   * v4.3: how a numeric `threshold` is paid. Every Unit/Charm/Event prints
   * one of the five cost formats: this field (with `threshold`) covers two
   * of them; `comboGate` (below) covers the other three (Pairs and every
   * kind/straight/house pattern, plus Three Odds/Evens via the matching
   * `ComboPattern`).
   * - 'atLeast' (default/legacy): one die of value >= threshold.
   * - 'exact': one die showing exactly threshold.
   * - 'sum': any number of unplaced dice whose total >= threshold.
   */
  castCostKind?: 'atLeast' | 'exact' | 'sum';
  /** Combo-gated cost: the roll must contain this pattern. Usable on any card type (v4.3), not just Events. */
  comboGate?: ComboPattern;
  atk?: number;
  hp?: number;
  /** Simple keywords: Guard, Swift, Pierce, Ward, Frenzy, Anchor, Echo, Scrap, Rally, Twin. */
  keywords?: string[];
  /** One Ability Slot (repeatable, once per turn, mutually exclusive with attacking). */
  ability?: { threshold: number; effect: Effect };
  /** Effect on cast (Charms/Events resolve this then discard; Units trigger it on entry). */
  onCast?: Effect;
  /** Passive Combo bonus while in play, checked at the Combo Check step. */
  combo?: { pattern: ComboPattern; effect: Effect };
  /** Overflow X: die exceeds effective threshold by X or more -> bonus. */
  overflow?: { amount: number; effect: Effect };
  /** Twin bonus effect, triggered when the second matched die completes the card. */
  twinBonus?: Effect;
  /** v4.2: passive effect a Twin card grants once per controller turn while parked in Staging. */
  stagedPassive?: Effect;
  /** Location passive for the controller's Units. */
  locPassive?: 'ATK_ALL' | 'HP_ALL';
  text?: string;

  // -- v4.2 keywords --
  /** Resolve X (Leader): while at/below half HP, Ability Slot threshold -X (min 1). */
  resolve?: { x: number };
  /** Ultimate(N) (Leader): a second, once-per-game Ability Slot, usable from your Nth turn on. */
  ultimate?: { unlockTurn: number; threshold: number; effect: Effect };
  /** Crescendo X (Event): +X to this Event's numeric effect per die of value 6 you placed this turn. */
  crescendo?: { x: number };
  /** Bulwark X (Unit): flat reduction to damage this Unit takes from attacks (after Ward, before Frenzy). */
  bulwark?: { x: number };
  /** Toll X (Unit): reduces ALL incoming damage to your Leader (any source) by X while this Unit lives. */
  toll?: { x: number };
  /** Avenge (Unit): +1/+1 permanently whenever another friendly Unit dies (state-based, no priority window). */
  avenge?: boolean;
  /** Aftershock (Event): after resolving, queues this effect to fire at the very start of your next turn, before Draw Phase. */
  aftershock?: Effect;
  /** Tribute (Location): triggers at your End Phase if you Pitched 2+ dice this turn. */
  tribute?: Effect;
  /** Excavate X (Location): Ability Slot threshold drops by X per controller turn in play (min 1). */
  excavate?: { x: number };
  /** Contested (Location): its passive is doubled while the opponent controls no Location. */
  contested?: boolean;
  /** Snap (Charm): may be cast during the Reroll Phase (before the reroll window closes), not just Placement. */
  snap?: boolean;
}

// v4.1: raised (28 -> 60) to lengthen games by ~4 rounds toward the 8-10 round
// target — a ~6-round meta at 28 HP was ending before reactive decks could
// stabilize. 60 HP lands the average near ~10 rounds in the sim's length
// distribution while keeping deck-out rare on 30-card decks.
export const LEADER_HP = 64;

const U = (
  id: string,
  name: string,
  threshold: number,
  atk: number,
  hp: number,
  extra: Partial<CardDef> = {},
): CardDef => ({ id, name, type: 'Unit', threshold, atk, hp, ...extra });

export const CARDS_V3: CardDef[] = [
  // ---- Leaders (20 HP, no ATK, one Ability Slot) ----
  {
    id: 'leader_ember',
    name: 'Emberlord Kaz',
    type: 'Leader',
    hp: LEADER_HP,
    ability: { threshold: 5, effect: { action: 'sap', value: 2, target: 'anyTarget' } },
    text: 'Ability 5+: Sap 2 (any Unit or Leader).',
  },
  {
    id: 'leader_verdant',
    name: 'Verdant Matriarch',
    type: 'Leader',
    hp: LEADER_HP,
    ability: { threshold: 5, effect: { action: 'mend', value: 3, target: 'friendlyAny' } },
    text: 'Ability 5+: Mend 3 (your Leader or a friendly Unit).',
  },
  {
    id: 'leader_gearwright',
    name: 'Gearwright Otto',
    type: 'Leader',
    hp: LEADER_HP,
    ability: { threshold: 4, effect: { action: 'draw', value: 1, target: 'none' } },
    text: 'Ability 4+: Surge (draw a card).',
  },
  {
    id: 'leader_shadow',
    name: 'Shadow Duelist Vex',
    type: 'Leader',
    hp: LEADER_HP,
    ability: { threshold: 4, effect: { action: 'bind', target: 'enemyUnit' } },
    text: 'Ability 4+: Bind a target enemy Unit.',
  },

  // ---- Units ----
  U('dice_goblin', 'Dice Goblin', 1, 2, 1),
  U('scrap_rat', 'Scrap Rat', 1, 1, 1, {
    keywords: ['Scrap'],
    text: 'Scrap: discard from hand to reroll one unplaced die.',
  }),
  U('shield_bearer', 'Shield Bearer', 2, 1, 4, { keywords: ['Guard'] }),
  U('swift_fox', 'Swift Fox', 2, 2, 2, { keywords: ['Swift'] }),
  U('pair_prowler', 'Pair Prowler', 2, 2, 2, {
    combo: { pattern: 'AnyPair', effect: { action: 'buff', value: 1, target: 'self' } },
    text: 'Combo Any Pair: this gains +1/+1.',
  }),
  U('wardancer', 'Wardancer', 3, 2, 4, { keywords: ['Ward'] }),
  U('pikeman', 'Pikeman', 3, 3, 3),
  U('echo_shade', 'Echo Shade', 3, 3, 2, { keywords: ['Echo'] }),
  U('anchorite', 'Anchorite', 3, 2, 3, { keywords: ['Anchor'] }),
  U('field_medic', 'Field Medic', 3, 1, 4, {
    ability: { threshold: 4, effect: { action: 'mend', value: 2, target: 'friendlyAny' } },
    text: 'Ability 4+: Mend 2.',
  }),
  U('lancer', 'Lancer', 4, 4, 3, { keywords: ['Pierce'] }),
  U('berserker', 'Berserker', 4, 5, 4, { keywords: ['Frenzy'] }),
  U('rally_captain', 'Rally Captain', 4, 3, 3, {
    keywords: ['Rally'],
    ability: { threshold: 3, effect: { action: 'buff', value: 1, target: 'friendlyUnit' } },
    text: 'Ability 3+: a friendly Unit gains +1/+1. Rally.',
  }),
  U('triad_mystic', 'Triad Mystic', 4, 2, 4, {
    combo: { pattern: 'ThreeKind', effect: { action: 'sap', value: 2, target: 'anyTarget' } },
    text: 'Combo Three of a Kind: Sap 2.',
  }),
  U('anchor_keeper', 'Anchor Keeper', 4, 3, 5, { keywords: ['Anchor'] }),
  U('tower_golem', 'Tower Golem', 5, 3, 8, { keywords: ['Guard'] }),
  U('phoenix', 'Ashen Phoenix', 5, 4, 3, { keywords: ['Echo', 'Swift'] }),
  U('bulwark', 'Living Bulwark', 5, 2, 8, { keywords: ['Guard'] }),
  U('twin_flames', 'Twin Flames', 3, 4, 4, {
    keywords: ['Twin'],
    twinBonus: { action: 'sap', value: 3, target: 'enemyLeader' },
    text: 'Twin 3: when completed, Sap 3 the enemy Leader.',
  }),
  U('war_titan', 'War Titan', 6, 7, 7),
  U('siege_drake', 'Siege Drake', 6, 6, 5, { keywords: ['Pierce'] }),

  // ---- Charms ----
  {
    id: 'spark',
    name: 'Spark',
    type: 'Charm',
    threshold: 1,
    onCast: { action: 'sap', value: 2, target: 'enemyUnit' },
    text: 'Sap 2 a target enemy Unit.',
  },
  {
    id: 'tinker',
    name: 'Tinker',
    type: 'Charm',
    threshold: 1,
    keywords: ['Scrap'],
    onCast: { action: 'draw', value: 1, target: 'none' },
    text: 'Surge. Scrap.',
  },
  {
    id: 'salve',
    name: 'Soothing Salve',
    type: 'Charm',
    threshold: 2,
    onCast: { action: 'mend', value: 3, target: 'friendlyAny' },
    text: 'Mend 3.',
  },
  {
    id: 'insight',
    name: 'Insight',
    type: 'Charm',
    threshold: 2,
    onCast: { action: 'draw', value: 1, target: 'none' },
    overflow: { amount: 2, effect: { action: 'draw', value: 1, target: 'none' } },
    text: 'Surge. Overflow 2: Surge again.',
  },
  {
    id: 'shackles',
    name: 'Shackles',
    type: 'Charm',
    threshold: 3,
    onCast: { action: 'bind', target: 'enemyUnit' },
    text: 'Bind a target enemy Unit.',
  },
  {
    id: 'bolt',
    name: 'Bolt',
    type: 'Charm',
    threshold: 3,
    onCast: { action: 'sap', value: 3, target: 'anyTarget' },
    text: 'Sap 3 any Unit or Leader.',
  },

  // ---- Events ----
  {
    id: 'fireball',
    name: 'Fireball',
    type: 'Event',
    threshold: 5,
    onCast: { action: 'sap', value: 4, target: 'anyTarget' },
    overflow: { amount: 1, effect: { action: 'sap', value: 2, target: 'enemyLeader' } },
    text: 'Sap 4. Overflow 1: Sap 2 the enemy Leader.',
  },
  {
    id: 'annihilate',
    name: 'Annihilate',
    type: 'Event',
    threshold: 6,
    onCast: { action: 'destroy', target: 'enemyUnit' },
    text: 'Destroy a target enemy Unit.',
  },
  {
    id: 'lucky_streak',
    name: 'Lucky Streak',
    type: 'Event',
    comboGate: 'AnyPair',
    onCast: { action: 'draw', value: 2, target: 'none' },
    text: 'Combo Any Pair: draw 2 cards.',
  },
  {
    id: 'straight_shot',
    name: 'Straight Shot',
    type: 'Event',
    comboGate: 'SmallStraight',
    onCast: { action: 'sap', value: 4, target: 'anyTarget' },
    text: 'Combo Small Straight: Sap 4.',
  },
  {
    id: 'full_charge',
    name: 'Full Charge',
    type: 'Event',
    comboGate: 'ThreeKind',
    onCast: { action: 'sap', value: 5, target: 'enemyLeader' },
    text: 'Combo Three of a Kind: Sap 5 the enemy Leader.',
  },
  {
    id: 'house_rules',
    name: 'House Rules',
    type: 'Event',
    comboGate: 'FullHouse',
    onCast: { action: 'buff', value: 2, target: 'allFriendlyUnits' },
    text: 'Combo Full House: all friendly Units gain +2/+2.',
  },
  {
    id: 'grand_slam',
    name: 'Grand Slam',
    type: 'Event',
    comboGate: 'FourKind',
    onCast: { action: 'destroy', target: 'allEnemyUnits' },
    text: 'Combo Four of a Kind: destroy all enemy Units.',
  },
  {
    id: 'jackpot',
    name: 'Jackpot',
    type: 'Event',
    comboGate: 'Yahtzee',
    onCast: { action: 'sap', value: 10, target: 'enemyLeader' },
    text: 'Combo Yahtzee: Sap 10 the enemy Leader.',
  },

  // ---- Locations ----
  {
    id: 'training_grounds',
    name: 'Training Grounds',
    type: 'Location',
    threshold: 3,
    locPassive: 'ATK_ALL',
    text: 'Your Units get +1 ATK.',
  },
  {
    id: 'sanctum',
    name: 'Verdant Sanctum',
    type: 'Location',
    threshold: 3,
    locPassive: 'HP_ALL',
    text: 'Your Units get +1 max HP.',
  },
  {
    id: 'dice_den',
    name: 'Dice Den',
    type: 'Location',
    threshold: 4,
    ability: { threshold: 3, effect: { action: 'draw', value: 1, target: 'none' } },
    text: 'Ability 3+: Surge.',
  },
];

export const CARD_DB: Record<string, CardDef> = Object.fromEntries(CARDS_V3.map((c) => [c.id, c]));

/** 40-card decklists (id -> copies, max 3) per Leader. */
export const DECKLISTS_V3: Record<string, Record<string, number>> = {
  leader_ember: {
    dice_goblin: 3,
    swift_fox: 3,
    pikeman: 3,
    berserker: 3,
    lancer: 3,
    spark: 3,
    bolt: 3,
    fireball: 3,
    phoenix: 3,
    twin_flames: 3,
    war_titan: 2,
    full_charge: 3,
    lucky_streak: 2,
    training_grounds: 1,
    tinker: 2,
  },
  leader_verdant: {
    shield_bearer: 3,
    wardancer: 3,
    field_medic: 3,
    tower_golem: 3,
    bulwark: 3,
    anchor_keeper: 3,
    anchorite: 3,
    salve: 3,
    insight: 3,
    annihilate: 3,
    war_titan: 3,
    shackles: 3,
    sanctum: 2,
    house_rules: 2,
  },
  leader_gearwright: {
    pair_prowler: 3,
    triad_mystic: 3,
    echo_shade: 3,
    insight: 3,
    tinker: 3,
    lucky_streak: 3,
    straight_shot: 3,
    full_charge: 3,
    rally_captain: 3,
    war_titan: 3,
    pikeman: 3,
    grand_slam: 1,
    jackpot: 1,
    shield_bearer: 3,
    house_rules: 2,
  },
  leader_shadow: {
    swift_fox: 3,
    echo_shade: 3,
    wardancer: 3,
    lancer: 3,
    shackles: 3,
    bolt: 3,
    spark: 3,
    phoenix: 3,
    berserker: 3,
    insight: 3,
    pikeman: 3,
    tinker: 3,
    siege_drake: 2,
    annihilate: 2,
  },
};

export function hasKw(def: CardDef, kw: string): boolean {
  return !!def.keywords?.includes(kw);
}
