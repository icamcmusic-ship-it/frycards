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
    version: 'The Interactive-Seam Pass (v17)',
    date: 'August 2026',
    items: [
      'YOU CAN SEE WHAT THE CPU IS DOING: while the opponent plays, the card it is acting with pulses yellow and whatever it is acting on pulses red, beat by beat — including its Leader and your Vitality. The battle log finally records Leader ability uses, spell targets and every point of clash damage, in plain language ("You invoke…", the opponent by name). New speed control: SLOW / NORMAL / FAST, remembered between matches.',
      'FIX: three rules windows the game owed you. Your card could freeze on the stack after you passed a response window; the opponent’s clash tricks resolved straight through your answer window when you attacked; and the attacking CPU never took its own reaction window when you defended. All three now play out exactly as the rulebook says.',
      'FIX: a card drawn by an "At Dusk" effect was always the card auto-discarded to the hand limit, with no say. The shed choice now happens after Dusk draws, so you pick from your real final hand.',
      'A Tool now lets you PICK the enemy unit it weakens, response windows you cannot act in pass themselves, the guard step shows exactly how much damage is coming through, and guest players can finally hit PLAY — the quick match the guest button always promised.',
      'BALANCE: Sentinel of the Nether Pit’s reach ability now costs -3 Resolve (was -2) — it had finished first on every measured table two passes running. Avatar of the Abyss gets a point BACK (-4 → -3): three stacked nerfs from an older measuring stick had buried it at the bottom. Measured one at a time across 23,808 games each on four deck cohorts, zero rules violations; full numbers in docs/BALANCE_SIM_FINDINGS_v17.md.',
      'Plus 17 fixed bugs across the menus, store, collection, marketplace, shops and submissions — from a double-paid match reward on a flaky connection to a progress meter that counted approved showcase cards twice.',
    ],
  },
  {
    version: 'The Unbreakable Pass (v16)',
    date: 'August 2026',
    items: [
      'BALANCE: UNBREAKABLE now saves its unit once per GAME (was once per turn), and the survivor comes back wounded — at one Grit — instead of fully healed. Four passes of price and stat changes could not tame a wall that shrugged off one kill every single turn and healed while doing it; this finally prints a keyword the game can price.',
      'BALANCE: premium keywords now cost what they say. A big keyword surcharge used to vanish on expensive bodies (the price capped at 7 no matter what the keyword was worth) — it now charges in full, up to 9. Nine Units got pricier (The Pier-Side Menace, The Wolf of Wall Street and Skyborne Skeleton Dragon print at 9), and three Events/Items got back a point of effect an old bug had docked from them.',
      'BALANCE: Amethyst Starfish’s free "At Dawn, deal 3 damage to any target" — stronger than most Leader abilities, every turn, on a 5-cost body — is now 1 damage. The card had topped the overperformer list for four straight measurement passes.',
      'CPU: Sentinel of the Nether Pit stops throwing its own Leader away. The computer was trading the whole Leader for a 2-damage ping into a big unit that survived it, in up to one game in six — those trades now only happen when the ability actually kills the threat.',
      'Measured across 23,808 CPU-vs-CPU games per trial (four independent deck cohorts), zero rules violations, before and after every change. Full numbers now live in docs/BALANCE_SIM_FINDINGS_v17.md (which superseded this pass’s findings doc).',
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
