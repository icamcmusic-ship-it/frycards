/**
 * Comic SFX bursts for big moments (audit U72): ALL IN, SHOWDOWN, a power
 * cast at you, a big pull. A starburst with heavy tilted text and a hard
 * shadow that pops for ~600ms; under Reduced motion it is a static sticker
 * that simply appears and goes (the CSS keys off html[data-motion]).
 */
import React from 'react';

export interface Sfx {
  id: number;
  text: string;
  tone?: 'yellow' | 'red';
}

export function SfxBurst({ sfx }: { sfx: Sfx | null }) {
  if (!sfx) return null;
  const tilt = sfx.id % 2 ? -5 : 4;
  return (
    <div
      key={sfx.id}
      aria-hidden
      data-testid="sfx-burst"
      className="sfx-burst pointer-events-none absolute left-1/2 top-[18%] z-40"
      style={{ '--sfx-tilt': `${tilt}deg` } as React.CSSProperties}
    >
      <span
        className={`sfx-star block px-6 py-4 heading-font font-black text-xl sm:text-3xl whitespace-nowrap ${
          sfx.tone === 'red'
            ? 'bg-[var(--c-red)] text-white'
            : 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
        }`}
      >
        {sfx.text}
      </span>
    </div>
  );
}
