import React, { useMemo, useState } from 'react';
import { Pencil, Check } from 'lucide-react';
import { useMeta } from './MetaContext';
import { equipCosmetic, setUsername, ShopItem } from '../lib/supabase';
import { MetaHeader, PopButton, Notice, ProgressBar, xpForLevel } from './ui';
import { cn } from '../lib/utils';
import { SafeImage } from './SafeImage';

export function ProfileScreen({ onBack }: { onBack: () => void }) {
  const { profile, shopItems, cosmetics, refreshProfile } = useMeta();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [error, setError] = useState('');

  const ownedIds = useMemo(() => new Set(cosmetics.map((c) => c.shop_item_id)), [cosmetics]);
  // Free items (cost 0) are always equippable — but battle pass exclusives
  // must actually be owned, whatever their price columns say.
  const usable = (s: ShopItem) =>
    ownedIds.has(s.id) || (!s.is_season_pass_exclusive && (s.cost_gold === 0 || s.cost_gems === 0));

  if (!profile) return null;

  const banner = shopItems.find((s) => s.id === profile.equipped_banner);
  const avatar = shopItems.find((s) => s.id === profile.equipped_avatar);
  const winRate =
    profile.games_played > 0 ? Math.round((profile.wins / profile.games_played) * 100) : 0;

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
                  {profile.username[0]?.toUpperCase()}
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
                    setNameDraft(profile.username);
                    setEditingName(true);
                  }}
                  className="heading-font text-2xl text-[var(--c-paper)] flex items-center gap-2 hover:text-[var(--c-yellow)]"
                >
                  {profile.username} <Pencil className="w-4 h-4" />
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
            Earn XP from every match (+60 win / +25 loss). Each level pays 100 gold; every 5th level
            adds 10 gems.
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
      </div>
    </div>
  );
}
