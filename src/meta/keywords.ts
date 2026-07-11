/**
 * Player-facing keyword glossary — one canonical explainer per keyword,
 * shown in the click-to-explain popup on every card face and mirrored from
 * the HowToPlay rulebook. Keep entries short: one or two sentences.
 */
export const KEYWORD_GLOSSARY: Record<string, string> = {
  Guard: 'Enemies must attack your Guard Units before anything else.',
  Swift: 'May attack or use an ability the turn it is played.',
  Pierce:
    'If this destroys the Unit it attacks, the leftover damage carries through to the enemy Leader — even through Guard.',
  Ward: 'Blocks the first hit or hostile effect against this Unit each turn. Refreshes every End Phase.',
  Frenzy:
    'May attack twice if it survives its first attack; only the second swing takes doubled retaliation.',
  Anchor: 'Threshold −1 per other Anchor card you have in play (max −2, min 1).',
  Echo: 'After it hits your Discard: recast it with a die plus discarding one card. Once per copy — the next discard banishes it.',
  Scrap: 'When this dies, its printed bonus effect triggers.',
  Rally:
    "Once per turn, activate a Rally card's ability for free using a die already resting on another used Ability Slot.",
  Twin: 'Two Cast Slots needing the same face value, placed on different turns; it waits in your Staging Zone in between. Completing it triggers a printed bonus.',
  Bulwark: 'Takes X less damage from every attack (after Ward, before Frenzy).',
  Toll: 'ALL damage to your Leader — attacks, Sap, Pierce, anything — is reduced by X while this Unit lives.',
  Avenge: 'Permanently gains +1/+1 whenever another friendly Unit dies.',
  Resolve:
    "While your Leader is at or below half HP, its ability threshold drops by X — the comeback engine.",
  Ultimate:
    'A second, once-per-game Leader ability that unlocks on your Nth turn. Big, late, inevitable.',
  Crescendo:
    'The effect grows by X for every die of value 6 you placed this turn. Hot rolls pay off; cold rolls still cast it.',
  Aftershock:
    'After resolving, a delayed half-strength repeat fires at the start of your next turn.',
  Snap: 'Castable during your Reroll Phase, before you lock the reroll.',
  Overflow: 'Bonus if the die placed beats the threshold by X or more.',
  Tribute: 'Bonus at your End Phase if you Pitched 2 or more dice this turn.',
  Excavate: 'Its ability threshold drops by X every turn it stays in play.',
  Contested: 'Its passive is doubled while your opponent has no Location.',
  Surge: 'Draw a card.',
  Mend: 'Heal X (never past max HP).',
  Sap: 'Deal X direct damage.',
  Bind: 'A Bound Unit cannot attack, use abilities, or deal retaliation next turn.',
};

/** Look up a keyword's explainer, tolerating "Bulwark 2"-style suffixes. */
export function keywordExplainer(kw: string): string | null {
  if (KEYWORD_GLOSSARY[kw]) return KEYWORD_GLOSSARY[kw];
  const base = kw.replace(/\s+\d+$/, '');
  return KEYWORD_GLOSSARY[base] || null;
}
