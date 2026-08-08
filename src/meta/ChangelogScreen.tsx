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
    version: 'The Watch-the-CPU Pass (v18)',
    date: 'August 2026',
    items: [
      'THE OPPONENT’S CLASH TRICKS ARE NO LONGER INVISIBLE. Its Quick Events and Ambush units used to resolve in total silence during a Clash — cards played, units died, and the board just changed between two of your clicks. Every one of those now plays out beat by beat with the same rings and pacing as its main turn, and the card it plays is held up in the middle of the board so you can actually read it. Attackers lean across the clash line as they are declared.',
      'GUARDS GOT EASIER: ✦ SUGGEST fills your guard lines with the same blocking heuristic the CPU uses, as a starting point you can edit. The attack button now reads how much Might you are sending ("⚔ DECLARE ATTACK — 3 · 11 MIGHT"), and ALL ×N sends everything that is ready.',
      'Narration speed (SLOW / NORMAL / FAST) is now in SETTINGS, not only on the bubble that appears mid-turn — so you can pick it before a match instead of during one.',
      'FIX: a response window could hang a match outright, with no button anywhere that resumed it. FIX: the battle log said "you casts Fry’s Charm on themselves". FIX: the previous turn’s highlight rings stayed pulsing into the next turn. FIX: a failed News Center post deletion reported nothing at all.',
      'BALANCE: Sovereign of the Dying Star costs one less essence to invoke. It had finished last or next-to-last on every measured table and its kit was never the problem — it simply arrived on turn 8 and got too few turns to use it. It now lands on turn 7 and reads mid-field on all four cohorts without topping any. Sentinel of the Nether Pit’s scheduled follow-up nerf was measured and REVERTED: it changed nothing at all, and shipping a strictly worse card for no measured gain is not a balance change. Measured across 23,808 games per trial on four deck cohorts, zero rules violations; full numbers in docs/BALANCE_SIM_FINDINGS_v18.md.',
      'Under the hood: a new stress harness plays whole matches through the real match UI in a browser, taking every action the board offers — ten matches at phone and desktop width, zero problems found.',
    ],
  },
  {
    version: 'The Interactive-Seam Pass (v17)',
    date: 'August 2026',
    items: [
      'YOU CAN SEE WHAT THE CPU IS DOING: while the opponent plays, the card it is acting with pulses yellow and whatever it is acting on pulses red, beat by beat — including its Leader and your Vitality. The battle log finally records Leader ability uses, spell targets and every point of clash damage, in plain language ("You invoke…", the opponent by name). New speed control: SLOW / NORMAL / FAST, remembered between matches.',
      'FIX: three rules windows the game owed you. Your card could freeze on the stack after you passed a response window; the opponent’s clash tricks resolved straight through your answer window when you attacked; and the attacking CPU never took its own reaction window when you defended. All three now play out exactly as the rulebook says.',
      'FIX: a card drawn by an "At Dusk" effect was always the card auto-discarded to the hand limit, with no say. The shed choice now happens after Dusk draws, so you pick from your real final hand.',
      'A Tool now lets you PICK the enemy unit it weakens, response windows you cannot act in pass themselves, the guard step shows exactly how much damage is coming through, and guest players can finally hit PLAY — the quick match the guest button always promised.',
      'BALANCE: Sentinel of the Nether Pit’s reach ability now costs -3 Resolve (was -2) — it had finished first on every measured table two passes running. Avatar of the Abyss gets a point BACK (-4 → -3): three stacked nerfs from an older measuring stick had buried it at the bottom. Measured one at a time across 23,808 games each on four deck cohorts, zero rules violations; full numbers now live in docs/BALANCE_SIM_FINDINGS_v18.md (which superseded this pass’s findings doc).',
      'Plus 17 fixed bugs across the menus, store, collection, marketplace, shops and submissions — from a double-paid match reward on a flaky connection to a progress meter that counted approved showcase cards twice.',
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
