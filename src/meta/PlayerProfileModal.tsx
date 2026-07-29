import React, { useEffect, useRef, useState } from 'react';
import { useMeta } from './MetaContext';
import { fetchPlayerProfileCard, PlayerProfileCard, PlayerRole } from '../lib/supabase';
import { RoleBadge } from './RoleBadge';
import { PopButton } from './ui';
import { SafeImage } from './SafeImage';
import { CardFace } from '../components/CardFaceV4';
import { POOL_BY_ID } from '../game/v3/cardpool';
import { cn } from '../lib/utils';

/** Renders a username as a click-to-view-profile link — the shared control
 * used everywhere a player's name is shown (leaderboards, friends, trades,
 * marketplace listings) instead of plain text. */
export function PlayerLink({
  id,
  name,
  role,
  className,
}: {
  id: string;
  name: string;
  /** When known, renders the player's role badge right after the name. */
  role?: PlayerRole | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn('hover:text-[var(--c-red)] hover:underline transition-colors', className)}
      >
        {name}
        <RoleBadge role={role} />
      </button>
      {open && <PlayerProfileModal userId={id} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Read-only profile card for viewing any other player — banner/avatar
 * identity, stats strip, and their pinned showcase cards. Used by clicking
 * any username in the app. */
export function PlayerProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { session, shopItems } = useMeta();
  const [card, setCard] = useState<PlayerProfileCard | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const isSelf = session?.user?.id === userId;
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog on open (it previously stayed wherever it was
  // on the trigger button behind the overlay, so keyboard/screen-reader users
  // landed nowhere near the modal that just appeared) and restore it to
  // whatever triggered the modal once it closes.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCard(undefined);
    fetchPlayerProfileCard(userId).then(
      (c) => {
        if (!cancelled) setCard(c);
      },
      () => {
        if (!cancelled) setCard(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const banner = card ? shopItems.find((s) => s.id === card.equipped_banner) : undefined;
  const avatar = card ? shopItems.find((s) => s.id === card.equipped_avatar) : undefined;
  const winRate =
    card && card.games_played > 0 ? Math.round((card.wins / card.games_played) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--c-ink)]/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-yellow max-w-lg w-full max-h-[90vh] overflow-y-auto outline-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={card ? `${card.username}'s profile` : 'Player profile'}
        tabIndex={-1}
      >
        {card === undefined ? (
          <div className="p-8 text-center text-[11px] font-bold text-[var(--c-steel)] animate-pulse">
            Loading profile…
          </div>
        ) : card === null ? (
          <div className="p-8 text-center">
            <p className="text-[11px] font-bold text-[var(--c-steel)] mb-4">
              Couldn't load this player's profile.
            </p>
            <div className="flex gap-2 justify-center">
              <PopButton color="red" onClick={() => setAttempt((n) => n + 1)}>
                RETRY
              </PopButton>
              <PopButton color="yellow" onClick={onClose}>
                CLOSE
              </PopButton>
            </div>
          </div>
        ) : (
          <>
            <div className="ink-border-md shadow-hard-black-xs overflow-hidden bg-[var(--c-steel)] relative">
              <div className="h-28 relative">
                <SafeImage
                  src={banner?.image_url}
                  alt={`${card.username}'s banner`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--c-ink)]/80 to-transparent" />
              </div>
              <div className="absolute bottom-3 left-4 right-3 flex items-end gap-3">
                <div className="w-16 h-16 shrink-0 ink-border-md shadow-hard-black-xs bg-[var(--c-ink)] overflow-hidden">
                  {avatar?.image_url ? (
                    <SafeImage
                      src={avatar.image_url}
                      alt={`${card.username}'s avatar`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center heading-font text-[var(--c-yellow)] text-2xl">
                      {(card.username || '?')[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="pb-1 min-w-0">
                  <div className="heading-font text-xl text-[var(--c-paper)] truncate">
                    {card.username}
                    <RoleBadge role={card.role} />
                    {isSelf && (
                      <span className="text-[9px] font-bold text-[var(--c-yellow)] ml-2">
                        (YOU)
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-bold text-[var(--c-yellow)]">
                    LEVEL {card.level}
                  </div>
                </div>
              </div>
              <PopButton
                color="yellow"
                onClick={onClose}
                className="absolute top-2 right-2"
                title="Close profile"
                ariaLabel="Close profile"
              >
                ✕
              </PopButton>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                {[
                  { label: 'MATCHES', value: card.games_played },
                  { label: 'WINS', value: card.wins },
                  { label: 'LOSSES', value: card.losses },
                  { label: 'WIN RATE', value: `${winRate}%` },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="bg-[var(--c-paper)] ink-border-sm shadow-hard-black-xs px-2 py-1.5 text-center"
                  >
                    <div className="heading-font text-lg">{s.value}</div>
                    <div className="text-[8px] font-black text-[var(--c-steel)]">{s.label}</div>
                  </div>
                ))}
              </div>

              <h2 className="heading-font text-sm mb-2 bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5">
                SHOWCASE
              </h2>
              {(card.showcase_cards || []).length === 0 ? (
                <p className="text-[11px] font-bold text-[var(--c-steel)] py-3">
                  {isSelf
                    ? "You haven't pinned any showcase cards yet — do it from the Collection screen."
                    : `${card.username} hasn't pinned any showcase cards yet.`}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(card.showcase_cards || []).map((id) => {
                    const def = POOL_BY_ID[id];
                    if (!def) return null;
                    return <CardFace key={id} def={def} size="compact" />;
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
