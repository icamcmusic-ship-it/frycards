/**
 * Shared v5.0 card-face rendering — the ONE card template used everywhere
 * (match UI, deck builder, collection, store/pack reveals) so a card looks
 * and reads identically no matter where it's shown. Real trading-card
 * proportions: 2.5" × 3.5" (5:7).
 *
 * Essence-engine conversion: the dice-era Cast Slot cost UI (threshold die,
 * exact/sum kinds, combo-pattern gates) is replaced by an ESSENCE COST row
 * of colored pips + a generic numeral; ATK/HP gems are now Might/Grit;
 * the type line prints "Type — Subtype"; Leaders show Resolve and their
 * two Resolve abilities; keyword chips come from the new binary keyword
 * set (KEYWORD_TEXT). Card dimensions, the regular-art frame, the
 * Full-Art treatment, and the rarity/foil/serialized systems are unchanged.
 *
 * v6.0 MTG-format layout pass: information lives where a Magic card puts it —
 * name + cost on the top line, art, a type line whose right slot carries the
 * rarity marker (set-symbol position), a text box (keywords → rules →
 * flavor), and a Might/Grit stat plate anchored to the BOTTOM-RIGHT corner
 * (Resolve there for Leaders, like planeswalker loyalty). The old footer
 * color-dot band is gone — color identity is already printed in the cost
 * pips — which reclaims vertical space for the text box so rules stop
 * running off the card. Art ratios are untouched (regular 4:3 box,
 * Full-Art full-bleed).
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Swords, Shield, Crown, MapPin, Wand2, Zap } from 'lucide-react';
import { CardDef, CardType, Effect, EssenceCost, totalCost } from '../game/v3/cards';
import { cn } from '../lib/utils';
import {
  rarityBorder,
  rarityGlow,
  rarityAnimated,
  rarityAbbr,
  rarityBleeds,
  raritySuperPlus,
  rarityUltraPlus,
  rarityRuleWeight,
  isMythic,
  isAltArt,
  RARITY_HEX,
} from '../meta/rarity';
import { cardColors, COLORS, Color } from '../game/v3/colors';
import { KEYWORD_TEXT } from '../game/v3/keywords';
import { COLOR_PIP, GENERIC_PIP, COLOR_LETTER, colorBg } from '../meta/colors';
import { EssenceIcon } from './EssenceIcon';

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
/* Embossed stat gem — Mythic-exclusive faceted look for Might/Grit chips,
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

/* ---- Alt-Art "Prism Ink" (v7.0) ----
   A hand-picked alternate printing's premium template: the always-on
   .aa-holo hue-shifting wash (index.css) plus a hover-gated iridescent
   bloom, matching the Aurora Vault / Void Eclipse hover-reveal pattern.
   Kept visually distinct from Ultra-Rare (teal/violet aurora) and Mythic
   (cosmic void) by leaning into pink/fuchsia. */
