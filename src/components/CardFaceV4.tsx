/**
 * Shared v4.2 card-face rendering — the ONE card template used everywhere
 * (match UI, deck builder, collection, store/pack reveals) so a card looks
 * and reads identically no matter where it's shown. Real trading-card
 * proportions: 2.5" × 3.5" (5:7).
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dices, Swords, Heart, Crown, MapPin, Wand2, Zap } from 'lucide-react';
import { CardDef, CardType, Effect } from '../game/v3/cards';
import { cn } from '../lib/utils';
import {
  rarityChip,
  rarityBorder,
  rarityGlow,
  rarityAnimated,
  isMythic,
  RARITY_HEX,
} from '../meta/rarity';
import { cardColors } from '../game/v3/colors';
import {
  cardKeywords,
  mechanicLabels,
  KEYWORD_TIERS,
  keywordTier,
  MechanicLabel,
  CardKeyword,
} from '../game/v3/keywords';
import { COLOR_PIP, colorBg, colorHexPrimary } from '../meta/colors';

export function kwList(def: CardDef): string[] {
  return def.keywords || [];
}

/**
 * v4.7 premium templates — Ultra-Rare "Gilded Reliquary" and Mythic "Molten
 * Sovereign". These styles are injected from this component (rather than
 * index.css) so the whole premium template system lives in one file with the
 * markup that uses it. Injected exactly once per document.
 *
 * Performance rules baked in:
 * - Grid-safe layers (filigree stroke-trace, crest pulse) animate only
 *   opacity/stroke-dashoffset — cheap even with dozens of cards on screen.
 * - Expensive layers (prismatic conic sheen, heat shimmer) are mounted at
 *   opacity 0 and only fade in on :hover of the card (or when a container
 *   opts in via .premium-boost, which the 3D inspector sets), so a
 *   collection grid never runs them all at once.
 * - Everything honors prefers-reduced-motion: animations stop and the
 *   hover-gated layers settle to a faint static state.
 */
const PREMIUM_STYLE_ID = 'frycards-premium-templates-v48';
const PREMIUM_CSS = `
/* ---- Ultra-Rare "Aurora Vault" (v4.8) ----
   Cool iridescence replaces v4.7's gold reliquary: a chromatic teal/violet
   lattice frame with an orbiting light-trace, plus a hover-gated aurora
   ribbon that sweeps diagonally across the face. */
@keyframes ur-trace-kf {
  to { stroke-dashoffset: -84; }
}
.ur-filigree { pointer-events: none; }
.ur-filigree .ur-trace {
  fill: none;
  stroke: #9ff2ff;
  stroke-width: 0.9;
  stroke-dasharray: 12 9;
  animation: ur-trace-kf 6s linear infinite;
  opacity: 0.95;
}
.ur-filigree .ur-trace2 {
  fill: none;
  stroke: #d6a6ff;
  stroke-width: 0.7;
  stroke-dasharray: 7 14;
  animation: ur-trace-kf 9s linear infinite reverse;
  opacity: 0.8;
}
.ur-filigree .ur-line {
  fill: none;
  stroke: #58c7d8;
  stroke-width: 0.7;
  opacity: 0.9;
}
.ur-filigree .ur-orn { fill: #b388ff; stroke: #2b6f7d; stroke-width: 0.4; }
@keyframes ur-aurora-kf {
  0% { background-position: 0% 100%; }
  50% { background-position: 100% 0%; }
  100% { background-position: 0% 100%; }
}
.ur-aurora {
  opacity: 0;
  transition: opacity 400ms ease;
  /* v4.19: confined to the outer border ring (same xor-mask trick as
     .my-void) — the aurora sweep used to wash across the whole face and
     fight the card text for legibility. */
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  padding: 7px;
  background: linear-gradient(115deg,
    rgba(80, 255, 218, 0) 12%,
    rgba(80, 255, 218, 0.4) 30%,
    rgba(140, 120, 255, 0.5) 44%,
    rgba(255, 255, 255, 0.45) 52%,
    rgba(64, 200, 255, 0.4) 62%,
    rgba(80, 255, 218, 0) 80%);
  background-size: 260% 260%;
  animation: ur-aurora-kf 4.2s ease-in-out infinite;
  mix-blend-mode: overlay;
  pointer-events: none;
}
.premium-card:hover .ur-aurora,
.premium-boost .ur-aurora { opacity: 1; }

/* ---- Mythic "Void Eclipse" (v4.8) ----
   Dark cosmic replaces v4.7's molten sovereign: a slow-rotating nebula
   border (masked to the edge), a pulsing eclipse-corona sigil, drifting
   starfield, and a hover-gated violet/crimson corona bloom. */
@keyframes my-void-kf {
  0% { background-position: 0% 100%; filter: hue-rotate(0deg); }
  50% { background-position: 100% 0%; filter: hue-rotate(18deg); }
  100% { background-position: 0% 100%; filter: hue-rotate(0deg); }
}
.my-void {
  background:
    linear-gradient(130deg, #1b1035, #7b2ff7, #0b0b18, #e11d5e, #2f145e, #1b1035);
  background-size: 340% 340%;
  animation: my-void-kf 9s ease-in-out infinite;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  padding: 3px;
  opacity: 0.9;
  pointer-events: none;
}
@keyframes my-crest-kf {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
.my-crest { animation: my-crest-kf 3s ease-in-out infinite; pointer-events: none; }
@keyframes my-stars-kf {
  0% { background-position: 0% 0%, 50% 20%, 20% 60%; }
  100% { background-position: -30% 100%, 40% 130%, 5% 170%; }
}
.my-stars {
  /* three parallax layers of pin-prick stars, drawn with radial gradients */
  background-image:
    radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.9) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 68% 42%, rgba(214,166,255,0.9) 50%, transparent 51%),
    radial-gradient(1px 1px at 38% 78%, rgba(159,242,255,0.8) 50%, transparent 51%);
  background-size: 90px 120px, 130px 160px, 70px 110px;
  animation: my-stars-kf 24s linear infinite;
  opacity: 0.6;
  mix-blend-mode: screen;
  pointer-events: none;
}
@keyframes my-corona-kf {
  0%, 100% { opacity: 0; transform: scale(0.98); }
  50% { opacity: 1; transform: scale(1.02); }
}
.my-corona {
  opacity: 0;
  transition: opacity 400ms ease;
  background:
    radial-gradient(45% 30% at 50% 12%, rgba(123, 47, 247, 0.55) 0%, transparent 70%),
    radial-gradient(60% 35% at 50% 95%, rgba(225, 29, 94, 0.45) 0%, transparent 72%);
  mix-blend-mode: screen;
  pointer-events: none;
}
.premium-card:hover .my-corona,
.premium-boost .my-corona { opacity: 1; animation: my-corona-kf 3.6s ease-in-out infinite; }
/* Embossed stat gem — Mythic-exclusive faceted look for ATK/HP chips,
   restyled amethyst for the Void Eclipse template */
.my-gem {
  background-image: linear-gradient(160deg, rgba(255,255,255,0.35) 0%, rgba(214,166,255,0.12) 45%, rgba(10,6,24,0.35) 100%) !important;
  box-shadow:
    inset 0 1px 1px rgba(214, 166, 255, 0.75),
    inset 0 -1px 2px rgba(43, 16, 78, 0.6),
    0 1px 2px rgba(0, 0, 0, 0.4);
  border-color: #7b2ff7 !important;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

@media (prefers-reduced-motion: reduce) {
  .ur-filigree .ur-trace,
  .ur-filigree .ur-trace2,
  .ur-aurora,
  .my-void,
  .my-crest,
  .my-stars,
  .my-corona { animation: none; }
  .premium-card:hover .ur-aurora,
  .premium-boost .ur-aurora,
  .premium-card:hover .my-corona,
  .premium-boost .my-corona { opacity: 0.25; }
}
`;

function ensurePremiumStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(PREMIUM_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = PREMIUM_STYLE_ID;
  el.textContent = PREMIUM_CSS;
  document.head.appendChild(el);
}

ensurePremiumStyles();

/** Inline-SVG chromatic lattice frame for Ultra-Rare "Aurora Vault" (full
 * tier only): a cut-corner double hairline in teal, TWO counter-rotating
 * light-traces (cyan clockwise, violet counter-clockwise), and faceted gem
 * ornaments at the side midpoints. Non-uniform viewBox scaling is fine —
 * everything drawn is decorative line-work meant to hug the card edges. */
function UltraFiligree({ size }: { size: CardSize }) {
  // v4.22: was a plain `absolute inset-0` — flush with the card's padding
  // edge (inside the outer border), not its true outer edge, so the whole
  // hand-drawn frame sat visibly inset from the real border. Negative-inset
  // by the tier's border width so the line-work actually hugs the edge.
  const b = OUTER_BORDER_PX[size];
  return (
    <svg
      aria-hidden
      className="ur-filigree absolute w-auto h-auto z-20"
      style={{ top: -b, right: -b, bottom: -b, left: -b }}
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
    >
      {/* outer hairline with cut corners */}
      <path
        className="ur-line"
        d="M 7 1.5 L 93 1.5 L 98.5 7 L 98.5 133 L 93 138.5 L 7 138.5 L 1.5 133 L 1.5 7 Z"
      />
      {/* counter-rotating light traces, echoing the cut-corner octagon */}
      <path
        className="ur-trace"
        d="M 8.5 3.5 L 91.5 3.5 L 96.5 8.5 L 96.5 131.5 L 91.5 136.5 L 8.5 136.5 L 3.5 131.5 L 3.5 8.5 Z"
      />
      <path
        className="ur-trace2"
        d="M 10 5.5 L 90 5.5 L 94.5 10 L 94.5 130 L 90 134.5 L 10 134.5 L 5.5 130 L 5.5 10 Z"
      />
      {/* corner cut accents */}
      <path className="ur-line" d="M 1.5 10 L 10 1.5" />
      <path className="ur-line" d="M 90 1.5 L 98.5 10" />
      <path className="ur-line" d="M 98.5 130 L 90 138.5" />
      <path className="ur-line" d="M 10 138.5 L 1.5 130" />
      {/* side-midpoint faceted gems */}
      <path className="ur-orn" d="M 1.5 70 L 4 66.5 L 6.5 70 L 4 73.5 Z" />
      <path className="ur-orn" d="M 93.5 70 L 96 66.5 L 98.5 70 L 96 73.5 Z" />
      <path className="ur-orn" d="M 47 1.5 L 50 0 L 53 1.5 L 50 3 Z" />
      <path className="ur-orn" d="M 47 138.5 L 50 137 L 53 138.5 L 50 140 Z" />
    </svg>
  );
}

