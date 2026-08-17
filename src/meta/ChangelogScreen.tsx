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
    version: 'The Showroom Pass (v27)',
    date: 'August 2026',
    items: [
      'NEW \u2014 THE 3D SHOWROOM. Its own page, off the main menu, where a card stops being a picture and becomes an object. Drag it and it turns \u2014 all the way round, front to edge to back and out the other side, because it has thickness now. Tilt it over the top edge or under the bottom one. Zoom from across the room to close enough to read the smallest line of rules text. Flick it and the turntable coasts. Or leave it turning by itself at one of three speeds. Wheel, pinch, arrow keys, +/\u2212, F to flip, R to reset, or the on-screen controls \u2014 whatever you have.',
      'SUPER-RARE AND ABOVE GET THEIR OWN ROOM. A Super-Rare stands in an ION SWEEP, an Ultra-Rare in a GILDED HALL, a Full-Art in an AURORA VAULT, an Alt-Art in a PRISM CHAMBER, a Mythic in an EMBER FORGE \u2014 each with its own light, its own colour, and its own card effects: a ring of motes orbiting in the space around the card, a rim light that swings as you turn it, and a floor pool in the room\u2019s colour. Common through Rare get a clean photographer\u2019s studio, on purpose: the special rooms mean nothing if everything has one.',
      'YOUR SLABS STAND IN THERE TOO. A graded slab is a much chunkier object than a card, and until now it could only ever be looked at flat-on. Now it stands in the same room and turns like everything else. Reach the Showroom from the menu, from VIEW IN 3D in the card inspector, or from any slab on your Collection shelf or in the Grading Lab vault.',
      'FIX \u2014 THE SLOWEST SPEED WAS SHOWING THE SHORTEST ANIMATIONS. Last patch made every combat animation slow down with the narration dial. It did not move the timers that take those animations OFF the screen \u2014 so on CINEMATIC the phase banner, the damage numbers and the hit flash were cut off at about a third of the way through. The setting that exists to let you watch a move land was the one that showed you least of it. Both halves come from one number now.',
      'FIX \u2014 the speed dial\u2019s own tooltips, and the How to Play page, still listed the three-speed ladder from before CINEMATIC existed, so the slowest setting in the game was undiscoverable from the two controls that cycle to it.',
      'SORT YOUR HAND. The hand dock has always laid cards out in the order you drew them. A button on the dock now switches between DRAWN, PLAYABLE (everything you can actually cast right now, first) and COST (cheapest first). Your choice is remembered.',
      'A PROGRESS BAR FOR THE OPPONENT\u2019S TURN, next to the HOLD / STEP / SKIP buttons that act on it \u2014 the count existed, but it was at the top of the board while the controls were in the middle.',
      'BALANCE: no card changed, eighth pass running. 47,616 fresh AI games across the same eight cohorts, plus 1,200 fuzzed matches and 600 chaos matches: ZERO rule violations, and the three control cohorts reproduce last patch to the decimal \u2014 the engine is untouched. The cross-cohort aggregator also settled an open question: nearly every Leader carries one bad deck recipe, so \u201cthat one deck is a lemon\u201d cannot explain why Ruin-Walker Overseer alone underperforms in all eight cohorts. Still flagged, still not acted on.',
    ],
  },
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
