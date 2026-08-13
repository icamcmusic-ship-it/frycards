/**
 * Fry Cards v5.0 game engine (essence-based TCG rules).
 *
 * Turn: Dawn (recover, atDawn triggers, Deal 1) -> Main I -> Clash -> Main II
 * -> Dusk (atDusk triggers, Shed to MAX_HAND, pass). Essence is produced by
 * exhausting Locations and the pool empties at the end of every phase.
 * Replaces the v4.x dice-placement engine (dice, rolls, combos, Cast Slots)
 * entirely.
 */
import {
  CardDef,
  Effect,
  EssenceCost,
  LEADER_HP,
  MAX_HAND,
  charmSelfHeal,
  hasKw,
  itemSurvives,
} from './cards';
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

/** An Item on the field, bonded or (Weapon/Tool only) unbonded. */
export interface ItemInst {
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
  /** Items bonded to this unit. */
  items: ItemInst[];
  /** Hit by Venomous damage this clash — lethal unless Unbreakable. */
  venomed?: boolean;
  /**
   * v16: Unbreakable is once per GAME, and this is the charge being spent.
   * Never cleared — the v7.5 every-Dawn reset is gone (§3 of the v16
   * findings). Per-INSTANCE by design: a spent unit that dies and is later
   * Exhumed re-enters as a fresh UnitInst, i.e. a fresh printing of the card
   * with its printed save intact.
   */
  unbreakableSpent?: boolean;
}

/** A Location on the field: a basic Wellspring (no def) or an invoked Sanctum. */
export interface LocationInst {
  iid: string;
  /** undefined for basic Wellsprings (auto-supplied, not deck cards). */
  def?: CardDef;
  produces: EssenceType;
  exhausted: boolean;
  /**
   * v7.6 Glaciate: this Sanctum's freeze is spent and it rests next Dawn. See
   * the Dawn handler — Glaciate fires every other Dawn per Sanctum.
   */
  glaciateAsleep?: boolean;
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
  /** Weapons and Tools whose unit left the field — on the field, unbonded. */
  unbondedItems: ItemInst[];
  leader: LeaderZone;
  /** Essence pool — empties at the end of every phase. */
  essence: Partial<Record<EssenceType, number>>;
  /** True once this player has used up their Wellspring allowance for the
   * turn (see `wellspringAllowance`). */
  wellspringPlayedThisTurn: boolean;
  /** Wellsprings actually played this turn — normally 0 or 1, but the second
   * player gets two on their opening turn (see `wellspringAllowance`). */
  wellspringsPlayedThisTurn: number;
  /** True once this player has invoked any card this turn (Surge discount).
   * Reset for both players at each Dawn. */
  invokedCardThisTurn: boolean;
}

/**
 * An entry on the resolution stack. Cards invoked from hand and triggered
 * abilities both wait here instead of resolving where they were created, so
 * either player can respond before they take effect.
 */
export interface StackItem {
  id: string;
  kind: 'card' | 'trigger';
  controller: PlayerId;
  /** Display name for the log/UI (card name, or the trigger's source card). */
  sourceName: string;
  /** kind 'card': the card that left hand and is waiting to resolve. */
  card?: CardInst;
  /** kind 'trigger': the ability's effect. */
  effect?: Effect;
  targetIid?: string;
  bondTargetIid?: string;
  /** Event-only: how many times its effect resolves (Resonant prints 2). */
  resolveTimes?: number;
}

/** An open priority window. Absent when nobody may act (mid-resolution). */
export interface PriorityState {
  holder: PlayerId;
  /**
   * Players who have passed since the stack last changed. Both players
   * passing in succession resolves the top item (or closes the window when
   * the stack is empty).
   */
  passed: PlayerId[];
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
  /**
   * Attackers that were guarded by at least one unit at the moment guards
   * were declared. Kept separately from `guards` because `stateBasedChecks`
   * prunes dead guards out of that map: without this record, an attacker
   * whose only blocker was removed DURING the reaction window looked like it
   * had never been guarded at all and hit the defender's face for full Might
   * (see resolveClash). Blocked is blocked — a removed blocker absorbs the
   * attack, it does not un-block it.
   */
  guardedOnce: string[];
}

export interface GameState {
  players: Record<PlayerId, PlayerState>;
  active: PlayerId;
  phase: Phase;
  /** Turn counter: 1 = first player's first turn. */
  turn: number;
  /** Which seat took the first turn. Not always P1: the UI randomises this
   * per match so the human isn't permanently on the play (and so the
   * second-player compensation applies to whichever side actually goes
   * second). Everything that used to key off the literal 'P1' — the turn-1
   * Deal skip, the turn counter rollover, the Wellspring allowance — keys
   * off this instead. */
  firstPlayer: PlayerId;
  winner: PlayerId | null;
  clash: ClashState | null;
  /** Waiting-to-resolve cards and triggers, resolved last-in-first-out. */
  stack: StackItem[];
  /** Whose window it is to respond, or null when no window is open. */
  priority: PriorityState | null;
  log: string[];
  /**
   * The lines the CURRENT turn's Dawn wrote (v22).
   *
   * Dawn runs inside the `endPhase` that ends the PREVIOUS player's turn, so
   * an interactive UI that takes its own `logStart` when it hands the turn
   * over is already past them: the opponent's Glaciate freeze, Archivist draw
   * and Sacred heal all landed behind the narrator. Handing back the slice
   * rather than an index keeps the UI out of log arithmetic — the opening turn
   * runs its Dawn inside `createGame`, before the mulligans, so "everything
   * from index N" is not the same set of lines. Purely a read-only report;
   * nothing in the engine branches on it.
   */
  dawnLog: string[];
  rng: Rng;
  /**
   * Optional Dusk shed chooser, installed by an interactive UI. Called during
   * Dusk — AFTER "At Dusk" triggers (which can draw) have resolved — whenever
   * the turn player's hand exceeds MAX_HAND. Returns the iids to shed, or
   * undefined to fall back to the default shed-from-the-end. It may THROW to
   * pause the turn mid-Dusk; the thrower must later call `finishDuskShed` to
   * complete the turn. Headless callers (sims, tests) leave this unset, so
   * their behavior is byte-identical to before.
   */
  chooseShed?: (state: GameState, pid: PlayerId, count: number) => string[] | undefined;
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
    items: [],
  };
  state.players[pid].field.push(u);
  return u;
}

