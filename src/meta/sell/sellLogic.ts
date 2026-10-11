/**
 * Pure logic for the Marketplace SELL desk: which lots are listable (and why
 * not), pricing suggestions and warnings, fee maths and client validation.
 * The server (create_listing / create_variant_listing / create_slab_listing,
 * create_listings_many) stays the authority — this only keeps the form from
 * offering what those RPCs will refuse.
 */
import type { CardDef } from '../../game/poker/cards';
import type { CardVariant, OwnedVariant } from '../variants';
import type { GradedCard } from '../grading';
import { gradedQuicksellPrice } from '../grading';
import { quicksellPrice } from '../economy';
import { sellableSplit } from '../sellable';

/** Mirrors finalize_sale: the seller pays ceil(5%) of the sale. */
export const MARKET_FEE_RATE = 0.05;
/** create_listing caps (quantity per lot, price per lot). */
export const LISTING_MAX_QTY = 20;
export const LISTING_MAX_PRICE = 1_000_000;
/** create_listing / create_slab_listing: active listings per seller. */
export const MAX_ACTIVE_LISTINGS = 10;
/** create_listings_many: lots per call. */
export const MAX_BATCH = 10;
/** Fixed listings always run 14 days; auctions take 1–168h. */
export const FIXED_DAYS = 14;
export const AUCTION_HOURS = [6, 12, 24, 48, 72, 168] as const;

export function marketFee(amount: number): number {
  return Math.ceil(Math.max(0, amount) * MARKET_FEE_RATE);
}
export function youReceive(amount: number): number {
  return Math.max(0, amount) - marketFee(amount);
}

export interface SlabInfo {
  id: string;
  grade: number;
  service: GradedCard['service'];
  pristine: boolean;
}

/** One thing that can be put on the market: a stack of copies or a slab. */
export interface SellItem {
  /** card:<id>:<0|1>:<variant> or slab:<graded id>. */
  key: string;
  kind: 'card' | 'slab';
  cardId: string;
  def: CardDef;
  foil: boolean;
  variant: CardVariant | null;
  slab?: SlabInfo;
  owned: number;
  /** Copies that can leave in one lot (≤ LISTING_MAX_QTY is applied later). */
  spare: number;
  reserved: number;
  /** Why nothing can be listed, or null. */
  blockedWhy: string | null;
  /** Unit quicksell floor. */
  quicksell: number;
  /** Unit reference value (blended market), for sorting before the guide lands. */
  value: number;
  /** Bigger = more recent (slab reveal time; cards keep collection order). */
  recency: number;
}

export interface BuildInput {
  collection: { card_id: string; quantity: number; foil_quantity: number }[];
  decks: { card_ids: string[] }[];
  serialized: { card_id: string }[];
  variants: OwnedVariant[];
  slabs: GradedCard[];
  defs: Record<string, CardDef | undefined>;
  /** Optional server reference values (get_listable_inventory). */
  values?: Map<string, number>;
}

export const cardKey = (cardId: string, foil: boolean, variant: CardVariant | null) =>
  `card:${cardId}:${foil ? 1 : 0}:${variant ?? ''}`;

