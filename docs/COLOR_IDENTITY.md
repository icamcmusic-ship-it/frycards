# Card Colors (v4.13) — Design, Assignment, and First-Pass Results

## 1. What shipped

A genuine deckbuilding-legality rule, not a cosmetic tag: every card now
resolves to 1+ of 5 colors (`src/game/v3/colors.ts`), every Leader has a
fixed 2-color identity (`LEADER_COLORS`), and `validateDeckList`
(`DeckBuilderScreen.tsx`) rejects any card outside that identity — the
DeckBuilder's card pool is pre-filtered to legal cards so the constraint is
visible while building, not just at save time. The sim harness's own
archetype/random-deck generation (`decks.ts`) respects the same rule so
simulated decks stay legal.

**Chosen taxonomy — 5-color "pentagon" by keyword family** (Option A of 3
candidates weighed; see the plan this pass shipped from):

| Color | Identity | Keywords |
|---|---|---|
| Crimson | Aggro / burst damage | Frenzy, Swift, Pierce, Overrun |
| Azure | Control / defense | Guard, Ward, Bulwark, Toll |
| Verdant | Ramp / growth | Anchor, Excavate, Scrap, Tribute |
| Umbral | Attrition / value | Echo, Avenge, Steel, Aftershock |
| Radiant | Synergy / combo-tempo | Twin, Rally, Crescendo, Foothold, Contested, Snap |

A card's color = the color(s) of its assigned keywords (`cardColors()`,
derived, not re-hashed — see `colors.ts`'s header comment for why this
can't desync from a card's real keywords). Keyword-less Charms/Events fall
back to a small `onCast.action` → color map.

## 2. Color distribution audit (`scripts/color-audit.ts`)

Run against the full 292-card pool:

```
Crimson    34
Azure      70
Verdant    62
Umbral     96
Radiant    85
multicolor cards: 53
colorless cards (no keyword, no onCast fallback match): 0
fallback-by-onCast-action cards: 71
```

Every card resolved to at least one color (zero colorless — Option B's
"Slate" fallback color turned out unnecessary). **Crimson is notably
under-populated** (34 vs. 62-96 for the other four) — Frenzy/Swift/
Pierce/Overrun are simply rarer keywords in the existing pool than
Guard/Echo/Twin. Flagged as an open item (§5) rather than fixed by
reassigning keywords this pass — that's a keyword-prevalence change with
its own balance blast radius, out of scope for a first color pass.

28 of 292 cards (9.6%) are **3-color** and therefore legal under no 2-color
Leader identity at all (every `LEADER_COLORS` entry is exactly 2 colors).
Accepted as a deliberate tradeoff, same as MTG printing genuinely
off-color/tri-color cards that most decks can't play — not fixed by
widening every Leader to 3 colors, which would blunt the whole point of a
color constraint.

## 3. Leader color identities

Derived from each Leader's existing archetype roster in
`scripts/simulate-v4.ts` (`ARCHETYPES`) — the 1-2 colors covering the most
of that Leader's pre-existing keyword themes:

| Leader | Identity |
|---|---|
| Avatar of the Abyss | Umbral / Verdant |
| Ethereal Sea Witch | Azure / Verdant |
| Mer-King | Azure / Umbral |
| Legendary Diver | Crimson / Radiant |
| Crimson Vector Commander | Crimson / Azure |
| Apex Nanite Shinobi | Umbral / Verdant |
| Ruin-Walker Overseer | Azure / Umbral |
| Sovereign of the Dying Star | Umbral / Crimson |

**This is a first draft, not a balanced final assignment** — see §4.

## 4. First verification sim — large, expected fallout

Full `npm run sim:v4 -- 20` round-robin (53,040 games), **no invariant
violations** (engine/deck-construction integrity holds under the new
constraint). But Leader and archetype win rates moved a lot from the
pre-color v4.12 baseline, because the 22 archetypes in `ARCHETYPES` were
all hand-tuned pre-color and several now lose access to key cards their
keyword theme depended on:

| Leader | v4.12 (no colors) | v4.13 (colors on) |
|---|---|---|
| Ruin-Walker Overseer | 75.5% | 70.4% |
| Mer-King | 57.9% | 61.2% |
| Ethereal Sea Witch | 41.6% | **59.6%** |
| Avatar of the Abyss | 56.8% | 58.9% |
| Crimson Vector Commander | 46.9% | 49.8% |
| Legendary Diver | 23.5% | **40.1%** (biggest single win) |
| Apex Nanite Shinobi | 51.9% | **37.4%** (biggest single loss) |
| Sovereign of the Dying Star | 64.7% | **27.8%** |

Two notable directional results, not yet explained by a deep dive (flagged
for next pass, not guessed at here): Legendary Diver — the roster's worst
Leader for at least 3 consecutive prior passes — improved the most of any
Leader once restricted to Crimson/Radiant, suggesting its weak archetypes
were previously diluted by off-identity filler rather than helped by it.
Sovereign of the Dying Star swung the other way, from the roster's
*strongest* Leader (v4.12, on an admittedly noisy 2-archetype sample — see
`BALANCE_SIM_FINDINGS_v4.12.md` §5 item 1) to its weakest — its Umbral/
Crimson identity may be too narrow for the single generic archetype it has.

Color-level win rates (min n=200): Azure 52.7%, Verdant 51.1%, Umbral
47.7%, Crimson 41.3%, Radiant 41.1% — Crimson and Radiant trail by a wide
enough margin to need a real look, though this is confounded with which
specific Leaders/archetypes currently carry each color (Crimson is on the
two Leaders whose identities also swung the most this pass) rather than a
clean color-only signal yet.

## 5. Still open — priority list for the next pass

1. **Every archetype in `ARCHETYPES` needs a color-aware re-tune.** This
   pass only made archetypes *legal* under the new rule (color-filtering
   the existing pool); it didn't redesign any archetype's card selection
   around its Leader's actual 2-color identity. The win-rate swings in §4
   are the direct, expected symptom.
2. **Crimson's card-count shortfall (34, vs. 62-96 for the others)** —
   decide whether to accept it, rebalance keyword prevalence toward
   Frenzy/Swift/Pierce/Overrun, or fold Overrun (a v4.4 durability-stack
   counter that isn't really an "aggro" keyword thematically) into a
   different color to redistribute the count.
3. **Sovereign of the Dying Star's identity** — the biggest single swing
   (64.7% → 27.8%) needs a dedicated look before trusting either number;
   both are built on a single generic archetype (see
   `BALANCE_SIM_FINDINGS_v4.12.md` §5 item 1, not yet resolved) rather than
   the 2-4 archetypes most other Leaders have, so neither reading is
   trustworthy yet.
4. **The 28 tri-color orphan cards** — confirm whether "legal nowhere"
   is acceptable (a deliberate "some cards just don't fit any deck" design
   choice) or whether a small number of Leaders should get a rare 3rd
   splash color.
5. **Existing player-built decks** (`decks` table) built before this
   change may now contain off-identity cards — this pass does not migrate
   or grandfather them; `DeckBuilderScreen` will surface the new color
   issues the next time an existing deck is opened for editing. Confirmed:
   `deckDefFromCustom` (`decks.ts:145`, called from `App.tsx:144` to start
   a match) never calls `validateDeckList` — a saved-but-unedited
   off-identity deck will still play normally, exactly like MTG (deck
   legality is a deckbuilder/tournament-entry check, not an engine-runtime
   one). This is consistent, not a gap, but worth stating explicitly since
   it means color identity is **not retroactively enforced** on decks
   saved before this pass.
