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
    version: 'The Every-Button Pass (v29)',
    date: 'August 2026',
    items: [
      'FIX \u2014 THE BOARD WAS UNPLAYABLE SIDEWAYS. Turn a phone to landscape and twenty things you need were simply not there: your own Leader, the INVOKE LEADER button, your ash-pile, and every card in your hand. The board is built to be exactly one screen, and when it did not fit it did not shrink or scroll \u2014 it cut the rest off, silently, which looks exactly like the game choosing not to show you those things. It scrolls now, and only when it has to, so nothing changes on a screen it already fits.',
      'FIX \u2014 CONCEDING SHOWS YOU THE RESULT. Giving up used to drop you straight back to the menu: no result screen, no rewards, and if the game could not save the loss there was no way for it to tell you. A resignation now ends the match like any other one \u2014 the result screen, the credits and XP, and REMATCH.',
      'THE ATTACK BUTTON TELLS YOU WHAT CAN BLOCK IT. DECLARE ATTACK already showed your total Might and warned you when it was lethal. It now also counts how many of their units can legally guard what you have picked \u2014 flying, Nimble and exhaustion all taken into account \u2014 and when the answer is none, it says UNGUARDABLE.',
      'END TURN WARNS YOU ABOUT AN UNPLAYED WELLSPRING. You get one a turn and it does not carry over, so ending a turn without playing one leaves you a Location behind for the rest of the match. The button says so, next to the count of cards you could still cast.',
      'YOU CAN TELL WHEN THE OPPONENT DID NOTHING. A turn where they play nothing and attack with nothing used to produce no narration at all \u2014 a second of \u201cthinking\u201d and then your turn back, which is indistinguishable from something breaking. It says so now, and the turn summary says it too if you skipped past it. When they hold priority over a card you cast and decline to answer, the board mentions that as well.',
      'FIX \u2014 BIG TEXT AND SMALL SCREENS, ACROSS NINE SCREENS. If you run a larger font in your browser, ten places pushed content off the side of a phone: search boxes, tab rows, the How to Play glossary, the Showroom. All fixed, and the check runs on every release now. The sign-in screen \u2014 the first screen in the game \u2014 turned out never to have been measured at phone width at all; its show-password button was a third of the minimum tap size.',
      'BALANCE: no card changed, tenth pass running. 142,848 fresh AI games \u2014 the usual eight cohorts, run three times over three completely different sets of test decks \u2014 plus 1,200 fuzzed and 600 chaos matches: ZERO rule violations, and the control cohorts identical to last patch to the decimal. The three-draw comparison finished what last patch started: only three of the nine Leaders keep their place in the league table when the test decks are re-rolled, and the single statistic that has driven Leader balance arguments for four patches names a different Leader every time it is asked. It is retired.',
    ],
  },
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
];

export function ChangelogScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      {/* flex-wrap: a back button and a title on one unbreakable line is
          wider than a phone at a large browser font size (v29's text-resize
          sweep read 432px against 375). Every other screen's header goes
          through MetaHeader; this one is hand-rolled and was the only one that
          could not break. */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 bg-[var(--c-ink)] px-4 py-2.5">
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
