/**
 * Slab detail — what a graded card opens into from the Collection shelf.
 *
 * Until 2026-10 a click on a slab jumped straight to the Grading Lab, which is
 * the place to SUBMIT cards, not to look at one you own. This sheet shows the
 * slab large, everything known about it (grade, service, cert, condition,
 * value) and the things you can do with it: pin it to your profile, stand it
 * up in the 3D Showroom, quicksell it or crack it back into a raw card.
 */
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Pin, PinOff, Hammer, Coins, Box, FlaskConical } from 'lucide-react';
import { useEscapeClose, useFocusTrap } from '../components/useFocusTrap';
import { POOL_BY_ID } from '../game/v3/cardpool';
import { PopButton, Notice, Credits } from './ui';
import { GradedSlab, conditionOf, premiumTier } from './GradedSlab';
import {
  GradedCard,
  GRADING_SERVICE_BY_ID,
  GRADE_WORDS,
  crackGradedSlab,
  fmtGrade,
  gradedQuicksellPrice,
  quicksellGradedCard,
} from './grading';
import { quicksellPrice } from './economy';
import { fetchShowcaseSlabs, setShowcaseSlabs } from '../lib/supabase';

/** Max slabs pinned to a profile — mirror of profiles_showcase_slabs_max3. */
export const MAX_SHOWCASE_SLABS = 3;

