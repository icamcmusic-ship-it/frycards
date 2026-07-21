/**
 * v4.2 dice-placement match UI (Rulebook v4.2, docs/RULEBOOK.md).
 *
 * Human plays interactively through the engine's public actions; the CPU
 * plays whole turns through the same AI used by the headless playtest
 * harness (src/game/v3/ai.ts). The engine object is mutated in place and
 * held in a ref; a version counter forces re-renders after each action.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  HAND_LIMIT,
  rarityTier,
} from '../game/v3/engine';
import { playTurn, maybeMulliganPlayer } from '../game/v3/ai';
import { CardDef, Effect, hasKw } from '../game/v3/cards';
import { DeckDef } from '../game/v3/engine';
import { cn } from '../lib/utils';
import {
  CardFace,
  CARD_SIZES,
  GATE_LABEL,
  describeEffect,
  renderKeywordText,
} from './CardFaceV4';
import { Card3DInspector, INSPECT_SCALE } from './Card3DInspector';
import { CoachOverlay } from './CoachOverlay';
import { MatchResult } from '../lib/supabase';
import { fmtCredits, fmtVouchers } from '../meta/economy';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

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
`;

/** One floating "-N" damage number, keyed so simultaneous hits stack cleanly. */
interface DmgFloat {
  id: number;
  iid: string;
  amount: number;
}

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
// Labeled ability pill — the ONE clickable affordance for every Ability
// Slot / Ultimate on the battlefield (leaders, Locations, board Units), so
// activations are named buttons ("ABILITY 4+: Sap 2 …") instead of mystery
// click targets. Disabled pills carry a `title` tooltip explaining why.
// ---------------------------------------------------------------------------
function AbilityPill({
  label,
  desc,
  usable,
  used,
  usedLabel = 'USED',
  why,
  onClick,
  accent,
}: {
  label: string;
  desc: string;
  usable?: boolean;
  used?: boolean;
  usedLabel?: string;
  /** Reason this pill is currently disabled — shown as a hover tooltip. */
  why?: string;
  onClick?: () => void;
  accent?: 'red';
}) {
  return (
    // A div, not a <button>: `desc` runs through renderKeywordText, whose
    // inline keyword mentions are themselves <button>s — nested buttons are
    // invalid HTML (same reasoning as CardFace / BoardUnit).
    <div
      role="button"
      tabIndex={onClick ? 0 : -1}
      aria-disabled={!usable}
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
          ? cn(
              'btn-pop cursor-pointer',
              accent === 'red'
                ? 'bg-[var(--c-red)] text-white'
                : 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
            )
          : 'bg-[var(--c-steel)]/70 text-[var(--c-paper)]/70',
        used && 'line-through opacity-70',
      )}
    >
      <span className="heading-font mr-1">{label}</span>
      {renderKeywordText(desc, true)}
      {used ? ` — ${usedLabel}` : ''}
    </div>
  );
}

/** Hover-to-view: board cards render tiny (`micro` tier) so more units fit
 * on screen, so any card whose text a player actually wants to read needs a
 * zoomed, read-only preview on hover — for BOTH the player's own board and
 * the opponent's (previously only the hand had any hover affordance; the
 * enemy board could only be inspected via a click-through modal). Renders
 * through a portal at a viewport-fixed position (like the keyword glossary
 * popover) since board rows sit inside `overflow-x-auto`/`overflow-y-auto`
 * ancestors that would otherwise clip an absolutely-positioned popup.
 * Purely a view — pointer-events-none, so it never steals the hover/click
 * the small card underneath needs for its own targeting affordances. */
/** The `full` card tier (240×336) is still too small to comfortably read
 * rules text once it's shrunk to fit a text-heavy card (see the dynamic
 * shrink-to-fit in CardFaceV4) — this scales the hover preview up further,
 * on top of already being the largest fixed tier, purely as a visual
 * transform (layout box is unaffected, which is fine: this preview is a
 * pointer-events-none portal overlay, never part of document flow). */
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
 * mobile where there is no hover event. A long press shows the preview and
 * suppresses the click that would otherwise fire on touch-end (so a peek
 * never accidentally triggers an attack/target selection); a short tap
 * behaves as a normal click. */
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
  // A card can leave the board (die, get bounced, etc.) mid-press — clear
  // the pending timer on unmount so it doesn't fire onLongPress afterward.
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