// ---------------------------------------------------------------------------
// Derived stats & keywords
// ---------------------------------------------------------------------------
/** All keywords a unit currently has: printed + granted by bonded Items. */
export function effKeywords(u: UnitInst): string[] {
  const out = [...(u.def.keywords ?? [])];
  for (const c of u.items) for (const kw of c.def.bond?.grants ?? []) out.push(kw);
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

/** v7.3 Warlord: Commander's defensive twin — +1 Grit to all your units
 * while your Leader is fielded. */
function warlordBonus(p: PlayerState): number {
  return p.leader.invoked && !p.leader.shattered && hasKw(p.leader.def, 'Warlord') ? 1 : 0;
}

/** v23 Dread: −1 Might to all ENEMY units while this Leader is fielded — the
 * Void mirror of Commander, and the first Leader keyword that reaches across
 * the table. Applied inside effMight (which floors at 0), so the AI's every
 * Might read prices it automatically. Not yet printed on any Leader — see
 * LEADER_NEXT_KEYWORDS in cardpool.ts. */
function dreadPenalty(opp: PlayerState): number {
  return opp.leader.invoked && !opp.leader.shattered && hasKw(opp.leader.def, 'Dread') ? 1 : 0;
}

/** v23 Onslaught: +1 Might on your units while ATTACKING (only), while your
 * Leader is fielded — Commander's aggressive half at a cheaper weight.
 * Applied in the clash packet builder rather than effMight, so it never
 * inflates a guard's counter-damage. Not yet printed — see above. */
function onslaughtBonus(p: PlayerState): number {
  return p.leader.invoked && !p.leader.shattered && hasKw(p.leader.def, 'Onslaught') ? 1 : 0;
}

/** v7.3: how many real Sanctums (Location CARDS) a player controls. Basic
 * Wellsprings sit in the same `locations` array with no `def`, so a plain
 * `locations.length` counts them too — which would leave Ritual and Archivist
 * switched on permanently from about turn 3, since Wellsprings only ever
 * accumulate. Both keywords say "Sanctums", and this is what that means. */
function sanctumCount(p: PlayerState): number {
  return p.locations.filter((l) => l.def).length;
}

/** v7.3 Bulwark: each Bulwark Sanctum shaves 1 off every point of damage
 * dealt to its controller. Stacks, but can never reduce a hit below 0.
 *
 * Exported because the CPU has to price face damage the same way `damagePlayer`
 * pays it out: `chooseAttackers`' all-in check and `chooseGuards`' lethal check
 * both ask "how much Vitality is this attack worth", and a model that ignores
 * Bulwark answers a question the engine never asks. */
export function bulwarkReduction(p: PlayerState): number {
  return p.locations.filter((l) => l.def && hasKw(l.def, 'Bulwark')).length;
}

export function effMight(state: GameState, u: UnitInst): number {
  const p = state.players[u.owner];
  const item = u.items.reduce((s, c) => s + (c.def.bond?.might ?? 0), 0);
  return Math.max(
    0,
    (u.def.might ?? 0) +
      u.permMight +
      item +
      sanctumBonus(p, 'MIGHT_ALL') +
      commanderBonus(p) -
      dreadPenalty(state.players[opponentOf(u.owner)]),
  );
}

export function effGrit(state: GameState, u: UnitInst): number {
  const p = state.players[u.owner];
  const item = u.items.reduce((s, c) => s + (c.def.bond?.grit ?? 0), 0);
  return Math.max(
    0,
    (u.def.grit ?? 0) + u.permGrit + item + sanctumBonus(p, 'GRIT_ALL') + warlordBonus(p),
  );
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
  /** Which seat takes the first turn. Defaults to 'P1'. */
  firstPlayer?: PlayerId;
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
      unbondedItems: [],
      leader: {
        def: leaderDef,
        invoked: false,
        resolve: leaderDef.resolve ?? 0,
        shattered: false,
        abilityUsedThisTurn: false,
      },
      essence: {},
      wellspringPlayedThisTurn: false,
      wellspringsPlayedThisTurn: 0,
      invokedCardThisTurn: false,
    };
  };
  const firstPlayer = opts.firstPlayer ?? 'P1';
  const state: GameState = {
    players: { P1: mk('P1', deckP1), P2: mk('P2', deckP2) },
    active: firstPlayer,
    firstPlayer,
    phase: 'Dawn',
    turn: 1,
    winner: null,
    clash: null,
    stack: [],
    priority: null,
    log: [],
    dawnLog: [],
    rng,
  };
  const handSize = opts.handSize ?? STARTING_HAND;
  for (const p of [state.players.P1, state.players.P2]) {
    if (opts.shuffle !== false) shuffleArr(p.deck, rng);
    // v6.6: both players open on the same hand size. The second player's
    // first-mover compensation is now an extra opening Wellspring
    // (`wellspringAllowance`) rather than an 8th card — see the rationale
    // there: the measured P1 edge is a tempo lead, and the extra card was
    // compensating on the wrong axis.
    const n = handSize;
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
  // Only legal BEFORE the first turn (rulebook §3): nothing may have
  // happened in the game yet. `turn === 1` alone spanned BOTH players' first
  // turns (turn only increments after the second player's), which let the
  // second player redraw a full 8-card hand for free after watching the
  // first player's whole turn — and "hasn't invoked" missed Wellspring
  // plays, so a mulligan stayed legal mid-turn after seeing information.
  if (state.winner || state.turn !== 1 || state.clash) return false;
  if (state.active !== state.firstPlayer) return false;
  if (state.phase !== 'Dawn' && state.phase !== 'Main1') return false;
  for (const q of [state.players.P1, state.players.P2]) {
    if (q.invokedCardThisTurn || q.leader.invoked || q.wellspringsPlayedThisTurn > 0) return false;
  }
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
  const batch: { name: string; effect: Effect }[] = [];
  const units = unit ? [unit] : [...state.players[pid].field];
  for (const u of units) {
    for (const t of u.def.triggers ?? []) {
      if (t.when === when) batch.push({ name: u.def.name, effect: t.effect });
    }
  }
  // Sanctum Locations carry atDawn/atDusk triggers too (cardpool prints them
  // on roughly half of non-Bountiful Sanctums) — these were dead text until
  // v6.0: only units were ever scanned.
  if (!unit && (when === 'atDawn' || when === 'atDusk')) {
    for (const l of [...state.players[pid].locations]) {
      for (const t of l.def?.triggers ?? []) {
        if (t.when === when) batch.push({ name: l.def?.name ?? 'Sanctum', effect: t.effect });
      }
    }
  }
  // A controller's own simultaneous triggers go on the stack in the order they
  // choose; the engine picks board order for them. Pushed in reverse so that
  // LIFO resolution still runs them front-of-board first.
  for (const t of batch.reverse()) {
    pushStack(state, {
      kind: 'trigger',
      controller: pid,
      sourceName: t.name,
      effect: t.effect,
      targetIid: autoTarget(state, pid, t.effect),
    });
  }
}

// ---------------------------------------------------------------------------
// Stack & priority (APNAP)
// ---------------------------------------------------------------------------
let stackIdCounter = 0;

/** Turn order for a priority round: active player, then non-active player. */
export function apnapOrder(state: GameState): [PlayerId, PlayerId] {
  return [state.active, opponentOf(state.active)];
}

/** Put an item on the stack. Its controller keeps priority, and any passes
 * already recorded are void — the stack changed, so everyone answers again. */
function pushStack(state: GameState, item: Omit<StackItem, 'id'>): StackItem {
  const full: StackItem = { ...item, id: `s${++stackIdCounter}` };
  state.stack.push(full);
  state.priority = { holder: full.controller, passed: [] };
  return full;
}

/** Essence a player could produce right now: floating pool plus every untapped
 * Location counted by its yield. */
export function potentialEssence(p: PlayerState): Partial<Record<EssenceType, number>> {
  const pool: Partial<Record<EssenceType, number>> = { ...p.essence };
  for (const l of p.locations) {
    if (!l.exhausted) pool[l.produces] = (pool[l.produces] ?? 0) + locationYield(l);
  }
  return pool;
}

/** Is this card playable at instant speed (i.e. whenever its controller holds
 * priority) rather than only in their own main phase? */
export function isInstantSpeed(def: CardDef): boolean {
  if (def.type === 'Event') return def.subtype === 'Quick';
  return def.type === 'Unit' && hasKw(def, 'Ambush');
}

/**
 * Does `pid` hold anything they could actually respond with? Costs are checked
 * against essence they could still tap for, so a player is never auto-passed
 * just because their Locations are untapped.
 */
export function hasInstantResponse(state: GameState, pid: PlayerId): boolean {
  if (state.winner) return false;
  const p = state.players[pid];
  const pool = potentialEssence(p);
  return p.hand.some((c) => {
    if (!isInstantSpeed(c.def)) return false;
    return canPayCost(pool, effectiveCost(state, pid, c.def));
  });
}

/** Does `pid` currently hold priority? */
export function hasPriority(state: GameState, pid: PlayerId): boolean {
  return state.priority?.holder === pid;
}

/**
 * Should the priority loop actually stop and wait for `pid`? Only when there
 * is something of the opponent's to answer and `pid` holds an answer.
 */
export function canRespondNow(state: GameState, pid: PlayerId): boolean {
  const top = state.stack[state.stack.length - 1];
  if (!top || top.controller === pid) return false;
  return hasInstantResponse(state, pid);
}

/**
 * Pass priority. When both players have passed in succession the top of the
 * stack resolves (and priority returns to the active player, per APNAP); with
 * an empty stack the window simply closes.
 */
export function passPriority(state: GameState, pid: PlayerId): boolean {
  const pr = state.priority;
  if (!pr || pr.holder !== pid || state.winner) return false;
  const passed = pr.passed.includes(pid) ? pr.passed : [...pr.passed, pid];
  if (passed.length < 2) {
    state.priority = { holder: opponentOf(pid), passed };
    return true;
  }
  if (state.stack.length === 0) {
    state.priority = null;
    return true;
  }
  resolveTop(state);
  // Only reopen a window if the game is still live; an empty stack after the
  // last resolution closes out on the next round of passes.
  state.priority = state.winner ? null : { holder: state.active, passed: [] };
  return true;
}

/** One-line account of what a resolving trigger is about to do. Triggers were
 * the last class of board change with no log line at all on the SUCCESS path
 * (only their fizzles were logged) — an "At Dusk" Sanctum could damage a unit,
 * erode the deck or exhaust something and the narrator had no sentence for it,
 * so the board simply changed between beats (v23; same shape as the v22
 * Dawn/Dusk keyword lines). */
function triggerNote(state: GameState, item: StackItem): string {
  const eff = item.effect!;
  const v = eff.value ?? 0;
  const t = item.targetIid;
  const target = t === 'P1' || t === 'P2' ? t : t ? findUnit(state, t)?.def.name : undefined;
  switch (eff.action) {
    case 'damage':
      return `deals ${v} damage${target ? ` to ${target}` : ''}`;
    case 'heal':
      return target ? `restores ${v} to ${target}` : `restores ${v}`;
    case 'draw':
      return `deals ${v} card${v === 1 ? '' : 's'} to ${item.controller}`;
    case 'buff':
      return target ? `gives ${target} +${v}/+${v}` : `gives its side +${v}/+${v}`;
    case 'shatter':
      return target ? `shatters ${target}` : 'shatters';
    case 'banish':
      return target ? `banishes ${target}` : 'banishes';
    case 'erode':
      return `erodes ${v} card${v === 1 ? '' : 's'} from ${opponentOf(item.controller)}'s deck`;
    case 'recover':
      return target ? `recovers ${target}` : 'recovers';
    case 'exhaust':
      return target ? `exhausts ${target}` : 'exhausts';
    case 'weaken':
      return target ? `gives ${target} -${v}/-${v}` : 'weakens';
    default:
      return 'resolves';
  }
}

/** Resolve the top item of the stack. */
function resolveTop(state: GameState): void {
  const item = state.stack.pop();
  if (!item) return;
  if (item.kind === 'trigger') {
    if (fizzles(state, item, item.effect)) {
      state.log.push(`${item.sourceName}'s trigger fizzles — no legal target.`);
      return;
    }
    state.log.push(`${item.sourceName}'s trigger ${triggerNote(state, item)}.`);
    applyEffect(state, item.controller, item.effect!, item.targetIid);
  } else {
    resolveInvokedCard(state, item);
  }
  stateBasedChecks(state);
}

