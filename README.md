# Shifting Multiverse TCG — Monochrome & Pop

A digital implementation of the **Shifting Multiverse** trading card game
(Comprehensive Rulebook V1.7 + Master Keyword Glossary — see
[`docs/RULEBOOK.md`](docs/RULEBOOK.md) for the full Rules Bible), built with React +
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

The card pool spans two sets: **Blue Coral** (146 cards) and **Crimson
Circuit** (47 cards, part 1) — a volcanic Kinetix industrial complex of
nanite swarms, magma harvesters and shadow ninjas. Crimson Circuit prints
all 18 Set-2 keywords plus the seven Blue Coral glossary keywords that had
no printing (Brittle, Decay, Freeze, Heal, Manifest, Overdrive,
Photosynthesis), and adds two Mythic Leaders: Crimson Vector Commander
(Flame/Order — Command 2, Ward 2, Inspire 1, 36 HP) and Apex Nanite Shinobi
(Tech/Dark — Command 2, Ward 2, Sync 2, 40 HP), giving every card in the
new set at least one Leader whose color pair can run it.

The source of truth is `data/live_cards.csv` (Blue Coral set, 140 cards).
Names, art, types, rarity, **real color costs** and **real glossary keywords**
come from the CSV; numeric stats (attack / health / generic cost / item
bonuses / charm durations) are generated deterministically by
`scripts/generate-cards.mjs` so the rules are playable. To update the set:
edit the CSV, run `npm run generate-cards`, and re-seed the Supabase table
from `data/cards.generated.json`.

There are 6 Leaders — Avatar of the Abyss (Dark/Nature), Ethereal Sea
Witch (Frost/Tech), Mer-King (Light/Order), Legendary Diver (Flame/Chaos),
Crimson Vector Commander (Flame/Order) and Apex Nanite Shinobi (Tech/Dark) —
whose element pairs cover all 8 elements and every dual color cost across
both sets. Each gets an auto-built legal 30-card deck (max 2 copies per
name, ≥2 Locations) in `src/game/deckbuilder.ts`. Decks are built value-first along a
mana curve (best-scoring cards per cost bucket: ~50% cheap / 30% mid / 20%
top-end). Leader stats carry per-pool balance counterweights: every Leader is
3 ATK; Legendary Diver (30 HP, Flame/Chaos, Fix Flame) and Avatar of the
Abyss (23 HP, Sustain 1 — a per-turn heal compounds hard over a ~18-turn
game, so it needs the lowest life total) run leaner than Mer-King (39 HP,
Rally 3) and Apex Nanite Shinobi (40 HP, Sync 2); Ethereal Sea Witch
(Boost 1 — a permanent extra resource every turn) is trimmed to 33 HP and
Crimson Vector Commander sits at 36 HP with Inspire 1 — its first draft
carried Valor 1, but an always-on
attack aura on a Leader simulated at ~80% win rate no matter the HP, so
Valor now lives on the Heart of the Thermal Grid Location instead, where the
Shell Game time-limits it.
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
- **Crimson Circuit keywords** — 18 engine-driven Set-2 keywords, all
  printed in Crimson Circuit: per card type —
  Vengeance [X] / Solitary [X] (Units), Efficient [X] / Rummage [X]
  (Events), Hatchling [X] / Confluence [X] (Locations), Overcharge [X] /
  Surge (Items), Valor [X] / Inspire [X] (Charms) — and one per color —
  Beacon [X] (Light), Taint [X] (Dark), Glacier [X] (Frost), Inferno
  (Flame), Sync [X] (Tech), Flourish [X] (Nature), Codex [X] (Order),
  Discord (Chaos). Aura keywords (Valor, Codex, Beacon, Inspire, Sync,
  Glacier, Flourish, Discord) radiate from a player's Leader, active Charms,
  and the active Location while they control it (Symmetric Locations radiate
  to both players); a bare aura keyword counts as 1. Rules text lives in the
  in-game rulebook (§8) and `src/game/keywords.ts`; each keyword has an
  engine regression test.
- **CPU** — mulligans, rolls/allocates, deploys units, attaches items, casts
  events with targets (incl. Meltdown/Purge), plays charms, respects Burden
  affordability, declares attackers, and assigns blocks (prioritizing lethal
  saves and favorable trades). Against multiple simultaneous ready Guards it
  spreads lethal attackers across them to clear the board instead of
  dog-piling every attack onto a single Guard and leaving the rest
  untouched forever. Its evaluation values Charms as permanents (own charms
  are assets, hostile Decay charms are liabilities — without this the
  hand-size weight made every Charm play look like a loss and the CPU never
  cast one) and values face-down Locations, preferring Symmetric ones since
  the Shell Game hands control of a flipped Location to the flipper.
  Verified with headless CPU-vs-CPU simulations.

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
Glaciate, Exhume) are not engine-driven. The core game loop, combat and
every keyword printed in Blue Coral and Crimson Circuit are functional; see
`scripts/engine-tests.ts` for the executable rules bible.
