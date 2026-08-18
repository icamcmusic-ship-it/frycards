/**
 * Fry Cards v5.0 match UI (Rulebook v5.0, docs/RULEBOOK.md).
 *
 * Human (P1) plays interactively through the engine's public actions; the
 * CPU (P2) plays whole turns through the same AI used by the headless
 * playtest harness (src/game/v3/ai.ts). The engine GameState is mutated in
 * place and held in state with a stable identity; a version counter forces
 * re-renders after each action.
 *
 * Turn flow: Dawn (automatic) → Main I → Clash → Main II → Dusk (automatic).
 * Essence is auto-paid: invoking a card exhausts the needed Locations for
 * you (colored pips first, then generic), and Locations can still be tapped
 * manually. The defender's guard step + reaction window are the interactive
 * moments of the opponent's Clash.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GameState,
  PlayerState,
  UnitInst,
  LocationInst,
  PlayerId,
  GuardAssignments,
  DeckDef,
  createGame,
  mulberry32,
  endPhase,
  playWellspring,
  tapLocationForEssence,
  invokeCard,
  invokeLeader,
  activateLeaderAbility,
  rebondItem,
  BOND_TARGET_SELF,
  declareAttackers,
  declareGuards,
  discardLiveClash,
  resolveClash,
  canInvokeLeader,
  canPayCost,
  hasPriority,
  passPriority,
  settleStack,
  potentialEssence,
  canTarget,
  effectiveCost,
  mulliganHand,
  finishDuskShed,
  legalAttackers,
  legalGuardsFor,
  wellspringAllowance,
  wellspringChoices,
  effMight,
  effGrit,
  remainingGrit,
  unitHasKw,
  essenceTotal,
  findUnit,
  hasInstantResponse,
  STARTING_HAND,
} from '../game/v3/engine';
import {
  playTurn,
  chooseGuards,
  maybeMulliganPlayer,
  reactionPlays,
  respondToStack,
  CpuTurnEvent,
} from '../game/v3/ai';
import {
  CardDef,
  Effect,
  EssenceCost,
  LEADER_HP,
  MAX_HAND,
  totalCost,
  hasKw,
  itemSurvives,
} from '../game/v3/cards';
import { COLORS, EssenceType } from '../game/v3/colors';
import { POOL_BY_ID } from '../game/v3/cardpool';
import { COLOR_PIP } from '../meta/colors';
import { EssenceIcon } from './EssenceIcon';
import { cn } from '../lib/utils';
import { CardFace, CARD_SIZES, describeEffect, renderKeywordText } from './CardFaceV4';
import { Card3DInspector, INSPECT_SCALE } from './Card3DInspector';
import { CoachOverlay } from './CoachOverlay';
import { MatchResult } from '../lib/supabase';
import { fmtCredits, fmtVouchers } from '../meta/economy';
import {
  CPU_SPEEDS,
  HAND_SORTS,
  HandSort,
  loadCpuSpeed,
  loadHandSort,
  saveCpuSpeed,
  saveHandSort,
} from '../meta/matchPrefs';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const HUMAN: PlayerId = 'P1';
const CPU: PlayerId = 'P2';

/** Component-scoped keyframes for the match-only combat feedback (damage
 * floats, phase banners, attack flashes) — an inline <style> block rather
 * than src/index.css, which another surface owns.
 *
 * v26: every duration below is scaled by `--gv4-pace`, the narration speed's
 * own multiplier, set on the match root. Before this the speed dial moved only
 * the DWELL between beats: on SLOW a beat sat on screen for two seconds, but
 * the card still snapped into the middle of the board in 0.5s and the damage
 * number still flew off in 1.15s, so the parts a player is actually trying to
 * watch went past at exactly the speed they had just said was too fast. The
 * ring pulse and the attack lunge are deliberately NOT scaled — they loop for
 * the whole beat, and a slower loop reads as a stall rather than as motion.
 */
/**
 * The three timed effects whose ELEMENT is unmounted by a JS timer while its
 * ANIMATION is a `--gv4-pace`-scaled CSS duration. Both halves have to come
 * from one number or they drift — which is exactly what happened when v26
 * scaled the CSS and left the timers at their v25 constants: on CINEMATIC
 * (pace 2.6) the phase banner, the damage floats and the hit flash were torn
 * off screen at 38% of the animation the same setting had just lengthened, so
 * the slowest rung in the game showed the SHORTEST version of every effect it
 * exists to let you watch.
 */
export const FX_MS = {
  /** Damage/heal number floating off a unit or a Vitality plate. */
  float: 1150,
  /** MAIN I / CLASH / YOUR TURN centre-screen banner. */
  banner: 1150,
  /** Brightness flash on a clash participant. */
  unitFlash: 650,
} as const;

/** Slack between an effect's animation ending and its element unmounting —
 * without it a rounding difference can blank the last frame. */
export const FX_UNMOUNT_SLACK_MS = 90;

/**
 * How long the ELEMENT of a paced effect stays mounted, given the narration
 * speed. Exported so the drift between this and the CSS duration — the v26
 * regression this replaces — can be pinned by a test instead of re-found by a
 * player on CINEMATIC.
 */
export function fxUnmountMs(baseMs: number, speedIdx: number): number {
  // Read through the caller's REF, not a captured value: a timer scheduled
  // inside a running narration chain must use the speed the player is on now,
  // not the one the chain started at.
  const mult = CPU_SPEEDS[speedIdx]?.mult ?? 1;
  return baseMs * Math.max(1, mult) + FX_UNMOUNT_SLACK_MS;
}

/** The `--gv4-pace` value for a speed rung — floored at 1 so FAST shortens the
 * WAIT between beats, never the damage number the player has to read. */
export function fxPaceFor(speedIdx: number): number {
  return Math.max(1, CPU_SPEEDS[speedIdx]?.mult ?? 1);
}

const GAME_CSS = `
@keyframes gv4-dmg-float {
  0% { opacity: 0; transform: translate(-50%, 6px) scale(0.7); }
  15% { opacity: 1; transform: translate(-50%, 0) scale(1.15); }
  30% { transform: translate(-50%, -4px) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -38px) scale(1); }
}
.gv4-dmg-float {
  position: absolute;
  top: 8px;
  left: 50%;
  z-index: 45;
  pointer-events: none;
  animation: gv4-dmg-float calc(${FX_MS.float}ms * var(--gv4-pace, 1)) ease-out forwards;
  font-weight: 900;
  font-size: 15px;
  color: #fff;
  background: var(--c-red);
  border: 2px solid var(--c-ink);
  border-radius: 9999px;
  padding: 0 7px;
  box-shadow: 2px 2px 0 rgba(0,0,0,0.5);
}
.gv4-heal-float {
  position: absolute;
  top: 8px;
  left: 50%;
  z-index: 45;
  pointer-events: none;
  animation: gv4-dmg-float calc(${FX_MS.float}ms * var(--gv4-pace, 1)) ease-out forwards;
  font-weight: 900;
  font-size: 15px;
  color: #fff;
  background: #2E7D32;
  border: 2px solid var(--c-ink);
  border-radius: 9999px;
  padding: 0 7px;
  box-shadow: 2px 2px 0 rgba(0,0,0,0.5);
}
@keyframes gv4-phase-pop {
  0% { opacity: 0; transform: scale(0.6); }
  18% { opacity: 1; transform: scale(1.06); }
  32% { transform: scale(1); }
  78% { opacity: 1; }
  100% { opacity: 0; transform: scale(1.02); }
}
.gv4-phase-banner { animation: gv4-phase-pop calc(${FX_MS.banner}ms * var(--gv4-pace, 1)) ease-out forwards; }
@keyframes gv4-attack-flash {
  0%, 100% { filter: none; }
  30% { filter: brightness(1.7) saturate(1.5); }
  60% { filter: brightness(0.75); }
}
.gv4-attack-flash { animation: gv4-attack-flash calc(${FX_MS.unitFlash}ms * var(--gv4-pace, 1)) ease-in-out; }
/* Pulsing outlines on the card the opponent is acting with (yellow) and
 * whatever it's acting on (red) — the same color grammar as the human's own
 * attacker/target rings, just animated since the player isn't driving. */
@keyframes gv4-act-ring {
  0%, 100% { outline-offset: 1px; outline-width: 3px; }
  50% { outline-offset: 5px; outline-width: 4px; }
}
.gv4-cpu-actor {
  outline: 3px solid var(--c-yellow);
  outline-offset: 2px;
  border-radius: 4px;
  animation: gv4-act-ring 0.8s ease-in-out infinite;
}
.gv4-cpu-target {
  outline: 3px solid var(--c-red);
  outline-offset: 2px;
  border-radius: 4px;
  animation: gv4-act-ring 0.8s ease-in-out infinite;
}
/* Units popping onto the battlefield — a quick settle-in so an entering body
 * reads as an arrival instead of teleporting into the row. */
@keyframes gv4-unit-enter {
  0% { opacity: 0; transform: translateY(10px) scale(0.7); }
  60% { opacity: 1; transform: translateY(-2px) scale(1.05); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.gv4-unit-enter { animation: gv4-unit-enter calc(0.35s * var(--gv4-pace, 1)) ease-out; }
/* The card the opponent is playing, held in the middle of the board while its
 * narration beat is on screen. Named cards in a log line are easy to skim
 * past; the face itself is not. */
@keyframes gv4-cpu-play {
  0% { opacity: 0; transform: translateY(-26px) scale(0.72) rotate(-6deg); }
  55% { opacity: 1; transform: translateY(4px) scale(1.04) rotate(1deg); }
  100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
}
.gv4-cpu-play { animation: gv4-cpu-play calc(0.5s * var(--gv4-pace, 1)) cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
/* v28 — a unit this turn destroyed, held up for the length of the beat that
 * says so. It arrives the opposite way to gv4-cpu-play: that one drops in and
 * settles, this one comes up desaturated, tips over and sinks, because the
 * card it is showing is not on the board any more and the animation should not
 * suggest otherwise. Paced by --gv4-pace like everything else the narration
 * owns, so the slowest rung really does show the slowest version. */
@keyframes gv4-cpu-lost {
  0% { opacity: 0; transform: translateY(-10px) scale(0.86) rotate(0deg); filter: grayscale(1); }
  40% { opacity: 1; transform: translateY(0) scale(1) rotate(-2deg); filter: grayscale(0.55); }
  100% { opacity: 1; transform: translateY(10px) scale(0.97) rotate(-5deg); filter: grayscale(0.85); }
}
.gv4-cpu-lost { animation: gv4-cpu-lost calc(1.15s * var(--gv4-pace, 1)) ease-out both; }
/* An attacking body leans across the clash line for the duration of the
 * attack beat, so a declared attack reads as movement and not as a ring. */
@keyframes gv4-lunge-down {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(12px); }
}
.gv4-lunge-down { animation: gv4-lunge-down 0.9s ease-in-out infinite; }
/* A refused action's banner gives a short sideways shake so "that was a no"
 * registers even before the sentence is read. */
@keyframes gv4-banner-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(2px); }
}
.gv4-banner-shake { animation: gv4-banner-shake 0.32s ease-in-out; }
/* Honor the OS-level "reduce motion" preference, like the rest of the app
 * (index.css, CardFaceV4, Card3DInspector) already does. Information-carrying
 * feedback stays — rings render as static outlines, floats and the phase
 * banner become plain fades — only the movement goes. */
@keyframes gv4-fade {
  0% { opacity: 0; }
  12% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes gv4-fade-float {
  0% { opacity: 0; transform: translate(-50%, 0); }
  12% { opacity: 1; transform: translate(-50%, 0); }
  80% { opacity: 1; transform: translate(-50%, 0); }
  100% { opacity: 0; transform: translate(-50%, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .gv4-cpu-actor, .gv4-cpu-target, .gv4-lunge-down, .gv4-unit-enter,
  .gv4-cpu-play, .gv4-attack-flash, .gv4-banner-shake { animation: none; }
  /* Not gv4-fade: that one ends at opacity 0, which is right for a banner
   * meant to leave and wrong for a card meant to be LOOKED at for the length
   * of its beat. The information the motion carries — this card is off the
   * board — is carried by the desaturation instead, statically. */
  .gv4-cpu-lost { animation: none; filter: grayscale(0.85); }
  .gv4-phase-banner { animation: gv4-fade calc(${FX_MS.banner}ms * var(--gv4-pace, 1)) ease-out forwards; }
  .gv4-dmg-float, .gv4-heal-float { animation: gv4-fade-float calc(${FX_MS.float}ms * var(--gv4-pace, 1)) ease-out forwards; }
}
`;

/** One floating "-N" damage (or "+N" heal) number, keyed so simultaneous
 * hits stack cleanly. `iid` is a unit iid or a vitality key ('vit:P1'). */
interface DmgFloat {
  id: number;
  iid: string;
  amount: number;
  kind: 'dmg' | 'heal';
}

/** Renders a card's currently-animating damage/heal floats. */
function FloatLayer({ floats }: { floats?: DmgFloat[] }) {
  if (!floats || floats.length === 0) return null;
  return (
    <>
      {floats.map((f) => (
        <span key={f.id} className={f.kind === 'heal' ? 'gv4-heal-float' : 'gv4-dmg-float'}>
          {f.kind === 'heal' ? '+' : '−'}
          {f.amount}
        </span>
      ))}
    </>
  );
}

const SINGLE_TARGETS = ['enemyUnit', 'friendlyUnit', 'anyTarget', 'friendlyAny'];
function needsTarget(eff?: Effect): boolean {
  return !!eff && SINGLE_TARGETS.includes(eff.target);
}

/** All legal explicit targets (unit iids and/or player ids) for an effect
 * invoked by `pid` — Warded and side restrictions come from engine canTarget. */
function targetsFor(g: GameState, pid: PlayerId, eff: Effect): string[] {
  const cands: string[] = [
    ...g.players.P1.field.map((u) => u.iid),
    ...g.players.P2.field.map((u) => u.iid),
    'P1',
    'P2',
  ];
  return cands.filter((iid) => canTarget(g, pid, eff, iid));
}

/**
 * Why can't `pid` activate Leader ability `idx` right now? (undefined = they
 * can.) Pure so it can be unit-tested; the component passes its own
 * `inOwnMain` flag since that also depends on UI stage.
 *
 * The last check is the one that matters: `activateLeaderAbility` spends the
 * ability's Resolve — and shatters the Leader outright at zero — whether or
 * not the effect finds anything to resolve against. A targeted ability
 * pointed at an empty (or entirely Warded) enemy board therefore used to cost
 * Resolve for literally nothing, and could kill the player's own Leader doing
 * it. The CPU has guarded itself against exactly this since v6.9 (see
 * `runLeaderAbility` in ai.ts, "burned Resolve on guaranteed whiffs"); the
 * human's pill was still enabled. Abilities that can legally hit a PLAYER
 * ('anyTarget' damage, 'friendlyAny' heal) are unaffected — `targetsFor`
 * counts player targets, so those keep a legal target on an empty board.
 */
export function leaderAbilityWhy(
  g: GameState,
  pid: PlayerId,
  idx: number,
  inOwnMain: boolean,
): string | undefined {
  const L = g.players[pid].leader;
  if (!L.invoked || L.shattered) return 'Leader not on the field';
  if (!inOwnMain) return 'Leader abilities resolve during your main phases';
  // `activateLeaderAbility` gates on `inOwnMainClear` — main phase AND an
  // empty stack. Without this clause the pill stayed live with something
  // waiting to resolve, and a *targeted* ability walked the player through a
  // whole target pick before the engine refused it as "Illegal target".
  if (g.stack.length > 0) {
    const top = g.stack[g.stack.length - 1];
    return `${top ? top.sourceName : 'Something'} is still on the stack — let it resolve first`;
  }
  if (L.abilityUsedThisTurn) return 'One Leader ability per turn — already used';
  const ab = L.def.leaderAbilities?.[idx];
  if (!ab) return 'No such ability';
  if (ab.resolveDelta < 0 && L.resolve + ab.resolveDelta < 0)
    return `Needs ${-ab.resolveDelta} Resolve (has ${L.resolve})`;
  if (needsTarget(ab.effect) && targetsFor(g, pid, ab.effect).length === 0)
    return 'No legal target right now — using it would spend Resolve for nothing';
  return undefined;
}

/** Could this cost be paid if we tapped Locations for it? */
function canAfford(p: PlayerState, cost?: EssenceCost): boolean {
  return canPayCost(potentialEssence(p), cost);
}

/**
 * Auto-payment: exhaust Locations until the floating pool covers `cost`
 * (colored pips first from matching Locations, then generic from whatever
 * is most plentiful). Returns true when the pool can pay afterwards.
 */
function autoTapFor(g: GameState, pid: PlayerId, cost?: EssenceCost): boolean {
  const p = g.players[pid];
  let safety = 64;
  while (!canPayCost(p.essence, cost) && safety-- > 0) {
    let tapped = false;
    // Unmet colored pip → tap a matching Location.
    for (const c of COLORS) {
      const need = (cost?.pips[c] ?? 0) - (p.essence[c] ?? 0);
      if (need > 0) {
        const loc = p.locations.find((l) => !l.exhausted && l.produces === c);
        if (loc && tapLocationForEssence(g, pid, loc.iid)) {
          tapped = true;
          break;
        }
      }
    }
    if (tapped) continue;
    // Generic remainder → prefer types NOT needed as pips elsewhere in the
    // cost (keeps colored sources free), else anything untapped.
    const spare = p.locations.find((l) => !l.exhausted && !(cost?.pips[l.produces] ?? 0));
    const loc = spare ?? p.locations.find((l) => !l.exhausted);
    if (!loc || !tapLocationForEssence(g, pid, loc.iid)) break;
  }
  return canPayCost(p.essence, cost);
}

// ---------------------------------------------------------------------------
// Hover-to-view: board cards render tiny (`micro` tier) so more units fit on
// screen; any card whose text a player wants to read gets a zoomed read-only
// preview on hover (portal at a viewport-fixed position, since board rows sit
// inside overflow containers that would clip an absolute popup).
// ---------------------------------------------------------------------------
export const HOVER_PREVIEW_SCALE = INSPECT_SCALE;

function useHoverPreview<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const { w: fullW, h: fullH } = CARD_SIZES.full;
  const scaledW = fullW * HOVER_PREVIEW_SCALE;
  const scaledH = fullH * HOVER_PREVIEW_SCALE;
  const show = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - scaledW / 2), vw - scaledW - 8);
    const openAbove = rect.top - scaledH - 10 >= 8;
    const top = openAbove ? rect.top - scaledH - 10 : Math.min(rect.bottom + 10, vh - scaledH - 8);
    setPos({ top, left });
  };
  const hide = () => setPos(null);
  return { ref, pos, show, hide };
}

/** Long-press (touch) equivalent of hover, so board-unit inspection works on
 * mobile: a long press shows the preview and suppresses the click that would
 * otherwise fire on touch-end; a short tap behaves as a normal click. */
function useLongPress(onLongPress: () => void, onEnd: () => void, onTap?: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const moved = useRef(false);
  const start = () => {
    fired.current = false;
    moved.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, 350);
  };
  const clear = (e: React.TouchEvent, wasTap: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (fired.current) {
      e.preventDefault();
      onEnd();
    } else if (wasTap && !moved.current) {
      onTap?.();
    }
  };
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  return {
    onTouchStart: start,
    // A moving finger is a scroll, not a press (and not a tap either) —
    // without this, slowly dragging the overflow-x field lane across units
    // popped the full-card preview whenever one sat under the finger >350ms.
    onTouchMove: () => {
      moved.current = true;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    },
    onTouchEnd: (e: React.TouchEvent) => clear(e, true),
    onTouchCancel: (e: React.TouchEvent) => clear(e, false),
  };
}

/** Focus management for this component's inline modal overlays (confirm
 * dialog, mulligan, game-over) — same fix as Card3DInspector/
 * CardInspectorModal (v4.24): move focus into the dialog while `active`,
 * and restore it to whatever triggered it on close, so a keyboard user can't
 * Tab through to the (only visually) obscured board underneath. */
function useDialogFocus(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const prevFocused = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prevFocused?.focus?.();
  }, [active]);
  return ref;
}

/** `title=` tooltips never appear on touch devices — this wraps a badge so
 * tapping it also reveals the same text in a small popover. */
