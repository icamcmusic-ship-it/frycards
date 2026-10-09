# FryCards — Monochrome & Pop

A digital implementation of **FryCards Poker** — Texas Hold'em with a
collectible deck of power cards (see [`docs/RULEBOOK.md`](docs/RULEBOOK.md)
for the full rules), built with React + Vite + TypeScript in the **Monochrome &
Pop** visual identity (stark comic standard: ink borders, flat offset shadows,
Montserrat 900 headings). Play a freezeout against up to five CPU seats, build
decks, open packs and grow a collection.

## The Game (FryCards Poker, one paragraph)

A match is a **pot-limit Texas Hold'em freezeout** for 2–6 seats in one of
three modes — **Quick** (30-unit stacks, 16 powers, ~12 min), **Standard** (50,
24, ~25 min) and **Deep** (80, 36, ~40 min) — with blinds that rise ×1.5 on a
clock and a hard time cap after which stacks are ranked. Every seat brings a
deck of **1 Leader + 1 Location + power cards**. Powers are **Units** (★ stars,
a token that stays out until showdown), **Items** (⚙ gears; Charm, Weapon or
Tool) and **Events** (ϟ bolts; Quick or Slow), each tier 1–5, built from ~45
poker keywords grouped by the seven colours (Ember, Tide, Root, Gale, Light,
Shadow, Void) — Peek, Reveal, Mark, Redraw, Windfall, Kindle, Siphon, Burn,
Lock, Snuff, Feint, Call Out and so on. A cast is **public** (full card face,
caster and target), costs fixed chip units **into the pot** on a ½ · 1 · 2 · 3½
· 6 ladder (tiers 4–5 add a second cost: shed a power, blind a hole card, or a
**hand exclusion**), and opens a short **response window** for Quick Events and
Ambush cards — so casting is a bluff as much as a play. Each seat's
**Location** joins a shared bag of 17 table rules (plus a Plain Table each
cycle) with a two-hand forecast; each **Leader** has a public **nerve** meter
and two once-per-hand abilities, and a seat at 0 nerve is **tilted** (Leader
locked, powers one step dearer). Poker skill still decides most outcomes.
Rewards pay by **finishing place**, never by chips.

## Run Locally

**Prerequisites:** Node.js

```bash
npm install
npm run dev              # dev server on http://localhost:3000
npm run build            # production build
npm run lint             # eslint
npm run typecheck        # tsc --noEmit
npm run test             # vitest suite (engine rules + deck validation)
npm run sim:poker       # bot-vs-bot freezeouts: the balance report (skill gap, deck spread, Location fairness)
```

## Card Data & Supabase Backend

Cards live in the **Supabase** project `dnngihsbqxccqvvedvjc`, table
`public.cards` (RLS enabled, public read-only). Each row stores only the
card's **universal identity** — name, type, rarity, set, art URL and pure
flavor text (`template` JSON) — no mechanics. The app fetches the live
catalog at startup via `src/lib/supabase.ts` and falls back to the bundled
[`src/game/generated-cards.ts`](src/game/generated-cards.ts) when offline.

All poker mechanics — a power's tier (stars, gears or bolts), its effect and
modifier keywords, Item/Event subtype, a Leader's two nerve abilities and a
Location's table rule — are assigned **deterministically client-side** by
[`src/game/poker/cardpool.ts`](src/game/poker/cardpool.ts) from a hash of each
card's id plus its type and rarity — identical on every client, and a
rebalance ships as a code change, not a data migration. Every number a balance
pass touches (the cost ladder, tier numbers, keyword weights, blind schedule,
modes, nerve, reward factors) lives in one file,
[`src/game/poker/constants.ts`](src/game/poker/constants.ts). Each card's
colour was frozen from the retired game (`src/game/poker/frozenColors.ts`), so
no card changed colour in the switch.