/** An item with an explicit target fizzles if that target is no longer legal —
 * the response window is what makes this reachable at all. */
function fizzles(state: GameState, item: StackItem, eff?: Effect): boolean {
  if (!eff || item.targetIid === undefined) return false;
  if (!SINGLE_TARGETS.includes(eff.target)) return false;
  return !canTarget(state, item.controller, eff, item.targetIid);
}

/**
 * Run the priority loop until either the stack is empty or a player actually
 * has a response to hold. Players with nothing to respond with are passed for
 * automatically, so a board with no instant-speed cards behaves exactly as if
 * everything resolved on invocation.
 *
 * The loop only ever stops for the player who did NOT put the top item on the
 * stack: you answer your opponent's cards and triggers, not your own. That
 * keeps callers from having to drive a priority round after every single
 * action, at the cost of not being able to chain a second card in response to
 * your own — a trade the interaction this unlocks is not worth complicating.
 *
 * `interactive: false` drains the stack outright — used inside steps the
 * rulebook gives no response window to (combat damage, Dawn, Dusk).
 */
export function settleStack(state: GameState, opts: { interactive?: boolean } = {}): void {
  const interactive = opts.interactive ?? true;
  // Bounded so a pathological trigger loop can never hang the game.
  let guard = 256;
  while (state.priority && !state.winner && guard-- > 0) {
    const holder = state.priority.holder;
    if (interactive && canRespondNow(state, holder)) return;
    passPriority(state, holder);
  }
  if (guard <= 0) {
    state.log.push('Resolution limit reached — remaining stack discarded.');
    state.stack.length = 0;
    state.priority = null;
  }
}

/** Resolve everything pending with no response windows at all. */
function drainStack(state: GameState): void {
  if (state.stack.length > 0 && !state.priority) {
    state.priority = { holder: state.active, passed: [] };
  }
  settleStack(state, { interactive: false });
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
  // Shatter whiffs on an Unbreakable unit that still holds this turn's save
  // (v7.5 — it is once per turn now, so one that has already spent it is a
  // legal, killable target). Exclude only the ones the effect would no-op on,
  // so a shatter is never pointed at a whiff while a killable target sits
  // legal, and IS pointed at a wall whose shield is already down.
  const excludeUnbreakable = eff.action === 'shatter';
  const biggestEnemy = [...opp.field]
    .filter((u) => !unitHasKw(u, 'Warded') && !(excludeUnbreakable && unbreakableUp(u)))
    .sort((a, b) => effMight(state, b) - effMight(state, a))[0];
  switch (eff.target) {
    case 'enemyUnit': {
      // v6.9: exhausting an already-exhausted unit does nothing — prefer the
      // biggest READY body, and only fall back to the general pick if the
      // whole enemy board is already tapped out.
      if (eff.action === 'exhaust') {
        const ready = [...opp.field]
          .filter((u) => !u.exhausted && !unitHasKw(u, 'Warded'))
          .sort((a, b) => effMight(state, b) - effMight(state, a))[0];
        if (ready) return ready.iid;
      }
      return biggestEnemy?.iid;
    }
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
  /** Fired once per (attacker, guard) pair as `chooseGuards` (ai.ts) assigns
   * a guard, with whether the defender was already facing lethal damage
   * (`mustSurvive`) at the moment of assignment — a forced chump-block
   * assigned only to survive is not the same CPU-quality signal as a
   * discretionary guard that dies for nothing. */
  onGuardAssign?: (attackerIid: string, guardIid: string, mustSurvive: boolean) => void;
  /** Fired by `chooseAttackers` (ai.ts) at the exact moment it returns, with
   * the live state it actually decided from and the attacker set it picked.
   * The harness's pre-Main1 snapshot could never distinguish a real CPU
   * disagreement from Main-I board changes between the snapshot and the
   * Clash; this hook removes that ambiguity entirely. */
  onAttackDecision?: (state: GameState, pid: PlayerId, chosen: string[]) => void;
  /** Fired when the CPU reserves a hand card + locations for the opponent's
   * reaction window (`reserved` true), and again at end of turn with whether
   * the reservation was ever cashed in. */
  onReservation?: (pid: PlayerId, cardIid: string, cost: number) => void;
}
/** Mutable hook registry — the sim harness assigns, the UI leaves empty. */
export const telemetry: EngineTelemetry = {};

/** Siphon vitality gain, capped at starting Vitality (same cap as healing). */
function siphonGain(state: GameState, source: UnitInst, amount: number): void {
  const p = state.players[source.owner];
  const gained = Math.min(LEADER_HP, p.vitality + amount) - p.vitality;
  p.vitality += gained;
  if (gained > 0) {
    telemetry.onKeywordProc?.('Siphon', gained);
    // Logged (v23): the one keyword that moves a VITALITY total upward had no
    // line — the opponent's life went up "from nowhere" mid-clash.
    state.log.push(`${source.def.name}'s Siphon restores ${gained} Vitality to ${source.owner}.`);
  }
}

// Returns the net damage that actually landed after mitigation — callers use
// it to decide whether the source "dealt clash damage" (a hit fully absorbed by
// Hardened or Bulwark deals none and must not fire dealsClashDamage/Tidecaller).
function damageUnit(state: GameState, u: UnitInst, amount: number, source?: UnitInst): number {
  if (amount <= 0) return 0;
  // v6.0 Hardened: every packet of damage dealt to this unit is reduced by 1.
  if (unitHasKw(u, 'Hardened')) {
    amount -= 1;
    telemetry.onKeywordProc?.('Hardened', 1);
    if (amount <= 0) return 0; // fully absorbed: no venom mark, no siphon
  }
  u.damage += amount;
  if (source && unitHasKw(source, 'Venomous')) u.venomed = true;
  if (source && unitHasKw(source, 'Siphon')) siphonGain(state, source, amount);
  // v6.9 Withering: damage from this source also permanently erodes 1 Grit.
  // Applied through permGrit (effGrit floors at 0), so it survives healing —
  // marked damage clears, the shrunken body does not.
  if (source && unitHasKw(source, 'Withering')) {
    u.permGrit -= 1;
    telemetry.onKeywordProc?.('Withering', 1);
  }
  return amount;
}

function damagePlayer(state: GameState, pid: PlayerId, amount: number, source?: UnitInst): number {
  if (amount <= 0) return 0;
  // v7.3 Bulwark: reduce before anything else reads the number, so Siphon
  // gains only what actually landed.
  const reduced = Math.max(0, amount - bulwarkReduction(state.players[pid]));
  if (reduced <= 0) return 0;
  if (reduced < amount) telemetry.onKeywordProc?.('Bulwark', amount - reduced);
  state.players[pid].vitality -= reduced;
  if (source && unitHasKw(source, 'Siphon')) siphonGain(state, source, reduced);
  return reduced;
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
    // v6.9 tempo denial: exhaust an enemy unit so it can neither attack on
    // its controller's turn nor guard on yours until their next Dawn.
    case 'exhaust': {
      if (eff.target === 'allEnemyUnits') {
        for (const u of opp.field) u.exhausted = true;
        break;
      }
      const t = resolveTarget();
      const u = t ? findUnit(state, t) : undefined;
      if (u && u.owner !== pid) u.exhausted = true;
      break;
    }
    // v6.9 attrition: permanently shrink a body rather than killing it.
    // effMight/effGrit floor at 0, and a unit shrunk to 0 Grit is caught by
    // the lethal check in stateBasedChecks below.
    case 'weaken': {
      const shrink = (u: UnitInst) => {
        u.permMight -= v;
        u.permGrit -= v;
      };
      if (eff.target === 'allEnemyUnits') {
        for (const u of [...opp.field]) shrink(u);
        break;
      }
      const t = resolveTarget();
      const u = t ? findUnit(state, t) : undefined;
      if (u && u.owner !== pid) shrink(u);
      break;
    }
  }
  stateBasedChecks(state);
}

// ---------------------------------------------------------------------------
// Leaving the field / state-based checks
// ---------------------------------------------------------------------------
/** Remove a unit from the field to the ash-pile ('ash') or The Void ('void').
 * Charms go to the ash-pile; Weapons and Tools stay on the field unbonded. */