/** Inline-SVG sigil for Mythic "Void Eclipse" (full tier only): an eclipse
 * disc with a thin corona ring at the top-center of the frame plus beveled
 * corner shards — unique frame geometry no other rarity has. Pulses gently
 * via .my-crest. */
function MythicCrest() {
  return (
    <svg
      aria-hidden
      className="my-crest absolute inset-0 w-full h-full z-20"
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="myVoid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6a6ff" />
          <stop offset="1" stopColor="#e11d5e" />
        </linearGradient>
      </defs>
      {/* corner shards */}
      <path d="M 0 0 L 9 0 L 0 7 Z" fill="url(#myVoid)" opacity="0.9" />
      <path d="M 100 0 L 91 0 L 100 7 Z" fill="url(#myVoid)" opacity="0.9" />
      <path d="M 0 140 L 9 140 L 0 133 Z" fill="url(#myVoid)" opacity="0.9" />
      <path d="M 100 140 L 91 140 L 100 133 Z" fill="url(#myVoid)" opacity="0.9" />
      {/* eclipse disc + corona ring, top center */}
      <circle cx="50" cy="2.4" r="2" fill="#0b0b18" stroke="url(#myVoid)" strokeWidth="0.6" />
      <circle cx="50" cy="2.4" r="3.4" fill="none" stroke="#7b2ff7" strokeWidth="0.35" opacity="0.8" />
      {/* corona flares flanking the disc */}
      <path d="M 44.5 2.4 L 46.5 1.6 L 46.5 3.2 Z" fill="url(#myVoid)" opacity="0.85" />
      <path d="M 55.5 2.4 L 53.5 1.6 L 53.5 3.2 Z" fill="url(#myVoid)" opacity="0.85" />
    </svg>
  );
}

/** Border width (px) of each tier's outer card frame — see `TIER[size].
 * outerBorder` (border / border-2 / border-[3px] / border-4). An absolutely-
 * positioned child with `inset: 0` sits flush with its containing block's
 * *padding* edge (i.e. already inside the parent's border), not the true
 * outer edge — so any full-face overlay meant to hug the card's real border
 * needs to negative-inset outward by exactly this much to actually reach it. */
const OUTER_BORDER_PX: Record<CardSize, number> = { micro: 1, compact: 2, standard: 3, full: 4 };

/** v4.19: inline xor-mask that confines a full-face animated layer to the
 * card's outer border ring, so premium border animations never overlap the
 * name/stats/chips/flavor content. Same technique as `.my-void`/`.ur-aurora`
 * in PREMIUM_CSS, expressed as an inline style for layers whose base class
 * lives in index.css (ultra-sparkle, rarity-sheen).
 *
 * v4.22: previously a static `inset-0` object — that positioned the ring
 * flush with the card's padding edge, i.e. `outerBorder`-width pixels
 * *inside* the actual card border, so the Ultra-Rare ring effect visibly
 * floated inset from the real edge instead of hugging it. Now takes `size`
 * and negative-insets by `OUTER_BORDER_PX[size]` to land exactly on the true
 * outer edge (the card wrapper's own `overflow-hidden` still clips it to the
 * frame, so this can't bleed past the card). */
function edgeRingMaskStyle(size: CardSize): React.CSSProperties {
  const b = OUTER_BORDER_PX[size];
  return {
    position: 'absolute',
    top: -b,
    right: -b,
    bottom: -b,
    left: -b,
    padding: 7,
    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
    WebkitMaskComposite: 'xor',
    mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
    maskComposite: 'exclude',
  };
}

/** Small per-type glyph shown next to the name — a quick visual "what is this" cue. */
const TYPE_ICON: Record<CardType, React.ComponentType<{ className?: string }>> = {
  Leader: Crown,
  Unit: Swords,
  Location: MapPin,
  Charm: Wand2,
  Event: Zap,
};

/** v4.3: short rules explainer per keyword, shown in a click-to-open popover. */
export const KEYWORD_GLOSSARY: Record<string, string> = {
  Guard:
    'While you control any Guard Unit, your opponent must attack a Guard Unit first — resolved one at a time until none remain.',
  Swift: "May attack or use an Ability Slot the turn it's cast, instead of waiting a turn.",
  Pierce:
    "Leftover damage past what's needed to destroy the target Unit carries through to the enemy Leader, capped at half this card's ATK (rounded down, minimum 1).",
  Ward: "Prevents the first instance of damage or Removal against this card each turn (not retaliation from its own attack) and spikes 1 damage back at the attacker in combat. Refreshes every End Phase.",
  Frenzy:
    "May attack a second time in the same Combat Phase if it survives its first attack. Only the second attack takes doubled retaliation, and it can't target the enemy Leader directly unless no other target remains or you're behind on Units.",
  Anchor:
    "This card's effective Cast Slot cost drops by 1 for each other Anchor card you control in play, to a max total of -3. The first time a card's own discount hits that cap, it permanently gains +2/+2.",
  Echo: "After this card is discarded (any reason), it can later be recast from Discard by paying its cost plus discarding one extra card from hand — waived entirely for Rare/Super-Rare cards.",
  Scrap:
    'Discard this card from hand to reroll one of your unplaced dice, any time during Placement Phase.',
  Rally:
    "Once per turn, activate this card's Ability Slot for free using a die already resting on another exhausted friendly Ability Slot.",
  Twin: 'Has two Cast Slots requiring an identical rolled face value. Filling the first parks it in your Staging Zone until a matching die completes it.',
  Bulwark:
    'Flat reduction to damage this Unit takes from attacks — both when defending and when it deals/takes retaliation while attacking.',
  Toll: 'While this Unit is in play, ALL incoming damage to your Leader (any source) is reduced.',
  Avenge:
    'Permanently gains +1/+1 whenever another friendly Unit dies — an automatic trigger, no priority window.',
  Crescendo: 'Adds bonus value to this Event per die showing a 6 that you placed this turn.',
  Aftershock:
    'After this Event resolves, it queues a smaller repeat of its effect to fire at the very start of your next turn.',
  Snap: 'May be cast during your Reroll Phase, before the reroll window closes, instead of waiting for Placement.',
  Tribute: 'Triggers at your End Phase if you Pitched 2 or more dice this turn.',
  Excavate:
    "This Location's Ability Slot threshold drops the longer it stays continuously in play.",
  Contested:
    "This Location's passive doubles while your opponent controls no Location of their own.",
  Resolve: 'While your Leader is at or below half HP, its Ability Slot threshold drops.',
  Ultimate:
    'A second, once-per-game Leader Ability Slot, usable starting on a specific turn of yours.',
  Sap: 'Deals damage directly to the named target, bypassing normal combat.',
  Mend: 'Heals that much damage from the named target.',
  Bind: "Target enemy Unit can't attack, use an Ability Slot, or deal retaliation damage during its controller's next turn.",
  Surge: 'Draw a card (does nothing if your deck is empty — it never causes a loss).',
  Overflow:
    "If the die placed on this slot beats its effective threshold by this much or more, the bonus effect triggers immediately in addition to the card's normal effect.",
  Combo: "Triggers if your final five-die roll contains the named pattern as a subset, checked once at Combo Check regardless of when the card was cast.",
  Steel:
    'The first X damage this Unit would take each turn, from any source (attacks, Sap, Pierce overflow), is prevented instead of reduced. Refreshes every End Phase, checked Ward -> Steel -> Bulwark -> Frenzy.',
  Overrun:
    "If this Unit's combat damage would be fully prevented or absorbed by Ward, Steel, or Bulwark, it deals 1 damage anyway. Doesn't apply to retaliation.",
  Foothold: 'The first Unit you cast each turn costs 1 less while this Location is in play.',
};

/** v4.3: player-facing display label for each dice-pattern gate. */
export const GATE_LABEL: Record<string, string> = {
  AnyPair: 'PAIRS',
  TwoPair: 'TWO PAIR',
  ThreeKind: '3 OF A KIND',
  FourKind: '4 OF A KIND',
  Yahtzee: '5 OF A KIND',
  FullHouse: 'FULL HOUSE',
  SmallStraight: 'SM. STRAIGHT',
  LargeStraight: 'LG. STRAIGHT',
  ThreeOdds: '3 ODDS',
  ThreeEvens: '3 EVENS',
};

/** Measured chance a focused player rolls each gate pattern within the
 * standard two rerolls (from scripts/pattern-hitrate.ts) — surfaced in the
 * combo-gate cost popover so players can judge how reliable a gate is. */
export const GATE_HIT_RATE: Record<string, number> = {
  AnyPair: 100,
  ThreeOdds: 97,
  ThreeEvens: 97,
  ThreeKind: 74,
  TwoPair: 74,
  SmallStraight: 44,
  FullHouse: 35,
  FourKind: 29,
  LargeStraight: 18,
  Yahtzee: 5,
};

/** v4.3: short badge text for this card's Cast Slot cost, any format.
 * `threshold` overrides `def.threshold` — pass the live effective value
 * (post-Anchor-discount) during a match so the badge reflects what it
 * actually costs right now, not just what's printed. */
export function costBadge(def: CardDef, threshold = def.threshold): string | null {
  if (def.comboGate) return GATE_LABEL[def.comboGate] || def.comboGate;
  if (threshold === undefined) return null;
  if (def.castCostKind === 'exact') return `=${threshold}`;
  if (def.castCostKind === 'sum') return `Σ${threshold}`;
  return `${threshold}+`;
}

/** v4.3: one-line plain-English summary of this card's Cast Slot cost. */
export function costSummary(def: CardDef): string | null {
  if (def.comboGate) return `Cast: roll ${GATE_LABEL[def.comboGate] || def.comboGate}`;
  if (def.threshold === undefined) return null;
  if (def.castCostKind === 'exact') return `Cast: one die showing exactly ${def.threshold}`;
  if (def.castCostKind === 'sum') return `Cast: dice totalling ${def.threshold}+`;
  return `Cast: one die ${def.threshold}+`;
}

/** Plain-English phrase for who/what an effect hits — spelled out so a rules
 * line never leaves the reader guessing (e.g. a bare "Sap 2" used to not say
 * *who* takes the 2 damage). */
