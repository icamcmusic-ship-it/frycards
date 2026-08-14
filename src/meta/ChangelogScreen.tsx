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
  {
    version: 'The Every-Button-Tells-The-Truth Pass (v23)',
    date: 'August 2026',
    items: [
      'EVERY CONTROL ON THE BOARD NOW TELLS THE TRUTH. Three controls could still offer a move the rules were going to refuse: ⚜ INVOKE LEADER stayed lit with a card waiting to resolve — and clicking it exhausted your Locations for a cost that was never going to be paid; a Leader ability could walk you through a whole target pick before bouncing with "Illegal target"; and 💠 RE-BOND had no disabled state at all. All three now grey out and name the actual reason, the same treatment every other control got over the last two passes. Four controls could also still be pressed into the MIDDLE of the opponent’s narrated turn; they wait now.',
      'THE CARD YOU ARE ASKED TO ANSWER IS NOW SHOWN TO YOU. When the opponent’s play opened your response window — the one moment the game stops and waits for you — that exact play was the one with no card spotlight and no rings, just a log line and a PASS button. It gets the full treatment now.',
      'NOTHING CHANGES THE BOARD IN SILENCE ANY MORE. A Sanctum’s "At Dusk" trigger could damage your unit or eat your deck with no line anywhere; Wildfire took 2 Vitality with only "…was shattered." to explain it; Siphon raised the opponent’s life "from nowhere" mid-clash. All three now write a line — which means they get narrated, ringed and floated like everything else.',
      'YOUR OWN DAWN IS YOURS AGAIN. It resolves at the tail of the opponent’s turn, so "You draw a card at Dawn" was playing in the red "opponent is acting" bubble. Those beats now show in your yellow, labelled ☀ YOUR DAWN.',
      'FIX: messages stopped covering each other. "Bond set — now pick a target for its effect." was painted UNDERNEATH the red targeting bar it explains; on a phone that bar could also push its own ✕ cancel off the screen edge. The narration bubble, targeting bar and message banner now stack in one column that fits the screen.',
      'FIX: five shop/collection bugs — the Bounties SELL button could offer a sale the server would refuse when your last spare copy was deck-locked AND Serialized; the Marketplace bid dialog kept quoting a stale price after a rival bid (and stayed pressable after a buyout); ✦ VIEW FOIL flipped the card but not the market value beside it; the pack summary’s HAUL VALUE ignored the cards you just quicksold from that very screen; and a pack priced at 0 vouchers would have rendered a free buy button.',
      'QOL: the ash-pile opens as a bottom sheet on phones instead of covering the whole board; a held narration says ❚❚ HELD on the bubble itself; the CPU crashing mid-turn now hands you a real turn instead of a board where only one button works.',
      'NEW (under the hood): three LEADER keywords exist in the engine — Onslaught (Ember: your attackers hit +1 harder), Beacon (Light: your Leader restores 1 Vitality at Dawn), Dread (Void: enemy units get −1 Might). NO card carries them yet: they are implemented, tested and priced so a future set can print them deliberately instead of ad hoc. A measured preview of that print is in the findings doc.',
      'BALANCE: no card changed, fourth pass running, and both open Leader questions are ANSWERED. Mer-King: first in all EIGHT cohorts with both measuring arms agreeing — the adjustment is now formally authorized for a dedicated balance pass. Ruin-Walker Overseer: NOT weak after all — one of its nine fixed test decks turns out to be a permanent dud (15.6% across every cohort) dragging its average; without it the kit is mid-field. Six of nine Leaders carry at least one such dud deck, and the test harness now flags them automatically. Full numbers in docs/BALANCE_SIM_FINDINGS_v23.md.',
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
