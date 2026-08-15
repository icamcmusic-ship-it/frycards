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
  {
    version: 'The Numbers-Find-Their-Beats Pass (v24)',
    date: 'August 2026',
    items: [
      'FIX (the big one): a rare response-window sequence could FREEZE the match — priority was yours, but no PASS button, no castable card, no tappable Location, only CONCEDE. It happened when the opponent’s answer to your play put a playable Quick Event into your own hand (say, a dies-trigger drew you one) after the game had already passed for you once. Every way back into that window now brings the PASS button with it. Two related crash-recovery paths that could land you on a board where nothing was pressable were fixed the same day.',
      'THE DAMAGE NUMBERS NOW LAND ON THEIR MOMENTS. Every −N/+N from the opponent’s turn used to fire during the "🤔 thinking…" bubble — all at once, on the final board, gone seconds before the narration described the hits. Each float now waits and pops exactly when its beat is on screen. Beats about a unit of yours that DIED during the turn also finally get the long dwell time — they were the one kind of beat running short.',
      'FIX: pressing PASS after starting a target pick left the red PICK A TARGET bar alive — and a later click on a still-ringed card would cast the very card you had decided to hold. PASS now abandons the pick. SKIP during the opponent’s thinking pause also actually skips now, instead of needing a second press.',
      'MARKETPLACE: being outbid no longer makes the auction VANISH from MY LISTINGS & BIDS at exactly the moment you would rebid — the row stays, tagged OUTBID. A pending trade can no longer age out of the fetch window into a limbo neither party could accept, decline or cancel. One network blip no longer pins a permanent "couldn’t load" banner over live data.',
      'SHOPS & COLLECTION: the close-shop refund message actually appears now; a busy shop owner’s own sales no longer push MY PURCHASES (and the rating window) out of view; the shop card picker defaults to Foil when your foils are the only spares instead of dead-ending on "of 0 spare"; sell buttons wait for the refreshed counts so a fast double-click can’t sell copies you no longer have; pack HAUL VALUE stops counting serialized pulls it can never quicksell.',
      'QOL: you can CONCEDE from the opening-hand screen (it used to cover the only exit); the clash guard lines stay on screen while you decide whether to counter mid-clash; the guard-step message tells the truth ("assign guards first — the reaction window opens after you confirm"); the ON THE PLAY / ON THE DRAW badge now shows on phones and taps to explain itself; small badge tooltips stop being cut off by the board edge; Shift+Enter reads your own Sanctum without spending its tap.',
      'NEW (under the hood): three EVENT keywords exist in the engine — Kindle (Ember: 1 damage to the enemy player as the Event resolves), Tailwind (Gale: recover a tired unit, or a spent Location), Luminous (Light: restore 1 Vitality). NO card carries them yet. The lab run that previewed printing them caught Tailwind’s first design activating ZERO times across two full cohorts — correct code, dead text — so it was redesigned before ever reaching a card. Full numbers in docs/BALANCE_SIM_FINDINGS_v24.md.',
      'BALANCE: no card changed, fifth pass running. The authorized Mer-King adjustment stays reserved for a dedicated balance pass (this one carries engine and UI work, which its measurement protocol forbids). All control cohorts identical to v23 to the decimal; 0 rule violations across nine ~6,000-game runs.',
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
