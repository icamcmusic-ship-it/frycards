import { CardTemplate } from '../types';

// Public (publishable) credentials for the card-data backend. These are safe
// to ship in the client; the `cards` table is read-only for anonymous users
// via RLS. Override with VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.
const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL || 'https://dnngihsbqxccqvvedvjc.supabase.co';
const SUPABASE_KEY =
  (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_oA36yEu7RVuGR2V65ZzYZA_jhOn52bN';

/**
 * Load the live card pool from the Supabase `cards` table. Each row stores the
 * raw CSV fields plus a fully-resolved `template` (CardTemplate) used by the
 * game engine. Returns null on any failure so callers can fall back to the
 * bundled card set.
 */
export async function fetchCardTemplates(): Promise<CardTemplate[] | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/cards?select=template&order=id.asc`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) return null;
    const rows: { template: CardTemplate | null }[] = await res.json();
    const templates = rows.map((r) => r.template).filter((t): t is CardTemplate => !!t && !!t.id);
    return templates.length > 0 ? templates : null;
  } catch {
    return null;
  }
}
