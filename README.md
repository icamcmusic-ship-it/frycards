# FryCards — Monochrome & Pop

A digital implementation of the **FryCards** essence-based trading card game
(Rulebook v6.x — see [`docs/RULEBOOK.md`](docs/RULEBOOK.md) for the full
Rules Bible), built with React + Vite + TypeScript in the **Monochrome & Pop**
visual identity (stark comic standard: ink borders, flat offset shadows,
Montserrat 900 headings). Play a full match against a CPU opponent, build
decks, open packs and grow a collection.

## The Game (v5, one paragraph)

Two players duel with 60+-card decks of Units, Charms, Events and Locations,
each led by a Leader with **Resolve**-fueled abilities and 20 starting
**Vitality**. Locations exhaust for **Essence** of one of seven types (Ember,
Tide, Root, Gale, Light, Shadow, Void); a card's Essence Cost is paid with
colored pips of matching Essence plus a generic amount from anything. Each
turn runs Dawn (untap, draw) → Main Phase I → Clash → Main Phase II → Dusk
(shed to 7). Who takes the first turn is a coin flip; the player on the draw
plays a second (exhausted) Wellspring on their opening turn to offset it. In
Clash, attackers are declared, the defender assigns
Guards, and a reaction window lets Quick Events and Ambush units respond
before damage resolves. Keywords include Aerial, Overrun, Quickstrike,
Doublestrike, Venomous, Siphon, Alert, Reckless, Swarmproof, Skywatch,
Warded, Unbreakable, Ambush and Immobile. Reduce the opponent's Vitality to 0,
or make them draw from an empty deck, to win.

## Run Locally

**Prerequisites:** Node.js

```bash
npm install
npm run dev              # dev server on http://localhost:3000
npm run build            # production build
npm run lint             # eslint
npm run typecheck        # tsc --noEmit
npm run test             # vitest suite (engine rules + deck validation)
npx tsx scripts/simulate-v5.ts 4 24   # CPU-vs-CPU balance simulation (games/pairing, deck count)
```

## Card Data & Supabase Backend

Cards live in the **Supabase** project `dnngihsbqxccqvvedvjc`, table
`public.cards` (RLS enabled, public read-only). Each row stores only the
card's **universal identity** — name, type, rarity, set, art URL and pure
flavor text (`template` JSON) — no mechanics. The app fetches the live
catalog at startup via `src/lib/supabase.ts` and falls back to the bundled
[`src/game/generated-cards.ts`](src/game/generated-cards.ts) when offline.

All v5 game mechanics (Essence Cost, Might/Grit, keywords, effects, Leader
Resolve/abilities) are assigned **deterministically client-side** by
[`src/game/v3/cardpool.ts`](src/game/v3/cardpool.ts) from a hash of each
card's id plus its type and rarity — identical on every client, and rebalance
ships as a code change, not a data migration.

**Rarities:** Common, Uncommon, Rare, Super-Rare, Ultra-Rare, Full-Art,
Mythic (v6.8: Full-Art sits ABOVE Ultra-Rare — second-rarest, behind Mythic
only). Rarity shapes pack odds and gently scales a card's stat/cost budget;
it carries no other rules weight. Full-Art prints edge-to-edge still art and
Mythic prints edge-to-edge looping video; everything else uses the framed
template (see `src/components/CardFaceV4.tsx`).

There are 8 Leaders — Avatar of the Abyss, Ethereal Sea Witch, Mer-King,
Legendary Diver, Crimson Vector Commander, Apex Nanite Shinobi, Ruin-Walker
Overseer and Sovereign of the Dying Star — each with a fixed two-color
Essence identity, Resolve, and two Leader abilities (a Resolve-spending
ability and a small Resolve-building one). A randomized-deck generator lives
in `src/game/v3/decks.ts` (used for guest play and the Starter Box); players
build their own 60+-card decks (max 4 copies per card, tighter caps at
higher rarity) in the Deck Builder, backed by the `decks` table.

## Meta-game

Accounts (Supabase auth), profiles with gold/gems, a one-time Starter Box
claim per account (pick a Leader, get a full legal 60-card deck), a choice
of three prebuilt starter decks in the shop for new accounts, card packs
with rarity-slot configs (all opened server-side via SECURITY DEFINER
RPCs), foils, cosmetics (card backs, banners, avatars), a collection
browser and match rewards.

## Engine & Balance

The rules engine is `src/game/v3/engine.ts` (pure, headless, seedable), the
CPU opponent is `src/game/v3/ai.ts`, and `scripts/simulate-v5.ts` runs
CPU-vs-CPU playtests across randomized archetype matchups with invariant
checks (no runaway Vitality, hand-limit/duplicate-iid checks, deck
conservation) plus CPU decision-quality and keyword/cost-tier balance
telemetry. See the latest `docs/BALANCE_SIM_FINDINGS_v*.md` for the most recent sim
pass and what changed and why; `docs/ROADMAP.md` tracks forward-looking
work.

The game was converted to this essence-based ruleset from an earlier
dice-placement prototype (see `CHANGELOG.md` for history); the shipped,
player-facing name has always been **Fry Cards**, and `docs/RULEBOOK.md`
is the canonical rules reference.
