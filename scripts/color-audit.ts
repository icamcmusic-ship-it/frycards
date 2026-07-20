/**
 * v4.13: one-off audit for the new card-color system (`src/game/v3/colors.ts`)
 * — tabulates how the 292-card pool splits across the 5 colors before deck
 * legality gets wired up around it, and how many cards hit the keyword-less
 * fallback path. See docs/COLOR_IDENTITY.md.
 *
 * Usage: npx tsx scripts/color-audit.ts
 */
import { POOL_BY_ID } from '../src/game/v3/cardpool';
import { cardColors, COLORS, LEADER_COLORS, isColorLegal } from '../src/game/v3/colors';

const counts: Record<string, number> = {};
const multicolorCount = { n: 0 };
const colorlessCount = { n: 0 };
const fallbackCount = { n: 0 };

for (const id of Object.keys(POOL_BY_ID)) {
  const def = POOL_BY_ID[id];
  if (def.type === 'Leader') continue;
  const colors = cardColors(def);
  if (colors.length === 0) {
    colorlessCount.n++;
    continue;
  }
  if (colors.length > 1) multicolorCount.n++;
  for (const c of colors) counts[c] = (counts[c] || 0) + 1;
  // fallback path fired if no keyword mapped to a color but onCast did
  const kwHit = (def.keywords || []).some((k) =>
    ['Frenzy','Swift','Pierce','Overrun','Guard','Ward','Bulwark','Toll','Anchor','Excavate','Scrap','Tribute','Echo','Avenge','Steel','Aftershock','Twin','Rally','Crescendo','Foothold','Contested','Snap'].includes(k),
  );
  if (!kwHit) fallbackCount.n++;
}

console.log('--- Color distribution (non-Leader pool) ---');
for (const c of COLORS) console.log(`${c.padEnd(10)} ${counts[c] || 0}`);
console.log(`\nmulticolor cards: ${multicolorCount.n}`);
console.log(`colorless cards (no keyword, no onCast fallback match): ${colorlessCount.n}`);
console.log(`fallback-by-onCast-action cards: ${fallbackCount.n}`);

console.log('\n--- Leader color identity legality check (own-archetype keywords) ---');
for (const [leaderId, identity] of Object.entries(LEADER_COLORS)) {
  console.log(`${leaderId.padEnd(28)} -> ${identity.join('/')}`);
}

console.log('\n--- Sample: cards illegal under EVERY Leader identity (need a fallback color or a 6th color) ---');
let orphanCount = 0;
for (const id of Object.keys(POOL_BY_ID)) {
  const def = POOL_BY_ID[id];
  if (def.type === 'Leader') continue;
  const legalSomewhere = Object.values(LEADER_COLORS).some((identity) => isColorLegal(def, identity));
  if (!legalSomewhere) {
    orphanCount++;
    if (orphanCount <= 10) console.log(`  ${def.name} (${cardColors(def).join('/')})`);
  }
}
console.log(`total orphan cards (legal under no Leader identity): ${orphanCount}`);
