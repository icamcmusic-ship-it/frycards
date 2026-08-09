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
    version: 'The Nothing-Happens-In-Silence Pass (v20)',
    date: 'August 2026',
    items: [
      'THE OPPONENT’S ANSWERS NOW PLAY OUT TOO. Play a card and the CPU could counter it, shatter the unit you aimed at, or answer with a Quick Event of its own — and all of that arrived as one banner over a board that had already changed. Its response window is now narrated beat by beat like everything else it does: the card it played is held up in the middle of the board, and the unit it is aimed at pulses red. That was the last place the opponent still acted invisibly.',
      'When the opponent declares an attack, YOUR Vitality plate now lights up with it — the attackers already leaned across the line, but nothing said where they were pointed. Its blocking decision also gets a beat of its own ("choosing its guards…") before the guard lines land, so the answer reads as a reply to your attack rather than part of your own click.',
      'FIX: SKIP ▸▸ no longer leaves ❚❚ HOLD switched on. A turn is narrated as several runs back to back, so holding once and then pressing SKIP fast-forwarded the current run and froze on the next one — you had to press SKIP again for every remaining piece of the turn.',
      'FIX: starting a new card while you were already picking a target silently threw the first pick away — same red bar, different rings, no word about it. The hand now says "finish the current pick first (✕ or Esc to cancel it)".',
      'NEW: ✕ CLEAR next to DECLARE ATTACK and CONFIRM GUARDS. Escape has always cleared a selection; there was no visible way to do it, which matters most right after ✦ SUGGEST fills every guard line at once.',
      'FIX: the hint bar was clipped to a single line, so on a phone the guard hint lost the one number it exists to deliver — how much Vitality is about to hit you. It now runs to two lines.',
      'BALANCE: no card changed, and for the second pass running that IS the finding. v19 discovered the Leader table had been ranking three hand-built decks instead of the cards; this pass widened it from 3 decks to 9 REAL ones and re-measured. Sentinel of the Nether Pit — first in all four cohorts for four passes, and nerfed three times for it — drops to 43.5% and lands near the BOTTOM. Void Mother, the one scheduled for a rework, comes off the floor. Full numbers in docs/BALANCE_SIM_FINDINGS_v20.md.',
      'Under the hood: six meta screens (Battle Pass, Marketplace, Player Shops, Friends, News, Missions) had been audited for eight passes with nothing on them — they fetch their own data and the audit runs offline, so it was measuring empty states and reporting a clean pass. They are populated now, which found a crash on the mystery-pack pool viewer the first time it was ever opened by a test.',
    ],
  },
  {
    version: 'The Watch-It-Happen Pass (v19)',
    date: 'August 2026',
    items: [
      'THE OPPONENT’S BLOCKS NOW PLAY OUT INSTEAD OF JUST APPEARING. Declare an attack and its guard lines used to exist the very next instant, reported only as a count ("2 guard line(s)") that named neither the blocker nor what it stopped. Now each one is narrated: the blockers pulse yellow, the attacker they intercept pulses red, and a closing beat tells you exactly how much Might is still coming through — with the opponent’s own Vitality plate lit up, because that is what it is aimed at.',
      'NEW: ❚❚ HOLD and ▸ STEP, next to ⏱ and SKIP ▸▸. Freeze the opponent’s move on screen for as long as you like, then walk its turn one action at a time. SKIP still fast-forwards the rest.',
      'FIX: the Battle Log opened on its OLDEST line. It is five lines tall and holds the last 160, so opening it to see what just happened showed you ancient history. It now opens on the newest line — and marks where the opponent’s turn started with a "since your last turn" divider.',
      'BALANCE: nothing on any card changed, and that is the finding. Sentinel of the Nether Pit’s scheduled nerf — the third in three passes — was measured and reverted like the last one, because the diagnostic finally showed why none of them worked: on randomly built decks Sentinel is a BELOW-average Leader, worst in the whole pool in one cohort. What has been finishing first for four passes was its three hand-built test decks, not the card. The planned Void Mother rework is cancelled on the same evidence. (v20 widened that diagnostic and confirmed it — see above.)',
      'FIX: the CPU would trade its entire Leader — aura, abilities and all — to finish off a big unit that was already one hit from dying. It no longer does that at all; measured across four deck cohorts, its rate of doing it went to zero with nothing else moving.',
      'Under the hood: the screen audit only ever clicked one level deep, so nothing behind a click had ever been measured, and the match stress driver always pressed SKIP — meaning the narration everything above is built on was never once tested. Both now go where they were not looking, and three harness bugs that were hiding coverage are fixed.',
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
