/**
 * Grading Lab v2 panels — the three houses side by side ("best for…" bands,
 * perks, cons, loyalty), the expected-value table they are derived from, the
 * AMG Set Registry and Pop Report, and the weekly special banner. Every number
 * comes from the `grading.ts` mirror of 20261012000006_grading_redesign.sql.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Award, BarChart3, CalendarClock, Star } from 'lucide-react';
import { cn } from '../lib/utils';
import { POOL_BY_ID } from '../game/poker/cardpool';
import { fmtCredits } from './economy';
import { Credits, ProgressBar } from './ui';
import {
  GRADING_SERVICES,
  GRADING_SERVICE_BY_ID,
  LOYALTY_EVERY,
  LOYALTY_PERK,
  REGISTRY_MILESTONES,
  bestForBands,
  bestForBandsInsured,
  insuranceClaimChance,
  insuranceNetEV,
  INSURANCE_FLOOR,
  INSURANCE_RATE,
  fetchPopReport,
  fmtGrade,
  gradingEVTable,
  weekSpecial,
  type GradedCard,
  type GradingOverview,
  type GradingService,
  type PopRow,
} from './grading';

const BAND_TEXT: Record<GradingService, string> = {
  keeper: 'cheap cards, volume, and anything you might cross over later',
  amg: 'mid-value cards and filling colour registries',
  tca: 'Full-Art and up: the only shot at PRISTINE',
};

/** "best for raw quicksell 214–409" per service, derived from the EV maths. */
export function bandLabel(service: GradingService): string {
  const b = bestForBands().find((x) => x.service === service);
  if (!b) return '';
  return b.to == null ? `raw value ${b.from}+` : `raw value ${b.from}–${b.to}`;
}

export function WeeklySpecialBanner({ overview }: { overview: GradingOverview | null }) {
  const ws = overview?.week_special ?? weekSpecial();
  const svc = GRADING_SERVICE_BY_ID[ws.service];
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-2 ink-border-sm px-3 py-2 bg-[var(--c-yellow)] text-[var(--c-ink)]"
      role="note"
    >
      <CalendarClock className="w-4 h-4 shrink-0" aria-hidden />
      <span className="heading-font fs-sm">WEEKLY SPECIAL</span>
      <span className="fs-xs font-bold">
        {svc.short} grades <b>{ws.colour.toUpperCase()}</b> cards at half price this week.
      </span>
      {overview && (
        <span className="fs-xs font-bold ml-auto">
          Today&apos;s collector favours {GRADING_SERVICE_BY_ID[overview.collector_favourite].short}{' '}
          slabs (+15% on quicksell)
        </span>
      )}
    </div>
  );
}

