/**
 * Rulebook v3.0 game engine (dice-placement rules).
 *
 * Turn: Draw -> Roll -> Reroll -> Placement -> Combo Check -> Combat -> End.
 * Five d6 per turn, one reroll of any subset, four legal die destinations
 * (hand Cast Slot, in-play Ability Slot, Staging second Twin slot, Echo
 * recast from Discard). Sequential targeted combat with Guard walls.
 */
import { CardDef, CARD_DB, ComboPattern, DECKLISTS_V3, Effect, hasKw } from './cards';

// ---------------------------------------------------------------------------
// RNG (seeded, for reproducible playtests)
// ---------------------------------------------------------------------------
export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
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
  enteredThisTurn: boolean;
  wardUsed: boolean;
  boundThisTurn: boolean;
  boundNextTurn: boolean;
  echoSpent: boolean;
  /** first Twin die value while in Staging. */
  stagedDie?: number;
  stagedTurns: number;
  /** v4.0: true if this Twin card received its first die this same Placement Phase. */
  stagedThisTurn?: boolean;
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
  rerollUsed: boolean;
  locationCastThisTurn: boolean;
  rallyUsedThisTurn: boolean;
  turnsTaken: number;
}

export type Phase = 'PLACEMENT' | 'COMBAT' | 'DONE';

export interface Game {
  players: Record<string, Player>;
  order: [string, string];
  active: string;
  turn: number;
  winner: string | null; // player id, or 'draw'
  rng: Rng;
  log: string[];
  stats: GameStats;
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
}

let iidCounter = 0;
export function makeInst(def: CardDef, owner: string): Inst {
  return {
    def, iid: `${def.id}#${++iidCounter}`, owner,
    damage: 0, permAtk: 0, permHp: 0,
    hasAttacked: false, attacksMade: 0, abilityUsed: false,
    enteredThisTurn: false, wardUsed: false,
    boundThisTurn: false, boundNextTurn: false, echoSpent: false,
    stagedTurns: 0,
  };
}

export function opponentOf(g: Game, pid: string): Player {
  return g.players[g.order[0] === pid ? g.order[1] : g.order[0]];
}

// ---------------------------------------------------------------------------
// Stats / derived values
// ---------------------------------------------------------------------------
export function effAtk(g: Game, u: Inst): number {
  const p = g.players[u.owner];
  const loc = u.def.type === 'Unit' && p.location?.def.locPassive === 'ATK_ALL' ? 1 : 0;
  return Math.max(0, (u.def.atk || 0) + u.permAtk + loc);
}
export function effMaxHp(g: Game, u: Inst): number {
  const p = g.players[u.owner];
  const loc = u.def.type === 'Unit' && p.location?.def.locPassive === 'HP_ALL' ? 1 : 0;
  return Math.max(0, (u.def.hp || 0) + u.permHp + loc);
}
export function remainingHp(g: Game, u: Inst): number {
  return effMaxHp(g, u) - u.damage;
}

