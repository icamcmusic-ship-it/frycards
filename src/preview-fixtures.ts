/**
 * Offline row fixtures for the meta-screen harness (`src/meta-preview.tsx`).
 *
 * WHY THIS EXISTS
 *
 * `meta-preview.tsx` mounts every meta screen against a stubbed `MetaState`,
 * which covers the seven things that live in the context — profile, collection,
 * decks, inventory, cosmetics, shop items, pack types. Everything else a screen
 * shows it fetches for ITSELF on mount, straight through `lib/supabase`, and
 * the harness is offline: those calls fail, and the screen renders its own
 * loading/error/empty state.
 *
 * v19 called that out for three context fields and fixed them there. The same
 * hole is much larger one level down. On the audit's own numbers, at both
 * widths:
 *
 *   battlepass  1 control      news       3 controls
 *   market      4 controls     social     5 controls
 *   achievements 4 controls    shops      8 controls
 *
 * One control is a BACK button. Six screens — the entire reward track, the
 * auction house, the storefront browser, the friends/trading panel, the news
 * feed and the mission list — have been measured as an empty state and nothing
 * else for eight passes, while the harness printed a clean pass for them. The
 * brief for this harness is "every screen's visible controls are clicked one at
 * a time"; for these six there were no visible controls to click.
 *
 * WHAT THIS DOES
 *
 * Patches `globalThis.fetch` before the Supabase client is constructed and
 * answers PostgREST reads from a fixture table:
 *
 *   GET  …/rest/v1/<table>?…   → TABLES[table]  (default `[]`)
 *   POST …/rest/v1/rpc/<name>  → RPCS[name]     (default `null`)
 *
 * Filters, ordering and ranges are deliberately NOT interpreted. The fixtures
 * are hand-built to already satisfy the filters the screens send (every row is
 * 'active', belongs to the preview user, and so on), and a layout audit cares
 * that the populated shape renders, not that PostgREST semantics are emulated.
 * A table with no fixture keeps today's behaviour exactly — an empty array —
 * so adding one screen's rows can never change another's measurement.
 *
 * WRITES ARE REFUSED, LOUDLY BUT SAFELY. The audit clicks everything it can
 * reach, and some of those controls are BUY / CLAIM / LIST buttons. Their RPCs
 * return a PostgREST-shaped error so the screen takes its own error path (a
 * real, renderable state) instead of appearing to succeed against a backend
 * that does not exist.
 *
 * Dev-only: nothing in `src/main.tsx`'s import graph reaches this file.
 */
import { POOL_V4 } from './game/v3/cardpool';

/** Stable ISO timestamps — `new Date()` here would make two runs of the audit
 * differ in ways that have nothing to do with the layout. */
const T0 = '2026-01-01T00:00:00.000Z';
const T_FUTURE = '2099-01-01T00:00:00.000Z';

const PREVIEW_USER = 'preview';
const OTHER_USER = '00000000-0000-4000-8000-000000000001';
const THIRD_USER = '00000000-0000-4000-8000-000000000002';

const cards = POOL_V4.filter((c) => c.type !== 'Leader');
const cardAt = (i: number) => cards[i % cards.length];

// ---------------------------------------------------------------------------
// Battle Pass
// ---------------------------------------------------------------------------
const SEASON_ID = 'preview-season';

/** A full 30-tier track: credits, vouchers, packs and cosmetics all appear, so
 * every branch of `rewardVisual` is measured rather than just the first. */
const BP_TIERS = Array.from({ length: 30 }, (_, i) => {
  const tier = i + 1;
  const kind =
    tier % 10 === 0
      ? 'cosmetic'
      : tier % 5 === 0
        ? 'pack'
        : tier % 3 === 0
          ? 'vouchers'
          : 'credits';
  return {
    id: `preview-bp-${tier}`,
    season_id: SEASON_ID,
    tier,
    reward_type: kind,
    amount: kind === 'vouchers' ? 2 : kind === 'credits' ? 250 * tier : 1,
    pack_type_id: kind === 'pack' ? 'preview-booster' : null,
    shop_item_id: kind === 'cosmetic' ? 'preview-cosmetic-0' : null,
    label:
      kind === 'credits'
        ? `${250 * tier} Credits`
        : kind === 'vouchers'
          ? '2 Vouchers'
          : kind === 'pack'
            ? 'Volume #1 Booster'
            : 'Preview card back',
  };
});

