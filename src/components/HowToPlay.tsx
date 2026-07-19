import React, { useState } from 'react';
import { MetaHeader } from '../meta/ui';
import { RARITY_CHIP, RARITY_ORDER } from '../meta/rarity';

// Condensed view of docs/RULEBOOK.md (Definitive Rulebook v4.6), plus a
// standalone rarity-system explainer and an app feature guide — this used to
// be a popup shown only on first launch; it's now its own page reachable
// any time from the Main Menu's HOW TO PLAY button.
const SECTIONS = [
  {
    title: '1 · Objective & Setup',
    body: [
      [
        'Win Condition',
        'Reduce the enemy Leader from 64 HP to 0. Drawing with an empty deck no longer loses the game outright — instead your Leader takes escalating Fatigue damage (1, then 2, then 3...) each Draw Phase you cannot draw. Simultaneous KOs are a draw.',
      ],
      [
        'Deck',
        '30 cards (Units, Locations, Charms, Events) plus one Leader kept separate. Max 3 copies of any card (Full-Art, Ultra-Rare and Mythic cards are capped lower — see the Rarity System section).',
      ],
      [
        'Setup',
        'Both players draw 7. One mulligan each (shuffle back, redraw 7). The first player skips their first Draw Phase, and nobody may attack on their own first turn.',
      ],
      [
        'Dice',
        'Every turn you roll five six-sided dice and spend them one at a time — one die per action. Dice are the entire economy: there are no resources or mana.',
      ],
    ],
  },
  {
    title: '2 · Turn Structure',
    body: [
      ['Draw', 'Draw 1 card (any pending Aftershock effects resolve just before this).'],
      ['Roll', 'Roll your five dice.'],
      [
        'Reroll',
        'Reroll any subset of your dice, up to two times. Charms with Snap may be cast during this window, before you lock your reroll.',
      ],
      [
        'Placement',
        'Place dice one at a time onto: a Cast Slot in hand, an Ability Slot in play, the second slot of a staged Twin card, or an Echo card in your Discard. You may also cast ONE Location per turn completely free — no die.',
      ],
      [
        'Combo Check',
        'Your final die values — all five, placed or not — are checked against Combo patterns on cards you control (pairs, straights, full houses…). Each qualifying card triggers once.',
      ],
      [
        'Combat',
        'Attacks are declared and resolved one at a time. Guard Units must be attacked first. Leaders never retaliate.',
      ],
      [
        'End',
        'Discard down to 8. Unplaced dice are Pitched: each heals your Leader 1 (no effect at full HP). Ward refreshes for both players.',
      ],
    ],
  },
  {
    title: '3 · Casting & Dice',
    body: [
      [
        'Cast Slot',
        'Every non-Location card prints a threshold 1–6. Most want a die of that value OR HIGHER, but some instead want EXACTLY that value, or the SUM of several dice.',
      ],
      [
        'Combo-gated',
        'Any card type can cost a pattern instead of a number (e.g. "Combo: Full House") — any die casts it the moment your roll contains the pattern. Max ONE Combo-gated card per turn.',
      ],
      [
        'Ability Slot',
        'Cards in play may have a repeatable ability with its own threshold, once per turn. A Unit that uses an ability cannot also attack that turn (and vice versa).',
      ],
      [
        'Locations',
        'Cast FREE once per turn as a bonus action — the only card type that never uses a die. Max one in play; a new one replaces the old.',
      ],
      [
        'Pitch',
        "Any die you don't use may be Pitched at end of turn for Mend 1 to your Leader — no effect if your Leader is already at full HP.",
      ],
      [
        'Scrap',
        'Discard a Scrap card from hand to reroll one unplaced die, any time during Placement.',
      ],
    ],
  },
  {
    title: '4 · Combat',
    body: [
      [
        'Attacking',
        'Pick a ready Unit, pick a target (enemy Unit or Leader). Both deal their ATK simultaneously — except Leaders, who never deal retaliation.',
      ],
      ['Guard', 'While the defender controls any Guard Unit, attacks must target a Guard Unit.'],
      [
        'Pierce',
        "If a Pierce attacker destroys its target, the leftover damage carries through to the enemy Leader — even through Guard — capped at half the attacker's ATK (rounded down, min 1).",
      ],
      [
        'Ward',
        'Prevents the first instance of damage or removal against this Unit each turn (not retaliation on its own attack); a prevented ATTACK also spikes 1 damage back at the attacker. Refreshes every End Phase, both players.',
      ],
      [
        'Damage order',
        'Ward (full prevention) → Steel (per-turn pool) → Bulwark (flat reduction) → Frenzy (multiplier). A Unit’s combined Steel + Bulwark prevention is capped at 4 per hit. Damage is persistent; a Unit at 0 HP dies immediately.',
      ],
      [
        'Overrun',
        "If a hit is fully prevented (Ward/Steel/Bulwark zero it) and the attacker has ATK above 0, an Overrun attacker still punches through half its ATK (rounded down, min 1).",
      ],
      [
        'Frenzy',
        'May attack twice if it survives its first attack; only the SECOND swing takes doubled retaliation. Unless you have fewer Units than the defender, that second swing cannot target the enemy Leader directly (except when nothing else is left to hit).',
      ],
      ['Bind', 'A Bound Unit cannot attack, use abilities, or deal retaliation next turn.'],
    ],
  },
  {
    title: '5 · Keywords — Units',
    body: [
      ['Guard', 'Enemies must attack your Guard Units first.'],
      ['Swift', 'May attack or use an ability the turn it is played.'],
      ['Pierce', 'Excess damage from killing a Unit hits the enemy Leader (capped at half ATK, min 1).'],
      ['Ward', 'Blocks the first hit or hostile effect each turn; a blocked attack spikes 1 damage back at the attacker.'],
      ['Frenzy', 'Second attack if it survives; doubled retaliation on that second swing only.'],
      ['Bulwark X', 'Takes X less damage from every attack (after Ward and Steel, before Frenzy).'],
      [
        'Steel X',
        'A per-turn pool absorbing up to X damage from ANY source — combat, retaliation, Sap, Removal. Refreshes every turn, both players.',
      ],
      [
        'Toll X',
        'ALL damage to your Leader — attacks, Sap, Pierce, anything — is reduced by X while this Unit lives (total reduction from every Toll source caps at 3).',
      ],
      [
        'Avenge',
        'Permanently gains +1/+1 whenever another friendly Unit dies. Fully automatic; caps at +2/+2 total per card.',
      ],
      [
        'Twin',
        'Two Cast Slots needing the SAME face value, placed on different turns; it waits in your Staging Zone in between (and may grant a small passive while parked). Completing it triggers a printed bonus.',
      ],
      [
        'Anchor',
        "Threshold −1 per other Anchor card you have in play (max −3, min 1). The first time a card's own discount hits that cap, it permanently gains +2/+2.",
      ],
      [
        'Echo',
        'After it hits your Discard: recast it with a die + discarding one card (Rare and higher rarities skip the extra discard — only Commons/Uncommons still pay it). Once per copy — the next discard banishes it.',
      ],
      [
        'Rally',
        "Once per Rally card each turn (its own Ability exhaustion), activate its ability for free using a die already resting on another used Ability Slot — that resting die must still meet this ability's threshold.",
      ],
    ],
  },
  {
    title: '6 · Keywords — Leaders, Events, Charms, Locations',
    body: [
      [
        'Resolve X (Leader)',
        "While at or below half HP, your Leader's ability threshold drops by X — the comeback engine.",
      ],
      [
        'Ultimate(N) (Leader)',
        'A second, once-per-game ability slot that unlocks on your Nth turn. Big, late, inevitable.',
      ],
      [
        'Crescendo X (Event)',
        "The Event's effect grows by X for every die of value 6 you placed this turn. Hot rolls pay off; cold rolls still cast it.",
      ],
      [
        'Aftershock (Event)',
        'After resolving, a delayed half-strength repeat fires at the very start of your next turn.',
      ],
      ['Snap (Charm)', 'Castable during your Reroll Phase, before you lock the reroll.'],
      ['Overflow X', 'Bonus if the die placed beats the threshold by X or more.'],
      ['Combo: [Pattern]', 'Passive bonus at Combo Check when your roll contains the pattern.'],
      ['Foothold (Location)', 'Your first Unit cast each turn costs 1 less (stacks with Anchor).'],
      ['Tribute (Location)', 'Bonus at your End Phase if you Pitched 2+ dice this turn.'],
      ['Excavate X (Location)', 'Its ability threshold drops by X every turn it stays in play.'],
      ['Contested (Location)', 'Its passive is doubled while your opponent has no Location.'],
      ['Surge / Mend / Sap', 'Draw a card / heal X (never past max) / deal X direct damage.'],
    ],
  },
  {
    title: '7 · Combo Patterns',
    body: [
      ['Any Pair', 'Two dice with the same value. Hits ~99% of turns if you chase it.'],
      [
        'Three Odds / Three Evens',
        'Three or more dice that are all odd (or all even). About as easy to hit as Any Pair.',
      ],
      ['Two Pair / Three Kind', 'Reliable mid-tier payoffs (~54–56% when chased).'],
      ['Small Straight', 'Four sequential values (~33% chased).'],
      ['Full House', 'Three of one value + two of another (~18% chased).'],
      ['4-Kind / Lg Straight', 'Bombs (~10–13% chased).'],
      ['Yahtzee', 'All five dice equal (~1%) — trophy territory.'],
      [
        'Subset rule',
        'Your dice satisfy every pattern they genuinely contain — a Yahtzee also counts as a Pair, Three and Four of a Kind, all at once.',
      ],
      [
        'Rate limit',
        'No matter how many Combo-gated cards qualify, you may cast only one per turn.',
      ],
    ],
  },
  {
    title: '8 · A Worked Turn',
    body: [
      [
        'The roll',
        'Say you roll 2, 3, 3, 5, 6. Your hand holds a Unit costing "one die 4+", a Charm costing "dice totalling 7+", and an Event gated on Any Pair.',
      ],
      [
        'Reading it',
        "The pair of 3s satisfies Any Pair — the Event can be cast with ANY one die (the 2 is perfect, it pays nothing else). The 5 or 6 pays the Unit. The remaining 6+3 (or 5+3) covers the Charm's Σ7 sum cost.",
      ],
      [
        "Order doesn't",
        'Patterns read die VALUES, placed or not — a spent 3 still counts toward the pair all turn, so casting order never breaks a Combo. Cast the Event with the 2, the Unit with the 5, the Charm with 6+3, in any order. One die (a 3) is left.',
      ],
      [
        'The leftover',
        'Place the spare 3 on an Ability Slot if any card in play wants 3 or less — otherwise it Pitches at End Phase for Mend 1. A die is never wasted unless your Leader is already at full HP.',
      ],
      [
        'Combo Check',
        'Before Combat, your five FINAL die values are checked against Combo patterns printed on cards you control in play — dice you placed still count; this is about values, not who spent what.',
      ],
    ],
  },
  {
    title: '9 · Dice Math Cheat Sheet',
    body: [
      [
        'One die 4+',
        'A single fresh die shows 4+ half the time. Across five dice you almost always have one — the cost is really about WHICH die you can spare.',
      ],
      [
        'Exact costs',
        'Needing exactly one value (=3) hits ~67% across five fresh dice — but rerolls chase it hard: keep everything else, spin the rest.',
      ],
      [
        'Sum costs',
        'Five dice average ~17.5 total. A Σ13+ cost usually eats three dice — check what the rest of your hand needs BEFORE paying a big sum.',
      ],
      [
        'Pairs & straights',
        'Any Pair appears in ~99% of turns if chased with rerolls. Three of a Kind ~56%, Small Straight ~33%, Full House ~18%, Large Straight ~13%, Yahtzee ~1%.',
      ],
      [
        'Reroll strategy',
        'You get up to TWO rerolls of any subset. Decide your plan first (straight vs matching), keep dice that serve it, spin the rest — never reroll dice that already pay a cost you intend to use.',
      ],
    ],
  },
  {
    title: '10 · Strategy Primer',
    body: [
      [
        'Tempo',
        'Every die is one action. A turn that places all five dice nearly always beats a turn that pitches two. Cheap cards exist to convert bad dice into board.',
      ],
      [
        'Guard walls',
        'Aggro loses to a well-timed Guard Unit — enemies MUST attack it first. Guards with high HP buy your bombs time to come online.',
      ],
      [
        'When to Pitch',
        'Pitching at full HP heals nothing — that die is wasted. If your Leader is damaged, pitching two dice also arms any Tribute Location you control.',
      ],
      [
        'Fighting from behind',
        "Behind on board? Look for board wipes and mass Sap on high-rarity Events, your Leader's Ultimate (unlocks on a fixed turn — plan around it), and Resolve Leaders whose abilities get CHEAPER below half HP. The comeback tools are real — losing the early board is not losing the game.",
      ],
      [
        'Ability vs attack',
        'A Unit cannot attack AND use its Ability Slot in the same turn. Utility Units (Mend/Surge/Bind abilities) are usually worth more exhausted on their slot than swinging for 2.',
      ],
      [
        'Echo value',
        'Echo cards are two cards in one — but the recast costs a die AND a discard. Never Echo when your hand is already thin; Echo when a dead card in hand can be the fodder.',
      ],
      [
        'Hand discipline',
        "The End Phase cap is 8 — banking cards is fine, flooding is not. If you're at 9+ going into End Phase, cast something cheap rather than discarding it for free.",
      ],
    ],
  },
  {
    title: '11 · Rarity System',
    body: [
      [
        'The ladder',
        'Common < Uncommon < Rare < Super-Rare < Full-Art < Ultra-Rare < Mythic, low to high. Full-Art sits just below Ultra-Rare — a step up from Super-Rare, not quite as scarce as Ultra-Rare or Mythic.',
      ],
      [
        'Copy caps',
        'Common/Uncommon/Rare: up to 3 copies in a deck. Super-Rare/Full-Art/Ultra-Rare: up to 2. Mythic: exactly 1.',
      ],
      [
        'Full-Art',
        'A visually distinct print tier whose art fills the entire card edge-to-edge (some Full-Art cards are short looping video clips instead of a still image) — not stronger than other cards at the same power level, just a rarer, flashier version. Priced and capped between Super-Rare and Ultra-Rare in every system (quicksell, pack odds).',
      ],
      [
        'Foil',
        'A separate, independent shine some pulls get regardless of rarity (per-pack foil chance). Foil sells for 2.5x the normal quicksell price.',
      ],
      [
        'Serialized',
        "The rarest possible pull: a numbered 1-of-however-many-are-left print with its own rotating prismatic frame. Only Full-Art, Ultra-Rare and Mythic cards can come out Serialized, from a fixed, server-wide supply — 150 Full-Art, 100 Ultra-Rare and 50 Mythic total, ever. Numbering starts at #1 for each tier and counts up until that tier's supply runs out for good. About a 1-in-100 chance on every pack you open. Serialized copies can never be foil and can never be quick sold — they're yours to keep or show off. Every Serialized pull posts to the News Center (with an opt-out for your username in Settings).",
      ],
      [
        'Pity',
        'There is exactly ONE pity rule in the game: a Super-Rare (or better) is guaranteed at least once every 10 packs — tracked per-account across all pack types and shown as a progress readout in the Store. Nothing else is ever guaranteed.',
      ],
      [
        'No guaranteed top end',
        'No product guarantees a Full-Art, Ultra-Rare or Mythic. Chase slots always pay at least a Rare — everything above that is genuine luck. Every pack shows its exact server-side odds under VIEW DROP ODDS before you spend anything.',
      ],
    ],
  },
  {
    title: '12 · Packs, Boxes & Opening',
    body: [
      [
        'Pack anatomy',
        'Every pack rolls slot by slot: foundation slots (Commons/Uncommons in bulk), synergy slots (Uncommon-to-Super-Rare), and chase slots (Rare floor, small shot at the top end). The smallest pack is 5 cards.',
      ],
      [
        'Boxes',
        "Boxes are big multi-booster rips at a bulk discount — the Standard Box is six boosters' worth (36 cards) in one opening, ending in a guaranteed-foil box topper (Rare floor).",
      ],
      [
        'Leader Pack',
        'The one single-card product: it always pulls a Leader (mostly Rare Leaders, a small chance of a Mythic one). Never foil.',
      ],
      [
        'Mass opening',
        'Buy-and-open 5 or 10 copies of any pack in one click, or OPEN ALL from MY PACKS. Big hauls show a grouped summary — duplicates stack with a ×N badge, best pull spotlighted on top.',
      ],
      [
        'Dupe protection',
        'Marked slots avoid cards you already own at cap. Any pull past your per-rarity copy cap auto-converts to credits instead of a dead duplicate.',
      ],
      [
        'Pack XP',
        'Every pack you open grants 20 account XP — leveling up pays credits, and every 5th level pays vouchers.',
      ],
      [
        'Daily freebies',
        'Two separate daily faucets: the free Daily Pack in the Store (every 20 hours), and the Daily Login Reward on the main menu (once per calendar day, escalating over a 7-day streak — day 7 is the jackpot; miss a day and the streak resets).',
      ],
    ],
  },
  {
    title: '13 · Economy & Currencies',
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
        'The Marketplace (fixed listings and auctions, 5% seller fee), direct friend Trades, and level-50 Player Shops all move cards between real players — prices there are whatever the market bears.',
      ],
      [
        'XP sources',
        'Matches, opening packs (20 XP each), and missions (Battle Pass XP is tracked separately for the seasonal pass).',
      ],
    ],
  },
  {
    title: '14 · Using FryCards — Every Feature',
    body: [
      [
        'Collection',
        'Browse every card you own, filter by rarity/type/set, inspect full card art, and quicksell spares for credits.',
      ],
      [
        'Deck Builder',
        'Assemble a legal 30-card deck plus Leader from your Collection. QUICKBUILD auto-fills a legal deck; the stats panel shows your cast-slot curve, card types and keywords. The same physical copy can never be locked into two decks at once.',
      ],
      [
        'Store',
        'Buy packs and boxes with credits or vouchers, claim your free Daily Pack every 20 hours, open in bulk, and check VIEW DROP ODDS on any pack before buying.',
      ],
      [
        'Daily Login',
        'On the main menu: claim once per calendar day. Rewards escalate across a 7-day streak cycle (credits, a free pack on day 5, vouchers on day 7), plus a growing bonus for your total streak.',
      ],
      [
        'Battle Pass',
        'A free, seasonal 25-tier reward track. Earn XP from matches and missions; claim tiers as you cross their XP threshold.',
      ],
      [
        'Missions & Achievements',
        'Daily/weekly missions and permanent achievements pay out credits, vouchers and free packs for playing normally — opening packs, logging in, trading and selling all count.',
      ],
      [
        'Marketplace',
        'List spare cards for a fixed price or run a timed auction with bids and a buyout. Sellers pay a 5% fee on completed sales.',
      ],
      [
        'Player Shops',
        'Unlocks at level 50 — open your own storefront, sell individual cards, bundles or blind Mystery Packs, and build a public seller rating over time.',
      ],
      [
        'Friends & Trading',
        'Search players, send friend requests, and propose direct card-and-credits trades.',
      ],
      [
        'News Center',
        'One place for the newest changelog headline, dev blog posts, and a live feed of every Serialized card pulled server-wide.',
      ],
      [
        'Profile & Settings',
        'Track your stats, equip cosmetics, pick a color theme, and (Settings) opt out of username recognition in the Serialized feed.',
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
              className="w-full text-left px-4 py-2 heading-font text-sm flex justify-between items-center bg-[var(--c-steel)] text-[var(--c-paper)] hover:bg-[var(--c-ink)]"
            >
              <span>{sec.title}</span>
              <span className="text-[var(--c-yellow)]">{open === i ? '▾' : '▸'}</span>
            </button>
            {open === i && (
              <dl className="px-4 py-3 grid gap-2 text-sm">
                {sec.body.map(([term, desc]) => (
                  <div key={term} className="grid grid-cols-[8.5rem_1fr] gap-2 items-baseline">
                    <dt className="font-black text-[11px] bg-[var(--c-yellow)] px-1.5 py-0.5 justify-self-start">
                      {term}
                    </dt>
                    <dd className="text-[12px] font-medium text-[var(--c-ink)]/90 leading-snug">
                      {desc}
                    </dd>
                  </div>
                ))}
                {sec.title === '11 · Rarity System' && (
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
          DEFINITIVE RULEBOOK V4.6 · docs/RULEBOOK.md
        </div>
      </div>
    </div>
  );
}
