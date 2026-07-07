import React, { useMemo, useState } from 'react';
import { Pencil, Check } from 'lucide-react';
import { useMeta } from './MetaContext';
import { equipCosmetic, setUsername, ShopItem } from '../lib/supabase';
import { MetaHeader, PopButton, Notice } from './ui';
import { cn } from '../lib/utils';

export function ProfileScreen({ onBack }: { onBack: () => void }) {
  const { profile, shopItems, cosmetics, refreshProfile } = useMeta();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [error, setError] = useState('');

  const ownedIds = useMemo(() => new Set(cosmetics.map((c) => c.shop_item_id)), [cosmetics]);
  // Free items (cost 0) are always equippable.
  const usable = (s: ShopItem) => ownedIds.has(s.id) || s.cost_gold === 0 || s.cost_gems === 0;

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
    <div className="w-full min-h-screen bg-[#F7F7F7] text-[#1A1A1A]">
      <MetaHeader title="OPERATIVE PROFILE" onBack={onBack} />

      {/* Identity card */}
      <div className="max-w-4xl mx-auto p-5">
        <div className="ink-border-md shadow-hard-black overflow-hidden bg-[#2C3E50] relative">
          <div className="h-40 relative">
            {banner?.image_url && (
              <img src={banner.image_url} className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/80 to-transparent" />
          </div>
          <div className="absolute bottom-3 left-4 flex items-end gap-3">
            <div className="w-20 h-20 ink-border-md shadow-hard-black-xs bg-[#1A1A1A] overflow-hidden">
              {avatar?.image_url ? (
                <img src={avatar.image_url} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center heading-font text-[#FFD54F] text-3xl">
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
                    maxLength={24}
                    className="px-2 py-1 bg-[#F7F7F7] ink-border-sm font-black heading-font text-sm"
                    autoFocus
                  />
                  <PopButton color="red" onClick={handleRename}>
                    <Check className="w-4 h-4" />
                  </PopButton>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setNameDraft(profile.username);
                    setEditingName(true);
                  }}
                  className="heading-font text-2xl text-[#F7F7F7] flex items-center gap-2 hover:text-[#FFD54F]"
                >
                  {profile.username} <Pencil className="w-4 h-4" />
                </button>
              )}
              <div className="text-[11px] font-bold text-[#FFD54F]">BLUE CORAL OPERATIVE</div>
            </div>
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
              className="bg-[#F7F7F7] ink-border-sm shadow-hard-black-xs px-3 py-2 text-center"
            >
              <div className="heading-font text-2xl">{s.value}</div>
              <div className="text-[9px] font-black text-[#2C3E50]">{s.label}</div>
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
              <h2 className="heading-font text-base mb-2 bg-[#1A1A1A] text-[#FFD54F] inline-block px-2 py-0.5">
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
                        'btn-pop overflow-hidden ink-border-sm shadow-hard-black-xs bg-[#F7F7F7] text-left transition-all w-36',
                        isEquipped && 'outline outline-3 outline-[#E53935] -translate-y-1',
                      )}
                    >
                      <div
                        className={cn(
                          'overflow-hidden bg-[#2C3E50]',
                          item.aspect_ratio === 'landscape'
                            ? 'aspect-[16/9]'
                            : item.aspect_ratio === 'square'
                              ? 'aspect-square'
                              : 'aspect-[3/4]',
                        )}
                      >
                        {item.image_url && (
                          <img
                            src={item.image_url}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        )}
                      </div>
                      <div className="px-2 py-1 flex justify-between items-center gap-1">
                        <span className="text-[9px] font-black truncate">{item.name}</span>
                        {isEquipped && (
                          <span className="text-[8px] font-black bg-[#E53935] text-[#F7F7F7] px-1 shrink-0">
                            ON
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {items.length === 0 && (
                  <div className="text-[11px] font-bold text-[#2C3E50] py-3">
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
