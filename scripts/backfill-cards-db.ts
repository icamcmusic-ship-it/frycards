/**
 * Emits SQL that backfills the mechanics columns on public.cards
 * (essence_cost, essence_types, might, grit, card_subtype, resolve,
 * rules_text) from the deterministic client card pool, so the database rows
 * carry the same mechanics every client derives.
 *
 * Usage: npx tsx scripts/backfill-cards-db.ts > cards-backfill.sql
 */
import { POOL_V4 } from '../src/game/v3/cardpool';
import { cardColors } from '../src/game/v3/colors';

const q = (s: string | null | undefined) =>
  s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`;
const n = (v: number | null | undefined) => (v == null ? 'null' : String(v));

for (const c of POOL_V4) {
  const colors = cardColors(c);
  const cost = c.cost ? `'${JSON.stringify(c.cost).replace(/'/g, "''")}'::jsonb` : 'null';
  const types = colors.length
    ? `array[${colors.map((x) => `'${x}'`).join(',')}]::text[]`
    : `'{}'::text[]`;
  console.log(
    `update public.cards set essence_cost=${cost}, essence_types=${types}, ` +
      `might=${n(c.might)}, grit=${n(c.grit)}, card_subtype=${q(c.subtype)}, ` +
      `resolve=${n(c.resolve)}, rules_text=${q(c.text)}, ` +
      `keywords=${q((c.keywords ?? []).join(', ') || null)}, updated_at=now() ` +
      `where id=${q(c.id)};`,
  );
}