function targetPhrase(target: Effect['target']): string {
  switch (target) {
    case 'enemyLeader':
      return 'the enemy Leader';
    case 'friendlyLeader':
      return 'your Leader';
    case 'enemyUnit':
      return 'a target enemy Unit';
    case 'friendlyUnit':
      return 'a target friendly Unit';
    case 'friendlyAny':
      return 'your Leader or a friendly Unit';
    case 'anyTarget':
      return 'a target enemy Unit or the enemy Leader';
    case 'allEnemyUnits':
      return 'ALL enemy Units';
    case 'allFriendlyUnits':
      return 'ALL friendly Units';
    case 'self':
      return 'this card';
    case 'none':
      return '';
  }
}

export function describeEffect(eff: Effect): string {
  const v = eff.value ?? '';
  switch (eff.action) {
    case 'sap':
      return `Sap ${v} to ${targetPhrase(eff.target)}`;
    case 'mend':
      return `Mend ${v} to ${targetPhrase(eff.target)}`;
    case 'draw':
      return `Surge — draw ${v || 1} card${(v || 1) === 1 ? '' : 's'}`;
    case 'bind':
      return `Bind ${targetPhrase(eff.target)} (can't attack, use its Ability Slot, or retaliate next turn)`;
    case 'destroy':
      return `Destroy ${targetPhrase(eff.target)}`;
    case 'buff': {
      const isAll = eff.target === 'allFriendlyUnits';
      const subject =
        eff.target === 'self' ? 'This card' : isAll ? 'ALL friendly Units' : 'A target friendly Unit';
      return `${subject} ${isAll ? 'get' : 'gets'} +${v}/+${v}`;
    }
  }
}

/** Every rules line this card prints, one entry per ability/keyword effect —
 * phrased as a plain-English trigger ("when this happens") followed by what
 * it does, so a line reads on its own without needing outside context. */
export function cardRuleLines(def: CardDef): string[] {
  const bits: string[] = [];
  if (def.comboGate && def.onCast)
    bits.push(
      `Cast by rolling ${GATE_LABEL[def.comboGate] || def.comboGate}: ${describeEffect(def.onCast)}`,
    );
  else if (def.onCast) bits.push(`When cast: ${describeEffect(def.onCast)}`);
  if (def.ability)
    bits.push(
      `Base Ability (place a die showing ${def.ability.threshold}+): ${describeEffect(def.ability.effect)}`,
    );
  if (def.combo)
    bits.push(
      `Combo (if your roll has ${GATE_LABEL[def.combo.pattern] || def.combo.pattern}): ${describeEffect(def.combo.effect)}`,
    );
  if (def.overflow)
    bits.push(
      `Overflow (die beats this card's cost by ${def.overflow.amount}+): also ${describeEffect(def.overflow.effect)}`,
    );
  if (def.twinBonus) bits.push(`Twin bonus (once both dice are placed): ${describeEffect(def.twinBonus)}`);
  if (def.stagedPassive)
    bits.push(`While staged, waiting for its match (Twin): ${describeEffect(def.stagedPassive)} each of your turns`);
  if (def.aftershock)
    bits.push(`Aftershock — at the start of your next turn: ${describeEffect(def.aftershock)}`);
  if (def.crescendo)
    bits.push(`Crescendo: +${def.crescendo.x} for each die showing a 6 you placed this turn`);
  if (def.bulwark) bits.push(`Bulwark ${def.bulwark.x}: reduces damage from attacks by ${def.bulwark.x}`);
  if (def.toll) bits.push(`Toll ${def.toll.x}: reduces all damage to your Leader by ${def.toll.x}`);
  if (def.steel)
    bits.push(
      `Steel ${def.steel.x}: the first ${def.steel.x} damage this Unit would take each turn, from any source, is prevented`,
    );
  if (def.avenge) bits.push('Avenge: whenever another friendly Unit dies, this gets +1/+1');
  if (def.locPassive)
    bits.push(
      def.locPassive === 'ATK_ALL'
        ? 'Passive: all your Units get +2 ATK'
        : 'Passive: all your Units get +2 max HP',
    );
  if (def.contested) bits.push("Contested: this Location's passive is doubled while your opponent controls no Location");
  if (def.excavate)
    bits.push(
      `Excavate ${def.excavate.x}: this Location's Ability cost drops ${def.excavate.x} lower for each turn it's stayed in play`,
    );
  if (def.tribute)
    bits.push(`Tribute — at your End Phase, if you Pitched 2+ dice this turn: ${describeEffect(def.tribute)}`);
  if (def.snap) bits.push('Snap: may be cast during your Reroll Phase, not just Placement');
  if (def.foothold)
    bits.push("Foothold: the first Unit you cast each turn costs 1 less while this is in play");
  if (def.resolve)
    bits.push(
      `Resolve ${def.resolve.x}: this card's Ability cost drops ${def.resolve.x} while your Leader is at half HP or less`,
    );
  if (def.ultimate)
    bits.push(
      `Ultimate — starting your turn ${def.ultimate.unlockTurn}, once per game (place a die showing ${def.ultimate.threshold}+): ${describeEffect(def.ultimate.effect)}`,
    );
  return bits;
}

/** Flat rules text — used for tooltips/inline text that just want one string. */
export function cardRules(def: CardDef): string {
  return cardRuleLines(def).join(' · ');
}

/** Scales a font size down as text grows past a soft length target, so long
 * names/flavor text shrink to fit instead of getting clipped or truncated.
 * Never shrinks below `min`. */
function fitFontSize(text: string, base: number, min: number, softLimit: number): number {
  if (!text || text.length <= softLimit) return base;
  const scaled = base * (softLimit / text.length);
  return Math.max(min, Math.round(scaled * 10) / 10);
}

/** A small tinted, icon-led stat pill (ATK/HP) — replaces plain emoji text
 * with a proper badge so the stat line reads as UI, not a caption. */
function StatChip({
  icon: Icon,
  value,
  maxValue,
  printed,
  tier,
  tint,
  emboss,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value?: number;
  maxValue?: number;
  /** v4.3 live-match stats: the printed value this live value has drifted
   * from (buff/nerf). Rendered struck through inside the chip itself, so
   * modified stats live in the normal stat position rather than as an extra
   * badge. Omitted (or equal to `value`) renders a plain chip. */
  printed?: number;
  tier: CardSize;
  tint: string;
  /** v4.7 Mythic-exclusive: render the chip as an embossed faceted "stat
   * gem" (gold bevel + inner shadow) instead of the flat tinted pill. */
  emboss?: boolean;
}) {
  const textClass =
    tier === 'full'
      ? 'text-[12px] px-1.5 py-0.5'
      : tier === 'standard'
        ? 'text-[10px] px-1.5 py-0.5'
        : tier === 'compact'
          ? 'text-[8px] px-1'
          : 'text-[5.5px] px-0.5';
  const iconClass =
    tier === 'full'
      ? 'w-3 h-3'
      : tier === 'standard'
        ? 'w-2.5 h-2.5'
        : tier === 'compact'
          ? 'w-2 h-2'
          : 'w-1.5 h-1.5';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full font-mono font-black border',
        emboss && 'my-gem',
        textClass,
      )}
      style={{
        color: tint,
        borderColor: `color-mix(in srgb, ${tint} 45%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${tint} 12%, transparent)`,
      }}
    >
      <Icon className={iconClass} />
      {printed !== undefined && printed !== value && (
        <s className="opacity-50 font-bold">{printed}</s>
      )}
      {value}
      {maxValue !== undefined && <span className="opacity-60 font-bold">/{maxValue}</span>}
    </span>
  );
}

const POPOVER_WIDTH = 180;

/**
 * v4.3: a keyword pill that opens a small popover with its rules text on
 * click — used anywhere a keyword chip is shown (card template, board
 * Units) so players never have to guess what a keyword does. The popover
 * renders through a portal at a viewport-fixed position computed from the
 * button's own bounding rect (clamped to stay on-screen) rather than as an
 * absolutely-positioned child — every place this chip is used sits inside
 * at least one `overflow-hidden`/`overflow-auto` ancestor (the card face
 * itself, the battlefield shell, scrollable hand/collection rows), which
 * would otherwise clip an absolutely-positioned popover into invisibility.
 */
const SEEN_KEYWORDS_KEY = 'frycards_seen_keywords';

function hasSeenKeyword(kw: string): boolean {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEYWORDS_KEY) || '[]');
    return Array.isArray(seen) && seen.includes(kw);
  } catch {
    return false;
  }
}

function markKeywordSeen(kw: string): void {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEYWORDS_KEY) || '[]');
    const next = Array.isArray(seen) ? seen : [];
    if (!next.includes(kw)) localStorage.setItem(SEEN_KEYWORDS_KEY, JSON.stringify([...next, kw]));
  } catch {
    // localStorage unavailable — auto-introduce simply won't dedupe this session.
  }
}

const AUTO_INTRO_GAP_MS = 3500;
const AUTO_INTRO_VISIBLE_MS = 6000;
/** Module-level, shared by every KeywordChip on the page: when several
 * never-seen keywords mount at once (e.g. a fresh opening hand full of
 * distinct keywords), this staggers their auto-introduce popovers instead
 * of firing them all on top of each other in one unreadable stack. */
let nextAutoIntroSlot = 0;

/** Shared popover behavior for any clickable keyword mention — the pill chip
 * (kwList) and any inline keyword mention found inside a rules sentence both
 * drive the same click-to-open/auto-introduce popover through this hook, so
 * a keyword is equally clickable whichever form it's rendered in. */
