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
 * Desktop first: hover any cast card to inspect it, F / C / R for fold,
 * check-call and raise. Seat positions live in pokerLayout.ts, so the phone
 * layout is a different position table, not a different component.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Clock, Flame, History, ScrollText, Users, X } from 'lucide-react';
import { botAction, botRng, estimateEquity } from '../game/poker/bot';
import type { CardDef } from '../game/poker/cards';
import { hasKw, tierLabel } from '../game/poker/cards';
import {
  HUMAN_ACTION_CAP_MS,
  MAX_EXCLUSIONS,
  MODES,
  TIME_BANK_MS,
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
  fmtChips,
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
  loadCpuSpeed,
  loadFourColor,
  loadHandHelper,
  loadMotionMode,
  motionIsReduced,
  saveCpuSpeed,
  saveFourColor,
  saveHandHelper,
} from '../meta/matchPrefs';
import { recordMatch } from '../meta/matchHistory';
import { askConfirm } from '../meta/confirm';
import { CardFace } from './CardFaceV4';
import { Card3DInspector } from './Card3DInspector';
import { CoachOverlay } from './CoachOverlay';
import { PlayingCard } from './PlayingCard';
import { VisibleVideo } from './VisibleVideo';
import { betPosition, boardY, seatPositions, seatStyle, type SeatPos } from './pokerLayout';

export const HUMAN = 0;

/** Time on the between-hands result banner at 1× (scaled by speed). */
const RESULT_PAUSE_MS = 3200;
/** Auto-pass a response window the human ignores. */
const WINDOW_AUTOPASS_MS = 10_000;
/** Auto-pick a hole-card choice the human ignores. */
const CHOICE_TIMEOUT_MS = TURN_TIMER_MS;
/** How long a cast's full-art spotlight stays up at 1×. */
const SPOTLIGHT_MS = 1700;
/** Spectating after a bust runs at 4× speed. */
const SPECTATE_MULT = 0.25;
/** Felt height (px) from which the board's cards are drawn at 2×. */
const BOARD_X2_MIN_FELT_PX = 450;

export interface PokerTableProps {
  key?: React.Key;
  setup: MatchSetup;
  /** Guided first game: helper on, coach shown. */
  tutorial?: boolean;
  onExit: () => void;
  onRematch: () => void;
  /** Called once when the match ends (or the human concedes) with the human's place. */
  onResult?: (r: { place: number; seats: number; mode: MatchSetup['mode']; hands: number }) => void;
  reward?: MatchResult | null;
  rewardError?: string | null;
  rewardPending?: boolean;
  /** The human's deck as a share code, for match history. */
  humanDeckCode?: string;
}

