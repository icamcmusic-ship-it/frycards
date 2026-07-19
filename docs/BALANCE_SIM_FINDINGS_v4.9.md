# Balance Sim Findings — v4.9

Pass structure: harness upgrade (three new instrumentation additions,
below) → 33,840-game baseline (`npm run sim:v4 -- 15`, 48 decks,
`sameTurn` Twin mode selected by the A/B/C pre-pass) → a targeted 17-arm
ablation battery (`sim:ablation 40`, the 11 carried-over v4.7/v4.8 subjects
plus 6 new wall-list-lever arms) → actions → full 33,840-game verification
re-sim. No invariant violations in any run.

## 1. Harness upgrades (what this pass could measure that v4.8 couldn't)

- **`lapseIdleLeaderAbility` split by refusal reason** (v4.8 findings §4
  item 3). The single counter is now three: `_genuine` (a real heuristic
  gap), `_refusalNoTarget` (an `abilityNoRepeatTarget` Ability — currently
  only Apex Nanite Shinobi's — with no legal alternate target this turn,
  i.e. a correct refusal, not a bug), and `_diceSpentDown` (a die that could
  have paid for the Ability existed somewhere in the turn's roll but was
  spent on a higher-priority cast instead — see `ai.ts`'s new
  `recordDiceSpentDownLapse`). Result: **`_genuine` measured zero** across
  33,840 games. Every case the old single counter flagged is fully
  explained by one of the other two — the CPU has no idle-Ability bug left
  to find with this detector. `_diceSpentDown` (2.37/game) correlates
  **positively** with winning (+6.7pt) — it's the AI correctly prioritizing
  a cast over the Ability, not a lapse at all, despite the name it inherited
  from the old undifferentiated counter. `_refusalNoTarget` (0.47/game)
  correlates negatively (-25.4pt) but that's a confound, not a bug: Shinobi
  activating this at all means the board already dropped to ≤1 friendly
  Unit, which independently predicts losing.
- **Per-card Echo win-delta** (v4.8 findings §4 item 2), piggybacked on the
  existing per-player decision-counter infrastructure (`decide(g, p.id,
  \`echoCard:${id}\`)` in `echoRecast()`) rather than a new stats field —
  the harness now reports "recast ≥1x this game → win%" per card. Spread is
  enormous: 20.0% (Swirling Ink Cloud, n=110) to 76.2% (Amber Sphere,
  n=576). See §4.2 for why this couldn't be acted on directly this pass.
- **Durable-body density metric** (v4.8 findings §4 item 1, the wall-list
  meta). `cardpool.ts` exports `isCheapDurableBody()` (an exact-cost-or-
  threshold≤2 Unit with either a defensive stat split or a durability
  keyword) and `deckDurableBodyDensity()`; the harness correlates each
  archetype's density against its measured win%. See §2.1 — this is what
  actually named the lever this pass.
- **Three new SIM_TUNING ablation dials** wired into `cardpool.ts`'s
  `mapUnit()` (`exactCostBudgetCap`, `guardHpBonus`, `durableBodyTax`).
  These are the first ablation dials that affect **card-build-time** math
  rather than something read live during play, which meant the pool has to
  be explicitly rebuilt mid-run for the dial to take effect —
  `cardpool.ts` now exports `rebuildPool()` (re-derives `POOL_V4`/
  `POOL_BY_ID` from the last-loaded template set) and
  `simulate-ablation.ts` calls it only for the arms that need it
  (`POOL_AFFECTING_ARMS`).

## 2. Headline findings

### 2.1 The wall-list meta — first real lever found (v4.8 §4 item 1)

The new density metric confirmed the hypothesis directly: low-density
archetypes (≤3 durable bodies) average 47.1% this pass, mid 45.4%, **high
density (≥8) averages 57.1%** — a clean, monotonic correlation the keyword
and Leader-kit levers of the last three passes never had a way to see.

The ablation battery turned one dial at a time against the same 11
subjects used since v4.7:

