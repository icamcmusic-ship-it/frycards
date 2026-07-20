/**
 * One-off audit for the card-color system (`src/game/v3/colors.ts`) —
 * tabulates how the 292-card pool splits across colors (7 as of v4.14:
 * Crimson/Azure/Verdant/Obsidian/Prism/Solar/Slate) and checks Leader
 * color-identity coverage before/after any redesign. See
 * docs/COLOR_IDENTITY.md.
 *
 * Usage: npx tsx scripts/color-audit.ts
 */
import { POOL_BY_ID } from '../src/game/v3/cardpool';
import { cardColors, COLORS, LEADER_COLORS, isColorLegal } from '../src/game/v3/colors';

const counts: Record<string, number> = {};
const multicolorCount = { n: 0 };
const slateCount = { n: 0 };

for (const id of Object.keys(POOL_BY_ID)) {
  const def = POOL_BY_ID[id];
  if (def.type === 'Leader') continue;
  const colors = cardColors(def);
  if (colors.length > 1) multicolorCount.n++;
  if (colors.length === 1 && colors[0] === 'Slate') slateCount.n++;
  for (const c of colors) counts[c] = (counts[c] || 0) + 1;
}

console.log('--- Color distribution (non-Leader pool) ---');
for (const c of COLORS) console.log(`${c.padEnd(10)} ${counts[c] || 0}`);
console.log(`\nmulticolor cards: ${multicolorCount.n}`);
console.log(`colorless (Slate) cards: ${slateCount.n}`);

console.log('\n--- Leader color identity ---');
for (const [leaderId, identity] of Object.entries(LEADER_COLORS)) {
  console.log(`${leaderId.padEnd(28)} -> ${identity.join('/')}`);
}
// Every identity pair should be unique — a repeated pair means two Leaders
// have zero color differentiation (the v4.13 Avatar/Shinobi bug this pass
// fixed).
const pairKeys = Object.values(LEADER_COLORS).map((c) => [...c].sort().join('/'));
const dupes = pairKeys.filter((k, i) => pairKeys.indexOf(k) !== i);
console.log(
  dupes.length
    ? `!!! duplicate Leader identity pairs: ${[...new Set(dupes)].join(', ')}`
    : '(all 8 Leader identity pairs are unique)',
);

console.log(
  '\n--- Sample: cards illegal under EVERY Leader identity (Slate cards are always legal, never orphans) ---',
);
let orphanCount = 0;
for (const id of Object.keys(POOL_BY_ID)) {
  const def = POOL_BY_ID[id];
  if (def.type === 'Leader') continue;
  const legalSomewhere = Object.values(LEADER_COLORS).some((identity) =>
    isColorLegal(def, identity),
  );
  if (!legalSomewhere) {
    orphanCount++;
    if (orphanCount <= 10) console.log(`  ${def.name} (${cardColors(def).join('/')})`);
  }
}
console.log(`total orphan cards (legal under no Leader identity): ${orphanCount}`);
