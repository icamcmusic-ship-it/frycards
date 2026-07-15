import React, { useMemo, useState } from 'react';
import { Pencil, Check, Search, ShieldAlert } from 'lucide-react';
import { useMeta } from './MetaContext';
import {
  equipCosmetic,
  setUsername,
  searchPlayers,
  adminGrantCurrency,
  adminSetRole,
  adminGrantCard,
  PublicProfile,
  PlayerRole,
  ShopItem,
} from '../lib/supabase';
import { MetaHeader, PopButton, Notice, ProgressBar, xpForLevel } from './ui';
import { RoleBadge } from './RoleBadge';
import { fmtCredits } from './economy';
import { POOL_V4 } from '../game/v3/cardpool';
import { cn } from '../lib/utils';
import { SafeImage } from './SafeImage';
import { CardFace } from '../components/CardFaceV4';
import { POOL_BY_ID } from '../game/v3/cardpool';

export function ProfileScreen({
  onBack,
  onManageShowcase,
}: {
  onBack: () => void;
  onManageShowcase?: () => void;
}) {
  const { profile, shopItems, cosmetics, refreshProfile } = useMeta();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [error, setError] = useState('');

  const ownedIds = useMemo(() => new Set(cosmetics.map((c) => c.shop_item_id)), [cosmetics]);
  // Free items (cost 0) are always equippable — but battle pass exclusives
  // must actually be owned, whatever their price columns say.
  const usable = (s: ShopItem) =>
    ownedIds.has(s.id) ||
    (!s.is_season_pass_exclusive && (s.cost_credits === 0 || s.cost_vouchers === 0));

  const handleEquip = async (item: ShopItem) => {
    setError('');
    const err = await equipCosmetic(item.id);
    if (err) setError(err);
    else refreshProfile();
  };

  const handleRename = async () => {
    setError('');
    const err = await setUsername(nameDraft);
    if (err) setError(err);
    else {
      setEditingName(false);
      refreshProfile();
    }
  };

  if (!profile) {
    return (
      <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
        <MetaHeader title="OPERATIVE PROFILE" onBack={onBack} />
        <div className="text-center font-bold text-[var(--c-steel)] py-16 animate-pulse">
          LOADING PROFILE…
        </div>
      </div>
    );
  }

  // Read profile-dependent fields only after the null-check above — these
  // used to sit before it and dereference `profile` unconditionally on
  // every render (tsconfig has no `strict`/`strictNullChecks`, so this typed
  // clean but crashed at runtime with "Cannot read properties of null"
  // whenever this screen rendered before MetaContext's profile fetch
  // resolved, e.g. right after sign-in).
  const banner = shopItems.find((s) => s.id === profile.equipped_banner);
  const avatar = shopItems.find((s) => s.id === profile.equipped_avatar);
  const winRate =
    profile.games_played > 0 ? Math.round((profile.wins / profile.games_played) * 100) : 0;

  const sections: { type: ShopItem['item_type']; label: string; equipped: string | null }[] = [
    { type: 'card_back', label: 'CARD BACKS', equipped: profile.equipped_card_back },
    { type: 'profile_banner', label: 'BANNERS', equipped: profile.equipped_banner },
    { type: 'profile_avatar', label: 'AVATARS', equipped: profile.equipped_avatar },
  ];

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="OPERATIVE PROFILE" onBack={onBack} />

      {/* Identity card */}
      <div className="max-w-4xl mx-auto p-5">
        <div className="ink-border-md shadow-hard-black overflow-hidden bg-[var(--c-steel)] relative">
          <div className="h-40 relative">
            <SafeImage src={banner?.image_url} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--c-ink)]/80 to-transparent" />
          </div>
          <div className="absolute bottom-3 left-4 flex items-end gap-3">
            <div className="w-20 h-20 ink-border-md shadow-hard-black-xs bg-[var(--c-ink)] overflow-hidden">
              {avatar?.image_url ? (
                <img src={avatar.image_url} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center heading-font text-[var(--c-yellow)] text-3xl">
                  {(profile.username || '?')[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="pb-1">
              {editingName ? (
                <div className="flex gap-2 items-center">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename();
                      else if (e.key === 'Escape') {
                        setEditingName(false);
                        setError('');
                      }
                    }}
                    maxLength={24}
                    className="px-2 py-1 bg-[var(--c-paper)] ink-border-sm font-black heading-font text-sm"
                    autoFocus
                  />
                  <PopButton color="red" onClick={handleRename} title="Save name">
                    <Check className="w-4 h-4" />
                  </PopButton>
                  <PopButton
                    color="steel"
                    onClick={() => {
                      setEditingName(false);
                      setError('');
                    }}
                    title="Cancel"
                  >
                    ✕
                  </PopButton>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setNameDraft(profile.username || '');
                    setEditingName(true);
                  }}
                  className="heading-font text-2xl text-[var(--c-paper)] flex items-center gap-2 hover:text-[var(--c-yellow)]"
                >
                  {profile.username || 'Unnamed operative'}
                  <RoleBadge role={profile.role} size="md" />
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <div className="text-[11px] font-bold text-[var(--c-yellow)]">
                BLUE CORAL OPERATIVE · LEVEL {profile.level}
              </div>
            </div>
          </div>
        </div>

        {/* Level progress */}
        <div className="bg-[var(--c-paper)] ink-border-sm shadow-hard-black-xs px-3 py-2 mt-4">
          <div className="flex justify-between text-[10px] font-black mb-1">
            <span>LEVEL {profile.level}</span>
            <span className="font-mono">
              {profile.xp - xpForLevel(profile.level)}/
              {xpForLevel(profile.level + 1) - xpForLevel(profile.level)} XP TO LEVEL{' '}
              {profile.level + 1}
            </span>
          </div>
          <ProgressBar
            value={profile.xp - xpForLevel(profile.level)}
            max={xpForLevel(profile.level + 1) - xpForLevel(profile.level)}
          />
          <div className="text-[9px] font-bold text-[var(--c-steel)] mt-1">
            Earn XP from every match (+60 win / +25 loss). Each level pays a credits bonus; every
            5th level adds vouchers on top.
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {[
            { label: 'MATCHES', value: profile.games_played },
            { label: 'WINS', value: profile.wins },
            { label: 'LOSSES', value: profile.losses },
            { label: 'WIN RATE', value: `${winRate}%` },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-[var(--c-paper)] ink-border-sm shadow-hard-black-xs px-3 py-2 text-center"
            >
              <div className="heading-font text-2xl">{s.value}</div>
              <div className="text-[9px] font-black text-[var(--c-steel)]">{s.label}</div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-3">
            <Notice text={error} />
          </div>
        )}

        {/* Showcase cards */}
        <div className="mt-7">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="heading-font text-base bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5">
              SHOWCASE
            </h2>
            {onManageShowcase && (
              <PopButton color="yellow" onClick={onManageShowcase}>
                MANAGE IN COLLECTION ▸
              </PopButton>
            )}
          </div>
          {(profile.showcase_cards || []).length === 0 ? (
            <p className="text-[11px] font-bold text-[var(--c-steel)] py-2">
              Pin up to 6 cards from your Collection to show off here.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {(profile.showcase_cards || []).map((id) => {
                const def = POOL_BY_ID[id];
                if (!def) return null;
                return <CardFace key={id} def={def} size="standard" />;
              })}
            </div>
          )}
        </div>

        {/* Cosmetic lockers */}
        {sections.map((sec) => {
          const items = shopItems.filter((s) => s.item_type === sec.type && usable(s));
          return (
            <div key={sec.type} className="mt-7">
              <h2 className="heading-font text-base mb-2 bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5">
                {sec.label}
              </h2>
              <div className="flex flex-wrap gap-3">
                {items.map((item) => {
                  const isEquipped = sec.equipped === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleEquip(item)}
                      className={cn(
                        'btn-pop overflow-hidden ink-border-sm shadow-hard-black-xs bg-[var(--c-paper)] text-left transition-all w-36',
                        isEquipped && 'outline outline-3 outline-[var(--c-red)] -translate-y-1',
                      )}
                    >
                      <div
                        className={cn(
                          'overflow-hidden bg-[var(--c-steel)]',
                          item.aspect_ratio === 'landscape'
                            ? 'aspect-[16/9]'
                            : item.aspect_ratio === 'square'
                              ? 'aspect-square'
                              : 'aspect-[3/4]',
                        )}
                      >
                        <SafeImage
                          src={item.image_url}
                          className="w-full h-full object-cover"
                          fallbackText={item.name}
                        />
                      </div>
                      <div className="px-2 py-1 flex justify-between items-center gap-1">
                        <span className="text-[9px] font-black truncate">{item.name}</span>
                        {isEquipped && (
                          <span className="text-[8px] font-black bg-[var(--c-red)] text-[var(--c-paper)] px-1 shrink-0">
                            ON
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {items.length === 0 && (
                  <div className="text-[11px] font-bold text-[var(--c-steel)] py-3">
                    Nothing owned yet — visit the Store.
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Creator (admin) tools — server-guarded RPCs; only rendered for the creator. */}
        {profile.role === 'creator' && <CreatorTools />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Creator Tools: search a player, then grant currency/cards or set their role.
// Every action calls a SECURITY DEFINER RPC that re-checks the creator role
// server-side — this panel is a convenience, not the security boundary.
// ---------------------------------------------------------------------------
function CreatorTools() {
  const { refreshProfile, refreshCollection } = useMeta();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [target, setTarget] = useState<PublicProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Grant inputs. Credits entered in dollars, stored as integer cents.
  const [credits, setCredits] = useState(0);
  const [vouchers, setVouchers] = useState(0);
  const [cardId, setCardId] = useState('');
  const [cardQty, setCardQty] = useState(1);
  const [cardFoil, setCardFoil] = useState(false);
  const [role, setRole] = useState<PlayerRole>('player');

  const cardKnown = POOL_V4.some((c) => c.id === cardId);

  const handleSearch = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    setError('');
    try {
      setResults(await searchPlayers(query));
    } finally {
      setSearching(false);
    }
  };

  const run = async (fn: () => Promise<string | null>, success: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
    else {
      setNotice(success);
      // Grants to yourself should show up immediately in the wallet/collection.
      refreshProfile();
      refreshCollection();
    }
  };

  const input = 'px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs';

  return (
    <div className="mt-7 mb-8">
      <h2 className="heading-font text-base mb-2 bg-[var(--c-red)] text-[var(--c-paper)] inline-flex items-center gap-1.5 px-2 py-0.5">
        <ShieldAlert className="w-4 h-4" /> CREATOR TOOLS
      </h2>
      <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3">
        <p className="text-[10px] font-bold text-[var(--c-steel)] mb-3">
          Admin-only. Grants and role changes apply instantly and are verified server-side.
        </p>

        {/* Step 1: pick a player */}
        <div className="heading-font text-xs mb-1">1 · FIND A PLAYER</div>
        <div className="flex gap-2 mb-2">
          <input
            className={`${input} flex-1 placeholder:text-[var(--c-steel)]/50`}
            placeholder="Search by username…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <PopButton color="black" onClick={handleSearch} disabled={searching}>
            <Search className="w-4 h-4" />
          </PopButton>
        </div>
        {searching && (
          <div className="text-[10px] font-bold text-[var(--c-steel)] animate-pulse mb-2">
            Searching…
          </div>
        )}
        {!searching && results && !target && (
          <div className="flex flex-col gap-1.5 mb-2">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setTarget(r);
                  setRole(r.role);
                }}
                className="flex items-center justify-between gap-2 ink-border-sm px-2 py-1.5 text-left hover:bg-[var(--c-yellow)]/40"
              >
                <span className="text-xs font-bold">
                  {r.username}
                  <RoleBadge role={r.role} />
                  <span className="text-[9px] text-[var(--c-steel)] ml-2">LV {r.level}</span>
                </span>
                <span className="heading-font text-[9px]">SELECT ▸</span>
              </button>
            ))}
            {results.length === 0 && (
              <div className="text-[10px] font-bold text-[var(--c-steel)]">No players found.</div>
            )}
          </div>
        )}

        {target && (
          <>
            <div className="flex items-center justify-between gap-2 ink-border-sm bg-[var(--c-yellow)]/40 px-2 py-1.5 mb-3">
              <span className="text-xs font-black">
                TARGET: {target.username}
                <RoleBadge role={target.role} />
              </span>
              <PopButton color="steel" onClick={() => setTarget(null)}>
                CHANGE
              </PopButton>
            </div>

            {error && (
              <div className="mb-2">
                <Notice text={error} />
              </div>
            )}
            {notice && (
              <div className="mb-2">
                <Notice text={notice} kind="success" />
              </div>
            )}

            {/* Grant currency */}
            <div className="heading-font text-xs mb-1">2 · GRANT CURRENCY</div>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <label className="flex flex-col gap-0.5 text-[9px] font-black text-[var(--c-steel)]">
                CREDITS ($)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={credits / 100}
                  onChange={(e) =>
                    setCredits(Math.max(0, Math.round((Number(e.target.value) || 0) * 100)))
                  }
                  className={`${input} w-24`}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[9px] font-black text-[var(--c-steel)]">
                VOUCHERS
                <input
                  type="number"
                  min={0}
                  value={vouchers}
                  onChange={(e) =>
                    setVouchers(Math.max(0, Math.round(Number(e.target.value) || 0)))
                  }
                  className={`${input} w-24`}
                />
              </label>
              <PopButton
                color="red"
                disabled={busy || (credits === 0 && vouchers === 0)}
                onClick={() =>
                  run(
                    () => adminGrantCurrency(target.id, credits, vouchers),
                    `Granted ${fmtCredits(credits)} / ${vouchers} vouchers to ${target.username}.`,
                  )
                }
              >
                GRANT ▸
              </PopButton>
            </div>

            {/* Grant a card */}
            <div className="heading-font text-xs mb-1">3 · GRANT A CARD</div>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <label className="flex flex-col gap-0.5 text-[9px] font-black text-[var(--c-steel)]">
                CARD ID
                <input
                  list="creator-card-ids"
                  value={cardId}
                  onChange={(e) => setCardId(e.target.value)}
                  placeholder="card id…"
                  className={`${input} w-48 placeholder:text-[var(--c-steel)]/50`}
                />
                <datalist id="creator-card-ids">
                  {POOL_V4.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </datalist>
              </label>
              <label className="flex flex-col gap-0.5 text-[9px] font-black text-[var(--c-steel)]">
                QTY
                <input
                  type="number"
                  min={1}
                  value={cardQty}
                  onChange={(e) => setCardQty(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                  className={`${input} w-16`}
                />
              </label>
              <label className="flex items-center gap-1.5 text-[10px] font-black pb-1.5">
                <input
                  type="checkbox"
                  checked={cardFoil}
                  onChange={(e) => setCardFoil(e.target.checked)}
                />
                FOIL ✦
              </label>
              <PopButton
                color="red"
                disabled={busy || !cardId.trim()}
                onClick={() =>
                  run(
                    () => adminGrantCard(target.id, cardId.trim(), cardQty, cardFoil),
                    `Granted ${cardQty}× ${cardId}${cardFoil ? ' (foil)' : ''} to ${target.username}.`,
                  )
                }
              >
                GRANT ▸
              </PopButton>
            </div>
            {cardId.trim() !== '' && !cardKnown && (
              <div className="text-[9px] font-bold text-[var(--c-red)] -mt-2 mb-3">
                Unknown card id in the local pool — the server has the final say.
              </div>
            )}

            {/* Set role */}
            <div className="heading-font text-xs mb-1">4 · SET ROLE</div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                className={input}
                value={role}
                onChange={(e) => setRole(e.target.value as PlayerRole)}
              >
                <option value="player">player</option>
                <option value="founder">founder</option>
                <option value="creator">creator</option>
              </select>
              <PopButton
                color="red"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`Set ${target.username}'s role to "${role}"?`)) return;
                  run(() => adminSetRole(target.id, role), `${target.username} is now a ${role}.`);
                }}
              >
                APPLY ROLE ▸
              </PopButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
