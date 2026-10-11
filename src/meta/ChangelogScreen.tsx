import React, { useMemo, useState, useEffect } from 'react';
import {
  Award,
  BarChart3,
  Bomb,
  Brain,
  BookOpen,
  ChevronDown,
  Coins,
  Crown,
  Eye,
  Gauge,
  GraduationCap,
  History,
  Layers,
  type LucideIcon,
  Map as MapIcon,
  Palette,
  Repeat,
  Scale,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Store,
  Swords,
  Target,
  Timer,
  Trophy,
  Wrench,
} from 'lucide-react';
import { PopButton } from './ui';
import { serializeRoute, type MetaScreen } from './routes';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export type ChangelogCategory = 'gameplay' | 'balance' | 'collection' | 'grading' | 'qol';

export const CATEGORY_META: Record<
  ChangelogCategory,
  { label: string; short: string; bg: string; fg: string }
> = {
  gameplay: { label: 'Gameplay', short: 'PLAY', bg: 'var(--c-red)', fg: '#fff' },
  balance: { label: 'Cards & Balance', short: 'BAL', bg: 'var(--c-yellow)', fg: '#1a1a1a' },
  collection: { label: 'Collection', short: 'COLL', bg: 'var(--c-steel)', fg: '#fff' },
  grading: { label: 'Grading', short: 'GRADE', bg: '#1a1a1a', fg: '#ffd54f' },
  qol: { label: 'Quality of life', short: 'QOL', bg: 'var(--c-paper)', fg: 'var(--c-ink)' },
};
const CATEGORY_ORDER: ChangelogCategory[] = ['gameplay', 'balance', 'collection', 'grading', 'qol'];

export interface BalanceChange {
  label: string;
  before: string;
  after: string;
}

export interface ChangelogItem {
  title: string;
  body: string;
  category: ChangelogCategory;
  icon: LucideIcon;
  /** A deep link into the app: a screen plus optional tab segments. */
  route?: { screen: MetaScreen; sub?: string[]; label: string };
  changes?: BalanceChange[];
}

export interface ChangelogEntry {
  /** Short version number, also the last-seen key ("35.5"). */
  version: string;
  name: string;
  date?: string;
  tagline: string;
  items: ChangelogItem[];
}

