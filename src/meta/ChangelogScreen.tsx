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
    version: 'The Shop Floor (v31)',
    date: 'October 2026',
    items: [
      'ECONOMY REBALANCED — QUICKSELL PRICES ARE LOWER, ON PURPOSE. Opening a Booster Pack and quickselling everything paid back about 141% of the pack’s price, and a Booster Box about 177% — the packs were printing credits. Quicksell is now Common 4, Uncommon 10, Rare 40, Super-Rare 120, Ultra-Rare 300, Full-Art 500, Alt-Art 900, Mythic 1,500 (foils still ×2.5). Nothing you own was taken away; selling it back to the game pays less.',
      'LEVELS COME MUCH FASTER. Each level needs 2.5× less XP than before, and every account was moved up to its new level and paid the rewards for the levels it skipped. A level-up now pays 75 credits (plus 10 vouchers every 5th level). Player Shops unlock at level 20 instead of 50.',
      'NEW: THE SHOP FLOOR. CPU customers now walk into your Player Shop about every 90 minutes and ask to buy one of your listings — or offer a card from their binder in trade. Accept, turn them away, or haggle once: push past what they will pay and they may walk out.',
      'NEW: CPU COLLECTORS BID ON AUCTIONS. Usually up to about +25% over quicksell, sometimes far less, now and then far more. Their winning bids count toward a card’s market price.',
      'GRADED SLABS GOT A LOT MORE INTERESTING. Click a slab in your Collection for its full details — grade, service, condition, value — and to sell, crack, view in 3D, or pin up to three to your profile. Low grades now LOOK low: soft corners, whitened edges, creases, a cracked case. MINT, MINT+ and GEM MINT come back in holo, prism and gold cases.',
      'SETTINGS: HAND ORDER can be set from Settings now, and the MOTION setting finally reaches the match board, card effects, the Showroom and pack opening — REDUCED calms them all, and FULL overrides your device’s setting.',
    ],
  },
  {
    version: 'The Keyboard Pass (v30)',
    date: 'August 2026',
    items: [
      'FIX \u2014 EVERY POP-UP IN THE GAME LEAKED YOUR KEYBOARD. Fifteen dialogs \u2014 the mulligan, the concede confirm, the shed picker, both card zoom views, and nine more across the menus \u2014 let the Tab key walk straight out of them and onto the page behind, which is only hidden to look at. From the opening mulligan you could Tab onto the board and reach the CONCEDE button. Focus now stays inside a dialog until you close it, everywhere, and a test stops the next one shipping without it.',
      'THE WHOLE GAME IS NOW PLAYABLE FROM THE KEYBOARD, AND WE CHECKED. Every screen and the match board are walked with the Tab key on every release: every button has to be reachable, has to show a focus ring when you get there, and focus is never allowed to get stuck. All 29 screens and the board pass at 100%.',
      'SKIP TO MAIN II NOW WARNS YOU. Leaving the Clash without attacking throws away the whole combat step, and the button read simply \u201cnext\u201d. It counts your ready attackers now \u2014 SKIP TO MAIN II \u25b8 \u00b7 3 CAN ATTACK \u2014 the same way END TURN already warns about unspent essence and an unplayed Wellspring.',
      'THE SPACE SHORTCUT IS WHERE THE BUTTON IS. Space presses whatever the clash bar is offering \u2014 attack, guard, resolve, end turn \u2014 and the hint for it was parked at the far left of the bar, hundreds of pixels from the button it refers to, and stayed up in states where the key did nothing. It is a small SPACE tag on the button itself now, and How to Play finally explains both it and what Escape cancels.',
      'THE OPPONENT\u2019S MOVES ARE READ OUT. If you use a screen reader, the summary of the opponent\u2019s turn was announced and not one of the moves in it \u2014 the whole turn played in silence. Each move is announced as it happens now.',
      'FIX \u2014 TWO OF OUR OWN TEST TOOLS WERE PRESSING THE WRONG BUTTON. The automated match driver has \u201cbeen exercising\u201d the narration speed dial since one patch and the Leader ability pills since another; both clicks were landing somewhere else entirely, so neither control had ever actually been tested. Found by counting which controls the driver offers against which it presses \u2014 948 offers and zero presses for one of them.',
      'BALANCE: no card changed, eleventh pass running. 190,464 fresh AI games \u2014 the usual eight cohorts, run four times over four completely different sets of test decks \u2014 plus 1,200 fuzzed and 600 chaos matches: ZERO rule violations, control cohorts identical to last patch to the decimal. The question left open last patch is answered: Mer-King and Avatar of the Abyss really are the top two Leaders \u2014 first and second in all four draws \u2014 but by how much is still pure deck roll, so nothing is being changed on it.',
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
