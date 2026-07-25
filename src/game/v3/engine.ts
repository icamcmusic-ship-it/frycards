/**
 * Fry Cards v5.0 game engine (essence-based TCG rules).
 *
 * Turn: Dawn (recover, atDawn triggers, Deal 1) -> Main I -> Clash -> Main II
 * -> Dusk (atDusk triggers, Shed to MAX_HAND, pass). Essence is produced by
 * exhausting Locations and the pool empties at the end of every phase.
 * Replaces the v4.x dice-placement engine (dice, rolls, combos, Cast Slots)
 * entirely.
 */
import { CardDef, Effect, EssenceCost, LEADER_HP, MAX_HAND, hasKw } from './cards';
import { COLORS, EssenceType, LEADER_COLORS } from './colors';

// ---------------------------------------------------------------------------
// RNG (seeded, for reproducible tests/sims)
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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export type PlayerId = 'P1' | 'P2';
export type Phase = 'Dawn' | 'Main1' | 'Clash' | 'Main2' | 'Dusk';

/** A card instance in a hidden/ordered zone (deck, hand, ash, void). */
export interface CardInst {
  iid: string;
  def: CardDef;
}

/** A Charm on the field, bonded or (Worn only) unbonded. */
export interface CharmInst {
  iid: string;
  def: CardDef;
}

/** A Unit on the field. */
export interface UnitInst {
  iid: string;
  def: CardDef;
  owner: PlayerId;
  /** Marked damage (clears when healed; lethal vs effective grit shatters). */
  damage: number;
  exhausted: boolean;
  /** Summoning sickness: entered the field this turn (Reckless ignores it). */
  enteredThisTurn: boolean;
  /** Permanent +might/+grit from buffs. */
  permMight: number;
  permGrit: number;
  /** Charms bonded to this unit. */
  charms: CharmInst[];
  /** Hit by Venomous damage this clash — lethal unless Unbreakable. */
  venomed?: boolean;
}

/** A Location on the field: a basic Wellspring (no def) or an invoked Sanctum. */
export interface LocationInst {
  iid: string;
  /** undefined for basic Wellsprings (auto-supplied, not deck cards). */
  def?: CardDef;
  produces: EssenceType;
  exhausted: boolean;
}

export interface LeaderZone {
  def: CardDef;
  /** True once the Leader has been invoked onto the field. */
  invoked: boolean;
  resolve: number;
  /** Shattered at resolve <= 0 — gone for the rest of the game. */
  shattered: boolean;
  abilityUsedThisTurn: boolean;
}

export interface PlayerState {
  id: PlayerId;
  vitality: number;
  deck: CardInst[];
  hand: CardInst[];
  ashPile: CardInst[];
  voidPile: CardInst[];
  field: UnitInst[];
  locations: LocationInst[];
  /** Worn Charms whose unit left the field — on the field, unbonded. */
  wornCharms: CharmInst[];
  leader: LeaderZone;
  /** Essence pool — empties at the end of every phase. */
  essence: Partial<Record<EssenceType, number>>;
  wellspringPlayedThisTurn: boolean;
  /** True once this player has invoked any card this turn (Surge discount).
   * Reset for both players at each Dawn. */
  invokedCardThisTurn: boolean;
}

export type ClashStep = 'guards' | 'reaction' | 'done';

export interface GuardAssignments {
  /** attacker iid -> guarding unit iids (defender's units). */
  [attackerIid: string]: string[];
}

export interface ClashState {
  step: ClashStep;
  attackers: string[];
  guards: GuardAssignments;
}

export interface GameState {
  players: Record<PlayerId, PlayerState>;
  active: PlayerId;
  phase: Phase;
  /** Turn counter: 1 = first player's first turn. */
  turn: number;
  winner: PlayerId | null;
  clash: ClashState | null;
  log: string[];
  rng: Rng;
}

/** A deck definition: a Leader id plus a flat card-id list (one per copy). */
export interface DeckDef {
  leaderId: string;
  cards: string[];
  label?: string;
}

let iidCounter = 0;
function nextIid(base: string): string {
  return `${base}#${++iidCounter}`;
}

export function makeCardInst(def: CardDef): CardInst {
  return { iid: nextIid(def.id), def };
}

export function opponentOf(pid: PlayerId): PlayerId {
  return pid === 'P1' ? 'P2' : 'P1';
}

export function findUnit(state: GameState, iid: string): UnitInst | undefined {
  return (
    state.players.P1.field.find((u) => u.iid === iid) ??
    state.players.P2.field.find((u) => u.iid === iid)
  );
}

/** Put a unit onto the field directly (testing/summon-effect utility). */
export function summonUnit(
  state: GameState,
  pid: PlayerId,
  def: CardDef,
  opts: { exhausted?: boolean; sick?: boolean } = {},
): UnitInst {
  const u: UnitInst = {
    iid: nextIid(def.id),
    def,
    owner: pid,
    damage: 0,
    exhausted: opts.exhausted ?? false,
    enteredThisTurn: opts.sick ?? false,
    permMight: 0,
    permGrit: 0,
    charms: [],
  };
  state.players[pid].field.push(u);
  return u;
}

// ---------------------------------------------------------------------------
// Derived stats & keywords
// ---------------------------------------------------------------------------
/** All keywords a unit currently has: printed + granted by bonded Charms. */
export function effKeywords(u: UnitInst): string[] {
  const out = [...(u.def.keywords ?? [])];
  for (const c of u.charms) for (const kw of c.def.bond?.grants ?? []) out.push(kw);
  return out;
}

export function unitHasKw(u: UnitInst, kw: string): boolean {
  return effKeywords(u).includes(kw);
}

function sanctumBonus(p: PlayerState, passive: 'MIGHT_ALL' | 'GRIT_ALL'): number {
  return p.locations.filter((l) => l.def?.locPassive === passive).length;
}