// Condensed, user-facing view of CHANGELOG.md — the highlights players care
// about, not every playtest data point. Everything since the FryCards Poker
// launch (v35), newest first. NewsCenterScreen reads ENTRIES[0] for its
// headline, so the newest entry must stay first.
export const ENTRIES: ChangelogEntry[] = [
  {
    version: '35.5',
    name: 'Grading Houses',
    date: 'October 2026',
    tagline: 'Three houses, three lanes, one black-and-gold PRISTINE 10.',
    items: [
      {
        title: 'Three houses, three lanes',
        body: 'Every grading house now wins somewhere: KEEPER on cheap cards, AMG in the middle, TCA at the top. The new HOUSES & REGISTRY tab shows each one’s BEST FOR range, perks, cons and the expected-value table behind them.',
        category: 'grading',
        icon: Layers,
        route: { screen: 'grading', sub: ['houses'], label: 'SEE THE HOUSES' },
      },
      {
        title: 'PRISTINE 10',
        body: 'TCA grades strictest (about half a point lower), but half of its direct 10s come back PRISTINE in a black-and-gold case worth \u00d740, with four visible subgrades.',
        category: 'grading',
        icon: Crown,
      },
      {
        title: 'AMG Set Registry & Pop Report',
        body: 'AMG is 150 per card (minimum 3, premium \u00d71.3). Its slabs fill a registry for each colour with one-time milestone bonuses and badges. Its Pop Report adds up to +10% resale on low-pop grades.',
        category: 'grading',
        icon: BarChart3,
        route: { screen: 'grading', label: 'GRADE A CARD' },
      },
      {
        title: 'Crossover',
        body: 'Send a Keeper slab to TCA or AMG once, at their full fee. It keeps its grade if the new one isn’t higher.',
        category: 'grading',
        icon: Repeat,
        route: { screen: 'grading', sub: ['vault'], label: 'OPEN THE VAULT' },
      },
      {
        title: 'Slabs on the Marketplace and in shops',
        body: 'List a slab at a fixed price or at auction, or stock it in your player shop from the Vault. A listed slab is held in escrow, the buyer gets the slab itself, and CPU collectors and Shop Floor customers each favour one house and pay more for its slabs.',
        category: 'grading',
        icon: Store,
        route: { screen: 'grading', sub: ['vault'], label: 'LIST A SLAB' },
      },
      {
        title: 'Insurance & trade-ins',
        body: 'Insure a submission for +25% of the fee: a grade under 7 refunds the base fee (the premium is kept). Trade five slabs under 7 for a free grading at any house. New achievements and missions cover Pristine pulls, crossover upgrades, trade-ins, slab sales, insured saves and registries.',
        category: 'grading',
        icon: ShieldCheck,
      },
      {
        title: 'Loyalty, weekly special & the Collector',
        body: 'Every 10 cards to a house earns a perk, one house grades one colour at half price each week, and each day’s collector pays +15% on quicksell for one house’s slabs.',
        category: 'collection',
        icon: Award,
      },
    ],
  },
  {
    version: '35.4',
    name: 'Polish & Balance',
    date: 'October 2026',
    tagline: 'Harder tables pay more, chips slide, and the table goes comic.',
    items: [
      {
        title: 'Difficulty pays',
        body: 'Credits now scale with CPU difficulty. TAKE A SEAT shows the multiplier and the game over screen previews it.',
        category: 'gameplay',
        icon: Coins,
        route: { screen: 'play', label: 'TAKE A SEAT' },
        changes: [
          { label: 'Easy', before: '×1', after: '×0.8' },
          { label: 'Hard & SHARK', before: '×1', after: '×1.15' },
        ],
      },
      {
        title: 'New looks',
        body: 'Five new colour themes plus a dark INK theme. Starting stacks are clean whole numbers: 480, 800 or 1,280 chips (30 / 50 / 80 big blinds) for Quick, Standard and Deep.',
        category: 'qol',
        icon: Palette,
        route: { screen: 'settings', label: 'PICK A THEME' },
      },
      {
        title: 'Chips move',
        body: 'Bets slide into the pot each street and the pot slides to the winner (off under Reduced motion). ALL IN, SHOWDOWN, a cast at you, a big pull: each gets a comic sound-effect burst.',
        category: 'gameplay',
        icon: Bomb,
      },
      {
        title: 'Balance pass',
        body: 'Smarter CPU players, many powers retuned and four new keywords. Keyword weights and rarity were rebalanced, so some cards’ powers have changed.',
        category: 'balance',
        icon: Scale,
        route: { screen: 'collection', label: 'CHECK YOUR CARDS' },
      },
      {
        title: 'Missions rotate',
        body: 'Missions rotate on a schedule. Poker missions track hands won, showdowns, big pots, knockouts and casts, and new collection missions reward a growing binder.',
        category: 'collection',
        icon: Target,
        route: { screen: 'battlepass', label: 'SEE MISSIONS' },
      },
      {
        title: 'Your settings',
        body: 'Edit your own BET PRESETS and pick a DEFAULT TABLE.',
        category: 'qol',
        icon: SlidersHorizontal,
        route: { screen: 'settings', label: 'OPEN SETTINGS' },
      },
      {
        title: 'More to play with',
        body: 'PLAY WITH IT on the Card of the Day, a weekly FEATURED LEADER and Location, and challenge links.',
        category: 'gameplay',
        icon: Sparkles,
      },
      {
        title: 'Deck builder upgrades',
        body: 'Gap-filler suggestions with ADD, wishlist unowned cards (or ADD MISSING TO WISHLIST), power-hand odds against a Location, and deck codes that remember their format. On a phone the deck name gets its own row with AUTO quick-build.',
        category: 'qol',
        icon: Wrench,
        route: { screen: 'decks', label: 'BUILD A DECK' },
      },
      {
        title: 'Collection & Store',
        body: 'One badge style for counts, serials and foils, a SPARE badge on tiles, PACKS / COSMETICS tabs in the Store, a pack summary that counts NEW cards, and UNDO when you pull a card from a deck.',
        category: 'collection',
        icon: Store,
        route: { screen: 'store', sub: ['packs'], label: 'VISIT THE STORE' },
      },
      {
        title: 'Readable card faces',
        body: 'Small cards (deck pool, grading, showroom) drop the flavour text so the rules stay readable. Tap any card to read all of it.',
        category: 'qol',
        icon: Eye,
      },
    ],
  },
  {
    version: '35.3',
    name: 'The Audit Round',
    date: 'October 2026',
    tagline: 'Dozens of match bugs squashed, and the CPU shows its work.',
    items: [
      {
        title: 'Match bugs fixed',
        body: 'No inspector on hover, no double-click acting twice, response windows that cannot stall, a raise slider that reaches all-in, CPU players that never freeze, a Veil that really hides, the seed hidden until the end, and many rules edge cases settled.',
        category: 'gameplay',
        icon: ShieldCheck,
      },
      {
        title: 'Follow the CPU',
        body: 'Speech bursts show each seat’s last action, ON THE CLOCK marks who’s thinking, a ticker lists what just happened and a cast spotlight says what each card did. Pause, step, or tap any seat for its recap.',
        category: 'gameplay',
        icon: Brain,
      },
      {
        title: 'Table settings',
        body: 'Timers (STANDARD, RELAXED or OFF), auto-deal, pause when targeted, amounts in big blinds, no folding when check is free, confirm big bets, pre-action buttons, bet presets by street, pot odds, and a SHARK difficulty.',
        category: 'qol',
        icon: Timer,
        route: { screen: 'settings', label: 'SET YOUR TIMERS' },
      },
      {
        title: 'Fairer rewards',
        body: 'Payouts scale with table size, and a finish below 1st pays after enough hands. A finished match’s reward survives a reload.',
        category: 'balance',
        icon: Trophy,
        changes: [{ label: 'Heads-up payout', before: '×1', after: '×0.55' }],
      },
      {
        title: 'Game over, in numbers',
        body: 'Your match stats, your place against last match, and SHARE RESULT with the seed and deck code. Match History adds REPLAY SEED, streaks and splits by Leader, mode and opponent.',
        category: 'gameplay',
        icon: History,
        route: { screen: 'history', label: 'MATCH HISTORY' },
      },
      {
        title: 'More ways to play',
        body: 'Deck formats (Singleton, Pauper, Monochrome, Low Stakes), a weekly rule twist, RANDOM FROM MY CARDS, the DAILY TABLE, practice tables for any deck code, named CPU players, and REMATCH.',
        category: 'gameplay',
        icon: Shuffle,
        route: { screen: 'play', label: 'PLAY NOW' },
      },
      {
        title: 'The card pool reprint',
        body: 'Void and Light get their identity back. Kindle no longer floods Ember, and rarity biases a card’s tier far less.',
        category: 'balance',
        icon: Scale,
        changes: [
          { label: 'Ember Kindle powers', before: '28', after: '20' },
          { label: 'Full-Art at ★4–5', before: '52%', after: '44%' },
          { label: 'Super-Rare at ★4–5', before: '33%', after: '11%' },
        ],
      },
      {
        title: 'Deck builder & menus',
        body: 'Format badges, records and notes per deck, auto names, Location fit, text export, saved versions and sample decks. A big PLAY button, grouped menu tiles and a Battle Pass season strip.',
        category: 'qol',
        icon: Wrench,
        route: { screen: 'decks', label: 'OPEN DECKS' },
      },
    ],
  },
  {
    version: '35',
    name: 'FryCards Poker',
    date: 'October 2026',
    tagline: 'FryCards is a poker game now. Your deck bends the rules.',
    items: [
      {
        title: 'FryCards is a poker game now',
        body: 'Pot-limit Texas Hold’em freezeouts for 2 to 6 seats against CPU players, with blinds on a clock: QUICK (~12 min), STANDARD (~25) or DEEP (~40). The old card battler is retired.',
        category: 'gameplay',
        icon: Swords,
        route: { screen: 'play', label: 'PLAY A HAND' },
      },
      {
        title: 'Your deck bends the poker',
        body: 'A Leader, one Location and 16, 24 or 36 power cards: Units ★, Items ⚙ and Events ϟ. Casting is public and its chips go in the pot, so every cast is also a bluff.',
        category: 'gameplay',
        icon: Layers,
        route: { screen: 'decks', label: 'BUILD A DECK' },
      },
      {
        title: 'Locations are the weather',
        body: 'Every seat’s Location joins a shared rotation with a two-hand forecast: Bomb Pot, Pineapple, Fog, Happy Hour, Tilt Zone and twelve more, plus a Plain Table each cycle.',
        category: 'gameplay',
        icon: MapIcon,
      },
      {
        title: 'Nerve & Leaders',
        body: 'Every seat has a public nerve meter. Leader abilities spend or build it once per hand. Hit zero and you tilt: your Leader locks and powers cost more.',
        category: 'gameplay',
        icon: Gauge,
      },
      {
        title: 'Early tuning',
        body: 'Two new keywords, Bloom and Erode; fairer Leaders; CPU players that read hands better.',
        category: 'balance',
        icon: Scale,
        changes: [
          { label: 'Venomous', before: '1/2/3/5/8', after: '1/1½/2½/4/6' },
          { label: 'Bulwark cap', before: '5 / 8', after: '4 / 6' },
        ],
      },
      {
        title: 'Rewards pay by place',
        body: 'Finish 1st for 100 credits in Standard, down to 40 for last, never by chip count. Quick pays half, Deep one and a half.',
        category: 'balance',
        icon: Trophy,
      },
      {
        title: 'Your collection is safe',
        body: 'Every card keeps its rarity, name, art and flavour text. Old 60-card decks and deck links no longer work: build a new deck.',
        category: 'collection',
        icon: ShieldCheck,
        route: { screen: 'collection', label: 'OPEN COLLECTION' },
      },
      {
        title: 'New to poker?',
        body: 'How to Play teaches Hold’em from zero, and your first practice game has a coach that explains one idea at a time. Playing cards by Kenney (kenney.nl).',
        category: 'qol',
        icon: GraduationCap,
        route: { screen: 'howtoplay', label: 'LEARN TO PLAY' },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Last-seen tracking
// ---------------------------------------------------------------------------

export const CHANGELOG_SEEN_KEY = 'frycards:changelog-seen';

export function loadLastSeenVersion(): string | null {
  try {
    return window.localStorage.getItem(CHANGELOG_SEEN_KEY);
  } catch {
    return null;
  }
}

export function markChangelogSeen(): void {
  try {
    if (ENTRIES[0]) window.localStorage.setItem(CHANGELOG_SEEN_KEY, ENTRIES[0].version);
  } catch {
    /* storage blocked: every visit just shows the newest release as new */
  }
}

/** Versions released since `lastSeen`. A first visit (or an unknown version)
 * counts only the newest release, so a new player isn't flooded with NEW. */
export function unseenVersions(lastSeen: string | null): Set<string> {
  const idx = lastSeen ? ENTRIES.findIndex((e) => e.version === lastSeen) : -1;
  const fresh = idx === -1 ? ENTRIES.slice(0, 1) : ENTRIES.slice(0, idx);
  return new Set(fresh.map((e) => e.version));
}

export function unseenItemCount(lastSeen: string | null): number {
  const v = unseenVersions(lastSeen);
  return ENTRIES.filter((e) => v.has(e.version)).reduce((n, e) => n + e.items.length, 0);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function CategoryChip({ category }: { category: ChangelogCategory }) {
  const m = CATEGORY_META[category];
  return (
    <span
      className="cl-chip heading-font"
      style={{ background: m.bg, color: m.fg }}
      data-cat={category}
    >
      {m.label}
    </span>
  );
}

function ItemCard({
  item,
  isNew,
  index,
}: {
  key?: React.Key;
  item: ChangelogItem;
  isNew: boolean;
  index: number;
}) {
  const m = CATEGORY_META[item.category];
  const Icon = item.icon;
  return (
    <article
      className="cl-item ink-border-md shadow-hard-black-xs bg-[var(--c-paper)]"
      style={{ '--cl-i': index } as React.CSSProperties}
    >
      {isNew && <span className="cl-new heading-font">NEW!</span>}
      <div className="flex items-start gap-3">
        <div
          className="cl-icon ink-border-sm shrink-0"
          style={{ background: m.bg, color: m.fg }}
          aria-hidden="true"
        >
          <Icon className="w-6 h-6" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <CategoryChip category={item.category} />
          <h3 className="heading-font text-[15px] leading-tight mt-1 uppercase">{item.title}</h3>
        </div>
      </div>
      <p className="text-[12.5px] font-bold leading-snug mt-2 text-[var(--c-ink)]/85">
        {item.body}
      </p>
      {item.changes && item.changes.length > 0 && (
        <ul className="cl-changes mt-2.5 flex flex-col gap-1.5" aria-label="Balance changes">
          {item.changes.map((c) => (
            <li key={c.label} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[11px] font-bold uppercase text-[var(--c-ink)]/70 min-w-0">
                {c.label}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="cl-before font-mono">{c.before}</span>
                <span className="heading-font text-[var(--c-red)]" aria-label="to">
                  &#9654;
                </span>
                <span className="cl-after font-mono">{c.after}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {item.route && (
        <a
          href={serializeRoute({ screen: item.route.screen, sub: item.route.sub ?? [] })}
          className="cl-try btn-pop heading-font mt-3 inline-flex items-center gap-1 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs px-3 py-1.5 text-[11px]"
        >
          TRY IT: {item.route.label} &gt;
        </a>
      )}
    </article>
  );
}

function ReleaseHero({
  entry,
  isNew,
  latest,
}: {
  entry: ChangelogEntry;
  isNew: boolean;
  latest: boolean;
}) {
  return (
    <header className="cl-hero ink-border-md relative overflow-hidden">
      <div className="cl-hero-dots" aria-hidden="true" />
      <div className="relative flex items-center gap-4">
        <div className="cl-burst shrink-0" aria-hidden="true">
          <span className="heading-font">
            <small>v</small>
            {entry.version}
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {latest && <span className="cl-tag heading-font">LATEST</span>}
            {isNew && (
              <span className="cl-tag cl-tag-new heading-font">NEW SINCE YOU LAST PLAYED</span>
            )}
            {entry.date && <span className="text-[11px] font-bold opacity-75">{entry.date}</span>}
          </div>
          <h2 className="heading-font text-2xl sm:text-3xl leading-none mt-1 uppercase">
            <span className="sr-only">Version {entry.version}: </span>
            {entry.name}
          </h2>
          <p className="text-[13px] font-bold mt-1.5 leading-snug opacity-90">{entry.tagline}</p>
        </div>
      </div>
    </header>
  );
}

type Filter = ChangelogCategory | 'all';

export function ChangelogScreen({ onBack }: { onBack: () => void }) {
  const [fresh] = useState(() => unseenVersions(loadLastSeenVersion()));
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Set<string>>(() => new Set([ENTRIES[0]?.version, ...fresh]));

  useEffect(() => {
    markChangelogSeen();
  }, []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: 0,
      gameplay: 0,
      balance: 0,
      collection: 0,
      grading: 0,
      qol: 0,
    };
    for (const e of ENTRIES)
      for (const it of e.items) {
        c.all += 1;
        c[it.category] += 1;
      }
    return c;
  }, []);

  const toggle = (v: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  return (
    <div className="cl-screen w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      {/* flex-wrap: a back button and a title on one unbreakable line is wider
          than a phone at a large browser font size. */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 bg-[var(--c-ink)] px-4 py-2.5">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        <h1 className="heading-font text-xl text-[var(--c-yellow)]">PATCH NOTES</h1>
      </div>

      <div className="px-4 py-5 sm:px-6 max-w-3xl mx-auto flex flex-col gap-5">
        <nav aria-label="Filter by category" className="cl-filters flex flex-wrap gap-2">
          {(['all', ...CATEGORY_ORDER] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className="cl-filter btn-pop heading-font ink-border-sm"
            >
              {f === 'all' ? 'Everything' : CATEGORY_META[f].label}
              <span className="cl-count">{counts[f]}</span>
            </button>
          ))}
        </nav>

        {ENTRIES.map((entry, ei) => {
          const items = entry.items.filter((it) => filter === 'all' || it.category === filter);
          const isOpen = open.has(entry.version);
          const isNew = fresh.has(entry.version);
          if (items.length === 0) return null;
          return (
            <section
              key={entry.version}
              className="cl-release"
              aria-label={`${entry.name} v${entry.version}`}
            >
              <ReleaseHero entry={entry} isNew={isNew} latest={ei === 0} />
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(entry.version)}
                className="cl-toggle heading-font w-full flex items-center justify-between gap-2 px-4 py-2 ink-border-md border-t-0 bg-[var(--c-ink)] text-[var(--c-paper)] text-[12px]"
              >
                <span>
                  {items.length} {items.length === 1 ? 'CHANGE' : 'CHANGES'}
                  {filter !== 'all' && ` IN ${CATEGORY_META[filter].label.toUpperCase()}`}
                </span>
                <span className="flex items-center gap-1 text-[var(--c-yellow)]">
                  {isOpen ? 'HIDE' : 'SHOW'}
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>
              {isOpen && (
                <div className="cl-grid mt-3 grid gap-3 sm:grid-cols-2">
                  {items.map((it, i) => (
                    <ItemCard key={it.title} item={it} isNew={isNew} index={i} />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        <div className="flex items-center justify-center gap-2 text-[10px] font-mono font-bold text-[var(--c-steel)]/70 mt-2 mb-6">
          <BookOpen className="w-3.5 h-3.5" /> FULL DETAILS · CHANGELOG.md
        </div>
      </div>
    </div>
  );
}
