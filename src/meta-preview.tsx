// Dev-only offline harness for the META screens (served at /meta-preview.html
// by Vite dev), the counterpart to `table-preview.tsx`.
//
// The collection, deck editor and pack opening all read from `useMeta`, which
// needs a Supabase session — so until v7.5 none of them could be rendered, let
// alone measured, outside a live signed-in app. That is exactly why the v7.4
// mobile pass got the match board playable on a phone and left "the card views
// outside the board have not been measured at all" on the roadmap. This mounts
// them against a stubbed MetaState instead.
//
//   /meta-preview.html?screen=collection
//   /meta-preview.html?screen=decks
//   /meta-preview.html?screen=pack
//   /meta-preview.html?screen=profile
//   /meta-preview.html?screen=inspect
//
// v11 added the rest of the meta screens, which the roadmap's mobile item had
// listed as "still unmeasured on a phone". The ones below reach the network on
// mount; offline they render their own loading/error/empty states, which is
// still the real layout and is what the measurement needs.
//
//   /meta-preview.html?screen=social
//   /meta-preview.html?screen=store
//   /meta-preview.html?screen=market
//   /meta-preview.html?screen=shops
//   /meta-preview.html?screen=battlepass
//   /meta-preview.html?screen=achievements
//   /meta-preview.html?screen=news
//   /meta-preview.html?screen=settings
//   /meta-preview.html?screen=menu
//   /meta-preview.html?screen=howtoplay
//   /meta-preview.html?screen=changelog
//   /meta-preview.html?screen=submissions
//   /meta-preview.html?screen=grading
//   /meta-preview.html?screen=variants&v=<variant>&view=front|3d|slab|reveal
//
// Append `&role=creator` to any of the above to mount the Creator-only panels
// (Profile's CREATOR TOOLS, the submission review queue and BULK ADD).
//
// v20: the seven fields above are only the part of a screen's data that lives
// in the context. Everything else each screen fetches for ITSELF on mount, and
// offline those calls fail — which is why six screens (battlepass, market,
// shops, social, news, achievements) had between 1 and 8 controls at both
// widths and were measured as empty states for eight passes. `preview-fixtures`
// answers those reads offline; see the header there.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { installPreviewFixtures } from './preview-fixtures';
import { MetaContext, MetaState } from './meta/MetaContext';
import { CollectionScreen } from './meta/CollectionScreen';
import { DeckBuilderScreen } from './meta/DeckBuilderScreen';
import { PackOpening } from './meta/PackOpening';
import { ProfileScreen } from './meta/ProfileScreen';
import { SocialScreen } from './meta/SocialScreen';
import { StoreScreen } from './meta/StoreScreen';
import { MarketplaceScreen } from './meta/MarketplaceScreen';
import { PlayerShopsScreen } from './meta/PlayerShopsScreen';
import { BattlePassScreen } from './meta/BattlePassScreen';
import { AchievementsScreen } from './meta/AchievementsScreen';
import { NewsCenterScreen } from './meta/NewsCenterScreen';
import { SettingsScreen } from './meta/SettingsScreen';
import { MainMenu } from './meta/MainMenu';
import { ChangelogScreen } from './meta/ChangelogScreen';
import { MatchHistoryScreen } from './meta/MatchHistoryScreen';
import { CardSubmissionsScreen } from './meta/CardSubmissionsScreen';
import { GradingScreen } from './meta/GradingScreen';
import { AuthScreen } from './meta/AuthScreen';
import { HowToPlayScreen } from './components/HowToPlay';
import { Card3DInspector } from './components/Card3DInspector';
import { ShowroomScreen } from './meta/ShowroomScreen';
import { CardFace } from './components/CardFaceV4';
import { GradedSlab } from './meta/GradedSlab';
import { CARD_VARIANTS, asVariant, VARIANT_META } from './meta/variants';
import type { GradedCard } from './meta/grading';
import { POOL } from './game/poker/cardpool';
import { MODES } from './game/poker/constants';
import { buildDeck, deckCardIds } from './game/poker/deck';
import { rngOn } from './game/poker/rng';
import type { PackPull, PackType, Profile, ShopItem } from './lib/supabase';

