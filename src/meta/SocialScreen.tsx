import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, UserPlus, ArrowLeftRight, Search, Coins, X, Trophy } from 'lucide-react';
import { useMeta } from './MetaContext';
import {
  fetchFriendships,
  fetchPublicProfiles,
  fetchTrades,
  fetchFriendCollection,
  fetchCardsLeaderboard,
  searchPlayers,
  sendFriendRequest,
  respondFriendRequest,
  removeFriend,
  createTrade,
  respondTrade,
  cancelTrade,
  Friendship,
  PublicProfile,
  Trade,
  TradeCardItem,
  PlayerCard,
  CardsLeaderboardEntry,
} from '../lib/supabase';
import { MetaHeader, PopButton, Notice, Credits } from './ui';
import { cn } from '../lib/utils';
import { POOL_BY_ID } from '../game/v3/cardpool';
import { spareSplit } from './CollectionScreen';
import { RARITY_CHIP } from './rarity';
import { PlayerLink } from './PlayerProfileModal';
import { RoleBadge } from './RoleBadge';
import { fmtCredits } from './economy';

type Tab = 'friends' | 'trades' | 'leaderboard';

function cardName(id: string): string {
  return POOL_BY_ID[id]?.name || id;
}

function CardChip({ item }: { key?: React.Key; item: TradeCardItem }) {
  const def = POOL_BY_ID[item.card_id];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 ink-border-sm',
        RARITY_CHIP[def?.rarity || 'Common'] || RARITY_CHIP.Common,
      )}
    >
      {item.quantity > 1 ? `${item.quantity}× ` : ''}
      {cardName(item.card_id)}
      {item.foil ? ' ✦' : ''}
    </span>
  );
}

function TradeSide({
  label,
  cards,
  credits,
}: {
  label: string;
  cards: TradeCardItem[];
  credits: number;
}) {
  return (
    <div className="flex-1 min-w-[180px]">
      <div className="text-[9px] font-black text-[var(--c-steel)] mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {cards.map((c) => (
          <CardChip key={`${c.card_id}-${c.foil ? 'foil' : 'normal'}`} item={c} />
        ))}
        {credits > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 bg-[var(--c-yellow)] ink-border-sm">
            <Coins className="w-2.5 h-2.5" /> {fmtCredits(credits)}
          </span>
        )}
        {cards.length === 0 && credits === 0 && (
          <span className="text-[9px] font-bold text-[var(--c-steel)]">nothing</span>
        )}
      </div>
    </div>
  );
}