function Tip({
  text,
  className,
  children,
}: {
  text: string;
  className?: string;
  children: React.ReactNode;
}) {
  // Portaled at a viewport-fixed position (same reason as HoverPreview): the
  // badges wearing these sit inside overflow-scrolling field lanes, where an
  // absolute popover was clipped by the lane edge — and pushed fully
  // off-screen for the leftmost unit on a phone.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = pos !== null;
  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(open) : v;
    if (!next) {
      setPos(null);
      return;
    }
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const width = 160; // matches the popover's w-40
    setPos({
      top: rect.bottom + 4,
      left: Math.min(Math.max(8, rect.right - width), vw - width - 8),
    });
  };
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  return (
    <span
      ref={ref}
      title={text}
      role="button"
      tabIndex={0}
      aria-label={text}
      className={cn('relative', className)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }
      }}
    >
      {children}
      {open &&
        createPortal(
          <span
            className="fixed z-[9995] w-40 text-[10px] leading-tight normal-case font-normal bg-black text-white ink-border-sm px-1.5 py-1 pointer-events-none"
            style={{ top: pos!.top, left: pos!.left }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

function HoverPreview({
  pos,
  children,
}: {
  pos: { top: number; left: number } | null;
  children: React.ReactNode;
}) {
  if (!pos) return null;
  return createPortal(
    <div
      className="fixed z-[9990] pointer-events-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
      style={{
        top: pos.top,
        left: pos.left,
        transform: `scale(${HOVER_PREVIEW_SCALE})`,
        transformOrigin: 'top left',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Essence pips — the floating pool, rendered as colored circles.
// ---------------------------------------------------------------------------
function EssencePips({
  pool,
  size = 16,
}: {
  pool: Partial<Record<EssenceType, number>>;
  size?: number;
}) {
  const pips: { key: string; c: EssenceType }[] = [];
  for (const c of COLORS) {
    const n = pool[c] ?? 0;
    for (let i = 0; i < n; i++) pips.push({ key: `${c}${i}`, c });
  }
  if (pips.length === 0) {
    return (
      <span className="text-[8px] font-bold text-[var(--c-paper)]/40">no essence floating</span>
    );
  }
  return (
    <span className="flex items-center gap-[3px] flex-wrap">
      {pips.map((p) => (
        <span
          key={p.key}
          title={`${p.c} essence`}
          className="flex items-center justify-center rounded-full font-mono font-black leading-none border border-white/70"
          style={{
            width: size,
            height: size,
            fontSize: size * 0.55,
            backgroundColor: COLOR_PIP[p.c].bg,
            color: COLOR_PIP[p.c].fg,
            boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }}
        >
          <EssenceIcon type={p.c} color={COLOR_PIP[p.c].fg} size={Math.round(size * 0.62)} />
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// A Location tile — a basic Wellspring (colored essence square) or a Sanctum
// (named, inspectable). Tapping produces 1 essence when legal.
// ---------------------------------------------------------------------------
function LocationTile({
  loc,
  tappable,
  onTap,
  onInspect,
}: {
  key?: React.Key;
  loc: LocationInst;
  tappable: boolean;
  onTap?: () => void;
  onInspect?: () => void;
}) {
  const sanctum = !!loc.def;
  const label = sanctum ? loc.def!.name : `${loc.produces} Wellspring`;
  const action = tappable && !loc.exhausted ? onTap : sanctum ? onInspect : undefined;
  // While a Sanctum is tappable, click is tap-for-essence — which used to
  // leave no way at all to READ your own Sanctum without first spending its
  // tap. Long-press (touch) and right-click both inspect instead.
  const inspectPress = useLongPress(
    () => {
      if (sanctum) onInspect?.();
    },
    () => {},
  );
  return (
    <button
      onClick={action}
      {...(sanctum ? inspectPress : {})}
      onContextMenu={
        sanctum && onInspect
          ? (e) => {
              e.preventDefault();
              onInspect();
            }
          : undefined
      }
      onKeyDown={
        sanctum && onInspect
          ? (e) => {
              // Keyboard path to READ a tappable Sanctum without spending its
              // tap (Enter/Space alone are the click = tap-for-essence).
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                onInspect();
              }
            }
          : undefined
      }
      disabled={!action}
      title={
        loc.exhausted
          ? `${label} — exhausted (recovers at Dawn)`
          : tappable
            ? `${label} — exhaust: add one ${loc.produces} essence${
                sanctum ? ' (right-click / long-press / Shift+Enter to read it)' : ''
              }`
            : label
      }
      aria-label={`${label}${loc.exhausted ? ', exhausted' : ''}`}
      className={cn(
        'flex items-center gap-1 px-1 py-0.5 ink-border-sm shrink-0 text-left',
        loc.exhausted ? 'opacity-40 rotate-3' : 'btn-pop',
        sanctum ? 'bg-[var(--c-paper)]' : 'bg-[var(--c-paper)]/90',
      )}
      style={{ borderLeft: `5px solid ${COLOR_PIP[loc.produces].bg}` }}
    >
      <span
        className="flex items-center justify-center rounded-full font-mono font-black leading-none shrink-0"
        style={{
          width: 14,
          height: 14,
          fontSize: 8,
          backgroundColor: COLOR_PIP[loc.produces].bg,
          color: COLOR_PIP[loc.produces].fg,
        }}
      >
        <EssenceIcon type={loc.produces} color={COLOR_PIP[loc.produces].fg} size={9} />
      </span>
      <span className="text-[7.5px] font-black leading-tight text-[var(--c-ink)] max-w-[70px] truncate">
        {sanctum ? loc.def!.name : 'WELLSPRING'}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// A unit on the battlefield — the shared CardFace template (`micro` tier)
// with live Might/Grit in the stat-chip slots, status overlays on a wrapper,
// and a hover-to-view full-size preview.
// ---------------------------------------------------------------------------
function BoardUnit({
  g,
  u,
  onClick,
  highlight,
  dimmed,
  isAttacker,
  isGuard,
  flash,
  acting,
  acted,
  lunge,
  floats,
  guardNote,
}: {
  key?: React.Key;
  g: GameState;
  u: UnitInst;
  onClick?: () => void;
  /** Red ring: legal target / selectable right now. */
  highlight?: boolean;
  dimmed?: boolean;
  /** Yellow ring: selected attacker (or declared enemy attacker). */
  isAttacker?: boolean;
  /** Blue ring: assigned as a guard this clash. */
  isGuard?: boolean;
  flash?: boolean;
  acting?: boolean;
  acted?: boolean;
  /** The opponent just declared this unit as an attacker — it leans across
   * the clash line for the length of the beat. */
  lunge?: boolean;
  floats?: DmgFloat[];
  /** Small label under the status badges (e.g. "guards #2"). */
  guardNote?: string;
}) {
  const atk = effMight(g, u);
  const maxHp = effGrit(g, u);
  const hp = remainingGrit(g, u);
  const sick = u.enteredThisTurn && !unitHasKw(u, 'Reckless');
  const warded = unitHasKw(u, 'Warded');
  const {
    ref: hoverRef,
    pos: hoverPos,
    show: hoverShow,
    hide: hoverHide,
  } = useHoverPreview<HTMLDivElement>();
  const longPress = useLongPress(hoverShow, hoverHide);
  return (
    <div
      ref={hoverRef}
      onMouseEnter={hoverShow}
      onMouseLeave={hoverHide}
      {...longPress}
      className={cn(
        'relative shrink-0 gv4-unit-enter',
        flash && 'gv4-attack-flash',
        highlight && 'ring-4 ring-[var(--c-red)] -translate-y-1 rounded-[4px]',
        isAttacker && 'ring-4 ring-[var(--c-yellow)] -translate-y-1 rounded-[4px]',
        isGuard && 'ring-4 ring-[#29B6F6] -translate-y-1 rounded-[4px]',
        acting && 'gv4-cpu-actor -translate-y-1',
        acted && 'gv4-cpu-target',
        lunge && 'gv4-lunge-down',
        (u.exhausted || sick) && 'saturate-50',
      )}
    >
      <CardFace
        def={u.def}
        size="micro"
        live={{ atk, hp, maxHp }}
        dimmed={dimmed}
        introduceKeywords
        onClick={onClick}
      />
      <HoverPreview pos={hoverPos}>
        <CardFace def={u.def} size="full" live={{ atk, hp, maxHp }} />
      </HoverPreview>
      <div className="absolute -top-1.5 -right-1.5 z-20 flex gap-0.5">
        {warded && (
          <Tip
            text="Warded — can't be targeted by the opponent's effects"
            className="text-[10px] bg-[#29B6F6] ink-border-sm px-0.5"
          >
            🛡
          </Tip>
        )}
        {u.items.length > 0 && (
          <Tip
            text={`Bonded Items: ${u.items.map((c) => c.def.name).join(', ')}`}
            className="text-[10px] bg-[#8E44AD] text-white ink-border-sm px-0.5"
          >
            💠{u.items.length}
          </Tip>
        )}
        {sick && (
          <Tip
            text="Just invoked — can't attack until its controller's next turn (no Reckless)"
            className="text-[10px] bg-[var(--c-steel)] text-white ink-border-sm px-0.5"
          >
            z
          </Tip>
        )}
        {u.exhausted && !sick && (
          <Tip
            text="Exhausted — attacked or was spent this turn; recovers at Dawn"
            className="text-[10px] bg-[var(--c-steel)] text-white ink-border-sm px-0.5"
          >
            ✓
          </Tip>
        )}
      </div>
      {guardNote && (
        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-20 text-[7px] font-black bg-[#29B6F6] text-[var(--c-ink)] px-1 ink-border-sm whitespace-nowrap">
          {guardNote}
        </div>
      )}
      <FloatLayer floats={floats} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Labeled ability pill — the one clickable affordance for Leader abilities,
// with disabled-reason tooltips (a div, not a <button>: `desc` runs through
// renderKeywordText whose keyword mentions are themselves <button>s).
// ---------------------------------------------------------------------------
function AbilityPill({
  label,
  desc,
  usable,
  used,
  why,
  onClick,
}: {
  key?: React.Key;
  label: string;
  desc: string;
  usable?: boolean;
  used?: boolean;
  why?: string;
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-disabled={onClick ? !usable : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        // The description renders nested keyword-link buttons; let their own
        // Enter/Space fire instead of triggering the ability.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      title={why}
      className={cn(
        'w-full text-[8.5px] font-bold px-1.5 py-1 ink-border-sm text-left leading-tight',
        usable
          ? 'btn-pop cursor-pointer bg-[var(--c-yellow)] text-[var(--c-ink)]'
          : 'bg-[var(--c-steel)]/70 text-[var(--c-paper)]/70',
        used && 'line-through opacity-70',
      )}
    >
      <span className="heading-font mr-1">{label}</span>
      {renderKeywordText(desc, true)}
      {used ? ' — USED' : ''}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Tactile Lane" board furniture — the redesigned match layout stacks the two
// players' zones as full-width lanes (bar → locations → field) meeting at a
// clash divider, instead of the old side-panel-plus-row arrangement. The card
// templates themselves are untouched: units, hand cards and the Leader
// thumbnails all still render through CardFace.
// ---------------------------------------------------------------------------

/** Always-visible Dawn → Main I → Clash → Main II → Dusk progress bar. */
function PhaseStepper({
  phase,
  yours,
}: {
  phase: GameState['phase'];
  /** Highlight in the player's yellow vs the opponent's red. */
  yours: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-1 py-1 bg-[var(--c-paper)]/8 border-b border-[var(--c-paper)]/10 shrink-0">
      {PHASE_ORDER.map((ph, i) => (
        <React.Fragment key={ph}>
          {i > 0 && <span className="text-[8px] text-[var(--c-paper)]/25">›</span>}
          <span
            className={cn(
              'heading-font text-[9px] px-2 py-0.5 rounded-[2px] tracking-wide',
              phase === ph
                ? yours
                  ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                  : 'bg-[var(--c-red)] text-white'
                : 'bg-[var(--c-paper)]/12 text-[var(--c-paper)]/45',
            )}
          >
            {PHASE_LABEL[ph]}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

/** Leader Resolve as filled dots rather than a bare number — the resource is
 * spent and regained in ones, so a countable row reads faster than digits. */
function ResolveDots({ resolve, max, mine }: { resolve: number; max: number; mine: boolean }) {
  // `total` is the number of dots drawn; it stays defensive against a Resolve
  // above the printed maximum even though `activateLeaderAbility` now caps
  // builders there. The LABEL must read the printed maximum either way: the
  // tooltip used to drop " of N" entirely whenever resolve exceeded max while
  // the aria-label reported " of {total}", so a sighted player and a screen
  // reader were told two different maxima for the same Leader.
  const total = Math.max(1, Math.min(10, Math.max(max, resolve)));
  const label = `Resolve ${resolve} of ${Math.max(max, resolve)}`;
  return (
    <span className="flex gap-[3px] items-center" title={label} aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="w-[7px] h-[7px] rounded-full border border-[var(--c-ink)]"
          style={{
            backgroundColor:
              i < resolve ? (mine ? 'var(--c-yellow)' : 'var(--c-red)') : 'rgba(255,255,255,0.25)',
          }}
        />
      ))}
    </span>
  );
}

/**
 * A player's status lane: Leader thumbnail (the real card template at its
 * smallest tier), name, Resolve dots, a Vitality plate, and — on the human's
 * side — the floating Essence pool and the Leader's ability buttons.
 */
function LeaderLane({
  p,
  isHuman,
  label,
  vitTargetable,
  onVitClick,
  onInvoke,
  invokeWhy,
  onAbility,
  abilityWhy,
  onInspect,
  floats,
  flash,
  cpuActing,
  cpuVitTarget,
  right,
}: {
  p: PlayerState;
  isHuman: boolean;
  label: string;
  vitTargetable?: boolean;
  onVitClick?: () => void;
  onInvoke?: () => void;
  invokeWhy?: string;
  onAbility?: (idx: number) => void;
  abilityWhy?: (idx: number) => string | undefined;
  onInspect?: () => void;
  floats?: DmgFloat[];
  flash?: boolean;
  /** Pulsing yellow ring on the Leader thumbnail — the CPU's Leader is the
   * actor of the narration beat on screen. */
  cpuActing?: boolean;
  /** Pulsing red ring on the Vitality plate — the current CPU action is
   * aimed at this player. */
  cpuVitTarget?: boolean;
  /** Extra content pinned to the right end of the lane (piles, log toggle). */
  right?: React.ReactNode;
}) {
  const L = p.leader;
  const maxResolve = L.def.resolve ?? L.resolve;
  return (
    <div
      className={cn(
        // v7.4: wrapping was costing ~90px a lane on a phone — the vitality
        // plate, essence readout and INVOKE LEADER each fell onto their own
        // row, and two lanes doing that pushed the player's HAND entirely off
        // a 375x667 screen. Scroll sideways instead of stacking; nothing is
        // lost, and the lane stays one row tall.
        'flex items-center gap-2 px-2 py-1 shrink-0 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible',
        isHuman
          ? 'bg-[var(--c-yellow)]/12 border-t border-[var(--c-yellow)]/25'
          : 'bg-[var(--c-red)]/12 border-b border-[var(--c-red)]/25',
        flash && 'gv4-attack-flash',
      )}
    >
      <div
        className={cn(
          'shrink-0 relative',
          L.shattered && 'grayscale opacity-60',
          cpuActing && 'gv4-cpu-actor',
        )}
      >
        <CardFace
          def={L.def}
          size="micro"
          badge={L.shattered ? 'SHATTERED' : L.invoked ? 'INVOKED' : 'LEADER ZONE'}
          introduceKeywords
          onClick={onInspect}
        />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="heading-font text-[11px] text-[var(--c-paper)] truncate max-w-[260px]">
          {label}
        </span>
        <ResolveDots resolve={L.resolve} max={maxResolve} mine={isHuman} />
      </div>
      <div
        role={onVitClick ? 'button' : undefined}
        tabIndex={onVitClick ? 0 : undefined}
        onClick={onVitClick}
        onKeyDown={(e) => {
          if (!onVitClick) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onVitClick();
          }
        }}
        title={`${isHuman ? 'Your' : "Opponent's"} Vitality — win by reducing the opponent's to 0`}
        className={cn(
          'relative flex items-center gap-1 px-2 py-0.5 ink-border-sm heading-font bg-[var(--c-paper)] text-[var(--c-red)] shrink-0',
          vitTargetable && 'ring-4 ring-[var(--c-red)] cursor-pointer',
          cpuVitTarget && 'gv4-cpu-target',
        )}
      >
        <span className="text-[13px] leading-none">♥</span>
        <span className="text-lg leading-none">{Math.max(0, p.vitality)}</span>
        <FloatLayer floats={floats} />
      </div>

      {isHuman && (
        <span className="flex items-center gap-1 shrink-0">
          <span className="heading-font text-[7px] text-[var(--c-paper)]/55">ESSENCE</span>
          <EssencePips pool={p.essence} size={15} />
        </span>
      )}

      {isHuman && !L.invoked && !L.shattered && (
        <button
          onClick={onInvoke}
          disabled={!!invokeWhy}
          title={invokeWhy}
          className={cn(
            'tap-44 heading-font text-[9px] px-2 py-1 ink-border-sm shrink-0',
            invokeWhy
              ? 'bg-[var(--c-steel)]/60 text-[var(--c-paper)]/60 cursor-not-allowed'
              : 'btn-pop bg-[var(--c-red)] text-white',
          )}
        >
          ⚜ INVOKE LEADER
        </button>
      )}
      {L.invoked && !L.shattered && (
        <span className="flex items-center gap-1 flex-wrap min-w-0">
          {(L.def.leaderAbilities ?? []).map((ab, i) => (
            <span key={i} className="max-w-[260px]">
              <AbilityPill
                label={`${ab.resolveDelta > 0 ? '+' : ''}${ab.resolveDelta}:`}
                desc={ab.text ?? describeEffect(ab.effect)}
                usable={isHuman && !abilityWhy?.(i)}
                used={L.abilityUsedThisTurn}
                why={isHuman ? abilityWhy?.(i) : 'Opponent Leader ability — shown for information'}
                onClick={isHuman && onAbility ? () => onAbility(i) : undefined}
              />
            </span>
          ))}
        </span>
      )}
      {right && <span className="ml-auto flex items-center gap-1.5 shrink-0">{right}</span>}
    </div>
  );
}

/** One player's Locations, on their own lane so Wellsprings and Sanctums are
 * visible board objects rather than a footnote in a status bar. */
function LocationsLane({
  locations,
  tappable,
  onTap,
  onInspect,
  mine,
  children,
}: {
  locations: LocationInst[];
  tappable: boolean;
  onTap?: (l: LocationInst) => void;
  onInspect?: (l: LocationInst) => void;
  mine: boolean;
  /** Trailing controls (the "+ WELLSPRING" picker on the human's lane). */
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 shrink-0 overflow-x-auto',
        mine ? 'bg-[var(--c-ink)]/45' : 'bg-[var(--c-ink)]/45',
      )}
    >
      <span className="heading-font text-[7px] text-[var(--c-paper)]/40 tracking-[1px] shrink-0">
        LOCATIONS
      </span>
      {locations.map((l) => (
        <LocationTile
          key={l.iid}
          loc={l}
          tappable={tappable}
          onTap={onTap ? () => onTap(l) : undefined}
          onInspect={l.def && onInspect ? () => onInspect(l) : undefined}
        />
      ))}
      {locations.length === 0 && (
        <span className="text-[8px] font-bold text-[var(--c-paper)]/30 shrink-0">none in play</span>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
type Stage = 'mulligan' | 'play' | 'cpu' | 'cpuGuard' | 'respond' | 'over';

const PHASE_LABEL: Record<GameState['phase'], string> = {
  Dawn: 'DAWN',
  Main1: 'MAIN I',
  Clash: 'CLASH',
  Main2: 'MAIN II',
  Dusk: 'DUSK',
};
const PHASE_ORDER: GameState['phase'][] = ['Dawn', 'Main1', 'Clash', 'Main2', 'Dusk'];

/** Pacing for the narrated replay of the CPU's turn (at NORMAL speed). */
/** Both ⏱ buttons' tooltip, BUILT from the ladder rather than typed out.
 * v26 added a fourth rung (CINEMATIC) and both tooltips kept advertising the
 * three-rung v17 ladder, so the slowest speed in the game was undiscoverable
 * from either control that cycles to it. Deriving it means the next rung
 * cannot reintroduce the same drift. */
const SPEED_TOOLTIP = `Narration speed — click to cycle ${CPU_SPEEDS.map((s) => s.label).join(' / ')}`;

const CPU_PACE = {
  THINK_MS: 900,
  BEAT_MS: 1150,
} as const;

// Narration speed (CINEMATIC / SLOW / NORMAL / FAST) — shared with the Settings
// screen,
// which is where a player looks for it when no match is running.

/** One narration beat: a log line plus the board objects it involves, so the
 * acting card (yellow ring) and its target (red ring) pulse while the line is
 * on screen — the player can SEE what the CPU is doing, not just read it. */
export interface CpuBeat {
  text: string;
  /** Unit iids the CPU is acting WITH (yellow pulse). */
  actors: string[];
  /** Unit iids — or 'P1'/'P2' — the action is aimed AT (red pulse). */
  targets: string[];
  /** The CPU's Leader itself is the actor (rings the Leader thumbnail). */
  leaderActing?: boolean;
  /** Catalog id of the card being played — spotlit mid-board for this beat. */
  cardId?: string;
  /** This beat is a declared attack: the attackers lunge across the line. */
  attacking?: boolean;
  /**
   * Cards this line names that are NOT on a battlefield any more — they are in
   * an ash or void pile, because this turn is what put them there.
   *
   * The ring machinery can only point at something the board is drawing, and
   * the beat a player most needs to see is exactly the one whose subject the
   * board has stopped drawing: "Your Ashen Sentinel was shattered." arrives
   * after the compute-then-narrate paths have already rendered the FINAL
   * board, so the unit is gone from the field before the sentence about it is
   * on screen, `unitsNamedIn` finds nothing, and the most consequential line
   * of the opponent's turn is the one line with no highlight at all. These get
   * held mid-board instead — the same spotlight a played card gets, under a
   * LOST plate rather than a PLAYS one.
   */
  lost?: { iid: string; defId: string; owner: PlayerId }[];
  /** This beat is the PLAYER's own Dawn (it runs inside the endPhase that
   * ends the opponent's turn, so its lines land in the opponent's narrated
   * slice) — the bubble renders it in the player's colours under a YOUR DAWN
   * label instead of presenting it as something the opponent did. */
  mine?: boolean;
}

/**
 * Every unit on either field whose printed name appears in `text`, as iids.
 *
 * The ring/spotlight machinery is driven by the AI's structured event stream,
 * which covers what the AI DECIDES — invoke, attack, re-bond, Leader ability.
 * It does not cover what the RULES do: a shatter, a fizzle, a Dawn freeze, a
 * Dusk sweep. Those lines name their cards in prose and got no ring at all.
 * Matching on the name is a fallback, not a replacement — an event, when there
 * is one, is always more precise than a substring.
 *
 * Two copies of the same card both light up, which is correct: the line is
 * genuinely ambiguous about which one, and lighting both is a better answer
 * than lighting neither.
 */
function unitsNamedIn(state: GameState, text: string): string[] {
  const hits: string[] = [];
  for (const pid of ['P1', 'P2'] as PlayerId[]) {
    for (const u of state.players[pid].field) {
      if (u.def.name && text.includes(u.def.name)) hits.push(u.iid);
    }
  }
  return hits;
}

/**
 * Cards a line names that are sitting in an ash or void pile.
 *
 * The companion to `unitsNamedIn`, and the half that was missing. A CPU turn
 * is narrated from the board it LEFT BEHIND, so anything it killed has already
 * moved to a pile by the time its own beat plays: the field scan comes back
 * empty and the line goes out ringless. Scanning the piles finds it — and
 * `CpuBeat.lost` is a different signal from `targets` on purpose, because
 * there is no element on the board to ring, only a card to hold up.
 *
 * Piles hold every card a turn discards or resolves, so the scan is capped at
 * the tail: a twentieth-turn ash pile is forty cards deep and a line matching
 * one buried at the bottom is matching a coincidence, not this turn's event.
 */
const PILE_SCAN_DEPTH = 6;
function pileCardsNamedIn(
  state: GameState,
  text: string,
): { iid: string; defId: string; owner: PlayerId }[] {
  const hits: { iid: string; defId: string; owner: PlayerId }[] = [];
  const seen = new Set<string>();
  for (const pid of ['P1', 'P2'] as PlayerId[]) {
    const p = state.players[pid];
    for (const pile of [p.ashPile, p.voidPile]) {
      for (const c of pile.slice(-PILE_SCAN_DEPTH)) {
        if (!c.def.name || !text.includes(c.def.name)) continue;
        if (seen.has(c.iid)) continue;
        seen.add(c.iid);
        // The pile is the owner: a beat holding up a dead card should be able
        // to say WHOSE it was without the board having to remember.
        hits.push({ iid: c.iid, defId: c.def.id, owner: pid });
      }
    }
  }
  return hits;
}

/** Line up the engine-log lines of a CPU turn with the AI's structured event
 * stream. Events are stamped with the log length at the moment they fired
 * (`logAt`), so a log line at absolute index L belongs to the first event
 * whose `logAt` exceeds L. */
export function buildCpuBeats(
  lines: string[],
  logStart: number,
  events: CpuTurnEvent[],
  /** Board to fall back on when a line has no event behind it — see
   * `unitsNamedIn`. Optional so the existing pinned tests keep their exact
   * inputs. */
  state?: GameState,
): CpuBeat[] {
  return lines.map((text, i) => {
    const abs = logStart + i;
    const ev = events.find((e) => (e.logAt ?? Infinity) > abs);
    const beat: CpuBeat = { text, actors: [], targets: [] };
    if (!ev) {
      // No structured event covers this line. Most such lines still NAME the
      // cards they are about ("… was shattered.", "Glaciate freezes X"), and a
      // beat with no rings is a sentence the player has to find on the board
      // themselves — which is the whole thing the rings exist to save them.
      if (state) {
        beat.targets.push(...unitsNamedIn(state, text));
        const lost = pileCardsNamedIn(state, text);
        // Only when the field scan came back empty. A line naming a unit that
        // is STILL on the board is about that unit, and a same-named copy in
        // the ash pile is a coincidence the spotlight should not act on.
        if (lost.length > 0 && beat.targets.length === 0) {
          beat.lost = lost;
          // Fed to `targets` as well, purely for the dwell: `beatMs` gives a
          // beat aimed at something of the player's a longer hold, and a unit
          // of theirs that just DIED is the clearest case there is.
          beat.targets.push(...lost.map((l) => l.iid));
        }
      }
      return beat;
    }
    switch (ev.kind) {
      case 'invoke':
        beat.actors.push(ev.iid);
        beat.cardId = ev.defId;
        if (ev.targetIid) beat.targets.push(ev.targetIid);
        break;
      case 'attack':
        beat.actors.push(...ev.iids);
        beat.attacking = true;
        // v20 — ring the human's Vitality plate too. The reverse case has done
        // this since v19: when the CPU declines to guard, `buildGuardBeats`
        // rings the CPU's OWN plate because that is what the unblocked Might
        // is pointed at. Declaring an attack is the same statement in the
        // other direction and was the half that said nothing — the attackers
        // lunged and the player was left to infer where at.
        beat.targets.push(HUMAN);
        break;
      case 'rebond':
        beat.targets.push(ev.targetIid);
        break;
      case 'leaderAbility':
        beat.leaderActing = true;
        if (ev.targetIid) beat.targets.push(ev.targetIid);
        break;
      case 'leaderInvoke':
        beat.leaderActing = true;
        break;
      default:
        break;
    }
    return beat;
  });
}

/**
 * The CPU's blocking decision, as narration beats.
 *
 * `declareGuards` writes NOTHING to the engine log — it is pure state — so the
 * one CPU decision the player most needs to read before committing to a clash
 * was also the only one that arrived with no beat, no ring and no animation.
 * The lines simply existed the instant DECLARE ATTACK was clicked, and the
 * whole report was a `say()` line counting them ("Kuro assigns 2 guard
 * line(s)") that named neither the blocker nor the attacker it stopped. This
 * is the v18 clash-reaction fix applied to the step before it: one beat per
 * guard line, the blockers ringed yellow and the attacker they intercept
 * ringed red, then a closing beat for whatever is still coming through — with
 * the CPU's own Vitality plate ringed, since that is what the unblocked Might
 * is pointed at.
 *
 * Reads `state.clash.guards`, never the assignment the AI proposed: the caller
 * falls back to an empty assignment when the engine rejects the heuristic's
 * answer, and the narration has to describe what actually happened.
 */
export function buildGuardBeats(state: GameState, cpuLabel: string): CpuBeat[] {
  if (!state.clash) return [];
  const clash = state.clash;
  const beats: CpuBeat[] = [];
  const nameOf = (iid: string) => findUnit(state, iid)?.def.name ?? 'a unit';
  for (const attackerIid of clash.attackers) {
    const guards = clash.guards[attackerIid] ?? [];
    if (guards.length === 0) continue;
    beats.push({
      text: `${cpuLabel} guards ${nameOf(attackerIid)} with ${guards.map(nameOf).join(' + ')}.`,
      actors: [...guards],
      targets: [attackerIid],
    });
  }
  const unguarded = clash.attackers.filter((a) => (clash.guards[a] ?? []).length === 0);
  if (unguarded.length > 0) {
    const might = unguarded.reduce((sum, iid) => {
      const u = findUnit(state, iid);
      return sum + (u ? effMight(state, u) : 0);
    }, 0);
    beats.push({
      text:
        beats.length === 0
          ? `${cpuLabel} declines to guard — ${might} Might is coming straight through.`
          : `${cpuLabel} lets ${unguarded.map(nameOf).join(', ')} through — ${might} Might unguarded.`,
      actors: [],
      // The CPU's own Vitality plate: what the unblocked Might is aimed at,
      // and the reason this beat is worth a player's attention.
      targets: [CPU],
    });
  }
  return beats;
}

/**
 * The engine log speaks in seat ids ("P2 invokes…"); the narration bubble and
 * the battle log should speak in names. Verb agreement is fixed for the second
 * person ("You invoke", not "You invokes").
 *
 * Exported and pure so the verb table can be pinned by a test: a verb missing
 * from it falls through to the bare `\bP1\b` rule and prints third person
 * against a second-person subject, which is invisible in review and reads as
 * broken English in play.
 */
export function humanizeLog(s: string, cpuLabel: string): string {
  const out = s
    .replace(/\bP1's\b/g, 'your')
    .replace(/\bP2's\b/g, `${cpuLabel}'s`)
    .replace(
      /\bP1 (invokes|plays|attacks|sheds|mulligans|re-bonds|casts|must)\b/g,
      (_, v: string) => (v === 'must' ? 'You must' : `You ${v.slice(0, -1)}`),
    )
    .replace(/\bP1\b/g, 'you')
    .replace(/\bP2\b/g, cpuLabel);
  // "You cast X on themselves" — the reflexive has to follow the subject.
  const fixed = out.startsWith('You cast ') ? out.replace(/\bthemselves\b/, 'yourself') : out;
  // v22 — a COORDINATED second verb in the same clause. The table above fixes
  // the verb that follows the subject and nothing after it, and the engine has
  // exactly one line with two: "P1 must Deal from an empty deck and loses",
  // which came out as "You must Deal from an empty deck and loses". That is
  // the last sentence a player reads when they deck out, printed on the defeat
  // screen. The v18 suite listed the line but only asserted the absence of
  // `P1` and of a third-person FIRST verb, so it passed it straight through.
  const agreed = fixed.startsWith('You ') ? fixed.replace(/\band loses\b/, 'and lose') : fixed;
  return agreed.charAt(0).toUpperCase() + agreed.slice(1);
}

/**
 * The clash divider's three primary buttons, as pure label functions.
 *
 * The divider carries exactly one loud control at a time, and by v28 all three
 * of the ones that commit a clash print the arithmetic they are asking the
 * player to commit to. Pure and exported for the same reason `humanizeLog` is:
 * the sentence a player reads at the moment they take lethal is not something
 * a review catches, and every one of these has an off-by-one that reads fine
 * (`>` instead of `>=` prints LETHAL one point late — on the exact swing that
 * ends the game).
 */
export function guardConfirmLabel(incoming: number, myVitality: number, anyGuards: boolean) {
  if (incoming <= 0) return '🛡 CONFIRM GUARDS — NOTHING GETS THROUGH';
  const head = anyGuards ? 'CONFIRM GUARDS' : 'NO GUARDS';
  return `🛡 ${head} — TAKE ${incoming}${incoming >= myVitality ? ' · LETHAL' : ''}`;
}

/**
 * `atMe` distinguishes the two seats that press RESOLVE CLASH: the attacker,
 * for whom the number is damage DEALT, and the defender coming out of the
 * reaction window, for whom it is damage TAKEN. A label that said the same
 * thing to both would be wrong for one of them every single clash.
 */
export function resolveClashLabelFor(might: number, targetVitality: number, atMe: boolean) {
  if (might <= 0) return '💥 RESOLVE CLASH';
  const lethal = targetVitality > 0 && might >= targetVitality;
  return `💥 RESOLVE CLASH — ${atMe ? 'TAKE' : 'DEAL'} ${might}${lethal ? ' · LETHAL' : ''}`;
}

/** The opponent's last turn in numbers — see `turnRecap`. */
interface TurnRecap {
  vitalityLost: number;
  unitsLost: number;
  cardsPlayed: number;
  attacked: boolean;
  cardsDrawnByMe: number;
  /** Log lines the turn produced — the "read the whole thing" affordance. */
  lines: number;
}

/** A targeting/bonding choice in progress — resolved by clicking a
 * highlighted card (or Vitality plate). */
type Pending =
  | { kind: 'invoke'; cardIid: string; effect: Effect; bondTargetIid?: string }
  | { kind: 'bond'; cardIid: string }
  | { kind: 'leaderAbility'; idx: number; effect: Effect }
  | { kind: 'rebond'; itemIid: string };

/** The human's rulebook mulligan: shuffle the hand back and draw one card
 * FEWER (engine mulliganHand) — repeatable until the player keeps.
 * Module-level so the react-hooks immutability lint doesn't flag the
 * in-place engine-state mutation the whole match UI is built on. */
function mulliganRedraw(g: GameState): void {
  mulliganHand(g, HUMAN);
}

/** The clash-pause sentinel: thrown out of playTurn's guard callback so the
 * CPU's turn halts mid-clash with state.clash.step === 'guards', handing the
 * guard decision to the human (see resolveCpuTurn / cpuGuard stage). */
const CLASH_PAUSE: object = { clashPause: true };

/** The priority-pause sentinel: thrown out of playTurn's onOpponentPriority
 * hook so the CPU's turn halts with the human holding priority over whatever
 * the CPU just played (see resolveCpuTurn / respond stage). */
const PRIORITY_PAUSE: object = { priorityPause: true };

/** The dusk-pause sentinel: thrown out of the engine's chooseShed hook when
 * the human must pick shed cards mid-Dusk (after "At Dusk" triggers have
 * drawn). The UI opens the shed picker and resumes via finishDuskShed. */
const DUSK_PAUSE: object = { duskPause: true };

/** Backstop on response windows per CPU turn. Well above any real game (each
 * one costs the player a card), low enough that a resume loop that stops
 * making progress ends the turn instead of spinning the narration timer. */
const MAX_CPU_RESUMES = 40;

export function GameV4({
  humanDeck,
  cpuDeck,
  humanLabel,
  cpuLabel,
  playerName,
  seed,
  startVitality,
  onExit,
  onRematch,
  onResult,
  reward,
  rewardError,
  rewardPending,
}: {
  /** A prebuilt archetype's DeckDef, or a player's own saved deck resolved against the pool. */
  humanDeck: DeckDef;
  cpuDeck: DeckDef;
  humanLabel: string;
  cpuLabel: string;
  playerName: string;
  /** Fixed RNG seed — the offline harnesses (`board-preview`, the Playwright
   * match driver) pass one so a run is reproducible. Real matches omit it and
   * get a clock-derived seed. */
  seed?: number;
  /**
   * Opening Vitality override, for the offline harnesses only — real matches
   * never pass it.
   *
   * v26: the Playwright match driver clicks legal-but-random actions against a
   * CPU that plays properly, so across every match it has ever driven it has
   * lost every single one. The victory screen — its rewards block, its rematch
   * control, its result callback — had therefore never been rendered by the
   * harness whose job is to render every state of the match UI. Dropping the
   * CPU's opening Vitality lets a random clicker actually close a game out.
   */
  startVitality?: { human?: number; cpu?: number };
  onExit: () => void;
  /**
   * Start another match with the same setup, without going back out to the
   * menu (v22). Omitted by the offline harnesses, which have no shell to
   * remount them — the button is only rendered when a handler exists.
   */
  onRematch?: () => void;
  onResult?: (won: boolean) => void;
  /** Post-match rewards from recordMatchResult(), shown on the game-over
   * screen once the parent has recorded the result. */
  reward?: MatchResult | null;
  /** Set once the parent gives up retrying a failed recordMatchResult(). */
  rewardError?: string | null;
  /** True while the parent's recordMatchResult() call is still in flight. */
  rewardPending?: boolean;
}) {
  // The pre-picked shed (chosen before ending the turn) handed to the
  // engine's chooseShed hook; consumed on use. Declared before `g` so the
  // hook installed in its initializer can close over them.
  const prepickRef = useRef<string[] | null>(null);
  /** Seed for a re-opened (forced) picker when a Dusk draw invalidated the
   * pre-pick — keeps the player's earlier choices selected. */
  const duskSeedRef = useRef<string[]>([]);

  // The engine GameState is mutated in place by engine actions; it lives in
  // state via a lazy initializer (stable identity for the whole match) and a
  // version counter forces re-renders after each mutation.
  const [g] = useState<GameState>(() => {
    const rng = mulberry32(seed ?? Date.now() % 2147483647);
    const game = createGame(humanDeck, cpuDeck, POOL_BY_ID, {
      rng,
      // Coin-flip for the first turn. The human seat is fixed at P1, so
      // without this the player was permanently on the play every single
      // match — and the second-player compensation (the extra opening
      // Wellspring) would only ever have gone to the CPU.
      firstPlayer: rng() < 0.5 ? HUMAN : CPU,
    });
    // Give the CPU the same opening-hand judgment the playtest harness gives
    // it — the human's own mulligan stays a manual UI decision below.
    maybeMulliganPlayer(game, CPU, game.rng);
    // Harness-only opening Vitality override — see the `startVitality` prop.
    if (startVitality) {
      if (startVitality.human !== undefined)
        game.players[HUMAN].vitality = Math.max(1, Math.min(LEADER_HP, startVitality.human));
      if (startVitality.cpu !== undefined)
        game.players[CPU].vitality = Math.max(1, Math.min(LEADER_HP, startVitality.cpu));
    }
    // The human's Dusk shed choice must happen AFTER "At Dusk" triggers
    // resolve (they can draw), so the engine calls back here mid-Dusk. A
    // pre-pick made before ending the turn is honored when it still fits;
    // otherwise the hook throws DUSK_PAUSE and finishTurn opens the picker
    // on the post-trigger hand.
    game.chooseShed = (state, pid, count) => {
      if (pid !== HUMAN) return undefined; // CPU sheds from the end, as ever
      const pre = prepickRef.current;
      prepickRef.current = null;
      const hand = state.players[pid].hand;
      if (pre && pre.length === count && pre.every((iid) => hand.some((c) => c.iid === iid))) {
        return pre;
      }
      duskSeedRef.current = pre ?? [];
      throw DUSK_PAUSE;
    };
    return game;
  });

  const me = g.players[HUMAN];
  const foe = g.players[CPU];

  /**
   * The size the CPU mulliganed down to at setup, or null if it kept.
   *
   * Read once, from the state initializer's own log: `maybeMulliganPlayer` runs
   * inside the `useState` above, so this value is fixed for the match and the
   * hand it describes is long gone by the time anything else reads `foe.hand`.
   * The line it comes from ("P2 mulligans to 6.") is written before the player
   * can open the Battle Log and is buried by the first turn.
   */
  const [cpuMulliganTo] = useState<number | null>(() => {
    let to: number | null = null;
    for (const line of g.log) {
      const m = /^P2 mulligans to (\d+)\.$/.exec(line);
      if (m) to = Number(m[1]);
    }
    return to;
  });

  const [, setVersion] = useState(0);
  const bump = () => {
    recordDamageFloats();
    setVersion((v) => v + 1);
  };
  /** bump() for the compute-then-narrate CPU paths: damage/heal floats queue
   * for the narration ticker instead of firing on the final board render. */
  const bumpDeferringFloats = () => {
    recordDamageFloats(true);
    setVersion((v) => v + 1);
  };

  const [stage, setStage] = useState<Stage>('mulligan');
  const [mulliganCount, setMulliganCount] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  // Clash (attacking): the attacker iids toggled on before declaring.
  const [atkSel, setAtkSel] = useState<Set<string>>(new Set());
  // Clash (defending, stage 'cpuGuard'): guard assignment under construction.
  const [guardSel, setGuardSel] = useState<GuardAssignments>({});
  const [guardFocus, setGuardFocus] = useState<string | null>(null);
  // CPU-turn narration: one log line at a time, with the cards it involves.
  const [cpuBeat, setCpuBeat] = useState<{ text: string; idx: number; total: number } | null>(null);
  /** The beat currently on screen — its actors/targets get pulsing rings. */
  const [cpuFocus, setCpuFocus] = useState<CpuBeat | null>(null);
  /**
   * True while a narration run is on screen. Distinct from `stage === 'cpu'`:
   * the CPU also acts inside the human's OWN clash (its guard-step reaction
   * plays) and inside a response window, and those used to happen in total
   * silence — the board simply changed between one click and the next, with a
   * single summary banner after the fact. Narration is driven by this flag, so
   * those beats play out on the board like any other CPU action.
   */
  const [narrating, setNarrating] = useState(false);
  // Narration speed (persisted). The ref mirrors the state for the timer
  // chain — a running chain of setTimeout closures would otherwise keep the
  // speed captured when it started.
  const [cpuSpeedIdx, setCpuSpeedIdx] = useState<number>(loadCpuSpeed);
  const cpuSpeedRef = useRef(cpuSpeedIdx);
  // Hand order (persisted). Presentation only — see HAND_SORTS.
  const [handSort, setHandSort] = useState<HandSort>(loadHandSort);
  const cycleHandSort = () => {
    setHandSort((cur) => {
      const next = HAND_SORTS[(HAND_SORTS.findIndex((s) => s.id === cur) + 1) % HAND_SORTS.length];
      saveHandSort(next.id);
      return next.id;
    });
  };
  const cycleCpuSpeed = () => {
    setCpuSpeedIdx((i) => {
      const next = (i + 1) % CPU_SPEEDS.length;
      cpuSpeedRef.current = next;
      saveCpuSpeed(next);
      return next;
    });
  };
  /** How long the beat at `i` stays up. A beat that spotlights a card face
   * (or declares an attack) holds longer — there is more to take in than a
   * line of text, and "I could not tell what it played" is the complaint
   * these beats exist to answer.
   *
   * v22 adds a second reason to hold: the beat is pointed at something of
   * MINE. A CPU turn is mostly the CPU improving its own board, and those
   * beats can go by at the base pace — but the two or three where a unit of
   * the player's is frozen, weakened, shattered or hit are the ones they have
   * to actually locate on the board before the ring leaves, and they were
   * getting exactly the same 1150ms as "Kuro plays a Tide Wellspring". */
  const beatMs = (beat?: CpuBeat) => {
    // v28 — a beat holding up a destroyed unit is a spotlight beat too. It
    // shows a card face and it is about something of somebody's dying; both
    // halves of this multiplier's justification apply.
    const spotlit = beat?.cardId || beat?.attacking || beat?.lost?.length ? 1.45 : 1;
    // iidOwnerRef, not just me.field: a unit of mine that DIED during the
    // turn is gone from the field by narration time — and its beat is exactly
    // the one that most needs the longer dwell.
    const aimedAtMe = beat?.targets.some(
      (t) =>
        t === HUMAN || me.field.some((u) => u.iid === t) || iidOwnerRef.current.get(t) === HUMAN,
    )
      ? 1.4
      : 1;
    return CPU_PACE.BEAT_MS * CPU_SPEEDS[cpuSpeedRef.current].mult * Math.max(spotlit, aimedAtMe);
  };
  const [showAsh, setShowAsh] = useState<false | 'me' | 'foe'>(false);
  /** Dusk shed picker: null = closed; array = card iids chosen to shed. */
  const [shedPick, setShedPick] = useState<string[] | null>(null);
  /** True when the picker opened MID-Dusk (an "At Dusk" trigger drew past the
   * hand limit): the turn is already ending, so there's no BACK — confirming
   * resumes the paused Dusk via finishDuskShed. */
  const [shedForced, setShedForced] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    text: string;
    onConfirm: () => void;
  } | null>(null);
  const [inspect, setInspect] = useState<CardDef | null>(null);
  /** The transient `say()` banner. `tone` separates a status line ("Guards
   * set…", yellow) from a refusal ("Not enough essence…", red + shake) so an
   * invalid action is legible as one at a glance, not only after reading. */
  const [banner, setBanner] = useState<{ text: string; tone: 'info' | 'warn' } | null>(null);
  const [logExpanded, setLogExpanded] = useState(false);
  const logScrollRef = useRef<HTMLDivElement>(null);
  /**
   * Absolute log index where the opponent's most recent turn begins — stamped
   * the moment the human hands the turn over. Renders a divider in the Battle
   * Log so "what did it do while I was not driving" is one glance rather than
   * a hunt through undifferentiated lines. `-1` until the first handoff.
   */
  const [handoffAt, setHandoffAt] = useState(-1);
  /**
   * What the opponent did last turn, in numbers, shown until the player
   * dismisses it (v26).
   *
   * The narration answers "what is the opponent doing" beautifully while it is
   * running and then takes the whole answer off the screen with it. Two very
   * ordinary things leave a player with no answer at all: pressing SKIP ▸▸ —
   * which is a button the board offers, on every turn — and looking away.
   * After either one the board has simply changed, and the only record is 160
   * lines of Battle Log behind a toggle. This is the receipt.
   */
  const [turnRecap, setTurnRecap] = useState<TurnRecap | null>(null);
  /** Board state as the opponent's turn began — the other half of the recap. */
  const cpuTurnSnapshotRef = useRef<{
    vitality: number;
    fieldIids: string[];
    hand: number;
    logAt: number;
  } | null>(null);
  // Hand preview: the hand card currently enlarged above the bottom dock.
  const [preview, setPreview] = useState<string | null>(null);
  const [previewPinned, setPreviewPinned] = useState(false);
  // Combat feedback: floating damage numbers + attack flashes + phase banner.
  // v7.4: the hand fan lays out in fixed pixels, so it needs the real viewport
  // width to know how hard to overlap the cards (see fanOverlap).
  const [viewportW, setViewportW] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );
  const [floats, setFloats] = useState<DmgFloat[]>([]);
  const [phaseFx, setPhaseFx] = useState<string | null>(null);
  const [flashIids, setFlashIids] = useState<Set<string>>(new Set());
  const damageMemoRef = useRef<Map<string, number>>(new Map());
  const floatIdRef = useRef(0);
  /** Floats queued by bumpDeferringFloats, waiting for their narration beat. */
  const pendingFloatsRef = useRef<DmgFloat[]>([]);
  /** Owner of every unit iid ever fielded — survives the unit's death. */
  const iidOwnerRef = useRef<Map<string, PlayerId>>(new Map());
  const resultSent = useRef(false);
  const cpuTimeoutRef = useRef<number | null>(null);
  // Separate from cpuTimeoutRef (which paces the beat-by-beat narration):
  // this is the initial "thinking" delay before the CPU's turn is even
  // computed. Kept distinct so SKIP during that delay can fast-forward into
  // resolveCpuTurn instead of just cancelling it outright (see skipCpuBeats).
  const cpuThinkTimeoutRef = useRef<number | null>(null);
  /** One-shot: SKIP was pressed during the "thinking" delay, so the next
   * narration run starts already fast-forwarded (see skipCpuBeats). */
  const skipNextNarrationRef = useRef(false);
  const bannerTimeoutRef = useRef<number | null>(null);
  const phaseTimeoutRef = useRef<number | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const floatTimeoutsRef = useRef<Set<number>>(new Set());
  const cpuBeatsRef = useRef<CpuBeat[]>([]);
  const cpuBeatIdxRef = useRef(0);
  const cpuDoneRef = useRef<(() => void) | null>(null);
  /** Mirrors `narrating` for the timer chain and for `toggleCpuPause`, which
   * both run outside the render that owns the state value. */
  const narratingRef = useRef(false);
  /** ❚❚ — hold the narration on the beat currently on screen (see
   * `toggleCpuPause`). Mirrored into a ref for the same reason. */
  const [cpuPaused, setCpuPaused] = useState(false);
  const cpuPausedRef = useRef(false);
  /** What to do once the human's response window closes. Set whenever the
   * 'respond' stage is entered — the window can open from the player's own
   * turn (resume play) or from a paused CPU turn (resume the CPU). */
  const respondResumeRef = useRef<(() => void) | null>(null);
  /** Response windows opened during the current CPU turn (loop backstop). */
  const cpuResumeCountRef = useRef(0);

  const humanize = (s: string) => humanizeLog(s, cpuLabel);

  const say = (msg: string, tone: 'info' | 'warn' = 'info') => {
    setBanner({ text: msg, tone });
    if (bannerTimeoutRef.current !== null) window.clearTimeout(bannerTimeoutRef.current);
    // Longer sentences hold longer: the fixed 2200ms was tuned for "Clash
    // resolves!" and clipped the ~120-character refusal explanations mid-read.
    const holdMs = Math.min(5200, 2200 + Math.max(0, msg.length - 40) * 30);
    bannerTimeoutRef.current = window.setTimeout(() => {
      setBanner((b) => (b?.text === msg ? null : b));
      bannerTimeoutRef.current = null;
    }, holdMs);
  };
  /** `say()` for refusals — red banner with a shake instead of status yellow. */
  const refuse = (msg: string) => say(msg, 'warn');

  useEffect(
    () => () => {
      if (cpuTimeoutRef.current !== null) window.clearTimeout(cpuTimeoutRef.current);
      if (cpuThinkTimeoutRef.current !== null) window.clearTimeout(cpuThinkTimeoutRef.current);
      if (bannerTimeoutRef.current !== null) window.clearTimeout(bannerTimeoutRef.current);
      if (phaseTimeoutRef.current !== null) window.clearTimeout(phaseTimeoutRef.current);
      if (flashTimeoutRef.current !== null) window.clearTimeout(flashTimeoutRef.current);
      for (const id of floatTimeoutsRef.current) window.clearTimeout(id);
      floatTimeoutsRef.current.clear();
    },
    [],
  );

  /** Show a batch of damage/heal floats and schedule their removal. */
  function spawnFloats(fresh: DmgFloat[]) {
    if (fresh.length === 0) return;
    setFloats((f) => [...f, ...fresh]);
    const ids = new Set(fresh.map((f) => f.id));
    const timeoutId = window.setTimeout(
      () => {
        floatTimeoutsRef.current.delete(timeoutId);
        setFloats((f) => f.filter((x) => !ids.has(x.id)));
      },
      fxUnmountMs(FX_MS.float, cpuSpeedRef.current),
    );
    floatTimeoutsRef.current.add(timeoutId);
  }

  /** Diff every unit's marked damage and both players' Vitality against the
   * last bump, floating "-N"/"+N" over whatever changed.
   *
   * `defer` (v24): the compute-then-narrate CPU paths render the FINAL board
   * first and replay the beats after — so every float used to fire during the
   * "thinking" bubble and was gone seconds before the beat describing the hit
   * arrived. Deferred floats queue instead, and the narration ticker releases
   * each one when a beat involving its unit/player is on screen (leftovers
   * flush when the run ends). */
  function recordDamageFloats(defer = false) {
    const seen = new Map<string, number>();
    const fresh: DmgFloat[] = [];
    for (const pid of ['P1', 'P2'] as PlayerId[]) {
      const p = g.players[pid];
      for (const u of p.field) {
        // Every iid ever seen on a field, by owner — beatMs uses it to give
        // "aimed at me" dwell time to beats about units that DIED this turn
        // (they're no longer in me.field by narration time).
        iidOwnerRef.current.set(u.iid, pid);
        seen.set(u.iid, u.damage);
        const prev = damageMemoRef.current.get(u.iid);
        if (prev !== undefined && u.damage > prev) {
          fresh.push({
            id: ++floatIdRef.current,
            iid: u.iid,
            amount: u.damage - prev,
            kind: 'dmg',
          });
        } else if (prev !== undefined && u.damage < prev) {
          fresh.push({
            id: ++floatIdRef.current,
            iid: u.iid,
            amount: prev - u.damage,
            kind: 'heal',
          });
        }
      }
      const vitKey = `vit:${pid}`;
      seen.set(vitKey, p.vitality);
      const prevVit = damageMemoRef.current.get(vitKey);
      if (prevVit !== undefined && p.vitality < prevVit) {
        fresh.push({
          id: ++floatIdRef.current,
          iid: vitKey,
          amount: prevVit - p.vitality,
          kind: 'dmg',
        });
      } else if (prevVit !== undefined && p.vitality > prevVit) {
        fresh.push({
          id: ++floatIdRef.current,
          iid: vitKey,
          amount: p.vitality - prevVit,
          kind: 'heal',
        });
      }
    }
    damageMemoRef.current = seen;
    if (defer) pendingFloatsRef.current.push(...fresh);
    else spawnFloats(fresh);
  }
  const floatsFor = (iid: string) => floats.filter((f) => f.iid === iid);

  /** Release queued floats whose unit/player a narration beat is pointing at
   * (beat targets use unit iids and player ids; vitality floats key
   * 'vit:P1'/'vit:P2'). Pass no beat to flush everything. */
  const releaseFloatsFor = (beat?: CpuBeat) => {
    if (pendingFloatsRef.current.length === 0) return;
    let release: DmgFloat[];
    if (!beat) {
      release = pendingFloatsRef.current;
      pendingFloatsRef.current = [];
    } else {
      const ids = new Set([...beat.targets, ...beat.actors]);
      release = pendingFloatsRef.current.filter(
        (f) => ids.has(f.iid) || (f.iid.startsWith('vit:') && ids.has(f.iid.slice(4))),
      );
      if (release.length === 0) return;
      const gone = new Set(release.map((f) => f.id));
      pendingFloatsRef.current = pendingFloatsRef.current.filter((f) => !gone.has(f.id));
    }
    spawnFloats(release);
  };

  /** Big center-screen phase banner (MAIN I / CLASH / …). */
  const flashPhase = (label: string) => {
    setPhaseFx(label);
    if (phaseTimeoutRef.current !== null) window.clearTimeout(phaseTimeoutRef.current);
    phaseTimeoutRef.current = window.setTimeout(
      () => {
        setPhaseFx(null);
        phaseTimeoutRef.current = null;
      },
      fxUnmountMs(FX_MS.banner, cpuSpeedRef.current),
    );
  };

  /** Brief brightness flash on a set of clash participants. */
  const flashUnits = (iids: string[]) => {
    setFlashIids(new Set(iids));
    if (flashTimeoutRef.current !== null) window.clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = window.setTimeout(
      () => {
        setFlashIids(new Set());
        flashTimeoutRef.current = null;
      },
      fxUnmountMs(FX_MS.unitFlash, cpuSpeedRef.current),
    );
  };

  // Hand-preview hover intent (rest ~80ms before switching).
  const hoverIntentRef = useRef<number | null>(null);
  const clearHoverIntent = () => {
    if (hoverIntentRef.current !== null) {
      window.clearTimeout(hoverIntentRef.current);
      hoverIntentRef.current = null;
    }
  };
  const previewIntent = (iid: string) => {
    clearHoverIntent();
    hoverIntentRef.current = window.setTimeout(() => {
      hoverIntentRef.current = null;
      setPreview(iid);
    }, 80);
  };
  useEffect(() => clearHoverIntent, []);
  const closePreview = () => {
    clearHoverIntent();
    setPreview(null);
    setPreviewPinned(false);
  };

  const checkWinner = (): boolean => {
    if (g.winner) {
      bump();
      setStage('over');
      return true;
    }
    return false;
  };

  // ---- mulligan (human; the CPU's ran at setup) ---------------------------
  const doMulligan = () => {
    mulliganRedraw(g);
    setMulliganCount((n) => n + 1);
    bump();
  };

  const afterMulligan = () => {
    // createGame already ran the first player's Dawn — the match opens in
    // that player's Main I. The coin flip can hand the opening turn to the
    // CPU, in which case its turn must actually run instead of leaving the
    // human parked in the CPU's Main I.
    damageMemoRef.current = new Map();
    recordDamageFloats(); // seed the memo without floats (first pass)
    setFloats([]);
    if (g.active === CPU) {
      runCpuTurn();
      return;
    }
    setStage('play');
    flashPhase('MAIN I');
  };

  // Report the result once.
  useEffect(() => {
    if (stage === 'over' && g.winner && !resultSent.current) {
      resultSent.current = true;
      onResult?.(g.winner === HUMAN);
    }
  }, [stage, g.winner, onResult]);

  // Conceding is a resignation, not a free way to dodge a loss on the record.
  const concede = () => {
    if (stage !== 'over' && !resultSent.current) {
      resultSent.current = true;
      onResult?.(false);
    }
    onExit();
  };

  // Escape closes whatever overlay is frontmost / cancels a pending pick.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmDialog) setConfirmDialog(null);
      else if (inspect) setInspect(null);
      else if (preview) {
        setPreview(null);
        setPreviewPinned(false);
      } else if (pending) setPending(null);
      else if (showAsh) setShowAsh(false);
      else if (shedPick !== null) {
        // Same as the picker's ✕ BACK: clear a partial selection first, then
        // a second Escape closes the picker entirely — unless the picker is
        // a mid-Dusk resume (shedForced), which has no way back.
        if (shedPick.length > 0) setShedPick([]);
        else if (!shedForced) setShedPick(null);
      } else if (logExpanded) setLogExpanded(false);
      else if (atkSel.size > 0) setAtkSel(new Set());
      // Symmetric with attacker selection: Escape clears an in-progress
      // guard assignment too (previously the only way to undo a guard was
      // re-clicking each unit).
      else if (Object.keys(guardSel).length > 0) setGuardSel({});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    confirmDialog,
    inspect,
    preview,
    pending,
    showAsh,
    atkSel,
    shedPick,
    shedForced,
    logExpanded,
    guardSel,
  ]);

  /**
   * Space (or Enter) presses whatever the clash divider is currently offering.
   *
   * The divider renders exactly ONE primary action at a time by construction —
   * DECLARE ATTACK, RESOLVE CLASH, CONFIRM GUARDS, PASS, the phase button,
   * SKIP — which is the whole reason it exists. On a desktop that still meant
   * moving the pointer to the middle of the board and back for every single
   * phase of every single turn: a 20-turn match is ~80 round trips to the same
   * spot. Escape has cancelled things since v17; nothing ever CONFIRMED.
   *
   * Dispatched as a real click on the rendered button rather than by calling
   * the handler, so a disabled primary (CONFIRM GUARDS with an illegal
   * assignment) refuses the key exactly as it refuses the pointer, and there is
   * no second copy of the branch logic to drift out of step with the render.
   *
   * Deliberately inert while a modal owns the screen (mulligan, shed picker,
   * confirm dialog, inspector, game over) and while a target pick is open —
   * Space there means "the thing in front of me", and the thing in front of
   * them is not the divider. Also inert when the key would double-fire a
   * focused control: a keyboard user who has tabbed to a button already gets
   * Space from the browser.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (stage === 'over' || stage === 'mulligan') return;
      if (confirmDialog || inspect || pending || showAsh || shedPick !== null) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === 'BUTTON' ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el?.isContentEditable ||
        el?.getAttribute('role') === 'button'
      ) {
        return;
      }
      const primary = document.querySelector<HTMLButtonElement>('button[data-primary="1"]');
      if (!primary || primary.disabled) return;
      e.preventDefault();
      primary.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, confirmDialog, inspect, pending, showAsh, shedPick]);

  // The Battle Log renders oldest-first and is only ~5 lines tall, so it used
  // to open scrolled to the TOP of the last 160 lines — i.e. on the oldest
  // history it holds. Every player opening it wants the newest line, which is
  // the one they just missed; pin it to the bottom on open and on every line
  // that arrives while it is open.
  useEffect(() => {
    if (!logExpanded) return;
    const el = logScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logExpanded, g.log.length]);

  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // ---- essence & invoking -------------------------------------------------
  const inMyMain =
    stage === 'play' &&
    g.active === HUMAN &&
    (g.phase === 'Main1' || g.phase === 'Main2') &&
    !g.clash;
  /** The human's reaction window: guarding step resolved, damage not yet.
   * Rulebook §5: the window belongs to EITHER player — you can respond with
   * Quick Events / Ambush units in your own Clash too, before resolving. */
  const inMyReaction = g.clash?.step === 'reaction';
  /** A response window (rulebook §6): something is on the stack and priority
   * is ours, so instant-speed cards — and the Locations to pay for them —
   * are live even on the opponent's turn. */
  const inMyResponse = stage === 'respond' && hasPriority(g, HUMAN);
  // A narration run is the opponent acting: the reaction beats inside the
  // human's OWN clash leave `inMyReaction` true underneath them, so without
  // this the player could tap Locations and fire Quick Events into the middle
  // of a replay of moves they have not finished being shown.
  const canTapNow = (inMyMain || inMyReaction || inMyResponse) && !narrating;

  /** Why can't this hand card be invoked right now? (undefined = it can) */
  const invokeWhy = (c: { def: CardDef }): string | undefined => {
    const def = c.def;
    if (narrating) return `${cpuLabel} is acting — SKIP ▸▸ to catch up`;
    // v20: a target/bond pick is already open. Invoking from the hand while
    // one is in progress silently REPLACED it — the red PICK A TARGET bar
    // stayed up, the rings moved to a different card's legal targets, and
    // nothing said the first card had been put back. The board is in a modal
    // state; say so and let ✕ / Esc out of it.
    if (pending) return 'Finish the current pick first (✕ or Esc to cancel it)';
    const quick = def.type === 'Event' && def.subtype === 'Quick';
    const ambush = def.type === 'Unit' && hasKw(def, 'Ambush');
    if (!inMyMain) {
      if (inMyReaction || inMyResponse) {
        if (!quick && !ambush) return 'Only Quick Events / Ambush units can respond';
      } else if (stage === 'cpuGuard' && g.clash && g.clash.step === 'guards') {
        // The old fall-through said "invoke during your own main phases" —
        // wrong on both halves here: it's the player's own clash, and a
        // reaction window is one confirm away.
        return 'Assign guards first — the reaction window opens after you confirm';
      } else {
        return 'Invoke during your own main phases';
      }
    } else if (g.stack.length > 0 && !quick && !ambush) {
      return 'Something is still on the stack — only Quick Events / Ambush units';
    }
    if (!canAfford(me, effectiveCost(g, HUMAN, def))) {
      // Say WHICH pip is short when the problem is color, not quantity.
      const pool = potentialEssence(me);
      const missing = (Object.entries(def.cost?.pips ?? {}) as [EssenceType, number][])
        .filter(([t, n]) => (pool[t] ?? 0) < (n ?? 0))
        .map(([t]) => t);
      return missing.length > 0
        ? `Needs ${missing.join(' + ')} essence your Locations can't produce yet`
        : 'Not enough essence (even tapping every Location)';
    }
    if (def.type === 'Item' && me.field.length === 0 && itemSurvives(def.subtype)) {
      return 'Needs a friendly unit to bond to';
    }
    // v22 — the refusal `tryInvoke` was already making, moved to where the
    // button reads its `disabled` from.
    //
    // A targeted Event with no legal target is not cast: `tryInvoke` says "no
    // legal target for its effect — invoking now would waste the card" and
    // returns, which is the right call (the cost and the card are spent for an
    // effect that resolves into nothing). But `invokeWhy` never knew about it,
    // so the INVOKE button stayed live, the preview kept quoting a cost, and
    // clicking it produced a banner and no move. The match driver found it the
    // way it finds every control that is offered and then refused: it pressed
    // INVOKE, the board did not change, and it pressed it again for the rest of
    // the match (seed 312). Units and Items are deliberately NOT covered —
    // they keep their body and bond value and only lose the rider.
    if (def.type === 'Event' && needsTarget(def.onInvoke)) {
      if (targetsFor(g, HUMAN, def.onInvoke!).length === 0) {
        return 'No legal target — invoking now would waste the card';
      }
    }
    return undefined;
  };

  /**
   * The hand in display order.
   *
   * Presentation only: `me.hand` — the array every engine call indexes into
   * and the Dusk shed picker lists from — is left exactly as the engine keeps
   * it. Sorting is deliberately STABLE inside each group so a re-sort of an
   * unchanged hand does not reshuffle cards under the player's pointer.
   *
   * Deliberately NOT memoized. The engine state is one long-lived mutable
   * object re-rendered through `bump()`'s version counter — `g` and `g.hand`
   * keep their identity across every move — so a dependency array would pin
   * this to the first render and PLAYABLE would never notice an essence tap.
   * Ten cards is a free sort; a stale hand order is not.
   */
  const handView = ((): typeof me.hand => {
    if (handSort === 'drawn') return me.hand;
    const cards = me.hand.map((c, i) => ({ c, i }));
    const key =
      handSort === 'cost'
        ? (x: (typeof cards)[number]) => totalCost(effectiveCost(g, HUMAN, x.c.def))
        : (x: (typeof cards)[number]) => (invokeWhy(x.c) ? 1 : 0);
    return cards.sort((a, b) => key(a) - key(b) || a.i - b.i).map((x) => x.c);
  })();

  /** The current hand-order mode's label/blurb, for the dock's toggle. */
  const handSortEntry = HAND_SORTS.find((x) => x.id === handSort) ?? HAND_SORTS[0];

  /**
   * Run the CPU's priority window over whatever is on the stack, NARRATED.
   *
   * v18 gave the CPU's clash reactions beats and v19 gave its guard step beats.
   * This was the last place it still acted in total silence, and the most
   * confusing one: the player invokes a card, and between that click and the
   * next frame the CPU can counter it, shatter the unit it was aimed at, or
   * answer with a Quick Event of its own. All of that arrived as a single
   * banner ("the CPU responds") over a board that had already changed — no
   * beat, no ring, no card spotlight, and the stack display gone by the time
   * anyone looked at it.
   *
   * `respondToStack` has taken an observer since the AI was written; the UI
   * simply threw the events away. Same contract as `runCpuClashReactions`:
   * stamp `logAt` ourselves (there is no `playTurn` wrapper doing it here),
   * then hand the lines and events to `narrate` and continue in its `onDone`.
   */
  const narrateCpuStackAnswer = (onDone: (cpuPlays: number) => void) => {
    const logStart = g.log.length;
    const events: CpuTurnEvent[] = [];
    let plays = 0;
    let guard = 8;
    // Loop, not a single call: the human's answer can hand priority back and
    // forth, and settleStack halts whenever the CPU holds it.
    while (!g.winner && hasPriority(g, CPU) && guard-- > 0) {
      plays += respondToStack(g, CPU, (ev) => {
        ev.logAt = g.log.length;
        events.push(ev);
      });
    }
    // Deferred like the other compute-then-narrate paths — floats land on
    // their beats; with nothing narrated (plays 0) nothing was deferred worth
    // holding and the next ticker/turn boundary flushes leftovers anyway.
    if (plays > 0) bumpDeferringFloats();
    else bump();
    if (checkWinner()) return;
    // `plays` is handed to the continuation rather than returned: with nothing
    // to narrate the continuation runs SYNCHRONOUSLY, so a caller closing over
    // this function's own return value would read it before it exists.
    if (plays > 0) {
      const beats = buildCpuBeats(
        g.log.slice(logStart).map((l) => humanize(l)),
        logStart,
        events,
        g,
      );
      // The same "thinking" opener every other CPU segment gets (v20 gave it
      // to the guard step): without it the CPU's answer to the player's card
      // arrived on the very next frame after their own click, reading as part
      // of the click rather than as the opponent's reply to it.
      beats.unshift({ text: `🤔 ${cpuLabel} considers a response…`, actors: [], targets: [] });
      narrateBeats(beats, () => onDone(plays));
    } else onDone(plays);
  };

  /** Actually invoke a hand card (auto-taps Locations for its cost). */
  const doInvoke = (cardIid: string, opts: { targetIid?: string; bondTargetIid?: string }) => {
    const card = me.hand.find((c) => c.iid === cardIid);
    if (!card) return;
    autoTapFor(g, HUMAN, effectiveCost(g, HUMAN, card.def));
    const respondingAlready = stage === 'respond';
    // Captured before the narration starts: `stage` is read in the
    // continuation, which runs a second or two later.
    const resumeStage = stage;
    if (invokeCard(g, HUMAN, cardIid, opts)) {
      say(`${card.def.name} invoked.`);
      // The card is on the stack, not resolved: the CPU gets its priority
      // window to answer before it takes effect — beat by beat, like every
      // other thing it does.
      narrateCpuStackAnswer(() => {
        if (checkWinner()) return;
        if (respondingAlready) {
          // Playing INTO an open window: it stays open only while priority is
          // still ours, and closing it resumes whatever was paused.
          afterResponseAction();
        } else if (hasPriority(g, HUMAN)) {
          // The CPU answered and handed priority back — counter it or pass.
          // Resume to the stage this window opened FROM: invoking in the
          // CPU-clash reaction window (stage 'cpuGuard') must come back to
          // 'cpuGuard', not 'play' — resuming to 'play' mid-CPU-clash showed
          // the human's RESOLVE CLASH, which never runs continueCpuAfterClash
          // and abandoned the rest of the CPU's turn.
          openResponseWindow(() => setStage(resumeStage));
        }
      });
    } else {
      bump(); // taps may have happened
      refuse("Can't invoke that right now.");
      checkWinner();
    }
  };

  /** Click a hand card's INVOKE button: route through bond/target picking. */
  const tryInvoke = (cardIid: string) => {
    const card = me.hand.find((c) => c.iid === cardIid);
    if (!card) return;
    const why = invokeWhy(card);
    if (why) {
      refuse(why);
      return;
    }
    closePreview();
    if (card.def.type === 'Item') {
      // v13: a Charm can also be cast on YOU, for Vitality. With no unit on
      // the field that is the only line, so take it without a pick; with one,
      // your own Vitality plate joins the highlighted targets.
      const selfOk = !itemSurvives(card.def.subtype);
      if (selfOk && me.field.length === 0) {
        doInvoke(cardIid, { bondTargetIid: BOND_TARGET_SELF });
        return;
      }
      setPending({ kind: 'bond', cardIid });
      say(
        selfOk
          ? 'Pick a friendly unit to bond the Charm to — or your own Vitality to cast it on yourself.'
          : 'Pick a friendly unit to bond the Item to.',
      );
      return;
    }
    if (needsTarget(card.def.onInvoke)) {
      const targets = targetsFor(g, HUMAN, card.def.onInvoke!);
      if (targets.length > 0) {
        setPending({ kind: 'invoke', cardIid, effect: card.def.onInvoke! });
        say('Pick a highlighted target.');
        return;
      }
      // No legal target and the card is a pure Event: don't let it
      // fizzle-waste itself (the effect resolves into nothing while the
      // cost and card are still spent). Units/Items keep their body/bond
      // value, so they stay playable and just lose the rider.
      if (card.def.type === 'Event') {
        refuse('No legal target for its effect — invoking now would waste the card.');
        return;
      }
    }
    doInvoke(cardIid, {});
  };

  /** Wellsprings the player may still place this turn (2 on the opening turn
   * when on the draw — see engine `wellspringAllowance`). */
  const wellspringsLeft = Math.max(0, wellspringAllowance(g, HUMAN) - me.wellspringsPlayedThisTurn);

  /**
   * Why can't a Wellspring be played right now? (undefined = it can)
   *
   * v22. This is the gate every other action on the board has had for passes —
   * `invokeWhy`, `leaderInvokeWhy`, `abilityWhy` — and the Wellspring row was
   * the one control still rendered on a bare `inMyMain`. The engine's
   * `playWellspring` gates on `inOwnMainClear`, which is `inOwnMain` **AND an
   * empty stack**, and the UI's `inMyMain` has no stack clause: with something
   * waiting to resolve, the dots stayed live, coloured and clickable, and the
   * click was answered with "One Wellspring per turn, in your own main phase"
   * — a sentence that is wrong about both halves of why it failed. The match
   * driver found it by pressing the dot forever.
   *
   * `inMyMain` itself is deliberately NOT changed to match: `invokeWhy` reads
   * it and already handles a non-empty stack with a better message of its own
   * ("only Quick Events / Ambush units"), which folding the clause in would
   * replace with the much worse "invoke during your own main phases".
   */
  const wellspringWhy = ((): string | undefined => {
    // Narration leaves `inMyMain` true underneath it (the CPU's stack answer
    // plays out while stage is still 'play'), so without this clause the dots
    // were live in the middle of the opponent's replay — the same hole
    // `canTapNow` closed for Locations.
    if (narrating) return `${cpuLabel} is acting — SKIP ▸▸ to catch up`;
    if (!inMyMain) return 'Play a Wellspring in your own main phase';
    if (wellspringsLeft <= 0)
      return wellspringAllowance(g, HUMAN) > 1
        ? "Both of this turn's Wellsprings are already down"
        : 'One Wellspring per turn';
    if (g.stack.length > 0) {
      const top = g.stack[g.stack.length - 1];
      return `${top ? top.sourceName : 'Something'} is still on the stack — let it resolve first`;
    }
    return undefined;
  })();

  const tryWellspring = (type: EssenceType) => {
    if (wellspringWhy) {
      refuse(wellspringWhy);
      return;
    }
    if (playWellspring(g, HUMAN, type)) {
      bump();
      say(`${type} Wellspring enters your Location row.`);
    } else refuse('One Wellspring per turn, in your own main phase.');
  };

  const tryTapLocation = (loc: LocationInst) => {
    if (tapLocationForEssence(g, HUMAN, loc.iid)) bump();
    else refuse('Essence comes in your main phases (or your reaction window).');
  };

  const leaderInvokeWhy = ((): string | undefined => {
    const L = me.leader;
    if (L.invoked) return 'Your Leader is already on the field';
    if (L.shattered) return 'Your Leader is shattered';
    if (narrating) return `${cpuLabel} is acting — SKIP ▸▸ to catch up`;
    if (!inMyMain) return 'Invoke your Leader during your own main phases';
    // The engine's gate is `inOwnMainClear` — main phase AND an empty stack
    // (v22 closed exactly this seam for the Wellspring dots). Without the
    // clause the button stayed enabled, and the click auto-tapped Locations
    // for a cost the engine was always going to refuse.
    if (g.stack.length > 0) {
      const top = g.stack[g.stack.length - 1];
      return `${top ? top.sourceName : 'Something'} is still on the stack — let it resolve first`;
    }
    if (!canAfford(me, L.def.cost)) return 'Not enough essence (even tapping every Location)';
    return undefined;
  })();

  const tryInvokeLeader = () => {
    if (leaderInvokeWhy) {
      refuse(leaderInvokeWhy);
      return;
    }
    autoTapFor(g, HUMAN, me.leader.def.cost);
    if (canInvokeLeader(g, HUMAN) && invokeLeader(g, HUMAN)) {
      bump();
      say(`${me.leader.def.name} takes the field.`);
    } else {
      // Unreachable now that `leaderInvokeWhy` mirrors the engine gate, but if
      // it ever fires the auto-tap above exhausted Locations — re-render so
      // the board doesn't show them untapped.
      bump();
      refuse("Can't invoke your Leader right now.");
    }
  };

  const abilityWhy = (idx: number): string | undefined =>
    narrating
      ? `${cpuLabel} is acting — SKIP ▸▸ to catch up`
      : leaderAbilityWhy(g, HUMAN, idx, inMyMain);

  const tryLeaderAbility = (idx: number) => {
    const why = abilityWhy(idx);
    if (why) {
      refuse(why);
      return;
    }
    const ab = me.leader.def.leaderAbilities![idx];
    if (needsTarget(ab.effect) && targetsFor(g, HUMAN, ab.effect).length > 0) {
      setPending({ kind: 'leaderAbility', idx, effect: ab.effect });
      say('Pick a highlighted target.');
      return;
    }
    if (activateLeaderAbility(g, HUMAN, idx)) {
      bump();
      say('Leader ability resolves.');
    } else refuse('Illegal.');
    checkWinner();
  };

  /** Why can't this loose Item be re-bonded right now? (undefined = it can.)
   * Mirrors `rebondItem`'s own gate (`inOwnMainClear` — main phase AND empty
   * stack); the 💠 button reads its `disabled` from this, so it can't offer a
   * pick the engine will refuse at the end of it. */
  const rebondWhy = (itemIid: string): string | undefined => {
    if (narrating) return `${cpuLabel} is acting — SKIP ▸▸ to catch up`;
    if (!inMyMain) return 'Re-bond during your own main phases';
    if (g.stack.length > 0) {
      const top = g.stack[g.stack.length - 1];
      return `${top ? top.sourceName : 'Something'} is still on the stack — let it resolve first`;
    }
    const item = me.unbondedItems.find((c) => c.iid === itemIid);
    if (!item) return 'That Item is no longer loose';
    if (me.field.length === 0) return 'No friendly unit to re-bond to';
    const cost: EssenceCost = { generic: item.def.rebondCost ?? 0, pips: {} };
    if (!canAfford(me, cost)) return `Re-bond costs ${cost.generic} essence`;
    return undefined;
  };

  const tryRebond = (itemIid: string) => {
    const why = rebondWhy(itemIid);
    if (why) {
      refuse(why);
      return;
    }
    setPending({ kind: 'rebond', itemIid });
    say('Pick a friendly unit to re-bond the Item to.');
  };

  // ---- pending-target resolution ------------------------------------------
  const isPendingTarget = (iid: string): boolean => {
    if (!pending) return false;
    if (pending.kind === 'bond' || pending.kind === 'rebond') {
      if (iid === HUMAN) {
        // Only a Charm being invoked (never a re-bond, which always needs a
        // body) may be aimed at the player themselves.
        if (pending.kind !== 'bond') return false;
        const card = me.hand.find((c) => c.iid === pending.cardIid);
        return !!card && !itemSurvives(card.def.subtype);
      }
      const u = findUnit(g, iid);
      return !!u && u.owner === HUMAN;
    }
    return canTarget(g, HUMAN, pending.effect, iid);
  };

  const resolvePendingOn = (targetIid: string) => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    switch (p.kind) {
      case 'invoke':
        doInvoke(p.cardIid, { targetIid, bondTargetIid: p.bondTargetIid });
        return;
      case 'bond': {
        // Aimed at the player: a self-cast Charm, which resolves as Vitality
        // and never carries its bond's rider with it.
        if (targetIid === HUMAN) {
          doInvoke(p.cardIid, { bondTargetIid: BOND_TARGET_SELF });
          return;
        }
        // v5.1: an Item whose on-invoke effect needs a target now chains to
        // a second pick instead of silently auto-targeting.
        const card = me.hand.find((c) => c.iid === p.cardIid);
        const eff = card?.def.onInvoke;
        if (card && eff && needsTarget(eff) && targetsFor(g, HUMAN, eff).length > 0) {
          setPending({ kind: 'invoke', cardIid: p.cardIid, effect: eff, bondTargetIid: targetIid });
          say('Bond set — now pick a target for its effect.');
          return;
        }
        // v17: a Tool's printed text is "weakens a TARGET enemy unit" — chain
        // to that pick too (the engine honors it), instead of silently
        // auto-targeting the biggest enemy.
        if (card && card.def.subtype === 'Tool' && card.def.nerf) {
          const nerfEff: Effect = {
            action: 'weaken',
            value: card.def.nerf,
            target: 'enemyUnit',
          };
          if (targetsFor(g, HUMAN, nerfEff).length > 0) {
            setPending({
              kind: 'invoke',
              cardIid: p.cardIid,
              effect: nerfEff,
              bondTargetIid: targetIid,
            });
            say('Bond set — now pick the enemy unit the Tool weakens.');
            return;
          }
        }
        doInvoke(p.cardIid, { bondTargetIid: targetIid });
        return;
      }
      case 'leaderAbility':
        if (activateLeaderAbility(g, HUMAN, p.idx, targetIid)) {
          bump();
          say('Leader ability resolves.');
        } else refuse('Illegal target.');
        checkWinner();
        return;
      case 'rebond': {
        const item = me.unbondedItems.find((c) => c.iid === p.itemIid);
        autoTapFor(g, HUMAN, { generic: item?.def.rebondCost ?? 0, pips: {} });
        if (rebondItem(g, HUMAN, p.itemIid, targetIid)) {
          bump();
          say('Item re-bonded.');
        } else {
          // The auto-tap above exhausted Locations — re-render them even on
          // the refusal path.
          bump();
          refuse('Illegal re-bond.');
        }
        return;
      }
    }
  };

  // ---- phase driving ------------------------------------------------------
  const myAttackers = stage === 'play' ? legalAttackers(g, HUMAN) : [];

  const finishTurn = () => {
    // Ends the turn: Dusk (triggers, then shed) → pass → CPU's Dawn → its
    // Main I. The engine's chooseShed hook can THROW mid-Dusk when an
    // "At Dusk" draw pushed the hand over the limit (or the pre-pick no
    // longer fits) — reopen the picker on the post-trigger hand and resume
    // via finishDuskShed once the player confirms.
    try {
      endPhase(g);
    } catch (e) {
      if (e !== DUSK_PAUSE) throw e;
      bump();
      const hand = new Set(me.hand.map((c) => c.iid));
      setShedPick(duskSeedRef.current.filter((iid) => hand.has(iid)));
      duskSeedRef.current = [];
      setShedForced(true);
      say('An At Dusk draw put you over the hand limit — pick what to shed.');
      return;
    }
    bump();
    if (checkWinner()) return;
    runCpuTurn();
  };

  const advanceMyPhase = () => {
    setPending(null);
    setAtkSel(new Set());
    closePreview();
    if (g.phase === 'Main2') {
      // v5.1: over the hand limit — let the player CHOOSE what to shed.
      // This pre-pick is handed to the engine's chooseShed hook; it stays
      // cancellable (BACK returns to Main II) because Dusk hasn't run yet.
      if (me.hand.length > MAX_HAND) {
        setShedForced(false);
        setShedPick([]);
        return;
      }
      finishTurn();
      return;
    }
    if (endPhase(g)) {
      bump();
      flashPhase(PHASE_LABEL[g.phase]);
    }
    checkWinner();
  };

  // ---- clash: human attacking ---------------------------------------------
  /** Total Might currently selected to attack with — shown on the DECLARE
   * button so "is this lethal?" is arithmetic the board does, not the player. */
  const selectedMight = [...atkSel].reduce((sum, iid) => {
    const u = findUnit(g, iid);
    return sum + (u ? effMight(g, u) : 0);
  }, 0);

  const toggleAttacker = (iid: string) => {
    setAtkSel((s) => {
      const n = new Set(s);
      if (n.has(iid)) n.delete(iid);
      else n.add(iid);
      return n;
    });
  };

  /**
   * Run the CPU's clash reaction plays (Quick Events / Ambush units) with the
   * same pause contract playTurn uses: a reaction the human can answer THROWS,
   * we open the response window, and the window's close resumes right here
   * (reactionPlays is re-entrant). `which` picks what happens after the CPU
   * is done: finish declaring the human's attack, or resolve the CPU's clash.
   * Without this the CPU's reactions were force-resolved straight through the
   * human's rulebook-§6 response window (human attacking), and the attacking
   * CPU never got its own reaction window at all (human defending) — the one
   * place interactive play silently diverged from the balance sims.
   */
  const runCpuClashReactions = (which: 'myAttack' | 'cpuClash') => {
    let paused = false;
    // The CPU's clash reactions used to be the one place it acted with no
    // narration at all: cards resolved, units died and the board simply
    // changed between two of the player's own clicks, with a single
    // after-the-fact summary banner. Narrate them exactly like a CPU turn —
    // same beats, same rings, same card spotlight.
    const logStart = g.log.length;
    const events: CpuTurnEvent[] = [];
    try {
      reactionPlays(
        g,
        CPU,
        (ev) => {
          // `logAt` is stamped by playTurn's own observer; reactionPlays has
          // no such wrapper, so buildCpuBeats gets nothing to line up against
          // unless we stamp it here.
          ev.logAt = g.log.length;
          events.push(ev);
        },
        {
          onOpponentPriority: () => {
            throw PRIORITY_PAUSE;
          },
        },
      );
    } catch (e) {
      if (e !== PRIORITY_PAUSE) {
        // This now runs from the narration timer (the guard beats call it on
        // their way out), not from a click handler, so an engine exception
        // escaping here would land outside React entirely — white screen, and
        // an unrecoverable match. Recover to the human's turn the same way
        // resolveCpuTurn already does, and leave the details in the console.
        console.error('CPU clash reactions crashed:', e);
        say(`${cpuLabel} hit an unexpected snag — play passes to you.`);
        // recoverToHumanTurn, NOT beginHumanTurn: on a 'cpuClash' crash the
        // CPU is still the active player with a live clash — beginHumanTurn
        // alone left stage 'play' with every inMyMain control dead and the
        // phase button hidden behind the unresolved clash. Zero enabled
        // actions; only CONCEDE escaped.
        recoverToHumanTurn();
        return;
      }
      paused = true;
    }
    bumpDeferringFloats();
    if (checkWinner()) return;
    const beats = buildCpuBeats(
      g.log.slice(logStart).map((l) => humanize(l)),
      logStart,
      events,
      g,
    );
    // Same discrete-step opener the guard beats get: a reaction play starting
    // on the frame after the player's own click read as part of that click.
    if (beats.length > 0) {
      beats.unshift({ text: `🤔 ${cpuLabel} reacts to the clash…`, actors: [], targets: [] });
    }
    narrateBeats(beats, () => {
      if (checkWinner()) return;
      if (paused) {
        openResponseWindow(() => runCpuClashReactions(which));
        return;
      }
      if (which === 'myAttack') finishMyAttackDeclaration();
      else finishCpuClashResolve();
    });
  };

  /** After the CPU's guards + reactions are in: back to the human's clash. */
  const finishMyAttackDeclaration = () => {
    // Same stale-pick clear as finishCpuClashResolve/resumeCpuTurn: a target
    // pick abandoned inside a mid-clash response window must not survive
    // into the resumed clash.
    setPending(null);
    setStage('play');
    // Both halves of the CPU's answer are narrated beat-by-beat now — the
    // guard lines by `guardBeats` and the reaction plays by
    // runCpuClashReactions — so there is no summary left to print here.
    checkWinner();
  };

  const declareMyAttack = () => {
    if (atkSel.size === 0) return;
    if (!declareAttackers(g, [...atkSel])) {
      refuse('Illegal attack selection.');
      return;
    }
    setAtkSel(new Set());
    // The CPU assigns its guards immediately (same heuristic the harness
    // uses); the clash bar then shows the lines before damage resolves.
    const guards = chooseGuards(g, CPU);
    if (!declareGuards(g, guards)) declareGuards(g, {});
    bump();
    narrateBeats(
      [
        // v20: a beat for the DECISION, before the beats describing it. The
        // CPU's blocking answer used to appear on the frame after DECLARE
        // ATTACK was clicked — v19 gave it beats, but they still arrived with
        // no gap, so the guards read as part of the player's own click rather
        // than as the opponent's reply to it. Everything else the CPU does
        // opens with a "thinking" pause; this is the same pause, in the same
        // vocabulary.
        { text: `🤔 ${cpuLabel} is choosing its guards…`, actors: [], targets: [] },
        ...buildGuardBeats(g, cpuLabel),
      ],
      () => {
        // The defending CPU gets its clash reaction window (Quick Events /
        // Ambush units) before damage — pause-capable, so the human can answer.
        runCpuClashReactions('myAttack');
      },
    );
  };

  // The defending (non-active) player's vitality plate should flash when at
  // least one attacker is unguarded and hits face. Compute the key from the
  // clash before it's resolved (resolveClash nulls g.clash). Read the
  // declare-time `guardedOnce` snapshot, NOT the live guards map: the engine's
  // "blocked is blocked" rule means an attacker whose guard was killed in the
  // reaction window still deals no face damage, and stateBasedChecks has
  // already pruned that dead guard from `guards`, so keying off the live map
  // flashed the plate for a hit that never lands.
  const unguardedVitKey = (): string | null => {
    if (!g.clash) return null;
    const guardedOnce = g.clash.guardedOnce ?? [];
    const anyUnguarded = g.clash.attackers.some((a) => !guardedOnce.includes(a));
    if (!anyUnguarded) return null;
    return `vit:${g.active === HUMAN ? CPU : HUMAN}`;
  };

  const resolveMyClash = () => {
    if (!g.clash) return;
    const participants = [...g.clash.attackers, ...Object.values(g.clash.guards).flat()];
    const vitKey = unguardedVitKey();
    if (resolveClash(g)) {
      flashUnits(vitKey ? [...participants, vitKey] : participants);
      bump();
      say('Clash resolves!');
    }
    checkWinner();
  };

  // ---- CPU turn (narrated from the engine log) ----------------------------
  const stopCpuTimer = () => {
    if (cpuTimeoutRef.current !== null) {
      window.clearTimeout(cpuTimeoutRef.current);
      cpuTimeoutRef.current = null;
    }
  };

  /** Keeps `narrating` and the timer chain's view of it in step — a running
   * chain of setTimeout closures cannot read the state variable. */
  const setNarratingBoth = (v: boolean) => {
    narratingRef.current = v;
    setNarrating(v);
  };

  const tickCpuBeat = () => {
    cpuTimeoutRef.current = null;
    const beats = cpuBeatsRef.current;
    const i = cpuBeatIdxRef.current;
    if (i >= beats.length) {
      // Whatever queued floats no beat claimed (e.g. a unit that died before
      // its line, or a skipped run) still fire — late beats one, lost none.
      releaseFloatsFor();
      const done = cpuDoneRef.current;
      cpuDoneRef.current = null;
      setCpuBeat(null);
      setCpuFocus(null);
      setNarratingBoth(false);
      done?.();
      return;
    }
    cpuBeatIdxRef.current = i + 1;
    setCpuBeat({ text: beats[i].text, idx: i, total: beats.length });
    setCpuFocus(beats[i]);
    // The damage/heal floats belonging to this beat's units fire NOW, beside
    // the line describing them, not seconds earlier on the pre-narration
    // render (see bumpDeferringFloats).
    releaseFloatsFor(beats[i]);
    // Paused: the beat stays on screen — with its rings and its spotlight —
    // until the player steps forward or resumes. Nothing else drives the
    // chain, so not scheduling the next timeout IS the pause.
    if (cpuPausedRef.current) return;
    cpuTimeoutRef.current = window.setTimeout(tickCpuBeat, beatMs(beats[i]));
  };

  /** Play an already-built beat list one beat at a time, then call `onDone`.
   * Most beats come from the engine log (see `narrate`), but not every CPU
   * decision writes a log line — `declareGuards` writes none at all — so this
   * is also how a synthesized beat gets the same screen time, rings and SKIP
   * handling as a logged one. */
  const narrateBeats = (beats: CpuBeat[], onDone: () => void) => {
    cpuBeatsRef.current = beats;
    cpuBeatIdxRef.current = 0;
    cpuDoneRef.current = onDone;
    // SKIP pressed during the pre-compute "thinking" delay: the player asked
    // to fast-forward the turn before its beats existed. Honor it now — the
    // old behavior narrated normally and made them press SKIP a second time.
    if (skipNextNarrationRef.current) {
      skipNextNarrationRef.current = false;
      cpuBeatIdxRef.current = beats.length;
      tickCpuBeat();
      return;
    }
    if (beats.length === 0) {
      // Cleared as well as called: a `cpuDoneRef` left pointing at a spent
      // continuation is what `toggleCpuPause` would otherwise read as "a
      // narration is in flight".
      cpuDoneRef.current = null;
      setNarratingBoth(false);
      onDone();
      return;
    }
    setNarratingBoth(true);
    tickCpuBeat();
  };

  /**
   * Hold the narration on the beat currently on screen.
   *
   * SKIP was the only control over the opponent's turn, and it points one way:
   * a player who wanted to LOOK at what just happened — read the card in the
   * spotlight, follow the rings to the unit it hit — had no way to stop the
   * beat leaving, only a speed dial that made the next one slower too. Pausing
   * holds the current beat indefinitely; ▸ STEP then walks the turn one action
   * at a time, which is the mode for actually understanding a swing.
   *
   * The choice persists across turns on purpose — someone who wants to step
   * through this turn usually wants to step through the next one — and both
   * controls stay on the divider the whole time so a paused board never reads
   * as a stuck one.
   */
  const toggleCpuPause = () => {
    const next = !cpuPausedRef.current;
    cpuPausedRef.current = next;
    setCpuPaused(next);
    if (next) {
      stopCpuTimer();
      return;
    }
    // Resuming mid-run: the chain has no pending timeout (pausing cleared it,
    // or the tick returned without scheduling), so restart it on the beat the
    // player has been looking at.
    if (narratingRef.current && cpuTimeoutRef.current === null) {
      const shown = cpuBeatsRef.current[cpuBeatIdxRef.current - 1];
      cpuTimeoutRef.current = window.setTimeout(tickCpuBeat, beatMs(shown));
    }
  };

  /** Advance exactly one beat while paused. */
  const stepCpuBeat = () => {
    if (!cpuPausedRef.current) return;
    stopCpuTimer();
    tickCpuBeat();
  };

  /** Replay a CPU turn's log lines as staggered narration beats — each one
   * ringing the cards it involves — then call `onDone`. */
  const narrate = (
    lines: string[],
    logStart: number,
    events: CpuTurnEvent[],
    onDone: () => void,
    /** Trailing count of `lines` that are the PLAYER's own Dawn — see
     * `CpuBeat.mine`. The callers that narrate a completed CPU turn compute
     * it from `g.dawnLog`; mid-turn narrations pass nothing. */
    mineTail = 0,
  ) => {
    const beats = buildCpuBeats(
      lines.map((l) => humanize(l)),
      logStart,
      events,
      g,
    );
    for (let i = Math.max(0, beats.length - mineTail); i < beats.length; i++) beats[i].mine = true;
    narrateBeats(beats, onDone);
  };

  /** How many trailing log lines are the human's own Dawn (the one that runs
   * inside the endPhase ending the CPU's turn). Only meaningful right after a
   * CPU turn RAN TO COMPLETION — callers gate on that themselves. */
  const humanDawnTailLen = (): number => {
    if (g.dawnLog.length === 0 || g.active !== HUMAN) return 0;
    const tail = g.log.slice(g.log.length - g.dawnLog.length);
    return tail.length === g.dawnLog.length && tail.every((l, i) => l === g.dawnLog[i])
      ? g.dawnLog.length
      : 0;
  };

  const skipCpuBeats = () => {
    // SKIP releases ❚❚ HOLD (v20). Held and skipping are contradictory
    // instructions, and leaving the hold on turned SKIP into a per-segment
    // button: a CPU turn is narrated as several runs back to back (the turn
    // proper, its clash reactions, whatever follows a response window), each
    // one calling narrateBeats, and a run that starts while paused parks on
    // its own beat 0 with no timer. So a player who held to study one move and
    // then pressed SKIP got the rest of THAT run and an immediate freeze on the
    // next — and had to press SKIP again for every remaining segment.
    if (cpuPausedRef.current) {
      cpuPausedRef.current = false;
      setCpuPaused(false);
    }
    // Clicked during the initial "thinking" delay, before the CPU's turn has
    // even been computed yet: cpuTimeoutRef (the beat-ticker) is idle, so
    // stopCpuTimer()+tickCpuBeat() below would have nothing to do and the
    // match would hang in stage 'cpu' forever with no further way to
    // progress. Fast-forward past the delay by resolving right now instead.
    if (cpuThinkTimeoutRef.current !== null) {
      window.clearTimeout(cpuThinkTimeoutRef.current);
      cpuThinkTimeoutRef.current = null;
      // One-shot: the narration this resolveCpuTurn builds starts skipped.
      skipNextNarrationRef.current = true;
      resolveCpuTurn();
      return;
    }
    stopCpuTimer();
    cpuBeatIdxRef.current = cpuBeatsRef.current.length;
    tickCpuBeat();
  };

  /**
   * Digest the opponent's whole turn into a few numbers, for the strip that
   * greets the player when control comes back (see `turnRecap`).
   *
   * Read off the engine log slice since the handoff plus the snapshot taken
   * when the turn started, NOT off the narration beats: a skipped turn has no
   * beats the player ever saw, and the skipped turn is precisely the one this
   * exists for.
   */
  const buildTurnRecap = (): TurnRecap | null => {
    const snap = cpuTurnSnapshotRef.current;
    cpuTurnSnapshotRef.current = null;
    if (!snap) return null;
    const lines = g.log.slice(snap.logAt);
    if (lines.length === 0) return null;
    const theirs = lines.filter((l) => l.startsWith('P2 '));
    const recap: TurnRecap = {
      vitalityLost: Math.max(0, snap.vitality - me.vitality),
      unitsLost: snap.fieldIids.filter((iid) => !me.field.some((u) => u.iid === iid)).length,
      cardsPlayed: theirs.filter((l) => /\b(invokes|casts|plays)\b/.test(l)).length,
      attacked: theirs.some((l) => /\battacks\b/.test(l)),
      cardsDrawnByMe: Math.max(0, me.hand.length - snap.hand),
      lines: lines.length,
    };
    // Nothing worth a strip: no damage, no losses, no plays, no attack.
    if (
      recap.vitalityLost === 0 &&
      recap.unitsLost === 0 &&
      recap.cardsPlayed === 0 &&
      !recap.attacked
    ) {
      return null;
    }
    return recap;
  };

  const beginHumanTurn = () => {
    // Safety flush: a recovery path can land here without the narration
    // ticker's own end-of-run flush having fired.
    releaseFloatsFor();
    setTurnRecap(buildTurnRecap());
    setCpuBeat(null);
    setCpuFocus(null);
    setNarratingBoth(false);
    respondResumeRef.current = null;
    cpuResumeCountRef.current = 0;
    bump();
    if (checkWinner()) return;
    setPending(null);
    setAtkSel(new Set());
    setGuardSel({});
    setGuardFocus(null);
    closePreview();
    setStage('play');
    flashPhase('YOUR TURN');
  };

  /**
   * Recovery landing for a CPU turn that crashed or hit the resume backstop.
   *
   * Those paths used to call `beginHumanTurn()` directly, which set stage
   * 'play' while `g.active` was still CPU — every control gated on `inMyMain`
   * was dead, and the one that wasn't (the phase button reads only the stage)
   * quietly drove the OPPONENT's phases when pressed. Crank the engine forward
   * to the human's own turn first, best-effort: the engine is already in a
   * state one call out of couldn't handle, so a second failure just stops the
   * cranking and leaves the phase button as the escape hatch it always was.
   */
  const recoverToHumanTurn = () => {
    try {
      // A live clash blocks endPhase outright (the engine refuses to end a
      // phase mid-clash), so cranking below would spin its 12 iterations
      // doing nothing and land in a stage with zero enabled actions. Drop
      // the clash first — the same defensive discard finishDuskShed does,
      // routed through the engine (not a direct `g.clash =` here) since `g`
      // is a useState value this component must not mutate inline.
      if (g.clash && g.clash.step !== 'done') discardLiveClash(g);
      let safety = 12;
      while (!g.winner && g.active === CPU && safety-- > 0) endPhase(g);
    } catch {
      /* already recovering from a crash — stop cranking, keep what we have */
    }
    beginHumanTurn();
  };

  /**
   * Open the human's response window: something is on the stack that they hold
   * priority over. `onClose` runs once they have passed (or spent everything
   * they could respond with) and the stack has settled past them.
   */
  const openResponseWindow = (onClose: () => void) => {
    const top = g.stack[g.stack.length - 1];
    // Priority is NOT ours: there is no window to open, and the auto-pass
    // path below would return without firing `onClose` (passMyPriority bails
    // when the player doesn't hold priority) — leaving whatever was paused
    // paused forever, with no button anywhere that resumes it. Every caller
    // but one already checked; make the check belong to the window instead.
    if (!hasPriority(g, HUMAN)) {
      onClose();
      return;
    }
    // Nothing to respond WITH (no Quick Event / Ambush unit castable even
    // tapping every Location): opening the window would only make the player
    // click PASS to continue. Pass for them and say so — the stack display
    // still shows what resolved.
    if (!hasInstantResponse(g, HUMAN)) {
      respondResumeRef.current = onClose;
      say(top ? `${top.sourceName} resolves — nothing you can respond with.` : 'Play continues.');
      passMyPriority();
      return;
    }
    respondResumeRef.current = onClose;
    setPending(null);
    closePreview();
    setStage('respond');
    say(top ? `${top.sourceName} is on the stack — respond or pass.` : 'Respond or pass.');
  };

  /**
   * Called after the human acts inside a response window. If they still hold
   * priority (another item to answer, or their own response drew a counter)
   * the window stays open; otherwise it closes and play resumes.
   */
  const afterResponseAction = () => {
    settleStack(g);
    // The interactive settleStack can HALT with the CPU holding priority
    // (it has an affordable instant answer to something of ours still on the
    // stack). Nothing else drives the CPU's window from here, so without
    // this loop the human's own card froze on the stack — no PASS button,
    // sorcery-speed plays refused — until a phase change discarded it.
    // Drive the CPU through its window exactly like doInvoke does — narrated
    // since v20, so an answer played here is seen rather than inferred from a
    // board that changed while the player was not looking.
    narrateCpuStackAnswer((cpuPlays) => {
      if (checkWinner()) return;
      if (hasPriority(g, HUMAN)) {
        if (cpuPlays > 0) say(`${cpuLabel} responded — answer it or pass.`);
        // The window can be re-entered from a path that never set the stage:
        // the auto-pass in openResponseWindow skips `setStage('respond')`,
        // and the CPU's answer can put a castable instant INTO our hand
        // (e.g. a dies-trigger draw), making settleStack halt on us again.
        // Without this the PASS button never rendered — a hard softlock with
        // priority ours and no control that could exercise it.
        setStage('respond');
        return; // still their window
      }
      const resume = respondResumeRef.current;
      respondResumeRef.current = null;
      if (resume) resume();
    });
  };

  /** PASS button in a response window. */
  const passMyPriority = () => {
    if (!hasPriority(g, HUMAN)) return;
    // PASS abandons any half-built target pick — leaving `pending` alive let
    // the red PICK A TARGET bar (and live target rings) survive into whatever
    // stage play resumed to, where a click on a still-ringed card would spend
    // the card the player had decided NOT to cast.
    setPending(null);
    passPriority(g, HUMAN);
    afterResponseAction();
  };

  /** Play the CPU's turn. It can pause twice: at the guard step (CLASH_PAUSE,
   * the human assigns guards) and whenever a CPU play leaves the human holding
   * priority over it (PRIORITY_PAUSE, the human responds or passes). Both
   * resume by re-entering playTurn, which picks up from the current phase. */
  const resolveCpuTurn = () => {
    cpuTimeoutRef.current = null;
    const logStart = g.log.length;
    // Collected via opts.observe rather than playTurn's return value: a pause
    // handler exits by THROWING, which would lose the returned array.
    const events: CpuTurnEvent[] = [];
    let pause: object | null = null;
    try {
      playTurn(g, CPU, {
        observe: (ev) => events.push(ev),
        chooseGuardsFor: () => {
          throw CLASH_PAUSE;
        },
        onOpponentPriority: () => {
          throw PRIORITY_PAUSE;
        },
      });
    } catch (e) {
      if (e !== CLASH_PAUSE && e !== PRIORITY_PAUSE) {
        // An engine exception out of this timer callback would escape React
        // entirely (white screen, match unrecoverable) — recover to the
        // human's turn instead and leave the details in the console.
        console.error('CPU turn crashed:', e);
        say(`${cpuLabel} hit an unexpected snag — play passes to you.`);
        recoverToHumanTurn();
        return;
      }
      pause = e as object;
    }
    bumpDeferringFloats();
    // A completed turn's slice ends with the HUMAN's Dawn (it runs inside the
    // endPhase that ends the CPU's turn) — mark those beats as the player's
    // own so they don't narrate as opponent actions.
    narrate(
      g.log.slice(logStart),
      logStart,
      events,
      () => {
        if (checkWinner()) return;
        if (pause === CLASH_PAUSE && g.clash && g.clash.step === 'guards') {
          setGuardSel({});
          setGuardFocus(g.clash.attackers[0] ?? null);
          setStage('cpuGuard');
          say(`${cpuLabel} attacks — assign your guards!`);
        } else if (pause === PRIORITY_PAUSE) {
          // Bounded: a resume that somehow makes no progress must not spin the
          // turn forever through the narration timer.
          if (cpuResumeCountRef.current++ > MAX_CPU_RESUMES) {
            settleStack(g, { interactive: false });
            bump();
            recoverToHumanTurn();
          } else if (hasPriority(g, HUMAN)) {
            openResponseWindow(resumeCpuTurn);
          } else {
            resumeCpuTurn();
          }
        } else {
          beginHumanTurn();
        }
      },
      pause ? 0 : humanDawnTailLen(),
    );
  };

  /** Pick the CPU's turn back up where a response window paused it. */
  const resumeCpuTurn = () => {
    // Drop any half-built target pick from the response window — control is
    // passing to the CPU, so a lingering `pending` would leave the red
    // "PICK A TARGET" bar and target rings up through the CPU's whole turn
    // (and any tap there would fail the engine's timing check).
    setPending(null);
    setStage('cpu');
    resolveCpuTurn();
  };

  const runCpuTurn = () => {
    // The opponent's Dawn has ALREADY run by the time we get here — it happens
    // inside the `endPhase` that ended the human's turn — so its lines are
    // behind `g.log.length` and `dawnLog` is the only handle on them.
    //
    // v22: that phase was described in the previous version of this comment as
    // writing nothing to the log, and until this pass it genuinely didn't.
    // What it actually does is untap, heal (Sacred / Radiant / Regenerate),
    // grow (Thriving / Empowering), draw (Archivist) — and reach across the
    // table to FREEZE one of the player's units (Glaciate). A unit greying out
    // between the player's turn and the opponent's first move, with no line,
    // no ring and no beat, was the last thing the opponent did in silence.
    //
    // Only when they are still the TAIL of the log. The one path in where they
    // are not is the opening turn: `createGame` runs the first player's Dawn
    // and the mulligans are written after it, so on a CPU-first match
    // `dawnLog` is real but stale by several lines. Narrating it there would
    // replay a Dawn the player already sat through the mulligan screen for,
    // and the divider would land inside the mulligan lines.
    const tail = g.log.slice(g.log.length - g.dawnLog.length);
    const dawnIsFresh =
      g.dawnLog.length > 0 &&
      tail.length === g.dawnLog.length &&
      tail.every((l, i) => l === g.dawnLog[i]);
    const dawnLines = dawnIsFresh ? g.dawnLog : [];
    // Every handoff to the opponent funnels through here, so this is the one
    // place the Battle Log divider needs stamping. Taken at the Dawn rather
    // than after it: those lines are the opponent's turn, not the tail of the
    // human's. Their own shed and "At Dusk" lines stay on their side.
    const handoff = Math.max(0, g.log.length - dawnLines.length);
    setHandoffAt(handoff);
    // The other end of the turn recap. Taken from the same line as the handoff
    // divider, so the digest covers exactly the slice the Battle Log marks off.
    cpuTurnSnapshotRef.current = {
      vitality: me.vitality,
      fieldIids: me.field.map((u) => u.iid),
      hand: me.hand.length,
      logAt: handoff,
    };
    setTurnRecap(null);
    setStage('cpu');
    setCpuBeat(null);
    // Cleared too, or the previous turn's last beat keeps its actor/target
    // rings pulsing on the board right through the "thinking" delay.
    setCpuFocus(null);
    cpuResumeCountRef.current = 0;
    cpuThinkTimeoutRef.current = window.setTimeout(() => {
      cpuThinkTimeoutRef.current = null;
      if (dawnLines.length === 0) {
        resolveCpuTurn();
        return;
      }
      // Beats with no event stream behind them: `unitsNamedIn` supplies the
      // rings, which is what makes "Glaciate freezes Ghost Tunicate" point at
      // the actual card instead of asking the player to go and find it.
      narrateBeats(
        buildCpuBeats(
          dawnLines.map((l) => humanize(l)),
          0,
          [],
          g,
        ),
        () => {
          if (checkWinner()) return;
          resolveCpuTurn();
        },
      );
    }, CPU_PACE.THINK_MS * CPU_SPEEDS[cpuSpeedRef.current].mult);
  };

  /** After the human's guard step + reaction window resolve the clash, the
   * CPU finishes its turn (Main II, Dusk) and play passes back. */
  const continueCpuAfterClash = () => {
    try {
      endPhase(g); // Clash → Main II (clash must be 'done')
    } catch (e) {
      console.error('CPU post-clash crashed:', e);
      say(`${cpuLabel} hit an unexpected snag — play passes to you.`);
      recoverToHumanTurn();
      return;
    }
    playCpuRemainder();
  };

  /** Run whatever is left of the CPU's turn from the current phase (Main II,
   * then Dusk). Re-entrant: a response window pauses it and resumes here, so
   * this must never re-do the phase change that got us here. */
  const playCpuRemainder = () => {
    const logStart = g.log.length;
    const events: CpuTurnEvent[] = [];
    let paused = false;
    try {
      playTurn(g, CPU, {
        observe: (ev) => events.push(ev),
        onOpponentPriority: () => {
          throw PRIORITY_PAUSE;
        },
      });
    } catch (e) {
      if (e !== PRIORITY_PAUSE) {
        console.error('CPU post-clash crashed:', e);
        say(`${cpuLabel} hit an unexpected snag — play passes to you.`);
        recoverToHumanTurn();
        return;
      }
      paused = true;
    }
    bump();
    setStage('cpu');
    narrate(
      g.log.slice(logStart),
      logStart,
      events,
      () => {
        if (checkWinner()) return;
        if (!paused) {
          beginHumanTurn();
        } else if (cpuResumeCountRef.current++ > MAX_CPU_RESUMES) {
          settleStack(g, { interactive: false });
          bump();
          recoverToHumanTurn();
        } else if (hasPriority(g, HUMAN)) {
          openResponseWindow(playCpuRemainder);
        } else {
          playCpuRemainder();
        }
      },
      paused ? 0 : humanDawnTailLen(),
    );
  };

  // ---- clash: human defending (stage 'cpuGuard') --------------------------
  const guardStep = stage === 'cpuGuard' && g.clash?.step === 'guards';
  const reactionStep = stage === 'cpuGuard' && g.clash?.step === 'reaction';
  const cpuAttackerIids = stage === 'cpuGuard' ? (g.clash?.attackers ?? []) : [];

  const guardOf = (unitIid: string): string | null => {
    for (const [a, gs] of Object.entries(guardSel) as [string, string[]][]) {
      if (gs.includes(unitIid)) return a;
    }
    return null;
  };

  const toggleGuard = (unitIid: string) => {
    if (!guardStep || !guardFocus) return;
    setGuardSel((sel) => {
      const next: GuardAssignments = {};
      for (const [a, gs] of Object.entries(sel) as [string, string[]][]) {
        next[a] = gs.filter((x) => x !== unitIid);
      }
      const already = sel[guardFocus]?.includes(unitIid);
      if (!already) {
        const legal = legalGuardsFor(g, guardFocus).some((u) => u.iid === unitIid);
        if (!legal) {
          // Say WHICH rule blocked it rather than listing every rule that
          // could have — with Aerial, Nimble and exhaustion all in play, a
          // generic message leaves the player guessing.
          const attacker = findUnit(g, guardFocus);
          const unit = findUnit(g, unitIid);
          let why = "That unit can't guard this attacker.";
          if (unit?.exhausted) why = `${unit.def.name} is exhausted and can't guard.`;
          else if (attacker && unit && unitHasKw(attacker, 'Aerial'))
            why = `${attacker.def.name} is Aerial — only Aerial or Skywatch units can guard it.`;
          else if (attacker && unit && unitHasKw(attacker, 'Nimble'))
            why = `${attacker.def.name} is Nimble — only a unit with LESS Might can guard it.`;
          refuse(why);
          return sel;
        }
        next[guardFocus] = [...(next[guardFocus] ?? []), unitIid];
      }
      for (const a of Object.keys(next)) if (next[a].length === 0) delete next[a];
      return next;
    });
  };

  /**
   * Fill the guard step with the CPU's own guard heuristic. Assigning guards
   * by hand is the fiddliest thing the board asks for — pick a line, pick the
   * bodies, repeat, and re-do it all if one assignment turns out illegal —
   * and the engine already ships a defender-side solver the CPU uses every
   * time it blocks. This is that solver, pointed at the player's board: a
   * starting point they can then edit, not an auto-play.
   */
  const suggestGuards = () => {
    if (!guardStep) return;
    const picked = chooseGuards(g, HUMAN);
    setGuardSel(picked);
    const lines = Object.values(picked).filter((v: string[]) => v.length > 0).length;
    say(
      lines > 0
        ? `Suggested ${lines} guard line(s) — edit them or confirm.`
        : 'Nothing worth guarding with — taking the hit is the suggestion.',
    );
  };

  const guardProblem = ((): string | null => {
    for (const [a, gs] of Object.entries(guardSel) as [string, string[]][]) {
      const attacker = findUnit(g, a);
      if (attacker && unitHasKw(attacker, 'Swarmproof') && gs.length === 1) {
        return `${attacker.def.name} is Swarmproof — guard with 2+ units or none.`;
      }
    }
    return null;
  })();

  /** Vitality the player stands to lose to attackers left unguarded by the
   * CURRENT (in-progress) guard selection — shown live so "how bad is
   * letting this through?" never needs mental arithmetic. */
  const incomingIfConfirmed = ((): number => {
    if (!guardStep || !g.clash) return 0;
    return g.clash.attackers.reduce((sum, aIid) => {
      if ((guardSel[aIid] ?? []).length > 0) return sum;
      const a = findUnit(g, aIid);
      return sum + (a ? effMight(g, a) : 0);
    }, 0);
  })();

  /**
   * Might that will reach a Vitality plate when this clash resolves.
   *
   * v28 completes the set the divider started in v26. Three buttons commit a
   * clash — DECLARE ATTACK, CONFIRM GUARDS and RESOLVE CLASH — and the first
   * has printed its arithmetic since v26, the second since earlier in this
   * pass, and the third printed nothing at all. RESOLVE CLASH is pressed by
   * BOTH seats (the attacker after guards are set, the defender out of the
   * reaction window) at the exact moment the answer is already determined:
   * guards are locked, the reaction window is the last thing that can change
   * it, and the player is being asked to commit to a number the board is
   * making them add up off the cards.
   *
   * `guardedOnce`, not `guards` — a blocker removed during the reaction window
   * still absorbed its attacker (see ClashState), and a readout keyed on the
   * live map would promise damage the engine is not going to deal.
   */
  const clashFaceDamage = ((): { might: number; at: PlayerId } | null => {
    if (!g.clash || g.clash.step === 'done') return null;
    const defender = g.active === HUMAN ? CPU : HUMAN;
    const might = g.clash.attackers.reduce((sum, iid) => {
      if (g.clash!.guardedOnce.includes(iid)) return sum;
      const u = findUnit(g, iid);
      return sum + (u ? effMight(g, u) : 0);
    }, 0);
    return { might, at: defender };
  })();
  /** RESOLVE CLASH's own label — the same sentence from either seat. */
  const resolveClashLabel = clashFaceDamage
    ? resolveClashLabelFor(
        clashFaceDamage.might,
        (clashFaceDamage.at === HUMAN ? me : foe).vitality,
        clashFaceDamage.at === HUMAN,
      )
    : '💥 RESOLVE CLASH';

  const confirmGuards = () => {
    if (guardProblem) {
      refuse(guardProblem);
      return;
    }
    if (declareGuards(g, guardSel)) {
      bump();
      say('Guards set — reaction window: Quick Events & Ambush units are live.');
    } else {
      refuse('Illegal guard assignment.');
    }
  };

  const resolveCpuClash = () => {
    if (!g.clash) return;
    // The attacking CPU's own reaction window comes first (the sim gives it
    // one at exactly this point; the interactive path used to skip it).
    runCpuClashReactions('cpuClash');
  };

  const finishCpuClashResolve = () => {
    if (!g.clash) {
      continueCpuAfterClash();
      return;
    }
    // The reactions themselves were narrated beat-by-beat by
    // runCpuClashReactions — there is no summary left to print here.
    const participants = [...g.clash.attackers, ...Object.values(g.clash.guards).flat()];
    const vitKey = unguardedVitKey();
    if (resolveClash(g)) {
      flashUnits(vitKey ? [...participants, vitKey] : participants);
      bump();
    }
    // The clash is over — drop the stale guard picks so units stop rendering
    // guard rings / "guards #1" notes during the CPU's remaining beats and any
    // response window opened there. Same for a half-built target pick made in
    // the reaction step, which would otherwise strand the "PICK A TARGET" bar.
    setGuardSel({});
    setPending(null);
    if (checkWinner()) return;
    continueCpuAfterClash();
  };

  // ---- render helpers -----------------------------------------------------
  const guardedBy = (attackerIid: string): string[] =>
    (guardStep ? guardSel[attackerIid] : g.clash?.guards[attackerIid]) ?? [];

  const clashLines = (g.clash?.attackers ?? []).map((aIid, i) => {
    const a = findUnit(g, aIid);
    const gs = guardedBy(aIid)
      .map((iid) => findUnit(g, iid)?.def.name)
      .filter(Boolean);
    return {
      iid: aIid,
      n: i + 1,
      name: a?.def.name ?? '(gone)',
      // The attacker's effective Might, printed on its clash-bar line: "which
      // one do I guard first?" is a Might comparison, and the numbers lived
      // only on the card faces below the bar making the decision about them.
      might: a ? effMight(g, a) : 0,
      guards: gs as string[],
    };
  });

  /**
   * v7.5: below the `sm` breakpoint the hand is a horizontal SCROLL STRIP
   * rather than a fan.
   *
   * v7.4 made the fan fit a 375px screen by tightening the overlap until it
   * did — which it does, and every card stays tappable, but at seven-plus
   * cards the overlap floor leaves about 20px of each card showing and the
   * names are unreadable. A fan's whole premise is that you can see the cards
   * it splays; at phone width there is not enough horizontal room for that
   * premise to hold, so the layout changes instead of being squeezed further.
   *
   * The strip costs no vertical space — the dock height is unchanged, and the
   * cards sit un-rotated at translateY(0) so the 92px on show is the card's
   * own top (masthead, cost, art) rather than 84px of a rotated card behind
   * its neighbour. Above `sm` the fan is untouched.
   */
  const isNarrow = viewportW < 640;
  const handStrip = isNarrow;

  /**
   * How far each hand card slides over the one before it. Fixed at 46px, the
   * fan was laid out in absolute pixels and simply ran off the screen: seven
   * compact cards measure 494px, so on a 375px phone it overflowed by 59px on
   * each side and the cards at both ends were unreachable. v7.4 made it
   * tighten until the whole fan fits, down to a floor that always leaves a
   * usable sliver of every card showing; v7.5 stops using it below `sm`
   * entirely (see `handStrip`).
   */
  const fanOverlap = (() => {
    const n = me.hand.length;
    const w = CARD_SIZES.compact.w;
    if (n <= 1) return 46;
    const avail = Math.max(220, viewportW - 12);
    const needed = w - (avail - w) / (n - 1);
    return Math.round(Math.min(w - 20, Math.max(46, needed)));
  })();

  // Coach stage: coarse key for the first-match walkthrough. The CPU's attack
  // and the guard-assignment sub-step it opens are one coach beat ("4.
  // OPPONENT'S TURN", whose body covers guarding), so cpuGuard keeps the 'cpu'
  // key — the CoachOverlay script has no 'guard' step, and mapping to a
  // phantom key made that callout vanish exactly when guards had to be picked.
  const coachStage =
    stage === 'cpu'
      ? 'cpu'
      : stage === 'cpuGuard'
        ? 'cpu'
        : stage === 'play'
          ? g.phase === 'Clash'
            ? 'clash'
            : g.phase === 'Main2'
              ? 'main2'
              : 'main1'
          : stage;

  /**
   * Per colour, how many cards in hand a Wellspring of that colour would
   * UNLOCK — cards this Location row cannot pay for today and could after.
   *
   * v22. The Wellspring row is seven 16px dots, and the only thing that ever
   * distinguished them was a `title` tooltip reading "Play a Void Wellspring
   * (free)" — the same sentence for all seven, invisible on touch, and silent
   * about the one fact that decides which to press. Instrumenting a driven
   * match found the human casting ONE card in nine turns behind a hand that
   * was entirely Void while its board built the wrong colour every turn; a
   * player with no tooltip has exactly the information the driver had.
   *
   * "Unlocks", not "is short of this pip", and this is the distinction the AI
   * itself draws (`chooseWellspring`'s `satisfiable(t) - baseline`, added when
   * the v6.6 sims found ~17% of turns playing a colour that freed nothing): a
   * card short of TWO colours is not unlocked by either one alone, and
   * counting it under both is how a recommendation ends up naming a dot that
   * changes nothing. Costs go through `canPayCost` rather than a pip
   * comparison so the generic half is counted too — the extra Location pays
   * for that as well.
   */
  const wellspringNeed = ((): Partial<Record<EssenceType, number>> => {
    const pool = potentialEssence(me);
    const costs = me.hand.map((c) => effectiveCost(g, HUMAN, c.def));
    const stuck = costs.filter((cost) => !canPayCost(pool, cost));
    const need: Partial<Record<EssenceType, number>> = {};
    for (const t of wellspringChoices(g, HUMAN)) {
      const withOne = { ...pool, [t]: (pool[t] ?? 0) + 1 };
      const n = stuck.filter((cost) => canPayCost(withOne, cost)).length;
      if (n > 0) need[t] = n;
    }
    return need;
  })();
  /** The colour the hand is asking for hardest, if any — named in the hint bar
   * so the advice reaches a phone, where no tooltip ever will. */
  const topWellspringNeed = (wellspringChoices(g, HUMAN) as EssenceType[])
    .filter((t) => (wellspringNeed[t] ?? 0) > 0)
    .sort((a, b) => (wellspringNeed[b] ?? 0) - (wellspringNeed[a] ?? 0))[0];

  // Contextual hint bar.
  const hint = (() => {
    // Checked first: a narration run can be playing while the stage is still
    // 'play' or 'cpuGuard' (the opponent's clash reactions), and telling the
    // player to press RESOLVE CLASH while the board is mid-replay — with the
    // button replaced by SKIP — is the opposite of what the bar is for.
    if (narrating)
      return cpuPaused
        ? `Held on ${cpuLabel}'s move — ▸ STEP for the next one, ▶ RESUME to let it run.`
        : `${cpuLabel} is acting — watch the board, ❚❚ HOLD to study a move, or SKIP ▸▸ to catch up.`;
    if (pending) {
      if (pending.kind === 'bond' || pending.kind === 'rebond')
        return 'Pick a highlighted friendly unit for the Item — a Charm can also take your own Vitality plate (✕ or Esc to cancel).';
      return 'Pick a highlighted target for the effect (✕ or Esc to cancel).';
    }
    if (stage === 'cpuGuard') {
      // CONFIRM GUARDS is `disabled` while an assignment is illegal, so
      // clicking it can't surface the reason and the `title` tooltip needs a
      // hover — invisible on touch. Put it in the hint bar instead.
      if (guardStep && guardProblem) return `⚠ ${guardProblem}`;
      if (guardStep)
        return `Select an attacker line, then click your units to guard it (multiple guards OK). ${
          incomingIfConfirmed > 0
            ? `Unguarded hits incoming: ${incomingIfConfirmed} Vitality (you have ${Math.max(0, me.vitality)}).`
            : 'Every attacker is guarded.'
        }`;
      return 'Reaction window — invoke Quick Events or Ambush units (essence auto-taps), then RESOLVE CLASH.';
    }
    if (stage === 'cpu')
      return `${cpuLabel} is playing its turn — ❚❚ HOLD to study a move, SKIP ▸▸ to fast-forward.`;
    if (stage === 'respond') {
      const top = g.stack[g.stack.length - 1];
      return top
        ? `${top.sourceName} is on the stack — answer it with a Quick Event or Ambush unit (essence auto-taps), or PASS to let it resolve.`
        : 'Respond with a Quick Event or Ambush unit, or PASS.';
    }
    if (stage === 'play') {
      // The attacker's own reaction window is easy to miss: the rulebook
      // opens it to EITHER player, the engine and the CPU both use it, but
      // the old hint only mentioned resolving — so a player never learned
      // they could answer the guards before damage.
      // step 'done' means the clash already resolved and is only lingering
      // until endPhase nulls it — the RESOLVE CLASH button is already gone, so
      // this hint must stop telling the player to press it.
      if (g.clash && g.clash.step !== 'done') {
        return inMyReaction
          ? 'Guards are set — invoke Quick Events / Ambush units to answer them, then RESOLVE CLASH.'
          : 'Guards are set — RESOLVE CLASH to deal damage.';
      }
      switch (g.phase) {
        case 'Main1':
        case 'Main2':
          // The Wellspring advice comes FIRST when there is any, and it is a
          // sentence rather than a tooltip: a phone never sees a `title`, and
          // "which of these seven dots" is the single most consequential
          // decision on the board in the opening turns.
          return `${
            wellspringsLeft > 0 && topWellspringNeed
              ? `A ${topWellspringNeed} Wellspring would unlock ${wellspringNeed[topWellspringNeed]} card(s) in your hand — its dot is ringed. `
              : ''
          }Play a Wellspring (once per turn), tap Locations for essence — or just INVOKE: the cost auto-taps. ${
            g.phase === 'Main1'
              ? // Named as the button is LABELLED (v22). The hint bar said
                // "NEXT" in three places and the phase button never reads NEXT
                // in any state a player can see it — `phaseButtonLabel` only
                // returns 'NEXT ▸' for Dawn and Dusk, and `showPhaseButton`
                // hides it in both. The one string the help text repeated was
                // the one string not on the board.
                'TO CLASH ▸ moves to the Clash.'
              : me.hand.length > MAX_HAND
                ? // The button already reads END TURN (shed N) — the hint used
                  // to promise a plain "NEXT ends your turn" and then open a
                  // full-screen picker instead.
                  `END TURN asks you to shed ${me.hand.length - MAX_HAND} down to the ${MAX_HAND}-card limit first.`
                : 'END TURN ▸ ends your turn.'
          }`;
        case 'Clash':
          return myAttackers.length === 0
            ? 'No ready attackers — SKIP TO MAIN II ▸.'
            : 'Click your ready units to add them to the attack, then DECLARE ATTACK (or SKIP TO MAIN II ▸).';
        default:
          return null;
      }
    }
    return null;
  })();

  const confirmDialogRef = useDialogFocus(!!confirmDialog);
  const mulliganDialogRef = useDialogFocus(stage === 'mulligan');
  const gameOverDialogRef = useDialogFocus(stage === 'over' && !!g.winner);

  /** The card face held mid-board for the current CPU narration beat. */
  const cpuSpotlight = cpuFocus?.cardId ? (POOL_BY_ID[cpuFocus.cardId] ?? null) : null;
  /**
   * The unit this beat destroyed, held mid-board because the board has already
   * stopped drawing it (see `CpuBeat.lost`). At most two — a line naming three
   * dead units is a sweep, and three faces stacked in the middle of the board
   * is worse than the sentence on its own.
   */
  const cpuLostCards = (cpuFocus?.lost ?? [])
    .map((l) => ({ iid: l.iid, mine: l.owner === HUMAN, def: POOL_BY_ID[l.defId] ?? null }))
    .filter((x): x is { iid: string; mine: boolean; def: CardDef } => !!x.def)
    .slice(0, 2);

  const previewCard = preview ? (me.hand.find((c) => c.iid === preview) ?? null) : null;
  const previewWhy = previewCard ? invokeWhy(previewCard) : undefined;
  // The pinned hand-card preview lays a full card (240px at HOVER_PREVIEW_SCALE)
  // beside a 160px control column that carries CLOSE and the primary mobile
  // INVOKE button. At the printed scale that pair is ~552px wide and runs off
  // both edges of a ~375px phone, clipping those controls with no way to reach
  // them. Clamp the card scale so the card + column + chrome fit the viewport,
  // exactly as Card3DInspector clamps its own zoom (INSPECT_SCALE is the same
  // constant). On very narrow screens the column stacks below the card so the
  // card need only fit the width on its own.
  const previewStack = viewportW < 520;
  const previewChrome = 16 + 8; // p-2 padding on both sides + the flex gap
  const previewColW = previewStack ? 0 : 160;
  const previewMaxCardW = Math.max(120, viewportW - 16 - previewChrome - previewColW);
  const previewScale = Math.min(HOVER_PREVIEW_SCALE, previewMaxCardW / CARD_SIZES.full.w);

  /**
   * Hand cards that could still be invoked right now (v26).
   *
   * The sim has counted this lapse for the CPU since v5.3
   * (`wastedEssenceWithPlay`) and the board never once mentioned it to the
   * human, who makes it far more often: essence does not carry over, so a turn
   * ended with an affordable, castable card in hand is a card's worth of tempo
   * thrown away, and the only way to notice was to re-read seven card costs
   * against the essence row before every END TURN. Counted off `invokeWhy`, the
   * same predicate the INVOKE button reads, so the number can never disagree
   * with what the hand will actually let you do.
   */
  const playableInHand =
    stage === 'play' && g.active === HUMAN && (g.phase === 'Main1' || g.phase === 'Main2')
      ? me.hand.filter((c) => !invokeWhy(c)).length
      : 0;

  const phaseButtonLabel =
    g.phase === 'Main1'
      ? `TO CLASH ▸${playableInHand > 0 ? ` · ${playableInHand} PLAYABLE` : ''}`
      : g.phase === 'Clash'
        ? 'SKIP TO MAIN II ▸'
        : g.phase === 'Main2'
          ? me.hand.length > MAX_HAND
            ? `END TURN (shed ${me.hand.length - MAX_HAND}) ▸`
            : `END TURN ▸${playableInHand > 0 ? ` · ${playableInHand} PLAYABLE` : ''}`
          : 'NEXT ▸';

  const showPhaseButton =
    stage === 'play' &&
    (!g.clash || g.clash.step === 'done') &&
    g.phase !== 'Dawn' &&
    g.phase !== 'Dusk' &&
    // The shed picker is a full-screen overlay opened BY this button, but the
    // button sits in the top bar above it and stayed live — clicking it again
    // just re-entered the shed flow, so the overlay never blocked its own
    // opener. Hide it while the picker is up; the picker has its own
    // SHED & END TURN and BACK.
    shedPick === null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      className="w-full h-screen flex flex-col overflow-hidden select-none"
      style={
        {
          background: 'radial-gradient(ellipse at center, var(--c-steel) 0%, var(--c-ink) 78%)',
          // Every combat animation's duration is a multiple of this — see
          // GAME_CSS. Clamped at 1 so FAST doesn't make the feedback
          // subliminal: a player who wants to skim the opponent's turn wants
          // shorter WAITS, not a damage number they can't read.
          '--gv4-pace': fxPaceFor(cpuSpeedIdx),
        } as React.CSSProperties
      }
    >
      <style>{GAME_CSS}</style>

      {/* Top bar: concede, turn/phase tracker, actions */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--c-ink)] shadow-hard-black-xs z-30">
        <button
          onClick={() => {
            if (stage === 'over') concede();
            else
              setConfirmDialog({
                text: 'Concede this match? This will count as a loss.',
                onConfirm: concede,
              });
          }}
          className="tap-44 btn-pop heading-font text-[10px] bg-[var(--c-ink)] text-[var(--c-paper)] px-2 py-0.5 ink-border-sm"
          aria-label="Concede match"
        >
          ✕ CONCEDE
        </button>
        <span className="heading-font text-[11px] text-[var(--c-yellow)] shrink-0">
          TURN {g.turn} · {g.active === HUMAN ? 'YOU' : 'CPU'}
        </span>
        {/* Who won the opening coin-flip. It is randomised per match now, and
            it changes real things (the turn-1 Deal skip, the second player's
            bonus Wellspring), so it can't be left implicit. */}
        {/* Shown on phones too (it's tiny): on a small screen the only other
            evidence of going second was the extra Wellspring itself. Tip
            makes the explanation tappable where `title` never shows. */}
        <Tip
          text={
            g.firstPlayer === HUMAN
              ? 'You went first — you skipped the Deal on turn 1.'
              : 'You went second — you got a second (exhausted) Wellspring on your opening turn.'
          }
          className="heading-font text-[8px] px-1.5 py-0.5 ink-border-sm bg-[var(--c-steel)]/60 text-[var(--c-paper)] shrink-0"
        >
          {g.firstPlayer === HUMAN ? 'ON THE PLAY' : 'ON THE DRAW'}
        </Tip>
        {/* The phase tracker moved out of this bar into its own full-width
            stepper below — see PhaseStepper. */}
        <span className="text-[9px] font-mono text-[var(--c-paper)]/70 truncate hidden sm:inline">
          {humanLabel} vs {cpuLabel}
        </span>
        {/* Every turn action (declare attack, resolve clash, confirm
            guards, advance phase, skip the CPU) now lives on the clash
            divider in the middle of the board, where the player is already
            looking — see the CLASH DIVIDER block below. */}
      </div>

      {/* Phase stepper — always-visible turn progress (board redesign #1) */}
      <PhaseStepper phase={g.phase} yours={g.active === HUMAN} />

      {/* Contextual hint bar */}
      {/* v20: `truncate` clipped this to one line. At 9px on a 375px phone
          that is ~60 characters, and the hint that matters most is the guard
          one — "Unguarded hits incoming: 12 Vitality (you have 9)" sits at the
          END of a ~150-character string, so the single number the bar exists
          to deliver was the first thing cut. Two lines, then clip. */}
      {hint && stage !== 'over' && stage !== 'mulligan' && (
        <div className="shrink-0 px-2 py-0.5 bg-[var(--c-ink)]/70 border-b border-[var(--c-yellow)]/25 text-[9px] font-bold text-[var(--c-yellow)]/90 leading-tight z-20 line-clamp-2 sm:line-clamp-1">
          💡 {hint}
        </div>
      )}

      <CoachOverlay stage={coachStage} />

      {/* Phase banner */}
      {phaseFx && (
        <div className="absolute inset-0 z-[60] pointer-events-none flex items-center justify-center">
          <div className="gv4-phase-banner heading-font text-4xl sm:text-5xl text-[var(--c-yellow)] bg-[var(--c-ink)]/85 px-8 py-3 ink-border-md shadow-hard-black-xs">
            {phaseFx}
          </div>
        </div>
      )}

      {/* The card the opponent is playing right now, held mid-board for the
          length of its beat. A name in a log line is easy to miss; the face
          is not — this is the difference between "something happened" and
          "it cast THAT". */}
      {cpuSpotlight && (
        <div className="absolute inset-0 z-[55] pointer-events-none flex items-center justify-center">
          <div className="gv4-cpu-play flex flex-col items-center gap-1">
            <span className="heading-font text-[10px] bg-[var(--c-red)] text-white px-2 py-0.5 ink-border-sm">
              {cpuLabel} PLAYS
            </span>
            <div className="drop-shadow-[0_10px_28px_rgba(0,0,0,0.7)]">
              <CardFace def={cpuSpotlight} size="standard" />
            </div>
          </div>
        </div>
      )}

      {/* The unit that just left the board, held for the length of the beat
          that says it left. Rendered only when nothing is already being
          spotlit — the played card wins the middle of the board, and a beat is
          never both a play and a death. */}
      {!cpuSpotlight && cpuLostCards.length > 0 && (
        <div className="absolute inset-0 z-[55] pointer-events-none flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <span className="heading-font text-[10px] bg-[var(--c-ink)] text-[var(--c-red)] px-2 py-0.5 ink-border-sm">
              ☠ {cpuLostCards.length > 1 ? 'UNITS LOST' : 'UNIT LOST'}
            </span>
            <div className="flex items-center gap-2">
              {cpuLostCards.map((c) => (
                <div key={c.iid} className="gv4-cpu-lost drop-shadow-[0_10px_28px_rgba(0,0,0,0.7)]">
                  <CardFace def={c.def} size="standard" badge={c.mine ? 'YOURS' : undefined} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top-of-board message column. The CPU narration bubble, the pending
          target bar and the `say()` banner all used to live at the same
          `top-10 z-50` spot as three absolute siblings, so DOM order decided
          which one painted: every `say()` fired while a narration or a target
          pick was up — "Bond set — now pick a target for its effect." above
          all — rendered UNDERNEATH the very bar it was explaining. One
          column, stacked, so they are all visible at once, and the column
          (not each bar) carries the phone-width cap. */}
      <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 flex flex-col items-center gap-1 max-w-[92vw] pointer-events-none">
        {(stage === 'cpu' || narrating) && (
          <div
            role="button"
            tabIndex={0}
            onClick={skipCpuBeats}
            onKeyDown={(e) => {
              // The narration renders nested keyword-link buttons; let their own
              // Enter/Space open the glossary instead of skipping the CPU beats.
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                skipCpuBeats();
              }
            }}
            title="Click to fast-forward the opponent's turn"
            className={cn(
              'pointer-events-auto heading-font text-[11px] px-3 py-1 ink-border-sm shadow-hard-black-xs max-w-[86vw] text-center cursor-pointer select-none',
              // The player's own Dawn runs inside the endPhase that ends the
              // opponent's turn, so its beats ride the same narration — but
              // they are the PLAYER's, and presenting "You draw a card at
              // Dawn." in the opponent's red was a mislabel.
              cpuFocus?.mine
                ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                : 'bg-[var(--c-red)] text-white',
            )}
          >
            {cpuBeat ? (
              <>
                {/* The bubble itself says HELD: the RESUME/STEP buttons live on
                  the divider, and a fresh segment parking on its beat 0 under
                  a hold read as a stuck board to anyone not looking there. */}
                {cpuPaused && (
                  <span className="mr-1 text-[8px] font-black bg-[var(--c-ink)]/60 px-1 py-0.5 ink-border-sm">
                    ❚❚ HELD
                  </span>
                )}
                {cpuFocus?.mine && (
                  <span className="mr-1 text-[8px] font-black">☀ YOUR DAWN —</span>
                )}
                {renderKeywordText(cpuBeat.text)}
                <span className="ml-2 text-[8px] font-mono opacity-80">
                  {cpuBeat.idx + 1}/{cpuBeat.total} · click ▸▸
                </span>
              </>
            ) : (
              <span className="animate-pulse">🤔 {cpuLabel} is thinking…</span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                cycleCpuSpeed();
              }}
              title={SPEED_TOOLTIP}
              aria-label={`Narration speed: ${CPU_SPEEDS[cpuSpeedIdx].label}. Click to change`}
              className="ml-2 text-[8px] font-mono bg-[var(--c-ink)]/60 px-1 py-0.5 ink-border-sm align-middle"
            >
              ⏱ {CPU_SPEEDS[cpuSpeedIdx].label}
            </button>
          </div>
        )}

        {/* What the opponent just did, kept on screen after the narration —
            or after a SKIP — has taken itself away. */}
        {turnRecap && stage === 'play' && !narrating && (
          <div
            className="pointer-events-auto bg-[var(--c-ink)] text-[var(--c-paper)] ink-border-sm shadow-hard-black-xs px-3 py-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 max-w-[92vw]"
            role="status"
          >
            <span className="heading-font text-[10px] text-[var(--c-red)]">
              ⟲ {cpuLabel.toUpperCase()}&apos;S TURN
            </span>
            {turnRecap.cardsPlayed > 0 && (
              <span className="text-[10px] font-bold">
                {turnRecap.cardsPlayed} card{turnRecap.cardsPlayed === 1 ? '' : 's'} played
              </span>
            )}
            {turnRecap.attacked && <span className="text-[10px] font-bold">attacked</span>}
            {turnRecap.vitalityLost > 0 && (
              <span className="text-[10px] font-black text-[var(--c-red)]">
                −{turnRecap.vitalityLost} Vitality (you: {me.vitality})
              </span>
            )}
            {turnRecap.unitsLost > 0 && (
              <span className="text-[10px] font-black text-[var(--c-red)]">
                {turnRecap.unitsLost} of your units lost
              </span>
            )}
            {turnRecap.cardsDrawnByMe > 0 && (
              <span className="text-[10px] font-bold text-[var(--c-yellow)]">
                +{turnRecap.cardsDrawnByMe} card{turnRecap.cardsDrawnByMe === 1 ? '' : 's'} to you
              </span>
            )}
            <button
              onClick={() => {
                setLogExpanded(true);
                setTurnRecap(null);
              }}
              className="heading-font text-[8px] bg-[var(--c-steel)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm"
              title={`Open the Battle Log on ${cpuLabel}'s ${turnRecap.lines} line(s)`}
            >
              ▴ FULL LOG
            </button>
            <button
              onClick={() => setTurnRecap(null)}
              aria-label="Dismiss the turn recap"
              className="heading-font text-[8px] bg-[var(--c-steel)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Pending target bar */}
        {pending && (
          <div className="pointer-events-auto bg-[var(--c-red)] text-white heading-font text-[11px] px-3 py-1 ink-border-sm flex flex-wrap justify-center gap-2 items-center max-w-[92vw]">
            {pending.kind === 'bond'
              ? isPendingTarget(HUMAN)
                ? 'BOND — pick a friendly unit, or your Vitality'
                : 'BOND — pick a friendly unit'
              : pending.kind === 'rebond'
                ? 'RE-BOND — pick a friendly unit'
                : `PICK A TARGET — ${describeEffect(pending.effect)}`}
            <button
              onClick={() => setPending(null)}
              aria-label="Cancel targeting"
              className="bg-[var(--c-ink)] px-1"
            >
              ✕
            </button>
          </div>
        )}
        {banner && (
          <div
            // Keyed so a second refusal in a row re-runs the shake — the same
            // message repeated with no motion read as "nothing happened".
            key={`${banner.tone}:${banner.text}`}
            role={banner.tone === 'warn' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto heading-font text-[11px] px-3 py-1 ink-border-sm shadow-hard-black-xs text-center',
              banner.tone === 'warn'
                ? 'gv4-banner-shake bg-[var(--c-red)] text-white'
                : 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
            )}
          >
            {banner.text}
          </div>
        )}
      </div>

      {/* Clash bar — attacker → guard lines (both directions). Drops at step
          'done': the clash has resolved and only lingers until endPhase. */}
      {/* 'respond' kept in: a reaction-window invoke opens a response window
          mid-clash, and hiding the guard lines exactly while the player is
          deciding whether to counter made the decision blind. */}
      {g.clash &&
        g.clash.step !== 'done' &&
        (stage === 'play' || stage === 'cpuGuard' || stage === 'respond') && (
          <div className="absolute left-1/2 top-[4.6rem] -translate-x-1/2 z-40 bg-[var(--c-ink)]/95 ink-border-sm px-2 py-1 max-w-[92vw] flex flex-wrap gap-x-3 gap-y-0.5 items-center">
            <span className="heading-font text-[9px] text-[var(--c-red)]">
              {g.active === HUMAN ? '⚔ YOUR ATTACK' : `⚔ ${cpuLabel} ATTACKS`}
            </span>
            {clashLines.map((line) => (
              <button
                key={line.iid}
                onClick={guardStep ? () => setGuardFocus(line.iid) : undefined}
                className={cn(
                  'text-[8.5px] font-bold px-1 py-0.5 leading-tight text-left',
                  guardStep
                    ? guardFocus === line.iid
                      ? 'bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm'
                      : 'bg-[var(--c-steel)]/60 text-[var(--c-paper)] ink-border-sm btn-pop'
                    : 'text-[var(--c-paper)]/85',
                )}
              >
                #{line.n} {line.name} ⚔{line.might} →{' '}
                {line.guards.length > 0 ? line.guards.join(' + ') : guardStep ? 'unguarded' : 'YOU'}
              </button>
            ))}
            {reactionStep && (
              <span className="text-[8px] font-bold text-[#29B6F6]">
                REACTION WINDOW — Quick / Ambush cards playable
              </span>
            )}
          </div>
        )}

      {/* The stack — top of the list resolves first. Only worth showing while
          something is actually waiting on it, which outside a response window
          is never more than an instant. */}
      {g.stack.length > 0 && (
        <div className="absolute left-1/2 top-[7.4rem] -translate-x-1/2 z-40 bg-[var(--c-ink)]/95 ink-border-sm px-2 py-1 max-w-[92vw] flex flex-col gap-0.5">
          <span className="heading-font text-[9px] text-[#29B6F6]">
            ▤ STACK — resolves top-first
          </span>
          {[...g.stack].reverse().map((item, i) => (
            <span
              key={item.id}
              className={cn(
                'text-[8.5px] font-bold leading-tight',
                i === 0 ? 'text-[var(--c-yellow)]' : 'text-[var(--c-paper)]/70',
              )}
            >
              {item.controller === HUMAN ? 'YOU' : cpuLabel} · {item.sourceName}
              {item.kind === 'trigger' ? ' (trigger)' : ''}
            </span>
          ))}
          {inMyResponse && (
            <span className="text-[8px] font-bold text-[#29B6F6]">
              YOUR RESPONSE — Quick / Ambush cards playable, or pass
            </span>
          )}
        </div>
      )}

      {/* ================= OPPONENT LANE ================= */}
      <div className="h-[3px] w-full bg-[var(--c-red)]/70 shrink-0" />
      <LeaderLane
        p={foe}
        isHuman={false}
        label={cpuLabel}
        vitTargetable={!!pending && isPendingTarget(CPU)}
        onVitClick={pending && isPendingTarget(CPU) ? () => resolvePendingOn(CPU) : undefined}
        onInspect={() => setInspect(foe.leader.def)}
        floats={floatsFor(`vit:${CPU}`)}
        flash={flashIids.has(`vit:${CPU}`)}
        cpuActing={!!cpuFocus?.leaderActing}
        cpuVitTarget={!!cpuFocus?.targets.includes(CPU)}
        right={
          <>
            {essenceTotal(foe.essence) > 0 && <EssencePips pool={foe.essence} size={13} />}
            <span className="text-[8px] font-bold text-[var(--c-paper)]/60">
              hand {foe.hand.length} · deck {foe.deck.length}
            </span>
            <button
              onClick={() => setShowAsh((s) => (s === 'foe' ? false : 'foe'))}
              className="tap-44 btn-pop text-[8px] font-bold bg-[var(--c-steel)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm"
              title="Inspect the opponent's ash-pile and void"
            >
              ASH {foe.ashPile.length}
              {foe.voidPile.length > 0 ? ` · VOID ${foe.voidPile.length}` : ''}
            </button>
          </>
        }
      />
      <LocationsLane
        locations={foe.locations}
        tappable={false}
        mine={false}
        onInspect={(l) => setInspect(l.def!)}
      />
      <div className="flex gap-2 justify-center items-start px-2 py-2 min-h-[84px] sm:min-h-[122px] overflow-x-auto overflow-y-auto flex-1 basis-0">
        {foe.field.length === 0 && (
          <div className="w-full max-w-[560px] h-[70px] self-center border-2 border-dashed border-[var(--c-paper)]/15 rounded-md flex items-center justify-center">
            <span className="text-[9px] text-[var(--c-paper)]/30 font-bold uppercase tracking-wide">
              Empty Field
            </span>
          </div>
        )}
        {foe.field.map((u) => {
          const targetable = !!pending && isPendingTarget(u.iid);
          const attacking =
            cpuAttackerIids.includes(u.iid) ||
            (g.clash?.step !== 'done' && g.clash?.attackers.includes(u.iid));
          const focusLine = guardStep && guardFocus === u.iid;
          return (
            <BoardUnit
              key={u.iid}
              g={g}
              u={u}
              highlight={targetable || !!focusLine}
              isAttacker={!!attacking}
              flash={flashIids.has(u.iid)}
              acting={!!cpuFocus?.actors.includes(u.iid)}
              acted={!!cpuFocus?.targets.includes(u.iid)}
              lunge={!!cpuFocus?.attacking && cpuFocus.actors.includes(u.iid)}
              floats={floatsFor(u.iid)}
              guardNote={
                attacking ? `#${(g.clash?.attackers.indexOf(u.iid) ?? 0) + 1} ATTACKING` : undefined
              }
              onClick={
                targetable
                  ? () => resolvePendingOn(u.iid)
                  : guardStep && cpuAttackerIids.includes(u.iid)
                    ? () => setGuardFocus(u.iid)
                    : () => setInspect(u.def)
              }
            />
          );
        })}
      </div>

      {/* ================= CLASH DIVIDER =================
          The one loud action on the whole board. Everything else stays
          ink-on-paper so whatever sits here always reads as the primary move. */}
      {/* flex-wrap: the narration branch can carry four controls (speed, hold,
          step, skip) and a 375px phone has no room for them on one line. The
          extra right padding is scoped to that branch only — the LOG button is
          absolutely positioned at the right edge, and reserving room for it
          unconditionally would shift every other branch's centred primary
          action (DECLARE ATTACK, RESOLVE CLASH) off centre. */}
      <div
        className={cn(
          'relative shrink-0 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 px-2 py-1.5 bg-[var(--c-ink)]/55 border-y-2 border-dashed border-[var(--c-yellow)]/35',
          // guardStep too: SUGGEST + CLEAR + CONFIRM GUARDS wrap on a phone,
          // and without the reserved padding the absolutely-positioned LOG
          // button painted over CONFIRM's right edge and ate its taps.
          (stage === 'cpu' || narrating || guardStep) && 'pr-14',
        )}
      >
        {/* Narration owns the divider whenever the opponent is acting — during
            its whole turn AND during the reaction beats that play out inside
            the human's own clash. Checked FIRST so those beats can't leave
            RESOLVE CLASH live underneath a narration the player is watching. */}
        {stage === 'cpu' || narrating ? (
          <>
            <button
              onClick={cycleCpuSpeed}
              title={SPEED_TOOLTIP}
              aria-label={`Narration speed: ${CPU_SPEEDS[cpuSpeedIdx].label}. Click to change`}
              className="btn-pop heading-font text-[10px] bg-[var(--c-ink)] text-[var(--c-paper)] px-2 py-2 ink-border-md tracking-wide"
            >
              ⏱ {CPU_SPEEDS[cpuSpeedIdx].label}
            </button>
            <button
              onClick={toggleCpuPause}
              title={
                cpuPaused
                  ? 'Resume the opponent’s turn'
                  : 'Hold this beat on screen — then step through the turn one action at a time'
              }
              aria-pressed={cpuPaused}
              className={cn(
                'btn-pop heading-font text-[10px] px-2 py-2 ink-border-md tracking-wide',
                cpuPaused
                  ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                  : 'bg-[var(--c-ink)] text-[var(--c-paper)]',
              )}
            >
              {cpuPaused ? '▶ RESUME' : '❚❚ HOLD'}
            </button>
            {cpuPaused && (
              <button
                onClick={stepCpuBeat}
                title="Advance one action"
                className="btn-pop heading-font text-[10px] bg-[var(--c-yellow)] text-[var(--c-ink)] px-2 py-2 ink-border-md tracking-wide"
              >
                ▸ STEP
              </button>
            )}
            <button
              onClick={skipCpuBeats}
              data-primary="1"
              className="btn-pop heading-font text-sm bg-[var(--c-steel)] text-[var(--c-paper)] px-4 py-2 ink-border-md shadow-hard-black-xs tracking-wide"
            >
              SKIP ▸▸
            </button>
            {/* How far through the opponent's turn this is. The count exists
                already — "3/52" is printed inside the narration bubble at the
                TOP of the board — but the controls that act on it (HOLD, STEP,
                SKIP) are down here, so the one question those controls are
                pressed to answer ("how much of this is left?") was two feet
                away from them on a desktop and off screen on a phone. A bar,
                where the buttons are. */}
            {cpuBeat && cpuBeat.total > 1 && (
              <div
                className="w-full flex items-center gap-1.5 px-1"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={cpuBeat.total}
                aria-valuenow={cpuBeat.idx + 1}
                aria-label={`Opponent's turn: action ${cpuBeat.idx + 1} of ${cpuBeat.total}`}
              >
                <span className="h-1.5 flex-1 bg-[var(--c-paper)]/15 ink-border-sm overflow-hidden">
                  <span
                    className="block h-full bg-[var(--c-red)]"
                    style={{
                      width: `${Math.round(((cpuBeat.idx + 1) / cpuBeat.total) * 100)}%`,
                      // Matched to the beat dwell so the bar creeps forward
                      // with the narration instead of stepping after it.
                      transition: 'width 220ms linear',
                    }}
                  />
                </span>
                <span className="font-mono text-[8px] text-[var(--c-paper)]/70 shrink-0">
                  {cpuBeat.idx + 1}/{cpuBeat.total}
                </span>
              </div>
            )}
          </>
        ) : stage === 'play' && g.phase === 'Clash' && !g.clash && atkSel.size > 0 ? (
          <>
            {myAttackers.length > atkSel.size && (
              <button
                onClick={() => setAtkSel(new Set(myAttackers.map((u) => u.iid)))}
                title="Send every ready unit"
                className="btn-pop heading-font text-[10px] bg-[var(--c-ink)] text-[var(--c-paper)] px-3 py-2 ink-border-md tracking-wide"
              >
                ALL ×{myAttackers.length}
              </button>
            )}
            {/* v20: Escape has cleared the selection since v17 and ALL ×N has
                filled it since v16 — but there was no visible way to EMPTY it,
                so a touch player who picked the wrong three attackers had to
                find and re-tap each one. Undo belongs next to the commit. */}
            <button
              onClick={() => setAtkSel(new Set())}
              title="Clear the attack selection (Esc)"
              className="btn-pop heading-font text-[10px] bg-[var(--c-ink)] text-[var(--c-paper)] px-3 py-2 ink-border-md tracking-wide"
            >
              ✕ CLEAR
            </button>
            <button
              onClick={declareMyAttack}
              data-primary="1"
              className="btn-pop heading-font text-sm bg-[var(--c-yellow)] text-[var(--c-ink)] px-6 py-2 ink-border-md shadow-hard-black-xs tracking-wide animate-pulse"
            >
              {/* The Might going in, not just the head count: "3 units" says
                  nothing about whether this is lethal, and the player was
                  adding it up off the cards by hand.
                  v26 finishes that sentence. The button printed the Might and
                  left the comparison — against a Vitality plate at the far end
                  of the board — to the player, which is exactly the arithmetic
                  it exists to do. "IF UNGUARDED" because the opponent still
                  gets its guard step; this is the ceiling, not a promise. */}
              ⚔ DECLARE ATTACK — {atkSel.size} · {selectedMight} MIGHT
              {selectedMight >= foe.vitality && foe.vitality > 0 ? ' · LETHAL IF UNGUARDED' : ''}
            </button>
          </>
        ) : stage === 'play' && g.clash && g.clash.step !== 'done' ? (
          <button
            onClick={resolveMyClash}
            data-primary="1"
            className="btn-pop heading-font text-sm bg-[var(--c-red)] text-white px-6 py-2 ink-border-md shadow-hard-black-xs tracking-wide animate-pulse"
          >
            {resolveClashLabel}
          </button>
        ) : guardStep ? (
          <>
            {me.field.some((u) => !u.exhausted) && (
              <button
                onClick={suggestGuards}
                title="Fill the guard lines with the CPU's own blocking heuristic — then edit or confirm"
                className="btn-pop heading-font text-[10px] bg-[var(--c-yellow)] text-[var(--c-ink)] px-3 py-2 ink-border-md tracking-wide"
              >
                ✦ SUGGEST
              </button>
            )}
            {/* Same gap as the attacker side, and worse here: ✦ SUGGEST fills
                every line at once, so "not that — let me do it myself" is the
                obvious next click and Escape was the only thing that did it. */}
            {Object.keys(guardSel).length > 0 && (
              <button
                onClick={() => setGuardSel({})}
                title="Clear every guard assignment (Esc)"
                className="btn-pop heading-font text-[10px] bg-[var(--c-ink)] text-[var(--c-paper)] px-3 py-2 ink-border-md tracking-wide"
              >
                ✕ CLEAR
              </button>
            )}
            <button
              onClick={confirmGuards}
              data-primary="1"
              disabled={!!guardProblem}
              title={guardProblem ?? undefined}
              className={cn(
                'heading-font text-sm px-6 py-2 ink-border-md shadow-hard-black-xs tracking-wide',
                guardProblem
                  ? 'bg-[var(--c-steel)]/60 text-[var(--c-paper)]/60'
                  : 'btn-pop bg-[#29B6F6] text-[var(--c-ink)] animate-pulse',
              )}
            >
              {/* v28 — the attacker's side of this divider has printed the
                  arithmetic since v26 (`DECLARE ATTACK — 3 · 11 MIGHT ·
                  LETHAL IF UNGUARDED`); the defender's side printed it only
                  while NOTHING was guarded, and dropped it the moment the
                  player assigned their first guard — which is precisely when
                  "and what still gets through?" becomes the question. Same
                  sentence, both directions, at every stage of the assignment. */}
              {guardConfirmLabel(
                incomingIfConfirmed,
                me.vitality,
                Object.keys(guardSel).length > 0,
              )}
            </button>
          </>
        ) : reactionStep ? (
          <button
            onClick={resolveCpuClash}
            data-primary="1"
            className="btn-pop heading-font text-sm bg-[var(--c-red)] text-white px-6 py-2 ink-border-md shadow-hard-black-xs tracking-wide animate-pulse"
          >
            {resolveClashLabel}
          </button>
        ) : inMyResponse ? (
          <button
            onClick={passMyPriority}
            data-primary="1"
            className="btn-pop heading-font text-sm bg-[#29B6F6] text-[var(--c-ink)] px-6 py-2 ink-border-md shadow-hard-black-xs tracking-wide animate-pulse"
          >
            ⏭ PASS — LET IT RESOLVE
          </button>
        ) : showPhaseButton ? (
          <button
            onClick={advanceMyPhase}
            data-primary="1"
            className={cn(
              'btn-pop heading-font text-sm px-6 py-2 ink-border-md shadow-hard-black-xs tracking-wide',
              g.phase === 'Main2'
                ? 'bg-[var(--c-red)] text-white'
                : 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
            )}
          >
            {phaseButtonLabel}
          </button>
        ) : (
          <span className="heading-font text-[9px] text-[var(--c-paper)]/35 tracking-[2px] py-2">
            — CLASH LINE —
          </span>
        )}
        {/* The Space shortcut, where the thing it presses is. A shortcut
            nobody is told about is a shortcut nobody uses; pointer-only
            screens (phones) don't have the key, so they don't get the chip. */}
        {viewportW >= 640 && stage !== 'over' && stage !== 'mulligan' && (
          <span
            className="absolute left-2 heading-font text-[8px] text-[var(--c-paper)]/40 tracking-[1px] hidden sm:inline"
            aria-hidden
          >
            ␣ SPACE
          </span>
        )}
        {/* Battle log lives on the divider so it never competes with either
            player's lane for vertical space. */}
        <button
          onClick={() => setLogExpanded((e) => !e)}
          className="tap-44 absolute right-2 btn-pop text-[8px] font-bold bg-[var(--c-steel)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm"
          title={logExpanded ? 'Hide the Battle Log' : 'Show the Battle Log'}
        >
          {logExpanded ? '▾ LOG' : '▴ LOG'}
        </button>
      </div>

      {logExpanded && (
        <div
          ref={logScrollRef}
          className="shrink-0 max-h-[132px] overflow-y-auto bg-[var(--c-ink)] border-b-2 border-[var(--c-yellow)]/30 px-2 py-1 text-[8px] font-mono text-[var(--c-paper)]/70 leading-tight"
        >
          <div className="text-[7px] font-black text-[var(--c-paper)]/40 uppercase tracking-wide sticky top-0 bg-[var(--c-ink)]">
            Battle Log
          </div>
          {g.log.slice(-160).map((l, i, arr) => {
            const abs = g.log.length - arr.length + i;
            return (
              <React.Fragment key={abs}>
                {/* Where the opponent's most recent turn starts. The log is
                    the only place a player who skipped the narration can find
                    out what happened, and an undivided wall of lines makes
                    "what did it just do" a counting exercise. */}
                {abs === handoffAt && (
                  <div className="my-0.5 flex items-center gap-1 text-[7px] font-black text-[var(--c-yellow)] uppercase tracking-wide">
                    <span className="flex-1 border-t border-[var(--c-yellow)]/40" />
                    since your last turn
                    <span className="flex-1 border-t border-[var(--c-yellow)]/40" />
                  </div>
                )}
                <div>· {renderKeywordText(humanize(l), true)}</div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* ================= PLAYER LANE ================= */}
      <div className="flex gap-2 justify-center items-start px-2 py-2 min-h-[84px] sm:min-h-[122px] overflow-x-auto overflow-y-auto flex-1 basis-0">
        {me.field.length === 0 && (
          <div className="w-full max-w-[560px] h-[70px] self-center border-2 border-dashed border-[var(--c-paper)]/15 rounded-md flex items-center justify-center">
            <span className="text-[9px] text-[var(--c-paper)]/30 font-bold uppercase tracking-wide">
              Empty Field
            </span>
          </div>
        )}
        {me.field.map((u) => {
          const targetable = !!pending && isPendingTarget(u.iid);
          const canAtt =
            stage === 'play' &&
            g.phase === 'Clash' &&
            !g.clash &&
            myAttackers.some((x) => x.iid === u.iid);
          const guardAssigned = guardOf(u.iid);
          const isDeclaredGuard =
            !!g.clash &&
            g.clash.step !== 'guards' &&
            g.clash.step !== 'done' &&
            Object.values(g.clash.guards).some((gs: string[]) => gs.includes(u.iid));
          const canGuardNow =
            guardStep && !!guardFocus && legalGuardsFor(g, guardFocus).some((x) => x.iid === u.iid);
          return (
            <BoardUnit
              key={u.iid}
              g={g}
              u={u}
              isAttacker={
                atkSel.has(u.iid) ||
                (!!g.clash && g.clash.step !== 'done' && g.clash.attackers.includes(u.iid))
              }
              isGuard={!!guardAssigned || isDeclaredGuard}
              highlight={targetable || (canAtt && !atkSel.has(u.iid)) || canGuardNow}
              flash={flashIids.has(u.iid)}
              acted={!!cpuFocus?.targets.includes(u.iid)}
              floats={floatsFor(u.iid)}
              guardNote={
                guardAssigned
                  ? `guards #${(g.clash?.attackers.indexOf(guardAssigned) ?? 0) + 1}`
                  : undefined
              }
              onClick={
                targetable
                  ? () => resolvePendingOn(u.iid)
                  : guardStep
                    ? () => toggleGuard(u.iid)
                    : canAtt || atkSel.has(u.iid)
                      ? () => toggleAttacker(u.iid)
                      : () => setInspect(u.def)
              }
            />
          );
        })}
      </div>

      <LocationsLane
        locations={me.locations}
        tappable={canTapNow}
        mine
        onTap={(l) => tryTapLocation(l)}
        onInspect={(l) => setInspect(l.def!)}
      >
        {inMyMain && !me.wellspringPlayedThisTurn && (
          <span className="flex items-center gap-0.5 bg-[var(--c-ink)] ink-border-sm px-1 py-0.5 shrink-0">
            <span className="text-[7px] font-black text-[var(--c-yellow)]">
              {/* On the draw, the opening turn carries two — say so, or a
                  player has no way to know the second one is available. */}
              {wellspringsLeft > 1 ? `+ WELLSPRING ×${wellspringsLeft}` : '+ WELLSPRING'}
            </span>
            {wellspringChoices(g, HUMAN).map((t) => {
              const need = wellspringNeed[t] ?? 0;
              return (
                <button
                  key={t}
                  onClick={() => tryWellspring(t)}
                  // Disabled rather than live-and-refusing: see `wellspringWhy`.
                  disabled={!!wellspringWhy}
                  title={
                    wellspringWhy ??
                    (need > 0
                      ? `Unlocks ${need} card${need === 1 ? '' : 's'} in your hand. `
                      : `Unlocks nothing in hand right now. `) +
                      (wellspringsLeft > 1
                        ? `${wellspringsLeft} Wellsprings left this turn (you are on the draw; the second arrives exhausted).`
                        : `Play a ${t} Wellspring (free).`)
                  }
                  aria-label={
                    wellspringWhy
                      ? `Play a ${t} Wellspring — unavailable: ${wellspringWhy}`
                      : need > 0
                        ? `Play a ${t} Wellspring — unlocks ${need} card${need === 1 ? '' : 's'} in hand`
                        : `Play a ${t} Wellspring`
                  }
                  // tap-44: these are 16px dots in a dense lane, which is under
                  // any usable touch target. The class widens the HIT area with
                  // a pseudo-element and leaves the layout alone.
                  className={cn(
                    'tap-44 flex items-center justify-center rounded-full font-mono font-black border border-white/70',
                    wellspringWhy ? 'opacity-40 cursor-not-allowed' : 'btn-pop',
                    !wellspringWhy &&
                      need > 0 &&
                      'ring-2 ring-[var(--c-yellow)] ring-offset-1 ring-offset-[var(--c-ink)]',
                  )}
                  style={{
                    width: 16,
                    height: 16,
                    fontSize: 9,
                    backgroundColor: COLOR_PIP[t].bg,
                    color: COLOR_PIP[t].fg,
                  }}
                >
                  <EssenceIcon type={t} color={COLOR_PIP[t].fg} size={10} />
                </button>
              );
            })}
          </span>
        )}
        {me.unbondedItems.map((c) => {
          const why = rebondWhy(c.iid);
          return (
            <button
              key={c.iid}
              onClick={() => tryRebond(c.iid)}
              disabled={!!why}
              title={
                why ??
                `Re-bond ${c.def.name} to a friendly unit for ${c.def.rebondCost ?? 0} essence`
              }
              aria-label={
                why
                  ? `Re-bond ${c.def.name} — unavailable: ${why}`
                  : `Re-bond ${c.def.name} for ${c.def.rebondCost ?? 0} essence`
              }
              className={cn(
                'text-[7.5px] font-black bg-[#8E44AD] text-white px-1 py-0.5 ink-border-sm shrink-0',
                why ? 'opacity-40 cursor-not-allowed' : 'btn-pop',
              )}
            >
              💠 {c.def.name} · RE-BOND {c.def.rebondCost ?? 0}
            </button>
          );
        })}
        <Tip
          text="Locations produce your Essence — exhaust one to add a pip. Invoking auto-taps whatever the cost needs. The pool empties at the end of every phase."
          className="tap-44 text-[9px] bg-[var(--c-steel)] text-white ink-border-sm px-1 shrink-0"
        >
          ?
        </Tip>
      </LocationsLane>

      <LeaderLane
        p={me}
        isHuman
        label={humanLabel}
        vitTargetable={!!pending && isPendingTarget(HUMAN)}
        onVitClick={pending && isPendingTarget(HUMAN) ? () => resolvePendingOn(HUMAN) : undefined}
        onInvoke={tryInvokeLeader}
        invokeWhy={leaderInvokeWhy}
        onAbility={tryLeaderAbility}
        abilityWhy={abilityWhy}
        onInspect={() => setInspect(me.leader.def)}
        floats={floatsFor(`vit:${HUMAN}`)}
        flash={flashIids.has(`vit:${HUMAN}`)}
        cpuVitTarget={!!cpuFocus?.targets.includes(HUMAN)}
        right={
          <>
            <span className="text-[8px] font-bold text-[var(--c-paper)]/60">
              deck {me.deck.length}
              {me.voidPile.length > 0 ? ` · void ${me.voidPile.length}` : ''}
            </span>
            <button
              onClick={() => setShowAsh((s) => (s === 'me' ? false : 'me'))}
              className="tap-44 btn-pop text-[8px] font-bold bg-[var(--c-steel)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm"
            >
              ASH-PILE {me.ashPile.length}
            </button>
          </>
        }
      />

      {/* Hand dock — fan of cards along the very bottom; hover/click a card
          to open the enlarged preview above it and INVOKE from the preview. */}
      <div
        className="relative shrink-0 z-30 bg-[var(--c-ink)]/85 border-t-2 border-[var(--c-yellow)]/50"
        onMouseLeave={() => {
          clearHoverIntent();
          if (!previewPinned) setPreview(null);
        }}
      >
        {previewCard && (
          <div
            className={cn(
              'absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-40 flex gap-2 bg-[var(--c-ink)]/95 ink-border-md p-2 shadow-hard-black-xs',
              previewStack ? 'flex-col items-center' : 'items-stretch',
            )}
          >
            <div
              className="relative shrink-0"
              style={{
                width: CARD_SIZES.full.w * previewScale,
                height: CARD_SIZES.full.h * previewScale,
              }}
            >
              <div
                className="absolute top-0 left-0"
                style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left' }}
              >
                <CardFace def={previewCard.def} size="full" introduceKeywords />
              </div>
            </div>
            <div className={cn('flex flex-col gap-1.5', previewStack ? 'w-full' : 'w-[160px]')}>
              <button
                onClick={closePreview}
                aria-label="Close preview"
                className="btn-pop self-end text-[9px] font-bold bg-[var(--c-steel)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm"
              >
                ✕ CLOSE
              </button>
              <button
                onClick={() => tryInvoke(previewCard.iid)}
                disabled={!!previewWhy}
                className={cn(
                  'heading-font text-sm px-3 py-2 ink-border-md shadow-hard-black-xs',
                  previewWhy
                    ? 'bg-[var(--c-steel)]/50 text-[var(--c-paper)]/40 cursor-not-allowed'
                    : 'btn-pop bg-[var(--c-yellow)] text-[var(--c-ink)]',
                )}
              >
                {previewCard.def.type === 'Item'
                  ? 'INVOKE — BOND'
                  : needsTarget(previewCard.def.onInvoke)
                    ? 'INVOKE — PICK TARGET'
                    : 'INVOKE'}
              </button>
              {previewWhy ? (
                <span className="text-[9px] font-bold text-[var(--c-red)] leading-tight">
                  {previewWhy}
                </span>
              ) : (
                <span className="text-[9px] font-bold text-[var(--c-yellow)]/90 leading-tight">
                  Cost {totalCost(effectiveCost(g, HUMAN, previewCard.def))}
                  {totalCost(effectiveCost(g, HUMAN, previewCard.def)) !==
                  totalCost(previewCard.def.cost)
                    ? ' (Surge discount)'
                    : ''}{' '}
                  — Locations auto-tap to pay.
                </span>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 px-2 pt-1">
          <span className="text-[8px] font-bold text-[var(--c-paper)]/70">
            HAND {me.hand.length}/{MAX_HAND} · tap or hover to preview · double-click to play
            {inMyReaction || reactionStep
              ? ' · REACTION: Quick & Ambush only'
              : inMyResponse
                ? ' · RESPONDING: Quick & Ambush only'
                : ''}
          </span>
          {/* Hand order. The dock has always laid cards out in DRAW order,
              which is no order at all to look at: the one card you can afford
              sits wherever it happened to be drawn, and finding it in a
              ten-card fan is a scan of every face — every phase, every turn.
              PLAYABLE floats exactly the cards `invokeWhy` says are castable
              right now, so the answer to "what can I do" is the left-hand end
              of the dock. */}
          {me.hand.length > 1 && (
            <button
              onClick={cycleHandSort}
              title={`Hand order: ${handSortEntry.blurb}. Click to change.`}
              aria-label={`Hand order: ${handSortEntry.blurb}. Click to change`}
              className="ml-auto btn-pop heading-font text-[8px] bg-[var(--c-ink)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm shrink-0"
            >
              {handSortEntry.label}
            </button>
          )}
        </div>
        <div
          className={cn(
            'relative h-[92px] sm:h-[118px]',
            // The strip scrolls sideways; the fan is clipped as before.
            handStrip ? 'overflow-x-auto overflow-y-hidden' : 'overflow-hidden',
          )}
          style={handStrip ? undefined : { perspective: 800 }}
        >
          {me.hand.length === 0 && (
            <span className="absolute inset-x-0 top-6 text-center text-[9px] text-[var(--c-paper)]/30 font-bold">
              — empty hand —
            </span>
          )}
          <div
            className={cn(
              'flex',
              handStrip
                ? // A scrolling row: full-width cards, snapped, with enough
                  // trailing room that the last card can reach the left edge.
                  'gap-1.5 px-2 pt-1 w-max snap-x snap-mandatory'
                : 'absolute left-1/2 bottom-0 -translate-x-1/2',
            )}
          >
            {handView.map((c, i) => {
              const why = invokeWhy(c);
              const n = handView.length;
              const mid = (n - 1) / 2;
              const off = i - mid;
              const angle = Math.max(-22, Math.min(22, off * (n > 8 ? 5 : 7)));
              const arcDrop = Math.abs(off) * 3;
              const isFocused = preview === c.iid;
              // Tapping the card that is already pinned closes it again. It
              // used to be a one-way door — the only ways out were ✕ CLOSE,
              // Escape or moving the pointer off the whole dock, none of which
              // is where a touch player's thumb already is.
              const activate = () => {
                clearHoverIntent();
                if (isFocused && previewPinned) {
                  closePreview();
                  return;
                }
                setPreview(c.iid);
                setPreviewPinned(true);
              };
              return (
                <div
                  key={c.iid}
                  role="button"
                  tabIndex={0}
                  aria-label={`${c.def.name} — preview and invoke`}
                  className={cn('relative shrink-0 outline-none', handStrip && 'snap-start')}
                  style={{
                    width: CARD_SIZES.compact.w,
                    height: CARD_SIZES.compact.h,
                    marginLeft: handStrip || i === 0 ? 0 : -fanOverlap,
                    zIndex: isFocused ? 50 : i,
                  }}
                  onMouseEnter={() => previewIntent(c.iid)}
                  onFocus={() => {
                    clearHoverIntent();
                    setPreview(c.iid);
                  }}
                  onClick={activate}
                  // v26 — double-click plays it. Every card in the game costs
                  // three interactions to cast on a desktop (click the card,
                  // read the preview, click INVOKE), and the preview is a
                  // reference the player rarely needs for the fifth copy of a
                  // Wellspring or a card they picked out of their own deck.
                  // Refusals still go through `tryInvoke`, so a double-click on
                  // an unaffordable card explains itself in the banner exactly
                  // as the button does rather than doing nothing.
                  onDoubleClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    e.preventDefault();
                    closePreview();
                    tryInvoke(c.iid);
                  }}
                  onKeyDown={(e) => {
                    // Nested cost/keyword chips inside the card handle their
                    // own Enter/Space — don't pin the preview on their behalf.
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      activate();
                    }
                  }}
                >
                  <div
                    className="pointer-events-none transition-transform duration-150 ease-out"
                    style={{
                      transformOrigin: 'bottom center',
                      // Strip: no fan geometry at all — the card sits flat at
                      // the top of the dock so its masthead is legible, and
                      // the focused one only lifts by the 2px the dock has.
                      transform: handStrip
                        ? isFocused
                          ? 'translateY(-2px) scale(1.02)'
                          : 'translateY(0)'
                        : isFocused
                          ? `translateY(-84px) rotate(0deg) scale(1.04)`
                          : `translateY(${70 + arcDrop}px) rotate(${angle}deg)`,
                    }}
                  >
                    <CardFace
                      def={c.def}
                      size="compact"
                      dimmed={!!why}
                      // During the clash reaction window, playable Quick /
                      // Ambush cards light up so the window is discoverable.
                      highlight={
                        preview === c.iid ||
                        ((inMyReaction || reactionStep || inMyResponse) && !why)
                      }
                      introduceKeywords
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dusk shed picker — choose which cards go to the ash-pile. */}
      {shedPick !== null && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--c-ink)] ink-border-md p-3 max-w-[720px] w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="heading-font text-sm text-[var(--c-yellow)]">
                SHED TO {MAX_HAND} — pick {me.hand.length - MAX_HAND} card
                {me.hand.length - MAX_HAND === 1 ? '' : 's'} to discard
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    // Sensible cuts: shed the highest-cost cards first (the
                    // ones least likely to be castable soon).
                    const need = me.hand.length - MAX_HAND;
                    const byCost = [...me.hand].sort(
                      (a, b) => totalCost(b.def.cost) - totalCost(a.def.cost),
                    );
                    setShedPick(byCost.slice(0, Math.max(0, need)).map((c) => c.iid));
                  }}
                  // The accessible name must CONTAIN the visible label (WCAG
                  // 2.5.3): an aria-label of "Auto-select cards to shed"
                  // replaced it outright, so voice control could not act on
                  // the word a player actually sees.
                  aria-label="Suggest — auto-select cards to shed"
                  className="btn-pop text-[10px] bg-[var(--c-yellow)] text-[var(--c-ink)] px-1.5 ink-border-sm"
                >
                  ✦ SUGGEST
                </button>
                {!shedForced && (
                  <button
                    onClick={() => setShedPick(null)}
                    aria-label="Back — cancel shedding"
                    className="btn-pop text-[10px] bg-[var(--c-steel)] text-[var(--c-paper)] px-1.5 ink-border-sm"
                  >
                    ✕ BACK
                  </button>
                )}
              </div>
            </div>
            {/* v28 — `handView`, not `me.hand`. v27 gave the dock a DRAWN /
                PLAYABLE / COST order and deliberately left this picker on
                engine order, on the grounds that the sort is presentation. It
                is — and this is the one screen where the presentation matters
                MOST: the player is being asked to choose the worst cards in
                their hand, ✦ SUGGEST answers by cost, and the picker was
                showing them a different arrangement from the dock they had
                just been reading. The engine still receives iids, so nothing
                about what is shed changes. */}
            <div className="flex flex-wrap gap-2 justify-center">
              {handView.map((c) => {
                const sel = shedPick.includes(c.iid);
                // A <div role="button">, not a <button>: CardFace renders its
                // own interactive Essence Cost info button internally, and a
                // <button> can't legally contain another <button> (invalid
                // HTML — React warns of a hydration error, and it's also a
                // real a11y bug since nested buttons confuse screen readers
                // about which control activates on a click/Enter). Same
                // pattern already used for the hand's preview cards above.
                const toggle = () =>
                  setShedPick((s) =>
                    s === null
                      ? s
                      : sel
                        ? s.filter((x) => x !== c.iid)
                        : s.length < me.hand.length - MAX_HAND
                          ? [...s, c.iid]
                          : s,
                  );
                return (
                  <div
                    key={c.iid}
                    role="button"
                    tabIndex={0}
                    onClick={toggle}
                    onKeyDown={(e) => {
                      // Nested cost/keyword chips inside the card handle their
                      // own Enter/Space — don't toggle shed selection for them.
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle();
                      }
                    }}
                    aria-pressed={sel}
                    aria-label={`${sel ? 'Keep' : 'Shed'} ${c.def.name}`}
                    className={cn(
                      'relative rounded-[3px] outline-none cursor-pointer',
                      sel && 'ring-4 ring-[var(--c-red)]',
                    )}
                  >
                    <CardFace def={c.def} size="compact" dimmed={sel} />
                    {sel && (
                      <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center heading-font text-[11px] text-white bg-[var(--c-red)]/90 py-0.5">
                        SHED
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center mt-3">
              <button
                disabled={shedPick.length !== me.hand.length - MAX_HAND}
                onClick={() => {
                  if (shedForced) {
                    // Mid-Dusk pause (an At Dusk draw went over the limit):
                    // resume the engine's Dusk with the chosen cards.
                    const picks = shedPick;
                    setShedPick(null);
                    setShedForced(false);
                    finishDuskShed(g, picks);
                    bump();
                    if (checkWinner()) return;
                    runCpuTurn();
                    return;
                  }
                  // Pre-pick: handed to the engine's chooseShed hook, which
                  // sheds exactly these unless an At Dusk draw intervenes
                  // (then the picker reopens on the post-trigger hand).
                  prepickRef.current = shedPick;
                  setShedPick(null);
                  finishTurn();
                }}
                className={cn(
                  'heading-font text-sm px-4 py-2 ink-border-md',
                  shedPick.length === me.hand.length - MAX_HAND
                    ? 'btn-pop bg-[var(--c-yellow)] text-[var(--c-ink)]'
                    : 'bg-[var(--c-steel)]/50 text-[var(--c-paper)]/40 cursor-not-allowed',
                )}
              >
                {/* v28 — a disabled primary that does not say what it wants
                    is a dead end, and this one is reached under time pressure
                    at the end of every over-full turn. Same rule the rest of
                    the divider follows in this pass: the button states its
                    own condition. */}
                {shedPick.length === me.hand.length - MAX_HAND
                  ? 'SHED & END TURN ▸'
                  : `SHED & END TURN ▸ — PICK ${me.hand.length - MAX_HAND - shedPick.length} MORE`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ash-pile drawer */}
      {showAsh && (
        // Phone: a bottom SHEET (top-auto + max-h) that leaves the upper
        // board readable, instead of the old top-16/bottom-24 overlay that
        // covered everything including the hand dock. Desktop keeps the
        // fixed right-hand column.
        <div className="absolute right-2 left-2 sm:left-auto top-auto sm:top-16 bottom-24 max-h-[52vh] sm:max-h-none w-auto sm:w-[260px] max-w-none sm:max-w-[260px] bg-[var(--c-ink)] ink-border-md z-40 p-2 overflow-y-auto">
          {(() => {
            const owner = showAsh === 'foe' ? foe : me;
            const label = showAsh === 'foe' ? `${cpuLabel.toUpperCase()} ASH-PILE` : 'ASH-PILE';
            return (
              <>
                <div className="flex justify-between items-center mb-1">
                  <span className="heading-font text-[10px] text-[var(--c-yellow)]">{label}</span>
                  <button
                    onClick={() => setShowAsh(false)}
                    aria-label="Close ash-pile"
                    className="btn-pop text-[10px] bg-[var(--c-red)] text-white px-1.5 ink-border-sm"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-[8px] text-[var(--c-paper)]/60 font-bold mb-1">
                  Shattered units, resolved Events and shed cards end up here.
                </div>
                <div className="flex flex-wrap gap-1">
                  {owner.ashPile.map((c) => (
                    <CardFace
                      key={c.iid}
                      def={c.def}
                      size="compact"
                      introduceKeywords
                      onClick={() => setInspect(c.def)}
                    />
                  ))}
                  {owner.ashPile.length === 0 && (
                    <span className="text-[9px] text-[var(--c-paper)]/30 font-bold">empty</span>
                  )}
                </div>
                {owner.voidPile.length > 0 && (
                  <>
                    <div className="heading-font text-[10px] text-[var(--c-yellow)] mt-2 mb-1">
                      THE VOID
                    </div>
                    <div className="text-[8px] text-[var(--c-paper)]/60 font-bold mb-1">
                      Banished cards — removed from the game.
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {owner.voidPile.map((c) => (
                        <CardFace
                          key={c.iid}
                          def={c.def}
                          size="compact"
                          introduceKeywords
                          onClick={() => setInspect(c.def)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Card inspector */}
      {inspect && <Card3DInspector def={inspect} onClose={() => setInspect(null)} />}

      {/* In-game confirm dialog */}
      {confirmDialog && (
        <div className="absolute inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
          <div
            ref={confirmDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm"
            className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md p-4 max-w-xs w-full text-center outline-none"
          >
            <div className="text-[12px] font-bold mb-3">{confirmDialog.text}</div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => {
                  const { onConfirm } = confirmDialog;
                  setConfirmDialog(null);
                  onConfirm();
                }}
                className="btn-pop text-[10px] font-bold bg-[var(--c-red)] text-white px-3 py-1 ink-border-sm"
              >
                CONFIRM
              </button>
              <button
                onClick={() => setConfirmDialog(null)}
                className="btn-pop text-[10px] font-bold bg-[var(--c-steel)] text-[var(--c-paper)] px-3 py-1 ink-border-sm"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mulligan overlay */}
      {stage === 'mulligan' && (
        /* v7.5: `items-start` below `sm`. On a 375x667 phone this dialog is
           taller than the viewport, and a centred flex child in a scroll
           container has its overflow clipped off the TOP with no way to reach
           it — the title and the first row of cards were unreachable. */
        <div className="absolute inset-0 z-50 bg-[var(--c-ink)]/95 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div
            ref={mulliganDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Mulligan"
            className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md p-3 sm:p-5 text-center max-w-5xl w-full my-auto outline-none"
          >
            {/* This overlay covers the top bar (and its CONCEDE) — without an
                exit here a mis-queued match had to be kept and played out. */}
            <div className="flex justify-end -mb-6 sm:-mb-8">
              <button
                onClick={() =>
                  setConfirmDialog({
                    text: 'Concede this match? This will count as a loss.',
                    onConfirm: concede,
                  })
                }
                className="tap-44 btn-pop heading-font text-[10px] bg-[var(--c-ink)] text-[var(--c-paper)] px-2 py-1 ink-border-sm"
                aria-label="Concede match"
              >
                ✕ CONCEDE
              </button>
            </div>
            <div className="heading-font text-xl sm:text-3xl mb-1">
              {mulliganCount > 0 ? 'YOUR NEW HAND' : 'KEEP or MULLIGAN?'}
            </div>
            <div className="text-[12px] font-bold text-[var(--c-steel)] mb-1">
              Opening hand — {playerName}
              {mulliganCount > 0 ? ` · mulligan ×${mulliganCount}` : ''}
            </div>
            {/* v22 — the opponent's mulligan. It runs inside the setup that
                builds this screen (`maybeMulliganPlayer` at createGame), writes
                its line to a Battle Log the player cannot open yet, and is then
                buried by everything the first turn writes. It is also real
                information: a Leader that shipped its hand back is down a card
                before either player has moved, which is the first thing a
                human opponent would have told you. */}
            {cpuMulliganTo !== null && (
              <div className="text-[11px] font-bold text-[var(--c-red)] mb-1">
                ↻ {cpuLabel} mulliganed — it opens on {cpuMulliganTo} card
                {cpuMulliganTo === 1 ? '' : 's'}, not {STARTING_HAND}.
              </div>
            )}
            <div className="text-[11px] font-bold text-[var(--c-steel)] max-w-xl mx-auto mb-3 sm:mb-4 leading-snug">
              {`A mulligan shuffles these ${me.hand.length} cards back into your deck and draws ${Math.max(0, me.hand.length - 1)} fresh ones — one FEWER each time (rulebook §3). ${isNarrow ? 'Tap' : 'Click'} any card to zoom in.`}
            </div>
            <div className="flex gap-1.5 sm:gap-2 justify-center flex-wrap mb-3 sm:mb-5">
              {me.hand.map((c) => (
                <React.Fragment key={c.iid}>
                  <CardFace
                    def={c.def}
                    // Two `standard` cards do not fit a 375px row beside the
                    // dialog's own padding; `compact` fits three, and the card
                    // is tappable to zoom either way.
                    size={isNarrow ? 'compact' : 'standard'}
                    introduceKeywords
                    onClick={() => setInspect(c.def)}
                  />
                </React.Fragment>
              ))}
            </div>
            {/* Full-bleed sticky footer. It used to be a bare `bg-paper` bar
                the width of its buttons, so on a phone the wrapped buttons
                floated over the card grid with the cards showing between and
                around them. */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center items-stretch sm:items-center sticky bottom-0 z-20 bg-[var(--c-paper)] border-t-2 border-[var(--c-ink)] -mx-3 sm:-mx-5 px-3 sm:px-5 pt-2 pb-1 -mb-3 sm:-mb-5">
              <button
                onClick={afterMulligan}
                className="btn-pop heading-font text-base bg-[var(--c-yellow)] px-8 py-3 ink-border-md shadow-hard-black-xs"
              >
                ✓ KEEP THIS HAND
              </button>
              {me.hand.length > 1 && (
                <button
                  onClick={doMulligan}
                  className="btn-pop heading-font text-base bg-[var(--c-red)] text-white px-8 py-3 ink-border-md shadow-hard-black-xs"
                >
                  ↻ MULLIGAN — draw {me.hand.length - 1}
                  {me.hand.length <= 4 ? ' (risky!)' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Game over */}
      {stage === 'over' && g.winner && (
        <div className="absolute inset-0 z-50 bg-[var(--c-ink)]/90 flex items-center justify-center">
          <div
            ref={gameOverDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Match result"
            className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md p-6 text-center outline-none"
          >
            <div className="heading-font text-3xl mb-2">
              {g.winner === HUMAN ? '🏆 VICTORY' : '☠ DEFEAT'}
            </div>
            <div className="text-[11px] font-bold text-[var(--c-steel)] mb-4">
              {g.log
                .slice(-2)
                .map((l) => humanize(l))
                .join(' · ')}
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
            {reward == null && !rewardError && rewardPending && (
              <div className="text-[10px] font-bold text-[var(--c-steel)] mb-4 animate-pulse">
                Calculating rewards…
              </div>
            )}
            {/* v22: BACK TO MENU was the only way off this screen, so playing
                a second match meant menu → PLAY → pick the deck again — three
                screens to repeat the thing the player just chose. REMATCH is
                the primary action for the same reason it is in every other
                card game. It waits on the reward round-trip: remounting while
                `recordMatchResult` is still in flight would unmount the state
                its retry loop writes into, and the player would never learn
                whether this match's credits landed. */}
            <div className="flex flex-wrap gap-2 justify-center">
              {onRematch && (
                <button
                  onClick={onRematch}
                  disabled={rewardPending}
                  className="btn-pop heading-font text-sm bg-[var(--c-red)] text-[var(--c-paper)] px-6 py-2 ink-border-sm shadow-hard-black-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  title={rewardPending ? 'Saving this match first…' : 'Play another match'}
                >
                  ↻ REMATCH
                </button>
              )}
              <button
                onClick={onExit}
                className="btn-pop heading-font text-sm bg-[var(--c-yellow)] px-6 py-2 ink-border-sm shadow-hard-black-xs"
              >
                BACK TO MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