// ---------------------------------------------------------------------------
// Missions & achievements
// ---------------------------------------------------------------------------
const ACHIEVEMENT_CATEGORIES = ['battle', 'collection', 'progress', 'social', 'market', 'general'];

const ACHIEVEMENTS = ACHIEVEMENT_CATEGORIES.flatMap((category, ci) =>
  Array.from({ length: 4 }, (_, i) => ({
    id: `preview-ach-${category}-${i}`,
    name: `${category.toUpperCase()} MILESTONE ${i + 1}`,
    description: `A stand-in ${category} achievement for the offline harness.`,
    category,
    stat_key: `${category}_stat`,
    target: 10 * (i + 1),
    reward_credits: 500 * (i + 1),
    reward_vouchers: i === 3 ? 3 : 0,
    reward_pack_id: i === 2 ? 'preview-booster' : null,
    sort: ci * 10 + i,
  })),
);

/** Deliberately mixed: locked, claimable and already-claimed all render
 * differently, and only a claimable row shows a CLAIM button. */
const PLAYER_ACHIEVEMENTS = ACHIEVEMENTS.map((a, i) => ({
  achievement_id: a.id,
  progress: i % 3 === 0 ? a.target : Math.floor(a.target / 2),
  claimed: i % 6 === 0,
}));

const MISSIONS = [
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `preview-daily-${i}`,
    name: `Daily mission ${i + 1}`,
    description: 'Win matches, open packs, or trade a card.',
    stat_key: 'wins',
    target: 3,
    cadence: 'daily' as const,
    reward_credits: 300,
    reward_vouchers: 0,
    reward_bp_xp: 150,
    progress: i === 0 ? 3 : 1,
    claimed: false,
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `preview-weekly-${i}`,
    name: `Weekly mission ${i + 1}`,
    description: 'A longer objective that pays Pass XP.',
    stat_key: 'games_played',
    target: 20,
    cadence: 'weekly' as const,
    reward_credits: 1200,
    reward_vouchers: 2,
    reward_bp_xp: 600,
    progress: i === 0 ? 20 : 7,
    claimed: i === 1,
  })),
];

// ---------------------------------------------------------------------------
// News + serialized feed
// ---------------------------------------------------------------------------
const NEWS_POSTS = Array.from({ length: 6 }, (_, i) => ({
  id: `preview-news-${i}`,
  title: `Preview bulletin #${i + 1}`,
  body: 'A stand-in news post for the offline harness.\n\nIt carries two paragraphs so the body layout is measured with a line break in it.',
  author: OTHER_USER,
  published_at: T0,
  created_at: T0,
}));

const SERIALIZED_FEED = Array.from({ length: 8 }, (_, i) => {
  const c = cardAt(i * 3);
  return {
    card_id: c.id,
    card_name: c.name,
    image_url: c.image ?? null,
    rarity: c.rarity ?? 'Mythic',
    serial_number: i + 1,
    cap: 25,
    acquired_at: T0,
    username: i % 3 === 0 ? 'A collector' : `Collector${i}`,
  };
});

// ---------------------------------------------------------------------------
// Social — friends, requests, trades, leaderboard
// ---------------------------------------------------------------------------
const publicProfile = (id: string, username: string, i: number) => ({
  id,
  username,
  role: 'player',
  level: 8 + i,
  wins: 20 + i,
  losses: 10 + i,
  equipped_avatar: null,
  equipped_banner: null,
});

const PUBLIC_PROFILES = [
  publicProfile(PREVIEW_USER, 'Preview', 0),
  publicProfile(OTHER_USER, 'Rivalcaster', 1),
  publicProfile(THIRD_USER, 'Deckhand', 2),
];

