/**
 * The one card sheet for a card in your hand (and your Leader's abilities).
 *
 * Tapping a hand card used to open the cast dialog AND, from the card face
 * inside it, the 3D inspector — two modals stacked, the inspector (z-50)
 * BEHIND the cast dialog (z-60), each with its own backdrop, Escape handler
 * and focus trap. A card the rules would not let you cast opened only the
 * inspector, so the same tap did two different things depending on state
 * the player could not see.
 *
 * Now every tap opens this sheet, and nothing else: the enlarged card (tilt
 * and holo, like the inspector), its complete rules, and the cast controls —
 * targets, second costs, CAST and CAST AS FEINT, CLOSE — with the reason a
 * cast is unavailable printed under the button rather than hidden. The cast
 * logic is the old dialog's, unchanged: the same checks and the same action.
 *
 * Phone: a bottom sheet, card above the buttons, its own scroll that never
 * chains to the table (`overscroll-contain`), and a card that lets a vertical
 * drag scroll the sheet (`pan-y`) instead of fighting it for the tilt.
 * Desktop: a centred modal, card left, controls right. Either way: focus is
 * trapped inside, Escape closes, and every control is at least 44px tall.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import type { CardDef } from '../game/poker/cards';
import { hasKw } from '../game/poker/cards';
import { MAX_EXCLUSIONS } from '../game/poker/constants';
import {
  canCast,
  canUseLeader,
  castCost,
  castTargets,
  effectiveEffect,
  excludableCategories,
  leaderPseudoDef,
  legalTargets,
  needsOpponentTarget,
  type Action,
  type ExtraCost,
  type Match,
} from '../game/poker/engine';
import { CATEGORY_NAMES, cardLabel } from '../game/poker/evaluator';
import { KEYWORD_SPECS, keywordLabel } from '../game/poker/keywords';
import { useReducedMotion } from '../meta/useMotionMode';
import { cn } from '../lib/utils';
import { CardFace, CardReadingPanel } from './CardFaceV4';
import { CARD_SIZES } from './cardSizes';
import { HoloLayer, tierForRarity } from './holo/HoloLayer';
import { useHoloTilt } from './holo/useHoloTilt';
import { useEscapeClose, useFocusTrap } from './useFocusTrap';

export interface CastFlow {
  uid?: string;
  leader?: number;
}

/** 44px tap targets (WCAG 2.5.5) on every control in the sheet. */
const TAP = 'min-h-[44px]';