// Before any screen mounts (and so before any screen's own fetch fires).
installPreviewFixtures();

const profile: Profile = {
  id: 'preview',
  username: 'Preview',
  role: 'player',
  credits: 12_500,
  vouchers: 6,
  // xp must sit INSIDE level 12's band (xpForLevel(12)=6600 … xpForLevel(13)=7800)
  // or every level readout in the harness measures an impossible state. The
  // old pair (4200 at level 12) was 2,400 XP short of its own level and printed
  // `-2400/1200 XP TO LEVEL 13` on Profile and the Main Menu.
  xp: 7000,
  level: 12,
  wins: 31,
  losses: 19,
  games_played: 50,
  equipped_card_back: null,
  equipped_banner: null,
  equipped_avatar: null,
  last_free_pack_at: null,
  submissions_banned: false,
  submissions_ban_reason: null,
  showcase_cards: [],
  hide_serialized_announcements: false,
  login_streak: 3,
  last_login_claim_at: null,
  last_account_reset_at: null,
};

// Own a few copies of everything, so the collection grid renders at its real
// worst case rather than as an empty state.
const collection = POOL.map((c, i) => ({
  card_id: c.id,
  quantity: 1 + (i % 3),
  foil_quantity: i % 7 === 0 ? 1 : 0,
}));

// A legal FryCards Poker deck (1 Location + the Standard format's powers),
// built the way the CPU builds one, from a fixed seed so the preview is stable.
const leader = POOL.find((c) => c.type === 'Leader')!;
const previewDeck = buildDeck(leader, MODES.standard, rngOn({ rng: 20261009 }));
const decks = [
  {
    id: 'deck-preview',
    user_id: 'preview',
    name: 'Preview Deck',
    leader_id: leader.id,
    card_ids: deckCardIds(previewDeck),
    is_valid: true,
    updated_at: new Date(0).toISOString(),
  },
];

const pulls: PackPull[] = POOL.filter((c) => c.type !== 'Leader')
  .slice(0, 8)
  .map((c, i) => ({
    card_id: c.id,
    name: c.name,
    rarity: c.rarity ?? 'Common',
    card_type: c.type,
    image_url: c.image ?? null,
    foil: i === 3,
    slot: `slot-${i + 1}`,
    converted_to_credits: false,
    credit_value: 0,
  }));

// `&pull=sr|ur|mythic|serial` swaps in a haul whose best card is that tier,
// for the per-rarity reveal (D5). Mythic prefers a card with video art.
const pullVariant = params0().get('pull');
function params0() {
  return new URLSearchParams(location.search);
}
function pullOf(c: (typeof POOL)[number], extra: Partial<PackPull> = {}): PackPull {
  return {
    card_id: c.id,
    name: c.name,
    rarity: c.rarity ?? 'Common',
    card_type: c.type,
    image_url: c.image ?? null,
    foil: false,
    slot: 'chase',
    converted_to_credits: false,
    credit_value: 0,
    ...extra,
  };
}
const byRarity = (r: string, video = false) =>
  POOL.filter((c) => c.type !== 'Leader' && c.rarity === r).sort(
    (a, b) =>
      Number(video && /\.(mp4|webm)/i.test(b.image ?? '')) -
      Number(video && /\.(mp4|webm)/i.test(a.image ?? '')),
  )[0];
