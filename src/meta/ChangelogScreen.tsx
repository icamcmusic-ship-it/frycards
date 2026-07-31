import React from 'react';
import { PopButton } from './ui';

interface ChangelogEntry {
  version: string;
  date?: string;
  items: string[];
}

// Condensed, user-facing view of CHANGELOG.md — trimmed to the highlights
// players actually care about (new features, balance headlines), not every
// internal playtest data point tracked in the full file.
export const ENTRIES: ChangelogEntry[] = [
  {
    version: 'Stay Current (v15)',
    date: 'July 2026',
    items: [
      "NEW: the game tells you when it has been updated. Leave Fry Cards open on a phone for a week and you were quietly playing last week's build against this week's cards, with no way to know. A banner now appears when a new version has shipped, or when the card database itself has changed underneath you, with a REFRESH button — dismiss it and it stays gone until the next update. It never interrupts a match.",
      'FIX: BLOSSOM-VEILED REFUGE was two different cards at once. Its move to Full-Art last release reached the game and its shop price but not the copy of the card the game actually loads, so it printed as the old Super-Rare — a 1-cost Root Sanctum with "at Dusk, a friendly unit gets +1/+1" — while the shop, packs and deck limits all treated it as the Full-Art it is. It is now the Full-Art everywhere: a 3-cost Shadow Sanctum that gives your units +1 Grit.',
      'The changelog now keeps only the two most recent updates. The full history is still in CHANGELOG.md.',
    ],
  },
  {
    version: 'Deep Bug Hunt (v14)',
    date: 'July 2026',
    items: [
      'FIX: the store listed a set that does not exist. Any pack that draws from every set was printing "Player Showcase" in its Includes line — the set was renamed to PLAYERS SHOWCASE 2026 last release and this one copy of the old name was missed.',
      "FIX (card submissions): when Fry cleared a card's keywords before printing it, the change was thrown away and the card printed with its generated keywords anyway — and the review panel told him nothing had been overridden. Clearing the box now actually clears the keywords.",
      'FIX (card submissions): the mechanics editor offered MIGHT and GRIT on every card type, but only Units have them. On an Item, an Event, a Location or a Leader the number went nowhere on the card and into the database anyway, so the two disagreed. Those boxes are Unit-only now.',
      "NEW (card submissions): Items can finally have their bond edited. An Item's stats live in its bond rather than in Might/Grit, so until now it was the one card type whose numbers could not be corrected at all.",
      'The offline layout harness was quietly skipping four screens — including the Creator-only submission panels — because it decided they had no buttons before they had finished loading. It waits for them now. Every screen still measures clean at phone width.',
      'Checked and clean: the live card database matches the game exactly — all 297 cards, all ten mechanics fields, byte for byte. Same for shop prices, quick-sell prices and deck copy limits against their server-side originals.',
    ],
  },
];

export function ChangelogScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <div className="sticky top-0 z-30 flex items-center gap-3 bg-[var(--c-ink)] px-4 py-2.5">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        <h1 className="heading-font text-xl text-[var(--c-yellow)]">CHANGELOG</h1>
      </div>

      <div className="p-6 max-w-3xl mx-auto flex flex-col gap-5">
        {ENTRIES.map((entry) => (
          <div
            key={entry.version}
            className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--c-steel)]">
              <span className="heading-font text-sm text-[var(--c-yellow)]">{entry.version}</span>
              {entry.date && (
                <span className="text-[10px] font-bold text-[var(--c-paper)]/60">{entry.date}</span>
              )}
            </div>
            <ul className="px-5 py-3 flex flex-col gap-1.5 list-disc">
              {entry.items.map((item, i) => (
                <li key={i} className="text-[12px] font-bold text-[var(--c-ink)]/85 leading-snug">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="text-center text-[10px] font-mono font-bold text-[var(--c-steel)]/70 mt-2 mb-6">
          FULL DETAILS · CHANGELOG.md
        </div>
      </div>
    </div>
  );
}
