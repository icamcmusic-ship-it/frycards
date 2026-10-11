/**
 * FryCards Poker table (Design Spec v0.1).
 *
 * A pot-limit Hold'em freezeout for 2–6 seats. The human is seat 0; the other
 * seats are bots that only ever see their own seat's view. Everything renders
 * from the human's redacted view (view.ts) — the full match state never
 * reaches the screen. The engine is a pure reducer: this component holds the
 * current match, appends every action to a replay log, and drives the bots
 * on a timer whose length is the bot's nominal pacing times the speed setting
 * (1× / 2× / INSTANT). The match clock is charged nominal time either way, so
 * the blinds rise on the clock, not on how fast you click.
 *
 * Desktop first: click any cast card to inspect it (never on hover — a modal
 * that opens under a resting pointer ate the hotkeys, AUDIT-2026-10-11 A1),
 * F / C / R for fold, check-call and raise, P to pass a response window. Seat
 * positions live in pokerLayout.ts, so the phone layout is a different
 * position table, not a different component.
 *
 * Every human control is idempotent per decision (A2/A3): an action that
 * lands within ACT_GUARD_MS of the previous one, or of the decision first
 * being put on screen, is dropped — the second click of a double-click used
 * to act on the NEXT decision (a fold, a call of an all-in, a check on the
 * next street) because the new button re-rendered under the pointer.
 *
 * Timers follow the TABLE TIMERS setting (§3.1): STANDARD / RELAXED / OFF.
 */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Clock,
  Flame,
  History,
  Pause,
  Play,
  ScrollText,
  Settings2,
  StepForward,
  Users,
  X,
} from 'lucide-react';
import { botAction, botRng, estimateEquity } from '../game/poker/bot';
import type { CardDef } from '../game/poker/cards';
import { hasKw, tierLabel } from '../game/poker/cards';
import {
  HUMAN_ACTION_CAP_MS,
  MAX_EXCLUSIONS,
  MODES,
  TURN_TIMER_MS,
  bigBlindAt,
} from '../game/poker/constants';
import {
  applyAction,
  betOptions,
  canCast,
  canUseLeader,
  castCost,
  castTargets,
  cloneMatch,
  createMatch,
  effectiveEffect,
  excludableCategories,
  forecast,
  IllegalAction,
  inHand,
  leaderPseudoDef,
  legalTargets,
  needsOpponentTarget,
  potTotal,
  standings,
  tilted,
  waitingOn,
  type Action,
  type CastRecord,
  type ExtraCost,
  type LogEntry,
  type Match,
  type MatchSetup,
  type PCard,
} from '../game/poker/engine';
import { CATEGORY_NAMES, cardLabel, describeHand } from '../game/poker/evaluator';
import { KEYWORD_SPECS, keywordLabel } from '../game/poker/keywords';
import { LOCATION_TEMPLATES, ruleText } from '../game/poker/locations';
import { ordinal, placementReward } from '../game/poker/rewards';
import { runBots } from '../game/poker/sim';
import { isHidden, viewFor } from '../game/poker/view';
import type { MatchResult } from '../lib/supabase';
import { isVideoSrc, mediaUrl } from '../lib/media';
import { useIsNarrow } from '../lib/useIsNarrow';
import { cn } from '../lib/utils';
import { fmtCredits, fmtVouchers } from '../meta/economy';
import {
  CPU_SPEEDS,
  HAND_SORTS,
  TIMER_MODES,
  TIMER_PRESETS,
  fmtAmount,
  loadAmountsInBB,
  loadAutoDeal,
  loadCpuSpeed,
  loadFourColor,
  loadHandHelper,
  loadHandSort,
  loadPauseOnTarget,
  loadTimerMode,
  rewardFloorMs,
  saveAmountsInBB,
  saveAutoDeal,
  saveCpuSpeed,
  saveFourColor,
  saveHandHelper,
  saveHandSort,
  savePauseOnTarget,
  saveTimerMode,
  type HandSort,
  type TimerMode,
} from '../meta/matchPrefs';
import { MetaContext } from '../meta/MetaContext';
import { recordMatch } from '../meta/matchHistory';
import { askConfirm } from '../meta/confirm';
import { useReducedMotion } from '../meta/useMotionMode';
import { CardFace } from './CardFaceV4';
import { Card3DInspector } from './Card3DInspector';
import { CoachOverlay } from './CoachOverlay';
import { PlayingCard } from './PlayingCard';
import { VisibleVideo } from './VisibleVideo';
import { useEscapeClose } from './useFocusTrap';
import { betPosition, boardY, seatPositions, seatStyle, type SeatPos } from './pokerLayout';

export const HUMAN = 0;

/** Time on the between-hands result banner at 1× (scaled by speed). */
const RESULT_PAUSE_MS = 3200;
/** How long a cast's spotlight stays up at 1×. */
const SPOTLIGHT_MS = 1700;
/** A cast at YOU stays up at least this long at every speed (U4). */
const SPOTLIGHT_AT_YOU_MS = 3000;
/** Spectating after a bust runs at 4× speed. */
const SPECTATE_MULT = 0.25;
/** Felt height (px) from which the board's cards are drawn at 2×. */
const BOARD_X2_MIN_FELT_PX = 450;
/** A human action this soon after the previous one, or after the decision
 * first appeared, is the tail of a double-click / double-tap and is dropped. */
export const ACT_GUARD_MS = 350;
/** Margin over the server's reward floor: the ticket is minted a moment after
 * the table mounts (and may be re-minted after a failed first try). */
const FLOOR_MARGIN_MS = 10_000;
/** Back-off for re-sending a result the server still called `too_early`. */
const TOO_EARLY_RETRY_MS = [15_000, 30_000, 60_000, 120_000];

export interface PokerTableProps {
  key?: React.Key;
  setup: MatchSetup;
  /** Guided first game: helper on, coach shown. */
  tutorial?: boolean;
  onExit: () => void;
  onRematch: () => void;
  /** Called once when the match ends (or the human concedes) with the human's
   * place — held back until the server's reward floor has passed (A20), and
   * re-sent with back-off when the server still answers `too_early`. */
  onResult?: (r: { place: number; seats: number; mode: MatchSetup['mode']; hands: number }) => void;
  reward?: MatchResult | null;
  rewardError?: string | null;
  rewardPending?: boolean;
  /** The human's deck as a share code, for match history. */
  humanDeckCode?: string;
}

type MatchReport = { place: number; seats: number; mode: MatchSetup['mode']; hands: number };

/** A seat's last action this street, for its speech burst (U1). */
interface Bubble {
  kind: 'fold' | 'check' | 'call' | 'raise' | 'bet' | 'allin' | 'cast' | 'leader';
  chips: number;
  hand: number;
  street: string;
}

/** The cast spotlight (U4): the cast, where its results start in the log,
 * and whether it is held on screen for the human. */
interface Spot {
  cast: CastRecord;
  /** The last log line when the cast was seen; results are the lines after. */
  anchor: string;
  at: number;
  /** A power at YOU: held until tapped (when "pause when targeted" is on). */
  hold: boolean;
}

// ===========================================================================
// Amounts: chips or big blinds (S-14)
// ===========================================================================
const AmountCtx = React.createContext<number | null>(null);

/** Formats an amount the way the player chose: `◎123` or `4.5 BB`. */
function useAmt(): (chips: number) => string {
  const bb = useContext(AmountCtx);
  return useCallback(
    (chips: number) => (bb ? fmtAmount(chips, bb) : `◎${fmtAmount(chips, null)}`),
    [bb],
  );
}

// ===========================================================================
// Small pieces
// ===========================================================================
function Chips({ chips, className }: { chips: number; className?: string }) {
  const amt = useAmt();
  return (
    <span
      className={cn('font-mono font-black tabular-nums', className)}
      title={`${fmtAmount(chips, null)} chips`}
    >
      {amt(chips)}
    </span>
  );
}

/** A floating +◎n / −◎n when a value changes (U7). Fades in place when
 * motion is reduced (the CSS keys off html[data-motion]). */
function StackDelta({ value }: { value: number }) {
  const amt = useAmt();
  const prev = useRef(value);
  const [delta, setDelta] = useState<{ d: number; id: number } | null>(null);
  useEffect(() => {
    const d = value - prev.current;
    prev.current = value;
    if (d === 0) return;
    const id = Date.now();
    const show = window.setTimeout(() => setDelta({ d, id }), 0);
    const hide = window.setTimeout(() => setDelta((x) => (x?.id === id ? null : x)), 950);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [value]);
  if (!delta) return null;
  return (
    <span
      key={delta.id}
      aria-hidden
      className={cn(
        'chip-float pointer-events-none absolute left-1/2 -top-1 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 ink-border-sm fs-xs font-black',
        delta.d > 0 ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]' : 'bg-[var(--c-red)] text-white',
      )}
    >
      {delta.d > 0 ? '+' : '−'}
      {amt(Math.abs(delta.d))}
    </span>
  );
}

function NerveMeter({ nerve, compact }: { nerve: number; compact?: boolean }) {
  const tiltedNow = nerve <= 0;
  return (
    <span
      className="inline-flex items-center gap-[2px]"
      title={tiltedNow ? 'TILTED — Leader locked, powers cost a step more' : `Nerve ${nerve}/10`}
      aria-label={`Nerve ${nerve} of 10${tiltedNow ? ', tilted' : ''}`}
    >
      <Flame className={cn('w-3 h-3', tiltedNow ? 'text-[var(--c-red)]' : 'text-orange-400')} />
      {compact ? (
        <span className="fs-xs font-black">{nerve}</span>
      ) : (
        Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cn('w-[5px] h-2 rounded-[1px]', i < nerve ? 'bg-orange-400' : 'bg-white/20')}
          />
        ))
      )}
      {tiltedNow && <span className="fs-xs font-black text-[var(--c-red)] ml-0.5">TILT</span>}
    </span>
  );
}

function SeatCards({
  cards,
  scale,
  fourColor,
  dim,
}: {
  cards: PCard[];
  scale: number;
  fourColor: boolean;
  dim?: boolean;
}) {
  // A fully shown hand gets one SHOWN marker under the pair: per-card markers
  // on overlapping cards print on top of each other.
  const allShown = cards.length > 1 && cards.every((c) => c.public && !isHidden(c));
  return (
    <span className={cn('relative flex -space-x-2', allShown && 'pb-1.5')}>
      {cards.map((c, i) => (
        <PlayingCard
          key={i}
          r={c.r}
          s={c.s}
          scale={scale}
          wild={c.wild}
          isPublic={c.public && !allShown}
          fourColor={fourColor}
          dim={dim}
        />
      ))}
      {allShown && (
        <span
          className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--c-ink)] text-[var(--c-paper)] px-1 fs-xs font-black leading-[12px] whitespace-nowrap"
          title="Face-up for the whole table"
        >
          SHOWN
        </span>
      )}
    </span>
  );
}

function LeaderArt({ def, size }: { def: CardDef; size: number }) {
  const src = def.image && !isVideoSrc(def.image) ? mediaUrl(def.image, size * 2) : null;
  return (
    <span
      className="block rounded-full overflow-hidden ink-border-sm bg-[var(--c-steel)] shrink-0"
      style={{ width: size, height: size }}
    >
      {src && <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />}
    </span>
  );
}

/** The active Location's art as the table felt. Mythic Locations with video
 * art play as video — only the active one, muted and looped; reduced motion
 * shows its first frame instead. */
function Felt({ def, reduced }: { def: CardDef | null; reduced: boolean }) {
  const img = def?.image;
  const video = img && isVideoSrc(img);
  return (
    <div
      className="absolute inset-0 rounded-[48%] overflow-hidden bg-[#0f3d2e] ink-border-md"
      aria-hidden
    >
      {img && !video && (
        <img
          key={img}
          src={mediaUrl(img, 960) ?? img}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-55"
          draggable={false}
        />
      )}
      {img && video && (
        <VisibleVideo
          key={img}
          src={img}
          muted
          loop
          playsInline
          autoPlay={!reduced}
          preload={reduced ? 'metadata' : 'auto'}
          className="absolute inset-0 w-full h-full object-cover opacity-55"
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(8,40,30,0.35) 0%, rgba(4,20,16,0.75) 70%, rgba(0,0,0,0.9) 100%)',
        }}
      />
    </div>
  );
}

// ===========================================================================
// Bot planning (shared by the driver and the STEP button)
// ===========================================================================
/** What a stuck bot does instead when its chosen action is illegal (A7). */
function fallbackFor(m: Match, seat: number): Action {
  const w = waitingOn(m);
  if (w.kind === 'window') return { type: 'pass', seat };
  if (w.kind === 'choice') return { type: 'choose', seat, index: 0 };
  return betOptions(m, seat)?.canCheck ? { type: 'check', seat } : { type: 'fold', seat };
}

/** The next automatic action: a hand start or a bot's move, with its nominal
 * delay at 1×. Null when the table waits on the human (or is over). */
function planNext(
  m: Match,
  busted: boolean,
  rng: ReturnType<typeof botRng>,
): { action: Action; nominal: number; seat: number | null } | null {
  const w = waitingOn(m);
  if (w.kind === 'over') return null;
  if (w.kind === 'start')
    return { action: { type: 'start', dt: m.handNo === 0 ? 0 : 3000 }, nominal: 0, seat: null };
  const seats = w.kind === 'window' ? w.seats : [w.seat];
  const bot = seats.find((s) => s !== HUMAN || busted);
  if (bot === undefined) return null;
  const action =
    botAction(viewFor(m, bot), bot, rng) ??
    (w.kind === 'window' ? { type: 'pass', seat: bot } : { type: 'fold', seat: bot });
  return { action, nominal: action.dt ?? 1000, seat: bot };
}