if (pullVariant === 'box') {
  // A 49-card box: the pool cycled, with a few foils, dupes, a variant and a
  // serialized chase, so the summary's grid, filters and sort have real work.
  const cards = POOL.filter((c) => c.type !== 'Leader');
  const box: PackPull[] = Array.from({ length: 49 }, (_, i) =>
    pullOf(cards[(i * 7) % Math.min(cards.length, 40)], {
      foil: i % 9 === 4,
      slot: `slot-${i + 1}`,
      ...(i === 17 ? { variant: 'shattered' } : {}),
    }),
  );
  const chase = byRarity('Ultra-Rare') ?? byRarity('Super-Rare');
  if (chase)
    box[30] = pullOf(chase, {
      serialized: true,
      serial_number: 7,
      serial_cap: 50,
      slot: 'serialized',
    });
  pulls.splice(0, pulls.length, ...box);
} else if (pullVariant) {
  const base = pulls.filter((p) => p.rarity === 'Common' || p.rarity === 'Uncommon').slice(0, 5);
  const star =
    pullVariant === 'sr'
      ? byRarity('Super-Rare')
      : pullVariant === 'ur'
        ? byRarity('Ultra-Rare')
        : pullVariant === 'mythic'
          ? byRarity('Mythic', true)
          : byRarity('Ultra-Rare');
  pulls.splice(0, pulls.length, ...base);
  if (star)
    pulls.push(
      pullOf(
        star,
        pullVariant === 'serial'
          ? { serialized: true, serial_number: 23, serial_cap: 100, slot: 'serialized' }
          : { foil: pullVariant === 'sr' },
      ),
    );
}

// Store shelf stand-ins. The real rows come from `pack_types` / `shop_items`,
// which need the network; these mirror the live shapes closely enough for the
// shelf, the odds modal and the cosmetics grid to lay out at full size.
const packTypes: PackType[] = [
  {
    id: 'preview-booster',
    name: 'Volume #1 Booster Pack',
    // Live copy (2026-10-11) — contradicts its own slots; the Store now
    // generates the blurb from slot_config instead (packodds packBlurb).
    description: 'Six cards from Volume #1 — Guaranteed Uncommon or better.',
    card_count: 8,
    guaranteed_rarity: 'Uncommon',
    image_url: null,
    open_image_url: null,
    foil_chance: 0.0118,
    has_foil_slot: true,
    price_credits: 599,
    price_vouchers: 6,
    pack_tier: 'standard',
    slot_config: [
      {
        slot_type: 'foundation',
        count: 4,
        foil_eligible: true,
        rarity_weights: { Common: 0.78, Uncommon: 0.22 },
        guaranteed_min_rarity: 'Common',
      },
      {
        slot_type: 'synergy',
        count: 2,
        foil_eligible: true,
        rarity_weights: { Uncommon: 0.68, Rare: 0.28, 'Super-Rare': 0.04 },
        guaranteed_min_rarity: 'Uncommon',
      },
      {
        slot_type: 'chase',
        count: 1,
        foil_eligible: true,
        rarity_weights: {
          Rare: 0.65,
          'Super-Rare': 0.17,
          'Ultra-Rare': 0.11,
          'Full-Art': 0.05,
          Mythic: 0.02,
        },
        guaranteed_min_rarity: 'Rare',
      },
      {
        slot_type: 'foil',
        count: 1,
        foil_eligible: true,
        foil_chance_override: 1,
        rarity_weights: {
          Common: 0.3,
          Uncommon: 0.32,
          Rare: 0.22,
          'Super-Rare': 0.09,
          'Ultra-Rare': 0.04,
          'Full-Art': 0.02,
          Mythic: 0.01,
        },
        guaranteed_min_rarity: 'Common',
      },
    ],
    is_active: true,
    acquisition: 'purchase',
    time_limited: false,
    pity_note: null,
    allowed_sets: null,
    pack_group: null,
    set_name: null,
  },
  {
    id: 'preview-daily',
    name: 'Daily Free Pack',
    description: 'One free pack every 20 hours.',
    card_count: 5,
    guaranteed_rarity: 'Uncommon',
    image_url: null,
    open_image_url: null,
    foil_chance: 0.0164,
    has_foil_slot: false,
    price_credits: null,
    price_vouchers: null,
    pack_tier: 'daily',
    slot_config: [
      {
        slot_type: 'foundation',
        count: 4,
        foil_eligible: true,
        rarity_weights: { Common: 0.75, Uncommon: 0.25 },
        guaranteed_min_rarity: 'Common',
      },
      {
        slot_type: 'synergy',
        count: 1,
        foil_eligible: true,
        rarity_weights: { Uncommon: 0.7, Rare: 0.28, 'Super-Rare': 0.02 },
        guaranteed_min_rarity: 'Uncommon',
      },
    ],
    is_active: true,
    acquisition: 'daily_free',
    time_limited: false,
    pity_note: null,
    allowed_sets: null,
    pack_group: null,
    set_name: null,
  },
];
// A limited colour pack (migration 20261012000020), leaving in ~3 days.
packTypes.push({
  ...packTypes[0],
  id: 'preview-ember',
  name: 'Ember Pack',
  description: null,
  price_credits: 649,
  price_vouchers: 7,
  pack_tier: 'limited',
  time_limited: true,
  pack_group: 'color_ember',
  ...({
    available_until: new Date(Date.now() + 3 * 86400_000 - 3600_000).toISOString(),
    allowed_colors: ['Ember'],
  } as object),
});

