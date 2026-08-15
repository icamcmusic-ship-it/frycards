import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Award, Clock, Hammer, Package, Search, Sparkles } from 'lucide-react';
import { useMeta } from './MetaContext';
import { MetaHeader, PopButton, Notice, Credits } from './ui';
import { cn } from '../lib/utils';
import { CardFace } from '../components/CardFaceV4';
import { POOL_BY_ID } from '../game/v3/cardpool';
import { spareSplit } from './CollectionScreen';
import { fmtCredits } from './economy';
import {
  GradedCard,
  GradingService,
  GradingSpeed,
  GRADING_SERVICES,
  GRADING_SERVICE_BY_ID,
  GRADING_SPEEDS,
  GRADE_WORDS,
  fmtGrade,
  gradingUnitFee,
  gradingBulkMult,
  gradedQuicksellPrice,
  fetchGradedCards,
  submitGrading,
  revealGradedCards,
  quicksellGradedCard,
  crackGradedSlab,
} from './grading';

type Tab = 'submit' | 'limbo' | 'vault';

/** One encased card. The case style (frame gradient, label colors, stamp) is
 * the service's own — a TCA slab should read as more prestigious than a
 * Keeper one at a glance. Exported for the Collection's GRADED shelf. */
export function GradedSlab({
  g,
  size = 'compact',
  onClick,
  selected,
}: {
  key?: React.Key;
  g: GradedCard;
  size?: 'compact' | 'full';
  onClick?: () => void;
  selected?: boolean;
}) {
  const def = POOL_BY_ID[g.card_id];
  const svc = GRADING_SERVICE_BY_ID[g.service];
  if (!def) return null;
  const graded = g.grade != null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${def.name}${graded ? `, graded ${fmtGrade(g.grade!)} by ${svc.name}` : ', grading in progress'}`}
      className={cn(
        'relative p-2 pb-1 ink-border-md shadow-hard-black-sm text-left transition-transform',
        onClick && 'btn-pop cursor-pointer',
        selected && 'ring-4 ring-[var(--c-yellow)]',
      )}
      style={{ background: svc.slab.frame }}
    >
      <div
        className="flex items-center justify-between gap-2 px-1.5 py-1 mb-1.5 ink-border-sm"
        style={{ background: svc.slab.label, color: svc.slab.labelText }}
      >
        <span className="heading-font text-[9px] leading-none truncate">{svc.slab.stamp}</span>
        {graded ? (
          <span className="heading-font text-sm leading-none shrink-0">{fmtGrade(g.grade!)}</span>
        ) : (
          <Clock className="w-3 h-3 shrink-0" aria-hidden />
        )}
      </div>
      <div className={cn(!graded && 'opacity-60')}>
        <CardFace def={def} size={size} />
      </div>
      <div
        className="mt-1 text-center heading-font text-[8px] leading-tight py-0.5"
        style={{ color: svc.slab.label }}
      >
        {graded ? (GRADE_WORDS[String(g.grade)] ?? 'GRADED') : 'IN GRADING'}
        {g.foil ? ' · FOIL' : ''}
      </div>
    </button>
  );
}

function countdown(readyAt: string, now: number): string {
  const ms = new Date(readyAt).getTime() - now;
  if (ms <= 0) return 'READY';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function GradingScreen({ onBack }: { onBack: () => void }) {
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
  const [basket, setBasket] = useState<Map<string, number>>(new Map()); // `${cardId}|${foil}` -> qty
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Reveal ceremony + per-slab action state.
  const [ceremony, setCeremony] = useState<
    { id: string; card_id: string; foil: boolean; service: GradingService; grade: number }[] | null
  >(null);
  const [slabBusy, setSlabBusy] = useState<string | null>(null);
  const [crackConfirm, setCrackConfirm] = useState<string | null>(null);

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
    out.sort((a, b) => POOL_BY_ID[a.cardId].name.localeCompare(POOL_BY_ID[b.cardId].name));
    return out;
  }, [collection, decks, serializedCards]);

  const filteredSpares = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return spares;
    return spares.filter((s) => POOL_BY_ID[s.cardId].name.toLowerCase().includes(q));
  }, [spares, search]);

  const basketCount = useMemo(
    () => [...basket.values()].reduce((a: number, b: number) => a + b, 0),
    [basket],
  );
  const unitFee = gradingUnitFee(service, speed, basketCount);
  const totalFee = unitFee * basketCount;
  const bulkOff = Math.round((1 - gradingBulkMult(service, basketCount)) * 100);

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
      const { data, error } = await submitGrading(items, service, speed);
      if (error || !data) {
        setError(error || 'Something went wrong — check your connection and try again.');
        return;
      }
      setBasket(new Map());
      setNotice(
        speed === 'instant'
          ? `Submitted ${items.reduce((a, i) => a + i.qty, 0)} card(s) for ${fmtCredits(data.total_fee)} — instant service: your grades are ready to reveal!`
          : `Submitted for ${fmtCredits(data.total_fee)} — your cards are with the graders now.`,
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
      if (revealed.length > 0) setCeremony(revealed);
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
      <MetaHeader title="GRADING LAB" onBack={onBack} />
      <div className="max-w-5xl mx-auto p-4 sm:p-6 pb-24">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {tabBtn('submit', 'SUBMIT CARDS')}
          {tabBtn(
            'limbo',
            <>
              AT THE GRADERS ({pending.length}){dueCount > 0 ? ' · READY!' : ''}
            </>,
          )}
          {tabBtn('vault', `MY SLABS (${vault.length})`)}
        </div>

        <div className="flex flex-col gap-2 mb-3" aria-live="polite">
          {error && <Notice text={error} />}
          {notice && !error && <Notice text={notice} kind="success" />}
        </div>

        {tab === 'submit' && (
          <>
            {/* Service picker */}
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              {GRADING_SERVICES.map((s) => (
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
                  <div className="text-[10px] font-bold text-[var(--c-steel)] mt-1">{s.blurb}</div>
                  <div className="text-[11px] font-bold mt-1.5 flex items-center gap-1">
                    from <Credits amount={s.baseFee} /> / card
                  </div>
                </button>
              ))}
            </div>

            {/* Speed picker */}
            <div className="flex flex-wrap gap-2 mb-4">
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

            {/* Basket */}
            {basketCount > 0 && (
              <div className="bg-[var(--c-ink)] text-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 mb-4">
                <div className="heading-font text-xs mb-2 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" aria-hidden /> SUBMISSION — {basketCount} CARD
                  {basketCount === 1 ? '' : 'S'}
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {[...basket.entries()].map(([key, qty]) => {
                    const [cardId, foilStr] = key.split('|');
                    const foil = foilStr === 'true';
                    const def = POOL_BY_ID[cardId];
                    const max =
                      spares.find((s) => s.cardId === cardId && s.foil === foil)?.spare ?? qty;
                    if (!def) return null;
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-1.5 bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm px-2 py-1"
                      >
                        <span className="text-[11px] font-bold truncate max-w-36">
                          {def.name}
                          {foil ? ' (FOIL)' : ''}
                        </span>
                        <PopButton
                          color="steel"
                          className="!px-1.5 !py-0.5 !text-[10px]"
                          onClick={() => bump(cardId, foil, -1, max)}
                          ariaLabel={`Remove one ${def.name}`}
                        >
                          −
                        </PopButton>
                        <span className="heading-font text-xs w-4 text-center">{qty}</span>
                        <PopButton
                          color="steel"
                          className="!px-1.5 !py-0.5 !text-[10px]"
                          onClick={() => bump(cardId, foil, +1, max)}
                          disabled={qty >= max}
                          ariaLabel={`Add one ${def.name}`}
                        >
                          +
                        </PopButton>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold flex items-center gap-1">
                    FEE: <Credits amount={totalFee} />
                    <span className="text-[var(--c-steel)]">
                      ({fmtCredits(unitFee)}/card{bulkOff > 0 ? ` · ${bulkOff}% bulk discount` : ''}
                      )
                    </span>
                  </span>
                  {service === 'amg' && basketCount < 10 && (
                    <span className="text-[10px] font-bold text-[var(--c-steel)]">
                      {basketCount < 5
                        ? `Add ${5 - basketCount} more for AMG's 20% bulk rate`
                        : `Add ${10 - basketCount} more for AMG's 35% bulk rate`}
                    </span>
                  )}
                  <PopButton
                    color="yellow"
                    onClick={() => void submit()}
                    disabled={busy || totalFee > profile.credits}
                  >
                    {busy
                      ? 'SUBMITTING…'
                      : totalFee > profile.credits
                        ? 'NOT ENOUGH CREDITS'
                        : `SUBMIT FOR ${fmtCredits(totalFee)}`}
                  </PopButton>
                </div>
              </div>
            )}

            {/* Card picker */}
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4 text-[var(--c-steel)]" aria-hidden />
              <input
                className="ink-border-sm bg-[var(--c-paper)] px-2 py-1.5 text-xs font-bold w-56 placeholder:text-[var(--c-steel)]/50"
                placeholder="Search your spare cards…"
                aria-label="Search your spare cards"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="text-[10px] font-bold text-[var(--c-steel)]">
                Tap a card to add it. Deck-locked and Serialized copies can't be graded.
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
              <div className="flex flex-wrap gap-2">
                {filteredSpares.map((s) => {
                  const key = `${s.cardId}|${s.foil}`;
                  const inBasket = basket.get(key) || 0;
                  return (
                    <CardFace
                      key={key}
                      def={POOL_BY_ID[s.cardId]}
                      size="compact"
                      foil={s.foil}
                      onClick={() => bump(s.cardId, s.foil, +1, s.spare)}
                      badge={
                        inBasket > 0
                          ? `IN CASE ×${inBasket}`
                          : `${s.spare} SPARE${s.foil ? ' FOIL' : ''}`
                      }
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'limbo' && (
          <>
            {dueCount > 0 && (
              <div className="mb-4">
                <PopButton color="red" onClick={() => void reveal()} disabled={busy}>
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden />
                    {busy ? 'REVEALING…' : `REVEAL ${dueCount} GRADE${dueCount === 1 ? '' : 'S'}`}
                  </span>
                </PopButton>
              </div>
            )}
            {gradedLoading ? (
              <p className="text-xs font-bold text-[var(--c-steel)]">Loading…</p>
            ) : pending.length === 0 ? (
              <p className="text-xs font-bold text-[var(--c-steel)]">
                Nothing at the graders. Submit some cards!
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pending.map((g) => {
                  const remain = countdown(g.ready_at, now);
                  return (
                    <div key={g.id} className="flex flex-col gap-1">
                      <GradedSlab g={g} />
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
              <div className="flex flex-wrap gap-3">
                {vault.map((g) => {
                  const def = POOL_BY_ID[g.card_id];
                  if (!def) return null;
                  const price = gradedQuicksellPrice(def.rarity, g.foil, g.grade!, g.service);
                  return (
                    <div key={g.id} className="flex flex-col gap-1.5 w-fit">
                      <GradedSlab g={g} />
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
            )}
          </>
        )}
      </div>

      {/* Reveal ceremony — one slab at a time, grade stamped on with a pop. */}
      <AnimatePresence>
        {ceremony && ceremony.length > 0 && (
          <RevealCeremony results={ceremony} onDone={() => setCeremony(null)} />
        )}
      </AnimatePresence>
    </div>
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
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-[var(--c-ink)]/90 flex flex-col items-center justify-center gap-4 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label="Grade reveal"
    >
      <div className="heading-font text-[var(--c-yellow)] text-sm flex items-center gap-2">
        <Award className="w-4 h-4" aria-hidden /> {svc.name.toUpperCase()} — RESULT {idx + 1}/
        {results.length}
      </div>
      <motion.div
        key={r.id}
        initial={{ y: 60, opacity: 0, rotate: -3 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        className="relative p-3 ink-border-md shadow-hard-black-sm"
        style={{ background: svc.slab.frame }}
      >
        {def && <CardFace def={def} size="full" foil={r.foil} />}
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
          'heading-font text-lg transition-opacity',
          stamped ? 'opacity-100' : 'opacity-0',
          r.grade >= 9.5 ? 'text-[var(--c-yellow)]' : 'text-[var(--c-paper)]',
        )}
      >
        {def?.name}: {fmtGrade(r.grade)} — {GRADE_WORDS[String(r.grade)] ?? 'GRADED'}
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