/** One accepted friendship, one INCOMING request (the only state that shows
 * ACCEPT / DECLINE) and one outgoing one. */
const FRIENDSHIPS = [
  {
    id: 'preview-friend-0',
    requester: PREVIEW_USER,
    addressee: OTHER_USER,
    status: 'accepted',
    created_at: T0,
  },
  {
    id: 'preview-friend-1',
    requester: THIRD_USER,
    addressee: PREVIEW_USER,
    status: 'pending',
    created_at: T0,
  },
];

const TRADES = [
  {
    id: 'preview-trade-0',
    proposer: OTHER_USER,
    recipient: PREVIEW_USER,
    proposer_cards: [{ card_id: cardAt(1).id, quantity: 1, foil: false }],
    recipient_cards: [{ card_id: cardAt(2).id, quantity: 2, foil: true }],
    proposer_credits: 0,
    recipient_credits: 500,
    status: 'pending',
    created_at: T0,
  },
  {
    id: 'preview-trade-1',
    proposer: PREVIEW_USER,
    recipient: THIRD_USER,
    proposer_cards: [{ card_id: cardAt(3).id, quantity: 1, foil: false }],
    recipient_cards: [],
    proposer_credits: 250,
    recipient_credits: 0,
    status: 'pending',
    created_at: T0,
  },
];

const LEADERBOARD = PUBLIC_PROFILES.map((p, i) => ({
  id: p.id,
  username: p.username,
  role: p.role,
  level: p.level,
  total_cards: 900 - i * 120,
  equipped_avatar: null,
  equipped_banner: null,
}));

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------
const MARKET_LISTINGS = Array.from({ length: 10 }, (_, i) => {
  const c = cardAt(i * 5);
  const auction = i % 3 === 0;
  return {
    id: `preview-listing-${i}`,
    // Two of them are the preview player's own — that is the branch with the
    // CANCEL control, and it never rendered before.
    seller: i % 4 === 0 ? PREVIEW_USER : OTHER_USER,
    card_id: c.id,
    foil: i % 5 === 0,
    quantity: 1,
    listing_type: auction ? 'auction' : 'fixed',
    price: 400 + i * 125,
    buyout: auction ? 2000 + i * 100 : null,
    current_bid: auction ? 500 + i * 50 : null,
    current_bidder: auction && i > 0 ? THIRD_USER : null,
    bid_count: auction ? i : 0,
    status: 'active',
    created_at: T0,
    ends_at: T_FUTURE,
  };
});

const LISTABLE = Array.from({ length: 12 }, (_, i) => {
  const c = cardAt(i * 7);
  return {
    card_id: c.id,
    name: c.name,
    rarity: c.rarity ?? 'Common',
    tier: (i % 5) + 1,
    card_type: c.type,
    image_url: c.image ?? null,
    spare_normal: 1 + (i % 3),
    spare_foil: i % 4 === 0 ? 1 : 0,
    value_normal: 120 + i * 30,
    value_foil: 400 + i * 60,
  };
});

// ---------------------------------------------------------------------------
// Player shops
// ---------------------------------------------------------------------------
const SHOP_LISTINGS = Array.from({ length: 5 }, (_, i) => ({
  id: `preview-shop-listing-${i}`,
  owner: PREVIEW_USER,
  slot_id: `preview-slot-${i % 3}`,
  // 'individual', not 'single' — the screen's filter tabs bucket on this exact
  // string, so a plausible-looking wrong value renders an empty tab.
  listing_type: i === 4 ? 'mystery' : i % 2 === 0 ? 'individual' : 'bundle',
  status: 'active',
  cards:
    i === 4
      ? []
      : [{ card_id: cardAt(i * 11).id, quantity: 1, foil: false }].concat(
          i % 2 === 1 ? [{ card_id: cardAt(i * 11 + 1).id, quantity: 2, foil: false }] : [],
        ),
  price: 600 + i * 200,
  reference_price: 800 + i * 200,
  template_id: i === 4 ? 'preview-mystery-0' : null,
  pack_size: i === 4 ? 5 : null,
  total_packs: i === 4 ? 20 : null,
  remaining_packs: i === 4 ? 13 : null,
  ev_frozen: i === 4 ? 720 : null,
  created_at: T0,
}));

