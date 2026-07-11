# FryCards — Monochrome & Pop

A digital implementation of the **FryCards** dice-placement trading card game
(Definitive Rulebook v4.2 — see [`docs/RULEBOOK.md`](docs/RULEBOOK.md) for the
full Rules Bible), built with React + Vite + TypeScript in the **Monochrome &
Pop** visual identity (stark comic standard: ink borders, flat offset shadows,
Montserrat 900 headings). Play a full match against a CPU opponent, build
decks, open packs and grow a collection.

## The Game (v4.2, one paragraph)

Two players duel with 30-card decks of Units, Charms, Events and Locations,
each led by a 64-HP Leader. Every turn you roll five d6, reroll any subset
once, then place dice one at a time onto Cast Slots (play a card whose
threshold your die meets), Ability Slots, a Twin card's second slot, or an
Echo recast from Discard — plus one free Location per turn. Dice patterns
(pairs, straights, full houses…) gate Combo cards and trigger Combo bonuses.
Sequential targeted combat, Guard walls, Pierce overflow. Reduce the enemy
Leader to 0 HP to win. There are no resources, mana or elements — the five
dice are the entire economy.

## Run Locally

**Prerequisites:** Node.js

```bash
npm install
npm run dev              # dev server on http://localhost:3000
npm run build            # production build
npm run lint             # eslint
npm run typecheck        # tsc --noEmit
npm run test             # vitest suite (engine rules + deck validation)
npm run sim:v4 -- 20     # CPU-vs-CPU balance simulation (per-archetype)
npm run pattern-hitrate  # measured Combo-pattern hit rates under rerolling
```

## Card Data & Supabase Backend

Cards live in the **Supabase** project `dnngihsbqxccqvvedvjc`, table
`public.cards` (RLS enabled, public read-only). Each row stores only the
card's **universal identity** — name, type, rarity, set, art URL and pure
flavor text (`template` JSON) — no mechanics. The app fetches the live
catalog at startup via `src/lib/supabase.ts` and falls back to the bundled
[`src/game/generated-cards.ts`](src/game/generated-cards.ts) when offline.

All v4.2 game mechanics (Cast Slot thresholds, ATK/HP, keywords, effects,
Leader abilities/Ultimates) are assigned **deterministically client-side** by
[`src/game/v3/cardpool.ts`](src/game/v3/cardpool.ts) from a hash of each
card's id plus its type and rarity — identical on every client, and rebalance
ships as a code change, not a data migration.

**Rarities:** Common, Uncommon, Rare, Super-Rare, Ultra-Rare, Mythic.
Rarity shapes pack odds and gently scales a card's stat/threshold budget;
it carries no other rules weight.

There are 6 Leaders — Avatar of the Abyss, Ethereal Sea Witch, Mer-King,
Legendary Diver, Crimson Vector Commander and Apex Nanite Shinobi — each
with an Ability Slot, a once-per-game Ultimate, and (on the reactive ones)
Resolve. Twelve prebuilt archetype decks plus a randomized-deck generator
live in `src/game/v3/decks.ts`; players build their own 30-card decks (max 3
copies) in the Deck Builder, backed by the `decks` table.

## Meta-game

Accounts (Supabase auth), profiles with gold/gems, a one-time free starter
deck per account, card packs with rarity-slot configs (all opened
server-side via SECURITY DEFINER RPCs), foils, cosmetics (card backs,
banners, avatars), a collection browser and match rewards.

## Engine & Balance

The rules engine is `src/game/v3/engine.ts` (pure, headless, seedable), the
CPU opponent is `src/game/v3/ai.ts`, and `scripts/simulate-v4.ts` runs
CPU-vs-CPU playtests across all archetype matchups with invariant checks
(no negative HP, legal die placements, deck conservation). Rulebook v4.0 →
v4.2 was tuned from ~20k simulated games; see the errata notes at the top of
`docs/RULEBOOK.md` and `docs/ROADMAP.md` for what changed and why.
