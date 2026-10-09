/**
 * Audit: report every card in the pool whose printed rules carry no actual
 * poker mechanic, plus any text containing "undefined".
 *
 * FryCards Poker has no vanilla cards: every power (Unit / Item / Event) must
 * print a 1–5 tier and an effect keyword the engine implements, every Leader
 * two nerve abilities, every Location a table rule. Modifier-less powers are
 * legal (most Commons are) and are listed for visibility only.
 *
 * Usage: npx tsx scripts/audit-blank.ts
 */
import { POOL } from '../src/game/poker/cardpool';
import { isPower } from '../src/game/poker/cards';
import { isKeyword, keywordAllowed } from '../src/game/poker/keywords';
import { LOCATION_TEMPLATES } from '../src/game/poker/locations';

const blank: string[] = [];
const undef: string[] = [];
const illegal: string[] = [];
for (const d of POOL) {
  const t = (d.text ?? '').trim();
  if (/undefined/i.test(t) || /undefined/i.test(d.name)) undef.push(`${d.id} [${d.type}] ${t}`);
  let hasMech: boolean;
  if (isPower(d)) {
    hasMech = !!d.tier && d.tier >= 1 && d.tier <= 5 && !!d.effect && isKeyword(d.effect.kw);
    for (const ref of [d.effect, ...(d.mods ?? [])]) {
      if (ref && (!isKeyword(ref.kw) || !keywordAllowed(ref.kw, d.colors)))
        illegal.push(`${d.id} [${d.type}] ${ref.kw} on ${d.colors.join('/') || 'colourless'}`);
    }
  } else if (d.type === 'Leader') {
    hasMech = (d.abilities?.length ?? 0) === 2 && d.abilities!.every((a) => isKeyword(a.effect.kw));
  } else {
    hasMech = !!d.rule && d.rule.id in LOCATION_TEMPLATES;
  }
  if (!t || !hasMech) blank.push(`${d.id} [${d.type}] rarity=${d.rarity} text="${t}"`);
}
console.log(`pool=${POOL.length}`);
console.log(`\n--- no mechanic (${blank.length}) ---`);
for (const l of blank) console.log(l);
console.log(`\n--- undefined in text (${undef.length}) ---`);
for (const l of undef) console.log(l);
console.log(`\n--- keyword not legal for the card's colours (${illegal.length}) ---`);
for (const l of illegal) console.log(l);

// Modifier-less powers (allowed, but list for visibility).
const plain = POOL.filter((d) => isPower(d) && !(d.mods?.length ?? 0));
console.log(`\n--- powers with no modifier (${plain.length}) ---`);
for (const d of plain) console.log(`${d.id} ${d.tier}★ ${d.effect?.kw}`);

if (blank.length || undef.length || illegal.length) process.exitCode = 1;