| arm | Avenge Grind | Guard-Bulwark Turtle | Tempo-Anchor | Excavate Ramp |
|---|---|---|---|---|
| baseline | 84.6% | 77.5% | 11.0% | 42.1% |
| exactCostCap 1.5→1.0 | 85.4% | 77.7% | 8.3% | 41.3% |
| durableBodyTax +1 | 83.5% | 75.6% | 14.4% | 45.6% |
| durableBodyTax +2 | 83.3% | 74.2% | 14.0% | 47.5% |
| **guardHpBonus 3→2** | **78.8%** | **69.4%** | **19.6%** | **49.4%** |
| guardHpBonus 3→1 | 75.0% | 60.4% | 23.3% | 55.2% |

`exactCostCap` (a further tightening of the v4.8 exact-cost stat trim) was
dead — it barely touched the top decks and made the ramp floor *worse*
(Tempo-Anchor 11.0→8.3%), the opposite of what's needed. `durableBodyTax`
(a flat per-card HP surcharge on any card matching `isCheapDurableBody`)
moved things but diffusely, hitting good and bad decks alike without a
clean signal. **`guardHpBonus`** — the flat +3 HP a Guard-primary-keyword
Unit gets on top of its stat budget, printed since v4.0 and never touched
by three passes of keyword-level Guard nerfs — was the one dial that BOTH
compressed the dominant wall decks AND lifted the roster-floor ramp decks
in the same move. A cut to 1 moved even more but risked the known v4.6
"sweeping cut" overshoot; **shipped the middle step, 3→2**.

(Note: v4.7's findings logged a Guard +3→+2 HP arm as a flat no-op — that
ablation ran against the pre-Fatigue-rule, pre-density-metric meta and
wasn't isolated the same way; this pass's dedicated wall-list ablation
battery is what actually surfaced the effect.)

