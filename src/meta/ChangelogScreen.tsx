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
    version: 'Reaction Update (v5.3)',
    items: [
      'The clash reaction window is now a real threat: the CPU deliberately saves Locations during its own turn so it can answer your attacks with Quick Events and Ambush units — and it now gets that window when you attack, too (it turns out it was only ever reacting in our test games, never against real players).',
      "Smarter attacks: the CPU no longer throws everything at you the moment its total damage looks lethal — it accounts for your guards first, so you'll see far fewer hopeless all-ins (and far fewer of its units suiciding into your Venomous blockers).",
      "You can no longer waste a targeted Event when it has nothing legal to hit (empty or fully Warded enemy board) — the game blocks it and tells you why, instead of eating the card and your essence.",
      'Balance pass: Venomous, Aerial and Quickstrike units now cost a touch more; Siphon and Swarmproof units cost less; Warded units get a small discount (being untargetable just doesn\'t win as many games as it should). Seven repeat overperformers (including Slate-Scaled Serpent, Nebula Clutch and Shatterline) cost 1 more; six repeat underperformers (including Submerged Starfall and Research Fleet) cost 1 less; Nanite Division Marshal slimmed down.',
      'The seven essence-type icons now appear everywhere colors do: on card color-identity dots, the Starter-Box Leader picker (which previously didn\'t show colors at all), and the Deck Builder\'s Leader list.',
      "New lookouts: tap the opponent's ash counter to inspect their ash-pile and Void (yours now shows banished cards too), and the \"not enough essence\" message now names the exact color you're missing.",
    ],
  },
  {
    version: 'Fry Cards Update (v5.1)',
    items: [
      'The game is now officially Fry Cards — the "Riftbound" codename is retired from every screen. Same essence rules, real name.',
      'Rules fixes: Siphon can no longer heal you past 20 Vitality (it could previously run your total up past 70 in long games), and the player going second now draws a 6th opening card to soften the first-turn advantage.',
      'Fairer cards under the hood: combat keywords (Quickstrike, Overrun, Alert, Reckless and friends) were secretly getting their cost surcharge refunded as extra stats — keyword carriers were winning up to 80% of sim games. Keywords now cost what they say they cost. Weights were re-tuned across the board, Tide gained Aerial and Root gained Overrun as home keywords (only ONE card in the whole game could fly before), and five overperformers (Heart Coral, Needle Seamstress, Merfolk Ritual, Pufferfish Lantern, Clawblade Greatsword) cost 1 more.',
      'A much smarter CPU: it now saves essence to use Quick Events and Ambush units in the clash reaction window, re-bonds loose Worn Charms, chump-blocks (and gang-blocks Overrun attackers) instead of dying with ready guards on the field, correctly fears Doublestrike and Venomous, and throws leftover burn at your face instead of holding it forever.',
      'You choose what you shed: ending your turn over the 7-card hand limit now opens a picker so YOU decide which cards go to the ash-pile (it used to silently discard from the right side of your hand).',
      'Charms with an effect on invoke now let you pick the effect\'s target after choosing what to bond to, instead of auto-targeting.',
      'During the enemy clash, hand cards you can actually invoke in the reaction window now light up so the window is impossible to miss.',
      'Card faces no longer cut off ability text: the text box stops repeating what the keyword chips already say, long ability text auto-shrinks before it ever clamps, and every card size got a bigger rules-text budget.',
    ],
  },
  {
    version: 'Riptide Update',
    items: [
      'Echo fix: high-rarity Echo cards (Ultra-Rare and up) are meant to recast for free — no extra card to discard — but the board was still asking you to pick a discard that was then ignored, and could even block the recast entirely if your hand was empty. They now echo straight back into play for free, exactly as intended.',
      'Bind cards now tell the truth: several binding Charms also deal direct damage when they bind (Bind + Sap), but the card text only said "Bind" and hid the damage. Card faces, ability pills and the opponent-turn narration now show the full "Bind + Sap X".',
      'The Abyssal Gate finally works as written — a buff we thought we\'d given it (twice) turned out to be silently doing nothing due to the same class of tooling bug we\'ve been hunting down, so this board-clearing Event has been quietly weaker than its numbers for a long time. Fixed, then given a fresh, measured buff. Ruthless Succession, the single most consistently underwhelming Event across every deck, also got a buff.',
      'Balance pass: a batch of long-running overperformers came down (Cervine Channeler, Worm Brain Host, Nanite Division Marshal, Dr. Aries, plus first-time trims for Familiar in the Dark, Magma-Phase Infiltrator, Hollow Suit and Void Mother), and three cards whose buffs had overshot were walked back (The Wolf of Wall Street, and the two Full-Art dragons Shattered Horizon Protagonist / Skyborne Skeleton Dragon, whose real fix last update — an easier combo requirement — made their extra stat bump surplus).',
      'Bug-hunt & quality-of-life pass: the trade builder no longer lets you offer more copies of a card than you actually have free (deck-locked copies were being double-counted across normal and foil), the Marketplace no longer offers a BID button when you\'re already the top bidder (it now reads "TOP BID ✓" so you can\'t bid against yourself), a bulk pack-open no longer shows your best pull twice in the haul summary, the ×5 and ×10 open buttons no longer both say "OPENING…" at once, and the first-match tutorial no longer tells brand-new players to attack on turn one (when attacks aren\'t allowed yet). Plus better screen-reader labels on the deck-delete button, the opponent\'s Leader ability panels, and leftover dice during combat.',
    ],
  },
  {
    version: 'Convergence Update',
    items: [
      'One set to rule them all: every card in the game now belongs to a single set, Volume #1 — the old Blue Coral, Crimson Circuit, Dragonbone Wastes and Full Arts Collection 1 split is gone (no card mechanics changed). The store shelf was rebuilt to match: one Volume #1 Booster Pack, one Volume #1 Booster Box, and your Daily Free Pack. The old per-set packs, Standard Box and Starter Pack left the shelf (an unopened Starter Pack in MY PACKS still opens fine).',
      'Full-Art cards are 25% rarer in every pack and box that can drop them — our testing showed they were quietly the strongest rarity band for their cost, so they now hit like the chase cards they are.',
      'Opening a booster box now takes you through the full card-by-card flip reveal (building up to the box topper) instead of jumping straight to the haul summary. REVEAL ALL is still there if you want to skip ahead.',
      'Card readability overhaul: text can no longer run off a card — keywords auto-fit with a "+N more" chip and flavor text gracefully steps aside on ability-packed cards. Full-Art cards gained a subtle frosted panel so names, stats and keywords stay readable over any artwork, and the small board-size cards were redesigned as clean at-a-glance tokens with bold stat and keyword chips.',
      'The CPU now plays at a watchable pace: every action it takes — rolls, rerolls, casts, abilities, Ultimates, Echoes and each attack — plays out one step at a time with a narrated banner, pulsing highlights on the acting card and its target, its own dice tray, and floating damage numbers. Click NEXT ▸ to advance instantly or SKIP ▸▸ to fast-forward. Heals now float green for your plays too.',
      'New card mechanic — Bind + Sap: some binding Charms (Pulsing Heartstone, Amber Sphere, Resonant Shuriken, Thornfang Vine) now also sting the Unit they bind. We found their previous four rounds of "buffs" were silently doing nothing due to an engine bug — this makes them real. Another balance pass alongside it: long-standing overperformers came down (Wasteland Aberration, Blue-Ringed Octopus, Porcelain Lobster, Butterflyfish School, Faye\'s True Face, Void Mother and several Pierce heavyweights), Cavernous Watcher finally costs what it should, and two Full-Art dragons that were nearly impossible to cast (Shattered Horizon Protagonist, Skyborne Skeleton Dragon) had their combo requirement eased.',
      'Quick Match is back: guests and brand-new accounts can battle the CPU with a freshly rolled random deck — no collection required.',
      'Bug-hunt pass: the daily-login panel no longer shows rewards in a retired currency or highlights the wrong day after a broken streak, a failed Discord sign-in can no longer freeze the login form, backing out of a just-imported deck code now asks before discarding it, Player Shop listings finally show foil status and copy counts (and mystery packs tell you exactly what you pulled), an just-ended auction no longer offers a cancel button that could only fail, and How To Play was rewritten for the Volume #1 lineup. Plus clearer daily-pack timing ("READY TOMORROW"), honest UTC mission reset times, and better screen-reader support across search and filter controls.',
    ],
  },
  {
    version: 'Ballast Update',
    items: [
      "Found and fixed a real bug in our own balance tooling: two cards (Abyssal Dragonfish, Ember Whisperer) had a cost tweak applied years ago that turned out to silently do nothing — it explains why Abyssal Dragonfish kept showing up as under-costed no matter what we tried. It now has a real fix (a harder combo requirement). We also tried raising the cost of every Pierce card at once, measured that it didn't actually change anything in practice, and rolled it back rather than ship a change that only looked like a fix.",
      "Silver Chimera was getting stuck in players' hands more than any other card in the game — eased its combo requirement so it's actually castable. Several repeat over- and under-performers got another round of tuning (including Kinetix Enforcer, which finally moved after being stuck at the same power level for two updates), a stale buff on Isle of the Ancients that had overshot was rolled back, and a few newly-flagged cards were adjusted for the first time.",
      "Bug-hunt pass: a Deck Builder import that was silently validating against outdated card data instead of the live catalog, a Collection screen that could under-count how many copies of a Leader you had locked into decks, ended Marketplace auctions that kept showing live bid/buy buttons for a moment after they closed, and a handful of buttons that could be double-tapped to double-claim a reward or double-spend on a purchase. Plus more error logging under the hood, keyboard/focus fixes on a few more dialogs, and confirmation toasts on some Social actions that previously gave no feedback at all.",
    ],
  },
  {
    version: 'Slack Tide Update',
    items: [
      "Two long-standing 'trophy' cards (Astral Shoal, Where the Deep Meets the Sky) had one of their stacked abilities removed — they'd already gotten every stat cut we were willing to give them and were still clearly too strong, so this time an ability came off instead. Several other repeat over- and under-performers got another round of tuning, and Aftershock's two weakest cards finally got the buff we'd been meaning to give them.",
      "Big bug-hunt and quality-of-life pass: fixed a rare bug where a network hiccup right after signing in could leave the app stuck on a loading screen forever, a Deck Builder check that could let you claim a single-copy Leader in two decks at once, a first-match tutorial that could loop forever instead of finishing, and keyword/cost tooltips that could swallow your next tap instead of opening what you actually meant to open. Plus over 20 smaller fixes across the Store, Player Shops, Social, Marketplace and Collection screens, and better keyboard/screen-reader support on several dialogs.",
    ],
  },
  {
    version: 'True Colors Update',
    items: [
      'The Bounty Shop now shows the real card — full rarity frame, border, and background treatment — instead of a plain image thumbnail.',
      'Full-Art cards are easier to pull: their odds went from about 1/6th of Super-Rare\'s chance up to roughly 85% of it (only ~15% rarer than Super-Rare now) in every pack and box that carries them.',
      'Another balance pass: several long-standing over- and under-performers (Astral Shoal, Kinetix Enforcer, Swaying Garden, and others) got another round of tuning, two earlier tweaks that had overshot were dialed back, and a few newly-flagged cards were adjusted for the first time.',
      'Bug-hunt pass: a profile card that could get stuck loading forever after a network hiccup, a Scrap action that silently failed instead of telling you why, a Store screen that could go quiet on a failed purchase instead of showing an error, bulk-quicksell in the Collection that could try to sell serialized cards it shouldn\'t, and a Deck Builder check that could let you pick a Leader already locked into another deck. Plus some smaller fixes to popovers opening off-screen and a stale "Pity" mention in How To Play (removed a while back).',
    ],
  },
  {
    version: 'Undertow Update',
    items: [
      'No gameplay changes this update — this was a deep testing-and-diagnosis pass. We finally pinned down WHY Mer-King\'s Avenge Swarm deck underperforms: it\'s not the cards (the same card list wins comfortably under a different Leader), it\'s that Mer-King\'s healing-focused kit works against a deck that wants to trade Units away. That means the real fix is a Leader-kit change, not a card buff — coming in a future update.',
      'We also confirmed the Crescendo rework from last update is holding steady, and improved our balance-testing tools so future changes are backed by cleaner data. A couple of tempting tweaks were tried and deliberately NOT shipped because full testing showed they\'d quietly make other decks worse — we\'d rather ship nothing than ship a change that trades one problem for another.',
    ],
  },
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
