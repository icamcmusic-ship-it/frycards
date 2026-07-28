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
export const ENTRIES: ChangelogEntry[] = [
  {
    version: 'The Stack Update (v7.4)',
    date: 'July 2026',
    items: [
      'SIX NEW KEYWORDS, each doing something no card in the set could do before. EXHUME brings a Unit back from your ash-pile — nothing has ever returned from there. FREEZE-DRY banishes enemy units instead, shutting that down. BLESSED prevents the first damage to a bonded unit each turn, which blanks a removal spell outright. GLACIATE taps an enemy unit right through their next Dawn. SCORCHED-EARTH damages every enemy unit when its carrier dies. FATE draws you a card and buries one you cannot afford.',
      'Void Mother has been reined in. At Resolve 6 with a 2-cost Banish it was buying THREE unconditional removals per full tank — every other removal Leader gets one — and it won about 72% of its games. Its Banish now costs 4. Kuro, the Unseen goes the other way, gaining a point of Resolve so its shrink ability fires twice a tank instead of once.',
      'Cards no longer take effect the moment you play them. An invoked card — or an ability it triggers — now goes on THE STACK and waits there while your opponent gets a window to answer it. Whatever goes on last resolves first, so a response happens before the thing it responds to.',
      "That means Quick Events finally do what they say. Point removal at an attacker mid-combat and it dies before it deals damage; answer an opponent's Event and yours resolves first. The CPU has learned to do this to you too — expect it to hold up removal and answer your plays.",
      "The opponent's turn can now stop and ask you. When the CPU plays something you could answer, the board shows the stack and hands you a response window — play a Quick Event or Ambush unit, or PASS to let it resolve. Your Locations tap for it even on their turn.",
      'Cards can now MISS. If a card is aimed at a unit and that unit is gone by the time the card resolves, it fizzles: an Event does nothing and goes to the ash-pile, a unit still enters the field but loses its bonus effect, and a Charm whose target died ends up unbonded rather than disappearing.',
      'Turn order in a response window follows the active player first, then the defender, and both players passing resolves the top of the stack.',
      'UNBREAKABLE now exists. The keyword is in the rulebook and always worked in the engine, but no card in the whole 297-card set could actually carry it — it was printed on exactly zero cards. Three cards now have it: Skyborne Skeleton Dragon, The Pier-Side Menace and The Wolf of Wall Street. Their costs went up to pay for it, and their stat budgets were trimmed after testing showed them winning about 70% of the games they appeared in.',
      'Phones work now. On a 375px-wide screen the board pushed your HAND completely off the bottom of the page with no way to scroll to it — you could not see or play a single card. Leader rows now scroll sideways instead of stacking three deep, the hand fan tightens to fit the screen instead of overflowing it, pinch-zoom is re-enabled, and the small buttons got bigger tap areas.',
      'You will not notice any of this in a game where neither side is holding an instant-speed card: the game passes for you automatically and everything resolves as it always did. Balance is unchanged — 528 test games measured the same win rates and the same game length as before.',
    ],
  },
  {
    version: 'Art, Deck Box & Keywords Update (v7.3)',
    date: 'July 2026',
    items: [
      'Fixed: every card in the game was showing a blank "NO IMAGE" plate instead of its art. The image library had been reorganised into new folders but every card still pointed at the old folder names, so all 292 arts failed to load. All 297 cards now resolve to real art.',
      'Fixed: the animated art on Full-Art and Mythic cards was never actually being preloaded on the loading screen — video art was being loaded as if it were a still image, which fails instantly and silently. The loading bar could hit 100% with those cards still unfetched, so they popped in mid-game. They now genuinely preload.',
      'The Starter Box is replaced by the DECK BOX, and every operative gets one — new and existing. Pick any Rare-or-below Leader and it opens into a ready-to-play, colour-legal 60-card deck built around them: 2 Super-Rares, 8 Rares, and Uncommons/Commons filling a real curve, with a 12-Sanctum mana base. It saves straight to your decks. The old Starter Box handed out what was effectively 60 Commons and never checked colour identity, so the deck it saved was frequently illegal in the deck editor. The three prebuilt starter decks and the old Starter Pack are retired.',
      'Eight new keyword abilities, one per Essence Type, for Events, Charms, Locations and Leaders — types that had only two keywords each while Units had 23. Echoing (Event: draws you a card when it resolves), Ritual (Event: costs 1 less with 3+ Sanctums), Empowering (Charm: grows its unit every Dawn), Tethered (Charm: recovers the unit it bonds to), Bulwark (Location: reduces damage dealt to you by 1), Blighted (Location: erodes the enemy each Dusk), Archivist (Location: draws you a card each Dawn with 3+ Sanctums) and Warlord (Leader: your units get +0/+1). 25 existing cards gained one of these abilities.',
      'Every Unit at Rare or above now prints an ability. 37 cards — including Full-Art pulls — had rolled no keywords and no effect, printing a bare stat line with no rules text at all. Vanilla bodies are still a normal part of the curve at Common and Uncommon.',
      'Card revisions: 19 cards renamed, reflavoured or moved rarity, six of them changing type entirely. Void Mother is now a Leader (Void/Shadow). Five new cards join the set, bringing it to 297: Blossom-Veiled Refuge, Cruel Effervescence, Blight-Snarler, Curse of the Ruby Tide and Stag of the Cosmic Pyre.',
    ],
  },
  {
    version: 'Packs & Leaders Update (v7.2)',
    date: 'July 2026',
    items: [
      'Booster packs are now 8 cards instead of 6, and one of those 8 is ALWAYS a foil. On top of that guaranteed foil, every pack has about an 8% chance of a second foil turning up in another slot. The odds screen now states foil chances per PACK rather than per slot — the old "4%" was a per-slot roll that really meant a foil in about 1 pack in 5, which was not what it looked like.',
      'Booster Boxes are now six full boosters (48 cards) plus the box topper, for 49 cards. The box topper floor is raised from Rare to SUPER-RARE — every box is now guaranteed a foil Super-Rare or better, with a 32% shot at Ultra-Rare, 4.5% at Full-Art and 1.5% at Mythic. The box price moves from 2,699 to 3,199 credits (32 vouchers) to match.',
      'Full-Art and Mythic pulls are meaningfully more common. Per booster, Mythic goes from roughly 1-in-1,000 to 1-in-200, and Full-Art from about 1-in-165 to 1-in-52.',
      'Duplicate protection has been removed from pack opening. Every slot is now a straight random pull, so packs can repeat cards you already own. The separate copy-cap payout is unchanged and still there: a pull past what you could ever play still comes back as credits rather than dead inventory (it is now labelled honestly as "over copy cap" rather than "duplicate protected").',
      "Six cards moved to FULL-ART: Absolute Eruption, Apex Nanite Shinobi, Avatar of the Abyss, Crimson Vector Commander, Spectral Leviathan and Submerged Starfall. Because a card's stats and abilities are derived from its rarity, all six are reprinted — most notably the three Leaders, who now start at Resolve 5 instead of 6.",
      'The three weakest Leaders in the game have been rebuilt, and the Leader spread is now the tightest it has ever been (every Leader between 43% and 62%, down from a 40-point gap). Apex Nanite Shinobi\'s useless "-1: Recover a friendly unit" becomes "-2: A target enemy unit gets -2/-2". Ethereal Sea Witch\'s "-1: Deal a card" becomes "-1: Deal 2 damage to a target enemy unit". Ruin-Walker Overseer\'s "-2: A friendly unit gets +2/+2" becomes "-3: Banish a target enemy unit". All three previously had kits that could not interact with the enemy board at all.',
      'Avatar of the Abyss and Crimson Vector Commander are both toned down again as a consequence of the rarity move — one less Resolve means roughly a third as many Shatters and blasts per game.',
      'Card tuning: Submerged Statue and Dr. Aries, Chief Biogeneticist both cost 1 more. Ashen Circle Rite costs 1 less.',
      'The CPU plays Charms noticeably better. It no longer hangs a Charm on a body the enemy board can kill on the spot, and it no longer throws a charmed unit into a "good" trade without counting the Charms that die with it — the two together cut its single most common misplay by about 20%.',
      'The post-pack summary has been rebuilt. One layout for every haul size instead of two that had drifted apart, headline numbers up top (cards, foils, your best pull, what the haul is worth, any credits paid out), a spotlight on the best card, and the quicksell button now tells you what you will get before you press it.',
      'Fixed: an Alt-Art card would have been sorted, spotlighted and glowed as if it were a Common in the pack-opening screen. Fixed: packs advertised Alt-Art drop odds even though no Alt-Art cards exist yet, and those rolls quietly paid out a Full-Art instead — the odds screens now show what you can actually pull. Fixed: "OPEN ALL" on a stack of boxes could deal out over 1,100 cards into a single one-at-a-time reveal; bulk opens are now sized so one reveal stays readable.',
    ],
  },
  {
    version: 'Alt-Art Update (v7.1)',
    date: 'July 2026',
    items: [
      'A new rarity: Alt-Art. It sits between Full-Art and Mythic on the ladder — a separately-illustrated alternate printing of a hand-picked existing card (same identity, same stats, striking new art), not a whole new pool of cards. Its own "Prism Ink" template gives it a slow hue-shifting holographic wash across the full-bleed art plus a pink/violet frame, deliberately distinct from Mythic\'s looping video and Serialized\'s rotating rainbow ring. Quicksells for 1,800 credits and caps at 1 copy per deck, same as Mythic.',
      'Pack odds now carve out a small Alt-Art share everywhere Full-Art could drop (chase and box topper slots), so the tier is live end-to-end even before the first Alt-Art card ships — until then a roll quietly resolves to Full-Art instead.',
      'Fixed a latent ordering bug in the server\'s rarity-pool-exhaustion fallback: it still walked the pre-v6.8 ladder (Ultra-Rare above Full-Art), out of step with every price, cap and pack-odds table. Also fixed the Starter Box\'s Leader-rarity check, which had no entry for Full-Art at all and would have silently let a Full-Art Leader through the "Rare or lower" restriction.',
    ],
  },
  {
    version: 'Board & Shops Update (v7.0)',
    date: 'July 2026',
    items: [
      'The match board has been rebuilt. Instead of side panels beside two rows, each player now gets a full-width lane: your Leader, Resolve (shown as dots you can count rather than a number), Vitality, your floating Essence and your Leader abilities all sit on one bar, with your Locations on their own row just above it. Every Wellspring and Sanctum is a visible tile now instead of being buried in a status bar.',
      'The phase tracker (Dawn → Main I → Clash → Main II → Dusk) is always on screen, and every action for the current step — DECLARE ATTACK, RESOLVE CLASH, CONFIRM GUARDS, the phase button, SKIP — now lives on one big button on the clash line in the middle of the board. There is exactly one place to look for what to do next. The battle log moved into a drawer you open from that line, which gave both battlefields back the space it used to take.',
      'Mystery packs now show you the entire pool before you buy. Open VIEW FULL POOL on any mystery listing to see every card the seller committed, how many of each are left, the real pull odds per rarity, and what the pack guarantees.',
      'Sellers can now promise specific rarities. A pack type can guarantee "at least 1 Rare or better in every pack" (and so on), and the server refuses any pool that cannot actually pay that out. Simple packs also have to back their advertised odds with a matching share of cards, so a pack can no longer claim 10% Rare over a pool with no Rares in it.',
      'Setting up a shop takes far less clicking. QUICK ADD stages every spare card of a rarity at once, AUTOFILL fills a pool to a target number of packs (satisfying your guarantees first), and a live checklist shows exactly which requirement your pool is short on and by how much while you build it.',
      'Storefronts are yours now: give your shop a tagline, an accent color and a banner, previewed live as you edit. The directory and shop pages show real stock — how many listings, the cheapest price, the highest rarity in stock, repeat buyers — and listings take a colored frame from the best card in them and tell buyers how the price compares to market reference.',
      'Shops, listings, the marketplace, trades, friend requests, your credits and your collection now update live while you are looking at them, instead of only when you navigate away and back.',
      'Shop fixes: closing and reopening a shop repeatedly used to refund ALL of your slot collateral while you kept the slots — half is now genuinely burned, as it always said. Serialized prints can no longer be escrowed into a listing or a pool. Mystery listings could get permanently stuck with unbuyable packs when a random slot ate a card a guaranteed slot needed; the draw now reserves properly, and a sold-out mystery pack frees its slot instead of holding it forever.',
      'Engine hardening: a new soak suite plays 200 complete randomized matches while checking board invariants every turn, and a hostile-input suite throws malformed arguments at every game action. It found one real bug — a Leader ability could be triggered with a malformed index and spend Resolve — which is fixed.',
    ],
  },
  {
    version: 'New Keywords Update (v6.9)',
    date: 'July 2026',
    items: [
      "Every Essence Type gained a brand-new keyword. Ember has WILDFIRE (when this unit dies, deal 2 damage to the enemy player), Tide has TIDECALLER (whenever this unit deals clash damage, Deal a card), Root has THRIVING (at your Dawn, this unit gets +1/+1 permanently), Gale has NIMBLE (can only be guarded by units with less Might), Light has RADIANT (at your Dawn, restore 1 Vitality), Shadow has WITHERING (clash damage this deals to a unit permanently reduces that unit's Grit by 1), and Void has ENTROPIC (at your Dusk, the enemy erodes 1). Cards across the pool have been reprinted carrying them, and Charms can grant them too.",
      "Two new ability types appear on cards: EXHAUST taps an enemy unit so it can neither attack nor guard until its controller's next Dawn, and WEAKEN gives an enemy unit -X/-X permanently. Weaken and Withering are not damage — healing will not undo them, and a unit reduced to 0 Grit is shattered.",
      'Rules fix — blocked is blocked. Killing a blocker after guards were set no longer lets the attack through as though it had never been guarded. That was exploitable: attack, let a big body block, then remove your own blocker with a Quick Event and the attacker hit for full damage anyway. Now only Overrun spills past dead guards, and only the excess.',
      'Ethereal Sea Witch and Ruin-Walker Overseer, the two weakest Leaders in the game by a wide margin, both got real buffs. Neither kit could interact with the board at all — the Sea Witch only drew cards and gained life, and the Overseer\'s two abilities were the same buff at two sizes. The Sea Witch\'s +1 is now "Exhaust a target enemy unit" and the Overseer\'s +1 is now "A target enemy unit gets -1/-1".',
      "Avatar of the Abyss and Crimson Vector Commander, the two strongest Leaders, were both toned down. The Avatar's Shatter now costs 3 Resolve instead of 2 (it was firing ten times a game and winning longer and longer games), and the Commander's 2-damage reach now costs 2 Resolve instead of 1 (it was winning close to 90% of short games).",
      "Doublestrike costs more to print and Resonant costs less: Doublestrike has been over-performing for four straight balance passes, and Resonant's double-resolution has never once been worth its surcharge, so it now carries none.",
      'Card fixes: Galleon Shipwreck (a 1-cost Location that also swept every enemy unit each turn), Resonant Shuriken and Abyssal Pathway all cost more. Spectral Leviathan and Kunoichi of the Magma Rings were trimmed down.',
      "Ten cards had the wrong rarity on the server. Absolute Eruption, Apex Nanite Shinobi, Astral Shoal, Avatar of the Abyss, Chrysalis of the Departed, Crimson Vector Commander, Faye's True Face, Spectral Leviathan, Submerged Starfall and Void Mother are all correctly MYTHIC everywhere now. If you own any of them, they sell, drop and cap as Mythic — Void Mother and Chrysalis of the Departed quicksell for 3,000 credits instead of 1,000. Four of them were also being dealt the wrong stats, cost and keywords in matches; they now print as intended.",
      "The rulebook's keyword list is grouped by card type instead of one long alphabetical run, and illegal guard assignments now name the exact rule that blocked them (exhausted, Aerial, or Nimble) rather than guessing at it.",
    ],
  },
  {
    version: 'Card Template Update (v6.8)',
    date: 'July 2026',
    items: [
      'Every card is reprinted on a new template: a solid ink masthead carrying the name and essence cost, a boxed 4:3 art window, a rarity rule under the art whose thickness IS the rarity (one hairline at Common, up to seven at Mythic), a type line stamped with the short rarity marker (C/U/R/SR/UR/FA/MY), a dashed flavor divider, and the Might/Grit (Resolve) plate anchored to the bottom-right corner.',
      'Rarity now reads at a glance from the print itself. Super-Rare and up ghost their rarity color over the art with a gold sweep travelling across it; Ultra-Rare and up add a struck gold corner ribbon; Full-Art and Mythic drop the frame entirely for edge-to-edge art.',
      "Mythic is now video-only: it's the whole card's art, not just a rarity name. Astral Shoal, Chrysalis of the Departed, Faye's True Face and Void Mother (all video) moved into Mythic; Absolute Eruption, Apex Nanite Shinobi, Avatar of the Abyss, Crimson Vector Commander, Spectral Leviathan and Submerged Starfall (all still images) moved out to Ultra-Rare.",
      "Full-Art moved ABOVE Ultra-Rare on the ladder — it is now the second-rarest tier, behind Mythic only. Quicksell price rises from 500 to 1,000 credits (above Ultra-Rare's 800), its serialized print run drops from 150 to 75 copies (below Ultra-Rare's 100), and in every pack and box its drop weight swaps with Ultra-Rare's, so Full-Art is now the scarcer of the two. Deck copy caps are unchanged (Super-Rare/Ultra-Rare/Full-Art 2, Mythic 1).",
      'Foil is now a STATIC prismatic foil stamp — a prismatic masthead, border ring and body wash with a plain black title, deliberately motionless so it reads as a foil print rather than another animated premium treatment.',
      'Long ability text can no longer be cut off mid-line: rules text now measures itself and sheds clamped lines until it genuinely fits its box, and flavor text sits pinned under a dashed rule at the bottom of the text box.',
    ],
  },
  {
    version: 'Coin Flip Update (v6.6)',
    date: 'July 2026',
    items: [
      'Who goes first is now a coin flip. Until now you were ALWAYS the first player, in every single match — the turn order was hardcoded. It is decided per match now, and the match header tells you whether you are ON THE PLAY or ON THE DRAW.',
      'Going second is compensated differently. The second player used to draw an 8th opening card; testing measured that card as worth well under a percentage point, while the first player was winning around 60% of games. The advantage turned out to be about tempo, not cards: it was concentrated in fast games and disappeared entirely in long ones. So both players now open on 7 cards, and whoever is on the draw plays TWO basic Wellsprings on their opening turn instead — the second one arrives exhausted, so it powers your next turn. First-player win rate moved from 60% to 47%.',
      'Card balance got a real fix at the source. Cost adjustments were quietly self-defeating: a card\'s Might/Grit (and an Event\'s effect size) were calculated FROM its cost, so making a weak card cheaper also made it weaker, and making a strong card pricier also made it stronger. Cards were being adjusted two and three times with nothing to show for it — Helix Swarm had been "buffed" three times into a 1/1 for 1, and Clockwork Nautilus was a 1/1 for 5 with two keywords. Cost now changes the price only: a cut is a genuine buff, a raise is a genuine nerf. Every over-stacked adjustment was reset and re-derived, so a lot of previously mangled cards now print sensible bodies.',
      'Sunken Archive reverted to its original cost — an old adjustment had overshot badly and turned it into one of the strongest cards in the game. Skull Cathedral costs 1 more.',
      'CPU fix: it now picks its Wellspring colors to actually unlock cards stuck in its hand. It was choosing purely on which color its hand demanded most, which could not tell that a color was already covered — so on roughly one turn in six it laid down a Wellspring that unlocked nothing while a different choice would have freed a stranded card.',
      'CPU fix: it no longer piles every Charm onto its biggest attacker — the exact unit you most want to remove and most profitably block. It now favors durable bodies and spreads Charms out, so one removal spell cannot two-for-one it.',
      'CPU fix: it stops holding a card and its essence back for a surprise play when you have nothing on board that could attack — a reaction window that was never going to open, in exchange for a wasted development turn.',
      'Slow connections no longer stare at a blank loading screen. Boot allows each request up to 20 seconds; the splash now tells you it is connecting, says so more plainly if your network looks slow, and offers a RETRY button rather than making you wait it out.',
      'The in-match Wellspring control now shows how many you have left this turn, instead of a tooltip that always claimed "one per turn".',
      'The end-of-turn shed picker no longer leaves the END TURN button live in the bar above it — clicking it again just re-entered the shed you were already in.',
      'Two more in-match prompts made visible: the hint bar now tells you that you can answer the guards with Quick Events and Ambush units during your OWN clash before resolving, and if a guard assignment is illegal it says why in the hint bar instead of only in a hover tooltip you could never see on a touchscreen.',
      'Accessibility: the shed picker\'s SUGGEST and BACK buttons were announced to screen readers and voice control under completely different names than the ones printed on them, so saying "click suggest" did nothing. Their spoken names now include the visible label.',
    ],
  },
  {
    version: 'Starter Decks Update (v6.4)',
    date: 'July 2026',
    items: [
      'New: the Starter Box now offers a choice — pick your own Leader for a randomized legal deck (as before), or pick one of three ready-to-play prebuilt decks (Aggro / Midrange / Control). The prebuilt decks are Common/Uncommon-heavy with just a handful of Rares, no Super-Rare-or-above cards, and every card is non-foil — a faster, simpler way into your first match.',
      "Card fix: Location cards no longer print a redundant essence-type pip next to the rarity marker — the essence type is already shown in the card's rules text, so the extra icon was just visual clutter.",
      'Match fix: hitting SKIP during the CPU\'s brief "thinking" pause right at the start of its turn used to do nothing — the match could get stuck there with no way to move forward. SKIP now works at that moment too.',
      "CPU fix: when deciding whether an all-in attack was truly lethal, the CPU used to assume any guard only soaks up 1-2 damage no matter how tough it actually was — so it could occasionally swing in thinking it had lethal against a beefy blocker when it didn't. It now accounts for the guard's real toughness.",
      'Fix: a Store data hiccup on boot could strand players — including guests — on a dead-end "Couldn\'t reach the server" screen before Play As Guest was ever reachable. That data is optional for booting and no longer blocks the app.',
      "Another round of card cost/stat adjustments from this update's balance testing: eleven newly-flagged cards tuned for the first time, five repeat offenders got a second nudge, and two cards from last update's adjustments overshot and were reverted back to their original cost.",
    ],
  },
  {
    version: 'Second Look Update (v6.3)',
    date: 'July 2026',
    items: [
      "Avatar of the Abyss gets a second nerf: last update's Commander removal helped, but it was still the clear top Leader in a dedicated head-to-head test. Its removal Ability now costs 1 more Resolve to use.",
      "Resonant Event fix: last update's guess about which Resonant card was underperforming turned out to be backwards once we tested it properly — Dissolving Persona is fine; Bioluminescent Tide and Flash Freeze were the real problem. Both now cost 1 less.",
      'Another round of card cost adjustments: ten newly-flagged cards cost more, eight cost less, eight repeat offenders from last update got a second nudge, and Familiar in the Dark (already at the cost ceiling) had its stats trimmed again.',
      'Battle Pass fix: claiming your very first reward tier super fast could sometimes let a double-tap fire two claims at once — a boundary case ("tier zero") the button\'s busy-check missed.',
      "Collection fix: filtering by color used to skip Leader cards entirely, so a Leader that didn't actually match your chosen color could still show up in the results.",
      "Reliability fix: a handful of screens (Store, your Player Shop, Social's friends/trades/leaderboard/search) were showing an empty/blank state on a real connection hiccup instead of the RETRY button they already have — that button now actually shows up when it should.",
      "Accessibility: the Concede, mulligan, and game-over dialogs now trap keyboard focus properly (and hand it back when you close them) instead of letting Tab reach the board underneath; How To Play's collapsible sections now announce open/closed to screen readers; the Starter Box dialog gained a proper label.",
    ],
  },
  {
    version: 'Leader Check Update (v6.2)',
    date: 'July 2026',
    items: [
      'Avatar of the Abyss loses its Commander keyword: two updates in a row flagged it as the strongest Leader by a wide margin (it was stacking max Resolve, a repeatable hard-removal Ability, AND a free +1 Might to your whole board), and a dedicated head-to-head test against every other Leader confirmed the kit itself was the problem, not just lucky decks. Should feel noticeably less dominant.',
      'Keyword re-tune with bigger test samples: Resonant Events cost less (the small sample last update had it backwards), Doublestrike costs a bit more, Reckless costs a bit more, Regenerate costs less, and Surge is free again.',
      "Another round of card cost adjustments: fourteen newly-flagged cards tuned for the first time, plus a second nudge for three repeat offenders from last update that hadn't fully settled.",
      'Deck Builder fix: hitting CHANGE LEADER could leave your old color filter stuck in place, invisibly hiding your entire card pool if the new Leader only has one color (the filter dropdown itself might not even show up to let you clear it). Changing Leader now clears the filter.',
      'Starter Box fix: a fast double-click on a Leader tile could fire two claim requests at once. Tiles now lock the instant you pick one, and unlock again if the claim fails so you can retry.',
      'Card-text fix: an effect explicitly printed as "0" (a card that Deals 0 cards, or Erodes 0) was showing "1" instead — a rendering bug treated "no value" and "value of zero" as the same thing. A keyword\'s auto-introduced popup could also pop back open right after you closed it.',
      'Player Shops fix: reopening or closing your shop (or buying a slot) could silently reset an in-progress "add listing" panel elsewhere on the same screen.',
      'Quality of life: proper screen-reader labels added to the in-match Wellspring buttons, the Starter Box close button, and the player-profile close button.',
      'Under the hood: our own balance-testing tools had three CPU "mistake counters" that were actually miscounting — the CPU wasn\'t making the mistakes we thought, our tools were misreading correct plays as errors. Fixed so future balance passes are reading real signal.',
    ],
  },
  {
    version: 'Clash & Coverage Update (v6.1)',
    date: 'July 2026',
    items: [
      'Overrun now works exactly as written: a guarded attacker whose guards die early (say, to your Quickstrike blocker) no longer slams its FULL damage into your face — only Overrun attackers spill through, and only the EXCESS past what the guards absorbed. This was quietly the biggest source of "where did all that damage come from?" moments in the game.',
      'The clash reaction window now belongs to BOTH players, as the rulebook says: you can answer with Quick Events and Ambush units during your OWN clash too — declare attackers, see the guards, then spring a surprise before damage resolves. The CPU does the same on its side.',
      "A sharper CPU across the board: it now respects Venomous and Quickstrike when choosing blocks (no more feeding its best unit to a 1/1 Venomous), knows a Swarmproof attacker can't be stopped by a lone guard, makes free attacks and favorable trades instead of only all-or-nothing swings, stops shattering its own Leader for one measly removal, plans its Wellspring colors around its Leader's cost, and prizes Resonant Events and Bountiful Sanctums like it should.",
      'Random and quick-match decks now draw on nearly the WHOLE card pool — deck generation reached only about half the catalog before; you should see far more variety across opponents and random decks.',
      'Keyword pricing now comes from one honest table: Resonant Events cost 1 more (they were winning far too often), Bountiful Locations cost 1 less (they were winning far too little), and Resolute Leaders cost 1 more.',
      'Rules tightening: the mulligan is now correctly locked to the very start of the game (the engine would previously accept one mid-match), "when this dies" abilities now fire when a unit is banished to The Void too — not just when it goes to the ash-pile — and running out of cards during setup now properly loses the game.',
      'Crash safety: if anything unexpected breaks mid-match the game now recovers and hands you the turn (with a full-app safety net behind it) instead of white-screening your match away.',
      'Quality of life: the end-of-turn shed picker has its promised SUGGEST button, Escape now also closes the shed picker and battle log, mulligans warn you when a small hand gets risky, this changelog shows dates, the News Center headline always matches the newest update, the Bounty Shop and Social screens show a RETRY button instead of hanging or pretending to be empty, auction countdowns tick every 10 seconds and ended auctions disable their buttons immediately, imported deck codes are fully validated (size and no Leaders in the main deck), the sell list can no longer offer a just-pulled Serialized print, bulk quicksell shows live progress, the Deck Builder gained a CHANGE LEADER button, and the game finally writes its own name one way everywhere: FRY CARDS.',
    ],
  },
  {
    version: 'Rulebook Update (v6.0)',
    items: [
      'Fry Cards now plays by the full paper rulebook: decks are AT LEAST 60 cards (up to 100) with a maximum of 4 copies of any card, opening hands are 7 cards, and the mulligan is the real one — shuffle back and redraw one card FEWER, as many times as you like. Premium rarities keep their tighter collector caps (Super-Rare/Full-Art/Ultra-Rare 2, Mythic 1). Existing 30-card decks are marked incomplete — open them in the Deck Builder and QUICKBUILD or fill them up to 60. The Starter Box now grants a full legal 60-card deck.',
      'Ten brand-new keyword abilities, two for every card type, live across the pool right now: Units gained Regenerate (heals all damage at Dawn) and Hardened (every hit is reduced by 1); Events gained Surge (costs 1 less if you already invoked a card this turn) and Resonant (the effect resolves TWICE); Charms gained Runic (bonding it draws a card) and Soulbound (returns to your hand when its unit dies); Locations gained Bountiful (taps for 2 essence) and Sacred (restores 1 Vitality at your Dawn); Leaders gained Commander (+1 Might to all your units while fielded) and Resolute (regains 1 Resolve at Dawn).',
      "Card faces were reorganized into the classic trading-card format: name and essence cost on the top line, art, a type line carrying the rarity marker, then a text box that reads keywords → rules → flavor, with Might/Grit (or a Leader's Resolve) in a proper stat plate at the bottom-right corner. Nothing runs off the card anymore — the redundant color-dot footer is gone (your cost pips already show color identity) and every size tier got a bigger text budget. Art ratios are untouched.",
      'The seven essence icons were redrawn as bold, filled glyphs — the old line-art versions were so thin they rendered invisible inside the small cost pips (and a CSS quirk could blank them out entirely on live builds). Fire, droplet, leaf, gust, sun, crescent and void-ring now read clearly at every size, from board tokens to the full-card view.',
      'The CPU understands every new keyword: it counts Bountiful Sanctums as double essence when planning, gets Surge discounts, and its opening-hand judgment uses the new rulebook mulligan (it gives up a card to escape a dead hand, just like you).',
      'How To Play was rewritten for the new rules — deck construction, the repeatable mulligan, and a keyword glossary that now labels which card type each keyword belongs to.',
      'Bug-hunt pass: Sanctum Locations with "At Dawn/At Dusk" abilities finally DO them — that text has been silently dead since the essence rules launched (only units were ever checked for phase triggers). A Resonant Event whose target dies to the first resolution now re-aims its second resolution instead of wasting it, and invoking your Leader counts as "a card invoked this turn" for Surge discounts.',
      "Economy honesty fixes: your one-of-a-kind Serialized prints can no longer be offered up by the Marketplace sell form, the trade composer, or Player Shop listings (the server always rejected it — now the UI never offers it); a bulk pack-opening's haul summary no longer hides the extra copies of your best pull; and the Profile cosmetic locker no longer shows unowned paid cosmetics as equippable.",
    ],
  },
  {
    version: 'Reaction Update (v5.3)',
    items: [
      'The clash reaction window is now a real threat: the CPU deliberately saves Locations during its own turn so it can answer your attacks with Quick Events and Ambush units — and it now gets that window when you attack, too (it turns out it was only ever reacting in our test games, never against real players).',
      "Smarter attacks: the CPU no longer throws everything at you the moment its total damage looks lethal — it accounts for your guards first, so you'll see far fewer hopeless all-ins (and far fewer of its units suiciding into your Venomous blockers).",
      'You can no longer waste a targeted Event when it has nothing legal to hit (empty or fully Warded enemy board) — the game blocks it and tells you why, instead of eating the card and your essence.',
      "Balance pass: Venomous, Aerial and Quickstrike units now cost a touch more; Siphon and Swarmproof units cost less; Warded units get a small discount (being untargetable just doesn't win as many games as it should). Seven repeat overperformers (including Slate-Scaled Serpent, Nebula Clutch and Shatterline) cost 1 more; six repeat underperformers (including Submerged Starfall and Research Fleet) cost 1 less; Nanite Division Marshal slimmed down.",
      "The seven essence-type icons now appear everywhere colors do: on card color-identity dots, the Starter-Box Leader picker (which previously didn't show colors at all), and the Deck Builder's Leader list.",
      'New lookouts: tap the opponent\'s ash counter to inspect their ash-pile and Void (yours now shows banished cards too), and the "not enough essence" message now names the exact color you\'re missing.',
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
      "Charms with an effect on invoke now let you pick the effect's target after choosing what to bond to, instead of auto-targeting.",
      'During the enemy clash, hand cards you can actually invoke in the reaction window now light up so the window is impossible to miss.',
      'Card faces no longer cut off ability text: the text box stops repeating what the keyword chips already say, long ability text auto-shrinks before it ever clamps, and every card size got a bigger rules-text budget.',
    ],
  },
  {
    version: 'Riptide Update',
    items: [
      'Echo fix: high-rarity Echo cards (Ultra-Rare and up) are meant to recast for free — no extra card to discard — but the board was still asking you to pick a discard that was then ignored, and could even block the recast entirely if your hand was empty. They now echo straight back into play for free, exactly as intended.',
      'Bind cards now tell the truth: several binding Charms also deal direct damage when they bind (Bind + Sap), but the card text only said "Bind" and hid the damage. Card faces, ability pills and the opponent-turn narration now show the full "Bind + Sap X".',
      "The Abyssal Gate finally works as written — a buff we thought we'd given it (twice) turned out to be silently doing nothing due to the same class of tooling bug we've been hunting down, so this board-clearing Event has been quietly weaker than its numbers for a long time. Fixed, then given a fresh, measured buff. Ruthless Succession, the single most consistently underwhelming Event across every deck, also got a buff.",
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
      'Bug-hunt pass: a Deck Builder import that was silently validating against outdated card data instead of the live catalog, a Collection screen that could under-count how many copies of a Leader you had locked into decks, ended Marketplace auctions that kept showing live bid/buy buttons for a moment after they closed, and a handful of buttons that could be double-tapped to double-claim a reward or double-spend on a purchase. Plus more error logging under the hood, keyboard/focus fixes on a few more dialogs, and confirmation toasts on some Social actions that previously gave no feedback at all.',
    ],
  },
  {
    version: 'Slack Tide Update',
    items: [
      "Two long-standing 'trophy' cards (Astral Shoal, Where the Deep Meets the Sky) had one of their stacked abilities removed — they'd already gotten every stat cut we were willing to give them and were still clearly too strong, so this time an ability came off instead. Several other repeat over- and under-performers got another round of tuning, and Aftershock's two weakest cards finally got the buff we'd been meaning to give them.",
      'Big bug-hunt and quality-of-life pass: fixed a rare bug where a network hiccup right after signing in could leave the app stuck on a loading screen forever, a Deck Builder check that could let you claim a single-copy Leader in two decks at once, a first-match tutorial that could loop forever instead of finishing, and keyword/cost tooltips that could swallow your next tap instead of opening what you actually meant to open. Plus over 20 smaller fixes across the Store, Player Shops, Social, Marketplace and Collection screens, and better keyboard/screen-reader support on several dialogs.',
    ],
  },
  {
    version: 'True Colors Update',
    items: [
      'The Bounty Shop now shows the real card — full rarity frame, border, and background treatment — instead of a plain image thumbnail.',
      "Full-Art cards are easier to pull: their odds went from about 1/6th of Super-Rare's chance up to roughly 85% of it (only ~15% rarer than Super-Rare now) in every pack and box that carries them.",
      'Another balance pass: several long-standing over- and under-performers (Astral Shoal, Kinetix Enforcer, Swaying Garden, and others) got another round of tuning, two earlier tweaks that had overshot were dialed back, and a few newly-flagged cards were adjusted for the first time.',
      'Bug-hunt pass: a profile card that could get stuck loading forever after a network hiccup, a Scrap action that silently failed instead of telling you why, a Store screen that could go quiet on a failed purchase instead of showing an error, bulk-quicksell in the Collection that could try to sell serialized cards it shouldn\'t, and a Deck Builder check that could let you pick a Leader already locked into another deck. Plus some smaller fixes to popovers opening off-screen and a stale "Pity" mention in How To Play (removed a while back).',
    ],
  },
  {
    version: 'Undertow Update',
    items: [
      "No gameplay changes this update — this was a deep testing-and-diagnosis pass. We finally pinned down WHY Mer-King's Avenge Swarm deck underperforms: it's not the cards (the same card list wins comfortably under a different Leader), it's that Mer-King's healing-focused kit works against a deck that wants to trade Units away. That means the real fix is a Leader-kit change, not a card buff — coming in a future update.",
      "We also confirmed the Crescendo rework from last update is holding steady, and improved our balance-testing tools so future changes are backed by cleaner data. A couple of tempting tweaks were tried and deliberately NOT shipped because full testing showed they'd quietly make other decks worse — we'd rather ship nothing than ship a change that trades one problem for another.",
    ],
  },
  {
    version: 'Rising Tide Update',
    items: [
      'Locations were quietly a slightly bad deal for over a year of updates — filling that deck slot with a cheap Unit instead usually won more. A dedicated round of testing found the real fix: their on-cast board buff, +3 instead of +2. Locations are now a genuinely good pick, and every Location keyword (Excavate, Foothold, Contested) got stronger right along with them.',
      'Crescendo got rebuilt, not just re-buffed again: it used to only reward rolling MULTIPLE sixes in the same turn, which is rare — so four updates in a row of raising its power barely moved the needle. Now it just needs one six rolled all turn, whether or not you actually spent that die on the card. Noticeably stronger.',
      "Mer-King's Twin Heal deck got its first card-by-card checkup and a few of its weakest cards were quietly strengthened — it's meaningfully better now. Its sibling deck, Avenge Swarm, got the same treatment but didn't respond as well; we're still looking for its real fix.",
      "The CPU's combat AI had a subtle blind spot: when a single attack could kill either of two enemy Units, it would sometimes trade into whichever one happened to be played first instead of the more valuable one. Fixed — it now always takes the better kill.",
      'Bug-hunt pass: a currency typo bug (typing "50" submitting 5,000 instead) had crept back into five different price boxes — found and fixed everywhere. Several "stuck forever" buttons (a failed claim, purchase, or save leaving buttons disabled with no way to recover but a reload) fixed across the Store, Marketplace, Social, News Center, and Player Shops, plus a Collection quicksell button that could offer to sell copies you didn\'t actually have free.',
      'Small QoL: confirm-before dialogs on a few more destructive actions (mystery pool submission, mystery pack purchase, replacing a deck via QUICKBUILD), retry buttons on a couple of screens that used to just get stuck on "Loading…" after a network hiccup, and a live countdown on Marketplace auctions.',
    ],
  },
  {
    version: 'Wall-Breaker Update',
    items: [
      'Balance pass (67,000+ simulated games): Guard Units print +2 HP instead of +3 — a dedicated round of testing finally found a change that both cools down the strongest "wall" decks and lifts the weakest ramp decks at the same time. Crescendo got another power bump.',
      'Honest heads-up: this hit Mer-King harder than the other five Leaders since all of his decks lean on Guard — we tried a few ways to compensate his kit directly and are still tuning it; expect another pass at his weaker decks specifically.',
      "The CPU's decision-making was audited from every angle this pass: after splitting out every reason it might skip its Leader Ability, it turns out there are no real gaps left to fix — every skip is either a legal rule restriction or the CPU correctly prioritizing something better.",
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
      "Fixed a long-standing bug where two Leader abilities never actually worked: Legendary Diver's tempo grant (the next Unit you cast after his Ability skips summoning sickness and now gets +2/+2) and Apex Nanite Shinobi's \"can't buff the same Unit twice in a row\" restriction are finally live.",
      "Keyword changes: Avenge now caps at +2/+2 per card; Overrun punches through half its ATK instead of 1; a Unit's Steel and Bulwark together prevent at most 4 damage per hit; Momentum now also draws you a card; Locations give a bigger +2/+2 (or +3/+3 at Rare+) on cast.",
      'Cards costed as "one die showing exactly N" had over-tuned stats for how easy that cost really is — those Units were rebalanced. Straight-gated cards (Small/Large Straight) got stronger stats and effects to match how much harder straights are to roll than pairs.',
      'The CPU no longer rerolls away dice that pay for its exact-cost cards, and plays them far more often.',
      'New premium card looks: Ultra-Rare cards now print with an animated gold-leaf "Gilded Relic" frame, and Mythics with a "Living Inferno" treatment — embers rising off the card face.',
      'Fixed every credit price box (marketplace bids, shop listings, trades, mystery packs) silently multiplying what you typed by 100 — typing 500 used to submit a 50,000-credit bid.',
      'Combo-gate cost popups now show your real odds of hitting the pattern with two rerolls.',
      "Lots of smaller fixes: wasted rerolls after Snap casts, wrong Echo messages, a stale How to Play (now matches the current rules), the Momentum bonus die not animating, deck validation letting you keep a Leader you no longer own, and card animations now respect your system's reduced-motion setting.",
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
