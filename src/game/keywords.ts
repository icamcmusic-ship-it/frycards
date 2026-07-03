/** Shared keyword glossary — used by the in-game keyword popups and the rulebook. */
export const KEYWORD_GLOSSARY: Record<string, string> = {
  Blitz: 'May attack the turn it is deployed (no summoning sickness).',
  Armor: 'Armor X: ignores hits of X or less. Bigger hits break the armor and deal the rest.',
  Pierce: 'Blocked damage beyond the blocker\'s health hits the enemy Leader.',
  Guard: 'Enemy attacks and targeted Events must target this Unit while it is ready.',
  Ward: 'Ward X: enemies pay X extra resources to target this card.',
  Command: 'Command X: Leader ability — pay X to instantly ready a friendly Unit for another attack.',
  Lurk: 'Cannot be targeted by enemy attacks or Events until it attacks (suppressed by Guard).',
  Burden: 'Burden X: attacking with the equipped Unit costs X extra resources.',
  Symmetric: 'Location effects apply to both players and cannot be bypassed.',
  Detonate: 'Detonate X: when this Charm expires it deals X damage to all enemy Units.',
  Siphon: 'Damage dealt to enemies heals your Leader for half (rounded up).',
  Feedback: 'When targeted: 4-6 on a d6 negates the effect and refunds the caster.',
  Phalanx: 'Phalanx X: +X max health for each other ready friendly card on your battlefield.',
  Overdrive: 'May attack twice per turn, taking 2 damage at Cleanup if it did.',
  Wither: 'Wither X: combat damage permanently shrinks the target\'s stats by X.',
  Reap: 'Killing a Unit in combat heals your Leader for its printed attack.',
  Sustain: 'Sustain X: heals X damage at the very start of your turn.',
  Glitch: 'Combat damage disables the target\'s keywords/abilities until Cleanup.',
  Brittle: 'Takes double damage from all sources.',
  Pure: 'Bonus effect if your whole resource roll went to one element this turn.',
  Boost: 'Boost X: adds +X to your resource roll.',
  Fix: 'Fix [Element]: one rolled point is automatically allocated to that element.',
  Echo: 'Cast Event duplicates on a d6 roll of 5-6 (random targets).',
  Graveborn: 'This Unit may be deployed from your graveyard (open it via the GY counter).',
  Modularity: 'Raises the host Unit\'s Item capacity by 1.',
  Decay: 'Decay X: hostile Charm — after the victim\'s roll, all their Units take X damage.',
  Wildcast: 'Wildcast X: hits X unique random battlefield targets (Leaders included).',
  Photosynthesis: 'Charm: an even resource roll grants +1 Nature resource.',
  Overclock: 'Overclock X: gain X resources now; your next roll is reduced by X.',
};

/** Look up a keyword string like "Armor 2" → its glossary text. */
export function keywordDescription(kw: string): string {
  const name = kw.split(' ')[0];
  return KEYWORD_GLOSSARY[name] || 'No rules text available for this keyword.';
}
