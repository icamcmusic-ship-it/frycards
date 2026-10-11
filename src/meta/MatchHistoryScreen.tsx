import React, { useMemo, useState } from 'react';
import type { PlaySetup } from '../components/PokerMatch';
import type { DeckRow } from '../lib/supabase';
import { POOL } from '../game/poker/cardpool';
import { decodeDeckCode } from './deckcode';
import { loadCpuDifficulty, type CpuDifficultyId } from './matchPrefs';
import { MetaHeader, PopButton, Notice } from './ui';
import {
  MatchRecord,
  formatMatchReport,
  loadMatchHistory,
  ordinalOf,
  placeOf,
  summarizeMatchHistory,
} from './matchHistory';
import { cn } from '../lib/utils';
import { History } from 'lucide-react';
import { useRouter } from './useHashRouter';
import { useMeta } from './MetaContext';
import { isCpuLocked } from './cpuAccess';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function StatTile({
  label,
  value,
  sub,
}: {
  key?: React.Key;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 min-w-[110px]">
      <div className="fs-xs font-bold text-[var(--c-steel)]">{label}</div>
      <div className="heading-font text-2xl leading-tight">{value}</div>
      {sub && <div className="fs-xs font-bold text-[var(--c-steel)]">{sub}</div>}
    </div>
  );
}

/**
 * Local match history: the last 50 matches this browser finished, read back
 * from the record the poker table writes at game over (older records from the
 * retired MTG-style game still show, as 1st/2nd of 2). Nothing here touches
 * the network. Each match can be copied as a plain-text report (place, seed,
 * mode, deck code) for a bug report or a chat.
 */
/** Q1: the setup that re-deals a recorded match (same seed, mode, seats and,
 * when its code still decodes, the same deck). Unrewarded: the deal is known. */
export function replaySetup(r: MatchRecord, difficulty: CpuDifficultyId): PlaySetup | null {
  if (r.place === undefined || !r.mode || !r.seats) return null;
  const base = {
    mode: r.mode,
    seats: r.seats,
    difficulty,
    seed: r.seed,
    unrewarded: true as const,
    tag: 'Replay',
  };
  if (!r.humanDeck) return { ...base, kind: 'random' };
  const d = decodeDeckCode(r.humanDeck, new Map(POOL.map((c) => [c.id, c])));
  if ('error' in d) return null;
  return {
    ...base,
    kind: 'custom',
    deck: {
      id: `replay:${r.seed}`,
      name: r.humanLabel,
      leader_id: d.leaderId,
      card_ids: d.cardIds,
    } as DeckRow,
  };
}

