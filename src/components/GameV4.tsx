/**
 * Riftbound v5.0 match UI (Rulebook v5.0, docs/RULEBOOK.md).
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
  rebondCharm,
  declareAttackers,
  declareGuards,
  resolveClash,
  canInvokeLeader,
  canPayCost,
  canTarget,
  effectiveCost,
  locationYield,
  mulliganHand,
  legalAttackers,
  legalGuardsFor,
  wellspringChoices,
  effMight,
  effGrit,
  remainingGrit,
  unitHasKw,
  essenceTotal,
  findUnit,
} from '../game/v3/engine';
import { playTurn, chooseGuards, maybeMulliganPlayer, reactionPlays } from '../game/v3/ai';
import { CardDef, Effect, EssenceCost, MAX_HAND, totalCost, hasKw } from '../game/v3/cards';
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

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const HUMAN: PlayerId = 'P1';
const CPU: PlayerId = 'P2';

/** Component-scoped keyframes for the match-only combat feedback (damage
 * floats, phase banners, attack flashes) — an inline <style> block rather
 * than src/index.css, which another surface owns. */
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
  animation: gv4-dmg-float 1.15s ease-out forwards;
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
  animation: gv4-dmg-float 1.15s ease-out forwards;
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
.gv4-phase-banner { animation: gv4-phase-pop 1.15s ease-out forwards; }
@keyframes gv4-attack-flash {
  0%, 100% { filter: none; }
  30% { filter: brightness(1.7) saturate(1.5); }
  60% { filter: brightness(0.75); }
}
.gv4-attack-flash { animation: gv4-attack-flash 0.65s ease-in-out; }
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

/** Essence a player could have right now: floating pool + every untapped
 * Location counted by its produced type (Bountiful Sanctums count double). */
function potentialPool(p: PlayerState): Partial<Record<EssenceType, number>> {
  const pool: Partial<Record<EssenceType, number>> = { ...p.essence };
  for (const l of p.locations) {
    if (!l.exhausted) pool[l.produces] = (pool[l.produces] ?? 0) + locationYield(l);
  }
  return pool;
}

