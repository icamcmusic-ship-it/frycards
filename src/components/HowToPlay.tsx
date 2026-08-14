import React, { useState } from 'react';
import { MetaHeader } from '../meta/ui';
import { RARITY_CHIP, RARITY_ORDER } from '../meta/rarity';
import { KEYWORDS, KEYWORD_TEXT, KEYWORD_TYPES, UNPRINTED_KEYWORDS } from '../game/v3/keywords';
import { COLORS, COLOR_IDENTITY } from '../game/v3/colors';
import { COLOR_PIP } from '../meta/colors';
import { EssenceIcon } from './EssenceIcon';

// Condensed view of docs/RULEBOOK.md (Rulebook v6.0), plus a
// standalone rarity-system explainer and an app feature guide — reachable
// any time from the Main Menu's HOW TO PLAY button (and auto-opened on a
// first-ever visit).
const SECTIONS: { title: string; body: [string, string][] }[] = [
  {
    title: '1 · Objective & Setup',
    body: [
      [
        'Win Condition',
        "Reduce your opponent's Vitality from 20 to 0, or force them to Deal (draw) from an empty deck — either ends the game on the spot.",
      ],
      [
        'Deck',
        'At least 60 cards (Units, Sanctums, Items, Events; up to 100) plus one Leader kept separate in the Leader zone. No more than 4 copies of any card; premium rarities are capped tighter — Super-Rare/Ultra-Rare/Full-Art up to 2, Alt-Art/Mythic exactly 1.',
      ],
      [
        'Color legality',
        "A card's color identity is the colored pips in its Essence Cost. Every colored pip in your deck must fall inside your Leader's two-color identity; colorless cards (generic-only costs) fit any deck.",
      ],
      [
        'Setup',
        'Both players draw a 7-card opening hand. To offset going second, the second player may play TWO basic Wellsprings on their opening turn — the second one arrives exhausted, so it powers their next turn. The first player skips the Deal on their very first Dawn.',
      ],
      [
        'Mulligan',
        'Before the first turn you may shuffle your hand back and draw one card FEWER — as many times as you like (7 → 6 → 5 → …). Keep only when you are happy with the hand.',
      ],
    ],
  },
  {
    title: '2 · Turn Structure',
    body: [
      [
        'Dawn',
        'Recover (untap) all your exhausted permanents, "At Dawn" keywords and triggers fire, then Deal one card. Fully automatic in this client — but not empty: Regenerate heals, Thriving and Empowering grow bodies, Sacred and Radiant restore Vitality, Archivist draws, Resolute rebuilds Leader Resolve, and Glaciate reaches across the table to freeze one of the OPPONENT\'s units. Every one of those is now a line in the Battle Log, and the opponent\'s Dawn is narrated on the board before its turn begins.',
      ],
      [
        'Main Phase I',
        'Invoke Units, Items, Events, Sanctums, or your Leader — and play one basic Wellspring (once per turn, free, any Essence Type in your Leader’s identity).',
      ],
      [
        'Clash',
        'Declare attackers → the defender assigns guards → a reaction window (Quick Events / Ambush units) → simultaneous clash damage.',
      ],
      ['Main Phase II', 'A second full main phase — spend fresh essence, keep developing.'],
      [
        'Dusk',
        '"At Dusk" keywords and triggers fire — Entropic and Blighted erode cards off the opponent\'s deck, Scorched-Earth sweeps their whole board — then you Shed (discard) down to 7 cards and the turn passes.',
      ],
      [
        'The opponent’s turn',
        'Never a black box: every move it makes is narrated one action at a time, and the cards involved light up on the board — yellow for what it is acting WITH, red for what it is aimed AT — with the card it just played held up in the middle of the screen. That covers every moment it acts: its Dawn (where a Glaciate can freeze one of your units before it has played anything), its own turn, its blocks the instant you declare an attack, its Dusk sweeps, and its ANSWERS to a card you just played (it can counter you, or kill the unit you were aiming at, before your card resolves). When it declares an attack, your own Vitality plate lights up too — that is what the attackers are pointed at until you guard them. ⏱ sets the pace (SLOW / NORMAL / FAST), ❚❚ HOLD freezes a move on screen and ▸ STEP then walks the turn one action at a time, and SKIP ▸▸ fast-forwards the rest (and releases the hold). Missed something? ▴ LOG opens the Battle Log on the newest line, with a divider marking everything that happened since your last turn.',
      ],
    ],
  },
  {
    title: '3 · Essence & Wellsprings',
    body: [
      [
        'Producing essence',
        'Exhaust a Location to produce one Essence of its type. Basic Wellsprings take no deck slots — once per turn you simply play one from the game itself. Sanctums are invoked from hand for their cost and produce essence AND carry an ability.',
      ],
      [
        'Paying costs',
        'A cost’s colored pips must be paid with matching Essence; the generic part (the gray numeral) with any Essence. In this client, invoking auto-taps the Locations needed — you can also tap them manually.',
      ],
      [
        'Pool empties',
        'Unspent Essence disappears at the end of every phase — there is no banking essence across phases or turns.',
      ],
      [
        'Timing',
        'Slow Events, Items, Sanctums, and Leaders: your own main phases only. Quick Events and Ambush units: any priority window — your main phases, the guard-step reaction window of either player’s Clash, and whenever an opponent’s card is on the stack waiting to resolve.',
      ],
      [
        'Responding (the stack)',
        'An invoked card does not resolve instantly — it goes on the stack, and the other player gets a window to answer with a Quick Event or Ambush unit before it takes effect. Responses resolve last-in-first-out, and a response whose target is gone by the time it resolves fizzles. PASS when you have no answer (or don’t want to spend one).',
      ],
    ],
  },
  {
    title: '4 · Card Types & Invoking',
    body: [
      [
        'Unit',
        'Has Might (damage it deals) and Grit (damage it takes). Attacks and guards. Freshly invoked units are "summoning sick" — they can’t attack until your next turn unless they have Reckless.',
      ],
      [
        'Location',
        'Wellspring (basic, essence-only) or Sanctum (essence + a static/triggered ability, invoked from hand).',
      ],
      [
        'Item',
        'Bonds to one of your units and grants stats/keywords. Three subtypes: a Charm goes to the Ash-pile when its unit leaves the field, and may instead be cast on YOU for Vitality; a Weapon survives its unit and can re-bond to another for its re-bond cost; a Tool is a Weapon that also weakens a target enemy unit as it bonds.',
      ],
      [
        'Event',
        'Resolves once, then goes to the Ash-pile. Quick = any priority window; Slow = your own main phases only.',
      ],
      [
        'Leader',
        'Starts in the Leader zone; invoke it once you can afford its cost. It has Resolve instead of Might/Grit: its abilities spend (or build) Resolve, one activation per turn — at 0 Resolve it is shattered and gone for the game.',
      ],
    ],
  },
  {
    title: '5 · The Clash (Combat)',
    body: [
      [
        'Attacking',
        'Only recovered, non-Immobile units without summoning sickness (unless Reckless) may attack. Attacking exhausts the unit unless it has Alert.',
      ],
      [
        'Guarding',
        'The defender assigns any of their un-exhausted units to guard attackers — several guards may gang up on one attacker. Unguarded attackers deal their Might straight to the defender’s Vitality.',
      ],
      [
        'Guard shortcuts',
        'Pick an attacker line in the clash bar, then click your units to guard it. The bar shows live how much Vitality is coming through if you confirm as-is, and ✦ SUGGEST fills the lines with the same blocking heuristic the CPU uses — a starting point you can then edit. Escape clears the whole assignment.',
      ],
      [
        'Guard restrictions',
        'Aerial attackers can only be guarded by Aerial or Skywatch units. Nimble attackers can only be guarded by a unit with LESS Might. Swarmproof attackers must be guarded by two or more units, or not at all. Once an attacker is guarded it stays guarded — removing the blocker mid-clash does not let the attack through (only Overrun spills).',
      ],
      [
        'Reaction window',
        'After guards are set, EITHER player may still invoke Quick Events and Ambush units (tapping Locations for essence as needed) before damage resolves — the attacker gets the window in their own Clash too.',
      ],
      [
        'Damage',
        'Simultaneous, except Quickstrike/Doublestrike deal a first-strike sub-step. Venomous damage is lethal at any amount, Siphon converts damage into Vitality (never above 20), and Overrun sends excess damage past shattered guards through to the defender.',
      ],
      [
        'State checks',
        'Lethal damage (or 0 Grit) shatters a unit to the Ash-pile — an Unbreakable unit shrugs off the FIRST such effect of the game (once per game, and it survives wounded, at 1 effective Grit). A unit shrunk to 0 Grit by Withering or a -X/-X effect is shattered the same way, and unlike marked damage that shrinking is permanent: healing will not bring it back. 0-or-less Vitality, or Dealing from an empty deck, loses immediately.',
      ],
    ],
  },
  {
    title: '6 · Keywords',
    // v6.0 gave every card type its own keyword vocabulary and v6.9 added
    // one more per Essence Type, which made a single flat A-to-Z list of 31
    // entries hard to read. Grouped under a heading per card type instead,
    // in the order a player meets them.
    body: (['Unit', 'Event', 'Item', 'Location', 'Leader'] as const).flatMap((type) => [
      [`— ${type} keywords —`, ''] as [string, string],
      // UNPRINTED_KEYWORDS: engine-ready but on no card yet — a glossary
      // entry the player can never meet is dead text (catalog.test.ts owns
      // the same rule for the pool).
      ...KEYWORDS.filter(
        (kw) => KEYWORD_TYPES[kw] === type && !UNPRINTED_KEYWORDS.includes(kw),
      ).map((kw) => [kw, KEYWORD_TEXT[kw]] as [string, string]),
    ]),
  },
  {
    title: '7 · Essence Identity (the Seven Colors)',
    body: COLORS.map((c) => [c, COLOR_IDENTITY[c]] as [string, string]),
  },
  {
    title: '8 · Strategy Primer',
    body: [
      [
        'Curve out',
        'Play your free Wellspring every single turn — it is your mana growth. Missing one puts you a full essence behind for the rest of the game.',
      ],
      [
        'Color discipline',
        'Double-pip costs want multiple Wellsprings of that color. Check your hand’s pips before choosing which Wellspring type to play.',
      ],
      [
        'Guard math',
        'A guard that kills the attacker OR survives the hit is usually worth it; chump-guarding only to save Vitality is a last resort. Remember multiple guards can pile onto one big attacker.',
      ],
      [
        'Leader timing',
        'Leader abilities are repeating value every turn — invoke your Leader as soon as it’s affordable, but mind its Resolve: spending it to 0 shatters the Leader for good.',
      ],
      [
        'Reaction plays',
        'Hold Quick Events and Ambush units to punish the opponent’s Clash — a surprise guard-step unit or removal spell can flip a whole attack.',
      ],
      [
        'Hand discipline',
        'Dusk sheds you down to 7 — if you’re over, invoke something in Main II rather than discarding it for free.',
      ],
    ],
  },
  {
    title: '9 · Rarity System',
    body: [
      [
        'The ladder',
        'Common < Uncommon < Rare < Super-Rare < Ultra-Rare < Full-Art < Alt-Art < Mythic, low to high. Full-Art sits ABOVE Ultra-Rare — the third-rarest tier there is, behind Alt-Art and Mythic only.',
      ],
      [
        'Copy caps',
        'Common/Uncommon/Rare: up to 4 copies in a deck (the rulebook maximum). Super-Rare/Ultra-Rare/Full-Art: up to 2. Alt-Art/Mythic: exactly 1.',
      ],
      [
        'Full-Art',
        'A visually distinct print tier whose still art fills the entire card edge-to-edge — not stronger than other cards at the same power level, just a rarer, flashier version. Priced, dropped and capped above Ultra-Rare in every system.',
      ],
      [
        'Alt-Art',
        "A separately-illustrated alternate printing of a hand-picked existing card — same identity and stats, striking new art. Rarer than Full-Art, behind only Mythic. Its own holographic 'Prism Ink' template shifts color slowly across the full-bleed art, distinct from both Mythic's video and a Serialized print's rotating rainbow frame.",
      ],
      [
        'Mythic',
        'The top of the ladder and the only tier whose art moves: every Mythic is a short looping video clip printed full-bleed behind a glowing gold inner frame. One copy per deck.',
      ],
      [
        'Foil',
        'A separate, independent shine some pulls get regardless of rarity (per-pack foil chance) — a STATIC prismatic foil stamp, deliberately distinct from the animated treatments the premium rarities carry. Foil sells for 2.5x the normal quicksell price.',
      ],
      [
        'Serialized',
        'The rarest possible pull: a numbered print with its own rotating prismatic frame. Only Ultra-Rare, Full-Art and Mythic cards can come out Serialized, from a fixed server-wide supply — 100 Ultra-Rare, 75 Full-Art and 50 Mythic total, ever. About a 1-in-100 chance per pack. Serialized copies can never be foil and can never be quicksold.',
      ],
      [
        'No pity, no guarantees',
        'There is no pity system of any kind. Chase slots always pay at least a Rare — everything above that is genuine luck. Every pack shows its exact server-side odds under VIEW DROP ODDS before you spend anything.',
      ],
    ],
  },
  {
    title: '10 · Packs, Boxes & Opening',
    body: [
      [
        'Pack anatomy',
        'Every pack is pinned to one set — today that is "Volume #1", the launch set every printed card belongs to, with "Players Showcase 2026" (the community set fed by CARD SUBMISSIONS) getting its own booster once it is big enough. Packs roll slot by slot: foundation slots (Commons/Uncommons in bulk), synergy slots (Uncommon-to-Super-Rare), and chase slots (Rare floor, small shot at the top end). The standard booster is 8 cards, and one of them is ALWAYS a foil — with about an 8% chance of a second foil elsewhere in the pack.',
      ],
      [
        'Booster Box',
        'The Volume #1 Booster Box is six full boosters (48 cards) in one big rip at a bulk discount, plus a guaranteed-foil box topper with a SUPER-RARE floor — 49 cards, every box guaranteed a foil Super-Rare or better.',
      ],
      [
        'Deck Box',
        'Every operative claims one free Deck Box from the Store: pick any Rare-or-below Leader and it opens into that Leader plus a ready-to-play, colour-legal 60-card deck built around them — 2 Super-Rares, 8 Rares, and Uncommons/Commons to fill the curve. The deck is saved to your decks automatically.',
      ],
      [
        'Mass opening',
        'Buy-and-open 5 or 10 copies of any pack in one click, or OPEN ALL from MY PACKS. Big hauls show a grouped summary — duplicates stack with a ×N badge, best pull spotlighted on top.',
      ],
      [
        'No dupe protection',
        'Every slot is a straight random pull — packs can repeat cards you already own. Duplicates are always kept; there is no per-rarity copy cap, so extra copies stack in your collection to quick-sell or trade whenever you like.',
      ],
      [
        'Daily freebies',
        'Two separate daily faucets: the free Daily Pack in the Store (every 20 hours), and the Daily Login Reward on the main menu (once per calendar day, escalating over a 7-day streak).',
      ],
    ],
  },
  {
    title: '11 · Economy & Currencies',
    body: [
      [
        'Credits',
        'The base currency. Earned from matches, level-ups, missions, achievements, daily logins and quickselling. Spent on packs, boxes, cosmetics and the Marketplace.',
      ],
      [
        'Vouchers',
        'The premium currency — from achievements, missions, level milestones (every 5th level) and day-7 login streaks. Some packs can be bought with either.',
      ],
      [
        'Quicksell',
        'Instant credits for spare cards at a fixed price by rarity; foils always sell for 2.5×. Cards locked in decks and Serialized copies can never be quicksold.',
      ],
      [
        'Player-to-player',
        'The Marketplace (fixed listings and auctions, 5% seller fee), direct friend Trades, and level-50 Player Shops all move cards between real players.',
      ],
      [
        'XP sources',
        'Matches, opening packs (20 XP each), and missions (Battle Pass XP is tracked separately for the seasonal pass).',
      ],
    ],
  },
  {
    title: '12 · Using Fry Cards — Every Feature',
    body: [
      [
        'Collection',
        'Browse every card you own, filter by rarity/type/color, inspect full card art, and quicksell spares for credits.',
      ],
      [
        'Deck Builder',
        'Assemble a legal 60-card deck plus Leader from your Collection. QUICKBUILD auto-fills a legal deck; the stats panel shows your essence-cost curve, card types and keywords. The same physical copy can never be locked into two decks at once.',
      ],
      [
        'Store',
        'Buy packs and boxes with credits or vouchers, claim your free Daily Pack every 20 hours, open in bulk, and check VIEW DROP ODDS on any pack before buying.',
      ],
      [
        'Battle Pass',
        'A free, seasonal 25-tier reward track. Earn XP from matches and missions; claim tiers as you cross their XP threshold.',
      ],
      [
        'Missions & Achievements',
        'Daily/weekly missions and permanent achievements pay out credits, vouchers and free packs for playing normally.',
      ],
      [
        'Marketplace & Shops',
        'List spare cards for a fixed price or run a timed auction with bids and a buyout (5% seller fee). Player Shops unlock at level 50.',
      ],
      [
        'Friends & Trading',
        'Search players, send friend requests, and propose direct card-and-credits trades.',
      ],
      [
        'Card Submissions',
        'Design your own card: send Fry a title, a card type, flavor text and an art link, and he prints the ones he likes into the PLAYERS SHOWCASE 2026 set. One full art and one video Mythic per account; everything else is unlimited. Mechanics are assigned by the game itself, so there is no rules text to write.',
      ],
      [
        'News Center',
        'One place for the newest changelog headline, dev blog posts, and a live feed of every Serialized card pulled server-wide.',
      ],
      [
        'Profile & Settings',
        'Track your stats, equip cosmetics, pick a color theme, set how fast the opponent’s turn is narrated (SLOW / NORMAL / FAST), and opt out of username recognition in the Serialized feed.',
      ],
    ],
  },
];