export function CastSheet({
  view,
  seat,
  flow,
  secondsLeft,
  narrow,
  amt,
  onClose,
  onCast,
}: {
  /** The human's redacted view. */
  view: Match;
  /** The human's seat. */
  seat: number;
  flow: CastFlow;
  /** The decision's remaining time (the clock keeps running, A4). */
  secondsLeft: number | null;
  narrow: boolean;
  amt: (chips: number) => string;
  onClose: () => void;
  onCast: (a: Action) => boolean;
}) {
  const [refused, setRefused] = useState(false);
  const [target, setTarget] = useState<number | null>(null);
  const [targetCast, setTargetCast] = useState<number | null>(null);
  const [costs, setCosts] = useState<ExtraCost[]>([]);
  // The shared Escape stack: only the topmost dialog closes (A23).
  useEscapeClose(onClose);
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const reduced = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  useHoloTilt(cardRef, { maxTilt: 10, reduced, orientation: true });

  const h = view.hand;
  const me = view.seats[seat];
  const inst = flow.uid ? (me.hand.find((p) => p.uid === flow.uid) ?? null) : null;
  const leaderIdx = flow.leader;
  const isLeader = leaderIdx !== undefined;
  const def: CardDef | null = inst
    ? inst.def
    : isLeader && me.leader.abilities?.[leaderIdx]
      ? leaderPseudoDef(me.leader, leaderIdx)
      : null;
  // The card left your hand while the sheet was open (shed, discarded,
  // stolen): close, rather than leave an invisible dialog holding the table's
  // hotkeys and pausing your clock.
  const gone = !def || !h;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);

  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const { w: cw, h: ch } = CARD_SIZES.full;
  const scale = useMemo(
    () =>
      narrow
        ? Math.max(0.55, Math.min(1.1, (vp.h * 0.4) / ch, (vp.w * 0.7) / cw))
        : Math.max(0.6, Math.min(1.35, (vp.h * 0.72) / ch)),
    [narrow, vp, cw, ch],
  );

  if (gone) return null;
  const shown = isLeader ? me.leader : def;
  const check = isLeader ? canUseLeader(view, seat, leaderIdx) : canCast(view, seat, inst!.uid);
  const cost = isLeader ? null : castCost(view, seat, def);
  const eff = effectiveEffect(h, def);
  const needsTarget = isLeader
    ? KEYWORD_SPECS[def.effect!.kw].target === 'opponent'
    : needsOpponentTarget(h, def);
  const targets = needsTarget ? legalTargets(view, seat, def) : [];
  const castOpts =
    !isLeader && (eff?.kw === 'Call Out' || eff?.kw === 'Snuff')
      ? castTargets(view, seat, def)
      : [];
  const extraNeeded = cost?.extra ?? 0;
  const shedOpts = me.hand.filter((p) => p.uid !== inst?.uid);
  const debuffOpts = h.holes[seat]
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !c.blinded && c.r !== 0);
  const exclOpts = extraNeeded > 0 ? excludableCategories(view, seat) : [];
  const exclRoom = MAX_EXCLUSIONS - h.exclusions[seat].length;
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
  const missing = !check.ok
    ? check.why
    : needsTarget && target === null
      ? targets.length
        ? 'Pick a target'
        : 'No legal target (one hostile power per seat per street)'
      : castOpts.length > 1 && targetCast === null
        ? 'Pick which cast to answer'
        : costs.length !== extraNeeded
          ? `Pick ${extraNeeded - costs.length} more second cost${extraNeeded - costs.length > 1 ? 's' : ''}`
          : null;
  const ready = !missing;
  const submit = (feint: boolean) => {
    setRefused(false);
    let ok: boolean;
    if (isLeader) ok = onCast({ type: 'leader', seat, ability: leaderIdx, target });
    else
      ok = onCast({
        type: 'cast',
        seat,
        uid: inst!.uid,
        target,
        targetCast: targetCast ?? castOpts[castOpts.length - 1]?.id ?? null,
        costs,
        feint,
      });
    // A10: a hidden (veiled) seat can make a pick illegal after all.
    if (!ok) {
      setRefused(true);
      setTarget(null);
    }
  };
  const costLine = isLeader
    ? me.leader.abilities![leaderIdx].text
    : `Costs ${amt(cost!.chips)}${cost!.gambitOwed ? ` now (Gambit: owe ${amt(cost!.gambitOwed * 2)} if you lose)` : ''}${extraNeeded ? ` + ${extraNeeded} second cost${extraNeeded > 1 ? 's' : ''}` : ''}. The cast is public — everyone sees this card${needsTarget ? ' and its target' : ''}.`;
  const feintable = !isLeader && hasKw(def, 'Feint');
  const whyId = 'cast-sheet-why';
  const name = isLeader ? `${me.leader.name} — Leader` : def.name;

  const card = (
    <div style={{ perspective: 1000 }} className="shrink-0 mx-auto">
      <div
        ref={cardRef}
        data-testid="cast-sheet-card"
        // A long-press / right-click is not a second way in to anything.
        onContextMenu={(e) => e.preventDefault()}
        style={{
          width: cw * scale,
          height: ch * scale,
          // A phone's vertical drag scrolls the sheet; the tilt follows the
          // device instead. A mouse can have the drag (A: no scroll-jank).
          touchAction: narrow ? 'pan-y' : 'none',
          transformStyle: 'preserve-3d',
          transform: reduced ? undefined : 'rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))',
        }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <div
            className="relative overflow-hidden rounded-[4px] premium-boost"
            style={{ width: cw }}
          >
            <CardFace def={shown} size="full" foilEffect={false} />
            <HoloLayer tier={tierForRarity(shown.rarity)} colour={shown.colors?.[0]} />
          </div>
        </div>
      </div>
    </div>
  );

  const controls = (
    <div className="flex flex-col gap-2 min-w-0">
      {eff && (
        <p className="text-sm font-bold">
          {keywordLabel(eff.kw, eff.n)}
          {def.effect?.kw === 'Mimic' && ' (copied from the last cast)'}
        </p>
      )}
      <p className="text-xs">{costLine}</p>
      {needsTarget && targets.length > 0 && (
        <OptionGroup label="TARGET">
          {targets.map((t) => (
            <Option key={t} on={target === t} onClick={() => setTarget(t)}>
              {view.seats[t].name} {amt(view.seats[t].stack)}
            </Option>
          ))}
        </OptionGroup>
      )}
      {refused && (
        <p className="text-xs font-bold text-[var(--c-red)]" role="alert">
          No legal target — that pick was refused. Choose another.
        </p>
      )}
      {castOpts.length > 1 && (
        <OptionGroup label="WHICH CAST">
          {castOpts.map((c) => (
            <Option key={c.id} on={targetCast === c.id} onClick={() => setTargetCast(c.id)}>
              {view.seats[c.seat].name}: {c.def.name}
            </Option>
          ))}
        </OptionGroup>
      )}
      {extraNeeded > 0 && (
        <OptionGroup label={`SECOND COST — pick ${extraNeeded} (${costs.length}/${extraNeeded})`}>
          {shedOpts.map((p) => (
            <Option
              key={p.uid}
              on={has({ kind: 'shed', uid: p.uid })}
              onClick={() => toggle({ kind: 'shed', uid: p.uid })}
            >
              Shed {p.def.name}
            </Option>
          ))}
          {debuffOpts.map(({ c, i }) => (
            <Option
              key={`d${i}`}
              on={has({ kind: 'debuff', hole: i })}
              onClick={() => toggle({ kind: 'debuff', hole: i })}
            >
              Blind your {cardLabel(c)} this street
            </Option>
          ))}
          {exclOpts.map((cat) => (
            <Option
              key={`x${cat}`}
              on={has({ kind: 'exclude', category: cat })}
              onClick={() => toggle({ kind: 'exclude', category: cat })}
            >
              Exclude {CATEGORY_NAMES[cat]}
            </Option>
          ))}
        </OptionGroup>
      )}
      <div className="flex flex-col gap-1.5 mt-1">
        <button
          type="button"
          disabled={!ready}
          aria-describedby={missing ? whyId : undefined}
          onClick={() => submit(false)}
          className={cn(
            'btn-pop heading-font text-base px-4 py-2 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-md shadow-hard-black-xs disabled:opacity-40 disabled:cursor-not-allowed',
            TAP,
          )}
        >
          {isLeader ? 'USE LEADER' : `CAST — ${amt(cost!.chips)}`}
          {extraNeeded > 0 && ` + ${extraNeeded}`} <ChevronRight className="inline w-4 h-4" />
        </button>
        {feintable && (
          <button
            type="button"
            disabled={!ready}
            aria-describedby={missing ? whyId : undefined}
            onClick={() => submit(true)}
            title="Pay and show the card, but secretly let it fizzle — only a Call Out can tell"
            className={cn(
              'btn-pop heading-font text-sm px-4 py-2 bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm disabled:opacity-40 disabled:cursor-not-allowed',
              TAP,
            )}
          >
            CAST AS FEINT — secretly fizzles
          </button>
        )}
        {missing && (
          <p id={whyId} className="text-xs font-bold text-[var(--c-red)]" data-testid="cast-why">
            {missing}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className={cn(
            'btn-pop heading-font text-sm px-4 py-2 bg-[var(--c-ink)] text-[var(--c-yellow)] ink-border-sm',
            TAP,
          )}
        >
          CLOSE{narrow ? '' : ' (ESC)'}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        'fixed inset-0 z-[60] bg-black/70 flex justify-center',
        narrow ? 'items-end' : 'items-center p-4',
      )}
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Cast ${def.name}`}
        data-testid="cast-sheet"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-black outline-none overflow-y-auto overscroll-contain',
          narrow
            ? 'w-full max-h-[94dvh] rounded-t-xl px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-3'
            : 'max-w-3xl w-full max-h-[92vh] p-4 flex flex-row gap-5',
        )}
      >
        {narrow ? (
          <>
            <SheetHeader name={name} secondsLeft={secondsLeft} onClose={onClose} />
            {card}
            {controls}
            <div className="[&>section]:w-full">
              <CardReadingPanel def={shown} />
            </div>
          </>
        ) : (
          <>
            {card}
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              <SheetHeader name={name} secondsLeft={secondsLeft} onClose={onClose} />
              {controls}
              <div className="[&>section]:w-full">
                <CardReadingPanel def={shown} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SheetHeader({
  name,
  secondsLeft,
  onClose,
}: {
  name: string;
  secondsLeft: number | null;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <h3 className="heading-font text-lg leading-tight pt-2">{name}</h3>
      <span className="flex items-center gap-1 shrink-0">
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-11 h-11 flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>
      </span>
    </div>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div className="fs-xs font-black mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Option({
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
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'btn-pop text-xs font-bold px-2 py-1 ink-border-sm',
        TAP,
        on ? 'bg-[var(--c-yellow)]' : 'bg-white',
      )}
    >
      {children}
    </button>
  );
}
