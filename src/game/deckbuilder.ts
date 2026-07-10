import { CardTemplate } from '../types';

export interface DeckDef {
  leader: string;
  cards: string[]; // 30 template ids, max 2 copies per name (rulebook §1.1)
}

export interface CardData {
  db: Record<string, CardTemplate>;
  decks: Record<string, DeckDef>;
  leaderIds: string[];
}

/**
 * Build a legal 30-card deck for every Leader in the card pool (§1.1):
 * exactly 30 cards, max 2 copies per unique name, only cards whose color
 * identity is covered by the Leader's supported elements, and at least two
 * Location cards so the Location Zone can be filled at setup (§1.2).
 */
export function buildCardData(templates: CardTemplate[]): CardData {
  const db: Record<string, CardTemplate> = {};
  for (const t of templates) db[t.id] = t;

  const leaders = templates.filter((t) => t.type === 'Leader');
  const decks: Record<string, DeckDef> = {};

  const costOf = (t: CardTemplate) => Object.values(t.cost || {}).reduce((a, b) => a + b, 0);

  // Rate a card's raw strength so every Leader plays the BEST of its pool,
  // not merely the cheapest. Keywords carry a flat premium.
  const cardScore = (t: CardTemplate): number => {
    const kwBonus = (t.keywords || []).length * 1.2;
    if (t.type === 'Unit') return (t.attack || 0) + (t.health || 0) + kwBonus - costOf(t);
    const eff = t.effect ? t.effect.value || 2 : 0;
    const attach = t.attach ? (t.attach.attack || 0) + (t.attach.health || 0) : 0;
    return eff + attach + kwBonus - costOf(t) * 0.5;
  };

  // Pick `n` names: best-scoring cards inside cost buckets (cheap / mid / top)
  // so decks keep a real mana curve while maximizing card quality.
  const pickCurve = (list: CardTemplate[], n: number): CardTemplate[] => {
    if (list.length <= n) return [...list];
    const cheap = list.filter((t) => costOf(t) <= 2);
    const mid = list.filter((t) => costOf(t) >= 3 && costOf(t) <= 4);
    const top = list.filter((t) => costOf(t) >= 5);
    for (const b of [cheap, mid, top]) b.sort((a, b2) => cardScore(b2) - cardScore(a));
    const want = [Math.ceil(n * 0.5), Math.ceil(n * 0.3), Math.floor(n * 0.2)];
    const out: CardTemplate[] = [
      ...cheap.slice(0, want[0]),
      ...mid.slice(0, want[1]),
      ...top.slice(0, want[2]),
    ];
    // Backfill from the global best if a bucket ran dry.
    const rest = list.filter((t) => !out.includes(t)).sort((a, b2) => cardScore(b2) - cardScore(a));
    while (out.length < n && rest.length > 0) out.push(rest.shift()!);
    return out.slice(0, n);
  };

  // A keyword string like "Armor 2" or "Freeze-Dry 1" -> its base glossary
  // name. Also treat the X-Cost/Sacrifice casting mechanics (template flags,
  // not glossary keywords) as diversity targets on the same footing -
  // otherwise their sole carriers can silently fall out of every deck when
  // curve-scoring shifts, leaving those mechanics completely unplaytested.
  // '!' sorts before every glossary keyword (all start with a letter), so
  // these two mechanics win any same-carrier-count scarcity tiebreak and
  // aren't starved out by the diversity swap cap when a leader's pool has
  // many other single-carrier keywords competing for the same few slots.
  const baseKeywords = (t: CardTemplate): string[] => {
    const kws = new Set((t.keywords || []).map((k) => k.split(' ')[0]));
    if (t.xCost) kws.add('!X-Cost');
    if (t.sacrifice) kws.add('!Sacrifice');
    return Array.from(kws);
  };

  // Cap on total diversity swaps forced into a single Leader's deck, so the
  // pass adds variety without gutting deck quality when a Leader's pool is
  // keyword-sparse to begin with.
  const MAX_TOTAL_DIVERSITY_SWAPS = 10;

  /**
   * After the curve-based `deck` is built, make sure every keyword that has
   * at least one legal Unit/Event/Item/Charm carrier for this Leader is
   * represented by at least one card in the deck. Missing keywords are
   * added by swapping out the worst-`cardScore()` already-included card of
   * the same type (Unit<->Unit, spell<->spell), cheapest/highest-scoring
   * legal carrier preferred, scarcest keywords (fewest legal carriers)
   * prioritized first. Keeps deck size at 30 and copies at <=2; never
   * touches Location cards (the Location-zone guarantee is untouched).
   */
  // Keywords already represented in an earlier-built deck. Both diversity
  // passes prioritize keywords with zero GLOBAL coverage so the limited swap
  // budget is not spent re-covering keywords another Leader already fields
  // while genuinely orphaned keywords (single-carrier Items/Charms, Location
  // auras) never surface anywhere in the meta.
  const globallyCoveredKeywords = new Set<string>();

  // How many cards in the ENTIRE pool carry each base keyword — used to spot
  // sole-carrier keywords whose only representative must not be evicted.
  const poolwideCarrierCount = new Map<string, number>();
  for (const t of templates) {
    if (t.type === 'Leader') continue;
    for (const kw of baseKeywords(t))
      poolwideCarrierCount.set(kw, (poolwideCarrierCount.get(kw) || 0) + 1);
  }

  const applyKeywordDiversity = (deck: string[], swappablePool: CardTemplate[], leaderName: string) => {
    const carriersByKeyword = new Map<string, CardTemplate[]>();
    for (const t of swappablePool) {
      for (const kw of baseKeywords(t)) {
        if (!carriersByKeyword.has(kw)) carriersByKeyword.set(kw, []);
        carriersByKeyword.get(kw)!.push(t);
      }
    }

    const uniqueIdsInDeck = () => Array.from(new Set(deck));
    const isUnit = (id: string) => db[id]?.type === 'Unit';
    const isSpell = (id: string) => ['Event', 'Item', 'Charm'].includes(db[id]?.type as string);
    const keywordCoveredCount = (): Map<string, number> => {
      const m = new Map<string, number>();
      for (const id of uniqueIdsInDeck()) {
        const t = db[id];
        if (!t) continue;
        for (const kw of baseKeywords(t)) m.set(kw, (m.get(kw) || 0) + 1);
      }
      return m;
    };

    // Roughly cap swaps at ~1/3 of a bucket, but never below 2 - combined
    // with MAX_TOTAL_DIVERSITY_SWAPS below this keeps per-leader diversity
    // swaps in the ~6-8 range even when a Leader's pool is keyword-sparse.
    const initialUnitCount = uniqueIdsInDeck().filter(isUnit).length;
    const initialSpellCount = uniqueIdsInDeck().filter(isSpell).length;
    // Reserve a little extra headroom so the X-Cost/Sacrifice casting
    // mechanics (which sort first via the '!' prefix but are otherwise
    // ordinary spell-bucket entries) aren't starved out by unrelated
    // keywords that happen to fill the bucket cap first.
    const mechanicReserve =
      (carriersByKeyword.has('!X-Cost') ? 1 : 0) + (carriersByKeyword.has('!Sacrifice') ? 1 : 0);
    // X-Cost/Sacrifice carriers must never be sacrificed as the "worst"
    // swap-out filler for some other keyword's slot: their template `value:
    // 0` base effect scores artificially low under cardScore() (the X/
    // sacrifice bonus only materializes at cast time), so without this they
    // were the first thing evicted even when originally curve-picked.
    const protectedMechanicIds = new Set(
      [...(carriersByKeyword.get('!X-Cost') || []), ...(carriersByKeyword.get('!Sacrifice') || [])].map(
        (t) => t.id,
      ),
    );
    const unitCap = Math.max(3, Math.ceil(initialUnitCount / 2)) + mechanicReserve;
    const spellCap = Math.max(3, Math.ceil(initialSpellCount / 2)) + mechanicReserve;
    let unitSwaps = 0;
    let spellSwaps = 0;
    let totalSwaps = 0;
    // Cards added BY this pass, protected from being swapped back out by a
    // later keyword in the same pass (curve-picked cards are fair game to
    // trade away even if each happens to be the deck's sole carrier of some
    // keyword - that's the point of the swap).
    const addedByDiversity = new Set<string>();

    // Globally-uncovered keywords first (nobody fields them yet), then
    // scarcest (fewest legal carriers) — those are hardest to ever surface —
    // so the right ones win when the swap budget runs out.
    const byScarcity = [...carriersByKeyword.entries()].sort(
      (a, b) =>
        Number(globallyCoveredKeywords.has(a[0])) - Number(globallyCoveredKeywords.has(b[0])) ||
        a[1].length - b[1].length ||
        a[0].localeCompare(b[0]),
    );

    for (const [kw, carriers] of byScarcity) {
      if (totalSwaps >= MAX_TOTAL_DIVERSITY_SWAPS) {
        console.warn(
          `[deckbuilder] ${leaderName}: hit diversity swap cap (${MAX_TOTAL_DIVERSITY_SWAPS}); some keywords may remain unrepresented in this deck.`,
        );
        break;
      }
      const covered = keywordCoveredCount();
      if ((covered.get(kw) || 0) > 0) continue; // already covered, incl. by an earlier swap

      const candidate = carriers
        .filter((t) => !deck.includes(t.id))
        .sort((a, b) => costOf(a) - costOf(b) || cardScore(b) - cardScore(a))[0];
      if (!candidate) continue; // no legal, not-yet-included carrier available

      const bucketIsUnit = candidate.type === 'Unit';
      if (bucketIsUnit && unitSwaps >= unitCap) {
        console.warn(`[deckbuilder] ${leaderName}: unit diversity cap (${unitCap}) reached; skipping keyword "${kw}".`);
        continue;
      }
      if (!bucketIsUnit && spellSwaps >= spellCap) {
        console.warn(`[deckbuilder] ${leaderName}: spell diversity cap (${spellCap}) reached; skipping keyword "${kw}".`);
        continue;
      }

      const sameTypeIds = uniqueIdsInDeck().filter((id) => (bucketIsUnit ? isUnit(id) : isSpell(id)));
      // Prefer evicting cards whose removal doesn't zero any keyword's
      // in-deck coverage — otherwise the pass steals coverage from one
      // keyword (often a curve-picked sole carrier of Freeze/Wildcast/...)
      // to hand it to another, and the evicted keyword never surfaces.
      const breaksCoverage = (t: CardTemplate) =>
        baseKeywords(t).some(
          (k) => (covered.get(k) || 0) <= 1 && !globallyCoveredKeywords.has(k),
        )
          ? 1
          : 0;
      const worst = sameTypeIds
        .map((id) => db[id])
        .filter((t): t is CardTemplate => !!t)
        // Don't immediately undo an earlier swap made by this same pass, and
        // never sacrifice a mechanic carrier (see protectedMechanicIds above).
        .filter((t) => !addedByDiversity.has(t.id) && !protectedMechanicIds.has(t.id))
        .sort((a, b) => breaksCoverage(a) - breaksCoverage(b) || cardScore(a) - cardScore(b))[0];
      if (!worst) continue; // no safe same-type swap available; leave it
      // A swap that zeroes another orphan keyword to cover this one is a
      // net-zero trade — keep the coverage the curve already gave us.
      if (breaksCoverage(worst)) continue;

      const removedCount = Math.min(deck.filter((id) => id === worst.id).length, 2);
      let removed = 0;
      for (let i = deck.length - 1; i >= 0 && removed < removedCount; i--) {
        if (deck[i] === worst.id) {
          deck.splice(i, 1);
          removed++;
        }
      }
      for (let i = 0; i < removedCount; i++) deck.push(candidate.id);
      addedByDiversity.add(candidate.id);

      if (bucketIsUnit) unitSwaps++;
      else spellSwaps++;
      totalSwaps++;
    }
  };

  /**
   * Location twin of applyKeywordDiversity. The curve pass includes exactly
   * the 2 cheapest Locations (2 copies each); keywords that only appear on
   * Locations (Hatchling, Valor, Inspire, Glacier, Flourish, Discord, ...)
   * therefore never surface. When a Location-carried keyword has zero
   * coverage in the deck, swap out one curve-picked Location name (both
   * copies) for the keyword's cheapest legal carrier. Name-for-name swaps
   * keep the deck at >=2 Location names, so the §1.2 Location-Zone
   * guarantee (buildDeck pulls 2 Locations into the zone) is preserved.
   * Capped at 1 swap per Leader: Locations are the strongest single lever a
   * deck has (persistent auras), so replacing both curve picks destabilizes
   * leader win rates far more than any Unit/spell swap.
   */
  const applyLocationDiversity = (deck: string[], locations: CardTemplate[]) => {
    const MAX_LOCATION_SWAPS = 1;
    const carriersByKeyword = new Map<string, CardTemplate[]>();
    for (const t of locations) {
      for (const kw of baseKeywords(t)) {
        if (!carriersByKeyword.has(kw)) carriersByKeyword.set(kw, []);
        carriersByKeyword.get(kw)!.push(t);
      }
    }
    const byScarcity = [...carriersByKeyword.entries()].sort(
      (a, b) =>
        Number(globallyCoveredKeywords.has(a[0])) - Number(globallyCoveredKeywords.has(b[0])) ||
        a[1].length - b[1].length ||
        a[0].localeCompare(b[0]),
    );
    const inDeckLocs = () =>
      Array.from(new Set(deck)).filter((id) => db[id]?.type === 'Location');
    const addedByDiversity = new Set<string>();
    let swaps = 0;
    for (const [kw, carriers] of byScarcity) {
      if (swaps >= MAX_LOCATION_SWAPS) break;
      const covered = Array.from(new Set(deck)).some((id) =>
        db[id] ? baseKeywords(db[id]).includes(kw) : false,
      );
      if (covered) continue;
      const candidate = carriers
        .filter((t) => !deck.includes(t.id))
        .sort((a, b) => costOf(a) - costOf(b) || cardScore(b) - cardScore(a))[0];
      if (!candidate) continue;
      // Swap out the worst-scoring in-deck Location, never one this pass
      // just added, and prefer one whose keywords have other carriers in the
      // full pool (don't zero a sole-carrier keyword like Codex to cover
      // this one).
      const breaksCoverage = (t: CardTemplate) =>
        baseKeywords(t).some((k) => (poolwideCarrierCount.get(k) || 0) <= 1) ? 1 : 0;
      const worst = inDeckLocs()
        .filter((id) => !addedByDiversity.has(id))
        .map((id) => db[id])
        .filter((t): t is CardTemplate => !!t)
        .sort((a, b) => breaksCoverage(a) - breaksCoverage(b) || cardScore(a) - cardScore(b))[0];
      if (!worst) continue;
      const copies = deck.filter((id) => id === worst.id).length;
      for (let i = deck.length - 1; i >= 0; i--) if (deck[i] === worst.id) deck.splice(i, 1);
      for (let i = 0; i < copies; i++) deck.push(candidate.id);
      addedByDiversity.add(candidate.id);
      swaps++;
    }
  };

  const pendingLocationPasses: {
    leaderId: string;
    deck: string[];
    locations: CardTemplate[];
  }[] = [];

  for (const leader of leaders) {
    const pool = templates.filter(
      (t) => t.type !== 'Leader' && t.elements.every((e) => leader.elements.includes(e)),
    );
    const locations = pool.filter((t) => t.type === 'Location');
    const units = pool.filter((t) => t.type === 'Unit');
    const spells = pool.filter((t) => ['Event', 'Item', 'Charm'].includes(t.type));

    for (const l of [locations, units, spells]) {
      l.sort((a, b) => costOf(a) - costOf(b) || a.name.localeCompare(b.name));
    }

    const deck: string[] = [];
    // Guarantee the Location Zone can be filled: 2 copies of the 2 cheapest Locations.
    for (const loc of locations.slice(0, 2)) deck.push(loc.id, loc.id);
    // 7 unit names × 2 (14 units) and 6 spell names × 2 (12 spells) spread
    // across the cost curve.
    const picks = [...pickCurve(units, 7), ...pickCurve(spells, 6)];
    for (const t of picks) {
      if (deck.length >= 30) break;
      deck.push(t.id);
      if (deck.length < 30) deck.push(t.id);
    }
    // Backfill from the remaining pool if a color pair has a shallow pool.
    const leftovers = [...units, ...spells, ...locations.slice(2)].filter(
      (t) => !deck.includes(t.id),
    );
    for (const t of leftovers) {
      if (deck.length >= 30) break;
      deck.push(t.id);
      if (deck.length < 30) deck.push(t.id);
    }
    let i = 0;
    const all = [...units, ...spells, ...locations];
    while (deck.length < 30 && all.length > 0) {
      deck.push(all[i % all.length].id);
      i++;
    }

    // Guarantee keyword diversity: make sure every keyword with a legal
    // carrier for this Leader shows up in the deck at least once, swapping
    // out only the weakest same-type filler (Locations are untouched).
    const swappablePool = [...units, ...spells];
    applyKeywordDiversity(deck, swappablePool, leader.name);

    // The Location pass runs AFTER all decks are curve-built (second loop
    // below) so its global-coverage priority sees the full meta.
    pendingLocationPasses.push({ leaderId: leader.id, deck, locations });

    // Record this deck's keyword coverage for later Leaders' priority sort.
    for (const id of new Set(deck)) {
      const t = db[id];
      if (t) for (const kw of baseKeywords(t)) globallyCoveredKeywords.add(kw);
    }
  }

  // Same guarantee for Location-only keywords (swap whole Location names,
  // never dropping below the 2-Location minimum required by §1.2). Run as a
  // second loop so globallyCoveredKeywords is complete: each Leader's two
  // Location slots go to the keywords nobody else in the meta fields.
  for (const { leaderId, deck, locations } of pendingLocationPasses) {
    applyLocationDiversity(deck, locations);
    for (const id of new Set(deck)) {
      const t = db[id];
      if (t) for (const kw of baseKeywords(t)) globallyCoveredKeywords.add(kw);
    }
    decks[leaderId] = { leader: leaderId, cards: deck.slice(0, 30) };
  }

  return { db, decks, leaderIds: leaders.map((l) => l.id) };
}
