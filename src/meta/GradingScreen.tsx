/**
 * The Grading Lab.
 *
 * v25 shipped the mini-game: three services, three turnarounds, a server-side
 * roll, a vault. What it shipped it as was a form — three service buttons,
 * three speed buttons, a wall of every spare card in the collection, and a fee.
 * Three things were missing, and all three are the same thing: the screen never
 * told the player what they were buying.
 *
 *  - **The odds were secret.** Three services, three fees, three premiums, and
 *    no way to learn that they all roll the SAME table (TCA does not grade
 *    higher, it resells higher; Keeper nudges the roll). This game publishes
 *    pack odds; a grading screen that hides its own is asking for a blind bet.
 *  - **The decision had no maths.** "Is 400 credits worth it on THIS card?" is
 *    a question with an exact answer — expected slab value against the fee —
 *    and the player was left to do it by hand across eleven grade tiers.
 *  - **The flow had no shape.** Pick cards / pick a service / pick a speed and
 *    pay are three ordered steps; they were three unlabelled rows, with the
 *    submit control buried inside a basket panel that only existed once
 *    something was already in it.
 *
 * So: numbered steps, a published odds table (per service, with Keeper's bump
 * folded in), an expected-return line on every service card and on the
 * submission itself, a sticky pay bar that is always visible once the basket
 * has anything in it, vouchers as a payment method (v26, at the game's
 * standing 100:1 rate), a limbo tab that shows progress rather than a bare
 * countdown, and a vault that totals the portfolio and can sort it.
 *
 * The slab artwork lives in `GradedSlab.tsx`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Award, Coins, Hammer, Package, Percent, Search, Sparkles, Ticket, X } from 'lucide-react';
import { useMeta } from './MetaContext';
import { MetaHeader, PopButton, Notice, Credits, Vouchers, ProgressBar } from './ui';
import { cn } from '../lib/utils';
import { CardFace } from '../components/CardFaceV4';
import { POOL_BY_ID } from '../game/v3/cardpool';
import { spareSplit } from './CollectionScreen';
import { fmtCredits, fmtVouchers } from './economy';
import { GradedSlab, SLAB_CSS } from './GradedSlab';
import type { ShowroomSubject } from './ShowroomScreen';
import {
  GradedCard,
  GradingCurrency,
  GradingService,
  GradingSpeed,
  GRADING_SERVICES,
  GRADING_SERVICE_BY_ID,
  GRADING_SPEEDS,
  GRADE_WORDS,
  fmtGrade,
  gradingUnitFee,
  gradingBulkMult,
  gradingVoucherFee,
  gradedQuicksellPrice,
  expectedSlabValue,
  expectedGradeMultiplier,
  gradeOddsFor,
  chanceOfAtLeast,
  fetchGradedCards,
  submitGrading,
  revealGradedCards,
  quicksellGradedCard,
  crackGradedSlab,
} from './grading';

type Tab = 'submit' | 'limbo' | 'vault';
type VaultSort = 'grade' | 'value' | 'newest';

function countdown(readyAt: string, now: number): string {
  const ms = new Date(readyAt).getTime() - now;
  if (ms <= 0) return 'READY';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** 0…1 through the turnaround. An instant submission has zero duration, so it
 * is complete by definition rather than a division by zero. */
function turnaroundProgress(g: GradedCard, now: number): number {
  const start = new Date(g.submitted_at).getTime();
  const end = new Date(g.ready_at).getTime();
  if (!(end > start)) return 1;
  return Math.max(0, Math.min(1, (now - start) / (end - start)));
}

/** Section heading: "1 · PICK THE CARDS". */
function Step({ n, title, hint }: { n: number; title: string; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 mb-2 mt-5 first:mt-0">
      <span className="heading-font text-[11px] bg-[var(--c-ink)] text-[var(--c-yellow)] px-2 py-0.5 ink-border-sm">
        {n}
      </span>
      <h2 className="heading-font text-sm">{title}</h2>
      {hint && <span className="text-[10px] font-bold text-[var(--c-steel)]">{hint}</span>}
    </div>
  );
}

