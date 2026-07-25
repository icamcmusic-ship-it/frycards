/**
 * Pulls the live `public.cards.template` catalog straight from Supabase and
 * writes it to scripts/live-cards.json, replacing the old manual
 * "run this in the SQL editor and paste the result" step documented in
 * simulate-live.ts.
 *
 * Usage: npx tsx scripts/fetch-cards.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://dnngihsbqxccqvvedvjc.supabase.co';
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_oA36yEu7RVuGR2V65ZzYZA_jhOn52bN';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, 'live-cards.json');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const { data, error } = await supabase.from('cards').select('template').order('id');
if (error) {
  console.error('Failed to fetch cards from Supabase:', error.message);
  process.exit(1);
}

const templates = (data ?? []).map((row) => row.template).filter(Boolean);
if (templates.length === 0) {
  console.error('Fetched zero card templates — aborting without overwriting live-cards.json.');
  process.exit(1);
}

fs.writeFileSync(outPath, JSON.stringify(templates, null, 2) + '\n');
console.log(
  `Wrote ${templates.length} live card templates to ${path.relative(process.cwd(), outPath)}`,
);
