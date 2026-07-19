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
const ENTRIES: ChangelogEntry[] = [
  {
    version: 'Rising Tide Update',
    items: [
      "Locations were quietly a slightly bad deal for over a year of updates — filling that deck slot with a cheap Unit instead usually won more. A dedicated round of testing found the real fix: their on-cast board buff, +3 instead of +2. Locations are now a genuinely good pick, and every Location keyword (Excavate, Foothold, Contested) got stronger right along with them.",
      "Crescendo got rebuilt, not just re-buffed again: it used to only reward rolling MULTIPLE sixes in the same turn, which is rare — so four updates in a row of raising its power barely moved the needle. Now it just needs one six rolled all turn, whether or not you actually spent that die on the card. Noticeably stronger.",
      "Mer-King's Twin Heal deck got its first card-by-card checkup and a few of its weakest cards were quietly strengthened — it's meaningfully better now. Its sibling deck, Avenge Swarm, got the same treatment but didn't respond as well; we're still looking for its real fix.",
      "The CPU's combat AI had a subtle blind spot: when a single attack could kill either of two enemy Units, it would sometimes trade into whichever one happened to be played first instead of the more valuable one. Fixed — it now always takes the better kill.",
      "Bug-hunt pass: a currency typo bug (typing \"50\" submitting 5,000 instead) had crept back into five different price boxes — found and fixed everywhere. Several \"stuck forever\" buttons (a failed claim, purchase, or save leaving buttons disabled with no way to recover but a reload) fixed across the Store, Marketplace, Social, News Center, and Player Shops, plus a Collection quicksell button that could offer to sell copies you didn't actually have free.",
      "Small QoL: confirm-before dialogs on a few more destructive actions (mystery pool submission, mystery pack purchase, replacing a deck via QUICKBUILD), retry buttons on a couple of screens that used to just get stuck on \"Loading…\" after a network hiccup, and a live countdown on Marketplace auctions.",
    ],
  },
  {
    version: 'Wall-Breaker Update',
    items: [
      'Balance pass (67,000+ simulated games): Guard Units print +2 HP instead of +3 — a dedicated round of testing finally found a change that both cools down the strongest "wall" decks and lifts the weakest ramp decks at the same time. Crescendo got another power bump.',
      'Honest heads-up: this hit Mer-King harder than the other five Leaders since all of his decks lean on Guard — we tried a few ways to compensate his kit directly and are still tuning it; expect another pass at his weaker decks specifically.',
      'The CPU\'s decision-making was audited from every angle this pass: after splitting out every reason it might skip its Leader Ability, it turns out there are no real gaps left to fix — every skip is either a legal rule restriction or the CPU correctly prioritizing something better.',
      'Bug-hunt pass: fixed a handful of stuck-loading-forever bugs across several menu screens, a foil "quick sell" button that could offer to sell more copies than you actually had free, a couple of memory leaks, and added Escape-to-close and alt text where they were missing. Small additions: a confirmation before signing out of a real account, a password show/hide toggle, and clearer empty/loading states in a few screens.',
    ],
  },
  {
    version: 'Eclipse Update',
    items: [
      'Big rule change: Momentum is gone. A dedicated on/off test across thousands of simulated games showed the comeback rule never actually helped anyone come back — the game is tighter and a full round faster without it. Every turn is exactly five dice again.',
      'Balance pass (44,000+ simulated games): Leader win rates are the closest EVER measured — all six within 8 points. Legendary Diver reaches Resolve 2, Avatar of the Abyss\'s Ultimate was trimmed, cheap "exact number" defensive Units came down a stat point, Anchor units gained another HP, Crescendo got stronger, and Chrono-Phalanx was redesigned into an Overrun trophy body.',
      'Echo is cheaper: only Commons and Uncommons still pay the extra-discard cost to re-cast from your Discard. Rare and above just need the die.',
      'Brand-new premium card looks: Ultra-Rares now print in the "Aurora Vault" template (chromatic teal-and-violet lattice with counter-rotating light-traces and an aurora sweep on hover), and Mythics in "Void Eclipse" (a slow-turning nebula border, an eclipse-corona sigil, a drifting starfield, and amethyst stat gems).',
      'Deck rules are enforced for real now: Mythics cap at 1 copy per deck and Super-Rare/Full-Art/Ultra-Rare at 2 — both in the deck builder and when importing a deck code. The rules always said so; the buttons finally agree.',
      'Quality of life: Fatigue damage announces itself with a proper banner, the Battle Log can expand into a tall scrollback, and the end-of-turn discard picker has a SUGGEST button that auto-selects sensible cuts.',
    ],
  },
  {
    version: 'Fatigue Update',
    items: [
      'Big rule change: running out of cards no longer loses the game instantly. Instead your Leader takes growing Fatigue damage (1, then 2, then 3...) each turn you cannot draw. A quarter of all simulated games were ending on the old sudden-death rule, and it quietly punished every card-draw effect.',
      'Balance pass (verified across 45,000+ simulated games): Leader win rates are the closest ever measured. Twin cards were over-statted for their real cost and came down; Steel now absorbs less per turn; Anchor units gained +2 HP so ramp decks can actually survive to ramp.',
      'The CPU got smarter: it accounts for Toll before going face, saves its board-wide-buff Ultimate until it has a board, and stops paying cards to re-cast cheap Echo spells.',
      'Even fancier premium cards: Ultra-Rares now print with an engraved "Gilded Reliquary" frame with a moving light-trace, and Mythics with a "Molten Sovereign" treatment — magma-vein borders, a flame-crown sigil, and embossed stat gems. Tilt them in the inspector for the full effect.',
      'Bug fixes in matches: the target picker no longer offers targets the Shinobi Leader rule forbids, Echo with an empty hand no longer gets stuck, Bind shows a pending chain badge the turn it lands, and How to Play now matches the current rules (including Fatigue).',
      'Bug fixes in menus: buttons no longer accidentally submit the sign-in form, auction/fixed-price sell forms no longer interfere with each other, mystery-pack pools must be re-validated after edits, and bids below the 5% minimum raise are caught before they reach the server.',
      'Quality of life: Escape closes more dialogs, stale notices clear when switching store tabs, and pack counters update immediately after purchases.',
    ],
  },
  {
    version: 'Balance & Bug-Hunt Update',
    items: [
      'Big balance pass, verified across three full 22,560-game simulations: Leader win rates are the closest they have ever been (top five within 2 points). Full details in the rulebook changelog.',
      'Fixed a long-standing bug where two Leader abilities never actually worked: Legendary Diver\'s tempo grant (the next Unit you cast after his Ability skips summoning sickness and now gets +2/+2) and Apex Nanite Shinobi\'s "can\'t buff the same Unit twice in a row" restriction are finally live.',
      'Keyword changes: Avenge now caps at +2/+2 per card; Overrun punches through half its ATK instead of 1; a Unit\'s Steel and Bulwark together prevent at most 4 damage per hit; Momentum now also draws you a card; Locations give a bigger +2/+2 (or +3/+3 at Rare+) on cast.',
      'Cards costed as "one die showing exactly N" had over-tuned stats for how easy that cost really is — those Units were rebalanced. Straight-gated cards (Small/Large Straight) got stronger stats and effects to match how much harder straights are to roll than pairs.',
      'The CPU no longer rerolls away dice that pay for its exact-cost cards, and plays them far more often.',
      'New premium card looks: Ultra-Rare cards now print with an animated gold-leaf "Gilded Relic" frame, and Mythics with a "Living Inferno" treatment — embers rising off the card face.',
      'Fixed every credit price box (marketplace bids, shop listings, trades, mystery packs) silently multiplying what you typed by 100 — typing 500 used to submit a 50,000-credit bid.',
      'Combo-gate cost popups now show your real odds of hitting the pattern with two rerolls.',
      'Lots of smaller fixes: wasted rerolls after Snap casts, wrong Echo messages, a stale How to Play (now matches the current rules), the Momentum bonus die not animating, deck validation letting you keep a Leader you no longer own, and card animations now respect your system\'s reduced-motion setting.',
    ],
  },
  {
    version: 'Full-Art Update',
    items: [
      'Crafting and Disenchanting are gone, along with the Shards currency entirely. Any spare copy that would have converted to Shards past your per-rarity copy cap now converts straight to credits instead.',
      'Fixed Add to Showcase not actually showing your pinned cards to other players — other profiles never loaded correctly due to a data access bug.',
      'Full-Art cards can now be short looping video clips, not just still images, and the template renders the art edge-to-edge behind the card text instead of in a boxed frame.',
      'The four original Full-Art cards (Crystalline Metropolis, Submerged Archives, Admiral Iron-Claw, Crown of the Reef) moved to Super-Rare. Two new Full-Art cards were added: "Where the Deep Meets the Sky" and "Faye\'s True Face" (video).',
    ],
  },
  {
    version: 'Collector Update',
    items: [
      'New rarity order: Full-Art now sits between Super-Rare and Ultra-Rare (it was previously above Ultra-Rare). Four cards returned to the Full-Art tier; prices, shard costs and pack odds all follow the new ladder.',
      'Serialized cards: every pack has a ~1% chance to also drop a numbered print — only 150 Full-Art, 100 Ultra-Rare and 50 Mythic serialized copies will ever exist, each stamped #1 and counting up. Never foil, never quick-sellable, with a one-of-a-kind prismatic card frame.',
      'News Center: a new hub off the main menu with the latest update headline, dev blog posts, and a live server-wide feed of every Serialized pull. You can hide your username from the feed in Settings.',
      'Daily Login Rewards: claim once per day for credits, shards, packs and vouchers — prizes escalate over a 7-day streak cycle, and a longer total streak pays a growing bonus. Miss a day and the streak resets.',
      'Pity removed everywhere except one rule: a Super-Rare or better is still guaranteed at least once every 10 packs, account-wide. All per-pack "hard pity" counters (e.g. the old Mythic Vault guarantee) are gone.',
      'Pack odds reworked: Full-Art, Ultra-Rare and Mythic cards are never guaranteed by any product anymore. Chase slots now floor at Rare — real bust potential, but always some value — and top-end odds were lowered across the board. Full odds are always visible in VIEW DROP ODDS.',
      'New products: a regular Standard Box (36 cards — six boosters in one rip at a bulk discount) and the Leader Pack (a single card that is always a Leader). Every other pack is now at least 5 cards, and prices were rebalanced.',
      'Mass opening: buy-and-open 5 or 10 copies of a pack in one go, and MY PACKS gained an OPEN ALL button. Big hauls now use a compact grouped summary (duplicates stack with a ×N badge) instead of a wall of full-size cards.',
      'Opening packs now grants 20 account XP each.',
      '20 new achievements and 10 new daily/weekly missions covering pack ripping, login streaks, Serialized pulls, trading, the Marketplace and more.',
      'How to Play is now a full page (not a one-time popup) covering every feature and the complete rarity system.',
      'Foil cards re-tuned: the shimmering effect is smoother and no longer flashes white bands or stutters against the card art.',
      'Text is no longer selectable anywhere in the app — no more accidental blue highlights mid-game.',
    ],
  },
  {
    version: 'Economy Update',
    items: [
      'New currencies: Gold is now Credits (shown next to a coin glyph, no currency symbol) and Gems are now Vouchers. All balances, prices and rewards were converted automatically.',
      'Starter Decks retired — new accounts get a credits & vouchers stipend instead and build their collection from packs.',
      'Role badges: the Creator and the first 25 Founders now show a badge next to their name everywhere — profiles, friends, search, trades, leaderboards and the marketplace.',
      'Creator Tools: an admin panel on the Profile screen (Creator only) for granting currency and cards and managing roles.',
    ],
  },
  {
    version: 'Season 1 Update',
    items: [
      'Battle Pass — Season 1 "Blue Coral": a free 25-tier pass. Earn season XP from matches and missions; rewards include credits, vouchers, shards, free packs, The Voyager card back (tier 20) and the Nebula Soul banner (tier 25). Both are now pass exclusives and left the shop.',
      'Level system: every match grants XP; each level pays a credits bonus and every 5th level adds vouchers.',
      'Missions & Achievements: daily and weekly missions plus 22 permanent achievements with credits, voucher and free-pack rewards.',
      'Card Marketplace: list your spare cards at a fixed price or run timed auctions with bids and buyouts. Sellers pay a 5% fee.',
      'Friends & Trading: search players, send friend requests and trade cards and credits directly with friends.',
      'Pack inventory: buy packs without opening them ("BUY & SAVE FOR LATER") and store reward packs — open everything from the new MY PACKS tab in the Store.',
      'Transparent pack odds: every pack now has a VIEW DROP ODDS panel showing the exact per-slot rarity percentages, foil chances and pity rules.',
      'Daily Free Pack is now claimable from the Store (every 20 hours).',
      'Fixed: several packs showed in the store but could never be bought; the shelf now only shows purchasable packs, and Premium Elite Box and Ultra Pack returned to sale.',
      'Collection screen now shows overall and per-rarity completion progress.',
    ],
  },
  {
    version: 'Unreleased',
    items: [
      'Player Shops (unlock at level 50): open your own storefront with a one-time setup fee and purchasable, collateral-backed listing slots. Sell individual cards and fixed bundles, or run Mystery Packs — Simple (overall rarity ratio) or Advanced (per-slot Exact/Minimum/Open) — drawn without replacement from a real submitted pool with a pass/fail preview before listing. Closing a shop refunds half of remaining collateral and goes dormant rather than deleting your setup. Sellers build a persistent, account-wide weighted rating (buyer reviews, value-vs-market, repeat buyers, sales volume, with fraud strikes applied as a multiplier) that unlocks publicly after 10 unique buyers. Browse shops by Featured, Trending, New or Top Rated, and report listings for moderation.',
      'Card market value: the expanded card viewer (Collection, Deck Builder) now shows a player-market value popup once a card has at least 5 completed marketplace sales.',
      'Removed the "$" from every credits display — amounts now show next to the credits coin glyph everywhere in the app.',
      'Fixed several foil-effect glitches: a double-animated shimmer in the 3D card inspector, a Mythic+foil box-shadow conflict, and a hard restart when toggling "VIEW FOIL".',
      'Every card is now a hard, fixed 2.5:3.5 ratio — it no longer grows to fit long text (which now clips instead).',
      'Fixed a visible "snap" on the pack-opening summary screen where the BEST PULL card jumped right as its entrance animation finished.',
      'Pack opening: click a revealed card to advance to the next one, and quicksell commons/uncommons straight from the haul summary. Collection also gained a "QUICKSELL ALL FOIL" button and a one-click bulk quicksell for spare commons/uncommons.',
      'Removed the twelve prebuilt archetype decks — playing without a saved deck (or as a guest) now rolls one freshly randomized legal deck instead, the same way the CPU always has.',
      "Pity reworked: removed the foil-streak and Full-Art/Mythic pity mechanics — the only one left is a Super-Rare (or better) guaranteed every 10 packs, shown as a progress readout in the Store's drop-odds panel.",
      'Four Leaders were rebalanced down to Rare rarity; the Starter Box Leader picker now only offers Rare-or-below Leaders.',
      'Full-Art retired from the active card list for now — those 8 cards were reassigned to Mythic, Ultra-Rare or Super-Rare.',
      'New universal card template with a dice-medallion cost badge, rounded rarity/keyword pill styling and a rarity-tinted header — used everywhere a card is shown: match, Collection, Deck Builder, pack opening and the new expanded card viewer.',
      'Quicksell: sell spare cards straight from the Collection for a fixed credits price by rarity. Foil copies always sell for 2.5x. Pack prices raised roughly 10% to balance the new credits faucet.',
      'Foil cards now render with a real built-in glowing/shimmering foil effect (previously only a flat overlay in pack reveals); every pack pull still has its existing per-pack chance to come out foil.',
      'Deck Builder now consumes cards: the same physical copy of a card can no longer be committed to two decks at once. Deleting a deck automatically frees its cards back up for your other decks.',
      'Card inspection ("details" in Deck Builder, tapping a card in Collection) now opens a shared expanded card viewer using the same universal template, instead of a stripped-down info box.',
      'The old resource/elements game is fully retired — FryCards now runs the v4.2 dice-placement rules everywhere: match, Collection, Store and Deck Builder.',
      'New rarity ladder: Common, Uncommon, Rare, Super-Rare, Ultra-Rare, Mythic (Ultra-Rare replaces Legendary on all cards and pack odds).',
      'Collection and pack reveals now show real v4.2 card faces — cast-slot thresholds, ATK/HP and the current keywords instead of the old costs and elements.',
      'Renamed the game to FryCards across the whole app.',
      'New Settings page: pick from 7 color themes, saved locally on your device.',
      'New Changelog page (you are here!).',
      'CPU opponents now build a freshly randomized deck every match instead of picking from a fixed list.',
      'Deck Builder: added a QUICKBUILD button to auto-fill a legal deck from your collection, plus a live stats panel (cast-slot curve, card types, keywords).',
      'Pack opening redesigned: cinematic one-at-a-time reveal with rarity glow effects and an end-of-pack summary screen.',
    ],
  },
  {
    version: 'v4.2',
    items: [
      'New interactive match UI for the dice-placement rules: five-dice tray, reroll, Snap Charms, Twin staging, Echo recasting, Ultimate abilities and more.',
      'Play screen offers twelve archetype decks; the CPU always picks a different one.',
      'How to Play rewritten as a condensed rulebook covering every keyword and combo pattern.',
      'Twelve new keywords added: Resolve, Ultimate, Bulwark, Toll, Avenge, Crescendo, Aftershock, Snap, Tribute, Excavate, Contested.',
    ],
  },
  {
    version: 'v4.1',
    items: [
      'Locations no longer cost a die — one free Location cast per turn.',
      'Leader HP raised to lengthen matches.',
      'Board wipe Events added for control decks.',
      'Smarter CPU: better free-Location timing, combo-aware rerolling, start-of-game mulligan.',
    ],
  },
  {
    version: 'v4.0',
    items: [
      'Errata pass across the ruleset; deck size set to 30 cards.',
      'All 193 cards remapped onto the new dice-placement mechanics.',
      'Twelve archetype decks built across all six Leaders.',
      'Advanced CPU with mulligans and deck-aware rerolling.',
    ],
  },
  {
    version: 'v3.0',
    items: [
      'Major rules overhaul: five-dice placement, one reroll, Combo patterns, sequential targeted combat.',
      'New engine and card set built for the new rules.',
    ],
  },
  {
    version: 'V1.9 and earlier',
    items: [
      'Leader rebalancing validated across hundreds of simulated games.',
      'Shell Game, Armor and Location rework passes.',
      'Negative-path fuzz testing added to keep the server authoritative.',
      'Deck import/export codes, match log export, game speed setting, search & filters added to Collection and Deck Builder.',
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