export function GradingScreen({
  onBack,
  onShowroom,
}: {
  onBack: () => void;
  /** Stand this slab up in the 3D Showroom — the only place the case can be
   * looked at from any angle other than dead-on. */
  onShowroom?: (subject: ShowroomSubject) => void;
}) {
  const {
    profile,
    collection,
    decks,
    serializedCards,
    refreshProfile,
    refreshCollection,
    dataLoading,
  } = useMeta();
  const [tab, setTab] = useState<Tab>('submit');
  const [graded, setGraded] = useState<GradedCard[]>([]);
  const [gradedLoading, setGradedLoading] = useState(true);

  // Submission form state.
  const [service, setService] = useState<GradingService>('keeper');
  const [speed, setSpeed] = useState<GradingSpeed>('standard');
  const [currency, setCurrency] = useState<GradingCurrency>('credits');
  const [basket, setBasket] = useState<Map<string, number>>(new Map()); // `${cardId}|${foil}` -> qty
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [oddsOpen, setOddsOpen] = useState(false);

  // Reveal ceremony + per-slab action state.
  const [ceremony, setCeremony] = useState<
    { id: string; card_id: string; foil: boolean; service: GradingService; grade: number }[] | null
  >(null);
  const [slabBusy, setSlabBusy] = useState<string | null>(null);
  const [crackConfirm, setCrackConfirm] = useState<string | null>(null);
  const [vaultSort, setVaultSort] = useState<VaultSort>('grade');

  const userId = profile?.id;
  const reload = React.useCallback(async () => {
    if (!userId) return;
    const rows = await fetchGradedCards(userId);
    setGraded(rows);
    setGradedLoading(false);
  }, [userId]);

  // Initial load — subscription-style so a mid-flight unmount can't set state.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchGradedCards(userId).then((rows) => {
      if (cancelled) return;
      setGraded(rows);
      setGradedLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 1s tick drives the limbo countdowns — only while something is pending.
  const pending = useMemo(() => graded.filter((g) => g.grade == null), [graded]);
  const vault = useMemo(() => graded.filter((g) => g.grade != null), [graded]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (pending.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pending.length]);
  const dueCount = pending.filter((g) => new Date(g.ready_at).getTime() <= now).length;

  // Spare copies available to grade — same reservation model as quicksell
  // (deck locks sum across decks; Serialized reserves come out of normals).
  const spares = useMemo(() => {
    const owned = new Map<string, { q: number; f: number }>();
    for (const pc of collection) owned.set(pc.card_id, { q: pc.quantity, f: pc.foil_quantity });
    const locked = new Map<string, number>();
    for (const d of decks) {
      for (const id of d.card_ids) locked.set(id, (locked.get(id) || 0) + 1);
      locked.set(d.leader_id, (locked.get(d.leader_id) || 0) + 1);
    }
    const serialized = new Map<string, number>();
    for (const s of serializedCards)
      serialized.set(s.card_id, (serialized.get(s.card_id) || 0) + 1);
    const out: { cardId: string; foil: boolean; spare: number }[] = [];
    for (const [cardId, o] of owned) {
      if (!POOL_BY_ID[cardId]) continue;
      const { normal, foil } = spareSplit(o, locked.get(cardId) || 0);
      const spareNormal = Math.max(0, normal - (serialized.get(cardId) || 0));
      if (spareNormal > 0) out.push({ cardId, foil: false, spare: spareNormal });
      if (foil > 0) out.push({ cardId, foil: true, spare: foil });
    }
    // Most valuable first: grading a Common is a hobby, grading a Mythic is the
    // mini-game, and the old alphabetical sort buried every card worth the fee
    // behind three hundred that are not.
    out.sort(
      (a, b) =>
        expectedSlabValue(POOL_BY_ID[b.cardId].rarity, b.foil, service) -
          expectedSlabValue(POOL_BY_ID[a.cardId].rarity, a.foil, service) ||
        POOL_BY_ID[a.cardId].name.localeCompare(POOL_BY_ID[b.cardId].name),
    );
    return out;
  }, [collection, decks, serializedCards, service]);

  const filteredSpares = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return spares;
    return spares.filter(
      (s) =>
        POOL_BY_ID[s.cardId].name.toLowerCase().includes(q) ||
        (POOL_BY_ID[s.cardId].rarity ?? '').toLowerCase().includes(q),
    );
  }, [spares, search]);

  const basketCount = useMemo(
    () => [...basket.values()].reduce((a: number, b: number) => a + b, 0),
    [basket],
  );
  const unitFee = gradingUnitFee(service, speed, basketCount);
  const totalFee = unitFee * basketCount;
  const voucherFee = gradingVoucherFee(totalFee);
  const charged = currency === 'vouchers' ? voucherFee : totalFee;
  const balance = currency === 'vouchers' ? (profile?.vouchers ?? 0) : (profile?.credits ?? 0);
  const bulkOff = Math.round((1 - gradingBulkMult(service, basketCount)) * 100);

  /** What the basket is expected to be worth encased, at this service. */
  const basketExpected = useMemo(() => {
    let sum = 0;
    for (const [key, qty] of basket) {
      const [cardId, foilStr] = key.split('|');
      const def = POOL_BY_ID[cardId];
      if (!def) continue;
      sum += expectedSlabValue(def.rarity, foilStr === 'true', service) * qty;
    }
    return sum;
  }, [basket, service]);

  const vaultValue = useMemo(
    () =>
      vault.reduce((sum, g) => {
        const def = POOL_BY_ID[g.card_id];
        return sum + (def ? gradedQuicksellPrice(def.rarity, g.foil, g.grade!, g.service) : 0);
      }, 0),
    [vault],
  );

  const sortedVault = useMemo(() => {
    const value = (g: GradedCard) => {
      const def = POOL_BY_ID[g.card_id];
      return def ? gradedQuicksellPrice(def.rarity, g.foil, g.grade!, g.service) : 0;
    };
    const rows = [...vault];
    if (vaultSort === 'grade')
      rows.sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0) || value(b) - value(a));
    else if (vaultSort === 'value') rows.sort((a, b) => value(b) - value(a));
    else
      rows.sort(
        (a, b) =>
          new Date(b.revealed_at ?? b.submitted_at).getTime() -
          new Date(a.revealed_at ?? a.submitted_at).getTime(),
      );
    return rows;
  }, [vault, vaultSort]);

  const bump = (cardId: string, foil: boolean, delta: number, max: number) => {
    setBasket((prev) => {
      const key = `${cardId}|${foil}`;
      const next = new Map<string, number>(prev);
      const q = Math.min(max, Math.max(0, (next.get(key) || 0) + delta));
      if (q === 0) next.delete(key);
      else next.set(key, q);
      return next;
    });
  };

  const submit = async () => {
    if (busy || basketCount === 0 || !profile) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const items = [...basket.entries()].map(([key, qty]) => {
        const [card_id, foil] = key.split('|');
        return { card_id, qty, foil: foil === 'true' };
      });
      const { data, error } = await submitGrading(items, service, speed, currency);
      if (error || !data) {
        setError(error || 'Something went wrong — check your connection and try again.');
        return;
      }
      setBasket(new Map());
      const paid =
        data.currency === 'vouchers'
          ? `${fmtVouchers(data.charged)} voucher${data.charged === 1 ? '' : 's'}`
          : `${fmtCredits(data.charged)} credits`;
      setNotice(
        speed === 'instant'
          ? `Submitted ${items.reduce((a, i) => a + i.qty, 0)} card(s) for ${paid} — instant service: your grades are ready to reveal!`
          : `Submitted for ${paid} — your cards are with the graders now.`,
      );
      await Promise.all([refreshProfile(), refreshCollection(), reload()]);
      setTab('limbo');
    } finally {
      setBusy(false);
    }
  };

  const reveal = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { revealed, error } = await revealGradedCards();
      if (error) {
        setError(error);
        return;
      }
      if (revealed.length > 0) {
        setCeremony(revealed);
        setNotice('');
      } else {
        // The server disagreed that anything was due — a clock skew between
        // this browser and the database, which the countdown alone would leave
        // the player staring at.
        setNotice('Nothing is finished yet — the graders are still working. Try again shortly.');
      }
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const sellSlab = async (g: GradedCard) => {
    if (slabBusy) return;
    setSlabBusy(g.id);
    setError('');
    try {
      const { data, error } = await quicksellGradedCard(g.id);
      if (error || !data) {
        setError(error || 'Something went wrong — check your connection and try again.');
        return;
      }
      setNotice(`Sold for ${fmtCredits(data.price)}.`);
      await Promise.all([refreshProfile(), reload()]);
    } finally {
      setSlabBusy(null);
    }
  };

  const crackSlab = async (g: GradedCard) => {
    if (slabBusy) return;
    setSlabBusy(g.id);
    setError('');
    try {
      const err = await crackGradedSlab(g.id);
      if (err) {
        setError(err);
        // Leave the confirm open: the action did not happen, and closing it
        // would present a failure as a completed crack.
        return;
      }
      setNotice('Case cracked — the raw card is back in your collection.');
      setCrackConfirm(null);
      await Promise.all([refreshCollection(), reload()]);
    } finally {
      setSlabBusy(null);
    }
  };

  if (!profile) {
    return (
      <div className="w-full min-h-screen bg-[var(--c-paper)]">
        <MetaHeader title="GRADING LAB" onBack={onBack} />
        <div className="p-6">
          <Notice text="Sign in to submit cards for grading." />
        </div>
      </div>
    );
  }

  const tabBtn = (t: Tab, label: React.ReactNode) => (
    <PopButton
      color={tab === t ? 'black' : 'yellow'}
      onClick={() => setTab(t)}
      ariaPressed={tab === t}
    >
      {label}
    </PopButton>
  );

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <style>{SLAB_CSS}</style>
      <MetaHeader title="GRADING LAB" onBack={onBack} />
      <div className="max-w-5xl mx-auto p-4 sm:p-6 pb-40">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {tabBtn('submit', 'SUBMIT CARDS')}
          {tabBtn(
            'limbo',
            <>
              AT THE GRADERS ({pending.length}){dueCount > 0 ? ' · READY!' : ''}
            </>,
          )}
          {tabBtn('vault', `MY SLABS (${vault.length})`)}
          <PopButton
            color="steel"
            onClick={() => setOddsOpen(true)}
            title="Every grade and its odds"
          >
            <span className="flex items-center gap-1">
              <Percent className="w-3 h-3" aria-hidden /> ODDS
            </span>
          </PopButton>
        </div>

        <div className="flex flex-col gap-2 mb-3" aria-live="polite">
          {error && <Notice text={error} />}
          {notice && !error && <Notice text={notice} kind="success" />}
        </div>

        {tab === 'submit' && (
          <>
            <Step
              n={1}
              title="PICK THE CARDS"
              hint="Tap to add. Deck-locked and Serialized copies can't be graded."
            />
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="flex items-center gap-1.5">
                <Search className="w-4 h-4 text-[var(--c-steel)]" aria-hidden />
                <input
                  className="ink-border-sm bg-[var(--c-paper)] px-2 py-1.5 text-xs font-bold w-56 placeholder:text-[var(--c-steel)]/50"
                  placeholder="Search name or rarity…"
                  aria-label="Search your spare cards"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </span>
              {basketCount > 0 && (
                <PopButton
                  color="steel"
                  className="!px-2 !py-1 !text-[10px]"
                  onClick={() => setBasket(new Map())}
                >
                  ✕ EMPTY THE TRAY ({basketCount})
                </PopButton>
              )}
              <span className="text-[10px] font-bold text-[var(--c-steel)]">
                Sorted by what the slab is worth at {GRADING_SERVICE_BY_ID[service].short}.
              </span>
            </div>
            {dataLoading ? (
              <p className="text-xs font-bold text-[var(--c-steel)]">Loading your collection…</p>
            ) : filteredSpares.length === 0 ? (
              <p className="text-xs font-bold text-[var(--c-steel)]">
                {spares.length === 0
                  ? 'No spare copies to grade — open packs or free up copies from your decks first.'
                  : 'No spare cards match that search.'}
              </p>
            ) : (
              // Bounded, and scrolling on its own: a collection with three
              // hundred spare lines otherwise pushed steps 2-4 — the service,
              // the turnaround, the payment method — below a screen and a half
              // of cards, so the first thing the flow asks you to choose was
              // the last thing you could reach.
              <div className="flex flex-wrap gap-2 max-h-[46vh] overflow-y-auto ink-border-sm p-2 bg-[var(--c-ink)]/5">
                {filteredSpares.slice(0, 240).map((s) => {
                  const key = `${s.cardId}|${s.foil}`;
                  const inBasket = basket.get(key) || 0;
                  const def = POOL_BY_ID[s.cardId];
                  return (
                    <div key={key} className="flex flex-col gap-1 w-fit">
                      <CardFace
                        def={def}
                        size="compact"
                        foil={s.foil}
                        onClick={() => bump(s.cardId, s.foil, +1, s.spare)}
                        highlight={inBasket > 0}
                        badge={
                          inBasket > 0
                            ? `IN TRAY ×${inBasket}`
                            : `${s.spare} SPARE${s.foil ? ' FOIL' : ''}`
                        }
                      />
                      <span className="text-[9px] font-bold text-[var(--c-steel)] text-center leading-none">
                        slab ≈ {fmtCredits(expectedSlabValue(def.rarity, s.foil, service))}
                      </span>
                      {inBasket > 0 && (
                        <div className="flex items-center justify-center gap-1">
                          <PopButton
                            color="steel"
                            className="!px-1.5 !py-0.5 !text-[10px]"
                            onClick={() => bump(s.cardId, s.foil, -1, s.spare)}
                            ariaLabel={`Remove one ${def.name}`}
                          >
                            −
                          </PopButton>
                          <span className="heading-font text-[10px] w-6 text-center">
                            {inBasket}/{s.spare}
                          </span>
                          <PopButton
                            color="steel"
                            className="!px-1.5 !py-0.5 !text-[10px]"
                            onClick={() => bump(s.cardId, s.foil, s.spare, s.spare)}
                            ariaLabel={`Add every spare ${def.name}`}
                            disabled={inBasket >= s.spare}
                          >
                            ALL
                          </PopButton>
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredSpares.length > 240 && (
                  <p className="w-full text-[10px] font-bold text-[var(--c-steel)]">
                    Showing the 240 most valuable of {filteredSpares.length} spare lines — search to
                    narrow.
                  </p>
                )}
              </div>
            )}

            <Step
              n={2}
              title="PICK A SERVICE"
              hint="All three roll the same grade table — the fee buys resale premium, not a better grade."
            />
            <div className="grid sm:grid-cols-3 gap-3">
              {GRADING_SERVICES.map((s) => {
                const evMult = expectedGradeMultiplier(s.id) * s.premium;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setService(s.id)}
                    aria-pressed={service === s.id}
                    className={cn(
                      'btn-pop text-left p-3 ink-border-md shadow-hard-black-sm bg-[var(--c-paper)]',
                      service === s.id && 'ring-4 ring-[var(--c-yellow)]',
                    )}
                  >
                    <div
                      className="heading-font text-[10px] px-1.5 py-0.5 mb-1.5 inline-block ink-border-sm"
                      style={{ background: s.slab.label, color: s.slab.labelText }}
                    >
                      {s.short}
                    </div>
                    <div className="heading-font text-sm leading-tight">{s.name}</div>
                    <div className="text-[10px] font-bold text-[var(--c-steel)] mt-1">
                      {s.blurb}
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-bold">
                      <dt className="text-[var(--c-steel)]">Fee / card</dt>
                      <dd className="text-right">
                        <Credits amount={s.baseFee} />
                      </dd>
                      <dt className="text-[var(--c-steel)]">Resale premium</dt>
                      <dd className="text-right">×{s.premium}</dd>
                      <dt className="text-[var(--c-steel)]">Avg return</dt>
                      <dd className="text-right">×{evMult.toFixed(2)} raw</dd>
                      <dt className="text-[var(--c-steel)]">Chance of 9+</dt>
                      <dd className="text-right">{Math.round(chanceOfAtLeast(s.id, 9) * 100)}%</dd>
                    </dl>
                  </button>
                );
              })}
            </div>

            <Step n={3} title="TURNAROUND" hint="Rush and instant multiply the fee." />
            <div className="flex flex-wrap gap-2">
              {GRADING_SPEEDS.map((sp) => (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => setSpeed(sp.id)}
                  aria-pressed={speed === sp.id}
                  className={cn(
                    'btn-pop heading-font text-[11px] px-3 py-2 ink-border-sm shadow-hard-black-xs bg-[var(--c-paper)]',
                    speed === sp.id && 'bg-[var(--c-yellow)]',
                  )}
                  title={sp.blurb}
                >
                  {sp.name} · {fmtCredits(gradingUnitFee(service, sp.id, Math.max(1, basketCount)))}
                  /card
                </button>
              ))}
            </div>

            <Step
              n={4}
              title="PAY WITH"
              hint={`${100} credits = 1 voucher, the same rate as the pack shelf.`}
            />
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['credits', 'CREDITS', profile.credits, totalFee],
                  ['vouchers', 'VOUCHERS', profile.vouchers, voucherFee],
                ] as const
              ).map(([id, label, have, cost]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCurrency(id)}
                  aria-pressed={currency === id}
                  className={cn(
                    'btn-pop heading-font text-[11px] px-3 py-2 ink-border-sm shadow-hard-black-xs bg-[var(--c-paper)] flex items-center gap-1.5',
                    currency === id && 'bg-[var(--c-yellow)]',
                  )}
                >
                  {id === 'credits' ? (
                    <Coins className="w-3.5 h-3.5" aria-hidden />
                  ) : (
                    <Ticket className="w-3.5 h-3.5" aria-hidden />
                  )}
                  {label}
                  <span className="text-[9px] font-bold opacity-70">
                    {basketCount > 0 ? `${cost.toLocaleString('en-US')} of ` : ''}
                    {have.toLocaleString('en-US')}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'limbo' && (
          <>
            {pending.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <PopButton color="red" onClick={() => void reveal()} disabled={busy}>
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden />
                    {busy
                      ? 'REVEALING…'
                      : dueCount > 0
                        ? `REVEAL ${dueCount} GRADE${dueCount === 1 ? '' : 'S'}`
                        : 'CHECK FOR RESULTS'}
                  </span>
                </PopButton>
                <span className="text-[10px] font-bold text-[var(--c-steel)]">
                  Grades are rolled by the graders at reveal time — nothing is decided until you
                  open the case.
                </span>
              </div>
            )}
            {gradedLoading ? (
              <p className="text-xs font-bold text-[var(--c-steel)]">Loading…</p>
            ) : pending.length === 0 ? (
              <p className="text-xs font-bold text-[var(--c-steel)]">
                Nothing at the graders. Submit some cards!
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {pending.map((g) => {
                  const remain = countdown(g.ready_at, now);
                  const pct = turnaroundProgress(g, now);
                  return (
                    <div key={g.id} className="flex flex-col gap-1 w-fit">
                      <GradedSlab g={g} size="standard" progress={pct} />
                      <ProgressBar
                        value={Math.round(pct * 100)}
                        max={100}
                        className="h-1.5"
                        ariaLabel={`Grading progress for ${POOL_BY_ID[g.card_id]?.name ?? 'card'}`}
                      />
                      <span
                        className={cn(
                          'heading-font text-[10px] text-center px-1 py-0.5 ink-border-sm',
                          remain === 'READY'
                            ? 'bg-[var(--c-yellow)]'
                            : 'bg-[var(--c-ink)] text-[var(--c-paper)]',
                        )}
                      >
                        {remain === 'READY' ? 'READY TO REVEAL' : remain}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'vault' && (
          <>
            {gradedLoading ? (
              <p className="text-xs font-bold text-[var(--c-steel)]">Loading…</p>
            ) : vault.length === 0 ? (
              <p className="text-xs font-bold text-[var(--c-steel)]">
                No graded slabs yet — reveal some grades first.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="heading-font text-xs bg-[var(--c-ink)] text-[var(--c-yellow)] px-2 py-1 ink-border-sm">
                    PORTFOLIO: {fmtCredits(vaultValue)} ACROSS {vault.length} SLAB
                    {vault.length === 1 ? '' : 'S'}
                  </span>
                  {(
                    [
                      ['grade', 'BY GRADE'],
                      ['value', 'BY VALUE'],
                      ['newest', 'NEWEST'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setVaultSort(id)}
                      aria-pressed={vaultSort === id}
                      className={cn(
                        'btn-pop heading-font text-[10px] px-2 py-1 ink-border-sm bg-[var(--c-paper)]',
                        vaultSort === id && 'bg-[var(--c-yellow)]',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  {sortedVault.map((g) => {
                    const def = POOL_BY_ID[g.card_id];
                    if (!def) return null;
                    const price = gradedQuicksellPrice(def.rarity, g.foil, g.grade!, g.service);
                    return (
                      <div key={g.id} className="flex flex-col gap-1.5 w-fit">
                        <GradedSlab g={g} size="standard" />
                        {onShowroom && (
                          <PopButton
                            color="black"
                            className="!px-2 !py-1 !text-[10px]"
                            ariaLabel={`View ${def.name}'s slab in the 3D Showroom`}
                            onClick={() => onShowroom({ kind: 'slab', gradedId: g.id })}
                          >
                            ⬛ VIEW IN 3D
                          </PopButton>
                        )}
                        <PopButton
                          color="yellow"
                          className="!px-2 !py-1 !text-[10px]"
                          onClick={() => void sellSlab(g)}
                          disabled={slabBusy === g.id}
                        >
                          {slabBusy === g.id ? (
                            'SELLING…'
                          ) : (
                            <span className="flex items-center gap-1">
                              SELL <Credits amount={price} />
                            </span>
                          )}
                        </PopButton>
                        {crackConfirm === g.id ? (
                          <div className="flex gap-1">
                            <PopButton
                              color="red"
                              className="!px-2 !py-1 !text-[10px]"
                              onClick={() => void crackSlab(g)}
                              disabled={slabBusy === g.id}
                            >
                              CRACK IT
                            </PopButton>
                            <PopButton
                              color="steel"
                              className="!px-2 !py-1 !text-[10px]"
                              onClick={() => setCrackConfirm(null)}
                            >
                              KEEP
                            </PopButton>
                          </div>
                        ) : (
                          <PopButton
                            color="steel"
                            className="!px-2 !py-1 !text-[10px]"
                            onClick={() => setCrackConfirm(g.id)}
                            title="Destroy the case and return the raw card to your collection"
                          >
                            <span className="flex items-center gap-1">
                              <Hammer className="w-3 h-3" aria-hidden /> CRACK SLAB
                            </span>
                          </PopButton>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Sticky pay bar — the submit control is no longer buried inside a panel
          that only exists once the tray has something in it. */}
      {tab === 'submit' && basketCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-[var(--c-ink)] text-[var(--c-paper)] border-t-4 border-[var(--c-yellow)] px-3 py-2">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="heading-font text-xs flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" aria-hidden /> {basketCount} CARD
              {basketCount === 1 ? '' : 'S'} · {GRADING_SERVICE_BY_ID[service].short}
            </span>
            <span className="text-[11px] font-bold">
              FEE{' '}
              {currency === 'vouchers' ? (
                <Vouchers amount={voucherFee} />
              ) : (
                <Credits amount={totalFee} />
              )}
              <span className="text-[var(--c-paper)]/60">
                {' '}
                ({fmtCredits(unitFee)}/card{bulkOff > 0 ? ` · −${bulkOff}%` : ''})
              </span>
            </span>
            <span className="text-[11px] font-bold text-[var(--c-yellow)]">
              EXPECTED BACK {fmtCredits(basketExpected)}
              <span className="text-[var(--c-paper)]/60">
                {' '}
                ({basketExpected >= totalFee ? '+' : ''}
                {fmtCredits(basketExpected - totalFee)} vs fee)
              </span>
            </span>
            {service === 'amg' && basketCount < 10 && (
              <span className="text-[10px] font-bold text-[var(--c-paper)]/70">
                {basketCount < 5
                  ? `Add ${5 - basketCount} more for AMG's 20% bulk rate`
                  : `Add ${10 - basketCount} more for AMG's 35% bulk rate`}
              </span>
            )}
            <PopButton
              color="yellow"
              className="ml-auto"
              onClick={() => void submit()}
              disabled={busy || charged > balance}
            >
              {busy
                ? 'SUBMITTING…'
                : charged > balance
                  ? `NOT ENOUGH ${currency === 'vouchers' ? 'VOUCHERS' : 'CREDITS'}`
                  : `SUBMIT FOR ${
                      currency === 'vouchers'
                        ? `${fmtVouchers(voucherFee)} VOUCHER${voucherFee === 1 ? '' : 'S'}`
                        : fmtCredits(totalFee)
                    }`}
            </PopButton>
          </div>
        </div>
      )}

      {/* Odds table. */}
      <AnimatePresence>
        {oddsOpen && <OddsModal service={service} onClose={() => setOddsOpen(false)} />}
      </AnimatePresence>

      {/* Reveal ceremony — one slab at a time, grade stamped on with a pop. */}
      <AnimatePresence>
        {ceremony && ceremony.length > 0 && (
          <RevealCeremony results={ceremony} onDone={() => setCeremony(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/** The published grade table — the thing v25 kept to itself. */
function OddsModal({ service, onClose }: { service: GradingService; onClose: () => void }) {
  const [shown, setShown] = useState<GradingService>(service);
  const odds = gradeOddsFor(shown);
  const peak = Math.max(...odds.map(([, p]) => p));
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-[var(--c-ink)]/85 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label="Grading odds"
      onClick={onClose}
    >
      <div
        className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-md shadow-hard-black-sm p-4 max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="heading-font text-sm">GRADE ODDS</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the odds table"
            className="btn-pop ink-border-sm px-1.5 py-0.5"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
        <p className="text-[10px] font-bold text-[var(--c-steel)] mb-3">
          Every service rolls the same table. Keeper alone bumps 55% of rolls by a half point — that
          is what &quot;grades a little higher&quot; means, and it is why its slabs carry no resale
          premium.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {GRADING_SERVICES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setShown(s.id)}
              aria-pressed={shown === s.id}
              className={cn(
                'btn-pop heading-font text-[10px] px-2 py-1 ink-border-sm bg-[var(--c-paper)]',
                shown === s.id && 'bg-[var(--c-yellow)]',
              )}
            >
              {s.short}
            </button>
          ))}
        </div>
        <ul className="flex flex-col gap-1">
          {[...odds].reverse().map(([g, p]) => (
            <li key={g} className="flex items-center gap-2">
              <span className="heading-font text-xs w-8 text-right">{fmtGrade(g)}</span>
              <span className="text-[9px] font-bold text-[var(--c-steel)] w-20 truncate">
                {GRADE_WORDS[String(g)]}
              </span>
              <span className="flex-1 h-3 ink-border-sm bg-[var(--c-ink)]/10 overflow-hidden">
                <span
                  className="block h-full bg-[var(--c-yellow)]"
                  style={{ width: `${Math.round((p / peak) * 100)}%` }}
                />
              </span>
              <span className="font-mono text-[10px] w-12 text-right">{(p * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
        <p className="text-[10px] font-bold text-[var(--c-steel)] mt-3">
          Average return at {GRADING_SERVICE_BY_ID[shown].short}: ×
          {(expectedGradeMultiplier(shown) * GRADING_SERVICE_BY_ID[shown].premium).toFixed(2)} the
          raw quicksell price, before the fee.
        </p>
      </div>
    </motion.div>
  );
}

function RevealCeremony({
  results,
  onDone,
}: {
  results: { id: string; card_id: string; foil: boolean; service: GradingService; grade: number }[];
  onDone: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [stamped, setStamped] = useState(false);
  const r = results[idx];
  const def = POOL_BY_ID[r.card_id];
  const svc = GRADING_SERVICE_BY_ID[r.service];

  // Stamp lands shortly after the slab slides in. `stamped` starts false and
  // is reset via the timeout chain (not synchronously in the effect body,
  // which the react-hooks lint flags as a cascading render).
  useEffect(() => {
    const reset = setTimeout(() => setStamped(false), 0);
    const t = setTimeout(() => setStamped(true), 700);
    return () => {
      clearTimeout(reset);
      clearTimeout(t);
    };
  }, [idx]);

  const last = idx === results.length - 1;
  const best = r.grade >= 9.5;
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-[var(--c-ink)]/90 flex flex-col items-center justify-center gap-4 px-4 overflow-y-auto py-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label="Grade reveal"
    >
      <style>{SLAB_CSS}</style>
      <div className="heading-font text-[var(--c-yellow)] text-sm flex items-center gap-2 text-center">
        <Award className="w-4 h-4 shrink-0" aria-hidden /> {svc.name.toUpperCase()} — RESULT{' '}
        {idx + 1}/{results.length}
      </div>
      <motion.div
        key={r.id}
        initial={{ y: 60, opacity: 0, rotate: -3 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        className="relative"
      >
        {/* The finished slab itself, not a bare card face — the reveal should
            show the object the player now owns. */}
        <GradedSlab
          g={{
            id: r.id,
            user_id: '',
            card_id: r.card_id,
            foil: r.foil,
            service: r.service,
            speed: 'standard',
            fee_paid: 0,
            submitted_at: new Date(0).toISOString(),
            ready_at: new Date(0).toISOString(),
            grade: stamped ? r.grade : null,
            revealed_at: null,
          }}
          size="standard"
        />
        <AnimatePresence>
          {stamped && (
            <motion.div
              initial={{ scale: 3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 16 }}
              className="absolute -top-4 -right-4 heading-font text-xl px-3 py-2 ink-border-md shadow-hard-black-sm"
              style={{ background: svc.slab.label, color: svc.slab.labelText }}
            >
              {fmtGrade(r.grade)}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <div
        aria-live="polite"
        className={cn(
          'heading-font text-lg transition-opacity text-center',
          stamped ? 'opacity-100' : 'opacity-0',
          best ? 'text-[var(--c-yellow)]' : 'text-[var(--c-paper)]',
        )}
      >
        {def?.name}: {fmtGrade(r.grade)} — {GRADE_WORDS[String(r.grade)] ?? 'GRADED'}
        {r.grade >= 10 ? ' ✦ THE TOP OF THE SCALE' : ''}
      </div>
      <div className="flex gap-2">
        {!last && (
          <PopButton color="yellow" onClick={() => setIdx((i) => i + 1)} disabled={!stamped}>
            NEXT ({results.length - idx - 1} LEFT)
          </PopButton>
        )}
        {!last && (
          <PopButton color="steel" onClick={onDone}>
            SKIP ALL
          </PopButton>
        )}
        {last && (
          <PopButton color="yellow" onClick={onDone} disabled={!stamped}>
            DONE
          </PopButton>
        )}
      </div>
    </motion.div>
  );
}
