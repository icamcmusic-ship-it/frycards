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
//
// This screen holds the TWO most recent updates only. It is a "what changed
// since you last played" board, not an archive: `CHANGELOG.md` is the complete
// history and stays complete. When a release adds an entry here, the oldest of
// the three comes out. NewsCenterScreen reads ENTRIES[0] for its headline, so
// the newest entry must stay first.
export const ENTRIES: ChangelogEntry[] = [
  {
    version: 'Bug Hunt (v15)',
    date: 'August 2026',
    items: [
      "FIX (card submissions): correcting an Item's bond stats wiped the keyword that Item grants. Nearly half the Items in the game hand a keyword (Aerial, Nimble, Skywatch…) to whatever unit they bond to, and that keyword lives in the same place as the bond numbers — so nudging BOND +MIGHT by one quietly deleted it, from the card and from the database, while the panel reported a stats-only edit. The keyword now survives the edit.",
      'HOW TO PLAY: the feature guide, which calls itself “Every Feature”, never mentioned CARD SUBMISSIONS — the one screen where you design your own cards, on the main menu since v12. It is in there now, with the treatment limits.',
      'HOW TO PLAY: the pack section still claimed every card in the game belongs to Volume #1. Packs have been pinned to a single set since v12 and PLAYERS SHOWCASE 2026 is a real set with its own booster waiting on 100 cards. Reworded to say what actually happens.',
      'HOW TO PLAY: the footer credited “RULEBOOK V9.0”. There has never been a v9 rulebook — the rules you are playing are v6.0, which is what the deck-select screen has said all along.',
      'The changelog now keeps only the two most recent updates. The full history lives in CHANGELOG.md alongside the code.',
      'Checked and clean: 332 engine and rules tests, a 144-game CPU-vs-CPU simulation with no invariant violation, and every screen measured at phone width with 153 control clicks and no layout or console problem.',
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