const BROWSE_SHOPS = Array.from({ length: 6 }, (_, i) => ({
  owner: i === 0 ? PREVIEW_USER : `${OTHER_USER.slice(0, -1)}${i}`,
  name: `Preview Storefront ${i + 1}`,
  banner_url: null,
  tagline: 'A stand-in storefront for the offline harness.',
  accent: (['ember', 'tide', 'gale', 'root', 'shadow', 'light'] as const)[i % 6],
  owner_username: i === 0 ? 'Preview' : `Shopkeep${i}`,
  status: i === 5 ? 'dormant' : 'active',
  created_at: T0,
  sales_count: 40 - i * 5,
  active_listings: 6 - i,
  mystery_listings: i % 2,
  cheapest_price: 250 + i * 90,
  top_rarity_tier: 5 - (i % 5),
  trending_score: 90 - i * 7,
  composite_score: 88 - i * 6,
  rating_unlocked: i < 3,
}));

// ---------------------------------------------------------------------------
// Card submissions
// ---------------------------------------------------------------------------
const SUBMISSION_STATES = ['pending', 'approved', 'rejected'] as const;
const SUBMISSIONS = Array.from({ length: 6 }, (_, i) => ({
  id: `preview-submission-${i}`,
  submitter: i % 2 === 0 ? PREVIEW_USER : OTHER_USER,
  set_name: 'Player Showcase',
  card_name: `Preview Submission ${i + 1}`,
  card_type: 'Unit',
  flavor_text: 'A stand-in submission for the offline harness.',
  image_url: cardAt(i * 13).image ?? '',
  requested_treatment: 'standard',
  status: SUBMISSION_STATES[i % 3],
  review_note: i % 3 === 2 ? 'Art does not meet the set brief.' : null,
  approved_card_id: null,
  approved_rarity: i % 3 === 1 ? 'Rare' : null,
  created_at: T0,
  reviewed_at: i % 3 === 0 ? null : T0,
  submitter_username: i % 2 === 0 ? 'Preview' : 'Rivalcaster',
  submitter_banned: false,
}));

// ---------------------------------------------------------------------------
// The fixture tables
// ---------------------------------------------------------------------------
const TABLES: Record<string, unknown[]> = {
  seasons: [
    {
      id: SEASON_ID,
      number: 1,
      name: 'Preview Season',
      is_active: true,
      is_free: true,
      starts_at: T0,
      ends_at: T_FUTURE,
    },
  ],
  battle_pass_tiers: BP_TIERS,
  player_battle_pass: [{ season_id: SEASON_ID, xp: 4300, claimed_tiers: [1, 2, 3] }],
  achievements: ACHIEVEMENTS,
  player_achievements: PLAYER_ACHIEVEMENTS,
  news_posts: NEWS_POSTS,
  friendships: FRIENDSHIPS,
  trades: TRADES,
  market_listings: MARKET_LISTINGS,
  player_shops: [
    {
      owner: PREVIEW_USER,
      name: 'Preview Storefront 1',
      banner_url: null,
      tagline: 'A stand-in storefront for the offline harness.',
      accent: 'ember',
      status: 'active',
      slots_purchased: 3,
      last_maintenance_at: T0,
      created_at: T0,
      closed_at: null,
    },
  ],
  shop_slots: Array.from({ length: 3 }, (_, i) => ({
    id: `preview-slot-${i}`,
    owner: PREVIEW_USER,
    slot_index: i,
    collateral: 2000 * (i + 1),
    status: i === 2 ? 'empty' : 'occupied',
    created_at: T0,
  })),
  shop_listings: SHOP_LISTINGS,
  mystery_pack_templates: [
    {
      id: 'preview-mystery-0',
      owner: PREVIEW_USER,
      name: 'Preview Mystery Pack',
      pack_size: 5,
      mode: 'weighted',
      config: { rarity_weights: { Common: 0.6, Uncommon: 0.3, Rare: 0.1 } },
      historical_floor_ev: 640,
      created_at: T0,
    },
  ],
  shop_purchases: Array.from({ length: 3 }, (_, i) => ({
    id: `preview-purchase-${i}`,
    owner: i === 0 ? PREVIEW_USER : OTHER_USER,
    buyer: i === 0 ? OTHER_USER : PREVIEW_USER,
    listing_id: `preview-shop-listing-${i}`,
    listing_type: 'single',
    price: 700 + i * 150,
    reference_price: 900 + i * 150,
    cards: [{ card_id: cardAt(i * 17).id, quantity: 1, foil: false }],
    created_at: T0,
  })),
  shop_buyer_ratings: [
    {
      purchase_id: 'preview-purchase-1',
      buyer: PREVIEW_USER,
      owner: OTHER_USER,
      rating: 5,
      created_at: T0,
      updated_at: T0,
    },
  ],
  card_submissions: SUBMISSIONS,
  player_serialized_cards: SERIALIZED_FEED.slice(0, 4).map((s) => ({
    card_id: s.card_id,
    rarity: s.rarity,
    serial_number: s.serial_number,
    acquired_at: s.acquired_at,
  })),
  serialized_supply: [
    { rarity: 'Mythic', cap: 25 },
    { rarity: 'Full-Art', cap: 100 },
  ],
};