export function buildSellItems(inp: BuildInput): SellItem[] {
  const locks = new Map<string, number>();
  for (const d of inp.decks)
    for (const id of d.card_ids ?? []) locks.set(id, (locks.get(id) ?? 0) + 1);
  const ser = new Map<string, number>();
  for (const s of inp.serialized) ser.set(s.card_id, (ser.get(s.card_id) ?? 0) + 1);
  const varsBy = new Map<string, OwnedVariant[]>();
  for (const v of inp.variants) {
    if (v.quantity <= 0) continue;
    varsBy.set(v.card_id, [...(varsBy.get(v.card_id) ?? []), v]);
  }

  const out: SellItem[] = [];
  const n = inp.collection.length;
  inp.collection.forEach((c, idx) => {
    const def = inp.defs[c.card_id];
    if (!def || def.type === 'Leader') return;
    const vs = varsBy.get(c.card_id) ?? [];
    const vq = vs.filter((v) => !v.foil).reduce((a, v) => a + v.quantity, 0);
    const vf = vs.filter((v) => v.foil).reduce((a, v) => a + v.quantity, 0);
    const q = Math.max(0, c.quantity - vq);
    const f = Math.max(0, c.foil_quantity - vf);
    const lock = locks.get(c.card_id) ?? 0;
    const serial = ser.get(c.card_id) ?? 0;
    const split = sellableSplit({ q, f }, lock, serial);
    const total = c.quantity + c.foil_quantity;
    const why = (spare: number, owned: number, isFoil: boolean) => {
      if (spare > 0 || owned <= 0) return null;
      if (lock > 0) return `In ${lock === 1 ? 'a deck' : `decks (${lock})`}`;
      if (!isFoil && serial > 0) return 'Serialized print — never listable';
      return 'All copies reserved';
    };
    const recency = n - idx;
    for (const foil of [false, true]) {
      const owned = foil ? f : q;
      if (owned <= 0) continue;
      const spare = foil ? split.foil : split.normal;
      const qs = quicksellPrice(def.rarity, foil, null);
      out.push({
        key: cardKey(c.card_id, foil, null),
        kind: 'card',
        cardId: c.card_id,
        def,
        foil,
        variant: null,
        owned,
        spare,
        reserved: owned - spare,
        blockedWhy: why(spare, owned, foil),
        quicksell: qs,
        value: inp.values?.get(cardKey(c.card_id, foil, null)) ?? qs,
        recency,
      });
    }
    for (const v of vs) {
      // A variant lot: its own copies, but deck locks still count every copy.
      const spare = Math.max(0, Math.min(v.quantity, total - lock));
      const qs = quicksellPrice(def.rarity, v.foil, v.variant);
      const key = cardKey(c.card_id, v.foil, v.variant);
      out.push({
        key,
        kind: 'card',
        cardId: c.card_id,
        def,
        foil: v.foil,
        variant: v.variant,
        owned: v.quantity,
        spare,
        reserved: v.quantity - spare,
        blockedWhy: spare > 0 ? null : `In ${lock === 1 ? 'a deck' : `decks (${lock})`}`,
        quicksell: qs,
        value: inp.values?.get(key) ?? qs,
        recency,
      });
    }
  });

  for (const g of inp.slabs) {
    if (g.retired) continue;
    const def = inp.defs[g.card_id];
    if (!def) continue;
    const grade = g.grade == null ? null : Number(g.grade);
    const blockedWhy =
      grade == null
        ? 'At the graders'
        : g.crossover_pending
          ? 'Crossover in progress'
          : g.listing_id
            ? 'Already listed'
            : null;
    const qs =
      grade == null
        ? 0
        : gradedQuicksellPrice(def.rarity, g.foil, grade, g.service, {
            pristine: !!g.pristine,
            variant: g.variant ?? null,
          });
    out.push({
      key: `slab:${g.id}`,
      kind: 'slab',
      cardId: g.card_id,
      def,
      foil: g.foil,
      variant: g.variant ?? null,
      slab:
        grade == null ? undefined : { id: g.id, grade, service: g.service, pristine: !!g.pristine },
      owned: 1,
      spare: blockedWhy ? 0 : 1,
      reserved: blockedWhy ? 1 : 0,
      blockedWhy,
      quicksell: qs,
      value: qs,
      recency: n + Date.parse(g.revealed_at ?? g.submitted_at ?? '') / 1e9 || n,
    });
  }
  return out;
}

export type SellKind = 'all' | 'cards' | 'foil' | 'variants' | 'slabs';
export type SellSort = 'value' | 'recent' | 'dupes' | 'name';
export interface SellFilter {
  search: string;
  kind: SellKind;
  rarity: string;
  color: string;
  type: string;
  set: string;
  showBlocked: boolean;
}

export function filterSellItems(items: SellItem[], f: SellFilter, sort: SellSort): SellItem[] {
  const s = f.search.trim().toLowerCase();
  const list = items.filter((it) => {
    if (!f.showBlocked && it.blockedWhy) return false;
    if (s && !it.def.name.toLowerCase().includes(s)) return false;
    if (f.kind === 'cards' && it.kind !== 'card') return false;
    if (f.kind === 'foil' && !it.foil) return false;
    if (f.kind === 'variants' && !it.variant) return false;
    if (f.kind === 'slabs' && it.kind !== 'slab') return false;
    if (f.rarity !== 'All' && (it.def.rarity ?? 'Common') !== f.rarity) return false;
    if (f.color !== 'All') {
      if (
        f.color === 'Colourless'
          ? it.def.colors.length > 0
          : !it.def.colors.includes(f.color as never)
      )
        return false;
    }
    if (f.type !== 'All' && it.def.type !== f.type) return false;
    if (f.set !== 'All' && (it.def.set ?? '') !== f.set) return false;
    return true;
  });
  const cmp: Record<SellSort, (a: SellItem, b: SellItem) => number> = {
    value: (a, b) => b.value - a.value,
    recent: (a, b) => b.recency - a.recency,
    dupes: (a, b) => b.spare - a.spare || b.value - a.value,
    name: (a, b) => a.def.name.localeCompare(b.def.name),
  };
  // Listable lots always ahead of blocked ones.
  return list.sort(
    (a, b) =>
      Number(!!a.blockedWhy) - Number(!!b.blockedWhy) ||
      cmp[sort](a, b) ||
      a.key.localeCompare(b.key),
  );
}

export interface PriceGuide {
  market: number;
  recent: { price: number; at: string }[];
  lowest_active: number | null;
  active_count: number;
}

/** Suggested UNIT prices: undercut to sell fast, match market, or hold out. */
export function suggestPrices(
  quicksell: number,
  guide: PriceGuide | null | undefined,
): { quick: number; market: number; premium: number } {
  const market = Math.max(1, guide?.market ?? quicksell);
  const lowest = guide?.lowest_active ?? null;
  // Quick sale: a hair under the cheapest live listing (or 90% of market),
  // never below the quicksell floor — under it you'd do better quickselling.
  const undercut =
    lowest != null ? lowest - Math.max(1, Math.round(lowest * 0.02)) : Math.round(market * 0.9);
  // …but never above market itself.
  const quick = Math.max(1, Math.min(market, Math.max(quicksell, undercut)));
  const premium = Math.max(market + 1, Math.round(market * 1.25));
  return { quick, market: Math.max(market, 1), premium };
}

