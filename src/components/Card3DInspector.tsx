/**
 * Full-screen 3D card inspector — the "hold the card in your hand" view.
 * Renders an enlarged CardFace that tilts in 3D following the pointer
 * (perspective + rotateX/rotateY), with a dynamic glare highlight that
 * tracks the tilt and, for foil copies, a holographic rainbow sheen.
 * Supports flipping to the equipped card back, shows card metadata, and
 * hosts context-specific actions (e.g. quicksell) passed in by the
 * caller. Escape or clicking outside closes. Respects
 * prefers-reduced-motion by rendering a static enlarged card instead.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from '../meta/useMotionMode';
import { CardDef } from '../game/poker/cards';
import { CardFace, CardReadingPanel, CARD_SIZES } from './CardFaceV4';
import type { CardVariant } from '../meta/variants';
import { getCardBackImage } from '../meta/cardback';
import { useIsNarrow } from '../lib/useIsNarrow';
import { cn } from '../lib/utils';
import { useFocusTrap, useEscapeClose } from './useFocusTrap';
import { HoloLayer, tierForRarity } from './holo/HoloLayer';
import { useHoloTilt } from './holo/useHoloTilt';
import { useTiltPermission } from './holo/useTiltPermission';

const MAX_TILT_DEG = 14;

/** v4.19: the ONE canonical expanded-card scale, shared by every enlarged
 * presentation — this inspector (collection click-expand, board click-expand
 * in GameV4) and the in-match hand hover preview (GameV4's
 * HOVER_PREVIEW_SCALE re-exports this) — so an expanded card is the same
 * size no matter where it was opened from. Viewport-clamped below so it
 * still fits small screens. */
export const INSPECT_SCALE = 1.55;

const usePrefersReducedMotion = useReducedMotion;