/** Could this cost be paid if we tapped Locations for it? */
function canAfford(p: PlayerState, cost?: EssenceCost): boolean {
  return canPayCost(potentialPool(p), cost);
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
  const start = () => {
    fired.current = false;
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
    } else if (wasTap) {
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
    onTouchEnd: (e: React.TouchEvent) => clear(e, true),
    onTouchCancel: (e: React.TouchEvent) => clear(e, false),
  };
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
  const [open, setOpen] = useState(false);
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
      {open && (
        <span
          className="absolute z-[9995] top-full right-0 mt-1 w-40 text-[10px] leading-tight normal-case font-normal bg-black text-white ink-border-sm px-1.5 py-1 pointer-events-none"
          onTouchStart={(e) => e.stopPropagation()}
        >
          {text}
        </span>
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
      style={{ top: pos.top, left: pos.left, transform: `scale(${HOVER_PREVIEW_SCALE})`, transformOrigin: 'top left' }}
    >
      {children}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Essence pips — the floating pool, rendered as colored circles.
// ---------------------------------------------------------------------------
function EssencePips({ pool, size = 16 }: { pool: Partial<Record<EssenceType, number>>; size?: number }) {
  const pips: { key: string; c: EssenceType }[] = [];
  for (const c of COLORS) {
    const n = pool[c] ?? 0;
    for (let i = 0; i < n; i++) pips.push({ key: `${c}${i}`, c });
  }
  if (pips.length === 0) {
    return <span className="text-[8px] font-bold text-[var(--c-paper)]/40">no essence floating</span>;
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
  return (
    <button
      onClick={action}
      disabled={!action}
      title={
        loc.exhausted
          ? `${label} — exhausted (recovers at Dawn)`
          : tappable
            ? `${label} — exhaust: add one ${loc.produces} essence`
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
        'relative shrink-0',
        flash && 'gv4-attack-flash',
        highlight && 'ring-4 ring-[var(--c-red)] -translate-y-1 rounded-[4px]',
        isAttacker && 'ring-4 ring-[var(--c-yellow)] -translate-y-1 rounded-[4px]',
        isGuard && 'ring-4 ring-[#29B6F6] -translate-y-1 rounded-[4px]',
        acting && 'gv4-cpu-actor -translate-y-1',
        acted && 'gv4-cpu-target',
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
        {u.charms.length > 0 && (
          <Tip
            text={`Bonded Charms: ${u.charms.map((c) => c.def.name).join(', ')}`}
            className="text-[10px] bg-[#8E44AD] text-white ink-border-sm px-0.5"
          >
            💠{u.charms.length}
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
// Leader zone panel — Vitality plate + the Leader card with Resolve badge,
// invoke button and Resolve-ability pills (human side only).
// ---------------------------------------------------------------------------
function LeaderZonePanel({
  p,
  isHuman,
  vitTargetable,
  onVitClick,
  onInvoke,
  invokeWhy,
  onAbility,
  abilityWhy,
  onInspect,
  floats,
  flash,
}: {
  key?: React.Key;
  p: PlayerState;
  isHuman: boolean;
  /** The player's Vitality is a legal target for the pending effect. */
  vitTargetable?: boolean;
  onVitClick?: () => void;
  onInvoke?: () => void;
  /** Reason the INVOKE LEADER button is disabled (undefined = usable). */
  invokeWhy?: string;
  onAbility?: (idx: number) => void;
  abilityWhy?: (idx: number) => string | undefined;
  onInspect?: () => void;
  floats?: DmgFloat[];
  flash?: boolean;
}) {
  const L = p.leader;
  const badge = L.shattered
    ? 'SHATTERED'
    : L.invoked
      ? `RESOLVE ${L.resolve}`
      : `IN LEADER ZONE`;
  return (
    <div className={cn('shrink-0 relative w-[140px] flex flex-col gap-0.5', flash && 'gv4-attack-flash')}>
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
          'relative flex items-center justify-between px-2 py-1 ink-border-sm heading-font',
          isHuman ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]' : 'bg-[var(--c-red)] text-white',
          vitTargetable && 'ring-4 ring-[var(--c-red)] cursor-pointer',
        )}
      >
        <span className="text-[9px]">VITALITY</span>
        <span className="text-xl leading-none">{Math.max(0, p.vitality)}</span>
        <FloatLayer floats={floats} />
      </div>
      <div className={cn('relative', L.shattered && 'grayscale opacity-60')}>
        <CardFace
          def={L.def}
          size="standard"
          badge={badge}
          introduceKeywords
          onClick={onInspect}
        />
      </div>
      {isHuman && !L.invoked && !L.shattered && (
        <button
          onClick={onInvoke}
          disabled={!!invokeWhy}
          title={invokeWhy}
          className={cn(
            'heading-font text-[9px] px-2 py-1 ink-border-sm',
            invokeWhy
              ? 'bg-[var(--c-steel)]/60 text-[var(--c-paper)]/60 cursor-not-allowed'
              : 'btn-pop bg-[var(--c-red)] text-white',
          )}
        >
          ⚜ INVOKE LEADER
        </button>
      )}
      {L.invoked &&
        !L.shattered &&
        (L.def.leaderAbilities ?? []).map((ab, i) => (
          <AbilityPill
            key={i}
            label={`${ab.resolveDelta > 0 ? '+' : ''}${ab.resolveDelta}:`}
            desc={ab.text ?? describeEffect(ab.effect)}
            usable={isHuman && !abilityWhy?.(i)}
            used={L.abilityUsedThisTurn}
            why={
              isHuman ? abilityWhy?.(i) : 'Opponent Leader ability — shown for information'
            }
            onClick={isHuman && onAbility ? () => onAbility(i) : undefined}
          />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
type Stage = 'mulligan' | 'play' | 'cpu' | 'cpuGuard' | 'over';

const PHASE_LABEL: Record<GameState['phase'], string> = {
  Dawn: 'DAWN',
  Main1: 'MAIN I',
  Clash: 'CLASH',
  Main2: 'MAIN II',
  Dusk: 'DUSK',
};
const PHASE_ORDER: GameState['phase'][] = ['Dawn', 'Main1', 'Clash', 'Main2', 'Dusk'];

/** Pacing for the narrated replay of the CPU's turn. */
const CPU_PACE = {
  THINK_MS: 900,
  BEAT_MS: 1000,
} as const;

/** A targeting/bonding choice in progress — resolved by clicking a
 * highlighted card (or Vitality plate). */
type Pending =
  | { kind: 'invoke'; cardIid: string; effect: Effect; bondTargetIid?: string }
  | { kind: 'bond'; cardIid: string }
  | { kind: 'leaderAbility'; idx: number; effect: Effect }
  | { kind: 'rebond'; charmIid: string };

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
  rewardPending,
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
   * screen once the parent has recorded the result. */
  reward?: MatchResult | null;
  /** Set once the parent gives up retrying a failed recordMatchResult(). */
  rewardError?: string | null;
  /** True while the parent's recordMatchResult() call is still in flight. */
  rewardPending?: boolean;
}) {
  // The engine GameState is mutated in place by engine actions; it lives in
  // state via a lazy initializer (stable identity for the whole match) and a
  // version counter forces re-renders after each mutation.
  const [g] = useState<GameState>(() => {
    const game = createGame(humanDeck, cpuDeck, POOL_BY_ID, {
      rng: mulberry32(Date.now() % 2147483647),
    });
    // Give the CPU the same opening-hand judgment the playtest harness gives
    // it — the human's own mulligan stays a manual UI decision below.
    maybeMulliganPlayer(game, CPU, game.rng);
    return game;
  });

  const me = g.players[HUMAN];
  const foe = g.players[CPU];

  const [, setVersion] = useState(0);
  const bump = () => {
    recordDamageFloats();
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
  // CPU-turn narration: one log line at a time.
  const [cpuBeat, setCpuBeat] = useState<{ text: string; idx: number; total: number } | null>(null);
  const [showAsh, setShowAsh] = useState<false | 'me' | 'foe'>(false);
  /** Dusk shed picker: null = closed; array = card iids chosen to shed. */
  const [shedPick, setShedPick] = useState<string[] | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    text: string;
    onConfirm: () => void;
  } | null>(null);
  const [inspect, setInspect] = useState<CardDef | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [logExpanded, setLogExpanded] = useState(false);
  // Hand preview: the hand card currently enlarged above the bottom dock.
  const [preview, setPreview] = useState<string | null>(null);
  const [previewPinned, setPreviewPinned] = useState(false);
  // Combat feedback: floating damage numbers + attack flashes + phase banner.
  const [floats, setFloats] = useState<DmgFloat[]>([]);
  const [phaseFx, setPhaseFx] = useState<string | null>(null);
  const [flashIids, setFlashIids] = useState<Set<string>>(new Set());
  const damageMemoRef = useRef<Map<string, number>>(new Map());
  const floatIdRef = useRef(0);
  const resultSent = useRef(false);
  const cpuTimeoutRef = useRef<number | null>(null);
  const bannerTimeoutRef = useRef<number | null>(null);
  const phaseTimeoutRef = useRef<number | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const floatTimeoutsRef = useRef<Set<number>>(new Set());
  const cpuBeatsRef = useRef<string[]>([]);
  const cpuBeatIdxRef = useRef(0);
  const cpuDoneRef = useRef<(() => void) | null>(null);

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
    const timeoutId = window.setTimeout(() => {
      floatTimeoutsRef.current.delete(timeoutId);
      setFloats((f) => f.filter((x) => !ids.has(x.id)));
    }, 1250);
    floatTimeoutsRef.current.add(timeoutId);
  }

  /** Diff every unit's marked damage and both players' Vitality against the
   * last bump, floating "-N"/"+N" over whatever changed. */
  function recordDamageFloats() {
    const seen = new Map<string, number>();
    const fresh: DmgFloat[] = [];
    for (const pid of ['P1', 'P2'] as PlayerId[]) {
      const p = g.players[pid];
      for (const u of p.field) {
        seen.set(u.iid, u.damage);
        const prev = damageMemoRef.current.get(u.iid);
        if (prev !== undefined && u.damage > prev) {
          fresh.push({ id: ++floatIdRef.current, iid: u.iid, amount: u.damage - prev, kind: 'dmg' });
        } else if (prev !== undefined && u.damage < prev) {
          fresh.push({ id: ++floatIdRef.current, iid: u.iid, amount: prev - u.damage, kind: 'heal' });
        }
      }
      const vitKey = `vit:${pid}`;
      seen.set(vitKey, p.vitality);
      const prevVit = damageMemoRef.current.get(vitKey);
      if (prevVit !== undefined && p.vitality < prevVit) {
        fresh.push({ id: ++floatIdRef.current, iid: vitKey, amount: prevVit - p.vitality, kind: 'dmg' });
      } else if (prevVit !== undefined && p.vitality > prevVit) {
        fresh.push({ id: ++floatIdRef.current, iid: vitKey, amount: p.vitality - prevVit, kind: 'heal' });
      }
    }
    damageMemoRef.current = seen;
    spawnFloats(fresh);
  }
  const floatsFor = (iid: string) => floats.filter((f) => f.iid === iid);

  /** Big center-screen phase banner (MAIN I / CLASH / …). */
  const flashPhase = (label: string) => {
    setPhaseFx(label);
    if (phaseTimeoutRef.current !== null) window.clearTimeout(phaseTimeoutRef.current);
    phaseTimeoutRef.current = window.setTimeout(() => {
      setPhaseFx(null);
      phaseTimeoutRef.current = null;
    }, 1150);
  };

  /** Brief brightness flash on a set of clash participants. */
  const flashUnits = (iids: string[]) => {
    setFlashIids(new Set(iids));
    if (flashTimeoutRef.current !== null) window.clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = window.setTimeout(() => {
      setFlashIids(new Set());
      flashTimeoutRef.current = null;
    }, 680);
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
    // createGame already ran the human's first Dawn — the match opens in
    // P1's Main I.
    damageMemoRef.current = new Map();
    recordDamageFloats(); // seed the memo without floats (first pass)
    setFloats([]);
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
      else if (atkSel.size > 0) setAtkSel(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmDialog, inspect, preview, pending, showAsh, atkSel]);

  // ---- essence & invoking -------------------------------------------------
  const inMyMain =
    stage === 'play' &&
    g.active === HUMAN &&
    (g.phase === 'Main1' || g.phase === 'Main2') &&
    !g.clash;
  /** The human's reaction window: guarding step resolved, damage not yet. */
  const inMyReaction = g.clash?.step === 'reaction' && g.active === CPU;
  const canTapNow = inMyMain || inMyReaction;

  /** Why can't this hand card be invoked right now? (undefined = it can) */
  const invokeWhy = (c: { def: CardDef }): string | undefined => {
    const def = c.def;
    const quick = def.type === 'Event' && def.subtype === 'Quick';
    const ambush = def.type === 'Unit' && hasKw(def, 'Ambush');
    if (!inMyMain) {
      if (inMyReaction) {
        if (!quick && !ambush) return 'Only Quick Events / Ambush units in a reaction window';
      } else {
        return 'Invoke during your own main phases';
      }
    }
    if (!canAfford(me, effectiveCost(g, HUMAN, def))) {
      // Say WHICH pip is short when the problem is color, not quantity.
      const pool = potentialPool(me);
      const missing = (Object.entries(def.cost?.pips ?? {}) as [EssenceType, number][])
        .filter(([t, n]) => (pool[t] ?? 0) < (n ?? 0))
        .map(([t]) => t);
      return missing.length > 0
        ? `Needs ${missing.join(' + ')} essence your Locations can't produce yet`
        : 'Not enough essence (even tapping every Location)';
    }
    if (def.type === 'Charm' && me.field.length === 0) return 'Needs a friendly unit to bond to';
    return undefined;
  };

  /** Actually invoke a hand card (auto-taps Locations for its cost). */
  const doInvoke = (cardIid: string, opts: { targetIid?: string; bondTargetIid?: string }) => {
    const card = me.hand.find((c) => c.iid === cardIid);
    if (!card) return;
    autoTapFor(g, HUMAN, effectiveCost(g, HUMAN, card.def));
    if (invokeCard(g, HUMAN, cardIid, opts)) {
      bump();
      say(`${card.def.name} invoked.`);
    } else {
      bump(); // taps may have happened
      say("Can't invoke that right now.");
    }
    checkWinner();
  };

  /** Click a hand card's INVOKE button: route through bond/target picking. */
  const tryInvoke = (cardIid: string) => {
    const card = me.hand.find((c) => c.iid === cardIid);
    if (!card) return;
    const why = invokeWhy(card);
    if (why) {
      say(why);
      return;
    }
    closePreview();
    if (card.def.type === 'Charm') {
      setPending({ kind: 'bond', cardIid });
      say('Pick a friendly unit to bond the Charm to.');
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
      // cost and card are still spent). Units/Charms keep their body/bond
      // value, so they stay playable and just lose the rider.
      if (card.def.type === 'Event') {
        say('No legal target for its effect — invoking now would waste the card.');
        return;
      }
    }
    doInvoke(cardIid, {});
  };

  const tryWellspring = (type: EssenceType) => {
    if (playWellspring(g, HUMAN, type)) {
      bump();
      say(`${type} Wellspring enters your Location row.`);
    } else say('One Wellspring per turn, in your own main phase.');
  };

  const tryTapLocation = (loc: LocationInst) => {
    if (tapLocationForEssence(g, HUMAN, loc.iid)) bump();
    else say('Essence comes in your main phases (or your reaction window).');
  };

  const leaderInvokeWhy = ((): string | undefined => {
    const L = me.leader;
    if (L.invoked || L.shattered) return undefined;
    if (!inMyMain) return 'Invoke your Leader during your own main phases';
    if (!canAfford(me, L.def.cost)) return 'Not enough essence (even tapping every Location)';
    return undefined;
  })();

  const tryInvokeLeader = () => {
    if (leaderInvokeWhy) {
      say(leaderInvokeWhy);
      return;
    }
    autoTapFor(g, HUMAN, me.leader.def.cost);
    if (canInvokeLeader(g, HUMAN) && invokeLeader(g, HUMAN)) {
      bump();
      say(`${me.leader.def.name} takes the field.`);
    } else say("Can't invoke your Leader right now.");
  };

  const leaderAbilityWhy = (idx: number): string | undefined => {
    const L = me.leader;
    if (!L.invoked || L.shattered) return 'Leader not on the field';
    if (!inMyMain) return 'Leader abilities resolve during your main phases';
    if (L.abilityUsedThisTurn) return 'One Leader ability per turn — already used';
    const ab = L.def.leaderAbilities?.[idx];
    if (!ab) return 'No such ability';
    if (ab.resolveDelta < 0 && L.resolve + ab.resolveDelta < 0)
      return `Needs ${-ab.resolveDelta} Resolve (has ${L.resolve})`;
    return undefined;
  };

  const tryLeaderAbility = (idx: number) => {
    const why = leaderAbilityWhy(idx);
    if (why) {
      say(why);
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
    } else say('Illegal.');
    checkWinner();
  };

  const tryRebond = (charmIid: string) => {
    if (!inMyMain) {
      say('Re-bond during your own main phases.');
      return;
    }
    const charm = me.wornCharms.find((c) => c.iid === charmIid);
    if (!charm) return;
    if (me.field.length === 0) {
      say('No friendly unit to re-bond to.');
      return;
    }
    const cost: EssenceCost = { generic: charm.def.rebondCost ?? 0, pips: {} };
    if (!canAfford(me, cost)) {
      say(`Re-bond costs ${cost.generic} essence.`);
      return;
    }
    setPending({ kind: 'rebond', charmIid });
    say('Pick a friendly unit to re-bond the Charm to.');
  };

  // ---- pending-target resolution ------------------------------------------
  const isPendingTarget = (iid: string): boolean => {
    if (!pending) return false;
    if (pending.kind === 'bond' || pending.kind === 'rebond') {
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
        // v5.1: a Charm whose on-invoke effect needs a target now chains to
        // a second pick instead of silently auto-targeting.
        const card = me.hand.find((c) => c.iid === p.cardIid);
        const eff = card?.def.onInvoke;
        if (card && eff && needsTarget(eff) && targetsFor(g, HUMAN, eff).length > 0) {
          setPending({ kind: 'invoke', cardIid: p.cardIid, effect: eff, bondTargetIid: targetIid });
          say('Bond set — now pick a target for its effect.');
          return;
        }
        doInvoke(p.cardIid, { bondTargetIid: targetIid });
        return;
      }
      case 'leaderAbility':
        if (activateLeaderAbility(g, HUMAN, p.idx, targetIid)) {
          bump();
          say('Leader ability resolves.');
        } else say('Illegal target.');
        checkWinner();
        return;
      case 'rebond': {
        const charm = me.wornCharms.find((c) => c.iid === p.charmIid);
        autoTapFor(g, HUMAN, { generic: charm?.def.rebondCost ?? 0, pips: {} });
        if (rebondCharm(g, HUMAN, p.charmIid, targetIid)) {
          bump();
          say('Charm re-bonded.');
        } else say('Illegal re-bond.');
        return;
      }
    }
  };

  // ---- phase driving ------------------------------------------------------
  const myAttackers = stage === 'play' ? legalAttackers(g, HUMAN) : [];

  const finishTurn = () => {
    // Ends the turn: Dusk (sheds from the END of the hand) → pass → CPU's
    // Dawn → its Main I.
    endPhase(g);
    bump();
    if (checkWinner()) return;
    runCpuTurn();
  };

  const advanceMyPhase = () => {
    setPending(null);
    setAtkSel(new Set());
    closePreview();
    if (g.phase === 'Main2') {
      // v5.1: over the hand limit — let the player CHOOSE what to shed
      // (the engine sheds from the end of the hand, so the picker just
      // reorders the chosen cards to the back before ending the turn).
      if (me.hand.length > MAX_HAND) {
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
  const toggleAttacker = (iid: string) => {
    setAtkSel((s) => {
      const n = new Set(s);
      if (n.has(iid)) n.delete(iid);
      else n.add(iid);
      return n;
    });
  };

  const declareMyAttack = () => {
    if (atkSel.size === 0) return;
    if (!declareAttackers(g, [...atkSel])) {
      say('Illegal attack selection.');
      return;
    }
    setAtkSel(new Set());
    // The CPU assigns its guards immediately (same heuristic the harness
    // uses); the clash bar then shows the lines before damage resolves.
    const guards = chooseGuards(g, CPU);
    if (!declareGuards(g, guards)) declareGuards(g, {});
    // The defending CPU gets its clash reaction window (Quick Events /
    // Ambush units) before damage — same as the sim harness gives it.
    const reactions: string[] = [];
    reactionPlays(g, CPU, (ev) => {
      if (ev.kind === 'invoke') reactions.push(ev.name);
    });
    bump();
    const guarded = (g.clash ? Object.values(g.clash.guards) : []).filter(
      (v: string[]) => v.length > 0,
    ).length;
    const guardMsg =
      guarded > 0 ? `${cpuLabel} assigns ${guarded} guard line(s).` : `${cpuLabel} lets it through!`;
    say(reactions.length > 0 ? `${guardMsg} Reaction: ${reactions.join(', ')}!` : guardMsg);
    checkWinner();
  };

  const resolveMyClash = () => {
    if (!g.clash) return;
    const participants = [
      ...g.clash.attackers,
      ...Object.values(g.clash.guards).flat(),
    ];
    if (resolveClash(g)) {
      flashUnits(participants);
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

  const tickCpuBeat = () => {
    cpuTimeoutRef.current = null;
    const beats = cpuBeatsRef.current;
    const i = cpuBeatIdxRef.current;
    if (i >= beats.length) {
      const done = cpuDoneRef.current;
      cpuDoneRef.current = null;
      setCpuBeat(null);
      done?.();
      return;
    }
    cpuBeatIdxRef.current = i + 1;
    setCpuBeat({ text: beats[i], idx: i, total: beats.length });
    cpuTimeoutRef.current = window.setTimeout(tickCpuBeat, CPU_PACE.BEAT_MS);
  };

  /** Replay `lines` as staggered narration beats, then call `onDone`. */
  const narrate = (lines: string[], onDone: () => void) => {
    cpuBeatsRef.current = lines;
    cpuBeatIdxRef.current = 0;
    cpuDoneRef.current = onDone;
    if (lines.length === 0) {
      onDone();
      return;
    }
    tickCpuBeat();
  };

  const skipCpuBeats = () => {
    stopCpuTimer();
    cpuBeatIdxRef.current = cpuBeatsRef.current.length;
    tickCpuBeat();
  };

  const beginHumanTurn = () => {
    setCpuBeat(null);
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

  /** Play the CPU's turn. If it declares an attack, playTurn is paused at the
   * guard step (via the CLASH_PAUSE sentinel) and the human takes over guard
   * assignment; otherwise the whole turn runs through and it's back to P1. */
  const resolveCpuTurn = () => {
    cpuTimeoutRef.current = null;
    const logStart = g.log.length;
    let paused = false;
    try {
      playTurn(g, CPU, {
        chooseGuardsFor: () => {
          throw CLASH_PAUSE;
        },
      });
    } catch (e) {
      if (e !== CLASH_PAUSE) throw e;
      paused = true;
    }
    bump();
    narrate(g.log.slice(logStart), () => {
      if (checkWinner()) return;
      if (paused && g.clash && g.clash.step === 'guards') {
        setGuardSel({});
        setGuardFocus(g.clash.attackers[0] ?? null);
        setStage('cpuGuard');
        say(`${cpuLabel} attacks — assign your guards!`);
      } else {
        beginHumanTurn();
      }
    });
  };

  const runCpuTurn = () => {
    setStage('cpu');
    setCpuBeat(null);
    cpuTimeoutRef.current = window.setTimeout(resolveCpuTurn, CPU_PACE.THINK_MS);
  };

  /** After the human's guard step + reaction window resolve the clash, the
   * CPU finishes its turn (Main II, Dusk) and play passes back. */
  const continueCpuAfterClash = () => {
    const logStart = g.log.length;
    endPhase(g); // Clash → Main II (clash must be 'done')
    playTurn(g, CPU); // Main II plays, then Dusk → the human's Dawn
    bump();
    setStage('cpu');
    narrate(g.log.slice(logStart), () => {
      if (checkWinner()) return;
      beginHumanTurn();
    });
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
          say("That unit can't guard this attacker (exhausted, or Aerial rules).");
          return sel;
        }
        next[guardFocus] = [...(next[guardFocus] ?? []), unitIid];
      }
      for (const a of Object.keys(next)) if (next[a].length === 0) delete next[a];
      return next;
    });
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

  const confirmGuards = () => {
    if (guardProblem) {
      say(guardProblem);
      return;
    }
    if (declareGuards(g, guardSel)) {
      bump();
      say('Guards set — reaction window: Quick Events & Ambush units are live.');
    } else {
      say('Illegal guard assignment.');
    }
  };

  const resolveCpuClash = () => {
    if (!g.clash) return;
    const participants = [...g.clash.attackers, ...Object.values(g.clash.guards).flat()];
    if (resolveClash(g)) {
      flashUnits(participants);
      bump();
    }
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
      guards: gs as string[],
    };
  });

  // Coach stage: coarse key for the first-match walkthrough.
  const coachStage =
    stage === 'cpu'
      ? 'cpu'
      : stage === 'cpuGuard'
        ? 'guard'
        : stage === 'play'
          ? g.phase === 'Clash'
            ? 'clash'
            : g.phase === 'Main2'
              ? 'main2'
              : 'main1'
          : stage;

  // Contextual hint bar.
  const hint = (() => {
    if (pending) {
      if (pending.kind === 'bond' || pending.kind === 'rebond')
        return 'Pick a highlighted friendly unit for the Charm (✕ or Esc to cancel).';
      return 'Pick a highlighted target for the effect (✕ or Esc to cancel).';
    }
    if (stage === 'cpuGuard') {
      if (guardStep)
        return 'Select an attacker line, then click your units to guard it (multiple guards OK). Unguarded attackers hit your Vitality.';
      return 'Reaction window — invoke Quick Events or Ambush units (essence auto-taps), then RESOLVE CLASH.';
    }
    if (stage === 'cpu') return `${cpuLabel} is playing its turn — SKIP ▸▸ to fast-forward.`;
    if (stage === 'play') {
      if (g.clash) return 'Guards are set — RESOLVE CLASH to deal damage.';
      switch (g.phase) {
        case 'Main1':
        case 'Main2':
          return `Play a Wellspring (once per turn), tap Locations for essence — or just INVOKE: the cost auto-taps. ${
            g.phase === 'Main1' ? 'NEXT moves to the Clash.' : 'NEXT ends your turn.'
          }`;
        case 'Clash':
          return myAttackers.length === 0
            ? 'No ready attackers — NEXT to skip to Main II.'
            : 'Click your ready units to add them to the attack, then DECLARE ATTACK (or NEXT to skip).';
        default:
          return null;
      }
    }
    return null;
  })();

  const previewCard = preview ? (me.hand.find((c) => c.iid === preview) ?? null) : null;
  const previewWhy = previewCard ? invokeWhy(previewCard) : undefined;

  const phaseButtonLabel =
    g.phase === 'Main1'
      ? 'TO CLASH ▸'
      : g.phase === 'Clash'
        ? 'SKIP TO MAIN II ▸'
        : g.phase === 'Main2'
          ? me.hand.length > MAX_HAND
            ? `END TURN (shed ${me.hand.length - MAX_HAND}) ▸`
            : 'END TURN ▸'
          : 'NEXT ▸';

  const showPhaseButton =
    stage === 'play' && (!g.clash || g.clash.step === 'done') && g.phase !== 'Dawn' && g.phase !== 'Dusk';

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
          className="btn-pop heading-font text-[10px] bg-[var(--c-ink)] text-[var(--c-paper)] px-2 py-0.5 ink-border-sm"
          aria-label="Concede match"
        >
          ✕ CONCEDE
        </button>
        <span className="heading-font text-[11px] text-[var(--c-yellow)] shrink-0">
          TURN {g.turn} · {g.active === HUMAN ? 'YOU' : 'CPU'}
        </span>
        {/* Phase tracker: Dawn → Main I → Clash → Main II → Dusk */}
        <div className="flex items-center gap-0.5">
          {PHASE_ORDER.map((ph) => (
            <span
              key={ph}
              className={cn(
                'heading-font text-[8px] px-1.5 py-0.5 ink-border-sm',
                g.phase === ph
                  ? g.active === HUMAN
                    ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                    : 'bg-[var(--c-red)] text-white'
                  : 'bg-[var(--c-steel)]/50 text-[var(--c-paper)]/50',
              )}
            >
              {PHASE_LABEL[ph]}
            </span>
          ))}
        </div>
        <span className="text-[9px] font-mono text-[var(--c-paper)]/70 truncate hidden sm:inline">
          {humanLabel} vs {cpuLabel}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {stage === 'play' && g.phase === 'Clash' && !g.clash && atkSel.size > 0 && (
            <button
              onClick={declareMyAttack}
              className="btn-pop heading-font text-[10px] bg-[var(--c-red)] text-white px-2 py-0.5 ink-border-sm animate-pulse"
            >
              ⚔ DECLARE ATTACK ({atkSel.size})
            </button>
          )}
          {stage === 'play' && g.clash && g.clash.step !== 'done' && (
            <button
              onClick={resolveMyClash}
              className="btn-pop heading-font text-[10px] bg-[var(--c-red)] text-white px-2 py-0.5 ink-border-sm animate-pulse"
            >
              💥 RESOLVE CLASH
            </button>
          )}
          {showPhaseButton && (
            <button
              onClick={advanceMyPhase}
              className={cn(
                'btn-pop heading-font text-[10px] px-2 py-0.5 ink-border-sm',
                g.phase === 'Main2'
                  ? 'bg-[var(--c-red)] text-white'
                  : 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
              )}
            >
              {phaseButtonLabel}
            </button>
          )}
          {stage === 'cpu' && (
            <button
              onClick={skipCpuBeats}
              className="btn-pop heading-font text-[10px] bg-[var(--c-steel)] text-[var(--c-paper)] px-2 py-0.5 ink-border-sm"
            >
              SKIP ▸▸
            </button>
          )}
          {guardStep && (
            <button
              onClick={confirmGuards}
              disabled={!!guardProblem}
              title={guardProblem ?? undefined}
              className={cn(
                'heading-font text-[10px] px-2 py-0.5 ink-border-sm',
                guardProblem
                  ? 'bg-[var(--c-steel)]/60 text-[var(--c-paper)]/60'
                  : 'btn-pop bg-[#29B6F6] text-[var(--c-ink)] animate-pulse',
              )}
            >
              🛡 CONFIRM GUARDS
            </button>
          )}
          {reactionStep && (
            <button
              onClick={resolveCpuClash}
              className="btn-pop heading-font text-[10px] bg-[var(--c-red)] text-white px-2 py-0.5 ink-border-sm animate-pulse"
            >
              💥 RESOLVE CLASH
            </button>
          )}
        </div>
      </div>

      {/* Contextual hint bar */}
      {hint && stage !== 'over' && stage !== 'mulligan' && (
        <div className="px-2 py-0.5 bg-[var(--c-ink)]/70 border-b border-[var(--c-yellow)]/25 text-[9px] font-bold text-[var(--c-yellow)]/90 leading-tight z-20 truncate">
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

      {banner && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-[11px] px-3 py-1 ink-border-sm shadow-hard-black-xs">
          {banner}
        </div>
      )}

      {/* CPU turn narration */}
      {stage === 'cpu' && (
        <div
          role="button"
          tabIndex={0}
          onClick={skipCpuBeats}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              skipCpuBeats();
            }
          }}
          title="Click to fast-forward the opponent's turn"
          className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[var(--c-red)] text-white heading-font text-[11px] px-3 py-1 ink-border-sm shadow-hard-black-xs max-w-[86vw] text-center cursor-pointer select-none"
        >
          {cpuBeat ? (
            <>
              {renderKeywordText(cpuBeat.text)}
              <span className="ml-2 text-[8px] font-mono opacity-80">
                {cpuBeat.idx + 1}/{cpuBeat.total} · click ▸▸
              </span>
            </>
          ) : (
            <span className="animate-pulse">🤔 {cpuLabel} is thinking…</span>
          )}
        </div>
      )}

      {/* Pending target bar */}
      {pending && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[var(--c-red)] text-white heading-font text-[11px] px-3 py-1 ink-border-sm flex gap-2 items-center">
          {pending.kind === 'bond'
            ? 'BOND — pick a friendly unit'
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

      {/* Clash bar — attacker → guard lines (both directions) */}
      {g.clash && (stage === 'play' || stage === 'cpuGuard') && (
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
              #{line.n} {line.name} →{' '}
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

      {/* Enemy row */}
      <div className="h-[3px] w-full bg-[var(--c-red)]/70 shrink-0" />
      <div className="flex gap-2 px-2 pt-2 pb-1.5 items-start bg-[var(--c-ink)]/25 min-h-0 overflow-y-auto">
        <LeaderZonePanel
          p={foe}
          isHuman={false}
          vitTargetable={!!pending && isPendingTarget(CPU)}
          onVitClick={pending && isPendingTarget(CPU) ? () => resolvePendingOn(CPU) : undefined}
          onInspect={() => setInspect(foe.leader.def)}
          floats={floatsFor(`vit:${CPU}`)}
          flash={flashIids.has(`vit:${CPU}`)}
        />
        <div className="flex-1 min-w-0">
          <div className="flex gap-1.5 items-center text-[8px] font-bold text-[var(--c-paper)]/70 mb-0.5 flex-wrap">
            <span>
              {cpuLabel} · hand {foe.hand.length} · deck {foe.deck.length} ·{' '}
              <button
                onClick={() => setShowAsh((s) => (s === 'foe' ? false : 'foe'))}
                className="underline decoration-dotted hover:text-[var(--c-paper)]"
                title="Inspect the opponent's ash-pile and void"
              >
                ash {foe.ashPile.length}
                {foe.voidPile.length > 0 && <> · void {foe.voidPile.length}</>}
              </button>
            </span>
            <span className="flex gap-0.5 items-center">
              {foe.locations.map((l) => (
                <LocationTile
                  key={l.iid}
                  loc={l}
                  tappable={false}
                  onInspect={l.def ? () => setInspect(l.def!) : undefined}
                />
              ))}
              {foe.locations.length === 0 && <span className="opacity-50">no Locations</span>}
            </span>
            {essenceTotal(foe.essence) > 0 && <EssencePips pool={foe.essence} size={12} />}
          </div>
          <div className="flex gap-1 items-start overflow-x-auto pb-1 min-h-[70px]">
            {foe.field.length === 0 && (
              <div className="w-full h-[64px] border-2 border-dashed border-[var(--c-paper)]/15 rounded-md flex items-center justify-center">
                <span className="text-[9px] text-[var(--c-paper)]/30 font-bold uppercase tracking-wide">
                  Empty Field
                </span>
              </div>
            )}
            {foe.field.map((u) => {
              const targetable = !!pending && isPendingTarget(u.iid);
              const attacking = cpuAttackerIids.includes(u.iid) || g.clash?.attackers.includes(u.iid);
              const focusLine = guardStep && guardFocus === u.iid;
              return (
                <BoardUnit
                  key={u.iid}
                  g={g}
                  u={u}
                  highlight={targetable || !!focusLine}
                  isAttacker={!!attacking}
                  flash={flashIids.has(u.iid)}
                  floats={floatsFor(u.iid)}
                  guardNote={
                    attacking
                      ? `#${(g.clash?.attackers.indexOf(u.iid) ?? 0) + 1} ATTACKING`
                      : undefined
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
        </div>
      </div>

      {/* Midline: essence pool + log + piles */}
      <div className="flex flex-wrap items-center gap-3 px-2 py-2 my-1 bg-[var(--c-ink)]/40 border-y-2 border-[var(--c-yellow)]/40 shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-1 shrink-0 max-w-[46vw]">
          <div className="flex items-center gap-1.5">
            <span className="heading-font text-[8px] text-[var(--c-paper)]/70">ESSENCE</span>
            <EssencePips pool={me.essence} />
            <Tip
              text="Your floating essence — produced by exhausting Locations, spent on Essence Costs, and emptied at the end of every phase. Invoking auto-taps Locations for you."
              className="text-[9px] bg-[var(--c-steel)] text-white ink-border-sm px-1"
            >
              ?
            </Tip>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {me.locations.map((l) => (
              <LocationTile
                key={l.iid}
                loc={l}
                tappable={canTapNow}
                onTap={() => tryTapLocation(l)}
                onInspect={l.def ? () => setInspect(l.def!) : undefined}
              />
            ))}
            {inMyMain && !me.wellspringPlayedThisTurn && (
              <span className="flex items-center gap-0.5 bg-[var(--c-ink)] ink-border-sm px-1 py-0.5">
                <span className="text-[7px] font-black text-[var(--c-yellow)]">+ WELLSPRING</span>
                {wellspringChoices(g, HUMAN).map((t) => (
                  <button
                    key={t}
                    onClick={() => tryWellspring(t)}
                    title={`Play a ${t} Wellspring (one per turn, free)`}
                    className="btn-pop flex items-center justify-center rounded-full font-mono font-black border border-white/70"
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
                ))}
              </span>
            )}
            {me.locations.length === 0 && !inMyMain && (
              <span className="text-[8px] font-bold text-[var(--c-paper)]/40">no Locations yet</span>
            )}
          </div>
          {me.wornCharms.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="heading-font text-[7px] text-[var(--c-paper)]/60">WORN CHARMS</span>
              {me.wornCharms.map((c) => (
                <button
                  key={c.iid}
                  onClick={() => tryRebond(c.iid)}
                  title={`Re-bond ${c.def.name} to a friendly unit for ${c.def.rebondCost ?? 0} essence`}
                  className="btn-pop text-[7.5px] font-black bg-[#8E44AD] text-white px-1 py-0.5 ink-border-sm"
                >
                  💠 {c.def.name} · RE-BOND {c.def.rebondCost ?? 0}
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          className={cn(
            'flex-1 min-w-[140px] overflow-y-auto bg-[var(--c-ink)] rounded-sm ink-border-sm px-2 py-1 text-[8px] font-mono text-[var(--c-paper)]/70 leading-tight',
            logExpanded ? 'max-h-[220px]' : 'max-h-[58px]',
          )}
        >
          <div className="flex items-center justify-between text-[7px] font-black text-[var(--c-paper)]/40 uppercase tracking-wide sticky top-0 bg-[var(--c-ink)]">
            <span>Battle Log</span>
            <button
              onClick={() => setLogExpanded((e) => !e)}
              className="text-[8px] px-1 text-[var(--c-yellow)]/80 hover:text-[var(--c-yellow)]"
              title={logExpanded ? 'Collapse the Battle Log' : 'Expand the Battle Log'}
            >
              {logExpanded ? '▾ LESS' : '▴ MORE'}
            </button>
          </div>
          {g.log.slice(logExpanded ? -160 : -40).map((l, i, arr) => (
            <div key={g.log.length - arr.length + i}>· {renderKeywordText(l, true)}</div>
          ))}
        </div>
        <div className="flex flex-col gap-0.5 text-right shrink-0">
          <button
            onClick={() => setShowAsh((s) => (s === 'me' ? false : 'me'))}
            className="btn-pop text-[9px] font-bold bg-[var(--c-steel)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm"
          >
            ASH-PILE {me.ashPile.length}
          </button>
          <span className="text-[8px] font-bold text-[var(--c-paper)]/50">
            deck {me.deck.length}
            {me.voidPile.length > 0 && <> · void {me.voidPile.length}</>}
          </span>
        </div>
      </div>

      {/* My row */}
      <div className="h-[3px] w-full bg-[var(--c-yellow)]/70 shrink-0" />
      <div className="flex gap-2 px-2 pt-1.5 pb-1 items-start flex-1 min-h-0 overflow-y-auto bg-[var(--c-ink)]/25">
        <LeaderZonePanel
          p={me}
          isHuman
          vitTargetable={!!pending && isPendingTarget(HUMAN)}
          onVitClick={pending && isPendingTarget(HUMAN) ? () => resolvePendingOn(HUMAN) : undefined}
          onInvoke={tryInvokeLeader}
          invokeWhy={leaderInvokeWhy}
          onAbility={tryLeaderAbility}
          abilityWhy={leaderAbilityWhy}
          onInspect={() => setInspect(me.leader.def)}
          floats={floatsFor(`vit:${HUMAN}`)}
          flash={flashIids.has(`vit:${HUMAN}`)}
        />
        <div className="flex-1 min-w-0">
          <div className="flex gap-1 items-start overflow-x-auto pb-1 min-h-[70px]">
            {me.field.length === 0 && (
              <div className="w-full h-[64px] border-2 border-dashed border-[var(--c-paper)]/15 rounded-md flex items-center justify-center">
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
                Object.values(g.clash.guards).some((gs: string[]) => gs.includes(u.iid));
              const canGuardNow =
                guardStep && !!guardFocus && legalGuardsFor(g, guardFocus).some((x) => x.iid === u.iid);
              return (
                <BoardUnit
                  key={u.iid}
                  g={g}
                  u={u}
                  isAttacker={atkSel.has(u.iid) || (!!g.clash && g.clash.attackers.includes(u.iid))}
                  isGuard={!!guardAssigned || isDeclaredGuard}
                  highlight={targetable || (canAtt && !atkSel.has(u.iid)) || canGuardNow}
                  flash={flashIids.has(u.iid)}
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
        </div>
      </div>

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
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-40 flex items-stretch gap-2 bg-[var(--c-ink)]/95 ink-border-md p-2 shadow-hard-black-xs">
            <div
              className="relative shrink-0"
              style={{
                width: CARD_SIZES.full.w * HOVER_PREVIEW_SCALE,
                height: CARD_SIZES.full.h * HOVER_PREVIEW_SCALE,
              }}
            >
              <div
                className="absolute top-0 left-0"
                style={{ transform: `scale(${HOVER_PREVIEW_SCALE})`, transformOrigin: 'top left' }}
              >
                <CardFace def={previewCard.def} size="full" introduceKeywords />
              </div>
            </div>
            <div className="flex flex-col gap-1.5 w-[160px]">
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
                {previewCard.def.type === 'Charm'
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
            HAND {me.hand.length}/{MAX_HAND} · tap or hover a card to preview
            {inMyReaction || reactionStep ? ' · REACTION: Quick & Ambush only' : ''}
          </span>
        </div>
        <div className="relative h-[100px] overflow-hidden" style={{ perspective: 800 }}>
          {me.hand.length === 0 && (
            <span className="absolute inset-x-0 top-6 text-center text-[9px] text-[var(--c-paper)]/30 font-bold">
              — empty hand —
            </span>
          )}
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 flex">
            {me.hand.map((c, i) => {
              const why = invokeWhy(c);
              const n = me.hand.length;
              const mid = (n - 1) / 2;
              const off = i - mid;
              const angle = Math.max(-22, Math.min(22, off * (n > 8 ? 5 : 7)));
              const arcDrop = Math.abs(off) * 3;
              const isFocused = preview === c.iid;
              const activate = () => {
                clearHoverIntent();
                setPreview(c.iid);
                setPreviewPinned(true);
              };
              return (
                <div
                  key={c.iid}
                  role="button"
                  tabIndex={0}
                  aria-label={`${c.def.name} — preview and invoke`}
                  className="relative shrink-0 outline-none"
                  style={{
                    width: CARD_SIZES.compact.w,
                    height: CARD_SIZES.compact.h,
                    marginLeft: i === 0 ? 0 : -46,
                    zIndex: isFocused ? 50 : i,
                  }}
                  onMouseEnter={() => previewIntent(c.iid)}
                  onFocus={() => {
                    clearHoverIntent();
                    setPreview(c.iid);
                  }}
                  onClick={activate}
                  onKeyDown={(e) => {
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
                      transform: isFocused
                        ? `translateY(-72px) rotate(0deg) scale(1.04)`
                        : `translateY(${84 + arcDrop}px) rotate(${angle}deg)`,
                    }}
                  >
                    <CardFace
                      def={c.def}
                      size="compact"
                      dimmed={!!why}
                      // During the clash reaction window, playable Quick /
                      // Ambush cards light up so the window is discoverable.
                      highlight={preview === c.iid || ((inMyReaction || reactionStep) && !why)}
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
              <button
                onClick={() => setShedPick(null)}
                aria-label="Cancel shedding"
                className="btn-pop text-[10px] bg-[var(--c-steel)] text-[var(--c-paper)] px-1.5 ink-border-sm"
              >
                ✕ BACK
              </button>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {me.hand.map((c) => {
                const sel = shedPick.includes(c.iid);
                return (
                  <button
                    key={c.iid}
                    onClick={() =>
                      setShedPick((s) =>
                        s === null
                          ? s
                          : sel
                            ? s.filter((x) => x !== c.iid)
                            : s.length < me.hand.length - MAX_HAND
                              ? [...s, c.iid]
                              : s,
                      )
                    }
                    aria-pressed={sel}
                    aria-label={`${sel ? 'Keep' : 'Shed'} ${c.def.name}`}
                    className={cn('relative rounded-[3px]', sel && 'ring-4 ring-[var(--c-red)]')}
                  >
                    <CardFace def={c.def} size="compact" dimmed={sel} />
                    {sel && (
                      <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center heading-font text-[11px] text-white bg-[var(--c-red)]/90 py-0.5">
                        SHED
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-center mt-3">
              <button
                disabled={shedPick.length !== me.hand.length - MAX_HAND}
                onClick={() => {
                  // Engine sheds from the END of the hand: move the chosen
                  // cards to the back, keeping everything else in order.
                  const chosen = new Set(shedPick);
                  const keep = me.hand.filter((c) => !chosen.has(c.iid));
                  const shed = me.hand.filter((c) => chosen.has(c.iid));
                  me.hand.splice(0, me.hand.length, ...keep, ...shed);
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
                SHED &amp; END TURN ▸
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ash-pile drawer */}
      {showAsh && (
        <div className="absolute right-2 left-2 sm:left-auto top-16 bottom-24 w-auto sm:w-[260px] max-w-[260px] bg-[var(--c-ink)] ink-border-md z-40 p-2 overflow-y-auto">
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
            role="dialog"
            aria-modal="true"
            aria-label="Confirm"
            className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md p-4 max-w-xs w-full text-center"
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
        <div className="absolute inset-0 z-50 bg-[var(--c-ink)]/95 flex items-center justify-center p-4 overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mulligan"
            className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md p-5 text-center max-w-5xl w-full my-auto"
          >
            <div className="heading-font text-3xl mb-1">
              {mulliganCount > 0 ? 'YOUR NEW HAND' : 'KEEP or MULLIGAN?'}
            </div>
            <div className="text-[12px] font-bold text-[var(--c-steel)] mb-1">
              Opening hand — {playerName}
              {mulliganCount > 0 ? ` · mulligan ×${mulliganCount}` : ''}
            </div>
            <div className="text-[11px] font-bold text-[var(--c-steel)] max-w-xl mx-auto mb-4 leading-snug">
              {`A mulligan shuffles these ${me.hand.length} cards back into your deck and draws ${Math.max(0, me.hand.length - 1)} fresh ones — one FEWER each time (rulebook §3). You can mulligan as often as you like. Click any card to zoom in.`}
            </div>
            <div className="flex gap-2 justify-center flex-wrap mb-5">
              {me.hand.map((c) => (
                <React.Fragment key={c.iid}>
                  <CardFace
                    def={c.def}
                    size="standard"
                    introduceKeywords
                    onClick={() => setInspect(c.def)}
                  />
                </React.Fragment>
              ))}
            </div>
            <div className="flex gap-4 justify-center flex-wrap sticky bottom-0 bg-[var(--c-paper)] py-2 -mb-2">
              <button
                onClick={afterMulligan}
                className="btn-pop heading-font text-base bg-[var(--c-yellow)] px-8 py-3 ink-border-md shadow-hard-black-xs"
              >
                ✓ KEEP THIS HAND
              </button>
              {me.hand.length > 0 && (
                <button
                  onClick={doMulligan}
                  className="btn-pop heading-font text-base bg-[var(--c-red)] text-white px-8 py-3 ink-border-md shadow-hard-black-xs"
                >
                  ↻ MULLIGAN — draw {me.hand.length - 1}
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
            role="dialog"
            aria-modal="true"
            aria-label="Match result"
            className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md p-6 text-center"
          >
            <div className="heading-font text-3xl mb-2">
              {g.winner === HUMAN ? '🏆 VICTORY' : '☠ DEFEAT'}
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
            {reward == null && !rewardError && rewardPending && (
              <div className="text-[10px] font-bold text-[var(--c-steel)] mb-4 animate-pulse">
                Calculating rewards…
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