function useKeywordPopover(kw: string, autoIntroduce?: boolean, textOverride?: string) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Pending auto-close timer for the auto-introduced popover — cleared the
  // moment the player interacts with it manually, so a manual re-open isn't
  // cut short by a timeout scheduled for the earlier auto-open.
  const autoCloseRef = useRef<number | null>(null);
  // v4.19: tier-aware — callers that know the card's exact tier pass its
  // tier-specific description (tierDescription via cardKeywords); the
  // generic KEYWORD_GLOSSARY stays as the fallback for tier-less mentions
  // (inline rules words like Sap/Mend/Bind, HowToPlay links, log lines).
  const text = textOverride ?? KEYWORD_GLOSSARY[kw];

  const clearAutoClose = () => {
    if (autoCloseRef.current !== null) {
      window.clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  };

  const computePos = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - POPOVER_WIDTH / 2),
      window.innerWidth - POPOVER_WIDTH - 8,
    );
    return { top: rect.bottom + 4, left };
  };

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearAutoClose();
    if (pos) {
      setPos(null);
      return;
    }
    setPos(computePos());
  };

  const close = () => {
    clearAutoClose();
    setPos(null);
  };

  useEffect(() => {
    if (!autoIntroduce || !text || hasSeenKeyword(kw)) return;
    markKeywordSeen(kw);
    const now = Date.now();
    const showAt = Math.max(now, nextAutoIntroSlot);
    nextAutoIntroSlot = showAt + AUTO_INTRO_GAP_MS;
    const openTimeout = window.setTimeout(() => {
      const next = computePos();
      if (!next) return;
      setPos(next);
      autoCloseRef.current = window.setTimeout(() => {
        autoCloseRef.current = null;
        setPos(null);
      }, AUTO_INTRO_VISIBLE_MS);
    }, showAt - now);
    return () => {
      window.clearTimeout(openTimeout);
      clearAutoClose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pos, btnRef, text, open, close };
}

/** Renders the popover itself (via portal) — shared by the pill chip and the
 * inline keyword link so both look/behave identically once opened. */
function KeywordPopover({
  kw,
  text,
  pos,
  close,
}: {
  kw: string;
  text: string;
  pos: { top: number; left: number };
  close: () => void;
}) {
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998]"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        onWheel={close}
      />
      <div
        style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
        className="fixed z-[9999] bg-[var(--c-ink)] text-[var(--c-paper)] text-[9px] leading-snug font-bold p-2 ink-border-sm shadow-hard-black-xs text-left normal-case"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="heading-font text-[10px] text-[var(--c-yellow)] mb-1">{kw}</div>
        {text}
      </div>
    </>,
    document.body,
  );
}

/** v4.4: Magic the Gathering-style keyword line — the bare keyword name
 * (clickable/underlined, same glossary popover as any other keyword mention)
 * immediately followed by its reminder text in italics, so the explainer is
 * readable straight off the card without needing to click anything. Replaces
 * the old opaque yellow "badge" pill, which hid the definition behind a tap
 * and read as a UI chip rather than card text. */
/** v4.19: the card's ONLY mechanics surface — a compact clickable pill chip.
 * Keyword chips show "Name + tier roman" (plus the bundled activation cost
 * for activated keywords); tapping opens the shared glossary popover with the
 * TIER-SPECIFIC description (tierDescription via cardKeywords). Mechanic
 * chips (mechanicLabels) render identically with their structured label.
 * Free-form rules text is gone from card faces entirely. */
export function KeywordChip({
  kw,
  label,
  text,
  cost,
  small,
  autoIntroduce,
  accent,
}: {
  key?: React.Key;
  /** Base keyword name — popover title + "seen keywords" localStorage key. */
  kw: string;
  /** Chip label, e.g. "Bulwark II" (defaults to the bare keyword name). */
  label?: string;
  /** Tier-specific popover text; falls back to KEYWORD_GLOSSARY when omitted. */
  text?: string;
  /** Bundled activation cost (activated keywords) — printed on the chip. */
  cost?: string;
  small?: boolean;
  /** Auto-opens this keyword's popover once per device the first time it's
   * ever seen (tracked in localStorage), so new players discover the
   * glossary exists instead of needing to guess the name is clickable.
   * Only pass this from live-match contexts (hand/board) — passing it from
   * a screen that renders many cards at once (Collection, Deck Builder)
   * would fire a stack of popovers simultaneously. */
  autoIntroduce?: boolean;
  /** Chip tint (defaults to the neutral ink-on-paper pill). */
  accent?: string;
}) {
  const { pos, btnRef, text: popText, open, close } = useKeywordPopover(kw, autoIntroduce, text);

  return (
    <span className="relative inline-block max-w-full">
      <button
        ref={btnRef}
        type="button"
        onClick={open}
        className={cn(
          'inline-flex items-center gap-0.5 max-w-full rounded-full border font-bold leading-tight cursor-help text-left',
          small ? 'text-[6.5px] px-1 py-[1px]' : 'text-[8.5px] px-1.5 py-[2px]',
        )}
        style={{
          color: accent ?? 'var(--c-ink)',
          borderColor: `color-mix(in srgb, ${accent ?? 'var(--c-ink)'} 45%, transparent)`,
          backgroundColor: `color-mix(in srgb, ${accent ?? 'var(--c-ink)'} 10%, var(--c-paper))`,
        }}
      >
        <span className="truncate">{label ?? kw}</span>
        {cost && (
          <span className="opacity-70 font-semibold normal-case truncate shrink-[2]">· {cost}</span>
        )}
      </button>
      {pos && popText && <KeywordPopover kw={label ?? kw} text={popText} pos={pos} close={close} />}
    </span>
  );
}

/** Short kind label + longer plain-English explainer for each structured
 * mechanic chip — the popover body backing mechanicLabels(def)'s chips. */
function mechanicExplain(def: CardDef, m: MechanicLabel): string {
  switch (m.kind) {
    case 'onCast':
      return def.comboGate
        ? `${describeEffect(def.onCast!)} — triggers when this card is cast by rolling ${GATE_LABEL[def.comboGate] || def.comboGate}.`
        : `${describeEffect(def.onCast!)} — triggers once, the moment this card is cast.`;
    case 'ability':
      return `Ability Slot: place a die showing ${def.ability!.threshold}+ on this card (once per turn) to trigger: ${describeEffect(def.ability!.effect)}.`;
    case 'combo':
      return `At Combo Check, if your final five-die roll contains ${GATE_LABEL[def.combo!.pattern] || def.combo!.pattern}: ${describeEffect(def.combo!.effect)}.`;
    case 'overflow':
      return `If the die placed to cast this beats its effective cost by ${def.overflow!.amount}+, also: ${describeEffect(def.overflow!.effect)}.`;
    case 'twinBonus':
      return `Once both Twin dice are placed: ${describeEffect(def.twinBonus!)}.`;
    case 'stagedPassive':
      return `While parked in your Staging Zone waiting for its Twin match: ${describeEffect(def.stagedPassive!)} each of your turns.`;
    case 'aftershock':
      return `Aftershock — at the very start of your next turn, a delayed repeat fires: ${describeEffect(def.aftershock!)}.`;
    case 'tribute':
      return `Tribute — at your End Phase, if you Pitched enough dice this turn: ${describeEffect(def.tribute!)}.`;
    case 'locPassive':
      return def.locPassive === 'ATK_ALL'
        ? 'Passive while this Location is in play: all your Units get +2 ATK.'
        : 'Passive while this Location is in play: all your Units get +2 max HP.';
    case 'ultimate':
      return `Ultimate — starting your turn ${def.ultimate!.unlockTurn}, once per game, place a die showing ${def.ultimate!.threshold}+: ${describeEffect(def.ultimate!.effect)}.`;
  }
}

/** Per-mechanic-kind chip tint so mechanic chips scan by category. */
const MECHANIC_ACCENT: Record<MechanicLabel['kind'], string> = {
  onCast: '#B45309',
  ability: '#0E7490',
  combo: '#A855F7',
  overflow: '#DC2626',
  twinBonus: '#7C3AED',
  stagedPassive: '#7C3AED',
  aftershock: '#EA580C',
  tribute: '#64748B',
  locPassive: '#16A34A',
  ultimate: '#B91C1C',
};

/** The tier's bundled activation cost, for activated keywords ('' otherwise). */
function keywordActivation(def: CardDef, kw: string): string {
  const kd = KEYWORD_TIERS[kw];
  if (!kd?.activated) return '';
  return kd.tiers[Math.min(kd.tiers.length, Math.max(1, keywordTier(def, kw))) - 1].activation ?? '';
}

/** v4.3.1: an inline, in-sentence keyword mention (e.g. "Twin bonus:" inside
 * a rules line, or a keyword named inside a Combo/Overflow/Aftershock
 * description) — opens the exact same glossary popover as the pill chip
 * above. Previously, only a card's top-of-box keyword pills were clickable;
 * any mention of a keyword *inside* the generated rules sentences (or a
 * pill hidden by the small-card slice cap) had no way to open its
 * definition. This makes every recognized keyword word clickable wherever
 * it appears, not just in the pill row. */
function KeywordText({ kw, small }: { key?: React.Key; kw: string; small?: boolean }) {
  const { pos, btnRef, text, open, close } = useKeywordPopover(kw);
  if (!text) return <>{kw}</>;
  return (
    <span className="relative inline">
      <button
        ref={btnRef}
        type="button"
        onClick={open}
        className={cn(
          'font-bold underline decoration-dotted underline-offset-2 cursor-help',
          small ? 'text-[6.5px]' : undefined,
        )}
      >
        {kw}
      </button>
      {pos && text && <KeywordPopover kw={kw} text={text} pos={pos} close={close} />}
    </span>
  );
}

/** v4.3: click-to-open popover explaining a card's Cast Slot cost — the same
 * portal popover the keyword chips use (see useKeywordPopover's rationale for
 * why it must portal), so the cost badge is no longer a hover-only `title`
 * affordance. Wraps whatever badge content is passed as children in a real
 * <button>; the `title` attr is kept as a desktop hover fallback. */
function CostInfoButton({
  text,
  className,
  title,
  children,
}: {
  text: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) {
      setPos(null);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - POPOVER_WIDTH / 2),
      window.innerWidth - POPOVER_WIDTH - 8,
    );
    setPos({ top: rect.bottom + 4, left });
  };
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={title}
        className={cn('cursor-help', className)}
      >
        {children}
      </button>
      {pos && <KeywordPopover kw="CAST COST" text={text} pos={pos} close={() => setPos(null)} />}
    </>
  );
}

/** Sorted longest-first so a multi-word keyword (if ever added) is matched
 * before any single-word keyword it might contain. */
const KEYWORD_NAMES = Object.keys(KEYWORD_GLOSSARY).sort((a, b) => b.length - a.length);
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** \b word-boundary on both sides — matches a keyword regardless of
 * surrounding punctuation ("Anchor.", "Anchor,", "(Anchor)") or position in
 * the sentence, matches every repeated occurrence (global flag), and never
 * matches a keyword as a partial word inside a longer word (e.g. "Rush"
 * inside "Rushmore") since \b requires an actual word/non-word transition. */
const KEYWORD_TEXT_RE = new RegExp(`\\b(${KEYWORD_NAMES.map(escapeRegExp).join('|')})\\b`, 'g');

/** Splits `text` on every recognized keyword mention and renders each one as
 * a clickable `KeywordText`, so any card sentence — combo text, "while
 * staged" passives, Overflow/Aftershock/Ultimate lines, etc — gets working
 * click-to-define keywords wherever they're mentioned, not just when a
 * keyword is its own top-level pill. */
