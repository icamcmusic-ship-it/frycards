# Keyword Tier System (v4.19)

Every keyword in FryCards now comes in numbered tiers, **I** up to at most
**V**. A given keyword+tier always means the same ability and the same cost
contribution on every card that carries it. The single source of truth is
`KEYWORD_TIERS` in `src/game/v3/keywords.ts`; tiers are assigned to all
~292 pool cards deterministically in `src/game/v3/cardpool.ts` (`tierFor` /
`assignTiers`), stored on the card def as `keywordTiers: Record<string,
number>` alongside the unchanged `keywords: string[]`.

Design constraint honored throughout: the tier ladder is a
**re-representation of live v4.18 balance, not a power shuffle**. Every
pre-existing magnitude maps to the tier that prints exactly that magnitude
(Bulwark x → tier x, Steel 1 → I, Pierce's half-ATK cap → II, Echo's
rarity fodder-waiver → II at Rare+, …). Only the new tier-cap printings at
the very top of the rarity ladder are new behavior.

## UI API (`src/game/v3/keywords.ts`)

| Export | Signature | Purpose |
|---|---|---|
| `cardKeywords` | `(def: CardDef) => CardKeyword[]` | A card's keyword chips: `{kw, tier, roman, label, description, maxTier, atCap}` |
| `tierDescription` | `(kw: string, tier: number) => string` | Tier-specific rules text, incl. bundled activation cost |
| `maxTier` | `(kw: string) => number` | Ladder depth (1–5) |
| `roman` | `(tier: number) => string` | `1 → 'I'` … `5 → 'V'` |
| `keywordTier` | `(def, kw) => number` | Card's tier (explicit map, or legacy-exact fallback) |
| `tierMagnitude` / `tierCostWeight` | `(kw, tier) => number` | The tier's numeric parameter / cost contribution |
| `cardKeywordWeight` | `(def) => number` | Σ costWeight of the card's keyword tiers |
| `hasTierCapPremium` | `(def) => boolean` | Carries the top tier of a 3+-tier ladder |
| `mechanicLabels` | `(def) => MechanicLabel[]` | Short structured chips for onCast / ability / combo / overflow / Twin bonus / Aftershock / Tribute / Location passive / Ultimate |
| `effectLabel` | `(effect) => string` | e.g. `"Sap 3 (any enemy)"` |
| `KEYWORD_TIERS` | table | Full keyword × tier data |

Cards render as name/stats/cost + keyword chips + `mechanicLabels()` chips +
flavor — no pool card carries free-form rules text (`def.text` is
undefined for every generated card; enforced by `keywords.test.ts`).

## Full tier table

Weights (`w`) are the tier's casting-cost contribution. Passive tiers only
contribute `w`; **activated** keywords (marked ⚙) bundle their activation
cost into the tier text instead.

| Keyword | I | II | III | IV | V |
|---|---|---|---|---|---|
| **Guard** | taunt (w .5) | taunt, printed +2 max HP (w 1) | taunt, printed +4 max HP (w 1.5) | | |
| **Swift** | no summoning sickness (w .5) | + printed +1 ATK (w 1) | | | |
| **Pierce** | overflow to Leader capped ⌊ATK/3⌋ min 1 (w 1) | capped ⌊ATK/2⌋ min 1 (w 1.5) | **uncapped** overflow (w 2) | | |
| **Ward** | block first hit/turn, spike 1 back (w 1) | spike 2 back (w 1.5) | | | |
| **Frenzy** | 2 attacks, 2nd doubles retaliation (w .5) | + printed +2 ATK (w 1) | 2nd swing takes **normal** retaliation (w 1.5) | | |
| **Anchor** | −1/other Anchor, cap −2 (w .5) | cap −3, +2/+2 at full ramp (w 1) | full-ramp bonus **+3/+3** (w 1.5) | | |
| **Echo** ⚙ | recast: cost + discard 1 (w .5) | recast: cost only, **no fodder** (w 1) | | | |
| **Scrap** ⚙ | discard: reroll 1 die, keep-highest-of-2 (w .5) | keep-highest-of-**3** (w 1) | | | |
| **Rally** ⚙ | reuse a die on an exhausted friendly Ability Slot (w .5) | borrowed die counts **+1** (w 1) | | | |
| **Twin** | small completion rider (w 1) | medium rider (w 1.5) | large rider (w 2) | | |
| **Bulwark** | −1 attack damage (w .5) | −2 (w 1) | −3 (w 1.5) | | |
| **Toll** | Leader damage −1 (w 1) | −2 (w 1.5) | −3 (w 2) | | |
| **Steel** | prevent first 1/turn, any source (w 1.5) | first 2 (w 2) | first 3 (w 2.5) | | |
| **Avenge** | +1/+1 per friendly death, cap +2/+2 (w 1) | cap +3/+3 (w 1.5) | | | |
| **Overrun** | punch ⌊ATK/2⌋ min 1 through full prevention (w .5) | +1 on top (w 1) | | | |
| **Crescendo** | +4 on a rolled 5–6 (w .5) | +5 (w 1) | +6 (w 1.5) | +7 (w 2) | +8 (w 2.5) |
| **Aftershock** | half-value delayed repeat (w 1) | **full-value** repeat (w 1.5) | | | |
| **Snap** | cast during Reroll Phase (w .5) | | | | |
| **Tribute** | fires on 2+ pitched dice (w .5) | fires on **any** pitched die (w 1) | | | |
| **Excavate** | Ability −1/turn (w .5) | −2/turn (w 1) | −3/turn (w 1.5) | | |
| **Contested** | passive doubles vs no enemy Location (w .5) | | | | |
| **Foothold** | first Unit/turn −1 (w .5) | −2 (w 1) | | | |
| **Resolve** (Leader) | Ability −1 at ≤half HP (w 0) | −2 (w 0) | | | |
| **Ultimate** (Leader) | once-per-game second Ability (w 0) | | | | |

