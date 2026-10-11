/**
 * TAKE A SEAT: table length, size, bot difficulty, deck format and the
 * week's rule twist; then a deck (random, rolled from your own cards, one of
 * your saved decks) — or a PRACTICE table (unrewarded): a pasted deck code,
 * friends' decks as opponents, a forced Location, or the Daily Table.
 *
 * Lazy-loaded (it is not part of the first paint; see check-bundle-size).
 */
import React, { useMemo, useState } from 'react';
import { legalModes, buildDeck, deckCardIds } from '../game/poker/deck';
import { MODES, MODE_IDS, MAX_SEATS, MIN_SEATS, type ModeId } from '../game/poker/constants';
import { POOL, POOL_BY_ID, POOL_LEADERS, poolByType } from '../game/poker/cardpool';
import { FORMATS, FORMAT_IDS, meetsFormat, formatTags, type FormatId } from '../game/poker/formats';
import { isoWeekKey, weeklyMutator, fnv } from '../game/poker/mutators';
import { rngOn } from '../game/poker/rng';
import { cn } from '../lib/utils';
import type { DeckRow } from '../lib/supabase';
import type { PlaySetup } from '../components/PokerMatch';
import { useMeta } from './MetaContext';
import { CurrencyBar } from './CurrencyBar';
import { PopButton } from './ui';
import { SafeImage } from './SafeImage';
import { decodeDeckCode, encodeDeckCode, takeChallengeDeck } from './deckcode';
import { quickbuildIds } from './deckEdits';
import { utcDayKey } from './cardOfTheDay';
import { loadMatchHistory, summarizeMatchHistory } from './matchHistory';
import {
  CPU_DIFFICULTIES,
  loadCpuDifficulty,
  saveCpuDifficulty,
  type CpuDifficultyId,
} from './matchPrefs';
import { usePersistedState } from './usePersistedState';

const POOL_MAP = () => new Map(POOL.map((c) => [c.id, c]));

/** A deck code as a pseudo deck row (no id: it is never saved). */
function rowFromCode(code: string): { row: DeckRow; mode: ModeId } | { error: string } {
  const d = decodeDeckCode(code, POOL_MAP());
  if ('error' in d) return d;
  const leader = POOL_BY_ID[d.leaderId];
  return {
    mode: d.mode,
    row: {
      id: `code:${fnv(code.trim())}`,
      name: `${leader?.name ?? 'Deck'} (code)`,
      leader_id: d.leaderId,
      card_ids: d.cardIds,
    } as DeckRow,
  };
}

/** The Daily Table (Q15): same seed and deck for everyone today. */
export function dailySetup(day = utcDayKey()): PlaySetup {
  const seed = fnv(`fry-daily:${day}`) | 0;
  const rng = rngOn({ rng: seed });
  const leader = POOL_LEADERS[rng.int(POOL_LEADERS.length)];
  const deck = buildDeck(leader, MODES.standard, rng, `Daily ${day}`);
  return {
    mode: 'standard',
    seats: 6,
    difficulty: 'normal',
    seed,
    unrewarded: true,
    tag: `Daily ${day}`,
    kind: 'custom',
    deck: {
      id: `daily:${day}`,
      name: `Daily ${day} · ${leader.name}`,
      leader_id: leader.id,
      card_ids: deckCardIds(deck),
    } as DeckRow,
  };
}