/** The speech burst for an action that just applied (U1). */
function bubbleFor(prev: Match, next: Match, a: Action): Bubble | null {
  const h = prev.hand;
  if (!h || !('seat' in a) || typeof a.seat !== 'number') return null;
  const seat = a.seat;
  const put = Math.max(0, prev.seats[seat].stack - next.seats[seat].stack);
  const allIn = next.seats[seat].stack === 0 && put > 0;
  const base = { hand: prev.handNo, street: h.street, chips: put };
  switch (a.type) {
    case 'fold':
      return { ...base, kind: 'fold' };
    case 'check':
      return { ...base, kind: 'check' };
    case 'call':
      return { ...base, kind: allIn ? 'allin' : 'call' };
    case 'raise':
      return {
        ...base,
        chips: a.to,
        kind: allIn ? 'allin' : h.currentBet === 0 ? 'bet' : 'raise',
      };
    case 'cast':
      return { ...base, kind: 'cast' };
    case 'leader':
      return { ...base, kind: 'leader' };
    default:
      return null;
  }
}

/** A decision's elapsed think time, with the time spent in the cast dialog or
 * the concede confirm paused — but only up to `cap`, so an idle player with a
 * dialog open still times out (A4, TM-2). */
function useThinkClock(decisionKey: string, paused: boolean, cap: number) {
  const promptAt = useRef(0);
  const pausedMs = useRef(0);
  const pauseStart = useRef(0);
  const shownAt = useRef(0);
  const [clock, setClock] = useState({ key: '', ms: 0 });
  // Start the clock once per DECISION, not once per effect run (A5): the BOTS
  // toggle and every other re-render used to restart the turn timer.
  useEffect(() => {
    if (!decisionKey) return;
    const t0 = Date.now();
    promptAt.current = t0;
    shownAt.current = t0;
    pausedMs.current = 0;
    pauseStart.current = 0;
  }, [decisionKey]);
  useEffect(() => {
    if (!decisionKey || !paused) return;
    pauseStart.current = Date.now();
    return () => {
      pausedMs.current += Date.now() - pauseStart.current;
      pauseStart.current = 0;
    };
  }, [decisionKey, paused]);
  const elapsed = useCallback(() => {
    const n = Date.now();
    const p = pausedMs.current + (pauseStart.current ? n - pauseStart.current : 0);
    return n - promptAt.current - Math.min(cap, p);
  }, [cap]);
  /** Real wall time since the decision was shown (the match-clock charge). */
  const realElapsed = useCallback(() => Date.now() - promptAt.current, []);
  useEffect(() => {
    if (!decisionKey) return;
    const tick = () => setClock({ key: decisionKey, ms: elapsed() });
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 250);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [decisionKey, elapsed]);
  return {
    /** Elapsed ms for the current decision as of the last tick (0 when fresh). */
    ms: clock.key === decisionKey && decisionKey ? clock.ms : 0,
    fresh: clock.key !== decisionKey,
    elapsed,
    realElapsed,
    shownAt,
  };
}