/** Anchor: effective Cast threshold = printed - (# other in-play Anchor cards), min 1. */
export function effThreshold(g: Game, pid: string, def: CardDef): number {
  const t = def.threshold ?? 1;
  if (!hasKw(def, 'Anchor')) return t;
  const p = g.players[pid];
  const inPlay = [...p.board, p.location].filter(
    (c): c is Inst => !!c && hasKw(c.def, 'Anchor'),
  ).length;
  // v4.0: cap the reduction at 2 so Anchor is ramp, not a threshold collapse
  // that lets a wide Anchor board dump its whole hand at threshold 1.
  return Math.max(1, t - Math.min(2, inPlay));
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
    case 'AnyPair': return cs.some((c) => c >= 2);
    case 'TwoPair': return cs.filter((c) => c >= 2).length >= 2;
    case 'ThreeKind': return cs.some((c) => c >= 3);
    case 'FourKind': return cs.some((c) => c >= 4);
    case 'Yahtzee': return cs.some((c) => c >= 5);
    case 'FullHouse':
      return Object.entries(counts).some(
        ([v, c]) => c >= 3 && Object.entries(counts).some(([w, d]) => w !== v && d >= 2),
      );
    case 'SmallStraight': return hasRun(4);
    case 'LargeStraight': return hasRun(5);
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
): Game {
  const deckA: DeckDef = typeof a === 'string'
    ? { leaderId: a, cards: DECKLISTS_V3[a] } : a;
  const deckB: DeckDef = typeof b === 'string'
    ? { leaderId: b, cards: DECKLISTS_V3[b] } : b;
  const mk = (id: string, dd: DeckDef): Player => {
    const resolve = dd.resolve || ((cid: string) => CARD_DB[cid]);
    const leaderDef = resolve(dd.leaderId);
    const deck: Inst[] = [];
    for (const [cid, n] of Object.entries(dd.cards)) {
      for (let i = 0; i < n; i++) deck.push(makeInst(resolve(cid), id));
    }
    return {
      id, leader: makeInst(leaderDef, id), deck, hand: [], discard: [], banished: [],
      staging: [], board: [], location: null, dice: [], rerollUsed: false,
      locationCastThisTurn: false, rallyUsedThisTurn: false, turnsTaken: 0,
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
      casts: {}, comboTriggers: {}, echoRecasts: 0, twinCompletions: 0, twinAbandons: 0,
      scraps: 0, rallies: 0, wardBlocks: 0, diceWasted: 0, dicePitched: 0, attacks: 0,
      leaderAbilityUses: {},
    },
  };
  for (const p of Object.values(g.players)) {
    shuffle(p.deck, rng);
    for (let i = 0; i < 5; i++) p.hand.push(p.deck.pop()!);
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
    p.board = p.board.filter((u) => remainingHp(g, u) > 0);
    for (const u of dead) {
      g.log.push(`${u.def.name} was destroyed.`);
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
export function applyEffect(g: Game, ownerId: string, eff: Effect, targetIid?: string, self?: Inst) {
  const p = g.players[ownerId];
  const opp = opponentOf(g, ownerId);
  const v = eff.value || 0;
  const find = (iid?: string): Inst | undefined =>
    [...p.board, ...opp.board, p.leader, opp.leader].find((c) => c.iid === iid);

  const dmg = (t: Inst, amount: number, hostile: boolean) => {
    if (wardCheck(g, t, hostile)) return;
    t.damage += amount;
  };

  switch (eff.action) {
    case 'sap': {
      let t: Inst | undefined;
      if (eff.target === 'enemyLeader') t = opp.leader;
      else if (eff.target === 'self') t = self;
      else t = find(targetIid);
      if (t) dmg(t, v, t.owner !== ownerId);
      break;
    }
    case 'destroy': {
      if (eff.target === 'allEnemyUnits') {
        for (const u of [...opp.board]) {
          if (!wardCheck(g, u, true)) u.damage += 999;
        }
      } else {
        const t = find(targetIid);
        if (t && t.def.type === 'Unit' && !wardCheck(g, t, t.owner !== ownerId)) t.damage += 999;
      }
      break;
    }
    case 'mend': {
      const t =
        eff.target === 'friendlyLeader' ? p.leader : (find(targetIid) ?? p.leader);
      if (t.owner === ownerId) t.damage = Math.max(0, t.damage - v);
      break;
    }
    case 'draw':
      drawCards(g, p, v);
      break;
    case 'bind': {
      const t = find(targetIid);
      if (t && t.def.type === 'Unit' && !wardCheck(g, t, t.owner !== ownerId)) {
        t.boundNextTurn = true;
        g.log.push(`${t.def.name} was Bound.`);
      }
      break;
    }
    case 'buff': {
      if (eff.target === 'allFriendlyUnits') {
        for (const u of p.board) { u.permAtk += v; u.permHp += v; }
      } else if (eff.target === 'self' && self) {
        self.permAtk += v; self.permHp += v;
      } else {
        const t = find(targetIid);
        if (t && t.def.type === 'Unit' && t.owner === ownerId) { t.permAtk += v; t.permHp += v; }
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
  p.rerollUsed = false;
  p.locationCastThisTurn = false;
  p.rallyUsedThisTurn = false;
  for (const u of [...p.board, p.leader]) {
    u.hasAttacked = false;
    u.attacksMade = 0;
    u.abilityUsed = false;
    u.abilityDie = undefined;
    u.enteredThisTurn = false;
    u.boundThisTurn = u.boundNextTurn;
    u.boundNextTurn = false;
  }
  if (p.location) { p.location.abilityUsed = false; p.location.abilityDie = undefined; }
  for (const s of p.staging) { s.stagedTurns++; s.stagedThisTurn = false; }

  // Draw Phase (first player skips on the very first turn).
  const isFirstPlayerFirstTurn = g.turn === 1;
  if (!isFirstPlayerFirstTurn) {
    if (p.deck.length === 0) {
      // Deck-out loss (§9).
      g.winner = opponentOf(g, p.id).id;
      g.log.push(`${p.id} decked out.`);
      return;
    }
    p.hand.push(p.deck.pop()!);
  }

  // Roll Phase.
  p.dice = Array.from({ length: 5 }, () => ({ value: d6(g.rng), placed: false }));
}

/** Reroll Phase: reroll any subset exactly once. */
export function reroll(g: Game, indices: number[]) {
  const p = g.players[g.active];
  if (p.rerollUsed) return;
  for (const i of indices) if (!p.dice[i].placed) p.dice[i].value = d6(g.rng);
  p.rerollUsed = true;
}

// ---------------------------------------------------------------------------
// Placement actions (active player only)
// ---------------------------------------------------------------------------
function pickDie(p: Player, dieIndex: number): Die | null {
  const die = p.dice[dieIndex];
  return die && !die.placed ? die : null;
}

function enterPlay(g: Game, p: Player, c: Inst, dieValue: number, viaEcho = false) {
  g.stats.casts[c.def.id] = (g.stats.casts[c.def.id] || 0) + 1;
  const eff = effThreshold(g, p.id, c.def);
  const overflowHit =
    !!c.def.overflow && c.def.threshold !== undefined && dieValue - eff >= c.def.overflow.amount;

  if (c.def.type === 'Unit') {
    c.enteredThisTurn = true;
    c.damage = 0;
    c.wardUsed = false;
    p.board.push(c);
  } else if (c.def.type === 'Location') {
    if (p.location) {
      g.log.push(`${p.location.def.name} was replaced.`);
      discardCard(g, p, p.location);
    }
    p.location = c;
    p.locationCastThisTurn = true;
    cleanupDeaths(g); // HP_ALL leaving can kill units
  } else {
    // Charm / Event: resolve then discard.
    if (c.def.onCast) applyEffect(g, p.id, c.def.onCast, autoTarget(g, p.id, c.def.onCast), c);
    discardCard(g, p, c);
  }
  if (c.def.type === 'Unit' && c.def.onCast) {
    applyEffect(g, p.id, c.def.onCast, autoTarget(g, p.id, c.def.onCast), c);
  }
  if (overflowHit && c.def.overflow) {
    g.log.push(`${c.def.name} Overflow triggered.`);
    applyEffect(g, p.id, c.def.overflow.effect, autoTarget(g, p.id, c.def.overflow.effect), c);
  }
  if (viaEcho) c.echoSpent = true;
  cleanupDeaths(g);
}

/**
 * Default target chooser for effects whose caller didn't pick one (Combo
 * bonuses, Overflow, Twin bonuses). Simple but sensible.
 */
export function autoTarget(g: Game, ownerId: string, eff: Effect): string | undefined {
  const p = g.players[ownerId];
  const opp = opponentOf(g, ownerId);
  const byAtk = (a: Inst, b: Inst) => effAtk(g, b) - effAtk(g, a);
  switch (eff.target) {
    case 'enemyUnit': {
      const t = [...opp.board].sort(byAtk)[0];
      return t?.iid;
    }
    case 'anyTarget': {
      const v = eff.value || 0;
      const killable = opp.board
        .filter((u) => remainingHp(g, u) <= v)
        .sort(byAtk)[0];
      if (killable) return killable.iid;
      const big = [...opp.board].sort(byAtk)[0];
      // Prefer face damage if no good unit target.
      if (big && effAtk(g, big) >= 3) return big.iid;
      return opp.leader.iid;
    }
    case 'friendlyUnit': {
      const t = [...p.board].sort(byAtk)[0];
      return t?.iid;
    }
    case 'friendlyAny': {
      const hurt = [...p.board]
        .filter((u) => u.damage > 0)
        .sort((a, b) => b.damage - a.damage)[0];
      if (p.leader.damage >= (eff.value || 0)) return p.leader.iid;
      return hurt?.iid ?? p.leader.iid;
    }
    default:
      return undefined;
  }
}

/** Destination 1: cast a card from hand. */
export function castFromHand(g: Game, dieIndex: number, cardIid: string, targetIid?: string): boolean {
  const p = g.players[g.active];
  const die = pickDie(p, dieIndex);
  const idx = p.hand.findIndex((c) => c.iid === cardIid);
  if (!die || idx < 0) return false;
  const c = p.hand[idx];

  if (c.def.type === 'Location' && p.locationCastThisTurn) return false;
  if (c.def.type === 'Location' && p.location?.def.id === c.def.id) return false;

  if (c.def.comboGate) {
    if (!matchesPattern(rollValues(p), c.def.comboGate)) return false;
    // any die value works
  } else {
    if (die.value < effThreshold(g, p.id, c.def)) return false;
  }

  die.placed = true;
  p.hand.splice(idx, 1);

  if (hasKw(c.def, 'Twin')) {
    // First Twin slot filled -> Staging Zone. v4.0: one die per Placement Phase.
    c.stagedDie = die.value;
    c.stagedTurns = 0;
    c.stagedThisTurn = true;
    p.staging.push(c);
    g.log.push(`${c.def.name} moved to Staging (die ${die.value}).`);
    return true;
  }
  if (c.def.onCast && targetIid) {
    // Caller-specified target overrides autoTarget: pre-resolve here.
    g.stats.casts[c.def.id] = (g.stats.casts[c.def.id] || 0) + 1;
    if (c.def.type === 'Charm' || c.def.type === 'Event') {
      applyEffect(g, p.id, c.def.onCast, targetIid, c);
      const eff = effThreshold(g, p.id, c.def);
      if (c.def.overflow && c.def.threshold !== undefined && die.value - eff >= c.def.overflow.amount) {
        applyEffect(g, p.id, c.def.overflow.effect, autoTarget(g, p.id, c.def.overflow.effect), c);
      }
      discardCard(g, p, c);
      cleanupDeaths(g);
      return true;
    }
  }
  enterPlay(g, p, c, die.value);
  return true;
}

/** Destination 2: activate an Ability Slot on a card in play (or the Leader / Location). */
export function activateAbility(g: Game, dieIndex: number, cardIid: string, targetIid?: string): boolean {
  const p = g.players[g.active];
  const die = pickDie(p, dieIndex);
  const c = [...p.board, p.leader, p.location].find((x): x is Inst => !!x && x.iid === cardIid);
  if (!die || !c || !c.def.ability || c.abilityUsed) return false;
  if (c.def.type === 'Unit') {
    if (c.hasAttacked || c.boundThisTurn) return false;
    if (c.enteredThisTurn && !hasKw(c.def, 'Swift')) return false;
  }
  if (die.value < c.def.ability.threshold) return false;
  die.placed = true;
  c.abilityUsed = true;
  c.abilityDie = die.value;
  if (c.def.type === 'Leader') {
    g.stats.leaderAbilityUses[c.def.id] = (g.stats.leaderAbilityUses[c.def.id] || 0) + 1;
  }
  applyEffect(g, p.id, c.def.ability.effect, targetIid ?? autoTarget(g, p.id, c.def.ability.effect), c);
  return true;
}

/** Rally: activate this card's ability using a die resting on another exhausted friendly Ability Slot. */
export function activateViaRally(g: Game, rallyIid: string, sourceIid: string, targetIid?: string): boolean {
  const p = g.players[g.active];
  if (p.rallyUsedThisTurn) return false;
  const c = p.board.find((x) => x.iid === rallyIid);
  const src = [...p.board, p.leader, p.location].find((x): x is Inst => !!x && x.iid === sourceIid);
  if (!c || !src || !hasKw(c.def, 'Rally') || !c.def.ability || c.abilityUsed) return false;
  if (c.hasAttacked || c.boundThisTurn) return false;
  if (c.enteredThisTurn && !hasKw(c.def, 'Swift')) return false;
  if (src.iid === c.iid || !src.abilityUsed || src.abilityDie === undefined) return false;
  if (src.abilityDie < c.def.ability.threshold) return false;
  c.abilityUsed = true;
  c.abilityDie = src.abilityDie;
  src.abilityDie = undefined; // die moves; source stays exhausted
  p.rallyUsedThisTurn = true;
  g.stats.rallies++;
  applyEffect(g, p.id, c.def.ability.effect, targetIid ?? autoTarget(g, p.id, c.def.ability.effect), c);
  return true;
}

/** Destination 3: complete a staged Twin card (exact same face value). */
export function completeTwin(g: Game, dieIndex: number, cardIid: string): boolean {
  const p = g.players[g.active];
  const die = pickDie(p, dieIndex);
  const idx = p.staging.findIndex((c) => c.iid === cardIid);
  if (!die || idx < 0) return false;
  const c = p.staging[idx];
  if (die.value !== c.stagedDie) return false;
  if (c.stagedThisTurn) return false; // v4.0: at most one die per Placement Phase
  die.placed = true;
  p.staging.splice(idx, 1);
  c.stagedDie = undefined;
  g.stats.twinCompletions++;
  enterPlay(g, p, c, die.value);
  if (c.def.twinBonus) {
    applyEffect(g, p.id, c.def.twinBonus, autoTarget(g, p.id, c.def.twinBonus), c);
  }
  return true;
}

/** Destination 4: Echo-recast from Discard (die meets threshold + discard one card from hand). */
export function echoRecast(g: Game, dieIndex: number, cardIid: string, discardIid: string): boolean {
  const p = g.players[g.active];
  const die = pickDie(p, dieIndex);
  const idx = p.discard.findIndex((c) => c.iid === cardIid);
  const dIdx = p.hand.findIndex((c) => c.iid === discardIid);
  if (!die || idx < 0 || dIdx < 0) return false;
  const c = p.discard[idx];
  if (!hasKw(c.def, 'Echo') || c.echoSpent) return false;
  if (c.def.comboGate) {
    if (!matchesPattern(rollValues(p), c.def.comboGate)) return false;
  } else if (die.value < effThreshold(g, p.id, c.def)) {
    return false;
  }
  if (c.def.type === 'Location' && p.locationCastThisTurn) return false;
  die.placed = true;
  p.discard.splice(idx, 1);
  const extra = p.hand.splice(dIdx, 1)[0];
  discardCard(g, p, extra);
  g.stats.echoRecasts++;
  enterPlay(g, p, c, die.value, true);
  return true;
}

/** Scrap: discard a Scrap card from hand to reroll one unplaced die. */
export function scrap(g: Game, handIid: string, dieIndex: number): boolean {
  const p = g.players[g.active];
  const die = pickDie(p, dieIndex);
  const idx = p.hand.findIndex((c) => c.iid === handIid && hasKw(c.def, 'Scrap'));
  if (!die || idx < 0) return false;
  const c = p.hand.splice(idx, 1)[0];
  discardCard(g, p, c);
  die.value = d6(g.rng);
  g.stats.scraps++;
  return true;
}

/** Voluntary Twin abandonment (start of turn, before Draw — call before startTurn draws). */
export function abandonTwin(g: Game, cardIid: string): boolean {
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
  const p = g.players[g.active];
  const values = rollValues(p);
  const holders = [...p.board, p.location].filter((c): c is Inst => !!c && !!c.def.combo);
  for (const c of holders) {
    if (g.winner) break;
    if (!p.board.includes(c) && p.location !== c) continue; // died mid-loop
    if (matchesPattern(values, c.def.combo!.pattern)) {
      g.stats.comboTriggers[c.def.id] = (g.stats.comboTriggers[c.def.id] || 0) + 1;
      applyEffect(g, p.id, c.def.combo!.effect, autoTarget(g, p.id, c.def.combo!.effect), c);
    }
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

export function legalTargets(g: Game, attackerOwner: string): Inst[] {
  const opp = opponentOf(g, attackerOwner);
  const guards = opp.board.filter((u) => hasKw(u.def, 'Guard'));
  if (guards.length > 0) return guards;
  return [...opp.board, opp.leader];
}

export function attack(g: Game, attackerIid: string, targetIid: string): boolean {
  const p = g.players[g.active];
  const att = p.board.find((u) => u.iid === attackerIid);
  if (!att || !canAttack(g, att)) return false;
  const targets = legalTargets(g, p.id);
  const tgt = targets.find((t) => t.iid === targetIid);
  if (!tgt) return false;

  g.stats.attacks++;
  att.hasAttacked = true;
  const attackNumber = att.attacksMade + 1; // 1 = first swing, 2 = Frenzy swing
  att.attacksMade++;

  const atk = effAtk(g, att);
  if (tgt.def.type === 'Leader') {
    // One-directional: Leaders have no ATK, no retaliation.
    tgt.damage += atk;
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
  }
  // v4.0 Bind: a bound Unit deals no retaliation damage this turn.
  let retaliation = tgt.boundThisTurn ? 0 : effAtk(g, tgt);
  // v4.0 Frenzy: only the SECOND (bonus) swing takes doubled retaliation.
  if (hasKw(att.def, 'Frenzy') && attackNumber === 2) retaliation *= 2;
  const pierceOverflow =
    hasKw(att.def, 'Pierce') && dmgToTarget >= tgtHp && tgtHp > 0 ? dmgToTarget - tgtHp : 0;

  tgt.damage += dmgToTarget;
  att.damage += retaliation; // Ward never protects the attacker on its own attack
  if (pierceOverflow > 0) {
    opponentOf(g, p.id).leader.damage += pierceOverflow;
    g.log.push(`${att.def.name} Pierced for ${pierceOverflow}.`);
  }
  cleanupDeaths(g);
  return true;
}

// ---------------------------------------------------------------------------
// End Phase (§3.7)
// ---------------------------------------------------------------------------
export function endTurn(g: Game, discardChooser?: (hand: Inst[]) => Inst) {
  const p = g.players[g.active];
  // v4.0 Pitch: any die still unplaced may be pitched for Mend 1 to your Leader.
  // A dead 1 or 2 always has this baseline floor; only a die pitched with the
  // Leader already at full HP is truly "wasted".
  for (const d of p.dice) {
    if (d.placed) continue;
    if (p.leader.damage > 0) {
      p.leader.damage = Math.max(0, p.leader.damage - 1);
      g.stats.dicePitched++;
    } else {
      g.stats.diceWasted++;
    }
  }
  // Discard down to 6.
  while (p.hand.length > 6) {
    const pick = discardChooser ? discardChooser(p.hand) : p.hand[p.hand.length - 1];
    const idx = p.hand.indexOf(pick);
    const c = p.hand.splice(idx >= 0 ? idx : p.hand.length - 1, 1)[0];
    discardCard(g, p, c);
    g.log.push(`${p.id} discarded ${c.def.name} (hand size).`);
  }
  // Exhaustion clears at start of next own turn; Ward refreshes each turn for everyone.
  for (const pl of Object.values(g.players)) {
    for (const u of [...pl.board, pl.leader]) u.wardUsed = false;
  }
  p.dice = [];
  g.active = opponentOf(g, p.id).id;
}