export function SocialScreen({ onBack }: { onBack: () => void }) {
  const { session, profile, refreshProfile, refreshCollection } = useMeta();
  const userId = session?.user?.id;
  const [tab, setTab] = useState<Tab>('friends');
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Map<string, PublicProfile>>(new Map());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [tradePartner, setTradePartner] = useState<PublicProfile | null>(null);
  const [leaderboard, setLeaderboard] = useState<CardsLeaderboardEntry[] | null>(null);
  // Distinct from `leaderboard === null` ("still loading") — a failed fetch
  // must not render identically to a genuinely empty board (which would
  // otherwise show a permanent, wrong "No players yet.").
  const [leaderboardError, setLeaderboardError] = useState(false);
  const [leaderboardAttempt, setLeaderboardAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (tab !== 'leaderboard' || leaderboard !== null) return;
    let cancelled = false;
    setLeaderboardError(false);
    fetchCardsLeaderboard(50)
      .then((lb) => {
        if (!cancelled) setLeaderboard(lb);
      })
      .catch(() => {
        // Leave leaderboard null on failure so the UI can show a retry
        // affordance instead of a false "No players yet."
        if (!cancelled) setLeaderboardError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, leaderboard, leaderboardAttempt]);

  // Generation counter so every reload() call site — not just the mount
  // effect's own isCancelled hook — is protected against an older in-flight
  // reload resolving after a newer one and clobbering fresher state (e.g.
  // accepting a friend request, then quickly declining another, could
  // otherwise have the first reload's response land last and revert the
  // just-accepted friendship back to "pending").
  const reloadGen = useRef(0);
  const reload = useCallback(
    async (isCancelled?: () => boolean) => {
      const gen = ++reloadGen.current;
      const stale = () => isCancelled?.() || gen !== reloadGen.current;
      const [fs, ts] = await Promise.all([fetchFriendships(), fetchTrades()]);
      if (stale()) return;
      setFriendships(fs);
      setTrades(ts);
      const ids = new Set<string>();
      for (const f of fs) {
        ids.add(f.requester);
        ids.add(f.addressee);
      }
      for (const t of ts) {
        ids.add(t.proposer);
        ids.add(t.recipient);
      }
      if (userId) ids.delete(userId);
      const pp = await fetchPublicProfiles([...ids]);
      if (stale()) return;
      setProfiles(new Map(pp.map((p) => [p.id, p])));
    },
    [userId],
  );

  useEffect(() => {
    // Guards a stale in-flight reload() (e.g. from a fast sign-out/sign-in)
    // from clobbering friendships/trades/profiles state after userId changes.
    let cancelled = false;
    (async () => {
      try {
        await reload(() => cancelled);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const nameOf = (id: string) => profiles.get(id)?.username || 'Unknown player';

  const incoming = friendships.filter((f) => f.status === 'pending' && f.addressee === userId);
  const outgoing = friendships.filter((f) => f.status === 'pending' && f.requester === userId);
  const friends = friendships.filter((f) => f.status === 'accepted');
  const friendProfiles = useMemo(
    () =>
      friends
        .map((f) => {
          const otherId = f.requester === userId ? f.addressee : f.requester;
          return { friendship: f, other: profiles.get(otherId), otherId };
        })
        .filter((x) => x.otherId),
    [friends, profiles, userId],
  );

  const pendingTrades = trades.filter((t) => t.status === 'pending');
  const doneTrades = trades.filter((t) => t.status !== 'pending').slice(0, 10);

  const run = async (
    fn: () => Promise<string | null>,
    success?: string,
    onSuccess?: () => void,
  ) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const err = await fn();
      if (err) setError(err);
      else {
        if (success) setNotice(success);
        onSuccess?.();
        // Awaited (not fire-and-forget) so a network failure here is caught
        // by this same try/catch instead of escaping as an unhandled
        // rejection — the action itself already succeeded, but the player
        // still deserves to know the screen may now be showing stale data.
        await reload();
      }
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    setError('');
    try {
      setResults(await searchPlayers(query));
    } catch {
      setError('Search failed — check your connection and try again.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="FRIENDS & TRADING" onBack={onBack} />
      <div className="p-5 max-w-5xl mx-auto">
        <div className="flex gap-2 mb-4">
          <PopButton
            color={tab === 'friends' ? 'black' : 'yellow'}
            onClick={() => setTab('friends')}
          >
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> FRIENDS ({friendProfiles.length})
            </span>
          </PopButton>
          <PopButton color={tab === 'trades' ? 'black' : 'yellow'} onClick={() => setTab('trades')}>
            <span className="flex items-center gap-1">
              <ArrowLeftRight className="w-3.5 h-3.5" /> TRADES
              {pendingTrades.length > 0 ? ` (${pendingTrades.length})` : ''}
            </span>
          </PopButton>
          <PopButton
            color={tab === 'leaderboard' ? 'black' : 'yellow'}
            onClick={() => setTab('leaderboard')}
          >
            <span className="flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5" /> LEADERBOARD
            </span>
          </PopButton>
        </div>

        {error && (
          <div className="mb-4">
            <Notice text={error} />
          </div>
        )}
        {notice && (
          <div className="mb-4">
            <Notice text={notice} kind="success" />
          </div>
        )}

        {tab === 'leaderboard' && (
          <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3">
            <div className="heading-font text-xs mb-2 flex items-center gap-1.5">
              <Trophy className="w-4 h-4" /> MOST CARDS OWNED
            </div>
            {leaderboard === null ? (
              leaderboardError ? (
                <div className="py-4">
                  <p className="text-[11px] font-bold text-[var(--c-steel)] mb-2">
                    Couldn't load the leaderboard. Check your connection and try again.
                  </p>
                  <PopButton color="red" onClick={() => setLeaderboardAttempt((n) => n + 1)}>
                    RETRY
                  </PopButton>
                </div>
              ) : (
                <p className="text-[11px] font-bold text-[var(--c-steel)]">Loading…</p>
              )
            ) : leaderboard.length === 0 ? (
              <p className="text-[11px] font-bold text-[var(--c-steel)]">No players yet.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {leaderboard.map((row, i) => (
                  <div
                    key={row.id}
                    className={cn(
                      'flex items-center gap-3 px-2 py-1.5 ink-border-sm',
                      row.id === userId ? 'bg-[var(--c-yellow)]' : 'bg-[var(--c-paper)]',
                    )}
                  >
                    <span className="heading-font text-xs w-7 text-right shrink-0">#{i + 1}</span>
                    <span className="flex-1 min-w-0 text-[11px] font-bold truncate">
                      <PlayerLink
                        id={row.id}
                        name={row.username || 'Unknown player'}
                        role={row.role}
                      />
                      {row.id === userId ? ' (you)' : ''}
                    </span>
                    <span className="text-[9px] font-bold text-[var(--c-steel)] shrink-0">
                      Lv {row.level ?? 1}
                    </span>
                    <span className="font-mono font-black text-sm shrink-0">
                      {(row.total_cards ?? 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {tab !== 'leaderboard' &&
          (tab === 'friends' ? (
            <>
              {/* Find players */}
              <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 mb-6">
                <div className="heading-font text-xs mb-2 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4" /> FIND PLAYERS
                </div>
                <div className="flex gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search by username…"
                    className="flex-1 px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs placeholder:text-[var(--c-steel)]/50"
                  />
                  <PopButton color="black" onClick={handleSearch} disabled={searching}>
                    <Search className="w-4 h-4" />
                  </PopButton>
                </div>
                {searching && (
                  <div className="mt-3 text-[10px] font-bold text-[var(--c-steel)] animate-pulse">
                    Searching…
                  </div>
                )}
                {!searching && results && (
                  <div className="mt-3 flex flex-col gap-2">
                    {results.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-2 ink-border-sm px-2 py-1.5"
                      >
                        <div className="text-xs font-bold">
                          <PlayerLink id={r.id} name={r.username} role={r.role} />
                          <span className="text-[9px] text-[var(--c-steel)] ml-2">
                            LV {r.level} · {r.wins}W {r.losses}L
                          </span>
                        </div>
                        <PopButton
                          color="red"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => sendFriendRequest(r.username),
                              `Friend request sent to ${r.username}!`,
                              // Drop this entry from the results so a second
                              // click can't re-send a duplicate request.
                              () => setResults((prev) => prev && prev.filter((p) => p.id !== r.id)),
                            )
                          }
                        >
                          ADD ▸
                        </PopButton>
                      </div>
                    ))}
                    {results.length === 0 && (
                      <div className="text-[10px] font-bold text-[var(--c-steel)]">
                        No players found.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Incoming requests */}
              {incoming.length > 0 && (
                <div className="mb-6">
                  <h2 className="heading-font text-base mb-2 bg-[var(--c-red)] text-[var(--c-paper)] inline-block px-2 py-0.5">
                    FRIEND REQUESTS
                  </h2>
                  <div className="flex flex-col gap-2">
                    {incoming.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between gap-2 ink-border-md shadow-hard-black-xs px-3 py-2 bg-[var(--c-paper)]"
                      >
                        <span className="text-xs font-bold">
                          <PlayerLink
                            id={f.requester}
                            name={nameOf(f.requester)}
                            role={profiles.get(f.requester)?.role}
                          />
                        </span>
                        <div className="flex gap-2">
                          <PopButton
                            color="red"
                            disabled={busy}
                            onClick={() =>
                              run(() => respondFriendRequest(f.id, true), 'Friend added!')
                            }
                          >
                            ACCEPT
                          </PopButton>
                          <PopButton
                            color="steel"
                            disabled={busy}
                            onClick={() => {
                              if (!confirm('Decline this friend request?')) return;
                              run(() => respondFriendRequest(f.id, false), 'Request declined.');
                            }}
                          >
                            DECLINE
                          </PopButton>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Friends list */}
              <h2 className="heading-font text-base mb-2 bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5">
                YOUR FRIENDS
              </h2>
              <div className="flex flex-col gap-2 mb-6">
                {friendProfiles.map(({ friendship, other, otherId }) => (
                  <div
                    key={friendship.id}
                    className="flex items-center justify-between gap-2 ink-border-md shadow-hard-black-xs px-3 py-2 bg-[var(--c-paper)]"
                  >
                    <div className="text-xs font-bold">
                      {other ? (
                        <PlayerLink id={otherId} name={other.username} role={other.role} />
                      ) : (
                        'Unknown player'
                      )}
                      {other && (
                        <span className="text-[9px] text-[var(--c-steel)] ml-2">
                          LV {other.level} · {other.wins}W {other.losses}L
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <PopButton
                        color="yellow"
                        disabled={busy || !other}
                        onClick={() => other && setTradePartner(other)}
                      >
                        <span className="flex items-center gap-1">
                          <ArrowLeftRight className="w-3 h-3" /> TRADE
                        </span>
                      </PopButton>
                      <PopButton
                        color="steel"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(`Remove ${other?.username || 'this player'} from your friends?`)
                          )
                            run(() => removeFriend(friendship.id), 'Friend removed.');
                        }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </PopButton>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="text-[11px] font-bold text-[var(--c-steel)] py-4 animate-pulse">
                    Loading…
                  </div>
                )}
                {!loading && friendProfiles.length === 0 && (
                  <div className="text-[11px] font-bold text-[var(--c-steel)] py-4">
                    No friends yet — search for players above and send a request.
                  </div>
                )}
              </div>

              {/* Outgoing requests */}
              {outgoing.length > 0 && (
                <div className="mb-6">
                  <h2 className="heading-font text-base mb-2 bg-[var(--c-steel)] text-[var(--c-paper)] inline-block px-2 py-0.5">
                    SENT REQUESTS
                  </h2>
                  <div className="flex flex-col gap-2">
                    {outgoing.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between gap-2 ink-border-sm px-3 py-2 bg-[var(--c-paper)]"
                      >
                        <span className="text-xs font-bold">
                          <PlayerLink
                            id={f.addressee}
                            name={nameOf(f.addressee)}
                            role={profiles.get(f.addressee)?.role}
                          />{' '}
                          · pending…
                        </span>
                        <PopButton
                          color="steel"
                          disabled={busy}
                          onClick={() => {
                            if (!confirm('Cancel this friend request?')) return;
                            run(() => removeFriend(f.id), 'Friend request cancelled.');
                          }}
                        >
                          CANCEL
                        </PopButton>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Pending trades */}
              <h2 className="heading-font text-base mb-2 bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5">
                OPEN TRADES
              </h2>
              <div className="flex flex-col gap-3 mb-7">
                {pendingTrades.map((t) => {
                  const isIncoming = t.recipient === userId;
                  return (
                    <div
                      key={t.id}
                      className="ink-border-md shadow-hard-black-sm p-3 bg-[var(--c-paper)]"
                    >
                      <div className="heading-font text-[11px] mb-2">
                        {isIncoming ? (
                          <>
                            <PlayerLink
                              id={t.proposer}
                              name={nameOf(t.proposer)}
                              role={profiles.get(t.proposer)?.role}
                            />{' '}
                            OFFERS YOU A TRADE
                          </>
                        ) : (
                          <>
                            YOUR OFFER TO{' '}
                            <PlayerLink
                              id={t.recipient}
                              name={nameOf(t.recipient).toUpperCase()}
                              role={profiles.get(t.recipient)?.role}
                            />
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 mb-3">
                        <TradeSide
                          label={isIncoming ? 'YOU RECEIVE' : 'YOU GIVE'}
                          cards={t.proposer_cards ?? []}
                          credits={t.proposer_credits ?? 0}
                        />
                        <TradeSide
                          label={isIncoming ? 'YOU GIVE' : 'YOU RECEIVE'}
                          cards={t.recipient_cards ?? []}
                          credits={t.recipient_credits ?? 0}
                        />
                      </div>
                      <div className="flex gap-2">
                        {isIncoming ? (
                          <>
                            <PopButton
                              color="red"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  !confirm('Accept this trade? Cards and credits move immediately.')
                                )
                                  return;
                                run(async () => {
                                  const err = await respondTrade(t.id, true);
                                  if (!err) {
                                    refreshCollection();
                                    refreshProfile();
                                  }
                                  return err;
                                }, 'Trade complete!');
                              }}
                            >
                              ACCEPT TRADE ▸
                            </PopButton>
                            <PopButton
                              color="steel"
                              disabled={busy}
                              onClick={() => {
                                if (!confirm('Decline this trade offer?')) return;
                                run(() => respondTrade(t.id, false), 'Trade declined.');
                              }}
                            >
                              DECLINE
                            </PopButton>
                          </>
                        ) : (
                          <PopButton
                            color="steel"
                            disabled={busy}
                            onClick={() => {
                              if (!confirm('Cancel this trade offer?')) return;
                              run(() => cancelTrade(t.id), 'Trade offer cancelled.');
                            }}
                          >
                            CANCEL OFFER
                          </PopButton>
                        )}
                      </div>
                    </div>
                  );
                })}
                {loading && (
                  <div className="text-[11px] font-bold text-[var(--c-steel)] py-4 animate-pulse">
                    Loading…
                  </div>
                )}
                {!loading && pendingTrades.length === 0 && (
                  <div className="text-[11px] font-bold text-[var(--c-steel)] py-4">
                    No open trades. Start one from the TRADE button next to a friend.
                  </div>
                )}
              </div>

              {/* History */}
              {doneTrades.length > 0 && (
                <>
                  <h2 className="heading-font text-base mb-2 bg-[var(--c-steel)] text-[var(--c-paper)] inline-block px-2 py-0.5">
                    RECENT HISTORY
                  </h2>
                  <div className="flex flex-col gap-2">
                    {doneTrades.map((t) => (
                      <div
                        key={t.id}
                        className="ink-border-sm px-3 py-2 bg-[var(--c-paper)] flex flex-wrap items-center gap-2"
                      >
                        <span
                          className={cn(
                            'text-[8px] font-black px-1 ink-border-sm',
                            t.status === 'accepted'
                              ? 'bg-[#22C55E] text-[#052E12]'
                              : 'bg-[var(--c-steel)] text-[var(--c-paper)]',
                          )}
                        >
                          {(t.status || 'UNKNOWN').toUpperCase()}
                        </span>
                        <span className="text-[10px] font-bold">
                          <PlayerLink
                            id={t.proposer === userId ? t.recipient : t.proposer}
                            name={nameOf(t.proposer === userId ? t.recipient : t.proposer)}
                            role={
                              profiles.get(t.proposer === userId ? t.recipient : t.proposer)?.role
                            }
                          />{' '}
                          {t.created_at ? ` · ${new Date(t.created_at).toLocaleDateString()}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ))}
      </div>

      {tradePartner && profile && (
        <TradeComposerModal
          partner={tradePartner}
          onClose={() => setTradePartner(null)}
          onCreated={() => {
            setTradePartner(null);
            setTab('trades');
            setNotice('Trade offer sent!');
            reload();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trade composer: pick cards + credits on both sides, then send the offer.
// ---------------------------------------------------------------------------
function TradeComposerModal({
  partner,
  onClose,
  onCreated,
}: {
  partner: PublicProfile;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile, collection, decks, serializedCards } = useMeta();
  // Cards locked into any of our own saved decks can't be traded — mirrors
  // assert_cards_available's deck-lock check the create_trade RPC enforces.
  const locked = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of decks) for (const id of d.card_ids ?? []) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }, [decks]);
  // Serialized prints live inside `quantity` but can never be traded —
  // reserve that many NORMAL copies out of the "you give" picker (same
  // model as Collection quicksell / Marketplace sell).
  const serializedReserved = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of serializedCards) m.set(s.card_id, (m.get(s.card_id) || 0) + 1);
    return m;
  }, [serializedCards]);
  const [theirCollection, setTheirCollection] = useState<PlayerCard[] | null>(null);
  const [offer, setOffer] = useState<TradeCardItem[]>([]);
  const [request, setRequest] = useState<TradeCardItem[]>([]);
  // Credits are a plain integer (same unit as everywhere else in the app —
  // see fmtCredits) — these inputs used to treat them as dollars-to-cents
  // (÷100/×100), so offering "100" silently offered 10,000 credits.
  const [offerCredits, setOfferCredits] = useState(0);
  const [requestCredits, setRequestCredits] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchFriendCollection(partner.id)
      .then((c) => {
        if (!cancelled) setTheirCollection(c);
      })
      .catch(() => {
        // Fall back to an empty collection on failure — without this the
        // modal is stuck on "Loading their collection…" forever with no way
        // out except Cancel.
        if (!cancelled) setTheirCollection([]);
      });
    return () => {
      cancelled = true;
    };
  }, [partner.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (
    list: TradeCardItem[],
    setList: (l: TradeCardItem[]) => void,
    cardId: string,
    foil: boolean,
    max: number,
  ) => {
    const idx = list.findIndex((i) => i.card_id === cardId && i.foil === foil);
    if (idx === -1) setList([...list, { card_id: cardId, quantity: 1, foil }]);
    else {
      const next = [...list];
      if (next[idx].quantity < max) next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
      else next.splice(idx, 1); // cycle back to none
      setList(next);
    }
  };

  const pickedQty = (list: TradeCardItem[], cardId: string, foil: boolean) =>
    list.find((i) => i.card_id === cardId && i.foil === foil)?.quantity || 0;

  const handleSend = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const err = await createTrade(partner.id, offer, request, offerCredits, requestCredits);
      if (err) setError(err);
      else onCreated();
    } catch {
      setError('Something went wrong sending this offer — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const renderPicker = (
    source: PlayerCard[],
    list: TradeCardItem[],
    setList: (l: TradeCardItem[]) => void,
    lockedMap: Map<string, number> = new Map(),
    reservedMap: Map<string, number> = new Map(),
  ) => (
    <div className="flex flex-wrap gap-1 max-h-52 overflow-y-auto ink-border-sm p-2 bg-[var(--c-paper)]">
      {source
        .filter((c) => c.quantity + c.foil_quantity > 0 && POOL_BY_ID[c.card_id]?.type !== 'Leader')
        .map((c) => {
          const def = POOL_BY_ID[c.card_id];
          // Deck-locked copies must be split across the two variants
          // (normal-first, foil-spillover) exactly as Collection/Marketplace
          // do via the shared spareSplit — otherwise a card with locked copies
          // double-counts its spare, letting the picker offer more normal AND
          // foil than actually exist and building a trade createTrade then
          // rejects server-side.
          const { normal: normalRaw, foil: foilMax } = spareSplit(
            { q: c.quantity, f: c.foil_quantity },
            lockedMap.get(c.card_id) || 0,
          );
          // Serialized prints (our side only) can never be traded.
          const normalMax = Math.max(0, normalRaw - (reservedMap.get(c.card_id) || 0));
          return (
            <React.Fragment key={c.card_id}>
              {normalMax > 0 && (
                <button
                  onClick={() => toggle(list, setList, c.card_id, false, normalMax)}
                  className={cn(
                    'text-[9px] font-black px-1.5 py-0.5 ink-border-sm',
                    RARITY_CHIP[def?.rarity || 'Common'] || RARITY_CHIP.Common,
                    pickedQty(list, c.card_id, false) > 0 &&
                      'outline outline-2 outline-[var(--c-red)]',
                  )}
                >
                  {cardName(c.card_id)} ×{normalMax}
                  {pickedQty(list, c.card_id, false) > 0 &&
                    ` [${pickedQty(list, c.card_id, false)}]`}
                </button>
              )}
              {foilMax > 0 && (
                <button
                  onClick={() => toggle(list, setList, c.card_id, true, foilMax)}
                  className={cn(
                    'text-[9px] font-black px-1.5 py-0.5 ink-border-sm',
                    RARITY_CHIP[def?.rarity || 'Common'] || RARITY_CHIP.Common,
                    pickedQty(list, c.card_id, true) > 0 &&
                      'outline outline-2 outline-[var(--c-red)]',
                  )}
                >
                  {cardName(c.card_id)} ✦×{foilMax}
                  {pickedQty(list, c.card_id, true) > 0 && ` [${pickedQty(list, c.card_id, true)}]`}
                </button>
              )}
            </React.Fragment>
          );
        })}
      {source.length === 0 && (
        <span className="text-[10px] font-bold text-[var(--c-steel)]">No tradable cards.</span>
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-[var(--c-ink)]/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Trade with ${partner.username || 'player'}`}
    >
      <div
        className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-yellow max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--c-ink)] sticky top-0 z-10">
          <div className="heading-font text-sm text-[var(--c-yellow)]">
            TRADE WITH {(partner.username || 'PLAYER').toUpperCase()}
            <RoleBadge role={partner.role} />
          </div>
          <PopButton color="yellow" onClick={onClose}>
            ✕
          </PopButton>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-3">
              <Notice text={error} />
            </div>
          )}
          <p className="text-[10px] font-bold text-[var(--c-steel)] mb-3">
            Tap cards to add copies to the trade (tap past the max to clear). Cards locked into
            decks can't be traded. {partner.username} must accept before anything moves.
          </p>

          <div className="heading-font text-xs mb-1">YOU GIVE</div>
          {renderPicker(collection, offer, setOffer, locked, serializedReserved)}
          <div className="flex items-center gap-2 mt-2 mb-4">
            <Coins className="w-4 h-4" />
            <input
              type="number"
              min={0}
              max={profile?.credits ?? 0}
              value={offerCredits}
              onChange={(e) =>
                setOfferCredits(
                  Math.max(
                    0,
                    Math.min(profile?.credits ?? 0, Math.round(Number(e.target.value) || 0)),
                  ),
                )
              }
              className="w-28 px-2 py-1 ink-border-sm font-bold text-xs"
            />
            <span className="text-[9px] font-bold text-[var(--c-steel)] inline-flex items-center gap-0.5">
              credits (you have <Credits amount={profile?.credits} />)
            </span>
          </div>

          <div className="heading-font text-xs mb-1">YOU RECEIVE (from {partner.username})</div>
          {theirCollection === null ? (
            <div className="text-[10px] font-bold text-[var(--c-steel)] py-4 animate-pulse">
              Loading their collection…
            </div>
          ) : (
            renderPicker(theirCollection, request, setRequest)
          )}
          <div className="flex items-center gap-2 mt-2 mb-4">
            <Coins className="w-4 h-4" />
            <input
              type="number"
              min={0}
              value={requestCredits}
              onChange={(e) =>
                setRequestCredits(Math.max(0, Math.round(Number(e.target.value) || 0)))
              }
              className="w-28 px-2 py-1 ink-border-sm font-bold text-xs"
            />
            <span className="text-[9px] font-bold text-[var(--c-steel)] inline-flex items-center gap-0.5">
              credits requested (<Credits amount={requestCredits} />)
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <PopButton color="steel" onClick={onClose}>
              CANCEL
            </PopButton>
            <PopButton
              color="red"
              disabled={
                busy ||
                (offer.length === 0 &&
                  request.length === 0 &&
                  offerCredits === 0 &&
                  requestCredits === 0)
              }
              onClick={handleSend}
            >
              {busy ? 'SENDING…' : 'SEND TRADE OFFER ▸'}
            </PopButton>
          </div>
        </div>
      </div>
    </div>
  );
}
