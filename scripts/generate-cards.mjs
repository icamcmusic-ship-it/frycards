// Regenerate src/game/generated-cards.ts from data/live_cards.csv:
//   node scripts/generate-cards.mjs
//
// The CSV (Title, Flavor Text, Type, Rarity, URL, Set, Color Costs, Keywords)
// provides names, art, types, rarity, real color costs and real keywords from
// the Master Keyword Glossary. Numeric stats (attack / health / generic cost /
// item bonuses / charm duration) are generated deterministically from a name
// hash so the rules are playable. The same templates are seeded into Supabase.
import fs from 'fs';

const raw = fs.readFileSync(new URL('../data/live_cards.csv', import.meta.url), 'utf8');

function parseCSV(text) {
  const rows = []; let i = 0, field = '', row = [], inq = false;
  while (i < text.length) {
    const c = text[i];
    if (inq) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inq = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inq = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCSV(raw);
// Row 0 is blank, row 1 is the header (first two columns are empty).
const header = rows[1];
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
const data = rows.slice(2).filter((r) => r[col['Title']] && r[col['Type']]);

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

const RARITY_TOTAL = { 'Common': 1, 'Uncommon': 2, 'Rare': 3, 'Super-Rare': 4, 'Mythic': 5 };

// Leaders read "None" for Color Costs; assign each a two-element identity that
// together covers all 8 elements and every dual color-cost pairing in the set.
const LEADER_ELEMENTS = {
  'Avatar of the Abyss': ['Dark', 'Nature'],
  'Ethereal Sea Witch': ['Frost', 'Tech'],
  'Mer-King': ['Light', 'Order'],
  'Legendary Diver': ['Flame', 'Chaos'],
};

/** "Order / Light" -> { Order: 1, Light: 1 }; "Nature / Nature" -> { Nature: 2 } */
function parseColorCost(s) {
  const out = {};
  for (const part of (s || '').split('/')) {
    const el = part.trim();
    if (!el || el === 'None') continue;
    out[el] = (out[el] || 0) + 1;
  }
  return out;
}

/** Map CSV keyword strings onto glossary keywords; "Fix 1" -> "Fix <Element>". */
function normalizeKeywords(kwRaw, elements) {
  const list = (kwRaw || '').split(',').map((k) => k.trim()).filter(Boolean);
  return list.map((k) => (k.startsWith('Fix') ? `Fix ${elements[0] || 'Light'}` : k));
}

// Action keywords (glossary §3) that turn an Event card into a structured effect.
const ACTION_EFFECTS = {
  Obliterate: { action: 'obliterate', target: 'unit', text: 'Obliterate target enemy Unit (bypasses Armor, no Parting Shot).' },
  Purge: { action: 'purge', target: 'unit', text: 'Purge target Unit: strip its Items, statuses and buffs.' },
  Meltdown: { action: 'meltdown', target: 'unit', text: "Destroy an Item on target enemy Unit; deal Flame damage equal to the Item's cost to its host." },
};

const EVENT_ACTIONS = [
  { action: 'damage', value: 3, target: 'unit', text: 'Deal 3 damage to target enemy Unit.' },
  { action: 'damage', value: 2, target: 'leader', text: 'Deal 2 damage to the enemy Leader.' },
  { action: 'freeze', target: 'unit', text: 'Freeze target enemy Unit.' },
  { action: 'scorch', value: 2, target: 'unit', text: 'Scorch 2 on target enemy Unit.' },
  { action: 'heal', value: 4, target: 'self', text: 'Heal 4 damage from your Leader.' },
  { action: 'draw', value: 2, text: 'Draw 2 cards.' },
  { action: 'manifest', value: 2, text: 'Manifest a 2/2 Scrap Drone token.' },
  { action: 'buff', value: 2, target: 'friendly', text: 'Give a friendly Unit +2/+2 until end of turn.' },
];

const cards = [];
const seen = new Set();

for (const r of data) {
  const name = r[col['Title']].trim();
  const type = r[col['Type']].trim();
  const rarity = r[col['Rarity']].trim();
  const flavor = (r[col['Flavor Text']] || '').trim();
  const image = (r[col['URL']] || '').trim();
  const set = (r[col['Set']] || '').trim();
  const seed = hash(name);
  let id = slug(name);
  while (seen.has(id)) id += '_2';
  seen.add(id);

  const isLeader = type === 'Leader';
  const elements = isLeader
    ? (LEADER_ELEMENTS[name] || ['Order', 'Light'])
    : Object.keys(parseColorCost(r[col['Color Costs']]));
  const keywords = normalizeKeywords(r[col['Keywords']], elements);

  const card = { id, name, type, elements, rarity, set, keywords, text: flavor, image };

  if (isLeader) {
    card.health = 30 + (seed % 3) * 5; // 30 / 35 / 40
    card.attack = 2 + (seed % 3);      // 2-4
    cards.push(card);
    continue;
  }

  // Cost: printed color pips + generic filler up to the rarity's total cost.
  const colorCost = parseColorCost(r[col['Color Costs']]);
  const total = RARITY_TOTAL[rarity] || 2;
  const pips = Object.values(colorCost).reduce((a, b) => a + b, 0);
  const cost = { ...colorCost };
  if (total > pips) cost.Generic = total - pips;
  card.cost = cost;

  if (type === 'Unit') {
    const tier = RARITY_TOTAL[rarity] || 2;
    card.attack = Math.max(1, tier + (seed % 2) - (tier >= 4 ? 0 : (seed >> 3) % 2));
    card.health = Math.max(1, tier + 1 + ((seed >> 5) % 3));
  } else if (type === 'Item') {
    const tier = RARITY_TOTAL[rarity] || 2;
    card.attach = { attack: Math.floor(tier / 2), health: Math.ceil(tier / 2) + (tier >= 3 ? 1 : 0) };
  } else if (type === 'Location') {
    const LOC = ['ATK_ALL', 'HP_ALL', 'SCORCH_ALL'];
    card.locEffect = LOC[seed % LOC.length];
  } else if (type === 'Charm') {
    card.duration = 1 + (seed % 3); // 1-3 turns (rulebook §3.2)
  } else if (type === 'Event') {
    const actionKw = keywords.find((k) => ACTION_EFFECTS[k.split(' ')[0]]);
    const eff = actionKw ? ACTION_EFFECTS[actionKw.split(' ')[0]] : EVENT_ACTIONS[seed % EVENT_ACTIONS.length];
    card.effect = eff;
    card.text = (flavor ? flavor + ' ' : '') + eff.text;
  }
  cards.push(card);
}

// Sanity: every non-leader card's elements must be covered by exactly one leader.
const leaders = cards.filter((c) => c.type === 'Leader');
for (const c of cards) {
  if (c.type === 'Leader') continue;
  const homes = leaders.filter((l) => c.elements.every((e) => l.elements.includes(e)));
  if (homes.length === 0) console.warn('No leader covers', c.name, c.elements);
}

let out = `// AUTO-GENERATED from data/live_cards.csv. Do not edit by hand.\n`;
out += `// Names, art, types, rarity, color costs and keywords come from the source\n`;
out += `// data; numeric stats are generated deterministically to make the Shifting\n`;
out += `// Multiverse rules playable. This file is the offline fallback for the\n`;
out += `// Supabase 'cards' table.\n`;
out += `import { CardTemplate } from '../types';\n\n`;
out += `export const GENERATED_CARDS: CardTemplate[] = ${JSON.stringify(cards, null, 2)} as CardTemplate[];\n`;
fs.writeFileSync(new URL('../src/game/generated-cards.ts', import.meta.url), out);
console.log('Wrote', cards.length, 'cards (', leaders.length, 'leaders ).');

// Also emit a JSON copy for the Supabase seeding step.
fs.writeFileSync(new URL('../data/cards.generated.json', import.meta.url), JSON.stringify(cards, null, 1));
