/** Shared keyword glossary — used by the in-game keyword popups and the rulebook. */
export const KEYWORD_GLOSSARY: Record<string, string> = {
  Blitz: 'May attack the turn it is deployed (no summoning sickness).',
  Armor:
    'Armor X: every incoming hit is reduced by X, but always deals at least 1 damage. Armor never breaks.',
  Pierce: "Blocked damage beyond the blocker's health hits the enemy Leader.",
  Guard: 'Enemy attacks and targeted Events must target this Unit while it is ready.',
  Ward: 'Ward X: enemies pay X extra resources to target this card.',
  Command:
    'Command X: Leader ability — pay X to instantly ready a friendly Unit for another attack (each Unit at most once per turn).',
  Lurk: 'Cannot be targeted by enemy attacks or Events until it attacks (suppressed by Guard).',
  Burden: 'Burden X: attacking with the equipped Unit costs X extra resources.',
  Symmetric:
    "Location effects apply to both players (a normal Location's passive serves only its controller).",
  Detonate: 'Detonate X: when this Charm expires it deals X damage to all enemy Units.',
  Siphon: 'Damage dealt to enemies heals your Leader for half (rounded up).',
  Feedback:
    'When targeted: 4-6 on a d6 negates the effect and refunds the caster exactly what was spent.',
  Phalanx: 'Phalanx X: +X max health for each other ready friendly card on your battlefield.',
  Overdrive: 'May attack twice per turn, taking 2 damage at Cleanup if it did.',
  Wither: "Wither X: combat damage permanently shrinks the target's stats by X.",
  Reap: 'Killing a Unit in combat heals your Leader for its printed attack.',
  Sustain: 'Sustain X: heals X damage at the very start of your turn.',
  Glitch:
    "Combat damage disables the target's keywords/abilities until its controller's next Cleanup.",
  Brittle: 'Takes double damage from all sources.',
  Pure: 'Bonus effect if your whole resource roll went to one element this turn.',
  Boost: 'Boost X: adds +X to your resource roll.',
  Fix: 'Fix [Element]: one rolled point is automatically allocated to that element.',
  Echo: 'Cast Event duplicates on a d6 roll of 5-6 (random targets).',
  Graveborn: 'This Unit may be deployed from your graveyard (open it via the GY counter).',
  Modularity: "Modularity X: raises the host Unit's Item capacity by X (default 1).",
  Decay: "Decay X: hostile Charm — after the victim's roll, all their Units take X damage.",
  Wildcast: 'Wildcast X: hits X unique random battlefield targets (Leaders included).',
  Photosynthesis: 'Charm: an even resource roll grants +1 Nature resource.',
  Overclock: 'Overclock X: gain X resources now; your next roll is reduced by X.',
  Rally: 'Rally X: Units you deploy from hand costing X or less get +1/+1 until Cleanup.',
  // Action verbs — these appear as keyword chips on Event cards.
  Freeze:
    "Target cannot attack, block or use abilities until the end of its controller's next turn.",
  Scorch:
    'Scorch X: target takes X damage at the start of each of its turns; the counter ticks down each Cleanup.',
  Obliterate: 'Destroys a Unit outright, bypassing Armor and death triggers.',
  Meltdown: "Destroys a target Item, then burns the host Unit for the Item's total cost.",
  Purge: 'Strips a target of all Items, Charms, statuses and temporary buffs.',
  Manifest: 'Creates a token Unit. Tokens vanish when they leave the battlefield.',
  Heal: 'Heal X: removes X damage from your Leader (cannot exceed printed health).',
  // Crimson Circuit (Set 2) keywords.
  Vengeance: 'Vengeance X: when this Unit blocks, it deals X extra damage to the attacking Unit.',
  Solitary: 'Solitary X: +X/+X while this is your only Unit on the battlefield.',
  Efficient: 'Efficient X: the next Unit you deploy this turn costs X fewer resources.',
  Rummage: 'Rummage X: draw X cards, then discard 1 card at random.',
  Hatchling:
    'Hatchling X: while revealed, this Location creates X 1/1 tokens for its controller at the start of the turn (Symmetric: both players hatch).',
  Confluence:
    'Confluence X: this Location grants its controller X extra Generic resources at their Resource Roll.',
  Overcharge:
    'Overcharge X: the equipped Unit gets +X/+X; pay X at your Cleanup or this Item is destroyed.',
  Surge:
    'Item: whenever the equipped Unit deals combat damage to an enemy, you gain 1 Generic resource.',
  Valor: 'Valor X: your Units get +X attack while this is active.',
  Inspire: 'Inspire X: Units you deploy get +X/+X until Cleanup while this is active.',
  Beacon: 'Beacon X: your Units have Ward X while this is active.',
  Taint:
    "Taint X: Units this card damages in combat take +X damage from all sources until their controller's Cleanup.",
  Glacier: 'Glacier X: enemy Events cost X extra resources to cast while this is active.',
  Inferno:
    "When this card deals combat damage to a Unit, that Unit's other friendly Units take 1 damage.",
  Sync: 'Sync X: whenever you deploy a Unit, gain X Generic resources while this is active.',
  Flourish: 'Flourish X: gain X Nature resources at your Resource Roll while this is active.',
  Codex: 'Codex X: your Units get +X max health while this is active.',
  Discord:
    'At the start of your turn, randomly: gain 1 Generic resource, draw 1 card, or your Leader takes 1 damage.',
  // Set 3 keywords.
  Fate: 'At the start of your turn, a top deck card costing 6 or more is automatically moved to the bottom.',
  'Freeze-Dry':
    'Freeze-Dry X: whenever this deals combat damage to a Unit, that Unit also gains X turns of Freeze.',
  Blessed:
    'Blessed X: the first X instances of damage this card would take each of your turns are prevented outright. Refills at your Ready step.',
  'Scorched-Earth':
    'Scorched-Earth X: when this resolves (or this Location is revealed), all Units in play — both players\' — take X damage.',
  Glaciate: 'Freezes every enemy Unit that does not have Guard.',
  Overload:
    'Overload X: gain X of a random one of your resources now; your next roll is reduced by X (as Overclock).',
};

/** Keywords whose casting requires extra client UI (X-cost amount picker, sacrifice target). */
export const CASTING_MECHANIC_GLOSSARY: Record<string, string> = {
  'X-Cost': 'The caster names any amount of extra resources at cast time; the effect scales with that amount.',
  Sacrifice:
    'Casting this also requires sacrificing a friendly Unit; the effect scales off that Unit\'s printed attack.',
};

/** Look up a keyword string like "Armor 2" → its glossary text. */
export function keywordDescription(kw: string): string {
  const name = kw.split(' ')[0];
  return KEYWORD_GLOSSARY[name] || 'No rules text available for this keyword.';
}
