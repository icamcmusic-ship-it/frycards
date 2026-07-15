import React, { useState } from 'react';
import { MetaHeader } from '../meta/ui';
import { RARITY_CHIP, RARITY_ORDER } from '../meta/rarity';

// Condensed view of docs/RULEBOOK.md (Definitive Rulebook v4.2), plus a
// standalone rarity-system explainer and an app feature guide — this used to
// be a popup shown only on first launch; it's now its own page reachable
// any time from the Main Menu's HOW TO PLAY button.
const SECTIONS = [
  {
    title: '1 · Objective & Setup',
    body: [
      [
        'Win Condition',
        'Reduce the enemy Leader from 64 HP to 0. You also lose if you must draw during your Draw Phase with an empty deck. Simultaneous KOs are a draw.',
      ],
      [
        'Deck',
        '30 cards (Units, Locations, Charms, Events) plus one Leader kept separate. Max 3 copies of any card (Full-Art, Ultra-Rare and Mythic cards are capped lower — see the Rarity System section).',
      ],
      [
        'Setup',
        'Both players draw 5. One mulligan each (shuffle back, redraw 5). The first player skips their first Draw Phase, and nobody may attack on their own first turn.',
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
        'Your five final die values are checked against Combo patterns on cards you control (pairs, straights, full houses…). Each qualifying card triggers once.',
      ],
      [
        'Combat',
        'Attacks are declared and resolved one at a time. Guard Units must be attacked first. Leaders never retaliate.',
      ],
      [
        'End',
        'Discard down to 6. Unplaced dice are Pitched: each heals your Leader 1 (no effect at full HP). Ward refreshes for both players.',
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
        'Some Events cost a pattern instead of a number (e.g. "Combo: Full House") — any die casts them the moment your roll contains the pattern. Max ONE Combo-gated card per turn.',
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
        'If a Pierce attacker destroys its target, the leftover damage carries through to the enemy Leader — even through Guard.',
      ],
      [
        'Ward',
        'Prevents the first instance of damage or removal against this Unit each turn (not retaliation on its own attack). Refreshes every End Phase, both players.',
      ],
      [
        'Damage order',
        'Ward (full prevention) → Bulwark (flat reduction) → Frenzy (multiplier). Damage is persistent; a Unit at 0 HP dies immediately.',
      ],
      [
        'Frenzy',
        'May attack twice if it survives its first attack; only the SECOND swing takes doubled retaliation.',
      ],
      ['Bind', 'A Bound Unit cannot attack, use abilities, or deal retaliation next turn.'],
    ],
  },
  {
    title: '5 · Keywords — Units',
    body: [
      ['Guard', 'Enemies must attack your Guard Units first.'],
      ['Swift', 'May attack or use an ability the turn it is played.'],
      ['Pierce', 'Excess damage from killing a Unit hits the enemy Leader.'],
      ['Ward', 'Blocks the first hit or hostile effect each turn.'],
      ['Frenzy', 'Second attack if it survives; doubled retaliation on that second swing only.'],
      ['Bulwark X', 'Takes X less damage from every attack (after Ward, before Frenzy).'],
      [
        'Toll X',
        'ALL damage to your Leader — attacks, Sap, Pierce, anything — is reduced by X while this Unit lives (total reduction from every Toll source caps at 3).',
      ],
      ['Avenge', 'Permanently gains +1/+1 whenever another friendly Unit dies. Fully automatic.'],
      [
        'Twin',
        'Two Cast Slots needing the SAME face value, placed on different turns; it waits in your Staging Zone in between (and may grant a small passive while parked). Completing it triggers a printed bonus.',
      ],
      ['Anchor', 'Threshold −1 per other Anchor card you have in play (max −2, min 1).'],
      [
        'Echo',
        'After it hits your Discard: recast it with a die + discarding one card. Once per copy — the next discard banishes it.',
      ],
      [
        'Rally',
        "Once per turn across your whole board, activate a Rally card's ability for free using a die already resting on another used Ability Slot.",
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
    title: '8 · Rarity System',
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
        "A visually distinct print tier with its own animated frame — not stronger than other cards at the same power level, just a rarer, flashier version. Priced and capped between Super-Rare and Ultra-Rare in every system (quicksell, shard crafting, pack odds).",
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
        'A Super-Rare (or better) is guaranteed at least once every 10 packs — tracked per-account and shown as a progress readout in the Store.',
      ],
    ],
  },
  {
    title: '9 · Using FryCards — Every Feature',
    body: [
      [
        'Collection',
        'Browse every card you own, filter by rarity/type/set, inspect full card art, and quicksell spares for credits or craft/disenchant with shards.',
      ],
      [
        'Deck Builder',
        'Assemble a legal 30-card deck plus Leader from your Collection. QUICKBUILD auto-fills a legal deck; the stats panel shows your cast-slot curve, card types and keywords. The same physical copy can never be locked into two decks at once.',
      ],
      [
        'Store',
        'Buy booster packs and cosmetics with credits or vouchers, claim your free Daily Pack every 20 hours, and check VIEW DROP ODDS on any pack before buying.',
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
        "One place for the newest changelog headline, dev blog posts, and a live feed of every Serialized card pulled server-wide.",
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
                {sec.title === '8 · Rarity System' && (
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
          DEFINITIVE RULEBOOK V4.2 · docs/RULEBOOK.md
        </div>
      </div>
    </div>
  );
}
