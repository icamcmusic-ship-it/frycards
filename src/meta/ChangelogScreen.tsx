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
    version: 'FryCards Poker (v35)',
    date: 'October 2026',
    items: [
      'FRYCARDS IS A POKER GAME NOW. Matches are pot-limit Texas Hold\u2019em freezeouts for 2 to 6 seats against CPU players, with blinds that rise on a clock. Pick QUICK (~12 min), STANDARD (~25 min) or DEEP (~40 min). The old card battler \u2014 Essence, Wellsprings, Vitality, the Clash \u2014 is retired.',
      'YOUR DECK BENDS THE POKER. A deck is a Leader, one Location and 16, 24 or 36 power cards: Units \u2605, Items \u2699 and Events \u03df. Casting is public \u2014 everyone sees the card \u2014 and its chips go into the pot, so every cast is also a bluff. Peek at a hole card, redraw your own, drain a rival\u2019s stack, or fake it with a Feint.',
      'LOCATIONS ARE THE TABLE\u2019S WEATHER. Every seat\u2019s Location joins a shared rotation with a two-hand forecast: Bomb Pot, Pineapple, Fog, Happy Hour, Tilt Zone and twelve more, plus a Plain Table each cycle.',
      'NERVE AND LEADERS. Every seat has a public nerve meter. Your Leader\u2019s two abilities spend or build it, once per hand. Hit zero and you tilt: your Leader locks and powers cost more.',
      'REWARDS PAY BY PLACE. Finish 1st for 100 credits in Standard, down to 40 for last \u2014 never by chip count. Quick pays half, Deep one and a half.',
      'YOUR COLLECTION IS SAFE. Every card keeps its rarity, name, art and flavor text \u2014 and flavor text is now always shown on the card. Old 60-card decks and deck links no longer work: build a new deck in the Deck Builder.',
      'NEW TO POKER? How to Play now teaches Hold\u2019em from zero (hand ranks, betting rounds, blinds, pot-limit, side pots), and your first practice game has a coach that explains one idea at a time. Playing cards by Kenney (kenney.nl).',
    ],
  },
  {
    version: 'The Shop Floor (v31)',
    date: 'October 2026',
    items: [
      'ECONOMY REBALANCED — QUICKSELL PRICES ARE LOWER, ON PURPOSE. Opening a Booster Pack and quickselling everything paid back about 141% of the pack’s price, and a Booster Box about 177% — the packs were printing credits. Quicksell is now Common 4, Uncommon 10, Rare 40, Super-Rare 120, Ultra-Rare 300, Full-Art 500, Alt-Art 900, Mythic 1,500 (foils still ×2.5). Nothing you own was taken away; selling it back to the game pays less.',
      'LEVELS COME MUCH FASTER. Each level needs 2.5× less XP than before, and every account was moved up to its new level and paid the rewards for the levels it skipped. A level-up now pays 75 credits (plus 10 vouchers every 5th level). Player Shops unlock at level 20 instead of 50.',
      'NEW: THE SHOP FLOOR. CPU customers now walk into your Player Shop about every 90 minutes and ask to buy one of your listings — or offer a card from their binder in trade. Accept, turn them away, or haggle once: push past what they will pay and they may walk out.',
      'NEW: CPU COLLECTORS BID ON AUCTIONS. Usually up to about +25% over quicksell, sometimes far less, now and then far more. Their winning bids count toward a card’s market price.',
      'GRADED SLABS GOT A LOT MORE INTERESTING. Click a slab in your Collection for its full details — grade, service, condition, value — and to sell, crack, view in 3D, or pin up to three to your profile. Low grades now LOOK low: soft corners, whitened edges, creases, a cracked case. MINT, MINT+ and GEM MINT come back in holo, prism and gold cases.',
      'NEW: WEEKLY BINGO. A fresh 5×5 card of collection goals every Monday, under Missions. Squares fill themselves as you collect \u2014 open packs, trade, grade \u2014 and every row, column or diagonal pays 120 credits. Fill the whole card for 750 credits and 5 vouchers.',
      'NEW: CPU DIFFICULTY. Pick EASY, NORMAL or HARD in Settings. Easy misses attacks and blocks and never holds an answer; Hard plans two turns of combat and always keeps a reaction up. Rewards are the same at every level.',
      'BALANCE: SENTINEL OF THE NETHER PIT IS BACK IN THE GAME. Its removal ability costs 2 Resolve again instead of 3. The extra point was added when our testing read Sentinel as the strongest Leader; measured properly on nine deck recipes it was the weakest. Nothing else changed: a fresh 16,000-game check found no keyword far enough out of line to touch.',
      'SETTINGS: HAND ORDER can be set from Settings now, and the MOTION setting finally reaches the match board, card effects, the Showroom and pack opening — REDUCED calms them all, and FULL overrides your device’s setting.',
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
