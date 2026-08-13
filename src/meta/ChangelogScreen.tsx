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
  {
    version: 'The Dawn-and-Dusk Pass (v22)',
    date: 'August 2026',
    items: [
      'THE OPPONENT’S DAWN AND DUSK NOW HAPPEN OUT LOUD. Four passes have each closed a place the opponent acted invisibly — its turn, its blocks, its answers on the stack — by asking which of its DECISIONS had no narration. Every decision had one. What was left is not a decision: it is the two phases the rules run for it. Between them they can FREEZE one of your units before it has played anything (Glaciate), erode your deck toward a deck-out loss (Entropic, Blighted), sweep your whole board (Scorched-Earth), heal it, grow its units and draw it cards. None of that wrote a single line anywhere. Its Dawn is now narrated on the board before its turn begins, the freeze names and rings the unit it took, and the Battle Log’s "since your last turn" divider has moved back to cover it.',
      'A beat aimed at something of YOURS now holds ~40% longer on screen. Most of an opponent’s turn is it improving its own board; the two or three beats where a unit of yours is frozen, weakened or hit are the ones you actually have to find on the board, and they were getting the same second and a bit as "Kuro plays a Tide Wellspring".',
      'Lines that name a card now light that card up even when no structured move sits behind them — "… was shattered", a Dawn freeze, a fizzle. Those were sentences with no ring.',
      'NEW: the Wellspring dots tell you which one to press. Seven small coloured circles whose only distinguishing text was a tooltip reading "Play a Void Wellspring (free)" — identical for all seven and invisible on a phone. Each now reports how many cards in your hand it would UNLOCK (the same measure the CPU uses for its own), the best one is ringed, and the recommendation is spelled out in the hint bar. They also got a proper touch target.',
      'FIX: two board controls were offered and then refused. A targeted Event with no legal target kept a live INVOKE button — the preview even quoted you a cost — and clicking it just printed a message. The seven Wellspring dots stayed clickable while a card was waiting to resolve, and refused with "One Wellspring per turn, in your own main phase", which was wrong about both halves of why it failed. Both now grey out and say the real reason. The stress driver found them the way it finds this kind of bug: it pressed the button, nothing happened, and it pressed it again for the rest of the match.',
      'FIX: lose by running out of cards and the defeat screen told you "You must Deal from an empty deck and loses." It is the only line in the game with two verbs in one sentence, and only the first one was ever being corrected.',
      'NEW: the opening-hand screen tells you if the opponent MULLIGANED, and to how many cards. It happens while that screen is being built, so the line went into a Battle Log you cannot open yet and was buried by the first turn — and a Leader that shipped its hand back is down a card before either of you has moved.',
      'NEW: ↻ REMATCH on the game-over screen. BACK TO MENU was the only way off it, so a second match meant three screens to re-pick what you had just chosen.',
      'FIX: the XP readout could print a negative number ("-2400/1200 XP TO LEVEL 13"). The bar beside it has been clamped for several passes; the text never was.',
      'BALANCE: no card changed, for the third pass running, and this time the diagnostic is the finding. Six deck cohorts (up from the standing four) put Mer-King first in ALL SIX and show its two measuring arms AGREEING for the first time — so it is not the measurement artefact Sentinel of the Nether Pit turned out to be. The caution flag those passes were read through fires on a quarter of all readings, which makes it no kind of filter; the one Leader that trips the signature it was actually built to detect is Ruin-Walker Overseer, which the test suite appears to be UNDER-rating. Full numbers in docs/BALANCE_SIM_FINDINGS_v22.md.',
      'Under the hood: the match stress driver had been clicking the first Wellspring dot every turn for its whole existence — the same colour for a whole match — so it spent most games building the wrong essence in front of a hand it could not cast, and every driven match since the harness was written ended around turn 7 against a headless average of 21. It also now re-bonds Items and presses ✕ CLEAR, and the screen audit finally measures the pack-opening reveal and summary, which it had been reporting as "one control" (the tear button).',
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