export function ServicePerks({ service }: { service: GradingService }) {
  const s = GRADING_SERVICE_BY_ID[service];
  return (
    <div className="mt-2 fs-xs font-bold">
      <div className="text-[var(--c-ink)]">
        BEST FOR: {bandLabel(service)} — {BAND_TEXT[service]}
      </div>
      <ul className="mt-1 list-none p-0 m-0">
        {s.perks.map((p) => (
          <li key={p}>+ {p}</li>
        ))}
        {s.cons.map((c) => (
          <li key={c} className="text-[var(--c-red)]">
            − {c}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LoyaltyRow({
  service,
  overview,
}: {
  service: GradingService;
  overview: GradingOverview | null;
}) {
  const l = overview?.loyalty?.[service];
  const submitted = l?.submitted ?? 0;
  const into = submitted % LOYALTY_EVERY;
  return (
    <div className="mt-2 fs-xs font-bold">
      <div className="flex items-center justify-between">
        <span>LOYALTY</span>
        <span>
          {into}/{LOYALTY_EVERY}
          {l && l.perks_available > 0 ? ` · ${l.perks_available} PERK READY` : ''}
        </span>
      </div>
      <ProgressBar value={into} max={LOYALTY_EVERY} ariaLabel={`${service} loyalty`} />
      <div className="text-[var(--c-steel)] mt-0.5">
        Every {LOYALTY_EVERY} cards: {LOYALTY_PERK[service]} (used on your next order).
      </div>
    </div>
  );
}

export function EVTable() {
  const rows = useMemo(() => gradingEVTable(), []);
  return (
    <div className="overflow-x-auto">
      <table className="w-full fs-xs font-bold border-collapse">
        <caption className="text-left text-[var(--c-steel)] mb-1">
          Average credits gained per card versus quickselling it raw (standard speed, before
          registry bonuses, pop bumps, reputation and specials).
        </caption>
        <thead>
          <tr className="text-left">
            <th className="py-1 pr-2">Rarity</th>
            <th className="py-1 pr-2 text-right">Raw</th>
            {GRADING_SERVICES.map((s) => (
              <th key={s.id} className="py-1 pr-2 text-right">
                {s.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.rarity}${r.foil}`} className="border-t border-[var(--c-ink)]/15">
              <td className="py-0.5 pr-2">
                {r.rarity}
                {r.foil ? ' foil' : ''}
              </td>
              <td className="py-0.5 pr-2 text-right">{fmtCredits(r.raw)}</td>
              {GRADING_SERVICES.map((s) => (
                <td
                  key={s.id}
                  className={cn(
                    'py-0.5 pr-2 text-right',
                    r.best === s.id && 'bg-[var(--c-yellow)]',
                    r.net[s.id] < 0 && 'text-[var(--c-red)]',
                  )}
                >
                  {r.net[s.id] >= 0 ? '+' : '−'}
                  {fmtCredits(Math.abs(r.net[s.id]))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsuranceNote() {
  const insured = bestForBandsInsured();
  return (
    <div className="mt-2 fs-xs font-bold text-[var(--c-steel)]">
      <div>
        GRADE INSURANCE (+{Math.round(INSURANCE_RATE * 100)}% of the fee; a grade under{' '}
        {INSURANCE_FLOOR} refunds the base fee):{' '}
        {GRADING_SERVICES.map((s) => (
          <span key={s.id} className="mr-2">
            {s.short} claims {Math.round(insuranceClaimChance(s.id) * 100)}% · worth{' '}
            {insuranceNetEV(s.id) >= 0 ? '+' : '−'}
            {fmtCredits(Math.abs(Math.round(insuranceNetEV(s.id))))}/card
          </span>
        ))}
      </div>
      <div>
        Insured, the bands become:{' '}
        {insured
          .map(
            (b) =>
              `${GRADING_SERVICE_BY_ID[b.service].short} ${b.from}${b.to == null ? '+' : `–${b.to}`}`,
          )
          .join(' · ')}
        . Trade-ins turn five sub-7 slabs into one free grading.
      </div>
    </div>
  );
}

export function RegistryPanel({ overview }: { overview: GradingOverview | null }) {
  if (!overview) {
    return <p className="fs-xs font-bold text-[var(--c-steel)]">Loading the registry…</p>;
  }
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {overview.registry.map((r) => {
        const top = REGISTRY_MILESTONES.filter(([m]) => r.claimed.includes(m)).pop();
        return (
          <div key={r.colour} className="ink-border-sm p-2 bg-[var(--c-paper)]">
            <div className="flex items-center justify-between heading-font fs-sm">
              <span>{r.colour.toUpperCase()}</span>
              {top ? (
                <span className="flex items-center gap-1 px-1.5 bg-[var(--c-ink)] text-[var(--c-yellow)]">
                  <Award className="w-3 h-3" aria-hidden /> {top[2]}
                </span>
              ) : null}
            </div>
            <div className="fs-xs font-bold text-[var(--c-steel)]">
              {r.have} / {r.total} distinct cards in AMG slabs
            </div>
            <ProgressBar
              value={r.have}
              max={Math.max(1, r.total)}
              ariaLabel={`${r.colour} registry`}
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {REGISTRY_MILESTONES.map(([m, bonus, name]) => (
                <span
                  key={m}
                  className={cn(
                    'fs-xs font-bold px-1 ink-border-sm',
                    r.claimed.includes(m) ? 'bg-[var(--c-yellow)]' : 'opacity-60',
                  )}
                  title={`${name}: ${m}% of the colour — paid once, ever`}
                >
                  {m}% · {fmtCredits(bonus)}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PopReport({ vault }: { vault: GradedCard[] }) {
  const [rows, setRows] = useState<PopRow[] | null>(null);
  const cardIds = useMemo(() => [...new Set(vault.map((g) => g.card_id))], [vault]);
  useEffect(() => {
    let live = true;
    void fetchPopReport().then((r) => {
      if (live) setRows(r);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!rows)
    return <p className="fs-xs font-bold text-[var(--c-steel)]">Loading the pop report…</p>;
  const mine = rows
    .filter((r) => r.service === 'amg' && cardIds.includes(r.card_id))
    .sort((a, b) => a.n - b.n || b.grade - a.grade)
    .slice(0, 40);
  if (mine.length === 0) {
    return (
      <p className="fs-xs font-bold text-[var(--c-steel)]">
        No AMG slabs of your cards on record yet. Every AMG slab is counted here by card and grade,
        and the rarest (pop 3 or less) sell for 10% more.
      </p>
    );
  }
  return (
    <table className="w-full fs-xs font-bold">
      <thead>
        <tr className="text-left">
          <th>Card</th>
          <th className="text-right">Grade</th>
          <th className="text-right">Pop</th>
          <th className="text-right">Resale</th>
        </tr>
      </thead>
      <tbody>
        {mine.map((r) => (
          <tr key={`${r.card_id}${r.grade}`} className="border-t border-[var(--c-ink)]/15">
            <td>{POOL_BY_ID[r.card_id]?.name ?? r.card_id}</td>
            <td className="text-right">{fmtGrade(r.grade)}</td>
            <td className="text-right">{r.n}</td>
            <td className="text-right">{r.n <= 3 ? '+10%' : r.n <= 10 ? '+5%' : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HousesPanel({
  overview,
  vault,
}: {
  overview: GradingOverview | null;
  vault: GradedCard[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="heading-font text-sm mb-2 flex items-center gap-1.5">
          <Star className="w-4 h-4" aria-hidden /> THE THREE HOUSES
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {GRADING_SERVICES.map((s) => (
            <div key={s.id} className="p-3 ink-border-md bg-[var(--c-paper)]">
              <div
                className="heading-font fs-xs px-1.5 py-0.5 mb-1.5 inline-block ink-border-sm"
                style={{ background: s.slab.label, color: s.slab.labelText }}
              >
                {s.short}
              </div>
              <div className="heading-font text-sm leading-tight">{s.name}</div>
              <div className="fs-xs font-bold text-[var(--c-steel)] mt-1">
                Fee <Credits amount={s.baseFee} /> · premium ×{s.premium}
              </div>
              <ServicePerks service={s.id} />
              <LoyaltyRow service={s.id} overview={overview} />
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="heading-font text-sm mb-2 flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4" aria-hidden /> EXPECTED VALUE BY RARITY
        </h2>
        <EVTable />
        <InsuranceNote />
      </section>
      <section>
        <h2 className="heading-font text-sm mb-1 flex items-center gap-1.5">
          <Award className="w-4 h-4" aria-hidden /> AMG SET REGISTRY
        </h2>
        <p className="fs-xs font-bold text-[var(--c-steel)] mb-2">
          Each distinct non-Leader card you hold in an AMG slab fills its colour. Milestones pay
          once, for life — a slab that is sold or cracked leaves the registry, but a milestone never
          pays twice.
        </p>
        <RegistryPanel overview={overview} />
      </section>
      <section>
        <h2 className="heading-font text-sm mb-1 flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4" aria-hidden /> AMG POP REPORT — YOUR CARDS
        </h2>
        <PopReport vault={vault} />
      </section>
    </div>
  );
}