Leader keywords weigh 0 — Leaders never pay a Cast Slot cost.

## Tier-cap premium rule

A card carrying the **highest tier of a keyword whose ladder is 3+ tiers
deep** (`hasTierCapPremium`) gets both halves of the premium:

1. **A better variant** — every 3-deep ladder's cap is a qualitatively
   stronger rider, not just a bigger number: Pierce III is uncapped,
   Frenzy III drops the doubled retaliation, Anchor III upgrades the
   full-ramp bonus, Guard III prints double the HP rider, etc.
2. **A much cheaper effective cast** — the cost recalculation (below)
   subtracts a full cost tier for premium cards.

## Cost recalculation

For every Unit (non-Twin) and generic Charm/Event, the applied cost format
(`threshold`/`castCostKind`/`comboGate`) is recomputed as:

```
costTier = clamp( baseTier + round(Σ tierCostWeight / 2) − premium , 0, 5 )
cost     = pickCostFormat(cardId, costTier)      // unchanged v4.3 vocabulary
```

- `baseTier` is the rarity tier for Units (which also drives the stat
  budget, so it is the stats proxy) and the existing power/cost tier for
  spells (Bind/destroy bumps intact).
- `premium` = 1 iff the card has the tier-cap premium.
- `pickCostFormat` keeps the exact/sum/pattern-gate vocabulary and the
  same per-id hash rolls, so a card's cost only moves when its keyword
  weight moves its tier.
- The Unit stat budget then prices off this **final** cost (the v4.6
  exact-cost clamp sees the real cost kind), and `applyManualCostAdj`
  clamps exact costs back into 1–6.
- Twin bodies keep the legacy two-slot exact-face cost; Locations still
  cast free; the special Event branches (Mythic trophy, Super-Rare wipes,
  tier-4+ bombs) keep their hand-tuned steep costs.

Implemented in `keywordCostTier()` (cardpool.ts).

## Determinism & engine

- Assignment is a pure function of the card catalog (id, type, rarity) —
  identical on every client; all pre-existing hash rolls/salts unchanged.
- The engine reads runtime magnitudes from the tier table (`keywordTier` +
  `tierMagnitude`): Ward spike, Pierce cap, Frenzy retaliation, Overrun
  bonus, Anchor cap/bonus, Steel/Bulwark/Toll amounts, Echo fodder, Rally
  bonus, Scrap rolls, Tribute threshold, Foothold discount, Avenge cap,
  Crescendo bonus. Legacy `x` fields (`def.bulwark` etc.) are kept
  populated as derived mirrors for the AI/UI; hand-built defs with no
  `keywordTiers` fall back to defaults that reproduce pre-tier behavior
  exactly (all v4.18 engine tests pass unmodified).
- Sanity (small run, `npx tsx scripts/simulate-v4.ts 2`, 6612 games): zero
  invariant violations; leader ordering matches the v4.18 baseline within
  small-run noise (Sea Witch top, Shinobi bottom — Shinobi dips a few
  points further, consistent with Steel/durability bodies now paying a
  real cost weight, the direction three straight findings docs asked for).
