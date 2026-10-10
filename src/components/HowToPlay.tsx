import { PlayingCard as SpriteCard } from './PlayingCard';
import React from 'react';
import {
  Coins,
  Flag,
  Gauge,
  Gavel,
  Hand,
  Layers,
  Library,
  Package,
  Spade,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { MetaHeader, PopButton, ProgressBar } from '../meta/ui';
import { MetaScreen, canEnterScreen } from '../meta/routes';
import { isCpuLocked } from '../meta/cpuAccess';
import { restartCoach } from '../meta/coachPractice';
import { useMeta } from '../meta/MetaContext';
import { usePersistedState } from '../meta/usePersistedState';
import { RARITY_CHIP, RARITY_ORDER } from '../meta/rarity';
import { KEYWORDS, KEYWORD_SPECS, KEYWORD_TEXT, fmtUnits } from '../game/poker/keywords';
import { COLORS, COLOR_IDENTITY, type Color } from '../game/poker/colors';
import {
  CAPS,
  COST_LADDER_UNITS,
  MAX_EXCLUSIONS,
  MODES,
  MODE_IDS,
  NERVE,
  PLACE_FACTORS,
  SECOND_COST_TIER,
  STACK_CAP_SHARE,
} from '../game/poker/constants';
import { LOCATION_TEMPLATES } from '../game/poker/locations';
import { ordinal, placementReward } from '../game/poker/rewards';
import { COLOR_PIP } from '../meta/colors';
import { EssenceIcon } from './EssenceIcon';

// Condensed view of docs/RULEBOOK.md (FryCards Poker rulebook v1.0), plus a
// standalone rarity-system explainer and an app feature guide — reachable any
// time from the Main Menu's HOW TO PLAY button (and auto-opened on a first-ever
// visit). Written for card players who have never played Hold'em: real poker
// first, then the FryCards layers on top. Every number below is read from the
// engine's own tables (constants.ts, keywords.ts, locations.ts, rewards.ts) so
// a balance pass cannot leave this page quoting stale rules.

type Row = [string, string];

interface Section {
  title: string;
  body: Row[];
  /** Terms are colours: print each one's pip beside it. */
  colourPips?: boolean;
  /** Something drawn under the rows (the rarity ladder). */
  footer?: React.ReactNode;
}

const STANDARD = MODES.standard;
const tierCost = (t: number) => fmtUnits(COST_LADDER_UNITS[t]);

/** The nine hand categories, best first, with an example of each. */
export const HAND_RANKS: { name: string; example: string; note: string }[] = [
  {
    name: 'Straight flush',
    example: '9♥ 8♥ 7♥ 6♥ 5♥',
    note: 'Five in a row, all one suit. A-K-Q-J-10 suited is a royal flush, the best hand there is.',
  },
  { name: 'Four of a kind', example: 'Q♠ Q♥ Q♦ Q♣ 4♠', note: 'All four cards of one rank.' },
  {
    name: 'Full house',
    example: '7♠ 7♦ 7♣ K♥ K♠',
    note: 'Three of a kind plus a pair. Higher trips win first.',
  },
  {
    name: 'Flush',
    example: 'A♦ J♦ 8♦ 6♦ 2♦',
    note: 'Any five of one suit. Compare the highest card, then the next.',
  },
  {
    name: 'Straight',
    example: '10♣ 9♦ 8♠ 7♥ 6♣',
    note: 'Five ranks in a row, mixed suits. The ace plays high (A-K-Q-J-10) or low (5-4-3-2-A).',
  },
  {
    name: 'Three of a kind',
    example: '8♠ 8♥ 8♦ K♣ 3♠',
    note: 'Three cards of one rank ("trips").',
  },
  {
    name: 'Two pair',
    example: 'J♠ J♦ 4♣ 4♥ A♠',
    note: 'Two different pairs. The higher pair decides, then the lower, then the fifth card.',
  },
  { name: 'Pair', example: '10♥ 10♠ K♦ 6♣ 2♥', note: 'Two cards of one rank.' },
  {
    name: 'High card',
    example: 'A♣ Q♦ 9♠ 5♥ 3♣',
    note: 'Nothing above. The highest card wins, then the next.',
  },
];

/** Keyword glossary rows, grouped by colour (the common set first). */
function keywordRows(): Row[] {
  const groups: { label: string; colour: Color | null }[] = [
    { label: 'Common set — every colour', colour: null },
    ...COLORS.map((c) => ({
      label: `${c} — ${COLOR_IDENTITY[c].split(':')[0].toLowerCase()}`,
      colour: c,
    })),
  ];
  return groups.flatMap(({ label, colour }) => {
    const kws = KEYWORDS.filter((k) => KEYWORD_SPECS[k].color === colour);
    if (kws.length === 0) return [];
    return [
      [`— ${label} —`, ''] as Row,
      ...kws.map((k) => {
        const s = KEYWORD_SPECS[k];
        const tags = [
          s.gated ? `Only ${s.color} cards carry it.` : '',
          s.hostile ? 'Hostile.' : '',
        ].filter(Boolean);
        return [s.numbered ? `${k} N` : k, [KEYWORD_TEXT[k], ...tags].join(' ')] as Row;
      }),
    ];
  });
}

function rewardRows(): Row[] {
  const rows: Row[] = Object.keys(PLACE_FACTORS).map((n) => {
    const seats = Number(n);
    const pays = Array.from(
      { length: seats },
      (_, i) => placementReward(i + 1, seats, 'standard').credits,
    );
    return [`${seats} seats`, pays.map((c, i) => `${ordinal(i + 1)} ${c}`).join(' · ')] as Row;
  });
  return [
    [
      'Placement only',
      'Rewards pay by where you finish, never by chips. Chips exist only inside a match: they reset every game and can never be bought, carried over or traded.',
    ],
    ['Credits (Standard)', ''],
    ...rows,
    [
      'Mode multiplier',
      MODE_IDS.map((m) => `${MODES[m].label} ×${MODES[m].rewardMult}`).join(' · ') +
        '. XP and battle-pass XP scale the same way.',
    ],
    [
      'Minimum length',
      `A match must run at least ${MODE_IDS.map((m) => `${MODES[m].minMatchMs / 60000} min (${MODES[m].label})`).join(', ')} to pay out.`,
    ],
  ];
}

const SECTIONS: Section[] = [
  {
    title: '1 · The Goal & the Table',
    body: [
      [
        'Freezeout',
        `FryCards Poker is Texas Hold'em for 2 to 6 seats. Everyone starts with the same stack (${STANDARD.stackUnits} chip units in Standard). Lose all your chips and you are out; the last seat with chips wins.`,
      ],
      [
        'The clock',
        `Blinds rise on a clock, not a hand count (×${STANDARD.blindGrowth} every ${STANDARD.levelMs / 60000} minutes in Standard). When the mode's time cap runs out (${STANDARD.capMs / 60000} minutes in Standard) the current hand finishes, then everyone still in is ranked by stack.`,
      ],
      [
        'Placement',
        'Seats that bust are ranked by when they went out. Rewards follow your finishing place.',
      ],
      [
        'Your deck',
        'You do not play with your deck cards as poker cards. The poker cards are a normal 52-card deck the table shares. Your deck is a Leader, one Location and a stack of power cards that bend the poker.',
      ],
    ],
  },
  {
    title: "2 · A Hand of Hold'em",
    body: [
      [
        'Button & blinds',
        'The dealer button moves one seat left every hand. The two seats after it post forced bets: the small blind (half) and the big blind (one full blind). Heads-up, the dealer posts the small blind.',
      ],
      [
        'Hole cards',
        'Each seat gets two private cards face-down: your hole cards. Only you can see them.',
      ],
      [
        'Pre-flop',
        'The first betting round. It starts with the seat after the big blind and goes around the table.',
      ],
      [
        'Flop',
        'Three community cards are dealt face-up in the middle. Everyone shares them. Second betting round.',
      ],
      ['Turn', 'A fourth community card. Third betting round.'],
      ['River', 'The fifth and last community card. Final betting round.'],
      [
        'Showdown',
        'If two or more seats are still in after the river, they show. Each makes the best five-card hand from their two hole cards plus the five on the board (any five of the seven). Best hand wins the pot; an exact tie splits it.',
      ],
      [
        'Your options',
        'FOLD: give up the hand. CHECK: pass the action when there is no bet to you. CALL: match the current bet. BET or RAISE: put in more and make everyone else match it. ALL-IN: bet everything you have left.',
      ],
      ['Keyboard', 'F folds, C checks or calls, R raises. The raise slider sets the size.'],
      [
        'Winning without a showdown',
        'If everyone else folds, you win the pot without showing. That is what makes a bluff work.',
      ],
    ],
  },
  {
    title: '3 · Betting: Pot-Limit, All-In & Side Pots',
    body: [
      [
        'Pot-limit',
        'The biggest raise you may make is the size of the pot after you call. The smallest raise is the size of the last bet or raise (at least one big blind).',
      ],
      [
        'All-in',
        'You can never be forced out of a hand for lack of chips. Going all-in keeps you in for the part of the pot you matched.',
      ],
      [
        'Side pots',
        'When a short stack is all-in, the chips the others keep betting go into a side pot that the all-in seat cannot win. Each pot is awarded on its own at showdown.',
      ],
      [
        'Who shows',
        'Pot winners show. The last seat that bet or raised must show too. Everyone else mucks (hides) a losing hand unless the Location is Open Table.',
      ],
      [
        'Odd chips',
        'A pot that will not split evenly gives the odd chip to the first winner left of the button.',
      ],
      [
        'Busting',
        'Once you are out you can watch the rest of the match at 4× speed or skip to the result.',
      ],
    ],
  },
  {
    title: '4 · Your Deck & the Modes',
    body: [
      [
        'Deck',
        "One Leader + one Location + power cards. The Leader's two colours decide which colours the deck may hold; colourless cards fit any deck.",
      ],
      ...MODE_IDS.map((id) => {
        const m = MODES[id];
        return [
          m.label,
          `${m.stackUnits}-unit stacks · blinds ×${m.blindGrowth} every ${m.levelMs / 60000} min · ~${m.capMs / 60000} min · ${m.powers} powers · up to ${m.maxCopies} copies, ${m.maxTier5} tier-5 card${m.maxTier5 === 1 ? '' : 's'} · power hand ${m.handStart} to start, draw ${m.handDraw} a hand, hold ${m.handCap} max.`,
        ] as Row;
      }),
      [
        'Power hand',
        'Your power cards are a separate hand, hidden from the table. When your power deck runs out, your discard is reshuffled.',
      ],
      [
        'Old decks',
        'Decks from the retired 60-card game, and their share links, no longer work. Your collection is untouched.',
      ],
    ],
  },
  {
    title: '5 · Power Cards: Units, Items, Events',
    body: [
      [
        'Tiers',
        'Every power has a tier from 1 to 5: ★ stars on Units, ⚙ gears on Items, ϟ bolts on Events. The tier sets the chip cost and the number N in its keywords. Tier is not rarity.',
      ],
      [
        'Unit ★',
        `One effect. It stays on the table as a visible token until the hand ends, then goes to your discard. Up to ${CAPS.unitCount} Units a hand with ${CAPS.unitStars} stars between them (5, 4+1, 3+2, 2+2… two 3-stars is too many).`,
      ],
      [
        'Item ⚙',
        `Bonds to your Unit. With no Unit out it bonds to a hole card at one cost step more. Up to ${CAPS.itemCount} Items and ${CAPS.itemGears} gears a hand.`,
      ],
      ['Charm', 'An Item that works this hand, then goes to your discard.'],
      ['Weapon', 'An Item that returns to your hand after use.'],
      [
        'Tool',
        "An Item that also marks one of the target's hole cards: you learn it for the hand.",
      ],
      [
        'Event ϟ',
        `Resolves once, then goes to your discard. Up to ${CAPS.eventBolts} bolts a hand and ${CAPS.eventsPerStreet} Events a street.`,
      ],
      [
        'Quick Event',
        'Castable on your turn and in the short response windows after a cast or a raise.',
      ],
      ['Slow Event', 'Castable only on your own turn, before you act on that street.'],
    ],
  },
  {
    title: '6 · Casting & Costs',
    body: [
      [
        'When',
        'On your turn, before you bet, check, call or fold. Casting does not use up your turn. Folded seats cannot cast.',
      ],
      [
        'Cost ladder',
        `Tier 1: ${tierCost(1)} · tier 2: ${tierCost(2)} · tier 3: ${tierCost(3)} · tier 4: ${tierCost(4)} · tier 5: ${tierCost(5)} chip units. Costs are fixed for the whole match, so powers get relatively cheaper as the blinds climb.`,
      ],
      [
        'Into the pot',
        'Chips you pay go into the pot, never out of the game. Whoever wins the pot wins them too, so a big payment is a signal the table can read.',
      ],
      [
        'Steps',
        `Some things move a cost along the ladder: Surge and Happy Hour make it one step cheaper (never below ${fmtUnits(COST_LADDER_UNITS[0])}), tilt and an unbonded Item one step dearer.`,
      ],
      [
        'Second cost',
        `Tier ${SECOND_COST_TIER} and ${SECOND_COST_TIER + 1} powers also need a non-chip cost, your choice of: SHED another power card from your hand; BLIND one of your hole cards (you cannot look at it until the street ends); or a HAND EXCLUSION.`,
      ],
      [
        'Hand exclusion',
        `Name a hand you could still make (pair, two pair, trips, straight or flush). If that is your best hand at showdown you cannot win the pot; it goes to the best eligible hand. It does nothing if everyone else folds. At most ${MAX_EXCLUSIONS} a hand, announced to the table. If every contender is excluded, exclusions are ignored.`,
      ],
      [
        'Stack cap',
        `No cast costs more than ${STACK_CAP_SHARE * 100}% of your current stack. The excess becomes one more second cost. That is also how an all-in seat can still cast.`,
      ],
      [
        'Public',
        'A cast shows its full card face, the caster and the target to everyone. Casting is itself a bluff: the face tells the table what you want them to think.',
      ],
      [
        'Response window',
        'After a cast (and after a raise) every other seat holding a Quick Event or an Ambush card gets a short window to answer. A response resolves at once; there are no responses to responses, and no stack. Then the original cast resolves. Quickstrike skips the window.',
      ],
      [
        'Fizzle',
        'If your target folds before your cast resolves, it fizzles. The cost is not refunded.',
      ],
      [
        'Hostile limit',
        'A hostile power (marked Hostile in the glossary) attacks a seat. Each seat can be hit by at most one hostile power per street, and being hit costs it nerve.',
      ],
    ],
  },
  {
    title: '7 · Information & Bluffing',
    body: [
      [
        'What you see',
        'Your own hole cards, the board and every public play. Everything else is granted by a power. Other seats see how many power cards you hold, never which.',
      ],
      [
        'Private results',
        'Everyone sees that you peeked at a seat; only you see what you saw. Peek, Mark, Foresee and Redraw results are yours alone. Reveal turns a card face-up for the whole table.',
      ],
      ['Veil', 'Hides where a cast points until the street ends.'],
      [
        'Feint',
        'About 1 card in 12 can Feint: cast face-up, secretly choosing to let it fizzle. To the table it looks resolved.',
      ],
      [
        'Call Out',
        "Light's truth tool: test a seat's last cast. A caught Feint costs its caster nerve and refunds the Call Out. A real cast keeps your chips in the pot.",
      ],
      [
        'Bots',
        "CPU seats only ever see their own seat's view. Harder bots decide better; they never see more.",
      ],
    ],
  },
  {
    title: '8 · Nerve & Leaders',
    body: [
      [
        'Nerve',
        `A public meter from 0 to ${NERVE.max}; everyone starts at ${NERVE.start}. It is a readable tell: a seat low on nerve is close to tilting.`,
      ],
      [
        'Gain nerve',
        `+${NERVE.winShowdown} winning a showdown · +${NERVE.bluffWin} when a bluff gets through (everyone folds to a hand that had nothing) · +${NERVE.strongFold} folding a strong hand.`,
      ],
      [
        'Lose nerve',
        `${NERVE.caughtBluff} caught bluffing at showdown · ${NERVE.hostileHit} each time a hostile power hits you · ${NERVE.calledOutFizzle} when a Call Out catches your Feint · Needle drains it directly.`,
      ],
      [
        'Tilt',
        'At 0 nerve you are tilted: your Leader is locked and every power costs one step more until your nerve recovers. Nerve never knocks you out; only chips do.',
      ],
      [
        'Leader abilities',
        'Each Leader has two: one SPENDS nerve (strong) and one BUILDS nerve (weaker, and it costs a few chips into the pot). One Leader ability per hand, on your own turn.',
      ],
      [
        'Personas',
        'The same Leaders drive the CPU seats. Their colours set the style: Ember and Shadow bluff more, Void plays tight, Light bluffs least.',
      ],
    ],
  },
  {
    title: '9 · Locations (the Table Rule)',
    body: [
      [
        'The bag',
        "Every seat's Location goes into a shared bag with one Plain Table. Each hand plays the next one, in an order that ignores who is dealing, so a Location is the table's weather, not anyone's perk. The bag refills when it empties and never repeats the same Location twice in a row.",
      ],
      ['Forecast', 'The table shows the next two Locations, so you can plan casts around them.'],
      [
        'Small tables',
        'With 2 or 3 seats, house Locations join the bag so the table sees at least five different ones.',
      ],
      [
        'Credit',
        "The owner's name and the card art are shown when their Location comes up. The owner gets no bonus.",
      ],
      ['— The rules —', ''],
      ...Object.values(LOCATION_TEMPLATES).map((t) => [t.name, t.text()] as Row),
    ],
  },
  {
    title: '10 · Keywords',
    // Read straight from KEYWORD_SPECS, grouped by colour the way the colour
    // gating works: the common set first, then each colour's own vocabulary.
    body: [
      [
        'Reading a card',
        'A power is one effect keyword plus modifiers. N is set by the tier; chip amounts are in chip units. Light owns reading other seats, Void owns denial: those keywords only appear on cards of that colour.',
      ],
      ...keywordRows(),
    ],
  },
  {
    title: '11 · The Seven Colours',
    colourPips: true,
    body: COLORS.map((c) => [c, COLOR_IDENTITY[c]] as Row),
  },
  {
    title: '12 · Strategy Primer',
    body: [
      [
        'Play fewer hands',
        'Most two-card starts lose. Pairs, two high cards (A-K, A-Q, K-Q) and suited aces are worth playing; fold most of the rest, especially early.',
      ],
      [
        'Position',
        'Acting last is a big edge: you see what everyone else did first. Play more hands on the button, fewer just after the blinds.',
      ],
      [
        'Price your calls',
        'Compare the call to the pot. Calling 1 into a pot of 4 only needs you to win one time in five to break even.',
      ],
      [
        'Bet for a reason',
        'Bet to get called by worse hands, or to make better hands fold. A bet that does neither just costs chips.',
      ],
      [
        'Cast with intent',
        'A cast is information for the table. A big Peek tells everyone you are unsure; a Bait or a Gambit can be there purely to draw a raise.',
      ],
      [
        'Watch the nerve meters',
        'A tilted seat cannot use its Leader and pays more for powers. A seat near zero may play scared — or reckless.',
      ],
    ],
  },
  {
    title: '13 · Rewards',
    body: rewardRows(),
  },
  {
    title: '14 · Rarity System',
    body: [
      [
        'The ladder',
        'Common < Uncommon < Rare < Super-Rare < Ultra-Rare < Full-Art < Alt-Art < Mythic, low to high. Full-Art sits ABOVE Ultra-Rare — the third-rarest tier there is, behind Alt-Art and Mythic only.',
      ],
      [
        'Rarity is not power',
        "A card's tier (stars, gears, bolts) is generated separately. Rarity only nudges it: a Mythic is more often tier 3+ than a Common, but not always. Commons get simple, reliable effects; Mythics get odd, high-variance ones.",
      ],
      [
        'Copy limits',
        `Set by the mode, not the rarity: up to ${MODES.quick.maxCopies} copies in Quick and Standard, ${MODES.deep.maxCopies} in Deep.`,
      ],
      [
        'Full-Art',
        'A visually distinct print tier whose still art fills the entire card edge-to-edge — not stronger than other cards, just a rarer, flashier version. Priced, dropped and capped above Ultra-Rare in every system.',
      ],
      [
        'Alt-Art',
        "A separately-illustrated alternate printing of a hand-picked existing card — same identity, striking new art. Rarer than Full-Art, behind only Mythic. Its own holographic 'Prism Ink' template shifts color slowly across the full-bleed art.",
      ],
      [
        'Mythic',
        'The top of the ladder and the only tier whose art moves: every Mythic is a short looping video clip printed full-bleed behind a glowing gold inner frame.',
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
    footer: (
      <div className="flex flex-wrap gap-1.5 mt-1">
        {RARITY_ORDER.map((r) => (
          <span
            key={r}
            className={`fs-xs font-black px-1.5 py-0.5 rounded-full ${RARITY_CHIP[r] || ''}`}
          >
            {r}
          </span>
        ))}
      </div>
    ),
  },
  {
    title: '15 · Packs, Boxes & Opening',
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
        'Every operative claims one free Deck Box from the Store: pick any Rare-or-below Leader and it opens into that Leader plus a ready-to-play, colour-legal deck built around them. The deck is saved to your decks automatically.',
      ],
      [
        'Mass opening',
        'Buy-and-open 5 or 10 copies of any pack in one click, or OPEN ALL from MY PACKS. Big hauls show a grouped summary — duplicates stack with a ×N badge, best pull spotlighted on top.',
      ],
      [
        'No dupe protection',
        'Every slot is a straight random pull — packs can repeat cards you already own. Duplicates are always kept, so extra copies stack in your collection to quick-sell or trade whenever you like.',
      ],
      [
        'Daily freebies',
        'Two separate daily faucets: the free Daily Pack in the Store (every 20 hours), and the Daily Login Reward on the main menu (once per calendar day, escalating over a 7-day streak).',
      ],
    ],
  },
  {
    title: '16 · Economy & Currencies',
    body: [
      [
        'Credits',
        'The base currency. Earned from matches (by finishing place), level-ups, missions, achievements, daily logins and quickselling. Spent on packs, boxes, cosmetics and the Marketplace.',
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
        'The Marketplace (fixed listings and auctions, 5% seller fee), direct friend Trades, and Player Shops all move cards between real players.',
      ],
      [
        'XP sources',
        'Matches, opening packs (20 XP each), and missions (Battle Pass XP is tracked separately for the seasonal pass).',
      ],
    ],
  },
  {
    title: '17 · Using Fry Cards — Every Feature',
    body: [
      [
        'Collection',
        'Browse every card you own, filter by rarity/type/color, inspect full card art, and quicksell spares for credits.',
      ],
      [
        'Deck Builder',
        'Pick a Leader, one Location and the power cards for a mode (16, 24 or 36). The builder checks copies, tier-5 limits and colours as you go. The same physical copy can never be locked into two decks at once.',
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
        'List spare cards for a fixed price or run a timed auction with bids and a buyout (5% seller fee). Player Shops unlock at level 20.',
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
        '3D Showroom',
        'A card as an object, not a picture. Drag it and it turns all the way round, tilt it, zoom close enough to read the smallest line of text, or leave it turning by itself. Wheel or pinch to zoom, arrow keys to tilt, F to flip, R to reset, SPACE for auto-spin. Reach it from the menu, from VIEW IN 3D in the card inspector, or from any slab on your Collection shelf.',
      ],
      [
        'News Center',
        'One place for the newest changelog headline, dev blog posts, and a live feed of every Serialized card pulled server-wide.',
      ],
      [
        'Profile & Settings',
        'Track your stats, equip cosmetics, pick a color theme, set how fast the CPU seats act (1× / 2× / INSTANT), and opt out of username recognition in the Serialized feed.',
      ],
    ],
  },
];

type Action =
  /** Restart the first-match coach and open the practice (quick match) screen. */
  { kind: 'practice' } | { kind: 'screen'; screen: MetaScreen; label: string };

interface StepCard {
  title: string;
  body: string;
  icon: LucideIcon;
  /** A small picture of the idea, built from existing components. */
  art?: React.ReactNode;
  action: Action;
}

/** A playing card as text: "K♥" in red, "7♠" in ink. */
const SUIT_GLYPHS = ['♠', '♥', '♦', '♣'];

/** A card from its printed label ("9♥", "10♣"), drawn with the same Kenney
 * sprites the table uses. */
function PlayingCard({
  label,
  size = 'sm',
}: {
  key?: React.Key;
  label: string;
  size?: 'sm' | 'xs';
}) {
  const rank = label.slice(0, -1);
  const suit = SUIT_GLYPHS.indexOf(label.slice(-1));
  const r = rank === '10' ? 10 : '23456789TJQKA'.indexOf(rank) + 2;
  return (
    <SpriteCard
      r={r}
      s={Math.max(0, suit)}
      scale={1}
      title={label}
      className={size === 'xs' ? '-mr-1' : undefined}
    />
  );
}

/** Two hole cards, fanned. */
function HoleCards() {
  return (
    <div className="flex items-end h-12 pl-2" aria-hidden>
      {(['A♠', 'K♥'] as const).map((c, i) => (
        <span
          key={c}
          className="-ml-2 first:ml-0"
          style={{ transform: `rotate(${i ? 8 : -8}deg)` }}
        >
          <PlayingCard label={c} />
        </span>
      ))}
    </div>
  );
}

/** The board: flop (three), turn, river. */
function BoardRow() {
  const cards = ['Q♣', '7♦', '2♠', 'J♥', '10♠'];
  const label = ['FLOP', '', '', 'TURN', 'RIVER'];
  return (
    <div className="flex items-end gap-1" aria-hidden>
      {cards.map((c, i) => (
        <span
          key={c}
          className={`flex flex-col items-center gap-0.5 ${i === 3 ? 'ml-2' : ''} ${i === 4 ? 'ml-1' : ''}`}
        >
          <span className="fs-xs font-mono font-black text-[var(--c-steel)] h-3 leading-none">
            {label[i]}
          </span>
          <PlayingCard label={c} size="xs" />
        </span>
      ))}
    </div>
  );
}

/** The three tier marks. */
function TierMarks() {
  return (
    <div className="flex items-center gap-3 font-black text-sm" aria-hidden>
      <span>★★★ Unit</span>
      <span>⚙⚙ Item</span>
      <span>ϟ Event</span>
    </div>
  );
}

/** The seven colours as the pips they print on cards. */
function ColourRow() {
  return (
    <div className="flex flex-wrap gap-1" aria-label="The seven colours">
      {COLORS.map((c) => (
        <span
          key={c}
          title={c}
          className="inline-flex items-center justify-center rounded-full w-6 h-6"
          style={{ backgroundColor: COLOR_PIP[c]?.bg, color: COLOR_PIP[c]?.fg }}
        >
          <EssenceIcon type={c} color={COLOR_PIP[c]?.fg} size={14} />
        </span>
      ))}
    </div>
  );
}

const STEPS: StepCard[] = [
  {
    title: 'Build a deck',
    body: `Pick a Leader (it sets your two colours), one Location and your power cards: ${MODE_IDS.map((m) => `${MODES[m].powers} for ${MODES[m].label}`).join(', ')}.`,
    icon: Layers,
    art: <ColourRow />,
    action: { kind: 'screen', screen: 'decks', label: 'OPEN DECK BUILDER' },
  },
  {
    title: 'Look at your two cards',
    body: 'You get two private hole cards. Your hand is the best five cards out of those two plus the five on the board. See HAND RANKS below.',
    icon: Spade,
    art: <HoleCards />,
    action: { kind: 'practice' },
  },
  {
    title: 'Bet, or get out',
    body: 'Fold, check, call or raise (F / C / R). Pot-limit: you can never raise more than the pot. The blinds force a little action every hand.',
    icon: Coins,
    action: { kind: 'practice' },
  },
  {
    title: 'Watch the board',
    body: 'Three shared cards on the flop, one on the turn, one on the river, with a betting round after each.',
    icon: Hand,
    art: <BoardRow />,
    action: { kind: 'practice' },
  },
  {
    title: 'Cast a power',
    body: `Units ★, Items ⚙ and Events ϟ bend what players see and receive. A cast costs ${tierCost(1)}–${tierCost(5)} chip units into the pot, and everyone sees the card. Casting is a bluff too.`,
    icon: Zap,
    art: <TierMarks />,
    action: { kind: 'practice' },
  },
  {
    title: 'Read the table',
    body: "Each hand plays a Location rule (with the next two forecast). Every seat's nerve is public: at 0 it tilts and its Leader locks.",
    icon: Gauge,
    art: (
      <div className="flex items-center gap-2" aria-hidden>
        <span className="fs-xs font-black">NERVE</span>
        <ProgressBar value={NERVE.start} max={NERVE.max} className="flex-1" />
        <span className="fs-xs font-black">
          {NERVE.start}/{NERVE.max}
        </span>
      </div>
    ),
    action: { kind: 'practice' },
  },
  {
    title: 'Outlast the table',
    body: `Win chips at showdown or by making everyone fold. The last seat with chips wins; at the time cap, stacks are ranked. Rewards pay by place (Standard: ${placementReward(1, 6, 'standard').credits} credits for 1st of 6).`,
    icon: Flag,
    action: { kind: 'practice' },
  },
];

const BEYOND: { title: string; body: string; icon: LucideIcon; screen: MetaScreen }[] = [
  {
    title: 'Open packs',
    body: 'Spend credits or vouchers in the Store. Every pack shows its exact odds first.',
    icon: Package,
    screen: 'store',
  },
  {
    title: 'Build your collection',
    body: 'Browse, inspect and quicksell spare cards.',
    icon: Library,
    screen: 'collection',
  },
  {
    title: 'Earn rewards',
    body: 'Missions and achievements pay credits, vouchers and packs.',
    icon: Trophy,
    screen: 'achievements',
  },
  {
    title: 'Trade with players',
    body: 'List cards on the Marketplace or run an auction.',
    icon: Gavel,
    screen: 'market',
  },
];

/** Always-open list of the nine hands, best first. */
function HandRanks() {
  return (
    <section aria-label="Hand ranks" className="mb-4">
      <h2 className="heading-font text-lg mb-1">HAND RANKS, BEST TO WORST</h2>
      <p className="text-sm font-bold text-[var(--c-steel)] mb-2">
        Suits are never ranked. A higher hand always beats a lower one; inside the same rank, the
        higher cards win.
      </p>
      <ol className="grid gap-1.5">
        {HAND_RANKS.map((h, i) => (
          <li
            key={h.name}
            className="ink-border-sm bg-[var(--c-paper)] px-3 py-2 grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 items-baseline"
          >
            <span className="heading-font text-sm text-[var(--c-steel)]">{i + 1}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="heading-font text-sm">{h.name}</h3>
                <span className="flex gap-0.5" aria-label={h.example}>
                  {h.example.split(' ').map((c, k) => (
                    <PlayingCard key={k} label={c} size="xs" />
                  ))}
                </span>
              </div>
              <p className="text-[12px] font-medium leading-snug mt-0.5">{h.note}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function HowToPlayScreen({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  /** Lets a "Try it" button deep-link into another screen. Without it the
   * buttons are inert (the dev preview harness mounts this standalone). */
  onNavigate?: (screen: MetaScreen, sub?: string[]) => void;
}) {
  const { guest, profile } = useMeta();
  const [open, setOpen] = usePersistedState<number>('howtoplay:open', 0);
  const cpuLocked = isCpuLocked(profile, guest);
  const access = { guest, cpuLocked };

  const run = (action: Action) => {
    if (action.kind === 'practice') {
      // The coach shows once ever; clearing its flag makes the next match
      // open with the walkthrough, on the quick-match screen.
      restartCoach();
      onNavigate?.('play', ['practice']);
    } else {
      onNavigate?.(action.screen);
    }
  };

  /** The button (or the reason there isn't one) for a step's action. */
  const renderAction = (action: Action) => {
    if (action.kind === 'practice') {
      // Locked accounts get one explanation under the intro instead of the
      // same "coming soon" line on every card.
      return cpuLocked ? null : (
        <PopButton color="yellow" onClick={() => run(action)}>
          TRY IT: PRACTICE MATCH ▸
        </PopButton>
      );
    }
    return canEnterScreen(action.screen, access) ? (
      <PopButton color="yellow" onClick={() => run(action)}>
        TRY IT: {action.label} ▸
      </PopButton>
    ) : (
      <span className="fs-xs font-bold text-[var(--c-steel)]">Create an account to unlock.</span>
    );
  };

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="HOW TO PLAY" onBack={onBack} />
      <div className="p-4 sm:p-6 max-w-3xl mx-auto flex flex-col gap-2">
        <section aria-label="Your first hand" className="mb-3">
          <h2 className="heading-font text-lg mb-1">FRYCARDS POKER IN 7 STEPS</h2>
          <p className="text-sm font-bold text-[var(--c-steel)] mb-3">
            Texas Hold&apos;em for up to six seats, with a deck of power cards that bend what
            players see and receive. Never played poker? The practice match opens with a coach that
            explains one idea at a time as it happens.
          </p>
          {cpuLocked && (
            <p className="ink-border-sm bg-[var(--c-paper)] fs-sm font-bold px-3 py-2 mb-3">
              Practice matches are coming soon. Until then, read the steps and explore the screens
              below.
            </p>
          )}
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.title}
                  className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="heading-font text-sm w-7 h-7 shrink-0 flex items-center justify-center bg-[var(--c-ink)] text-[var(--c-yellow)]">
                      {i + 1}
                    </span>
                    <Icon className="w-5 h-5 shrink-0 text-[var(--c-steel)]" aria-hidden />
                    <h3 className="heading-font text-base leading-tight min-w-0">{step.title}</h3>
                  </div>
                  <p className="text-sm font-medium leading-snug">{step.body}</p>
                  {step.art}
                  <div className="mt-auto pt-1">{renderAction(step.action)}</div>
                </li>
              );
            })}
          </ol>
        </section>

        <HandRanks />

        <section aria-label="Beyond the match" className="mb-4">
          <h2 className="heading-font text-lg mb-2">BEYOND THE MATCH</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BEYOND.map((b) => {
              const Icon = b.icon;
              const allowed = canEnterScreen(b.screen, access);
              return (
                <li
                  key={b.title}
                  className="ink-border-sm bg-[var(--c-paper)] p-3 flex items-start gap-3"
                >
                  <Icon className="w-5 h-5 mt-0.5 shrink-0 text-[var(--c-steel)]" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <h3 className="heading-font text-sm">{b.title}</h3>
                    <p className="text-sm font-medium leading-snug mb-2">{b.body}</p>
                    {allowed ? (
                      <PopButton color="steel" onClick={() => onNavigate?.(b.screen)}>
                        TRY IT ▸
                      </PopButton>
                    ) : (
                      <span className="fs-xs font-bold text-[var(--c-steel)]">
                        Create an account to unlock.
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <h2 className="heading-font text-lg mb-1">FULL RULES</h2>
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
                      className="fs-xs font-mono font-black tracking-widest text-[var(--c-steel)] uppercase pt-2 first:pt-0"
                    >
                      {term}
                    </div>
                  ) : (
                    // minmax(0, …) on BOTH tracks: a bare `1fr` track is
                    // `minmax(auto, 1fr)`, so the definition column refuses to
                    // shrink below its own min-content and the row pushes the
                    // page sideways the moment the 8.5rem term column grows —
                    // which it does, in rem, the instant a player raises their
                    // browser's font size (v29's text-resize sweep read 432px
                    // against a 375px viewport here).
                    <div
                      key={term}
                      className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-2 items-baseline"
                    >
                      <dt className="font-black text-[11px] bg-[var(--c-steel)] text-[var(--c-paper)] px-1.5 py-0.5 justify-self-start flex items-center gap-1">
                        {sec.colourPips && (
                          <span
                            className="inline-flex items-center justify-center rounded-full font-mono font-black shrink-0"
                            style={{
                              width: 14,
                              height: 14,
                              fontSize: 8,
                              backgroundColor: COLOR_PIP[term as Color]?.bg,
                              color: COLOR_PIP[term as Color]?.fg,
                            }}
                          >
                            <EssenceIcon
                              type={term as Color}
                              color={COLOR_PIP[term as Color]?.fg}
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
                {sec.footer}
              </dl>
            )}
          </div>
        ))}
        <div className="text-center fs-xs font-mono font-bold text-[var(--c-steel)] mt-2 mb-6">
          {/* Kept equal to the version `docs/RULEBOOK.md` actually prints. */}
          FRYCARDS POKER RULEBOOK V1.0
        </div>
      </div>
    </div>
  );
}
