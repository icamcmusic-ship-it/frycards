# Shifting Multiverse TCG — Monochrome & Pop

A digital implementation of the **Shifting Multiverse** trading card game
(Comprehensive Rulebook V1.1 + Master Keyword Glossary), built with React +
Vite + TypeScript in the **Monochrome & Pop** visual identity (stark comic
standard: ink borders, flat offset shadows, Montserrat 900 headings, 5:7 card
frames with 4:3 art panels). Play a full match against a CPU opponent.

## Run Locally

**Prerequisites:** Node.js

```bash
npm install
npm run dev              # dev server on http://localhost:3000
npm run build            # production build
npm run lint             # type-check (tsc --noEmit)
npm run generate-cards   # rebuild card data from data/live_cards.csv
```

## Card Data & Supabase Backend

Cards live in the **Supabase** project `dnngihsbqxccqvvedvjc`, table
`public.cards` (RLS enabled, public read-only). Each row stores the raw CSV
fields (name, flavor, type, rarity, image URL, set, color costs, keywords)
plus an engine-ready `template` JSON. The app fetches the live pool at
startup via `src/lib/supabase.ts` and falls back to the bundled
[`src/game/generated-cards.ts`](src/game/generated-cards.ts) when offline —
the start screen shows which source is active.

The source of truth is `data/live_cards.csv` (Blue Coral set, 140 cards).
Names, art, types, rarity, **real color costs** and **real glossary keywords**
come from the CSV; numeric stats (attack / health / generic cost / item
bonuses / charm durations) are generated deterministically by
`scripts/generate-cards.mjs` so the rules are playable. To update the set:
edit the CSV, run `npm run generate-cards`, and re-seed the Supabase table
from `data/cards.generated.json`.

There are 4 Mythic Leaders — Avatar of the Abyss (Dark/Nature), Ethereal Sea
Witch (Frost/Tech), Mer-King (Light/Order), Legendary Diver (Flame/Chaos) —
whose element pairs cover all 8 elements and every dual color cost in the
set. Each gets an auto-built legal 30-card deck (max 2 copies per name, ≥2
Locations) in `src/game/deckbuilder.ts`. Decks are built value-first along a
mana curve (best-scoring cards per cost bucket: ~50% cheap / 30% mid / 20%
top-end). Leader stats carry per-pool balance counterweights: every Leader is
3 ATK; Legendary Diver (30 HP, hyper-aggressive Flame/Chaos, no third
keyword) and Avatar of the Abyss (30 HP, Sustain 1 — a per-turn heal
compounds hard over a ~17-turn game, so it needs the lowest life total) run
leaner than Mer-King (37 HP, Rally 2) and Ethereal Sea Witch (38 HP, Boost 1).
Balance is tuned with `npx tsx scripts/simulate.ts <games>`, which reports a
per-leader win rate (wins ÷ appearances) and holds every leader between
roughly 44% and 57% over large (2000+ game) headless CPU-vs-CPU samples —
smaller samples swing several points on variance alone, so re-tune against
at least a couple thousand games, not a few hundred.

## Rules Coverage

Implemented from the rulebook:

- **Setup & decks (§1)** — 30-card decks, ≤2 copies per name, 1 Leader,
  starting health from the Leader, 2 face-down Locations per player (4
  total), 5-card opening hand, **London Mulligan** (redraw 5, bottom X on
  keep), coin-toss first turn.
- **Turn phases (§2)** — Resource Roll (clears unspent resources first, d6 +
  Boost, Fix auto-allocation from Leader/Location/Charms, Overclock penalty,
  single-color tracking for Pure), Draw (first player skips Turn 1;
  **Deckout Law** = 2 damage per failed draw; no attacks Turn 1), Flexible
  Action, Cleanup (resources persist into the opponent's turn, Charms tick,
  Overdrive self-damage, Scorch/Freeze/Glitch decay, discard to 7).
- **Location Shell Game (§3.1)** — the active player flips a random
  face-down opponent Location each turn; it applies globally and flips back
  at end of turn; the active player is its controller (Siphon / "your
  Leader" attribution).
- **Charms (§3.2)** — attach to a player profile, dormant until the affected
  player's next turn, 1-3 turn lifespans ticking in that player's Cleanup;
  Detonate strikes the charm-caster's enemies on expiry.
- **Combat (§5)** — unified assault wave, summoning sickness, Blitz,
  blocking without exhausting, Leader-vs-Leader half damage (rounded down,
  min 1) with full counter, Leader-vs-Unit attacks, **Guard Interlock**
  (combat and targeted Events), **Survival Caveat**, permanent wounds, and
  the Layer / **Stripping Rule** for Item bonus health.
- **Keywords** — Blitz, Guard, Pierce, Armor [X], Ward [X] (surcharge +
  target lock), Burden [X] (attack surcharge), Command [X] (Leader activated
  ability with UI), Symmetric, Detonate [X], Brittle, Siphon, Reap,
  Wither [X], Sustain [X], Overdrive, Glitch (ability shutdown until
  Cleanup), Boost [X], Fix [Element], Feedback (d6 negate + exact refund
  incl. Ward surcharge), Echo (d6 duplication), Pure (single-color roll
  bonus), plus action verbs Freeze, Scorch [X], Obliterate, Meltdown, Purge,
  Heal, Draw, Manifest.
- **CPU** — mulligans, rolls/allocates, deploys units, attaches items, casts
  events with targets (incl. Meltdown/Purge), plays charms, respects Burden
  affordability, declares attackers, and assigns blocks (prioritizing lethal
  saves and favorable trades). Against multiple simultaneous ready Guards it
  spreads lethal attackers across them to clear the board instead of
  dog-piling every attack onto a single Guard and leaving the rest
  untouched forever. Verified with headless CPU-vs-CPU simulations.

### Documented simplifications

The full interactive **Stack / priority** (APNAP response windows) resolves
effects immediately rather than through passed priority — timing rules are
deterministic instead: Armor absorbs before health, Brittle doubles before
Armor, the Stripping Rule fills Item bonus health first, and a state-based
**Death Sweep** runs after every action and re-sweeps to a fixpoint (so
dynamic buffs like Phalanx can never leave a 0-HP Unit on the battlefield,
even when one Phalanx Unit's death shrinks another's max health enough to
kill it in the same instant). A hit larger than a card's total
Armor breaks ALL of its Armor — printed and Item-granted alike. Keywords with
no printing in the Blue Coral set (Fate, Freeze-Dry, Blessed, Scorched-Earth,
Glaciate, Exhume) are not engine-driven. The core game loop, combat and every
keyword printed in the Blue Coral set are functional; see
`scripts/engine-tests.ts` for the executable rules bible.
