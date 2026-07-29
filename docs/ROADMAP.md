# Roadmap

Prioritized direction for Frycards. Items move to `CHANGELOG.md` when shipped.

Rewritten in v7.7. The previous version had drifted into being a copy of the
balance doc's carry-forward list with the product work pushed to the margins —
nine of its thirteen items were individual card and keyword numbers that go
stale every pass. Balance now gets **one** entry here that points at the
findings doc, which is the thing that actually tracks it, and the rest of this
file is about the game.

Three horizons, and each item says what it is blocked on rather than only what
it is.

---

## Now — finish what is half-built

Everything here has a started implementation and a visible seam.

- **Mobile/responsive, third pass.** v7.4 did the match board and v7.5 the card
  views around it (collection, deck editor, pack opening, mulligan, hand
  strip). Still unmeasured on a phone: the store, marketplace, player shops,
  social and profile screens, and the 3D card inspector. Harness is `npm run
dev` plus `meta-preview.html` / `board-preview.html`; extend the latter as
  screens are covered.
- **Accessibility pass.** Keyboard navigation, screen-reader labels for card
  actions, contrast audit of the monochrome theme. Partially underway — see the
  "Bug hunt / accessibility" entries in `CHANGELOG.md`. The viewport meta in
  `index.html` already refuses to break pinch-zoom; the rest of WCAG has not
  been walked.
- **One balance pass per release, against the findings doc.** The whole live
  list is `docs/BALANCE_SIM_FINDINGS_v7.7.md` carry-forward. Top of it is
  `Unbreakable` and the cost cap, which is the first keyword-mechanism item the
  project has had rather than a per-card one. Standing rules that came out of
  v7.7 and should not be relearned: **four deck cohorts, not two** (two cohorts
  cannot see a keyword with fewer than ~6 carriers), and **never interleave
  content changes with balance trials in one pass**.

## Next — the things players will notice

Ordered by how much they change what it feels like to own and play the game.

- **Persistent match history and replays.** Store per-match logs; let players
  review past games. The engine already emits a structured event stream (the
  sim harness consumes it), so this is storage and a viewer, not new game code.
  It is also the prerequisite for anything competitive: a ladder without
  replays is unauditable.
- **ELO-tracked CPU gauntlet.** A ranked-style ladder against the CPU, as the
  stepping stone to real matchmaking. Blocked on nothing; wants match history
  first so a rating has evidence behind it.
- **Volume #2.** The content pipeline supports further drops on top of the live
  292-card pool. The v7.7 rule bites here: a new set is a **content** change, so
  it lands in its own pass, the pool re-baselines, and only then do balance
  trials resume. The v7.6 Glaciate result was erased exactly this way.
- **Custom fonts as first-class assets.** Currently two Google Fonts pulled at
  runtime by an `@import` at the top of `src/index.css` — a third-party
  request on first paint and a hard dependency on a CDN. Two things worth
  doing, in order: **(1)** self-host the two existing faces as `.woff2` under
  `src/assets/fonts/` with `@font-face`, which Vite fingerprints and bundles —
  removes the CDN round-trip and makes the app work offline; **(2)** let a
  theme name a font the way `src/meta/themes.ts` already names a palette, so a
  set or a cosmetic can ship its own display face. (2) is the one that wants a
  Supabase Storage bucket, since the point is swapping faces without a
  redeploy; it needs a public bucket with CORS and a `crossorigin` attribute,
  and a licence check that the face permits webfont embedding.
- **Deck archetype guidance in the builder.** The sim knows a great deal about
  what makes a deck work (`archetypes`, `essenceCurve`, `costTiers`,
  `colorMatchups`) and the deck editor tells the player none of it. The
  cheapest large win in the meta game.

## Later — needs a foundation first

- **Multiplayer (PvP).** Requires a server-authoritative engine; design spike
  is in `docs/PVP_DESIGN.md`. Real blocker is that `engine.ts` is a
  client-side pure reducer with no notion of hidden information across a wire.
  Match history and replays are the honest first step toward it.
- **Leader keywords.** Leaders have three (Commander, Resolute, Warlord) where
  every other type now has six or seven. `roll(seed, 'ldr-kw6', 6)` has no free
  band, so any addition re-rolls all nine existing Leaders and invalidates every
  per-Leader adjustment in `cardpool.ts` at a stroke — the same trap the v7.3
  colour-pair note and the v7.5 `V75_KEYWORDS` split both record. Needs the roll
  restructured onto its own band first, then a balance pass.
- **Raise the Unit cost ceiling for keyword surcharges.** The v7.7 top
  carry-forward, listed here as well because it is a **rules** change and not a
  number: three Unbreakable bodies all print at the cost cap of 7, so the pool's
  heaviest keyword weight is only partly collected, and no per-card lever can
  reach them. Fixing it means the cap stops being a silent balance ceiling —
  which touches the printed cost of every expensive keyworded Unit, so it is a
  content-scale change that needs its own pass.
- **Make the pinned Leader suite the primary Leader instrument.** v7.7 found
  its decks had been re-rolling with the cohort seed since v6.2, which is why
  four passes of random-cohort Leader readings disagreed with each other. Now
  that it is fixed and stable to within a point across cohorts, the random-deck
  Leader table should probably be demoted to a deck-composition diagnostic
  rather than the number Leader balance is judged on.
