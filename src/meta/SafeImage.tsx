import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { mediaUrl, originalMediaUrl } from '../lib/media';
import { cardBackSources } from './cardBackAssets';

/**
 * <img> with a graceful fallback — if the source 404s or never loads, shows
 * a plain tinted placeholder instead of a broken-image icon or empty box.
 * Used everywhere outside the card template itself (packs, leaders,
 * cosmetics) — see CardArt in components/CardFaceV4.tsx for card art.
 */
/**
 * Fallback ceiling for callers that do not pass a width. No image in the app
 * is presented wider than this, so it is always a reduction — usually a large
 * one, since the storage originals are multi-megapixel — while never being
 * visibly soft anywhere it is applied.
 */
const DEFAULT_BOX_WIDTH = 480;

export function SafeImage({
  src,
  alt,
  className,
  fallbackClassName,
  fallbackText,
  eager,
  boxWidth = DEFAULT_BOX_WIDTH,
  onLoad,
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  fallbackText?: string;
  /** Skip lazy loading — for art that is the focus of the screen the moment
   * it mounts (the pack-opening tear animation). */
  eager?: boolean;
  /** Rendered width of this image in CSS pixels. Supplying it serves a
   * pre-generated derivative instead of the full-resolution original — the
   * difference between a ~60 kB thumbnail and a 6 MB PNG.
   * Defaults to DEFAULT_BOX_WIDTH, which is a ceiling rather than a fit:
   * pass the real width wherever it is known and smaller. */
  boxWidth?: number;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}) {
  const [broken, setBroken] = useState(false);
  // Sources tried in order: the resized derivative, then the full-size
  // original (derivatives are pre-generated, so a key the generator has not
  // reached yet 404s, and art must still paint when it does). Repo card backs
  // try their Cloudflare copy, then the copy bundled with the app.
  const [attempt, setAttempt] = useState(0);
  // Reset whenever the source changes — otherwise a component instance that's
  // reused across a changing `src` (e.g. an equipped avatar/banner swap) would
  // keep showing the fallback forever after one bad load.
  // Derived during render (not in an effect), so the stale fallback never
  // paints for a frame.
  const [shownSrc, setShownSrc] = useState(src);
  if (shownSrc !== src) {
    setShownSrc(src);
    setBroken(false);
    setAttempt(0);
  }
  if (!src || broken) {
    return (
      <div
        className={cn(
          'w-full h-full flex items-center justify-center bg-[var(--c-steel)] text-[var(--c-paper)]/70',
          fallbackClassName,
        )}
      >
        {fallbackText && (
          <span className="heading-font text-[10px] px-2 text-center leading-tight">
            {fallbackText}
          </span>
        )}
      </div>
    );
  }
  const sources = cardBackSources(src, boxWidth) ?? [
    ...new Set([mediaUrl(src, boxWidth) ?? src, originalMediaUrl(src)]),
  ];
  const resolved = sources[Math.min(attempt, sources.length - 1)];
  return (
    <img
      src={resolved}
      alt={alt ?? ''}
      className={className}
      draggable={false}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={onLoad}
      onError={() => {
        if (attempt < sources.length - 1) setAttempt(attempt + 1);
        else setBroken(true);
      }}
    />
  );
}
