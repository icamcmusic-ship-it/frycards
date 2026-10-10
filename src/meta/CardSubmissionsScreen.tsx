import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { askConfirm } from './confirm';
import { AlertTriangle, Ban, Check, RefreshCw, Sliders, Upload, X } from 'lucide-react';
import { useMeta } from './MetaContext';
import { MetaHeader, PopButton, Notice, Tabs } from './ui';
import { cn } from '../lib/utils';
import { CardFace } from '../components/CardFaceV4';
import { Card3DInspector } from '../components/Card3DInspector';
import { deriveCardMechanics } from '../game/poker/cardpool';
import { CardDef, PowerType, TIER_MARK, isPower, tierLabel } from '../game/poker/cards';
import { KEYWORD_SPECS, KEYWORD_TEXT, keywordText, type Keyword } from '../game/poker/keywords';
import { ruleName } from '../game/poker/locations';
import { CardTemplate, CardType, Rarity, RARITIES } from '../types';
import {
  ART_SPECS,
  BulkRow,
  DISALLOWED_THEMES,
  SHOWCASE_MIN_CARDS,
  SHOWCASE_SET,
  SUBMISSION_LIMITS,
  SUBMITTABLE_TYPES,
  TREATMENT_LABEL,
  Treatment,
  treatmentName,
  OverrideForm,
  SUBTYPE_CHOICES,
  buildCardPayload,
  defaultN,
  describeOverrides,
  effectChoices,
  formFor,
  formatKwRefs,
  isValidCardId,
  modifierChoices,
  overridesFrom,
  parseBulkCards,
  parseKwNumber,
  parseModsInput,
  slugifyCardId,
  validateSubmission,
} from './submissions';
import {
  CardSubmission,
  CardSubmissionForReview,
  ShowcaseStats,
  bulkAddCards,
  fetchMySubmissions,
  fetchShowcaseStats,
  fetchSubmissionsForReview,
  reviewSubmission,
  setSubmissionBan,
  submitCard,
  withdrawSubmission,
} from '../lib/supabase';

const input = 'px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs w-full';
const label = 'flex flex-col gap-0.5 fs-xs font-black text-[var(--c-steel)]';

/** One-line summary of a card's printed mechanics: "3★ Kindle 2 + Fuse 1",
 * a Leader's two nerve abilities, or a Location's rule. */
function printSummary(def: CardDef): string {
  if (def.type === 'Location') return def.rule ? ruleName(def.rule) : 'table rule';
  if (def.type === 'Leader') return def.abilities?.map((a) => a.text).join(' / ') || 'no abilities';
  const kws = [def.effect, ...(def.mods ?? [])]
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => formatKwRefs([r]));
  return `${tierLabel(def)} ${kws.join(' + ') || 'no keywords'}`.trim();
}

/**
 * A card face you can click to open full-size in the 3D inspector — the same
 * "hold the card in your hand" view the Collection uses, so a submitter sees
 * exactly what they would own.
 */