/** `title=` tooltips never appear on touch devices (no hover event). This
 * wraps a badge so tapping it also reveals the same text in a small popover,
 * while desktop keeps the native hover tooltip. */
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
  return (
    <span
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
// A unit on the battlefield — the same shared CardFace template used
// everywhere else (condensed `micro` tier so the board reads as a real
// battlefield instead of a stack of full cards), with live effective stats
// rendered in the normal stat-chip slots, status/damage overlays on a
// wrapper, and a hover-to-view full-size preview (see `useHoverPreview`).
// ---------------------------------------------------------------------------
function BoardUnit({
  g,
  u,
  onClick,
  highlight,
  dimmed,
  isAttacker,
  flash,
  floats,
}: {
  g: Game;
  u: Inst;
  onClick?: () => void;
  highlight?: boolean;
  dimmed?: boolean;
  isAttacker?: boolean;
  /** Attack feedback: briefly true on the attacker/target of a resolved attack. */
  flash?: boolean;
  /** Floating "-N" damage numbers currently animating over this card. */
  floats?: DmgFloat[];
}) {
  const hp = remainingHp(g, u);
  const maxHp = effMaxHp(g, u);
  const atk = effAtk(g, u);
  const exhausted = u.hasAttacked || u.abilityUsed;
  const sick = u.enteredThisTurn && !hasKw(u.def, 'Swift');
  const wardUp = hasKw(u.def, 'Ward') && !u.wardUsed;
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
        (exhausted || sick) && 'saturate-50',
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
        {wardUp && (
          <Tip
            text="Ward available — the first damage/Removal against this Unit is prevented"
            className="text-[10px] bg-[#29B6F6] ink-border-sm px-0.5"
          >
            🛡
          </Tip>
        )}
        {!u.boundThisTurn && u.boundNextTurn && (
          <Tip
            text="Bound — will be unable to attack, use abilities, or retaliate on its controller's next turn"
            className="text-[10px] bg-[#8E44AD]/70 text-white ink-border-sm px-0.5"
          >
            ⛓
          </Tip>
        )}
        {u.boundThisTurn && (
          <Tip
            text="Bound — cannot attack, use abilities, or retaliate this turn"
            className="text-[10px] bg-[#8E44AD] text-white ink-border-sm px-0.5"
          >
            ⛓
          </Tip>
        )}
        {sick && (
          <Tip
            text="Just played — can't act until your next turn (no Swift)"
            className="text-[10px] bg-[var(--c-steel)] text-white ink-border-sm px-0.5"
          >
            z
          </Tip>
        )}
        {exhausted && !sick && (
          <Tip
            text="Exhausted — already attacked or used an ability this turn"
            className="text-[10px] bg-[var(--c-steel)] text-white ink-border-sm px-0.5"
          >
            ✓
          </Tip>
        )}
      </div>
      {floats?.map((f) => (
        <span key={f.id} className="gv4-dmg-float">
          −{f.amount}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leader panel — full CardFace plus clearly labeled, non-overlapping ability
// pills BELOW the card (never squeezed inside its text box): HP lives in the
// card's stat chip, Resolve/Toll status in the art badge, and the Ability /
// Ultimate slots are separate named buttons with disabled-reason tooltips.
// ---------------------------------------------------------------------------
function LeaderPanel({
  g,
  p,
  isHuman,
  onAbility,
  onUltimate,
  abilityWhy,
  ultimateWhy,
  highlight,
  flash,
  onClickTarget,
  onInspect,
  floats,
}: {
  g: Game;
  p: Player;
  isHuman: boolean;
  onAbility?: () => void;
  onUltimate?: () => void;
  /** Reason the ability pill is disabled right now (undefined = usable). */
  abilityWhy?: string;
  ultimateWhy?: string;
  highlight?: boolean;
  flash?: boolean;
  onClickTarget?: () => void;
  onInspect?: () => void;
  floats?: DmgFloat[];
}) {
  const l = p.leader;
  const hp = Math.max(0, remainingHp(g, l));
  const maxHp = effMaxHp(g, l);
  const ab = l.def.ability;
  const ult = l.def.ultimate;
  const abThr = effAbilityThreshold(g, l);
  const toll = tollReduction(g, p.id);
  const resolveOn = !!l.def.resolve && hp * 2 <= maxHp;
  // Ability/Ultimate render as the labeled pills below (for BOTH players), so
  // strip them from the def the shared rules section would otherwise print —
  // no duplicated or overlapping text inside the card's text box.
  const liveDef = { ...l.def, hp, ability: undefined, ultimate: undefined };
  return (
    <div
      className={cn(
        'shrink-0 relative w-[140px] flex flex-col gap-0.5',
        flash && 'gv4-attack-flash',
        highlight && 'ring-4 ring-[var(--c-red)] rounded-[6px]',
      )}
    >
      <CardFace
        def={liveDef}
        size="standard"
        maxHp={maxHp}
        introduceKeywords
        onClick={onClickTarget ?? onInspect}
        badge={resolveOn ? `RESOLVE −${l.def.resolve!.x}` : toll > 0 ? `TOLL −${toll}` : undefined}
      />
      {ab && (
        <AbilityPill
          label={`BASE ABILITY ${abThr}+${abThr !== ab.threshold ? ` (was ${ab.threshold}+)` : ''}:`}
          desc={
            describeEffect(ab.effect) +
            (l.def.abilityNoRepeatTarget ? " (can't repeat last turn's target)" : '') +
            (l.def.abilityGrantsTempo ? " — next Unit cast this turn skips summoning sickness" : '')
          }
          usable={isHuman && !abilityWhy}
          used={l.abilityUsed}
          why={isHuman ? abilityWhy : 'Opponent ability — shown for information'}
          onClick={isHuman ? onAbility : undefined}
        />
      )}
      {ult && (
        <AbilityPill
          label={`ULTIMATE t${ult.unlockTurn}+, die ${ult.threshold}+:`}
          desc={describeEffect(ult.effect)}
          usable={isHuman && !ultimateWhy}
          used={l.ultimateUsed}
          usedLabel="SPENT"
          why={isHuman ? ultimateWhy : 'Opponent ultimate — shown for information'}
          onClick={isHuman ? onUltimate : undefined}
          accent="red"
        />
      )}
      {floats?.map((f) => (
        <span key={f.id} className="gv4-dmg-float">
          −{f.amount}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The player's Location — a full CardFace (standard size) with its Ability
// Slot as a labeled pill below, matching the leader/unit presentation.
// ---------------------------------------------------------------------------
function LocationPanel({
  g,
  loc,
  onAbility,
  abilityWhy,
  isRallySource,
  onRallyClick,
  onInspect,
  floats,
}: {
  g: Game;
  loc: Inst;
  onAbility?: () => void;
  abilityWhy?: string;
  isRallySource?: boolean;
  onRallyClick?: () => void;
  onInspect?: () => void;
  floats?: DmgFloat[];
}) {
  const ab = loc.def.ability;
  const thr = ab ? effAbilityThreshold(g, loc) : null;
  return (
    <div
      className={cn(
        'relative shrink-0 w-[140px] flex flex-col gap-0.5',
        isRallySource && 'ring-4 ring-[#8E44AD] rounded-[4px] cursor-pointer',
      )}
    >
      <CardFace
        // Ability renders as the labeled pill below (see AbilityPill) —
        // strip it from the def the shared rules section would otherwise
        // print, same as LeaderPanel already does, so the cost/effect isn't
        // shown twice on screen at once.
        def={{ ...loc.def, ability: undefined }}
        size="standard"
        introduceKeywords
        onClick={isRallySource ? onRallyClick : onInspect}
      />
      {ab && (
        <AbilityPill
          label={`BASE ABILITY ${thr}+${thr !== ab.threshold ? ` (was ${ab.threshold}+)` : ''}:`}
          desc={describeEffect(ab.effect)}
          usable={!abilityWhy}
          used={loc.abilityUsed}
          why={abilityWhy}
          onClick={onAbility}
        />
      )}
      {floats?.map((f) => (
        <span key={f.id} className="gv4-dmg-float">
          −{f.amount}
        </span>
      ))}
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
  /** v4.3: the single die committed when this cast was armed (e.g. auto-
   * picked by the hand preview's CAST button) — takes precedence over
   * whatever selDie happens to be by the time the target is clicked. */
  dieIndex?: number;
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
   * screen once the parent has recorded the result (null/undefined until
   * then, or forever for guests). */
  reward?: MatchResult | null;
  /** Set once the parent gives up retrying a failed recordMatchResult() —
   * shown in place of the reward banner so a network/server error doesn't
   * just look like the reward never showed up. */
  rewardError?: string | null;
  /** True while the parent's recordMatchResult() call (incl. retries) is
   * still in flight — distinguishes "reward hasn't arrived yet" from the
   * guest case (reward stays null forever), so the game-over screen can
   * show a placeholder instead of a blank gap. */
  rewardPending?: boolean;
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
  const bump = () => {
    recordDamageFloats();
    setVersion((v) => v + 1);
  };

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
  // In-game replacement for window.confirm — native confirm dialogs look
  // jarring against the styled UI and are easy to accidentally dismiss with
  // a stray tap outside on mobile.
  const [confirmDialog, setConfirmDialog] = useState<{
    text: string;
    onConfirm: () => void;
  } | null>(null);
  const [inspect, setInspect] = useState<CardDef | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  // v4.8 QoL: the Battle Log is the only record of combos/ward spikes/
  // fatigue — allow expanding it beyond the 58px strip.
  const [logExpanded, setLogExpanded] = useState(false);
  // v4.3 hand preview: the hand card currently enlarged above the bottom
  // dock (hover opens it, click pins it so it survives the mouse leaving).
  const [preview, setPreview] = useState<string | null>(null);
  const [previewPinned, setPreviewPinned] = useState(false);
  // v4.3 combat feedback: floating damage numbers (diffed per bump), a big
  // phase banner on stage changes, and a brief flash on attacker/target.
  const [floats, setFloats] = useState<DmgFloat[]>([]);
  const [phaseFx, setPhaseFx] = useState<string | null>(null);
  const [attackFx, setAttackFx] = useState<{ attacker: string; target: string } | null>(null);
  const damageMemoRef = useRef<Map<string, number>>(new Map());
  const floatIdRef = useRef(0);
  const phaseTimeoutRef = useRef<number | null>(null);
  const attackFxTimeoutRef = useRef<number | null>(null);
  const [forcedDiscard, setForcedDiscard] = useState<{ needed: number; picks: string[] } | null>(
    null,
  );
  const resultSent = useRef(false);
  const cpuTimeoutRef = useRef<number | null>(null);
  const bannerTimeoutRef = useRef<number | null>(null);
  const rollTimeoutRef = useRef<number | null>(null);
  // Every batch of damage floats schedules its own removal timeout — tracked
  // here so they can all be cancelled on unmount (e.g. conceding mid-combat),
  // instead of firing later and calling setFloats on an unmounted component.
  const floatTimeoutsRef = useRef<Set<number>>(new Set());
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
      if (phaseTimeoutRef.current !== null) window.clearTimeout(phaseTimeoutRef.current);
      if (attackFxTimeoutRef.current !== null) window.clearTimeout(attackFxTimeoutRef.current);
      for (const id of floatTimeoutsRef.current) window.clearTimeout(id);
      floatTimeoutsRef.current.clear();
    },
    [],
  );

  /** Diff every in-play card's accumulated damage against the last bump and
   * spawn a floating "-N" over anything that just took a hit. Hoisted
   * function declaration so bump() (defined above) can call it safely. */
  function recordDamageFloats() {
    const seen = new Map<string, number>();
    const fresh: DmgFloat[] = [];
    for (const pid of g.order) {
      const pl = g.players[pid];
      const all: Inst[] = [...pl.board, pl.leader, ...(pl.location ? [pl.location] : [])];
      for (const u of all) {
        seen.set(u.iid, u.damage);
        const prev = damageMemoRef.current.get(u.iid);
        if (prev !== undefined && u.damage > prev) {
          fresh.push({ id: ++floatIdRef.current, iid: u.iid, amount: u.damage - prev });
        }
      }
    }
    damageMemoRef.current = seen;
    if (fresh.length > 0) {
      setFloats((f) => [...f, ...fresh]);
      const ids = new Set(fresh.map((f) => f.id));
      const timeoutId = window.setTimeout(() => {
        floatTimeoutsRef.current.delete(timeoutId);
        setFloats((f) => f.filter((x) => !ids.has(x.id)));
      }, 1250);
      floatTimeoutsRef.current.add(timeoutId);
    }
  }
  const floatsFor = (iid: string) => floats.filter((f) => f.iid === iid);

  /** Big center-screen phase banner (ROLL / PLACEMENT / COMBAT / END). */
  const flashPhase = (label: string) => {
    setPhaseFx(label);
    if (phaseTimeoutRef.current !== null) window.clearTimeout(phaseTimeoutRef.current);
    phaseTimeoutRef.current = window.setTimeout(() => {
      setPhaseFx(null);
      phaseTimeoutRef.current = null;
    }, 1150);
  };

  // v4.19 hover intent: the hand preview only switches after the cursor has
  // rested ~80ms on a card — sweeping the mouse across the fan no longer
  // strobes the big preview through every card it crosses, and the lifted
  // card animating out from under the cursor can't cause enter/leave
  // oscillation (the hit area lives on a stationary wrapper, see the fan).
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

  // ---- turn driving -------------------------------------------------------
  // Values are rolled by the engine immediately (startTurn), but they stay
  // hidden (face-down) until the human player clicks ROLL DICE themselves —
  // that click is what triggers the reveal animation, so it reads as the
  // player's own roll rather than numbers just appearing.
  const beginHumanTurn = () => {
    const fatigueBefore = me.fatigue;
    startTurn(g);
    bump();
    if (g.winner) {
      setStage('over');
      return;
    }
    // v4.8 QoL: Fatigue used to be a Battle Log whisper — surface the
    // escalating self-damage with the same banner treatment big plays get.
    if (me.fatigue > fatigueBefore) {
      say(`OUT OF CARDS — Fatigue deals ${me.fatigue} damage (and it keeps climbing)`);
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
    closePreview();
    setStage('awaitRoll');
  };

  const doRollDice = () => {
    flashPhase('ROLL');
    setStage('rolling');
    // Dice are already rolled by startTurn — render however many exist, so
    // animate however many the engine actually dealt.
    setRollingDice(new Set(me.dice.map((_, i) => i)));
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
      // The confirm dialog (e.g. "Concede this match?") is always the
      // frontmost overlay when open — check it first so Escape dismisses it
      // instead of falling through and silently cancelling whatever state it
      // happens to be occluding underneath.
      if (confirmDialog) setConfirmDialog(null);
      else if (inspect) setInspect(null);
      else if (preview) {
        setPreview(null);
        setPreviewPinned(false);
      } else if (pending) setPending(null);
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
  }, [confirmDialog, inspect, showDiscard, echoPick, pending, sumCast, rallyPick, attacker, preview]);

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

  /** v4.3: `dieIdx` defaults to the tray selection but can be overridden by
   * the hand preview's CAST button (which may auto-pick a paying die). */
  const canCastNow = (c: Inst, dieIdx: number | null = selDie): { ok: boolean; why?: string } => {
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
    if (stage !== 'placement' && stage !== 'preRoll')
      return { ok: false, why: 'Casting happens during Placement' };
    if (stage === 'preRoll' && !c.def.snap)
      return { ok: false, why: 'Only Snap Charms before the reroll' };
    const dv =
      dieIdx !== null && me.dice[dieIdx] && !me.dice[dieIdx].placed ? me.dice[dieIdx].value : null;
    if (c.def.comboGate) {
      if (me.comboGateCastThisTurn) return { ok: false, why: 'One Combo-gated card per turn' };
      if (!matchesPattern(rollValues(me), c.def.comboGate))
        return { ok: false, why: `Roll lacks ${GATE_LABEL[c.def.comboGate] || c.def.comboGate}` };
      if (dv === null) return { ok: false, why: 'Select a die' };
      if (needsTarget(c.def.onCast) && targetsFor(g, HUMAN, c.def.onCast!).length === 0)
        return { ok: false, why: 'No legal target' };
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
    if (dv === null) return { ok: false, why: 'Select a die' };
    if (c.def.castCostKind === 'exact') {
      if (dv !== thr) return { ok: false, why: `Needs exactly ${thr}` };
    } else if (dv < thr) {
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
    // Mirror canCastNow's stage gating (casting is a Placement/Snap action).
    if (stage !== 'placement' && stage !== 'preRoll') return false;
    if (stage === 'preRoll' && !c.def.snap) return false;
    // Mirrors canCastNow's branch order exactly (minus the "a die must
    // already be selected" checks). Also requires an unplaced die to
    // actually exist — canCastNow's own `dieVal === null` check implicitly
    // forbids this once every die is placed, since selecting an
    // already-placed die still yields dieVal null; this needs the same
    // guard since it never reads dieVal at all.
    if (c.def.comboGate)
      return (
        unplaced.length > 0 &&
        !me.comboGateCastThisTurn &&
        matchesPattern(rollValues(me), c.def.comboGate) &&
        (!needsTarget(c.def.onCast) || targetsFor(g, HUMAN, c.def.onCast!).length > 0)
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

  const tryCast = (c: Inst, dieIdx: number | null = selDie) => {
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
    const chk = canCastNow(c, dieIdx);
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
      setPending({
        kind: 'cast',
        cardIid: c.iid,
        effect: c.def.onCast!,
        dieIndex: dieIdx ?? undefined,
      });
      return;
    }
    if (castFromHand(g, dieIdx!, c.iid)) {
      setSelDie(null);
      // A Snap cast can place a die that was marked for reroll — drop it from
      // the selection so the mark doesn't linger on a disabled die.
      setRerollSel((s) => new Set([...s].filter((i) => !me.dice[i].placed)));
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

  /** v4.3: cheapest still-unplaced die that pays this card's single-die cost
   * — lets the preview's CAST button work without a manual die pick first. */
  const pickAutoDie = (c: Inst): number | null => {
    if (c.def.type === 'Location') return null;
    if (c.def.castCostKind === 'sum' && !c.def.comboGate) return null;
    const thr = effThreshold(g, HUMAN, c.def);
    const cands = unplaced
      .filter((d) => {
        if (c.def.comboGate) return true; // any die value pays a pattern gate
        return c.def.castCostKind === 'exact' ? d.value === thr : d.value >= thr;
      })
      .sort((a, b) => a.value - b.value);
    return cands.length > 0 ? cands[0].i : null;
  };

  /** CAST from the enlarged hand preview: reuse the selected die if it pays,
   * otherwise auto-pick the cheapest one that does, then run the normal
   * cast flow (sum-builder / target picker / immediate resolve). */
  const castFromPreview = (c: Inst) => {
    let dieIdx = selDie;
    if (c.def.type !== 'Location' && !canCastNow(c, dieIdx).ok) {
      const auto = pickAutoDie(c);
      if (auto !== null) {
        dieIdx = auto;
        setSelDie(auto);
      }
    }
    closePreview();
    tryCast(c, dieIdx);
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
      // A Snap sum-cast during preRoll can place dice that were marked for
      // reroll — drop them from the selection so the marks don't linger on
      // disabled dice (same cleanup the single-die cast path does).
      setRerollSel((s) => new Set([...s].filter((i) => !me.dice[i].placed)));
      say(`${c.def.name} resolves.`);
      bump();
    } else say('Illegal placement.');
    setSumCast(null);
    if (g.winner) setStage('over');
  };

  /** v4.4: mid-rarity Echo waives the extra-discard cost entirely (see
   * engine.ts echoRecast) — resolve those immediately instead of routing
   * through the fodder-pick step every other Echo still needs. */
  const startEchoRecast = (cardIid: string, dice: number | number[], targetIid?: string) => {
    const c = me.discard.find((h) => h.iid === cardIid);
    if (!c) return;
    if (rarityTier(c.def.rarity) === 'mid') {
      if (echoRecast(g, dice, cardIid, undefined, targetIid)) {
        setEchoPick(null);
        setSelDie(null);
        setSumCast(null);
        setShowDiscard(false);
        bump();
        say(
          hasKw(c.def, 'Twin')
            ? `${c.def.name} staged — match a ${me.staging.find((s) => s.iid === c.iid)?.stagedDie} later (Echo cost waived — mid-rarity).`
            : `${c.def.name} echoes back into play (Echo cost waived — mid-rarity).`,
        );
      } else {
        say('Illegal Echo.');
      }
      if (g.winner) setStage('over');
      return;
    }
    // Non-mid Echo needs a hand card as fodder (engine: echoRecast fails
    // without one) — with an empty hand the fodder prompt would just strand
    // the player in a pick that can never be completed.
    if (me.hand.length === 0) {
      say('Echo needs a card in hand to discard — your hand is empty.');
      setEchoPick(null);
      setSumCast(null);
      return;
    }
    setEchoPick({ cardIid, dieIndices: Array.isArray(dice) ? dice : undefined, targetIid });
    setSumCast(null);
    say('Now pick a hand card to discard.');
  };

  // ---- 'sum'-cost Echo recast: same dice-picker as confirmSumCast, but the
  // card lives in discard and resolution still needs a fodder discard from
  // hand — hands off to echoPick/tryEchoFodder instead of casting directly
  // (unless mid-rarity, which startEchoRecast resolves right away).
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
      // Dice are captured in pending.dieIndices — disarm the SUM ECHO bar so
      // dice clicks aren't stuck in sum-toggle mode behind the target picker.
      setSumCast(null);
      return;
    }
    startEchoRecast(c.iid, dieIndices);
  };

  const resolvePendingOn = (targetIid: string) => {
    if (!pending) return;
    if (pending.kind === 'echo') {
      // Echo (unless mid-rarity — see startEchoRecast) still needs a fodder
      // discard from hand: hand off to the fodder-picking step instead of
      // resolving immediately, carrying the target (and, for a 'sum'-cost
      // Echo, the dice already picked to pay it) along.
      const dice = pending.dieIndices ?? selDie!;
      setPending(null);
      startEchoRecast(pending.cardIid, dice, targetIid);
      return;
    }
    let ok = false;
    if (pending.kind === 'cast')
      ok = castFromHand(
        g,
        pending.dieIndices ?? pending.dieIndex ?? selDie!,
        pending.cardIid,
        targetIid,
      );
    else if (pending.kind === 'ability')
      ok = pending.rallySourceIid
        ? activateViaRally(g, pending.cardIid, pending.rallySourceIid, targetIid)
        : activateAbility(g, pending.dieIndex ?? selDie!, pending.cardIid, targetIid);
    else if (pending.kind === 'ultimate')
      ok = activateUltimate(g, pending.dieIndex ?? selDie!, targetIid);
    setPending(null);
    if (ok) {
      setSelDie(null);
      // A Snap cast can place a die that was marked for reroll — drop it from
      // the selection so the mark doesn't linger on a disabled die.
      setRerollSel((s) => new Set([...s].filter((i) => !me.dice[i].placed)));
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
      let ts = targetsFor(g, HUMAN, c.def.ability.effect);
      // Mirror the engine's abilityNoRepeatTarget rule — last turn's target
      // is never a legal explicit pick, so don't count (or later offer) it.
      if (c.def.abilityNoRepeatTarget && c.lastAbilityTargetIid)
        ts = ts.filter((t) => t.iid !== c.lastAbilityTargetIid);
      if (ts.length === 0) {
        say('No legal target.');
        return;
      }
      // Capture the paying die now, like 'cast' already does — selDie can
      // change (or clear) between arming this targeted ability and the
      // player actually clicking a target (e.g. casting an unrelated hand
      // card off a different die in between), and resolvePendingOn used to
      // trust whatever selDie happened to be by then instead of this one.
      setPending({
        kind: 'ability',
        cardIid: c.iid,
        effect: c.def.ability.effect,
        dieIndex: selDie ?? undefined,
      });
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
      setPending({
        kind: 'ultimate',
        cardIid: me.leader.iid,
        effect: ult.effect,
        dieIndex: selDie ?? undefined,
      });
      return;
    }
    if (activateUltimate(g, selDie!)) {
      setSelDie(null);
      bump();
    } else say('Illegal.');
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
    if (stage !== 'placement') {
      say('Twin completes during Placement.');
      return;
    }
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
      // A Twin card Echoes back into STAGING (engine: echoRecast's Twin
      // branch), not straight into play — mirror the mid-rarity path's text.
      say(
        hasKw(target.def, 'Twin')
          ? `${target.def.name} staged — match a ${me.staging.find((s) => s.iid === target.iid)?.stagedDie} later.`
          : `${target.def.name} echoes back into play.`,
      );
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
    closePreview();
    flashPhase('COMBAT');
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

  // End Phase discards down to HAND_LIMIT (§3.7) — the rulebook gives the
  // player the choice of which cards, so route through a picker modal
  // whenever ending the turn would otherwise force a discard. Pitch/Tribute
  // are resolved first since Tribute can draw a card and push the hand over
  // the limit even when it wasn't before — the picker needs the post-draw
  // hand size, not the pre-draw one.
  const attemptFinishTurn = () => {
    flashPhase('END');
    resolveEndPhasePreDiscard(g);
    bump();
    if (g.winner) {
      setStage('over');
      return;
    }
    const needed = me.hand.length - HAND_LIMIT;
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
    // A Snap cast during preRoll can place a die that was already marked for
    // reroll (its tray button goes disabled, so it can't be unmarked) — the
    // engine skips placed dice but would still spend the reroll charge.
    const picks = [...rerollSel].filter((i) => !me.dice[i].placed);
    if (picks.length === 0 && rerollSel.size > 0) {
      setRerollSel(new Set());
      say('Those dice are already placed — mark unplaced dice to reroll, or KEEP ALL.');
      return;
    }
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
    if (g.stage === 'PLACEMENT') flashPhase('PLACEMENT');
    setStage(g.stage === 'PLACEMENT' ? 'placement' : 'preRoll');
  };

  // ---- combat helpers -----------------------------------------------------
  // v4.4: attacker-aware — excludes the enemy Leader when `attacker` is
  // mid-Frenzy's second swing (see engine.ts legalTargets), so the target
  // picker never even offers an illegal face attack for that swing.
  const combatTargets = attacker ? legalTargets(g, HUMAN, attacker) : [];

  const tryAttackTarget = (iid: string) => {
    if (!attacker) return;
    if (attack(g, attacker, iid)) {
      // Attack feedback: flash both combatants for the animation's duration.
      setAttackFx({ attacker, target: iid });
      if (attackFxTimeoutRef.current !== null) window.clearTimeout(attackFxTimeoutRef.current);
      attackFxTimeoutRef.current = window.setTimeout(() => {
        setAttackFx(null);
        attackFxTimeoutRef.current = null;
      }, 680);
      const stillCan = me.board.find((u) => u.iid === attacker && canAttack(g, u));
      setAttacker(stillCan ? attacker : null);
      bump();
    } else say('Illegal target (Guard?).');
    if (g.winner) setStage('over');
  };

  // Targeting overlay for pending effects. An `abilityNoRepeatTarget`
  // ability (engine: activateAbility rejects an explicit re-pick of last
  // turn's target) must not offer that target — otherwise the picker
  // highlights a card that always resolves to "Illegal target."
  const pendingTargets = pending
    ? (() => {
        let ts = targetsFor(g, HUMAN, pending.effect);
        if (pending.kind === 'ability') {
          const src = [...me.board, me.leader, me.location].find(
            (x): x is Inst => !!x && x.iid === pending.cardIid,
          );
          if (src?.def.abilityNoRepeatTarget && src.lastAbilityTargetIid)
            ts = ts.filter((t) => t.iid !== src.lastAbilityTargetIid);
        }
        return ts;
      })()
    : [];
  const isPendingTarget = (iid: string) => pendingTargets.some((t) => t.iid === iid);

  const rallyUnit = rallyPick
    ? [...me.board, me.leader, me.location].find((x): x is Inst => !!x && x.iid === rallyPick)
    : null;
  const rallySources = rallyUnit ? rallySourcesFor(g, HUMAN, rallyUnit) : [];
  const isRallySource = (iid: string) => rallySources.some((s) => s.iid === iid);

  const echoables = me.discard.filter((c) => hasKw(c.def, 'Echo') && !c.echoSpent);

  // ---- labeled ability-slot state (why is this pill disabled?) -------------
  const leaderAbilityWhy = (() => {
    const l = me.leader;
    if (!l.def.ability) return undefined;
    if (stage !== 'placement') return 'Abilities resolve during your Placement Phase';
    if (l.abilityUsed) return 'Already used this turn';
    const thr = effAbilityThreshold(g, l);
    if (dieVal === null) return `Select a die of ${thr}+ first`;
    if (dieVal < thr) return `Needs a die of ${thr}+ (selected: ${dieVal})`;
    return undefined;
  })();
  const leaderUltimateWhy = (() => {
    const l = me.leader;
    const ult = l.def.ultimate;
    if (!ult) return undefined;
    if (l.ultimateUsed) return 'Already spent — once per game';
    if (stage !== 'placement') return 'Ultimates resolve during your Placement Phase';
    if (me.turnsTaken < ult.unlockTurn)
      return `Unlocks on your turn ${ult.unlockTurn} (this is your turn ${me.turnsTaken})`;
    if (dieVal === null) return `Select a die of ${ult.threshold}+ first`;
    if (dieVal < ult.threshold) return `Needs a die of ${ult.threshold}+ (selected: ${dieVal})`;
    return undefined;
  })();
  const locationAbilityWhy = (() => {
    const loc = me.location;
    if (!loc?.def.ability) return undefined;
    if (stage !== 'placement') return 'Abilities resolve during your Placement Phase';
    if (loc.abilityUsed) return 'Already used this turn';
    const thr = effAbilityThreshold(g, loc);
    if (dieVal === null) return `Select a die of ${thr}+ first`;
    if (dieVal < thr) return `Needs a die of ${thr}+ (selected: ${dieVal})`;
    return undefined;
  })();
  const unitAbilityWhy = (u: Inst): string | undefined => {
    if (!u.def.ability) return undefined;
    if (stage !== 'placement') return 'Abilities resolve during your Placement Phase';
    if (u.abilityUsed) return 'Already used this turn';
    if (u.hasAttacked) return 'Attacked this turn — abilities locked';
    if (u.boundThisTurn) return "Bound — can't act this turn";
    if (u.enteredThisTurn && !hasKw(u.def, 'Swift')) return "Just played — can't act yet";
    const thr = effAbilityThreshold(g, u);
    if (dieVal === null) return `Select a die of ${thr}+ first`;
    if (dieVal < thr) return `Needs a die of ${thr}+ (selected: ${dieVal})`;
    return undefined;
  };

  // ---- contextual hint bar (item: keywords/actions unintuitive) ------------
  const hint = (() => {
    if (pending) return 'Pick a highlighted target for the effect (✕ or Esc to cancel).';
    if (rallyPick) return 'Pick a highlighted donor — an exhausted permanent with a resting die.';
    if (sumCast) return 'Click dice in the tray to build the sum, then confirm in the orange bar.';
    if (echoPick) return 'Pick a card in your hand to discard — that pays the Echo cost.';
    switch (stage) {
      case 'awaitRoll':
        return 'Dice are your only resource — no mana. Click ROLL DICE to roll them.';
      case 'rolling':
        return 'Rolling…';
      case 'preRoll':
        return `Click dice to mark them, then REROLL (${rerollsRemaining(g, HUMAN)} left) — or KEEP ALL. Snap Charms can be cast right now.`;
      case 'placement':
        return selDie !== null
          ? `Die ${dieVal ?? '?'} selected — hover a hand card and press CAST, or press an ABILITY pill · dice left: ${unplaced.length}`
          : `Hover a card in hand to preview & cast it · Locations cast free · dice left: ${unplaced.length} (leftovers Pitch = heal your Leader 1 each)`;
      case 'combat':
        if (me.turnsTaken <= 1)
          return 'No attacks on your very first turn — END TURN when ready (leftover dice Pitch to heal your Leader).';
        return attacker
          ? 'Now click a highlighted enemy to attack it (Guards must fall first).'
          : 'Click one of your ready Units, then an enemy target. END TURN when done.';
      case 'cpu':
        return `${cpuLabel} is playing its turn — each action is narrated (SKIP ▸▸ to fast-forward).`;
      default:
        return null;
    }
  })();

  const previewCard = preview ? (me.hand.find((c) => c.iid === preview) ?? null) : null;
  const previewInfo = previewCard
    ? {
        chk: canCastNow(previewCard),
        auto: pickAutoDie(previewCard),
        isSum: previewCard.def.castCostKind === 'sum' && !previewCard.def.comboGate,
        canScrapNow: hasKw(previewCard.def, 'Scrap') && stage === 'placement' && selDie !== null,
      }
    : null;
  const previewCastable =
    !!previewInfo &&
    (previewInfo.chk.ok || (previewInfo.auto !== null && previewInfo.chk.why === 'Select a die'));

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
      {/* Top bar */}
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

      {/* Contextual hint bar — plain-words summary of what's possible right now */}
      {hint && stage !== 'over' && stage !== 'mulligan' && (
        <div className="px-2 py-0.5 bg-[var(--c-ink)]/70 border-b border-[var(--c-yellow)]/25 text-[9px] font-bold text-[var(--c-yellow)]/90 leading-tight z-20 truncate">
          💡 {hint}
        </div>
      )}

      <CoachOverlay stage={stage} />

      {/* Phase banner — big center-screen callout on ROLL/PLACEMENT/COMBAT/END */}
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
      {stage === 'cpu' && cpuNarration && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[var(--c-red)] text-white heading-font text-[11px] px-3 py-1 ink-border-sm shadow-hard-black-xs max-w-[80vw] text-center">
          {cpuLabel}: {renderKeywordText(cpuNarration)}
        </div>
      )}
      {pending && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2 z-50 bg-[var(--c-red)] text-white heading-font text-[11px] px-3 py-1 ink-border-sm flex gap-2 items-center">
          PICK A TARGET — {renderKeywordText(describeEffect(pending.effect))}
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
              <span className="text-[9px] font-bold opacity-90">
                {met ? '✓ enough — confirm!' : `need ${target - total} more`}
              </span>
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
      <div className="flex gap-2 px-2 pt-2 pb-1.5 items-start bg-[var(--c-ink)]/25 min-h-0 overflow-y-auto">
        <LeaderPanel
          g={g}
          p={foe}
          isHuman={false}
          highlight={
            (!!pending && isPendingTarget(foe.leader.iid)) ||
            (!!attacker && combatTargets.some((t) => t.iid === foe.leader.iid))
          }
          flash={attackFx?.target === foe.leader.iid}
          floats={floatsFor(foe.leader.iid)}
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
              {foe.banished.length > 0 && <> · banished {foe.banished.length}</>}
            </span>
            {foe.location && (
              <span
                role="button"
                tabIndex={0}
                className="bg-[var(--c-steel)] px-1 ink-border-sm text-[var(--c-paper)] cursor-pointer"
                onClick={() => setInspect(foe.location!.def)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setInspect(foe.location!.def);
                  }
                }}
                title="Click to inspect the enemy Location"
                aria-label={`Inspect enemy Location: ${foe.location.def.name}`}
              >
                📍 {foe.location.def.name}
              </span>
            )}
            {foe.staging.length > 0 && <span>staging {foe.staging.length}</span>}
          </div>
          <div className="flex gap-1 items-start overflow-x-auto pb-1 min-h-[70px]">
            {foe.board.length === 0 && (
              <div className="w-full h-[64px] border-2 border-dashed border-[var(--c-paper)]/15 rounded-md flex items-center justify-center">
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
                    flash={attackFx?.target === u.iid}
                    floats={floatsFor(u.iid)}
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
      <div className="flex flex-wrap items-center gap-3 px-2 py-2 my-1 bg-[var(--c-ink)]/40 border-y-2 border-[var(--c-yellow)]/40 shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
        <div className="flex gap-1.5 items-center shrink-0">
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
              Click ROLL DICE to roll your dice.
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
            // Keyed by absolute position in g.log (not the relative slice
            // index) — the log only ever grows, so as it does the window
            // this slice shows shifts and a relative index would silently
            // relabel every earlier line each render.
            <div key={g.log.length - arr.length + i}>· {renderKeywordText(l, true)}</div>
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
      <div className="flex gap-2 px-2 pt-1.5 pb-1 items-start flex-1 min-h-0 overflow-y-auto bg-[var(--c-ink)]/25">
        <LeaderPanel
          g={g}
          p={me}
          isHuman
          abilityWhy={leaderAbilityWhy}
          ultimateWhy={leaderUltimateWhy}
          onAbility={() => tryAbility(me.leader)}
          onUltimate={tryUltimate}
          highlight={
            (!!pending && isPendingTarget(me.leader.iid)) ||
            (!!rallyPick && isRallySource(me.leader.iid))
          }
          floats={floatsFor(me.leader.iid)}
          onClickTarget={
            pending && isPendingTarget(me.leader.iid)
              ? () => resolvePendingOn(me.leader.iid)
              : rallyPick && isRallySource(me.leader.iid)
                ? () => resolveRallySource(me.leader.iid)
                : undefined
          }
        />
        {me.location ? (
          <LocationPanel
            g={g}
            loc={me.location}
            onAbility={() => tryAbility(me.location!)}
            abilityWhy={locationAbilityWhy}
            isRallySource={!!rallyPick && isRallySource(me.location.iid)}
            onRallyClick={() => resolveRallySource(me.location!.iid)}
            onInspect={() => setInspect(me.location!.def)}
            floats={floatsFor(me.location.iid)}
          />
        ) : (
          <div className="w-[100px] shrink-0 h-[196px] text-[8px] font-bold text-[var(--c-paper)]/30 ink-border-sm border-dashed p-1 flex items-center justify-center text-center">
            no Location
            <br />
            (cast one free each turn)
          </div>
        )}
        {me.staging.length > 0 && (
          <div className="w-[150px] shrink-0">
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
                    role="button"
                    tabIndex={0}
                    aria-label={`Inspect ${s.def.name}`}
                    className="text-[8px] font-bold text-[var(--c-paper)] truncate cursor-pointer"
                    onClick={() => setInspect(s.def)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setInspect(s.def);
                      }
                    }}
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
                      setConfirmDialog({
                        text: `Abandon ${s.def.name} and return it to hand?`,
                        onConfirm: () => {
                          abandonTwin(g, s.iid);
                          bump();
                        },
                      });
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

        <div className="flex-1 min-w-0">
          <div className="flex gap-1 items-start overflow-x-auto pb-1 min-h-[70px]">
            {me.board.length === 0 && (
              <div className="w-full h-[64px] border-2 border-dashed border-[var(--c-paper)]/15 rounded-md flex items-center justify-center">
                <span className="text-[9px] text-[var(--c-paper)]/30 font-bold uppercase tracking-wide">
                  Empty Board
                </span>
              </div>
            )}
            {me.board.map((u) => {
              const canAtt = stage === 'combat' && canAttack(g, u);
              const targetable = !!pending && isPendingTarget(u.iid);
              const isSource = !!rallyPick && isRallySource(u.iid);
              const rallyReady =
                stage === 'placement' &&
                u.def.ability &&
                !u.abilityUsed &&
                !u.hasAttacked &&
                !u.boundThisTurn &&
                !(u.enteredThisTurn && !hasKw(u.def, 'Swift')) &&
                hasKw(u.def, 'Rally');
              return (
                <div key={u.iid} className="flex flex-col items-center gap-0.5 shrink-0 w-[78px]">
                  <BoardUnit
                    g={g}
                    u={u}
                    isAttacker={attacker === u.iid}
                    highlight={targetable || isSource || (canAtt && attacker !== u.iid)}
                    flash={attackFx?.attacker === u.iid || attackFx?.target === u.iid}
                    floats={floatsFor(u.iid)}
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
                  {u.def.ability && (
                    <AbilityPill
                      label={`BASE ABILITY ${effAbilityThreshold(g, u)}+${
                        effAbilityThreshold(g, u) !== u.def.ability.threshold
                          ? ` (was ${u.def.ability.threshold}+)`
                          : ''
                      }:`}
                      desc={describeEffect(u.def.ability.effect)}
                      usable={!unitAbilityWhy(u)}
                      used={u.abilityUsed}
                      why={unitAbilityWhy(u)}
                      onClick={() => tryAbility(u)}
                    />
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
        </div>
      </div>

      {/* Hand dock — compact cards along the very bottom; hover/click a card
          to open the enlarged preview above it and CAST from the preview. */}
      <div
        className="relative shrink-0 z-30 bg-[var(--c-ink)]/85 border-t-2 border-[var(--c-yellow)]/50"
        onMouseLeave={() => {
          clearHoverIntent();
          if (!previewPinned) setPreview(null);
        }}
      >
        {previewCard && previewInfo && (
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
                <CardFace
                  def={previewCard.def}
                  size="full"
                  introduceKeywords
                  effectiveThreshold={
                    previewCard.def.threshold !== undefined
                      ? effThreshold(g, HUMAN, previewCard.def)
                      : undefined
                  }
                />
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
                onClick={() => castFromPreview(previewCard)}
                disabled={!previewCastable}
                className={cn(
                  'heading-font text-sm px-3 py-2 ink-border-md shadow-hard-black-xs',
                  previewCastable
                    ? 'btn-pop bg-[var(--c-yellow)] text-[var(--c-ink)]'
                    : 'bg-[var(--c-steel)]/50 text-[var(--c-paper)]/40 cursor-not-allowed',
                )}
              >
                {previewCard.def.type === 'Location'
                  ? 'CAST — FREE'
                  : previewInfo.isSum
                    ? 'CAST — PICK DICE'
                    : 'CAST'}
              </button>
              {!previewInfo.chk.ok && previewInfo.chk.why !== 'Select a die' && (
                <span className="text-[9px] font-bold text-[var(--c-red)] leading-tight">
                  {previewInfo.chk.why}
                </span>
              )}
              {!previewInfo.chk.ok &&
                previewInfo.chk.why === 'Select a die' &&
                previewInfo.auto === null && (
                  <span className="text-[9px] font-bold text-[var(--c-red)] leading-tight">
                    No unplaced die pays this cost.
                  </span>
                )}
              {!previewInfo.chk.ok &&
                previewInfo.chk.why === 'Select a die' &&
                previewInfo.auto !== null && (
                  <span className="text-[9px] font-bold text-[var(--c-yellow)]/90 leading-tight">
                    Will spend a die showing {me.dice[previewInfo.auto].value}.
                  </span>
                )}
              {previewInfo.chk.ok &&
                selDie !== null &&
                !previewInfo.isSum &&
                previewCard.def.type !== 'Location' && (
                  <span className="text-[9px] font-bold text-[var(--c-yellow)]/90 leading-tight">
                    Will spend the selected die ({dieVal}).
                  </span>
                )}
              {previewInfo.isSum && (
                <span className="text-[9px] font-bold text-[var(--c-paper)]/70 leading-tight">
                  Sum cost: after CAST, click dice in the tray until they total{' '}
                  {effThreshold(g, HUMAN, previewCard.def)}+, then confirm.
                </span>
              )}
              {previewInfo.canScrapNow && (
                <button
                  onClick={() => {
                    tryScrap(previewCard);
                    closePreview();
                  }}
                  className="btn-pop text-[9px] font-bold bg-[var(--c-red)] text-white px-2 py-1 ink-border-sm"
                >
                  SCRAP → reroll die {dieVal}
                </button>
              )}
              {hasKw(previewCard.def, 'Scrap') && !previewInfo.canScrapNow && (
                <span className="text-[8px] font-bold text-[var(--c-paper)]/50 leading-tight">
                  Scrap: select a die during Placement, then reopen this card.
                </span>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 px-2 pt-1">
          <span className="text-[8px] font-bold text-[var(--c-paper)]/70">
            HAND {me.hand.length}/{HAND_LIMIT}
            {echoPick ? ' — pick a card to DISCARD for Echo' : ' · tap or hover a card to preview'}
          </span>
        </div>
        {/* A real card-fan: each card fanned out on a slight rotation/arc
            around a shared pivot below the dock, overlapping its neighbors,
            and docked low enough that only roughly its top half (art +
            name) shows at rest — mimicking how a fan of physical cards is
            actually held, and freeing up board space above. Hovering (or
            focusing) a card lifts it clear of the fan so its full face and
            the cast preview above are readable. */}
        <div className="relative h-[100px] overflow-hidden" style={{ perspective: 800 }}>
          {me.hand.length === 0 && (
            <span className="absolute inset-x-0 top-6 text-center text-[9px] text-[var(--c-paper)]/30 font-bold">
              — empty hand —
            </span>
          )}
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 flex">
            {me.hand.map((c, i) => {
              const chk = canCastNow(c);
              const canScrapNow = hasKw(c.def, 'Scrap') && stage === 'placement' && selDie !== null;
              // Before a die is selected, judge dimming on "could any of my
              // dice pay for this" rather than the stricter per-die check,
              // which always fails pre-selection with "Select a die".
              const potentiallyCastable = selDie === null ? canCastWithAnyDie(c) : chk.ok;
              const n = me.hand.length;
              const mid = (n - 1) / 2;
              const off = i - mid;
              const angle = Math.max(-22, Math.min(22, off * (n > 8 ? 5 : 7)));
              const arcDrop = Math.abs(off) * 3;
              const isFocused = preview === c.iid;
              const activate = echoPick
                ? () => tryEchoFodder(c)
                : () => {
                    clearHoverIntent();
                    setPreview(c.iid);
                    setPreviewPinned(true);
                  };
              return (
                // v4.19: the pointer hit area is this STATIONARY wrapper —
                // the card visual inside animates (lift/rotate) with
                // pointer-events disabled, so the hover target never moves
                // out from under the cursor mid-transition. That was the
                // root of the finicky hand hover: the lifted card vacated
                // its own hover area, handing the cursor to a neighbor,
                // which lifted in turn — an enter/leave oscillation.
                <div
                  key={c.iid}
                  role="button"
                  tabIndex={0}
                  aria-label={`${c.def.name} — preview and cast`}
                  className="relative shrink-0 outline-none"
                  style={{
                    width: CARD_SIZES.compact.w,
                    height: CARD_SIZES.compact.h,
                    marginLeft: i === 0 ? 0 : -46,
                    zIndex: isFocused ? 50 : i,
                  }}
                  onMouseEnter={() => {
                    if (!echoPick) previewIntent(c.iid);
                  }}
                  onFocus={() => {
                    if (!echoPick) setPreview(c.iid);
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
                      dimmed={!potentiallyCastable && !echoPick && !canScrapNow}
                      highlight={!!echoPick || preview === c.iid}
                      introduceKeywords
                      effectiveThreshold={
                        c.def.threshold !== undefined ? effThreshold(g, HUMAN, c.def) : undefined
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Discard drawer */}
      {showDiscard && (
        <div className="absolute right-2 left-2 sm:left-auto top-16 bottom-24 w-auto sm:w-[260px] max-w-[260px] bg-[var(--c-ink)] ink-border-md z-40 p-2 overflow-y-auto">
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
                            say(`Roll lacks ${GATE_LABEL[c.def.comboGate] || c.def.comboGate}.`);
                            return;
                          }
                        } else {
                          const thr = effThreshold(g, HUMAN, c.def);
                          if (c.def.castCostKind === 'exact') {
                            if (dieVal !== thr) {
                              say(`Needs exactly ${thr} to Echo this.`);
                              return;
                            }
                          } else if (dieVal !== null && dieVal < thr) {
                            say(`Needs ${thr}+ to Echo this.`);
                            return;
                          }
                        }
                        if (needsTarget(c.def.onCast)) {
                          if (targetsFor(g, HUMAN, c.def.onCast!).length === 0) {
                            say('No legal target.');
                            return;
                          }
                          // Capture the die now (selDie is non-null here,
                          // checked above) — otherwise resolvePendingOn falls
                          // back to whatever selDie is when a target is
                          // clicked, which can have changed in between.
                          setPending({
                            kind: 'echo',
                            cardIid: c.iid,
                            effect: c.def.onCast!,
                            dieIndices: [selDie!],
                          });
                          return;
                        }
                        startEchoRecast(c.iid, selDie!);
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
      {inspect && <Card3DInspector def={inspect} onClose={() => setInspect(null)} />}

      {/* In-game confirm dialog — styled replacement for window.confirm (see
          the `confirmDialog` state above). */}
      {confirmDialog && (
        <div className="absolute inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md p-4 max-w-xs w-full text-center">
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

      {/* Forced discard (hand size &gt; 8 at End Phase) — player picks which cards */}
      {forcedDiscard && (
        <div className="absolute inset-0 z-50 bg-[var(--c-ink)]/90 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md p-4 text-center max-w-3xl my-auto">
            <div className="heading-font text-xl mb-1">Discard Down to {HAND_LIMIT}</div>
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
              onClick={() => {
                // v4.8 QoL: fill the selection with the engine's own default
                // discard heuristic (duplicates first, then highest cost) —
                // one click instead of hunting for safe cuts by hand.
                const picks: string[] = [];
                let rest = [...me.hand];
                while (picks.length < forcedDiscard.needed && rest.length > 0) {
                  const pick = defaultDiscardChoice(rest);
                  picks.push(pick.iid);
                  rest = rest.filter((c) => c.iid !== pick.iid);
                }
                setForcedDiscard({ needed: forcedDiscard.needed, picks });
              }}
              className="heading-font text-xs px-4 py-2 mr-2 ink-border-sm shadow-hard-black-xs btn-pop bg-[var(--c-steel)] text-[var(--c-paper)]"
              title="Auto-select the suggested discards (spare duplicates, then the most expensive cards)"
            >
              SUGGEST
            </button>
            <button
              onClick={confirmForcedDiscard}
              disabled={forcedDiscard.picks.length !== forcedDiscard.needed}
              className={cn(
                'heading-font text-xs px-5 py-2 ink-border-sm shadow-hard-black-xs sticky bottom-2',
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

      {/* Mulligan overlay — large readable cards, a clear question, two
          prominent buttons, and a plain-words explainer of what a mulligan
          actually does. */}
      {stage === 'mulligan' && (
        <div className="absolute inset-0 z-50 bg-[var(--c-ink)]/95 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md p-5 text-center max-w-5xl w-full my-auto">
            <div className="heading-font text-3xl mb-1">
              {mulliganUsed ? 'YOUR NEW HAND' : 'KEEP or MULLIGAN?'}
            </div>
            <div className="text-[12px] font-bold text-[var(--c-steel)] mb-1">
              Opening hand — {playerName}
            </div>
            <div className="text-[11px] font-bold text-[var(--c-steel)] max-w-xl mx-auto mb-4 leading-snug">
              {mulliganUsed
                ? 'That was your one mulligan — this hand is yours now. Click any card to zoom in, then KEEP to start.'
                : 'A mulligan shuffles all 7 of these cards back into your deck and draws 7 fresh ones. You get exactly one per game. Click any card to zoom in.'}
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
            {/* Sticky so the actions stay reachable on phones, where 7 stacked
                cards push the bottom of the panel well past the viewport. */}
            <div className="flex gap-4 justify-center flex-wrap sticky bottom-0 bg-[var(--c-paper)] py-2 -mb-2">
              <button
                onClick={afterMulligan}
                className="btn-pop heading-font text-base bg-[var(--c-yellow)] px-8 py-3 ink-border-md shadow-hard-black-xs"
              >
                ✓ KEEP THIS HAND
              </button>
              {!mulliganUsed && (
                <button
                  onClick={doMulligan}
                  className="btn-pop heading-font text-base bg-[var(--c-red)] text-white px-8 py-3 ink-border-md shadow-hard-black-xs"
                >
                  ↻ MULLIGAN — redraw 7
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