@keyframes aa-corona-kf {
  0%, 100% { opacity: 0; transform: scale(0.98); }
  50% { opacity: 1; transform: scale(1.02); }
}
.aa-corona {
  opacity: 0;
  transition: opacity 400ms ease;
  background:
    radial-gradient(45% 30% at 50% 10%, rgba(236, 72, 153, 0.55) 0%, transparent 70%),
    radial-gradient(60% 35% at 50% 96%, rgba(139, 92, 246, 0.45) 0%, transparent 72%);
  mix-blend-mode: screen;
  pointer-events: none;
}
.premium-card:hover .aa-corona,
.premium-boost .aa-corona { opacity: 1; animation: aa-corona-kf 3.6s ease-in-out infinite; }
/* Embossed stat gem — Alt-Art's faceted look for Might/Grit chips. */
.aa-gem {
  background-image: linear-gradient(160deg, rgba(255,255,255,0.4) 0%, rgba(236,72,153,0.15) 45%, rgba(20,6,20,0.35) 100%) !important;
  box-shadow:
    inset 0 1px 1px rgba(236, 72, 153, 0.7),
    inset 0 -1px 2px rgba(60, 10, 50, 0.6),
    0 1px 2px rgba(0, 0, 0, 0.4);
  border-color: #ec4899 !important;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

/* ---- v6.8 "Gold Foil" template set ----
   The shared print language every rarity now uses: an ink masthead, a boxed
   4:3 art window, a rarity rule whose weight IS the ladder, and a dashed
   flavor divider. Super-Rare and up animate inside the art window; Ultra-Rare
   adds a diagonal ribbon; Full-Art and Mythic drop the frame for full-bleed
   art (Mythic's is a looping video). Foil prints swap every animated layer
   for a STATIC prismatic foil stamp. */
@keyframes fc-foil-diag {
  0% { transform: translateX(-130%) skewX(-18deg); }
  55%, 100% { transform: translateX(230%) skewX(-18deg); }
}
@keyframes fc-ghost {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(1.2px, 0.8px); }
}
@keyframes fc-spark {
  0% { background-position: 0 110%, 40% 130%; opacity: 0.35; }
  50% { opacity: 0.85; }
  100% { background-position: 0 -20%, 40% -50%; opacity: 0.35; }
}
@keyframes fc-scan {
  0% { background-position: 0 0; }
  100% { background-position: 0 40px; }
}
.fc-art-ghost {
  mix-blend-mode: multiply;
  opacity: 0.25;
  animation: fc-ghost 3.2s ease-in-out infinite;
  pointer-events: none;
}
.fc-art-sweep {
  position: absolute;
  top: -20%;
  bottom: -20%;
  left: 0;
  width: 45%;
  background: linear-gradient(100deg, transparent 0%, rgba(255, 224, 150, 0.6) 45%,
    rgba(255, 240, 200, 0.85) 50%, rgba(255, 224, 150, 0.6) 55%, transparent 100%);
  mix-blend-mode: overlay;
  animation: fc-foil-diag 3.6s ease-in-out infinite;
  pointer-events: none;
}
.fc-ribbon {
  background: linear-gradient(110deg, #8a6d1f, #ffe9a3, #d4af37);
  color: #3b2a06;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}
/* Mythic full-bleed extras: drifting scanlines behind a failed/absent video,
   rising embers over it, and a glowing gold inner frame. */
.fc-my-scan {
  background: repeating-linear-gradient(60deg, #241008, #241008 10px, #150a05 10px, #150a05 20px);
  animation: fc-scan 3s linear infinite;
  pointer-events: none;
}
.fc-my-spark {
  background-image:
    radial-gradient(circle 1.5px at 20% 85%, rgba(255, 179, 0, 0.9) 40%, transparent 65%),
    radial-gradient(circle 2px at 70% 55%, rgba(225, 29, 46, 0.8) 40%, transparent 65%);
  background-size: 100% 55%, 100% 70%;
  background-repeat: repeat-y;
  animation: fc-spark 4.5s linear infinite;
  mix-blend-mode: screen;
  pointer-events: none;
}
.fc-my-frame {
  border: 2px solid #d4af37;
  box-shadow: 0 0 12px 2px rgba(212, 175, 55, 0.6);
  pointer-events: none;
}
/* Static prismatic foil stamp — no motion anywhere, deliberately distinct
   from the animated sweep the non-foil premium rarities use. */
.fc-foil-band {
  background: linear-gradient(135deg, #ffb6ea, #ffe29a, #a8f0d1, #9ec9ff, #c9a8ff, #ffb6ea);
  color: #1a1a1a;
}
.fc-foil-body {
  background: linear-gradient(135deg, #ffe6f7, #fff3c9, #d9f7e8, #d7ecff, #ecdcff, #ffe6f7);
}
.fc-foil-wash {
  background: linear-gradient(135deg, rgba(255, 182, 234, 0.3), rgba(255, 226, 154, 0.25),
    rgba(168, 240, 209, 0.25), rgba(158, 201, 255, 0.3));
  mix-blend-mode: overlay;
  pointer-events: none;
}
.fc-foil-ring {
  padding: 3px;
  background: linear-gradient(135deg, #ffb6ea, #ffe29a, #a8f0d1, #9ec9ff, #c9a8ff);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .fc-art-ghost,
  .fc-art-sweep,
  .fc-my-scan,
  .fc-my-spark { animation: none; }
  .ur-filigree .ur-trace,
  .ur-filigree .ur-trace2,
  .ur-aurora,
  .my-void,
  .my-crest,
  .my-stars,
  .my-corona,
  .aa-corona { animation: none; }
  .premium-card:hover .ur-aurora,
  .premium-boost .ur-aurora,
  .premium-card:hover .my-corona,
  .premium-boost .my-corona,
  .premium-card:hover .aa-corona,
  .premium-boost .aa-corona { opacity: 0.25; }
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
      <circle
        cx="50"
        cy="2.4"
        r="3.4"
        fill="none"
        stroke="#7b2ff7"
        strokeWidth="0.35"
        opacity="0.8"
      />
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
 * lives in index.css (ultra-sparkle, rarity-sheen). */
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
  Item: Wand2,
  Event: Zap,
};

/** v5.0 glossary backing every clickable term on a card face: the full
 * Fry Cards keyword set (KEYWORD_TEXT) plus the subtype/frame terms a card
 * can print (Quick, Slow, Charm, Weapon, Tool, Sanctum, Re-bond, Resolve, …). */
export const KEYWORD_GLOSSARY: Record<string, string> = {
  ...KEYWORD_TEXT,
  Quick:
    'Quick Event — may be invoked in any priority window, including during the opponent’s turn or a Clash.',
  Slow: 'Slow Event — may only be invoked during your own main phase.',
  Charm:
    'Charm Item — bonds to a unit and is shattered along with it. It may also be cast on a player instead, restoring Vitality equal to its bond and going straight to the Ash-pile.',
  Weapon:
    'Weapon Item — buffs a friendly unit and survives it; pay its Re-bond cost to bond it to another unit.',
  Tool: 'Tool Item — a Weapon that also weakens a target enemy unit as it bonds.',
  Sanctum: 'Sanctum Location — exhaust it for 1 essence of its type; it also carries an ability.',
  Wellspring:
    'Basic Location — exhausts for 1 essence of its type. Supplied automatically; takes no deck slots.',
  Resolve:
    'A Leader’s loyalty. Leader abilities spend or build Resolve; at 0 Resolve the Leader is shattered.',
  Essence:
    'Mana — produced by exhausting Locations. Colored pips must be paid with matching essence; generic with anything.',
  Shatter: 'Destroy — the card goes to the Ash-pile.',
  Banish: 'Remove from the game — the card goes to The Void.',
  Erode: 'Mill — cards from the top of a deck go to the Ash-pile.',
  Vitality: 'Your life total. Start at 20; at 0 you lose.',
};

/** Plain-English phrase for who/what an effect hits. */
function targetPhrase(target: Effect['target']): string {
  switch (target) {
    case 'enemyUnit':
      return 'a target enemy unit';
    case 'friendlyUnit':
      return 'a target friendly unit';
    case 'anyTarget':
      return 'any target';
    case 'enemyPlayer':
      return 'the enemy player';
    case 'friendlyPlayer':
      return 'you';
    case 'friendlyAny':
      return 'you or a friendly unit';
    case 'allEnemyUnits':
      return 'ALL enemy units';
    case 'allFriendlyUnits':
      return 'ALL friendly units';
    case 'self':
      return 'this card';
    case 'none':
      return '';
  }
}

/** One-line rules sentence for an Effect, in Fry Cards terms. */
export function describeEffect(eff: Effect): string {
  const v = eff.value ?? '';
  // Only fall back to 1 when no value was printed at all — `value: 0` is a
  // legitimate (if unusual) effect value and must render as 0, not 1.
  const vOr1 = eff.value === undefined ? 1 : eff.value;
  switch (eff.action) {
    case 'damage':
      return `Deal ${v} damage to ${targetPhrase(eff.target)}`;
    case 'heal':
      return eff.target === 'friendlyPlayer' || eff.target === 'none'
        ? `Gain ${v} Vitality`
        : `Heal ${v} from ${targetPhrase(eff.target)}`;
    case 'draw':
      return `Deal ${vOr1} card${vOr1 === 1 ? '' : 's'} (draw)`;
    case 'buff': {
      const isAll = eff.target === 'allFriendlyUnits';
      const subject =
        eff.target === 'self'
          ? 'This card'
          : isAll
            ? 'ALL friendly units'
            : 'a target friendly unit';
      return `${subject} ${isAll ? 'get' : 'gets'} +${v}/+${v}`;
    }
    case 'shatter':
      return `Shatter ${targetPhrase(eff.target)}`;
    case 'banish':
      return `Banish ${targetPhrase(eff.target)}`;
    case 'erode':
      return `Erode ${vOr1} (mill the enemy deck)`;
    case 'recover':
      return `Recover ${targetPhrase(eff.target) || 'a friendly permanent'}`;
    // v7.5: `exhaust` and `weaken` shipped with the v6.9 keyword generation
    // and were never added here. The switch has no default and this function
    // is typed to return a string, so every card printing one of them fell
    // off the end and rendered the literal text "Undefined." in its rules box
    // — including Full-Art pulls, and every Leader kit that reads its text
    // through this path.
    case 'exhaust':
      return eff.target === 'allEnemyUnits'
        ? 'Exhaust each enemy unit'
        : `Exhaust ${targetPhrase(eff.target)}`;
    case 'weaken':
      return eff.target === 'allEnemyUnits'
        ? `ALL enemy units get -${v}/-${v}`
        : `${cap1(targetPhrase(eff.target))} gets -${v}/-${v}`;
    default: {
      // Exhaustiveness guard: a new EffectAction now fails the build here
      // rather than printing "Undefined." on a card.
      const never: never = eff.action;
      return never;
    }
  }
}

const TRIGGER_PHRASE: Record<NonNullable<CardDef['triggers']>[number]['when'], string> = {
  enters: 'When this enters the field',
  dies: 'When this dies',
  dealsClashDamage: 'Whenever this deals clash damage',
  atDawn: 'At Dawn',
  atDusk: 'At Dusk',
};

/** Every rules line this card prints — trigger phrase + what it does. */
export function cardRuleLines(def: CardDef): string[] {
  const bits: string[] = [];
  if (def.onInvoke) {
    bits.push(
      def.type === 'Unit'
        ? `When this enters the field: ${describeEffect(def.onInvoke)}`
        : `On invoke: ${describeEffect(def.onInvoke)}`,
    );
  }
  for (const t of def.triggers ?? []) {
    bits.push(`${TRIGGER_PHRASE[t.when]}: ${describeEffect(t.effect)}`);
  }
  if (def.produces) bits.push(`Exhaust: add one ${def.produces} essence`);
  if (def.locPassive)
    bits.push(
      def.locPassive === 'MIGHT_ALL' ? 'Your units get +1 Might' : 'Your units get +1 Grit',
    );
  if (def.bond) {
    const stats = `+${def.bond.might ?? 0}/+${def.bond.grit ?? 0}`;
    const grants = def.bond.grants?.length ? ` and ${def.bond.grants.join(', ')}` : '';
    bits.push(`Bonded unit gets ${stats}${grants}`);
  }
  if (def.rebondCost !== undefined) bits.push(`Re-bond ${def.rebondCost}`);
  for (const ab of def.leaderAbilities ?? []) {
    bits.push(
      ab.text ??
        `${ab.resolveDelta > 0 ? '+' : ''}${ab.resolveDelta}: ${describeEffect(ab.effect)}`,
    );
  }
  return bits;
}

/** Flat rules text — used for tooltips/inline text that just want one string. */
export function cardRules(def: CardDef): string {
  return cardRuleLines(def).join(' · ');
}

/** Plain-English summary of an Essence Cost, for the cost row's popover. */
export function costSummary(def: CardDef): string | null {
  if (!def.cost) return null;
  const parts: string[] = [];
  for (const c of COLORS) {
    const n = def.cost.pips[c] ?? 0;
    if (n > 0) parts.push(`${n} ${c}`);
  }
  if (def.cost.generic > 0 || parts.length === 0) parts.push(`${def.cost.generic} generic`);
  return `Essence Cost: ${parts.join(' + ')} (total ${totalCost(def.cost)})`;
}

/** A Serialized print's total run (`serial.cap`) is NaN when the supply
 * table failed to load (see fetchMySerializedCards) — render that as "?"
 * rather than a literal "NaN", which would look like a rendering bug. */
function capText(cap: number): string | number {
  return Number.isNaN(cap) ? '?' : cap;
}

/** Scales a font size down as text grows past a soft length target, so long
 * names/flavor text shrink to fit instead of getting clipped or truncated.
 * Never shrinks below `min`. */
function fitFontSize(text: string, base: number, min: number, softLimit: number): number {
  if (!text || text.length <= softLimit) return base;
  const scaled = base * (softLimit / text.length);
  return Math.max(min, Math.round(scaled * 10) / 10);
}

/** Per-tier pip diameter/font for the essence-cost row. */
const PIP_SIZE: Record<CardSize, { d: number; f: number }> = {
  micro: { d: 10, f: 6 },
  compact: { d: 13, f: 7.5 },
  standard: { d: 16, f: 9 },
  full: { d: 20, f: 11 },
};

/**
 * v5.0 ESSENCE COST row — one colored pip circle per colored pip in the
 * cost (COLOR_PIP swatch + COLOR_LETTER glyph), plus a neutral numeral pip
 * for the generic portion when generic > 0. A card whose cost is entirely
 * empty (colorless, generic 0) still prints a "0" generic pip for
 * non-Leader cards so "free" reads as a printed cost, not a missing one.
 * Lives where the dice-era Cast Slot badge used to sit (header, right of
 * the name).
 */
export function EssenceCostRow({
  cost,
  type,
  size,
  onArt,
}: {
  cost?: EssenceCost;
  type: CardType;
  size: CardSize;
  /** Sitting directly over artwork (Full-Art header, micro board token) —
   * adds a drop shadow + white ring so pips read over any art. */
  onArt?: boolean;
}) {
  const { d, f } = PIP_SIZE[size];
  const pips: {
    key: string;
    bg: string;
    fg: string;
    glyph: string;
    title: string;
    color?: Color;
  }[] = [];
  for (const c of COLORS) {
    const n = cost?.pips[c] ?? 0;
    for (let i = 0; i < n; i++) {
      pips.push({
        key: `${c}${i}`,
        bg: COLOR_PIP[c].bg,
        fg: COLOR_PIP[c].fg,
        glyph: COLOR_LETTER[c],
        title: `${c} essence`,
        color: c,
      });
    }
  }
  const generic = cost?.generic ?? 0;
  if (generic > 0 || (pips.length === 0 && type !== 'Leader')) {
    pips.push({
      key: 'generic',
      bg: GENERIC_PIP.bg,
      fg: GENERIC_PIP.fg,
      glyph: String(generic),
      title: `${generic} generic essence`,
    });
  }
  if (pips.length === 0) return null;
  return (
    // NOTE: no percentage max-width here — this row often sits inside a
    // shrink-to-fit <button> (CostInfoButton), where `max-w-[55%]` resolves
    // against the button's own content width and collapses the row into a
    // one-pip-per-line vertical stack.
    <span
      className="flex items-center gap-[2px] shrink-0 flex-wrap justify-end max-w-full"
      aria-label={`Essence cost: ${pips.map((p) => p.title).join(', ')}`}
    >
      {pips.map((p) => (
        <span
          key={p.key}
          title={p.title}
          className={cn(
            'flex items-center justify-center rounded-full font-mono font-black leading-none shrink-0',
            onArt ? 'border border-white/80' : 'border border-[var(--c-ink)]',
          )}
          style={{
            width: d,
            height: d,
            fontSize: f,
            backgroundColor: p.bg,
            color: p.fg,
            boxShadow: onArt
              ? '0 1px 3px rgba(0,0,0,0.8)'
              : 'inset 0 1px 1px rgba(255,255,255,0.55)',
          }}
        >
          {p.color ? (
            <EssenceIcon type={p.color} color={p.fg} size={Math.round(d * 0.62)} />
          ) : (
            p.glyph
          )}
        </span>
      ))}
    </span>
  );
}

/** A small tinted, icon-led stat gem (Might/Grit/Resolve) — a proper badge
 * so the stat line reads as UI, not a caption. */
function StatChip({
  icon: Icon,
  label,
  value,
  maxValue,
  printed,
  tier,
  tint,
  emboss,
  onArt,
}: {
  icon: React.ComponentType<{ className?: string }>;
  /** Accessible/hover name of the stat ("Might" / "Grit" / "Resolve"). */
  label: string;
  value?: number;
  maxValue?: number;
  /** Live-match stats: the printed value this live value has drifted from
   * (buff/nerf), rendered struck through inside the chip itself. */
  printed?: number;
  tier: CardSize;
  tint: string;
  /** v4.7 embossed faceted "stat gem" treatment — Mythic's amethyst facet or
   * (v7.0) Alt-Art's pink/fuchsia facet. */
  emboss?: 'mythic' | 'altArt' | false;
  /** Chip sits directly over artwork (Full-Art bottom panel, micro board
   * cards) — solid dark backing + text shadow so numbers read over ANY art. */
  onArt?: boolean;
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
      title={label}
      aria-label={`${label} ${value ?? ''}`}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full font-mono font-black border',
        emboss === 'mythic' && 'my-gem',
        emboss === 'altArt' && 'aa-gem',
        textClass,
      )}
      style={
        onArt
          ? {
              color: `color-mix(in srgb, ${tint} 72%, white)`,
              borderColor: `color-mix(in srgb, ${tint} 65%, transparent)`,
              backgroundColor: 'rgba(8, 10, 16, 0.68)',
              textShadow: '0 1px 2px rgba(0,0,0,0.9)',
            }
          : {
              color: tint,
              borderColor: `color-mix(in srgb, ${tint} 45%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${tint} 12%, transparent)`,
            }
      }
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
const POPOVER_EST_HEIGHT = 90;

/**
 * v4.3: a keyword pill that opens a small popover with its rules text on
 * click — used anywhere a keyword chip is shown so players never have to
 * guess what a keyword does. The popover renders through a portal at a
 * viewport-fixed position (clamped to stay on-screen) since every place this
 * chip is used sits inside at least one `overflow-hidden` ancestor.
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
 * never-seen keywords mount at once, this staggers their auto-introduce
 * popovers instead of firing them all on top of each other. */
let nextAutoIntroSlot = 0;
/** Keywords with an auto-introduce popover currently scheduled but not yet
 * shown. Marking a keyword "seen" is deferred until its popover actually opens
 * (a chip can unmount during the stagger delay before its slot fires, and a
 * keyword marked seen without ever showing is lost forever). This set keeps the
 * dedup the synchronous mark used to provide, so two chips for the same keyword
 * don't both introduce it; an entry is cleared when the popover fires or when
 * the chip unmounts first, letting a later mount retry the intro. */
const autoIntroInFlight = new Set<string>();

/** Shared popover behavior for any clickable keyword mention. */
function useKeywordPopover(kw: string, autoIntroduce?: boolean, textOverride?: string) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // HTMLElement, not HTMLButtonElement: since v28 an inert chip renders as a
  // <span> and still needs the popover (autoIntroduce fires from it), and the
  // hook only ever measures this node and contains-tests it.
  const btnRef = useRef<HTMLElement>(null);
  const autoCloseRef = useRef<number | null>(null);
  const autoOpenRef = useRef<number | null>(null);
  const text = textOverride ?? KEYWORD_GLOSSARY[kw];

  const clearAutoClose = () => {
    if (autoCloseRef.current !== null) {
      window.clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  };

  /** Cancels the staggered auto-introduce open, if it hasn't fired yet — a
   * player who manually opens/closes the popover before its slot comes up
   * shouldn't have it pop back open on its own afterwards. */
  const clearAutoOpen = () => {
    if (autoOpenRef.current !== null) {
      window.clearTimeout(autoOpenRef.current);
      autoOpenRef.current = null;
    }
  };

  const computePos = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - POPOVER_WIDTH / 2),
      window.innerWidth - POPOVER_WIDTH - 8,
    );
    const top =
      rect.bottom + 4 + POPOVER_EST_HEIGHT > window.innerHeight
        ? Math.max(8, rect.top - POPOVER_EST_HEIGHT - 4)
        : rect.bottom + 4;
    return { top, left };
  };

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearAutoClose();
    clearAutoOpen();
    if (pos) {
      setPos(null);
      return;
    }
    setPos(computePos());
  };

  const close = () => {
    clearAutoClose();
    clearAutoOpen();
    setPos(null);
  };

  useEffect(() => {
    if (!autoIntroduce || !text || hasSeenKeyword(kw) || autoIntroInFlight.has(kw)) return;
    autoIntroInFlight.add(kw);
    const now = Date.now();
    const showAt = Math.max(now, nextAutoIntroSlot);
    nextAutoIntroSlot = showAt + AUTO_INTRO_GAP_MS;
    autoOpenRef.current = window.setTimeout(() => {
      autoOpenRef.current = null;
      const next = computePos();
      autoIntroInFlight.delete(kw);
      if (!next) return;
      // Only mark seen once the popover actually opens — deferring it here is
      // the whole point: a chip that unmounts before this fires leaves the
      // keyword un-seen so the intro still gets its one chance later.
      markKeywordSeen(kw);
      setPos(next);
      autoCloseRef.current = window.setTimeout(() => {
        autoCloseRef.current = null;
        setPos(null);
      }, AUTO_INTRO_VISIBLE_MS);
    }, showAt - now);
    return () => {
      // Unmounted before the slot fired: release the in-flight claim (the timer
      // never marked it seen) so a future mount can reintroduce it.
      if (autoOpenRef.current !== null) autoIntroInFlight.delete(kw);
      clearAutoOpen();
      clearAutoClose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pos, btnRef, text, open, close };
}

/** Renders the popover itself (via portal) — shared by the pill chip and the
 * inline keyword link so both look/behave identically once opened. Dismissal
 * is driven by document-level listeners (not an intercepting overlay) so a
 * click on another trigger closes this popover AND still reaches that
 * trigger's own handler in the same gesture. Also closes on Escape. */
function KeywordPopover({
  kw,
  text,
  pos,
  close,
  triggerRef,
}: {
  kw: string;
  text: string;
  pos: { top: number; left: number };
  close: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef?.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('wheel', close, { passive: true });
    document.addEventListener('touchmove', close, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('wheel', close);
      document.removeEventListener('touchmove', close);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(
    <div
      ref={popoverRef}
      style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
      className="fixed z-[9999] bg-[var(--c-ink)] text-[var(--c-paper)] text-[9px] leading-snug font-bold p-2 ink-border-sm shadow-hard-black-xs text-left normal-case"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="heading-font text-[10px] text-[var(--c-yellow)] mb-1">{kw}</div>
      {text}
    </div>,
    document.body,
  );
}

/** A compact clickable keyword/mechanic pill. Tapping opens the shared
 * glossary popover with the keyword's rules text (KEYWORD_TEXT). */
export function KeywordChip({
  kw,
  label,
  text,
  small,
  autoIntroduce,
  accent,
  inert,
}: {
  key?: React.Key;
  /** Base keyword name — popover title + "seen keywords" localStorage key. */
  kw: string;
  /** Chip label (defaults to the bare keyword name). */
  label?: string;
  /** Popover text; falls back to KEYWORD_GLOSSARY when omitted. */
  text?: string;
  small?: boolean;
  /** Auto-opens this keyword's popover once per device the first time it's
   * ever seen. Only pass from live-match contexts (hand/board). */
  autoIntroduce?: boolean;
  /** Chip tint (defaults to the neutral ink-on-paper pill). */
  accent?: string;
  /** Painted, not pressed — see `chipsInteractive` on the tier table. The
   * popover hook still runs, so `autoIntroduce` is unaffected. */
  inert?: boolean;
}) {
  const { pos, btnRef, text: popText, open, close } = useKeywordPopover(kw, autoIntroduce, text);
  const pill = cn(
    'inline-flex items-center gap-0.5 max-w-full rounded-full border font-bold leading-tight text-left',
    small ? 'text-[6.5px] px-1 py-[1px]' : 'text-[8.5px] px-1.5 py-[2px]',
    inert ? 'pointer-events-none' : 'cursor-help tap-target',
  );
  const tint = {
    color: accent ?? 'var(--c-ink)',
    borderColor: `color-mix(in srgb, ${accent ?? 'var(--c-ink)'} 45%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${accent ?? 'var(--c-ink)'} 10%, var(--c-paper))`,
  };

  return (
    <span className="relative inline-block max-w-full">
      {inert ? (
        // A span, not a disabled button: an inert chip is not a control that
        // happens to be off, it is lettering on the card. No tab stop, no
        // accessible name of its own, nothing for a pointer to land on.
        <span ref={btnRef as React.Ref<HTMLSpanElement>} className={pill} style={tint}>
          <span className="truncate">{label ?? kw}</span>
        </span>
      ) : (
        <button ref={btnRef} type="button" onClick={open} className={pill} style={tint}>
          <span className="truncate">{label ?? kw}</span>
        </button>
      )}
      {pos && popText && (
        <KeywordPopover
          kw={label ?? kw}
          text={popText}
          pos={pos}
          close={close}
          triggerRef={btnRef}
        />
      )}
    </span>
  );
}

/** An inline, in-sentence keyword mention — opens the exact same glossary
 * popover as the pill chip, so every recognized keyword word is clickable
 * wherever it appears, not just in the pill row. */
function KeywordText({
  kw,
  small,
  inert,
}: {
  key?: React.Key;
  kw: string;
  small?: boolean;
  inert?: boolean;
}) {
  const { pos, btnRef, text, open, close } = useKeywordPopover(kw);
  if (!text) return <>{kw}</>;
  // An in-sentence mention on a small card is the smallest target in the game
  // (22x9 on a battlefield unit). Below `full` it is just an underline — see
  // `chipsInteractive`.
  if (inert)
    return (
      <span
        className={cn(
          'font-bold underline decoration-dotted underline-offset-2',
          small ? 'text-[6.5px]' : undefined,
        )}
      >
        {kw}
      </span>
    );
  return (
    <span className="relative inline">
      <button
        ref={btnRef}
        type="button"
        onClick={open}
        // WCAG 2.5.8's *inline* exception, declared rather than assumed: this
        // target sits inside a sentence and its height is the line-height of
        // the non-target text around it. It cannot be grown without changing
        // the leading of the paragraph it lives in — and inside a card's
        // `-webkit-line-clamp` rules box it cannot be grown at all, because
        // the clamp clips hit-testing along with painting. The harness reads
        // this attribute, exempts the element, and prints how many it
        // exempted, so the carve-out can never quietly become a pile.
        data-inline-target="1"
        className={cn(
          'font-bold underline decoration-dotted underline-offset-2 cursor-help',
          small ? 'text-[6.5px]' : undefined,
        )}
      >
        {kw}
      </button>
      {pos && text && (
        <KeywordPopover kw={kw} text={text} pos={pos} close={close} triggerRef={btnRef} />
      )}
    </span>
  );
}

/** Click-to-open popover explaining a card's Essence Cost — same portal
 * popover the keyword chips use. Wraps whatever badge content is passed as
 * children in a real <button>; `title` kept as a desktop hover fallback. */
function CostInfoButton({
  text,
  className,
  title,
  inert,
  children,
}: {
  text: string;
  className?: string;
  title?: string;
  /** Painted, not pressed — see `chipsInteractive` on the tier table. */
  inert?: boolean;
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
    const top =
      rect.bottom + 4 + POPOVER_EST_HEIGHT > window.innerHeight
        ? Math.max(8, rect.top - POPOVER_EST_HEIGHT - 4)
        : rect.bottom + 4;
    setPos({ top, left });
  };
  if (inert) return <span className={className}>{children}</span>;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={title}
        className={cn('cursor-help tap-target relative', className)}
      >
        {children}
      </button>
      {pos && (
        <KeywordPopover
          kw="ESSENCE COST"
          text={text}
          pos={pos}
          close={() => setPos(null)}
          triggerRef={btnRef}
        />
      )}
    </>
  );
}

/**
 * Whether a card face at `size` gives its keyword chips, in-sentence keyword
 * mentions and cost pips their own tap targets.
 *
 * Exported so the ladder can be pinned by a test rather than re-derived: the
 * rule is a SIZE rule, and the thing that must not drift is that no tier whose
 * chips paint under the 24x24 minimum is allowed to accept a pointer.
 */
export function chipsAreInteractive(size: CardSize): boolean {
  return TIER[size].chipsInteractive;
}

/** Sorted longest-first so a multi-word keyword is matched before any
 * single-word keyword it might contain. */
const KEYWORD_NAMES = Object.keys(KEYWORD_GLOSSARY).sort((a, b) => b.length - a.length);
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KEYWORD_TEXT_RE = new RegExp(`\\b(${KEYWORD_NAMES.map(escapeRegExp).join('|')})\\b`, 'g');

/** Splits `text` on every recognized keyword mention and renders each one as
 * a clickable `KeywordText`, so any card sentence gets working
 * click-to-define keywords wherever they're mentioned. */
export function renderKeywordText(text: string, small?: boolean, inert?: boolean): React.ReactNode {
  if (!text) return text;
  const parts = text.split(KEYWORD_TEXT_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    // Odd indices are the captured keyword matches (String.split keeps
    // capture groups in the output array); even indices are plain text.
    i % 2 === 1 ? (
      <KeywordText key={i} kw={part} small={small} inert={inert} />
    ) : (
      part && <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

/** Per-set flavor-text styling — a distinct "print run" identity per set. */
function setStyle(set?: string): { label: string; className: string; bar: string } {
  switch (set) {
    case 'Volume #1':
      return {
        label: 'VOLUME #1',
        className: 'text-[#B45309] italic',
        bar: 'bg-[#B45309]',
      };
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

/** True when `src` points at a video file rather than a still image. */
function isVideoSrc(src: string): boolean {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(src);
}

/** Card art with a graceful fallback if the image 404s or never loads. */
function CardArt({
  def,
  onLoaded,
  cover,
}: {
  def: CardDef;
  onLoaded?: () => void;
  /** Full-Art template: the image fills its box edge-to-edge (object-cover)
   * instead of ever letterboxing. */
  cover?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  // Reset whenever the image URL actually changes (a caller may swap `def`
  // without remounting).
  useEffect(() => setBroken(false), [def.image]);
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
      alt=""
      className={artClass}
      draggable={false}
      loading="lazy"
      onError={() => setBroken(true)}
      onLoad={onLoaded}
    />
  );
}

/** The fixed pixel sizes for `CardFace`'s `size` prop — exported so any
 * wrapper that needs to reserve exact space for a card can read the real
 * dimensions instead of hardcoding a magic number. */
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
 * weights, keyword caps and content toggles so small cards stay legible. */
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
    artBorder: string;
    artRing: boolean;
    rarityChip: string;
    artBadge: string;
    foilBadge: string;
    typeLine: string;
    showSetSuffix: boolean;
    textBoxPad: string;
    /** Max keyword chips shown; overflow collapses into a "+N" chip. */
    keywordMax: number;
    keywordSmall: boolean;
    /**
     * Whether this tier's keyword chips, in-sentence keyword mentions and cost
     * pips are their own tap targets.
     *
     * v28: they always were, at every tier, and below `full` that was a bug
     * rather than a feature — twice over.
     *
     * **They are too small.** A chip on a battlefield unit measures 23x14, a
     * keyword mention as little as 22x9, a cost pip 28x13; WCAG 2.5.8 (AA)
     * asks for 24x24. Only at `full` do they clear it without help, and the
     * help does not fit: the chip row and the rules paragraph both clip their
     * overflow to hold a height budget, and a clipping ancestor clips
     * hit-testing too, so a `.tap-target` expansion inside one is a
     * declaration rather than a target. Growing the boxes themselves would
     * wreck the layouts these font sizes exist to serve.
     *
     * **They steal the card's own tap.** They sit ON TOP of the card whose tap
     * IS the game action — select this attacker, add this card to the deck —
     * and on a phone the small target wins the ties. The cheapest thing a
     * player did constantly, reaching for a card, opened a glossary popover.
     *
     * So below `full` the chips are painted, not pressed: no tab stop, no hit
     * area, the whole tile is one clean target, and the full-size face one tap
     * away (the hand preview, the inspector, the hover card, the Showroom)
     * carries the interactive copies at a size that passes. `autoIntroduce`
     * still fires from an inert chip — the first-sight teaching popover is the
     * tier's own behaviour, not the pointer's.
     */
    chipsInteractive: boolean;
    /** Render the card's rules text (card.text + generated lines). */
    showRules: boolean;
    rulesFont: number;
    rulesLines: number;
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
    chipsInteractive: false,
    showRules: false,
    rulesFont: 6,
    rulesLines: 0,
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
    chipsInteractive: false,
    showRules: true,
    rulesFont: 6.5,
    rulesLines: 4,
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
    chipsInteractive: false,
    showRules: true,
    rulesFont: 7.5,
    rulesLines: 6,
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
    artBorder: 'border-[3px]',
    artRing: true,
    rarityChip: 'text-[9px] px-1.5 py-0.5',
    artBadge: 'text-[9px]',
    foilBadge: 'text-[9px] px-1.5 py-0.5',
    typeLine: 'mt-1 text-[10px]',
    showSetSuffix: true,
    textBoxPad: 'p-1.5',
    keywordMax: 10,
    keywordSmall: false,
    chipsInteractive: true,
    showRules: true,
    rulesFont: 9,
    rulesLines: 10,
    showFlavor: true,
  },
};

/** Ultra-Rare corner-ribbon geometry per tier — the diagonal gold band the
 * design strikes across the art window's top-left corner. */
/** Approximate masthead height per tier — what the full-bleed template's
 * badge column has to clear. */
const MASTHEAD_H: Record<CardSize, number> = { micro: 14, compact: 18, standard: 21, full: 26 };

/**
 * Bottom padding the text box reserves for the corner stat plate, so flavor
 * text can never render underneath it. Cards with no stat plate (Locations,
 * Items, Events) don't need the clearance, but reserving it unconditionally
 * keeps every card's text box the same height within a tier.
 *
 * v7.5: these were 8/11/14/18, hand-estimated from StatChip's `textClass` /
 * `iconClass` picks, and they were all too small — flavor text rendered UNDER
 * the Might/Grit (or Resolve) plate on 35 of the 131 card renders that have
 * both, worst on the two full-bleed templates where it overlapped by a full
 * 8px and the plate sits directly on the art. Measured in a real browser
 * instead (the geometry is: plate height + its `bottom-1` offset, minus the
 * text box's own distance from the card's bottom edge):
 *
 *   tier      plate H   plate bottom   box bottom   needed
 *   full         26          8            8-9         25-26
 *   standard     23          7            ~8          22
 *   compact      16          6            ~7          15
 *
 * Set with ~2px of slack over the worst case of the two templates. `micro`
 * renders through MicroCard, which has its own layout and no flavor block, so
 * its value is unused by this path and left alone.
 *
 * Guarded by `npm run audit:cardface`, which measures the two boxes in a real
 * browser at every rarity and size and fails on any intersection. Re-run it
 * after touching StatChip's type scale or either template's bottom padding.
 */
const PLATE_CLEARANCE: Record<CardSize, number> = { micro: 8, compact: 17, standard: 24, full: 28 };

const RIBBON: Record<CardSize, { top: number; left: number; font: number; padX: number }> = {
  micro: { top: 4, left: -16, font: 5, padX: 16 },
  compact: { top: 5, left: -18, font: 5.5, padX: 20 },
  standard: { top: 6, left: -22, font: 6.5, padX: 26 },
  full: { top: 9, left: -32, font: 8, padX: 38 },
};

/** A chip printed in the rules box — keywords, Item bond/Re-bond, Location
 * passive/produce — each with its glossary/explainer popover text. */
export interface FaceChip {
  kw: string;
  label: string;
  text?: string;
  accent?: string;
}

/** All chips a card prints: one per keyword (KEYWORD_TEXT popover), plus
 * structured chips for Item bond stats/grants, Worn Re-bond, and Sanctum
 * passives. */
export function faceChips(def: CardDef): FaceChip[] {
  const chips: FaceChip[] = [];
  for (const kw of def.keywords ?? []) {
    chips.push({ kw, label: kw, text: KEYWORD_TEXT[kw as keyof typeof KEYWORD_TEXT] });
  }
  if (def.bond) {
    chips.push({
      kw: 'Bond',
      label: `Bond +${def.bond.might ?? 0}/+${def.bond.grit ?? 0}`,
      text: 'While this Item is bonded to a unit, the unit gets these bonus stats (Might/Grit).',
      accent: '#0E7490',
    });
    for (const g of def.bond.grants ?? []) {
      chips.push({
        kw: g,
        label: `Grants ${g}`,
        text: `Bonded unit gains ${g}: ${KEYWORD_TEXT[g as keyof typeof KEYWORD_TEXT] ?? ''}`,
        accent: '#0E7490',
      });
    }
  }
  if (def.rebondCost !== undefined) {
    chips.push({
      kw: def.subtype === 'Tool' ? 'Tool' : 'Weapon',
      label: `Re-bond ${def.rebondCost}`,
      text: `${def.subtype ?? 'Weapon'} — survives its bonded unit. Pay ${def.rebondCost} essence to bond it to another unit.`,
      accent: '#B45309',
    });
  }
  if (def.locPassive) {
    chips.push({
      kw: 'Sanctum',
      label: def.locPassive === 'MIGHT_ALL' ? '+1 Might to your units' : '+1 Grit to your units',
      text:
        def.locPassive === 'MIGHT_ALL'
          ? 'Static passive while this Location is in play: all your units get +1 Might.'
          : 'Static passive while this Location is in play: all your units get +1 Grit.',
      accent: '#16A34A',
    });
  }
  return chips;
}

/** v4.26 overflow-proof chip row: renders keyword chips into a
 * height-bounded, clipped container and then MEASURES it — if the rendered
 * rows don't fit the tier's height budget, it drops one chip at a time (each
 * drop grows the "+N" overflow chip) until everything genuinely fits. */
function FittedChips({
  def,
  size,
  chips,
  introduceKeywords,
}: {
  def: CardDef;
  size: CardSize;
  chips: FaceChip[];
  introduceKeywords?: boolean;
}) {
  const cfg = TIER[size];
  const total = chips.length;
  const [cap, setCap] = useState(cfg.keywordMax);
  const ref = useRef<HTMLDivElement>(null);
  // Reset the budget whenever the card (or tier) this slot shows changes.
  const resetKey = `${def.id}|${size}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setCap(cfg.keywordMax);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight > el.clientHeight + 1) {
      setCap((c) => (c > 1 ? c - 1 : c));
    }
  });
  if (total === 0 || cfg.keywordMax === 0) return null;
  const shown = Math.min(cap, total);
  const hidden = total - shown;
  return (
    <div
      ref={ref}
      className={cn(
        'shrink-0 flex flex-row flex-wrap content-start gap-1 min-h-[9px] overflow-hidden',
        // v28: `overflow-hidden` clips hit-testing as well as painting, so on
        // `full` — the one tier whose chips ARE tap targets — it was also
        // clipping the `.tap-target` expansion, leaving a chip that declares
        // 24px of hit area with 22. The padding gives the expansion somewhere
        // to go; the matching max-height increase keeps the CONTENT budget
        // identical (border-box), so the same chips fit and nothing moves.
        size === 'full'
          ? 'max-h-[64px] py-[5px]'
          : size === 'standard'
            ? 'max-h-[30px]'
            : size === 'compact'
              ? 'max-h-[20px]'
              : 'max-h-[11px]',
      )}
    >
      {chips.slice(0, shown).map((k, i) => (
        <KeywordChip
          key={`${k.kw}-${i}`}
          kw={k.kw}
          label={k.label}
          text={k.text}
          small={cfg.keywordSmall}
          autoIntroduce={introduceKeywords}
          accent={k.accent}
          inert={!cfg.chipsInteractive}
        />
      ))}
      {hidden > 0 && (
        <span
          className={cn(
            'inline-flex items-center rounded-full border border-[var(--c-ink)]/30 font-bold opacity-70',
            cfg.keywordSmall ? 'text-[6.5px] px-1' : 'text-[8.5px] px-1.5',
          )}
          title="More abilities — expand the card to see everything"
        >
          +{hidden}
        </span>
      )}
    </div>
  );
}

/** Rules text that MEASURES itself: it starts at the tier's line budget and
 * sheds one clamped line at a time until the paragraph genuinely fits the
 * text box, so a long ability can never be cut off mid-line. */
function FittedRules({
  text,
  fontPx,
  maxLines,
  onArt,
  className,
  small,
  inert,
}: {
  text: string;
  fontPx: number;
  maxLines: number;
  onArt: boolean;
  className?: string;
  small: boolean;
  inert?: boolean;
}) {
  const [lines, setLines] = useState(maxLines);
  const ref = useRef<HTMLParagraphElement>(null);
  const resetKey = `${text}|${fontPx}|${maxLines}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setLines(maxLines);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (el && box && box.scrollHeight > box.clientHeight + 1) {
      setLines((l) => (l > 1 ? l - 1 : l));
    }
  });
  return (
    <p
      ref={ref}
      className={cn('leading-snug break-words font-semibold', className)}
      style={{
        fontSize: fontPx,
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: lines,
        overflow: 'hidden',
        textShadow: onArt ? '0 1px 2px rgba(0,0,0,0.9)' : undefined,
      }}
    >
      {renderKeywordText(text, small, inert)}
    </p>
  );
}

/** v4.26 lowest-priority element on the card: flavor text renders at up to
 * `maxLines` clamped lines, then MEASURES its wrapper — whenever the clamped
 * paragraph still doesn't fit the leftover space it sheds one line at a time
 * and finally unmounts entirely at zero. */
function FittedFlavor({
  text,
  fontPx,
  onArt,
  setClassName,
}: {
  text: string;
  fontPx: number;
  /** Rendered over artwork (full-bleed template) — lighter divider + shadow. */
  onArt: boolean;
  setClassName: string;
}) {
  const MAX_LINES = 4;
  const [lines, setLines] = useState(MAX_LINES);
  const ref = useRef<HTMLDivElement>(null);
  const resetKey = `${text}|${fontPx}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setLines(MAX_LINES);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight > el.clientHeight + 1) {
      setLines((l) => (l > 0 ? l - 1 : l));
    }
  });
  if (lines === 0) return null;
  return (
    <div
      ref={ref}
      // Layout-audit hook (scripts/audit-cardface.ts) — the flavor block and
      // the stat plate are the two boxes that must never intersect.
      data-fc="flavor"
      className={cn(
        // Pinned to the bottom of the text box under a dashed rule, per the
        // template's flavor divider.
        'mt-auto pt-1 border-t border-dashed min-h-0 overflow-hidden',
        onArt ? 'border-white/30' : 'border-[var(--c-ink)]/40',
      )}
    >
      <p
        className={cn('leading-snug break-words', setClassName)}
        style={{
          fontSize: fontPx,
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: lines,
          overflow: 'hidden',
          textShadow: onArt ? '0 1px 2px rgba(0,0,0,0.9)' : undefined,
        }}
      >
        {text}
      </p>
    </div>
  );
}

/** Type line text: "Type — Subtype" (e.g. "Event — Quick"). */
function typeLineText(def: CardDef): string {
  return def.subtype ? `${def.type} — ${def.subtype}` : def.type;
}

/** The card's full printed rules text: `card.text` if authored, otherwise
 * the generated lines from its structured mechanics. */
function rulesText(def: CardDef): string {
  // v5.1: the text box prints ONLY information no chip already carries —
  // on-invoke effects and triggered abilities. Keywords, Bond stats,
  // Re-bond cost, Sanctum passives and produced essence all render as chips
  // (or the type-line pip), so repeating their reminder text here was what
  // pushed the real ability lines past the line clamp and cut them off.
  const bits: string[] = [];
  if (def.onInvoke) {
    bits.push(
      def.type === 'Unit'
        ? `When this enters the field: ${describeEffect(def.onInvoke)}.`
        : `${describeEffect(def.onInvoke)}.`,
    );
  }
  for (const t of def.triggers ?? []) {
    bits.push(`${TRIGGER_PHRASE[t.when]}: ${describeEffect(t.effect)}.`);
  }
  if (bits.length > 0) return bits.map(cap1).join(' ');
  // No structured mechanics at all (authored/dev cards): fall back to the
  // printed text — but only when no chip/pip already tells the story.
  const chipCovered =
    def.keywords?.length ||
    def.bond ||
    def.rebondCost !== undefined ||
    def.locPassive ||
    def.produces;
  if (!chipCovered && def.text) return def.text;
  return '';
}

function cap1(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** v4.26: the `micro` tier is a purpose-built board token, not a shrunken
 * full card. The art fills the whole footprint with top/bottom scrims; the
 * top strip carries the type glyph + auto-shrinking name and the essence
 * cost pips; the bottom strip carries up to two keyword chips (with a "+N"
 * spillover) and solid-backed Might/Grit gems (Resolve for Leaders). */
function MicroCard({
  def,
  dimmed,
  highlight,
  foil,
  foilEffect = true,
  onClick,
  footer,
  badge,
  count,
  foilCount,
  live,
  introduceKeywords,
  serial,
}: Omit<CardFaceProps, 'size' | 'key'>) {
  const { w, h } = SIZES.micro;
  const chips = faceChips(def);
  const totalChips = chips.length;
  const MAX_KW = 2;
  const shownKw = chips.slice(0, MAX_KW);
  const hiddenChips = totalChips - shownKw.length;
  const isFoil = foil && !serial;
  const mythic = isMythic(def.rarity) && !serial;
  const stats = def.type === 'Unit' ? `, ${def.might} might, ${def.grit} grit` : '';
  const label = `${def.name}, ${def.type}${stats}${isFoil ? ', foil' : ''}${serial ? `, Serialized #${serial.number} of ${capText(serial.cap)}` : ''}`;
  const TypeIcon = TYPE_ICON[def.type];
  const nameFontPx = fitFontSize(def.name, 7.5, 5.5, 12);
  const cardColorsForFace = cardColors(def);
  return (
    <div
      role="button"
      data-card-id={def.id}
      tabIndex={onClick ? 0 : -1}
      aria-disabled={!onClick}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{ width: w, height: h }}
      className={cn(
        'relative flex flex-col bg-[var(--c-ink)] text-left shrink-0 transition-transform overflow-hidden border rounded-[3px] shadow-hard-black-xs',
        rarityBorder(def.rarity),
        onClick && 'btn-pop cursor-pointer',
        dimmed && 'opacity-45 saturate-50',
        highlight && 'ring-4 ring-[var(--c-yellow)] -translate-y-1',
        serial && !dimmed && 'serialized-frame',
        isFoil && !dimmed && !mythic && 'foil-glow',
      )}
    >
      {/* Full-bleed art layer */}
      <div className="absolute inset-0">
        <CardArt def={def} cover />
      </div>
      {/* Top + bottom legibility scrims — one continuous gradient so text
          always reads over any art, with a clear window in the middle. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 22%, rgba(0,0,0,0) 36%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.55) 72%, rgba(0,0,0,0.92) 100%)',
        }}
      />
      {/* Name + essence-cost strip */}
      <div className="relative z-10 flex items-start justify-between gap-0.5 px-1 pt-0.5 shrink-0">
        <span
          className="flex items-center gap-0.5 min-w-0 heading-font leading-tight text-white"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.6)' }}
          title={def.name}
        >
          <TypeIcon className="w-2 h-2 shrink-0 opacity-90 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]" />
          <span className="line-clamp-2 break-words" style={{ fontSize: nameFontPx }}>
            {def.name}
          </span>
        </span>
        <EssenceCostRow cost={def.cost} type={def.type} size="micro" onArt />
      </div>
      {/* Corner status badges (count / foil / serial / caller badge) */}
      {(badge ||
        serial ||
        isFoil ||
        (count !== undefined && count > 0) ||
        (foilCount || 0) > 0) && (
        <div className="absolute z-20 top-[26px] left-0.5 flex flex-col items-start gap-0.5">
          {badge && (
            <span className="bg-[var(--c-red)] text-white text-[5.5px] font-black px-1 rounded-full">
              {badge}
            </span>
          )}
          {serial && (
            <span
              className="serial-plate text-[5px] font-black px-0.5 rounded-full tracking-wide"
              title={`Serialized print — #${serial.number} of ${capText(serial.cap)} ever made`}
            >
              #{serial.number}/{capText(serial.cap)}
            </span>
          )}
          {isFoil && (
            <span className="bg-gradient-to-r from-[var(--c-yellow)] via-[#E879F9] to-[var(--c-yellow)] text-[var(--c-ink)] text-[5px] font-black px-0.5 rounded-full">
              ✦
            </span>
          )}
          {count !== undefined && count > 0 && (
            <span className="bg-[var(--c-ink)] text-[var(--c-yellow)] text-[5.5px] font-black px-0.5 rounded-full">
              ×{count}
            </span>
          )}
          {(foilCount || 0) > 0 && (
            <span className="bg-[var(--c-yellow)] text-[var(--c-ink)] text-[5.5px] font-black px-0.5 rounded-full">
              ✦ {foilCount}
            </span>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0" />
      {/* Bottom strip: keyword chips + solid-backed stat gems */}
      <div className="relative z-10 flex flex-col gap-[2px] px-1 pb-1 shrink-0">
        {(shownKw.length > 0 || hiddenChips > 0) && (
          <div className="flex flex-row flex-wrap content-start gap-0.5 max-h-[11px] overflow-hidden">
            {shownKw.map((k, i) => (
              <KeywordChip
                key={`${k.kw}-${i}`}
                kw={k.kw}
                label={k.label}
                text={k.text}
                small
                autoIntroduce={introduceKeywords}
                accent={k.accent}
                // MicroCard is its own component with its own chip row, so the
                // tier table's `chipsInteractive` never reached it — and micro
                // is the tier where an interactive chip does the most damage:
                // this is the board token whose tap declares an attacker.
                inert={!chipsAreInteractive('micro')}
              />
            ))}
            {hiddenChips > 0 && (
              <span
                className="inline-flex items-center rounded-full border border-white/40 bg-black/50 text-white text-[6px] font-bold px-1"
                title="More abilities — long-press or hover to see the full card"
              >
                +{hiddenChips}
              </span>
            )}
          </div>
        )}
        <div className="flex items-end justify-between gap-0.5">
          <span className="flex items-center gap-0.5 min-w-0">
            {cardColorsForFace.map((c) => (
              <span
                key={c}
                aria-hidden
                className="w-2 h-2 rounded-full border border-white/80 shrink-0 flex items-center justify-center"
                style={{
                  backgroundColor: COLOR_PIP[c].bg,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.8)',
                }}
                title={`Color: ${c}`}
              >
                <EssenceIcon type={c} color={COLOR_PIP[c].fg} size={5} />
              </span>
            ))}
          </span>
          {def.type === 'Unit' &&
            (live ? (
              <span
                className="flex items-center gap-0.5 shrink-0"
                title={`Printed ${def.might}/${def.grit}`}
              >
                <StatChip
                  icon={Swords}
                  label="Might"
                  value={live.atk}
                  printed={def.might}
                  tier="micro"
                  tint={live.atk > (def.might ?? 0) ? '#4ADE80' : '#F87171'}
                  onArt
                />
                <StatChip
                  icon={Shield}
                  label="Grit"
                  value={live.hp}
                  maxValue={live.maxHp !== live.hp ? live.maxHp : undefined}
                  printed={live.maxHp !== (def.grit ?? 0) ? (def.grit ?? 0) : undefined}
                  tier="micro"
                  tint={live.hp < live.maxHp ? '#F87171' : '#4ADE80'}
                  onArt
                />
              </span>
            ) : (
              <span className="flex items-center gap-0.5 shrink-0">
                <StatChip
                  icon={Swords}
                  label="Might"
                  value={def.might}
                  tier="micro"
                  tint="#F87171"
                  onArt
                />
                <StatChip
                  icon={Shield}
                  label="Grit"
                  value={def.grit}
                  tier="micro"
                  tint="#4ADE80"
                  onArt
                />
              </span>
            ))}
          {def.type === 'Leader' && (
            <span className="shrink-0">
              <StatChip
                icon={Shield}
                label="Resolve"
                value={def.resolve}
                tier="micro"
                tint="#A78BFA"
                onArt
              />
            </span>
          )}
        </div>
      </div>
      {footer}
      {serial && !dimmed && (
        <div className="serialized-sheen absolute inset-0 pointer-events-none" />
      )}
      {isFoil && foilEffect && (
        <div className="foil-shimmer absolute inset-0 pointer-events-none opacity-60" />
      )}
    </div>
  );
}

interface CardFaceProps {
  key?: React.Key;
  def: CardDef;
  size?: CardSize;
  dimmed?: boolean;
  highlight?: boolean;
  foil?: boolean;
  foilEffect?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
  badge?: string;
  count?: number;
  foilCount?: number;
  live?: { atk: number; hp: number; maxHp: number };
  introduceKeywords?: boolean;
  serial?: { number: number; cap: number };
}

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
  live,
  introduceKeywords,
  serial,
}: {
  key?: React.Key;
  def: CardDef;
  /** Card size — one of the fixed, hand-tuned tiers (real 2.5:3.5
   * proportions at every tier). */
  size?: CardSize;
  dimmed?: boolean;
  highlight?: boolean;
  /** Renders the built-in foil treatment: shimmering sheen + pulsing glow ring. */
  foil?: boolean;
  /** Set false to suppress the animated shimmer overlay while still showing
   * the foil badge/glow — for callers (Card3DInspector) that layer their
   * own pointer-driven holographic sheen. */
  foilEffect?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
  badge?: string;
  count?: number;
  foilCount?: number;
  /** Live-match only (Units on the battlefield): effective Might / current
   * Grit / effective max Grit. Rendered in the normal StatChip position —
   * green when above the printed value, red when below/damaged, with the
   * printed value struck through inside the chip. */
  live?: { atk: number; hp: number; maxHp: number };
  /** Live-match only: auto-opens each of this card's keyword glossary
   * popovers once per device, the first time that keyword is ever seen. */
  introduceKeywords?: boolean;
  /** A numbered Serialized print — the rarest possible pull, always
   * foil-free. Renders a rotating prismatic frame + an engraved number
   * plate instead of the normal rarity treatment. */
  serial?: { number: number; cap: number };
}) {
  // The board/list `micro` tier renders through its own purpose-built
  // art-forward template (see MicroCard) instead of a shrunken full card.
  // Safe to branch here: CardFace itself calls no hooks.
  if (size === 'micro') {
    return (
      <MicroCard
        def={def}
        dimmed={dimmed}
        highlight={highlight}
        foil={foil}
        foilEffect={foilEffect}
        onClick={onClick}
        footer={footer}
        badge={badge}
        count={count}
        foilCount={foilCount}
        live={live}
        introduceKeywords={introduceKeywords}
        serial={serial}
      />
    );
  }
  const { w, h } = SIZES[size];
  const cfg = TIER[size];
  const chips = faceChips(def);
  const set = setStyle(def.set);
  // v5.0: a card's color identity is printed on the card — the colored pips
  // in its Essence Cost (plus a Location's produced type). Leaders have a
  // printed cost too, so they tint like everything else.
  const cardColorsForFace = cardColors(def);
  const stats = def.type === 'Unit' ? `, ${def.might} might, ${def.grit} grit` : '';
  // Serialized prints can never be foil (see quicksell_cards/grant_pack_contents).
  const isFoil = foil && !serial;
  const label = `${def.name}, ${typeLineText(def)}${stats}${isFoil ? ', foil' : ''}${serial ? `, Serialized #${serial.number} of ${capText(serial.cap)}` : ''}`;
  const rarityHex = RARITY_HEX[def.rarity || 'Common'] || RARITY_HEX.Common;
  // The card's visible fill/background tracks its color identity; rarity is
  // printed by the rule bar, abbreviation plate and premium frame layers.
  const nameFontPx = fitFontSize(def.name, cfg.nameFont.base, cfg.nameFont.min, cfg.nameFont.soft);
  const rules = rulesText(def);
  const flavorFontPx = fitFontSize(def.flavor || '', 9, 6.5, 110);
  const mythic = isMythic(def.rarity) && !serial;
  const altArt = isAltArt(def.rarity) && !serial;
  const animatedFx = (rarityAnimated(def.rarity) || mythic) && !serial;
  const bg = colorBg(cardColorsForFace);
  const TypeIcon = TYPE_ICON[def.type];
  // v6.8 template split. Full-Art/Alt-Art (still image) and Mythic (looping
  // video) print FULL-BLEED — the art fills the whole card footprint and
  // every piece of card text floats over it. Every other rarity keeps the
  // framed template: ink masthead, boxed 4:3 art window, rarity rule, text box.
  const bleed = rarityBleeds(def.rarity);
  const mythicArt = isMythic(def.rarity);
  const ultra = def.rarity === 'Ultra-Rare' && !serial;
  // Framed premium art treatments — the rarity ghost tint + diagonal sweep
  // (Super-Rare and up) and the corner ribbon (Ultra-Rare and up). A foil
  // print replaces both with its static prismatic stamp; a full-bleed rarity
  // has no art window to animate inside.
  const artFx = raritySuperPlus(def.rarity) && !bleed && !isFoil && !serial && !dimmed;
  const ribbon = rarityUltraPlus(def.rarity) && !bleed;

  // MTG-format stat plate content — Might/Grit (Resolve for Leaders) shown
  // in the bottom-right corner like a P/T box. Live-match values render
  // green (buffed) / red (damaged/nerfed) with the printed value struck
  // through inside the chip.
  const statChips =
    def.type === 'Unit' ? (
      live ? (
        <>
          <StatChip
            icon={Swords}
            label="Might"
            value={live.atk}
            printed={def.might}
            tier={size}
            tint={live.atk > (def.might ?? 0) ? '#16A34A' : 'var(--c-red)'}
            emboss={mythic ? 'mythic' : altArt ? 'altArt' : false}
            onArt
          />
          <StatChip
            icon={Shield}
            label="Grit"
            value={live.hp}
            maxValue={live.maxHp !== live.hp ? live.maxHp : undefined}
            printed={live.maxHp !== (def.grit ?? 0) ? (def.grit ?? 0) : undefined}
            tier={size}
            tint={
              live.hp < live.maxHp
                ? 'var(--c-red)'
                : live.maxHp > (def.grit ?? 0)
                  ? '#16A34A'
                  : '#22C55E'
            }
            emboss={mythic ? 'mythic' : altArt ? 'altArt' : false}
            onArt
          />
        </>
      ) : (
        <>
          <StatChip
            icon={Swords}
            label="Might"
            value={def.might}
            tier={size}
            tint="var(--c-red)"
            emboss={mythic ? 'mythic' : altArt ? 'altArt' : false}
            onArt
          />
          <StatChip
            icon={Shield}
            label="Grit"
            value={def.grit}
            tier={size}
            tint="#22C55E"
            emboss={mythic ? 'mythic' : altArt ? 'altArt' : false}
            onArt
          />
        </>
      )
    ) : def.type === 'Leader' ? (
      <StatChip
        icon={Shield}
        label="Resolve"
        value={def.resolve}
        tier={size}
        tint="#7C3AED"
        emboss={mythic ? 'mythic' : altArt ? 'altArt' : false}
        onArt
      />
    ) : null;

  // Text that sits over artwork (full-bleed template) needs a shadow to stay
  // legible on any image.
  const overArt: React.CSSProperties | undefined = bleed
    ? { textShadow: '0 1px 2px rgba(0,0,0,0.9)' }
    : undefined;
  const rib = RIBBON[size];

  /** Type line + rarity marker — "Type — Subtype" on the left, the short
   * rarity abbreviation stamped on an ink plate on the right (the design's
   * set-symbol slot). */
  const typeLine = (
    <div
      className={cn(
        'relative z-10 flex items-center justify-between gap-1 shrink-0 px-1.5',
        cfg.typeLine,
      )}
    >
      <span
        className={cn(
          'font-bold uppercase tracking-wide truncate',
          bleed ? 'text-white/85' : 'text-[var(--c-ink)]',
        )}
        style={overArt}
      >
        {typeLineText(def)}
        {cfg.showSetSuffix && def.set ? ` · ${def.set}` : ''}
      </span>
      {def.rarity && (
        <span
          className={cn('font-mono font-black rounded-[2px] leading-none shrink-0', cfg.rarityChip)}
          style={{ backgroundColor: 'var(--c-ink)', color: rarityHex }}
          title={def.rarity}
        >
          {rarityAbbr(def.rarity)}
        </span>
      )}
    </div>
  );

  /** Rules + Leader abilities + flavor — identical content in both templates,
   * inked on paper in the framed one and white-on-scrim in the bleed one. */
  const textContent = (
    <>
      {chips.length > 0 && (
        <FittedChips def={def} size={size} chips={chips} introduceKeywords={introduceKeywords} />
      )}
      {cfg.showRules && rules && (
        <FittedRules
          text={rules}
          fontPx={fitFontSize(rules, cfg.rulesFont, cfg.rulesFont - 2, 90)}
          maxLines={cfg.rulesLines}
          onArt={bleed}
          className={chips.length > 0 ? 'mt-1' : undefined}
          small={size !== 'full'}
          inert={!cfg.chipsInteractive}
        />
      )}
      {cfg.showRules && def.type === 'Leader' && (def.leaderAbilities?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-0.5 mt-1">
          {def.leaderAbilities!.map((ab, i) => (
            <div
              key={i}
              className="flex items-start gap-1 leading-snug break-words"
              style={{ fontSize: cfg.rulesFont, ...overArt }}
            >
              <span
                className="shrink-0 font-mono font-black rounded-full px-1 border"
                style={{
                  fontSize: Math.max(6, cfg.rulesFont - 1),
                  color: bleed ? '#C4B5FD' : '#7C3AED',
                  borderColor: 'color-mix(in srgb, #7C3AED 45%, transparent)',
                  backgroundColor: 'color-mix(in srgb, #7C3AED 12%, transparent)',
                }}
                title="Resolve cost"
              >
                {ab.resolveDelta > 0 ? `+${ab.resolveDelta}` : ab.resolveDelta}
              </span>
              <span className="font-semibold min-w-0">
                {renderKeywordText(
                  ab.text ?? describeEffect(ab.effect),
                  size !== 'full',
                  !cfg.chipsInteractive,
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {cfg.showFlavor && def.flavor && (
        <FittedFlavor
          text={def.flavor}
          fontPx={flavorFontPx}
          onArt={bleed}
          setClassName={set.className}
        />
      )}
    </>
  );

  /** Might/Grit (Resolve) plate — anchored to the card's bottom-right corner
   * in both templates, on an ink plate the design carries at every rarity. */
  const statPlate = statChips && (
    <div
      data-fc="stats"
      className={cn(
        'absolute z-30 flex items-center gap-0.5 rounded-[2px] px-0.5 py-[1px] bg-[var(--c-ink)]',
        'bottom-1 right-1',
      )}
      title={
        def.type === 'Unit'
          ? live
            ? `Might/Grit — printed ${def.might}/${def.grit}`
            : `Might ${def.might} / Grit ${def.grit}`
          : `Resolve ${def.resolve}`
      }
    >
      {statChips}
    </div>
  );

  /** Owned-count / foil / serial / caller badges, stacked in one column so
   * they can never overlap each other or the corner decorations. */
  const badgeStack = (badge ||
    isFoil ||
    serial ||
    (count !== undefined && count > 0) ||
    (foilCount || 0) > 0) && (
    <div
      // Framed: inside the art window's top-left corner. Full-bleed: clear of
      // the masthead, which spans the card's own top-left corner.
      className="absolute z-30 left-1 flex flex-col items-start gap-0.5"
      style={{ top: bleed ? MASTHEAD_H[size] + 4 : 4 }}
    >
      {badge && (
        <span
          className={cn('bg-[var(--c-red)] text-white font-black px-1 rounded-full', cfg.artBadge)}
        >
          {badge}
        </span>
      )}
      {isFoil && (
        <span
          className={cn(
            'fc-foil-band font-black rounded-full border border-[var(--c-ink)]/40',
            cfg.foilBadge,
          )}
        >
          ✦ FOIL
        </span>
      )}
      {serial && (
        <span
          className={cn('serial-plate font-black rounded-full tracking-wide', cfg.foilBadge)}
          title={`Serialized print — #${serial.number} of ${capText(serial.cap)} ever made`}
        >
          #{serial.number}/{capText(serial.cap)}
        </span>
      )}
      {count !== undefined && count > 0 && (
        <span className="bg-[var(--c-ink)] text-[var(--c-yellow)] text-[8px] font-black px-1 rounded-full">
          ×{count}
        </span>
      )}
      {(foilCount || 0) > 0 && (
        <span className="bg-[var(--c-yellow)] text-[var(--c-ink)] text-[8px] font-black px-1 rounded-full">
          ✦ {foilCount}
        </span>
      )}
    </div>
  );

  return (
    // A plain <div role="button"> rather than a <button>: the footer can
    // carry its own interactive control, and nested <button> elements are
    // invalid HTML / break screen-reader and keyboard navigation.
    <div
      role="button"
      data-card-id={def.id}
      tabIndex={onClick ? 0 : -1}
      aria-disabled={!onClick}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        // Guard against nested interactive chips (KeywordChip/CostInfoButton
        // buttons inside this card): their own Enter/Space keydown bubbles up
        // to this div.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{ width: w, height: h, backgroundImage: bleed || isFoil ? undefined : bg }}
      className={cn(
        'relative flex flex-col bg-[var(--c-paper)] text-[var(--c-ink)] text-left shrink-0 transition-transform overflow-hidden',
        cfg.outerBorder,
        cfg.rounded,
        // The design's frame is a single ink hairline at every rarity — the
        // ladder is read from the rarity rule under the art and the abbr
        // plate, not from a colored border.
        'border-[var(--c-ink)]',
        isFoil && !bleed && 'fc-foil-body',
        onClick && 'btn-pop cursor-pointer',
        dimmed && 'opacity-45 saturate-50',
        highlight && 'ring-4 ring-[var(--c-yellow)] -translate-y-1',
        cfg.shadow,
        !dimmed &&
          (serial
            ? 'serialized-frame'
            : mythic
              ? 'mythic-frame'
              : altArt
                ? 'aa-frame'
                : ultra
                  ? 'ultra-frame'
                  : cfg.showGlow && rarityGlow(def.rarity)),
        (ultra || mythic || altArt) && !dimmed && 'premium-card',
      )}
    >
      {/* ---- Full-bleed art layer (Full-Art/Alt-Art still image / Mythic video) ---- */}
      {bleed && (
        <div className="absolute inset-0 z-0 bg-[#111]">
          {/* Mythic's scanline bed shows through wherever the looping video
              hasn't painted yet (or failed to load). */}
          {mythicArt && !dimmed && <div aria-hidden className="fc-my-scan absolute inset-0" />}
          <div className="absolute inset-0">
            <CardArt def={def} cover />
          </div>
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background: [
                'radial-gradient(120% 90% at 50% 42%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)',
                'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.08) 16%, rgba(0,0,0,0.02) 38%, rgba(0,0,0,0.15) 52%, rgba(0,0,0,0.62) 66%, rgba(0,0,0,0.96) 100%)',
              ].join(', '),
            }}
          />
          {mythicArt && !dimmed && <div aria-hidden className="fc-my-spark absolute inset-0" />}
          {isFoil && <div aria-hidden className="fc-foil-wash absolute inset-0" />}
          {/* Alt-Art "Prism Ink": a slow hue-shifting holographic wash over
              the full-bleed art — always on, not hover-gated, so it reads at
              a glance in a collection grid. */}
          {altArt && !dimmed && <div aria-hidden className="aa-holo absolute inset-0" />}
        </div>
      )}

      {/* ---- Masthead: name + essence cost ----
          A solid ink banner on the framed template, the same banner at 90%
          opacity over the art on the bleed one, and a static prismatic band
          (black title, no motion) on a foil print. */}
      <div
        className={cn(
          'relative z-20 flex items-center justify-between gap-1 pl-1.5 pr-1 shrink-0',
          cfg.headerPy,
          isFoil ? 'fc-foil-band' : bleed ? 'bg-[var(--c-ink)]/90' : 'bg-[var(--c-ink)]',
        )}
      >
        <span
          className={cn(
            'flex items-center gap-1 min-w-0 heading-font uppercase leading-tight tracking-[0.03em]',
            isFoil ? 'text-[#1A1A1A]' : 'text-[var(--c-paper)]',
          )}
          title={def.name}
        >
          <TypeIcon className={cn('shrink-0 opacity-80', cfg.typeIconSize)} />
          {/* Hard two-line clamp on top of the auto-shrink. */}
          <span className="break-words line-clamp-2" style={{ fontSize: nameFontPx }}>
            {def.name}
          </span>
        </span>
        {(def.cost || def.type !== 'Leader') && (
          <CostInfoButton
            text={`${costSummary(def) ?? 'Essence Cost: 0'}. Colored pips must be paid with matching essence (exhaust your Locations); generic pips with essence of any type.`}
            className="shrink-0"
            title={costSummary(def) || undefined}
            inert={!cfg.chipsInteractive}
          >
            <EssenceCostRow cost={def.cost} type={def.type} size={size} onArt={!isFoil} />
          </CostInfoButton>
        )}
      </div>

      {/* ---- Framed template: art window, rarity rule, type line, text box ---- */}
      {!bleed && (
        <>
          <div
            className={cn(
              'relative overflow-hidden aspect-[4/3] shrink-0 mx-1.5 mt-1 border border-[var(--c-ink)]',
            )}
          >
            <CardArt def={def} />
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ boxShadow: 'inset 0 -18px 22px -14px rgba(0,0,0,0.55)' }}
            />
            {/* Super-Rare and up: the rarity's own color ghosts over the art
                and a gold sweep travels diagonally across it. */}
            {artFx && (
              <>
                <div
                  aria-hidden
                  className="fc-art-ghost absolute inset-0"
                  style={{ backgroundColor: rarityHex }}
                />
                <div aria-hidden className="fc-art-sweep" />
              </>
            )}
            {isFoil && <div aria-hidden className="fc-foil-wash absolute inset-0" />}
            {/* Ultra-Rare and up: a struck gold ribbon across the art's
                top-left corner. */}
            {ribbon && (
              <span
                aria-hidden
                className="fc-ribbon absolute z-20 heading-font"
                style={{
                  top: rib.top,
                  left: rib.left,
                  transform: 'rotate(-38deg)',
                  fontSize: rib.font,
                  padding: `2px ${rib.padX}px`,
                }}
              >
                ULTRA
              </span>
            )}
            {badgeStack}
          </div>

          {/* Rarity rule — the ladder printed as a weight of ink. */}
          <div
            aria-hidden
            className="mx-1.5 mt-1 shrink-0"
            style={
              isFoil
                ? {
                    height: rarityRuleWeight(def.rarity),
                    backgroundImage:
                      'linear-gradient(90deg,#ffb6ea,#ffe29a,#a8f0d1,#9ec9ff,#c9a8ff)',
                  }
                : { height: rarityRuleWeight(def.rarity), backgroundColor: rarityHex }
            }
          />

          {typeLine}

          <div
            className={cn(
              'relative z-10 flex flex-col flex-1 min-h-0 overflow-hidden mx-1.5 mt-0.5 mb-0.5 border-t border-[var(--c-ink)]',
              cfg.textBoxPad,
            )}
            // Reserve the bottom-right corner for the stat plate.
            style={{ paddingBottom: PLATE_CLEARANCE[size] }}
          >
            {textContent}
            <div className="flex-1 shrink-[2]" />
          </div>
        </>
      )}

      {/* ---- Full-bleed template: everything rides the bottom scrim ---- */}
      {bleed && (
        <>
          {badgeStack}
          <div className="flex-1 min-h-0" />
          <div
            className="relative z-20 flex flex-col shrink-0 pt-4 pb-1"
            style={{
              background:
                'linear-gradient(0deg, rgba(20,15,10,0.94), rgba(20,15,10,0.5) 70%, transparent)',
            }}
          >
            {typeLine}
            <div
              className={cn(
                'relative z-10 flex flex-col min-h-0 overflow-hidden text-white mx-1.5',
                cfg.textBoxPad,
              )}
              style={{ paddingBottom: PLATE_CLEARANCE[size] }}
            >
              {textContent}
            </div>
          </div>
        </>
      )}

      {/* Set/print bar — the thin colored strip at the very bottom edge. */}
      {def.set && !bleed && (
        <div className={cn('relative z-10 h-[3px] w-full shrink-0', set.bar)} title={def.set} />
      )}

      {statPlate}
      {footer}

      {/* Mythic's glowing gold inner frame sits above every art layer. */}
      {mythicArt && !dimmed && (
        <div aria-hidden className="fc-my-frame absolute inset-[3px] z-20" />
      )}
      {/* A foil print is a STATIC prismatic stamp: a shining border ring, no
          motion of any kind (that is what separates it from the animated
          premium rarities). */}
      {isFoil && !dimmed && <div aria-hidden className="fc-foil-ring absolute inset-0 z-30" />}

      {serial && !dimmed && (
        <div className="serialized-sheen absolute inset-0 pointer-events-none" />
      )}
      {!isFoil && !serial && animatedFx && !dimmed && (
        <div
          className={cn(
            'rarity-sheen absolute inset-0 pointer-events-none',
            mythic ? 'opacity-80' : ultra ? 'opacity-70' : 'opacity-50',
          )}
          // Ultra-Rare: the moving sheen stays on the border ring only.
          style={ultra ? edgeRingMaskStyle(size) : undefined}
        />
      )}
      {/* Ultra-Rare "Gilded Relic": twinkling gold-dust layer + engraved
          gold corner brackets. */}
      {ultra && !dimmed && (
        <>
          <div
            aria-hidden
            className="ultra-sparkle pointer-events-none"
            style={edgeRingMaskStyle(size)}
          />
          {size === 'full' ? (
            <>
              <UltraFiligree size={size} />
              <div
                aria-hidden
                className="ur-aurora absolute z-10"
                style={{
                  top: -OUTER_BORDER_PX[size],
                  right: -OUTER_BORDER_PX[size],
                  bottom: -OUTER_BORDER_PX[size],
                  left: -OUTER_BORDER_PX[size],
                }}
              />
            </>
          ) : (
            <div
              aria-hidden
              className="absolute pointer-events-none z-20"
              style={{
                top: -OUTER_BORDER_PX[size],
                right: -OUTER_BORDER_PX[size],
                bottom: -OUTER_BORDER_PX[size],
                left: -OUTER_BORDER_PX[size],
              }}
            >
              <span className="absolute top-0.5 left-0.5 w-3 h-3 border-t-2 border-l-2 border-[#d4af37] rounded-tl-[3px]" />
              <span className="absolute top-0.5 right-0.5 w-3 h-3 border-t-2 border-r-2 border-[#d4af37] rounded-tr-[3px]" />
              <span className="absolute bottom-0.5 left-0.5 w-3 h-3 border-b-2 border-l-2 border-[#d4af37] rounded-bl-[3px]" />
              <span className="absolute bottom-0.5 right-0.5 w-3 h-3 border-b-2 border-r-2 border-[#d4af37] rounded-br-[3px]" />
            </div>
          )}
        </>
      )}
      {/* Mythic "Void Eclipse" premium layers. */}
      {mythic && !dimmed && (
        <>
          <div aria-hidden className="mythic-embers absolute inset-0 pointer-events-none" />
          {size === 'full' && (
            <>
              <MythicCrest />
              <div aria-hidden className="my-stars absolute inset-0 z-10" />
              <div aria-hidden className="my-corona absolute inset-0 z-10" />
            </>
          )}
        </>
      )}
      {/* Alt-Art "Prism Ink" hover-gated bloom (the base .aa-holo wash is
          rendered inside the full-bleed art layer above, always on). */}
      {altArt && !dimmed && size === 'full' && (
        <div aria-hidden className="aa-corona absolute inset-0 z-10" />
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Focus management — a keyboard user opening this via Enter/Space should
  // land inside the dialog, and return to the trigger on close.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => prevFocused?.focus?.();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--c-ink)]/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex flex-col items-center gap-3 outline-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Inspecting ${def.name}`}
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