export type PriceWarning = { level: 'warn' | 'info'; text: string };

/** Warnings for a lot total `price` covering `qty` copies. */
export function priceWarnings(
  price: number,
  qty: number,
  quicksell: number,
  market: number | null,
  type: 'fixed' | 'auction',
): PriceWarning[] {
  const out: PriceWarning[] = [];
  if (price <= 0) return out;
  const unit = price / Math.max(1, qty);
  if (unit < quicksell)
    out.push({
      level: 'warn',
      text:
        type === 'auction'
          ? `Starting bid is under the ${quicksell.toLocaleString()} quicksell floor — it could sell for less than quickselling.`
          : `Under the ${quicksell.toLocaleString()} quicksell floor — quickselling would pay more.`,
    });
  if (market && unit > market * 2)
    out.push({
      level: 'warn',
      text: `${Math.round(unit / market)}× the market value — it may sit unsold until it expires.`,
    });
  if (type === 'auction' && unit > quicksell)
    out.push({ level: 'info', text: 'Above quicksell, so CPU collectors will skip this auction.' });
  return out;
}

export interface ListingDraft {
  type: 'fixed' | 'auction';
  quantity: number;
  price: number;
  buyout: number | null;
  hours: number;
}

/** First problem the server would reject with, or null. */
export function validateDraft(d: ListingDraft, spare: number): string | null {
  const maxQty = Math.min(LISTING_MAX_QTY, spare);
  if (maxQty < 1) return 'Nothing spare to list';
  if (!Number.isInteger(d.quantity) || d.quantity < 1) return 'Quantity must be at least 1';
  if (d.quantity > maxQty) return `At most ${maxQty} in one listing`;
  if (!Number.isInteger(d.price) || d.price < 1) return 'Enter a price of at least 1';
  if (d.price > LISTING_MAX_PRICE)
    return `Price can't exceed ${LISTING_MAX_PRICE.toLocaleString()}`;
  if (d.type === 'auction') {
    if (d.buyout != null && d.buyout <= d.price)
      return 'Buyout must be higher than the starting bid';
    if (d.buyout != null && d.buyout > LISTING_MAX_PRICE)
      return `Buyout can't exceed ${LISTING_MAX_PRICE.toLocaleString()}`;
    if (d.hours < 1 || d.hours > 168) return 'Auctions run 1 hour to 7 days';
  }
  return null;
}

/** A batch lot as create_listings_many takes it. */
export interface BatchLot {
  card_id: string;
  foil: boolean;
  variant: CardVariant | null;
  graded_id: string | null;
  quantity: number;
  type: 'fixed' | 'auction';
  price: number;
  buyout: number | null;
  hours: number;
}

export function lotFor(item: SellItem, d: ListingDraft): BatchLot {
  return {
    card_id: item.cardId,
    foil: item.foil,
    variant: item.kind === 'slab' ? null : item.variant,
    graded_id: item.slab?.id ?? null,
    quantity: item.kind === 'slab' ? 1 : d.quantity,
    type: d.type,
    price: d.price,
    buyout: d.type === 'auction' ? d.buyout : null,
    hours: d.hours,
  };
}

/** Bulk: every selected lot at `pct`% of its unit market, all spare copies (≤20). */
export function bulkLots(
  items: SellItem[],
  guides: Map<string, PriceGuide>,
  pct: number,
  allCopies: boolean,
): { item: SellItem; lot: BatchLot }[] {
  return items.map((item) => {
    const market = guides.get(item.key)?.market ?? item.value;
    const qty = item.kind === 'slab' ? 1 : allCopies ? Math.min(LISTING_MAX_QTY, item.spare) : 1;
    const unit = Math.max(1, Math.round((market * pct) / 100));
    const price = Math.min(LISTING_MAX_PRICE, unit * qty);
    return {
      item,
      lot: lotFor(item, { type: 'fixed', quantity: qty, price, buyout: null, hours: 24 }),
    };
  });
}

/** The price-guide query key for an item (plain/variant copies or slab grade+house). */
export function guideQuery(item: SellItem): Record<string, unknown> {
  return item.slab
    ? {
        card_id: item.cardId,
        foil: item.foil,
        variant: item.variant,
        grade: item.slab.grade,
        service: item.slab.service,
        pristine: item.slab.pristine,
      }
    : { card_id: item.cardId, foil: item.foil, variant: item.variant };
}

/** Compact time-left for the active listings panel. */
export function hoursLeft(endsAt: string, now: number): string {
  const ms = Date.parse(endsAt) - now;
  if (!(ms > 0)) return 'ended';
  if (ms > 365 * 86_400_000) return 'No expiry';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)}d left`;
  if (h >= 1) return `${h}h ${m}m left`;
  return `${Math.max(1, m)}m left`;
}
