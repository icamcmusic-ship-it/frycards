/**
 * Emits SQL that upserts the FULL public.cards catalog from the bundled
 * universal identities in generated-cards.ts plus the deterministic mechanics
 * every client derives from them.
 *
 * This supersedes backfill-cards-db.ts for catalog changes: that script only
 * rewrote the mechanics columns of rows that already existed, so it could not
 * add a new card, rename one, or move it to a different type/rarity. Run it
 * whenever generated-cards.ts changes so the live catalog and the offline
 * fallback stay byte-identical.
 *
 * Usage: npx tsx scripts/sync-cards-db.ts > cards-sync.sql
 */
import { GENERATED_CARDS } from '../src/game/generated-cards';
import { POOL_BY_ID } from '../src/game/v3/cardpool';
import { cardColors } from '../src/game/v3/colors';

const q = (s: string | null | undefined) =>
  s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`;
const n = (v: number | null | undefined) => (v == null ? 'null' : String(v));
const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

for (const t of GENERATED_CARDS) {
  const c = POOL_BY_ID[t.id];
  const colors = cardColors(c);
  console.log(
    `insert into public.cards (id, name, card_type, rarity, set_name, flavor_text, image_url, ` +
      `keywords, template, essence_cost, essence_types, might, grit, card_subtype, resolve, rules_text) values (` +
      `${q(t.id)}, ${q(t.name)}, ${q(t.type)}, ${q(t.rarity)}, ${q(t.set)}, ${q(t.flavor)}, ${q(t.image)}, ` +
      `${q((c.keywords ?? []).join(', ') || null)}, ${j(t)}, ` +
      `${c.cost ? j(c.cost) : 'null'}, ` +
      `${colors.length ? `array[${colors.map((x) => `'${x}'`).join(',')}]::text[]` : `'{}'::text[]`}, ` +
      `${n(c.might)}, ${n(c.grit)}, ${q(c.subtype)}, ${n(c.resolve)}, ${q(c.text)}) ` +
      `on conflict (id) do update set name=excluded.name, card_type=excluded.card_type, ` +
      `rarity=excluded.rarity, set_name=excluded.set_name, flavor_text=excluded.flavor_text, ` +
      `image_url=excluded.image_url, keywords=excluded.keywords, template=excluded.template, ` +
      `essence_cost=excluded.essence_cost, essence_types=excluded.essence_types, ` +
      `might=excluded.might, grit=excluded.grit, card_subtype=excluded.card_subtype, ` +
      `resolve=excluded.resolve, rules_text=excluded.rules_text, updated_at=now();`,
  );
}