export function Card3DInspector({
  def,
  foil,
  canToggleFoil,
  onFoilToggle,
  serial,
  variant,
  meta,
  actions,
  onClose,
}: {
  /** Cosmetic variant overlay on the enlarged card (Smash Cut gets 3D depth). */
  variant?: CardVariant | null;
  def: CardDef;
  /** Show the foil treatment on the enlarged card. */
  foil?: boolean;
  /** When the player owns both normal and foil copies, show a variant toggle. */
  canToggleFoil?: boolean;
  /** Fired when ✦ VIEW FOIL / VIEW NORMAL flips the variant on display, so a
   * caller whose side panels describe the variant (Collection's market value)
   * can follow — without this the toggle changed only the picture while the
   * numbers beside it kept describing the tile that was clicked. */
  onFoilToggle?: (showFoil: boolean) => void;
  /** This exact numbered print — mutually exclusive with foil (serialized
   * copies are never foil, see quicksell_cards' serialized-reserved check),
   * so passing this suppresses the foil toggle entirely. */
  serial?: { number: number; cap: number };
  /** Metadata rows shown beside the card (rarity, set, owned counts, …). */
  meta?: { label: string; value: React.ReactNode }[];
  /** Context-specific controls (e.g. a quicksell panel). */
  actions?: React.ReactNode;
  onClose: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [showFoil, setShowFoil] = useState(!!foil && !serial);
  const [flipped, setFlipped] = useState(false);
  // Tilt: useHoloTilt springs pointer / device orientation into CSS vars on
  // the card (--rx/--ry/--mx/…) from a rAF loop — no React render per move.
  // Reduced motion (OS or in-app) gets a static, readable pose.
  const cardRef = useRef<HTMLDivElement>(null);
  const tiltPerm = useTiltPermission();
  useHoloTilt(cardRef, {
    maxTilt: MAX_TILT_DEG,
    reduced: reducedMotion,
    orientation: tiltPerm.orientation,
  });

  useEscapeClose(onClose);

  // v4.24 moved focus into the dialog on open and restored it to the trigger
  // on close, with a comment saying that stopped a keyboard user Tabbing
  // through to the background elements still sitting behind the overlay.
  // v30 measured that claim and it was false in every browser — see
  // `useFocusTrap`, which does hold the keyboard here.
  const dialogRef = useFocusTrap<HTMLDivElement>();

  // Enlarged size: ~2x the normal full card, clamped so the whole card (plus
  // some room for the side panels) always fits on screen. Recomputed on
  // resize/orientation change so rotating a phone mid-inspect doesn't leave
  // the card mis-sized or clipped.
  const [viewport, setViewport] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  // On a phone the meta/actions column stacks BELOW the card (flex-col), so
  // the card gets a smaller share of the viewport height — otherwise the
  // card alone fills the screen and the quicksell/metadata panels are only
  // reachable by scrolling past a card that overflows the fold.
  const narrow = useIsNarrow();
  const scale = useMemo(() => {
    const { w, h } = CARD_SIZES.full;
    const heightBudget = viewport.h * (narrow ? 0.6 : 0.72);
    // Floored at 0.5, NOT 1 — a 1 floor defeated the whole fit-clamp on
    // short viewports (every landscape phone), pushing the meta column and
    // CLOSE/FLIP below the fold.
    return Math.max(0.5, Math.min(INSPECT_SCALE, heightBudget / h, (viewport.w * 0.92) / w));
  }, [viewport, narrow]);
  const { w, h } = CARD_SIZES.full;

  const back = getCardBackImage();

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-[var(--c-ink)]/85 flex items-center justify-center p-4 pt-16 md:pt-4 overflow-y-auto outline-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Inspecting ${def.name}`}
    >
      {/* A thumb-sized close in the corner: on a touch screen there is no Esc,
          and the bottom CLOSE button can be a scroll away. */}
      <button
        type="button"
        aria-label="Close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="btn-pop fixed top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.5rem,env(safe-area-inset-right))] z-10 w-11 h-11 flex items-center justify-center heading-font text-xl leading-none bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs"
      >
        <span aria-hidden>✕</span>
      </button>
      {/* v29 — `max-w-full` and `min-w-0`, on the row and on both columns.
          The backdrop is `fixed inset-0 … p-4 overflow-y-auto`: it scrolls
          VERTICALLY, so anything wider than it simply escapes sideways with
          nothing to reach it by. At the browser's font size doubled this row
          measured 536px of content inside a 359px box — the buttons and the
          240px metadata panel both grow, and neither column was allowed to
          shrink. The card itself cannot shrink (it is a fixed-scale object),
          which is why the columns have to. */}
      <div
        className="flex min-w-0 max-w-full flex-col md:flex-row items-center md:items-start justify-center gap-4 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Card column */}
        <div className="flex min-w-0 max-w-full flex-col items-center gap-3">
          <div style={{ perspective: 1100 }}>
            <div
              ref={cardRef}
              style={{
                width: w * scale,
                height: h * scale,
                // v4.24: without this, dragging a finger across the card to
                // tilt it on a phone also triggers the dialog's native
                // overflow-y-auto scroll under the same gesture — the card
                // visibly tilts AND the whole modal scrolls/jumps at once.
                touchAction: 'none',
                transformStyle: 'preserve-3d',
                transform: reducedMotion
                  ? undefined
                  : 'rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))',
              }}
            >
              {/* Flip lives on its own wrapper so its CSS transition never
                  fights the spring-driven tilt above. */}
              <div
                className="absolute inset-0"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: flipped ? 'rotateY(180deg)' : undefined,
                  transition: 'transform 450ms cubic-bezier(0.22, 1.4, 0.36, 1)',
                }}
              >
                {/* Front face */}
                <div
                  className="absolute inset-0"
                  style={{ backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
                >
                  <div
                    style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
                    className="relative"
                  >
                    {/* premium-boost: keeps CardFace's hover-gated premium
                      layers (Ultra-Rare prismatic sheen, Mythic heat glow)
                      always on inside the inspector — this is the "admire
                      the card" view, so the full treatment should show
                      without needing the pointer to sit on the face. */}
                    <div
                      className="relative overflow-hidden rounded-[4px] premium-boost"
                      style={{ width: w }}
                    >
                      {/* foilEffect=false: this view supplies its own pointer-driven
                        holographic sheen below, so CardFace's built-in animated
                        shimmer is suppressed — stacking both caused visible
                        flicker/banding where the two competing overlays met. */}
                      <CardFace
                        def={def}
                        size="full"
                        foil={showFoil}
                        foilEffect={false}
                        serial={serial}
                        variant={variant}
                        variantDepth={1}
                        variantLive
                      />
                      {/* Per-rarity foil (see holo/HoloLayer): replaces the
                        old inline glare / foil sheen / UR glint / Mythic glow.
                        Under reduced motion it still renders, in a fixed pose. */}
                      <HoloLayer
                        tier={tierForRarity(def.rarity)}
                        finish={serial ? 'serialized' : showFoil ? 'foil' : null}
                        colour={def.colors?.[0]}
                      />
                    </div>
                  </div>
                </div>

                {/* Back face (purely decorative card-back art) */}
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                  <div
                    className={cn(
                      'w-full h-full rounded-[6px] border-4 border-[var(--c-ink)] shadow-hard-black overflow-hidden',
                      !back && 'classic-black-back',
                    )}
                    style={
                      back
                        ? {
                            backgroundImage: `url(${back})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }
                        : undefined
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {!reducedMotion && (
              <button
                onClick={() => setFlipped((f) => !f)}
                className="btn-pop heading-font fs-sm bg-[var(--c-paper)] text-[var(--c-ink)] px-4 py-2 min-h-[44px] pointer-fine:min-h-[36px] ink-border-sm shadow-hard-black-xs"
              >
                {flipped ? '↺ SHOW FRONT' : '↻ SHOW BACK'}
              </button>
            )}
            {/* iOS asks before a page may read device tilt. */}
            {tiltPerm.needsButton && !reducedMotion && (
              <button
                onClick={() => void tiltPerm.request()}
                data-testid="tilt-permission"
                className="btn-pop heading-font fs-sm bg-[var(--c-paper)] text-[var(--c-ink)] px-4 py-2 min-h-[44px] min-w-[44px] ink-border-sm shadow-hard-black-xs"
              >
                ✦ TILT TO SHINE
              </button>
            )}
            {canToggleFoil && !serial && (
              <button
                onClick={() => {
                  const next = !showFoil;
                  setShowFoil(next);
                  onFoilToggle?.(next);
                }}
                className="btn-pop heading-font fs-sm bg-[var(--c-yellow)] text-[var(--c-ink)] px-4 py-2 min-h-[44px] pointer-fine:min-h-[36px] ink-border-sm shadow-hard-black-xs"
              >
                {showFoil ? 'VIEW NORMAL' : '✦ VIEW FOIL'}
              </button>
            )}
            {/* Keyboard hint and button only for a mouse: touch has the corner X. */}
            <button
              onClick={onClose}
              className="pointer-coarse:hidden btn-pop heading-font fs-sm bg-[var(--c-ink)] text-[var(--c-yellow)] px-4 py-2 min-h-[36px] ink-border-sm shadow-hard-black-xs"
            >
              CLOSE (ESC)
            </button>
          </div>
        </div>

        {/* Metadata + actions column */}
        <div className="flex min-w-0 flex-col gap-3 w-full max-w-[28rem] md:w-auto md:max-w-full pb-4 md:pb-0">
          {meta && meta.length > 0 && (
            <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs p-3 w-full md:w-[240px] max-w-full">
              <div className="heading-font text-xs mb-2">
                {(def.name || def.id || 'CARD').toUpperCase()}
              </div>
              <div className="flex flex-col gap-1">
                {meta.map((m) => (
                  <div
                    key={m.label}
                    className="flex items-center justify-between text-[length:var(--fs-sm)] md:text-[length:var(--fs-xs)] font-bold"
                  >
                    <span className="text-[var(--c-steel)] uppercase">{m.label}</span>
                    <span>{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* On a phone the rules and action panels span the modal (the reading
              panel is a fixed 300px box of its own, hence the child selector);
              touch screens get 44px action buttons. */}
          <div className="max-md:[&>section]:w-full">
            <CardReadingPanel def={def} />
          </div>
          {actions && (
            <div className="flex flex-col gap-3 max-md:[&>*]:w-full! pointer-coarse:[&_button]:min-h-[44px]">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