function InspectableCard({
  def,
  size = 'standard',
  meta,
}: {
  key?: React.Key;
  def: CardDef;
  size?: 'compact' | 'standard' | 'full';
  meta?: { label: string; value: React.ReactNode }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CardFace def={def} size={size} onClick={() => setOpen(true)} />
      {open && (
        <Card3DInspector
          def={def}
          meta={
            meta ?? [
              { label: 'Type', value: def.subtype ? `${def.type} — ${def.subtype}` : def.type },
              { label: 'Rarity', value: def.rarity || 'Common' },
              { label: 'Set', value: def.set || SHOWCASE_SET },
              { label: 'Colour', value: def.colors.length ? def.colors.join(' / ') : 'Colourless' },
              ...(isPower(def) && def.tier
                ? [
                    {
                      label: TIER_MARK[def.type as PowerType].plural.replace(/^./, (c) =>
                        c.toUpperCase(),
                      ),
                      value: tierLabel(def),
                    },
                  ]
                : []),
              { label: 'Prints', value: printSummary(def) },
            ]
          }
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** The art-spec table both the submit form and the rules panel print. */
function ArtSpecTable({ highlight }: { highlight?: Treatment }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full fs-xs font-bold border-collapse min-w-[420px]">
        <thead>
          <tr className="text-[var(--c-steel)] text-left">
            <th className="py-1 pr-2">TREATMENT</th>
            <th className="py-1 pr-2">ASPECT</th>
            <th className="py-1 pr-2">RECOMMENDED</th>
            <th className="py-1">WHY</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(ART_SPECS) as Treatment[]).map((t) => {
            const spec = ART_SPECS[t];
            return (
              <tr
                key={t}
                className={cn(
                  'align-top border-t border-[var(--c-ink)]/20',
                  highlight === t && 'bg-[var(--c-yellow)]',
                )}
              >
                <td className="py-1 pr-2 whitespace-nowrap">{treatmentName(t)}</td>
                <td className="py-1 pr-2 whitespace-nowrap heading-font text-[11px]">
                  {spec.ratio} <span className="font-bold fs-xs">{spec.orientation}</span>
                </td>
                <td className="py-1 pr-2 whitespace-nowrap">{spec.recommended}</td>
                <td className="py-1 fs-xs">{spec.note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Rarity the live preview prints at, per requested treatment — the player
 * doesn't pick a rarity (Fry does), but the treatment does decide whether the
 * art is framed or full-bleed, which is the thing worth previewing. */
const PREVIEW_RARITY: Record<Treatment, Rarity> = {
  standard: 'Rare',
  full_art: 'Full-Art',
  video_mythic: 'Mythic',
};

const STATUS_CHIP: Record<string, string> = {
  pending: 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
  approved: 'bg-[#22C55E] text-[#052E12]',
  denied: 'bg-[var(--c-red)] text-[var(--c-paper)]',
  withdrawn: 'bg-[var(--c-steel)] text-[var(--c-paper)]',
};

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'heading-font fs-xs px-1.5 py-0.5 ink-border-sm shrink-0',
        STATUS_CHIP[status] || STATUS_CHIP.withdrawn,
      )}
    >
      {status.toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Player: submit a card + track your own queue
// ---------------------------------------------------------------------------
function SubmitPanel({
  mine,
  reload,
  guest,
  onSignIn,
}: {
  mine: CardSubmission[];
  reload: () => Promise<void>;
  guest: boolean;
  onSignIn: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CardType>('Unit');
  const [treatment, setTreatment] = useState<Treatment>('standard');
  const [imageUrl, setImageUrl] = useState('');
  const [flavor, setFlavor] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Held slots are computed from the same rule the server enforces (pending OR
  // approved holds the slot) so the form can disable the option up front
  // instead of letting the player fill it in and be rejected on submit.
  const held = useMemo(() => {
    const active = mine.filter(
      (s) => s.set_name === SHOWCASE_SET && (s.status === 'pending' || s.status === 'approved'),
    );
    return {
      full_art: active.filter((s) => s.requested_treatment === 'full_art').length,
      video_mythic: active.filter((s) => s.requested_treatment === 'video_mythic').length,
      pending: mine.filter((s) => s.status === 'pending').length,
    };
  }, [mine]);

  const treatmentTaken = (t: Treatment) =>
    (t === 'full_art' && held.full_art >= SUBMISSION_LIMITS.fullArtPerAccount) ||
    (t === 'video_mythic' && held.video_mythic >= SUBMISSION_LIMITS.videoMythicPerAccount);

  const draft = { title, type, flavor, imageUrl, treatment };
  const validation = validateSubmission(draft);
  const queueFull = held.pending >= SUBMISSION_LIMITS.maxPending;

  // Preview card. `deriveCardMechanics` is the same assignment every client
  // runs, so what the player sees here is what the card would actually print
  // at that rarity — not a mock-up.
  const preview = useMemo(
    () =>
      deriveCardMechanics({
        id: slugifyCardId(title) || 'preview_card',
        name: title.trim() || 'Your card title',
        type,
        rarity: PREVIEW_RARITY[treatment],
        set: SHOWCASE_SET,
        image: imageUrl.trim(),
        flavor: flavor.trim() || 'Your flavor text lands here.',
      }),
    [title, type, treatment, imageUrl, flavor],
  );

  const submit = async () => {
    if (busy) return;
    if (guest) {
      onSignIn();
      return;
    }
    if (validation) {
      setError(validation);
      return;
    }
    if (!agreed) {
      setError('Confirm you have read the submission rules first.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { error: err } = await submitCard({
        name: title.trim(),
        type,
        flavor: flavor.trim(),
        imageUrl: imageUrl.trim(),
        treatment,
      });
      if (err) {
        setError(err);
        return;
      }
      setNotice('Submitted — Fry will review it. You can withdraw it until then.');
      setTitle('');
      setImageUrl('');
      setFlavor('');
      setTreatment('standard');
      await reload();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] items-start">
      <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3 min-w-0">
        <div className="heading-font text-sm mb-2">SUBMIT A CARD</div>
        <div className="flex flex-col gap-2.5">
          <label className={label}>
            CARD TITLE
            <input
              className={input}
              value={title}
              maxLength={SUBMISSION_LIMITS.titleMax}
              placeholder="e.g. Lantern of the Drowned Choir"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2.5">
            <label className={cn(label, 'flex-1 min-w-[120px]')}>
              CARD TYPE
              <select
                className={input}
                value={type}
                onChange={(e) => setType(e.target.value as CardType)}
              >
                {SUBMITTABLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className={cn(label, 'flex-1 min-w-[180px]')}>
              TREATMENT
              <select
                className={input}
                value={treatment}
                onChange={(e) => setTreatment(e.target.value as Treatment)}
              >
                {(Object.keys(TREATMENT_LABEL) as Treatment[]).map((t) => (
                  <option key={t} value={t} disabled={treatmentTaken(t)}>
                    {TREATMENT_LABEL[t]}
                    {treatmentTaken(t) ? ' — already used' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={label}>
            ART URL (Midjourney link, https://…)
            <input
              className={input}
              value={imageUrl}
              placeholder="https://cdn.midjourney.com/…/0_0.png"
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </label>
          <label className={label}>
            FLAVOR TEXT ({flavor.trim().length}/{SUBMISSION_LIMITS.flavorMax})
            <textarea
              className={cn(input, 'h-20 resize-y')}
              value={flavor}
              maxLength={SUBMISSION_LIMITS.flavorMax}
              placeholder="One or two lines of story. No rules text — mechanics are assigned by the game."
              onChange={(e) => setFlavor(e.target.value)}
            />
          </label>
          <label className="flex items-start gap-2 fs-xs font-bold">
            <input
              type="checkbox"
              // Sized globally since v28 (see index.css); the accent is this
              // form's own.
              className="mt-0.5 shrink-0 accent-[var(--c-red)]"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I have read the submission rules below. My art is my own to submit, and I understand
              that a disallowed submission bans my account from the Showcase.
            </span>
          </label>
          {error && <Notice text={error} />}
          {notice && <Notice text={notice} kind="success" />}
          {guest && (
            <Notice text="Design your card freely — sign in when you're ready to submit it." />
          )}
          {!guest && queueFull && (
            <Notice
              text={`You already have ${SUBMISSION_LIMITS.maxPending} submissions awaiting review — withdraw one to make room.`}
            />
          )}
          <div className="flex items-center gap-2">
            <PopButton
              color="yellow"
              disabled={!guest && (busy || !agreed || !!validation || queueFull)}
              onClick={submit}
            >
              {guest ? 'SIGN IN TO SUBMIT ▸' : busy ? 'SUBMITTING…' : 'SUBMIT CARD ▸'}
            </PopButton>
            {!guest && validation && title.trim() !== '' && (
              <span className="fs-xs font-bold text-[var(--c-red)]">{validation}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 shrink-0">
        <div className="heading-font fs-xs text-[var(--c-steel)]">LIVE PREVIEW</div>
        {/* Full size, and clickable into the 3D inspector: the preview should
            print everything the card prints in a collection, not a thumbnail
            that hides the text box. */}
        <InspectableCard def={preview} size="full" />
        <div className="fs-xs font-bold text-[var(--c-steel)] max-w-[240px] text-center">
          Click the card to open it full-size in 3D. Its tier (stars, gears or bolts), poker
          keywords and Location rule are generated by the game from the card’s id, type and rarity —
          Fry can set a star hint or overwrite any of them when he prints it, so treat this as the
          frame rather than a promise.
        </div>
        <div className="ink-border-sm bg-[var(--c-paper)] p-2 w-full max-w-[280px]">
          <div className="heading-font fs-xs mb-1">
            ART FOR {treatmentName(treatment).toUpperCase()}
          </div>
          <div className="fs-xs font-bold">
            <span className="heading-font text-[12px]">{ART_SPECS[treatment].ratio}</span>{' '}
            {ART_SPECS[treatment].orientation} · {ART_SPECS[treatment].recommended}
          </div>
          <div className="fs-xs font-bold text-[var(--c-steel)] mt-0.5">
            {ART_SPECS[treatment].note}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Render a player's own submission the way it would print: at the rarity it
 * was approved as when it has one, otherwise at the treatment's stand-in. */
function submissionPreview(s: CardSubmission): CardDef {
  const rarity = (s.approved_rarity as Rarity) || PREVIEW_RARITY[s.requested_treatment] || 'Rare';
  return deriveCardMechanics({
    id: s.approved_card_id || slugifyCardId(s.card_name) || 'preview_card',
    name: s.card_name,
    type: s.card_type as CardType,
    rarity,
    set: s.set_name,
    image: s.image_url,
    flavor: s.flavor_text,
  });
}

function MySubmissions({
  mine,
  reload,
  loading,
  failed,
}: {
  mine: CardSubmission[];
  reload: () => Promise<void>;
  loading: boolean;
  /** The load itself failed — distinct from "you have submitted nothing",
   * which is what an unqualified empty state would claim. */
  failed: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const withdraw = async (id: string) => {
    if (busyId) return;
    if (!(await askConfirm('Withdraw this submission? It frees the slot but cannot be undone.')))
      return;
    setBusyId(id);
    setError('');
    try {
      const err = await withdrawSubmission(id);
      if (err) setError(err);
      else await reload();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3">
      <div className="heading-font text-sm mb-2">MY SUBMISSIONS ({mine.length})</div>
      {error && (
        <div className="mb-2">
          <Notice text={error} />
        </div>
      )}
      {loading ? (
        <div className="text-[11px] font-bold text-[var(--c-steel)] py-3 animate-pulse">
          Loading your submissions…
        </div>
      ) : failed ? (
        <div className="flex flex-wrap items-center gap-2 py-2">
          <span className="text-[11px] font-bold text-[var(--c-red)]">
            Couldn’t load your submissions — this list may be incomplete.
          </span>
          <PopButton color="yellow" onClick={() => reload()}>
            RETRY
          </PopButton>
        </div>
      ) : mine.length === 0 ? (
        <p className="text-[11px] font-bold text-[var(--c-steel)] py-2">
          Nothing submitted yet. Submit as many cards as you like — only the full art and the video
          Mythic are capped.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {mine.map((s) => (
            <div
              key={s.id}
              className="flex flex-col items-center gap-1.5 ink-border-sm p-2 bg-[var(--c-paper)] w-[164px]"
            >
              {/* The same card the Collection would show, at the size the
                  Collection shows it, and clickable into the 3D inspector —
                  a submission is a card, so it should read as one. */}
              <InspectableCard def={submissionPreview(s)} size="standard" />
              <StatusChip status={s.status} />
              <span className="text-xs font-black text-center leading-tight">{s.card_name}</span>
              <span className="fs-xs font-bold text-[var(--c-steel)] text-center">
                {s.card_type} · {treatmentName(s.requested_treatment)}
              </span>
              {s.approved_rarity && (
                <span className="fs-xs font-black text-[var(--c-ink)]">
                  PRINTED AS {s.approved_rarity.toUpperCase()}
                </span>
              )}
              {s.review_note && (
                <span className="fs-xs font-bold text-[var(--c-red)] text-center">
                  Fry says: {s.review_note}
                </span>
              )}
              {s.status === 'pending' && (
                <PopButton color="red" disabled={busyId === s.id} onClick={() => withdraw(s.id)}>
                  {busyId === s.id ? 'WITHDRAWING…' : 'WITHDRAW'}
                </PopButton>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RulesPanel({ stats }: { stats: ShowcaseStats | null }) {
  const submitters = stats?.submitters ?? 0;
  // Pending + already-printed is the honest count of "cards this set would
  // have". NOT `submitted + printed`: `submitted` includes approved rows and
  // approving a submission is what prints it, so that sum counted every
  // approved card twice and inflated the meter as approvals accumulated.
  const cards = (stats?.pending ?? 0) + (stats?.printed ?? 0);
  const needed = stats?.cards_needed ?? SHOWCASE_MIN_CARDS;
  const pct = Math.min(100, Math.round((cards / Math.max(1, needed)) * 100));
  return (
    <div className="flex flex-col gap-4">
      <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3">
        <div className="heading-font text-sm mb-2">HOW THE SHOWCASE WORKS</div>
        <ul className="text-[11px] font-bold text-[var(--c-ink)] flex flex-col gap-1.5 list-disc pl-4">
          <li>
            Submit as many cards as you like. Every approved card is printed into the{' '}
            <strong>{SHOWCASE_SET}</strong> set — a real, collectible, deck-legal card.
          </li>
          <li>
            <strong>One full art per account, per set.</strong> Same for the{' '}
            <strong>video Mythic</strong> — one each. A pending request holds the slot; withdraw it
            to free it.
          </li>
          <li>
            You provide the art link, the title, the card type and the flavor text.{' '}
            <strong>Fry picks the rarity and every other attribute at his own discretion</strong>,
            and can deny any submission for any reason.
          </li>
          <li>
            Poker mechanics — the tier (★ stars on Units, ⚙ gears on Items, ϟ bolts on Events), the
            effect and modifier keywords, a Location’s table rule — are <strong>generated</strong>{' '}
            by the game from the card’s id, type and rarity. Your colour decides which keywords it
            can carry. <strong>Fry can set a star hint</strong> or overwrite the effect, modifiers
            and text before printing when the generated card doesn’t fit the art; anything he leaves
            alone stays generated.
          </li>
          <li>
            A video Mythic needs an <code>.mp4</code>, <code>.webm</code> or <code>.mov</code> link;
            everything else needs a still image.
          </li>
        </ul>
      </div>

      <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3">
        <div className="heading-font text-sm mb-1">ART SIZES</div>
        <p className="text-[11px] font-bold text-[var(--c-steel)] mb-2">
          A Fry Card is a real trading card — 2.5″ × 3.5″, so <strong>5:7</strong>. The framed
          template insets a <strong>4:3</strong> art window; the full-bleed treatments have no
          window, so the art is the whole card. Submit at these ratios and nothing gets cropped away
          at any card size.
        </p>
        <ArtSpecTable />
      </div>

      <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-yellow)] p-3">
        <div className="heading-font text-sm mb-1">WHEN THE SET GOES LIVE</div>
        <p className="text-[11px] font-bold">
          {SHOWCASE_SET} needs <strong>{needed} cards</strong> before it is worth standing up as its
          own pool — its own booster, its own pack odds, and the community poll that prints a
          shortlist of favourites at <strong>Ultra-Rare</strong>. Below that a set-restricted pack
          just hands out the same handful of cards over and over.
        </p>
        <div className="mt-2 h-3 ink-border-sm bg-[var(--c-paper)] overflow-hidden">
          <div className="h-full bg-[var(--c-red)]" style={{ width: `${pct}%` }} />
        </div>
        <p className="fs-xs font-black mt-1">
          {cards} / {needed} cards
          {cards >= needed
            ? ' — that’s a set. It launches whenever Fry calls it.'
            : ` — ${needed - cards} to go.`}{' '}
          <span className="font-bold">
            ({submitters} player{submitters === 1 ? '' : 's'} submitting so far.)
          </span>
        </p>
      </div>

      <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-red)] text-[var(--c-paper)] p-3">
        <div className="heading-font text-sm mb-1 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4" /> DISALLOWED — INSTANT BAN
        </div>
        <p className="text-[11px] font-bold mb-1.5">
          These are not denials, they are bans. Submitting any of the following removes your account
          from the Showcase permanently and clears the rest of your queue:
        </p>
        <ul className="text-[11px] font-bold flex flex-col gap-1 list-disc pl-4">
          {DISALLOWED_THEMES.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="fs-xs font-bold mt-2 opacity-90">
          Borderline is not a defence. If you have to ask whether it qualifies, it does.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Creator: mechanics override editor
// ---------------------------------------------------------------------------
// The pure diffing (`formFor` / `overridesFrom`) lives in submissions.ts.

function OverrideEditor({
  identity,
  generated,
  form,
  setForm,
  problems,
  changed,
}: {
  /** The card's identity (no overrides) — the star hint re-derives from it. */
  identity: CardTemplate;
  generated: CardDef;
  form: OverrideForm;
  setForm: (f: OverrideForm) => void;
  problems: string[];
  changed: string;
}) {
  const type = generated.type;
  const power = isPower(generated);
  const mark = power ? TIER_MARK[type as PowerType] : null;
  const subtypes = SUBTYPE_CHOICES[type];
  const tier = Number(form.tier) || generated.tier || 1;
  const effects = effectChoices(type, generated.colors);
  const modifiers = modifierChoices(generated.colors);
  const effectKw = form.effect as Keyword;
  const numbered = !!KEYWORD_SPECS[effectKw]?.numbered;
  const currentMods = parseModsInput(form.mods, generated.colors).mods;

  // The star hint re-rolls the card at that tier (effects have minimum
  // tiers), so the effect / modifier / subtype boxes re-baseline to what the
  // generator prints at the new tier. A rules-text override is kept.
  const setTier = (v: string) => {
    const t = Number(v);
    const hinted =
      t === generated.tier
        ? generated
        : deriveCardMechanics({ ...identity, overrides: { tier: t } });
    setForm({ ...formFor(hinted), tier: v, text: form.text });
  };
  const setEffect = (kw: string) => {
    const n = KEYWORD_SPECS[kw as Keyword] ? defaultN(kw as Keyword, tier) : undefined;
    setForm({ ...form, effect: kw, effectN: n != null ? String(n) : '' });
  };
  const toggleMod = (kw: Keyword) => {
    const has = currentMods.some((m) => m.kw === kw);
    const n = defaultN(kw, tier);
    const next = has
      ? currentMods.filter((m) => m.kw !== kw)
      : [...currentMods, n != null ? { kw, n } : { kw }];
    setForm({ ...form, mods: formatKwRefs(next) });
  };

  return (
    <div className="ink-border-sm bg-[var(--c-paper)] p-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="heading-font fs-xs flex items-center gap-1">
          <Sliders className="w-3.5 h-3.5" /> MECHANICS
        </span>
        <span className="fs-xs font-bold text-[var(--c-steel)]">
          Generated from <code>id|type|rarity</code>.{' '}
          {power
            ? `Set a ${mark!.name} hint to re-roll the card at that tier, or overwrite the effect and modifiers directly`
            : type === 'Location'
              ? 'A Location is a table rule; only its printed text can be overwritten'
              : 'Only the printed text can be overwritten here'}{' '}
          — everything left alone stays generated, and setting a field back to its generated value
          drops the override.
        </span>
        <PopButton color="steel" className="ml-auto" onClick={() => setForm(formFor(generated))}>
          RESET TO GENERATED
        </PopButton>
      </div>
      {power && (
        <>
          <div className="flex flex-wrap gap-2">
            <label className={cn(label, 'w-28')}>
              {mark!.plural.toUpperCase()} (1–5)
              <select
                className={input}
                value={form.tier}
                onChange={(e) => setTier(e.target.value)}
                aria-label={`${mark!.plural} hint`}
              >
                {[1, 2, 3, 4, 5].map((t) => (
                  <option key={t} value={String(t)}>
                    {t}
                    {mark!.glyph}
                    {t === generated.tier ? ' (generated)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className={cn(label, 'flex-1 min-w-[140px]')}>
              EFFECT ({generated.colors.length ? generated.colors.join('/') : 'colourless'}{' '}
              keywords)
              <select
                className={input}
                value={form.effect}
                onChange={(e) => setEffect(e.target.value)}
                aria-label="effect keyword"
              >
                {!effects.includes(effectKw) && form.effect && (
                  <option value={form.effect}>{form.effect} (not allowed)</option>
                )}
                {effects.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className={cn(label, 'w-24')}>
              NUMBER
              <input
                className={input}
                value={form.effectN}
                disabled={!numbered}
                placeholder={numbered ? 'tier default' : '—'}
                aria-label="effect number"
                onChange={(e) => setForm({ ...form, effectN: e.target.value })}
              />
            </label>
            <label className={cn(label, 'w-32')}>
              SUBTYPE
              <select
                className={input}
                value={form.subtype}
                onChange={(e) => setForm({ ...form, subtype: e.target.value })}
                disabled={!subtypes}
              >
                {!subtypes && <option value="">(none)</option>}
                {(subtypes ?? []).map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {effectKw && KEYWORD_SPECS[effectKw] && (
            <div className="fs-xs font-bold text-[var(--c-steel)]">
              {effectKw}: {keywordText(effectKw, parseKwNumber(form.effectN) ?? undefined)}
            </div>
          )}
          <label className={label}>
            MODIFIERS (comma-separated, e.g. “Fuse 1, Veil”; a number left off scales with the tier)
            <input
              className={input}
              value={form.mods}
              aria-label="modifiers"
              onChange={(e) => setForm({ ...form, mods: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-1">
            {modifiers.map((k) => {
              const on = currentMods.some((m) => m.kw === k);
              return (
                <button
                  key={k}
                  type="button"
                  title={KEYWORD_TEXT[k]}
                  aria-pressed={on}
                  onClick={() => toggleMod(k)}
                  className={cn(
                    'fs-xs font-black px-1.5 py-0.5 ink-border-sm',
                    on ? 'bg-[var(--c-ink)] text-[var(--c-paper)]' : 'bg-[var(--c-paper)]',
                  )}
                >
                  {k}
                </button>
              );
            })}
          </div>
        </>
      )}
      <label className={label}>
        RULES TEXT (blank = generated)
        <textarea
          className={cn(input, 'h-14 resize-y')}
          value={form.text}
          placeholder={generated.text}
          onChange={(e) => setForm({ ...form, text: e.target.value })}
        />
      </label>
      {problems.map((p) => (
        <div key={p} className="fs-xs font-bold text-[var(--c-red)]">
          {p}
        </div>
      ))}
      <div className="fs-xs font-black">
        {changed ? (
          <span className="text-[var(--c-red)]">OVERRIDDEN: {changed}</span>
        ) : (
          <span className="text-[var(--c-steel)]">No overrides — this prints as generated.</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Creator: review queue
// ---------------------------------------------------------------------------
function ReviewCard({
  sub,
  onDone,
}: {
  key?: React.Key;
  sub: CardSubmissionForReview;
  onDone: () => Promise<void>;
}) {
  const [cardId, setCardId] = useState(() => slugifyCardId(sub.card_name));
  const [rarity, setRarity] = useState<Rarity>(
    sub.requested_treatment === 'video_mythic'
      ? 'Mythic'
      : sub.requested_treatment === 'full_art'
        ? 'Full-Art'
        : 'Common',
  );
  const [name, setName] = useState(sub.card_name);
  const [type, setType] = useState<CardType>(sub.card_type as CardType);
  const [flavor, setFlavor] = useState(sub.flavor_text);
  const [imageUrl, setImageUrl] = useState(sub.image_url);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // The card's identity, and the card as the hash generates it — the
  // baseline the override editor diffs against, and what gets printed when
  // Fry changes nothing.
  const identity = useMemo<CardTemplate>(
    () => ({
      id: cardId || 'preview_card',
      name: name.trim() || sub.card_name,
      type,
      rarity,
      set: sub.set_name,
      image: imageUrl.trim(),
      flavor: flavor.trim(),
    }),
    [cardId, name, type, rarity, sub.set_name, sub.card_name, imageUrl, flavor],
  );
  const generated = useMemo(() => deriveCardMechanics(identity), [identity]);

  const [form, setForm] = useState<OverrideForm>(() => formFor(generated));
  // Changing the id, type or rarity re-rolls the whole card, so the editor's
  // baseline moves with it. Anything Fry had typed was written against a card
  // that no longer exists, which is why this resets rather than merges.
  const [seed, setSeed] = useState(`${cardId}|${type}|${rarity}`);
  const nextSeed = `${cardId}|${type}|${rarity}`;
  if (seed !== nextSeed) {
    setSeed(nextSeed);
    setForm(formFor(generated));
  }

  const { overrides, problems } = useMemo(() => overridesFrom(form, identity), [form, identity]);
  const changed = describeOverrides(overrides);
  // What the card will actually print: generated, with the overrides on top.
  const preview = useMemo(
    () => deriveCardMechanics({ ...identity, ...(overrides ? { overrides } : {}) }),
    [identity, overrides],
  );

  const idOk = isValidCardId(cardId);

  const act = async (action: 'approve' | 'deny' | 'deny_ban') => {
    if (busy) return;
    if (action === 'approve' && !idOk) {
      setError('Card id must be 3–64 characters of a-z, 0-9 or _.');
      return;
    }
    if (action === 'approve' && problems.length > 0) {
      setError(problems[0]);
      return;
    }
    if (
      action === 'deny_ban' &&
      !(await askConfirm(
        `Ban ${sub.submitter_username || 'this player'} from the Showcase and deny every pending submission they have?`,
      ))
    ) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload =
        action === 'approve'
          ? buildCardPayload({
              id: cardId,
              name: name.trim(),
              type,
              rarity,
              set: sub.set_name,
              flavor: flavor.trim(),
              image: imageUrl.trim(),
              overrides,
            })
          : null;
      const { error: err } = await reviewSubmission({
        id: sub.id,
        action,
        note: note.trim() || null,
        cardId: payload?.id ?? null,
        rarity: payload?.rarity ?? null,
        name: payload?.name ?? null,
        type: payload?.card_type ?? null,
        flavor: payload?.flavor_text ?? null,
        imageUrl: payload?.image_url ?? null,
        mechanics: payload?.mechanics ?? null,
        overrides: (payload?.overrides as Record<string, unknown>) ?? null,
      });
      if (err) {
        setError(err);
        return;
      }
      setNotice(
        action === 'approve'
          ? changed
            ? `Printed into the set, overriding ${changed}.`
            : 'Printed into the set as generated.'
          : 'Denied.',
      );
      await onDone();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <StatusChip status={sub.status} />
        <span className="text-xs font-black">{sub.card_name}</span>
        <span className="fs-xs font-bold text-[var(--c-steel)]">
          by {sub.submitter_username || 'unknown'} · asked for{' '}
          {treatmentName(sub.requested_treatment).toLowerCase()} ·{' '}
          {new Date(sub.created_at).toLocaleDateString()}
        </span>
        {sub.submitter_banned && (
          <span className="heading-font fs-xs px-1.5 py-0.5 ink-border-sm bg-[var(--c-ink)] text-[var(--c-red)]">
            BANNED
          </span>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)] items-start">
        <div className="flex flex-col items-center gap-1 shrink-0">
          <InspectableCard def={preview} size="full" />
          <a
            href={sub.image_url}
            target="_blank"
            rel="noreferrer noopener"
            // v28 tap targets: 78x14, and `truncate` (overflow: hidden) clips
            // any pseudo-element expansion, so the box itself has to grow.
            className="fs-xs font-bold underline text-[var(--c-steel)] max-w-[220px] truncate block py-1.5 leading-5"
          >
            open art source ↗
          </a>
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap gap-2">
            <label className={cn(label, 'flex-1 min-w-[160px]')}>
              CARD ID (hash seed — can never change after printing)
              <input className={input} value={cardId} onChange={(e) => setCardId(e.target.value)} />
            </label>
            <label className={cn(label, 'w-32')}>
              RARITY
              <select
                className={input}
                value={rarity}
                onChange={(e) => setRarity(e.target.value as Rarity)}
              >
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className={cn(label, 'w-32')}>
              TYPE
              <select
                className={input}
                value={type}
                onChange={(e) => setType(e.target.value as CardType)}
              >
                {SUBMITTABLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!idOk && (
            <div className="fs-xs font-bold text-[var(--c-red)]">
              Card id must be 3–64 characters of a-z, 0-9 or _.
            </div>
          )}
          <label className={label}>
            NAME
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={label}>
            ART URL
            <input
              className={input}
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </label>
          <label className={label}>
            FLAVOR
            <textarea
              className={cn(input, 'h-16 resize-y')}
              value={flavor}
              onChange={(e) => setFlavor(e.target.value)}
            />
          </label>
          <label className={label}>
            NOTE TO THE PLAYER (shown on denial)
            <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <OverrideEditor
            identity={identity}
            generated={generated}
            form={form}
            setForm={setForm}
            problems={problems}
            changed={changed}
          />

          <div className="fs-xs font-bold text-[var(--c-steel)] break-words">
            Printing: {printSummary(preview)} · {preview.text || 'no rules text'}
          </div>

          {error && <Notice text={error} />}
          {notice && <Notice text={notice} kind="success" />}

          <div className="flex flex-wrap gap-2">
            <PopButton
              color="yellow"
              disabled={busy || !idOk || problems.length > 0}
              onClick={() => act('approve')}
            >
              <span className="flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> APPROVE AS {rarity.toUpperCase()}
                {changed ? ' (OVERRIDDEN)' : ''}
              </span>
            </PopButton>
            <PopButton color="red" disabled={busy} onClick={() => act('deny')}>
              <span className="flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> DENY
              </span>
            </PopButton>
            <PopButton color="red" disabled={busy} onClick={() => act('deny_ban')}>
              <span className="flex items-center gap-1">
                <Ban className="w-3.5 h-3.5" /> DENY + BAN
              </span>
            </PopButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewQueue() {
  const [status, setStatus] = useState<'pending' | 'approved' | 'denied' | 'all'>('pending');
  const [rows, setRows] = useState<CardSubmissionForReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unbanning, setUnbanning] = useState<string | null>(null);

  // Sequence guard rather than a per-effect `cancelled` flag: `reload` is
  // called both from the filter effect and from every approve/deny, so two
  // fetches can legitimately be in flight and only the newest may write.
  const seq = React.useRef(0);
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const data = await fetchSubmissionsForReview(status === 'all' ? null : status);
      if (seq.current === mine) setRows(data);
    } catch {
      if (seq.current === mine) {
        setError('Could not load the review queue — check your connection and try again.');
      }
    } finally {
      if (seq.current === mine) setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    reload();
  }, [reload]);

  const lift = async (userId: string) => {
    if (unbanning) return;
    setUnbanning(userId);
    try {
      const err = await setSubmissionBan(userId, false);
      if (err) setError(err);
      else await reload();
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setUnbanning(null);
    }
  };

  const banned = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows)
      if (r.submitter_banned) seen.set(r.submitter, r.submitter_username || '?');
    return [...seen.entries()];
  }, [rows]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['pending', 'approved', 'denied', 'all'] as const).map((s) => (
          <PopButton
            key={s}
            color={status === s ? 'black' : 'steel'}
            ariaPressed={status === s}
            onClick={() => setStatus(s)}
          >
            {s.toUpperCase()}
          </PopButton>
        ))}
        <PopButton color="yellow" onClick={reload} disabled={loading}>
          <span className="flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> REFRESH
          </span>
        </PopButton>
      </div>

      {banned.length > 0 && (
        <div className="ink-border-sm bg-[var(--c-ink)] text-[var(--c-paper)] p-2 flex flex-wrap items-center gap-2">
          <span className="heading-font fs-xs text-[var(--c-red)]">BANNED SUBMITTERS</span>
          {banned.map(([id, username]) => (
            <PopButton key={id} color="steel" disabled={unbanning === id} onClick={() => lift(id)}>
              {unbanning === id ? 'LIFTING…' : `LIFT BAN: ${username}`}
            </PopButton>
          ))}
        </div>
      )}

      {error && <Notice text={error} />}
      {/* `error ? null` below is deliberate: a failed load must not ALSO render
          the "No pending submissions" empty state, which reads as "nothing to
          review" when the truth is "we could not look". */}
      {loading ? (
        <div className="text-[11px] font-bold text-[var(--c-steel)] py-6 animate-pulse">
          Loading submissions…
        </div>
      ) : error ? null : rows.length === 0 ? (
        <p className="text-[11px] font-bold text-[var(--c-steel)] py-6">
          No {status === 'all' ? '' : status} submissions.
        </p>
      ) : (
        rows.map((r) =>
          r.status === 'pending' ? (
            <ReviewCard key={r.id} sub={r} onDone={reload} />
          ) : (
            <div
              key={r.id}
              className="ink-border-sm bg-[var(--c-paper)] px-2 py-1.5 flex flex-wrap items-center gap-2"
            >
              <StatusChip status={r.status} />
              <span className="text-xs font-black">{r.card_name}</span>
              <span className="fs-xs font-bold text-[var(--c-steel)]">
                by {r.submitter_username || 'unknown'}
                {r.approved_rarity ? ` · printed ${r.approved_rarity}` : ''}
                {r.review_note ? ` · “${r.review_note}”` : ''}
              </span>
            </div>
          ),
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Creator: bulk add
// ---------------------------------------------------------------------------
const BULK_EXAMPLE = `Ashen Kite | Unit | Uncommon | https://cdn.midjourney.com/x/0_0.png | It circles what the fire left.
Tidewrack Reliquary | Location | Rare | https://cdn.midjourney.com/x/0_1.png | Every shelf is a drowned promise.`;

export function BulkAddPanel() {
  const [text, setText] = useState('');
  const [setName, setSetName] = useState(SHOWCASE_SET);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string>('');
  const [serverErrors, setServerErrors] = useState<{ row: number; id: string; message: string }[]>(
    [],
  );

  const parsed = useMemo(() => parseBulkCards(text, setName.trim()), [text, setName]);
  const canSend = parsed.rows.length > 0 && !busy;

  const send = async () => {
    if (!canSend) return;
    if (
      !(await askConfirm(
        `Add ${parsed.rows.length} card${parsed.rows.length === 1 ? '' : 's'} to "${setName.trim()}"?` +
          (overwrite ? ' Existing ids will be OVERWRITTEN.' : ''),
      ))
    )
      return;
    setBusy(true);
    setError('');
    setResult('');
    setServerErrors([]);
    try {
      const payload = parsed.rows.map((r: BulkRow) =>
        buildCardPayload({
          id: r.id,
          name: r.name,
          type: r.type,
          rarity: r.rarity,
          set: r.set,
          flavor: r.flavor,
          image: r.image,
        }),
      );
      const { data, error: err } = await bulkAddCards(payload, overwrite);
      if (err || !data) {
        setError(err || 'Bulk add failed.');
        return;
      }
      setResult(
        `${data.inserted} inserted · ${data.updated} updated · ${data.failed} failed. ` +
          'Reload the app to see new cards in the pool.',
      );
      setServerErrors(data.errors || []);
      if (data.failed === 0) setText('');
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3">
        <div className="heading-font text-sm mb-1 flex items-center gap-1.5">
          <Upload className="w-4 h-4" /> BULK ADD CARDS
        </div>
        <p className="fs-xs font-bold text-[var(--c-steel)] mb-2">
          Paste a JSON array, or one card per line as{' '}
          <code>name | type | rarity | image url | flavor</code> (optional 6th column: set, 7th:
          card id). Tabs and pipes beat commas — flavor text is full of commas. Ids default to a
          slug of the name. Mechanics are derived here, in the client, with the same code the game
          uses, then written alongside the row.
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          <label className={cn(label, 'w-56')}>
            SET NAME
            <input className={input} value={setName} onChange={(e) => setSetName(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5 fs-xs font-black pb-1.5 self-end">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            OVERWRITE EXISTING IDS
          </label>
          <PopButton
            color="steel"
            className="self-end"
            onClick={() => setText(BULK_EXAMPLE)}
            disabled={busy}
          >
            LOAD EXAMPLE
          </PopButton>
        </div>
        <textarea
          className={cn(input, 'h-44 resize-y font-mono')}
          value={text}
          placeholder={BULK_EXAMPLE}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <PopButton color="yellow" disabled={!canSend} onClick={send}>
            {busy
              ? 'ADDING…'
              : `ADD ${parsed.rows.length} CARD${parsed.rows.length === 1 ? '' : 'S'} ▸`}
          </PopButton>
          <span className="fs-xs font-bold text-[var(--c-steel)]">
            {/* An empty textarea is "nothing typed yet", not "1 rejected" —
                parseBulkCards('') returns a synthetic 'Nothing to import.'
                error that must not render as a pre-typed failure state. */}
            {text.trim() === ''
              ? 'Paste JSON or one card per line to begin'
              : `${parsed.rows.length} ready · ${parsed.errors.length} rejected`}
          </span>
        </div>
        {error && (
          <div className="mt-2">
            <Notice text={error} />
          </div>
        )}
        {result && (
          <div className="mt-2">
            <Notice text={result} kind="success" />
          </div>
        )}
      </div>

      {text.trim() !== '' && parsed.errors.length > 0 && (
        <div className="ink-border-sm bg-[var(--c-red)] text-[var(--c-paper)] p-2">
          <div className="heading-font fs-xs mb-1">REJECTED BEFORE SENDING</div>
          <ul className="fs-xs font-bold flex flex-col gap-0.5">
            {parsed.errors.slice(0, 40).map((e, i) => (
              <li key={i}>
                {e.line > 0 ? `line ${e.line}: ` : ''}
                {e.message}
              </li>
            ))}
            {parsed.errors.length > 40 && <li>…and {parsed.errors.length - 40} more</li>}
          </ul>
        </div>
      )}

      {serverErrors.length > 0 && (
        <div className="ink-border-sm bg-[var(--c-red)] text-[var(--c-paper)] p-2">
          <div className="heading-font fs-xs mb-1">REJECTED BY THE SERVER</div>
          <ul className="fs-xs font-bold flex flex-col gap-0.5">
            {serverErrors.map((e, i) => (
              <li key={i}>
                row {e.row} ({e.id || 'no id'}): {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed.rows.length > 0 && (
        <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3">
          <div className="heading-font text-sm mb-2">PREVIEW ({parsed.rows.length})</div>
          <div className="flex flex-wrap gap-3">
            {parsed.rows.slice(0, 24).map((r) => (
              <InspectableCard
                key={r.id}
                def={deriveCardMechanics({
                  id: r.id,
                  name: r.name,
                  type: r.type,
                  rarity: r.rarity,
                  set: r.set,
                  image: r.image,
                  flavor: r.flavor,
                })}
                size="standard"
              />
            ))}
          </div>
          {parsed.rows.length > 24 && (
            <div className="fs-xs font-bold text-[var(--c-steel)] mt-2">
              …and {parsed.rows.length - 24} more (all of them will be sent).
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function CardSubmissionsScreen({ onBack }: { onBack: () => void }) {
  const { session, guest, setGuest, profile } = useMeta();
  const userId = session?.user?.id;
  const isCreator = profile?.role === 'creator';
  const [tab, setTab] = useState<'submit' | 'review' | 'bulk'>('submit');
  const [mine, setMine] = useState<CardSubmission[]>([]);
  const [stats, setStats] = useState<ShowcaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Same sequence guard as the review queue: `reload` runs on mount and after
  // every submit/withdraw, so only the newest response may write state.
  const seq = React.useRef(0);
  const reload = useCallback(async () => {
    const call = ++seq.current;
    setLoading(true);
    setLoadError('');
    try {
      // Guests have no submissions of their own to fetch, but the showcase
      // stats and rules are public — they can still browse and build a
      // preview, they just can't submit until they sign in.
      const [subs, s] = await Promise.all([
        userId ? fetchMySubmissions(userId) : Promise.resolve([]),
        fetchShowcaseStats(),
      ]);
      if (seq.current !== call) return;
      setMine(subs);
      setStats(s);
    } catch {
      if (seq.current === call) {
        setLoadError('Could not load — check your connection and try again.');
      }
    } finally {
      if (seq.current === call) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const banned = !!profile?.submissions_banned;

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title={SHOWCASE_SET.toUpperCase()} onBack={onBack} />
      <div className="p-4 sm:p-5 max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs<'submit' | 'review' | 'bulk'>
            ariaLabel="Card submissions"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'submit', label: 'SUBMIT A CARD' },
              ...(isCreator
                ? [
                    { id: 'review' as const, label: 'REVIEW QUEUE' },
                    { id: 'bulk' as const, label: 'BULK ADD' },
                  ]
                : []),
            ]}
          />
          {stats && (
            <span className="ml-auto fs-xs font-bold text-[var(--c-steel)]">
              {stats.printed} printed · {stats.pending} awaiting review · {stats.submitters}{' '}
              submitter{stats.submitters === 1 ? '' : 's'} · {stats.printed + (stats.pending ?? 0)}/
              {stats.cards_needed ?? SHOWCASE_MIN_CARDS} to a set
            </span>
          )}
        </div>

        {tab === 'submit' && (
          <>
            {/* Scoped to this tab: it reports the failure of the caller's OWN
                submissions fetch, which has nothing to say about the review
                queue or the bulk importer. */}
            {loadError && <Notice text={loadError} />}
            {banned ? (
              <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-red)] text-[var(--c-paper)] p-4">
                <div className="heading-font text-base mb-1 flex items-center gap-1.5">
                  <Ban className="w-4 h-4" /> SUBMISSIONS DISABLED
                </div>
                <p className="text-[11px] font-bold">
                  This account is banned from the Player Showcase.
                  {profile?.submissions_ban_reason
                    ? ` Reason: ${profile.submissions_ban_reason}`
                    : ''}{' '}
                  Everything else in the game is unaffected.
                </p>
              </div>
            ) : (
              <SubmitPanel
                mine={mine}
                reload={reload}
                guest={guest}
                onSignIn={() => setGuest(false)}
              />
            )}
            {userId ? (
              <MySubmissions mine={mine} reload={reload} loading={loading} failed={!!loadError} />
            ) : (
              <div className="ink-border-md shadow-hard-black-sm bg-[var(--c-paper)] p-3 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[11px] font-bold text-[var(--c-steel)]">
                  Sign in to submit your card and track it through review.
                </span>
                <PopButton color="black" onClick={() => setGuest(false)}>
                  SIGN IN
                </PopButton>
              </div>
            )}
            <RulesPanel stats={stats} />
          </>
        )}

        {tab === 'review' && isCreator && <ReviewQueue />}
        {tab === 'bulk' && isCreator && <BulkAddPanel />}
      </div>
    </div>
  );
}
