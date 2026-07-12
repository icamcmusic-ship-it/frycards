/**
 * Runs the v4.2 playtest harness (simulate-v4.ts) against the LIVE Supabase
 * card catalog instead of the bundled generated-cards.ts fallback, so newly
 * added sets get exercised through the same deterministic cost-format
 * assignment (cardpool.ts) and engine (dice-placement rules) as everything
 * else, without needing a full generated-cards.ts regen/commit.
 *
 * Usage:
 *   1. Export the live `cards.template` column to scripts/live-cards.json
 *      (a JSON array of CardTemplate), e.g. via the Supabase SQL editor:
 *        select jsonb_agg(template) from public.cards;
 *   2. npx tsx scripts/simulate-live.ts [gamesPerPairing]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCardPool } from '../src/game/v3/cardpool';
import { CardTemplate } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, 'live-cards.json');
if (!fs.existsSync(dataPath)) {
  console.error(`Missing ${dataPath} — export it first (see the header comment in this file).`);
  process.exit(1);
}
const templates: CardTemplate[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const ok = applyCardPool(templates);
if (!ok) {
  console.error('applyCardPool rejected the live export (no Leaders found).');
  process.exit(1);
}
console.log(`Loaded ${templates.length} live card templates.\n`);

await import('./simulate-v4.ts');