export function MatchHistoryScreen({
  onBack,
  onReplay,
}: {
  onBack: () => void;
  /** Q1: start an unrewarded replay of a recorded match. */
  onReplay?: (s: PlaySetup) => void;
}) {
  const [records] = useState<MatchRecord[]>(loadMatchHistory);
  const summary = useMemo(() => summarizeMatchHistory(records), [records]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const { profile, guest } = useMeta();
  const cpuLocked = isCpuLocked(profile, guest);

  const copy = async (text: string, what: string) => {
    setError('');
    if (await copyText(text)) setNotice(`${what} copied.`);
    else setError("Couldn't copy — your browser blocked clipboard access.");
  };

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="MATCH HISTORY" onBack={onBack} />
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <p className="fs-xs font-bold text-[var(--c-steel)] mb-4">
          Your last {records.length === 50 ? 50 : 'matches'} on this device. History is stored in
          this browser only.
        </p>
        {notice && (
          <div className="mb-3">
            <Notice text={notice} kind="success" />
          </div>
        )}
        {error && (
          <div className="mb-3">
            <Notice text={error} />
          </div>
        )}

        {records.length === 0 ? (
          // U66: an empty state with a way forward, and the device-local note said plainly.
          <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-6 flex flex-col items-center gap-3 text-center">
            <History className="w-8 h-8 text-[var(--c-steel)]" aria-hidden />
            <div className="font-bold">No matches yet. Finish a match and it shows up here.</div>
            <div className="fs-xs font-bold text-[var(--c-steel)]">
              History is kept on this device only — it won't follow you to another browser.
            </div>
            {router && !cpuLocked && (
              <PopButton color="yellow" onClick={() => router.navigate('play')}>
                PLAY A MATCH ▸
              </PopButton>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 mb-4">
              <StatTile
                label="FIRST PLACES"
                value={`${summary.wins}/${summary.games}`}
                sub={`${summary.winPct}% of matches`}
              />
              <StatTile
                label="AVERAGE PLACE"
                value={summary.avgPlace.toFixed(1)}
                sub="1 = winner"
              />
              <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3">
                <div className="fs-xs font-bold text-[var(--c-steel)] mb-1.5">
                  LAST {summary.form.length} (NEWEST FIRST)
                </div>
                <div
                  className="flex gap-1"
                  aria-label={`Recent places: ${summary.form.map(ordinalOf).join(' ')}`}
                >
                  {summary.form.map((f, i) => (
                    <span
                      key={i}
                      className={cn(
                        'heading-font text-[11px] w-6 h-6 flex items-center justify-center ink-border-sm',
                        f === 1
                          ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                          : 'bg-[var(--c-ink)] text-[var(--c-paper)]',
                      )}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              <StatTile
                label="TOP-2 STREAK"
                value={String(summary.streak.current)}
                sub={`best ${summary.streak.best}`}
              />
              {summary.byMode.map((m) => (
                <StatTile
                  key={m.mode}
                  label={m.mode.toUpperCase()}
                  value={`${m.winPct}%`}
                  sub={`${m.games} games · avg ${m.avgPlace.toFixed(1)}`}
                />
              ))}
            </div>
            {(summary.byLeader.length > 0 || summary.byOpponent.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                {(
                  [
                    ['AS LEADER', summary.byLeader.map((l) => [l.leader, l.games, l.avgPlace])],
                    [
                      'AGAINST LEADER',
                      summary.byOpponent.slice(0, 8).map((l) => [l.leader, l.games, l.avgPlace]),
                    ],
                  ] as const
                ).map(([title, rows]) =>
                  rows.length ? (
                    <table key={title} className="w-full text-xs font-bold ink-border-sm">
                      <caption className="heading-font text-sm text-left mb-1">{title}</caption>
                      <thead>
                        <tr className="bg-[var(--c-ink)] text-[var(--c-paper)]">
                          <th className="text-left px-2">Leader</th>
                          <th className="px-2">Games</th>
                          <th className="px-2">Avg place</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(([name, games, avg]) => (
                          <tr key={name} className="border-t border-[var(--c-ink)]/20">
                            <td className="px-2 truncate max-w-[12rem]">{name}</td>
                            <td className="px-2 text-center">{games}</td>
                            <td className="px-2 text-center">{Number(avg).toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null,
                )}
              </div>
            )}

            {summary.byDeck.length > 0 && (
              <>
                <h2 className="heading-font text-base mb-2 bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5">
                  BY DECK
                </h2>
                <div className="flex flex-col gap-1.5 mb-6">
                  {summary.byDeck.map((d) => (
                    <div
                      key={d.key}
                      className="flex items-center justify-between gap-3 ink-border-sm bg-[var(--c-paper)] px-3 py-1.5"
                    >
                      <span className="text-xs font-bold truncate">{d.label}</span>
                      <span className="heading-font text-xs shrink-0">
                        {d.wins} first of {d.games} · avg {d.avgPlace.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <h2 className="heading-font text-base mb-2 bg-[var(--c-steel)] text-[var(--c-paper)] inline-block px-2 py-0.5">
              RECENT MATCHES
            </h2>
            <ul className="flex flex-col gap-2">
              {records.map((r) => (
                <li
                  key={`${r.seed}-${r.finishedAt}`}
                  className="ink-border-md bg-[var(--c-paper)] shadow-hard-black-xs p-3 flex flex-wrap items-center gap-x-4 gap-y-2"
                >
                  <span
                    className={cn(
                      'heading-font text-xs px-2 py-1 ink-border-sm',
                      placeOf(r) === 1
                        ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                        : 'bg-[var(--c-ink)] text-[var(--c-paper)]',
                    )}
                  >
                    {r.place !== undefined ? ordinalOf(r.place) : r.won ? 'WIN' : 'LOSS'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate">
                      {r.humanLabel} <span className="text-[var(--c-steel)]">vs</span> {r.cpuLabel}
                    </div>
                    <div className="fs-xs font-bold text-[var(--c-steel)]">
                      {new Date(r.finishedAt).toLocaleString()}
                      {r.place !== undefined
                        ? ` · ${r.seats ?? 2} seats · ${r.mode ?? 'standard'} · ${r.hands ?? 0} hands${r.capped ? ' · on the clock' : ''}`
                        : ` · retired game${r.turns ? ` · ${r.turns} turns` : ''}`}{' '}
                      · seed {r.seed}
                      {r.tag ? ` · ${r.tag}` : ''}
                      {r.firstOfDay && (
                        <span
                          className="ml-1 px-1 ink-border-sm bg-[var(--c-yellow)] text-[var(--c-ink)] font-black"
                          title="Your first Daily Table attempt of the day — the one that counts"
                        >
                          FIRST ATTEMPT
                        </span>
                      )}
                    </div>
                    {r.recap && (
                      <div className="fs-xs font-bold text-[var(--c-steel)]">
                        won {r.recap.handsWon} hands · {r.recap.showdownWins} at showdown · biggest
                        pot ◎{r.recap.biggestPot} · {r.recap.powersCast} powers cast
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onReplay && !cpuLocked && replaySetup(r, 'normal') && (
                      <PopButton
                        color="steel"
                        onClick={() => onReplay(replaySetup(r, loadCpuDifficulty())!)}
                        title="Same deal, seats and bots — unrewarded"
                      >
                        REPLAY SEED
                      </PopButton>
                    )}
                    <PopButton color="yellow" onClick={() => copy(String(r.seed), 'Seed')}>
                      COPY SEED
                    </PopButton>
                    <PopButton
                      color="black"
                      onClick={() => copy(formatMatchReport(r), 'Match report')}
                    >
                      COPY REPORT
                    </PopButton>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
