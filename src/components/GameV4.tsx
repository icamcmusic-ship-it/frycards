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
  activateUltimate,
  completeTwin,
  echoRecast,
  scrap,
  abandonTwin,
  comboCheck,
  attack,
  endTurn,
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
} from '../game/v3/engine';
import { playTurn, maybeMulliganPlayer } from '../game/v3/ai';
import { CardDef, Effect, hasKw } from '../game/v3/cards';
import { DeckDef } from '../game/v3/engine';
import { cn } from '../lib/utils';
import { CardFace, cardRules, describeEffect, kwList } from './CardFaceV4';

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
    <button
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${u.def.name}, ${atk} attack, ${hp} of ${maxHp} health${exhausted ? ', exhausted' : ''}${sick ? ', summoning sick' : ''}`}
      className={cn(
        'relative w-[92px] bg-[#F7F7F7] text-[#1A1A1A] ink-border-sm text-left shrink-0',
        onClick && 'btn-pop cursor-pointer',
        highlight && 'ring-4 ring-[#E53935] -translate-y-1',
        isAttacker && 'ring-4 ring-[#FFD54F] -translate-y-1',
        dimmed && 'opacity-45',
        (exhausted || sick) && 'saturate-50',
      )}
    >
      {u.def.image && (
        <div className="h-[44px] overflow-hidden ink-border-sm m-0.5">
          <img src={u.def.image} className="w-full h-full object-cover" draggable={false} />
        </div>
      )}
      <div className="px-0.5 pb-0.5">
        <div className="heading-font text-[8px] leading-tight truncate">{u.def.name}</div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold">
            {atk}
            <span className="text-[#E53935]">⚔</span>
          </span>
          <span className={cn('text-[10px] font-mono font-bold', hp < maxHp && 'text-[#E53935]')}>
            {hp}/{maxHp}
            <span className="text-[#43A047]">♥</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-0.5 min-h-[9px]">
          {kwList(u.def)
            .slice(0, 3)
            .map((kw) => (
              <span key={kw} className="text-[6px] font-bold px-0.5 bg-[#FFD54F] leading-tight">
                {kw}
              </span>
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
            className="text-[9px] bg-[#2C3E50] text-white ink-border-sm px-0.5"
          >
            z
          </span>
        )}
        {exhausted && !sick && (
          <span
            title="Exhausted"
            className="text-[9px] bg-[#2C3E50] text-white ink-border-sm px-0.5"
          >
            ✓
          </span>
        )}
      </div>
    </button>
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
}) {
  const l = p.leader;
  const hp = Math.max(0, remainingHp(g, l));
  const maxHp = effMaxHp(g, l);
  const ab = l.def.ability;
  const ult = l.def.ultimate;
  const abThr = effAbilityThreshold(g, l);
  const toll = tollReduction(g, p.id);
  return (
    <div
      onClick={onClickTarget}
      className={cn(
        'w-[168px] bg-[#1A1A1A] text-[#F7F7F7] ink-border-md p-1.5 shrink-0',
        highlight && 'ring-4 ring-[#E53935] cursor-pointer',
      )}
    >
      <div className="flex gap-1.5">
        {l.def.image && (
          <div className="w-[46px] h-[46px] overflow-hidden ink-border-sm shrink-0">
            <img src={l.def.image} className="w-full h-full object-cover" draggable={false} />
          </div>
        )}
        <div className="min-w-0">
          <div className="heading-font text-[10px] leading-tight truncate">{l.def.name}</div>
          <div
            className={cn(
              'font-mono font-bold text-lg leading-tight',
              hp <= maxHp / 2 ? 'text-[#E53935]' : 'text-[#FFD54F]',
            )}
          >
            {hp}
            <span className="text-[10px] text-[#F7F7F7]/60">/{maxHp}</span>
          </div>
          <div className="flex gap-0.5 flex-wrap">
            {l.def.resolve && (
              <span
                className={cn(
                  'text-[7px] font-bold px-0.5 ink-border-sm',
                  hp * 2 <= maxHp ? 'bg-[#E53935] text-white' : 'bg-[#2C3E50] text-white',
                )}
              >
                RESOLVE {l.def.resolve.x}
                {hp * 2 <= maxHp ? ' ON' : ''}
              </span>
            )}
            {toll > 0 && (
              <span className="text-[7px] font-bold px-0.5 bg-[#29B6F6] ink-border-sm text-[#1A1A1A]">
                TOLL -{toll}
              </span>
            )}
          </div>
        </div>
      </div>
      {ab && (
        <button
          onClick={onAbility}
          disabled={!abilityUsable}
          className={cn(
            'w-full mt-1 text-[8px] font-bold px-1 py-0.5 ink-border-sm text-left leading-tight',
            abilityUsable
              ? 'btn-pop bg-[#FFD54F] text-[#1A1A1A]'
              : 'bg-[#2C3E50]/60 text-[#F7F7F7]/50',
            l.abilityUsed && 'line-through',
          )}
        >
          {abThr}+ {describeEffect(ab.effect)}
        </button>
      )}
      {ult && isHuman && (
        <button
          onClick={onUltimate}
          disabled={!ultimateUsable}
          className={cn(
            'w-full mt-0.5 text-[8px] font-bold px-1 py-0.5 ink-border-sm text-left leading-tight',
            ultimateUsable
              ? 'btn-pop bg-[#E53935] text-white'
              : 'bg-[#2C3E50]/60 text-[#F7F7F7]/50',
            l.ultimateUsed && 'line-through',
          )}
        >
          ULT (turn {ult.unlockTurn}+, {ult.threshold}+): {describeEffect(ult.effect)}
          {l.ultimateUsed ? ' — SPENT' : ''}
        </button>
      )}
      {ult && !isHuman && (
        <div className="mt-0.5 text-[7px] font-bold text-[#F7F7F7]/50 leading-tight">
          ULT{l.ultimateUsed ? ' spent' : ` from turn ${ult.unlockTurn}`}:{' '}
          {describeEffect(ult.effect)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
type Stage = 'mulligan' | 'preRoll' | 'placement' | 'combat' | 'cpu' | 'over';

interface Pending {
  kind: 'cast' | 'ability' | 'ultimate' | 'echo';
  cardIid: string;
  effect: Effect;
}

export function GameV4({
  humanDeck,
  cpuDeck,
  humanLabel,
  cpuLabel,
  playerName,
  onExit,
  onResult,
}: {
  /** A prebuilt archetype's DeckDef, or a player's own saved deck resolved against the pool. */
  humanDeck: DeckDef;
  cpuDeck: DeckDef;
  humanLabel: string;
  cpuLabel: string;
  playerName: string;
  onExit: () => void;
  onResult?: (won: boolean) => void;
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
  const [attacker, setAttacker] = useState<string | null>(null);
  // Echo card awaiting fodder — targetIid is set first if the recast effect needs one.
  const [echoPick, setEchoPick] = useState<{ cardIid: string; targetIid?: string } | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);
  const [inspect, setInspect] = useState<CardDef | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [forcedDiscard, setForcedDiscard] = useState<{ needed: number; picks: string[] } | null>(
    null,
  );
  const resultSent = useRef(false);
  const cpuTimeoutRef = useRef<number | null>(null);
  const bannerTimeoutRef = useRef<number | null>(null);

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
    },
    [],
  );

  // ---- turn driving -------------------------------------------------------
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
    setStage('preRoll');
  };

  const resolveCpuTurn = () => {
    cpuTimeoutRef.current = null;
    playTurn(g);
    bump();
    if (g.winner) {
      setStage('over');
      return;
    }
    beginHumanTurn();
  };

  const runCpuTurn = () => {
    setStage('cpu');
    cpuTimeoutRef.current = window.setTimeout(resolveCpuTurn, 1000);
  };

  // Lets an impatient player skip the fixed thinking-delay and resolve the
  // CPU's turn immediately instead of waiting out the pacing timer.
  const skipCpuDelay = () => {
    if (cpuTimeoutRef.current === null) return;
    window.clearTimeout(cpuTimeoutRef.current);
    resolveCpuTurn();
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
      else if (showDiscard) {
        setShowDiscard(false);
        setEchoPick(null);
      } else if (echoPick) setEchoPick(null);
      else if (pending) setPending(null);
      else if (attacker) setAttacker(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inspect, showDiscard, echoPick, pending, attacker]);

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
      // available before the reroll window closes, same as every other cast.
      if (stage === 'preRoll')
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
    if (dieVal === null) return { ok: false, why: 'Select a die' };
    const thr = effThreshold(g, HUMAN, c.def);
    if (dieVal < thr) return { ok: false, why: `Needs ${thr}+` };
    return { ok: true };
  };

  const tryCast = (c: Inst) => {
    if (c.def.type === 'Location') {
      if (castLocationFree(g, c.iid)) {
        bump();
        say(`${c.def.name} enters play (free).`);
      }
      return;
    }
    const chk = canCastNow(c);
    if (!chk.ok) {
      say(chk.why || 'Illegal');
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

  const resolvePendingOn = (targetIid: string) => {
    if (!pending) return;
    if (pending.kind === 'echo') {
      // Echo still needs a fodder discard from hand — stash the chosen
      // target and hand off to the fodder-picking step instead of resolving
      // immediately.
      setEchoPick({ cardIid: pending.cardIid, targetIid });
      setPending(null);
      say('Now pick a hand card to discard.');
      return;
    }
    let ok = false;
    if (pending.kind === 'cast') ok = castFromHand(g, selDie!, pending.cardIid, targetIid);
    else if (pending.kind === 'ability')
      ok = activateAbility(g, selDie!, pending.cardIid, targetIid);
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
    if (
      needsTarget(c.def.ability.effect) &&
      targetsFor(g, HUMAN, c.def.ability.effect).length > 0
    ) {
      setPending({ kind: 'ability', cardIid: c.iid, effect: c.def.ability.effect });
      return;
    }
    if (activateAbility(g, selDie!, c.iid)) {
      setSelDie(null);
      bump();
    } else say('Illegal.');
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
    if (needsTarget(ult.effect) && targetsFor(g, HUMAN, ult.effect).length > 0) {
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
    if (selDie === null) {
      say('Select a die.');
      return;
    }
    const target = me.discard.find((c) => c.iid === echoPick.cardIid);
    if (!target) {
      setEchoPick(null);
      return;
    }
    if (echoRecast(g, selDie, echoPick.cardIid, fodder.iid, echoPick.targetIid)) {
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
    setStage('combat');
  };

  const finishTurn = (picks?: string[]) => {
    const queue = picks ? [...picks] : undefined;
    endTurn(g, (hand) => {
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
  // whenever ending the turn would otherwise force a discard.
  const attemptFinishTurn = () => {
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
    reroll(g, [...rerollSel]);
    bump();
    setStage('placement');
    setRerollSel(new Set());
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

  const echoables = me.discard.filter((c) => hasKw(c.def, 'Echo') && !c.echoSpent);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="w-full h-screen bg-[#1A1A1A] flex flex-col overflow-hidden select-none">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-2 py-1 bg-[#2C3E50] ink-border-sm z-30">
        <button
          onClick={() =>
            (stage === 'over' ||
              window.confirm('Concede this match? This will count as a loss.')) &&
            concede()
          }
          className="btn-pop heading-font text-[10px] bg-[#1A1A1A] text-[#F7F7F7] px-2 py-0.5 ink-border-sm"
        >
          ✕ CONCEDE
        </button>
        <span className="heading-font text-[11px] text-[#FFD54F]">
          TURN {Math.ceil(g.turn / 2) || 1} ·{' '}
          {stage === 'cpu'
            ? "CPU'S TURN"
            : stage === 'preRoll'
              ? 'ROLL & SNAP'
              : stage === 'placement'
                ? 'PLACEMENT'
                : stage === 'combat'
                  ? 'COMBAT'
                  : stage.toUpperCase()}
        </span>
        <span className="text-[9px] font-mono text-[#F7F7F7]/70 truncate">
          {humanLabel} vs {cpuLabel}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {stage === 'placement' && (
            <button
              onClick={toCombat}
              className="btn-pop heading-font text-[10px] bg-[#FFD54F] text-[#1A1A1A] px-2 py-0.5 ink-border-sm"
            >
              COMBO CHECK → COMBAT
            </button>
          )}
          {stage === 'combat' && (
            <button
              onClick={attemptFinishTurn}
              className="btn-pop heading-font text-[10px] bg-[#E53935] text-white px-2 py-0.5 ink-border-sm"
            >
              END TURN {unplaced.length > 0 ? `(pitch ${unplaced.length}⚄)` : ''}
            </button>
          )}
          {stage === 'preRoll' && (
            <button
              onClick={doReroll}
              className="btn-pop heading-font text-[10px] bg-[#FFD54F] text-[#1A1A1A] px-2 py-0.5 ink-border-sm"
            >
              {rerollSel.size > 0 ? `REROLL ${rerollSel.size}` : 'KEEP ALL'} →
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[#FFD54F] text-[#1A1A1A] heading-font text-[11px] px-3 py-1 ink-border-sm shadow-hard-black-xs">
          {banner}
        </div>
      )}
      {pending && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[#E53935] text-white heading-font text-[11px] px-3 py-1 ink-border-sm flex gap-2 items-center">
          PICK A TARGET — {describeEffect(pending.effect)}
          <button
            onClick={() => setPending(null)}
            aria-label="Cancel targeting"
            className="bg-[#1A1A1A] px-1"
          >
            ✕
          </button>
        </div>
      )}
      {!pending && attacker && stage === 'combat' && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[#FFD54F] text-[#1A1A1A] heading-font text-[11px] px-3 py-1 ink-border-sm flex gap-2 items-center">
          SELECT AN ATTACK TARGET
          <button
            onClick={() => setAttacker(null)}
            aria-label="Cancel attack"
            className="bg-[#1A1A1A] text-white px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Enemy row */}
      <div className="flex gap-2 px-2 pt-1.5 items-start">
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
        />
        <div className="flex-1 min-w-0">
          <div className="flex gap-1 text-[8px] font-bold text-[#F7F7F7]/70 mb-0.5">
            <span>
              CPU · hand {foe.hand.length} · deck {foe.deck.length} · discard {foe.discard.length}
            </span>
            {foe.location && (
              <span
                className="bg-[#2C3E50] px-1 ink-border-sm text-[#F7F7F7] cursor-pointer"
                onClick={() => setInspect(foe.location!.def)}
              >
                📍 {foe.location.def.name}
              </span>
            )}
            {foe.staging.length > 0 && <span>staging {foe.staging.length}</span>}
          </div>
          <div className="flex gap-1 flex-wrap min-h-[92px]">
            {foe.board.length === 0 && (
              <span className="text-[9px] text-[#F7F7F7]/30 font-bold self-center">
                — empty board —
              </span>
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
      <div className="flex items-center gap-3 px-2 py-1.5 border-y-2 border-[#F7F7F7]/10 my-1">
        <div className="flex gap-1.5 items-center">
          {me.dice.map((d, i) => {
            const usable = !d.placed && (stage === 'placement' || stage === 'preRoll');
            const marked = stage === 'preRoll' ? rerollSel.has(i) : selDie === i;
            return (
              <button
                key={i}
                disabled={!usable}
                onClick={() => {
                  if (stage === 'preRoll') {
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
                  'w-11 h-11 ink-border-md text-3xl leading-none flex items-center justify-center',
                  d.placed
                    ? 'bg-[#2C3E50]/40 text-[#F7F7F7]/25'
                    : marked
                      ? stage === 'preRoll'
                        ? 'bg-[#E53935] text-white -translate-y-1'
                        : 'bg-[#FFD54F] text-[#1A1A1A] -translate-y-1'
                      : 'bg-[#F7F7F7] text-[#1A1A1A]',
                  usable && 'btn-pop',
                )}
                title={d.placed ? 'Placed' : stage === 'preRoll' ? 'Toggle reroll' : 'Select die'}
                aria-label={`Die ${i + 1}: value ${d.value}${d.placed ? ' (placed)' : marked ? ' (selected)' : ''}`}
                aria-pressed={marked}
              >
                {DIE_FACES[d.value - 1]}
              </button>
            );
          })}
          {stage === 'cpu' && (
            <>
              <span className="text-[10px] font-bold text-[#F7F7F7]/60 animate-pulse ml-1">
                CPU is thinking…
              </span>
              <button
                onClick={skipCpuDelay}
                className="btn-pop text-[9px] font-bold bg-[#2C3E50] text-[#F7F7F7] px-1.5 py-0.5 ink-border-sm ml-1"
              >
                SKIP ▸▸
              </button>
            </>
          )}
          {stage === 'preRoll' && (
            <span className="text-[9px] font-bold text-[#F7F7F7]/60 ml-1 max-w-[130px] leading-tight">
              Pick dice to reroll (once). Snap Charms castable now.
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 max-h-[54px] overflow-y-auto bg-[#1A1A1A] px-2 text-[8px] font-mono text-[#F7F7F7]/70 leading-tight">
          {g.log.slice(-40).map((l, i) => (
            <div key={i}>· {l}</div>
          ))}
        </div>
        <div className="flex flex-col gap-0.5 text-right shrink-0">
          <button
            onClick={() => setShowDiscard((s) => !s)}
            className="btn-pop text-[9px] font-bold bg-[#2C3E50] text-[#F7F7F7] px-1.5 py-0.5 ink-border-sm"
          >
            DISCARD {me.discard.length}
            {echoables.length > 0 ? ` · ${echoables.length} ECHO` : ''}
          </button>
          <span className="text-[8px] font-bold text-[#F7F7F7]/50">
            deck {me.deck.length} · banished {me.banished.length}
          </span>
        </div>
      </div>

      {/* My row */}
      <div className="flex gap-2 px-2 items-start flex-1 min-h-0">
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
            highlight={!!pending && isPendingTarget(me.leader.iid)}
            onClickTarget={
              pending && isPendingTarget(me.leader.iid)
                ? () => resolvePendingOn(me.leader.iid)
                : undefined
            }
          />
          {me.location ? (
            <div className="w-[168px] bg-[#2C3E50] text-[#F7F7F7] ink-border-sm p-1">
              <div
                className="text-[8px] font-bold cursor-pointer"
                onClick={() => setInspect(me.location!.def)}
              >
                📍 {me.location.def.name}
              </div>
              <div className="text-[7px] text-[#F7F7F7]/70 leading-tight">
                {cardRules(me.location.def)}
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
                      ? 'btn-pop bg-[#FFD54F] text-[#1A1A1A]'
                      : 'bg-[#1A1A1A]/50 text-[#F7F7F7]/40',
                    me.location.abilityUsed && 'line-through',
                  )}
                >
                  {effAbilityThreshold(g, me.location)}+{' '}
                  {describeEffect(me.location.def.ability.effect)}
                </button>
              )}
            </div>
          ) : (
            <div className="w-[168px] text-[8px] font-bold text-[#F7F7F7]/30 ink-border-sm border-dashed p-1 text-center">
              no Location
            </div>
          )}
          {me.staging.length > 0 && (
            <div className="w-[168px]">
              <div className="text-[8px] font-bold text-[#F7F7F7]/60">STAGING (Twin)</div>
              {me.staging.map((s) => (
                <div
                  key={s.iid}
                  className="flex items-center gap-1 bg-[#8E44AD]/40 ink-border-sm p-0.5 mt-0.5"
                >
                  <span className="text-lg leading-none text-[#F7F7F7]">
                    {DIE_FACES[(s.stagedDie ?? 1) - 1]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[8px] font-bold text-[#F7F7F7] truncate cursor-pointer"
                      onClick={() => setInspect(s.def)}
                    >
                      {s.def.name}
                    </div>
                    <div className="text-[7px] text-[#F7F7F7]/60">
                      match a {s.stagedDie} to complete
                    </div>
                  </div>
                  <button
                    onClick={() => tryCompleteTwin(s)}
                    className="btn-pop text-[8px] font-bold bg-[#FFD54F] px-1 ink-border-sm"
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
                      className="btn-pop text-[8px] font-bold bg-[#E53935] text-white px-1 ink-border-sm"
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
          <div className="flex gap-1 flex-wrap min-h-[92px]">
            {me.board.length === 0 && (
              <span className="text-[9px] text-[#F7F7F7]/30 font-bold self-center">
                — empty board —
              </span>
            )}
            {me.board.map((u) => {
              const canAtt = stage === 'combat' && canAttack(g, u);
              const targetable = !!pending && isPendingTarget(u.iid);
              return (
                <div key={u.iid} className="flex flex-col items-center gap-0.5">
                  <BoardUnit
                    g={g}
                    u={u}
                    isAttacker={attacker === u.iid}
                    highlight={targetable || (canAtt && attacker !== u.iid)}
                    onClick={
                      targetable
                        ? () => resolvePendingOn(u.iid)
                        : canAtt
                          ? () => setAttacker(attacker === u.iid ? null : u.iid)
                          : () => setInspect(u.def)
                    }
                  />
                  {stage === 'placement' &&
                    u.def.ability &&
                    !u.abilityUsed &&
                    !u.hasAttacked &&
                    !u.boundThisTurn && (
                      <button
                        onClick={() => tryAbility(u)}
                        className={cn(
                          'text-[7px] font-bold px-1 ink-border-sm',
                          dieVal !== null &&
                            dieVal >= effAbilityThreshold(g, u) &&
                            !(u.enteredThisTurn && !hasKw(u.def, 'Swift'))
                            ? 'btn-pop bg-[#FFD54F] text-[#1A1A1A]'
                            : 'bg-[#2C3E50] text-[#F7F7F7]/50',
                        )}
                      >
                        {effAbilityThreshold(g, u)}+ ability
                      </button>
                    )}
                </div>
              );
            })}
          </div>

          {/* Hand */}
          <div className="mt-auto pb-1.5">
            <div className="text-[8px] font-bold text-[#F7F7F7]/60 mb-0.5">
              HAND {me.hand.length}/6 {echoPick ? '— pick a card to DISCARD for Echo' : ''}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {me.hand.map((c) => {
                const chk = canCastNow(c);
                const canScrap = hasKw(c.def, 'Scrap') && stage === 'placement' && selDie !== null;
                return (
                  <div key={c.iid} className="flex flex-col gap-0.5 shrink-0">
                    <CardFace
                      def={c.def}
                      small
                      dimmed={!chk.ok && !echoPick && !canScrap}
                      highlight={!!echoPick}
                      onClick={
                        echoPick
                          ? () => tryEchoFodder(c)
                          : chk.ok
                            ? () => tryCast(c)
                            : () => setInspect(c.def)
                      }
                      footer={
                        <div className="text-[6.5px] leading-tight text-[#2C3E50] font-bold min-h-[16px]">
                          {cardRules(c.def).slice(0, 64)}
                        </div>
                      }
                    />
                    {canScrap && (
                      <button
                        onClick={() => tryScrap(c)}
                        className="btn-pop text-[7px] font-bold bg-[#E53935] text-white px-1 ink-border-sm"
                      >
                        SCRAP → reroll die
                      </button>
                    )}
                    {!chk.ok && chk.why && stage !== 'cpu' && !echoPick && (
                      <span className="text-[6.5px] font-bold text-[#F7F7F7]/40 text-center leading-tight max-w-[104px]">
                        {chk.why}
                      </span>
                    )}
                  </div>
                );
              })}
              {me.hand.length === 0 && (
                <span className="text-[9px] text-[#F7F7F7]/30 font-bold">— empty hand —</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Discard drawer */}
      {showDiscard && (
        <div className="absolute right-2 top-16 bottom-24 w-[260px] bg-[#1A1A1A] ink-border-md z-40 p-2 overflow-y-auto">
          <div className="flex justify-between items-center mb-1">
            <span className="heading-font text-[10px] text-[#FFD54F]">DISCARD PILE</span>
            <button
              onClick={() => {
                setShowDiscard(false);
                setEchoPick(null);
              }}
              aria-label="Close discard pile"
              className="btn-pop text-[10px] bg-[#E53935] text-white px-1.5 ink-border-sm"
            >
              ✕
            </button>
          </div>
          <div className="text-[8px] text-[#F7F7F7]/60 font-bold mb-1">
            Echo cards can be recast: select a die, click ECHO, then discard one card from hand.
          </div>
          <div className="flex flex-wrap gap-1">
            {me.discard.map((c) => {
              const eligible = hasKw(c.def, 'Echo') && !c.echoSpent;
              return (
                <div key={c.iid} className="flex flex-col gap-0.5">
                  <CardFace
                    def={c.def}
                    small
                    dimmed={!eligible}
                    onClick={() => setInspect(c.def)}
                  />
                  {eligible && stage === 'placement' && (
                    <button
                      onClick={() => {
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
                        if (
                          needsTarget(c.def.onCast) &&
                          targetsFor(g, HUMAN, c.def.onCast!).length > 0
                        ) {
                          setPending({ kind: 'echo', cardIid: c.iid, effect: c.def.onCast! });
                          return;
                        }
                        setEchoPick({ cardIid: c.iid });
                        say('Now pick a hand card to discard.');
                      }}
                      className={cn(
                        'btn-pop text-[8px] font-bold px-1 ink-border-sm',
                        echoPick?.cardIid === c.iid
                          ? 'bg-[#E53935] text-white'
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
              <span className="text-[9px] text-[#F7F7F7]/30 font-bold">empty</span>
            )}
          </div>
        </div>
      )}

      {/* Card inspector */}
      {inspect && (
        <div
          className="absolute inset-0 z-50 bg-[#1A1A1A]/80 flex items-center justify-center"
          onClick={() => setInspect(null)}
        >
          <div
            className="bg-[#F7F7F7] text-[#1A1A1A] ink-border-md p-3 max-w-[320px]"
            onClick={(e) => e.stopPropagation()}
          >
            {inspect.image && (
              <img
                src={inspect.image}
                className="w-full h-[160px] object-cover ink-border-sm mb-2"
              />
            )}
            <div className="heading-font text-sm">{inspect.name}</div>
            <div className="text-[10px] font-bold text-[#2C3E50] uppercase">
              {inspect.type}
              {inspect.rarity ? ` · ${inspect.rarity}` : ''}
              {inspect.type === 'Unit' ? ` · ${inspect.atk}⚔ / ${inspect.hp}♥` : ''}
              {inspect.comboGate
                ? ` · Combo: ${inspect.comboGate}`
                : inspect.threshold !== undefined && inspect.type !== 'Location'
                  ? ` · Cast ${inspect.threshold}+`
                  : inspect.type === 'Location'
                    ? ' · casts FREE (1/turn)'
                    : ''}
            </div>
            <div className="text-[10px] font-bold mt-1">{cardRules(inspect) || '—'}</div>
            {inspect.flavor && (
              <div className="text-[9px] italic text-[#2C3E50] mt-1">{inspect.flavor}</div>
            )}
            <button
              onClick={() => setInspect(null)}
              className="btn-pop mt-2 text-[10px] heading-font bg-[#1A1A1A] text-[#FFD54F] px-3 py-1 ink-border-sm"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* Forced discard (hand size &gt; 6 at End Phase) — player picks which cards */}
      {forcedDiscard && (
        <div className="absolute inset-0 z-50 bg-[#1A1A1A]/90 flex items-center justify-center p-4">
          <div className="bg-[#F7F7F7] text-[#1A1A1A] ink-border-md p-4 text-center max-w-3xl">
            <div className="heading-font text-xl mb-1">Discard Down to 6</div>
            <div className="text-[11px] font-bold text-[#2C3E50] mb-3">
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
                      small
                      highlight={picked}
                      dimmed={!picked && forcedDiscard.picks.length >= forcedDiscard.needed}
                      onClick={() => toggleForcedDiscardPick(c.iid)}
                    />
                    {picked && <span className="text-[8px] font-bold text-[#E53935]">DISCARD</span>}
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
                  ? 'btn-pop bg-[#E53935] text-white'
                  : 'bg-[#2C3E50]/40 text-[#F7F7F7]/50 cursor-not-allowed',
              )}
            >
              CONFIRM DISCARD
            </button>
          </div>
        </div>
      )}

      {/* Mulligan overlay */}
      {stage === 'mulligan' && (
        <div className="absolute inset-0 z-50 bg-[#1A1A1A]/90 flex items-center justify-center p-4">
          <div className="bg-[#F7F7F7] text-[#1A1A1A] ink-border-md p-4 text-center max-w-3xl">
            <div className="heading-font text-xl mb-1">Opening Hand — {playerName}</div>
            <div className="text-[11px] font-bold text-[#2C3E50] mb-3">
              Keep this hand, or mulligan once to shuffle and redraw 5.
            </div>
            <div className="flex gap-1.5 justify-center flex-wrap mb-4">
              {me.hand.map((c) => (
                <React.Fragment key={c.iid}>
                  <CardFace def={c.def} small onClick={() => setInspect(c.def)} />
                </React.Fragment>
              ))}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={afterMulligan}
                className="btn-pop heading-font text-xs bg-[#FFD54F] px-5 py-2 ink-border-sm shadow-hard-black-xs"
              >
                KEEP HAND
              </button>
              {!mulliganUsed && (
                <button
                  onClick={doMulligan}
                  className="btn-pop heading-font text-xs bg-[#1A1A1A] text-[#FFD54F] px-5 py-2 ink-border-sm shadow-hard-black-xs"
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
        <div className="absolute inset-0 z-50 bg-[#1A1A1A]/90 flex items-center justify-center">
          <div className="bg-[#F7F7F7] text-[#1A1A1A] ink-border-md p-6 text-center">
            <div className="heading-font text-3xl mb-2">
              {g.winner === 'draw' ? 'DRAW' : g.winner === HUMAN ? '🏆 VICTORY' : '☠ DEFEAT'}
            </div>
            <div className="text-[11px] font-bold text-[#2C3E50] mb-4">
              {g.log.slice(-2).join(' · ')}
            </div>
            <button
              onClick={onExit}
              className="btn-pop heading-font text-sm bg-[#FFD54F] px-6 py-2 ink-border-sm shadow-hard-black-xs"
            >
              BACK TO MENU
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