Generated mechanics can be **overridden per card**. A `template.overrides`
object — written by the Creator's review/bulk-add tools — is layered over the
generated `CardDef`, so a card whose generated mechanics do not suit its art
can be corrected without breaking determinism: every field left alone is still
generated, and deleting the override restores the generated card exactly.
Overrides live on the template because the template is the only thing the game
client loads; the `cards` mechanics columns exist for the server's own queries
and are written from the *overridden* card so the two agree.

`Item` cards have the subtypes `Charm`, `Weapon` and `Tool`. The mechanics hash
keeps seeding Items as `Charm` (`SEED_TYPE` in `cardpool.ts`), a holdover from
when the type itself was called Charm — a rename must not reprint 61 cards.

**Rarities:** Common, Uncommon, Rare, Super-Rare, Ultra-Rare, Full-Art,
Alt-Art, Mythic — low to high (v6.8 moved Full-Art ABOVE Ultra-Rare; v7.0
added Alt-Art between Full-Art and Mythic). Rarity shapes pack odds and
gently biases a power's tier roll (a Mythic is more often tier 3+ than a
Common, but not always); it carries no other rules weight — tier is not rarity.
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
Dying Star and Void Mother — each with a fixed two-colour identity that decides
which cards a deck may hold, a public **nerve** meter, and two Leader
abilities (one that spends nerve and one that builds it). The same Leaders
drive the CPU seats: a bot's persona (bluff rate, tightness, power use) is
derived from its Leader's colours. Two Leaders were renamed after their card
ids were minted, so the id and the printed name differ; `LEADER_COLORS`
(`src/game/poker/colors.ts`) keys off the id. Deck rules (power count, copy
and tier-5 limits per mode, colour legality) and a random-deck builder live in
`src/game/poker/deck.ts`; players build their own decks in the Deck Builder,
backed by the `decks` table. Decks and share links from the retired 60-card
game are invalid.

## Meta-game

Accounts (Supabase auth), profiles with gold/gems, a one-time Starter Box
claim per account (pick a Leader, get a full legal deck), a choice
of three prebuilt starter decks in the shop for new accounts, card packs
with rarity-slot configs (all opened server-side via SECURITY DEFINER
RPCs), foils — the 8-card booster carries one guaranteed foil slot plus a
~8%-per-pack chance of another, and the 49-card box guarantees a foil
Super-Rare-or-better topper — cosmetics (card backs, banners, avatars), a collection
browser and match rewards paid by finishing place (credits, XP and
battle-pass XP scale from 100/40 for first/last by a per-seat-count place
factor and a mode multiplier — `src/game/poker/rewards.ts`, recorded
server-side through the match ticket).

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

The rules engine is [`src/game/poker/engine.ts`](src/game/poker/engine.ts): a
pure `(state, action) → state` reducer with a seeded generator, so the same
seed and action list always replays the same match. `view.ts` redacts a match
to one seat's view (the table UI and every bot read only that), `evaluator.ts`
scores Hold'em hands, `bot.ts` is the CPU player, and `locations.ts` holds the
17 Location templates and the shared-bag schedule. `npm run sim:poker` runs
bot-vs-bot freezeouts through `src/game/poker/sim.ts` and prints the balance
targets (skill gap, deck spread, revival rate, Location fairness).
`docs/ROADMAP.md` tracks forward-looking work.

The game has been through three rulesets: a dice-placement prototype, an
essence-based MTG-style card battler (retired October 2026; see
`CHANGELOG.md` and git history), and now FryCards Poker. The shipped,
player-facing name has always been **Fry Cards**, and `docs/RULEBOOK.md` is
the canonical rules reference.

## Credits

The playing-card sprites in [`src/assets/playing-cards/`](src/assets/playing-cards/)
are the **Playing Cards Pack by Kenney** ([www.kenney.nl](https://www.kenney.nl)),
released under **CC0** (public domain) — see `LICENSE-kenney.txt` in that folder.
