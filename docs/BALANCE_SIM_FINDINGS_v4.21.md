# Balance Sim Findings — v4.21

Action pass following v4.20's read-only confirmation. Card pool verified
in sync with live Supabase (`dnngihsbqxccqvvedvjc.public.cards`): 292/292
row IDs match `src/game/generated-cards.ts` exactly (direct SQL query,
this pass) — no drift, no action needed there.

**Sandbox caveat:** this pass's execution environment is CPU-constrained
(single slow core) relative to prior passes. The standard full run (58
decks × pairwise matchups × 3 Twin modes × N games/pairing) that earlier
findings docs report at 250-2000 games/pairing (30k-70k+ total games) did
not complete in this environment even at 250/pairing (10-minute timeout,
stalled inside the Twin A/B/C phase). The numbers below come from an
**8 games/pairing** run (912 games/archetype cell) instead — a real run
against the live engine and full pool, but noisier than prior passes.
Treat deltas here as directional confirmation, not final tuning-grade
numbers; a fresh full-scale run on normal hardware should re-verify before
the next round of manual patches.

**Zero invariant violations** on the 8/pairing run (`result.errors: []`,
`No invariant violations.`) — confirms this pass's balance edits didn't
break engine legality/conservation.

## Actions taken this pass (from v4.20's carried-forward list)

Items 1-2 (`the_wolf_of_wall_street` nerf, `familiar_in_the_dark` buff
removal) were already shipped as part of v4.20 itself — confirmed still in
place in `cardpool.ts`, no further action.

1. **Item 5 — Steel/Avenge, direct magnitude cut instead of a 4th cost-side
   nudge.**
   - **Steel**: procedural print rate cut again, `hash(id) % 12` →
     `hash(id) % 15` (`cardpool.ts`) — the tier ladder itself is floored
     (see the keyword's own comment in `keywords.ts`), so print rate was
     the only lever left.
   - **Avenge**: `SIM_TUNING.avengeCap` (the real enforced lifetime cap,
     `engine.ts`'s `cleanupDeaths`) cut 2 → 1. Discovered in the process
     that the previously-exported `AVENGE_CAP` constant in `engine.ts` was
     **dead** — `cleanupDeaths` has always read `SIM_TUNING.avengeCap`, not
     that constant — so the constant was deleted rather than "fixed", to
     stop it silently drifting from live behavior again. Two existing
     tests hardcoded the old cap value (2) and were updated to reference
     `SIM_TUNING.avengeCap` instead of a hardcoded number, so they can't
     silently go stale the same way.
   - **Result this pass** (8/pairing, small-sample): Avenge's cast-win
     delta dropped from **+15.0pt → +3.5pt** (activation 0.85, castN=6184)
     — a large, directionally clear improvement from a single cap point.
     Steel's delta read **+22.6pt** this run (castN=498) — noisier/higher
     than v4.20's +18.0pt on a much smaller sample; needs the full-scale
     rerun to confirm whether the print-rate cut actually helped or this
     is sample noise on a keyword with only 0.27 activation.

2. **Item 4 — `costVsAbilityMismatches` repeat-10, second patch.** Added
   `MANUAL_THRESHOLD_ADJ` +1 for `abyssal_dragonfish` and `ember_whisperer`
   (the two highest-z entries — Deceptive Angler, Driftwood Harp, Ribbone
   Longbow already got their second step in v4.20). No-op for either if it
   procedurally lands on a gate cost instead of numeric — needs the next
   full run to confirm both actually landed on numeric cost.

3. **Item 3 — Shinobi Leader-kit.** Not directly actioned this pass beyond
   the Steel/Avenge cuts above (Steel/Avenge are Shinobi's own signature
   keywords, so items 5's cuts double as a partial answer per v4.20's own
   note). This pass's small sample shows Shinobi archetypes off the prior
   13.8-35.4% floor (Steel-Scrap Control 36.8%, Avenge Grind 57.8% this
   run) but the sample is too small/different-shaped to credit specifically
   — **carry forward**: re-measure Shinobi archetype win% and
   `lapsePerGameByArch` specifically on the next full-scale run before
   calling this resolved.

4. **Item 6 — Swift's activation/delta tension.** Design call made rather
   than deferred a 4th time: closing this as an **intentionally
   high-variance/high-reward keyword**, matching option (a) from v4.20's
   own framing. No code change. If a future pass's data shows Swift
   drifting outside its historical 24-34% activation / +10-13pt delta
   band, reopen as a real regression rather than the same steady-state
   tension.

5. **Item 7 — raw outliers without archetype-normalized coverage** (Pulsing
   Heartstone, Coral Collapse, Locust Veil, Thornfang Vine, Skyborne
   Skeleton Dragon, Shattered Horizon Protagonist, Cavernous Watcher,
   Petrified Ribs Citadel, Grit and Halftones, Kinetix Enforcer, Where the
   Deep Meets the Sky) — **not actioned**, still below the n≥400/
   archSpread≥2 bar this pass's small sample can't fix. Carry forward
   unchanged.

## Carried into next pass

1. Re-run at full scale (250+/pairing) on normal (non-sandboxed) hardware
   to confirm the Steel/Avenge/cost-adj changes above with tuning-grade
   sample sizes — this pass's numbers are directional only.
2. Shinobi Leader-kit (item 3): confirm whether the Steel/Avenge cuts
   moved the roster floor, or whether a kit-level AI-ordering /
   `MANUAL_STAT_TRIM` change on Shinobi's signature cards is still needed.
3. Item 7's raw outliers, once a full run gives them real
   archetype-normalized coverage.
4. If Steel's delta is still elevated on the full-scale rerun, the next
   lever (since the tier ladder is floored and print rate has now been cut
   twice, 1-in-9 → 1-in-12 → 1-in-15) is likely a structural one: either
   compress the tier ladder to 2 tiers, or cap Steel's absorption pool
   directly the way Avenge's cap was just cut, rather than a third
   print-rate step.

## Other changes this pass (non-balance)

A parallel bug-hunt/QoL pass across the full app (GameV4, CardFaceV4,
engine/ai, supabase.ts, App.tsx, and all of `src/meta/`) found and fixed:
a keyboard-accessibility double-fire bug on nested card chips, a leaked
long-press timer, unstable React keys on the Battle Log, and two
quicksell flows (PackOpening, CollectionScreen) that could get stuck
`busy` forever on a network error. See individual commits on this branch
for detail; none touch balance numbers.

`docs/RULEBOOK.md` was also brought current — its Keyword Glossary had
drifted since v4.10 and still showed flat single-magnitude keyword text
instead of the live Tier I-V ladder; rewritten to match
`KEYWORD_TIERS`/`keywords.ts` exactly, plus a pointer to
`docs/COLOR_IDENTITY.md`'s 7-color system.