const RPCS: Record<string, unknown> = {
  get_missions: MISSIONS,
  get_serialized_feed: SERIALIZED_FEED,
  get_public_profiles: PUBLIC_PROFILES,
  get_cards_leaderboard: LEADERBOARD,
  search_players: PUBLIC_PROFILES.slice(1),
  get_friend_collection: cards.slice(0, 40).map((c, i) => ({
    card_id: c.id,
    quantity: 1 + (i % 3),
    foil_quantity: i % 5 === 0 ? 1 : 0,
  })),
  get_player_profile_card: {
    id: OTHER_USER,
    username: 'Rivalcaster',
    role: 'player',
    level: 14,
    wins: 44,
    losses: 21,
    games_played: 65,
    equipped_avatar: null,
    equipped_banner: null,
    equipped_card_back: null,
    showcase_cards: cards.slice(0, 3).map((c) => c.id),
    created_at: T0,
  },
  browse_shops: BROWSE_SHOPS,
  get_shop_public: {
    owner: OTHER_USER,
    name: 'Preview Storefront 2',
    banner_url: null,
    tagline: 'A stand-in storefront for the offline harness.',
    accent: 'tide',
    status: 'active',
    created_at: T0,
    sales_count: 35,
    repeat_buyers: 7,
    stock: { single: 3, bundle: 2, mystery: 1 },
    unique_buyers: 18,
    rating_unlocked: true,
    composite_score: 82,
  },
  get_mystery_live_stats: { remaining_packs: 13, live_ev_per_pack: 690 },
  // The FULL row shape. A partial one is not a shortcut here: the pool viewer
  // reads `pool.rarities`, `pool.guarantees` and `card.remaining` without a
  // fallback, and a fixture missing them white-screens the modal — which is
  // exactly what the first run of this harness reported, three times, before
  // the shape was completed.
  get_mystery_pool_public: {
    listing_id: 'preview-shop-listing-4',
    template_name: 'Preview Mystery Pack',
    mode: 'advanced',
    pack_size: 5,
    price: 1400,
    total_packs: 20,
    remaining_packs: 13,
    status: 'active',
    guarantees: [{ rarity: 'Rare', count: 1 }],
    rarity_weights: { Common: 0.6, Uncommon: 0.3, Rare: 0.1 },
    slots: [{ mode: 'minimum', rarity: 'Rare' }, { mode: 'open' }],
    ev_frozen: 720,
    cards_remaining: 41,
    cards: cards.slice(0, 12).map((c, i) => ({
      card_id: c.id,
      foil: i % 6 === 0,
      rarity: c.rarity ?? 'Common',
      tier: (i % 5) + 1,
      name: c.name,
      image_url: c.image ?? null,
      card_type: c.type,
      submitted: 4 + (i % 3),
      // One entry deliberately spent, so the "show spent cards" branch has
      // something to show and something to hide.
      remaining: i === 3 ? 0 : 2 + (i % 3),
      reference_value: 150 + i * 45,
    })),
    rarities: ['Common', 'Uncommon', 'Rare', 'Super-Rare'].map((rarity, i) => ({
      rarity,
      tier: i + 1,
      submitted: 20 - i * 4,
      remaining: 15 - i * 3,
      pull_chance_pct: +(45 - i * 12).toFixed(1),
    })),
  },
  get_listable_inventory: LISTABLE,
  get_card_market_value: { sales: 12, avg_price: 850 },
  card_blended_reference: 815,
  get_daily_bounties: Array.from({ length: 6 }, (_, i) => {
    const c = cardAt(i * 19);
    return {
      card_id: c.id,
      name: c.name,
      rarity: c.rarity ?? 'Common',
      card_type: c.type,
      image_url: c.image ?? null,
      sell_price: 500 + i * 40,
      buy_price: 300 + i * 25,
      already_sold: i === 4,
      already_bought: i === 5,
      owned: i % 3,
    };
  }),
  get_card_submissions: SUBMISSIONS,
  // A maintenance sweep the Marketplace fires on mount, not a player action:
  // refusing it as a write printed a console error on every single load of
  // that screen, which the audit correctly reported as a problem.
  settle_expired_listings: 0,
  get_showcase_stats: {
    set_name: 'Player Showcase',
    pending: 12,
    approved: 8,
    submitted: 20,
    submitters: 9,
    cards_needed: 30,
    printed: 8,
  },
};