function removeUnit(state: GameState, u: UnitInst, dest: 'ash' | 'void'): void {
  const p = state.players[u.owner];
  const idx = p.field.indexOf(u);
  if (idx < 0) return;
  // Read leave-the-field keywords BEFORE the bonded Items are unhooked —
  // an Item-granted Wildfire is still granted at the moment of death.
  const wildfire = unitHasKw(u, 'Wildfire');
  p.field.splice(idx, 1);
  for (const item of u.items) {
    // v6.0 Soulbound: the Item returns to its owner's hand instead of dying
    // with (or outliving) its unit.
    if (hasKw(item.def, 'Soulbound')) {
      telemetry.onKeywordProc?.('Soulbound', 1);
      p.hand.push({ iid: item.iid, def: item.def });
    } else if (itemSurvives(item.def.subtype)) p.unbondedItems.push(item);
    else p.ashPile.push({ iid: item.iid, def: item.def });
  }
  u.items = [];
  const inst: CardInst = { iid: u.iid, def: u.def };
  if (dest === 'void') p.voidPile.push(inst);
  else p.ashPile.push(inst);
  state.log.push(`${u.def.name} ${dest === 'void' ? 'was banished' : 'was shattered'}.`);
  // v6.9 Wildfire: a parting shot at the enemy player. Fires on banish too,
  // for the same reason 'dies' triggers do (see below).
  if (wildfire) {
    telemetry.onKeywordProc?.('Wildfire', 2);
    const landed = damagePlayer(state, opponentOf(u.owner), 2);
    // Logged (v23): the player lost Vitality with only "X was shattered." on
    // the record to explain it — the parting shot itself had no line.
    if (landed > 0)
      state.log.push(`${u.def.name}'s Wildfire deals ${landed} damage to ${opponentOf(u.owner)}.`);
  }
  // Rulebook "when ... leaves the field" has no ash/void distinction: 'dies'
  // triggers fire on banish too.
  runTriggers(state, u.owner, 'dies', u);
}

/**
 * v7.5: is this unit's Unbreakable save actually up right now? The save is
 * spendable (once per game as of v16), so "has the keyword" and "cannot be
 * killed this instant" are different questions, and every caller that used to
 * ask the first one wants this one.
 */
export function unbreakableUp(u: UnitInst): boolean {
  return unitHasKw(u, 'Unbreakable') && !u.unbreakableSpent;
}

/**
 * Shatter a unit. Unbreakable prevents it, but only once per game (v16 — see
 * `unbreakableSpent`). Returns true if it was shattered.
 */
export function shatterUnit(state: GameState, u: UnitInst): boolean {
  if (unitHasKw(u, 'Unbreakable') && !u.unbreakableSpent) {
    u.unbreakableSpent = true;
    telemetry.onKeywordProc?.('Unbreakable', 1);
    return false;
  }
  removeUnit(state, u, 'ash');
  return true;
}

/** State-based checks: lethal damage/venom shatters (Unbreakable survives),
 * vitality <= 0 loses, clash bookkeeping drops dead participants. */
