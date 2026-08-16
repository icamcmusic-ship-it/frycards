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
    version: 'The Turn-Gets-A-Receipt Pass (v26)',
    date: 'August 2026',
    items: [
      'THE GRADING LAB, REBUILT. Slabs are real cases now — a moulded acrylic shell with a proper grading label (service, card name, rarity line, and the grade stamped big beside its word), glass glare across the window, and a certificate number and barcode unique to that slab. The case changes with the grade: gold at a 10, silver at 9.5, plain grey at the bottom of the scale, with a slow shine on the top two grades. Cards still at the graders sit behind frosted glass marked SEALED — no peeking.',
      'THE LAB NOW SHOWS ITS ODDS. Every grade and its exact chance, per service, in one table — and the thing it reveals is worth knowing: all three services roll the SAME grades. TCA does not grade higher, it RESELLS higher; Keeper alone nudges 55% of rolls up a half point, which is why its slabs carry no premium. Every service also prints its average return and its chance of a 9+, every spare card shows what its slab would be worth, and the pay bar shows expected return against the fee before you commit.',
      'PAY FOR GRADING WITH VOUCHERS. Fees can now be paid in vouchers at the same 100-credits-to-1 rate the pack shelf uses. The submit flow is four clear steps with a sticky pay bar, ADD ALL for every spare of a card, a portfolio total and sort orders for your vault, and progress bars while your cards are out.',
      'SPACE PRESSES THE BUTTON. The middle of the board always offers exactly one main action — DECLARE ATTACK, RESOLVE CLASH, CONFIRM GUARDS, PASS, next phase, SKIP — and the spacebar (or Enter) now presses it. Double-click a card in hand to play it without opening the preview first. DECLARE ATTACK tells you when your swing is LETHAL IF UNGUARDED, and the phase button counts the cards you can still afford to play before you end the turn.',
      'YOU CAN SEE WHAT THE OPPONENT DID — EVEN IF YOU SKIPPED IT. When the opponent’s turn ends, a recap strip now says what happened: cards played, whether it attacked, the Vitality you lost and what you are on, units you lost, cards you drew — with a jump into the full log. Previously, pressing SKIP meant the board simply changed.',
      'SLOWER, ON PURPOSE. The narration speed dial used to change only the pause between lines while the animations themselves ran at full speed. Now the whole show slows down together — and there is a new slowest setting, CINEMATIC, for watching every move land. Your existing choice is preserved.',
      'FIX: the Grading Lab shipped last patch without ever being run through the layout harness. Adding it caught a real bug immediately — slabs were built out of nested buttons, which breaks keyboard and screen-reader navigation — plus one crash waiting to happen in the Collection. Both fixed, and the Lab is in the harness for good now.',
      'BALANCE: no card changed, seventh pass running. 47,616 fresh AI games across eight deck cohorts plus raised fuzz and chaos runs: ZERO rule violations, and every control cohort identical to v25 to the decimal. Two long-standing measurement questions moved: Sacred’s advantage is real but small (the big readings were deck luck), and Ruin-Walker Overseer’s pinned decks underperform in every cohort — flagged for the next balance pass.',
    ],
  },
  {
    version: 'The Slabs-And-Half-Points Pass (v25)',
    date: 'August 2026',
    items: [
      'NEW — THE GRADING LAB. Send spare cards off to be professionally graded and get them back sealed in a display slab. Three services with their own case styles and reputations: TIMELESS CARD AUTHORITY (the premier house — priciest fees, and its slabs command the highest resale premium), ALPHA MINT GRADING (serious grading at volume — 5+ cards in one submission get 20% off, 10+ get 35% off), and KEEPER STANDARD (cheapest and fastest — and known to grade a touch generously, which the resale market prices in). Pick your turnaround: 16-hour standard, 8-hour rush, or INSTANT for a serious premium.',
      'Grades run the standard 5\u201310 scale with half-points (a 9.5 exists; a straight 10 is the rare gem). A strong grade multiplies the card\u2019s quicksell price MANY times over \u2014 a gem-mint 10 in a TCA case sells for a small fortune \u2014 while a 5 barely covers the fee. That\u2019s the gamble. Graded slabs appear on their own GRADED CARDS shelf in your Collection, each in its service\u2019s case with the grade stamped on. Not feeling the case any more? CRACK THE SLAB and the raw card returns to your collection.',
      'Deck-locked and Serialized copies can\u2019t be sent for grading \u2014 same protections as quicksell \u2014 and grades are rolled at reveal time on the server, so there is no peeking.',
      'THE OPPONENT THINKS OUT LOUD EVERYWHERE NOW. Two spots still had the CPU acting instantly inside your own click \u2014 its reaction plays before clash damage and its answer to a card you just cast. Both now open with a visible \ud83e\udd14 thinking beat at your narration speed, honored by HOLD/STEP/SKIP like everything else.',
      'WHEN THE GAME SAYS NO, IT LOOKS LIKE A NO. Refused actions (illegal targets, unpayable costs, guard-rule violations\u2026) now flash a red shaking banner instead of the same yellow strip a success uses \u2014 and long explanations stay on screen long enough to actually read. The clash bar also shows each attacker\u2019s \u2694 Might right on the guard line, so the numbers you guard around are where the decision happens. The match screen also fully honors your device\u2019s reduced-motion setting now.',
      'FIX: a sold-out listing in Player Shops proudly announced itself as \u201cSOLD_OUT\u201d in three places. It reads SOLD OUT now. (The full screen-by-screen audit found the rest of the meta screens clean \u2014 the last three passes\u2019 fixes are holding.)',
      'BALANCE: no card changed, sixth pass running. 23,808 fresh AI games plus raised-volume chaos/fuzz suites: ZERO rule violations, every cohort identical to v24\u2019s numbers to the decimal. The authorized Mer-King adjustment stays reserved for a dedicated balance pass, per its own protocol. Full numbers appended to docs/BALANCE_SIM_FINDINGS_v24.md.',
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