export function renderKeywordText(text: string, small?: boolean): React.ReactNode {
  if (!text) return text;
  const parts = text.split(KEYWORD_TEXT_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    // Odd indices are the captured keyword matches (String.split keeps
    // capture groups in the output array); even indices are plain text.
    i % 2 === 1 ? (
      <KeywordText key={i} kw={part} small={small} />
    ) : (
      part && <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

/** Per-set flavor-text styling — a distinct "print run" identity per set. */
function setStyle(set?: string): { label: string; className: string; bar: string } {
  switch (set) {
    case 'Blue Coral':
      return {
        label: 'BLUE CORAL',
        className: 'text-[#0E7490] italic',
        bar: 'bg-[#0E7490]',
      };
    case 'Crimson Circuit':
      return {
        label: 'CRIMSON CIRCUIT',
        className: 'text-[#B91C1C] italic',
        bar: 'bg-[#B91C1C]',
      };
    case 'Full Arts Collection 1':
      return {
        label: 'FULL ARTS COLLECTION 1',
        className: 'text-[#2DD4BF] italic',
        bar: 'bg-[#2DD4BF]',
      };
    default:
      return {
        label: set || '',
        className: 'text-[var(--c-steel)] italic',
        bar: 'bg-[var(--c-steel)]',
      };
  }
}

/** Card art with a graceful fallback if the image 404s or never loads. Uses
 * object-contain (not cover) so the full 4:3 art is always visible — never
 * cropped — inside its fixed-aspect box; art narrower than 4:3 letterboxes
 * instead of losing its edges. */
/** True when `src` points at a video file rather than a still image — Full-Art
 * cards may be a short looping clip instead of a static image. Sniffed from
 * the file extension (ignoring any querystring) since that's all a plain
 * URL string gives us; no separate "is this a video" field on CardDef. */
function isVideoSrc(src: string): boolean {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(src);
}

function CardArt({
  def,
  onLoaded,
  cover,
}: {
  def: CardDef;
  onLoaded?: () => void;
  /** Full-Art template: the image fills its box edge-to-edge (object-cover)
   * instead of ever letterboxing — the whole card is the art, so a
   * letterboxed bar would read as a rendering bug rather than the intended
   * treatment. */
  cover?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (!def.image || broken) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[var(--c-steel)] text-[var(--c-paper)]">
        <span className="text-[9px] font-black uppercase tracking-wide opacity-70">{def.type}</span>
        <span className="heading-font text-[10px] opacity-50 px-2 text-center leading-tight">
          NO IMAGE
        </span>
      </div>
    );
  }
  const artClass = cn('w-full h-full bg-[var(--c-ink)]', cover ? 'object-cover' : 'object-contain');
  if (isVideoSrc(def.image)) {
    return (
      <video
        src={def.image}
        className={artClass}
        autoPlay
        loop
        muted
        playsInline
        disablePictureInPicture
        controls={false}
        onError={() => setBroken(true)}
        onLoadedData={onLoaded}
      />
    );
  }
  return (
    <img
      src={def.image}
      // Decorative: the card wrapper already carries a full aria-label, so an
      // empty alt suppresses screen readers from reading the raw image URL.
      alt=""
      className={artClass}
      draggable={false}
      loading="lazy"
      onError={() => setBroken(true)}
      onLoad={onLoaded}
    />
  );
}

/** The three fixed pixel sizes for `CardFace`'s `size` prop — exported so any
 * wrapper that needs to reserve exact space for a card (e.g. a flip-reveal
 * container) can read the real dimensions instead of hardcoding a magic
 * number that could silently drift out of sync with this table. */
export const CARD_SIZES = {
  micro: { w: 78, h: 109 },
  compact: { w: 110, h: 154 },
  standard: { w: 140, h: 196 },
  full: { w: 240, h: 336 },
} as const;
const SIZES = CARD_SIZES;

export type CardSize = keyof typeof SIZES;

/** Hand-tuned per-tier presentation values. `compact` and `standard` are NOT
 * just a linear shrink of `full` — each tier gets its own font sizes, border
 * weights, keyword caps and content toggles so small cards stay legible
 * instead of reusing full-size styling squeezed into a smaller box. Only
 * three fixed tiers exist anywhere in the app; nothing renders at an
 * arbitrary pixel size. */
const TIER: Record<
  CardSize,
  {
    outerBorder: string;
    rounded: string;
    shadow: string;
    showGlow: boolean;
    showCornerGem: boolean;
    headerPy: string;
    typeIconSize: string;
    nameFont: { base: number; min: number; soft: number };
    comboBadge: string;
    showDiceIcon: boolean;
    costBadge: string;
    freeBadge: string;
    artBorder: string;
    artRing: boolean;
    rarityChip: string;
    artBadge: string;
    foilBadge: string;
    typeLine: string;
    showSetSuffix: boolean;
    textBoxPad: string;
    /** Max keyword+mechanic chips shown; overflow collapses into a "+N" chip
     * (full preview/inspector always shows everything). */
    keywordMax: number;
    keywordSmall: boolean;
    /** Print each activated keyword's bundled cost on its chip — only tiers
     * wide enough for it; smaller tiers keep the cost in the popover. */
    chipCosts: boolean;
    showFlavor: boolean;
  }
> = {
  micro: {
    outerBorder: 'border',
    rounded: 'rounded-[2px]',
    shadow: 'shadow-hard-black-xs',
    showGlow: false,
    showCornerGem: false,
    headerPy: 'py-[1px]',
    typeIconSize: 'w-2 h-2',
    nameFont: { base: 7, min: 5.5, soft: 9 },
    comboBadge: 'text-[5.5px] px-0.5 py-[1px]',
    showDiceIcon: false,
    costBadge: 'text-[6.5px] px-0.5 h-3 min-w-3',
    freeBadge: 'text-[5.5px] px-0.5 py-[1px]',
    artBorder: 'border',
    artRing: false,
    rarityChip: 'text-[5px] px-0.5',
    artBadge: 'text-[5.5px]',
    foilBadge: 'text-[5px] px-0.5',
    typeLine: 'mt-0 text-[5.5px]',
    showSetSuffix: false,
    textBoxPad: 'p-0.5',
    keywordMax: 2,
    keywordSmall: true,
    chipCosts: false,
    showFlavor: false,
  },
  compact: {
    outerBorder: 'border-2',
    rounded: 'rounded-[3px]',
    shadow: 'shadow-hard-black-xs',
    showGlow: false,
    showCornerGem: false,
    headerPy: 'py-0.5',
    typeIconSize: 'w-2.5 h-2.5',
    nameFont: { base: 9.5, min: 7, soft: 11 },
    comboBadge: 'text-[6.5px] px-1 py-0.5',
    showDiceIcon: false,
    costBadge: 'text-[8px] px-1 h-4 min-w-4',
    freeBadge: 'text-[6.5px] px-1 py-0.5',
    artBorder: 'border',
    artRing: false,
    rarityChip: 'text-[6px] px-1',
    artBadge: 'text-[6.5px]',
    foilBadge: 'text-[6px] px-1',
    typeLine: 'mt-0.5 text-[7px]',
    showSetSuffix: false,
    textBoxPad: 'p-1',
    keywordMax: 4,
    keywordSmall: true,
    chipCosts: false,
    showFlavor: false,
  },
  standard: {
    outerBorder: 'border-[3px]',
    rounded: 'rounded-[4px]',
    shadow: 'shadow-hard-black-xs',
    showGlow: false,
    showCornerGem: false,
    headerPy: 'py-0.5',
    typeIconSize: 'w-3 h-3',
    nameFont: { base: 11, min: 8, soft: 13 },
    comboBadge: 'text-[7.5px] px-1 py-0.5',
    showDiceIcon: false,
    costBadge: 'text-[9px] px-1 h-5 min-w-5',
    freeBadge: 'text-[7.5px] px-1 py-0.5',
    artBorder: 'border-2',
    artRing: false,
    rarityChip: 'text-[7px] px-1',
    artBadge: 'text-[7.5px]',
    foilBadge: 'text-[7px] px-1',
    typeLine: 'mt-0.5 text-[8px]',
    showSetSuffix: false,
    textBoxPad: 'p-1',
    keywordMax: 6,
    keywordSmall: false,
    chipCosts: false,
    showFlavor: false,
  },
  full: {
    outerBorder: 'border-4',
    rounded: 'rounded-[4px]',
    shadow: 'shadow-hard-black',
    showGlow: true,
    showCornerGem: true,
    headerPy: 'py-1',
    typeIconSize: 'w-3.5 h-3.5',
    nameFont: { base: 13, min: 8.5, soft: 15 },
    comboBadge: 'text-[9px] px-1.5 py-0.5',
    showDiceIcon: true,
    costBadge: 'text-[11px] px-1.5 h-7 min-w-7',
    freeBadge: 'text-[9px] px-1.5 py-0.5',
    artBorder: 'border-[3px]',
    artRing: true,
    rarityChip: 'text-[9px] px-1.5 py-0.5',
    artBadge: 'text-[9px]',
    foilBadge: 'text-[9px] px-1.5 py-0.5',
    typeLine: 'mt-1 text-[10px]',
    showSetSuffix: true,
    textBoxPad: 'p-1.5',
    // v4.22: used to be 99 ("full preview always shows everything") — but a
    // procedurally-loaded card can carry a long tail of keyword+mechanic
    // chips, and with no cap the chip row just kept wrapping until it ran
    // past the text box and off the bottom of the card. Capped like every
    // other tier now; the "+N" overflow chip (below) covers the rest, and
    // the inspector/expanded view is where a player goes to see everything
    // in full via each chip's own popover anyway.
    keywordMax: 8,
    keywordSmall: false,
    chipCosts: true,
    showFlavor: true,
  },
};

export function CardFace({
  def,
  size = 'standard',
  dimmed,
  highlight,
  foil,
  foilEffect = true,
  onClick,
  footer,
  badge,
  count,
  foilCount,
  maxHp,
  live,
  effectiveThreshold,
  introduceKeywords,
  serial,
}: {
  key?: React.Key;
  def: CardDef;
  /** Card size — one of three fixed, hand-tuned tiers (real 2.5:3.5
   * proportions at every tier): `compact` for dense rows (hand, discard,
   * showcases), `standard` for a browsable grid (deck builder pool), `full`
   * for the primary "read the whole card" view (collection grid, inspector,
   * pack reveal). */
  size?: CardSize;
  dimmed?: boolean;
  highlight?: boolean;
  /** Renders the built-in foil treatment: shimmering sheen + pulsing glow ring. */
  foil?: boolean;
  /** Set false to suppress the animated shimmer overlay while still showing
   * the foil badge/glow — for callers (Card3DInspector) that layer their
   * own pointer-driven holographic sheen and would otherwise double up two
   * competing animated overlays on the same card. */
  foilEffect?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
  badge?: string;
  count?: number;
  foilCount?: number;
  /** Leader template only: shows `${def.hp}/${maxHp}` instead of just current HP. */
  maxHp?: number;
  /** Live-match only (Units on the battlefield): effective ATK / current HP /
   * effective max HP. Rendered in the normal StatChip position — green when
   * above the printed value, red when below/damaged, with the printed value
   * struck through inside the chip — never as a separate extra badge. */
  live?: { atk: number; hp: number; maxHp: number };
  /** Live-match only: this card's Cast threshold after Anchor discounts, so
   * the cost badge can show the real number alongside the printed one
   * instead of leaving the discount invisible. Omit outside a match. */
  effectiveThreshold?: number;
  /** Live-match only: auto-opens each of this card's keyword glossary
   * popovers once per device, the first time that keyword is ever seen, so
   * new players discover the glossary exists instead of needing to guess
   * they can click a keyword pill. */
  introduceKeywords?: boolean;
  /** A numbered Serialized print (see grant_pack_contents' 1%-per-pack roll
   * and player_serialized_cards) — the rarest possible pull, always foil-free
   * and never quick-sellable. Renders a rotating prismatic frame + an
   * engraved number plate instead of the normal rarity treatment. */
  serial?: { number: number; cap: number };
}) {
  const { w, h } = SIZES[size];
  const cfg = TIER[size];
  // v4.19: the card's mechanics render EXCLUSIVELY as clickable chips —
  // keyword chips (name + tier roman + bundled activation cost) from
  // cardKeywords(), mechanic chips from mechanicLabels(). No free-form
  // rules text is printed on the face anymore; every chip's tier-specific
  // description lives in its click-to-open glossary popover.
  const keywordChips: CardKeyword[] = cardKeywords(def);
  const mechChips: MechanicLabel[] = mechanicLabels(def);
  const totalChips = keywordChips.length + mechChips.length;
  const hiddenChips = Math.max(0, totalChips - cfg.keywordMax);
  const set = setStyle(def.set);
  // v4.13: Leaders don't carry a color themselves (LEADER_COLORS is their
  // deck-identity, a different concept from a printed card's own color).
  const cardColorsForFace = def.type === 'Leader' ? [] : cardColors(def);
  const atkHp = def.type === 'Unit' ? `, ${def.atk} attack, ${def.hp} health` : '';
  // Serialized prints can never be foil (see quicksell_cards/grant_pack_contents).
  const isFoil = foil && !serial;
  const label = `${def.name}, ${def.type}${atkHp}${isFoil ? ', foil' : ''}${serial ? `, Serialized #${serial.number} of ${serial.cap}` : ''}`;
  const rarityHex = RARITY_HEX[def.rarity || 'Common'] || RARITY_HEX.Common;
  // v4.15: the card's visible fill/background now tracks its color identity
  // (cardColorsForFace, computed above) instead of rarity — rarity keeps the
  // border/glow/corner-gem treatment below (rarityBorder/rarityGlow/rarityHex)
  // so it's still legible at a glance, just no longer via the body tint.
  const colorFillHex = colorHexPrimary(cardColorsForFace);
  // Long names/flavor text shrink to fit via fitFontSize below. The card's
  // own footprint is a hard 2.5:3.5 (w:h) rectangle at every tier — it never
  // grows to accommodate overflow; any residual overflow clips at the
  // (already overflow-hidden) outer edge instead of distorting the ratio.
  const nameFontPx = fitFontSize(def.name, cfg.nameFont.base, cfg.nameFont.min, cfg.nameFont.soft);
  // v4.19: with rules text gone, flavor gets the whole remaining text box —
  // autoscale off its own length, and the render below additionally hard
  // line-clamps + hides overflow so flavor can NEVER run off the frame.
  // Flavor only prints at the `full` tier at all (cfg.showFlavor): every
  // smaller template (board micro, hand compact, grid standard) drops it.
  const flavorFontPx = fitFontSize(def.flavor || '', 9, 6.5, 110);
  // v4.3: Rare+ get a tinted background; Super-Rare/Ultra-Rare/Mythic add an
  // animated sheen; Mythic additionally gets a pulsing frame and a distinct
  // gold-on-red name banner instead of the shared tinted-paper header.
  const mythic = isMythic(def.rarity) && !serial;
  const animatedFx = (rarityAnimated(def.rarity) || mythic) && !serial;
  // v4.15: body background now comes from color identity, not rarity —
  // Rare+ still gets the stronger animated-sheen/mythic/ultra *effect layers*
  // below (those track rarityAnimated/isMythic, unchanged), just tinted by
  // the card's color instead of its rarity.
  const bg = colorBg(cardColorsForFace);
  const TypeIcon = TYPE_ICON[def.type];
  // Full-Art: the uploaded image fills the entire card footprint edge to
  // edge instead of sitting in a boxed 4:3 art window; every normal piece of
  // card text (header, stat line, text box) instead floats on top of it in
  // semi-transparent panels so the art itself is the whole card, not just a
  // fraction of it.
  const fullArt = def.rarity === 'Full-Art' && !serial;
  // Ultra-Rare: a visibly stronger treatment than the shared Rare+ template
  // (heavier glow, a gold hairline border ring around the art, and a
  // brighter/faster sheen sweep) so it doesn't just look like Super-Rare
  // with a different tint.
  const ultra = def.rarity === 'Ultra-Rare' && !serial;

  return (
    // A plain <div role="button"> rather than a <button>: the footer can
    // carry its own interactive control (e.g. a "details" button), and
    // nested <button> elements are invalid HTML / break screen-reader and
    // keyboard navigation.
    <div
      role="button"
      tabIndex={onClick ? 0 : -1}
      aria-disabled={!onClick}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        // Guard against nested interactive chips (KeywordChip/CostInfoButton
        // buttons inside this card): their own Enter/Space keydown bubbles up
        // to this div, which would otherwise ALSO fire the card's onClick
        // (e.g. popping open the inspector) on top of the chip's own action.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{ width: w, height: h, backgroundImage: bg }}
      className={cn(
        'relative flex flex-col bg-[var(--c-paper)] text-[var(--c-ink)] text-left shrink-0 transition-transform overflow-hidden',
        cfg.outerBorder,
        cfg.rounded,
        rarityBorder(def.rarity),
        onClick && 'btn-pop cursor-pointer',
        dimmed && 'opacity-45 saturate-50',
        highlight && 'ring-4 ring-[var(--c-yellow)] -translate-y-1',
        cfg.shadow,
        !dimmed &&
          (serial
            ? 'serialized-frame'
            : mythic
              ? 'mythic-frame'
              : ultra
                ? 'ultra-frame'
                : cfg.showGlow && rarityGlow(def.rarity)),
        // Mythic already animates its own box-shadow pulse (mythic-frame) —
        // stacking foil-glow's competing box-shadow keyframes on the same
        // element causes the two animations to visibly stutter against each
        // other, so a mythic foil gets only the (already more intense) frame.
        isFoil && !dimmed && !mythic && 'foil-glow',
        // v4.7: opts this card into the hover-gated premium layers
        // (.ur-prisma / .my-heat) — cheap at rest, full effect on hover or
        // inside a .premium-boost container (the 3D inspector).
        (ultra || mythic) && !dimmed && 'premium-card',
      )}
    >
      {/* Corner gem — a small decorative flourish marking Rare+ prints,
          echoing the rarity color at a glance even before reading text.
          Positioned at the corner (not negative-offset) since the card
          wrapper clips overflow — the rotated square's tips peek past the
          edge for a "corner tag" look instead of being invisible. */}
      {cfg.showCornerGem && def.rarity && def.rarity !== 'Common' && def.rarity !== 'Uncommon' && (
        <span
          aria-hidden
          className="absolute top-0 left-0 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-[var(--c-ink)] z-10"
          style={{ backgroundColor: rarityHex }}
        />
      )}

      {/* Header: name + dice-medallion cost badge. Mythic prints a distinct
          gold-on-red name banner instead of the shared tinted-paper header.
          Full-Art drops the boxed panel entirely — the name/icon float
          directly on the full-bleed art (which sits behind as an absolutely-
          positioned layer) with a text-shadow for legibility instead of a
          background chip, so nothing visually competes with the art itself.
          The vignette overlay (below, layered under this header) carries the
          actual contrast work at the top edge. */}
      <div
        className={cn(
          'relative flex items-center justify-between gap-1 pl-1.5 pr-1 shrink-0 z-10',
          cfg.headerPy,
          !fullArt && 'border-b-2',
          mythic
            ? 'mythic-bg border-[#7A1420]'
            : ultra
              ? 'ultra-banner border-[#8a6d1f]'
              : !fullArt && 'border-[var(--c-ink)]/15',
        )}
        style={
          mythic || fullArt || ultra
            ? undefined
            : { backgroundColor: `color-mix(in srgb, ${colorFillHex} 45%, var(--c-paper))` }
        }
      >
        <span
          className={cn(
            'flex items-center gap-1 min-w-0 heading-font leading-tight',
            // Ultra's gold-leaf banner always needs dark text regardless of
            // theme (var(--c-ink) can be light in dark themes).
            mythic ? 'text-[var(--c-yellow)]' : ultra ? 'text-[#241a04]' : fullArt && 'text-white',
          )}
          style={
            fullArt
              ? { textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.5)' }
              : undefined
          }
          title={def.name}
        >
          <TypeIcon
            className={cn(
              'shrink-0 opacity-70',
              cfg.typeIconSize,
              mythic && 'opacity-90',
              fullArt && 'opacity-95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]',
            )}
          />
          <span className="break-words" style={{ fontSize: nameFontPx }}>
            {def.name}
          </span>
        </span>
        {def.comboGate ? (
          <CostInfoButton
            text={`${costSummary(def)}. Your final five-die roll must genuinely contain this pattern; the die placed to cast can be any value. Max one Combo-gated card per turn.${
              GATE_HIT_RATE[def.comboGate] !== undefined
                ? ` A focused player hits this ~${GATE_HIT_RATE[def.comboGate]}% of turns (two rerolls).`
                : ''
            }`}
            className={cn(
              'heading-font shrink-0 flex items-center gap-0.5 rounded-full border-2 border-[var(--c-ink)] bg-[#A855F7] text-white text-center',
              cfg.comboBadge,
            )}
            title={costSummary(def) || undefined}
          >
            {cfg.showDiceIcon && <Dices className="w-3 h-3" />}
            {GATE_LABEL[def.comboGate] || def.comboGate}
          </CostInfoButton>
        ) : def.type !== 'Location' && def.type !== 'Leader' && def.threshold !== undefined ? (
          <span
            className={cn(
              'flex flex-col items-end shrink-0',
              // Centering a two-line stack (badge + "was X") shifts the
              // badge itself higher than the single-line case — nudge the
              // whole stack down so the badge still lines up with the name.
              effectiveThreshold !== undefined && effectiveThreshold !== def.threshold && 'mt-1.5',
            )}
          >
            <CostInfoButton
              text={
                effectiveThreshold !== undefined && effectiveThreshold !== def.threshold
                  ? `${costSummary(def)} — reduced to ${effectiveThreshold} this turn.`
                  : `${costSummary(def)}.`
              }
              className={cn(
                'heading-font font-mono flex items-center justify-center rounded-full border-2 border-[var(--c-ink)]',
                def.castCostKind === 'exact'
                  ? 'bg-[#0E7490] text-white'
                  : def.castCostKind === 'sum'
                    ? 'bg-[#B45309] text-white'
                    : 'bg-[var(--c-ink)] text-[var(--c-yellow)]',
                cfg.costBadge,
              )}
              title={
                effectiveThreshold !== undefined && effectiveThreshold !== def.threshold
                  ? `${costSummary(def)} — reduced to ${effectiveThreshold} this turn`
                  : costSummary(def) || undefined
              }
            >
              {costBadge(def, effectiveThreshold ?? def.threshold)}
            </CostInfoButton>
            {effectiveThreshold !== undefined && effectiveThreshold !== def.threshold && (
              <span className="text-[6px] font-bold text-[var(--c-steel)] line-through leading-none mt-0.5">
                was {costBadge(def)}
              </span>
            )}
          </span>
        ) : def.type === 'Location' ? (
          <CostInfoButton
            text="Locations cast free: once per turn, as a bonus action alongside your five die placements — no die, no Cast Slot. Max one Location in play."
            className={cn(
              'heading-font shrink-0 rounded-full border-2 border-[var(--c-ink)] bg-[var(--c-steel)] text-white',
              cfg.freeBadge,
            )}
            title="Cast: free — once per turn as a bonus action"
          >
            FREE
          </CostInfoButton>
        ) : null}
      </div>

      {/* Art — Full-Art fills the entire card footprint edge-to-edge behind
          every other layer (absolutely positioned, out of flow, so the
          header/stat-line/text box that follow simply overlay it in normal
          flow). Every other rarity keeps the classic fixed 4:3 boxed art so
          the full uploaded image always shows, never cropped. */}
      <div
        className={cn(
          'relative overflow-hidden',
          fullArt
            ? 'absolute inset-0 z-0 rounded-none border-0'
            : cn(
                'w-full aspect-[4/3] shrink-0 mx-1.5 mt-1 rounded-[2px]',
                cfg.artBorder,
                'border-[var(--c-ink)]',
              ),
        )}
        style={!fullArt && cfg.artRing ? { boxShadow: `inset 0 0 0 2px ${rarityHex}` } : undefined}
      >
        <CardArt def={def} cover={fullArt} />
        <div
          className="absolute inset-0 pointer-events-none"
          style={
            fullArt
              ? {
                  // A single continuous scrim carries all the contrast work
                  // now that the header/type-line/text-box no longer paint
                  // their own boxed backgrounds — dark enough at the very
                  // top for the name and at the bottom ~45% for stats/
                  // keywords/rules/flavor to always read regardless of the
                  // art's own brightness, clear through the middle so the
                  // art still reads as the whole card. The radial pass adds
                  // a soft edge/corner vignette so any art unifies with the
                  // frame instead of looking like a cropped rectangle.
                  background: [
                    'radial-gradient(120% 90% at 50% 42%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)',
                    'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.08) 16%, rgba(0,0,0,0.02) 38%, rgba(0,0,0,0.15) 52%, rgba(0,0,0,0.62) 66%, rgba(0,0,0,0.96) 100%)',
                  ].join(', '),
                }
              : { boxShadow: 'inset 0 -18px 22px -14px rgba(0,0,0,0.55)' }
          }
        />
        {/* Full-Art's art box IS the whole card (absolute inset-0), so this
            chip's usual top-right corner is the same corner the header's
            cost badge occupies in normal flow — showing both collided the
            two together. The Full-Art treatment already reads as its own
            rarity at a glance, so skip the redundant chip there instead. */}
        {def.rarity && !fullArt && (
          <span
            className={cn(
              'absolute top-1 right-1 font-black rounded-full leading-tight',
              cfg.rarityChip,
              rarityChip(def.rarity),
            )}
          >
            {def.rarity}
          </span>
        )}
        {badge && (
          <span
            className={cn(
              'absolute top-1 left-1 bg-[var(--c-red)] text-white font-black px-1 rounded-full',
              cfg.artBadge,
            )}
          >
            {badge}
          </span>
        )}
        {isFoil && (
          <span
            className={cn(
              'absolute top-1 left-1 bg-gradient-to-r from-[var(--c-yellow)] via-[#E879F9] to-[var(--c-yellow)] text-[var(--c-ink)] font-black rounded-full',
              cfg.foilBadge,
            )}
          >
            ✦ FOIL
          </span>
        )}
        {serial && (
          <span
            className={cn(
              'serial-plate absolute top-1 left-1 font-black rounded-full tracking-wide',
              cfg.foilBadge,
            )}
            title={`Serialized print — #${serial.number} of ${serial.cap} ever made`}
          >
            #{serial.number}/{serial.cap}
          </span>
        )}
        {(foilCount || 0) > 0 && (
          <span className="absolute bottom-1 right-1 bg-[var(--c-yellow)] text-[var(--c-ink)] text-[8px] font-black px-1 rounded-full">
            ✦ {foilCount}
          </span>
        )}
        {count !== undefined && count > 0 && (
          <span className="absolute bottom-1 left-1 bg-[var(--c-ink)] text-[var(--c-yellow)] text-[8px] font-black px-1 rounded-full">
            ×{count}
          </span>
        )}
      </div>

      {/* Full-Art pins the type-line + text-box group to the bottom edge as
          one block (via this wrapper) instead of letting it sit directly
          under the header like every other rarity — that leaves a real
          clear window of art in the middle of the card instead of the art
          only ever peeking through above/below two stacked text panels.
          `display: contents` makes the wrapper invisible to layout for
          every other rarity, so their structure/behavior is unchanged. */}
      <div className={fullArt ? 'flex flex-col flex-1 min-h-0 justify-end' : 'contents'}>
        {/* Type / rarity / stat line — sits on the same continuous bottom
          scrim as the text box below it now (no boxed pill of its own),
          reading as one unbroken panel over the art instead of a stack of
          separate floating chips. */}
        <div
          className={cn(
            'relative z-10 flex items-center justify-between shrink-0',
            cfg.typeLine,
            'px-1.5',
          )}
        >
          <span
            className={cn(
              'font-bold uppercase truncate',
              fullArt ? 'text-white/85' : 'text-[var(--c-steel)]',
            )}
            style={fullArt ? { textShadow: '0 1px 2px rgba(0,0,0,0.9)' } : undefined}
          >
            {def.type}
            {cfg.showSetSuffix && def.set ? ` · ${def.set}` : ''}
          </span>
          {def.type === 'Unit' &&
            (live ? (
              // Live battlefield stats in the same StatChip slots the printed
              // values use: green = buffed above printed, red = below printed /
              // damaged, printed value struck through inside the chip.
              <span
                className="flex items-center gap-1 shrink-0"
                title={`Printed ${def.atk}/${def.hp}`}
              >
                <StatChip
                  icon={Swords}
                  value={live.atk}
                  printed={def.atk}
                  tier={size}
                  tint={live.atk > (def.atk ?? 0) ? '#16A34A' : 'var(--c-red)'}
                  emboss={mythic}
                />
                <StatChip
                  icon={Heart}
                  value={live.hp}
                  maxValue={live.maxHp !== live.hp ? live.maxHp : undefined}
                  printed={live.maxHp !== (def.hp ?? 0) ? (def.hp ?? 0) : undefined}
                  tier={size}
                  tint={
                    live.hp < live.maxHp
                      ? 'var(--c-red)'
                      : live.maxHp > (def.hp ?? 0)
                        ? '#16A34A'
                        : '#22C55E'
                  }
                  emboss={mythic}
                />
              </span>
            ) : (
              <span className="flex items-center gap-1 shrink-0">
                <StatChip icon={Swords} value={def.atk} tier={size} tint="var(--c-red)" emboss={mythic} />
                <StatChip icon={Heart} value={def.hp} tier={size} tint="#22C55E" emboss={mythic} />
              </span>
            ))}
          {def.type === 'Leader' && (
            <span className="shrink-0">
              <StatChip
                icon={Heart}
                value={def.hp}
                maxValue={maxHp}
                tier={size}
                tint={
                  maxHp !== undefined && def.hp !== undefined && def.hp * 2 <= maxHp
                    ? 'var(--c-red)'
                    : '#22C55E'
                }
                emboss={mythic}
              />
            </span>
          )}
        </div>

        {/* Text box — keywords/rules/flavor sit on a subtly shaded, bordered
          panel (a real "text box" like a printed card) instead of floating
          directly on the paper background. flex-1 so it fills the remaining
          height and pushes the footer to the bottom. Full-Art drops the
          boxed panel — no border, no background of its own, no side margin
          — so it reads as the same unbroken bottom scrim as the type line
          above it rather than a separate floating glass rectangle; the
          vignette overlay behind the art is what actually darkens this
          whole region, with a per-line text-shadow as a legibility backstop
          for whatever the art itself looks like underneath. */}
        <div
          className={cn(
            'relative z-10 flex flex-col',
            fullArt ? 'shrink-0' : 'flex-1 min-h-0',
            cfg.textBoxPad,
            fullArt
              ? 'text-white'
              : cn(
                  'mx-1.5 mt-1 mb-1 rounded-[3px] border',
                  mythic ? 'border-[#7A1420]/40' : 'border-[var(--c-ink)]/15',
                ),
          )}
          style={
            fullArt
              ? undefined
              : {
                  backgroundColor: mythic
                    ? 'color-mix(in srgb, #7A1420 8%, var(--c-paper))'
                    : // Near-paper panel with a whisper of the card's color —
                      // keeps chip/flavor contrast solid over the (now much
                      // stronger) color-identity body wash.
                      `color-mix(in srgb, ${colorFillHex} 8%, var(--c-paper))`,
                }
          }
        >
          {totalChips > 0 && cfg.keywordMax > 0 && (
            <div
              className={cn(
                'shrink-0 flex flex-row flex-wrap gap-1 min-h-[9px] overflow-hidden',
                // Belt-and-suspenders alongside the keywordMax chip cap above:
                // even a capped chip count can wrap into more rows than a
                // small card face has room for (long labels, narrow tiers) —
                // a hard max-height + clip is a graceful cutoff instead of
                // the row pushing flavor text/the footer down and off the
                // card, which is what happened before this cap existed.
                size === 'full'
                  ? 'max-h-[42px]'
                  : size === 'standard'
                    ? 'max-h-[30px]'
                    : size === 'compact'
                      ? 'max-h-[20px]'
                      : 'max-h-[11px]',
              )}
            >
              {keywordChips.slice(0, cfg.keywordMax).map((k) => (
                <KeywordChip
                  key={k.kw}
                  kw={k.kw}
                  label={k.label}
                  text={k.description}
                  cost={cfg.chipCosts ? keywordActivation(def, k.kw) : undefined}
                  small={cfg.keywordSmall}
                  autoIntroduce={introduceKeywords}
                  accent={k.atCap ? '#B45309' : undefined}
                />
              ))}
              {mechChips
                .slice(0, Math.max(0, cfg.keywordMax - keywordChips.length))
                .map((m, i) => (
                  <KeywordChip
                    key={`${m.kind}-${i}`}
                    kw={m.label}
                    text={mechanicExplain(def, m)}
                    small={cfg.keywordSmall}
                    accent={MECHANIC_ACCENT[m.kind]}
                  />
                ))}
              {hiddenChips > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border border-[var(--c-ink)]/30 font-bold opacity-70',
                    cfg.keywordSmall ? 'text-[6.5px] px-1' : 'text-[8.5px] px-1.5',
                  )}
                  title="More abilities — expand the card to see everything"
                >
                  +{hiddenChips}
                </span>
              )}
            </div>
          )}

          {cfg.showFlavor && def.flavor && (
            <div
              className={cn(
                'mt-1 pt-1 border-t min-h-0 overflow-hidden',
                fullArt ? 'border-white/20' : 'border-[var(--c-ink)]/15',
              )}
            >
              <p
                className={cn('leading-snug break-words line-clamp-4', set.className)}
                style={{
                  fontSize: flavorFontPx,
                  textShadow: fullArt ? '0 1px 2px rgba(0,0,0,0.9)' : undefined,
                }}
              >
                {def.flavor}
              </p>
            </div>
          )}

          {!fullArt && <div className="flex-1" />}
        </div>
      </div>

      {/* Footer: set/print bar + color-identity pips + optional slot content
          (e.g. deck-count badge). v4.13: color pips sit right above the set
          bar — same footer row real estate, no header-layout risk (the
          header's fitFontSize math is already tightly packed). Multicolor
          cards show one pip per color, in COLORS order. */}
      {/* v4.22: was a solid pip circle stamped with an MTG-style shorthand
          letter (R/U/G/K/P/S/C) that read as a "random unrelated letter" —
          the abbreviation scheme doesn't map to the color names players
          actually see (COLOR_HEX/COLOR_LETTER), so a card's color pip and
          its printed color could look disconnected at a glance. Swapped for
          a plain swatch dot (no glyph) — the pip's own fill IS the color, no
          decoding required — with a slightly heavier ink ring so it reads
          clearly against the "Monochrome & Pop" ink-border language used
          everywhere else on the face. The full color name(s) are still one
          hover/long-press away via `title`. */}
      {cardColorsForFace.length > 0 && !fullArt && (
        <div
          className="relative z-10 flex justify-center gap-1 shrink-0 bg-[var(--c-paper)]/70 py-[2px]"
          title={`Color: ${cardColorsForFace.join('/')}`}
        >
          {cardColorsForFace.map((c) => (
            <span
              key={c}
              aria-hidden
              className="w-2.5 h-2.5 rounded-full border-[1.5px] border-[var(--c-ink)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)]"
              style={{ backgroundColor: COLOR_PIP[c].bg }}
            />
          ))}
        </div>
      )}
      {def.set && !fullArt && (
        <div className={cn('relative z-10 h-[3px] w-full shrink-0', set.bar)} title={def.set} />
      )}
      {/* Full-Art: the footer's color pips + set bar used to render in the
          normal flex flow like every other rarity — an opaque bg-paper strip
          that cut across the bottom of the art instead of letting it run
          edge-to-edge. Rendered as a floating overlay instead: no background
          band, just the swatch dots with a drop-shadow for legibility over
          whatever the art looks like underneath. */}
      {fullArt && cardColorsForFace.length > 0 && (
        <div
          className="absolute z-20 bottom-1.5 right-1.5 flex gap-1"
          title={`Color: ${cardColorsForFace.join('/')}`}
        >
          {cardColorsForFace.map((c) => (
            <span
              key={c}
              aria-hidden
              className="w-2.5 h-2.5 rounded-full border-[1.5px] border-white/80"
              style={{
                backgroundColor: COLOR_PIP[c].bg,
                boxShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,0,0,0.35)',
              }}
            />
          ))}
        </div>
      )}
      {footer}

      {serial && !dimmed && (
        <div className="serialized-sheen absolute inset-0 pointer-events-none" />
      )}
      {isFoil && foilEffect && (
        <div className="foil-shimmer absolute inset-0 pointer-events-none opacity-60" />
      )}
      {!isFoil && !serial && animatedFx && !dimmed && (
        <div
          className={cn(
            'rarity-sheen absolute inset-0 pointer-events-none',
            mythic ? 'opacity-80' : ultra ? 'opacity-70' : 'opacity-50',
          )}
          // Ultra-Rare: the moving sheen stays on the border ring only, so
          // the animation never sweeps across (and fights) the card text.
          style={ultra ? edgeRingMaskStyle(size) : undefined}
        />
      )}
      {/* v4.6 Ultra-Rare "Gilded Relic": twinkling gold-dust layer + engraved
          gold corner brackets, over the animated gold-leaf name banner. */}
      {ultra && !dimmed && (
        <>
          <div
            aria-hidden
            className="ultra-sparkle pointer-events-none"
            // Confined to the border ring — the gold-dust twinkle used to
            // sit over the whole face, including the text box. Also hugs the
            // card's true outer edge now (see edgeRingMaskStyle) instead of
            // sitting inset by the frame's own border width.
            style={edgeRingMaskStyle(size)}
          />
          {/* v4.8 "Aurora Vault" (full tier only): chromatic cut-corner
              lattice with two counter-rotating light-traces, plus a hover/
              inspector-gated aurora ribbon sweep. Smaller tiers keep just
              the sparkle + frame — hairline SVG line-work turns to mud
              below ~140px wide, and grids of small cards shouldn't pay for
              the extra layers. */}
          {size === 'full' ? (
            <>
              <UltraFiligree size={size} />
              <div
                aria-hidden
                className="ur-aurora absolute z-10"
                style={{ top: -OUTER_BORDER_PX[size], right: -OUTER_BORDER_PX[size], bottom: -OUTER_BORDER_PX[size], left: -OUTER_BORDER_PX[size] }}
              />
            </>
          ) : (
            <div
              aria-hidden
              className="absolute pointer-events-none z-20"
              style={{ top: -OUTER_BORDER_PX[size], right: -OUTER_BORDER_PX[size], bottom: -OUTER_BORDER_PX[size], left: -OUTER_BORDER_PX[size] }}
            >
              <span className="absolute top-0.5 left-0.5 w-3 h-3 border-t-2 border-l-2 border-[#d4af37] rounded-tl-[3px]" />
              <span className="absolute top-0.5 right-0.5 w-3 h-3 border-t-2 border-r-2 border-[#d4af37] rounded-tr-[3px]" />
              <span className="absolute bottom-0.5 left-0.5 w-3 h-3 border-b-2 border-l-2 border-[#d4af37] rounded-bl-[3px]" />
              <span className="absolute bottom-0.5 right-0.5 w-3 h-3 border-b-2 border-r-2 border-[#d4af37] rounded-br-[3px]" />
            </div>
          )}
        </>
      )}
      {/* v4.6 Mythic "Living Inferno": embers rising off the card face, on
          top of the animated red/gold banner and pulsing two-tone frame. */}
      {mythic && !dimmed && (
        <>
          <div aria-hidden className="mythic-embers absolute inset-0 pointer-events-none" />
          {/* v4.8 "Void Eclipse" (full tier only): slow-rotating nebula
              border frame (masked to the edge so art/text stay clear), a
              pulsing eclipse-corona sigil + beveled corner shards, a
              drifting parallax starfield, and a hover/inspector-gated
              violet/crimson corona bloom. Embossed amethyst stat gems
              (see StatChip's `emboss`) apply at every tier. */}
          {size === 'full' && (
            <>
              <div aria-hidden className={cn('my-void absolute inset-0 z-20', cfg.rounded)} />
              <MythicCrest />
              <div aria-hidden className="my-stars absolute inset-0 z-10" />
              <div aria-hidden className="my-corona absolute inset-0 z-10" />
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Universal expanded/zoomed card view — same CardFace used everywhere else,
 * just large and centered in a modal. Pass `actions` for context-specific
 * controls (e.g. quicksell buttons in the Collection).
 */
export function CardInspectorModal({
  def,
  foil,
  onClose,
  actions,
}: {
  def: CardDef;
  foil?: boolean;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  // Every other modal in the app (Card3DInspector, PlayerProfileModal, …)
  // closes on Escape — this one didn't, a real keyboard-accessibility gap
  // for a role="dialog" element.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--c-ink)]/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <CardFace def={def} size="full" foil={foil} />
        {actions}
        <button
          onClick={onClose}
          className="btn-pop heading-font text-xs bg-[var(--c-ink)] text-[var(--c-yellow)] px-4 py-2 ink-border-sm shadow-hard-black-xs"
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