const CONDITION_TEXT = [
  'Clean — sharp corners, centred, no visible wear.',
  'Light wear — one soft corner under the glass.',
  'Played — whitened edges, a scuff or two, slight fading.',
  'Damaged — creased, water-stained and yellowed, in a chipped case.',
];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function SlabDetailModal({
  g,
  pinned,
  onClose,
  onChanged,
  onShowroom,
  onGrading,
  readOnly,
}: {
  key?: React.Key;
  /** Someone else's slab (from a profile showcase): details only, no actions. */
  readOnly?: boolean;
  g: GradedCard;
  /** Current showcase_slabs on the profile. */
  pinned: string[];
  onClose: () => void;
  /** Called after any action that changed the slab, the collection or the
   * profile; the caller refetches. */
  onChanged: (gone: boolean) => Promise<void> | void;
  onShowroom?: () => void;
  onGrading?: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>();
  useEscapeClose(onClose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'sell' | 'crack' | null>(null);
  const def = POOL_BY_ID[g.card_id];
  const svc = GRADING_SERVICE_BY_ID[g.service];
  const graded = g.grade != null;
  const isPinned = pinned.includes(g.id);
  const price = graded ? gradedQuicksellPrice(def?.rarity, g.foil, g.grade!, g.service) : 0;
  const raw = quicksellPrice(def?.rarity, g.foil);
  const prem = premiumTier(g.grade);

  const run = async (fn: () => Promise<string | null>, gone: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const err = await fn();
      if (err) setError(err);
      else {
        await onChanged(gone);
        if (gone) onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const togglePin = () =>
    run(
      () =>
        setShowcaseSlabs(
          isPinned
            ? pinned.filter((id) => id !== g.id)
            : [...pinned, g.id].slice(-MAX_SHOWCASE_SLABS),
        ),
      false,
    );

  if (!def) return null;
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-[var(--c-ink)]/85 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`${def.name} slab details`}
        className="relative bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-black-sm w-full max-w-3xl p-4 flex flex-col sm:flex-row gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 btn-pop p-1 ink-border-sm bg-[var(--c-paper)]"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>

        <div className="flex justify-center shrink-0">
          <GradedSlab g={g} size="standard" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div>
            <div className="heading-font text-lg leading-tight pr-8">{def.name}</div>
            <div className="text-[11px] font-bold text-[var(--c-steel)]">
              {def.rarity}
              {g.foil ? ' · FOIL ✦' : ''} · {def.set ?? 'FRYCARDS'}
            </div>
          </div>

          {graded ? (
            <div className="flex items-center gap-3">
              <span className="heading-font text-4xl leading-none">{fmtGrade(g.grade!)}</span>
              <span className="heading-font text-sm">
                {GRADE_WORDS[String(g.grade)] ?? 'GRADED'}
                {prem && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 ink-border-sm bg-[var(--c-yellow)]">
                    {prem === 'gem' ? 'GEM CASE' : prem === 'mintplus' ? 'PRISM CASE' : 'HOLO CASE'}
                  </span>
                )}
              </span>
            </div>
          ) : (
            <div className="heading-font text-sm">AT THE GRADERS — ready {fmtDate(g.ready_at)}</div>
          )}

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] font-bold">
            <dt className="text-[var(--c-steel)]">Service</dt>
            <dd>
              {svc.name} (resale ×{svc.premium})
            </dd>
            <dt className="text-[var(--c-steel)]">Turnaround</dt>
            <dd className="uppercase">{g.speed}</dd>
            <dt className="text-[var(--c-steel)]">Fee (credit value)</dt>
            <dd>
              <Credits amount={g.fee_paid} />
            </dd>
            <dt className="text-[var(--c-steel)]">Submitted</dt>
            <dd>{fmtDate(g.submitted_at)}</dd>
            {graded && (
              <>
                <dt className="text-[var(--c-steel)]">Revealed</dt>
                <dd>{fmtDate(g.revealed_at)}</dd>
                <dt className="text-[var(--c-steel)]">Condition</dt>
                <dd>{CONDITION_TEXT[conditionOf(g.grade)]}</dd>
                <dt className="text-[var(--c-steel)]">Slab value</dt>
                <dd>
                  <Credits amount={price} />{' '}
                  <span className="text-[var(--c-steel)]">
                    (raw copy {raw.toLocaleString('en-US')} · ×
                    {(price / Math.max(1, raw)).toFixed(1)})
                  </span>
                </dd>
                <dt className="text-[var(--c-steel)]">Profit vs fee</dt>
                <dd className={price - raw - g.fee_paid >= 0 ? 'text-green-700' : 'text-red-700'}>
                  {price - raw - g.fee_paid >= 0 ? '+' : ''}
                  {(price - raw - g.fee_paid).toLocaleString('en-US')}
                </dd>
              </>
            )}
          </dl>

          {error && <Notice text={error} />}

          {graded && !readOnly && (
            // CANCEL renders in the spot QUICKSELL / CRACK occupied and the
            // CONFIRM button appears after it, so a double-tap cancels.
            <div className="flex flex-wrap gap-2">
              <PopButton
                color={isPinned ? 'steel' : 'yellow'}
                onClick={() => void togglePin()}
                disabled={busy}
                title={
                  !isPinned && pinned.length >= MAX_SHOWCASE_SLABS
                    ? `Your ${MAX_SHOWCASE_SLABS} slots are full — pinning replaces the oldest`
                    : undefined
                }
              >
                <span className="flex items-center gap-1">
                  {isPinned ? (
                    <PinOff className="w-3 h-3" aria-hidden />
                  ) : (
                    <Pin className="w-3 h-3" aria-hidden />
                  )}
                  {isPinned
                    ? 'UNPIN FROM PROFILE'
                    : pinned.length >= MAX_SHOWCASE_SLABS
                      ? 'SHOWCASE (REPLACES OLDEST)'
                      : `SHOWCASE (${pinned.length}/${MAX_SHOWCASE_SLABS})`}
                </span>
              </PopButton>
              {onShowroom && (
                <PopButton color="steel" onClick={onShowroom} disabled={busy}>
                  <span className="flex items-center gap-1">
                    <Box className="w-3 h-3" aria-hidden /> VIEW IN 3D
                  </span>
                </PopButton>
              )}
              {confirm === 'sell' ? (
                <PopButton color="steel" disabled={busy} onClick={() => setConfirm(null)}>
                  CANCEL
                </PopButton>
              ) : (
                <PopButton color="yellow" disabled={busy} onClick={() => setConfirm('sell')}>
                  <span className="flex items-center gap-1">
                    <Coins className="w-3 h-3" aria-hidden /> QUICKSELL
                  </span>
                </PopButton>
              )}
              {confirm === 'sell' ? (
                <PopButton
                  color="red"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => (await quicksellGradedCard(g.id)).error, true)
                  }
                >
                  CONFIRM SELL FOR {price.toLocaleString('en-US')}
                </PopButton>
              ) : null}
              {confirm === 'crack' ? (
                <PopButton color="steel" disabled={busy} onClick={() => setConfirm(null)}>
                  CANCEL
                </PopButton>
              ) : (
                <PopButton color="steel" disabled={busy} onClick={() => setConfirm('crack')}>
                  <span className="flex items-center gap-1">
                    <Hammer className="w-3 h-3" aria-hidden /> CRACK SLAB
                  </span>
                </PopButton>
              )}
              {confirm === 'crack' ? (
                <PopButton
                  color="red"
                  disabled={busy}
                  onClick={() => void run(() => crackGradedSlab(g.id), true)}
                >
                  CONFIRM — GRADE IS LOST, RAW {g.foil ? 'FOIL ' : ''}COPY RETURNS
                </PopButton>
              ) : null}
            </div>
          )}
          {onGrading && !readOnly && (
            <button
              type="button"
              onClick={onGrading}
              className="self-start text-[10px] font-bold underline flex items-center gap-1"
            >
              <FlaskConical className="w-3 h-3" aria-hidden /> Open the Grading Lab
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * The "graded showcase" strip on a profile — up to three pinned slabs, read
 * through get_showcase_slabs so it works for other players' profiles too
 * (graded_cards itself is owner-only).
 */
export function ShowcaseSlabsRow({
  userId,
  refreshKey,
  emptyText,
  heading,
}: {
  userId: string;
  /** Printed above the row only when there is something to show. */
  heading?: string;
  /** Change to refetch (e.g. the viewer's own showcase_slabs array). */
  refreshKey?: string;
  emptyText?: string;
}) {
  const [slabs, setSlabs] = useState<GradedCard[] | null>(null);
  const [open, setOpen] = useState<GradedCard | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void fetchShowcaseSlabs(userId).then((rows) => {
      if (!cancelled) setSlabs(rows as GradedCard[]);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);
  if (slabs == null) return null;
  if (slabs.length === 0)
    return emptyText ? (
      <p className="text-[11px] font-bold text-[var(--c-steel)]">{emptyText}</p>
    ) : null;
  return (
    <div>
      {heading && (
        <h2 className="heading-font text-sm mb-2 bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5">
          {heading}
        </h2>
      )}
      <div className="flex flex-wrap gap-3">
        {slabs.map((g) => (
          <GradedSlab key={g.id} g={g} size="compact" onClick={() => setOpen(g)} />
        ))}
      </div>
      {open && (
        <SlabDetailModal
          g={open}
          pinned={[]}
          readOnly
          onClose={() => setOpen(null)}
          onChanged={() => {}}
        />
      )}
    </div>
  );
}
