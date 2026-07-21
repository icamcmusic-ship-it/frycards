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
import { CardDef } from '../game/v3/cards';
import { CardFace, CARD_SIZES } from './CardFaceV4';
import { getCardBackImage } from '../meta/cardback';
import { cn } from '../lib/utils';

const MAX_TILT_DEG = 14;

/** v4.19: the ONE canonical expanded-card scale, shared by every enlarged
 * presentation — this inspector (collection click-expand, board click-expand
 * in GameV4) and the in-match hand hover preview (GameV4's
 * HOVER_PREVIEW_SCALE re-exports this) — so an expanded card is the same
 * size no matter where it was opened from. Viewport-clamped below so it
 * still fits small screens. */
export const INSPECT_SCALE = 1.55;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function Card3DInspector({
  def,
  foil,
  canToggleFoil,
  serial,
  meta,
  actions,
  onClose,
}: {
  def: CardDef;
  /** Show the foil treatment on the enlarged card. */
  foil?: boolean;
  /** When the player owns both normal and foil copies, show a variant toggle. */
  canToggleFoil?: boolean;
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
  // Tilt state: rotation in degrees + pointer position as 0..1 fractions of
  // the card, used to place the glare/holo highlight.
  const [tilt, setTilt] = useState<{ rx: number; ry: number; px: number; py: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // v4.24: move focus into the dialog on open and restore it to whatever
  // triggered the inspector on close — previously a keyboard user opening
  // this via Enter/Space could Tab straight through to background page
  // elements still sitting behind the (only visually) fixed overlay.
  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => prevFocused?.focus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const scale = useMemo(() => {
    const { w, h } = CARD_SIZES.full;
    return Math.max(1, Math.min(INSPECT_SCALE, (viewport.h * 0.72) / h, (viewport.w * 0.92) / w));
  }, [viewport]);
  const { w, h } = CARD_SIZES.full;

  const handleMove = (clientX: number, clientY: number) => {
    if (reducedMotion) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const py = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    setTilt({
      // Pointer at top tips the card away (negative rotateX is toward viewer
      // at the bottom), pointer right rotates right edge away from viewer.
      rx: (0.5 - py) * 2 * MAX_TILT_DEG,
      ry: (px - 0.5) * 2 * MAX_TILT_DEG,
      px,
      py,
    });
  };

  const resetTilt = () => setTilt(null);

  const rx = tilt?.rx ?? 0;
  const ry = tilt?.ry ?? 0;
  const px = tilt?.px ?? 0.5;
  const py = tilt?.py ?? 0.5;
  const back = getCardBackImage();

  // Glare strength scales with how far the card is tilted.
  const tiltAmount = Math.min(1, Math.hypot(rx, ry) / MAX_TILT_DEG);

  // v4.7 premium templates get their own pointer-driven sheen in here, on
  // top of CardFace's always-on inspector treatment (see premium-boost):
  // Ultra-Rare a gold-leaf glint that sweeps with the tilt angle, Mythic a
  // molten ember glow that pools under the pointer.
  const premium =
    def.rarity === 'Ultra-Rare' ? 'ultra' : def.rarity === 'Mythic' ? 'mythic' : null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-[var(--c-ink)]/85 flex items-center justify-center p-4 overflow-y-auto outline-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Inspecting ${def.name}`}
    >
      <div
        className="flex flex-col md:flex-row items-center md:items-start justify-center gap-4 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Card column */}
        <div className="flex flex-col items-center gap-3">
          <div style={{ perspective: 1100 }}>
            <div
              ref={cardRef}
              onPointerMove={(e) => handleMove(e.clientX, e.clientY)}
              onPointerLeave={resetTilt}
              onTouchMove={(e) => {
                const t = e.touches[0];
                if (t) handleMove(t.clientX, t.clientY);
              }}
              onTouchEnd={resetTilt}
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
                  : `rotateX(${rx}deg) rotateY(${ry + (flipped ? 180 : 0)}deg)`,
                // Snappy while tracking the pointer, springy on release/flip.
                transition: tilt
                  ? 'transform 60ms linear'
                  : 'transform 450ms cubic-bezier(0.22, 1.4, 0.36, 1)',
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
                    />
                    {/* Dynamic glare / light sweep following the tilt */}
                    {!reducedMotion && (
                      <div
                        aria-hidden
                        className="absolute inset-0 pointer-events-none mix-blend-overlay"
                        style={{
                          opacity: 0.25 + tiltAmount * 0.5,
                          background: `radial-gradient(circle at ${px * 100}% ${py * 100}%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.18) 32%, rgba(0,0,0,0.12) 75%)`,
                          transition: tilt ? 'none' : 'opacity 450ms ease, background 450ms ease',
                        }}
                      />
                    )}
                    {/* Holographic rainbow sheen for foils, angle follows tilt.
                        Always mounted (never conditionally added/removed) so
                        toggling "VIEW FOIL" crossfades via opacity instead of
                        popping the gradient in/out with no transition. */}
                    {!reducedMotion && (
                      <div
                        aria-hidden
                        className="absolute inset-0 pointer-events-none mix-blend-color-dodge"
                        style={{
                          opacity: showFoil ? 0.2 + tiltAmount * 0.45 : 0,
                          background: `linear-gradient(${115 + ry * 5 + rx * 3}deg,
                            rgba(255,0,132,0.55) ${px * 30}%,
                            rgba(255,229,0,0.5) ${20 + px * 30}%,
                            rgba(0,255,163,0.5) ${40 + px * 30}%,
                            rgba(0,178,255,0.55) ${60 + px * 30}%,
                            rgba(196,0,255,0.5) ${80 + px * 30}%)`,
                          transition: tilt ? 'none' : 'opacity 450ms ease',
                        }}
                      />
                    )}
                    {/* Ultra-Rare: tilt-tracking gold-leaf glint. */}
                    {!reducedMotion && premium === 'ultra' && (
                      <div
                        aria-hidden
                        className="absolute inset-0 pointer-events-none mix-blend-overlay"
                        style={{
                          opacity: 0.25 + tiltAmount * 0.5,
                          background: `linear-gradient(${105 + ry * 6 + rx * 4}deg,
                            transparent ${Math.max(0, px * 60 - 18)}%,
                            rgba(255, 233, 163, 0.75) ${px * 60}%,
                            rgba(255, 255, 255, 0.9) ${px * 60 + 8}%,
                            rgba(212, 175, 55, 0.7) ${px * 60 + 16}%,
                            transparent ${px * 60 + 34}%)`,
                          transition: tilt ? 'none' : 'opacity 450ms ease, background 450ms ease',
                        }}
                      />
                    )}
                    {/* Mythic: molten ember glow pooling under the pointer. */}
                    {!reducedMotion && premium === 'mythic' && (
                      <div
                        aria-hidden
                        className="absolute inset-0 pointer-events-none mix-blend-screen"
                        style={{
                          opacity: 0.3 + tiltAmount * 0.5,
                          background: `radial-gradient(circle at ${px * 100}% ${py * 100}%,
                            rgba(255, 179, 0, 0.55) 0%,
                            rgba(225, 29, 46, 0.4) 28%,
                            rgba(122, 20, 32, 0.15) 55%,
                            transparent 75%)`,
                          transition: tilt ? 'none' : 'opacity 450ms ease, background 450ms ease',
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Back face */}
              <div
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

          <div className="flex flex-wrap justify-center gap-2">
            {!reducedMotion && (
              <button
                onClick={() => setFlipped((f) => !f)}
                className="btn-pop heading-font text-[10px] bg-[var(--c-paper)] text-[var(--c-ink)] px-3 py-1.5 ink-border-sm shadow-hard-black-xs"
              >
                {flipped ? '↺ SHOW FRONT' : '↻ SHOW BACK'}
              </button>
            )}
            {canToggleFoil && !serial && (
              <button
                onClick={() => setShowFoil((f) => !f)}
                className="btn-pop heading-font text-[10px] bg-[var(--c-yellow)] text-[var(--c-ink)] px-3 py-1.5 ink-border-sm shadow-hard-black-xs"
              >
                {showFoil ? 'VIEW NORMAL' : '✦ VIEW FOIL'}
              </button>
            )}
            <button
              onClick={onClose}
              className="btn-pop heading-font text-[10px] bg-[var(--c-ink)] text-[var(--c-yellow)] px-3 py-1.5 ink-border-sm shadow-hard-black-xs"
            >
              CLOSE (ESC)
            </button>
          </div>
        </div>

        {/* Metadata + actions column */}
        <div className="flex flex-col gap-3 shrink-0">
          {meta && meta.length > 0 && (
            <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs p-3 w-[240px]">
              <div className="heading-font text-xs mb-2">
                {(def.name || def.id || 'CARD').toUpperCase()}
              </div>
              <div className="flex flex-col gap-1">
                {meta.map((m) => (
                  <div
                    key={m.label}
                    className="flex items-center justify-between text-[10px] font-bold"
                  >
                    <span className="text-[var(--c-steel)] uppercase">{m.label}</span>
                    <span>{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}
