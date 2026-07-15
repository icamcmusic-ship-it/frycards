/**
 * Global rarity color code — fixed across every theme, since rarity is a
 * collection/economy signal players learn to recognize, not app chrome.
 * Gray -> Green -> Blue -> Purple -> Teal -> Gold -> Red, low to high.
 */
export const RARITY_ORDER: string[] = [
  'Common',
  'Uncommon',
  'Rare',
  'Super-Rare',
  'Full-Art',
  'Ultra-Rare',
  'Mythic',
];

export const RARITY_HEX: Record<string, string> = {
  Common: '#9CA3AF',
  Uncommon: '#22C55E',
  Rare: '#3B82F6',
  'Super-Rare': '#A855F7',
  'Full-Art': '#2DD4BF',
  'Ultra-Rare': '#D4AF37',
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
  Mythic:
    'linear-gradient(150deg, color-mix(in srgb, #E11D2E 26%, var(--c-paper)) 0%, color-mix(in srgb, #FFB300 14%, var(--c-paper)) 50%, var(--c-paper) 85%)',
};

export function rarityBg(rarity?: string): string | undefined {
  return RARITY_BG[rarity || ''];
}

/** True from Super-Rare up — these rarities also get an animated effect layer. */
export function rarityAnimated(rarity?: string): boolean {
  return rarity === 'Super-Rare' || rarity === 'Ultra-Rare' || rarity === 'Full-Art';
}

export function isMythic(rarity?: string): boolean {
  return rarity === 'Mythic';
}