export function PlayScreen({
  onStart,
  onBack,
  practice = false,
}: {
  onStart: (setup: PlaySetup) => void;
  onBack: () => void;
  /** Arrived from a How to Play "Try it": offer the guided first game. */
  practice?: boolean;
}) {
  const { decks, guest, dataLoading, collection } = useMeta();
  const [mode, setMode] = usePersistedState<ModeId>('frycards:play-mode', 'standard');
  const [seats, setSeats] = usePersistedState<number>('frycards:play-seats', MAX_SEATS);
  const [format, setFormat] = usePersistedState<FormatId>('frycards:play-format', 'open');
  const [twistOn, setTwistOn] = usePersistedState<boolean>('frycards:play-twist', false);
  const [difficulty, setDifficulty] = useState<CpuDifficultyId>(loadCpuDifficulty);
  const m = MODES[MODE_IDS.includes(mode) ? mode : 'standard'];
  const fmt: FormatId = FORMAT_IDS.includes(format) ? format : 'open';
  const tableSeats = Math.max(MIN_SEATS, Math.min(MAX_SEATS, Number(seats) || MAX_SEATS));
  const twist = weeklyMutator();
  const base = {
    mode: m.id,
    seats: tableSeats,
    difficulty,
    ...(fmt !== 'open' ? { format: fmt } : {}),
    ...(twistOn ? { mutators: [twist.id] } : {}),
  };
  const pick = (on: boolean) =>
    cn(
      'btn-pop heading-font text-xs px-3 py-1.5 ink-border-sm',
      on ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]' : 'bg-[var(--c-paper)] text-[var(--c-ink)]',
    );

  // Q4: a legal deck rolled from the cards you own.
  const owned = useMemo(
    () => new Map(collection.map((pc) => [pc.card_id, pc.quantity + pc.foil_quantity])),
    [collection],
  );
  const rollOwn = () => {
    const leaders = POOL_LEADERS.filter((l) => (owned.get(l.id) ?? 0) > 0);
    if (!leaders.length) return null;
    const rng = rngOn({ rng: (Date.now() & 0x7fffffff) | 1 });
    for (let tries = 0; tries < 6; tries++) {
      const leader = leaders[rng.int(leaders.length)];
      const ids = quickbuildIds(leader, m, POOL, owned, rng);
      if (legalModes(leader.id, ids).includes(m.id) && meetsFormat(fmt, leader.id, ids))
        return {
          id: `own:${leader.id}`,
          name: `${leader.name} — From my cards`,
          leader_id: leader.id,
          card_ids: ids,
        } as DeckRow;
    }
    return null;
  };
  const [ownMsg, setOwnMsg] = useState('');

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 bg-[var(--c-ink)] px-4 py-2.5">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        <h1 className="heading-font text-xl text-[var(--c-yellow)]">TAKE A SEAT</h1>
        <span className="fs-xs font-bold text-[var(--c-paper)]/60 hidden md:inline">
          FryCards Poker · pot-limit Hold&apos;em freezeout · 2–6 seats
        </span>
        <CurrencyBar className="ml-auto" />
      </div>
      <div className="p-6 max-w-6xl mx-auto">
        {practice && (
          <div className="ink-border-sm bg-[var(--c-yellow)] text-[var(--c-ink)] fs-sm font-bold px-3 py-2 mb-4 max-w-xl flex flex-wrap items-center gap-3">
            <span>
              Guided first game: loose bots, the hand-strength helper switched on, and the coach
              teaching one idea at a time — hand ranks, then betting, then a power.
            </span>
            <button
              onClick={() =>
                onStart({
                  mode: m.id,
                  seats: tableSeats,
                  kind: 'random',
                  tutorial: true,
                  difficulty: 'easy',
                })
              }
              className="btn-pop heading-font text-xs px-3 py-1.5 bg-[var(--c-ink)] text-[var(--c-yellow)] ink-border-sm"
            >
              START THE GUIDED GAME ▸
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-6 mb-6">
          <div>
            <h2 className="heading-font text-sm mb-1.5">FORMAT</h2>
            <div className="flex gap-1.5">
              {MODE_IDS.map((id) => (
                <button key={id} onClick={() => setMode(id)} className={pick(m.id === id)}>
                  {MODES[id].label.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="fs-xs font-bold text-[var(--c-steel)] mt-1 max-w-xs">
              {m.stackChips} chips each · blinds ×{m.blindGrowth} every {m.levelMs / 60000} min ·
              about {Math.round(m.capMs / 60000)} min at most · decks of {m.powers} powers
            </p>
          </div>
          <div>
            <h2 className="heading-font text-sm mb-1.5">SEATS</h2>
            <div className="flex gap-1.5">
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} onClick={() => setSeats(n)} className={pick(tableSeats === n)}>
                  {n}
                </button>
              ))}
            </div>
            <p className="fs-xs font-bold text-[var(--c-steel)] mt-1">
              You plus {tableSeats - 1} bot{tableSeats === 2 ? '' : 's'}.
            </p>
          </div>
          <div>
            <h2 className="heading-font text-sm mb-1.5">BOTS</h2>
            <div className="flex flex-wrap gap-1.5">
              {CPU_DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    setDifficulty(d.id);
                    saveCpuDifficulty(d.id);
                  }}
                  className={pick(difficulty === d.id)}
                  title={d.blurb}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="fs-xs font-bold text-[var(--c-steel)] mt-1 max-w-xs">
              {CPU_DIFFICULTIES.find((d) => d.id === difficulty)?.blurb}. Bots only ever see their
              own cards.
            </p>
          </div>
          <div>
            <h2 className="heading-font text-sm mb-1.5">DECK RULES</h2>
            <div className="flex flex-wrap gap-1.5">
              {FORMAT_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => setFormat(id)}
                  className={pick(fmt === id)}
                  title={FORMATS[id].blurb}
                >
                  {FORMATS[id].badge}
                </button>
              ))}
            </div>
            <p className="fs-xs font-bold text-[var(--c-steel)] mt-1 max-w-xs">
              {FORMATS[fmt].blurb}
              {fmt !== 'open' ? ' Bots and random decks play it too. Normal rewards.' : ''}
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2 mb-6 max-w-xl ink-border-sm bg-[var(--c-ink)] text-[var(--c-paper)] px-3 py-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!twistOn}
            onChange={(e) => setTwistOn(e.target.checked)}
            className="mt-1 accent-[var(--c-yellow)]"
          />
          <span>
            <span className="heading-font fs-sm text-[var(--c-yellow)]">
              THIS WEEK ({isoWeekKey()}): {twist.name.toUpperCase()}
            </span>
            <span className="block fs-xs font-bold text-[var(--c-paper)]/80">
              {twist.blurb} Play with this week&apos;s rule — rewards as normal.
            </span>
          </span>
        </label>

        <h2 className="heading-font text-base mb-3 bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5">
          QUICK MATCH
        </h2>
        <div className="mb-8 flex flex-wrap gap-3 items-start">
          <div>
            <button
              onClick={() => onStart({ ...base, kind: 'random' })}
              className="btn-pop px-5 py-3 bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-sm ink-border-md shadow-hard-black hover:-translate-y-1 transition-all"
            >
              RANDOM DECK ▸
            </button>
            <p className="fs-xs font-bold text-[var(--c-steel)] mt-2 max-w-xs">
              Rolls a random Leader and a legal {m.label} deck — no collection needed. Every bot
              does the same.
            </p>
          </div>
          {!guest && (
            <div>
              <button
                onClick={() => {
                  const d = rollOwn();
                  if (!d) {
                    setOwnMsg(
                      `Your cards can't fill a legal ${m.label}${fmt !== 'open' ? ` ${FORMATS[fmt].label}` : ''} deck yet — open some packs.`,
                    );
                    return;
                  }
                  onStart({ ...base, kind: 'custom', deck: d });
                }}
                className="btn-pop px-5 py-3 bg-[var(--c-paper)] text-[var(--c-ink)] heading-font text-sm ink-border-md shadow-hard-black hover:-translate-y-1 transition-all"
              >
                RANDOM FROM MY CARDS ▸
              </button>
              <p className="fs-xs font-bold text-[var(--c-steel)] mt-2 max-w-xs" role="status">
                {ownMsg || 'A random owned Leader and a legal deck from the cards you own.'}
              </p>
            </div>
          )}
          <div>
            <button
              onClick={() => onStart(dailySetup())}
              className="btn-pop px-5 py-3 bg-[var(--c-ink)] text-[var(--c-yellow)] heading-font text-sm ink-border-md shadow-hard-black hover:-translate-y-1 transition-all"
            >
              DAILY TABLE ▸
            </button>
            <p className="fs-xs font-bold text-[var(--c-steel)] mt-2 max-w-xs">
              Today&apos;s table: the same deal, deck and bots for everyone (Standard, 6 seats).
              Practice — no rewards.
            </p>
          </div>
        </div>
        {guest ? (
          <p className="fs-xs font-bold text-[var(--c-steel)] mb-8">
            Create an account to build and save your own decks in the Deck Builder: a Leader, one
            Location and {MODES.quick.powers} / {MODES.standard.powers} / {MODES.deep.powers} power
            cards.
          </p>
        ) : (
          <>
            <h2 className="heading-font text-base mb-3 bg-[var(--c-steel)] text-[var(--c-paper)] inline-block px-2 py-0.5">
              YOUR {m.label.toUpperCase()} DECKS
              {fmt !== 'open' ? ` · ${FORMATS[fmt].badge}` : ''}
            </h2>
            {dataLoading ? (
              <p className="fs-xs font-bold text-[var(--c-steel)] mb-8 animate-pulse">
                Loading your decks…
              </p>
            ) : (
              <DeckChoices
                decks={decks.filter((d) => meetsFormat(fmt, d.leader_id, d.card_ids))}
                mode={m.id}
                onPick={(d) => onStart({ ...base, kind: 'custom', deck: d })}
              />
            )}
          </>
        )}

        <PracticeTable base={{ mode: m.id, seats: tableSeats, difficulty }} onStart={onStart} />
      </div>
    </div>
  );
}

