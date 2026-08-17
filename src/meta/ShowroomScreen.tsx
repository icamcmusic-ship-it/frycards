/**
 * The 3D SHOWROOM — its own page, and the only place in the game where a card
 * is an OBJECT rather than a picture.
 *
 * Everything else that enlarges a card is a modal hanging off the grid that
 * opened it: the Collection's `Card3DInspector` tilts ±14° under the pointer
 * and flips on a button, and the moment you look away it is gone. That is a
 * good inspector and a bad showroom. This is the showroom — a page you
 * navigate TO, with a room, a turntable, and the controls in the player's
 * hands:
 *
 *  - **full 360°** on the yaw. Drag past the edge and the card keeps turning:
 *    front, edge, back, edge, front. It has thickness, so there is something
 *    to see at 90°.
 *  - **tilt** to ±80° on the pitch — over the top edge, under the bottom one.
 *  - **zoom** from 0.35× (on the shelf) to 3.2× (reading the rules text),
 *    on the wheel, a pinch, the +/− keys or the HUD buttons.
 *  - **momentum**: a flick spins the turntable and it coasts to a stop.
 *  - **auto-spin** at three speeds, for a hands-off display.
 *
 * And the room reacts to what is standing in it: **Super-Rare and above get
 * their own environment** — ion sweep, gilded hall, aurora vault, prism
 * chamber, ember forge — plus card effects that only those rarities receive
 * (an orbiting ring of motes at the card's own depth, a rim light that tracks
 * the yaw, a floor pool in the room's colour). Common through Rare stand in a
 * plain studio, deliberately: the special rooms mean nothing if everything
 * gets one.
 *
 * Slabs stand here too, in the same room, as the thicker object they are —
 * which is the first time the graded case has been viewable from any angle
 * other than dead-on.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useMeta } from './MetaContext';
import { PopButton } from './ui';
import { POOL_BY_ID, POOL_V4 } from '../game/v3/cardpool';
import { CardDef } from '../game/v3/cards';
import { CardFace, CARD_SIZES } from '../components/CardFaceV4';
import { GradedSlab, SLAB_CSS } from './GradedSlab';
import { GradedCard, GRADING_SERVICE_BY_ID, fetchGradedCards, fmtGrade } from './grading';
import {
  DEFAULT_POSE,
  MAX_ZOOM,
  MIN_ZOOM,
  Pose,
  SHOWROOM_CSS,
  Showroom3D,
  clampPose,
  displayYaw,
  facingSide,
  roomForRarity,
  usePrefersReducedMotion,
} from '../components/Card3DShowroom';
import { RARITY_ORDER, rarityTier } from './rarity';
import { cn } from '../lib/utils';

/** Auto-spin ladder, degrees per second. Named so the HUD can print the name
 * rather than a number nobody can picture. */
const SPIN_STEPS: { label: string; dps: number }[] = [
  { label: 'OFF', dps: 0 },
  { label: 'SLOW', dps: 18 },
  { label: 'MEDIUM', dps: 45 },
  { label: 'FAST', dps: 110 },
];

/** What the showroom can be pointed at. */
export type ShowroomSubject =
  { kind: 'card'; cardId: string; foil?: boolean } | { kind: 'slab'; gradedId: string };

function SlabObject({ g }: { g: GradedCard }) {
  return (
    <div className="origin-center">
      <GradedSlab g={g} size="full" />
    </div>
  );
}

/** Slab geometry, mirroring GradedSlab's own `full` tier maths — the room
 * needs the object's real footprint to build the six-sided solid around it. */
const SLAB_PAD_FULL = 14;
function slabBox(): { w: number; h: number } {
  const face = CARD_SIZES.full;
  // padding ×2 + label block + card + cert strip. Measured against the
  // rendered slab rather than guessed; a few px of slack here only affects
  // where the acrylic edge sits.
  return { w: face.w + SLAB_PAD_FULL * 2, h: face.h + SLAB_PAD_FULL * 2 + 74 };
}

