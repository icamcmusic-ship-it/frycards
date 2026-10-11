/**
 * CPU buyer personas — client mirror of `cpu_buyer_personas`
 * (20261013000100). Display data only: badge, archetype tag, name pool and
 * bid style. Pricing lives on the server. Dialogue is in ./dialogue (a lazy
 * chunk); this file stays small enough for any screen to import.
 */

export type BidStyle = 'sniper' | 'early_bird' | 'steady' | 'bluffer';

export interface BuyerPersona {
  id: string;
  archetype: string;
  badge: string;
  /** Badge background — a palette token so INK and light themes both read. */
  tone: string;
  names: string[];
  bidStyle: BidStyle;
}

const P = (
  id: string,
  archetype: string,
  badge: string,
  tone: string,
  names: string[],
  bidStyle: BidStyle,
): BuyerPersona => ({ id, archetype, badge, tone, names, bidStyle });

export const BUYER_PERSONAS: BuyerPersona[] = [
  P(
    'tightfist',
    'Tight-Fisted Collector',
    '🧐',
    'var(--c-steel)',
    ['Collector Vex', 'Penny Pinchwell', 'Miser Mott'],
    'sniper',
  ),
  P(
    'kid',
    'Impulsive Kid',
    '🧒',
    'var(--c-yellow)',
    ['Rookie Dax', 'Little Fizz', 'Kip Sparkle'],
    'early_bird',
  ),
  P(
    'slabsnob',
    'Slab Snob',
    '🎩',
    'var(--c-paper)',
    ['The Appraiser', 'Lord Casewell', 'Grader Greer'],
    'steady',
  ),
  P(
    'foilhunter',
    'Foil Hunter',
    '✨',
    'var(--c-yellow)',
    ['Glint Mags', 'Shimmer Sue', 'Holo Hank'],
    'early_bird',
  ),
  P(
    'completer',
    'Set Completer',
    '📒',
    'var(--c-paper)',
    ['Checklist Chen', 'Binder Bea', 'Ollie Index'],
    'steady',
  ),
  P(
    'flipper',
    'Flipper',
    '💸',
    'var(--c-steel)',
    ['Pip the Flipper', 'Resell Russ', 'Margin Mo'],
    'sniper',
  ),
  P(
    'veteran',
    'Nostalgic Veteran',
    '👴',
    'var(--c-paper)',
    ['Old Man Brine', 'Nana Glim', 'Grandpa Gristle'],
    'steady',
  ),
  P(
    'pristine',
    'Pristine Chaser',
    '💎',
    'var(--c-paper)',
    ['Mint Marisol', 'Ten Tobias', 'Perfecta Prim'],
    'sniper',
  ),
  P(
    'bargain',
    'Bargain Bin Diver',
    '🪣',
    'var(--c-steel)',
    ['Bin Diver Bo', 'Thrifty Thea', 'Scraps McGee'],
    'sniper',
  ),
  P(
    'whale',
    'Whale',
    '🐋',
    'var(--c-yellow)',
    ['Baron Sable', 'Duchess Goldleaf', 'Mr. Moneybags'],
    'early_bird',
  ),
  P(
    'gambler',
    'Superstitious Gambler',
    '🎲',
    'var(--c-yellow)',
    ['Lucky Lou', 'Madame Seven', 'Dice Delia'],
    'bluffer',
  ),
  P(
    'rival',
    'Rival Shopkeeper',
    '🏪',
    'var(--c-steel)',
    ['Shade Dealer', 'Void Clerk', 'Cutthroat Cass'],
    'bluffer',
  ),
  P(
    'tourist',
    'Tourist',
    '📸',
    'var(--c-paper)',
    ['Wanda Wander', 'Snapshot Sam', 'Backpack Bex'],
    'early_bird',
  ),
  P(
    'loyal_ember',
    'Ember Loyalist',
    '🔥',
    'var(--c-ember, var(--c-yellow))',
    ['Ember Annie', 'Cinder Cole', 'Blaze Bianca'],
    'bluffer',
  ),
  P(
    'loyal_gale',
    'Gale Loyalist',
    '🌪️',
    'var(--c-gale, var(--c-paper))',
    ['Madame Gale', 'Zephyr Zed', 'Breezy Bree'],
    'steady',
  ),
  P(
    'loyal_light',
    'Light Loyalist',
    '☀️',
    'var(--c-light, var(--c-yellow))',
    ['Lumen Kid', 'Halo Hal', 'Dawn Daria'],
    'early_bird',
  ),
  P(
    'loyal_root',
    'Root Loyalist',
    '🌿',
    'var(--c-root, var(--c-paper))',
    ['Sir Rootsworth', 'Moss Mabel', 'Bramble Ben'],
    'steady',
  ),
  P(
    'loyal_shadow',
    'Shadow Loyalist',
    '🌑',
    'var(--c-shadow, var(--c-steel))',
    ['Umbra Ula', 'Shady Silas', 'Nox Nora'],
    'sniper',
  ),
  P(
    'loyal_tide',
    'Tide Loyalist',
    '🌊',
    'var(--c-tide, var(--c-paper))',
    ['Captain Tidewell', 'Coral Cora', 'Surf Sully'],
    'steady',
  ),
  P(
    'loyal_void',
    'Void Loyalist',
    '🕳️',
    'var(--c-void, var(--c-steel))',
    ['Null Nell', 'Abyss Abe', 'Hollow Hugo'],
    'bluffer',
  ),
];

export const PERSONA_BY_ID: Record<string, BuyerPersona> = Object.fromEntries(
  BUYER_PERSONAS.map((p) => [p.id, p]),
);

const BY_NAME: Record<string, BuyerPersona> = Object.fromEntries(
  BUYER_PERSONAS.flatMap((p) => p.names.map((n) => [n, p])),
);

/** Resolve a persona from an id (shop customers) or a display name (auction bidders). */
export function resolvePersona(id?: string | null, name?: string | null): BuyerPersona | undefined {
  return (id && PERSONA_BY_ID[id]) || (name ? BY_NAME[name] : undefined);
}

export const BID_STYLE_LABEL: Record<BidStyle, string> = {
  sniper: 'Sniper',
  early_bird: 'Early bird',
  steady: 'Steady raiser',
  bluffer: 'Bluffer',
};

/** Initials for the badge fallback (and screen readers that skip emoji). */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
}

/** Mood bands for the meter (server mood_score is 0–100). */
export function moodBand(score: number): { label: string; tone: string } {
  if (score >= 70) return { label: 'Delighted', tone: 'var(--c-yellow)' };
  if (score >= 50) return { label: 'Keen', tone: 'var(--c-paper)' };
  if (score >= 30) return { label: 'Wary', tone: 'var(--c-steel)' };
  return { label: 'Fuming', tone: 'var(--c-black)' };
}
