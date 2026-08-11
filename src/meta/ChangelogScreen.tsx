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
    version: 'The Dawn-and-Dusk Pass (v22)',
    date: 'August 2026',
    items: [
      'THE OPPONENT’S DAWN AND DUSK NOW HAPPEN OUT LOUD. Four passes have each closed a place the opponent acted invisibly — its turn, its blocks, its answers on the stack — by asking which of its DECISIONS had no narration. Every decision had one. What was left is not a decision: it is the two phases the rules run for it. Between them they can FREEZE one of your units before it has played anything (Glaciate), erode your deck toward a deck-out loss (Entropic, Blighted), sweep your whole board (Scorched-Earth), heal it, grow its units and draw it cards. None of that wrote a single line anywhere. Its Dawn is now narrated on the board before its turn begins, the freeze names and rings the unit it took, and the Battle Log’s "since your last turn" divider has moved back to cover it.',
      'A beat aimed at something of YOURS now holds ~40% longer on screen. Most of an opponent’s turn is it improving its own board; the two or three beats where a unit of yours is frozen, weakened or hit are the ones you actually have to find on the board, and they were getting the same second and a bit as "Kuro plays a Tide Wellspring".',
      'Lines that name a card now light that card up even when no structured move sits behind them — "… was shattered", a Dawn freeze, a fizzle. Those were sentences with no ring.',
      'NEW: the Wellspring dots tell you which one to press. Seven small coloured circles whose only distinguishing text was a tooltip reading "Play a Void Wellspring (free)" — identical for all seven and invisible on a phone. Each now reports how many cards in your hand it would UNLOCK (the same measure the CPU uses for its own), the best one is ringed, and the recommendation is spelled out in the hint bar. They also got a proper touch target.',
      'NEW: ↻ REMATCH on the game-over screen. BACK TO MENU was the only way off it, so a second match meant three screens to re-pick what you had just chosen.',
      'FIX: the XP readout could print a negative number ("-2400/1200 XP TO LEVEL 13"). The bar beside it has been clamped for several passes; the text never was.',
      'BALANCE: no card changed, for the third pass running, and this time the diagnostic is the finding. Six deck cohorts (up from the standing four) put Mer-King first in ALL SIX and show its two measuring arms AGREEING for the first time — so it is not the measurement artefact Sentinel of the Nether Pit turned out to be. The caution flag those passes were read through fires on a quarter of all readings, which makes it no kind of filter; the one Leader that trips the signature it was actually built to detect is Ruin-Walker Overseer, which the test suite appears to be UNDER-rating. Full numbers in docs/BALANCE_SIM_FINDINGS_v22.md.',
      'Under the hood: the match stress driver had been clicking the first Wellspring dot every turn for its whole existence — the same colour for a whole match — so it spent most games building the wrong essence in front of a hand it could not cast, and every driven match since the harness was written ended around turn 7 against a headless average of 21. It also now re-bonds Items and presses ✕ CLEAR, and the screen audit finally measures the pack-opening reveal and summary, which it had been reporting as "one control" (the tear button).',
    ],
  },
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
