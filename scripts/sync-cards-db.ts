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
 * v13: this is override-aware without needing to know about overrides. The
 * `template` column is written verbatim from the bundled template (which
 * carries any `overrides` object), and the mechanics columns come from
 * `POOL_BY_ID`, which is the pool AFTER `mapCard` has layered them on — so a
 * Creator-overridden card syncs as the card the game actually prints.
 *
 * FryCards Poker: the mechanics column NAMES are the MTG-era schema and are
 * kept (renaming them is a migration). Their poker values come from
 * `mechanicsFromDef` (src/meta/submissions.ts), the same mapping the Creator
 * tools write: essence_types = the card's colours (unchanged), keywords =
 * def.keywords, might = a power's tier (1–5; null for Leaders/Locations),
 * card_subtype, rules_text = def.text; essence_cost, grit and resolve are
 * written null (retired).
 *
 * Usage: npx tsx scripts/sync-cards-db.ts > cards-sync.sql
 */
import { GENERATED_CARDS } from '../src/game/generated-cards';
import { POOL_BY_ID } from '../src/game/poker/cardpool';
import { mechanicsFromDef } from '../src/meta/submissions';

const q = (s: string | null | undefined) =>
  s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`;
const n = (v: number | null | undefined) => (v == null ? 'null' : String(v));
const j = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

for (const t of GENERATED_CARDS) {
  const c = POOL_BY_ID[t.id];
  const mech = mechanicsFromDef(c);
  const colors = mech.essence_types;
  console.log(
    `insert into public.cards (id, name, card_type, rarity, set_name, flavor_text, image_url, ` +
      `keywords, template, essence_cost, essence_types, might, grit, card_subtype, resolve, rules_text) values (` +
      `${q(t.id)}, ${q(t.name)}, ${q(t.type)}, ${q(t.rarity)}, ${q(t.set)}, ${q(t.flavor)}, ${q(t.image)}, ` +
      `${q(mech.keywords)}, ${j(t)}, ` +
      `${mech.essence_cost == null ? 'null' : j(mech.essence_cost)}, ` +
      `${colors.length ? `array[${colors.map((x) => `'${x}'`).join(',')}]::text[]` : `'{}'::text[]`}, ` +
      `${n(mech.might)}, ${n(mech.grit)}, ${q(mech.card_subtype)}, ${n(mech.resolve)}, ${q(mech.rules_text)}) ` +
      `on conflict (id) do update set name=excluded.name, card_type=excluded.card_type, ` +
      `rarity=excluded.rarity, set_name=excluded.set_name, flavor_text=excluded.flavor_text, ` +
      `image_url=excluded.image_url, keywords=excluded.keywords, template=excluded.template, ` +
      `essence_cost=excluded.essence_cost, essence_types=excluded.essence_types, ` +
      `might=excluded.might, grit=excluded.grit, card_subtype=excluded.card_subtype, ` +
      `resolve=excluded.resolve, rules_text=excluded.rules_text, updated_at=now();`,
  );
}
