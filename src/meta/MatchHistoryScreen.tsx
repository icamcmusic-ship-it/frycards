import React, { useMemo, useState } from 'react';
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

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
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
export function MatchHistoryScreen({ onBack }: { onBack: () => void }) {
  const [records] = useState<MatchRecord[]>(loadMatchHistory);
  const summary = useMemo(() => summarizeMatchHistory(records), [records]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const copy = async (text: string, what: string) => {
    setError('');
    if (await copyText(text)) setNotice(`${what} copied.`);
    else setError("Couldn't copy — your browser blocked clipboard access.");
  };

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="MATCH HISTORY" onBack={onBack} />
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <p className="text-[11px] font-bold text-[var(--c-steel)] mb-4">
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
          <div className="ink-border-md bg-[var(--c-paper)] p-6 text-center font-bold text-[var(--c-steel)]">
            No matches yet. Finish a match and it shows up here.
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
                    </div>
                  </div>
                  <div className="flex gap-2">
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