const shopItems: ShopItem[] = (['card_back', 'profile_banner', 'profile_avatar'] as const)
  .map((item_type, i) => ({
    id: `preview-cosmetic-${i}`,
    name: `Preview ${item_type.replace('_', ' ')}`,
    description: 'A stand-in cosmetic for the offline harness.',
    item_type,
    image_url: null,
    cost_credits: 750 * (i + 1),
    cost_vouchers: i === 0 ? null : 4,
    rarity: ['Rare', 'Super-Rare', 'Mythic'][i],
    has_foil_variant: i !== 2,
    foil_cost_multiplier: 2,
    is_season_pass_exclusive: false,
    aspect_ratio: item_type === 'profile_banner' ? '16/5' : '1/1',
    author: 'Preview',
    is_limited: false,
  }))
  .concat(
    // The 2026-10-13 card backs, served from the copies bundled under
    // public/cardbacks/ (their Cloudflare URL is blocked offline).
    (
      [
        ['Salt & Stack', 'salt-and-stack', 299, 'Common'],
        ['Breach', 'breach', 499, 'Rare'],
        ['Hothead Protocol', 'hothead-protocol', 799, 'Super-Rare'],
        ['Hellfry', 'hellfry', 1199, 'Ultra-Rare'],
      ] as const
    ).map(([name, slug, cost, rarity]) => ({
      id: `preview-back-${slug}`,
      name,
      description: 'Preview card back.',
      item_type: 'card_back',
      image_url: `https://frycards-showcase.pages.dev/CardBacks/${slug}.webp`,
      cost_credits: cost,
      cost_vouchers: null,
      rarity,
      has_foil_variant: false,
      foil_cost_multiplier: 1,
      is_season_pass_exclusive: false,
      aspect_ratio: 'portrait',
      author: 'FryBandit',
      is_limited: false,
    })),
  );

// v19: these three were all stubbed `[]`, and every panel gated on them was
// therefore measured as an empty state and nothing else — the Store's
// unopened-pack shelf (and its OPEN button, the entry point to PackOpening),
// the equipped/owned cosmetic grids on Profile and Store, and the Collection's
// numbered-print plates. The audit's whole job is measuring populated layouts
// at phone width; three of them had no population to measure.
const inventory = packTypes.map((p, i) => ({ pack_type_id: p.id, quantity: 1 + i * 2 }));
const cosmetics = shopItems.slice(0, 3).map((s, i) => ({ shop_item_id: s.id, is_foil: i === 0 }));
const serializedCards = POOL.filter((c) => c.type !== 'Leader')
  .slice(0, 4)
  .map((c, i) => ({
    card_id: c.id,
    rarity: c.rarity ?? 'Mythic',
    serial_number: i + 1,
    cap: 25,
    acquired_at: new Date(0).toISOString(),
  }));

const noop = async () => undefined;
const meta: MetaState = {
  session: { user: { id: 'preview' } } as MetaState['session'],
  guest: false,
  loading: false,
  bootError: null,
  retryBoot: () => undefined,
  dataLoading: false,
  profile,
  shopItems,
  packTypes,
  collection,
  cosmetics,
  decks,
  inventory,
  serializedCards,
  setGuest: () => undefined,
  refreshProfile: noop,
  refreshCollection: noop,
  refreshCosmetics: noop,
  refreshDecks: noop,
  refreshInventory: noop,
  refreshShopItems: noop,
  refreshPackTypes: noop,
  signOut: noop,
};

