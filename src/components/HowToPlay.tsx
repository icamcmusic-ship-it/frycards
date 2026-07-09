import React, { useState } from 'react';

interface HowToPlayProps {
  onClose: () => void;
}

// Condensed view of docs/RULEBOOK.md (Definitive Rulebook v4.2).
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
        '30 cards (Units, Locations, Charms, Events) plus one Leader kept separate. Max 3 copies of any card.',
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
        'Reroll any subset of your dice exactly once. Charms with Snap may be cast during this window, before you lock your reroll.',
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
        'Every non-Location card prints a threshold 1–6. Place a die of that value OR HIGHER to cast it.',
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
        'ALL damage to your Leader — attacks, Sap, Pierce, anything — is reduced by X while this Unit lives.',
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
];

export function HowToPlay({ onClose }: HowToPlayProps) {
  const [open, setOpen] = useState(0);
  return (
    <div className="absolute inset-0 bg-[#1A1A1A]/95 flex items-center justify-center z-50 p-4">
      <div className="bg-[#F7F7F7] text-[#1A1A1A] ink-border-md shadow-hard-yellow max-w-3xl w-full flex flex-col max-h-[92vh]">
        <div className="flex justify-between items-center px-6 py-3 border-b-4 border-[#1A1A1A] bg-[#FFD54F]">
          <h2 className="text-2xl heading-font">How to Play</h2>
          <button
            onClick={onClose}
            className="btn-pop bg-[#E53935] text-[#F7F7F7] px-4 py-1.5 font-black ink-border-sm shadow-hard-black-xs heading-font text-sm"
          >
            Close [X]
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {SECTIONS.map((sec, i) => (
            <div key={sec.title} className="ink-border-sm shadow-hard-black-xs bg-[#F7F7F7]">
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                className="w-full text-left px-4 py-2 heading-font text-sm flex justify-between items-center bg-[#2C3E50] text-[#F7F7F7] hover:bg-[#1A1A1A]"
              >
                <span>{sec.title}</span>
                <span className="text-[#FFD54F]">{open === i ? '▾' : '▸'}</span>
              </button>
              {open === i && (
                <dl className="px-4 py-3 grid gap-2 text-sm">
                  {sec.body.map(([term, desc]) => (
                    <div key={term} className="grid grid-cols-[8.5rem_1fr] gap-2 items-baseline">
                      <dt className="font-black text-[11px] bg-[#FFD54F] px-1.5 py-0.5 justify-self-start">
                        {term}
                      </dt>
                      <dd className="text-[12px] font-medium text-[#1A1A1A]/90 leading-snug">
                        {desc}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
          <div className="text-center text-[10px] font-mono font-bold text-[#2C3E50]/70 mt-2">
            DEFINITIVE RULEBOOK V4.2 · docs/RULEBOOK.md
          </div>
        </div>
      </div>
    </div>
  );
}
