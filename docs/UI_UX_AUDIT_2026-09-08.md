# Card readability and gameflow audit — 8 September 2026

Baseline: `a66f33e159e6b04fde44be96cf4b3cff5f013c44` on main.

## Assessment

Keep the existing 5:7 cards, framed art, monochrome layout and premium rarity identity. The immediate problem is information hierarchy: small card text, hidden instructions, and outcomes that require the player to infer targets and timing. This change improves those paths without changing combat balance or the engine rules.

This is a source and automated-test audit with targeted fixes, not a completed visual acceptance pass. The connected browser rejected the local gallery with `net::ERR_BLOCKED_BY_CLIENT`. No claim is made that desktop/mobile matches, artwork contrast or responsive geometry were visually verified. Live accounts, rewards, matchmaking and database/catalog parity were outside the verified scope.

## Findings and implemented changes

| Priority | Evidence | Change |
| --- | --- | --- |
| High | `FittedRules` clamps mechanics; both inspectors previously rendered the same clamped CardFace at a larger scale. Enlargement cannot reveal omitted lines. | Add a shared, unclipped reading panel to both inspectors: cost, printed stats, effects, triggers, Leader abilities, keyword reminders and flavor. Preserve compact card previews. |
| Medium | Rules and flavor fitted themselves independently; the rules paragraph could surrender lines while flavor remained. | Let flavor yield to mechanics before reducing rules lines; prevent flex from compressing the rules paragraph into partial lines. Geometry still needs browser verification. |
| Medium | Ultra-Rare's rotated ribbon and ownership/foil badges share the art's top-left corner. | Use a small horizontal ULTRA-RARE stamp in the art's bottom-right, preserving the premium frame and artwork proportions. |
| High | The hint uses `line-clamp-2 sm:line-clamp-1`; its closing action or incoming-damage instruction can disappear. | Remove the clamp and increase text from 9px to 11px. Check short phone viewports before release because wrapping uses more height. |
| Medium | Main-phase advice always says Wellsprings are once per turn, including the second player's opening and after the allowance is spent. | Display the actual remaining allowance, exhausted second-Wellspring exception, and used state. Explain auto-payment and phase-end essence loss. |
| High | The pending stack lists source names but not already-locked target choices. | Show effect targets, friendly bonds and independent Tool targets. Flag an effect target that becomes illegal and identify departed targets without suggesting a replacement. |
| Medium | Main II help says “spend fresh essence,” while exhausted Locations do not recover then. Deck help says Alt-Art/Mythic “exactly 1,” suggesting mandatory inclusion. | Explain that only still-ready Locations remain available; change the copy to “up to 1.” |
| Medium | New players face long reference sections before a concise sequence using actual board controls. | Add a visible first-turn walkthrough covering mulligan, Wellsprings, invoke/targets, attack/skip, guards/reactions, PASS versus END TURN, and discard. |

## Next improvements, in order

1. **Complete desktop and mobile visual acceptance.** Check 390×844, 375×667, desktop, enlarged text, every rarity including Alt-Art, normal/foil/serialized cards, long titles and dense Leaders. Check rules/stat overlap, all controls reachable, open-inspector scrolling and the taller hint. The existing `audit-cardface.ts` omits Alt-Art and only measures flavor/stat intersections; extend it to actual mechanics clipping and badge collisions before treating it as a complete card gate.
2. **Make the board's decisions easier to read.** Put the current decision, legal actions and consequence beside the primary button. Keep pending-card details in a bounded, scrollable area rather than the current absolute overlay. Validate this against narration and target-picking so controls never cover selectable units. The overlay remains unchanged in this patch apart from its content and font size.
3. **Show a combat outcome preview before confirmation.** Explain likely incoming Vitality loss, units at risk, guard restrictions and Overrun; clearly mark the preview as provisional while reactions remain possible. Use the engine's combat calculations rather than a second rules implementation.
4. **Replace ambiguous multi-target auto-selection with explicit choices.** Tools with a separate targeted on-invoke effect need distinct primary-effect and weaken-rider choices. This needs a coordinated engine/API/UI change; the current patch exposes the locked choices but does not redesign their selection.
5. **Reduce learning load.** Keep the new quick start, then introduce resource timing, summoning sickness, guards and responses through a small guided practice match. Explain “why unavailable” in touch-visible text, not only hover titles. Test with new players and record where they hesitate before revising rules or balance.
6. **Prevent rule drift.** Generate/check keyword references from the shared keyword definitions. Resolve the remaining intentional digital exceptions explicitly: Leader actions bypass the stack, Resonant can retarget its second effect, and empty-stack Clash response ordering is caller-driven. These are design decisions requiring coordinated changes, not safe copy-only fixes.
7. **Unify premium decoration after visual review.** Ultra-Rare currently combines gold stamp/corners with teal/violet full-size filigree. Choose one premium accent family and use it across compact, full, foil and showroom presentations. Keep text on a stable opaque surface; avoid adding more full-face effects.

## Verification

- Baseline: 42 test files, 538 tests passed.
- Updated suite: 42 files, 541 tests passed. New cases cover complete reading content and locked/missing/Warded/self-bond target descriptions.
- Card component suite rerun after final fitting changes: 11 tests passed.
- TypeScript check and production build passed. ESLint: zero errors, 28 warnings.
- Formatting and `git diff --check` passed.
- Seeded CPU simulation: 4 decks, 1 game per ordered pairing, seed 1337; 12 completed matches, no turn-limit draws, engine invariants clean. This is a smoke test, not a balance verdict.
- Browser visual acceptance remains blocked as described above. Passing jsdom tests does not validate card geometry or contrast.