// ===========================================================================
// Small pieces
// ===========================================================================
function Chips({ chips, className }: { chips: number; className?: string }) {
  return (
    <span
      className={cn('font-mono font-black tabular-nums', className)}
      title={`${fmtChips(chips)} chips`}
    >
      ◎{fmtChips(chips)}
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
  const botRngRef = useRef(botRng(setup.seed ^ 0x9e3779b9));
  const [speedIdx, setSpeedIdx] = useState(loadCpuSpeed);
  const [helper, setHelper] = useState(() => loadHandHelper(tutorial));
  const [fourColor, setFourColor] = useState(loadFourColor);
  const [showLog, setShowLog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [inspect, setInspect] = useState<CardDef | null>(null);
  const [castFlow, setCastFlow] = useState<{ uid?: string; leader?: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conceded, setConceded] = useState(false);
  const [raiseSel, setRaiseTo] = useState(0);
  const [bankMs, setBankMs] = useState(TIME_BANK_MS);
  const [now, setNow] = useState(0);
  const promptAt = useRef(0);
  /** When the human's current decision was first put to them (render-safe copy). */
  const [promptStart, setPromptStart] = useState(0);
  const narrow = useIsNarrow();
  const feltRef = useRef<HTMLDivElement>(null);
  const [feltH, setFeltH] = useState(0);
  useEffect(() => {
    const el = feltRef.current;
    if (!el) return;
    const measure = () => setFeltH(el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [reduced] = useState(() => motionIsReduced(loadMotionMode()));

  const view = useMemo(() => viewFor(match, HUMAN), [match]);
  const h = view.hand;
  const me = view.seats[HUMAN];
  const busted = me.busted;
  const mode = MODES[match.mode];
  const waiting = waitingOn(match);
  const myTurn = waiting.kind === 'bet' && waiting.seat === HUMAN;
  const myWindow =
    waiting.kind === 'window' && waiting.seats.length === 1 && waiting.seats[0] === HUMAN;
  const myChoice = waiting.kind === 'choice' && waiting.seat === HUMAN;
  const speedMult = CPU_SPEEDS[speedIdx]?.mult ?? 1;
  const mult = busted ? speedMult * SPECTATE_MULT : speedMult;
  const over = match.phase === 'over' || conceded;

  // ---- dispatch -----------------------------------------------------------
  const dispatch = useCallback((action: Action) => {
    try {
      const next = applyAction(matchRef.current, action);
      actionsRef.current.push(action);
      matchRef.current = next;
      setMatch(next);
      setNotice(null);
      return true;
    } catch (e) {
      if (e instanceof IllegalAction) {
        setNotice(e.message);
        return false;
      }
      throw e;
    }
  }, []);

  /** A human action, charged its real think time on the match clock. */
  const humanAct = useCallback(
    (action: Action) => {
      const elapsed = Math.min(HUMAN_ACTION_CAP_MS, Math.max(0, Date.now() - promptAt.current));
      if (dispatch({ ...action, dt: elapsed })) setCastFlow(null);
    },
    [dispatch],
  );

  // ---- the driver: bots, hand starts, auto-pass ----------------------------
  useEffect(() => {
    if (over) return;
    const w = waitingOn(match);
    if (w.kind === 'over') return;
    let delay: number;
    let action: Action | null;
    if (w.kind === 'start') {
      action = { type: 'start', dt: match.handNo === 0 ? 0 : 3000 };
      delay =
        match.handNo === 0 ? 400 : Math.max(speedMult === 0 ? 500 : 900, RESULT_PAUSE_MS * mult);
    } else {
      const seats = w.kind === 'window' ? w.seats : [w.seat];
      const bot = seats.find((s) => s !== HUMAN || busted);
      if (bot === undefined) {
        // The human's input: start the think clock.
        promptAt.current = Date.now();
        setPromptStart(promptAt.current);
        setNow(promptAt.current);
        return;
      }
      action =
        botAction(viewFor(match, bot), bot, botRngRef.current) ??
        (w.kind === 'window' ? { type: 'pass', seat: bot } : { type: 'fold', seat: bot });
      delay = Math.max(speedMult === 0 ? 40 : 120, (action.dt ?? 1000) * mult);
    }
    const t = window.setTimeout(() => dispatch(action!), delay);
    return () => window.clearTimeout(t);
  }, [match, mult, speedMult, busted, over, dispatch]);

  // Tick a clock for the turn timer and the window / choice countdowns.
  useEffect(() => {
    if (!myTurn && !myWindow && !myChoice) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [myTurn, myWindow, myChoice]);

  // Window auto-pass. Paused while the cast dialog is open (answering a cast
  // with a Quick Event takes a target and maybe a second cost — the window
  // must not close under the dialog), and the countdown restarts when it
  // closes.
  const [windowStart, setWindowStart] = useState(0);
  const composing = !!castFlow;
  useEffect(() => {
    if (!myWindow || composing) return;
    const start = Date.now();
    const mark = window.setTimeout(() => {
      setWindowStart(start);
      setNow(Date.now());
    }, 0);
    const t = window.setTimeout(() => humanAct({ type: 'pass', seat: HUMAN }), WINDOW_AUTOPASS_MS);
    return () => {
      window.clearTimeout(mark);
      window.clearTimeout(t);
    };
  }, [myWindow, composing, match, humanAct]);

  // A choice (Windfall, Pineapple, Redraw, Exhume) has no other way to
  // time out, and the table waits on it: past the turn timer, make the pick a
  // bot would (keep the best cards).
  useEffect(() => {
    if (!myChoice) return;
    const t = window.setTimeout(() => {
      const m = matchRef.current;
      const a = botAction(viewFor(m, HUMAN), HUMAN, botRng(m.seed ^ m.handNo));
      humanAct({ type: 'choose', seat: HUMAN, index: a?.type === 'choose' ? a.index : 0 });
    }, CHOICE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [myChoice, match, humanAct]);

  // Soft turn timer with a time bank: past it, check if free, else fold.
  // The overrun is measured from the ref the driver set for THIS decision —
  // `now`/`promptStart` still hold the previous decision's times on the first
  // render of a new turn, which could fold a fresh turn on the spot.
  const turnLeft = myTurn ? TURN_TIMER_MS - Math.max(0, now - promptStart) : TURN_TIMER_MS;
  useEffect(() => {
    if (!myTurn) return;
    const overrun = Date.now() - promptAt.current - TURN_TIMER_MS;
    if (overrun > bankMs) {
      const o = betOptions(match, HUMAN);
      setBankMs(0);
      humanAct(o?.canCheck ? { type: 'check', seat: HUMAN } : { type: 'fold', seat: HUMAN });
    }
  }, [myTurn, now, bankMs, match, humanAct]);
  const prevTurn = useRef(false);
  useEffect(() => {
    // Leaving a turn spends any overrun from the bank.
    if (prevTurn.current && !myTurn) {
      const used = Math.max(0, Date.now() - promptAt.current - TURN_TIMER_MS);
      if (used > 0) setBankMs((b) => Math.max(0, b - used));
    }
    prevTurn.current = myTurn;
  }, [myTurn]);

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
    if (!myTurn || castFlow || showHistory || inspect) return;
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+C is copy and Ctrl+R reload, not call and raise.
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      // Any modal on top (the concede confirm, an inspector) owns the keys.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
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
      if (!opts) return;
      const k = e.key.toLowerCase();
      if (k === 'f') humanAct({ type: 'fold', seat: HUMAN });
      else if (k === 'c')
        humanAct(opts.canCheck ? { type: 'check', seat: HUMAN } : { type: 'call', seat: HUMAN });
      else if (k === 'r' && opts.canRaise) humanAct({ type: 'raise', seat: HUMAN, to: raiseTo });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [myTurn, castFlow, showHistory, inspect, opts, raiseTo, humanAct]);

  // ---- spotlight for new casts ---------------------------------------------
  const [spot, setSpot] = useState<CastRecord | null>(null);
  const seenCasts = useRef<{ hand: number; count: number }>({ hand: 0, count: 0 });
  useEffect(() => {
    const casts = view.hand?.casts ?? [];
    const hand = view.hand?.no ?? 0;
    if (seenCasts.current.hand !== hand) seenCasts.current = { hand, count: 0 };
    if (casts.length > seenCasts.current.count) {
      const latest = casts[casts.length - 1];
      seenCasts.current.count = casts.length;
      if (latest.seat !== HUMAN) setSpot(latest);
    }
  }, [view]);
  useEffect(() => {
    if (!spot) return;
    const t = window.setTimeout(
      () => setSpot(null),
      Math.max(700, SPOTLIGHT_MS * Math.max(0.4, mult)),
    );
    return () => window.clearTimeout(t);
  }, [spot, mult]);

  // ---- match end: history + result -----------------------------------------
  const reported = useRef(false);
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
      onResult?.({ place, seats: m.seats.length, mode: m.mode, hands: m.handNo });
    },
    [onResult, setup, humanDeckCode],
  );
  useEffect(() => {
    if (match.phase === 'over' && match.placements)
      report(match, match.placements.indexOf(HUMAN) + 1);
  }, [match, report]);

  const concede = async () => {
    if (over) {
      onExit();
      return;
    }
    if (!(await askConfirm('Concede? You leave the table and take the lowest place still open.')))
      return;
    const alive = match.seats.filter((s) => !s.busted).length;
    setConceded(true);
    report(match, busted ? standings(match).indexOf(HUMAN) + 1 : alive);
  };

  /** Busted: fast-forward the rest of the match headless. */
  const skipToEnd = () => {
    const m = cloneMatch(matchRef.current);
    const acts = runBots(m, { botSeed: setup.seed ^ 0x51ed27, autoStart: true, humanSeats: [] });
    actionsRef.current.push(...acts);
    matchRef.current = m;
    setMatch(m);
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

  // ---- render -------------------------------------------------------------
  return (
    <div
      className="relative w-full h-full overflow-hidden bg-[#0b1512] text-[var(--c-paper)] flex flex-col"
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
      data-human-decision={myTurn || myWindow || myChoice ? '1' : undefined}
    >
      {/* Top bar */}
      <div
        className="relative z-30 flex flex-wrap items-center gap-x-3 gap-y-1 bg-[var(--c-ink)] px-3 py-1.5 border-b-2 border-black"
        data-coach-avoid
      >
        <button
          onClick={concede}
          className="btn-pop heading-font fs-xs px-3 py-1 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs"
        >
          {over ? '< MENU' : 'CONCEDE'}
        </button>
        <span className="heading-font text-sm text-[var(--c-yellow)]">
          {mode.label.toUpperCase()} · {match.seats.length} SEATS
        </span>
        <span
          className="fs-xs font-bold flex items-center gap-1"
          title="Blinds rise on the match clock"
        >
          <Clock className="w-3.5 h-3.5" /> Blinds ◎{fmtChips(bbNow / 2)}/{fmtChips(bbNow)} · level{' '}
          {match.level + 1} · next in {Math.ceil(levelLeft / 60000)}m · cap in{' '}
          {Math.ceil(capLeft / 60000)}m
        </span>
        <span className="fs-xs font-bold text-[var(--c-paper)]/60">Hand {match.handNo}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <TopToggle
            label={`BOTS ${CPU_SPEEDS[speedIdx].label}`}
            title={`Bot speed — ${CPU_SPEEDS.map((s) => s.label).join(' / ')}`}
            onClick={() => {
              const n = (speedIdx + 1) % CPU_SPEEDS.length;
              setSpeedIdx(n);
              saveCpuSpeed(n);
            }}
          />
          <TopToggle
            label={helper ? 'HELPER ON' : 'HELPER OFF'}
            title="Hand-strength helper"
            active={helper}
            onClick={() => {
              setHelper(!helper);
              saveHandHelper(!helper);
            }}
          />
          <TopToggle
            label="4-COLOUR"
            title="Four-colour deck (♦ blue, ♣ green)"
            active={fourColor}
            onClick={() => {
              setFourColor(!fourColor);
              saveFourColor(!fourColor);
            }}
          />
          <button
            onClick={() => setShowHistory(true)}
            className="btn-pop p-1 ink-border-sm bg-[var(--c-steel)]"
            title="Hand history"
            aria-label="Hand history"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowLog((v) => !v)}
            className={cn(
              'btn-pop p-1 ink-border-sm',
              showLog ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]' : 'bg-[var(--c-steel)]',
            )}
            title="Table log"
            aria-label="Table log"
          >
            <ScrollText className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Location banner + forecast */}
      {location && rule && (
        <div
          data-coach="location"
          className="relative z-20 flex flex-wrap items-center justify-center gap-2 px-3 py-1 bg-black/60 text-center"
        >
          <button
            onClick={() => location.id.startsWith('__') || setInspect(location)}
            className="heading-font text-sm text-[var(--c-yellow)] hover:underline"
            title="Inspect this Location"
          >
            {location.name}
          </button>
          <span className="fs-xs font-bold">
            {LOCATION_TEMPLATES[rule.id].name}: {ruleText(rule)}
          </span>
          {h?.location.owner !== undefined && !narrow && (
            <span className="fs-xs text-[var(--c-paper)]/60">
              — {view.seats[h.location.owner].name}&apos;s Location
            </span>
          )}
          {fc.length > 0 && (
            <span className="fs-xs text-[var(--c-paper)]/70">
              · Next:{' '}
              {fc.map((f, i) => (
                <span
                  key={i}
                  className="font-bold"
                  title={f.card.rule ? ruleText(f.card.rule) : ''}
                >
                  {i > 0 && ', '}
                  {f.card.rule ? LOCATION_TEMPLATES[f.card.rule.id].name : f.card.name}
                </span>
              ))}
            </span>
          )}
        </div>
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
              <div className="bg-black/70 rounded-full px-3 py-0.5 heading-font text-sm text-[var(--c-yellow)] whitespace-nowrap">
                POT <Chips chips={Math.max(0, potTotal(h))} />
                {match.jackpot > 0 && (
                  <span className="fs-xs text-[var(--c-paper)] ml-2">
                    jackpot ◎{fmtChips(match.jackpot)}
                  </span>
                )}
              </div>
            )}
            {h?.done && h.result && <HandResultBanner match={view} fourColor={fourColor} />}
          </div>

          {/* Seats (on a phone your own seat is the panel below the felt) */}
          {view.seats.map((s, i) => {
            if (i === HUMAN) return null;
            return (
              <SeatBadge
                key={i}
                match={view}
                seat={i}
                pos={positions[i]}
                narrow={narrow}
                fourColor={fourColor}
                active={
                  (waiting.kind === 'bet' && waiting.seat === i) ||
                  (waiting.kind === 'window' && waiting.seats.includes(i))
                }
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
                  className="absolute -translate-x-1/2 -translate-y-1/2 bg-[var(--c-yellow)] text-[var(--c-ink)] rounded-full px-2 py-0.5 ink-border-sm text-[11px] font-black shadow-hard-black-xs"
                  style={{ left: `${bx}%`, top: `${by}%` }}
                >
                  ◎{fmtChips(bet)}
                </span>
              );
            })}
        </div>

        {/* Cast spotlight (reuses the full card face) */}
        {spot && <Spotlight cast={spot} match={view} onInspect={(d) => setInspect(d)} />}

        {/* Log drawer */}
        {showLog && <LogPanel match={view} onClose={() => setShowLog(false)} />}
      </div>

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
        bankMs={bankMs}
        windowLeft={
          myWindow
            ? composing
              ? WINDOW_AUTOPASS_MS
              : WINDOW_AUTOPASS_MS - (now - Math.max(windowStart, promptStart))
            : 0
        }
        choiceLeft={myChoice ? CHOICE_TIMEOUT_MS - Math.max(0, now - promptStart) : 0}
        narrow={narrow}
        act={humanAct}
        openCast={(uid) => setCastFlow({ uid })}
        openLeader={(i) => setCastFlow({ leader: i })}
        onInspect={setInspect}
        onSkip={busted && !over ? skipToEnd : undefined}
        notice={notice}
      />

      {castFlow && h && (
        <CastDialog
          view={view}
          flow={castFlow}
          onClose={() => setCastFlow(null)}
          onCast={(a) => humanAct(a)}
          onInspect={setInspect}
        />
      )}
      {showHistory && <HistoryModal match={match} onClose={() => setShowHistory(false)} />}
      {inspect && <Card3DInspector def={inspect} onClose={() => setInspect(null)} />}
      {over && (
        <GameOver
          match={match}
          conceded={conceded}
          onExit={onExit}
          onRematch={onRematch}
          reward={reward}
          rewardError={rewardError}
          rewardPending={rewardPending}
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
          <CoachOverlay stage={coachStage} />
        </div>
      )}
    </div>
  );
}

function TopToggle({
  label,
  title,
  onClick,
  active,
}: {
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'btn-pop heading-font fs-xs px-2 py-1 ink-border-sm',
        active
          ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
          : 'bg-[var(--c-steel)] text-[var(--c-paper)]',
      )}
    >
      {label}
    </button>
  );
}

// ===========================================================================
// Seats
// ===========================================================================
function SeatBadge({
  match,
  seat,
  pos,
  narrow,
  fourColor,
  active,
  onInspect,
}: {
  key?: React.Key;
  match: Match;
  seat: number;
  pos: SeatPos;
  narrow: boolean;
  fourColor: boolean;
  active: boolean;
  onInspect: (d: CardDef) => void;
}) {
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
      )}
      style={seatStyle(pos, narrow)}
      data-seat={seat}
    >
      {h && h.dealtIn[seat] && !s.busted ? (
        <SeatCards cards={h.holes[seat]} scale={1} fourColor={fourColor} dim={folded} />
      ) : (
        // Keep the plate where it sits when the seat has cards.
        <span aria-hidden style={{ height: 60 }} />
      )}
      <div
        className={cn(
          'relative flex items-center bg-black/80 ink-border-sm rounded-md w-full',
          narrow ? 'gap-1 px-1 py-0.5' : 'gap-1.5 px-1.5 py-1',
          // A phone tucks the plate over the foot of the card backs.
          narrow && !shown && '-mt-3',
          active && 'ring-2 ring-[var(--c-yellow)] animate-pulse',
        )}
      >
        <button
          onClick={() => onInspect(s.leader)}
          title={`${s.leader.name} — inspect Leader`}
          className="shrink-0"
        >
          <LeaderArt def={s.leader} size={narrow ? 22 : 30} />
        </button>
        <div className="min-w-0 flex-1 leading-tight">
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
            ◎{fmtChips(bet)}
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
  bankMs,
  windowLeft,
  choiceLeft,
  narrow,
  act,
  openCast,
  openLeader,
  onInspect,
  onSkip,
  notice,
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
  turnLeft: number;
  bankMs: number;
  windowLeft: number;
  choiceLeft: number;
  narrow: boolean;
  act: (a: Action) => void;
  openCast: (uid: string) => void;
  openLeader: (i: number) => void;
  onInspect: (d: CardDef) => void;
  /** Busted and spectating: fast-forward to the result. */
  onSkip?: () => void;
  notice: string | null;
}) {
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
  const potRaise = (frac: number) =>
    opts
      ? Math.max(
          opts.minRaiseTo,
          Math.min(opts.maxRaiseTo, Math.round((h!.currentBet + (pot + owe) * frac) / 2) * 2),
        )
      : 0;
  const choiceLabel: Record<string, string> = {
    windfall: 'Windfall: pick a hole card to DISCARD (keep your best two)',
    pineapple: 'Pineapple: pick a hole card to DISCARD',
    redraw: 'Redraw: pick a hole card to REPLACE',
    exhume: 'Exhume: pick a hole card to swap for a random mucked card',
  };
  const timerSecs = Math.ceil(Math.max(0, turnLeft) / 1000);
  const inBank = turnLeft < 0;

  const leaderRow = (
    <div className="flex flex-wrap items-center gap-1.5" data-coach="leader">
      {(me.leader.abilities ?? []).map((ab, i) => {
        const ok = live && canUseLeader(view, HUMAN, i).ok;
        return (
          <button
            key={i}
            disabled={!ok}
            onClick={() => openLeader(i)}
            title={canUseLeader(view, HUMAN, i).why ?? ab.text}
            className={cn(
              'btn-pop text-[11px] font-black px-2 py-1 ink-border-sm text-left',
              ok
                ? 'bg-orange-500 text-black'
                : 'bg-[var(--c-steel)] text-white/60 cursor-not-allowed',
            )}
          >
            LEADER {ab.text}
          </button>
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
      )}
      data-coach-avoid
    >
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
            <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-xs">
              <span className="heading-font text-[var(--c-yellow)]">{me.name}</span>
              <Chips chips={me.stack} className="text-sm" />
              {h?.button === HUMAN && <StatusPill text={narrow ? 'D' : 'DEALER'} />}
              {me.busted && <StatusPill text="OUT" tone="red" />}
              {holeShown && <StatusPill text="SHOWN" />}
              {narrow && h && h.streetBet[HUMAN] > 0 && (
                <span className="bg-[var(--c-yellow)] text-[var(--c-ink)] rounded-full px-1.5 ink-border-sm fs-xs font-black leading-[14px]">
                  ◎{fmtChips(h.streetBet[HUMAN])}
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
          <div className="fs-xs font-bold text-[var(--c-paper)]/60 truncate">
            POWERS ({me.hand.length}/{MODES[view.mode].handCap})
            {narrow ? '' : ` · deck ${me.drawPile.length} · discard ${me.discard.length}`}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {me.hand.length === 0 && (
              <span className="fs-xs text-[var(--c-paper)]/50">No power cards in hand.</span>
            )}
            {me.hand.map((p) => {
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
        {notice && (
          <div className="fs-xs font-bold text-[var(--c-red)] bg-white/90 px-2 py-0.5 rounded">
            {notice}
          </div>
        )}
        {myChoice && pending?.kind === 'choice' && (
          <div className="heading-font text-xs text-[var(--c-yellow)]">
            {choiceLabel[pending.choice]}{' '}
            <span className="font-sans fs-xs font-bold normal-case text-[var(--c-paper)]/60">
              auto-pick {Math.ceil(Math.max(0, choiceLeft) / 1000)}s
            </span>
          </div>
        )}
        {myWindow && (
          <div className="flex flex-col gap-1 bg-black/60 ink-border-sm p-1.5">
            <div className="text-[11px] font-bold">
              {windowCast
                ? `Respond to ${view.seats[windowCast.seat].name}'s ${windowCast.def.name}?`
                : 'Response window: cast a Quick Event or Ambush card, or pass.'}{' '}
              <span className="text-[var(--c-paper)]/60">
                auto-pass {Math.ceil(Math.max(0, windowLeft) / 1000)}s
              </span>
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
              <span className={cn(inBank ? 'text-[var(--c-red)]' : 'text-[var(--c-paper)]/70')}>
                {inBank
                  ? `TIME BANK ${Math.ceil(Math.max(0, bankMs + turnLeft) / 1000)}s`
                  : `${timerSecs}s`}
              </span>
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
                  label={`CALL ◎${fmtChips(opts.callAmount)}`}
                  hotkey="C"
                  primary
                  onClick={() => act({ type: 'call', seat: HUMAN })}
                />
              )}
              {opts.canRaise && (
                <ActionButton
                  label={`${h!.currentBet === 0 ? 'BET' : 'RAISE TO'} ◎${fmtChips(raiseTo)}${raiseTo >= me.stack + h!.streetBet[HUMAN] ? ' ALL IN' : ''}`}
                  hotkey="R"
                  tone="yellow"
                  onClick={() => act({ type: 'raise', seat: HUMAN, to: raiseTo })}
                />
              )}
            </div>
            {opts.canRaise && opts.maxRaiseTo > opts.minRaiseTo && (
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={opts.minRaiseTo}
                  max={opts.maxRaiseTo}
                  step={2}
                  value={raiseTo}
                  onChange={(e) => setRaiseTo(Number(e.target.value))}
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
                    className="btn-pop fs-xs font-black px-1.5 py-0.5 ink-border-sm bg-[var(--c-steel)]"
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {!myTurn && !myWindow && !myChoice && h && !h.done && (
          <div className="fs-xs font-bold text-[var(--c-paper)]/60 text-center">
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
/** Escape closes a modal. */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

function CastDialog({
  view,
  flow,
  onClose,
  onCast,
  onInspect,
}: {
  view: Match;
  flow: { uid?: string; leader?: number };
  onClose: () => void;
  onCast: (a: Action) => void;
  onInspect: (d: CardDef) => void;
}) {
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
  useEscape(onClose);
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
            <button onClick={onClose} aria-label="Close" className="p-1">
              <X className="w-4 h-4" />
            </button>
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
              : `Costs ◎${fmtChips(cost!.chips)}${cost!.gambitOwed ? ` now (Gambit: owe ◎${fmtChips(cost!.gambitOwed * 2)} if you lose)` : ''}${extraNeeded ? ` + ${extraNeeded} second cost${extraNeeded > 1 ? 's' : ''}` : ''}. The cast is public — everyone sees this card${needsTarget ? ' and its target' : ''}.`}
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
                    {view.seats[t].name} ◎{fmtChips(view.seats[t].stack)}
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
function Spotlight({
  cast,
  match,
  onInspect,
}: {
  cast: CastRecord;
  match: Match;
  onInspect: (d: CardDef) => void;
}) {
  const caster = match.seats[cast.seat];
  const def = cast.leader ? caster.leader : cast.def;
  const target =
    cast.target !== null ? match.seats[cast.target]?.name : cast.veiled ? 'a hidden seat' : null;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div className="flex flex-col items-center gap-2 bg-black/75 ink-border-md shadow-hard-black px-5 py-3 pointer-events-auto animate-[fadeIn_.2s_ease-out]">
        <div className="heading-font text-sm text-[var(--c-yellow)] text-center">
          {caster.name} {cast.leader ? 'uses their Leader' : 'casts'}
          {target ? ` → ${target}` : ''}
        </div>
        <div onMouseEnter={() => onInspect(def)} title="Hover to inspect">
          <CardFace def={def} size="standard" />
        </div>
        <div className="fs-xs font-bold">{keywordLabel(cast.effect.kw, cast.effect.n)}</div>
      </div>
    </div>
  );
}

function HandResultBanner({ match, fourColor }: { match: Match; fourColor: boolean }) {
  const h = match.hand!;
  const r = h.result!;
  return (
    <div className="bg-black/80 ink-border-sm rounded px-3 py-1.5 text-center max-w-[420px]">
      {r.pots.map((p, i) => (
        <div key={i} className="text-xs font-bold">
          {p.winners.map((w) => match.seats[w].name).join(' & ')} win
          {p.winners.length === 1 && p.winners[0] !== HUMAN ? 's' : ''} ◎{fmtChips(p.amount)}
          {p.board ? ` (board ${p.board})` : ''}
          {!r.uncontested && p.winners[0] !== undefined && r.shown[p.winners[0]]
            ? ` — ${r.shown[p.winners[0]]}`
            : ''}
        </div>
      ))}
      {!r.uncontested && (
        <div className="flex flex-wrap justify-center gap-2 mt-1">
          {Object.keys(r.shown).map((k) => {
            const i = Number(k);
            return (
              <span key={i} className="flex items-center gap-1 fs-xs font-bold">
                {match.seats[i].name}
                <SeatCards cards={h.holes[i]} scale={1} fourColor={fourColor} />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LogPanel({ match, onClose }: { match: Match; onClose: () => void }) {
  const entries = match.log.slice(-120);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [entries.length]);
  return (
    <aside className="absolute right-0 top-0 bottom-0 z-40 w-[300px] max-w-[85vw] bg-[var(--c-ink)]/95 border-l-2 border-black flex flex-col">
      <div className="flex items-center justify-between px-2 py-1 border-b border-white/10">
        <span className="heading-font text-xs text-[var(--c-yellow)]">TABLE LOG</span>
        <button onClick={onClose} aria-label="Close log">
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
  useEscape(onClose);
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
        <p className="fs-xs font-bold text-[var(--c-steel)] mb-2">
          Match seed {match.seed}. The seed plus the action log replays this match exactly — every
          shuffle can be verified.
        </p>
        <ol className="flex-1 overflow-y-auto flex flex-col gap-1 text-xs">
          {[...match.history].reverse().map((r) => (
            <li key={r.no} className="ink-border-sm px-2 py-1">
              <span className="font-black">#{r.no}</span> · {r.location} · {r.board || 'no board'} —{' '}
              {r.summary}
            </li>
          ))}
          {match.history.length === 0 && <li>No hands finished yet.</li>}
        </ol>
      </div>
    </div>
  );
}

function GameOver({
  match,
  conceded,
  onExit,
  onRematch,
  reward,
  rewardError,
  rewardPending,
}: {
  match: Match;
  conceded: boolean;
  onExit: () => void;
  onRematch: () => void;
  reward?: MatchResult | null;
  rewardError?: string | null;
  rewardPending?: boolean;
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
  return (
    <div className="absolute inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-black max-w-md w-full p-5 flex flex-col gap-3">
        <h2 className="heading-font text-2xl text-center">
          {conceded
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
                  idx === HUMAN && 'bg-[var(--c-yellow)]',
                )}
              >
                <span className="heading-font w-8">{ordinal(k + 1)}</span>
                <LeaderArt def={s.leader} size={22} />
                <span className="text-sm font-bold flex-1 truncate">{s.name}</span>
                <span className="text-xs font-mono">
                  {s.busted ? 'out' : `◎${fmtChips(s.stack)}`}
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
        ) : rewardError ? (
          <div className="text-center text-xs font-bold text-[var(--c-red)]">{rewardError}</div>
        ) : rewardPending ? (
          <div className="text-center text-xs font-bold animate-pulse">Saving your reward…</div>
        ) : (
          <div className="text-center fs-xs font-bold text-[var(--c-steel)]">
            {ordinal(place)} place pays {preview.credits} credits with an account. Rewards follow
            placement only — never chips.
          </div>
        )}
        <div className="flex gap-2 justify-center">
          <button
            onClick={onRematch}
            className="btn-pop heading-font text-sm px-4 py-2 bg-[var(--c-yellow)] ink-border-sm shadow-hard-black-xs"
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
