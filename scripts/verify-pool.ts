/**
 * Card-catalog drift guard.
 *
 * Three sources have to agree about every card, and until v6.9 nothing
 * checked that they did:
 *
 *   1. `public.cards.template` (jsonb) — what the live client actually loads
 *      and derives all mechanics from.
 *   2. `public.cards.rarity` (column) — what every server RPC prices, rolls
 *      pack odds against, caps deck copies by and quicksells at.
 *   3. `src/game/generated-cards.ts` — the bundled offline fallback, and the
 *      catalog every sim in scripts/simulate-v5.ts runs over.
 *
 * A v6.8 rarity migration was applied to (1) for six cards and to (2) for a
 * different four, leaving all three sources disagreeing. Because a card's
 * mechanics are hashed from `id|type|rarity`, that silently gave four cards
 * ENTIRELY different costs, stats and keywords in the live game than in
 * every balance sim, while six others were priced a full rarity tier too
 * cheap by the economy. Nothing surfaced it; the findings doc had recorded
 * "identical digests" from a check that only ever compared (3) to itself.
 *
 * Usage: npx tsx scripts/verify-pool.ts
 * Exits non-zero on any drift, so it can gate a release.
 *
 * v20 — OFFLINE MODE, and why it had to exist.
 *
 * This guard has not run since v17. v18 and v19 both recorded the same
 * carry-forward: "`npm run verify:pool` still could not run — the Supabase
 * host is outside this sandbox's network allowlist", and v19 argued from the
 * code path instead ("no shipped change touches a `cards` column"). That
 * argument was wrong about the pass before it. v18 repriced Sovereign of the
 * Dying Star 5 -> 4 in `LEADER_COST_OVERRIDE`, which is exactly a `cards`
 * column change, and `cards.essence_cost` still read `{generic: 3}` two passes
 * later — the one drift in 297 cards, sitting in the column every server-side
 * reader prices from, invisible for two passes because the check that finds it
 * could not reach the network.
 *
 * A guard that only runs where there is egress is a guard that does not run.
 * Set POOL_SNAPSHOT to a JSON file and this checks that instead of fetching:
 *
 *   POOL_SNAPSHOT=/tmp/cards.json npx tsx scripts/verify-pool.ts
 *
 * The file is the raw row array — exactly what the SELECT below returns — so
 * it can be produced from any SQL console with:
 *
 *   select json_agg(t) from (
 *     select id, rarity, card_type, template, keywords, essence_cost,
 *            might, grit, resolve, card_subtype, rules_text
 *     from cards order by id) t;
 *
 * The two paths run the identical checks; only the source of the rows differs.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { GENERATED_CARDS } from '../src/game/generated-cards';
import { POOL_BY_ID } from '../src/game/v3/cardpool';
import type { EssenceCost } from '../src/game/v3/cards';
import type { CardTemplate } from '../src/types';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://dnngihsbqxccqvvedvjc.supabase.co';
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_oA36yEu7RVuGR2V65ZzYZA_jhOn52bN';

interface Row {
  id: string;
  rarity: string | null;
  card_type: string | null;
  template: CardTemplate | null;
  // v7.6: the DERIVED mechanics columns. Every balance pass rewrites these in
  // code, and nothing checked that the database had been told.
  keywords: string | null;
  essence_cost: EssenceCost | null;
  might: number | null;
  grit: number | null;
  resolve: number | null;
  card_subtype: string | null;
  rules_text: string | null;
}

/** The identity fields a card's deterministic mechanics are hashed from. */
const digest = (id: string, type?: string, rarity?: string): string =>
  `${id}|${type ?? ''}|${rarity ?? 'Common'}`;

const SNAPSHOT = process.env.POOL_SNAPSHOT;

async function loadRows(): Promise<Row[]> {
  if (SNAPSHOT) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
    } catch (e) {
      console.error(`Could not read POOL_SNAPSHOT=${SNAPSHOT}:`, (e as Error).message);
      process.exit(1);
    }
    if (!Array.isArray(parsed)) {
      console.error(`POOL_SNAPSHOT=${SNAPSHOT} is not a JSON array of card rows.`);
      process.exit(1);
    }
    console.log(`Reading the live catalog from a snapshot: ${SNAPSHOT}`);
    return parsed as Row[];
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase
    .from('cards')
    .select(
      'id, rarity, card_type, template, keywords, essence_cost, might, grit, resolve, card_subtype, rules_text',
    )
    .order('id');
  if (error) {
    console.error('Failed to fetch cards from Supabase:', error.message);
    console.error(
      'No egress to the Supabase host? Export a snapshot and re-run with POOL_SNAPSHOT — see the header.',
    );
    process.exit(1);
  }
  return (data ?? []) as Row[];
}

const rows = await loadRows();
if (rows.length === 0) {
  console.error('Fetched zero cards — refusing to report parity on an empty result.');
  process.exit(1);
}

const problems: string[] = [];