/** Practice (unrewarded): play a pasted code, face friends' decks, force a Location. */
function PracticeTable({
  base,
  onStart,
}: {
  base: { mode: ModeId; seats: number; difficulty: CpuDifficultyId };
  onStart: (s: PlaySetup) => void;
}) {
  const [code, setCode] = useState('');
  // Q22: a "beat this deck" link pre-fills the first opponent.
  const [vs, setVs] = useState(() => takeChallengeDeck() ?? '');
  const [loc, setLoc] = useState('');
  const [err, setErr] = useState('');
  const locations = poolByType('Location');
  const start = () => {
    setErr('');
    let me: PlaySetup;
    if (code.trim()) {
      const r = rowFromCode(code);
      if ('error' in r) return setErr(`Your deck: ${r.error}`);
      me = { ...base, mode: r.mode, kind: 'custom', deck: r.row };
    } else me = { ...base, kind: 'random' };
    const ghosts: NonNullable<PlaySetup['ghosts']> = [];
    for (const line of vs.split(/\s+/).filter(Boolean)) {
      const r = rowFromCode(line);
      if ('error' in r) return setErr(`Opponent deck: ${r.error}`);
      ghosts.push({
        name: `${POOL_BY_ID[r.row.leader_id]?.name ?? 'Friend'} · Friend's deck`,
        leader_id: r.row.leader_id,
        card_ids: r.row.card_ids,
      });
    }
    onStart({
      ...me,
      seats: Math.max(me.seats, ghosts.length + 1),
      unrewarded: true,
      tag: 'Practice',
      ...(ghosts.length ? { ghosts } : {}),
      ...(loc ? { location: loc } : {}),
    });
  };
  return (
    <section className="mt-2 mb-8 max-w-2xl ink-border-sm p-3 bg-white/40">
      <h2 className="heading-font text-base mb-1">PRACTICE TABLE</h2>
      <p className="fs-xs font-bold text-[var(--c-steel)] mb-2">
        Unrewarded. Play any deck code (yours or a friend&apos;s), seat friends&apos; decks as
        opponents, and pick a Location that shows up every round.
      </p>
      <label className="block fs-xs font-bold mb-2">
        YOUR DECK CODE (empty = random deck)
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="FRY2:standard:…"
          className="mt-0.5 w-full ink-border-sm px-2 py-1 font-mono fs-xs bg-[var(--c-paper)]"
        />
      </label>
      <label className="block fs-xs font-bold mb-2">
        OPPONENT DECK CODES (one per line or space)
        <textarea
          value={vs}
          onChange={(e) => setVs(e.target.value)}
          rows={2}
          placeholder="FRY2:standard:…"
          className="mt-0.5 w-full ink-border-sm px-2 py-1 font-mono fs-xs bg-[var(--c-paper)]"
        />
      </label>
      <label className="block fs-xs font-bold mb-2">
        TABLE LOCATION
        <select
          value={loc}
          onChange={(e) => setLoc(e.target.value)}
          className="mt-0.5 block ink-border-sm px-2 py-1 fs-xs bg-[var(--c-paper)]"
        >
          <option value="">Normal rotation</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      {err && (
        <p className="fs-xs font-bold text-[var(--c-red)] mb-2" role="alert">
          {err}
        </p>
      )}
      <button
        onClick={start}
        className="btn-pop heading-font text-sm px-4 py-2 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm shadow-hard-black-xs"
      >
        START PRACTICE ▸
      </button>
    </section>
  );
}