const params = new URLSearchParams(window.location.search);
const screen = params.get('screen') ?? 'collection';
// `?role=creator` mounts the Creator-only panels (Profile's CREATOR TOOLS, the
// submission review queue, BULK ADD) so they can be measured too — they were
// invisible to the harness while the stub profile was always a plain player.
if (params.get('role') === 'creator') profile.role = 'creator';

// A non-Leader card with some metadata rows, for the 3D inspector preview.
const inspectDef = POOL.find((c) => c.type !== 'Leader')!;

// `?screen=variants`: one variant (`&v=`) on a framed and a full-bleed card of
// its colour, at every size (`view=front`), in the 3D inspector (`view=3d`),
// slabbed (`view=slab`) and in a pack reveal (`view=reveal`).
const variantId = asVariant(params.get('v')) ?? 'shattered';
const variantView = params.get('view') ?? 'front';
function variantCards() {
  const colour = VARIANT_META[variantId].colour;
  const fits = POOL.filter(
    (c) => c.type !== 'Leader' && (!colour || (c.colors ?? []).includes(colour as never)),
  );
  // `&rarity=` picks the framed card's rarity (default Rare / Super-Rare).
  const want = params.get('rarity');
  const framed =
    (want && fits.find((c) => c.rarity === want)) ||
    fits.find((c) => c.rarity === 'Rare' || c.rarity === 'Super-Rare') ||
    fits[0];
  const bleed =
    fits.find((c) => c.rarity === 'Full-Art' || c.rarity === 'Alt-Art') ?? fits[1] ?? fits[0];
  return [framed, bleed].filter(Boolean);
}
function VariantsPreview() {
  const cards = variantCards();
  if (variantView === '3d') {
    return (
      <Card3DInspector
        def={cards[0]}
        variant={variantId}
        meta={[{ label: 'Variant', value: VARIANT_META[variantId].name }]}
        onClose={() => undefined}
      />
    );
  }
  if (variantView === 'slab') {
    const g = (id: string, def: (typeof cards)[number], grade: number): GradedCard =>
      ({
        id,
        user_id: 'preview',
        card_id: def.id,
        foil: false,
        variant: variantId,
        service: 'tca',
        speed: 'standard',
        fee_paid: 0,
        submitted_at: new Date(0).toISOString(),
        ready_at: new Date(0).toISOString(),
        grade,
        revealed_at: new Date(0).toISOString(),
      }) as GradedCard;
    return (
      <div className="min-h-screen flex flex-wrap gap-6 items-start p-6 bg-[var(--c-paper)]">
        {cards.map((c, i) => (
          <GradedSlab key={c.id} g={g(`preview-slab-${i}`, c, i ? 8.5 : 10)} size="full" />
        ))}
        <GradedSlab g={g('preview-slab-c', cards[0], 9)} size="compact" />
      </div>
    );
  }
  if (variantView === 'reveal') {
    const def = cards[0];
    return (
      <PackOpening
        packName="Preview Pack"
        packImageUrl={null}
        pulls={[
          {
            card_id: def.id,
            name: def.name,
            rarity: def.rarity ?? 'Common',
            card_type: def.type,
            image_url: null,
            foil: false,
            slot: 'common',
            converted_to_credits: false,
            credit_value: 0,
            variant: variantId,
          },
        ]}
        onDone={() => undefined}
      />
    );
  }
  return (
    <div className="min-h-screen p-4 bg-[var(--c-paper)] flex flex-col gap-4">
      <h1 className="heading-font text-lg">{VARIANT_META[variantId].name}</h1>
      {cards.map((c) => (
        <div key={c.id} className="flex flex-wrap gap-4 items-end">
          <CardFace def={c} size="full" variant={variantId} />
          <CardFace def={c} size="standard" variant={variantId} />
          <CardFace def={c} size="compact" variant={variantId} />
          <CardFace def={c} size="micro" variant={variantId} />
          <CardFace def={c} size="standard" foil variant={variantId} />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {CARD_VARIANTS.map((v) => (
          <a key={v} className="underline text-xs" href={`?screen=variants&v=${v}`}>
            {VARIANT_META[v].name}
          </a>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <MetaContext.Provider value={meta}>
    {screen === 'decks' ? (
      <DeckBuilderScreen onBack={() => undefined} />
    ) : screen === 'profile' ? (
      <ProfileScreen onBack={() => undefined} />
    ) : screen === 'social' ? (
      <SocialScreen onBack={() => undefined} />
    ) : screen === 'inspect' ? (
      <Card3DInspector
        def={inspectDef}
        foil
        canToggleFoil
        meta={[
          { label: 'Rarity', value: inspectDef.rarity ?? 'Common' },
          { label: 'Owned', value: '2 (+1 foil)' },
        ]}
        onClose={() => undefined}
      />
    ) : screen === 'pack' ? (
      <PackOpening
        packName="Preview Pack"
        packImageUrl={null}
        pulls={pulls}
        onDone={() => undefined}
      />
    ) : screen === 'store' ? (
      <StoreScreen onBack={() => undefined} />
    ) : screen === 'market' ? (
      <MarketplaceScreen onBack={() => undefined} />
    ) : screen === 'shops' ? (
      <PlayerShopsScreen onBack={() => undefined} />
    ) : screen === 'battlepass' ? (
      <BattlePassScreen onBack={() => undefined} />
    ) : screen === 'achievements' ? (
      <AchievementsScreen onBack={() => undefined} />
    ) : screen === 'news' ? (
      <NewsCenterScreen onBack={() => undefined} onOpenChangelog={() => undefined} />
    ) : screen === 'settings' ? (
      <SettingsScreen
        currentTheme="classic"
        onThemeChange={() => undefined}
        motionMode="system"
        onMotionModeChange={() => undefined}
        onBack={() => undefined}
      />
    ) : screen === 'menu' ? (
      <MainMenu onNavigate={() => undefined} />
    ) : screen === 'howtoplay' ? (
      <HowToPlayScreen onBack={() => undefined} />
    ) : screen === 'history' ? (
      <MatchHistoryScreen onBack={() => undefined} />
    ) : screen === 'changelog' ? (
      <ChangelogScreen onBack={() => undefined} />
    ) : screen === 'submissions' ? (
      <CardSubmissionsScreen onBack={() => undefined} />
    ) : screen === 'showroom' ? (
      <ShowroomScreen onBack={() => undefined} />
    ) : screen === 'showroom-slab' ? (
      // The slab standing in the room is a DIFFERENT geometry (a thicker
      // solid, a taller object, its own edge material) reached only by a
      // source-tab click, so it needs its own harness entry — the card entry
      // above measures none of it.
      <ShowroomScreen
        onBack={() => undefined}
        initial={{ kind: 'slab', gradedId: 'preview-graded-vault-0' }}
        // `&yaw=35&pitch=-20` photographs the case from a set angle.
        initialPose={{
          yaw: Number(params.get('yaw') ?? 0),
          pitch: Number(params.get('pitch') ?? 0),
        }}
      />
    ) : screen === 'grading' ? (
      <GradingScreen onBack={() => undefined} />
    ) : screen === 'variants' ? (
      <VariantsPreview />
    ) : screen === 'auth' ? (
      // v29 — the FIRST screen every player sees, and the one screen the
      // sweep had never loaded. `App` renders it above the whole meta shell
      // (`if (!session && !guest) return <AuthScreen />`), so it never
      // appeared in this switch and seventeen passes of phone measurement
      // went past it: the sign-in form, the password field, the OAuth button
      // and PLAY AS GUEST have never been measured at 375px at all.
      <AuthScreen />
    ) : (
      <CollectionScreen onBack={() => undefined} />
    )}
  </MetaContext.Provider>,
);
