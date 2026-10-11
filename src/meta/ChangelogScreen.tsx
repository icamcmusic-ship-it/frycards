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
// This board covers everything since the FryCards Poker launch (v35), one
// entry per round, newest first. `CHANGELOG.md` is the complete history.
// NewsCenterScreen reads ENTRIES[0] for its headline, so the newest entry must
// stay first.
export const ENTRIES: ChangelogEntry[] = [
  {
    version: 'Polish & Balance (v35.4)',
    date: 'October 2026',
    items: [
      'NEW THEMES. Five new table themes, plus a dark INK theme.',
      'CLEANER CHIPS. Starting stacks are whole numbers again: 480, 800 or 1,280 chips by match length. Chips slide into the pot and out to the winner.',
      'RELAXED BY DEFAULT. Table timers now start OFF \u2014 turn them on in Settings if you want a clock.',
      'EASIER TO READ THE CPU. Clearer labels and callouts for what each CPU seat is doing.',
      'BALANCE PASS. Many powers retuned and new keywords added. Card keyword weights and rarity were rebalanced, so some cards\u2019 powers have changed.',
      'MISSIONS. Missions now rotate, and new collection missions reward building out your cards.',
      'DIFFICULTY PAYS. Rewards now scale with difficulty: easier tables pay \u00d70.8, normal \u00d71, harder tables \u00d71.15.',
      'MORE WAYS TO PLAY. Deck formats, a weekly rule twist and the DAILY TABLE, plus quick wins to get you into a match faster.',
      'YOUR PRESETS. Bet presets are now editable in Settings.',
      'CARD FACES. Small cards hide flavour text so the rules stay readable; tap any card to read all of it.',
    ],
  },
  {
    version: 'The Audit Round (v35.3)',
    date: 'October 2026',
    items: [
      'MATCH BUGS FIXED. No more inspector popping up on hover, no double-click acting twice, response windows that cannot stall the table, a raise slider that reaches all-in, and many rules edge cases settled.',
      'FOLLOW THE CPU. Every seat shows its last action in a speech burst, one loud ON THE CLOCK seat, a ticker of what just happened, a cast spotlight that says what the card did, pause and step, and a tap-a-seat summary of its hand.',
      'TABLE SETTINGS. Timers, auto-deal, pause when a power targets you, amounts in big blinds, don\u2019t fold when check is free, confirm big bets, pre-action buttons, pot odds, a SHARK difficulty and a DEFAULT TABLE in Settings.',
      'FAIRER REWARDS. Payouts now account for table size and how long you lasted, and a reload never loses a finished match\u2019s reward.',
      'GAME OVER SCREEN. Your match in numbers, your place against last match, and SHARE RESULT.',
      'MORE WAYS TO PLAY. RANDOM FROM MY CARDS, practice tables with any deck code, replay seeds, challenge links, a weekly FEATURED LEADER, and PLAY WITH IT on the Card of the Day.',
      'DECK BUILDER. Records and notes per deck, auto names, saved versions, sample decks, gap-filler suggestions with an ADD button, unowned cards you can wishlist, and power-hand odds against a Location.',
    ],
  },
  {
    version: 'FryCards Poker (v35)',
    date: 'October 2026',
    items: [
      'FRYCARDS IS A POKER GAME NOW. Matches are pot-limit Texas Hold\u2019em freezeouts for 2 to 6 seats against CPU players, with blinds that rise on a clock. Pick QUICK (~12 min), STANDARD (~25 min) or DEEP (~40 min). The old card battler \u2014 Essence, Wellsprings, Vitality, the Clash \u2014 is retired.',
      'YOUR DECK BENDS THE POKER. A deck is a Leader, one Location and 16, 24 or 36 power cards: Units \u2605, Items \u2699 and Events \u03df. Casting is public \u2014 everyone sees the card \u2014 and its chips go into the pot, so every cast is also a bluff. Peek at a hole card, redraw your own, drain a rival\u2019s stack, or fake it with a Feint.',
      'LOCATIONS ARE THE TABLE\u2019S WEATHER. Every seat\u2019s Location joins a shared rotation with a two-hand forecast: Bomb Pot, Pineapple, Fog, Happy Hour, Tilt Zone and twelve more, plus a Plain Table each cycle.',
      'NERVE AND LEADERS. Every seat has a public nerve meter. Your Leader\u2019s two abilities spend or build it, once per hand. Hit zero and you tilt: your Leader locks and powers cost more.',
      'REWARDS PAY BY PLACE. Finish 1st for 100 credits in Standard, down to 40 for last \u2014 never by chip count. Quick pays half, Deep one and a half.',
      'YOUR COLLECTION IS SAFE. Every card keeps its rarity, name, art and flavor text. Old 60-card decks and deck links no longer work: build a new deck in the Deck Builder.',
      'NEW TO POKER? How to Play now teaches Hold\u2019em from zero (hand ranks, betting rounds, blinds, pot-limit, side pots), and your first practice game has a coach that explains one idea at a time. Playing cards by Kenney (kenney.nl).',
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