function DeckChoices({
  decks,
  mode,
  onPick,
}: {
  decks: DeckRow[];
  mode: ModeId;
  onPick: (d: DeckRow) => void;
}) {
  // Per-mode legality comes from the client's poker rules; the server's
  // is_valid flag (poker_deck_modes) only says "legal in some mode".
  const rows = decks.map((d) => ({ d, modes: legalModes(d.leader_id, d.card_ids) }));
  const legal = rows.filter((r) => r.modes.includes(mode));
  // Q7: this exact list's record on this device.
  const byDeck = new Map(
    summarizeMatchHistory(loadMatchHistory()).byDeck.map((d) => [d.key, d] as const),
  );
  const recordOf = (d: DeckRow) => {
    try {
      return byDeck.get(encodeDeckCode(d.leader_id, d.card_ids, mode));
    } catch {
      return undefined;
    }
  };
  if (legal.length === 0)
    return (
      <p className="fs-xs font-bold text-[var(--c-steel)] mb-8">
        No legal {MODES[mode].label} decks yet — build one in the Deck Builder: a Leader, exactly
        one Location and {MODES[mode].powers} power cards (max {MODES[mode].maxCopies} copies of a
        card, {MODES[mode].maxTier5} tier-5).
        {rows.some((r) => r.modes.length > 0) &&
          ' Some of your decks are legal in another format — switch FORMAT above.'}
      </p>
    );
  return (
    <div className="flex flex-wrap gap-4 mb-8">
      {legal.map(({ d }) => {
        const leader = POOL_BY_ID[d.leader_id];
        const missing = [d.leader_id, ...d.card_ids].filter((id) => !POOL_BY_ID[id]);
        return (
          <button
            key={d.id}
            onClick={() => onPick(d)}
            disabled={missing.length > 0}
            title={
              missing.length > 0
                ? `${missing.length} card(s) in this deck aren't loaded — reload the card database`
                : undefined
            }
            className="btn-pop w-56 overflow-hidden bg-[var(--c-paper)] ink-border-md shadow-hard-black hover:-translate-y-1 transition-all text-left disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
          >
            <div className="px-2 py-1 bg-[var(--c-steel)] heading-font fs-xs text-[var(--c-paper)] truncate">
              {d.name}
            </div>
            <div className="ink-border-sm m-1.5 overflow-hidden aspect-[16/8]">
              <SafeImage
                src={leader?.image}
                boxWidth={224}
                className="w-full h-full object-cover"
                fallbackText={leader?.name}
              />
            </div>
            <div className="p-3 pt-1">
              <div className="heading-font text-sm leading-tight">{leader?.name}</div>
              <div className="fs-xs font-bold text-[var(--c-steel)] mt-0.5">
                {leader?.colors.join(' / ')} · {Math.max(0, d.card_ids.length - 1)} powers + a
                Location
              </div>
              <DeckMeta tags={formatTags(d.leader_id, d.card_ids)} rec={recordOf(d)} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Format badges (Q6/R6) and this list's record (Q7) under a deck tile. */
export function DeckMeta({
  tags,
  rec,
}: {
  tags: FormatId[];
  rec?: { games: number; wins: number; avgPlace: number };
}) {
  if (!tags.length && !rec) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {tags.map((t) => (
        <span
          key={t}
          title={FORMATS[t].blurb}
          className="fs-xs font-black px-1 bg-[var(--c-ink)] text-[var(--c-yellow)]"
        >
          {FORMATS[t].badge}
        </span>
      ))}
      {rec && (
        <span className="fs-xs font-black text-[var(--c-ink)]">
          {rec.wins} W / {rec.games} · avg {rec.avgPlace}
        </span>
      )}
    </div>
  );
}
