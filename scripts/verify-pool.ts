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
 */
import { createClient } from '@supabase/supabase-js';
import { GENERATED_CARDS } from '../src/game/generated-cards';
import type { CardTemplate } from '../src/types';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://dnngihsbqxccqvvedvjc.supabase.co';
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_oA36yEu7RVuGR2V65ZzYZA_jhOn52bN';

interface Row {
  id: string;
  rarity: string | null;
  card_type: string | null;
  template: CardTemplate | null;
}

/** The identity fields a card's deterministic mechanics are hashed from. */
const digest = (id: string, type?: string, rarity?: string): string =>
  `${id}|${type ?? ''}|${rarity ?? 'Common'}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const { data, error } = await supabase
  .from('cards')
  .select('id, rarity, card_type, template')
  .order('id');

if (error) {
  console.error('Failed to fetch cards from Supabase:', error.message);
  process.exit(1);
}
const rows = (data ?? []) as Row[];
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

console.log(`Live catalog: ${rows.length} cards. Bundled catalog: ${GENERATED_CARDS.length} cards.`);
if (problems.length === 0) {
  console.log('Pool parity OK — template, rarity column and bundled catalog all agree.');
  process.exit(0);
}
console.error(`\n${problems.length} drift problem(s):`);
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
