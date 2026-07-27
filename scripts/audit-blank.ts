/**
 * Audit: report every card in the pool whose printed rules text carries no
 * actual mechanic (empty text, or text that is nothing but the flat
 * "Sanctum — exhaust" / vanilla line), plus any text containing "undefined".
 * Units are allowed to be vanilla; every other type is not.
 *
 * Usage: npx tsx scripts/audit-blank.ts
 */
import { POOL_V4 } from '../src/game/v3/cardpool';

const blank: string[] = [];
const undef: string[] = [];
for (const d of POOL_V4) {
  const t = (d.text ?? '').trim();
  if (/undefined/i.test(t) || /undefined/i.test(d.name)) undef.push(`${d.id} [${d.type}] ${t}`);
  const hasMech =
    !!d.onInvoke ||
    !!d.triggers?.length ||
    !!d.keywords?.length ||
    !!d.leaderAbilities?.length ||
    !!d.locPassive ||
    !!d.bond?.might ||
    !!d.bond?.grit ||
    !!d.bond?.grants ||
    !!d.produces;
  if (!t || !hasMech) blank.push(`${d.id} [${d.type}] rarity=${d.rarity} text="${t}"`);
}
console.log(`pool=${POOL_V4.length}`);
console.log(`\n--- no mechanic (${blank.length}) ---`);
for (const l of blank) console.log(l);
console.log(`\n--- undefined in text (${undef.length}) ---`);
for (const l of undef) console.log(l);

// Vanilla units (allowed, but list for visibility)
const vanillaUnits = POOL_V4.filter(
  (d) => d.type === 'Unit' && !d.keywords?.length && !d.onInvoke && !d.triggers?.length,
);
console.log(`\n--- vanilla units (${vanillaUnits.length}) ---`);
for (const d of vanillaUnits) console.log(`${d.id} ${d.might}/${d.grit}`);