export function stateBasedChecks(state: GameState): void {
  for (const pid of ['P1', 'P2'] as PlayerId[]) {
    const p = state.players[pid];
    for (const u of [...p.field]) {
      const eff = effGrit(state, u);
      // A unit whose Grit has been weakened to 0 dies as a state-based rule
      // regardless of Unbreakable — that keyword saves from damage/shatter, not
      // a Grit deficit — and, critically, must NOT consume the once-per-turn
      // save. Handling it before the Unbreakable branch avoids burning the save
      // on a death it can't prevent (the deficit persists, so the next SBC
      // would kill the unit anyway a tick later within the same action).
      if (eff <= 0) {
        removeUnit(state, u, 'ash');
        continue;
      }
      const lethal = u.damage >= eff || u.venomed;
      if (!lethal) continue;
      if (unitHasKw(u, 'Unbreakable') && !u.unbreakableSpent) {
        // v7.5: the save is spent for the turn. v16: the unit survives AT THE
        // BRINK — marked damage is set to one below its effective Grit — where
        // v7.5 reset it to 0. The 0 was only ever there to stop this check
        // re-firing on the same marked damage a tick later, but it
        // over-delivered: every proc was also a free full heal, so chip
        // damage never accumulated on a wall and the save was worth its own
        // Grit in healing every single turn — a power the printed text
        // ("prevent the first effect that would... deal it lethal damage")
        // never promised. That unprinted heal is what five levers across
        // v7.4-v16 (cost, keyword bound, printed effect, stats, and the v16
        // surcharge ceiling) could not price: the keyword read
        // +14.6/+12.7/+13.9/+12.9 across four cohorts in v7.7 and the two
        // big carriers held ~+10 ramp-state residual even printed at cost 9.
        // At the brink the save still defeats the killing blow — the text is
        // honoured — but the wall stays wounded: with the save spent (once
        // per game, see nextTurn's Dawn comment), any single later ping
        // finishes it. eff >= 1 is guaranteed here (the 0-Grit deficit rule
        // above already removed eff <= 0 bodies), so this never marks
        // negative damage.
        u.unbreakableSpent = true;
        u.damage = eff - 1;
        u.venomed = false;
        // Every other keyword reports its procs, so the balance harness can
        // price it. This one never did — it read as 0 activations however many
        // lethal hits it walked away from, which is exactly the signal that
        // matters for the most expensive keyword in the table.
        telemetry.onKeywordProc?.('Unbreakable', 1);
        continue;
      }
      const byVenom = u.venomed && u.damage < eff;
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
  // v22 — where this Dawn begins in the log, so the match UI can narrate it
  // (see `GameState.dawnLog`, filled in at the bottom of this function).
  const dawnLogStart = state.log.length;
  // Aggregated so a wide board is one line per KEYWORD rather than one per
  // unit — a six-unit Thriving board narrated unit-by-unit is six beats of the
  // opponent's turn spent on the same fact.
  let regenerated = 0;
  let thriving = 0;
  let vitalityGained = 0;
  let empowered = 0;
  // v16: Unbreakable is ONCE PER GAME — the spent save never recharges. The
  // v7.5 every-Dawn reset (one save per turn of the game) survived the whole
  // lever ladder: cost, keyword bound, printed-effect and stat trims on its
  // carriers (v7.4-v7.6), then this pass's surcharge-above-the-cap pricing
  // (carriers reprinted at 8-9) and the brink rule (the save stopped healing
  // the wall) — and the keyword STILL read +14.0/+13.6/+13.7/+12.7 across
  // four cohorts with carriers winning 59-70% of their games. A save that
  // returns every turn forces the opponent to overcommit every turn, and no
  // price in a 9-ceiling format covers an arbitrary number of forced
  // overcommits. One save per game is priceable text.
  for (const u of p.field) {
    u.exhausted = false;
    u.enteredThisTurn = false;
    // v6.0 Regenerate: heals all marked damage at its controller's Dawn.
    if (u.damage > 0 && unitHasKw(u, 'Regenerate')) {
      telemetry.onKeywordProc?.('Regenerate', u.damage);
      u.damage = 0;
      regenerated++;
    }
    // v6.9 Thriving: compounding growth, one point of each per Dawn.
    if (unitHasKw(u, 'Thriving')) {
      u.permMight += 1;
      u.permGrit += 1;
      telemetry.onKeywordProc?.('Thriving', 1);
      thriving++;
    }
    // v6.9 Radiant: a slow drip of Vitality while it holds the field.
    if (unitHasKw(u, 'Radiant') && p.vitality < LEADER_HP) {
      p.vitality += 1;
      telemetry.onKeywordProc?.('Radiant', 1);
      vitalityGained++;
    }
    // v7.3 Empowering: each Empowering Item grows the unit it is bonded to.
    const empowering = u.items.filter((c) => hasKw(c.def, 'Empowering')).length;
    if (empowering > 0) {
      u.permMight += empowering;
      telemetry.onKeywordProc?.('Empowering', empowering);
      empowered++;
    }
  }
  if (regenerated > 0) state.log.push(`${p.id}'s Regenerate heals ${regenerated} unit(s).`);
  if (thriving > 0) state.log.push(`${p.id}'s Thriving unit(s) grow +1/+1 (${thriving}).`);
  if (empowered > 0) state.log.push(`${p.id}'s Empowering Item(s) grow ${empowered} unit(s).`);
  for (const l of p.locations) l.exhausted = false;
  p.leader.abilityUsedThisTurn = false;
  p.wellspringPlayedThisTurn = false;
  p.wellspringsPlayedThisTurn = 0;
  // v6.0 Surge tracking resets for both players at every turn boundary.
  state.players.P1.invokedCardThisTurn = false;
  state.players.P2.invokedCardThisTurn = false;
  // v6.0 Sacred: each Sacred Location restores 1 Vitality at its Dawn.
  //
  // v7.6 measured the EFFECT side of this keyword to exhaustion — the lever
  // six passes of price trials had left as the only one untried — and the
  // result is that Sacred is not the variable at all. Unchanged, and this is
  // the closing entry rather than a to-do:
  //
  //   trial                        stone_bubbles (A / B)   Sacred delta (A / B)
  //   baseline                     +9.2 / +7.3             21.9 / 19.2
  //   exhaust the Sanctum to heal  +7.2 / +8.0             19.2 / 19.4
  //   finite: 3 charges            +8.9 / +7.1             21.1 / 18.6
  //   NULL — effect deleted        +7.4 / +6.2             18.6 / 15.8
  //
  // Read the last row. With the keyword's text removed outright — not
  // repriced, not bounded, gone — the card is still +7.4 / +6.2 and its
  // carriers still win 73.0% / 69.7% on an 18.6 / 15.8 normalized delta. The
  // whole effect is worth about a point and a half of residual, so no
  // effect-side lever could have moved this card into band; the charge cap
  // bought -0.3 / -0.2, which is noise, and shipping it would have taken text
  // off a card in exchange for nothing measurable.
  //
  // Where the residual actually lives is `metricDiagnostics.locationsByCost`,
  // added for this: cost-2 Sanctums read +5.72 / +5.42 as a CLASS, and the
  // ones with no keyword at all read +5.75 / +5.80 — at or above their
  // keyworded neighbours in both cohorts. `stone_bubbles` is a cost-2 Sanctum,
  // and so is most of its residual. See BALANCE_SIM_FINDINGS §1.
  //
  // The v7.5 diagnosis this replaces — "free value every turn on a near-
  // permanent, where the Unit equivalent is fine because units die" — is a
  // good design argument that happens to describe about 1.5 points of win
  // rate. It was never load-bearing enough to explain a +9.
  for (const l of p.locations) {
    if (l.def && hasKw(l.def, 'Sacred') && p.vitality < LEADER_HP) {
      p.vitality += 1;
      telemetry.onKeywordProc?.('Sacred', 1);
      vitalityGained++;
    }
  }
  if (vitalityGained > 0) {
    state.log.push(`${p.id} recovers ${vitalityGained} Vitality at Dawn.`);
  }
  // v7.3 Archivist: card advantage that only switches on once the Sanctum
  // board is actually built out — the payoff half of a ramp deck, where
  // Ritual (below, on Events) is the discount half.
  if (sanctumCount(p) >= 3) {
    const archivists = p.locations.filter((l) => l.def && hasKw(l.def, 'Archivist')).length;
    if (archivists > 0) {
      telemetry.onKeywordProc?.('Archivist', archivists);
      state.log.push(`${p.id}'s Archivist deals ${archivists} extra card(s).`);
      dealCards(state, state.active, archivists);
    }
  }
  // v7.5 Glaciate: repeating tempo denial on a Sanctum — one enemy unit
  // frozen per Glaciate every Dawn. `exhaust` picks its own target through
  // autoTarget, the same as every other untargeted keyword effect.
  //
  // v7.6: EVERY OTHER Dawn. Glaciate came in over on its first measured run
  // and reproduced in both cohorts (+11.5 n=283 / +12.0 n=965), and v7.5 then
  // established that its price is not a lever — the 3 -> 5 weight raise did
  // not balance the carriers, it deleted them from the format, which is the
  // same binary failure three per-card Location cost trials and the v7.2
  // Sacred raise had already produced. So the v7.5 doc carried it forward for
  // an effect-side lever and named this one.
  //
  // The counter is per-SANCTUM rather than per-turn on purpose: a player with
  // two Glaciates should get one freeze a turn between them, not two freezes
  // every other turn. A Sanctum that arrives asleep would also hand the
  // opponent a free turn on the one turn a tempo card most needs to matter,
  // so a fresh Glaciate fires on its first Dawn and rests on the next.
  const glaciate = p.locations.filter((l) => l.def && hasKw(l.def, 'Glaciate'));
  for (const l of glaciate) {
    if (l.glaciateAsleep) {
      l.glaciateAsleep = false;
      continue;
    }
    l.glaciateAsleep = true;
    telemetry.onKeywordProc?.('Glaciate', 1);
    // Named, not counted. This is the one Dawn keyword that reaches across the
    // table — a unit the OPPONENT owns stops being able to attack or guard —
    // and until v22 it did that with no log line and no beat: the player found
    // out by noticing a greyed-out card. `applyEffect` picks the target itself
    // through `autoTarget` and reports nothing, so diff the enemy field around
    // the call to learn which one it took.
    const frozenBefore = new Set(
      state.players[opponentOf(state.active)].field.filter((u) => u.exhausted).map((u) => u.iid),
    );
    applyEffect(state, state.active, { action: 'exhaust', target: 'enemyUnit' });
    const frozen = state.players[opponentOf(state.active)].field.find(
      (u) => u.exhausted && !frozenBefore.has(u.iid),
    );
    if (frozen) state.log.push(`${p.id}'s Glaciate freezes ${frozen.def.name}.`);
  }
  // v6.0 Resolute: an invoked Leader recovers 1 Resolve, up to its printed value.
  const L = p.leader;
  if (L.invoked && !L.shattered && hasKw(L.def, 'Resolute') && L.resolve < (L.def.resolve ?? 0)) {
    L.resolve += 1;
    telemetry.onKeywordProc?.('Resolute', 1);
    state.log.push(`${p.id}'s Leader recovers 1 Resolve (Resolute).`);
  }
  // v23 Beacon: an invoked Leader restores 1 Vitality at its Dawn — Radiant's
  // shape moved onto the Leader zone. Logged like every other Dawn proc, so
  // the match narrator has a line for it. Not yet printed on any Leader.
  if (L.invoked && !L.shattered && hasKw(L.def, 'Beacon') && p.vitality < LEADER_HP) {
    p.vitality += 1;
    telemetry.onKeywordProc?.('Beacon', 1);
    state.log.push(`${p.id}'s Leader restores 1 Vitality (Beacon).`);
  }
  runTriggers(state, state.active, 'atDawn');
  drainStack(state); // Dawn is not a response window — resolve before the Deal.
  // Deal 1 (first player skips on turn 1).
  if (!(state.turn === 1 && state.active === state.firstPlayer)) dealCards(state, state.active, 1);
  state.dawnLog = state.log.slice(dawnLogStart);
  if (!state.winner) state.phase = 'Main1';
}

function runDusk(state: GameState): void {
  const p = state.players[state.active];
  state.phase = 'Dusk';
  runTriggers(state, state.active, 'atDusk');
  drainStack(state);
  // v6.9 Entropic: each one mills the opponent for 1 at its controller's Dusk.
  const entropic = p.field.filter((u) => unitHasKw(u, 'Entropic')).length;
  if (entropic > 0) {
    telemetry.onKeywordProc?.('Entropic', entropic);
    // Logged (v22): eroding the opponent's deck is a real clock on a real win
    // condition — deck-out ends the game — and it happened silently. The Ash
    // pile grew, the deck counter ticked down, and no line anywhere connected
    // the two.
    state.log.push(
      `${p.id}'s Entropic erodes ${entropic} card(s) from ${opponentOf(state.active)}'s deck.`,
    );
    applyEffect(state, state.active, { action: 'erode', value: entropic, target: 'enemyPlayer' });
  }
  // v7.3 Blighted: Entropic's Location-side counterpart.
  const blighted = p.locations.filter((l) => l.def && hasKw(l.def, 'Blighted')).length;
  if (blighted > 0) {
    telemetry.onKeywordProc?.('Blighted', blighted);
    state.log.push(
      `${p.id}'s Blighted erodes ${blighted} card(s) from ${opponentOf(state.active)}'s deck.`,
    );
    applyEffect(state, state.active, { action: 'erode', value: blighted, target: 'enemyPlayer' });
  }
  // v7.5 Scorched-Earth: Ember's Location text — a recurring board sweep,
  // which is why it is the most expensive entry in KEYWORD_COST for the type.
  //
  // v7.6: the sweep is GATED ON SANCTUM COUNT, the other effect-side lever the
  // v7.5 doc named when it recorded that this keyword's price is inert (+22.3
  // on its first measured run, and the 3 -> 5 raise deleted its best-sampled
  // carrier from the format rather than pricing it). Three Sanctums is the
  // same gate Ritual and Archivist already use, so the pool has one ramp
  // threshold rather than a new one per keyword — and it makes an unconditional
  // repeating sweep into the payoff half of a ramp deck, which is what an
  // every-Dusk board wipe should have to be built toward.
  const scorched = p.locations.filter((l) => l.def && hasKw(l.def, 'Scorched-Earth')).length;
  if (scorched > 0 && sanctumCount(p) >= 3) {
    telemetry.onKeywordProc?.('Scorched-Earth', scorched);
    // A repeating board sweep is the loudest thing either player can do and it
    // was the quietest: units died at the opponent's Dusk with only the
    // shatter lines to explain them, and those name the unit, not the cause.
    state.log.push(
      `${p.id}'s Scorched-Earth sweeps ${opponentOf(state.active)}'s units for ${scorched}.`,
    );
    applyEffect(state, state.active, {
      action: 'damage',
      value: scorched,
      target: 'allEnemyUnits',
    });
  }
  // The Dusk sweeps above (Entropic/Blighted/Scorched-Earth) can kill units and
  // push their dies-triggers onto the stack. §6 requires anything put on the
  // stack inside a step to resolve before the step continues — without this
  // drain those triggers leak past the turn boundary and resolve only in the
  // opponent's Dawn, AFTER it has reset Unbreakable saves, Regenerate, and
  // Thriving, silently changing their targets and outcomes.
  drainStack(state);
  // Shed to MAX_HAND. The chooser (installed by the UI) decides WHICH cards
  // go — it runs HERE, after the Dusk triggers above, because those triggers
  // can draw: a pick made before ending the turn couldn't include a card
  // drawn at Dusk, and the old shed-from-the-end always discarded exactly
  // that card with no player input. The chooser may throw to pause (the UI's
  // picker); the UI then resumes via finishDuskShed with the chosen iids.
  if (p.hand.length > MAX_HAND && state.chooseShed) {
    const picked = state.chooseShed(state, state.active, p.hand.length - MAX_HAND);
    finishDuskShed(state, picked);
    return;
  }
  finishDuskShed(state);
}

/** Move `picked` cards to the back of the turn player's hand so the
 * shed-from-the-end loop discards exactly those. Unknown iids are ignored. */
function applyShedOrder(state: GameState, picked: string[]): void {
  const p = state.players[state.active];
  const chosen = new Set(picked);
  const keep = p.hand.filter((c) => !chosen.has(c.iid));
  const shed = p.hand.filter((c) => chosen.has(c.iid));
  p.hand.splice(0, p.hand.length, ...keep, ...shed);
}

/**
 * Complete Dusk from the shed step on: shed to MAX_HAND (the `picked` cards
 * first, then from the end), clear the clash, pass the turn and run the next
 * player's Dawn. Exported so a UI whose `chooseShed` hook paused the turn
 * (by throwing) can resume it once the player has picked.
 */
export function finishDuskShed(state: GameState, picked?: string[]): void {
  const p = state.players[state.active];
  if (picked) applyShedOrder(state, picked);
  while (p.hand.length > MAX_HAND) {
    const c = p.hand.pop()!;
    p.ashPile.push(c);
    state.log.push(`${p.id} sheds ${c.def.name}.`);
  }
  // Defensive: a clash never survives the turn that opened it. The normal
  // Clash -> Main2 transition already nulls this, but any path that reaches
  // Dusk with a stale clash object would otherwise freeze the NEXT player's
  // combat outright (declareAttackers refuses while `clash` is set).
  state.clash = null;
  state.active = opponentOf(state.active);
  if (state.active === state.firstPlayer) state.turn++;
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
  // Ending a phase is a concession of priority: anything still pending
  // resolves before the phase actually changes.
  drainStack(state);
  if (state.winner) return false;
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

/**
 * Sorcery-speed timing: own main phase AND an empty stack. Sorcery-speed cards
 * already enforce this via timingLegal (inOwnMain && stack empty). The other
 * sorcery-speed actions (Wellspring, re-bond, Leader invoke/ability) checked
 * only inOwnMain, so while the active player held a card on the stack and the
 * opponent had a legal response pending, they could still fire — jumping the
 * queue over that response (and activateLeaderAbility would drainStack it away).
 */
function inOwnMainClear(state: GameState, pid: PlayerId): boolean {
  return inOwnMain(state, pid) && state.stack.length === 0;
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

/**
 * Wellsprings this player may play this turn: one, except the second player
 * on their own opening turn, who gets two.
 *
 * **[digital]** first-mover compensation. Six consecutive balance passes
 * measured P1 at ~59-63% despite P2's extra opening card, and the v6.6
 * harness finally located the edge: it is concentrated in SHORT games (76.5%
 * P1 at <=10 turns, 64.6% at 11-20) and washes out entirely by turn 21+
 * (51.8%). That is the signature of a tempo/race lead, not a card-advantage
 * one — so an extra card was compensating on the wrong axis. The extra
 * opening Wellspring pays P2 back in tempo, on the axis the edge actually
 * accrues on.
 */
export function wellspringAllowance(state: GameState, pid: PlayerId): number {
  return pid !== state.firstPlayer && state.turn === 1 ? 2 : 1;
}

/** Play one basic Wellspring (auto-supplied) — own main phase, within this
 * turn's allowance, type must be inside the Leader's identity. */
export function playWellspring(state: GameState, pid: PlayerId, type: EssenceType): boolean {
  const p = state.players[pid];
  if (state.winner || !inOwnMainClear(state, pid) || p.wellspringPlayedThisTurn) return false;
  if (!wellspringChoices(state, pid).includes(type)) return false;
  // The second player's bonus opening Wellspring enters EXHAUSTED: it ramps
  // them into turn 2 rather than handing them a turn-1 tempo swing. A ready
  // one measured far too strong (P1 41.9%, a 19-point overcorrection).
  p.locations.push({
    iid: nextIid(`wellspring_${type}`),
    produces: type,
    exhausted: p.wellspringsPlayedThisTurn > 0,
  });
  p.wellspringsPlayedThisTurn++;
  p.wellspringPlayedThisTurn = p.wellspringsPlayedThisTurn >= wellspringAllowance(state, pid);
  state.log.push(`${pid} plays a ${type} Wellspring.`);
  return true;
}

/** Exhaust a Location to add 1 essence of its type. Legal in own main phase
 * or while the reaction window is open for this player. */
export function tapLocationForEssence(state: GameState, pid: PlayerId, locIid: string): boolean {
  const p = state.players[pid];
  if (state.winner) return false;
  // Holding priority is enough: a response window is worthless if you cannot
  // produce the essence to pay for the response.
  if (!inOwnMain(state, pid) && !reactionOpenFor(state, pid) && !hasPriority(state, pid))
    return false;
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
  const surged = hasKw(def, 'Surge') && state.players[pid].invokedCardThisTurn;
  // v7.3 Ritual: the same shape of conditional discount as Surge, on a
  // different condition (a built-out Sanctum board rather than a second
  // invoke this turn). A card carrying both still only ever discounts once.
  const ritual = hasKw(def, 'Ritual') && sanctumCount(state.players[pid]) >= 3;
  if (!surged && !ritual) return cost;
  if (cost.generic > 0) return { generic: cost.generic - 1, pips: cost.pips };
  for (const t of COLORS) {
    if ((cost.pips[t] ?? 0) > 0) {
      return { generic: 0, pips: { ...cost.pips, [t]: (cost.pips[t] ?? 0) - 1 } };
    }
  }
  return cost;
}

function timingLegal(state: GameState, pid: PlayerId, def: CardDef): boolean {
  // Instant speed: any window where this player holds priority — including
  // holding a response over something already on the stack.
  if (isInstantSpeed(def)) {
    return inOwnMain(state, pid) || reactionOpenFor(state, pid) || hasPriority(state, pid);
  }
  // Everything else is sorcery speed: own main phase, nothing pending.
  return inOwnMain(state, pid) && state.stack.length === 0;
}

/** The sentinel `bondTargetIid` that casts a Charm on its controller instead
 * of on one of their units (rulebook §7: "cast on players or units"). */
export const BOND_TARGET_SELF = 'self';

/** Can this hand card be invoked right now (timing + current essence pool +
 * a bond target existing for Items)? A Charm needs no unit — it can be cast
 * on its controller — so only Weapons and Tools are gated on the field. */
export function canInvoke(state: GameState, pid: PlayerId, cardIid: string): boolean {
  const p = state.players[pid];
  const card = p.hand.find((c) => c.iid === cardIid);
  if (!card || state.winner) return false;
  const def = card.def;
  if (def.type === 'Leader') return false;
  if (!timingLegal(state, pid, def)) return false;
  if (!canPayCost(p.essence, effectiveCost(state, pid, def))) return false;
  if (def.type === 'Item' && p.field.length === 0 && itemSurvives(def.subtype)) return false;
  return true;
}

/**
 * Invoke a card from hand: pay its Essence Cost, put it on the stack, then run
 * the priority loop. Costs and targets are locked in here; the card's actual
 * effect happens in `resolveInvokedCard` once both players pass, so either
 * player can respond in between (and a removed target makes it fizzle).
 *
 * When neither player holds an instant-speed answer the loop drains in this
 * same call, so the card resolves before this function returns.
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

  let bondTargetIid: string | undefined;
  if (def.type === 'Item') {
    // A Charm may be aimed at its controller — explicitly, or implicitly when
    // there is no unit to bond to. Weapons and Tools still need a body.
    const selfCast =
      !itemSurvives(def.subtype) &&
      (opts.bondTargetIid === BOND_TARGET_SELF || p.field.length === 0);
    if (selfCast) {
      bondTargetIid = BOND_TARGET_SELF;
    } else {
      const iid = opts.bondTargetIid ?? opts.targetIid ?? p.field[0]?.iid;
      const bondTarget = iid ? findUnit(state, iid) : undefined;
      if (!bondTarget || bondTarget.owner !== pid) return false;
      bondTargetIid = bondTarget.iid;
    }
  }
  if (
    def.onInvoke &&
    opts.targetIid !== undefined &&
    SINGLE_TARGETS.includes(def.onInvoke.target)
  ) {
    if (!canTarget(state, pid, def.onInvoke, opts.targetIid)) return false;
  }
  if (!['Unit', 'Event', 'Item', 'Location'].includes(def.type)) return false;

  const cost = effectiveCost(state, pid, def);
  if (hasKw(def, 'Surge') && cost !== def.cost) telemetry.onKeywordProc?.('Surge', 1);
  payCost(p.essence, cost);
  p.hand.splice(p.hand.indexOf(card), 1);
  p.invokedCardThisTurn = true;
  // Name the target in the log line — the battle log and the CPU-turn
  // narration are built from these lines, and "invokes X" alone left the
  // player guessing what X was pointed at.
  const targetNote =
    opts.targetIid && SINGLE_TARGETS.includes(def.onInvoke?.target ?? '')
      ? opts.targetIid === 'P1' || opts.targetIid === 'P2'
        ? ` targeting ${opts.targetIid}`
        : findUnit(state, opts.targetIid)
          ? ` targeting ${findUnit(state, opts.targetIid)!.def.name}`
          : ''
      : '';
  state.log.push(`${pid} invokes ${def.name}${targetNote}.`);

  // v6.0 Resonant: the Event's effect resolves twice.
  const times = def.type === 'Event' && hasKw(def, 'Resonant') ? 2 : 1;
  if (times === 2) telemetry.onKeywordProc?.('Resonant', 1);
  pushStack(state, {
    kind: 'card',
    controller: pid,
    sourceName: def.name,
    card,
    targetIid: opts.targetIid,
    bondTargetIid,
    resolveTimes: times,
  });
  settleStack(state);
  return true;
}

/**
 * Apply an invoked card once it resolves off the stack.
 * - Units enter the field (summoning sick unless Reckless), run onInvoke and
 *   'enters' triggers.
 * - Events resolve onInvoke then go to the ash-pile.
 * - Items bond to their unit; Sanctums enter the Location row ready.
 */
function resolveInvokedCard(state: GameState, item: StackItem): void {
  const pid = item.controller;
  const p = state.players[pid];
  const card = item.card!;
  const def = card.def;

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
        items: [],
      };
      p.field.push(u);
      // The body still enters when the rider's target is gone — only the
      // onInvoke effect fizzles.
      if (def.onInvoke && !fizzles(state, item, def.onInvoke)) {
        applyEffect(state, pid, def.onInvoke, item.targetIid);
      }
      runTriggers(state, pid, 'enters', u);
      break;
    }
    case 'Event': {
      // An Event is nothing but its effect, so a target that died in response
      // fizzles the whole card — it still goes to the ash-pile.
      const eff = def.onInvoke;
      // A targeted Event whose target is gone fizzles: §6 says it "does nothing
      // and still goes to the Ash-pile". That has to suppress the Echoing/Fate/
      // Exhume riders too — they used to fire unconditionally, so a countered
      // Event still drew, banished, or exhumed. An Event with no targeted
      // onInvoke (eff undefined, or an untargeted effect) never fizzles.
      const fizzled = !!eff && fizzles(state, item, eff);
      if (fizzled) {
        state.log.push(`${def.name} fizzles — its target is gone.`);
      } else if (eff) {
        for (let i = 0; i < (item.resolveTimes ?? 1); i++) {
          // Resonant's second resolution falls back to auto-targeting when the
          // explicit target is gone — usually the first one killed it.
          const target = i === 0 || !fizzles(state, item, eff) ? item.targetIid : undefined;
          applyEffect(state, pid, eff, target);
        }
      }
      // v7.3 Echoing: the Event replaces itself. Draws once however many
      // times its effect resolved — Resonant doubles the effect, not the card.
      if (!fizzled && hasKw(def, 'Echoing')) {
        telemetry.onKeywordProc?.('Echoing', 1);
        dealCards(state, pid, 1);
      }
      // v7.5 Fate: Void's denial half. Erode puts a card in the ash-pile,
      // where Exhume and the rest of Shadow can still reach it; Fate puts it
      // in The Void, where nothing can. Same size, strictly harder to answer,
      // which is the difference the two colours are supposed to have.
      if (!fizzled && hasKw(def, 'Fate')) {
        const top = state.players[opponentOf(pid)].deck.pop();
        if (top) {
          state.players[opponentOf(pid)].voidPile.push(top);
          telemetry.onKeywordProc?.('Fate', 1);
          state.log.push(`${def.name} banishes the top card of ${opponentOf(pid)}'s deck.`);
        }
      }
      // v7.5 Exhume: Shadow's ash-pile recursion, which COLOR_IDENTITY has
      // promised since v5.0 and no keyword implemented. Units only — a
      // recursion loop that can return the Event itself is a different card
      // and a much harder one to price.
      if (!fizzled && hasKw(def, 'Exhume')) {
        // Keyword text says a RANDOM Unit — seeded rng, so replays stay
        // deterministic. findIndex silently returned the oldest one instead.
        const unitIdxs = p.ashPile
          .map((c, idx) => (c.def.type === 'Unit' ? idx : -1))
          .filter((idx) => idx >= 0);
        if (unitIdxs.length > 0) {
          const i = unitIdxs[Math.floor(state.rng() * unitIdxs.length)];
          const [unit] = p.ashPile.splice(i, 1);
          p.hand.push(unit);
          telemetry.onKeywordProc?.('Exhume', 1);
          state.log.push(`${def.name} exhumes ${unit.def.name}.`);
        }
      }
      p.ashPile.push(card);
      break;
    }
    case 'Item': {
      // A Charm aimed at its controller is consumed for Vitality instead of
      // bonding. Locked in at invoke time, so nothing the opponent does in
      // the response window can turn it back into a bond (or vice versa).
      if (item.bondTargetIid === BOND_TARGET_SELF) {
        const gained = Math.min(charmSelfHeal(def.bond), LEADER_HP - p.vitality);
        p.vitality += Math.max(0, gained);
        state.log.push(
          `${pid} casts ${def.name} on themselves${gained > 0 ? ` and restores ${gained} Vitality` : ''}.`,
        );
        p.ashPile.push(card);
        break;
      }
      const bondTarget = item.bondTargetIid ? findUnit(state, item.bondTargetIid) : undefined;
      // The unit it was aimed at can die in response; the Item is then a
      // Weapon/Tool with nothing to bond to, or ash.
      if (!bondTarget || bondTarget.owner !== pid) {
        state.log.push(`${def.name} fizzles — nothing left to bond to.`);
        if (itemSurvives(def.subtype)) p.unbondedItems.push({ iid: card.iid, def });
        else p.ashPile.push(card);
        break;
      }
      bondTarget.items.push({ iid: card.iid, def });
      // v13 Tool: the subtype that points both ways — the friendly buff above
      // plus a permanent shrink on a TARGET enemy unit as it lands. The text
      // says "target": when the invoke carried an explicit target and the
      // card has no onInvoke of its own competing for it, the player's pick
      // is honored; otherwise autoTarget picks (the CPU's path, unchanged).
      if (def.subtype === 'Tool' && def.nerf) {
        const nerfEff: Effect = { action: 'weaken', value: def.nerf, target: 'enemyUnit' };
        const wantsOwnTarget = !!def.onInvoke && SINGLE_TARGETS.includes(def.onInvoke.target);
        const chosen =
          !wantsOwnTarget && item.targetIid && canTarget(state, pid, nerfEff, item.targetIid)
            ? item.targetIid
            : undefined;
        applyEffect(state, pid, nerfEff, chosen);
      }
      // v6.0 Runic: bonding this Item from hand Deals its controller a card.
      if (hasKw(def, 'Runic')) {
        telemetry.onKeywordProc?.('Runic', 1);
        dealCards(state, pid, 1);
      }
      // v7.3 Tethered: bonding untaps the unit it lands on, so an Item can
      // buy back an attack or a guard the turn it is played.
      if (hasKw(def, 'Tethered') && bondTarget.exhausted) {
        telemetry.onKeywordProc?.('Tethered', 1);
        bondTarget.exhausted = false;
      }
      // v7.5 Freeze-Dry: Tethered's mirror image — the same one-shot tempo
      // swing, pointed across the table instead of at your own board.
      if (hasKw(def, 'Freeze-Dry')) {
        telemetry.onKeywordProc?.('Freeze-Dry', 1);
        applyEffect(state, pid, { action: 'exhaust', target: 'enemyUnit' });
      }
      // v7.5 Blessed: the Light-side one-shot, priced with Runic.
      if (hasKw(def, 'Blessed') && p.vitality < LEADER_HP) {
        const gained = Math.min(3, LEADER_HP - p.vitality);
        p.vitality += gained;
        telemetry.onKeywordProc?.('Blessed', gained);
      }
      if (def.onInvoke && !fizzles(state, item, def.onInvoke)) {
        applyEffect(state, pid, def.onInvoke, item.targetIid);
      }
      break;
    }
    case 'Location': {
      p.locations.push({
        iid: card.iid,
        def,
        produces: def.produces ?? wellspringChoices(state, pid)[0],
        exhausted: false,
      });
      if (def.onInvoke && !fizzles(state, item, def.onInvoke)) {
        applyEffect(state, pid, def.onInvoke, item.targetIid);
      }
      break;
    }
  }
}

/** Re-bond an unbonded Weapon or Tool from the field to a friendly unit for
 * its re-bond
 * cost (generic essence). Own main phase only. */
export function rebondItem(
  state: GameState,
  pid: PlayerId,
  itemIid: string,
  unitIid: string,
): boolean {
  const p = state.players[pid];
  if (!inOwnMainClear(state, pid) || state.winner) return false;
  const idx = p.unbondedItems.findIndex((c) => c.iid === itemIid);
  if (idx < 0) return false;
  const item = p.unbondedItems[idx];
  const unit = findUnit(state, unitIid);
  if (!unit || unit.owner !== pid) return false;
  const cost: EssenceCost = { generic: item.def.rebondCost ?? 0, pips: {} };
  if (!canPayCost(p.essence, cost)) return false;
  payCost(p.essence, cost);
  p.unbondedItems.splice(idx, 1);
  unit.items.push(item);
  state.log.push(`${pid} re-bonds ${item.def.name} to ${unit.def.name}.`);
  return true;
}

// ---------------------------------------------------------------------------
// Leader
// ---------------------------------------------------------------------------
export function canInvokeLeader(state: GameState, pid: PlayerId): boolean {
  const p = state.players[pid];
  return (
    !state.winner &&
    inOwnMainClear(state, pid) &&
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
  if (state.winner || !inOwnMainClear(state, pid)) return false;
  if (!L.invoked || L.shattered || L.abilityUsedThisTurn) return false;
  // Array indexing coerces, so a caller passing the string '0' (or any other
  // stringified index) reached a real ability and spent Resolve on it. Every
  // other public action validates its identifiers; this one has to as well —
  // it is reachable from anything holding a GameState, not just the typed UI.
  if (!Number.isInteger(abilityIndex) || abilityIndex < 0) return false;
  const ability = L.def.leaderAbilities?.[abilityIndex];
  if (!ability) return false;
  if (ability.resolveDelta < 0 && L.resolve + ability.resolveDelta < 0) return false;
  L.abilityUsedThisTurn = true;
  // A builder ability can never take Resolve ABOVE the Leader's printed value.
  // `Resolute` has always said "up to its printed value" and the UI models the
  // printed number as the maximum (`ResolveDots`' `max`), but this line was a
  // bare `+=`: every Leader in the pool prints a `+1` builder as its second
  // ability (catalog.test.ts enforces it), the CPU scores building Resolve as
  // "free value" and fires it most turns, so Resolve ratcheted up without any
  // ceiling — a printed-4 Leader sitting at 8 needs twice the removal to
  // shatter AND banks twice as many `-2` activations as its pool should allow.
  // The cap is `max(printed, current)` rather than a bare `printed` so a
  // builder can only ever raise Resolve or leave it alone — it must never
  // *reduce* a Leader already sitting above its printed value.
  const printed = L.def.resolve ?? 0;
  L.resolve =
    ability.resolveDelta > 0
      ? Math.min(Math.max(printed, L.resolve), L.resolve + ability.resolveDelta)
      : L.resolve + ability.resolveDelta;
  // Leader ability uses were the one class of play the log never recorded —
  // the CPU narration and battle log had no line for them at all, so the
  // opponent's Resolve changed and units took damage "from nowhere".
  {
    const targetUnit = targetIid ? findUnit(state, targetIid) : undefined;
    const abilityNote =
      ability.text ?? `${ability.resolveDelta > 0 ? '+' : ''}${ability.resolveDelta}`;
    const targetNote = targetUnit
      ? ` on ${targetUnit.def.name}`
      : targetIid === 'P1' || targetIid === 'P2'
        ? ` on ${targetIid}`
        : '';
    state.log.push(`${pid}'s Leader ${L.def.name} uses "${abilityNote}"${targetNote}.`);
  }
  applyEffect(state, pid, ability.effect, targetIid);
  if (L.resolve <= 0) {
    L.shattered = true;
    L.invoked = false;
    state.log.push(`${pid}'s Leader ${L.def.name} is shattered.`);
  }
  stateBasedChecks(state);
  drainStack(state);
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
      !u.exhausted && !unitHasKw(u, 'Immobile') && (!u.enteredThisTurn || unitHasKw(u, 'Reckless')),
  );
}

/** Declare attackers. Attackers exhaust unless Alert. Opens the guard step. */
export function declareAttackers(state: GameState, iids: string[]): boolean {
  if (state.winner || state.phase !== 'Clash' || state.clash) return false;
  if (iids.length === 0) return false;
  // Reject duplicate iids — a unit listed twice would otherwise be pushed into
  // clash.attackers twice and deal its damage once per occurrence.
  if (new Set(iids).size !== iids.length) return false;
  const legal = new Set(legalAttackers(state, state.active).map((u) => u.iid));
  for (const iid of iids) if (!legal.has(iid)) return false;
  for (const iid of iids) {
    const u = findUnit(state, iid)!;
    if (!unitHasKw(u, 'Alert')) u.exhausted = true;
  }
  state.clash = { step: 'guards', attackers: [...iids], guards: {}, guardedOnce: [] };
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
    // v6.9 Nimble: only a smaller body can catch it. Strictly less Might, so
    // an equal-Might guard does not qualify.
    if (unitHasKw(attacker, 'Nimble') && effMight(state, g) >= effMight(state, attacker))
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
  // Snapshot who was blocked BEFORE the reaction window can start removing
  // blockers — see ClashState.guardedOnce.
  state.clash.guardedOnce = Object.entries(state.clash.guards)
    .filter(([, gs]) => gs.length > 0)
    .map(([a]) => a);
  state.clash.step = 'reaction';
  // The reaction window is a real priority round: APNAP gives the active
  // player the first say, and `resolveClash` is what ends it.
  state.priority = { holder: state.active, passed: [] };
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
  // Resolving is what closes the reaction window: anything still held there
  // resolves first, and combat damage itself gets no response window.
  drainStack(state);
  if (state.winner || !state.clash) return false;
  // Which attackers were ever guarded. Taken from the declare-time snapshot
  // so a blocker removed during the reaction window still counts as having
  // blocked; falls back to the live map for callers that resolve straight
  // out of the 'guards' step without ever declaring.
  const everGuarded = new Set(
    state.clash.guardedOnce.length > 0
      ? state.clash.guardedOnce
      : Object.entries(state.clash.guards)
          .filter(([, gs]) => gs.length > 0)
          .map(([a]) => a),
  );
  // Keyed by iid, holding the INSTANCE: "whenever this unit deals clash
  // damage" has no survives-clause, so a unit that died dealing its damage
  // (the mutual 2/2 trade — the most common clash outcome) still triggers.
  // Looking the iid up on the field afterwards silently dropped exactly
  // those procs.
  const dealtBy = new Map<string, UnitInst>();
  for (const step of ['first', 'normal'] as const) {
    if (state.winner || !state.clash) break;
    // Guard absorption is per SUB-STEP, not per clash. It exists for one case:
    // an attacker that reaches a sub-step with every guard already dead still
    // only spills (Might - what it assigned to those guards) — and the only
    // body that can assign in one sub-step and spill in the next is a
    // Doublestrike one. Carrying the map across the two steps made a
    // Doublestrike + Overrun attacker whose guard died to the first strike
    // spill `Might - Might` = 0 in the normal step, i.e. its entire second
    // strike vanished — while the CPU's own guard model (ai.ts
    // `unguardedDamage`, which prices a Doublestrike hit twice) budgeted for
    // the full spill. Blocked is blocked, but a strike already paid for does
    // not pay for the next one.
    const absorbed = new Map<string, number>();
    const packets = collectStepWithHistory(state, step, everGuarded, absorbed);
    const preFieldCount =
      step === 'first' ? state.players.P1.field.length + state.players.P2.field.length : 0;
    for (const pkt of packets) {
      // Record the source as having dealt clash damage only when a point
      // actually lands — a hit fully absorbed by Hardened/Bulwark deals none,
      // so it must not fire Tidecaller or dealsClashDamage triggers.
      let net = 0;
      if (pkt.targetUnit) net = damageUnit(state, pkt.targetUnit, pkt.amount, pkt.source);
      else if (pkt.targetPlayer)
        net = damagePlayer(state, pkt.targetPlayer, pkt.amount, pkt.source);
      // Per-packet log lines — clash damage was invisible in the battle log
      // and the CPU-turn narration (only the resulting shatters were logged).
      if (pkt.targetUnit) {
        state.log.push(
          net > 0
            ? `${pkt.source.def.name} hits ${pkt.targetUnit.def.name} for ${net}.`
            : `${pkt.targetUnit.def.name} absorbs ${pkt.source.def.name}'s hit.`,
        );
      } else if (pkt.targetPlayer && net > 0) {
        state.log.push(`${pkt.source.def.name} hits ${pkt.targetPlayer} for ${net} Vitality.`);
      }
      if (net > 0) dealtBy.set(pkt.source.iid, pkt.source);
    }
    stateBasedChecks(state);
    drainStack(state); // death triggers land before the normal-damage sub-step
    if (step === 'first' && packets.length > 0) {
      const died = preFieldCount - (state.players.P1.field.length + state.players.P2.field.length);
      if (died > 0) telemetry.onKeywordProc?.('Quickstrike', died);
    }
  }
  for (const u of dealtBy.values()) {
    if (state.winner) break;
    // v6.9 Tidecaller: connecting in a clash refills the hand.
    if (unitHasKw(u, 'Tidecaller')) {
      telemetry.onKeywordProc?.('Tidecaller', 1);
      dealCards(state, u.owner, 1);
    }
    runTriggers(state, u.owner, 'dealsClashDamage', u);
  }
  if (state.clash) state.clash.step = 'done';
  stateBasedChecks(state);
  drainStack(state);
  state.priority = null;
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
    // v23 Onslaught: attack-only Might, added here (not in effMight) so a
    // guard's counter-packet above never carries it. The CPU's attack
    // valuation reads effMight and therefore prices this keyword slightly
    // conservatively — fine for an unprinted keyword; revisit if it prints.
    let might = effMight(state, attacker) + onslaughtBonus(state.players[attacker.owner]);
    if (might > effMight(state, attacker)) telemetry.onKeywordProc?.('Onslaught', 1);
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
      // Hardened shaves 1 off every packet (see damageUnit), so lethal
      // assignment has to account for it — a 3-grit Hardened guard needs 4
      // marked to die, and Venom needs 2 for a point to survive the shave and
      // carry the mark. Without this the attacker only ever assigned
      // `remainingGrit`, which Hardened reduced below lethal, making Hardened
      // guards unkillable in clash by any single attacker regardless of Might —
      // and leaving the engine contradicting the AI's own kill model.
      const hardened = unitHasKw(g, 'Hardened') ? 1 : 0;
      const need = venom ? 1 + hardened : Math.max(1, remainingGrit(state, g)) + hardened;
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
