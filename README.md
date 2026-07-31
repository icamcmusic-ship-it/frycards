# FryCards — Monochrome & Pop

A digital implementation of the **FryCards** essence-based trading card game
(Rulebook v6.x — see [`docs/RULEBOOK.md`](docs/RULEBOOK.md) for the full
Rules Bible), built with React + Vite + TypeScript in the **Monochrome & Pop**
visual identity (stark comic standard: ink borders, flat offset shadows,
Montserrat 900 headings). Play a full match against a CPU opponent, build
decks, open packs and grow a collection.

## The Game (v5, one paragraph)

Two players duel with 60+-card decks of Units, Items, Events and Locations,
each led by a Leader with **Resolve**-fueled abilities and 20 starting
**Vitality**. Locations exhaust for **Essence** of one of seven types (Ember,
Tide, Root, Gale, Light, Shadow, Void); a card's Essence Cost is paid with
colored pips of matching Essence plus a generic amount from anything. Each
turn runs Dawn (untap, draw) → Main Phase I → Clash → Main Phase II → Dusk
(shed to 7). Who takes the first turn is a coin flip; the player on the draw
plays a second (exhausted) Wellspring on their opening turn to offset it.
**Items** bond to a unit and come in three subtypes: a **Charm** dies with its
unit and may instead be cast on a *player* for Vitality; a **Weapon** survives
its unit and re-bonds to another for a cost; a **Tool** is a Weapon that also
weakens a target enemy unit as it bonds. In Clash, attackers are declared, the
defender assigns Guards, and a reaction window lets Quick Events and Ambush
units respond before damage resolves. Keywords include Aerial, Overrun, Quickstrike,
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

Generated mechanics can be **overridden per card** (v13). A `template.overrides`
object — written by the Creator's review/bulk-add tools — is layered over the
generated `CardDef` by `mapCard`, so a card whose generated cost or keywords do
not suit its art can be corrected without breaking determinism: every field left
alone is still generated, and deleting the override restores the generated card
exactly. Overrides live on the template because the template is the only thing
the game client loads; the `cards` mechanics columns exist for the server's own
queries and are written from the *overridden* card so the two agree.

**v13 renamed the `Charm` card type to `Item`**, with `Charm`, `Weapon` and
`Tool` as its subtypes. The mechanics hash keeps seeding Items as `Charm`
(`SEED_TYPE` in `cardpool.ts`) — a rename must not reprint 61 cards.