Verification (33,840-game full roster): Avenge Grind 91.0%→85.4%, Shinobi
Steel-Scrap Control 82.0%→83.8% (a relative rise — it doesn't lean on
Guard, so it benefited from weaker rivals), Guard-Bulwark Turtle
80.2%→74.7%, Tempo-Anchor 18.4%→21.6%, Excavate Ramp 42.6%→47.2%. Guard's
own keyword win rate dropped from a top-5 51.2% to a neutral 50.0%.
Direction right on both ends of the roster at once — a first for this
lever across four passes. Still not fully closed (Avenge Grind is still
the roster's top deck at 85%); carried to §5.

### 2.2 Guard HP nerf's Leader-specific fallout — Mer-King

Mer-King is the primary Guard user in **all three** of its archetypes
(Guard-Bulwark Turtle, Twin Heal, Avenge Swarm all carry Guard as a primary
or secondary keyword). The wall-list fix that helped the roster overall hit
Mer-King disproportionately: Leader win rate 48.4%→42.5% (worst in the
roster), Avenge Swarm specifically 51.0%→39.5% before any compensation.
Leader spread widened from v4.8's 8.2pt (best-ever) to **~15.0pt** this
pass — a real regression, reported honestly rather than hidden.

Three compensation attempts, in order tried:
1. **Leader Ability mend value 2→3** (every-turn, repeatable): moved the
   *aggregate* Leader number the most (43.0%→45.3% in one measurement), but
   almost entirely by re-inflating Guard-Bulwark Turtle back toward its
   pre-nerf number (73.4%→77.4%) — the archetype that most exploits a
   repeatable per-turn effect, and the one the wall-list fix was aimed at
   in the first place. Reverted.
2. **Ultimate mend value 5→6** (once-per-game): small, doesn't reward
   repeat-exploitation the way #1 does, but also barely moved the
   aggregate number (42.9%→43.0%, noise). Kept — harmless and directionally
   correct, but not the fix.
3. **Resolve 2→3** (halves the Ability's threshold while behind): measured
   **zero** effect (43.0%→43.0%, archetype-level changes within noise).
   The Ability's threshold-5 gate was already low enough that Resolve
   rarely changed whether it fired. Reverted.

**Net**: kept the harmless Ultimate bump, reverted the other two. Mer-King
is left at ~42.5-43% this pass — a known, clearly-diagnosed regression, not
a mystery. The real fix isn't a Leader-kit lever (three tried, none clean)
— it's that Avenge Swarm and Twin Heal have their own weaknesses
independent of Guard's print stats that a kit-wide buff can't reach without
also re-inflating Turtle. Next pass should look at those two archetypes'
own card lists directly. See §5.

### 2.3 CPU reasoning lapses — the detector floor is real, not a blind spot

`lapseMissedLethal` and `lapseWastedCastableDie` measured **zero** again
(33,840 games) — third straight pass at zero for both. `lapseIdleLeaderAbility`
now fully decomposes to zero genuine lapses (§1) — the "small but real
inefficiency" v4.8 flagged as unmeasured turned out, once split, to be
entirely legal refusals and correct prioritization, not a bug. **The CPU's
placement/combat heuristics have no measurable reasoning lapse left in this
harness's detector set.** Any further AI-quality work needs a new class of
detector (e.g. suboptimal *target* choice within a legal action, not just
"did it act"), not a deeper look at the existing three.

### 2.4 Echo per-card variance — confounded, not actioned

The new per-card table (§1) shows a 20%-76% spread, but the lowest
performers (Swirling Ink Cloud 20.0%, Kinetic Siphon Swarm 20.9%, Nebula
Clutch 31.9%) are disproportionately drawn from the roster's two weakest
Echo-themed archetypes (Shinobi Echo-Straight 25.0%, Shinobi Tempo-Anchor
21.6%) rather than being spread evenly across every deck that happens to
draw them — i.e. this pass can't yet separate "this specific card is
underpowered" from "this card mostly gets recast by an already-losing
deck." Acting on it now would risk buffing cards that are actually fine and
just keep bad company. Needs a per-archetype-normalized version of this
table before it's actionable — flagged for next pass, not guessed at this
one.

### 2.5 Crescendo — third pass at the pool bottom

37.1%(v4.7)→39.2%(v4.8)→39.5%/36.4% this pass (essentially flat,
noise-level movement either way at this sample size — n=2820-4230).
Bumped base x 3→4 (the same incremental step every prior pass took) since
this pass's harness work targeted the wall-list/lapse/Echo questions
instead of a Crescendo redesign. Still watch-listed: v4.8's suggested
redesign ("+X if you placed any 6," a deterministic floor instead of
scaling with count) remains the most likely actual fix if a 4th
straight flat pass shows up next time.

## 3. Other results (no action)

- **Locations**: -0.5 to -1.3 win% vs. Location-stripped twins across this
  pass's runs (same persistent small negative v4.4-v4.8 measured) — no new
  lever tried this pass; carried forward.
- **Foothold/Contested/Excavate**: 39-41% this pass, still the bottom of
  the keyword table alongside Crescendo — no new instrumentation targeted
  these this pass beyond the general wall-list metric; carried forward.
- **Fatigue exposure**: consistent with v4.8 (gentle attrition, no cliff).

## 4. Still open — priority list for the next pass

1. **Mer-King's two weak archetypes** (Twin Heal 37.2%, Avenge Swarm
   43.3%) — fix at the card/list level, not the Leader kit (three kit
   levers tried this pass, none clean; see §2.2).
2. **The wall-list meta isn't fully closed** — Avenge Grind is still the
   roster's top deck (85.4%). guardHpBonus 3→2 was the first lever with
   the right *shape* of effect; a further step to 1 (measured in the
   ablation, not shipped) is the next candidate once Mer-King's kit-level
   fallout has an independent fix, so the two changes don't have to be
   diagnosed together.
3. **Per-archetype-normalized Echo win-delta** (§2.4) — divide out the
   deck-quality confound before trying another Echo lever.
4. **Crescendo** — 4th pass at the bottom; redesign candidate ready if the
   4→ (this pass) base bump doesn't move it.
5. **Locations and the four weakest Location keywords** — still no
   dedicated lever tried since v4.6's passive-value doubling and v4.4.2's
   on-cast add; needs its own ablation arm next pass instead of riding
   along on other levers.

## 5. Negative results kept honest

`exactCostCap` tightened further (1.5→1.0): dead on the top decks, actively
hurt the ramp floor — not shipped. `durableBodyTax` (+1, +2): diffuse,
non-targeted movement — not shipped. Mer-King Leader Ability value bump and
Resolve bump: both reverted (§2.2). Crescendo's third straight
under-the-threshold-of-concern pass is reported as-is, not oversold as
fixed.