// 1. Column vs template, per row.
for (const r of rows) {
  if (!r.template) {
    problems.push(`${r.id}: no template jsonb (the client cannot load this card)`);
    continue;
  }
  const t = r.template;
  if ((r.rarity ?? 'Common') !== (t.rarity ?? 'Common')) {
    problems.push(
      `${r.id}: cards.rarity="${r.rarity}" but template.rarity="${t.rarity}" ` +
        `— the client prints one tier and the economy prices another`,
    );
  }
  if (r.card_type && t.type && r.card_type !== t.type) {
    problems.push(`${r.id}: cards.card_type="${r.card_type}" but template.type="${t.type}"`);
  }
  if (t.id !== r.id) problems.push(`${r.id}: template.id="${t.id}" does not match the row id`);
}

// 2. Live template set vs the bundled fallback the sims run on.
const live = new Map(rows.filter((r) => r.template).map((r) => [r.id, r.template!]));
const bundled = new Map(GENERATED_CARDS.map((c) => [c.id, c]));

for (const [id, t] of live) {
  const b = bundled.get(id);
  if (!b) {
    problems.push(`${id}: live-only — missing from generated-cards.ts (run npm run fetch:cards)`);
    continue;
  }
  const a = digest(id, t.type, t.rarity);
  const c = digest(id, b.type, b.rarity);
  if (a !== c) problems.push(`${id}: live "${a}" vs bundled "${c}" — mechanics will differ`);
}
for (const id of bundled.keys()) {
  if (!live.has(id)) problems.push(`${id}: bundled-only — no longer in the live catalog`);
}

/**
 * 3. v7.6 — the DERIVED mechanics columns against the pool every client
 * actually derives.
 *
 * These columns exist so the server can answer "what is this card" without
 * running the client's assignment code, and `sync-cards-db.ts` fills them from
 * exactly that code. But nothing checked them, and a check of the first seven
 * cards this pass touched found the live catalog two full balance passes
 * behind: Void Mother still printed Resolve 6 with a `-2: Banish` after v7.5
 * moved it to 5 and -4, and The Wolf of Wall Street still printed a keywordless
 * 6/6 with `-2/-2` after v7.5 gave it Unbreakable, 5/5 and -1/-1.
 *
 * `template` was in parity the whole time, which is why the existing checks
 * were quiet — the client derives its mechanics from the template and was
 * therefore correct. What was wrong was every server-side reader of these
 * columns. A balance pass is not finished until `npm run db:sync` has been
 * applied, and this is the check that says so.
 */
const norm = (s: string | null | undefined) => (s == null || s === '' ? null : s);
// A plain `JSON.stringify` comparison is sensitive to key order, and jsonb's
// canonical output order (shortest key first) never matches the field order
// an object literal like `{ generic, pips }` produces — so it flagged every
// single card's essence_cost as "drift" even when the values agreed, burying
// the one real mismatch this check exists to catch in 296 false positives.
// Sort keys recursively before comparing so only an actual value differs.
const canonical = (v: unknown): unknown =>
  v !== null && typeof v === 'object'
    ? Array.isArray(v)
      ? v.map(canonical)
      : Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, val]) => [k, canonical(val)]),
        )
    : v;
for (const r of rows) {
  const c = POOL_BY_ID[r.id];
  if (!c) continue; // covered by the live-only check above
  const expectKw = (c.keywords ?? []).join(', ') || null;
  if (norm(r.keywords) !== expectKw)
    problems.push(`${r.id}: cards.keywords="${r.keywords}" but the pool derives "${expectKw}"`);
  if (
    JSON.stringify(canonical(r.essence_cost ?? null)) !== JSON.stringify(canonical(c.cost ?? null))
  )
    problems.push(
      `${r.id}: cards.essence_cost=${JSON.stringify(r.essence_cost)} but the pool derives ` +
        `${JSON.stringify(c.cost)}`,
    );
  if ((r.might ?? null) !== (c.might ?? null) || (r.grit ?? null) !== (c.grit ?? null))
    problems.push(
      `${r.id}: cards stats ${r.might}/${r.grit} but the pool derives ${c.might}/${c.grit}`,
    );
  if ((r.resolve ?? null) !== (c.resolve ?? null))
    problems.push(`${r.id}: cards.resolve=${r.resolve} but the pool derives ${c.resolve}`);
  if (norm(r.card_subtype) !== (c.subtype ?? null))
    problems.push(
      `${r.id}: cards.card_subtype="${r.card_subtype}" but the pool derives ${c.subtype}`,
    );
  if (norm(r.rules_text) !== norm(c.text))
    problems.push(
      `${r.id}: cards.rules_text is stale — "${r.rules_text}" vs "${c.text}" (run npm run db:sync)`,
    );
}

console.log(
  `Live catalog: ${rows.length} cards. Bundled catalog: ${GENERATED_CARDS.length} cards.`,
);
if (problems.length === 0) {
  console.log(
    'Pool parity OK — template, rarity column, bundled catalog and the derived ' +
      'mechanics columns all agree.',
  );
  process.exit(0);
}
console.error(`\n${problems.length} drift problem(s):`);
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
