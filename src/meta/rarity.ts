/** The live card pool's sets — single source of truth for "Includes: ..."
 * lines on packs whose `allowed_sets` is null (i.e. draws from everything).
 * Volume #1 is the launch set (the old Blue Coral / Crimson Circuit /
 * Dragonbone Wastes / Full Arts Collection 1 split is gone from the live
 * catalog); "Players Showcase 2026" is the community set fed by the card-submission
 * queue (see `meta/submissions.ts`).
 *
 * NOTE: every live `pack_types` row now pins its own `allowed_sets`, so this
 * fallback should never actually be reached — a pack that draws from "all
 * sets" would silently start paying out Players Showcase 2026 cards the moment the
 * first one is approved, which is exactly what the v12 set-isolation
 * migration existed to prevent. It stays as a display default only.
 *
 * v13 renamed the community set to "Players Showcase 2026"; this list kept the
 * old "Player Showcase" string for a release, so the Store's "Includes: …"
 * line named a set that does not exist in `cards`. It has to stay equal to
 * `SHOWCASE_SET` in `meta/submissions.ts` — see the drift test in
 * `submissions.test.ts`. It is NOT imported from there: `submissions.ts` pulls
 * in the whole card pool, and `rarity.ts` is imported by every card face. */
export const ALL_SET_NAMES: string[] = ['Volume #1', 'Players Showcase 2026'];

/**
 * Global rarity color code — fixed across every theme, since rarity is a
 * collection/economy signal players learn to recognize, not app chrome.
 * Gray -> Green -> Blue -> Purple -> Gold -> Teal -> Pink -> Red, low to high.
 *
 * v6.8: Full-Art moved back ABOVE Ultra-Rare — it is now the second-rarest
 * tier, behind Mythic only. Prices, shard costs, pack odds, serialized supply
 * and the deterministic stat budget all follow this order.
 *
 * v7.0: Alt-Art added between Full-Art and Mythic — a separately-illustrated
 * alternate printing of a hand-picked existing card (same identity/stats,
 * new art), not a whole new pool of cards. See `rarityBleeds`/CardFaceV4's
 * "Prism Ink" template for its visual treatment.
 */
export const RARITY_ORDER: string[] = [
  'Common',
  'Uncommon',
  'Rare',
  'Super-Rare',
  'Ultra-Rare',
  'Full-Art',
  'Alt-Art',
  'Mythic',
];

/** Position on the ladder, 0-indexed (Common 0 … Alt-Art 6, Mythic 7). */
export function rarityTier(rarity?: string): number {
  return Math.max(0, RARITY_ORDER.indexOf(rarity || 'Common'));
}

/** Short marker printed in the card template's type-line slot. */
export const RARITY_ABBR: Record<string, string> = {
  Common: 'C',
  Uncommon: 'U',
  Rare: 'R',
  'Super-Rare': 'SR',
  'Ultra-Rare': 'UR',
  'Full-Art': 'FA',
  'Alt-Art': 'AA',
  Mythic: 'MY',
};

export function rarityAbbr(rarity?: string): string {
  return RARITY_ABBR[rarity || 'Common'] || RARITY_ABBR.Common;
}

export const RARITY_HEX: Record<string, string> = {
  Common: '#9CA3AF',
  Uncommon: '#22C55E',
  Rare: '#3B82F6',
  'Super-Rare': '#A855F7',
  'Full-Art': '#2DD4BF',
  'Ultra-Rare': '#D4AF37',
  'Alt-Art': '#EC4899',
  Mythic: '#E11D2E',
};

/** Tailwind bg+text classes for chips/badges. */
export const RARITY_CHIP: Record<string, string> = {
  Common: 'bg-[#9CA3AF] text-[#1A1A1A]',
  Uncommon: 'bg-[#22C55E] text-[#052E12]',
  Rare: 'bg-[#3B82F6] text-white',
  'Super-Rare': 'bg-[#A855F7] text-white',
  'Full-Art': 'bg-[#2DD4BF] text-[#042F2C]',
  'Ultra-Rare': 'bg-[#D4AF37] text-[#1A1A1A]',
  'Alt-Art': 'bg-[#EC4899] text-white',
  Mythic: 'bg-[#E11D2E] text-white',
};

/** Text-only variant (colored label on a neutral surface). */
export const RARITY_TEXT: Record<string, string> = {
  Common: 'text-[#9CA3AF]',
  Uncommon: 'text-[#22C55E]',
  Rare: 'text-[#3B82F6]',
  'Super-Rare': 'text-[#A855F7]',
  'Full-Art': 'text-[#2DD4BF]',
  'Ultra-Rare': 'text-[#D4AF37]',
  'Alt-Art': 'text-[#EC4899]',
  Mythic: 'text-[#E11D2E]',
};

/** Border color for card frames — same ladder, used at full strength. */
export const RARITY_BORDER: Record<string, string> = {
  Common: 'border-[#9CA3AF]',
  Uncommon: 'border-[#22C55E]',
  Rare: 'border-[#3B82F6]',
  'Super-Rare': 'border-[#A855F7]',
  'Full-Art': 'border-[#2DD4BF]',
  'Ultra-Rare': 'border-[#D4AF37]',
  'Alt-Art': 'border-[#EC4899]',
  Mythic: 'border-[#E11D2E]',
};