**Rarities:** Common, Uncommon, Rare, Super-Rare, Ultra-Rare, Full-Art,
Alt-Art, Mythic — low to high (v6.8 moved Full-Art ABOVE Ultra-Rare; v7.0
added Alt-Art between Full-Art and Mythic). Rarity shapes pack odds and
gently scales a card's stat/cost budget; it carries no other rules weight.
Full-Art, Alt-Art and Mythic print edge-to-edge art (Mythic's is looping
video, Alt-Art's carries the "Prism Ink" holo wash); everything else uses the
framed template (see `src/components/CardFaceV4.tsx`).

Rarity is **also an input to the mechanics hash** (`seedOf` is
`id|type|rarity`), so re-tiering a card reprints it — a rarity change is a
balance change, not just an economy one. `npm run verify:pool` diffs
`cards.rarity`, `cards.template` and the bundled `generated-cards.ts` and
exits non-zero on any drift between them; run it after any rarity edit.

Cards can also be minted from inside the app by the Creator — approving a
player submission, or a `BULK ADD` paste (see **Player Showcase** below). Those
paths derive the mechanics with `deriveCardMechanics()` (the single-card export
of the same `cardpool.ts` assignment) and write all sixteen `cards` columns in
one call, so a freshly printed card is never left with the null mechanics
columns that `pick_deck_bucket` reads as "colourless, cost 0". They do *not*
touch `generated-cards.ts`: re-run `npm run fetch:cards` and commit the result
after a batch, or `verify:pool` will (correctly) report every new card as
`live-only`, and the sims will keep running on the old catalog.

**Sets.** Every `pack_types` row pins its own `allowed_sets`; a null there means
"draw from the whole table", which is not what any shipped pack wants once more
than one set exists. `random_card_of_rarity`, `grant_pack_contents` and
`pick_deck_bucket` all honour it.

There are 9 Leaders — Avatar of the Abyss, Ethereal Sea Witch, Mer-King,
Legendary Diver, Sentinel of the Nether Pit (`crimson_vector_commander`),
Kuro the Unseen (`apex_nanite_shinobi`), Ruin-Walker Overseer, Sovereign of the
Dying Star and Void Mother — each with a fixed two-color
Essence identity, Resolve, and two Leader abilities (a Resolve-spending
ability and a small Resolve-building one). Two of them were renamed after their
card ids were minted, so the id and the printed name differ; `LEADER_COLORS`
(`src/game/v3/colors.ts`) keys off the id. A randomized-deck generator lives
in `src/game/v3/decks.ts` (used for guest play and the Starter Box); players
build their own 60+-card decks (max 4 copies per card, tighter caps at
higher rarity) in the Deck Builder, backed by the `decks` table.

## Telling a Running Client It Is Out of Date

Fry Cards is a single-page app people leave open for days, so two things go
stale in a tab that never reloads: the **build** (a deploy replaces the bundle;
the open tab keeps running the one it loaded) and the **card catalog**
(`App.tsx` fetches `public.cards` once at boot and derives the whole pool from
it, so any catalog change — a balance pass, a Creator override, a `db:sync` —
is invisible until a reload).

`vite.config.ts` stamps a build id into the bundle as `__APP_BUILD__` and writes
the same id to `version.json` beside it; `cards` carries its own version in
`max(updated_at)`. `src/lib/useAppUpdate.ts` polls both every five minutes and
whenever the tab is foregrounded or the connection returns, and
`src/meta/UpdateBanner.tsx` offers the refresh. The banner is suppressed during
a match, and a dismissal is remembered per build id. Measure its layout with
`/meta-preview.html?screen=update`.

Nothing about this needs configuring per deploy — the build id comes from
`GITHUB_SHA` when it is set, so redeploying the same commit correctly announces
nothing.

## Meta-game

Accounts (Supabase auth), profiles with gold/gems, a one-time Starter Box
claim per account (pick a Leader, get a full legal 60-card deck), a choice
of three prebuilt starter decks in the shop for new accounts, card packs
with rarity-slot configs (all opened server-side via SECURITY DEFINER
RPCs), foils — the 8-card booster carries one guaranteed foil slot plus a
~8%-per-pack chance of another, and the 49-card box guarantees a foil
Super-Rare-or-better topper — cosmetics (card backs, banners, avatars), a collection
browser and match rewards.

## Players Showcase 2026 (player-submitted cards)

Players design cards from the main menu (`CARD SUBMISSIONS`,
[`src/meta/CardSubmissionsScreen.tsx`](src/meta/CardSubmissionsScreen.tsx)):
an art link, a title, a card type (Unit/Item/Event/Location) and flavor text.
Approved cards are printed into the **Players Showcase 2026** set and become
ordinary collectible, deck-legal cards. The set name is pinned in exactly two
places and they must move together: `SHOWCASE_SET` in
[`src/meta/submissions.ts`](src/meta/submissions.ts) and the `v_set` constant
inside the `submit_card` RPC.

- Unlimited submissions per account, but **one full art and one video Mythic
  per account per set** — held by a pending request, freed by withdrawing it,
  and re-checked at approval time against what actually got printed.
- **Art aspect ratios** (`ART_SPECS`, printed in the submit form and the rules
  panel): standard frame **4:3 landscape** (~1600x1200) for the framed art
  window; full art **5:7 portrait** (~1500x2100), because a full-bleed card is
  the card's own 2.5in x 3.5in; video Mythic the same **5:7 portrait**, as a
  short silent `.mp4`/`.webm`/`.mov` loop.
- The Creator assigns the rarity and every other attribute and may deny
  anything; a submission whose theme is on the disallowed list is a **ban** from
  the Showcase (`profiles.submissions_banned`), which also clears that
  account's remaining queue.
- **Mechanics are generated, and Fry can overwrite them.** The review queue's
  mechanics panel starts from the generated cost/stats/keywords/subtype/rules
  text and diffs anything he edits into a `CardOverrides` object stored on the
  card's template. Only changed fields are written; a keyword the engine does
  not implement is rejected rather than printed as a dead chip.
- Every card preview on the screen — the live submit preview, each row of MY
  SUBMISSIONS, the review card and each bulk-add row — is a full-size card face
  and **opens in the 3D inspector on click**, the same view the Collection uses.
- **The set stands up at 100 cards.** `SHOWCASE_MIN_CARDS` (and the server's
  `get_showcase_stats.cards_needed`) is the bar the screen's progress meter and
  copy quote: below it a set-restricted booster just hands out the same handful
  of cards, so the Showcase booster and the Ultra-Rare community poll both wait
  for it. **The ballot is not built yet** — see `docs/ROADMAP.md`.
- The Creator's `BULK ADD` tab imports many cards at once (JSON array, or
  `name | type | rarity | image url | flavor` per line). Rows are validated in
  the client and written one at a time server-side, so a bad row reports itself
  instead of rolling back the batch.
- Pure validation/parsing lives in
  [`src/meta/submissions.ts`](src/meta/submissions.ts) and is unit-tested; the
  server re-validates everything in `submit_card` / `apply_card_upsert`.
- The `Players Showcase 2026 Booster` pack row exists but ships **inactive**: a
  set-restricted pack falls back to the whole catalog only when its set is
  completely empty, so it is safe to activate once the set has cards and unsafe
  before that. The 100-card bar above is the point at which activating it is
  worth doing rather than merely safe.

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
