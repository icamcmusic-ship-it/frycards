/**
 * Pack art by naming convention. The artist drops files at
 *
 *   https://frycards-art.pages.dev/Packs/<pack_slug>/icon.webp     800x1000
 *   https://frycards-art.pages.dev/Packs/<pack_slug>/wrapper.webp  770x960
 *   https://frycards-art.pages.dev/Packs/<pack_slug>/strip.webp    770x160
 *   https://frycards-art.pages.dev/Packs/<pack_slug>/back.webp     770x960
 *   https://frycards-art.pages.dev/Store/hero_<campaign>.webp      2400x800
 *   https://frycards-art.pages.dev/Store/hero_<campaign>_mobile.webp 1080x1080
 *
 * The convention URL is tried first; a 404 falls back to the DB column, then
 * to the CSS PackWrapperFallback — never a bare slate box.
 */
import type { PackType } from '../../lib/supabase';

export const ART_BASE = 'https://frycards-art.pages.dev';

/** "Volume #1 Booster Pack" → "volume_1_booster_pack". */
export function packSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export type PackArtPart = 'icon' | 'wrapper' | 'strip' | 'back';

export function packArtUrl(name: string, part: PackArtPart): string {
  return `${ART_BASE}/Packs/${packSlug(name)}/${part}.webp`;
}

export function heroArtUrl(campaign: string, mobile = false): string {
  return `${ART_BASE}/Store/hero_${packSlug(campaign)}${mobile ? '_mobile' : ''}.webp`;
}

/** Ordered candidates: convention first, then the DB column(s). */
export function packIconCandidates(p: Pick<PackType, 'name' | 'image_url'>): string[] {
  return [packArtUrl(p.name, 'icon'), p.image_url].filter((u): u is string => !!u);
}
export function packWrapperCandidates(
  p: Pick<PackType, 'name' | 'image_url' | 'open_image_url'>,
): string[] {
  return [packArtUrl(p.name, 'wrapper'), p.open_image_url, p.image_url].filter(
    (u): u is string => !!u,
  );
}

/** Wrapper colour for the CSS fallback: colour packs by their pack_group,
 * otherwise by tier. */
const GROUP_COLORS: Record<string, string> = {
  color_ember: '#E4572E',
  color_tide: '#2E86DE',
  color_root: '#3F9D4A',
  color_gale: '#9AD1D4',
  color_light: '#F2C14E',
  color_shadow: '#5B3E8F',
  color_void: '#2B2D42',
};
/** "Void Pack" → "color_void": the colour pack's group from its name, for
 * places that only know the pack's name (the opening animation). */
export function colorGroupFromName(name: string): string | null {
  const m = /^(void|ember|shadow|light|root|gale|tide) pack\b/i.exec(name.trim());
  return m ? `color_${m[1].toLowerCase()}` : null;
}

export function packColor(p: Pick<PackType, 'pack_group' | 'pack_tier' | 'acquisition'>): string {
  if (p.pack_group && GROUP_COLORS[p.pack_group]) return GROUP_COLORS[p.pack_group];
  if (p.acquisition === 'daily_free' || p.pack_tier === 'daily') return '#22C55E';
  if (p.pack_tier === 'box' || /box/i.test(p.pack_tier || '')) return '#A855F7';
  return '#FFD23F';
}
