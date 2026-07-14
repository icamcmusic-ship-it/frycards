/**
 * v4.2 dice-placement match UI (Rulebook v4.2, docs/RULEBOOK.md).
 *
 * Human plays interactively through the engine's public actions; the CPU
 * plays whole turns through the same AI used by the headless playtest
 * harness (src/game/v3/ai.ts). The engine object is mutated in place and
 * held in a ref; a version counter forces re-renders after each action.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Game,
  Inst,
  Player,
  newGame,
  mulberry32,
  startTurn,
  reroll,
  castFromHand,
  castLocationFree,
  activateAbility,
  activateViaRally,
  activateUltimate,
  completeTwin,
  echoRecast,
  scrap,
  abandonTwin,
  comboCheck,
  attack,
  resolveEndPhasePreDiscard,
  finishEndPhase,
  canAttack,
  legalTargets,
  effAtk,
  effMaxHp,
  remainingHp,
  effThreshold,
  effAbilityThreshold,
  tollReduction,
  matchesPattern,
  rollValues,
  opponentOf,
  mulliganRedraw,
  defaultDiscardChoice,
  rerollsRemaining,
} from '../game/v3/engine';
import { playTurn, maybeMulliganPlayer } from '../game/v3/ai';
import { CardDef, Effect, hasKw } from '../game/v3/cards';
import { DeckDef } from '../game/v3/engine';
import { cn } from '../lib/utils';
import {
  CardFace,
  CardInspectorModal,
  KeywordChip,
  cardRules,
  costBadge,
  describeEffect,
  kwList,
  renderKeywordText,
} from './CardFaceV4';
import { SafeImage } from '../meta/SafeImage';
import { CoachOverlay } from './CoachOverlay';
import { MatchResult } from '../lib/supabase';
import { fmtCredits, fmtVouchers } from '../meta/economy';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** Which in-play cards may a hand-cast / ability effect legally target? */
function targetsFor(g: Game, pid: string, eff: Effect): Inst[] {
  const p = g.players[pid];
  const opp = opponentOf(g, pid);
  switch (eff.target) {
    case 'enemyUnit':
      return [...opp.board];
    case 'anyTarget':
      return [...opp.board, opp.leader];
    case 'friendlyUnit':
      return [...p.board];
    case 'friendlyAny':
      return [...p.board, p.leader];
    default:
      return [];
  }
}
function needsTarget(eff?: Effect): boolean {
  return !!eff && ['enemyUnit', 'anyTarget', 'friendlyUnit', 'friendlyAny'].includes(eff.target);
}

/** Friendly permanents whose Ability Slot is already spent this turn and
 * whose resting die is high enough to Rally into `unit`'s ability. */
function rallySourcesFor(g: Game, pid: string, unit: Inst): Inst[] {
  const p = g.players[pid];
  const thr = effAbilityThreshold(g, unit);
  return [...p.board, p.leader, p.location].filter(
    (x): x is Inst =>
      !!x &&
      x.iid !== unit.iid &&
      x.abilityUsed === true &&
      x.abilityDie !== undefined &&
      x.abilityDie >= thr,
  );
}

