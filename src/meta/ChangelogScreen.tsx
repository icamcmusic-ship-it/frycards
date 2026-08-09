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
    version: 'The Watch-It-Happen Pass (v19)',
    date: 'August 2026',
    items: [
      'THE OPPONENT’S BLOCKS NOW PLAY OUT INSTEAD OF JUST APPEARING. Declare an attack and its guard lines used to exist the very next instant, reported only as a count ("2 guard line(s)") that named neither the blocker nor what it stopped. Now each one is narrated: the blockers pulse yellow, the attacker they intercept pulses red, and a closing beat tells you exactly how much Might is still coming through — with the opponent’s own Vitality plate lit up, because that is what it is aimed at.',
      'NEW: ❚❚ HOLD and ▸ STEP, next to ⏱ and SKIP ▸▸. Freeze the opponent’s move on screen for as long as you like, then walk its turn one action at a time. SKIP still fast-forwards the rest.',
      'FIX: the Battle Log opened on its OLDEST line. It is five lines tall and holds the last 160, so opening it to see what just happened showed you ancient history. It now opens on the newest line — and marks where the opponent’s turn started with a "since your last turn" divider.',
      'BALANCE: nothing on any card changed, and that is the finding. Sentinel of the Nether Pit’s scheduled nerf — the third in three passes — was measured and reverted like the last one, because the diagnostic finally showed why none of them worked: on randomly built decks Sentinel is a BELOW-average Leader, worst in the whole pool in one cohort. What has been finishing first for four passes was its three hand-built test decks, not the card. The planned Void Mother rework is cancelled on the same evidence. Full reasoning in docs/BALANCE_SIM_FINDINGS_v19.md.',
      'FIX: the CPU would trade its entire Leader — aura, abilities and all — to finish off a big unit that was already one hit from dying. It no longer does that at all; measured across four deck cohorts, its rate of doing it went to zero with nothing else moving.',
      'Under the hood: the screen audit only ever clicked one level deep, so nothing behind a click had ever been measured, and the match stress driver always pressed SKIP — meaning the narration everything above is built on was never once tested. Both now go where they were not looking, and three harness bugs that were hiding coverage are fixed.',
    ],
  },
  {
    version: 'The Watch-the-CPU Pass (v18)',
    date: 'August 2026',
    items: [
      'THE OPPONENT’S CLASH TRICKS ARE NO LONGER INVISIBLE. Its Quick Events and Ambush units used to resolve in total silence during a Clash — cards played, units died, and the board just changed between two of your clicks. Every one of those now plays out beat by beat with the same rings and pacing as its main turn, and the card it plays is held up in the middle of the board so you can actually read it. Attackers lean across the clash line as they are declared.',
      'GUARDS GOT EASIER: ✦ SUGGEST fills your guard lines with the same blocking heuristic the CPU uses, as a starting point you can edit. The attack button now reads how much Might you are sending ("⚔ DECLARE ATTACK — 3 · 11 MIGHT"), and ALL ×N sends everything that is ready.',
      'Narration speed (SLOW / NORMAL / FAST) is now in SETTINGS, not only on the bubble that appears mid-turn — so you can pick it before a match instead of during one.',
      'FIX: a response window could hang a match outright, with no button anywhere that resumed it. FIX: the battle log said "you casts Fry’s Charm on themselves". FIX: the previous turn’s highlight rings stayed pulsing into the next turn. FIX: a failed News Center post deletion reported nothing at all.',
      'BALANCE: Sovereign of the Dying Star costs one less essence to invoke. It had finished last or next-to-last on every measured table and its kit was never the problem — it simply arrived on turn 8 and got too few turns to use it. It now lands on turn 7 and reads mid-field on all four cohorts without topping any. Sentinel of the Nether Pit’s scheduled follow-up nerf was measured and REVERTED: it changed nothing at all, and shipping a strictly worse card for no measured gain is not a balance change. Measured across 23,808 games per trial on four deck cohorts, zero rules violations; full numbers now live in docs/BALANCE_SIM_FINDINGS_v19.md (which superseded this pass’s findings doc).',
      'Under the hood: a new stress harness plays whole matches through the real match UI in a browser, taking every action the board offers — ten matches at phone and desktop width, zero problems found.',
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
