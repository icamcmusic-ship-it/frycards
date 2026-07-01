# Shifting Multiverse TCG

A digital implementation of the **Shifting Multiverse** trading card game (rulebook
V1.1), built with React + Vite + TypeScript. Play a full match against a basic CPU
opponent using a card set generated from the project card database.

## Run Locally

**Prerequisites:** Node.js

```bash
npm install
npm run dev      # dev server on http://localhost:3000
npm run build    # production build
npm run lint     # type-check (tsc --noEmit)
```

Open the app, choose a Leader, and play. The CPU automatically picks a different
Leader and plays out its turns.

## Card Data

The card pool is generated from `cards_rows.csv`. Only the **name**, **image URL**
(rendered in a 4:3 art frame) and **flavor text** are taken from the source data;
all gameplay values — elements, costs, stats, keywords and effects — are generated
to make the rules playable. The generated data lives in
[`src/game/generated-cards.ts`](src/game/generated-cards.ts). All other columns in
the source CSV are ignored.

There are 4 Leaders, each with a two-element identity and a pre-built, legal 30-card
deck (max 2 copies per card, 2 Location cards pulled to the Location Zone).

## Rules Coverage

Implemented from the rulebook:

- **Setup & decks** — 30-card decks, ≤2 copies per name, 1 Leader, starting health
  from the Leader, 2 face-down Locations per player (4 total), 5-card opening hand,
  **London Mulligan** (redraw 5, bottom X on keep), coin-toss first turn.
- **Turn phases** — Resource Roll (clears unspent resources first, d6 + Boost, Fix
  auto-allocation, Overclock penalty), Draw (first player skips Turn 1; **Deckout Law**
  = 2 damage per failed draw), Flexible Action, Cleanup (resources persist, Charms
  tick, Overdrive self-damage, Scorch/Freeze decay, discard to 7).
- **Location Shell Game** — at the start of each turn the active player flips a random
  face-down opponent Location; it applies globally and flips back at end of turn. The
  active player is the Location's controller (Siphon / "your Leader" attribution).
- **Combat (§5)** — unified assault wave, summoning sickness, Blitz, blocking without
  exhausting, Leader-vs-Leader half damage (min 1) with full counter, Leader-vs-Unit,
  **Guard Interlock**, **Survival Caveat**, permanent wounds, and the Layer / Stripping
  rules for Item bonus health.
- **Keywords** — Blitz, Guard, Pierce, Armor [X], Ward [X], Brittle, Siphon, Reap,
  Wither [X], Sustain [X], Overdrive, Boost [X], Fix [Element], Feedback, Detonate [X],
  plus the action verbs Freeze, Scorch [X], Obliterate, Heal, Draw, Manifest and
  buff via Event effects; Echo duplication.
- **CPU** — mulligans, rolls/allocates, deploys units, attaches items, casts events
  with targets, declares attackers, and assigns blocks (prioritizing lethal saves and
  favorable trades).

### Documented simplifications

The full interactive **Stack / priority** (APNAP response windows) resolves effects
immediately rather than through passed priority; some flavor keywords (Glitch, Symmetric
negation-immunity, Freeze-Dry stacking, Pure, Meltdown, Command, Photosynthesis,
Exhume / Purge / Overclock-as-Event) are present on cards as printed text but not all
are fully driven by the engine. The core game loop, combat and the listed keywords are
fully functional.