export function HowToPlayScreen({ onBack }: { onBack: () => void }) {
  const [open, setOpen] = useState(0);

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="HOW TO PLAY" onBack={onBack} />
      <div className="p-6 max-w-3xl mx-auto flex flex-col gap-2">
        {SECTIONS.map((sec, i) => (
          <div key={sec.title} className="ink-border-sm shadow-hard-black-xs bg-[var(--c-paper)]">
            <button
              onClick={() => setOpen(open === i ? -1 : i)}
              aria-expanded={open === i}
              className="w-full text-left px-4 py-2 heading-font text-sm flex justify-between items-center bg-[var(--c-steel)] text-[var(--c-paper)] hover:bg-[var(--c-ink)]"
            >
              <span>{sec.title}</span>
              <span className="text-[var(--c-yellow)]">{open === i ? '▾' : '▸'}</span>
            </button>
            {open === i && (
              <dl className="px-4 py-3 grid gap-2 text-sm">
                {sec.body.map(([term, desc]) =>
                  // A row with no description is a group heading (see the
                  // Keywords section) — render it full-width, not as a
                  // term chip with an empty definition beside it.
                  desc === '' ? (
                    <div
                      key={term}
                      className="text-[10px] font-mono font-black tracking-widest text-[var(--c-steel)] uppercase pt-2 first:pt-0"
                    >
                      {term}
                    </div>
                  ) : (
                    <div key={term} className="grid grid-cols-[8.5rem_1fr] gap-2 items-baseline">
                      <dt className="font-black text-[11px] bg-[var(--c-yellow)] px-1.5 py-0.5 justify-self-start flex items-center gap-1">
                        {sec.title.includes('Essence Identity') && (
                          <span
                            className="inline-flex items-center justify-center rounded-full font-mono font-black shrink-0"
                            style={{
                              width: 14,
                              height: 14,
                              fontSize: 8,
                              backgroundColor: COLOR_PIP[term as (typeof COLORS)[number]]?.bg,
                              color: COLOR_PIP[term as (typeof COLORS)[number]]?.fg,
                            }}
                          >
                            <EssenceIcon
                              type={term as (typeof COLORS)[number]}
                              color={COLOR_PIP[term as (typeof COLORS)[number]]?.fg}
                              size={8}
                            />
                          </span>
                        )}
                        {term}
                      </dt>
                      <dd className="text-[12px] font-medium text-[var(--c-ink)]/90 leading-snug">
                        {desc}
                      </dd>
                    </div>
                  ),
                )}
                {sec.title === '9 · Rarity System' && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {RARITY_ORDER.map((r) => (
                      <span
                        key={r}
                        className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${RARITY_CHIP[r] || ''}`}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </dl>
            )}
          </div>
        ))}
        <div className="text-center text-[10px] font-mono font-bold text-[var(--c-steel)]/70 mt-2 mb-6">
          {/* Kept equal to the version `docs/RULEBOOK.md` actually prints
              (and to PlayScreen's "Fry Cards rules v6.0" strip) — this had
              drifted to a V9.0 that no rulebook has ever carried, so the one
              page telling a player which rules they are reading named a
              document that does not exist. */}
          FRY CARDS RULEBOOK V6.0
        </div>
      </div>
    </div>
  );
}