export function ShowroomScreen({
  onBack,
  initial,
}: {
  onBack: () => void;
  /** Deep link from the Collection ("VIEW IN 3D") or the Grading Lab. */
  initial?: ShowroomSubject;
}) {
  const { collection, session, guest } = useMeta();
  const reduced = usePrefersReducedMotion();

  const [subject, setSubject] = useState<ShowroomSubject>(
    () => initial ?? { kind: 'card', cardId: '' },
  );
  const [pose, setPose] = useState<Pose>(DEFAULT_POSE);
  const [spinIdx, setSpinIdx] = useState(0);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'mine' | 'all' | 'slabs'>(
    initial?.kind === 'slab' ? 'slabs' : session ? 'mine' : 'all',
  );
  const [slabs, setSlabs] = useState<GradedCard[]>([]);
  const [slabsLoading, setSlabsLoading] = useState(false);
  const stageWrapRef = useRef<HTMLDivElement>(null);

  // Graded rows live in their own table and are not part of MetaContext's
  // collection payload, so the showroom fetches them the same way the
  // Collection's GRADED CARDS shelf does.
  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    setSlabsLoading(true);
    fetchGradedCards(session.user.id)
      .then((rows) => {
        if (!cancelled) setSlabs(rows.filter((r) => r.grade != null));
      })
      .finally(() => {
        if (!cancelled) setSlabsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const owned = useMemo(
    () => collection.filter((c) => c.quantity > 0 || c.foil_quantity > 0),
    [collection],
  );

  /** The browsable list for the current source, rarest first — the showroom
   * exists to show off, so the cards worth showing off sort to the front. */
  const picks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const defs: { def: CardDef; foil: boolean }[] =
      source === 'mine'
        ? owned
            .map((c) => ({ def: POOL_BY_ID[c.card_id], foil: c.quantity === 0 }))
            .filter((x): x is { def: CardDef; foil: boolean } => !!x.def)
        : POOL_V4.map((def) => ({ def, foil: false }));
    return defs
      .filter((x) => !q || x.def.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          rarityTier(b.def.rarity) - rarityTier(a.def.rarity) ||
          a.def.name.localeCompare(b.def.name),
      );
  }, [source, owned, search]);

  const slabPicks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return slabs.filter((g) => {
      const def = POOL_BY_ID[g.card_id];
      return def && (!q || def.name.toLowerCase().includes(q));
    });
  }, [slabs, search]);

  // Default subject: whatever is first in the list, so the room is never empty
  // on arrival. DERIVED, not an effect that writes state back — an effect here
  // would fight the search box (the list re-sorts under every keystroke, and
  // re-selecting its new head would yank the card out of the room mid-typing).
  const shown: ShowroomSubject =
    subject.kind === 'card' && !subject.cardId && picks.length > 0
      ? { kind: 'card', cardId: picks[0].def.id, foil: picks[0].foil }
      : subject;

  const slab = shown.kind === 'slab' ? slabs.find((g) => g.id === shown.gradedId) : undefined;
  const def: CardDef | undefined =
    shown.kind === 'slab'
      ? slab
        ? POOL_BY_ID[slab.card_id]
        : undefined
      : POOL_BY_ID[shown.cardId];
  const foil = shown.kind === 'slab' ? !!slab?.foil : !!shown.foil;
  const room = roomForRarity(def?.rarity);

  // ---- controls -----------------------------------------------------------
  const nudge = useCallback((d: Partial<Pose>) => {
    setPose((p) =>
      clampPose({
        yaw: p.yaw + (d.yaw ?? 0),
        pitch: p.pitch + (d.pitch ?? 0),
        zoom: p.zoom * (d.zoom ?? 1),
      }),
    );
  }, []);
  const reset = useCallback(() => {
    setPose(DEFAULT_POSE);
    setSpinIdx(0);
  }, []);
  const flip = useCallback(() => setPose((p) => clampPose({ ...p, yaw: p.yaw + 180 })), []);

  // Keyboard: the whole point of "full motion control" is that it does not
  // require a mouse. Ignored while a text input has focus, so typing "r" into
  // the search box does not reset the camera.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const step = e.shiftKey ? 30 : 8;
      switch (e.key) {
        case 'ArrowLeft':
          nudge({ yaw: -step });
          break;
        case 'ArrowRight':
          nudge({ yaw: step });
          break;
        case 'ArrowUp':
          nudge({ pitch: step });
          break;
        case 'ArrowDown':
          nudge({ pitch: -step });
          break;
        case '+':
        case '=':
          nudge({ zoom: 1.15 });
          break;
        case '-':
        case '_':
          nudge({ zoom: 1 / 1.15 });
          break;
        case 'r':
        case 'R':
          reset();
          break;
        case 'f':
        case 'F':
          flip();
          break;
        case ' ':
          setSpinIdx((i) => (i === 0 ? 2 : 0));
          break;
        case 'Escape':
          onBack();
          return;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nudge, reset, flip, onBack]);

  const side = facingSide(pose.yaw);
  const spin = SPIN_STEPS[spinIdx];

  const fullscreen = () => {
    const el = stageWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    // Some browsers (and every sandboxed iframe) reject this; a rejected
    // promise here must not surface as an unhandled rejection.
    else el.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="w-full min-h-screen bg-[var(--c-ink)] text-[var(--c-paper)] flex flex-col">
      <style>{SHOWROOM_CSS + SLAB_CSS}</style>

      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 bg-[var(--c-ink)] px-4 py-2.5 border-b-4 border-[var(--c-yellow)]">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        <h1 className="heading-font text-xl text-[var(--c-yellow)] flex items-center gap-2">
          <Box className="w-5 h-5" aria-hidden /> 3D SHOWROOM
        </h1>
        <span className="text-[10px] font-bold text-[var(--c-paper)]/60 hidden sm:inline">
          Drag to turn · wheel or pinch to zoom · arrows tilt · F flips · R resets · SPACE spins
        </span>
      </div>

      {/* Stage */}
      <div ref={stageWrapRef} className="relative bg-black">
        {def ? (
          <Showroom3D
            def={def}
            foil={foil}
            pose={pose}
            onPose={setPose}
            spinSpeed={spin.dps}
            scaleHint={shown.kind === 'slab' ? 1.35 : 1}
            className="w-full h-[52vh] min-h-[320px] sm:h-[62vh]"
            slab={
              slab
                ? {
                    node: <SlabObject g={slab} />,
                    ...slabBox(),
                    edge: GRADING_SERVICE_BY_ID[slab.service].slab.frame,
                  }
                : undefined
            }
          />
        ) : (
          <div className="w-full h-[52vh] min-h-[320px] sm:h-[62vh] flex items-center justify-center text-center px-6">
            <p className="font-bold text-sm text-[var(--c-paper)]/70">
              {source === 'slabs'
                ? slabsLoading
                  ? 'Loading your slabs…'
                  : 'No graded slabs yet — get a card graded in the Grading Lab and it will stand here.'
                : 'Pick a card below to stand it in the room.'}
            </p>
          </div>
        )}

        {/* Readout — the camera's actual numbers, so a player who wants a
            specific angle can find it again. */}
        {def && (
          <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
            <div className="bg-[var(--c-ink)]/80 ink-border-sm px-2 py-1">
              <div className="heading-font text-[11px] text-[var(--c-yellow)] leading-none">
                {room.label}
                {room.premium && <span className="text-[var(--c-paper)]/70"> · SUPER-RARE+</span>}
              </div>
              <div className="font-mono text-[10px] text-[var(--c-paper)]/80 mt-0.5">
                YAW {displayYaw(pose.yaw)}° · TILT {Math.round(pose.pitch)}° ·{' '}
                {pose.zoom.toFixed(2)}×
              </div>
            </div>
            <div
              className="bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-[10px] px-2 py-0.5 self-start"
              role="status"
              aria-live="polite"
            >
              {side === 'edge' ? 'EDGE ON' : side === 'back' ? 'BACK' : 'FRONT'}
            </div>
          </div>
        )}

        {/* HUD */}
        {/* One row, always. Wrapping put three rows of controls across the
            bottom third of a 390px stage and straight over the object; a
            single row that scrolls sideways costs one gesture and never eats
            the room. */}
        <div className="absolute bottom-2 inset-x-0 flex justify-start sm:justify-center gap-1.5 px-2 overflow-x-auto">
          <HudButton onClick={() => nudge({ yaw: -30 })} label="Turn left">
            <RotateCcw className="w-4 h-4" aria-hidden />
          </HudButton>
          <HudButton onClick={() => nudge({ yaw: 30 })} label="Turn right">
            <RotateCw className="w-4 h-4" aria-hidden />
          </HudButton>
          <HudButton
            onClick={() => nudge({ zoom: 1 / 1.2 })}
            label="Zoom out"
            disabled={pose.zoom <= MIN_ZOOM + 1e-6}
          >
            <ZoomOut className="w-4 h-4" aria-hidden />
          </HudButton>
          <HudButton
            onClick={() => nudge({ zoom: 1.2 })}
            label="Zoom in"
            disabled={pose.zoom >= MAX_ZOOM - 1e-6}
          >
            <ZoomIn className="w-4 h-4" aria-hidden />
          </HudButton>
          <HudButton onClick={flip} label="Flip to the other side" wide>
            FLIP (F)
          </HudButton>
          <HudButton
            onClick={() => setSpinIdx((i) => (i + 1) % SPIN_STEPS.length)}
            label={`Auto-spin: ${spin.label}`}
            wide
            active={spin.dps > 0}
            // A player who asked for reduced motion still gets the button —
            // pressing it is an explicit request — but it must not be the
            // thing that starts moving on its own, so the stage zeroes the
            // speed and this says so.
            disabled={reduced}
          >
            {spin.dps > 0 ? (
              <Pause className="w-4 h-4" aria-hidden />
            ) : (
              <Play className="w-4 h-4" aria-hidden />
            )}
            <span className="ml-1">{reduced ? 'SPIN OFF' : `SPIN ${spin.label}`}</span>
          </HudButton>
          <HudButton onClick={reset} label="Reset the camera" wide>
            RESET (R)
          </HudButton>
          <HudButton onClick={fullscreen} label="Fullscreen">
            <Maximize2 className="w-4 h-4" aria-hidden />
          </HudButton>
        </div>
      </div>

      {/* Subject picker */}
      <div className="flex-1 bg-[var(--c-paper)] text-[var(--c-ink)] p-4">
        <div className="max-w-6xl mx-auto flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { k: 'mine', label: 'MY CARDS' },
                { k: 'slabs', label: `MY SLABS${slabs.length ? ` (${slabs.length})` : ''}` },
                { k: 'all', label: 'EVERY CARD' },
              ] as const
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setSource(t.k)}
                aria-pressed={source === t.k}
                disabled={guest && t.k !== 'all'}
                className={cn(
                  'btn-pop heading-font text-[11px] px-3 py-1.5 ink-border-sm shadow-hard-black-xs disabled:opacity-40',
                  source === t.k
                    ? 'bg-[var(--c-ink)] text-[var(--c-yellow)]'
                    : 'bg-[var(--c-paper)] text-[var(--c-ink)]',
                )}
              >
                {t.label}
              </button>
            ))}
            <label className="flex items-center gap-1 ml-auto ink-border-sm bg-white px-2 py-1">
              <Search className="w-3.5 h-3.5 text-[var(--c-steel)]" aria-hidden />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cards…"
                aria-label="Search cards"
                className="text-[11px] font-bold outline-none w-40 bg-transparent"
              />
            </label>
          </div>

          {source === 'slabs' ? (
            slabPicks.length === 0 ? (
              <p className="text-[11px] font-bold text-[var(--c-steel)] py-6">
                {slabsLoading
                  ? 'Loading your slabs…'
                  : 'No graded slabs to show. The Grading Lab turns a spare copy into one.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {slabPicks.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setSubject({ kind: 'slab', gradedId: g.id });
                      setPose(DEFAULT_POSE);
                    }}
                    aria-pressed={shown.kind === 'slab' && shown.gradedId === g.id}
                    className={cn(
                      'btn-pop ink-border-sm shadow-hard-black-xs bg-[var(--c-ink)] text-[var(--c-paper)] p-2 text-left w-40',
                      shown.kind === 'slab' &&
                        shown.gradedId === g.id &&
                        'ring-4 ring-[var(--c-yellow)]',
                    )}
                  >
                    <div className="heading-font text-[11px] truncate">
                      {POOL_BY_ID[g.card_id]?.name ?? g.card_id}
                    </div>
                    <div className="text-[10px] font-bold text-[var(--c-paper)]/70">
                      {GRADING_SERVICE_BY_ID[g.service].short} · {fmtGrade(g.grade!)}
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : picks.length === 0 ? (
            <p className="text-[11px] font-bold text-[var(--c-steel)] py-6">
              {source === 'mine'
                ? 'No cards here yet — crack a pack in the Store and they will stand in this room.'
                : 'No cards match that search.'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-[38vh] overflow-y-auto pr-1">
              {picks.slice(0, 200).map((p) => {
                const active =
                  shown.kind === 'card' && shown.cardId === p.def.id && !!shown.foil === p.foil;
                const pick = () => {
                  setSubject({ kind: 'card', cardId: p.def.id, foil: p.foil });
                  setPose(DEFAULT_POSE);
                };
                return (
                  // A <div role="button">, never a <button>: CardFace prints
                  // its cost pips and keyword chips as real buttons at every
                  // tier, and a button inside a button is invalid HTML that
                  // breaks keyboard and screen-reader navigation. This is the
                  // same finding the v26 audit made against the slab, caught
                  // here by the harness entry added with the screen — 174
                  // console errors on the first run of the new page.
                  <div
                    key={`${p.def.id}${p.foil ? '-f' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={pick}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pick();
                      }
                    }}
                    aria-pressed={active}
                    aria-label={`Show ${p.def.name}${p.foil ? ' foil' : ''} in the 3D showroom`}
                    className={cn(
                      'btn-pop shrink-0 rounded-[4px] cursor-pointer',
                      active && 'ring-4 ring-[var(--c-yellow)]',
                    )}
                  >
                    <CardFace def={p.def} size="micro" foil={p.foil} />
                  </div>
                );
              })}
              {picks.length > 200 && (
                <p className="w-full text-[10px] font-bold text-[var(--c-steel)] pt-2">
                  Showing the 200 rarest matches of {picks.length}. Narrow it with the search box.
                </p>
              )}
            </div>
          )}

          {def && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] font-bold border-t-2 border-[var(--c-ink)]/20 pt-2">
              <span className="heading-font text-sm">{def.name}</span>
              <span>
                <span className="text-[var(--c-steel)]">RARITY</span> {def.rarity || 'Common'}
              </span>
              <span>
                <span className="text-[var(--c-steel)]">ROOM</span> {room.label}
              </span>
              {slab && (
                <span>
                  <span className="text-[var(--c-steel)]">GRADE</span> {fmtGrade(slab.grade!)} ·{' '}
                  {GRADING_SERVICE_BY_ID[slab.service].name}
                </span>
              )}
              {!room.premium && (
                <span className="text-[var(--c-steel)]">
                  {RARITY_ORDER.slice(rarityTier('Super-Rare')).join(' / ')} each get their own room
                  and effects.
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HudButton({
  children,
  onClick,
  label,
  wide,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  wide?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'btn-pop heading-font text-[10px] flex items-center justify-center ink-border-sm shadow-hard-black-xs min-h-9 disabled:opacity-40 disabled:cursor-not-allowed',
        wide ? 'px-2.5' : 'w-9',
        active
          ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
          : 'bg-[var(--c-paper)] text-[var(--c-ink)]',
      )}
    >
      {children}
    </button>
  );
}
