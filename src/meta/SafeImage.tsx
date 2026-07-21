import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';

/**
 * <img> with a graceful fallback — if the source 404s or never loads, shows
 * a plain tinted placeholder instead of a broken-image icon or empty box.
 * Used everywhere outside the card template itself (packs, leaders,
 * cosmetics) — see CardArt in components/CardFaceV4.tsx for card art.
 */
export function SafeImage({
  src,
  alt,
  className,
  fallbackClassName,
  fallbackText,
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  fallbackText?: string;
}) {
  const [broken, setBroken] = useState(false);
  // Reset the broken flag whenever the source changes — otherwise a
  // component instance that's reused across a changing `src` (e.g. an
  // equipped avatar/banner swap) would keep showing the fallback forever
  // after one bad load, even once `src` points at a good image again.
  useEffect(() => {
    setBroken(false);
  }, [src]);
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
  return (
    <img
      src={src}
      alt={alt ?? ''}
      className={className}
      draggable={false}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