/** v6.0 Commander: +1 Might to all your units while your Leader is fielded. */
function commanderBonus(p: PlayerState): number {
  return p.leader.invoked && !p.leader.shattered && hasKw(p.leader.def, 'Commander') ? 1 : 0;
}

export function effMight(state: GameState, u: UnitInst): number {
  const p = state.players[u.owner];
  const charm = u.charms.reduce((s, c) => s + (c.def.bond?.might ?? 0), 0);
  return Math.max(
    0,
    (u.def.might ?? 0) + u.permMight + charm + sanctumBonus(p, 'MIGHT_ALL') + commanderBonus(p),
  );
}

export function effGrit(state: GameState, u: UnitInst): number {
  const p = state.players[u.owner];
  const charm = u.charms.reduce((s, c) => s + (c.def.bond?.grit ?? 0), 0);
  return Math.max(0, (u.def.grit ?? 0) + u.permGrit + charm + sanctumBonus(p, 'GRIT_ALL'));
}

export function remainingGrit(state: GameState, u: UnitInst): number {
  return effGrit(state, u) - u.damage;
}

// ---------------------------------------------------------------------------
// Essence
// ---------------------------------------------------------------------------
export function essenceTotal(pool: Partial<Record<EssenceType, number>>): number {
  return COLORS.reduce((s, t) => s + (pool[t] ?? 0), 0);
}

/** Can `pool` pay `cost`? Colored pips need matching essence; generic any. */
export function canPayCost(
  pool: Partial<Record<EssenceType, number>>,
  cost?: EssenceCost,
): boolean {
  if (!cost) return true;
  let leftover = 0;
  for (const t of COLORS) {
    const have = pool[t] ?? 0;
    const need = cost.pips[t] ?? 0;
    if (have < need) return false;
    leftover += have - need;
  }
  return leftover >= cost.generic;
}

/** Deduct `cost` from `pool` (assumes canPayCost). Generic is paid from the
 * most plentiful remaining types first. */
function payCost(pool: Partial<Record<EssenceType, number>>, cost?: EssenceCost): void {
  if (!cost) return;
  for (const t of COLORS) {
    const need = cost.pips[t] ?? 0;
    if (need > 0) pool[t] = (pool[t] ?? 0) - need;
  }
  let generic = cost.generic;
  while (generic > 0) {
    let best: EssenceType | null = null;
    for (const t of COLORS) {
      if ((pool[t] ?? 0) > 0 && (best === null || (pool[t] ?? 0) > (pool[best] ?? 0))) best = t;
    }
    if (best === null) break;
    pool[best] = (pool[best] ?? 0) - 1;
    generic--;
  }
}

