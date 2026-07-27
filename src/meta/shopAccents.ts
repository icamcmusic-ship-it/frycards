import { ShopAccent } from '../lib/supabase';
import { COLOR_HEX } from './colors';

/**
 * Storefront accent palette. The first four map onto the app's theme roles (so
 * they re-tint with the player's chosen theme); the rest are the seven Essence
 * colors, which are fixed by design — a Shadow shop should read as Shadow in
 * every theme, the same way rarity colors never move.
 */
export const SHOP_ACCENT_CSS: Record<ShopAccent, string> = {
  yellow: 'var(--c-yellow)',
  red: 'var(--c-red)',
  steel: 'var(--c-steel)',
  ink: 'var(--c-ink)',
  ember: COLOR_HEX.Ember,
  tide: COLOR_HEX.Tide,
  root: COLOR_HEX.Root,
  gale: COLOR_HEX.Gale,
  light: COLOR_HEX.Light,
  shadow: COLOR_HEX.Shadow,
  void: COLOR_HEX.Void,
};

export const SHOP_ACCENT_LABEL: Record<ShopAccent, string> = {
  yellow: 'Signal',
  red: 'Alarm',
  steel: 'Steel',
  ink: 'Midnight',
  ember: 'Ember',
  tide: 'Tide',
  root: 'Root',
  gale: 'Gale',
  light: 'Light',
  shadow: 'Shadow',
  void: 'Void',
};

export function accentCss(accent: ShopAccent | null | undefined): string {
  return SHOP_ACCENT_CSS[(accent || 'yellow') as ShopAccent] ?? SHOP_ACCENT_CSS.yellow;
}

/** Header wash for a storefront: the accent bleeding out of the top-left
 * corner over the ink plate, so the shop's identity is the first thing read. */
export function accentWash(accent: ShopAccent | null | undefined): string {
  const c = accentCss(accent);
  return `linear-gradient(135deg, color-mix(in srgb, ${c} 78%, var(--c-ink)) 0%, color-mix(in srgb, ${c} 26%, var(--c-ink)) 42%, var(--c-ink) 78%)`;
}

/** Quieter version of the same wash for directory cards. */
export function accentCardWash(accent: ShopAccent | null | undefined): string {
  const c = accentCss(accent);
  return `linear-gradient(135deg, color-mix(in srgb, ${c} 32%, var(--c-paper)) 0%, var(--c-paper) 58%)`;
}

/** Deterministic monogram for a shop with no banner image. */
export function shopMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
