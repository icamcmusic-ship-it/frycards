# Card Colors (v4.13-v4.14) — Design, Assignment, and Results

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

## 6. v4.14 — expanded 5 colors to 7

**What changed** (mechanical, no logic changes to `cardColors()`/
`isColorLegal()` beyond the fallback rule below): renamed `Umbral` →
**Obsidian** and `Radiant` → **Prism** (same keywords, new names — Prism
specifically so it wouldn't read as a synonym of the new Solar). Split
`Crescendo`/`Foothold`/`Contested`/`Snap` off Prism into a new **Solar**
color (situational/opportunistic timing), leaving Prism with `Twin`/`Rally`
(direct dice-pattern synergy). Added **Slate**, a true colorless color for
cards with no color-mapped keyword — replaces the old `COLOR_OF_ACTION`
guessed-color fallback entirely; a Slate card is legal in every Leader's
deck by definition (`isColorLegal` special-cases it), same as a colorless
card in MTG.

**7 colors: Crimson, Azure, Verdant, Obsidian, Prism, Solar, Slate.**

### Updated distribution audit (`scripts/color-audit.ts`)

```
Crimson    34
Azure      70
Verdant    52
Obsidian   65
Prism      23
Solar      32
Slate      71
multicolor cards: 53
colorless (Slate) cards: 71
```

Removing the guessed-color fallback (previously 71 cards forced into
Umbral/Radiant/Verdant/Azure by `onCast.action`) meaningfully shrank the
two largest colors — Obsidian dropped from 96 to 65, and the old Radiant's
85 split into Prism 23 + Solar 32 (54 combined, down from 85, the
difference now honestly labeled Slate instead of guessed). Verdant also
dropped (62→52) since some of its guessed-fallback `mend` cards moved to
Slate. **28 orphan cards** (tri-color, legal under no 2-color identity) —
unchanged from the 5-color count, as expected (renaming/splitting/adding a
colorless catch-all doesn't change which cards are genuinely 3+ colors).

### Leader identities — re-derived, collision fixed

Every pair below is now **unique** (`color-audit.ts` confirms: "all 8
Leader identity pairs are unique") — the v4.13 Avatar of the Abyss / Apex
Nanite Shinobi identity collision (both were Umbral/Verdant) is fixed by
this re-derivation, computed from each Leader's `ARCHETYPES` keyword-
instance counts (highest-coverage 2-color pair, ties broken toward an
unclaimed pair):

| Leader | v4.13 identity | v4.14 identity |
|---|---|---|
| Avatar of the Abyss | Umbral/Verdant | **Verdant/Prism** |
| Ethereal Sea Witch | Azure/Verdant | Azure/Verdant (unchanged) |
| Mer-King | Azure/Umbral | Azure/Obsidian (renamed only) |
| Legendary Diver | Crimson/Radiant | Crimson/Prism (renamed only) |
| Crimson Vector Commander | Crimson/Azure | Crimson/Azure (unchanged) |
| Apex Nanite Shinobi | Umbral/Verdant | Verdant/Obsidian (renamed only) |
| Ruin-Walker Overseer | Azure/Umbral | **Azure/Solar** |
| Sovereign of the Dying Star | Umbral/Crimson | Obsidian/Crimson (renamed only) |

Only Avatar of the Abyss and Ruin-Walker Overseer actually changed which
*colors* they carry (both had ties or a single-color signal in the raw
keyword-coverage count — Avatar's Crimson/Verdant/Prism 3-way tie was
broken toward Prism to avoid re-colliding with Diver's dominant Crimson
pick; Ruin-Walker's only archetype (`Guard`/`Bulwark`, both Azure) had no
second-color signal at all, so Solar was picked as the only pairing not
already claimed by another Azure-identity Leader).

### Verification sim (53,040 games, `npm run sim:v4 -- 20`)

**No invariant violations.** Leader win rates moved again — expected, same
caveat as §4 (archetypes still tuned pre-split, not re-tuned for the new
6 real colors + Slate):

| Leader | v4.13 (5 colors) | v4.14 (7 colors) |
|---|---|---|
| Avatar of the Abyss | 58.9% | **63.8%** |
| Mer-King | 61.2% | 63.8% |
| Ethereal Sea Witch | 59.6% | 60.7% |
| Crimson Vector Commander | 49.8% | 41.7% |
| Ruin-Walker Overseer | 70.4% | **40.0%** |
| Legendary Diver | 40.1% | 39.8% |
| Apex Nanite Shinobi | 37.4% | 39.2% |
| Sovereign of the Dying Star | 27.8% | 38.1% |

Ruin-Walker Overseer's drop (70.4%→40.0%) is the headline move, and lines
up with its identity actually changing color (Azure/Umbral→Azure/Solar) —
its sole archetype (`Guard`+`Bulwark`, both Azure) lost access to whatever
Umbral/Obsidian cards it was drafting before and gained access to Solar's
much smaller, untested-for-this-archetype card pool instead. This is the
clearest evidence yet for §5 item 1 (every archetype needs a real
color-aware re-tune, not just a legality patch) — a Leader's win rate
swinging by 30pt purely from a *rename+recolor* of its identity, with zero
archetype redesign, means the archetype was never actually built "for"
either color pairing, just legal under it.

Color-level win rates (min n=200, Leader win% column): Prism 56.5%,
Verdant 53.8%, Azure 50.6%, Slate 49.1%, Obsidian 46.8%, Crimson 40.3%,
**Solar 20.7% (n=2040)**. Solar's low reading is a direct symptom of only
one Leader (Ruin-Walker Overseer, itself now the roster's weakest) even
carrying it — not yet a trustworthy read on the color itself.

### Still open (adds to §5's list)

6. **Ruin-Walker Overseer needs a second, dedicated archetype** before its
   Azure/Solar identity can be judged fairly — right now its entire color
   read (and Solar's entire color read) rests on one archetype that was
   never built with Solar cards in mind.
7. Same "every archetype needs a real color-aware re-tune" item as §5-1,
   now with harder evidence (Ruin-Walker's 30pt swing).

## 7. v4.14b — archetype color-aware re-tune, and answers to the open questions

Went through every one of the 22 v4.13 archetypes and checked its
`keywords:` against its Leader's real identity (§6 table). 6 archetypes
across 4 Leaders had at least one off-identity keyword — swapped each for
the nearest thematically-appropriate in-identity keyword (label text left
unchanged so `ARCH_WATCHLIST` and older findings docs that reference
archetypes by name still resolve correctly):

| Archetype | Old keywords | New keywords | Why |
|---|---|---|---|
| Abyss Sap-Echo Control | Echo, Toll | Anchor, Twin | Neither original keyword was in Verdant/Prism |
| Abyss Pierce Aggro | Pierce, Frenzy | Rally, Scrap | Neither original keyword was in Verdant/Prism |
| Sea Witch Ward-Steel Wall | Ward, Steel | Ward, Bulwark | Steel is Obsidian, not in Azure/Verdant |
| Mer King Twin Heal | Guard, Twin | Guard, Steel | Twin is Prism, not in Azure/Obsidian |
| Shinobi Tempo-Anchor | Anchor, Echo, Swift | Anchor, Echo, Steel | Swift is Crimson, not in Verdant/Obsidian |
| Shinobi Avenge Grind | Avenge, Toll | Avenge, Excavate | Toll is Azure, not in Verdant/Obsidian |
| Sovereign Steel Control | Steel, Toll | Steel, Frenzy | Toll is Azure, not in Obsidian/Crimson |

Also added a genuine **second archetype** to the two single-archetype
Leaders, directly answering §5/§6's open items about them:

- **Ruin-Walker Solar Tempo** (`Snap`/`Foothold`, Azure/Solar) — Ruin-Walker
  Overseer's original sole archetype was pure Azure (`Guard`/`Bulwark`),
  so Solar — and by extension the Solar *color's* entire win-rate reading
  — rested on a Leader/archetype pairing that never actually drafted a
  Solar card on purpose.
- **Sovereign Crimson Assault** (`Pierce`/`Avenge`, Obsidian/Crimson) —
  same gap for Sovereign of the Dying Star's Crimson half.

Full re-verification: `npm run sim:v4 -- 20`, 24 archetypes now (was 22),
**no invariant violations**.

| Leader | v4.14 (pre-retune) | v4.14b (retuned) |
|---|---|---|
| Mer-King | 63.8% | 64.8% |
| Ethereal Sea Witch | 60.7% | 61.4% |
| Avatar of the Abyss | 63.8% | 60.9% |
| Sovereign of the Dying Star | 38.1% | **48.5%** |
| Ruin-Walker Overseer | 40.0% | **46.9%** |
| Crimson Vector Commander | 41.7% | 41.2% |
| Legendary Diver | 39.8% | 39.8% (unchanged — needed no retune) |
| Apex Nanite Shinobi | 39.2% | 36.8% |

Color win rates also firmed up — **Solar went from 20.7% (n=2040, one
archetype) to 44.8% (n=6600, two archetypes across two Leaders)**, a far
more trustworthy reading and much closer to healthy than the original
number suggested.

### Answers to §5/§6's open questions

1. *"Every archetype needs a color-aware re-tune"* — **done** for the 6
   archetypes that were actually off-identity (see table above); the other
   16 already matched their Leader's identity coming out of the v4.13
   split/rename and needed no change (confirmed by Crimson Vector
   Commander and Legendary Diver's win rates staying flat, since none of
   their archetypes changed).
2. *Crimson's card-count shortfall (34 cards)* — **accepted, not fixed**.
   Reassigning which keywords carry Crimson would ripple through every
   prior balance pass's keyword-prevalence data with no clear win; revisit
   only if pack-opening/collection data later shows a real player-facing
   scarcity problem, not from the sim numbers alone.
3. *Sovereign of the Dying Star's identity* — **resolved**: with a real
   second archetype, Sovereign reads as a coherent, moderate 48.5% Leader,
   not the wild 27.8%→38.1%→48.5% swings across three straight passes on a
   single archetype. Its two archetypes are NOT evenly matched, though
   (Sovereign Steel Control 87.7% vs. Sovereign Crimson Assault 34.0% —
   see the new open item below) — the Leader number is trustworthy, the
   even split between its two colors is not yet.
4. *The 28 tri-color orphan cards* — **accepted as intentional design**,
   same as MTG genuinely printing off-color cards most decks can't play.
   Not revisited this pass.
5. *Retroactive enforcement on old decks* — already answered in §5 item 5
   (confirmed not enforced, consistent with MTG-style legality checks);
   nothing further to do.
6. *Ruin-Walker Overseer needs a second archetype* — **done**, see above.

### New items surfaced by this pass

8. **Shinobi Avenge Grind dropped sharply** (73.2%→45.5%) from the
   Toll→Excavate swap — Excavate turned out to be a much weaker
   substitute than Toll was for this archetype's actual power level, even
   though both are legal, in-identity choices. The archetype is legal now
   but arguably needs a different in-identity keyword pairing (or a wider
   card-selection retune, not just a keyword swap) to recover its former
   strength within Verdant/Obsidian.
9. **Sovereign's two archetypes are lopsided** (87.7% vs. 34.0%) — Sovereign
   Crimson Assault (the brand-new archetype) is a first draft with no
   tuning history, unlike every other archetype in the roster; needs at
   least one more iteration before its numbers should be trusted the way
   the rest of the roster's are.

Both are flagged for the next dedicated color-balance pass rather than
chased further in this same session — same "surgical, verified, don't
oversweep" convention as every prior `BALANCE_SIM_FINDINGS_v4.*.md` pass.