function clearEssence(state: GameState): void {
  telemetry.onEssenceCleared?.(state);
  state.players.P1.essence = {};
  state.players.P2.essence = {};
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
export const STARTING_HAND = 7;

export interface GameOptions {
  rng?: Rng;
  /** Default true — tests can disable to keep deck order (top of deck = last
   * array entry, drawn first). */
  shuffle?: boolean;
  /** Default STARTING_HAND. */
  handSize?: number;
}

function shuffleArr<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function createGame(
  deckP1: DeckDef,
  deckP2: DeckDef,
  poolById: Record<string, CardDef>,
  opts: GameOptions = {},
): GameState {
  const rng = opts.rng ?? mulberry32(Date.now() & 0xffffffff);
  const mk = (id: PlayerId, dd: DeckDef): PlayerState => {
    const leaderDef = poolById[dd.leaderId];
    if (!leaderDef) throw new Error(`Unknown leader id: ${dd.leaderId}`);
    const deck = dd.cards
      .map((cid) => {
        const def = poolById[cid];
        if (!def) throw new Error(`Unknown card id: ${cid}`);
        return makeCardInst(def);
      })
      .filter((c) => c.def.type !== 'Leader');
    return {
      id,
      vitality: LEADER_HP,
      deck,
      hand: [],
      ashPile: [],
      voidPile: [],
      field: [],
      locations: [],
      wornCharms: [],
      leader: {
        def: leaderDef,
        invoked: false,
        resolve: leaderDef.resolve ?? 0,
        shattered: false,
        abilityUsedThisTurn: false,
      },
      essence: {},
      wellspringPlayedThisTurn: false,
      invokedCardThisTurn: false,
    };
  };
  const state: GameState = {
    players: { P1: mk('P1', deckP1), P2: mk('P2', deckP2) },
    active: 'P1',
    phase: 'Dawn',
    turn: 1,
    winner: null,
    clash: null,
    log: [],
    rng,
  };
  const handSize = opts.handSize ?? STARTING_HAND;
  for (const p of [state.players.P1, state.players.P2]) {
    if (opts.shuffle !== false) shuffleArr(p.deck, rng);
    // Second player draws one extra card to offset the first-mover advantage
    // (v5.1: sims measured 55.8% P1 win rate without it).
    const n = handSize + (p.id === 'P2' && handSize > 0 ? 1 : 0);
    // Route through dealCards so an undersized deck triggers the rulebook's
    // empty-deck loss instead of silently dealing a short hand.
    dealCards(state, p.id, n);
  }
  runDawn(state); // first player's Dawn (skips the Deal on turn 1)
  return state;
}

/**
 * Rulebook §3 mulligan: shuffle the hand back into the deck and draw one card
 * FEWER than the hand held before. Repeatable (each mulligan shrinks the next
 * hand by one). Only legal before the first turn's actions — the UI/AI call
 * this right after createGame. Returns false when the hand is already empty.
 */
export function mulliganHand(state: GameState, pid: PlayerId): boolean {
  const p = state.players[pid];
  // Only legal before the first turn's actions: turn 1, no clash yet, still
  // in Dawn/Main1, and this player hasn't invoked anything.
  if (state.winner || state.turn !== 1 || state.clash) return false;
  if (state.phase !== 'Dawn' && state.phase !== 'Main1') return false;
  if (p.invokedCardThisTurn || p.leader.invoked) return false;
  const n = p.hand.length - 1;
  if (n < 0) return false;
  p.deck.push(...p.hand);
  p.hand = [];
  for (let i = p.deck.length - 1; i > 0; i--) {
    const j = Math.floor(state.rng() * (i + 1));
    [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
  }
  dealCards(state, pid, n);
  state.log.push(`${pid} mulligans to ${n}.`);
  return true;
}

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------
/** Deal (draw) `n` cards. Dealing from an empty deck loses the game. */
export function dealCards(state: GameState, pid: PlayerId, n: number): void {
  const p = state.players[pid];
  for (let i = 0; i < n; i++) {
    if (state.winner) return;
    const c = p.deck.pop();
    if (!c) {
      state.winner = opponentOf(pid);
      state.log.push(`${pid} must Deal from an empty deck and loses.`);
      return;
    }
    p.hand.push(c);
  }
}

// ---------------------------------------------------------------------------
// Triggers & effects
// ---------------------------------------------------------------------------
function runTriggers(
  state: GameState,
  pid: PlayerId,
  when: 'enters' | 'dies' | 'atDawn' | 'atDusk' | 'dealsClashDamage',
  unit?: UnitInst,
): void {
  const units = unit ? [unit] : [...state.players[pid].field];
  for (const u of units) {
    for (const t of u.def.triggers ?? []) {
      if (t.when !== when) continue;
      applyEffect(state, pid, t.effect, autoTarget(state, pid, t.effect));
    }
  }
  // Sanctum Locations carry atDawn/atDusk triggers too (cardpool prints them
  // on roughly half of non-Bountiful Sanctums) — these were dead text until
  // v6.0: only units were ever scanned.
  if (!unit && (when === 'atDawn' || when === 'atDusk')) {
    for (const l of [...state.players[pid].locations]) {
      for (const t of l.def?.triggers ?? []) {
        if (t.when !== when) continue;
        applyEffect(state, pid, t.effect, autoTarget(state, pid, t.effect));
      }
    }
  }
}

const SINGLE_TARGETS = ['enemyUnit', 'friendlyUnit', 'anyTarget', 'friendlyAny'];

/** Is `iid` a legal explicit target for `eff` invoked by `pid`? Warded blocks
 * enemy targeting. `iid` may be a unit iid or a player id ('P1'/'P2'). */
export function canTarget(state: GameState, pid: PlayerId, eff: Effect, iid: string): boolean {
  if (iid === 'P1' || iid === 'P2') {
    const isEnemy = iid !== pid;
    switch (eff.target) {
      case 'anyTarget':
      case 'enemyPlayer':
        return isEnemy;
      case 'friendlyPlayer':
      case 'friendlyAny':
        return !isEnemy;
      default:
        return false;
    }
  }
  const u = findUnit(state, iid);
  if (!u) return false;
  const isEnemy = u.owner !== pid;
  if (isEnemy && unitHasKw(u, 'Warded')) return false;
  switch (eff.target) {
    case 'enemyUnit':
    case 'anyTarget':
      return isEnemy;
    case 'friendlyUnit':
    case 'friendlyAny':
      return !isEnemy;
    default:
      return false;
  }
}

/** Pick a sensible default target for an effect (used by triggers and the AI). */
export function autoTarget(state: GameState, pid: PlayerId, eff: Effect): string | undefined {
  const me = state.players[pid];
  const opp = state.players[opponentOf(pid)];
  // Shatter can't affect Unbreakable units (engine no-ops it) — exclude them
  // from consideration for that action so a shatter effect never gets pointed
  // at a target it will just whiff on while a killable target sits legal.
  const excludeUnbreakable = eff.action === 'shatter';
  const biggestEnemy = [...opp.field]
    .filter((u) => !unitHasKw(u, 'Warded') && !(excludeUnbreakable && unitHasKw(u, 'Unbreakable')))
    .sort((a, b) => effMight(state, b) - effMight(state, a))[0];
  switch (eff.target) {
    case 'enemyUnit':
      return biggestEnemy?.iid;
    case 'anyTarget':
      return biggestEnemy?.iid ?? opponentOf(pid);
    case 'enemyPlayer':
      return opponentOf(pid);
    case 'friendlyPlayer':
      return pid;
    case 'friendlyUnit': {
      if (eff.action === 'heal') {
        return [...me.field].sort((a, b) => b.damage - a.damage)[0]?.iid;
      }
      if (eff.action === 'recover') return me.field.find((u) => u.exhausted)?.iid;
      return [...me.field].sort((a, b) => effMight(state, b) - effMight(state, a))[0]?.iid;
    }
    case 'friendlyAny': {
      if (eff.action === 'heal' && me.vitality < LEADER_HP) return pid;
      const hurt = [...me.field].sort((a, b) => b.damage - a.damage)[0];
      return hurt?.iid ?? pid;
    }
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Telemetry hooks (sim harness instrumentation; no-ops in normal play)
// ---------------------------------------------------------------------------
export interface EngineTelemetry {
  /** Fired just before an essence pool is cleared at a phase boundary. */
  onEssenceCleared?: (state: GameState) => void;
  /** Fired when a keyword mechanically procs (Siphon gain, Venomous kill,
   * Overrun spill, Quickstrike/Doublestrike pre-kill). `amount` is the
   * magnitude where meaningful (damage/vitality), else 1. */
  onKeywordProc?: (kw: string, amount: number) => void;
}
/** Mutable hook registry — the sim harness assigns, the UI leaves empty. */
export const telemetry: EngineTelemetry = {};

/** Siphon vitality gain, capped at starting Vitality (same cap as healing). */
function siphonGain(state: GameState, source: UnitInst, amount: number): void {
  const p = state.players[source.owner];
  const gained = Math.min(LEADER_HP, p.vitality + amount) - p.vitality;
  p.vitality += gained;
  if (gained > 0) telemetry.onKeywordProc?.('Siphon', gained);
}

function damageUnit(state: GameState, u: UnitInst, amount: number, source?: UnitInst): void {
  if (amount <= 0) return;
  // v6.0 Hardened: every packet of damage dealt to this unit is reduced by 1.
  if (unitHasKw(u, 'Hardened')) {
    amount -= 1;
    telemetry.onKeywordProc?.('Hardened', 1);
    if (amount <= 0) return; // fully absorbed: no venom mark, no siphon
  }
  u.damage += amount;
  if (source && unitHasKw(source, 'Venomous')) u.venomed = true;
  if (source && unitHasKw(source, 'Siphon')) siphonGain(state, source, amount);
}

function damagePlayer(state: GameState, pid: PlayerId, amount: number, source?: UnitInst): void {
  if (amount <= 0) return;
  state.players[pid].vitality -= amount;
  if (source && unitHasKw(source, 'Siphon')) siphonGain(state, source, amount);
}

/**
 * Apply an effect controlled by `pid`. `targetIid` selects the target where a
 * choice exists (unit iid or player id); illegal explicit targets fizzle.
 */
export function applyEffect(
  state: GameState,
  pid: PlayerId,
  eff: Effect,
  targetIid?: string,
): void {
  const me = state.players[pid];
  const opp = state.players[opponentOf(pid)];
  const v = eff.value ?? 0;
  const resolveTarget = (): string | undefined => {
    if (SINGLE_TARGETS.includes(eff.target)) {
      if (targetIid !== undefined) {
        return canTarget(state, pid, eff, targetIid) ? targetIid : undefined;
      }
      return autoTarget(state, pid, eff);
    }
    if (eff.target === 'enemyPlayer') return opponentOf(pid);
    if (eff.target === 'friendlyPlayer' || eff.target === 'self') return pid;
    return targetIid;
  };

  switch (eff.action) {
    case 'damage': {
      if (eff.target === 'allEnemyUnits') {
        for (const u of [...opp.field]) damageUnit(state, u, v);
        break;
      }
      const t = resolveTarget();
      if (!t) break;
      if (t === 'P1' || t === 'P2') damagePlayer(state, t, v);
      else {
        const u = findUnit(state, t);
        if (u) damageUnit(state, u, v);
      }
      break;
    }
    case 'heal': {
      if (eff.target === 'allFriendlyUnits') {
        for (const u of me.field) u.damage = Math.max(0, u.damage - v);
        break;
      }
      const t = resolveTarget();
      if (!t) break;
      if (t === 'P1' || t === 'P2') {
        const p = state.players[t];
        p.vitality = Math.min(LEADER_HP, p.vitality + v);
      } else {
        const u = findUnit(state, t);
        if (u) u.damage = Math.max(0, u.damage - v);
      }
      break;
    }
    case 'draw':
      dealCards(state, pid, v);
      break;
    case 'buff': {
      if (eff.target === 'allFriendlyUnits') {
        for (const u of me.field) {
          u.permMight += v;
          u.permGrit += v;
        }
        break;
      }
      const t = resolveTarget();
      const u = t ? findUnit(state, t) : undefined;
      if (u && u.owner === pid) {
        u.permMight += v;
        u.permGrit += v;
      }
      break;
    }
    case 'shatter': {
      if (eff.target === 'allEnemyUnits') {
        for (const u of [...opp.field]) shatterUnit(state, u);
        break;
      }
      const t = resolveTarget();
      const u = t ? findUnit(state, t) : undefined;
      if (u) shatterUnit(state, u);
      break;
    }
    case 'banish': {
      const t = resolveTarget();
      const u = t ? findUnit(state, t) : undefined;
      if (u) removeUnit(state, u, 'void');
      break;
    }
    case 'erode': {
      for (let i = 0; i < v; i++) {
        const c = opp.deck.pop();
        if (!c) break;
        opp.ashPile.push(c);
      }
      break;
    }
    case 'recover': {
      const t = resolveTarget();
      const u = t ? findUnit(state, t) : undefined;
      if (u && u.owner === pid) u.exhausted = false;
      break;
    }
  }
  stateBasedChecks(state);
}

// ---------------------------------------------------------------------------
// Leaving the field / state-based checks
// ---------------------------------------------------------------------------
/** Remove a unit from the field to the ash-pile ('ash') or The Void ('void').
 * Bound Charms go to the ash-pile; Worn Charms stay on the field unbonded. */
function removeUnit(state: GameState, u: UnitInst, dest: 'ash' | 'void'): void {
  const p = state.players[u.owner];
  const idx = p.field.indexOf(u);
  if (idx < 0) return;
  p.field.splice(idx, 1);
  for (const charm of u.charms) {
    // v6.0 Soulbound: the Charm returns to its owner's hand instead of dying
    // with (or outliving) its unit.
    if (hasKw(charm.def, 'Soulbound')) {
      telemetry.onKeywordProc?.('Soulbound', 1);
      p.hand.push({ iid: charm.iid, def: charm.def });
    } else if (charm.def.subtype === 'Worn') p.wornCharms.push(charm);
    else p.ashPile.push({ iid: charm.iid, def: charm.def });
  }
  u.charms = [];
  const inst: CardInst = { iid: u.iid, def: u.def };
  if (dest === 'void') p.voidPile.push(inst);
  else p.ashPile.push(inst);
  state.log.push(`${u.def.name} ${dest === 'void' ? 'was banished' : 'was shattered'}.`);
  // Rulebook "when ... leaves the field" has no ash/void distinction: 'dies'
  // triggers fire on banish too.
  runTriggers(state, u.owner, 'dies', u);
}

/** Shatter a unit (Unbreakable prevents it). Returns true if it was shattered. */
export function shatterUnit(state: GameState, u: UnitInst): boolean {
  if (unitHasKw(u, 'Unbreakable')) return false;
  removeUnit(state, u, 'ash');
  return true;
}

/** State-based checks: lethal damage/venom shatters (Unbreakable survives),
 * vitality <= 0 loses, clash bookkeeping drops dead participants. */
export function stateBasedChecks(state: GameState): void {
  for (const pid of ['P1', 'P2'] as PlayerId[]) {
    const p = state.players[pid];
    for (const u of [...p.field]) {
      const lethal = u.damage >= effGrit(state, u) || u.venomed;
      if (!lethal) continue;
      if (unitHasKw(u, 'Unbreakable')) {
        u.venomed = false; // survives; damage stays marked
        continue;
      }
      const byVenom = u.venomed && u.damage < effGrit(state, u);
      removeUnit(state, u, 'ash');
      if (byVenom) telemetry.onKeywordProc?.('Venomous', 1);
    }
  }
  if (state.clash) {
    state.clash.attackers = state.clash.attackers.filter((iid) => findUnit(state, iid));
    for (const a of Object.keys(state.clash.guards)) {
      if (!findUnit(state, a)) delete state.clash.guards[a];
      else state.clash.guards[a] = state.clash.guards[a].filter((g) => findUnit(state, g));
    }
  }
  if (!state.winner) {
    const dead = (['P1', 'P2'] as PlayerId[]).filter((pid) => state.players[pid].vitality <= 0);
    if (dead.length === 1) state.winner = opponentOf(dead[0]);
    else if (dead.length === 2) state.winner = opponentOf(state.active);
  }
}

// ---------------------------------------------------------------------------
// Phase machine
// ---------------------------------------------------------------------------
function runDawn(state: GameState): void {
  const p = state.players[state.active];
  state.phase = 'Dawn';
  for (const u of p.field) {
    u.exhausted = false;
    u.enteredThisTurn = false;
    // v6.0 Regenerate: heals all marked damage at its controller's Dawn.
    if (u.damage > 0 && unitHasKw(u, 'Regenerate')) {
      telemetry.onKeywordProc?.('Regenerate', u.damage);
      u.damage = 0;
    }
  }
  for (const l of p.locations) l.exhausted = false;
  p.leader.abilityUsedThisTurn = false;
  p.wellspringPlayedThisTurn = false;
  // v6.0 Surge tracking resets for both players at every turn boundary.
  state.players.P1.invokedCardThisTurn = false;
  state.players.P2.invokedCardThisTurn = false;
  // v6.0 Sacred: each Sacred Location restores 1 Vitality at its Dawn.
  for (const l of p.locations) {
    if (l.def && hasKw(l.def, 'Sacred') && p.vitality < LEADER_HP) {
      p.vitality += 1;
      telemetry.onKeywordProc?.('Sacred', 1);
    }
  }
  // v6.0 Resolute: an invoked Leader recovers 1 Resolve, up to its printed value.
  const L = p.leader;
  if (
    L.invoked &&
    !L.shattered &&
    hasKw(L.def, 'Resolute') &&
    L.resolve < (L.def.resolve ?? 0)
  ) {
    L.resolve += 1;
    telemetry.onKeywordProc?.('Resolute', 1);
  }
  runTriggers(state, state.active, 'atDawn');
  // Deal 1 (first player skips on turn 1).
  if (!(state.turn === 1 && state.active === 'P1')) dealCards(state, state.active, 1);
  if (!state.winner) state.phase = 'Main1';
}

function runDusk(state: GameState): void {
  const p = state.players[state.active];
  state.phase = 'Dusk';
  runTriggers(state, state.active, 'atDusk');
  // Shed to MAX_HAND (from the end of the hand, deterministic; the UI can let
  // the player reorder/pre-shed before ending Main II).
  while (p.hand.length > MAX_HAND) {
    const c = p.hand.pop()!;
    p.ashPile.push(c);
    state.log.push(`${p.id} sheds ${c.def.name}.`);
  }
  state.active = opponentOf(state.active);
  if (state.active === 'P1') state.turn++;
  clearEssence(state);
  if (!state.winner) runDawn(state);
}

/**
 * Advance to the next phase. Main1 -> Clash -> Main2 -> (Dusk, pass turn,
 * next player's Dawn — landing in their Main1). The essence pool empties at
 * every phase boundary. Illegal mid-clash (resolve the clash first).
 */
export function endPhase(state: GameState): boolean {
  if (state.winner) return false;
  if (state.clash && state.clash.step !== 'done') return false;
  clearEssence(state);
  switch (state.phase) {
    case 'Main1':
      state.phase = 'Clash';
      return true;
    case 'Clash':
      state.clash = null;
      state.phase = 'Main2';
      return true;
    case 'Main2':
      runDusk(state);
      return true;
    default:
      return false;
  }
}

/** Alias for endPhase — same state machine, friendlier name for the UI. */
export const advancePhase = endPhase;

function inOwnMain(state: GameState, pid: PlayerId): boolean {
  return (
    state.active === pid && (state.phase === 'Main1' || state.phase === 'Main2') && !state.clash
  );
}

function reactionOpenFor(state: GameState, _pid: PlayerId): boolean {
  // Rulebook: the guard-step reaction window is open to EITHER player — the
  // engine only validates legality; turn order is the callers' concern.
  return state.clash?.step === 'reaction';
}

// ---------------------------------------------------------------------------
// Wellsprings & Locations
// ---------------------------------------------------------------------------
/** Essence types this player may choose for a basic Wellspring. */
export function wellspringChoices(state: GameState, pid: PlayerId): EssenceType[] {
  const identity = LEADER_COLORS[state.players[pid].leader.def.id];
  return identity ?? [...COLORS];
}

/** Play one basic Wellspring (auto-supplied) — once per turn, own main phase,
 * type must be inside the Leader's identity. */
export function playWellspring(state: GameState, pid: PlayerId, type: EssenceType): boolean {
  const p = state.players[pid];
  if (state.winner || !inOwnMain(state, pid) || p.wellspringPlayedThisTurn) return false;
  if (!wellspringChoices(state, pid).includes(type)) return false;
  p.locations.push({ iid: nextIid(`wellspring_${type}`), produces: type, exhausted: false });
  p.wellspringPlayedThisTurn = true;
  state.log.push(`${pid} plays a ${type} Wellspring.`);
  return true;
}

/** Exhaust a Location to add 1 essence of its type. Legal in own main phase
 * or while the reaction window is open for this player. */
export function tapLocationForEssence(state: GameState, pid: PlayerId, locIid: string): boolean {
  const p = state.players[pid];
  if (state.winner) return false;
  if (!inOwnMain(state, pid) && !reactionOpenFor(state, pid)) return false;
  const loc = p.locations.find((l) => l.iid === locIid);
  if (!loc || loc.exhausted) return false;
  loc.exhausted = true;
  // v6.0 Bountiful Sanctums produce 2 essence per exhaust.
  const amount = locationYield(loc);
  if (amount === 2) telemetry.onKeywordProc?.('Bountiful', 1);
  p.essence[loc.produces] = (p.essence[loc.produces] ?? 0) + amount;
  return true;
}

/** Essence a location adds when exhausted (Bountiful Sanctums give 2). */
export function locationYield(loc: LocationInst): number {
  return loc.def && hasKw(loc.def, 'Bountiful') ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Invoking
// ---------------------------------------------------------------------------
/**
 * v6.0: the cost this card would actually charge `pid` right now. Surge
 * Events cost 1 less (from the generic part first, then any colored pip)
 * once their controller has invoked another card this turn.
 */
export function effectiveCost(
  state: GameState,
  pid: PlayerId,
  def: CardDef,
): EssenceCost | undefined {
  const cost = def.cost;
  if (!cost) return cost;
  if (!hasKw(def, 'Surge') || !state.players[pid].invokedCardThisTurn) return cost;
  if (cost.generic > 0) return { generic: cost.generic - 1, pips: cost.pips };
  for (const t of COLORS) {
    if ((cost.pips[t] ?? 0) > 0) {
      return { generic: 0, pips: { ...cost.pips, [t]: (cost.pips[t] ?? 0) - 1 } };
    }
  }
  return cost;
}

function timingLegal(state: GameState, pid: PlayerId, def: CardDef): boolean {
  const quick = def.type === 'Event' && def.subtype === 'Quick';
  const ambush = def.type === 'Unit' && hasKw(def, 'Ambush');
  if (inOwnMain(state, pid)) return true;
  if ((quick || ambush) && reactionOpenFor(state, pid)) return true;
  return false;
}

/** Can this hand card be invoked right now (timing + current essence pool +
 * a bond target existing for Charms)? */
export function canInvoke(state: GameState, pid: PlayerId, cardIid: string): boolean {
  const p = state.players[pid];
  const card = p.hand.find((c) => c.iid === cardIid);
  if (!card || state.winner) return false;
  const def = card.def;
  if (def.type === 'Leader') return false;
  if (!timingLegal(state, pid, def)) return false;
  if (!canPayCost(p.essence, effectiveCost(state, pid, def))) return false;
  if (def.type === 'Charm' && p.field.length === 0) return false;
  return true;
}

/**
 * Invoke a card from hand, paying its Essence Cost from the essence pool.
 * - Units enter the field (summoning sick unless Reckless), run onInvoke and
 *   'enters' triggers. Ambush units may also enter during the reaction window.
 * - Events resolve onInvoke then go to the ash-pile (Quick: any open window;
 *   Slow: own main phase only).
 * - Charms bond to a friendly unit (`bondTargetIid`).
 * - Sanctums enter the Location row ready.
 */
export function invokeCard(
  state: GameState,
  pid: PlayerId,
  cardIid: string,
  opts: { targetIid?: string; bondTargetIid?: string } = {},
): boolean {
  const p = state.players[pid];
  const card = p.hand.find((c) => c.iid === cardIid);
  if (!card || !canInvoke(state, pid, cardIid)) return false;
  const def = card.def;

  let bondTarget: UnitInst | undefined;
  if (def.type === 'Charm') {
    const iid = opts.bondTargetIid ?? opts.targetIid ?? p.field[0]?.iid;
    bondTarget = iid ? findUnit(state, iid) : undefined;
    if (!bondTarget || bondTarget.owner !== pid) return false;
  }
  if (def.onInvoke && opts.targetIid !== undefined && SINGLE_TARGETS.includes(def.onInvoke.target)) {
    if (!canTarget(state, pid, def.onInvoke, opts.targetIid)) return false;
  }

  const cost = effectiveCost(state, pid, def);
  if (hasKw(def, 'Surge') && cost !== def.cost) telemetry.onKeywordProc?.('Surge', 1);
  payCost(p.essence, cost);
  p.hand.splice(p.hand.indexOf(card), 1);
  p.invokedCardThisTurn = true;
  state.log.push(`${pid} invokes ${def.name}.`);

  switch (def.type) {
    case 'Unit': {
      const u: UnitInst = {
        iid: card.iid,
        def,
        owner: pid,
        damage: 0,
        exhausted: false,
        enteredThisTurn: !hasKw(def, 'Reckless'),
        permMight: 0,
        permGrit: 0,
        charms: [],
      };
      p.field.push(u);
      if (def.onInvoke) applyEffect(state, pid, def.onInvoke, opts.targetIid);
      runTriggers(state, pid, 'enters', u);
      break;
    }
    case 'Event': {
      // v6.0 Resonant: the Event's effect resolves twice. If the explicit
      // target is gone (or illegal) by the second resolution — it usually
      // died to the first — fall back to auto-targeting instead of letting
      // the whole second resolution fizzle.
      const times = hasKw(def, 'Resonant') ? 2 : 1;
      if (times === 2) telemetry.onKeywordProc?.('Resonant', 1);
      for (let i = 0; i < times; i++) {
        if (!def.onInvoke) continue;
        const target =
          i === 0 ||
          opts.targetIid === undefined ||
          canTarget(state, pid, def.onInvoke, opts.targetIid)
            ? opts.targetIid
            : undefined;
        applyEffect(state, pid, def.onInvoke, target);
      }
      p.ashPile.push(card);
      break;
    }
    case 'Charm': {
      bondTarget!.charms.push({ iid: card.iid, def });
      // v6.0 Runic: bonding this Charm from hand Deals its controller a card.
      if (hasKw(def, 'Runic')) {
        telemetry.onKeywordProc?.('Runic', 1);
        dealCards(state, pid, 1);
      }
      if (def.onInvoke) applyEffect(state, pid, def.onInvoke, opts.targetIid);
      break;
    }
    case 'Location': {
      p.locations.push({
        iid: card.iid,
        def,
        produces: def.produces ?? wellspringChoices(state, pid)[0],
        exhausted: false,
      });
      if (def.onInvoke) applyEffect(state, pid, def.onInvoke, opts.targetIid);
      break;
    }
    default:
      return false;
  }
  stateBasedChecks(state);
  return true;
}

/** Re-bond a Worn Charm from the field to a friendly unit for its re-bond
 * cost (generic essence). Own main phase only. */
export function rebondCharm(
  state: GameState,
  pid: PlayerId,
  charmIid: string,
  unitIid: string,
): boolean {
  const p = state.players[pid];
  if (!inOwnMain(state, pid) || state.winner) return false;
  const idx = p.wornCharms.findIndex((c) => c.iid === charmIid);
  if (idx < 0) return false;
  const charm = p.wornCharms[idx];
  const unit = findUnit(state, unitIid);
  if (!unit || unit.owner !== pid) return false;
  const cost: EssenceCost = { generic: charm.def.rebondCost ?? 0, pips: {} };
  if (!canPayCost(p.essence, cost)) return false;
  payCost(p.essence, cost);
  p.wornCharms.splice(idx, 1);
  unit.charms.push(charm);
  state.log.push(`${pid} re-bonds ${charm.def.name} to ${unit.def.name}.`);
  return true;
}

// ---------------------------------------------------------------------------
// Leader
// ---------------------------------------------------------------------------
export function canInvokeLeader(state: GameState, pid: PlayerId): boolean {
  const p = state.players[pid];
  return (
    !state.winner &&
    inOwnMain(state, pid) &&
    !p.leader.invoked &&
    !p.leader.shattered &&
    canPayCost(p.essence, p.leader.def.cost)
  );
}

/** Invoke the Leader from the Leader zone, paying its Essence Cost. */
export function invokeLeader(state: GameState, pid: PlayerId): boolean {
  if (!canInvokeLeader(state, pid)) return false;
  const p = state.players[pid];
  payCost(p.essence, p.leader.def.cost);
  p.leader.invoked = true;
  p.leader.resolve = p.leader.def.resolve ?? 0;
  // The Leader is a card — invoking it enables the Surge discount too.
  p.invokedCardThisTurn = true;
  state.log.push(`${pid} invokes their Leader, ${p.leader.def.name}.`);
  return true;
}

/**
 * Activate one of the Leader's abilities (once per turn, own main phase).
 * Applies resolveDelta; a Leader at resolve <= 0 is shattered for the game.
 */
export function activateLeaderAbility(
  state: GameState,
  pid: PlayerId,
  abilityIndex: number,
  targetIid?: string,
): boolean {
  const p = state.players[pid];
  const L = p.leader;
  if (state.winner || !inOwnMain(state, pid)) return false;
  if (!L.invoked || L.shattered || L.abilityUsedThisTurn) return false;
  const ability = L.def.leaderAbilities?.[abilityIndex];
  if (!ability) return false;
  if (ability.resolveDelta < 0 && L.resolve + ability.resolveDelta < 0) return false;
  L.abilityUsedThisTurn = true;
  L.resolve += ability.resolveDelta;
  applyEffect(state, pid, ability.effect, targetIid);
  if (L.resolve <= 0) {
    L.shattered = true;
    L.invoked = false;
    state.log.push(`${pid}'s Leader ${L.def.name} is shattered.`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Clash
// ---------------------------------------------------------------------------
/** Units the active player may declare as attackers right now. */
export function legalAttackers(state: GameState, pid: PlayerId): UnitInst[] {
  if (state.active !== pid || state.phase !== 'Clash' || state.clash) return [];
  return state.players[pid].field.filter(
    (u) =>
      !u.exhausted &&
      !unitHasKw(u, 'Immobile') &&
      (!u.enteredThisTurn || unitHasKw(u, 'Reckless')),
  );
}

/** Declare attackers. Attackers exhaust unless Alert. Opens the guard step. */
export function declareAttackers(state: GameState, iids: string[]): boolean {
  if (state.winner || state.phase !== 'Clash' || state.clash) return false;
  if (iids.length === 0) return false;
  const legal = new Set(legalAttackers(state, state.active).map((u) => u.iid));
  for (const iid of iids) if (!legal.has(iid)) return false;
  for (const iid of iids) {
    const u = findUnit(state, iid)!;
    if (!unitHasKw(u, 'Alert')) u.exhausted = true;
  }
  state.clash = { step: 'guards', attackers: [...iids], guards: {} };
  state.log.push(`${state.active} attacks with ${iids.length} unit(s).`);
  return true;
}

/** Defender's units that could legally guard `attackerIid` (individually —
 * Swarmproof's 2+ rule is checked at declareGuards). */
export function legalGuardsFor(state: GameState, attackerIid: string): UnitInst[] {
  if (!state.clash || !state.clash.attackers.includes(attackerIid)) return [];
  const attacker = findUnit(state, attackerIid);
  if (!attacker) return [];
  const defender = state.players[opponentOf(state.active)];
  return defender.field.filter((g) => {
    if (g.exhausted) return false;
    if (unitHasKw(attacker, 'Aerial') && !unitHasKw(g, 'Aerial') && !unitHasKw(g, 'Skywatch'))
      return false;
    return true;
  });
}

/**
 * Assign guards (defender). Validates Aerial/Skywatch, Swarmproof (0 or 2+
 * guards), and that no unit guards twice. Multiple guards on one attacker are
 * allowed. Opens the reaction window (Quick Events / Ambush units for the
 * defender); then call resolveClash().
 */
export function declareGuards(state: GameState, assignments: GuardAssignments): boolean {
  if (state.winner || !state.clash || state.clash.step !== 'guards') return false;
  const used = new Set<string>();
  for (const [attackerIid, guardIids] of Object.entries(assignments)) {
    if (!state.clash.attackers.includes(attackerIid)) return false;
    const attacker = findUnit(state, attackerIid);
    if (!attacker) return false;
    if (unitHasKw(attacker, 'Swarmproof') && guardIids.length === 1) return false;
    const legal = new Set(legalGuardsFor(state, attackerIid).map((u) => u.iid));
    for (const gIid of guardIids) {
      if (!legal.has(gIid) || used.has(gIid)) return false;
      used.add(gIid);
    }
  }
  state.clash.guards = {};
  for (const [a, gs] of Object.entries(assignments)) state.clash.guards[a] = [...gs];
  state.clash.step = 'reaction';
  return true;
}

interface DamagePacket {
  source: UnitInst;
  targetUnit?: UnitInst;
  targetPlayer?: PlayerId;
  amount: number;
}

function participates(u: UnitInst, step: 'first' | 'normal'): boolean {
  const qs = unitHasKw(u, 'Quickstrike');
  const ds = unitHasKw(u, 'Doublestrike');
  if (step === 'first') return qs || ds;
  return ds || !qs;
}

/**
 * Resolve the clash: Quickstrike/Doublestrike first-strike sub-step (with a
 * state-based check between sub-steps), then normal simultaneous damage.
 * Venomous is lethal, Siphon gains vitality, Overrun spills past dead guards,
 * unguarded attackers hit the defender's vitality.
 */
export function resolveClash(state: GameState): boolean {
  if (state.winner || !state.clash) return false;
  if (state.clash.step !== 'reaction' && state.clash.step !== 'guards') return false;
  // Remember which attackers were ever guarded (before deaths clean the map).
  const everGuarded = new Set(
    Object.entries(state.clash.guards)
      .filter(([, gs]) => gs.length > 0)
      .map(([a]) => a),
  );
  const dealtBy = new Set<string>();
  // Damage each attacker has assigned to its guards across BOTH sub-steps —
  // Overrun only ever spills (Might - total guard absorption) to the face.
  const absorbed = new Map<string, number>();
  for (const step of ['first', 'normal'] as const) {
    if (state.winner || !state.clash) break;
    const packets = collectStepWithHistory(state, step, everGuarded, absorbed);
    const preFieldCount =
      step === 'first' ? state.players.P1.field.length + state.players.P2.field.length : 0;
    for (const pkt of packets) {
      if (pkt.amount > 0) dealtBy.add(pkt.source.iid);
      if (pkt.targetUnit) damageUnit(state, pkt.targetUnit, pkt.amount, pkt.source);
      else if (pkt.targetPlayer) damagePlayer(state, pkt.targetPlayer, pkt.amount, pkt.source);
    }
    stateBasedChecks(state);
    if (step === 'first' && packets.length > 0) {
      const died =
        preFieldCount - (state.players.P1.field.length + state.players.P2.field.length);
      if (died > 0) telemetry.onKeywordProc?.('Quickstrike', died);
    }
  }
  for (const iid of dealtBy) {
    const u = findUnit(state, iid);
    if (u) runTriggers(state, u.owner, 'dealsClashDamage', u);
  }
  if (state.clash) state.clash.step = 'done';
  stateBasedChecks(state);
  return true;
}

function collectStepWithHistory(
  state: GameState,
  step: 'first' | 'normal',
  everGuarded: Set<string>,
  absorbed: Map<string, number>,
): DamagePacket[] {
  const clash = state.clash!;
  const defenderId = opponentOf(state.active);
  const packets: DamagePacket[] = [];
  for (const attackerIid of clash.attackers) {
    const attacker = findUnit(state, attackerIid);
    if (!attacker) continue;
    const guards = (clash.guards[attackerIid] ?? [])
      .map((iid) => findUnit(state, iid))
      .filter((g): g is UnitInst => !!g);
    for (const g of guards) {
      if (participates(g, step)) {
        packets.push({ source: g, targetUnit: attacker, amount: effMight(state, g) });
      }
    }
    if (!participates(attacker, step)) continue;
    let might = effMight(state, attacker);
    if (guards.length === 0) {
      if (!everGuarded.has(attackerIid)) {
        // Never guarded: hits the defender for full Might.
        packets.push({ source: attacker, targetPlayer: defenderId, amount: might });
      } else if (unitHasKw(attacker, 'Overrun')) {
        // Guards all dead already: Overrun spills only the EXCESS past what
        // was already assigned to guards; non-Overrun deals no face damage.
        const spill = Math.max(0, might - (absorbed.get(attackerIid) ?? 0));
        if (spill > 0) {
          packets.push({ source: attacker, targetPlayer: defenderId, amount: spill });
          telemetry.onKeywordProc?.('Overrun', spill);
        }
      }
      continue;
    }
    const venom = unitHasKw(attacker, 'Venomous');
    for (const g of guards) {
      if (might <= 0) break;
      const need = venom ? 1 : Math.max(1, remainingGrit(state, g));
      const dealt = Math.min(might, need);
      packets.push({ source: attacker, targetUnit: g, amount: dealt });
      absorbed.set(attackerIid, (absorbed.get(attackerIid) ?? 0) + dealt);
      might -= dealt;
    }
    if (might > 0 && unitHasKw(attacker, 'Overrun')) {
      packets.push({ source: attacker, targetPlayer: defenderId, amount: might });
      telemetry.onKeywordProc?.('Overrun', might);
    }
  }
  return packets;
}