// ---------------------------------------------------------------------------
// A unit (or leader) on the battlefield
// ---------------------------------------------------------------------------
function BoardUnit({
  g,
  u,
  onClick,
  highlight,
  dimmed,
  isAttacker,
}: {
  g: Game;
  u: Inst;
  onClick?: () => void;
  highlight?: boolean;
  dimmed?: boolean;
  isAttacker?: boolean;
}) {
  const hp = remainingHp(g, u);
  const maxHp = effMaxHp(g, u);
  const atk = effAtk(g, u);
  const exhausted = u.hasAttacked || u.abilityUsed;
  const sick = u.enteredThisTurn && !hasKw(u.def, 'Swift');
  const wardUp = hasKw(u.def, 'Ward') && !u.wardUsed;
  return (
    // A div, not a <button>: keyword pills below render their own <button>
    // for the click-to-open glossary popover, and nested buttons are invalid
    // HTML / break keyboard navigation (same reasoning as CardFace).
    <div
      role="button"
      tabIndex={onClick ? 0 : -1}
      aria-disabled={!onClick}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`${u.def.name}, ${atk} attack, ${hp} of ${maxHp} health${exhausted ? ', exhausted' : ''}${sick ? ', summoning sick' : ''}`}
      className={cn(
        'relative w-[92px] sm:w-[120px] bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm text-left shrink-0',
        onClick && 'btn-pop cursor-pointer',
        highlight && 'ring-4 ring-[var(--c-red)] -translate-y-1',
        isAttacker && 'ring-4 ring-[var(--c-yellow)] -translate-y-1',
        dimmed && 'opacity-45',
        (exhausted || sick) && 'saturate-50',
      )}
    >
      <div className="h-[44px] sm:h-[62px] overflow-hidden ink-border-sm m-0.5">
        <SafeImage src={u.def.image} className="w-full h-full object-cover" />
      </div>
      <div className="px-0.5 pb-0.5">
        <div className="heading-font text-[8px] sm:text-[10px] leading-tight truncate">
          {u.def.name}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] sm:text-[13px] font-mono font-bold">
            {atk}
            <span className="text-[var(--c-red)]">⚔</span>
          </span>
          <span
            className={cn(
              'text-[10px] sm:text-[13px] font-mono font-bold',
              hp < maxHp && 'text-[var(--c-red)]',
            )}
          >
            {hp}/{maxHp}
            <span className="text-[#43A047]">♥</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-0.5 min-h-[9px] sm:min-h-[13px]">
          {kwList(u.def)
            .slice(0, 3)
            .map((kw) => (
              <KeywordChip key={kw} kw={kw} small autoIntroduce />
            ))}
        </div>
      </div>
      <div className="absolute -top-1.5 -right-1.5 flex gap-0.5">
        {wardUp && (
          <span title="Ward available" className="text-[9px] bg-[#29B6F6] ink-border-sm px-0.5">
            🛡
          </span>
        )}
        {u.boundThisTurn && (
          <span title="Bound" className="text-[9px] bg-[#8E44AD] text-white ink-border-sm px-0.5">
            ⛓
          </span>
        )}
        {sick && (
          <span
            title="Just played"
            className="text-[9px] bg-[var(--c-steel)] text-white ink-border-sm px-0.5"
          >
            z
          </span>
        )}
        {exhausted && !sick && (
          <span
            title="Exhausted"
            className="text-[9px] bg-[var(--c-steel)] text-white ink-border-sm px-0.5"
          >
            ✓
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leader panel
// ---------------------------------------------------------------------------
function LeaderPanel({
  g,
  p,
  isHuman,
  onAbility,
  onUltimate,
  abilityUsable,
  ultimateUsable,
  highlight,
  onClickTarget,
  onInspect,
}: {
  g: Game;
  p: Player;
  isHuman: boolean;
  onAbility?: () => void;
  onUltimate?: () => void;
  abilityUsable?: boolean;
  ultimateUsable?: boolean;
  highlight?: boolean;
  onClickTarget?: () => void;
  onInspect?: () => void;
}) {
  const l = p.leader;
  const hp = Math.max(0, remainingHp(g, l));
  const maxHp = effMaxHp(g, l);
  const ab = l.def.ability;
  const ult = l.def.ultimate;
  const abThr = effAbilityThreshold(g, l);
  const toll = tollReduction(g, p.id);
  const resolveOn = !!l.def.resolve && hp * 2 <= maxHp;
  // Interactive controls (human only) replace the ability/ultimate text the
  // shared rules section would otherwise print, so it isn't duplicated.
  const liveDef = { ...l.def, hp, ...(isHuman ? { ability: undefined, ultimate: undefined } : {}) };
  return (
    <div className={cn('shrink-0', highlight && 'ring-4 ring-[var(--c-red)] rounded-[6px]')}>
      <CardFace
        def={liveDef}
        size="standard"
        maxHp={maxHp}
        introduceKeywords
        onClick={onClickTarget ?? onInspect}
        badge={
          resolveOn ? `RESOLVE ${l.def.resolve!.x} ON` : toll > 0 ? `TOLL -${toll}` : undefined
        }
        footer={
          isHuman && (ab || ult) ? (
            <div
              className="px-1.5 pb-1.5 flex flex-col gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              {ab && (
                <button
                  onClick={onAbility}
                  disabled={!abilityUsable}
                  className={cn(
                    'w-full text-[9px] font-bold px-1 py-0.5 ink-border-sm text-left leading-tight',
                    abilityUsable
                      ? 'btn-pop bg-[var(--c-yellow)] text-[var(--c-ink)]'
                      : 'bg-[var(--c-steel)]/60 text-[var(--c-paper)]/50',
                    l.abilityUsed && 'line-through',
                  )}
                >
                  {abThr}+{abThr !== ab.threshold ? ` (was ${ab.threshold}+)` : ''}{' '}
                  {describeEffect(ab.effect)}
                </button>
              )}
              {ult && (
                <button
                  onClick={onUltimate}
                  disabled={!ultimateUsable}
                  className={cn(
                    'w-full text-[9px] font-bold px-1 py-0.5 ink-border-sm text-left leading-tight',
                    ultimateUsable
                      ? 'btn-pop bg-[var(--c-red)] text-white'
                      : 'bg-[var(--c-steel)]/60 text-[var(--c-paper)]/50',
                    l.ultimateUsed && 'line-through',
                  )}
                >
                  ULT (turn {ult.unlockTurn}+, {ult.threshold}+): {describeEffect(ult.effect)}
                  {l.ultimateUsed ? ' — SPENT' : ''}
                </button>
              )}
            </div>
          ) : undefined
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
type Stage =
  'mulligan' | 'awaitRoll' | 'rolling' | 'preRoll' | 'placement' | 'combat' | 'cpu' | 'over';

const ROLL_ANIM_MS = 650;
// v4.3: much slower, narrated CPU turns — a "thinking" beat before it acts,
// then every log line the AI produced streams in one at a time instead of
// the whole turn resolving silently in one snapshot. SKIP ▸▸ still escapes
// both stages instantly for an impatient player.
const CPU_THINK_MS = 900;
const CPU_LINE_MS = 950;

interface Pending {
  kind: 'cast' | 'ability' | 'ultimate' | 'echo';
  cardIid: string;
  effect: Effect;
  /** Set when this ability activation is a Rally (donated die from another
   * already-exhausted permanent) rather than the card's own die. */
  rallySourceIid?: string;
  /** v4.3: multi-die selection for a 'sum'-cost card, in place of selDie. */
  dieIndices?: number[];
}

/** v4.3: in-progress "build a dice sum" cast for a 'sum'-cost hand card.
 * `mode: 'echo'` reuses the same dice-picker for a 'sum'-cost Echo recast
 * (cardIid then refers to a discard-pile card, not a hand card). */
interface SumCast {
  cardIid: string;
  sel: Set<number>;
  mode?: 'echo';
}

export function GameV4({
  humanDeck,
  cpuDeck,
  humanLabel,
  cpuLabel,
  playerName,
  onExit,
  onResult,
  reward,
  rewardError,
}: {
  /** A prebuilt archetype's DeckDef, or a player's own saved deck resolved against the pool. */
  humanDeck: DeckDef;
  cpuDeck: DeckDef;
  humanLabel: string;
  cpuLabel: string;
  playerName: string;
  onExit: () => void;
  onResult?: (won: boolean) => void;
  /** Post-match rewards from recordMatchResult(), shown on the game-over
   * screen once the parent has recorded the result (null/undefined until
   * then, or forever for guests). */
  reward?: MatchResult | null;
  /** Set once the parent gives up retrying a failed recordMatchResult() —
   * shown in place of the reward banner so a network/server error doesn't
   * just look like the reward never showed up. */
  rewardError?: string | null;
}) {
  // The engine Game object is mutated in place by engine actions; it lives in
  // state via a lazy initializer (stable identity for the whole match) and a
  // version counter forces re-renders after each mutation.
  const [g] = useState<Game>(() => {
    const game = newGame(humanDeck, cpuDeck, mulberry32(Date.now() % 2147483647));
    // Give the CPU the same opening-hand judgment the playtest harness always
    // gave it (maybeMulliganPlayer) — the human's own mulligan stays a manual
    // UI decision below, but leaving the CPU's hand un-mulliganed made it
    // meaningfully weaker/more random here than in every simulated game.
    maybeMulliganPlayer(game, 'B', game.rng);
    return game;
  });
  const HUMAN = 'A';
  const CPU = 'B';
  const me = g.players[HUMAN];
  const foe = g.players[CPU];

  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const [stage, setStage] = useState<Stage>('mulligan');
  const [mulliganUsed, setMulliganUsed] = useState(false);
  const [selDie, setSelDie] = useState<number | null>(null);
  const [rerollSel, setRerollSel] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  // v4.3: 'sum'-cost card whose dice selection is currently being built.
  const [sumCast, setSumCast] = useState<SumCast | null>(null);
  // A Rally activation in progress: the card whose ability is being
  // triggered for free, awaiting the player to pick a donor permanent
  // (an already-exhausted ability user with a high-enough resting die).
  const [rallyPick, setRallyPick] = useState<string | null>(null);
  const [attacker, setAttacker] = useState<string | null>(null);
  // Echo card awaiting fodder — targetIid is set first if the recast effect needs one.
  const [echoPick, setEchoPick] = useState<{
    cardIid: string;
    targetIid?: string;
    /** v4.3: the dice picked to pay a 'sum'-cost card's Echo recast, carried
     * from confirmSumEcho through the fodder-discard step below. */
    dieIndices?: number[];
  } | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);
  const [inspect, setInspect] = useState<CardDef | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [forcedDiscard, setForcedDiscard] = useState<{ needed: number; picks: string[] } | null>(
    null,
  );
  const resultSent = useRef(false);
  const cpuTimeoutRef = useRef<number | null>(null);
  const bannerTimeoutRef = useRef<number | null>(null);
  const rollTimeoutRef = useRef<number | null>(null);
  // v4.3: CPU turn narration — the AI's whole turn is computed up front (the
  // engine has no resumable/step mode), but its log lines are revealed one
  // at a time on a delay so the player can actually follow what happened,
  // instead of the board snapping straight to the post-turn result.
  const cpuLogRef = useRef<string[]>([]);
  const cpuLogIdxRef = useRef(0);
  const cpuTurnPlayedRef = useRef(false);
  const [cpuNarration, setCpuNarration] = useState<string | null>(null);
  // Which die indices are mid-animation (spinning through random faces)
  // right now — driven by a rolling stage or a reroll, cleared once the
  // settle timeout fires.
  const [rollingDice, setRollingDice] = useState<Set<number>>(new Set());

  const say = (msg: string) => {
    setBanner(msg);
    if (bannerTimeoutRef.current !== null) window.clearTimeout(bannerTimeoutRef.current);
    bannerTimeoutRef.current = window.setTimeout(() => {
      setBanner((b) => (b === msg ? null : b));
      bannerTimeoutRef.current = null;
    }, 2200);
  };

  useEffect(
    () => () => {
      if (cpuTimeoutRef.current !== null) window.clearTimeout(cpuTimeoutRef.current);
      if (bannerTimeoutRef.current !== null) window.clearTimeout(bannerTimeoutRef.current);
      if (rollTimeoutRef.current !== null) window.clearTimeout(rollTimeoutRef.current);
    },
    [],
  );

  // ---- turn driving -------------------------------------------------------
  // Values are rolled by the engine immediately (startTurn), but they stay
  // hidden (face-down) until the human player clicks ROLL DICE themselves —
  // that click is what triggers the reveal animation, so it reads as the
  // player's own roll rather than numbers just appearing.
  const beginHumanTurn = () => {
    startTurn(g);
    bump();
    if (g.winner) {
      setStage('over');
      return;
    }
    setRerollSel(new Set());
    setSelDie(null);
    setPending(null);
    // Clear every selection overlay that could have been left armed when the
    // previous turn ended (sum-cast, Rally donor pick, Echo fodder pick,
    // attacker) — otherwise e.g. an unconfirmed sum-cast bar from last turn
    // sticks around and keeps the dice tray in sum-select mode.
    setSumCast(null);
    setRallyPick(null);
    setEchoPick(null);
    setAttacker(null);
    setStage('awaitRoll');
  };

  const doRollDice = () => {
    setStage('rolling');
    setRollingDice(new Set([0, 1, 2, 3, 4]));
    if (rollTimeoutRef.current !== null) window.clearTimeout(rollTimeoutRef.current);
    rollTimeoutRef.current = window.setTimeout(() => {
      rollTimeoutRef.current = null;
      setRollingDice(new Set());
      setStage('preRoll');
    }, ROLL_ANIM_MS);
  };

  // Reveal the next queued CPU log line (or wrap up once they're exhausted).
  const tickCpuNarration = () => {
    cpuTimeoutRef.current = null;
    const lines = cpuLogRef.current;
    const i = cpuLogIdxRef.current;
    if (i >= lines.length) {
      setCpuNarration(null);
      bump();
      if (g.winner) {
        setStage('over');
        return;
      }
      beginHumanTurn();
      return;
    }
    setCpuNarration(lines[i]);
    cpuLogIdxRef.current = i + 1;
    cpuTimeoutRef.current = window.setTimeout(tickCpuNarration, CPU_LINE_MS);
  };

  // Plays the CPU's entire turn (the AI has no resumable/step mode), then
  // narrates what it did one log line at a time instead of snapping the
  // board straight to the result.
  const resolveCpuTurn = () => {
    cpuTimeoutRef.current = null;
    const before = g.log.length;
    playTurn(g);
    cpuTurnPlayedRef.current = true;
    const newLines = g.log.slice(before);
    cpuLogRef.current = newLines.length > 0 ? newLines : [`${cpuLabel} passes.`];
    cpuLogIdxRef.current = 0;
    tickCpuNarration();
  };

  const runCpuTurn = () => {
    setStage('cpu');
    setCpuNarration(null);
    cpuTurnPlayedRef.current = false;
    cpuLogRef.current = [];
    cpuLogIdxRef.current = 0;
    cpuTimeoutRef.current = window.setTimeout(resolveCpuTurn, CPU_THINK_MS);
  };

  // Lets an impatient player skip straight to the end of the CPU's turn,
  // whether it's still "thinking" or partway through narrating its log.
  const skipCpuDelay = () => {
    if (cpuTimeoutRef.current !== null) {
      window.clearTimeout(cpuTimeoutRef.current);
      cpuTimeoutRef.current = null;
    }
    if (!cpuTurnPlayedRef.current) {
      playTurn(g);
      cpuTurnPlayedRef.current = true;
    }
    cpuLogIdxRef.current = cpuLogRef.current.length;
    setCpuNarration(null);
    bump();
    if (g.winner) {
      setStage('over');
      return;
    }
    beginHumanTurn();
  };

  // Conceding is a resignation, not a free way to dodge a loss on the
  // record — report it the same as an in-game defeat before exiting.
  const concede = () => {
    if (stage !== 'over' && !resultSent.current) {
      resultSent.current = true;
      onResult?.(false);
    }
    onExit();
  };

  const afterMulligan = () => {
    if (g.active === HUMAN) beginHumanTurn();
    else runCpuTurn();
  };

  // Report the result once.
  useEffect(() => {
    if (stage === 'over' && g.winner && !resultSent.current) {
      resultSent.current = true;
      if (g.winner !== 'draw') onResult?.(g.winner === HUMAN);
    }
  }, [stage, g.winner, onResult]);

  // Escape closes whatever overlay is frontmost, and backs out of a pending
  // targeting/attack selection — the same "cancel" affordance as the visible
  // ✕ buttons, just reachable without a mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (inspect) setInspect(null);
      else if (pending) setPending(null);
      else if (sumCast) setSumCast(null);
      else if (rallyPick) setRallyPick(null);
      else if (showDiscard) {
        setShowDiscard(false);
        setEchoPick(null);
      } else if (echoPick) setEchoPick(null);
      else if (attacker) setAttacker(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inspect, showDiscard, echoPick, pending, sumCast, rallyPick, attacker]);

  // ---- mulligan (human only; CPU keeps — its opening heuristic is baked into play) ----
  const doMulligan = () => {
    mulliganRedraw(g, HUMAN);
    setMulliganUsed(true);
    bump();
  };

  // ---- placement helpers --------------------------------------------------
  const unplaced = me.dice.map((d, i) => ({ ...d, i })).filter((d) => !d.placed);
  const dieVal =
    selDie !== null && me.dice[selDie] && !me.dice[selDie].placed ? me.dice[selDie].value : null;

  const canCastNow = (c: Inst): { ok: boolean; why?: string } => {
    if (c.def.type === 'Location') {
      // Free Location casts are a Placement Phase bonus action (§7) — not
      // available before or during the roll, same as every other cast (a
      // `stage === 'preRoll'`-only check let a Location render as clickable
      // during 'awaitRoll'/'rolling' too, since neither was excluded).
      if (stage !== 'placement')
        return { ok: false, why: 'Free Location cast happens during Placement' };
      if (me.locationCastThisTurn) return { ok: false, why: 'Location already cast this turn' };
      if (me.location?.def.id === c.def.id) return { ok: false, why: 'Same-name Location in play' };
      return { ok: true };
    }
    if (stage === 'preRoll' && !c.def.snap)
      return { ok: false, why: 'Only Snap Charms before the reroll' };
    if (c.def.comboGate) {
      if (me.comboGateCastThisTurn) return { ok: false, why: 'One Combo-gated card per turn' };
      if (!matchesPattern(rollValues(me), c.def.comboGate))
        return { ok: false, why: `Roll lacks ${c.def.comboGate}` };
      if (dieVal === null) return { ok: false, why: 'Select a die' };
      return { ok: true };
    }
    const thr = effThreshold(g, HUMAN, c.def);
    if (c.def.castCostKind === 'sum') {
      const available = unplaced.reduce((s, d) => s + d.value, 0);
      if (available < thr)
        return { ok: false, why: `Needs dice totalling ${thr}+ (have ${available})` };
      if (needsTarget(c.def.onCast) && targetsFor(g, HUMAN, c.def.onCast!).length === 0)
        return { ok: false, why: 'No legal target' };
      return { ok: true };
    }
    if (dieVal === null) return { ok: false, why: 'Select a die' };
    if (c.def.castCostKind === 'exact') {
      if (dieVal !== thr) return { ok: false, why: `Needs exactly ${thr}` };
    } else if (dieVal < thr) {
      return { ok: false, why: `Needs ${thr}+` };
    }
    if (needsTarget(c.def.onCast) && targetsFor(g, HUMAN, c.def.onCast!).length === 0)
      return { ok: false, why: 'No legal target' };
    return { ok: true };
  };

  /** Whether SOME currently-unplaced die could pay this card's cost, without
   * requiring one to already be selected — `canCastNow` alone reports every
   * threshold/exact-cost card as illegal ("Select a die") until a specific
   * die is picked first, so hand cards looked uncastable by default even
   * when the roll could clearly pay for them. Used only to decide whether a
   * card should look dimmed before the player has committed to a die. */
  const canCastWithAnyDie = (c: Inst): boolean => {
    if (c.def.type === 'Location') return canCastNow(c).ok;
    if (stage === 'preRoll' && !c.def.snap) return false;
    // Mirrors canCastNow's branch order exactly (minus the "a die must
    // already be selected" checks) — comboGate cards intentionally skip the
    // needsTarget check there too, so this must skip it here as well.
    // Also requires an unplaced die to actually exist — canCastNow's own
    // `dieVal === null` check implicitly forbids this once every die is
    // placed, since selecting an already-placed die still yields dieVal
    // null; this needs the same guard since it never reads dieVal at all.
    if (c.def.comboGate)
      return (
        unplaced.length > 0 &&
        !me.comboGateCastThisTurn &&
        matchesPattern(rollValues(me), c.def.comboGate)
      );
    const thr = effThreshold(g, HUMAN, c.def);
    if (c.def.castCostKind === 'sum') {
      if (unplaced.reduce((s, d) => s + d.value, 0) < thr) return false;
      return !needsTarget(c.def.onCast) || targetsFor(g, HUMAN, c.def.onCast!).length > 0;
    }
    const anyDieWorks =
      c.def.castCostKind === 'exact'
        ? unplaced.some((d) => d.value === thr)
        : unplaced.some((d) => d.value >= thr);
    if (!anyDieWorks) return false;
    return !needsTarget(c.def.onCast) || targetsFor(g, HUMAN, c.def.onCast!).length > 0;
  };

  const tryCast = (c: Inst) => {
    if (c.def.type === 'Location') {
      const chk = canCastNow(c);
      if (!chk.ok) {
        say(chk.why || 'Illegal');
        return;
      }
      if (castLocationFree(g, c.iid)) {
        bump();
        say(`${c.def.name} enters play (free).`);
      } else say('Illegal placement.');
      return;
    }
    const chk = canCastNow(c);
    if (!chk.ok) {
      say(chk.why || 'Illegal');
      return;
    }
    // 'sum'-cost cards (no comboGate) are cast by building a dice selection,
    // not by picking a single die first — arm the sum-select overlay instead
    // of casting immediately.
    if (c.def.castCostKind === 'sum' && !c.def.comboGate) {
      setSumCast({ cardIid: c.iid, sel: new Set() });
      setSelDie(null);
      say('Click dice to build the sum, then CAST.');
      return;
    }
    if (needsTarget(c.def.onCast) && targetsFor(g, HUMAN, c.def.onCast!).length > 0) {
      setPending({ kind: 'cast', cardIid: c.iid, effect: c.def.onCast! });
      return;
    }
    if (castFromHand(g, selDie!, c.iid)) {
      setSelDie(null);
      bump();
      say(
        hasKw(c.def, 'Twin')
          ? `${c.def.name} staged — match a ${me.staging.find((s) => s.iid === c.iid)?.stagedDie} later.`
          : `${c.def.name} resolves.`,
      );
    } else say('Illegal placement.');
    // A fixed-target cast (e.g. Sap enemyLeader) never opens the target
    // picker above, so lethal damage can land right here — check for it,
    // or the game-over screen never appears (the UI would just sit in
    // Placement with the win already decided internally).
    if (g.winner) setStage('over');
  };

  // ---- 'sum'-cost casting: build a multi-die selection, then confirm ------
  const cancelSumCast = () => setSumCast(null);

  const toggleSumDie = (i: number) => {
    setSumCast((sc) => {
      if (!sc) return sc;
      const sel = new Set(sc.sel);
      if (sel.has(i)) sel.delete(i);
      else sel.add(i);
      return { ...sc, sel };
    });
  };

  const confirmSumCast = () => {
    if (!sumCast || sumCast.sel.size === 0) return;
    const c = me.hand.find((h) => h.iid === sumCast.cardIid);
    if (!c) {
      setSumCast(null);
      return;
    }
    const dieIndices = [...sumCast.sel];
    if (needsTarget(c.def.onCast) && targetsFor(g, HUMAN, c.def.onCast!).length > 0) {
      setPending({ kind: 'cast', cardIid: c.iid, effect: c.def.onCast!, dieIndices });
      setSumCast(null);
      return;
    }
    if (castFromHand(g, dieIndices, c.iid)) {
      say(`${c.def.name} resolves.`);
      bump();
    } else say('Illegal placement.');
    setSumCast(null);
    if (g.winner) setStage('over');
  };

  // ---- 'sum'-cost Echo recast: same dice-picker as confirmSumCast, but the
  // card lives in discard and resolution still needs a fodder discard from
  // hand — hands off to echoPick/tryEchoFodder instead of casting directly.
  const confirmSumEcho = () => {
    if (!sumCast || sumCast.sel.size === 0) return;
    const c = me.discard.find((h) => h.iid === sumCast.cardIid);
    if (!c) {
      setSumCast(null);
      return;
    }
    const dieIndices = [...sumCast.sel];
    if (needsTarget(c.def.onCast)) {
      if (targetsFor(g, HUMAN, c.def.onCast!).length === 0) {
        say('No legal target.');
        setSumCast(null);
        return;
      }
      setPending({ kind: 'echo', cardIid: c.iid, effect: c.def.onCast!, dieIndices });
      return;
    }
    setEchoPick({ cardIid: c.iid, dieIndices });
    setSumCast(null);
    say('Now pick a hand card to discard.');
  };

  const resolvePendingOn = (targetIid: string) => {
    if (!pending) return;
    if (pending.kind === 'echo') {
      // Echo still needs a fodder discard from hand — stash the chosen
      // target (and, for a 'sum'-cost Echo, the dice already picked to pay
      // it) and hand off to the fodder-picking step instead of resolving
      // immediately.
      setEchoPick({ cardIid: pending.cardIid, targetIid, dieIndices: pending.dieIndices });
      setPending(null);
      setSumCast(null);
      say('Now pick a hand card to discard.');
      return;
    }
    let ok = false;
    if (pending.kind === 'cast')
      ok = castFromHand(g, pending.dieIndices ?? selDie!, pending.cardIid, targetIid);
    else if (pending.kind === 'ability')
      ok = pending.rallySourceIid
        ? activateViaRally(g, pending.cardIid, pending.rallySourceIid, targetIid)
        : activateAbility(g, selDie!, pending.cardIid, targetIid);
    else if (pending.kind === 'ultimate') ok = activateUltimate(g, selDie!, targetIid);
    setPending(null);
    if (ok) {
      setSelDie(null);
      bump();
    } else say('Illegal target.');
    if (g.winner) setStage('over');
  };

  const tryAbility = (c: Inst) => {
    if (stage !== 'placement') {
      say('Abilities resolve during Placement.');
      return;
    }
    if (!c.def.ability) return;
    if (c.abilityUsed) {
      say('Already used this turn.');
      return;
    }
    if (dieVal === null) {
      say('Select a die.');
      return;
    }
    const thr = effAbilityThreshold(g, c);
    if (dieVal < thr) {
      say(`Needs ${thr}+.`);
      return;
    }
    if (c.def.type === 'Unit' && c.hasAttacked) {
      say('Attacked already — abilities locked.');
      return;
    }
    if (c.def.type === 'Unit' && c.boundThisTurn) {
      say(`Bound — can't act this turn.`);
      return;
    }
    if (c.def.type === 'Unit' && c.enteredThisTurn && !hasKw(c.def, 'Swift')) {
      say('Just played — can’t act yet.');
      return;
    }
    if (needsTarget(c.def.ability.effect)) {
      if (targetsFor(g, HUMAN, c.def.ability.effect).length === 0) {
        say('No legal target.');
        return;
      }
      setPending({ kind: 'ability', cardIid: c.iid, effect: c.def.ability.effect });
      return;
    }
    if (activateAbility(g, selDie!, c.iid)) {
      setSelDie(null);
      bump();
    } else say('Illegal.');
    if (g.winner) setStage('over');
  };

  const tryRally = (u: Inst) => {
    if (stage !== 'placement') {
      say('Rally resolves during Placement.');
      return;
    }
    if (!u.def.ability || u.abilityUsed) return;
    if (u.hasAttacked || u.boundThisTurn) {
      say(`Can't Rally — exhausted or bound.`);
      return;
    }
    if (u.enteredThisTurn && !hasKw(u.def, 'Swift')) {
      say('Just played — can’t act yet.');
      return;
    }
    if (rallySourcesFor(g, HUMAN, u).length === 0) {
      say('No exhausted permanent has a high-enough resting die.');
      return;
    }
    if (
      needsTarget(u.def.ability.effect) &&
      targetsFor(g, HUMAN, u.def.ability.effect).length === 0
    ) {
      say('No legal target.');
      return;
    }
    setRallyPick(u.iid);
    setPending(null);
    say('Pick a donor — an exhausted permanent with a high-enough resting die.');
  };

  const resolveRallySource = (sourceIid: string) => {
    if (!rallyPick) return;
    const u = [...me.board, me.leader, me.location].find(
      (x): x is Inst => !!x && x.iid === rallyPick,
    );
    if (!u || !u.def.ability) {
      setRallyPick(null);
      return;
    }
    if (needsTarget(u.def.ability.effect)) {
      setPending({
        kind: 'ability',
        cardIid: u.iid,
        effect: u.def.ability.effect,
        rallySourceIid: sourceIid,
      });
      setRallyPick(null);
      return;
    }
    if (activateViaRally(g, u.iid, sourceIid)) {
      bump();
    } else say('Illegal Rally.');
    setRallyPick(null);
    if (g.winner) setStage('over');
  };

  const tryUltimate = () => {
    const ult = me.leader.def.ultimate;
    if (!ult || me.leader.ultimateUsed) return;
    if (stage !== 'placement') {
      say('Ultimates resolve during Placement.');
      return;
    }
    if (me.turnsTaken < ult.unlockTurn) {
      say(`Unlocks on your turn ${ult.unlockTurn}.`);
      return;
    }
    if (dieVal === null || dieVal < ult.threshold) {
      say(`Select a die of ${ult.threshold}+.`);
      return;
    }
    if (needsTarget(ult.effect)) {
      if (targetsFor(g, HUMAN, ult.effect).length === 0) {
        say('No legal target.');
        return;
      }
      setPending({ kind: 'ultimate', cardIid: me.leader.iid, effect: ult.effect });
      return;
    }
    if (activateUltimate(g, selDie!)) {
      setSelDie(null);
      bump();
    }
    if (g.winner) setStage('over');
  };

  const tryScrap = (c: Inst) => {
    if (stage !== 'placement') {
      say('Scrap works during Placement.');
      return;
    }
    if (selDie === null) {
      say('Select the die to reroll.');
      return;
    }
    if (scrap(g, c.iid, selDie)) {
      bump();
      say(`Scrapped ${c.def.name}: die is now ${me.dice[selDie].value}.`);
    }
  };

  const tryCompleteTwin = (s: Inst) => {
    if (stage !== 'placement') return;
    if (dieVal === null) {
      say('Select a die.');
      return;
    }
    if (dieVal !== s.stagedDie) {
      say(`Needs the exact face ${s.stagedDie}.`);
      return;
    }
    if (completeTwin(g, selDie!, s.iid)) {
      setSelDie(null);
      bump();
      say(`${s.def.name} completed!`);
    } else
      say(g.rules.twinMode === 'oneDiePerTurn' ? 'One die per Twin card per turn.' : 'Illegal.');
    if (g.winner) setStage('over');
  };

  const tryEchoFodder = (fodder: Inst) => {
    if (!echoPick) return;
    // A 'sum'-cost Echo already collected its dice in confirmSumEcho; every
    // other Echo still needs a single die selected right here.
    const dice = echoPick.dieIndices ?? (selDie !== null ? selDie : null);
    if (dice === null) {
      say('Select a die.');
      return;
    }
    const target = me.discard.find((c) => c.iid === echoPick.cardIid);
    if (!target) {
      setEchoPick(null);
      return;
    }
    if (echoRecast(g, dice, echoPick.cardIid, fodder.iid, echoPick.targetIid)) {
      setEchoPick(null);
      setSelDie(null);
      setShowDiscard(false);
      bump();
      say(`${target.def.name} echoes back into play.`);
    } else {
      say('Illegal Echo.');
      setEchoPick(null);
    }
    if (g.winner) setStage('over');
  };

  const toCombat = () => {
    comboCheck(g);
    bump();
    if (g.winner) {
      setStage('over');
      return;
    }
    setSelDie(null);
    setPending(null);
    // Placement-only selection modes must not leak into Combat: a live
    // sum-cast keeps the dice in sum-select mode, an armed Rally pick keeps
    // donors highlighted, and a pending Echo fodder pick would hijack hand
    // clicks (tryEchoFodder) during Combat.
    setSumCast(null);
    setRallyPick(null);
    setEchoPick(null);
    setStage('combat');
  };

  const finishTurn = (picks?: string[]) => {
    const queue = picks ? [...picks] : undefined;
    finishEndPhase(g, (hand) => {
      if (queue && queue.length) {
        const iid = queue.shift()!;
        const found = hand.find((c) => c.iid === iid);
        if (found) return found;
      }
      return defaultDiscardChoice(hand);
    });
    bump();
    if (g.winner) {
      setStage('over');
      return;
    }
    setAttacker(null);
    runCpuTurn();
  };

  // End Phase discards down to hand size 6 (§3.7) — the rulebook gives the
  // player the choice of which cards, so route through a picker modal
  // whenever ending the turn would otherwise force a discard. Pitch/Tribute
  // are resolved first since Tribute can draw a card and push the hand over
  // the limit even when it wasn't before — the picker needs the post-draw
  // hand size, not the pre-draw one.
  const attemptFinishTurn = () => {
    resolveEndPhasePreDiscard(g);
    bump();
    if (g.winner) {
      setStage('over');
      return;
    }
    const needed = me.hand.length - 6;
    if (needed > 0) {
      setForcedDiscard({ needed, picks: [] });
      return;
    }
    finishTurn();
  };

  const toggleForcedDiscardPick = (iid: string) => {
    setForcedDiscard((fd) => {
      if (!fd) return fd;
      const picks = fd.picks.includes(iid)
        ? fd.picks.filter((x) => x !== iid)
        : fd.picks.length < fd.needed
          ? [...fd.picks, iid]
          : fd.picks;
      return { ...fd, picks };
    });
  };

  const confirmForcedDiscard = () => {
    if (!forcedDiscard || forcedDiscard.picks.length !== forcedDiscard.needed) return;
    const picks = forcedDiscard.picks;
    setForcedDiscard(null);
    finishTurn(picks);
  };

  const doReroll = () => {
    const picks = [...rerollSel];
    reroll(g, picks);
    setRerollSel(new Set());
    if (picks.length > 0) {
      setRollingDice(new Set(picks));
      if (rollTimeoutRef.current !== null) window.clearTimeout(rollTimeoutRef.current);
      rollTimeoutRef.current = window.setTimeout(() => {
        rollTimeoutRef.current = null;
        setRollingDice(new Set());
      }, ROLL_ANIM_MS);
    }
    bump();
    setStage(g.stage === 'PLACEMENT' ? 'placement' : 'preRoll');
  };

  // ---- combat helpers -----------------------------------------------------
  const combatTargets = attacker ? legalTargets(g, HUMAN) : [];

  const tryAttackTarget = (iid: string) => {
    if (!attacker) return;
    if (attack(g, attacker, iid)) {
      const stillCan = me.board.find((u) => u.iid === attacker && canAttack(g, u));
      setAttacker(stillCan ? attacker : null);
      bump();
    } else say('Illegal target (Guard?).');
    if (g.winner) setStage('over');
  };

  // Targeting overlay for pending effects
  const pendingTargets = pending ? targetsFor(g, HUMAN, pending.effect) : [];
  const isPendingTarget = (iid: string) => pendingTargets.some((t) => t.iid === iid);

  const rallyUnit = rallyPick
    ? [...me.board, me.leader, me.location].find((x): x is Inst => !!x && x.iid === rallyPick)
    : null;
  const rallySources = rallyUnit ? rallySourcesFor(g, HUMAN, rallyUnit) : [];
  const isRallySource = (iid: string) => rallySources.some((s) => s.iid === iid);

  const echoables = me.discard.filter((c) => hasKw(c.def, 'Echo') && !c.echoSpent);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      className="w-full h-screen flex flex-col overflow-hidden select-none"
      style={{
        background: 'radial-gradient(ellipse at center, var(--c-steel) 0%, var(--c-ink) 78%)',
      }}
    >
      {/* Top bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--c-ink)] shadow-hard-black-xs z-30">
        <button
          onClick={() =>
            (stage === 'over' ||
              window.confirm('Concede this match? This will count as a loss.')) &&
            concede()
          }
          className="btn-pop heading-font text-[10px] bg-[var(--c-ink)] text-[var(--c-paper)] px-2 py-0.5 ink-border-sm"
        >
          ✕ CONCEDE
        </button>
        <span className="heading-font text-[11px] text-[var(--c-yellow)]">
          TURN {Math.ceil(g.turn / 2) || 1} ·{' '}
          {stage === 'cpu'
            ? "CPU'S TURN"
            : stage === 'awaitRoll'
              ? 'YOUR ROLL'
              : stage === 'rolling'
                ? 'ROLLING…'
                : stage === 'preRoll'
                  ? 'REROLL & SNAP'
                  : stage === 'placement'
                    ? 'PLACEMENT'
                    : stage === 'combat'
                      ? 'COMBAT'
                      : stage.toUpperCase()}
        </span>
        <span className="text-[9px] font-mono text-[var(--c-paper)]/70 truncate">
          {humanLabel} vs {cpuLabel}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {stage === 'placement' && (
            <button
              onClick={toCombat}
              className="btn-pop heading-font text-[10px] bg-[var(--c-yellow)] text-[var(--c-ink)] px-2 py-0.5 ink-border-sm"
            >
              COMBO CHECK → COMBAT
            </button>
          )}
          {stage === 'combat' && (
            <button
              onClick={attemptFinishTurn}
              className="btn-pop heading-font text-[10px] bg-[var(--c-red)] text-white px-2 py-0.5 ink-border-sm"
            >
              END TURN {unplaced.length > 0 ? `(pitch ${unplaced.length}⚄)` : ''}
            </button>
          )}
          {stage === 'awaitRoll' && (
            <button
              onClick={doRollDice}
              className="btn-pop heading-font text-[11px] bg-[var(--c-red)] text-white px-3 py-1 ink-border-sm animate-pulse"
            >
              🎲 ROLL DICE
            </button>
          )}
          {stage === 'preRoll' && (
            <button
              onClick={doReroll}
              className="btn-pop heading-font text-[10px] bg-[var(--c-yellow)] text-[var(--c-ink)] px-2 py-0.5 ink-border-sm"
            >
              {rerollSel.size > 0
                ? `REROLL ${rerollSel.size} (${rerollsRemaining(g, HUMAN)} left)`
                : 'KEEP ALL'}{' '}
              →
            </button>
          )}
        </div>
      </div>

      <CoachOverlay stage={stage} />

      {banner && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-[11px] px-3 py-1 ink-border-sm shadow-hard-black-xs">
          {banner}
        </div>
      )}
      {stage === 'cpu' && cpuNarration && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[var(--c-red)] text-white heading-font text-[11px] px-3 py-1 ink-border-sm shadow-hard-black-xs max-w-[80vw] text-center">
          {cpuLabel}: {cpuNarration}
        </div>
      )}
      {pending && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[var(--c-red)] text-white heading-font text-[11px] px-3 py-1 ink-border-sm flex gap-2 items-center">
          PICK A TARGET — {describeEffect(pending.effect)}
          <button
            onClick={() => setPending(null)}
            aria-label="Cancel targeting"
            className="bg-[var(--c-ink)] px-1"
          >
            ✕
          </button>
        </div>
      )}
      {rallyPick && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[#8E44AD] text-white heading-font text-[11px] px-3 py-1 ink-border-sm flex gap-2 items-center">
          PICK A DONOR — an exhausted permanent with a high-enough resting die
          <button
            onClick={() => setRallyPick(null)}
            aria-label="Cancel Rally"
            className="bg-[var(--c-ink)] px-1"
          >
            ✕
          </button>
        </div>
      )}
      {sumCast &&
        (() => {
          const isEcho = sumCast.mode === 'echo';
          const c = (isEcho ? me.discard : me.hand).find((h) => h.iid === sumCast.cardIid);
          const target = c ? effThreshold(g, HUMAN, c.def) : 0;
          const total = [...sumCast.sel].reduce((s, i) => s + (me.dice[i]?.value ?? 0), 0);
          const met = total >= target;
          return (
            <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[#B45309] text-white heading-font text-[11px] px-3 py-1 ink-border-sm flex gap-2 items-center">
              {isEcho ? 'SUM ECHO' : 'SUM CAST'} — {c?.def.name}: Σ {total}/{target}
              <button
                onClick={isEcho ? confirmSumEcho : confirmSumCast}
                disabled={!met}
                className={cn(
                  'px-1.5 py-0.5',
                  met ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]' : 'bg-[var(--c-ink)]/40',
                )}
              >
                {isEcho ? 'ECHO' : 'CAST'}
              </button>
              <button
                onClick={cancelSumCast}
                aria-label={isEcho ? 'Cancel sum echo' : 'Cancel sum cast'}
                className="bg-[var(--c-ink)] px-1"
              >
                ✕
              </button>
            </div>
          );
        })()}
      {!pending && attacker && stage === 'combat' && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-[11px] px-3 py-1 ink-border-sm flex gap-2 items-center">
          SELECT AN ATTACK TARGET
          <button
            onClick={() => setAttacker(null)}
            aria-label="Cancel attack"
            className="bg-[var(--c-ink)] text-white px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Enemy row */}
      <div className="h-[3px] w-full bg-[var(--c-red)]/70 shrink-0" />
      <div className="flex gap-2 px-2 pt-2 pb-1.5 items-start bg-[var(--c-ink)]/25">
        <LeaderPanel
          g={g}
          p={foe}
          isHuman={false}
          highlight={
            (!!pending && isPendingTarget(foe.leader.iid)) ||
            (!!attacker && combatTargets.some((t) => t.iid === foe.leader.iid))
          }
          onClickTarget={
            pending && isPendingTarget(foe.leader.iid)
              ? () => resolvePendingOn(foe.leader.iid)
              : attacker && combatTargets.some((t) => t.iid === foe.leader.iid)
                ? () => tryAttackTarget(foe.leader.iid)
                : undefined
          }
          onInspect={() => setInspect(foe.leader.def)}
        />
        <div className="flex-1 min-w-0">
          <div className="flex gap-1 text-[8px] font-bold text-[var(--c-paper)]/70 mb-0.5">
            <span>
              CPU · hand {foe.hand.length} · deck {foe.deck.length} · discard {foe.discard.length}
            </span>
            {foe.location && (
              <span
                className="bg-[var(--c-steel)] px-1 ink-border-sm text-[var(--c-paper)] cursor-pointer"
                onClick={() => setInspect(foe.location!.def)}
              >
                📍 {foe.location.def.name}
              </span>
            )}
            {foe.staging.length > 0 && <span>staging {foe.staging.length}</span>}
          </div>
          <div className="flex gap-1 flex-wrap min-h-[92px] sm:min-h-[130px]">
            {foe.board.length === 0 && (
              <div className="w-full h-[80px] sm:h-[110px] border-2 border-dashed border-[var(--c-paper)]/15 rounded-md flex items-center justify-center">
                <span className="text-[9px] text-[var(--c-paper)]/30 font-bold uppercase tracking-wide">
                  Empty Board
                </span>
              </div>
            )}
            {foe.board.map((u) => {
              const targetable =
                (!!pending && isPendingTarget(u.iid)) ||
                (!!attacker && combatTargets.some((t) => t.iid === u.iid));
              return (
                <React.Fragment key={u.iid}>
                  <BoardUnit
                    g={g}
                    u={u}
                    highlight={targetable}
                    onClick={
                      pending && isPendingTarget(u.iid)
                        ? () => resolvePendingOn(u.iid)
                        : attacker && combatTargets.some((t) => t.iid === u.iid)
                          ? () => tryAttackTarget(u.iid)
                          : () => setInspect(u.def)
                    }
                  />
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Midline: dice tray + log */}
      <div className="flex items-center gap-3 px-2 py-2 my-1 bg-[var(--c-ink)]/40 border-y-2 border-[var(--c-yellow)]/40 shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
        <div className="flex gap-1.5 items-center">
          {me.dice.map((d, i) => {
            const isRolling = rollingDice.has(i);
            const faceDown = stage === 'awaitRoll';
            const inSumMode = !!sumCast;
            const usable =
              !d.placed && !isRolling && (stage === 'placement' || stage === 'preRoll');
            const marked = inSumMode
              ? sumCast!.sel.has(i)
              : stage === 'preRoll'
                ? rerollSel.has(i)
                : selDie === i;
            return (
              <button
                key={i}
                disabled={!usable}
                onClick={() => {
                  if (inSumMode) {
                    toggleSumDie(i);
                  } else if (stage === 'preRoll') {
                    setRerollSel((s) => {
                      const n = new Set(s);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    });
                  } else {
                    setSelDie(selDie === i ? null : i);
                    setPending(null);
                  }
                }}
                className={cn(
                  'w-12 h-12 ink-border-md rounded-md text-3xl leading-none flex items-center justify-center transition-transform',
                  isRolling && 'die-rolling',
                  faceDown
                    ? 'bg-[var(--c-steel)] text-[var(--c-paper)]/40'
                    : d.placed
                      ? 'bg-[var(--c-steel)]/40 text-[var(--c-paper)]/25'
                      : marked
                        ? inSumMode
                          ? 'bg-[#B45309] text-white -translate-y-1 shadow-hard-black-xs'
                          : stage === 'preRoll'
                            ? 'bg-[var(--c-red)] text-white -translate-y-1 shadow-hard-black-xs'
                            : 'bg-[var(--c-yellow)] text-[var(--c-ink)] -translate-y-1 shadow-hard-black-xs'
                        : 'bg-[var(--c-paper)] text-[var(--c-ink)] shadow-hard-black-xs',
                  usable && 'btn-pop',
                )}
                title={
                  d.placed
                    ? 'Placed'
                    : inSumMode
                      ? 'Toggle into sum'
                      : stage === 'preRoll'
                        ? 'Toggle reroll'
                        : 'Select die'
                }
                aria-label={
                  faceDown
                    ? `Die ${i + 1}: not yet rolled`
                    : `Die ${i + 1}: value ${d.value}${d.placed ? ' (placed)' : marked ? ' (selected)' : ''}`
                }
                aria-pressed={marked}
              >
                {faceDown ? '🎲' : DIE_FACES[d.value - 1]}
              </button>
            );
          })}
          {stage === 'awaitRoll' && (
            <span className="text-[9px] font-bold text-[var(--c-paper)]/60 ml-1 max-w-[150px] leading-tight">
              Click ROLL DICE to roll your five dice.
            </span>
          )}
          {stage === 'cpu' && (
            <>
              <span className="text-[10px] font-bold text-[var(--c-yellow)] animate-pulse ml-1 max-w-[260px] leading-tight">
                {cpuNarration ? `${cpuLabel}: ${cpuNarration}` : `${cpuLabel} is thinking…`}
              </span>
              <button
                onClick={skipCpuDelay}
                className="btn-pop text-[9px] font-bold bg-[var(--c-steel)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm ml-1"
              >
                SKIP ▸▸
              </button>
            </>
          )}
          {stage === 'preRoll' && (
            <span className="text-[9px] font-bold text-[var(--c-paper)]/60 ml-1 max-w-[130px] leading-tight">
              Pick dice to reroll ({rerollsRemaining(g, HUMAN)} left). Snap Charms castable now.
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 max-h-[58px] overflow-y-auto bg-[var(--c-ink)] rounded-sm ink-border-sm px-2 py-1 text-[8px] font-mono text-[var(--c-paper)]/70 leading-tight">
          <div className="text-[7px] font-black text-[var(--c-paper)]/40 uppercase tracking-wide sticky top-0 bg-[var(--c-ink)]">
            Battle Log
          </div>
          {g.log.slice(-40).map((l, i) => (
            <div key={i}>· {l}</div>
          ))}
        </div>
        <div className="flex flex-col gap-0.5 text-right shrink-0">
          <button
            onClick={() => setShowDiscard((s) => !s)}
            className="btn-pop text-[9px] font-bold bg-[var(--c-steel)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm"
          >
            DISCARD {me.discard.length}
            {echoables.length > 0 ? ` · ${echoables.length} ECHO` : ''}
          </button>
          <span className="text-[8px] font-bold text-[var(--c-paper)]/50">
            deck {me.deck.length} · banished {me.banished.length}
          </span>
        </div>
      </div>

      {/* My row */}
      <div className="h-[3px] w-full bg-[var(--c-yellow)]/70 shrink-0" />
      <div className="flex gap-2 px-2 pt-1.5 items-start flex-1 min-h-0 bg-[var(--c-ink)]/25">
        <div className="flex flex-col gap-1 shrink-0">
          <LeaderPanel
            g={g}
            p={me}
            isHuman
            abilityUsable={
              stage === 'placement' &&
              !me.leader.abilityUsed &&
              dieVal !== null &&
              dieVal >= effAbilityThreshold(g, me.leader)
            }
            ultimateUsable={
              stage === 'placement' &&
              !!me.leader.def.ultimate &&
              !me.leader.ultimateUsed &&
              me.turnsTaken >= (me.leader.def.ultimate?.unlockTurn ?? 99) &&
              dieVal !== null &&
              dieVal >= (me.leader.def.ultimate?.threshold ?? 7)
            }
            onAbility={() => tryAbility(me.leader)}
            onUltimate={tryUltimate}
            highlight={
              (!!pending && isPendingTarget(me.leader.iid)) ||
              (!!rallyPick && isRallySource(me.leader.iid))
            }
            onClickTarget={
              pending && isPendingTarget(me.leader.iid)
                ? () => resolvePendingOn(me.leader.iid)
                : rallyPick && isRallySource(me.leader.iid)
                  ? () => resolveRallySource(me.leader.iid)
                  : undefined
            }
          />
          {me.location ? (
            <div
              className={cn(
                'w-[168px] bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm p-1',
                rallyPick &&
                  isRallySource(me.location.iid) &&
                  'ring-4 ring-[var(--c-red)] cursor-pointer',
              )}
              onClick={
                rallyPick && isRallySource(me.location.iid)
                  ? () => resolveRallySource(me.location!.iid)
                  : undefined
              }
            >
              <div
                className="text-[8px] font-bold cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setInspect(me.location!.def);
                }}
              >
                📍 {me.location.def.name}
              </div>
              <div className="text-[7px] text-[var(--c-paper)]/70 leading-tight">
                {renderKeywordText(cardRules(me.location.def), true)}
              </div>
              {me.location.def.ability && (
                <button
                  onClick={() => tryAbility(me.location!)}
                  disabled={
                    !(
                      stage === 'placement' &&
                      !me.location.abilityUsed &&
                      dieVal !== null &&
                      dieVal >= effAbilityThreshold(g, me.location)
                    )
                  }
                  className={cn(
                    'w-full mt-0.5 text-[8px] font-bold px-1 ink-border-sm text-left',
                    stage === 'placement' &&
                      !me.location.abilityUsed &&
                      dieVal !== null &&
                      dieVal >= effAbilityThreshold(g, me.location)
                      ? 'btn-pop bg-[var(--c-yellow)] text-[var(--c-ink)]'
                      : 'bg-[var(--c-ink)]/50 text-[var(--c-paper)]/40',
                    me.location.abilityUsed && 'line-through',
                  )}
                >
                  {effAbilityThreshold(g, me.location)}+
                  {effAbilityThreshold(g, me.location) !== me.location.def.ability.threshold
                    ? ` (was ${me.location.def.ability.threshold}+)`
                    : ''}{' '}
                  {describeEffect(me.location.def.ability.effect)}
                </button>
              )}
            </div>
          ) : (
            <div className="w-[168px] text-[8px] font-bold text-[var(--c-paper)]/30 ink-border-sm border-dashed p-1 text-center">
              no Location
            </div>
          )}
          {me.staging.length > 0 && (
            <div className="w-[168px]">
              <div className="text-[8px] font-bold text-[var(--c-paper)]/60">STAGING (Twin)</div>
              {me.staging.map((s) => (
                <div
                  key={s.iid}
                  className="flex items-center gap-1 bg-[#8E44AD]/40 ink-border-sm p-0.5 mt-0.5"
                >
                  <span className="text-lg leading-none text-[var(--c-paper)]">
                    {DIE_FACES[(s.stagedDie ?? 1) - 1]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[8px] font-bold text-[var(--c-paper)] truncate cursor-pointer"
                      onClick={() => setInspect(s.def)}
                    >
                      {s.def.name}
                    </div>
                    <div className="text-[7px] text-[var(--c-paper)]/60">
                      match a {s.stagedDie} to complete
                    </div>
                  </div>
                  <button
                    onClick={() => tryCompleteTwin(s)}
                    className="btn-pop text-[8px] font-bold bg-[var(--c-yellow)] px-1 ink-border-sm"
                  >
                    SET
                  </button>
                  {stage === 'preRoll' && (
                    <button
                      onClick={() => {
                        if (!window.confirm(`Abandon ${s.def.name} and return it to hand?`)) return;
                        abandonTwin(g, s.iid);
                        bump();
                      }}
                      title="Abandon (return to hand)"
                      aria-label={`Abandon ${s.def.name} and return it to hand`}
                      className="btn-pop text-[8px] font-bold bg-[var(--c-red)] text-white px-1 ink-border-sm"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="flex gap-1 flex-wrap min-h-[92px] sm:min-h-[130px]">
            {me.board.length === 0 && (
              <div className="w-full h-[80px] sm:h-[110px] border-2 border-dashed border-[var(--c-paper)]/15 rounded-md flex items-center justify-center">
                <span className="text-[9px] text-[var(--c-paper)]/30 font-bold uppercase tracking-wide">
                  Empty Board
                </span>
              </div>
            )}
            {me.board.map((u) => {
              const canAtt = stage === 'combat' && canAttack(g, u);
              const targetable = !!pending && isPendingTarget(u.iid);
              const isSource = !!rallyPick && isRallySource(u.iid);
              const abilityReady =
                stage === 'placement' &&
                u.def.ability &&
                !u.abilityUsed &&
                !u.hasAttacked &&
                !u.boundThisTurn &&
                !(u.enteredThisTurn && !hasKw(u.def, 'Swift'));
              const rallyReady = abilityReady && hasKw(u.def, 'Rally');
              return (
                <div key={u.iid} className="flex flex-col items-center gap-0.5">
                  <BoardUnit
                    g={g}
                    u={u}
                    isAttacker={attacker === u.iid}
                    highlight={targetable || isSource || (canAtt && attacker !== u.iid)}
                    onClick={
                      targetable
                        ? () => resolvePendingOn(u.iid)
                        : isSource
                          ? () => resolveRallySource(u.iid)
                          : canAtt
                            ? () => setAttacker(attacker === u.iid ? null : u.iid)
                            : () => setInspect(u.def)
                    }
                  />
                  {abilityReady && (
                    <button
                      onClick={() => tryAbility(u)}
                      className={cn(
                        'text-[7px] font-bold px-1 ink-border-sm',
                        dieVal !== null && dieVal >= effAbilityThreshold(g, u)
                          ? 'btn-pop bg-[var(--c-yellow)] text-[var(--c-ink)]'
                          : 'bg-[var(--c-steel)] text-[var(--c-paper)]/50',
                      )}
                    >
                      {effAbilityThreshold(g, u)}+ ability
                    </button>
                  )}
                  {rallyReady && (
                    <button
                      onClick={() => tryRally(u)}
                      title="Rally: trigger this ability for free using another exhausted permanent's resting die"
                      className="btn-pop text-[7px] font-bold px-1 ink-border-sm bg-[#8E44AD] text-white"
                    >
                      ⚡ RALLY
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Hand */}
          <div className="mt-auto pb-1.5">
            <div className="text-[8px] font-bold text-[var(--c-paper)]/60 mb-0.5">
              HAND {me.hand.length}/6 {echoPick ? '— pick a card to DISCARD for Echo' : ''}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {me.hand.map((c) => {
                const chk = canCastNow(c);
                const canScrap = hasKw(c.def, 'Scrap') && stage === 'placement' && selDie !== null;
                // Before a die is selected, judge dimming on "could any of my
                // dice pay for this" rather than the stricter per-die check,
                // which always fails pre-selection with "Select a die".
                const potentiallyCastable = selDie === null ? canCastWithAnyDie(c) : chk.ok;
                return (
                  <div key={c.iid} className="flex flex-col gap-0.5 shrink-0">
                    <CardFace
                      def={c.def}
                      size="compact"
                      dimmed={!potentiallyCastable && !echoPick && !canScrap}
                      highlight={!!echoPick}
                      introduceKeywords
                      effectiveThreshold={
                        c.def.threshold !== undefined ? effThreshold(g, HUMAN, c.def) : undefined
                      }
                      onClick={
                        echoPick
                          ? () => tryEchoFodder(c)
                          : chk.ok
                            ? () => tryCast(c)
                            : () => setInspect(c.def)
                      }
                    />
                    {canScrap && (
                      <button
                        onClick={() => tryScrap(c)}
                        className="btn-pop text-[7px] font-bold bg-[var(--c-red)] text-white px-1 ink-border-sm"
                      >
                        SCRAP → reroll die
                      </button>
                    )}
                    {!chk.ok &&
                      chk.why &&
                      chk.why !== 'Select a die' &&
                      stage !== 'cpu' &&
                      !echoPick && (
                        <span className="text-[6.5px] font-bold text-[var(--c-paper)]/40 text-center leading-tight max-w-[104px]">
                          {chk.why}
                        </span>
                      )}
                    {!chk.ok && chk.why === 'Select a die' && !echoPick && (
                      <span
                        className={cn(
                          'text-[6.5px] font-bold text-center leading-tight max-w-[104px]',
                          potentiallyCastable
                            ? 'text-[var(--c-yellow)]/70'
                            : 'text-[var(--c-paper)]/40',
                        )}
                      >
                        {potentiallyCastable ? 'Ready — pick a die' : 'No die pays this cost'}
                      </span>
                    )}
                  </div>
                );
              })}
              {me.hand.length === 0 && (
                <span className="text-[9px] text-[var(--c-paper)]/30 font-bold">
                  — empty hand —
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Discard drawer */}
      {showDiscard && (
        <div className="absolute right-2 top-16 bottom-24 w-[260px] bg-[var(--c-ink)] ink-border-md z-40 p-2 overflow-y-auto">
          <div className="flex justify-between items-center mb-1">
            <span className="heading-font text-[10px] text-[var(--c-yellow)]">DISCARD PILE</span>
            <button
              onClick={() => {
                setShowDiscard(false);
                setEchoPick(null);
              }}
              aria-label="Close discard pile"
              className="btn-pop text-[10px] bg-[var(--c-red)] text-white px-1.5 ink-border-sm"
            >
              ✕
            </button>
          </div>
          <div className="text-[8px] text-[var(--c-paper)]/60 font-bold mb-1">
            Echo cards can be recast: select a die, click ECHO, then discard one card from hand.
          </div>
          <div className="flex flex-wrap gap-1">
            {me.discard.map((c) => {
              const eligible = hasKw(c.def, 'Echo') && !c.echoSpent;
              return (
                <div key={c.iid} className="flex flex-col gap-0.5">
                  <CardFace
                    def={c.def}
                    size="compact"
                    dimmed={!eligible}
                    introduceKeywords
                    effectiveThreshold={
                      c.def.threshold !== undefined ? effThreshold(g, HUMAN, c.def) : undefined
                    }
                    onClick={() => setInspect(c.def)}
                  />
                  {eligible && stage === 'placement' && (
                    <button
                      onClick={() => {
                        // 'sum'-cost Echo cards can't be paid with a single
                        // die (their threshold is a dice-total, not a face
                        // value) — arm the same multi-die builder the hand
                        // cast flow uses, instead of the single-die checks
                        // below (which would always fail for these).
                        if (c.def.castCostKind === 'sum' && !c.def.comboGate) {
                          setSumCast({ cardIid: c.iid, sel: new Set(), mode: 'echo' });
                          setSelDie(null);
                          say('Click dice to build the sum, then ECHO.');
                          return;
                        }
                        if (selDie === null) {
                          say('Select a die first.');
                          return;
                        }
                        if (c.def.comboGate) {
                          if (me.comboGateCastThisTurn) {
                            say('One Combo-gated card per turn.');
                            return;
                          }
                          if (!matchesPattern(rollValues(me), c.def.comboGate)) {
                            say(`Roll lacks ${c.def.comboGate}.`);
                            return;
                          }
                        } else {
                          const thr = effThreshold(g, HUMAN, c.def);
                          if (dieVal !== null && dieVal < thr) {
                            say(`Needs ${thr}+ to Echo this.`);
                            return;
                          }
                        }
                        if (needsTarget(c.def.onCast)) {
                          if (targetsFor(g, HUMAN, c.def.onCast!).length === 0) {
                            say('No legal target.');
                            return;
                          }
                          setPending({ kind: 'echo', cardIid: c.iid, effect: c.def.onCast! });
                          return;
                        }
                        setEchoPick({ cardIid: c.iid });
                        say('Now pick a hand card to discard.');
                      }}
                      className={cn(
                        'btn-pop text-[8px] font-bold px-1 ink-border-sm',
                        echoPick?.cardIid === c.iid
                          ? 'bg-[var(--c-red)] text-white'
                          : 'bg-[#8E44AD] text-white',
                      )}
                    >
                      {echoPick?.cardIid === c.iid ? 'PICK FODDER…' : 'ECHO'}
                    </button>
                  )}
                </div>
              );
            })}
            {me.discard.length === 0 && (
              <span className="text-[9px] text-[var(--c-paper)]/30 font-bold">empty</span>
            )}
          </div>
        </div>
      )}

      {/* Card inspector — the same universal template used everywhere else
          (deck builder, collection, pack reveals), so a card reads
          identically no matter where it's inspected from. */}
      {inspect && <CardInspectorModal def={inspect} onClose={() => setInspect(null)} />}

      {/* Forced discard (hand size &gt; 6 at End Phase) — player picks which cards */}
      {forcedDiscard && (
        <div className="absolute inset-0 z-50 bg-[var(--c-ink)]/90 flex items-center justify-center p-4">
          <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md p-4 text-center max-w-3xl">
            <div className="heading-font text-xl mb-1">Discard Down to 6</div>
            <div className="text-[11px] font-bold text-[var(--c-steel)] mb-3">
              Pick {forcedDiscard.needed} card{forcedDiscard.needed > 1 ? 's' : ''} to discard (
              {forcedDiscard.picks.length}/{forcedDiscard.needed} selected).
            </div>
            <div className="flex gap-1.5 justify-center flex-wrap mb-4">
              {me.hand.map((c) => {
                const picked = forcedDiscard.picks.includes(c.iid);
                return (
                  <div key={c.iid} className="flex flex-col gap-0.5">
                    <CardFace
                      def={c.def}
                      size="compact"
                      highlight={picked}
                      dimmed={!picked && forcedDiscard.picks.length >= forcedDiscard.needed}
                      introduceKeywords
                      onClick={() => toggleForcedDiscardPick(c.iid)}
                    />
                    {picked && (
                      <span className="text-[8px] font-bold text-[var(--c-red)]">DISCARD</span>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={confirmForcedDiscard}
              disabled={forcedDiscard.picks.length !== forcedDiscard.needed}
              className={cn(
                'heading-font text-xs px-5 py-2 ink-border-sm shadow-hard-black-xs',
                forcedDiscard.picks.length === forcedDiscard.needed
                  ? 'btn-pop bg-[var(--c-red)] text-white'
                  : 'bg-[var(--c-steel)]/40 text-[var(--c-paper)]/50 cursor-not-allowed',
              )}
            >
              CONFIRM DISCARD
            </button>
          </div>
        </div>
      )}

      {/* Mulligan overlay */}
      {stage === 'mulligan' && (
        <div className="absolute inset-0 z-50 bg-[var(--c-ink)]/90 flex items-center justify-center p-4">
          <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md p-4 text-center max-w-3xl">
            <div className="heading-font text-xl mb-1">Opening Hand — {playerName}</div>
            <div className="text-[11px] font-bold text-[var(--c-steel)] mb-3">
              Keep this hand, or mulligan once to shuffle and redraw 5.
            </div>
            <div className="flex gap-1.5 justify-center flex-wrap mb-4">
              {me.hand.map((c) => (
                <React.Fragment key={c.iid}>
                  <CardFace
                    def={c.def}
                    size="compact"
                    introduceKeywords
                    onClick={() => setInspect(c.def)}
                  />
                </React.Fragment>
              ))}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={afterMulligan}
                className="btn-pop heading-font text-xs bg-[var(--c-yellow)] px-5 py-2 ink-border-sm shadow-hard-black-xs"
              >
                KEEP HAND
              </button>
              {!mulliganUsed && (
                <button
                  onClick={doMulligan}
                  className="btn-pop heading-font text-xs bg-[var(--c-ink)] text-[var(--c-yellow)] px-5 py-2 ink-border-sm shadow-hard-black-xs"
                >
                  MULLIGAN
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Game over */}
      {stage === 'over' && g.winner && (
        <div className="absolute inset-0 z-50 bg-[var(--c-ink)]/90 flex items-center justify-center">
          <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md p-6 text-center">
            <div className="heading-font text-3xl mb-2">
              {g.winner === 'draw' ? 'DRAW' : g.winner === HUMAN ? '🏆 VICTORY' : '☠ DEFEAT'}
            </div>
            <div className="text-[11px] font-bold text-[var(--c-steel)] mb-4">
              {g.log.slice(-2).join(' · ')}
            </div>
            {reward != null && (
              <div className="flex flex-col items-center gap-1 mb-4">
                <div className="bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-[11px] px-3 py-1 ink-border-sm shadow-hard-black-xs">
                  +{fmtCredits(reward.reward)} CREDITS · +{reward.xp_gained} XP · +
                  {reward.bp_xp_gained} PASS XP
                </div>
                {reward.leveled_up && (
                  <div className="bg-[var(--c-red)] text-[var(--c-paper)] heading-font text-[11px] px-3 py-1 ink-border-sm shadow-hard-black-xs animate-pulse">
                    LEVEL UP! NOW LV {reward.level} · +{fmtCredits(reward.level_credits_bonus)}{' '}
                    CREDITS
                    {reward.level_vouchers_bonus > 0
                      ? ` · +${fmtVouchers(reward.level_vouchers_bonus)} VOUCHERS`
                      : ''}
                  </div>
                )}
              </div>
            )}
            {reward == null && rewardError && (
              <div className="bg-[var(--c-red)] text-white heading-font text-[10px] px-3 py-1.5 ink-border-sm mb-4 max-w-[280px]">
                {rewardError}
              </div>
            )}
            <button
              onClick={onExit}
              className="btn-pop heading-font text-sm bg-[var(--c-yellow)] px-6 py-2 ink-border-sm shadow-hard-black-xs"
            >
              BACK TO MENU
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
