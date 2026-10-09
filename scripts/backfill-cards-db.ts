/**
 * Emits SQL that backfills the mechanics columns on public.cards
 * (keywords, essence_cost, essence_types, might, grit, card_subtype, resolve,
 * rules_text) from the deterministic client card pool, so the database rows
 * carry the same mechanics every client derives.
 *
 * FryCards Poker: the column names are the MTG-era schema and are kept. What
 * each now holds is defined once, in `mechanicsFromDef`
 * (src/meta/submissions.ts) — essence_types = the card's colours (unchanged),
 * keywords = def.keywords, might = a power's tier (1–5), card_subtype,
 * rules_text = def.text; essence_cost, grit and resolve are written null
 * (retired with the MTG-style game).
 *
 * Usage: npx tsx scripts/backfill-cards-db.ts > cards-backfill.sql
 */
import { POOL } from '../src/game/poker/cardpool';
import { mechanicsFromDef } from '../src/meta/submissions';

const q = (s: string | null | undefined) =>
  s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`;
const n = (v: number | null | undefined) => (v == null ? 'null' : String(v));
const j = (v: unknown) =>
  v == null ? 'null' : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

for (const c of POOL) {
  const mech = mechanicsFromDef(c);
  const types = mech.essence_types.length
    ? `array[${mech.essence_types.map((x) => `'${x}'`).join(',')}]::text[]`
    : `'{}'::text[]`;
  console.log(
    `update public.cards set essence_cost=${j(mech.essence_cost)}, essence_types=${types}, ` +
      `might=${n(mech.might)}, grit=${n(mech.grit)}, card_subtype=${q(mech.card_subtype)}, ` +
      `resolve=${n(mech.resolve)}, rules_text=${q(mech.rules_text)}, ` +
      `keywords=${q(mech.keywords)}, updated_at=now() ` +
      `where id=${q(c.id)};`,
  );
}