/** Soft glow shadow behind higher-rarity cards (packs, reveals). */
export const RARITY_GLOW: Record<string, string> = {
  Common: '',
  Uncommon: 'shadow-[0_0_18px_4px_rgba(34,197,94,0.35)]',
  Rare: 'shadow-[0_0_22px_6px_rgba(59,130,246,0.4)]',
  'Super-Rare': 'shadow-[0_0_28px_8px_rgba(168,85,247,0.45)]',
  'Full-Art': 'shadow-[0_0_32px_9px_rgba(45,212,191,0.5)]',
  'Ultra-Rare': 'shadow-[0_0_36px_10px_rgba(212,175,55,0.55)]',
  'Alt-Art': 'shadow-[0_0_40px_12px_rgba(236,72,153,0.55)]',
  Mythic: 'shadow-[0_0_45px_14px_rgba(225,29,46,0.6)]',
};

export function rarityChip(rarity?: string): string {
  return RARITY_CHIP[rarity || 'Common'] || RARITY_CHIP.Common;
}
export function rarityBorder(rarity?: string): string {
  return RARITY_BORDER[rarity || 'Common'] || RARITY_BORDER.Common;
}
export function rarityGlow(rarity?: string): string {
  return RARITY_GLOW[rarity || 'Common'] || '';
}

// ---------------------------------------------------------------------------
// v4.3 per-rarity card treatments — special backgrounds/effects for Rare and
// up, culminating in a distinct Mythic template. See CardFaceV4.tsx and the
// .rarity-*/.mythic-* keyframes in index.css.
// ---------------------------------------------------------------------------

/** Card-body background gradient, tinted from the rarity color. Common/Uncommon get none (plain paper). */
export const RARITY_BG: Record<string, string> = {
  Rare: 'linear-gradient(160deg, color-mix(in srgb, #3B82F6 16%, var(--c-paper)) 0%, var(--c-paper) 55%)',
  'Super-Rare':
    'linear-gradient(160deg, color-mix(in srgb, #A855F7 22%, var(--c-paper)) 0%, var(--c-paper) 55%)',
  'Ultra-Rare':
    'linear-gradient(145deg, color-mix(in srgb, #D4AF37 30%, var(--c-paper)) 0%, color-mix(in srgb, #D4AF37 10%, var(--c-paper)) 45%, var(--c-paper) 80%)',
  'Full-Art':
    'linear-gradient(145deg, color-mix(in srgb, #2DD4BF 30%, var(--c-paper)) 0%, color-mix(in srgb, #2DD4BF 10%, var(--c-paper)) 45%, var(--c-paper) 80%)',
  'Alt-Art':
    'linear-gradient(145deg, color-mix(in srgb, #EC4899 32%, var(--c-paper)) 0%, color-mix(in srgb, #EC4899 12%, var(--c-paper)) 45%, var(--c-paper) 80%)',
  Mythic:
    'linear-gradient(150deg, color-mix(in srgb, #E11D2E 26%, var(--c-paper)) 0%, color-mix(in srgb, #FFB300 14%, var(--c-paper)) 50%, var(--c-paper) 85%)',
};

export function rarityBg(rarity?: string): string | undefined {
  return RARITY_BG[rarity || ''];
}

/** True for Super-Rare / Ultra-Rare / Full-Art — the tiers whose card frame
 * gets an animated effect layer. Alt-Art and Mythic sit above these but are
 * deliberately excluded: each has its own dedicated template instead. */
export function rarityAnimated(rarity?: string): boolean {
  return rarity === 'Super-Rare' || rarity === 'Ultra-Rare' || rarity === 'Full-Art';
}

export function isMythic(rarity?: string): boolean {
  return rarity === 'Mythic';
}

/** Alt-Art: a separately-illustrated alternate printing of a hand-picked
 * existing card. Gets its own "Prism Ink" holo template (see CardFaceV4.tsx),
 * distinct from Mythic's looping video and Serialized's rotating rainbow
 * frame. */
export function isAltArt(rarity?: string): boolean {
  return rarity === 'Alt-Art';
}

// ---------------------------------------------------------------------------
// v6.8 card-template predicates — the "Gold Foil" template set (see
// CardFaceV4.tsx). Full-Art, Alt-Art and Mythic print edge-to-edge art with
// the card text floating over it; everything else keeps the framed 4:3 art
// box.
// ---------------------------------------------------------------------------

/** Full-bleed template: art fills the whole card footprint. */
export function rarityBleeds(rarity?: string): boolean {
  return rarity === 'Full-Art' || rarity === 'Alt-Art' || rarity === 'Mythic';
}

/** Super-Rare and up — the framed template's animated art treatments
 * (rarity ghost tint + diagonal foil sweep). */
export function raritySuperPlus(rarity?: string): boolean {
  return rarityTier(rarity) >= rarityTier('Super-Rare');
}

/** Ultra-Rare and up — the diagonal corner ribbon over the art box. */
export function rarityUltraPlus(rarity?: string): boolean {
  return rarityTier(rarity) >= rarityTier('Ultra-Rare');
}

/** Thickness (px) of the template's rarity rule under the art box — the
 * ladder read as a physical weight of ink. */
export function rarityRuleWeight(rarity?: string): number {
  return 1 + rarityTier(rarity);
}
