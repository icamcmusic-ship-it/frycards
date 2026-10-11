import React from 'react';
import { FORMATS, type FormatId } from '../game/poker/formats';

/** Format badges (Q6/R6) and this list's record (Q7) under a deck tile. */
export function DeckMeta({
  tags,
  rec,
}: {
  tags: FormatId[];
  rec?: { games: number; wins: number; avgPlace: number };
}) {
  if (!tags.length && !rec) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {tags.map((t) => (
        <span
          key={t}
          title={FORMATS[t].blurb}
          className="fs-xs font-black px-1 bg-[var(--c-ink)] text-[var(--c-yellow)]"
        >
          {FORMATS[t].badge}
        </span>
      ))}
      {rec && (
        <span className="fs-xs font-black text-[var(--c-ink)]">
          {rec.wins} W / {rec.games} · avg {rec.avgPlace}
        </span>
      )}
    </div>
  );
}
