import React, { useState } from 'react';

interface HowToPlayProps {
  onClose: () => void;
}

const SECTIONS = [
  {
    title: '1 · Objective & Setup',
    body: [
      ['Win Condition', 'Reduce the enemy Leader\'s health to 0. Your Leader\'s printed health is your life total. If both Leaders fall simultaneously, the active player loses.'],
      ['Deck', '30 cards led by a Leader that dictates which elements and cards your deck may contain (max 2 copies of any card).'],
      ['Setup', 'Leaders are revealed, 2 Location cards from each deck are placed face-down in the Location Zone, and each player draws 5 cards.'],
      ['London Mulligan', 'You may shuffle your hand back and redraw 5, as many times as you like. Each time you finally keep, you must bottom 1 card per mulligan taken.'],
      ['First Turn', 'A coin toss decides who goes first. The first player skips their Turn-1 draw, and nobody may attack on Turn 1.'],
    ],
  },
  {
    title: '2 · Turn Phases',
    body: [
      ['Resource Roll', 'Your leftover resources from last turn are cleared, then you roll a d6 and split the result across the elements your Leader supports. Boost adds to the roll; Fix auto-assigns 1 point to a set element.'],
      ['Draw', 'Draw 1 card. Drawing from an empty deck deals 2 damage to your Leader instead (the Deckout Law).'],
      ['Flexible Action Phase', 'In any order, repeatedly: deploy Units, set Locations face-down, attach Items, play Charms, cast Events, use Leader Command, and declare combat assaults. Attacking exhausts a Unit, but Leader Command (and Overdrive) can set up a second assault in the same turn.'],
      ['Cleanup', 'Unspent resources persist into the opponent\'s turn. Your Charms tick down 1. Discard down to 7 cards. Temporary buffs, Glitch and the active Location reset.'],
    ],
  },
  {
    title: '3 · Resources & Persistent Mana',
    body: [
      ['Allocation', 'The whole roll must be allocated immediately. Splitting is allowed only among your Leader\'s elements.'],
      ['Pure', 'Cards with Pure get a bonus if 100% of this turn\'s roll went into a single element.'],
      ['Carry-over', 'Resources you don\'t spend stay in your pool during the opponent\'s turn — they only clear at the start of your own next Resource Roll.'],
      ['Overclock', 'Grants instant extra resources now, but your next roll is penalized by the same amount.'],
    ],
  },
  {
    title: '4 · Combat',
    body: [
      ['Unified Assault', 'Declare all your attackers at once; attacking exhausts them. Units with summoning sickness (deployed this turn, unless they have Blitz) and Frozen units cannot attack.'],
      ['Blocking', 'The defender assigns ready Units as blockers. Blocking does not exhaust. Each blocker stops one attacker, but several blockers may gang up on a single attacker. Attacking Leaders can be blocked too — they take every blocker\'s full counter-damage.'],
      ['Leader Attacks', 'Your Leader may attack a Unit (full damage both ways) or the enemy Leader (you deal HALF damage rounded down, min 1 — but take FULL counter-damage). The game blocks a Leader attack that would kill your own Leader.'],
      ['Guard Interlock', 'While the defender has a ready Guard Unit, all attacks and targeted enemy Events must go at a Guard Unit. With multiple ready Guards you may split your attackers across them; an attack that doesn\'t name a specific Guard is auto-redirected to one.'],
      ['Damage', 'Damage on Units is permanent (it does not heal at end of turn). Item bonus health absorbs damage first — destroy the Item and the damage stored on it vanishes (the Stripping Rule).'],
      ['Death Sweep', 'A Unit dies the moment its remaining health reaches 0 — including when a dynamic buff (like Phalanx) shrinks because a friendly card exhausted or left the battlefield. The check runs after every action and re-sweeps until stable, so one Phalanx Unit dying can chain into shrinking and killing another in the same instant.'],
      ['Fizzled Attacks', 'An attack whose target was already destroyed earlier in the same assault wave fizzles: no damage is dealt either way, and the attacker stays exhausted.'],
    ],
  },
  {
    title: '5 · Locations, Charms & Items',
    body: [
      ['Location Shell Game', 'At the start of every turn one of the OPPONENT\'s face-down Locations is flipped at random. Its rules affect both players for the whole turn, but the active player counts as its controller. It flips back face-down at end of turn.'],
      ['Charms', 'Attach to a player and sit dormant until that player\'s next turn begins, then stay active for their 1–3 turn lifespan. Hostile (Decay) Charms attach to the opponent.'],
      ['Items', 'Attach to your Units for bonus attack, health, Armor and more. A Unit holds at most 2 Items (Modularity raises the cap). Excess Items are destroyed if capacity shrinks.'],
    ],
  },
  {
    title: '6 · Keyword Glossary — Traits',
    body: [
      ['Blitz', 'May attack the turn it is deployed.'],
      ['Armor X', 'Ignores hits of X or less. A bigger hit breaks ALL of the card\'s Armor — printed Armor and Item-granted Armor alike — and deals the rest.'],
      ['Pierce', 'Blocked damage beyond the blocker\'s health hits the enemy Leader.'],
      ['Guard', 'Enemy attacks and targeted Events must target this Unit while it is ready.'],
      ['Ward X', 'Enemies pay X extra resources to target this card.'],
      ['Command X', 'Leader ability: pay X to instantly ready a friendly Unit for another attack.'],
      ['Rally X', 'Leader trait: Units you deploy from hand costing X or less get +1/+1 until Cleanup.'],
      ['Lurk', 'Cannot be targeted by enemy attacks or Events until it attacks (suppressed by Guard).'],
      ['Burden X', 'Attacking with the equipped Unit costs X extra resources.'],
      ['Symmetric', 'Location effects apply to both players and cannot be bypassed.'],
      ['Detonate X', 'Expiring Charm deals X damage to all enemy Units.'],
      ['Siphon', 'Damage dealt heals your Leader for half (rounded up).'],
      ['Feedback', 'When targeted: 4-6 on a d6 negates the effect and refunds the caster.'],
      ['Phalanx', 'Phalanx X: +X max health for each other READY friendly card on your battlefield.'],
      ['Overdrive', 'May attack twice per turn, taking 2 damage at Cleanup if it did.'],
      ['Wither X', 'Combat damage permanently shrinks the target\'s stats by X.'],
      ['Reap', 'Killing a Unit in combat heals your Leader for its printed attack.'],
      ['Sustain X', 'Heals X damage at the very start of your turn.'],
      ['Glitch', 'Combat damage disables the target\'s keywords/abilities until its controller\'s next Cleanup.'],
      ['Brittle', 'Takes double damage from all sources.'],
      ['Pure', 'Bonus effect if your whole roll went to one element this turn.'],
      ['Boost X', 'Adds +X to your resource roll.'],
      ['Fix [Element]', 'One rolled point is automatically allocated to that element.'],
      ['Echo', 'Cast Event duplicates on a d6 roll of 5-6 (random targets).'],
      ['Graveborn', 'This Unit may be deployed from your graveyard.'],
      ['Modularity X', 'Raises the host Unit\'s Item capacity by X (default 1).'],
      ['Decay X', 'Hostile Charm: after the victim\'s roll, all their Units take X damage.'],
      ['Wildcast X', 'Hits X unique random battlefield targets (Leaders included).'],
      ['Photosynthesis', 'Charm: an even resource roll grants +1 Nature.'],
    ],
  },
  {
    title: '7 · Keyword Glossary — Action Verbs',
    body: [
      ['Freeze', 'Target cannot attack, block or use abilities until the end of its controller\'s next turn.'],
      ['Scorch X', 'Target takes X damage at the start of each of its turns; the counter ticks down by 1 each Cleanup.'],
      ['Obliterate', 'Destroys a Unit outright, bypassing Armor and death triggers.'],
      ['Meltdown', 'Destroys a target Item, then burns the host Unit for the Item\'s cost.'],
      ['Purge', 'Strips a target of all Items, Charms, statuses and temporary buffs.'],
      ['Manifest', 'Creates a token Unit. Tokens vanish when they leave the battlefield.'],
      ['Overclock X', 'Gain X resources now; your next roll is reduced by X.'],
      ['Heal X', 'Removes X damage (Leaders cannot exceed their printed health).'],
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
          <button onClick={onClose}
            className="btn-pop bg-[#E53935] text-[#F7F7F7] px-4 py-1.5 font-black ink-border-sm shadow-hard-black-xs heading-font text-sm">
            Close [X]
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {SECTIONS.map((sec, i) => (
            <div key={sec.title} className="ink-border-sm shadow-hard-black-xs bg-[#F7F7F7]">
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                className="w-full text-left px-4 py-2 heading-font text-sm flex justify-between items-center bg-[#2C3E50] text-[#F7F7F7] hover:bg-[#1A1A1A]">
                <span>{sec.title}</span>
                <span className="text-[#FFD54F]">{open === i ? '▾' : '▸'}</span>
              </button>
              {open === i && (
                <dl className="px-4 py-3 grid gap-2 text-sm">
                  {sec.body.map(([term, desc]) => (
                    <div key={term} className="grid grid-cols-[8.5rem_1fr] gap-2 items-baseline">
                      <dt className="font-black text-[11px] bg-[#FFD54F] px-1.5 py-0.5 justify-self-start">{term}</dt>
                      <dd className="text-[12px] font-medium text-[#1A1A1A]/90 leading-snug">{desc}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
          <div className="text-center text-[10px] font-mono font-bold text-[#2C3E50]/70 mt-2">
            SHIFTING MULTIVERSE TCG · COMPREHENSIVE RULEBOOK V1.3
          </div>
        </div>
      </div>
    </div>
  );
}