/** RPCs that WRITE. The audit clicks BUY / CLAIM / LIST like any other control;
 * these answer with a PostgREST-shaped error so the screen shows its own error
 * state rather than a success it never had. */
const WRITE_RPC =
  /^(buy_|sell_|claim_|create_|cancel_|open_|place_|equip_|set_|send_|respond_|remove_|save_|submit_|report_|rate_|update_|close_|reopen_|withdraw_|admin_|creator_|settle_|quicksell_|preview_mystery_pool|record_match_result)/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** PostgREST's "0 rows returned for a single-object request" error, which is
 * what `.maybeSingle()` reads as `data: null` rather than a hard failure. */
const NO_ROWS = {
  code: 'PGRST116',
  details: 'The result contains 0 rows',
  hint: null,
  message: 'JSON object requested, multiple (or no) rows returned',
};

let installed = false;

export function installPreviewFixtures(): void {
  if (installed) return;
  installed = true;
  const real = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // Auth: the stubbed session is not a real one, and letting the auth client
    // retry a token refresh through the proxy costs the audit seconds per
    // screen for a call whose failure it already ignores. Fail it immediately.
    if (url.includes('/auth/v1/')) {
      return json({ error: 'offline_preview', error_description: 'Preview harness' }, 400);
    }

    const rest = url.indexOf('/rest/v1/');
    if (rest < 0) return real(input as RequestInfo, init);

    const path = url.slice(rest + '/rest/v1/'.length);
    const name = decodeURIComponent(path.split('?')[0].replace(/\/$/, ''));

    if (name.startsWith('rpc/')) {
      const fn = name.slice(4);
      if (WRITE_RPC.test(fn) && !(fn in RPCS)) {
        return json(
          {
            code: 'P0001',
            details: null,
            hint: null,
            message: 'This is the offline preview harness — nothing is written.',
          },
          400,
        );
      }
      return json(fn in RPCS ? RPCS[fn] : null);
    }

    const rows = TABLES[name] ?? [];
    // `.single()` / `.maybeSingle()` ask for one object, not an array.
    const headers = new Headers(
      init?.headers ??
        (typeof input === 'object' && 'headers' in input ? input.headers : undefined),
    );
    const wantsObject = (headers.get('accept') ?? '').includes('application/vnd.pgrst.object+json');
    if (wantsObject) return rows.length > 0 ? json(rows[0]) : json(NO_ROWS, 406);
    return json(rows);
  };
}