// ===========================================================================
// The table
// ===========================================================================
export function PokerTable({
  setup,
  tutorial = false,
  onExit,
  onRematch,
  onResult,
  reward,
  rewardError,
  rewardPending,
  humanDeckCode,
}: PokerTableProps) {
  const [match, setMatch] = useState<Match>(() => createMatch(setup));
  const matchRef = useRef(match);
  useEffect(() => {
    matchRef.current = match;
  }, [match]);
  const actionsRef = useRef<Action[]>([]);
  /** Actions applied so far — a per-decision key that never repeats. */
  const [seq, setSeq] = useState(0);
  const botRngRef = useRef(botRng(setup.seed ^ 0x9e3779b9));
  const [speedIdx, setSpeedIdx] = useState(loadCpuSpeed);
  const [helper, setHelper] = useState(() => loadHandHelper(tutorial));
  const [fourColor, setFourColor] = useState(loadFourColor);
  const [timerMode, setTimerMode] = useState<TimerMode>(loadTimerMode);
  const [autoDeal, setAutoDeal] = useState(loadAutoDeal);
  const [pauseOnTarget, setPauseOnTarget] = useState(loadPauseOnTarget);
  const [inBB, setInBB] = useState(loadAmountsInBB);
  const [handSort, setHandSort] = useState<HandSort>(loadHandSort);
  const [showLog, setShowLog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [inspect, setInspect] = useState<CardDef | null>(null);
  const [castFlow, setCastFlow] = useState<{ uid?: string; leader?: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conceded, setConceded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [paused, setPaused] = useState(false);
  const [coachShowing, setCoachShowing] = useState(false);
  const [raiseSel, setRaiseTo] = useState(0);
  const [bankMs, setBankMs] = useState(() => TIMER_PRESETS[loadTimerMode()].bankMs);
  const [bubbles, setBubbles] = useState<Record<number, Bubble>>({});
  const narrow = useIsNarrow();
  const feltRef = useRef<HTMLDivElement>(null);
  const [felt, setFelt] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = feltRef.current;
    if (!el) return;
    const measure = () => setFelt({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const feltH = felt.h;
  // Live: a change in Settings (or the OS) reaches a match already running (S-3).
  const reduced = useReducedMotion();
  const signedIn = !!useContext(MetaContext)?.session;

  const view = useMemo(() => viewFor(match, HUMAN), [match]);
  const h = view.hand;
  const me = view.seats[HUMAN];
  const busted = me.busted;
  const mode = MODES[match.mode];
  const waiting = waitingOn(match);
  const over = match.phase === 'over' || conceded;
  const myTurn = !over && waiting.kind === 'bet' && waiting.seat === HUMAN;
  const myWindow =
    !over && waiting.kind === 'window' && waiting.seats.length === 1 && waiting.seats[0] === HUMAN;
  const myChoice = !over && waiting.kind === 'choice' && waiting.seat === HUMAN;
  const speedMult = CPU_SPEEDS[speedIdx]?.mult ?? 1;
  const mult = busted ? speedMult * SPECTATE_MULT : speedMult;
  const overRef = useRef(over);
  useEffect(() => {
    overRef.current = over;
  }, [over]);

  // The guided game and a coach callout on screen run with no clocks (TM-4):
  // nobody should be auto-folded while reading the coach.
  const timersOff = tutorial || coachShowing;
  const effectiveTimers: TimerMode = timersOff ? 'off' : timerMode;
  const preset = TIMER_PRESETS[effectiveTimers];
  const composing = !!castFlow || confirming;
  const decisionKey = myTurn || myWindow || myChoice ? `${waiting.kind}:${seq}` : '';
  const think = useThinkClock(decisionKey, composing, preset.turnMs ?? TURN_TIMER_MS);
  const { elapsed: thinkElapsed, realElapsed, shownAt } = think;

  // ---- dispatch -----------------------------------------------------------
  const lastActAt = useRef(0);
  /** Apply an action. `quiet` (bots, timers) never shows the red notice: a
   * bot's illegal move is not the player's mistake. */
  const dispatch = useCallback((action: Action, quiet = false) => {
    const prev = matchRef.current;
    try {
      const next = applyAction(prev, action);
      actionsRef.current.push(action);
      matchRef.current = next;
      setMatch(next);
      setSeq(actionsRef.current.length);
      if (!quiet) setNotice(null);
      const b = bubbleFor(prev, next, action);
      if (b && 'seat' in action && typeof action.seat === 'number') {
        const seat = action.seat;
        setBubbles((bs) => ({ ...bs, [seat]: b }));
      }
      return true;
    } catch (e) {
      if (e instanceof IllegalAction) {
        if (!quiet) setNotice(e.message);
        return false;
      }
      throw e;
    }
  }, []);

  const [spot, setSpot] = useState<Spot | null>(null);

  /** A human action. Charged its think time on the match clock — the real
   * time (capped) on STANDARD, a fixed charge on RELAXED / OFF (TM-5). */
  const humanAct = useCallback(
    (action: Action, opts?: { auto?: boolean }) => {
      // Nothing acts on a finished or conceded match (A24).
      if (overRef.current) return false;
      const t = Date.now();
      if (!opts?.auto) {
        // Once per decision (A2/A3): the second click of a double-click, or a
        // click that lands as the next decision appears, is dropped.
        if (t - lastActAt.current < ACT_GUARD_MS) return false;
        if (t - shownAt.current < ACT_GUARD_MS) return false;
      }
      const m = matchRef.current;
      const w = waitingOn(m);
      const onMyTurn = w.kind === 'bet' && w.seat === HUMAN;
      const charge =
        preset.humanChargeMs === 'real'
          ? Math.min(HUMAN_ACTION_CAP_MS, Math.max(0, realElapsed()))
          : preset.humanChargeMs;
      // Leaving a turn spends any overrun from the time bank.
      const overrun = onMyTurn && preset.turnMs !== null ? thinkElapsed() - preset.turnMs : 0;
      if (!dispatch({ ...action, dt: charge })) return false;
      lastActAt.current = t;
      if (overrun > 0) setBankMs((b) => Math.max(0, b - overrun));
      setCastFlow(null);
      // Acting answers a held spotlight.
      setSpot((s) => (s?.hold ? null : s));
      return true;
    },
    [dispatch, preset, thinkElapsed, realElapsed, shownAt, setSpot],
  );

  // ---- the driver: bots and hand starts -----------------------------------
  const spotHold = !!spot?.hold;
  const awaitingDeal =
    !over && waiting.kind === 'start' && match.handNo > 0 && !autoDeal && !busted;
  useEffect(() => {
    if (over || paused || confirming || spotHold || awaitingDeal) return;
    const plan = planNext(match, busted, botRngRef.current);
    if (!plan) return;
    let delay: number;
    if (plan.seat === null) {
      delay =
        match.handNo === 0 ? 400 : Math.max(speedMult === 0 ? 500 : 900, RESULT_PAUSE_MS * mult);
    } else {
      delay = Math.max(speedMult === 0 ? 40 : 120, plan.nominal * mult);
    }
    const t = window.setTimeout(() => {
      // An illegal bot move must never freeze the table (A7).
      if (!dispatch(plan.action, true) && plan.seat !== null)
        dispatch(fallbackFor(matchRef.current, plan.seat), true);
    }, delay);
    return () => window.clearTimeout(t);
  }, [match, mult, speedMult, busted, over, paused, confirming, spotHold, awaitingDeal, dispatch]);

  /** Paused: play exactly one automatic action (U6). */
  const stepOnce = () => {
    const m = matchRef.current;
    const plan = planNext(m, m.seats[HUMAN].busted, botRngRef.current);
    if (!plan) return;
    if (!dispatch(plan.action, true) && plan.seat !== null)
      dispatch(fallbackFor(matchRef.current, plan.seat), true);
  };
  const deal = () => {
    if (waitingOn(matchRef.current).kind === 'start') dispatch({ type: 'start', dt: 3000 }, true);
  };

  // ---- human timers (§3.1): turn + bank, window auto-pass, choice auto-pick
  // A level up refills the bank (TM-3).
  const lastLevel = useRef(match.level);
  useEffect(() => {
    if (match.level > lastLevel.current && preset.bankPerLevelMs > 0)
      setBankMs((b) => Math.min(preset.bankCapMs, b + preset.bankPerLevelMs));
    lastLevel.current = match.level;
  }, [match.level, preset]);

  const elapsed = think.ms;
  useEffect(() => {
    if (!decisionKey || think.fresh) return;
    if (myTurn && preset.turnMs !== null && elapsed - preset.turnMs > bankMs) {
      const o = betOptions(matchRef.current, HUMAN);
      humanAct(o?.canCheck ? { type: 'check', seat: HUMAN } : { type: 'fold', seat: HUMAN }, {
        auto: true,
      });
      setBankMs(0);
    } else if (myWindow && preset.windowMs !== null && elapsed >= preset.windowMs) {
      humanAct({ type: 'pass', seat: HUMAN }, { auto: true });
    } else if (myChoice && preset.choiceMs !== null && elapsed >= preset.choiceMs) {
      // Past the clock, make the pick a bot would (keep the best cards).
      const m = matchRef.current;
      const a = botAction(viewFor(m, HUMAN), HUMAN, botRng(m.seed ^ m.handNo));
      humanAct(
        { type: 'choose', seat: HUMAN, index: a?.type === 'choose' ? a.index : 0 },
        { auto: true },
      );
    }
  }, [decisionKey, think.fresh, elapsed, myTurn, myWindow, myChoice, preset, bankMs, humanAct]);

  const turnLeft = myTurn && preset.turnMs !== null ? preset.turnMs - elapsed : null;
  const windowLeft = myWindow && preset.windowMs !== null ? preset.windowMs - elapsed : null;
  const choiceLeft = myChoice && preset.choiceMs !== null ? preset.choiceMs - elapsed : null;

  // ---- raise slider ---------------------------------------------------------
  const opts = myTurn ? betOptions(match, HUMAN) : null;
  // The pot-limit range can move under a kept selection (a cast paid from your
  // stack, a straddle) without a new bet to reset it, so clamp what is shown
  // and sent — an out-of-range raise surfaced as a raw "Raise must be
  // between…" notice.
  const raiseTo = opts?.canRaise
    ? Math.min(opts.maxRaiseTo, Math.max(opts.minRaiseTo, raiseSel))
    : raiseSel;
  useEffect(() => {
    if (opts?.canRaise) setRaiseTo(opts.minRaiseTo);
    // Reset per decision only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, match.hand?.currentBet, match.hand?.street, match.handNo]);

  // ---- keyboard -------------------------------------------------------------
  useEffect(() => {
    if (over || (!myTurn && !myWindow) || castFlow || showHistory || inspect) return;
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+C is copy and Ctrl+R reload, not call and raise.
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      // Any modal on top (the concede confirm, an inspector) owns the keys.
      if (document.querySelector('[aria-modal="true"]')) return;
      const t = e.target as HTMLElement | null;
      // Typing goes to the field; the raise slider keeps the hotkeys (R right
      // after dragging it is the whole point).
      const typing =
        !!t &&
        (t.tagName === 'TEXTAREA' ||
          t.isContentEditable ||
          (t.tagName === 'INPUT' &&
            !['range', 'checkbox', 'radio', 'button'].includes((t as HTMLInputElement).type)));
      if (typing) return;
      const k = e.key.toLowerCase();
      if (myWindow) {
        // OFF timers wait for an explicit pass: P (or Esc) answers the window.
        if (k === 'p' || k === 'escape') humanAct({ type: 'pass', seat: HUMAN });
        return;
      }
      if (!opts) return;
      if (k === 'f') humanAct({ type: 'fold', seat: HUMAN });
      else if (k === 'c')
        humanAct(opts.canCheck ? { type: 'check', seat: HUMAN } : { type: 'call', seat: HUMAN });
      else if (k === 'r' && opts.canRaise) humanAct({ type: 'raise', seat: HUMAN, to: raiseTo });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [over, myTurn, myWindow, castFlow, showHistory, inspect, opts, raiseTo, humanAct]);

  // ---- speech bursts: clear a street's bubbles shortly after it ends --------
  const streetNow = match.hand?.street ?? '';
  useEffect(() => {
    const hand = match.handNo;
    const t = window.setTimeout(
      () =>
        setBubbles((bs) => {
          const keep: Record<number, Bubble> = {};
          for (const [k, b] of Object.entries(bs) as [string, Bubble][])
            if (b.hand === hand && b.street === streetNow) keep[Number(k)] = b;
          return Object.keys(keep).length === Object.keys(bs).length ? bs : keep;
        }),
      Math.max(600, 1400 * Math.max(0.5, mult)),
    );
    return () => window.clearTimeout(t);
  }, [match.handNo, streetNow, mult]);

  // ---- spotlight for new casts (U4) -----------------------------------------
  const seenCasts = useRef<{ hand: number; count: number }>({ hand: 0, count: 0 });
  useEffect(() => {
    const casts = view.hand?.casts ?? [];
    const hand = view.hand?.no ?? 0;
    if (seenCasts.current.hand !== hand) seenCasts.current = { hand, count: 0 };
    if (casts.length > seenCasts.current.count) {
      const latest = casts[casts.length - 1];
      seenCasts.current.count = casts.length;
      if (latest.seat !== HUMAN)
        setSpot({
          cast: latest,
          anchor: view.log[view.log.length - 1]?.text ?? '',
          at: Date.now(),
          hold: latest.target === HUMAN && pauseOnTarget && !busted,
        });
    }
  }, [view, pauseOnTarget, busted]);
  const [inspectFromSpot, setInspectFromSpot] = useState(false);
  useEffect(() => {
    // Held spots wait for a tap; an open inspector holds any spot.
    if (!spot || spot.hold || inspect) return;
    const ms =
      spot.cast.target === HUMAN
        ? SPOTLIGHT_AT_YOU_MS
        : Math.max(700, SPOTLIGHT_MS * Math.max(0.4, mult));
    const t = window.setTimeout(() => setSpot(null), ms);
    return () => window.clearTimeout(t);
  }, [spot, mult, inspect]);

  // ---- match end: history + result -----------------------------------------
  const reported = useRef(false);
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  /** A result waiting on the server's reward floor (A20). */
  const [held, setHeld] = useState<{ r: MatchReport; dueAt: number } | null>(null);
  const [sent, setSent] = useState<MatchReport | null>(null);
  const report = useCallback(
    (m: Match, place: number) => {
      if (reported.current) return;
      reported.current = true;
      const others = m.seats.filter((s) => s.idx !== HUMAN).map((s) => s.name);
      recordMatch({
        seed: m.seed,
        finishedAt: Date.now(),
        won: place === 1,
        place,
        seats: m.seats.length,
        mode: m.mode,
        hands: m.handNo,
        capped: m.capped,
        humanLabel: setup.seats[HUMAN].deck.name,
        cpuLabel: others.join(', '),
        humanDeck: humanDeckCode,
        finalStack: m.seats[HUMAN].stack,
      });
      const r: MatchReport = { place, seats: m.seats.length, mode: m.mode, hands: m.handNo };
      const dueAt =
        startedAt.current +
        rewardFloorMs(MODES[m.mode].minMatchMs, m.seats.length) +
        FLOOR_MARGIN_MS;
      // A guest earns nothing, so there is nothing to wait for.
      if (signedIn && Date.now() < dueAt) setHeld({ r, dueAt });
      else {
        setSent(r);
        onResult?.(r);
      }
    },
    [onResult, setup, humanDeckCode, signedIn],
  );
  useEffect(() => {
    if (match.phase === 'over' && match.placements)
      report(match, match.placements.indexOf(HUMAN) + 1);
  }, [match, report]);
  // Release a held result once the floor has passed.
  useEffect(() => {
    if (!held) return;
    const t = window.setTimeout(
      () => {
        setHeld(null);
        setSent(held.r);
        onResult?.(held.r);
      },
      Math.max(0, held.dueAt - Date.now()),
    );
    return () => window.clearTimeout(t);
  }, [held, onResult]);
  // The server still said too early (a slow ticket mint): try again with
  // back-off while the table is open — the ticket stays unredeemed.
  const tooEarly =
    reward == null &&
    !rewardPending &&
    !!rewardError &&
    /too quickly|too_early|too early/i.test(rewardError);
  const [retries, setRetries] = useState(0);
  useEffect(() => {
    if (!tooEarly || !sent || retries >= TOO_EARLY_RETRY_MS.length) return;
    const t = window.setTimeout(() => {
      setRetries((n) => n + 1);
      onResult?.(sent);
    }, TOO_EARLY_RETRY_MS[retries]);
    return () => window.clearTimeout(t);
  }, [tooEarly, sent, retries, onResult]);
  const rewardWaiting = !!held || (tooEarly && retries < TOO_EARLY_RETRY_MS.length);

  const concede = async () => {
    if (over) {
      onExit();
      return;
    }
    // The bots wait while the confirm is up, so the place shown is the place
    // sent (A16).
    setConfirming(true);
    const ok = await askConfirm(
      'Concede? You leave the table and take the lowest place still open.',
    ).finally(() => setConfirming(false));
    if (!ok) return;
    const m = matchRef.current;
    if (m.phase === 'over') return;
    const alive = m.seats.filter((s) => !s.busted).length;
    overRef.current = true;
    setConceded(true);
    setCastFlow(null);
    report(m, m.seats[HUMAN].busted ? standings(m).indexOf(HUMAN) + 1 : alive);
  };

  /** Busted: fast-forward the rest of the match headless. */
  const skipToEnd = () => {
    const m = cloneMatch(matchRef.current);
    const acts = runBots(m, { botSeed: setup.seed ^ 0x51ed27, autoStart: true, humanSeats: [] });
    actionsRef.current.push(...acts);
    matchRef.current = m;
    setMatch(m);
    setSeq(actionsRef.current.length);
  };

  /** Leaving with a result still held forfeits its reward: ask first. */
  const leave = (go: () => void) => async () => {
    if (
      rewardWaiting &&
      !(await askConfirm('Leave now? This match’s reward has not been paid yet and will be lost.'))
    )
      return;
    go();
  };

  // ---- derived display ------------------------------------------------------
  const positions = seatPositions(match.seats.length, narrow);
  const boardTop = boardY(match.seats.length, narrow);
  const spriteScale = narrow ? 1 : 2;
  // The board's cards double only when the felt is tall enough to hold them
  // between the top seats and the pot/result (a 720px laptop is not).
  const boardScale = !narrow && feltH >= BOARD_X2_MIN_FELT_PX ? 2 : 1;
  const board = h?.board ?? [];
  const myHole = h?.holes[HUMAN] ?? [];
  const location = h?.location.card ?? null;
  const rule = h?.rule ?? null;
  const fc = forecast(view);
  const bbNow = h?.bb ?? bigBlindAt(mode, match.level);
  const levelLeft = mode.levelMs - (match.clockMs % mode.levelMs);
  const capLeft = Math.max(0, mode.capMs - match.clockMs);
  const fixedCharge = preset.humanChargeMs !== 'real';

  // Recompute the helper per street / card change only (it runs a Monte
  // Carlo estimate), keyed on what the human can actually see.
  const holeKey = myHole.map((c) => `${c.r}${c.s}${c.wild ? 'w' : ''}`).join();
  const foldKey = h?.folded.join() ?? '';
  const streetKey = h?.street ?? '';
  const handKey = view.handNo;
  const helperText = useMemo(
    () => {
      if (!helper || !h || !inHand(h, HUMAN)) return null;
      const visible = myHole.filter((c) => !isHidden(c));
      const vb = board.filter((c) => !isHidden(c));
      const made = visible.length >= 2 ? describeHand([...visible, ...vb]) : '';
      const eq = estimateEquity(view, HUMAN, botRng(handKey * 31 + vb.length), 260);
      return `${made}${made ? ' · ' : ''}~${Math.round(eq * 100)}% to win`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [helper, handKey, streetKey, board.length, holeKey, foldKey],
  );

  // One idea at a time (Design Spec, "Onboarding"): hand ranks and betting on
  // the first hand, the board once it is dealt, the table's Location as hand
  // two starts, a power the first time one is castable on your turn, nerve
  // once it has moved.
  const castableNow = myTurn && me.hand.some((p) => canCast(view, HUMAN, p.uid).ok);
  let coachStage = '';
  if (h && !h.done && !busted) {
    if (match.handNo <= 1)
      coachStage = h.street === 'preflop' ? (myTurn ? 'bet' : 'hand') : 'board';
    else if (castableNow) coachStage = 'power';
    else if (match.handNo === 2) coachStage = 'location';
    else if (me.nerve !== 5) coachStage = 'nerve';
  }

  const castFor = (id: number | null) =>
    id === null ? null : (h?.casts.find((c) => c.id === id) ?? null);
  const windowCast = waiting.kind === 'window' ? castFor(waiting.castId) : null;
  /** The one seat on the clock (U2): a bettor or a chooser, never a window. */
  const clockSeat =
    over || waiting.kind === 'over' || waiting.kind === 'start' || waiting.kind === 'window'
      ? null
      : waiting.seat;
  const windowSeats =
    !over && waiting.kind === 'window' ? waiting.seats.filter((s) => s !== HUMAN || busted) : [];
  const amtCtx = inBB ? bbNow : null;
  const amt = (c: number) => (amtCtx ? fmtAmount(c, amtCtx) : `◎${fmtAmount(c, null)}`);
  const lastLines = view.log.filter((e) => !e.text.startsWith('—')).slice(-2);

  const cycleSpeed = () => {
    const n = (speedIdx + 1) % CPU_SPEEDS.length;
    setSpeedIdx(n);
    saveCpuSpeed(n);
  };
  const pickTimers = (id: TimerMode) => {
    setTimerMode(id);
    saveTimerMode(id);
    setBankMs((b) => Math.min(TIMER_PRESETS[id].bankCapMs, Math.max(b, TIMER_PRESETS[id].bankMs)));
  };
  const cycleTimers = () => {
    const i = TIMER_MODES.findIndex((t) => t.id === timerMode);
    pickTimers(TIMER_MODES[(i + 1) % TIMER_MODES.length].id);
  };

  // ---- render -------------------------------------------------------------
  return (
    <AmountCtx.Provider value={amtCtx}>
      <div
        className="poker-table relative w-full h-full overflow-hidden bg-[#0b1512] text-[var(--c-paper)] flex flex-col"
        data-testid="poker-table"
        // Who the match is waiting on, for the UI driver (scripts/drive-table.ts):
        // it fails a run where the human is owed a decision but has no control.
        data-waiting={
          over
            ? 'over'
            : waiting.kind === 'window'
              ? `window:${waiting.seats.join(',')}`
              : waiting.kind === 'bet' || waiting.kind === 'choice'
                ? `${waiting.kind}:${waiting.seat}`
                : waiting.kind
        }
        data-human-decision={myTurn || myWindow || myChoice || awaitingDeal ? '1' : undefined}
        data-paused={paused || spotHold ? '1' : undefined}
      >
        {/* Top bar */}
        <div
          className="relative z-30 flex flex-wrap items-center gap-x-3 gap-y-1 bg-[var(--c-ink)] px-3 py-1.5 border-b-2 border-black"
          data-coach-avoid
        >
          <button
            onClick={over ? leave(onExit) : concede}
            className={cn(
              'btn-pop heading-font fs-xs px-3 ink-border-sm',
              narrow ? 'min-h-[32px] py-1' : 'py-1',
              over
                ? 'bg-[var(--c-yellow)] text-[var(--c-ink)] shadow-hard-black-xs'
                : // U19: a quiet outline, not the primary yellow.
                  'bg-transparent text-[var(--c-paper)] border-[var(--c-red)]',
            )}
          >
            {over ? '< MENU' : 'CONCEDE'}
          </button>
          <span className="heading-font text-sm text-[var(--c-yellow)]">
            {narrow
              ? mode.label.toUpperCase()
              : `${mode.label.toUpperCase()} · ${match.seats.length} SEATS`}
          </span>
          <span
            className="fs-xs font-bold flex items-center gap-1"
            title={
              fixedCharge
                ? 'Blinds rise by hands played: every action is charged a fixed think time'
                : 'Blinds rise on the match clock'
            }
          >
            <Clock className="w-3.5 h-3.5" /> {amt(bbNow / 2)}/{amt(bbNow)}
            {narrow
              ? ` · L${match.level + 1} · ⏱${Math.ceil(levelLeft / 60000)}m`
              : ` · level ${match.level + 1} · next in ${Math.ceil(levelLeft / 60000)}m · cap in ${Math.ceil(capLeft / 60000)}m`}
          </span>
          {!narrow && <span className="fs-xs font-bold text-white/60">Hand {match.handNo}</span>}
          <div className="ml-auto flex items-center gap-1.5">
            <TopToggle
              label={`BOTS ${CPU_SPEEDS[speedIdx].label}`}
              title={`Bot speed — ${CPU_SPEEDS.map((s) => s.label).join(' / ')}`}
              onClick={cycleSpeed}
              narrow={narrow}
            />
            <IconToggle
              label={paused ? 'Resume the bots' : 'Pause the bots'}
              active={paused}
              onClick={() => setPaused((p) => !p)}
              narrow={narrow}
            >
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </IconToggle>
            {paused && (
              <IconToggle label="Step: play one bot action" onClick={stepOnce} narrow={narrow}>
                <StepForward className="w-4 h-4" />
              </IconToggle>
            )}
            <TopToggle
              label={
                timersOff
                  ? 'TIMERS OFF'
                  : `TIMERS ${TIMER_MODES.find((t) => t.id === timerMode)!.label}`
              }
              title={
                timersOff
                  ? 'Timers are off while the coach is teaching'
                  : 'Table timers — STANDARD / RELAXED / OFF'
              }
              onClick={cycleTimers}
              active={timerMode !== 'standard' || timersOff}
              narrow={narrow}
            />
            <IconToggle
              label="Table settings"
              active={showPrefs}
              onClick={() => setShowPrefs((v) => !v)}
              narrow={narrow}
            >
              <Settings2 className="w-4 h-4" />
            </IconToggle>
            <IconToggle label="Hand history" onClick={() => setShowHistory(true)} narrow={narrow}>
              <History className="w-4 h-4" />
            </IconToggle>
            <IconToggle
              label="Table log"
              active={showLog}
              onClick={() => setShowLog((v) => !v)}
              narrow={narrow}
            >
              <ScrollText className="w-4 h-4" />
            </IconToggle>
          </div>
          {showPrefs && (
            <TablePrefs
              onClose={() => setShowPrefs(false)}
              rows={[
                {
                  label: 'Hand-strength helper',
                  on: helper,
                  set: (v) => {
                    setHelper(v);
                    saveHandHelper(v);
                  },
                },
                {
                  label: 'Four-colour deck',
                  on: fourColor,
                  set: (v) => {
                    setFourColor(v);
                    saveFourColor(v);
                  },
                },
                {
                  label: 'Auto-deal the next hand',
                  on: autoDeal,
                  set: (v) => {
                    setAutoDeal(v);
                    saveAutoDeal(v);
                  },
                },
                {
                  label: 'Pause when a power targets me',
                  on: pauseOnTarget,
                  set: (v) => {
                    setPauseOnTarget(v);
                    savePauseOnTarget(v);
                  },
                },
                {
                  label: 'Amounts in big blinds',
                  on: inBB,
                  set: (v) => {
                    setInBB(v);
                    saveAmountsInBB(v);
                  },
                },
              ]}
              timers={timerMode}
              onTimers={pickTimers}
            />
          )}
        </div>

        {/* Location banner + forecast */}
        {location && rule && (
          <LocationBanner
            location={location}
            ruleName={LOCATION_TEMPLATES[rule.id].name}
            ruleLine={ruleText(rule)}
            owner={
              h?.location.owner !== undefined && !narrow
                ? h.location.owner === HUMAN
                  ? 'Your Location'
                  : `${view.seats[h.location.owner].name}'s Location`
                : null
            }
            forecast={fc.map((f) => ({
              name: f.card.rule ? LOCATION_TEMPLATES[f.card.rule.id].name : f.card.name,
              rule: f.card.rule ? ruleText(f.card.rule) : '',
            }))}
            narrow={narrow}
            onInspect={() => location.id.startsWith('__') || setInspect(location)}
          />
        )}

        {/* Felt area */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={feltRef}
            className={cn(
              'absolute',
              narrow ? 'inset-x-2 top-2 bottom-2' : 'inset-x-[6%] top-[4%] bottom-[6%]',
            )}
          >
            <Felt
              def={location && !location.id.startsWith('__') ? location : null}
              reduced={reduced}
            />

            {/* Board + pot: the card row is centred on the layout's board line
                and the pot / result hang below it, so a result banner never
                pushes the board up into the seats. */}
            <div
              className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5"
              style={{ top: `${boardTop}%`, marginTop: -(60 * boardScale) / 2 }}
              data-coach="board"
            >
              <div className="flex items-center gap-1.5">
                {Array.from({ length: rule?.id === 'shortBoard' ? 4 : 5 }, (_, i) => {
                  const c = board[i];
                  return c ? (
                    <PlayingCard key={i} r={c.r} s={c.s} scale={boardScale} fourColor={fourColor} />
                  ) : (
                    <span
                      key={i}
                      className="inline-block rounded border-2 border-dashed border-white/20"
                      style={{ width: 42 * boardScale, height: 60 * boardScale }}
                    />
                  );
                })}
              </div>
              {h?.board2 && (
                <div
                  className="flex items-center gap-1 opacity-90"
                  title="Second board — each pot splits between the two"
                >
                  <span className="fs-xs font-bold mr-1">BOARD 2</span>
                  {h.board2.map((c, i) => (
                    <PlayingCard key={i} r={c.r} s={c.s} scale={1} fourColor={fourColor} />
                  ))}
                </div>
              )}
              {h && (
                <div className="relative bg-black/70 rounded-full px-3 py-0.5 heading-font text-sm text-[var(--c-yellow)] whitespace-nowrap">
                  POT <Chips chips={Math.max(0, potTotal(h))} />
                  {match.jackpot > 0 && (
                    <span className="fs-xs text-white ml-2">jackpot {amt(match.jackpot)}</span>
                  )}
                </div>
              )}
              {windowSeats.length > 0 && (
                <div
                  className="bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm px-2 py-0.5 fs-xs font-black whitespace-nowrap"
                  data-testid="window-chip"
                >
                  RESPONSE WINDOW — {windowSeats.length} seat{windowSeats.length > 1 ? 's' : ''} may
                  answer
                </div>
              )}
              {h?.done && h.result && (
                <HandResultBanner
                  match={view}
                  fourColor={fourColor}
                  onDeal={awaitingDeal ? deal : undefined}
                />
              )}
            </div>

            {/* Seats (on a phone your own seat is the panel below the felt) */}
            {view.seats.map((s, i) => {
              if (i === HUMAN) return null;
              const b = bubbles[i];
              return (
                <SeatBadge
                  key={i}
                  match={view}
                  seat={i}
                  pos={positions[i]}
                  narrow={narrow}
                  fourColor={fourColor}
                  onClock={clockSeat === i}
                  inWindow={windowSeats.includes(i)}
                  reduced={reduced}
                  bubble={b && b.hand === match.handNo ? b : null}
                  onInspect={setInspect}
                />
              );
            })}

            {/* Bets in front of seats (a phone shows each bet on the seat's
                plate / your panel instead — there is no room between seat and
                pot, and the result banner would cover yours) */}
            {h &&
              view.seats.map((s, i) => {
                const bet = h.streetBet[i];
                if (!bet || narrow) return null;
                const [bx, by] = betPosition(positions[i], boardTop);
                return (
                  <span
                    key={i}
                    className="bet-pill absolute -translate-x-1/2 -translate-y-1/2 bg-[var(--c-yellow)] text-[var(--c-ink)] rounded-full px-2 py-0.5 ink-border-sm text-[11px] font-black shadow-hard-black-xs"
                    style={{ left: `${bx}%`, top: `${by}%` }}
                  >
                    {amt(bet)}
                  </span>
                );
              })}

            {/* Cast spotlight v2: docked by the caster, an arrow to the target,
                and what it did (U4). Click the card for details — never on hover. */}
            {spot && (
              <Spotlight
                spot={spot}
                match={view}
                positions={positions}
                felt={felt}
                narrow={narrow}
                onInspect={(d) => {
                  setInspectFromSpot(true);
                  setInspect(d);
                }}
                onDismiss={() => setSpot(null)}
              />
            )}
          </div>

          {/* Log drawer (a bottom sheet on a phone) */}
          {showLog && <LogPanel match={view} narrow={narrow} onClose={() => setShowLog(false)} />}
        </div>

        {/* Persistent action ticker (U3): the last two lines, read aloud. */}
        <button
          type="button"
          onClick={() => setShowLog(true)}
          className="relative z-20 w-full text-left bg-black/80 border-t border-white/10 px-3 py-1 text-[11px] leading-snug min-h-[36px]"
          title="Open the table log"
        >
          <span role="log" aria-live="polite" aria-label="Table action" className="block">
            {lastLines.map((e, i) => (
              <TickerLine
                key={`${view.log.length}-${i}`}
                entry={e}
                latest={i === lastLines.length - 1}
              />
            ))}
          </span>
        </button>

        {/* Human area */}
        <HumanPanel
          view={view}
          match={match}
          myTurn={myTurn}
          myWindow={myWindow}
          myChoice={myChoice}
          windowCast={windowCast}
          spriteScale={spriteScale}
          fourColor={fourColor}
          helperText={helperText}
          raiseTo={raiseTo}
          setRaiseTo={setRaiseTo}
          turnLeft={turnLeft}
          turnMs={preset.turnMs}
          bankMs={bankMs}
          windowLeft={windowLeft}
          choiceLeft={choiceLeft}
          narrow={narrow}
          act={humanAct}
          openCast={(uid) => setCastFlow({ uid })}
          openLeader={(i) => setCastFlow({ leader: i })}
          onInspect={setInspect}
          onSkip={busted && !over ? skipToEnd : undefined}
          onDeal={awaitingDeal ? deal : undefined}
          notice={notice}
          targeted={!!spot && spot.cast.target === HUMAN}
          handSort={handSort}
          onHandSort={(s) => {
            setHandSort(s);
            saveHandSort(s);
          }}
        />

        {castFlow && h && (
          <CastDialog
            view={view}
            flow={castFlow}
            secondsLeft={
              myTurn && turnLeft !== null
                ? Math.ceil((turnLeft + Math.max(0, bankMs)) / 1000)
                : windowLeft !== null
                  ? Math.ceil(windowLeft / 1000)
                  : null
            }
            onClose={() => setCastFlow(null)}
            onCast={(a) => humanAct(a)}
            onInspect={setInspect}
          />
        )}
        {showHistory && <HistoryModal match={view} onClose={() => setShowHistory(false)} />}
        {inspect && (
          <Card3DInspector
            def={inspect}
            onClose={() => {
              setInspect(null);
              // A spotlight the player opened from closes with its inspector.
              if (inspectFromSpot) {
                setInspectFromSpot(false);
                setSpot((s) => (s?.hold ? s : null));
              }
            }}
          />
        )}
        {over && (
          <GameOver
            match={match}
            conceded={conceded}
            onExit={leave(onExit)}
            onRematch={leave(onRematch)}
            reward={reward}
            rewardError={rewardWaiting ? null : rewardError}
            rewardPending={rewardPending}
            heldUntil={held?.dueAt ?? null}
            retrying={tooEarly && retries < TOO_EARLY_RETRY_MS.length}
          />
        )}
        {/* The coach sits above everything (z-70), so it steps aside while a
            modal (cast dialog, inspector, history) is up — faded out, not
            unmounted (it keeps its place in the script) and not display:none
            (it measures its own box to place itself). */}
        {!over && (
          <div
            className={cn(
              'transition-opacity',
              (castFlow || inspect || showHistory) && 'opacity-0 pointer-events-none',
            )}
          >
            <CoachOverlay stage={coachStage} onShowingChange={setCoachShowing} />
          </div>
        )}
      </div>
    </AmountCtx.Provider>
  );
}

function TopToggle({
  label,
  title,
  onClick,
  active,
  narrow,
}: {
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  narrow?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'btn-pop heading-font fs-xs px-2 ink-border-sm',
        narrow ? 'min-h-[32px] py-1' : 'py-1',
        active
          ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
          : 'bg-[var(--c-steel)] text-[var(--c-paper)]',
      )}
    >
      {label}
    </button>
  );
}

/** An icon-only top-bar button, 32px on a phone (U12). */
function IconToggle({
  label,
  onClick,
  active,
  narrow,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  narrow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'btn-pop ink-border-sm flex items-center justify-center',
        narrow ? 'min-w-[32px] min-h-[32px] p-1' : 'p-1',
        active
          ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
          : 'bg-[var(--c-steel)] text-[var(--c-paper)]',
      )}
    >
      {children}
    </button>
  );
}

/** The in-match settings popover: timers and the table aids, the same stored
 * flags Settings shows. Not modal — the hotkeys keep working under it. */
function TablePrefs({
  rows,
  timers,
  onTimers,
  onClose,
}: {
  rows: { label: string; on: boolean; set: (v: boolean) => void }[];
  timers: TimerMode;
  onTimers: (t: TimerMode) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute right-2 top-full mt-1 z-50 w-[280px] max-w-[calc(100vw-16px)] bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-black-sm p-3 flex flex-col gap-2"
      role="group"
      aria-label="Table settings"
    >
      <div className="flex items-center justify-between">
        <span className="heading-font text-sm">TABLE SETTINGS</span>
        <button
          onClick={onClose}
          aria-label="Close table settings"
          className="p-1 min-w-[32px] min-h-[32px]"
        >
          <X className="w-4 h-4 mx-auto" />
        </button>
      </div>
      <div className="fs-xs font-black">TABLE TIMERS</div>
      <div className="flex gap-1">
        {TIMER_MODES.map((t) => (
          <button
            key={t.id}
            onClick={() => onTimers(t.id)}
            aria-pressed={timers === t.id}
            className={cn(
              'btn-pop flex-1 heading-font fs-xs py-1.5 ink-border-sm',
              timers === t.id ? 'bg-[var(--c-yellow)]' : 'bg-white',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="fs-xs font-bold text-[var(--c-steel)]">
        {TIMER_MODES.find((t) => t.id === timers)!.blurb}.
        {timers !== 'standard' && ' Each action is charged a fixed 5 s, so blinds rise by hands.'}
      </p>
      {rows.map((r) => (
        <label key={r.label} className="flex items-center justify-between gap-2 text-xs font-bold">
          {r.label}
          <input type="checkbox" checked={r.on} onChange={(e) => r.set(e.target.checked)} />
        </label>
      ))}
    </div>
  );
}

/** The Location banner: name + rule name, the full rule text one tap away on a
 * phone (U15); the forecast names are buttons that show their rule (no hover
 * tooltip on touch). */
function LocationBanner({
  location,
  ruleName,
  ruleLine,
  owner,
  forecast: fc,
  narrow,
  onInspect,
}: {
  location: CardDef;
  ruleName: string;
  ruleLine: string;
  owner: string | null;
  forecast: { name: string; rule: string }[];
  narrow: boolean;
  onInspect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState<number | null>(null);
  const full = !narrow || open;
  return (
    <div
      data-coach="location"
      data-coach-avoid
      className="relative z-20 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-3 py-1 bg-black/60 text-center"
    >
      <button
        onClick={onInspect}
        className="heading-font text-sm text-[var(--c-yellow)] hover:underline"
        title="Inspect this Location"
      >
        {location.name}
      </button>
      <span className="fs-xs font-bold">
        {ruleName}
        {full ? `: ${ruleLine}` : ''}
      </span>
      {narrow && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Hide the rule' : 'Show the rule'}
          className="fs-xs font-black px-2 min-h-[28px]"
        >
          {open ? '▴' : '▾'}
        </button>
      )}
      {owner && <span className="fs-xs text-white/60">— {owner}</span>}
      {fc.length > 0 && full && (
        <span className="fs-xs text-white/70">
          · Next:{' '}
          {fc.map((f, i) => (
            <React.Fragment key={i}>
              {i > 0 && ', '}
              <button
                className="font-bold underline decoration-dotted"
                title={f.rule}
                onClick={() => setPeek((p) => (p === i ? null : i))}
              >
                {f.name}
              </button>
            </React.Fragment>
          ))}
        </span>
      )}
      {peek !== null && fc[peek] && full && (
        <span className="w-full fs-xs text-white/80">
          {fc[peek].name}: {fc[peek].rule || 'no rule'}
        </span>
      )}
    </div>
  );
}

/** One ticker line: seat names stay plain, the latest line is bright. */
function TickerLine({ entry, latest }: { key?: React.Key; entry: LogEntry; latest: boolean }) {
  return (
    <span
      className={cn(
        'block truncate',
        latest ? 'text-white font-bold' : 'text-white/55',
        entry.to !== undefined && 'text-sky-300 italic',
      )}
    >
      {entry.text}
    </span>
  );
}

// ===========================================================================
// Seats
// ===========================================================================
function bubbleText(b: Bubble, amt: (c: number) => string): string {
  switch (b.kind) {
    case 'fold':
      return 'FOLD';
    case 'check':
      return 'CHECK';
    case 'call':
      return `CALL ${amt(b.chips)}`;
    case 'bet':
      return `BET ${amt(b.chips)}`;
    case 'raise':
      return `RAISE ${amt(b.chips)}`;
    case 'allin':
      return 'ALL IN!';
    case 'cast':
      return 'CASTS ⚡';
    case 'leader':
      return 'LEADER ⚡';
  }
}

function SeatBadge({
  match,
  seat,
  pos,
  narrow,
  fourColor,
  onClock,
  inWindow,
  reduced,
  bubble,
  onInspect,
}: {
  key?: React.Key;
  match: Match;
  seat: number;
  pos: SeatPos;
  narrow: boolean;
  fourColor: boolean;
  /** This seat is the one the table waits on (U2). */
  onClock: boolean;
  /** This seat may answer the open response window. */
  inWindow: boolean;
  reduced: boolean;
  bubble: Bubble | null;
  onInspect: (d: CardDef) => void;
}) {
  const amt = useAmt();
  const s = match.seats[seat];
  const h = match.hand;
  const folded = !!h && h.dealtIn[seat] && h.folded[seat];
  const allIn = !!h && inHand(h, seat) && s.stack === 0 && !h.done;
  const units = h?.units.filter((u) => u.seat === seat) ?? [];
  const bet = narrow && h ? h.streetBet[seat] : 0;
  const shown = !!h && h.holes[seat].length > 0 && h.holes[seat].every((c) => c.public);
  const tags: string[] = [];
  if (h?.button === seat) tags.push('D');
  if (h?.sbSeat === seat) tags.push('SB');
  if (h?.bbSeat === seat) tags.push('BB');
  return (
    <div
      className={cn(
        'absolute -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center',
        narrow ? 'w-[112px]' : 'w-[150px] gap-0.5',
        s.busted && 'opacity-40',
        onClock && 'z-[12]',
      )}
      style={seatStyle(pos, narrow)}
      data-seat={seat}
      data-on-clock={onClock ? '1' : undefined}
    >
      {/* U1: the seat's last action this street, as a comic speech burst. */}
      {bubble && !s.busted && (
        <span
          key={`${bubble.hand}-${bubble.street}-${bubble.kind}-${bubble.chips}`}
          className={cn(
            'speech-burst absolute z-20 left-1/2 -translate-x-1/2 whitespace-nowrap heading-font fs-xs px-1.5 py-0.5 ink-border-sm shadow-hard-black-xs',
            narrow ? 'top-full mt-5' : '-top-6',
            bubble.kind === 'fold'
              ? 'bg-[var(--c-steel)] text-[var(--c-paper)]'
              : bubble.kind === 'allin' || bubble.kind === 'cast' || bubble.kind === 'leader'
                ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                : 'bg-[var(--c-paper)] text-[var(--c-ink)]',
          )}
          data-bubble={bubble.kind}
        >
          {bubbleText(bubble, amt)}
        </span>
      )}
      {h && h.dealtIn[seat] && !s.busted ? (
        <SeatCards cards={h.holes[seat]} scale={1} fourColor={fourColor} dim={folded} />
      ) : (
        // Keep the plate where it sits when the seat has cards.
        <span aria-hidden style={{ height: 60 }} />
      )}
      <div
        className={cn(
          'relative flex items-center bg-black/80 rounded-md w-full',
          narrow ? 'gap-1 px-1 py-0.5' : 'gap-1.5 px-1.5 py-1',
          // A phone tucks the plate over the foot of the card backs.
          narrow && !shown && '-mt-3',
          // U2: one acting seat, loud — a 4px yellow border and a tab; a
          // window's candidates get a quiet dashed ring instead of all pulsing.
          onClock
            ? 'border-4 border-[var(--c-yellow)]'
            : inWindow
              ? 'ink-border-sm outline-2 outline-dashed outline-[var(--c-yellow)]/70'
              : 'ink-border-sm',
        )}
      >
        {onClock && (
          <span
            className={cn(
              'absolute -top-3 right-1 bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font fs-xs leading-[12px] px-1 ink-border-sm',
              !reduced && 'animate-pulse',
            )}
          >
            ON THE CLOCK
          </span>
        )}
        <button
          onClick={() => onInspect(s.leader)}
          title={`${s.leader.name} — inspect Leader`}
          className="shrink-0"
        >
          <LeaderArt def={s.leader} size={narrow ? 22 : 30} />
        </button>
        <div className="relative min-w-0 flex-1 leading-tight">
          <div className="text-[11px] font-black truncate" title={s.name}>
            {s.name}
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <Chips chips={s.stack} className="text-[var(--c-yellow)]" />
            <NerveMeter nerve={s.nerve} compact />
            {!narrow && (
              <span className="fs-xs text-white/60 whitespace-nowrap" title="Power cards in hand">
                🂠{s.hand.length}
              </span>
            )}
          </div>
          <StackDelta value={s.stack} />
        </div>
        {tags.length > 0 && (
          <span className="flex flex-col gap-0.5 shrink-0">
            {tags.map((t) => (
              <span
                key={t}
                className={cn(
                  'fs-xs font-black rounded-full px-1 leading-[12px]',
                  t === 'D' ? 'bg-white text-black' : 'bg-[var(--c-steel)]',
                )}
              >
                {t}
              </span>
            ))}
          </span>
        )}
      </div>
      <div
        className={cn(
          'flex flex-wrap justify-center gap-0.5',
          // On a phone the pills hang below the plate so they don't add to the
          // seat's footprint.
          narrow ? 'absolute top-full mt-0.5 w-[130px]' : 'min-h-[14px]',
        )}
      >
        {bet > 0 && (
          <span className="bg-[var(--c-yellow)] text-[var(--c-ink)] rounded-full px-1.5 ink-border-sm fs-xs font-black leading-[14px]">
            {amt(bet)}
          </span>
        )}
        {s.busted && <StatusPill text="OUT" />}
        {folded && <StatusPill text="FOLDED" />}
        {allIn && <StatusPill text="ALL IN" tone="red" />}
        {h?.locked[seat] && <StatusPill text="LOCKED" tone="red" />}
        {tilted(s) && !s.busted && <StatusPill text="TILTED" tone="red" />}
        {(h?.exclusions[seat] ?? []).map((c) => (
          <StatusPill key={c} text={`✗ ${CATEGORY_NAMES[c]}`} />
        ))}
        {units.map((u) => (
          <button
            key={u.uid}
            onClick={() => onInspect(u.def)}
            className="fs-xs font-black bg-[var(--c-yellow)] text-[var(--c-ink)] rounded px-1"
            title={`${u.def.name} — ${u.def.text ?? ''}`}
          >
            {tierLabel(u.def)} {u.def.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ text, tone }: { key?: React.Key; text: string; tone?: 'red' }) {
  return (
    <span
      className={cn(
        'fs-xs font-black rounded px-1 leading-[14px]',
        tone === 'red'
          ? 'bg-[var(--c-red)] text-white'
          : 'bg-[var(--c-steel)] text-[var(--c-paper)]',
      )}
    >
      {text}
    </span>
  );
}

// ===========================================================================
// The human's panel: hole cards, powers, Leader, actions
// ===========================================================================
function sortHand<T extends { uid: string; def: CardDef }>(
  hand: T[],
  sort: HandSort,
  castable: (uid: string) => boolean,
): T[] {
  if (sort === 'drawn') return hand;
  const idx = new Map(hand.map((p, i) => [p.uid, i]));
  return [...hand].sort((a, b) => {
    const d =
      sort === 'playable'
        ? Number(castable(b.uid)) - Number(castable(a.uid))
        : (a.def.tier ?? 0) - (b.def.tier ?? 0);
    return d || idx.get(a.uid)! - idx.get(b.uid)!;
  });
}

function HumanPanel({
  view,
  match,
  myTurn,
  myWindow,
  myChoice,
  windowCast,
  spriteScale,
  fourColor,
  helperText,
  raiseTo,
  setRaiseTo,
  turnLeft,
  turnMs,
  bankMs,
  windowLeft,
  choiceLeft,
  narrow,
  act,
  openCast,
  openLeader,
  onInspect,
  onSkip,
  onDeal,
  notice,
  targeted,
  handSort,
  onHandSort,
}: {
  view: Match;
  match: Match;
  myTurn: boolean;
  myWindow: boolean;
  myChoice: boolean;
  windowCast: CastRecord | null;
  spriteScale: number;
  fourColor: boolean;
  helperText: string | null;
  raiseTo: number;
  setRaiseTo: (n: number) => void;
  /** Null when the timers are off. */
  turnLeft: number | null;
  turnMs: number | null;
  bankMs: number;
  windowLeft: number | null;
  choiceLeft: number | null;
  narrow: boolean;
  act: (a: Action) => void;
  openCast: (uid: string) => void;
  openLeader: (i: number) => void;
  onInspect: (d: CardDef) => void;
  /** Busted and spectating: fast-forward to the result. */
  onSkip?: () => void;
  /** AUTO-DEAL off: deal the next hand. */
  onDeal?: () => void;
  notice: string | null;
  /** A power is aimed at you right now: the panel flashes red (U4). */
  targeted: boolean;
  handSort: HandSort;
  onHandSort: (s: HandSort) => void;
}) {
  const amt = useAmt();
  const h = view.hand;
  const me = view.seats[HUMAN];
  const opts = myTurn ? betOptions(match, HUMAN) : null;
  const pending = h?.pending;
  const hole = h?.holes[HUMAN] ?? [];
  // Shown at showdown: one marker by your name, not one per card (they
  // collide on a phone's 1× cards).
  const holeShown = hole.length > 1 && hole.every((c) => c.public && !isHidden(c));
  const live = !!h && inHand(h, HUMAN) && !h.done;
  const castable = (uid: string) => !!h && !h.done && canCast(view, HUMAN, uid).ok;
  const pot = h ? potTotal(h) : 0;
  const owe = opts?.callAmount ?? 0;
  // Whole chips: no even-rounding, so POT reaches an odd pot-limit maximum (A6).
  const potRaise = (frac: number) =>
    opts
      ? Math.max(
          opts.minRaiseTo,
          Math.min(opts.maxRaiseTo, Math.round(h!.currentBet + (pot + owe) * frac)),
        )
      : 0;
  const choiceLabel: Record<string, string> = {
    windfall: 'Windfall: pick a hole card to DISCARD (keep your best two)',
    pineapple: 'Pineapple: pick a hole card to DISCARD',
    redraw: 'Redraw: pick a hole card to REPLACE',
    exhume: 'Exhume: pick a hole card to swap for a random mucked card',
  };
  const inBank = turnLeft !== null && turnLeft < 0;
  const hand = sortHand(me.hand, handSort, (uid) => live && castable(uid));
  const sortIdx = HAND_SORTS.findIndex((s) => s.id === handSort);
  // U18: a bar that drains over the turn, then over the bank in red.
  const barPct =
    turnLeft === null || turnMs === null
      ? null
      : inBank
        ? Math.max(0, Math.min(100, ((bankMs + turnLeft) / Math.max(1, bankMs)) * 100))
        : Math.max(0, Math.min(100, (turnLeft / turnMs) * 100));
  const winCast = windowCast;
  const winTarget =
    winCast && winCast.target !== null
      ? winCast.target === HUMAN
        ? 'you'
        : view.seats[winCast.target]?.name
      : winCast?.veiled
        ? 'a hidden seat'
        : null;

  const leaderRow = (
    <div className="flex flex-wrap items-center gap-1.5" data-coach="leader">
      {(me.leader.abilities ?? []).map((ab, i) => {
        const check = canUseLeader(view, HUMAN, i);
        const ok = live && check.ok;
        // U13: name/effect and the cost on separate lines; the reason it is
        // unavailable printed, not hidden in a hover title.
        const m = ab.text.match(/^(-?\d+\s*nerve):?\s*(.*)$/i);
        return (
          <span key={i} className="flex flex-col items-start">
            <button
              disabled={!ok}
              onClick={() => openLeader(i)}
              title={check.why ?? ab.text}
              className={cn(
                'btn-pop text-[11px] font-black px-2 py-1 ink-border-sm text-left leading-tight',
                narrow && 'min-h-[32px]',
                ok
                  ? 'bg-orange-500 text-black'
                  : 'bg-[var(--c-steel)] text-white/60 cursor-not-allowed',
              )}
            >
              LEADER {m ? m[2] : ab.text}
              {m && (
                <span className="ml-1 rounded bg-black/80 text-orange-300 px-1 fs-xs">
                  {m[1].toUpperCase()}
                </span>
              )}
            </button>
            {!ok && live && check.why && (
              <span className="fs-xs text-white/60 max-w-[220px] leading-tight">{check.why}</span>
            )}
          </span>
        );
      })}
      {h?.freePeeks.includes(HUMAN) && myTurn && (
        <FreePeek view={view} onPeek={(t) => act({ type: 'freePeek', seat: HUMAN, target: t })} />
      )}
    </div>
  );

  return (
    <div
      className={cn(
        'relative z-20 bg-[var(--c-ink)] border-t-2 border-black flex flex-wrap items-end',
        narrow ? 'px-2 py-1.5 gap-x-2 gap-y-1.5' : 'px-3 py-2 gap-x-4 gap-y-2',
        targeted && 'targeted-flash',
      )}
      data-coach-avoid
      data-targeted={targeted ? '1' : undefined}
    >
      {barPct !== null && (
        <div
          className="absolute left-0 top-0 h-1 transition-[width] duration-200"
          style={{
            width: `${barPct}%`,
            background: inBank ? 'var(--c-red)' : 'var(--c-yellow)',
          }}
          aria-hidden
        />
      )}
      {/* On a phone the hole cards and the powers share one row (micro
          faces), the Leader buttons get their own, then the actions — the
          desktop's three columns stacked would leave the felt a strip. */}
      <div className={cn('flex items-end', narrow ? 'w-full gap-2' : 'contents')}>
        {/* Identity + hole cards */}
        <div
          className={cn('flex items-end shrink-0', narrow ? 'gap-1.5' : 'gap-3')}
          data-coach="hole"
        >
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => onInspect(me.leader)} title="Inspect your Leader">
              <LeaderArt def={me.leader} size={narrow ? 30 : 40} />
            </button>
            <NerveMeter nerve={me.nerve} compact={narrow} />
          </div>
          <div className="flex flex-col gap-1">
            <div className="relative flex items-center gap-x-2 gap-y-0.5 flex-wrap text-xs">
              <span className="heading-font text-[var(--c-yellow)]">{me.name}</span>
              <span className="relative">
                <Chips chips={me.stack} className="text-sm" />
                <StackDelta value={me.stack} />
              </span>
              {h?.button === HUMAN && <StatusPill text={narrow ? 'D' : 'DEALER'} />}
              {me.busted && <StatusPill text="OUT" tone="red" />}
              {holeShown && <StatusPill text="SHOWN" />}
              {narrow && h && h.streetBet[HUMAN] > 0 && (
                <span className="bg-[var(--c-yellow)] text-[var(--c-ink)] rounded-full px-1.5 ink-border-sm fs-xs font-black leading-[14px]">
                  {amt(h.streetBet[HUMAN])}
                </span>
              )}
            </div>
            <div className="flex items-end gap-1">
              {hole.map((c, i) => (
                <PlayingCard
                  key={i}
                  r={c.r}
                  s={c.s}
                  scale={spriteScale}
                  blinded={c.r === 0 && !!h && !h.folded[HUMAN]}
                  wild={c.wild}
                  isPublic={c.public && !holeShown}
                  fourColor={fourColor}
                  dim={!!h && h.folded[HUMAN]}
                  highlight={myChoice}
                  onClick={
                    myChoice ? () => act({ type: 'choose', seat: HUMAN, index: i }) : undefined
                  }
                />
              ))}
            </div>
            {helperText && (
              <div className="fs-xs font-bold text-emerald-300 max-w-[180px]">{helperText}</div>
            )}
            {h && h.exclusions[HUMAN].length > 0 && (
              <div className="fs-xs text-[var(--c-red)] font-bold max-w-[180px]">
                Can&apos;t win with: {h.exclusions[HUMAN].map((c) => CATEGORY_NAMES[c]).join(', ')}
              </div>
            )}
          </div>
        </div>

        {/* Powers (+ Leader on desktop) */}
        <div
          className={cn('flex flex-col gap-1', narrow ? 'flex-1 min-w-0' : 'flex-1 min-w-[240px]')}
          data-coach="powers"
        >
          <div className="flex items-center gap-2 fs-xs font-bold text-white/60 min-w-0">
            <span className="truncate">
              POWERS ({me.hand.length}/{MODES[view.mode].handCap})
              {narrow ? '' : ` · deck ${me.drawPile.length} · discard ${me.discard.length}`}
            </span>
            {me.hand.length > 1 && (
              <button
                onClick={() => onHandSort(HAND_SORTS[(sortIdx + 1) % HAND_SORTS.length].id)}
                className="shrink-0 ml-auto btn-pop heading-font fs-xs px-1.5 ink-border-sm bg-[var(--c-steel)] text-[var(--c-paper)]"
                title={`Sort: ${HAND_SORTS[sortIdx].blurb}`}
              >
                {HAND_SORTS[sortIdx].label}
              </button>
            )}
          </div>
          <div className="power-dock flex gap-1.5 overflow-x-auto pb-1">
            {me.hand.length === 0 && (
              <span className="fs-xs text-white/50">No power cards in hand.</span>
            )}
            {hand.map((p) => {
              const ok = live && castable(p.uid);
              return (
                <div key={p.uid} className="relative shrink-0">
                  <CardFace
                    def={p.def}
                    size={narrow ? 'micro' : 'compact'}
                    dimmed={!ok && live}
                    onClick={ok ? () => openCast(p.uid) : () => onInspect(p.def)}
                  />
                </div>
              );
            })}
          </div>
          {!narrow && leaderRow}
        </div>
      </div>
      {narrow && <div className="w-full">{leaderRow}</div>}

      {/* Actions */}
      <div
        className={cn('flex flex-col items-stretch gap-1', narrow ? 'w-full' : 'min-w-[280px]')}
        data-coach="actions"
      >
        {onSkip && (
          <div className="flex items-center justify-between gap-2 bg-black/60 ink-border-sm p-1.5">
            <span className="heading-font text-sm text-[var(--c-yellow)]">
              YOU&apos;RE OUT — WATCHING AT 4×
            </span>
            <button
              onClick={onSkip}
              data-primary="1"
              className="btn-pop heading-font fs-xs px-3 py-1.5 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm whitespace-nowrap"
            >
              SKIP TO RESULT ▸▸
            </button>
          </div>
        )}
        {onDeal && (
          <button
            onClick={onDeal}
            data-primary="1"
            className="btn-pop heading-font text-sm px-3 py-2 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs"
          >
            DEAL NEXT HAND ▸
          </button>
        )}
        {notice && (
          // U17: an announced toast with an ink border (kept on a white fill:
          // the UI driver reads it as the "illegal action" signal).
          <div
            role="alert"
            className="fs-xs font-bold text-[#b42318] bg-white/95 px-2 py-1 ink-border-sm shadow-hard-black-xs"
          >
            {notice}
          </div>
        )}
        {myChoice && pending?.kind === 'choice' && (
          <div className="heading-font text-xs text-[var(--c-yellow)]">
            {choiceLabel[pending.choice]}{' '}
            <span className="font-sans fs-xs font-bold normal-case text-white/60">
              {choiceLeft === null
                ? 'take your time'
                : `auto-pick ${Math.ceil(Math.max(0, choiceLeft) / 1000)}s`}
            </span>
          </div>
        )}
        {myWindow && (
          <div className="flex flex-col gap-1 bg-black/60 ink-border-sm p-1.5">
            {/* U5: what the card does and whom it hits, not just its name. */}
            {winCast ? (
              <div className="flex items-start gap-2">
                {!narrow && (
                  <CardFace
                    def={winCast.leader ? view.seats[winCast.seat].leader : winCast.def}
                    size="micro"
                    onClick={() =>
                      onInspect(winCast.leader ? view.seats[winCast.seat].leader : winCast.def)
                    }
                  />
                )}
                <div className="text-[11px] font-bold min-w-0">
                  <div>
                    Respond to {view.seats[winCast.seat].name}&apos;s{' '}
                    <button
                      className="underline decoration-dotted"
                      onClick={() =>
                        onInspect(winCast.leader ? view.seats[winCast.seat].leader : winCast.def)
                      }
                    >
                      {winCast.leader ? 'Leader' : winCast.def.name}
                    </button>
                    ?
                  </div>
                  <div className="text-[var(--c-yellow)]">
                    {keywordLabel(winCast.effect.kw, winCast.effect.n)}
                    {winTarget ? ` → ${winTarget}` : ''}
                  </div>
                  {winCast.chipsPaid > 0 && (
                    <div className="text-white/60">paid {amt(winCast.chipsPaid)}</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-[11px] font-bold">
                Response window: cast a Quick Event or Ambush card, or pass.
              </div>
            )}
            <div className="fs-xs text-white/60">
              {windowLeft === null
                ? 'Waiting for you — PASS [P] or cast.'
                : `auto-pass ${Math.ceil(Math.max(0, windowLeft) / 1000)}s`}
            </div>
            <button
              onClick={() => act({ type: 'pass', seat: HUMAN })}
              data-primary="1"
              className="btn-pop heading-font text-sm px-3 py-1.5 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm"
            >
              PASS
            </button>
          </div>
        )}
        {myTurn && opts && (
          <>
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span>
                To call <Chips chips={owe} /> · pot <Chips chips={pot} />
              </span>
              {turnLeft !== null && (
                <span className={cn(inBank ? 'text-[var(--c-red)]' : 'text-white/70')}>
                  {inBank
                    ? `TIME BANK ${Math.ceil(Math.max(0, bankMs + turnLeft) / 1000)}s`
                    : `${Math.ceil(Math.max(0, turnLeft) / 1000)}s`}
                </span>
              )}
            </div>
            <div className="flex gap-1.5">
              <ActionButton
                label="FOLD"
                hotkey="F"
                tone="ink"
                onClick={() => act({ type: 'fold', seat: HUMAN })}
              />
              {opts.canCheck ? (
                <ActionButton
                  label="CHECK"
                  hotkey="C"
                  primary
                  onClick={() => act({ type: 'check', seat: HUMAN })}
                />
              ) : (
                <ActionButton
                  label={`CALL ${amt(opts.callAmount)}`}
                  hotkey="C"
                  primary
                  onClick={() => act({ type: 'call', seat: HUMAN })}
                />
              )}
              {opts.canRaise && (
                <ActionButton
                  label={`${h!.currentBet === 0 ? 'BET' : 'RAISE TO'} ${amt(raiseTo)}${raiseTo >= me.stack + h!.streetBet[HUMAN] ? ' ALL IN' : ''}`}
                  hotkey="R"
                  tone="yellow"
                  onClick={() => act({ type: 'raise', seat: HUMAN, to: raiseTo })}
                />
              )}
            </div>
            {opts.canRaise && opts.maxRaiseTo > opts.minRaiseTo && (
              <div className="flex items-center gap-1.5">
                {/* step 1: every amount is a whole chip, and an odd pot-limit
                    maximum or all-in must be reachable (A6). */}
                <input
                  type="range"
                  min={opts.minRaiseTo}
                  max={opts.maxRaiseTo}
                  step={1}
                  value={raiseTo}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setRaiseTo(v >= opts.maxRaiseTo - 1 ? opts.maxRaiseTo : v);
                  }}
                  className="flex-1 accent-[var(--c-yellow)]"
                  aria-label="Raise amount (pot limit)"
                />
                {[
                  ['½', 0.5],
                  ['¾', 0.75],
                  ['POT', 1],
                ].map(([l, f]) => (
                  <button
                    key={l}
                    onClick={() => setRaiseTo(potRaise(f as number))}
                    className={cn(
                      'btn-pop fs-xs font-black px-1.5 ink-border-sm bg-[var(--c-steel)] text-[var(--c-paper)]',
                      narrow ? 'min-h-[40px] min-w-[40px]' : 'py-0.5 min-h-[28px]',
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {!myTurn && !myWindow && !myChoice && h && !h.done && (
          <div className="fs-xs font-bold text-white/60 text-center">
            {h.folded[HUMAN]
              ? 'Folded — watching the hand.'
              : me.busted
                ? ''
                : 'Waiting on the table…'}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  hotkey,
  onClick,
  tone = 'paper',
  primary,
}: {
  label: string;
  hotkey: string;
  onClick: () => void;
  tone?: 'paper' | 'ink' | 'yellow';
  /** The coach callout keeps off the primary action. */
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      data-primary={primary ? '1' : undefined}
      className={cn(
        'btn-pop flex-1 min-w-0 heading-font text-sm leading-tight px-2 py-2 ink-border-sm shadow-hard-black-xs',
        tone === 'yellow' && 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
        tone === 'ink' && 'bg-[var(--c-steel)] text-[var(--c-paper)]',
        tone === 'paper' && 'bg-[var(--c-paper)] text-[var(--c-ink)]',
      )}
    >
      {label}{' '}
      <span className="opacity-50 fs-xs hidden sm:inline whitespace-nowrap">[{hotkey}]</span>
    </button>
  );
}

function FreePeek({ view, onPeek }: { view: Match; onPeek: (seat: number) => void }) {
  const h = view.hand!;
  const targets = view.seats.filter((s) => s.idx !== HUMAN && inHand(h, s.idx));
  return (
    <span className="flex items-center gap-1 text-[11px] font-bold">
      Dealer&apos;s Choice peek:
      {targets.map((s) => (
        <button
          key={s.idx}
          onClick={() => onPeek(s.idx)}
          className="btn-pop px-1.5 py-0.5 ink-border-sm bg-sky-500 text-black"
        >
          {s.name}
        </button>
      ))}
    </span>
  );
}

// ===========================================================================
// Cast dialog: targets, second costs, Feint
// ===========================================================================
function CastDialog({
  view,
  flow,
  secondsLeft,
  onClose,
  onCast,
  onInspect,
}: {
  view: Match;
  flow: { uid?: string; leader?: number };
  /** The decision's remaining time (the clock keeps running, A4). */
  secondsLeft: number | null;
  onClose: () => void;
  onCast: (a: Action) => void;
  onInspect: (d: CardDef) => void;
}) {
  const amt = useAmt();
  const h = view.hand!;
  const me = view.seats[HUMAN];
  const inst = flow.uid ? me.hand.find((p) => p.uid === flow.uid) : null;
  const leaderIdx = flow.leader;
  const def: CardDef | null = inst
    ? inst.def
    : leaderIdx !== undefined
      ? leaderPseudoDef(me.leader, leaderIdx)
      : null;
  const [target, setTarget] = useState<number | null>(null);
  const [targetCast, setTargetCast] = useState<number | null>(null);
  const [costs, setCosts] = useState<ExtraCost[]>([]);
  const [feint, setFeint] = useState(false);
  // The shared Escape stack: Escape in an inspector opened from here closes
  // only the inspector, not the half-built cast under it (A23).
  useEscapeClose(onClose);
  if (!def) return null;
  const isLeader = leaderIdx !== undefined;
  const check = isLeader ? canUseLeader(view, HUMAN, leaderIdx!) : canCast(view, HUMAN, inst!.uid);
  const cost = isLeader ? null : castCost(view, HUMAN, def);
  const eff = effectiveEffect(h, def);
  const needsTarget = isLeader
    ? KEYWORD_SPECS[def.effect!.kw].target === 'opponent'
    : needsOpponentTarget(h, def);
  const targets = needsTarget ? legalTargets(view, HUMAN, def) : [];
  const castOpts =
    !isLeader && (eff?.kw === 'Call Out' || eff?.kw === 'Snuff')
      ? castTargets(view, HUMAN, def)
      : [];
  const extraNeeded = cost?.extra ?? 0;
  const shedOpts = me.hand.filter((p) => p.uid !== inst?.uid);
  const debuffOpts = h.holes[HUMAN].map((c, i) => ({ c, i })).filter(
    ({ c }) => !c.blinded && c.r !== 0,
  );
  const exclOpts = extraNeeded > 0 ? excludableCategories(view, HUMAN) : [];
  const exclRoom = MAX_EXCLUSIONS - h.exclusions[HUMAN].length;
  const has = (e: ExtraCost) =>
    costs.some((x) => x.kind === e.kind && JSON.stringify(x) === JSON.stringify(e));
  const toggle = (e: ExtraCost) =>
    setCosts((cs) =>
      has(e)
        ? cs.filter((x) => JSON.stringify(x) !== JSON.stringify(e))
        : cs.length < extraNeeded &&
            (e.kind !== 'exclude' || cs.filter((x) => x.kind === 'exclude').length < exclRoom)
          ? [...cs, e]
          : cs,
    );
  const ready =
    check.ok &&
    (!needsTarget || target !== null) &&
    (castOpts.length === 0 || targetCast !== null || castOpts.length === 1) &&
    costs.length === extraNeeded;
  const submit = () => {
    if (isLeader) onCast({ type: 'leader', seat: HUMAN, ability: leaderIdx!, target });
    else
      onCast({
        type: 'cast',
        seat: HUMAN,
        uid: inst!.uid,
        target,
        targetCast: targetCast ?? castOpts[castOpts.length - 1]?.id ?? null,
        costs,
        feint,
      });
  };
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-black max-w-2xl w-full p-4 flex flex-col sm:flex-row gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Cast ${def.name}`}
      >
        <div className="shrink-0 flex flex-col items-center gap-2">
          {isLeader ? (
            <CardFace def={me.leader} size="standard" />
          ) : (
            <CardFace def={def} size="standard" onClick={() => onInspect(def)} />
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="heading-font text-lg leading-tight">
              {isLeader ? `${me.leader.name} — Leader` : def.name}
            </h3>
            <span className="flex items-center gap-1">
              {secondsLeft !== null && (
                <span
                  className={cn(
                    'fs-xs font-black tabular-nums px-1 ink-border-sm',
                    secondsLeft <= 10 && 'bg-[var(--c-red)] text-white',
                  )}
                  title="Time left on this decision"
                >
                  {Math.max(0, secondsLeft)}s
                </span>
              )}
              <button onClick={onClose} aria-label="Close" className="p-1">
                <X className="w-4 h-4" />
              </button>
            </span>
          </div>
          {eff && (
            <p className="text-sm font-bold">
              {keywordLabel(eff.kw, eff.n)}
              {def.effect?.kw === 'Mimic' && ' (copied from the last cast)'}
            </p>
          )}
          <p className="text-xs">
            {isLeader
              ? me.leader.abilities![leaderIdx!].text
              : `Costs ${amt(cost!.chips)}${cost!.gambitOwed ? ` now (Gambit: owe ${amt(cost!.gambitOwed * 2)} if you lose)` : ''}${extraNeeded ? ` + ${extraNeeded} second cost${extraNeeded > 1 ? 's' : ''}` : ''}. The cast is public — everyone sees this card${needsTarget ? ' and its target' : ''}.`}
          </p>
          {!check.ok && <p className="text-xs font-bold text-[var(--c-red)]">{check.why}</p>}
          {needsTarget && (
            <div>
              <div className="fs-xs font-black mb-1">TARGET</div>
              <div className="flex flex-wrap gap-1">
                {targets.length === 0 && (
                  <span className="text-xs">
                    No legal target (one hostile power per seat per street).
                  </span>
                )}
                {targets.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTarget(t)}
                    className={cn(
                      'btn-pop text-xs font-bold px-2 py-1 ink-border-sm',
                      target === t ? 'bg-[var(--c-yellow)]' : 'bg-white',
                    )}
                  >
                    {view.seats[t].name} {amt(view.seats[t].stack)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {castOpts.length > 1 && (
            <div>
              <div className="fs-xs font-black mb-1">WHICH CAST</div>
              <div className="flex flex-wrap gap-1">
                {castOpts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setTargetCast(c.id)}
                    className={cn(
                      'btn-pop text-xs font-bold px-2 py-1 ink-border-sm',
                      targetCast === c.id ? 'bg-[var(--c-yellow)]' : 'bg-white',
                    )}
                  >
                    {view.seats[c.seat].name}: {c.def.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {extraNeeded > 0 && (
            <div>
              <div className="fs-xs font-black mb-1">
                SECOND COST — pick {extraNeeded} ({costs.length}/{extraNeeded})
              </div>
              <div className="flex flex-wrap gap-1">
                {shedOpts.map((p) => (
                  <CostChip
                    key={p.uid}
                    on={has({ kind: 'shed', uid: p.uid })}
                    onClick={() => toggle({ kind: 'shed', uid: p.uid })}
                  >
                    Shed {p.def.name}
                  </CostChip>
                ))}
                {debuffOpts.map(({ c, i }) => (
                  <CostChip
                    key={`d${i}`}
                    on={has({ kind: 'debuff', hole: i })}
                    onClick={() => toggle({ kind: 'debuff', hole: i })}
                  >
                    Blind your {cardLabel(c)} this street
                  </CostChip>
                ))}
                {exclOpts.map((cat) => (
                  <CostChip
                    key={`x${cat}`}
                    on={has({ kind: 'exclude', category: cat })}
                    onClick={() => toggle({ kind: 'exclude', category: cat })}
                  >
                    Exclude {CATEGORY_NAMES[cat]}
                  </CostChip>
                ))}
              </div>
            </div>
          )}
          {!isLeader && hasKw(def, 'Feint') && (
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={feint} onChange={(e) => setFeint(e.target.checked)} />
              Feint: secretly let it fizzle (only a Call Out can tell)
            </label>
          )}
          <button
            disabled={!ready}
            onClick={submit}
            className="btn-pop heading-font text-base px-4 py-2 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-md shadow-hard-black-xs disabled:opacity-40 disabled:cursor-not-allowed mt-auto"
          >
            {isLeader ? 'USE LEADER' : 'CAST'} <ChevronRight className="inline w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CostChip({
  on,
  onClick,
  children,
}: {
  key?: React.Key;
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'btn-pop text-[11px] font-bold px-2 py-1 ink-border-sm',
        on ? 'bg-[var(--c-yellow)]' : 'bg-white',
      )}
    >
      {children}
    </button>
  );
}

// ===========================================================================
// Spotlight, results, log, history, game over
// ===========================================================================
/** The log lines a cast produced so far: everything after its anchor line in
 * the same hand, minus street headers. */
function castResults(log: LogEntry[], anchor: string, hand: number): LogEntry[] {
  let i = -1;
  for (let k = log.length - 1; k >= 0; k--)
    if (log[k].text === anchor) {
      i = k;
      break;
    }
  if (i < 0) return [];
  return log
    .slice(i + 1)
    .filter((e) => e.hand === hand && !e.text.startsWith('—'))
    .slice(0, 2);
}

/** A seat's centre in felt pixels (the same clamp as seatStyle). */
function seatPx(pos: SeatPos, felt: { w: number; h: number }, narrow: boolean): [number, number] {
  const half = narrow ? { w: 56, h: 42 } : { w: 75, h: 60 };
  const x = Math.min(Math.max(half.w, (pos[0] / 100) * felt.w), felt.w - half.w);
  const y = Math.min(Math.max(half.h, (pos[1] / 100) * felt.h), felt.h - half.h);
  return [x, y];
}

function Spotlight({
  spot,
  match,
  positions,
  felt,
  narrow,
  onInspect,
  onDismiss,
}: {
  spot: Spot;
  match: Match;
  positions: SeatPos[];
  felt: { w: number; h: number };
  narrow: boolean;
  onInspect: (d: CardDef) => void;
  onDismiss: () => void;
}) {
  const { cast } = spot;
  const caster = match.seats[cast.seat];
  const def = cast.leader ? caster.leader : cast.def;
  const atYou = cast.target === HUMAN;
  const target =
    cast.target !== null
      ? atYou
        ? 'YOU'
        : match.seats[cast.target]?.name
      : cast.veiled
        ? 'a hidden seat'
        : null;
  const results = castResults(match.log, spot.anchor, match.handNo);
  const from = positions[cast.seat] ?? [50, 10];
  // Docked beside the caster, never over the board and pot.
  const left = from[0] < 35 ? from[0] + 19 : from[0] > 65 ? from[0] - 19 : from[0] + 24;
  const top = narrow ? 62 : from[1];
  // Half the box's height, so it never rides up over the banner or off the felt.
  const half = narrow ? 105 : 135;
  const [x1, y1] = seatPx(from, felt, narrow);
  const to = cast.target !== null ? positions[cast.target] : null;
  const [x2, y2] = to ? seatPx(to, felt, narrow) : [0, 0];
  // Stop the arrow short of the target plate.
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const trim = narrow ? 34 : 50;
  const ex = x2 - ((x2 - x1) / len) * trim;
  const ey = y2 - ((y2 - y1) / len) * trim;
  const sx = x1 + ((x2 - x1) / len) * trim;
  const sy = y1 + ((y2 - y1) / len) * trim;
  return (
    <>
      {to && felt.w > 0 && (
        <svg
          className="absolute inset-0 z-[25] pointer-events-none overflow-visible"
          width={felt.w}
          height={felt.h}
          aria-hidden
          data-testid="cast-arrow"
        >
          <defs>
            <marker
              id="cast-head"
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="#111" />
            </marker>
          </defs>
          <line
            x1={sx}
            y1={sy}
            x2={ex}
            y2={ey}
            stroke="#111"
            strokeWidth={7}
            markerEnd="url(#cast-head)"
          />
          <line
            x1={sx}
            y1={sy}
            x2={ex}
            y2={ey}
            stroke={atYou ? 'var(--c-red)' : 'var(--c-yellow)'}
            strokeWidth={3}
          />
        </svg>
      )}
      <div
        className={cn(
          'absolute z-30 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 bg-black/85 ink-border-md shadow-hard-black-sm animate-[fadeIn_.2s_ease-out]',
          narrow ? 'px-2 py-1.5 max-w-[170px]' : 'px-3 py-2 max-w-[240px]',
        )}
        style={{
          left: `clamp(${narrow ? 90 : 125}px, ${left}%, calc(100% - ${narrow ? 90 : 125}px))`,
          top: `clamp(${half}px, ${top}%, calc(100% - ${half}px))`,
        }}
        role="status"
        aria-label={`${caster.name} ${cast.leader ? 'uses their Leader' : `casts ${def.name}`}${target ? ` at ${target}` : ''}`}
        data-testid="cast-spotlight"
      >
        <div className="heading-font text-xs text-[var(--c-yellow)] text-center leading-tight">
          {caster.name} {cast.leader ? 'uses their Leader' : 'casts'}
          {target ? (
            <>
              {' → '}
              <span className={cn(atYou && 'text-[var(--c-red)]')}>{target}</span>
            </>
          ) : cast.veiled ? (
            ' → ?'
          ) : (
            ''
          )}
        </div>
        <button
          type="button"
          onClick={() => onInspect(def)}
          className="flex flex-col items-center"
          title="Click for details"
          aria-label={`Inspect ${def.name}`}
        >
          <span className="pointer-events-none">
            <CardFace def={def} size={narrow ? 'micro' : 'compact'} />
          </span>
          <span className="fs-xs font-black text-white/70 mt-0.5">TAP FOR DETAILS</span>
        </button>
        <div className="fs-xs font-bold text-center">
          {keywordLabel(cast.effect.kw, cast.effect.n)}
        </div>
        <div className="fs-xs text-center text-white/85 leading-tight" data-testid="cast-result">
          {results.length > 0
            ? results.map((e, i) => <div key={i}>{e.text}</div>)
            : cast.status === 'pending'
              ? 'Waiting on responses…'
              : ''}
        </div>
        {spot.hold && (
          <button
            onClick={onDismiss}
            data-primary="1"
            className="btn-pop heading-font fs-xs px-3 py-1 mt-0.5 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm"
          >
            GOT IT ▸
          </button>
        )}
      </div>
    </>
  );
}

/** One hand's lines from the log: its streets, actions and casts (U8). */
function handLines(match: Match, no: number): LogEntry[] {
  return match.log.filter((e) => e.hand === no);
}

function HandResultBanner({
  match,
  fourColor,
  onDeal,
}: {
  match: Match;
  fourColor: boolean;
  /** AUTO-DEAL off: the banner stays until the player deals. */
  onDeal?: () => void;
}) {
  const amt = useAmt();
  const [open, setOpen] = useState(false);
  const h = match.hand!;
  const r = h.result!;
  // A17: the human reads as "You" (whatever their username) and the verb
  // follows the name, not the seat index — never "alice win".
  const nameOf = (i: number) => (i === HUMAN ? 'You' : match.seats[i].name);
  return (
    <div className="bg-black/85 ink-border-sm rounded px-3 py-1.5 text-center max-w-[420px]">
      {r.pots.map((p, i) => {
        const solo = p.winners.length === 1;
        const you = solo && p.winners[0] === HUMAN;
        return (
          <div key={i} className="text-xs font-bold">
            {p.winners.map(nameOf).join(' & ')} {solo && !you ? 'wins' : 'win'} {amt(p.amount)}
            {p.board ? ` (board ${p.board})` : ''}
            {!r.uncontested && p.winners[0] !== undefined && r.shown[p.winners[0]]
              ? ` — ${r.shown[p.winners[0]]}`
              : ''}
          </div>
        );
      })}
      {!r.uncontested && (
        <div className="flex flex-wrap justify-center gap-2 mt-1">
          {Object.keys(r.shown).map((k) => {
            const i = Number(k);
            return (
              <span key={i} className="flex items-center gap-1 fs-xs font-bold">
                {nameOf(i)}
                <SeatCards cards={h.holes[i]} scale={1} fourColor={fourColor} />
              </span>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-center gap-2 mt-1">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="fs-xs font-black underline decoration-dotted"
        >
          HOW IT HAPPENED {open ? '▴' : '▾'}
        </button>
        {onDeal && (
          <button
            onClick={onDeal}
            className="btn-pop heading-font fs-xs px-2 py-1 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm"
          >
            NEXT HAND ▸
          </button>
        )}
      </div>
      {open && <RecapList lines={handLines(match, h.no)} />}
    </div>
  );
}

function RecapList({ lines }: { lines: LogEntry[] }) {
  if (lines.length === 0)
    return <div className="fs-xs text-white/60 mt-1">The log no longer keeps this hand.</div>;
  return (
    <div className="mt-1 max-h-40 overflow-y-auto text-left fs-xs leading-snug flex flex-col gap-0.5">
      {lines.map((e, i) => (
        <div
          key={i}
          className={cn(
            e.to !== undefined && 'text-sky-300 italic',
            e.text.startsWith('—') && 'heading-font text-[var(--c-yellow)] mt-0.5',
          )}
        >
          {e.text}
        </div>
      ))}
    </div>
  );
}

function LogPanel({
  match,
  narrow,
  onClose,
}: {
  match: Match;
  narrow: boolean;
  onClose: () => void;
}) {
  const entries = match.log.slice(-120);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [entries.length]);
  return (
    <aside
      className={cn(
        'absolute z-40 bg-[var(--c-ink)]/95 border-black flex flex-col',
        // A bottom sheet on a phone: a side drawer covered the right-hand seats.
        narrow
          ? 'inset-x-0 bottom-0 h-[55%] border-t-2'
          : 'right-0 top-0 bottom-0 w-[300px] max-w-[85vw] border-l-2',
      )}
      aria-label="Table log"
    >
      <div className="flex items-center justify-between px-2 py-1 border-b border-white/10">
        <span className="heading-font text-xs text-[var(--c-yellow)]">TABLE LOG</span>
        <button
          onClick={onClose}
          aria-label="Close log"
          className="min-w-[32px] min-h-[32px] flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 text-[11px] leading-snug flex flex-col gap-0.5">
        {entries.map((e, i) => (
          <div
            key={i}
            className={cn(
              e.to !== undefined && 'text-sky-300 italic',
              e.text.startsWith('—') && 'heading-font text-[var(--c-yellow)] mt-1',
            )}
          >
            {e.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </aside>
  );
}

function HistoryModal({ match, onClose }: { match: Match; onClose: () => void }) {
  useEscapeClose(onClose);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-black max-w-lg w-full p-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Hand history"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="heading-font text-lg">HAND HISTORY</h3>
          <button onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <ol className="flex-1 overflow-y-auto flex flex-col gap-1 text-xs">
          {[...match.history].reverse().map((r) => (
            <li key={r.no} className="ink-border-sm px-2 py-1">
              <button
                className="w-full text-left"
                aria-expanded={open === r.no}
                onClick={() => setOpen((o) => (o === r.no ? null : r.no))}
              >
                <span className="font-black">#{r.no}</span> · {r.location} · {r.board || 'no board'}{' '}
                — {r.summary} <span className="font-black">{open === r.no ? '▴' : '▾'}</span>
              </button>
              {open === r.no && (
                <div className="bg-[#111] text-[#f2f2f2] mt-1 px-2 py-1 rounded">
                  <RecapList lines={handLines(match, r.no)} />
                </div>
              )}
            </li>
          ))}
          {match.history.length === 0 && <li>No hands finished yet.</li>}
        </ol>
      </div>
    </div>
  );
}

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function GameOver({
  match,
  conceded,
  onExit,
  onRematch,
  reward,
  rewardError,
  rewardPending,
  heldUntil,
  retrying,
}: {
  match: Match;
  conceded: boolean;
  onExit: () => void;
  onRematch: () => void;
  reward?: MatchResult | null;
  rewardError?: string | null;
  rewardPending?: boolean;
  /** The result is held until the server's reward floor passes (A20). */
  heldUntil: number | null;
  retrying: boolean;
}) {
  const live = standings(match);
  const concededNow = conceded && match.phase !== 'over' && !match.seats[HUMAN].busted;
  // Conceding takes the lowest place still open, whatever your stack — rank
  // the list the same way, or a conceding chip leader is shown "1ST".
  const place = concededNow ? match.seats.filter((s) => !s.busted).length : live.indexOf(HUMAN) + 1;
  const order = concededNow
    ? (() => {
        const rest = live.filter((i) => i !== HUMAN);
        rest.splice(place - 1, 0, HUMAN);
        return rest;
      })()
    : live;
  const preview = placementReward(place, match.seats.length, match.mode);
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => {
    if (heldUntil === null) return;
    const tick = () => setNowTs(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [heldUntil]);
  return (
    <div className="absolute inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-black max-w-md w-full p-5 flex flex-col gap-3">
        <h2 className="heading-font text-2xl text-center">
          {/* A16: "CONCEDED" only when the concede actually decided the place. */}
          {concededNow
            ? 'CONCEDED'
            : place === 1
              ? 'YOU WIN THE TABLE!'
              : `YOU FINISHED ${ordinal(place).toUpperCase()}`}
        </h2>
        <p className="text-center fs-xs font-bold text-[var(--c-steel)]">
          {MODES[match.mode].label} · {match.seats.length} seats · {match.handNo} hands
          {match.capped ? ' · the clock ran out, stacks were ranked' : ''}
        </p>
        <ol className="flex flex-col gap-1">
          {order.map((idx, k) => {
            const s = match.seats[idx];
            return (
              <li
                key={idx}
                className={cn(
                  'flex items-center gap-2 ink-border-sm px-2 py-1',
                  idx === HUMAN && 'bg-[var(--c-yellow)] text-[#111]',
                )}
              >
                <span className="heading-font w-8">{ordinal(k + 1)}</span>
                <LeaderArt def={s.leader} size={22} />
                <span className="text-sm font-bold flex-1 truncate">{s.name}</span>
                <span className="text-xs font-mono">
                  {s.busted ? 'out' : `◎${fmtAmount(s.stack, null)}`}
                </span>
              </li>
            );
          })}
        </ol>
        {reward != null ? (
          <div className="text-center heading-font text-sm">
            +{fmtCredits(reward.reward)} CREDITS · +{reward.xp_gained} XP · +{reward.bp_xp_gained}{' '}
            PASS XP
            {reward.leveled_up && (
              <div className="text-xs">
                LEVEL UP! NOW LV {reward.level} · +{fmtCredits(reward.level_credits_bonus)} CREDITS
                {reward.level_vouchers_bonus > 0
                  ? ` · +${fmtVouchers(reward.level_vouchers_bonus)} VOUCHERS`
                  : ''}
              </div>
            )}
          </div>
        ) : heldUntil !== null ? (
          <div className="text-center text-xs font-bold" role="status">
            Reward unlocks in {fmtClock(heldUntil - (nowTs || heldUntil))} — a match has to run a
            minimum time to pay. Stay on this screen and it is paid automatically.
          </div>
        ) : retrying ? (
          <div className="text-center text-xs font-bold" role="status">
            The server needs a little longer before it pays this match — retrying shortly…
          </div>
        ) : rewardPending ? (
          <div className="text-center text-xs font-bold animate-pulse">Saving your reward…</div>
        ) : rewardError ? (
          <div className="text-center text-xs font-bold text-[var(--c-red)]">{rewardError}</div>
        ) : (
          <div className="text-center fs-xs font-bold text-[var(--c-steel)]">
            {ordinal(place)} place pays {preview.credits} credits with an account. Rewards follow
            placement only — never chips.
          </div>
        )}
        <div className="flex gap-2 justify-center">
          <button
            onClick={onRematch}
            className="btn-pop heading-font text-sm px-4 py-2 bg-[var(--c-yellow)] text-[#111] ink-border-sm shadow-hard-black-xs"
          >
            REMATCH
          </button>
          <button
            onClick={onExit}
            className="btn-pop heading-font text-sm px-4 py-2 bg-[var(--c-ink)] text-[var(--c-paper)] ink-border-sm shadow-hard-black-xs"
          >
            BACK TO MENU
          </button>
        </div>
        <p className="text-center fs-xs text-[var(--c-steel)] flex items-center justify-center gap-1">
          <Users className="w-3 h-3" /> Seed {match.seed}
        </p>
      </div>
    </div>
  );
}
