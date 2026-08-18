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
    version: 'The Fat-Finger Pass (v28)',
    date: 'August 2026',
    items: [
      'FIX \u2014 THE TINY THING ON THE CARD WAS STEALING YOUR TAPS. Every card face prints little keyword pills and cost pips you can tap for an explanation. On a full-size card that is exactly right. On a battlefield unit they are about nine pixels tall, they sit on top of the card, and on a phone they win \u2014 so reaching for a unit to send it into the attack, or for a card in the deck builder to add it, opened a rules popover instead. Below full size those pills are just printing now: the whole card is one clean target, and the big version of the card (tap it to zoom) still explains every keyword on it. The first-time keyword tip still pops up on its own the way it always has.',
      'FIX \u2014 AND WE MEASURED THE REST WHILE WE WERE THERE. Every button, link and checkbox on all 24 screens got measured against the accessibility minimum for a touch target. Over 1,300 were under it. All of them are fixed \u2014 including the pack screen\u2019s \u201cjust tear it open for me\u201d link, the submission form\u2019s agreement checkbox, the player names in the Social feed and the Showroom\u2019s search box. The check now runs on every release, so they cannot quietly come back.',
      'THE CLASH BUTTONS ALL DO THE MATHS NOW. DECLARE ATTACK has told you when your swing is lethal since two patches ago. CONFIRM GUARDS now tells you how much is still getting through \u2014 at every stage of the assignment, not just before you have blocked anything \u2014 and says LETHAL when that is what it is. RESOLVE CLASH says DEAL 7 when you are attacking and TAKE 7 when you are defending. No more counting Might off the cards and comparing it to a number at the other end of the board.',
      'YOU CAN SEE WHAT THE OPPONENT KILLED. The opponent\u2019s turn is replayed to you line by line \u2014 but by the time \u201cyour X was shattered\u201d appears, X is already off the board, so the one line that mattered most was the only line with nothing to point at. Now the card itself is held up in the middle of the board for that beat, marked UNIT LOST, greying out and tipping over as it goes. It slows down with the narration dial like everything else.',
      'SHEDDING AT END OF TURN IS TIDIER. The shed picker now lays your hand out in whatever order you have the hand dock set to, and the confirm button tells you how many more you still need to pick instead of just sitting there greyed out.',
      'BALANCE: no card changed, ninth pass running \u2014 and a long-running question finally answered. 95,232 fresh AI games (the usual eight cohorts, run twice over two completely different sets of test decks), plus 1,200 fuzzed and 600 chaos matches: ZERO rule violations, control cohorts identical to last patch to the decimal. The answer: the test decks were doing more of the talking than the Leaders were. Re-roll them and the Leader league table barely half agrees with itself \u2014 which closes the Ruin-Walker Overseer question (it was one bad test deck, not a weak Leader) and cancels a planned Mer-King change that turned out to be measuring the same thing.',
    ],
  },
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
